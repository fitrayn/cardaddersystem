import { makeAddCardWorker } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { decryptJson } from '../../lib/encryption';
import axios from 'axios';
import { buildAgent } from '../proxy/agent';
import { env } from '../../config/env';
import type { Job } from 'bullmq';
import http from 'node:http';
import https from 'node:https';
import { ObjectId } from 'mongodb';

interface FacebookCardData {
  number: string;
  exp_month: string;
  exp_year: string;
  cvv: string;
  country?: string;
  currency?: string;
  timezone?: string;
  cardholder_name?: string;
  postal_code?: string;
  city?: string;
  street_address?: string;
}

interface FacebookCookieData {
  c_user: string;
  xs: string;
  fr?: string;
  datr?: string;
  country?: string;
}

interface JobData {
  cookieId: string;
  cardId?: string;
  cardData?: FacebookCardData;
  preferences?: { country?: string; currency?: string; timezone?: string; acceptLanguage?: string };
  serverId?: string;
  proxyConfig?: {
    type: 'http' | 'https' | 'socks5';
    host: string;
    port: number;
    username?: string;
    password?: string;
    country?: string;
  };
}

const FB_BILLING_URL = 'https://business.facebook.com/billing/payment_methods';
const FB_SETTINGS_PAYMENTS_URL = 'https://business.facebook.com/settings?tab=payments';
const FB_HOME_URL = 'https://business.facebook.com/';
const FB_GRAPHQL_URL = 'https://business.facebook.com/api/graphql/';

function buildCookieHeader(cookie: FacebookCookieData): string {
  const parts: string[] = [];
  parts.push(`c_user=${cookie.c_user}`);
  parts.push(`xs=${cookie.xs}`);
  if (cookie.fr) parts.push(`fr=${cookie.fr}`);
  if (cookie.datr) parts.push(`datr=${cookie.datr}`);
  return parts.join('; ');
}

async function httpGet(url: string, cookie: FacebookCookieData, agent?: any, referer?: string, acceptLang?: string) {
  const headers = {
    'User-Agent': env.FB_USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': acceptLang || env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    ...(referer ? { 'Referer': referer } : {}),
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'document',
  } as Record<string, string>;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await axios.get(url, {
      headers,
      httpsAgent: agent,
      httpAgent: agent,
      signal: controller.signal as any,
      timeout: 12000,
      validateStatus: (s) => s >= 200 && s < 500,
      maxRedirects: 0,
    });
    return resp;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFbDtsg(cookie: FacebookCookieData, agent?: any, acceptLang?: string): Promise<string | null> {
  // Warm up: hit home to establish session context
  try { await httpGet(FB_HOME_URL, cookie, agent, undefined, acceptLang); } catch {}

  // Try billing page
  const resp1 = await httpGet(FB_BILLING_URL, cookie, agent, FB_HOME_URL, acceptLang);
  const html1 = typeof resp1.data === 'string' ? resp1.data : '';
  let match = html1.match(/name=\"fb_dtsg\"\s+value=\"([^\"]+)\"/);
  if (match) return match[1] ?? null;
  match = html1.match(/__DTSGInitialData__\s*=\s*\"([^\"]+)\"/);
  if (match) return match[1] ?? null;

  // Fallback: settings payments page
  const resp2 = await httpGet(FB_SETTINGS_PAYMENTS_URL, cookie, agent, FB_HOME_URL, acceptLang);
  const html2 = typeof resp2.data === 'string' ? resp2.data : '';
  match = html2.match(/name=\"fb_dtsg\"\s+value=\"([^\"]+)\"/);
  if (match) return match[1] ?? null;
  match = html2.match(/__DTSGInitialData__\s*=\s*\"([^\"]+)\"/);
  if (match) return match[1] ?? null;

  return null;
}

function buildGraphQLPayload(cookie: FacebookCookieData, card: FacebookCardData, fbDtsg: string) {
  const docId = env.FB_DOC_ID || 'useBillingAddPaymentMethodMutation';
  const variables = {
    input: {
      payment_method_type: 'CREDIT_CARD',
      credit_card: {
        card_number: card.number.replace(/\s/g, ''),
        expiry_month: parseInt(card.exp_month),
        expiry_year: parseInt(card.exp_year),
        security_code: card.cvv,
        cardholder_name: card.cardholder_name || 'Card Holder',
        billing_address: {
          country_code: card.country || 'US',
          postal_code: card.postal_code || '12345',
          city: card.city || 'City',
          street_address: card.street_address || 'Street Address'
        }
      },
      is_default: false,
      client_mutation_id: Date.now().toString()
    }
  };
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: fbDtsg,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'useBillingAddPaymentMethodMutation',
    variables: JSON.stringify(variables),
    server_timestamps: true,
    doc_id: docId,
  };
  const formData = Object.entries(requestData)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return formData;
}

async function prepareSession(cookie: FacebookCookieData, agent?: any, acceptLang?: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await fetchFbDtsg(cookie, agent, acceptLang);
    if (token) return token;
  }
  throw new Error('Failed to get fb_dtsg token');
}

async function sendRequest(cookie: FacebookCookieData, formData: string, agent?: any, preferences?: { acceptLanguage?: string }) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': env.FB_USER_AGENT,
    'Accept-Language': (preferences?.acceptLanguage) || env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
    'Connection': 'keep-alive',
    'Referer': FB_BILLING_URL,
    'Origin': 'https://business.facebook.com',
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s phase timeout
  try {
    const fallbackHttp = new http.Agent({ keepAlive: true, maxSockets: 50 });
    const fallbackHttps = new https.Agent({ keepAlive: true, maxSockets: 50 });
    const response = await axios.post(FB_GRAPHQL_URL, formData, {
      headers,
      httpsAgent: agent || fallbackHttps,
      httpAgent: agent || fallbackHttp,
      signal: controller.signal as any,
      timeout: 35000,
      maxRedirects: 0,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (s) => s >= 200 && s < 500,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseResult(data: any) {
  if (!data) throw new Error('Empty response');
  const text = typeof data === 'string' ? data.replace(/^for \(;\);/, '') : JSON.stringify(data);
  try {
    const parsed = JSON.parse(text);
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(`Facebook error: ${parsed.errors[0]?.message || 'Unknown'}`);
    }
    return parsed;
  } catch (e) {
    return { raw: text };
  }
}

async function processJob(data: JobData, job?: Job) {
  const db = await getDb();
  const jobId = job?.id ? String(job.id) : undefined;
  const results = db.collection<any>('job_results');
  async function logStep(phase: string, status: 'started'|'success'|'failed', message?: string) {
    await results.updateOne(
      { jobId },
      (
        {
          $setOnInsert: {
            jobId,
            cookieId: (data as any).cookieId,
            cardId: (data as any).cardId || null,
            serverId: data.serverId || null,
            createdAt: new Date(),
          },
          $push: { steps: { phase, status, message: message || null, at: new Date() } },
        } as any
      ),
      { upsert: true }
    );
  }

  const cookieObjectId = (() => { try { return new ObjectId(String((data as any).cookieId)); } catch { return null; } })();
  if (!cookieObjectId) throw new Error('Invalid cookie id');

  const cookieDoc = await db.collection('cookies').findOne({ _id: cookieObjectId });
  if (!cookieDoc) throw new Error('Missing cookie data');

  job?.updateProgress(0);

  let card: FacebookCardData | null = null;
  if (data.cardId) {
    const cardObjectId = (() => { try { return new ObjectId(String((data as any).cardId)); } catch { return null; } })();
    if (!cardObjectId) throw new Error('Invalid card id');
    const cardDoc = await db.collection('cards').findOne({ _id: cardObjectId });
    if (!cardDoc) throw new Error('Missing card data');
    card = decryptJson<FacebookCardData>(cardDoc.payload);
  } else if (data.cardData) {
    card = data.cardData;
  } else {
    throw new Error('No card provided');
  }

  let cookie: FacebookCookieData | null = null;
  if (cookieDoc.c_user && cookieDoc.xs) {
    cookie = {
      c_user: String(cookieDoc.c_user),
      xs: String(cookieDoc.xs),
      fr: cookieDoc.fr ? String(cookieDoc.fr) : undefined,
      datr: cookieDoc.datr ? String(cookieDoc.datr) : undefined,
      country: cookieDoc.country ? String(cookieDoc.country) : undefined,
    };
  } else if (cookieDoc.payload) {
    cookie = decryptJson<FacebookCookieData>(cookieDoc.payload);
  } else {
    throw new Error('Cookie document missing required fields');
  }

  if (data.preferences) {
    cookie.country = data.preferences.country || cookie.country;
  }

  const agent = buildAgent(data.proxyConfig);

  // Track current phase for precise failure logging
  let currentPhase: 'prepare_session' | 'build_payload' | 'send_request' = 'prepare_session';

  await logStep('prepare_session', 'started', 'Fetching fb_dtsg');
  try {
    // prepare_session
    currentPhase = 'prepare_session';
    const fbDtsg = await prepareSession(cookie, agent, data.preferences?.acceptLanguage);
    job?.updateProgress(25);
    await logStep('prepare_session', 'success');

    // build_payload
    await logStep('build_payload', 'started');
    currentPhase = 'build_payload';
    const formData = buildGraphQLPayload(cookie, card, fbDtsg);
    job?.updateProgress(50);
    await logStep('build_payload', 'success');

    // send_request
    await logStep('send_request', 'started');
    currentPhase = 'send_request';
    const response = await sendRequest(cookie, formData, agent, data.preferences);
    job?.updateProgress(75);
    await logStep('send_request', 'success', `HTTP ${response.status}`);
    const result = parseResult(response.data);

    await results.updateOne(
      { jobId },
      (
        {
          $set: {
            cookieId: cookieDoc._id,
            cardId: (data as any).cardId || null,
            serverId: data.serverId || null,
            success: response.status >= 200 && response.status < 400,
            reason: 'Card add attempt finished',
            country: card.country || cookie.country || null,
            response: result,
            finishedAt: new Date(),
          },
        } as any
      )
    );

    return { ok: true };
  } catch (error) {
    // Log failure for the exact phase that failed
    await logStep(currentPhase, 'failed', (error as any)?.message);
    throw error;
  }
}

export const worker = makeAddCardWorker(processJob as any); 