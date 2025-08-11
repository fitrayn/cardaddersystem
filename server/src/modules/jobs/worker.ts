import { makeAddCardWorker } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { decryptJson } from '../../lib/encryption';
import axios from 'axios';
import { buildAgent } from '../proxy/agent';
import { env } from '../../config/env';
import type { Job } from 'bullmq';
import http from 'node:http';
import https from 'node:https';
import { emitProgress } from '../../lib/events';
import crypto from 'node:crypto';

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
  preferences?: {
    acceptLanguage?: string;
    userAgent?: string;
    businessId?: string;
    origin?: string;
    referer?: string;
    xFbUplSessionId?: string;
    xBhFlowSessionId?: string;
    platformTrustToken?: string;
    e2eeNumber?: string;
    e2eeCsc?: string;
    adAccountId?: string;
    usePrimaryAdAccount?: boolean;
    // New: pre-wizard and update account controls
    country?: string;
    currency?: string;
    timezone?: string;
    paymentAccountID?: string;
    updateAccountDocId?: string;
    updateAccountVariables?: Record<string, any>;
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
  spin?: { r?: string; t?: string; b?: string };
  businessId?: string;
  xFbUplSessionId?: string;
  xBhFlowSessionId?: string;
  platformTrustToken?: string;
  adAccountId?: string;
  paymentAccountId?: string;
}

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeJazoest(fbDtsg: string): string {
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
  return `2${sum}`;
}

function parseSpin(html: string): { r?: string; t?: string; b?: string } | undefined {
  try {
    const rMatch = html.match(/"__spin_r"\s*:\s*(\d+)/);
    const tMatch = html.match(/"__spin_t"\s*:\s*(\d+)/);
    const bMatch = html.match(/"__spin_b"\s*:\s*"([^"]+)"/);
    return { r: rMatch?.[1], t: tMatch?.[1], b: bMatch?.[1] };
  } catch {
    return undefined;
  }
}

function parseBusinessId(html: string): string | undefined {
  const patterns = [
    /\"selected_business_id\"\s*:\s*\"(\d+)\"/,
    /business_id=\"(\d+)\"/,
    /\"business_id\"\s*:\s*\"(\d+)\"/
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function parseUplAndFlow(html: string): { upl?: string; flow?: string } {
  const res: { upl?: string; flow?: string } = {};
  try {
    const uplMatches = [
      /x-fb-upl-sessionid\"?\s*[:=]\s*\"([^\"]+)\"/i,
      /upl[_-]?sessionid\"?\s*[:=]\s*\"([^\"]+)\"/i,
      /\"uplSessionId\"\s*:\s*\"([^\"]+)\"/i,
    ];
    for (const r of uplMatches) {
      const m = html.match(r);
      if (m?.[1]) { res.upl = m[1]; break; }
    }
    const flowMatches = [
      /x-bh-flowsessionid\"?\s*[:=]\s*\"([^\"]+)\"/i,
      /flow[_-]?sessionid\"?\s*[:=]\s*\"([^\"]+)\"/i,
      /\"flowSessionId\"\s*:\s*\"([^\"]+)\"/i,
    ];
    for (const r of flowMatches) {
      const m = html.match(r);
      if (m?.[1]) { res.flow = m[1]; break; }
    }
  } catch {}
  return res;
}

function parsePlatformTrustToken(html: string): string | undefined {
  try {
    const patterns = [
      /platform_trust_token\"?\s*[:=]\s*\"([^\"]+)\"/i,
      /\"platformTrustToken\"\s*:\s*\"([^\"]+)\"/i,
    ];
    for (const r of patterns) {
      const m = html.match(r);
      if (m?.[1]) return m[1];
    }
  } catch {}
  return undefined;
}

function parsePrimaryAdAccountId(html: string): string | undefined {
  try {
    const patterns = [
      /act_(\d{6,})/i,
      /ad[_-]?account[_-]?id\"?\s*[:=]\s*\"(\d{6,})\"/i,
      /\"accountID\"\s*:\s*\"(\d{6,})\"/i,
      /\"adAccountID\"\s*:\s*\"(\d{6,})\"/i,
      /\"id\"\s*:\s*\"act_(\d{6,})\"/i,
      /selected_account_id"\s*:\s*"(\d{6,})"/i,
    ];
    for (const r of patterns) {
      const m = html.match(r);
      if (m?.[1]) return m[1];
    }
  } catch {}
  return undefined;
}

function parsePaymentAccountId(html: string): string | undefined {
  try {
    const patterns = [
      /payment_account_id\"?\s*[:=]\s*\"(\d{6,})\"/i,
      /\"paymentAccountID\"\s*:\s*\"(\d{6,})\"/i,
      /paymentAccountId\"?\s*[:=]\s*\"(\d{6,})\"/i,
      /asset_id\"?\s*[:=]\s*\"(\d{6,})\"/i,
      /ad_account_info_view_button[^}]*payment_account_id=(\d{6,})/i,
    ];
    for (const r of patterns) {
      const m = html.match(r);
      if (m?.[1]) return m[1];
    }
  } catch {}
  return undefined;
}

async function fetchTokensFromUrl(url: string, cookie: FacebookCookieData, agent: any, acceptLanguage?: string, userAgent?: string): Promise<Partial<SessionTokens>> {
  const u = new URL(url);
  const isBusiness = /(^|\.)business\.facebook\.com$/i.test(u.host);
  const origin = isBusiness ? FB_ORIGIN : `https://www.facebook.com`;
  const headers = {
    'User-Agent': userAgent || env.FB_USER_AGENT,
    'Accept-Language': acceptLanguage || env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': origin,
    'Origin': origin,
    ...(isBusiness ? {
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
    } : {}),
    'Upgrade-Insecure-Requests': '1',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
  } as Record<string, string>;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 18000);
  try {
    let html = '';
    try {
      const resp = await axios.get(url, {
        headers,
        httpsAgent: agent,
        httpAgent: agent,
        signal: controller.signal as any,
        timeout: 22000,
        maxRedirects: 3,
        validateStatus: (s) => s >= 200 && s < 500,
      });
      html = typeof resp.data === 'string' ? resp.data : '';
    } catch (e: any) {
      if (e?.response?.data) {
        html = typeof e.response.data === 'string' ? e.response.data : '';
      } else {
        throw e;
      }
    }
    const out: Partial<SessionTokens> = {};
    const dtsgPatterns = [
      /name=\"fb_dtsg\"[^>]*value=\"([^\"]+)\"/,
      /\"fb_dtsg\"\s*:\s*\"([^\"]+)\"/,
      /DTSGInitialData[^\}]*\{[^\}]*\"token\"\s*:\s*\"([^\"]+)\"/,
      /\"DTSGInitialData\"[^\}]*\{[^\}]*\"token\"\s*:\s*\"([^\"]+)\"/,
      /\"dtsg\"\s*:\s*\{[^\}]*\"token\"\s*:\s*\"([^\"]+)\"/,
    ];
    for (const rx of dtsgPatterns) {
      const m = html.match(rx);
      if (m?.[1]) { out.fbDtsg = m[1]; break; }
    }
    const lsdPatterns = [
      /name=\"lsd\"[^>]*value=\"([^\"]+)\"/,
      /\"LSD\"[^\}]*\{[^\}]*\"token\"\s*:\s*\"([^\"]+)\"/,
      /LSD[^\}]*\{[^\}]*token\"\s*:\s*\"([^\"]+)\"/,
    ];
    for (const rx of lsdPatterns) {
      const m = html.match(rx);
      if (m?.[1]) { out.lsd = m[1]; break; }
    }
    out.spin = parseSpin(html);
    out.businessId = parseBusinessId(html);
    const { upl, flow } = parseUplAndFlow(html);
    if (upl) out.xFbUplSessionId = upl;
    if (flow) out.xBhFlowSessionId = flow;
    const ptt = parsePlatformTrustToken(html);
    if (ptt) out.platformTrustToken = ptt;
    const aa = parsePrimaryAdAccountId(html);
    if (aa) out.adAccountId = aa;
    const pa = parsePaymentAccountId(html);
    if (pa) out.paymentAccountId = pa;
    return out;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSessionTokens(cookie: FacebookCookieData, agent: any, acceptLanguage?: string, userAgent?: string): Promise<SessionTokens | null> {
  const candidateUrls = [
    FB_BILLING_URL,
    'https://business.facebook.com/',
    'https://business.facebook.com/business_locations',
    'https://business.facebook.com/adsmanager/manage/billing_settings',
    'https://business.facebook.com/adsmanager/manage/campaigns',
    'https://business.facebook.com/ads/manager/billing/transactions/',
    // WWW fallbacks
    'https://www.facebook.com/',
    'https://www.facebook.com/billing/payment_methods',
    'https://www.facebook.com/business_locations',
    'https://www.facebook.com/adsmanager/manage/billing_settings',
    'https://www.facebook.com/ads/manager/billing/transactions/',
    // mbasic (lightweight HTML usually contains fb_dtsg)
    'https://mbasic.facebook.com/',
    'https://mbasic.facebook.com/settings',
    'https://mbasic.facebook.com/adsmanager',
  ];
  for (const url of candidateUrls) {
    const tokens = await fetchTokensFromUrl(url, cookie, agent, acceptLanguage, userAgent);
    if (tokens.fbDtsg) {
      return {
        fbDtsg: tokens.fbDtsg!,
        lsd: tokens.lsd,
        jazoest: tokens.jazoest || computeJazoest(tokens.fbDtsg!),
        spin: tokens.spin,
        businessId: tokens.businessId,
        xFbUplSessionId: tokens.xFbUplSessionId,
        xBhFlowSessionId: tokens.xBhFlowSessionId,
        platformTrustToken: tokens.platformTrustToken,
        adAccountId: tokens.adAccountId,
        paymentAccountId: tokens.paymentAccountId,
      };
    }
  }
  return null;
}

function buildBillingSaveCardCredentialVariables(cookie: FacebookCookieData, card: FacebookCardData, tokens: SessionTokens, prefs?: JobData['preferences']) {
  const number = (card.number || '').replace(/\s+/g, '');
  const bin = number.slice(0, 6);
  const last4 = number.slice(-4);
  const expiry_month = String(card.exp_month);
  const expiry_year = String(card.exp_year);
  const resolvedPaymentAccount = prefs?.paymentAccountID || (tokens as any).paymentAccountId || undefined;
  const chosenActorId = cookie.c_user;
  const platformTrustToken = (prefs as any)?.platformTrustToken || (tokens as any).platformTrustToken || undefined;
  const uplSessionId = (prefs as any)?.xFbUplSessionId || (tokens as any).xFbUplSessionId || undefined;
  const wizardSessionId = (prefs as any)?.xBhFlowSessionId || (tokens as any).xBhFlowSessionId || undefined;
  const clientMutationId = String(Date.now());

  const input = {
    billing_address: {
      country_code: card.country || 'US',
    },
    card_data: {
      bin,
      last_4: last4,
      expiry_month,
      expiry_year,
      cardholder_name: card.cardholder_name || 'Card Holder',
      credit_card_number: { sensitive_string_value: '$e2ee' },
      csc: { sensitive_string_value: '$e2ee' },
    },
    client_info: {
      color_depth: '24',
      java_enabled: false as any,
      screen_height: '1080',
      screen_width: '1920',
    },
    network_tokenization_consent_given: false as any,
    payment_account_id: resolvedPaymentAccount,
    payment_intent: 'ADD_PM',
    platform_trust_token: platformTrustToken,
    upl_logging_data: {
      context: 'billingcreditcard',
      credential_type: 'NEW_CREDIT_CARD',
      entry_point: 'BILLING_HUB',
      user_session_id: uplSessionId,
      wizard_config_name: 'SAVE_CARD_CREDENTIAL',
      wizard_name: 'ADD_PM_PUX_EP',
      wizard_session_id: wizardSessionId,
    },
    share_to_child_payment_account_id: null as any,
    actor_id: chosenActorId,
    client_mutation_id: clientMutationId,
  } as any;

  const variables = {
    input,
    getRiskVerificationInfoForAllCredentialsOnPaymentAccount: false,
    paymentAccountID: resolvedPaymentAccount,
  } as any;

  return variables;
}

function buildGraphQLFormData(cookie: FacebookCookieData, variables: any, tokens: SessionTokens) {
  const docId = env.FB_DOC_ID || '24198400473121149';
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingSaveCardCredentialStateMutation',
    variables: JSON.stringify(variables),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
  if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
  if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
  const formData = Object.entries(requestData)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return formData;
}

function extractPaymentAccountIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const id = u.searchParams.get('payment_account_id') || u.searchParams.get('paymentAccountID');
    return id || undefined;
  } catch {
    return undefined;
  }
}

async function getServerEncryptionKey(cookie: FacebookCookieData, tokens: SessionTokens, agent: any, acceptLanguage?: string, userAgent?: string, refererOverride?: string, prefs?: JobData['preferences']) {
  const docId = env.FB_ENC_KEY_DOC_ID || '23994203586844376';
  const paymentAccountID = (tokens as any).paymentAccountId || extractPaymentAccountIdFromUrl(refererOverride);
  const variables = { input: paymentAccountID ? { payment_account_id: paymentAccountID } : {} };
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PaymentsCometGetServerEncryptionKeyMutation',
    variables: JSON.stringify(variables),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
  if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
  if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
  const formData = new URLSearchParams(requestData as any).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': userAgent || env.FB_USER_AGENT,
    'Accept-Language': acceptLanguage || env.FB_ACCEPT_LANGUAGE,
    'Accept': '*/*',
    'Cookie': buildCookieHeader(cookie),
    'Connection': 'keep-alive',
    'Origin': FB_ORIGIN,
    'Referer': refererOverride || FB_BILLING_URL,
    'x-fb-friendly-name': 'PaymentsCometGetServerEncryptionKeyMutation',
    'x-asbd-id': env.ASBD_ID || '359341',
  };
  if (tokens.lsd) headers['x-fb-lsd'] = tokens.lsd;
  const upl = (prefs as any)?.xFbUplSessionId || tokens.xFbUplSessionId;
  const flow = (prefs as any)?.xBhFlowSessionId || tokens.xBhFlowSessionId;
  if (upl) headers['x-fb-upl-sessionid'] = upl;
  if (flow) headers['x-bh-flowsessionid'] = flow;
  const response = await axios.post(FB_GRAPHQL_URL, formData, {
    headers,
    httpsAgent: agent,
    httpAgent: agent,
    timeout: 20000,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 500,
  });
  const text = typeof response.data === 'string' ? response.data.replace(/^for \(;;\);/, '') : JSON.stringify(response.data);
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const keyObj = item?.data?.payments_get_server_encryption_key || item?.data?.public_key || item?.data;
        if (keyObj) return keyObj;
      }
      return parsed[0]?.data || parsed[0] || null;
    }
    return parsed?.data?.payments_get_server_encryption_key || parsed?.data || parsed;
  } catch {
    if (env.DEBUG_E2EE) {
      try { console.warn('[e2ee] key parse failed, raw=', text?.slice(0, 500)); } catch {}
    }
    return null;
  }
}

function requiredHeaders(tokens: SessionTokens, prefs?: JobData['preferences']) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': (prefs?.userAgent || env.FB_USER_AGENT),
    'Accept-Language': (prefs?.acceptLanguage || env.FB_ACCEPT_LANGUAGE),
    'Accept': '*/*',
    'Connection': 'keep-alive',
    'Origin': prefs?.origin || FB_ORIGIN,
    'Referer': prefs?.referer || FB_BILLING_URL,
    'x-fb-friendly-name': 'BillingSaveCardCredentialStateMutation',
    'x-asbd-id': env.ASBD_ID || '129477',
  };
  if (tokens.lsd) headers['x-fb-lsd'] = tokens.lsd;
  if (prefs?.xFbUplSessionId || tokens.xFbUplSessionId) headers['x-fb-upl-sessionid'] = (prefs?.xFbUplSessionId || tokens.xFbUplSessionId)!;
  if (prefs?.xBhFlowSessionId || tokens.xBhFlowSessionId) headers['x-bh-flowsessionid'] = (prefs?.xBhFlowSessionId || tokens.xBhFlowSessionId)!;
  return headers;
}

async function sendRequest(cookie: FacebookCookieData, formData: string, tokens: SessionTokens, agent: any, acceptLanguage?: string, userAgent?: string, headersExtra?: Record<string,string>) {
  const baseHeaders: Record<string, string> = {
    'Cookie': buildCookieHeader(cookie),
  };
  const headers = { ...requiredHeaders(tokens, { acceptLanguage, userAgent }), ...baseHeaders, ...(headersExtra || {}) };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
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
    if (Array.isArray(parsed)) {
      const errItem = parsed.find((it: any) => it?.errors && it.errors.length > 0);
      if (errItem) throw new Error(`Facebook error: ${errItem.errors[0]?.message || 'Unknown'}`);
      return parsed;
    }
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(`Facebook error: ${parsed.errors[0]?.message || 'Unknown'}`);
    }
    return parsed;
  } catch (e) {
    return { raw: text };
  }
}

function isConfirmedSuccess(parsed: any): boolean {
  if (!parsed) return false;
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const p of items) {
    if (p && typeof p === 'object') {
      if (p.data && Object.keys(p.data || {}).length > 0) return true;
      if ((p as any).success === true) return true;
      const dataObj = (p as any).data || {};
      if (typeof dataObj === 'object') {
        const hasClientMutationId = JSON.stringify(dataObj).includes('client_mutation_id');
        if (hasClientMutationId) return true;
      }
    }
  }
  return false;
}

async function performFollowUpChecks(cookie: FacebookCookieData, tokens: SessionTokens, agent: any, acceptLanguage?: string, userAgent?: string) {
  const queries = [
    { friendly: 'BillingRiskCredentialAuthScreenQuery', doc_id: '31537842232469763' },
    { friendly: 'BillingSDCVerifyScreenQuery', doc_id: '9370121456450229' },
  ];
  for (const q of queries) {
    const requestData: Record<string, any> = {
      av: cookie.c_user,
      __user: cookie.c_user,
      __a: 1,
      dpr: 1,
      fb_dtsg: tokens.fbDtsg,
      jazoest: tokens.jazoest,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: q.friendly,
      variables: JSON.stringify({}),
      server_timestamps: true,
      doc_id: q.doc_id,
    };
    if (tokens.lsd) requestData.lsd = tokens.lsd;
    if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
    if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
    if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
    const formData = new URLSearchParams(requestData as any).toString();
    const resp = await sendRequest(cookie, formData, tokens, agent, acceptLanguage, userAgent, {
      'x-fb-friendly-name': q.friendly,
    });
    const parsed = parseResult(resp.data);
    // We only need to log; caller decides success policy
    // ... existing code ...
  }
}

// New: Landing query before update
async function runBillingWizardLanding(cookie: FacebookCookieData, tokens: SessionTokens, agent: any, paymentAccountID: string, acceptLanguage?: string, userAgent?: string) {
  const friendly = 'BillingWizardLandingScreenQuery';
  const docId = '24285044204440618';
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: friendly,
    variables: JSON.stringify({ paymentAccountID }),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
  if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
  if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
  const formData = new URLSearchParams(requestData as any).toString();
  const resp = await sendRequest(cookie, formData, tokens, agent, acceptLanguage, userAgent, { 'x-fb-friendly-name': friendly });
  return parseResult(resp.data);
}

// New: Update account mutation (requires correct doc_id)
async function runUpdateBillingAccount(cookie: FacebookCookieData, tokens: SessionTokens, agent: any, docId: string, variables: Record<string, any>, acceptLanguage?: string, userAgent?: string) {
  const friendly = 'BillingAccountInformationUtilsUpdateAccountMutation';
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: friendly,
    variables: JSON.stringify(variables || {}),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
  if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
  if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
  const formData = new URLSearchParams(requestData as any).toString();
  const resp = await sendRequest(cookie, formData, tokens, agent, acceptLanguage, userAgent, { 'x-fb-friendly-name': friendly });
  return parseResult(resp.data);
}

function normalizePublicKey(key: string | undefined): string | null {
  if (!key || typeof key !== 'string') return null;
  let trimmed = key.trim();
  if (/BEGIN PUBLIC KEY/.test(trimmed)) return trimmed;
  // If key is base64 without PEM headers, wrap it
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    const chunks = trimmed.replace(/\s+/g, '').match(/.{1,64}/g) || [trimmed];
    return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----`;
  }
  return null;
}

function extractPublicKey(candidate: any): string | undefined {
  if (!candidate) return undefined;
  const paths = [
    (c: any) => c?.public_key,
    (c: any) => c?.publicKey,
    (c: any) => c?.pem,
    (c: any) => c?.pem_key,
    (c: any) => c?.key,
    (c: any) => c?.e2ee_public_key,
    (c: any) => c?.payments_get_server_encryption_key?.public_key,
    (c: any) => c?.payments_get_server_encryption_key?.key,
    (c: any) => c?.payments_get_server_encryption_key?.pem,
    (c: any) => c?.data?.payments_get_server_encryption_key?.public_key,
    (c: any) => c?.data?.payments_get_server_encryption_key?.key,
    (c: any) => c?.data?.payments_get_server_encryption_key?.pem,
  ];
  for (const get of paths) {
    const v = get(candidate);
    if (typeof v === 'string' && v.trim()) return v;
  }
  // Also check first element if array
  if (Array.isArray(candidate) && candidate.length > 0) {
    const arrHit = extractPublicKey(candidate[0]);
    if (arrHit) return arrHit;
  }
  // Deep scan for any plausible PEM/base64 key
  const visited = new Set<any>();
  const stack: any[] = [candidate];
  const looksLikeKey = (s: string) => /BEGIN PUBLIC KEY/.test(s) || /^[A-Za-z0-9+/=\r\n]{200,}$/.test(s);
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const v of Object.values(cur)) {
      if (typeof v === 'string' && v.trim() && looksLikeKey(v)) return v;
      if (v && typeof v === 'object') stack.push(v);
      if (Array.isArray(v)) for (const it of v) stack.push(it);
    }
  }
  return undefined;
}

function encryptSensitiveValue(publicKeyPem: string, plaintext: string): string {
  const buffer = Buffer.from(String(plaintext), 'utf8');
  const encrypted = crypto.publicEncrypt({ key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, buffer);
  return `E2EE:${encrypted.toString('base64')}`;
}

export async function processJob(data: JobData, job?: Job) {
  const db = await getDb();
  const jobId = job?.id ? String(job.id) : `${Date.now()}_${Math.floor(Math.random()*1000)}`;
  const results = db.collection<any>('job_results');
  async function logStep(phase: string, status: 'started'|'success'|'failed', message?: string) {
    const logMsg = `[job ${jobId || '-'}] ${phase} -> ${status}${message ? ` | ${message}` : ''}`;
    try { console.info(logMsg); } catch {}
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
          $set: { updatedAt: new Date() },
        } as any
      ),
      { upsert: true }
    );
    // Emit user-facing progress messages
    const phaseToMessage: Record<string, string> = {
      prepare_session: 'تم تجهيز الجلسة بنجاح',
      resolve_ad_account: 'تم تحديد حساب الإعلانات',
      landing_query: 'تم فتح شاشة إضافة وسيلة الدفع',
      update_account: 'تم تحديث إعدادات الحساب',
      encryption_key: 'تم جلب مفتاح التشفير',
      build_payload: 'تم تجهيز بيانات البطاقة',
      send_request: 'تم إرسال طلب إضافة البطاقة',
      retry_request: 'إعادة المحاولة تمت',
      done: 'اكتملت العملية',
      error: 'حدث خطأ أثناء العملية',
    };
    if (status === 'success' && phaseToMessage[phase]) {
      emitProgress({ jobId, progress: 50, status: 'progress', message: phaseToMessage[phase] });
    }
  }

  // NEW: allow inline payloads and fix ObjectId lookup
  const toObjectId = (id: any) => {
    try { return new (require('mongodb').ObjectId)(id); } catch { return id; }
  };

  // Load server config if provided
  let serverConfig: any = null;
  if ((data as any).serverId) {
    try {
      serverConfig = await db.collection('servers').findOne({ _id: toObjectId((data as any).serverId) });
      if (serverConfig) {
        await logStep('using_server', 'started', `${serverConfig.name || serverConfig._id}`);
      }
    } catch {}
  }

  const cookieDoc = (data as any).inlineCookiePayload
    ? { payload: (data as any).inlineCookiePayload }
    : await db.collection('cookies').findOne({ _id: toObjectId((data as any).cookieId) });
  const cardDoc = (data as any).inlineCardPayload
    ? { payload: (data as any).inlineCardPayload }
    : await db.collection('cards').findOne({ _id: toObjectId((data as any).cardId) });
  if (!cookieDoc || !cardDoc) throw new Error('Missing cookie or card data');

  const cookie = typeof cookieDoc.payload === 'string' ? decryptJson<FacebookCookieData>(cookieDoc.payload) : cookieDoc.payload as FacebookCookieData;
  const card = typeof cardDoc.payload === 'string' ? decryptJson<FacebookCardData>(cardDoc.payload) : cardDoc.payload as FacebookCardData;
  const effectiveProxy = (data.proxyConfig
    || (serverConfig?.settings?.proxyEnabled ? serverConfig?.settings?.proxyConfig : undefined));
  const agent = buildAgent(effectiveProxy);

  const acceptLanguage = data.preferences?.acceptLanguage || env.FB_ACCEPT_LANGUAGE;
  const userAgent = data.preferences?.userAgent || env.FB_USER_AGENT;

  await logStep('prepare_session', 'started', 'Fetching fb_dtsg');

  try {
    const tokens = await (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const t = await fetchSessionTokens(cookie, agent, acceptLanguage, userAgent);
        if (t) return t;
        await sleep(200 + randInt(50, 150));
      }
      throw new Error('Failed to get fb_dtsg token');
    })();
    await logStep('prepare_session', 'success', `fb_dtsg fetched`);

    // Resolve ad account id if requested to use primary
    let resolvedPrefs = { ...(data.preferences || {}) };
    if (resolvedPrefs.usePrimaryAdAccount && !resolvedPrefs.adAccountId) {
      await logStep('resolve_ad_account', 'started', 'Fetching primary ad account id');
      let adId = tokens.adAccountId;
      if (!adId) {
        // fallback: try one more lightweight page
        try {
          const extra = await fetchTokensFromUrl('https://business.facebook.com/adsmanager', cookie, agent, acceptLanguage, userAgent);
          adId = extra.adAccountId || adId;
        } catch {}
      }
      if (adId) {
        resolvedPrefs.adAccountId = adId;
        await logStep('resolve_ad_account', 'success', `adAccountId=${adId}`);
      } else {
        await logStep('resolve_ad_account', 'failed', 'Could not detect primary ad account id');
      }
    }

    // Step: open landing wizard screen (if paymentAccountID provided)
    if (resolvedPrefs.paymentAccountID) {
      await logStep('landing_query', 'started', `paymentAccountID=${resolvedPrefs.paymentAccountID}`);
      try {
        await runBillingWizardLanding(cookie, tokens, agent, resolvedPrefs.paymentAccountID, acceptLanguage, userAgent);
        await logStep('landing_query', 'success');
      } catch (e: any) {
        await logStep('landing_query', 'failed', e?.message || 'failed');
      }
    }

    // Optional: update account info (requires docId + variables)
    const updateDocId = resolvedPrefs.updateAccountDocId || (env as any).FB_UPDATE_ACCOUNT_DOC_ID;
    const updateVars = resolvedPrefs.updateAccountVariables;
    if (updateDocId && updateVars) {
      await logStep('update_account', 'started');
      try {
        const upd = await runUpdateBillingAccount(cookie, tokens, agent, updateDocId, updateVars, acceptLanguage, userAgent);
        const ok = isConfirmedSuccess(upd);
        await logStep('update_account', ok ? 'success' : 'failed', ok ? undefined : 'not confirmed');
      } catch (e: any) {
        await logStep('update_account', 'failed', e?.message || 'failed');
      }
    }

    await logStep('encryption_key', 'started');
    const encKey = await getServerEncryptionKey(cookie, tokens, agent, acceptLanguage, userAgent, (resolvedPrefs as any)?.referer, resolvedPrefs);
    const encKeyRaw = extractPublicKey(encKey);
    await logStep('encryption_key', encKeyRaw ? 'success' : 'failed');
    if (!encKeyRaw && env.DEBUG_E2EE) {
      try { console.warn('[e2ee] missing public key; encKey shape:', JSON.stringify(encKey)?.slice(0, 500)); } catch {}
    }

    const variables = buildBillingSaveCardCredentialVariables(cookie, card, tokens, resolvedPrefs);

    // Replace placeholders with real e2ee values when server key available or use provided E2EE
    try {
      const providedNumber = (resolvedPrefs as any)?.e2eeNumber;
      const providedCsc = (resolvedPrefs as any)?.e2eeCsc;
      if (providedNumber && providedCsc && variables?.input?.card_data?.credit_card_number && variables?.input?.card_data?.csc) {
        variables.input.card_data.credit_card_number.sensitive_string_value = String(providedNumber);
        variables.input.card_data.csc.sensitive_string_value = String(providedCsc);
        await logStep('e2ee', 'success', 'Using provided E2EE values');
      } else {
        const pubKeyRaw = encKeyRaw || extractPublicKey(encKey) as string | undefined;
        const pubKeyPem = normalizePublicKey(pubKeyRaw || '');
        if (pubKeyPem && variables?.input?.card_data?.credit_card_number && variables?.input?.card_data?.csc) {
          variables.input.card_data.credit_card_number.sensitive_string_value = encryptSensitiveValue(pubKeyPem, String(card.number || ''));
          variables.input.card_data.csc.sensitive_string_value = encryptSensitiveValue(pubKeyPem, String(card.cvv || ''));
          await logStep('e2ee', 'success', 'Encrypted card number and csc');
        } else {
          await logStep('e2ee', 'failed', 'Missing public key; sending placeholders');
          if (env.ENFORCE_E2EE) {
            throw new Error('MISSING_PUBLIC_KEY: E2EE public key not available');
          }
        }
      }
    } catch (e: any) {
      await logStep('e2ee', 'failed', e?.message || 'encrypt failed');
      if (env.ENFORCE_E2EE) {
        throw new Error('MISSING_PUBLIC_KEY: E2EE encryption failed');
      }
    }

    await logStep('build_payload', 'started');
    const formData = buildGraphQLFormData(cookie, variables, tokens);
    await logStep('build_payload', 'success');

    await sleep(randInt(120, 400));

    await logStep('send_request', 'started');

    let attempt = 0;
    let response: any;
    let parsed: any;
    let lastError: any = null;
    let pendingVerification = false;

    while (attempt < 3) {
      attempt++;
      response = await sendRequest(cookie, formData, tokens, agent, acceptLanguage, userAgent);
      await logStep('send_request', 'success', `HTTP ${response.status}`);
      parsed = parseResult(response.data);

      const parsedText = JSON.stringify(parsed || {});
      if (/PENDING_VERIFICATION|PENDING/i.test(parsedText)) pendingVerification = true;

      if (response.status === 429 || response.status === 403) {
        lastError = new Error(`HTTP ${response.status}`);
        await logStep('backoff', 'failed', `Rate/Forbidden; backoff attempt ${attempt}`);
        const base = Math.pow(2, attempt) * 1000;
        const jitter = randInt(200, 800);
        await sleep(base + jitter);
        let refreshed = tokens;
        try { const t = await fetchSessionTokens(cookie, agent, acceptLanguage, userAgent); if (t) refreshed = t; } catch {}
        const formData2 = buildGraphQLFormData(cookie, variables, refreshed);
        response = await sendRequest(cookie, formData2, refreshed, agent, acceptLanguage, userAgent);
        await logStep('retry_request', 'success', `HTTP ${response.status}`);
        parsed = parseResult(response.data);
        if (/PENDING_VERIFICATION|PENDING/i.test(JSON.stringify(parsed || {}))) pendingVerification = true;
        if (isConfirmedSuccess(parsed) && response.status < 400) break;
        continue;
      }

      if (response.status >= 400) {
        lastError = new Error(`HTTP ${response.status}`);
        await logStep('http_error', 'failed', lastError.message);
        break;
      }

      if (isConfirmedSuccess(parsed)) break;

      await logStep('retry', 'started', 'Retrying with fresh tokens');
      let refreshed = tokens;
      try { const t = await fetchSessionTokens(cookie, agent, acceptLanguage, userAgent); if (t) refreshed = t; } catch {}
      const formData2 = buildGraphQLFormData(cookie, variables, refreshed);
      response = await sendRequest(cookie, formData2, refreshed, agent, acceptLanguage, userAgent);
      await logStep('retry_request', 'success', `HTTP ${response.status}`);
      parsed = parseResult(response.data);
      if (/PENDING_VERIFICATION|PENDING/i.test(JSON.stringify(parsed || {}))) pendingVerification = true;

      if (isConfirmedSuccess(parsed)) break;

      const base = 300 + randInt(100, 400);
      await sleep(base);
    }

    await results.updateOne(
      { jobId },
      (
        {
          $set: {
            cookieId: (cookieDoc as any)._id || (data as any).cookieId,
            cardId: (cardDoc as any)._id || (data as any).cardId,
            serverId: data.serverId || null,
            success: (response?.status >= 200 && response?.status < 400 && isConfirmedSuccess(parsed)) || pendingVerification,
            reason: pendingVerification ? 'PENDING_VERIFICATION: Card addition pending manual verification' : (isConfirmedSuccess(parsed) ? 'Card add attempt finished' : ((parsed as any)?.errors?.[0]?.message || lastError?.message || 'Not confirmed')),
            country: (card as any).country || (cookie as any).country || null,
            response: parsed,
            pendingVerification,
            finishedAt: new Date(),
          },
          $push: { steps: { phase: 'done', status: ((response?.status >= 200 && response?.status < 400 && isConfirmedSuccess(parsed)) || pendingVerification) ? 'success' : 'failed', message: null, at: new Date() } },
        } as any
      ),
      { upsert: true }
    );

    // If inline card (generated) and success, persist it now (store plaintext payload)
    if (((data as any).inlineCardPayload) && ((response?.status >= 200 && response?.status < 400 && isConfirmedSuccess(parsed)) || pendingVerification)) {
      try {
        const insert = await db.collection('cards').insertOne({
          payload: (data as any).inlineCardPayload,
          cardNumber: ((data as any).inlineCardPayload?.number) || undefined,
          createdAt: new Date(),
        });
        await results.updateOne({ jobId }, { $set: { cardId: insert.insertedId } });
      } catch {}
    }

    if (!((response?.status >= 200 && response?.status < 400 && isConfirmedSuccess(parsed)) || pendingVerification)) {
      throw new Error('Add card not confirmed by GraphQL response');
    }

    // Follow-up checks
    await performFollowUpChecks(cookie, tokens, agent, acceptLanguage, userAgent);

    return { success: true, result: parsed, pendingVerification };
  } catch (error) {
    try { console.error('[worker error]', error); } catch {}
    await logStep('error', 'failed', error instanceof Error ? error.message : String(error));
    await results.updateOne(
      { jobId },
      (
        {
          $set: {
            cookieId: (cookieDoc as any)?._id || (data as any).cookieId,
            cardId: (cardDoc as any)?._id || (data as any).cardId,
            serverId: data.serverId || null,
            success: false,
            reason: error instanceof Error ? error.message : 'Unknown error',
            country: (card as any)?.country || (cookie as any)?.country || null,
            error: error instanceof Error ? error.stack : String(error),
            finishedAt: new Date(),
          },
        } as any
      ),
      { upsert: true }
    );
    emitProgress({ jobId, progress: -1, status: 'failed', message: error instanceof Error ? error.message : 'فشل غير معروف' });
    throw error;
  }
}

export const worker = makeAddCardWorker(processJob as any); 