import { makeAddCardWorker } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { decryptJson } from '../../lib/encryption';
import axios from 'axios';
import { buildAgent } from '../proxy/agent';
import { env } from '../../config/env';
import type { Job } from 'bullmq';
import http from 'node:http';
import https from 'node:https';

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
  cardId: string;
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
const FB_GRAPHQL_URL = 'https://business.facebook.com/api/graphql/';
const FB_ORIGIN = 'https://business.facebook.com';

function buildCookieHeader(cookie: FacebookCookieData): string {
  const parts: string[] = [];
  parts.push(`c_user=${cookie.c_user}`);
  parts.push(`xs=${cookie.xs}`);
  if (cookie.fr) parts.push(`fr=${cookie.fr}`);
  if (cookie.datr) parts.push(`datr=${cookie.datr}`);
  return parts.join('; ');
}

interface SessionTokens {
  fbDtsg: string;
  lsd?: string;
  jazoest: string;
}

function computeJazoest(fbDtsg: string): string {
  // jazoest = '2' + sum of char codes of fb_dtsg
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
  return `2${sum}`;
}

async function fetchTokensFromUrl(url: string, cookie: FacebookCookieData, agent?: any): Promise<Partial<SessionTokens>> {
  const headers = {
    'User-Agent': env.FB_USER_AGENT,
    'Accept-Language': env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const resp = await axios.get(url, {
      headers,
      httpsAgent: agent,
      httpAgent: agent,
      signal: controller.signal as any,
      timeout: 9000,
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    const out: Partial<SessionTokens> = {};
    // fb_dtsg variants
    let match = html.match(/name="fb_dtsg"\s+value="([^"]+)"/);
    if (match) out.fbDtsg = match[1];
    if (!out.fbDtsg) {
      match = html.match(/__DTSGInitialData__\s*=\s*"([^"]+)"/);
      if (match) out.fbDtsg = match[1];
    }
    // lsd token variants
    match = html.match(/name="lsd"\s+value="([^"]+)"/);
    if (match) out.lsd = match[1];
    if (!out.lsd) {
      match = html.match(/LSD\s*=\s*\{[^}]*?token\s*:\s*"([^"]+)"/);
      if (match) out.lsd = match[1];
    }
    if (out.fbDtsg) {
      out.jazoest = computeJazoest(out.fbDtsg);
    }
    return out;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSessionTokens(cookie: FacebookCookieData, agent?: any): Promise<SessionTokens | null> {
  // Try multiple known pages that usually expose tokens
  const candidateUrls = [
    FB_BILLING_URL,
    'https://business.facebook.com/business_locations',
    'https://business.facebook.com/adsmanager/manage/billing_settings',
    'https://business.facebook.com/ads/manager/billing/transactions/'
  ];
  for (const url of candidateUrls) {
    const tokens = await fetchTokensFromUrl(url, cookie, agent);
    if (tokens.fbDtsg) {
      return {
        fbDtsg: tokens.fbDtsg!,
        lsd: tokens.lsd,
        jazoest: tokens.jazoest || computeJazoest(tokens.fbDtsg!),
      };
    }
  }
  return null;
}

function buildGraphQLPayload(cookie: FacebookCookieData, card: FacebookCardData, tokens: SessionTokens) {
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
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'useBillingAddPaymentMethodMutation',
    variables: JSON.stringify(variables),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  const formData = Object.entries(requestData)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return formData;
}

async function prepareSession(cookie: FacebookCookieData, agent?: any): Promise<SessionTokens> {
  // retry up to 3 times for tokens
  for (let attempt = 0; attempt < 3; attempt++) {
    const tokens = await fetchSessionTokens(cookie, agent);
    if (tokens) return tokens;
  }
  throw new Error('Failed to get fb_dtsg token');
}

async function sendRequest(cookie: FacebookCookieData, formData: string, tokens: SessionTokens, agent?: any) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': env.FB_USER_AGENT,
    'Accept-Language': env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
    'Connection': 'keep-alive',
    'Origin': FB_ORIGIN,
    'Referer': FB_BILLING_URL,
    'x-fb-friendly-name': 'useBillingAddPaymentMethodMutation',
  };
  if (tokens.lsd) headers['x-fb-lsd'] = tokens.lsd;
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
  const text = typeof data === 'string' ? data.replace(/^for \(;;\);/, '') : JSON.stringify(data);
  try {
    const parsed = JSON.parse(text);
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(`Facebook error: ${parsed.errors[0]?.message || 'Unknown'}`);
    }
    return parsed;
  } catch (e) {
    // If not JSON, still accept as success fallback
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
            cardId: (data as any).cardId,
            serverId: data.serverId || null,
            createdAt: new Date(),
          },
          $push: { steps: { phase, status, message: message || null, at: new Date() } },
        } as any
      ),
      { upsert: true }
    );
  }

  const cookieDoc = await db.collection('cookies').findOne({ _id: (data as any).cookieId });
  const cardDoc = await db.collection('cards').findOne({ _id: (data as any).cardId });
  if (!cookieDoc || !cardDoc) throw new Error('Missing cookie or card data');

  const cookie = decryptJson<FacebookCookieData>(cookieDoc.payload);
  const card = decryptJson<FacebookCardData>(cardDoc.payload);
  const agent = buildAgent(data.proxyConfig);

  await logStep('prepare_session', 'started', 'Fetching fb_dtsg');

  try {
    const tokens = await prepareSession(cookie, agent);
    await logStep('prepare_session', 'success', `fb_dtsg fetched`);
    await logStep('build_payload', 'started');
    const formData = buildGraphQLPayload(cookie, card, tokens);
    await logStep('build_payload', 'success');
    await logStep('send_request', 'started');

    // Try up to 2 attempts of sending the GraphQL request if response isn't clearly successful
    let response = await sendRequest(cookie, formData, tokens, agent);
    await logStep('send_request', 'success', `HTTP ${response.status}`);
    let result = parseResult(response.data);

    // Optional heuristic: if response lacks data and status < 400, retry once with fresh tokens
    if (response.status < 400 && typeof result === 'object' && !('data' in result)) {
      await logStep('retry', 'started', 'Retrying with fresh tokens');
      const refreshed = await prepareSession(cookie, agent);
      const formData2 = buildGraphQLPayload(cookie, card, refreshed);
      response = await sendRequest(cookie, formData2, refreshed, agent);
      await logStep('retry', 'success', `HTTP ${response.status}`);
      result = parseResult(response.data);
    }

    await results.updateOne(
      { jobId },
      (
        {
          $set: {
            cookieId: cookieDoc._id,
            cardId: cardDoc._id,
            serverId: data.serverId || null,
            success: response.status >= 200 && response.status < 400,
            reason: 'Card add attempt finished',
            country: card.country || cookie.country || null,
            response: result,
            finishedAt: new Date(),
          },
          $push: { steps: { phase: 'done', status: 'success', message: null, at: new Date() } },
        } as any
      ),
      { upsert: true }
    );

    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    return { success: true, result };
  } catch (error) {
    await logStep('error', 'failed', error instanceof Error ? error.message : String(error));
    await results.updateOne(
      { jobId },
      (
        {
          $set: {
            cookieId: cookieDoc?._id,
            cardId: cardDoc?._id,
            serverId: data.serverId || null,
            success: false,
            reason: error instanceof Error ? error.message : 'Unknown error',
            country: card?.country || cookie?.country || null,
            error: error instanceof Error ? error.stack : String(error),
            finishedAt: new Date(),
          },
        } as any
      ),
      { upsert: true }
    );
    throw error;
  }
}

export const worker = makeAddCardWorker(processJob); 