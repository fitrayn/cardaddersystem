import { z } from 'zod';
import axios from 'axios';
import { ObjectId } from 'mongodb';
import { getDb } from '../../lib/mongo';
import { decryptJson } from '../../lib/encryption';
import { requireRole } from '../../middleware/auth';
import { env } from '../../config/env';
import { buildAgent } from '../proxy/agent';

// Minimal types for cookie and tokens
interface FacebookCookieData {
  c_user: string;
  xs: string;
  fr?: string;
  datr?: string;
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

function computeJazoest(fbDtsg: string): string {
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
  return `2${sum}`;
}

function parseSpin(html: string): { r?: string; t?: string; b?: string } | undefined {
  try {
    const rMatch = html.match(/\"__spin_r\"\s*:\s*(\d+)/);
    const tMatch = html.match(/\"__spin_t\"\s*:\s*(\d+)/);
    const bMatch = html.match(/\"__spin_b\"\s*:\s*\"([^\"]+)\"/);
    return { r: rMatch?.[1], t: tMatch?.[1], b: bMatch?.[1] };
  } catch {
    return undefined;
  }
}

function parseBusinessId(html: string): string | undefined {
  const patterns = [
    /\\\"selected_business_id\\\"\s*:\s*\\\"(\d+)\\\"/,
    /business_id=\\\"(\d+)\\\"/,
    /\\\"business_id\\\"\s*:\s*\\\"(\d+)\\\"/
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
      /x-fb-upl-sessionid\\\"?\s*[:=]\s*\\\"([^\\\"]+)\\\"/i,
      /upl[_-]?sessionid\\\"?\s*[:=]\s*\\\"([^\\\"]+)\\\"/i,
      /\\\"uplSessionId\\\"\s*:\s*\\\"([^\\\"]+)\\\"/i,
    ];
    for (const r of uplMatches) {
      const m = html.match(r);
      if (m?.[1]) { res.upl = m[1]; break; }
    }
    const flowMatches = [
      /x-bh-flowsessionid\\\"?\s*[:=]\s*\\\"([^\\\"]+)\\\"/i,
      /flow[_-]?sessionid\\\"?\s*[:=]\s*\\\"([^\\\"]+)\\\"/i,
      /\\\"flowSessionId\\\"\s*:\s*\\\"([^\\\"]+)\\\"/i,
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
      /platform_trust_token\\\"?\s*[:=]\s*\\\"([^\\\"]+)\\\"/i,
      /\\\"platformTrustToken\\\"\s*:\s*\\\"([^\\\"]+)\\\"/i,
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
  const isBusiness = /(^|\\.)business\\.facebook\\.com$/i.test(u.host);
  const origin = isBusiness ? FB_ORIGIN : `https://www.facebook.com`;
  const headers = {
    'User-Agent': userAgent || env.FB_USER_AGENT,
    'Accept-Language': acceptLanguage || env.FB_ACCEPT_LANGUAGE,
    'Cookie': buildCookieHeader(cookie),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Connection': 'keep-alive',
    'Referer': origin,
    'Origin': origin,
    ...(isBusiness ? {
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
    } : {}),
    'Upgrade-Insecure-Requests': '1',
  } as Record<string, string>;
  const resp = await axios.get(url, {
    headers,
    httpsAgent: agent,
    httpAgent: agent,
    timeout: 12000,
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 500,
  });
  const html = typeof resp.data === 'string' ? resp.data : '';
  const out: Partial<SessionTokens> = {};
  const dtsgMatch = html.match(/name=\\\"fb_dtsg\\\"[^>]*value=\\\"([^\\\"]+)\\\"/);
  if (dtsgMatch?.[1]) out.fbDtsg = dtsgMatch[1];
  const lsdMatch = html.match(/name=\\\"lsd\\\"[^>]*value=\\\"([^\\\"]+)\\\"/);
  if (lsdMatch?.[1]) out.lsd = lsdMatch[1];
  out.spin = parseSpin(html);
  out.businessId = parseBusinessId(html);
  const { upl, flow } = parseUplAndFlow(html);
  if (upl) out.xFbUplSessionId = upl;
  if (flow) out.xBhFlowSessionId = flow;
  const ptt = parsePlatformTrustToken(html);
  if (ptt) out.platformTrustToken = ptt;
  return out;
}

async function fetchSessionTokens(cookie: FacebookCookieData, agent: any, acceptLanguage?: string, userAgent?: string): Promise<SessionTokens | null> {
  const candidateUrls = [
    FB_BILLING_URL,
    'https://business.facebook.com/business_locations',
    'https://business.facebook.com/adsmanager/manage/billing_settings',
    'https://business.facebook.com/ads/manager/billing/transactions/',
    'https://www.facebook.com/billing/payment_methods',
    'https://www.facebook.com/business_locations',
    'https://www.facebook.com/adsmanager/manage/billing_settings',
    'https://www.facebook.com/ads/manager/billing/transactions/',
  ];
  for (const url of candidateUrls) {
    try {
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
        };
      }
    } catch {
      // try next
    }
  }
  return null;
}

function requiredHeaders(tokens: SessionTokens, prefs?: { acceptLanguage?: string; userAgent?: string; origin?: string; referer?: string; xFbUplSessionId?: string; xBhFlowSessionId?: string }) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': prefs?.userAgent || env.FB_USER_AGENT,
    'Accept-Language': prefs?.acceptLanguage || env.FB_ACCEPT_LANGUAGE,
    'Accept': '*/*',
    'Connection': 'keep-alive',
    'Origin': prefs?.origin || FB_ORIGIN,
    'Referer': prefs?.referer || FB_BILLING_URL,
    'x-fb-friendly-name': 'BillingWizardLandingScreenQuery',
    'x-asbd-id': env.ASBD_ID || '129477',
  };
  if (tokens.lsd) headers['x-fb-lsd'] = tokens.lsd;
  if (prefs?.xFbUplSessionId || tokens.xFbUplSessionId) headers['x-fb-upl-sessionid'] = (prefs?.xFbUplSessionId || tokens.xFbUplSessionId)!;
  if (prefs?.xBhFlowSessionId || tokens.xBhFlowSessionId) headers['x-bh-flowsessionid'] = (prefs?.xBhFlowSessionId || tokens.xBhFlowSessionId)!;
  return headers;
}

function buildFormData(cookie: FacebookCookieData, tokens: SessionTokens, variables: any) {
  const docId = '24285044204440618'; // BillingWizardLandingScreenQuery
  const requestData: Record<string, any> = {
    av: cookie.c_user,
    __user: cookie.c_user,
    __a: 1,
    dpr: 1,
    fb_dtsg: tokens.fbDtsg,
    jazoest: tokens.jazoest,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'BillingWizardLandingScreenQuery',
    variables: JSON.stringify(variables || {}),
    server_timestamps: true,
    doc_id: docId,
  };
  if (tokens.lsd) requestData.lsd = tokens.lsd;
  if (tokens.spin?.r) requestData.__spin_r = tokens.spin.r;
  if (tokens.spin?.t) requestData.__spin_t = tokens.spin.t;
  if (tokens.spin?.b) requestData.__spin_b = tokens.spin.b;
  const formData = new URLSearchParams(requestData as any).toString();
  return formData;
}

export async function facebookRoutes(app: any) {
  const bodySchema = z.object({
    cookieId: z.string().min(6),
    paymentAccountID: z.string().min(6),
    proxy: z.object({
      type: z.enum(['http', 'https', 'socks5']),
      host: z.string(),
      port: z.number(),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
    preferences: z.object({
      acceptLanguage: z.string().optional(),
      userAgent: z.string().optional(),
      origin: z.string().optional(),
      referer: z.string().optional(),
      xFbUplSessionId: z.string().optional(),
      xBhFlowSessionId: z.string().optional(),
    }).optional(),
  });

  app.post('/api/facebook/billing/landing', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const parsed = bodySchema.safeParse(req.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.issues });
    const { cookieId, paymentAccountID, proxy, preferences } = parsed.data;

    const db = await getDb();
    const cookieDoc = await db.collection('cookies').findOne({ _id: new ObjectId(cookieId) });
    if (!cookieDoc) return reply.code(404).send({ error: 'Cookie not found' });

    const cookie = ((): FacebookCookieData | null => {
      try {
        const raw = typeof cookieDoc.payload === 'string' ? decryptJson<any>(cookieDoc.payload) : cookieDoc.payload;
        if (raw && raw.c_user && raw.xs) return { c_user: raw.c_user, xs: raw.xs, fr: raw.fr, datr: raw.datr };
        return null;
      } catch { return null; }
    })();
    if (!cookie) return reply.code(400).send({ error: 'Invalid cookie payload' });

    const agent = buildAgent(proxy as any);

    // Fetch session tokens
    const tokens = await fetchSessionTokens(cookie, agent, preferences?.acceptLanguage, preferences?.userAgent);
    if (!tokens) return reply.code(502).send({ error: 'Failed to fetch session tokens' });

    const variables = { paymentAccountID };
    const formData = buildFormData(cookie, tokens, variables);

    const headers = {
      ...requiredHeaders(tokens, preferences),
      Cookie: buildCookieHeader(cookie),
    } as Record<string, string>;

    const response = await axios.post(FB_GRAPHQL_URL, formData, {
      headers,
      httpsAgent: agent,
      httpAgent: agent,
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: (s) => s >= 200 && s < 500,
    });

    const text = typeof response.data === 'string' ? response.data.replace(/^for \\(;;\\);/, '') : JSON.stringify(response.data);
    let parsedJson: any = null;
    try { parsedJson = JSON.parse(text); } catch { parsedJson = { raw: text }; }

    return reply.send({ status: response.status, data: parsedJson });
  });
} 