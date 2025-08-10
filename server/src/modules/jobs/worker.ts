import { makeAddCardWorker } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { decryptJson } from '../../lib/encryption';
import axios from 'axios';
import { buildAgent } from '../proxy/agent';

interface FacebookCardData {
  number: string;
  exp_month: string;
  exp_year: string;
  cvv: string;
  country?: string;
  currency?: string;
  timezone?: string;
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

async function processJob(data: JobData) {
  const db = await getDb();
  const cookieDoc = await db.collection('cookies').findOne({ _id: (data as any).cookieId });
  const cardDoc = await db.collection('cards').findOne({ _id: (data as any).cardId });
  
  if (!cookieDoc || !cardDoc) {
    throw new Error('Missing cookie or card data');
  }

  const cookie = decryptJson<FacebookCookieData>(cookieDoc.payload);
  const card = decryptJson<FacebookCardData>(cardDoc.payload);

  try {
    // Build proxy agent if configured
    const agent = buildAgent(data.proxyConfig);
    
    // Prepare Facebook request headers and cookies
    const cookies = [
      `c_user=${cookie.c_user}`,
      `xs=${cookie.xs}`,
      ...(cookie.fr ? [`fr=${cookie.fr}`] : []),
      ...(cookie.datr ? [`datr=${cookie.datr}`] : [])
    ].join('; ');

    // Get fb_dtsg token (this would need to be fetched from Facebook first)
    // For now, we'll simulate the request structure
    const fbDtsg = await getFacebookDtsg(cookie, agent);
    
    if (!fbDtsg) {
      throw new Error('Failed to get fb_dtsg token');
    }

    // Prepare Facebook GraphQL request for adding payment method
    const requestData = {
      av: cookie.c_user,
      __user: cookie.c_user,
      __a: 1,
      dpr: 1,
      __rev: 0x3d18305b,
      fb_dtsg: fbDtsg,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'useBillingAddPaymentMethodMutation',
      variables: JSON.stringify({
        input: {
          payment_method_type: 'CREDIT_CARD',
          credit_card: {
            card_number: card.number.replace(/\s/g, ''),
            expiry_month: parseInt(card.exp_month),
            expiry_year: parseInt(card.exp_year),
            security_code: card.cvv,
            cardholder_name: 'Card Holder', // This could be configurable
            billing_address: {
              country_code: card.country || 'US',
              postal_code: '12345', // This could be configurable
              city: 'City', // This could be configurable
              street_address: 'Street Address' // This could be configurable
            }
          },
          is_default: false,
          client_mutation_id: Date.now().toString()
        }
      }),
      server_timestamps: true,
      doc_id: '123456789' // This would need to be the actual document ID
    };

    // Convert to form data
    const formData = Object.entries(requestData)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    // Make the request to Facebook
    const response = await axios.post(
      'https://business.facebook.com/api/graphql/',
      formData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        httpsAgent: agent,
        timeout: 30000
      }
    );

    // Parse response
    const responseText = response.data;
    if (!responseText || responseText.trim() === '') {
      throw new Error('Facebook returned empty response');
    }

    // Remove Facebook's "for (;;);" prefix and parse JSON
    const cleanResponse = responseText.replace(/^for \(;;\);/, '');
    const result = JSON.parse(cleanResponse);

    if (result.errors && result.errors.length > 0) {
      const error = result.errors[0];
      throw new Error(`Facebook error: ${error.message}`);
    }

    // Success - record the result
    await db.collection('job_results').insertOne({
      cookieId: cookieDoc._id,
      cardId: cardDoc._id,
      serverId: data.serverId || null,
      success: true,
      reason: 'Card added successfully',
      country: card.country || cookie.country || null,
      response: result,
      createdAt: new Date(),
    });

    return { success: true, result };

  } catch (error) {
    // Record failure
    await db.collection('job_results').insertOne({
      cookieId: cookieDoc._id,
      cardId: cardDoc._id,
      serverId: data.serverId || null,
      success: false,
      reason: error instanceof Error ? error.message : 'Unknown error',
      country: card.country || cookie.country || null,
      error: error instanceof Error ? error.stack : String(error),
      createdAt: new Date(),
    });

    throw error;
  }
}

// Function to get fb_dtsg token from Facebook
async function getFacebookDtsg(cookie: FacebookCookieData, agent?: any): Promise<string | null> {
  try {
    const cookies = [
      `c_user=${cookie.c_user}`,
      `xs=${cookie.xs}`,
      ...(cookie.fr ? [`fr=${cookie.fr}`] : []),
      ...(cookie.datr ? [`datr=${cookie.datr}`] : [])
    ].join('; ');

    // First, get the main page to extract fb_dtsg
    const response = await axios.get('https://business.facebook.com/billing/payment_methods', {
      headers: {
        'Cookie': cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      httpsAgent: agent,
      timeout: 30000
    });

    // Extract fb_dtsg from the page
    const fbDtsgMatch = response.data.match(/name="fb_dtsg" value="([^"]+)"/);
    if (fbDtsgMatch) {
      return fbDtsgMatch[1];
    }

    // Alternative method: look for it in window data
    const windowDataMatch = response.data.match(/window\.__DTSGInitialData__\s*=\s*"([^"]+)"/);
    if (windowDataMatch) {
      return windowDataMatch[1];
    }

    return null;
  } catch (error) {
    console.error('Failed to get fb_dtsg:', error);
    return null;
  }
}

export const worker = makeAddCardWorker(processJob); 