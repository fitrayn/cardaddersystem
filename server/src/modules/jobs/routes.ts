import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { enqueueAddCardJob, getQueueStats, pauseQueue, resumeQueue, clearQueue, getJobDetails, getQueueEvents } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { z } from 'zod';
import { encryptJson } from '../../lib/encryption';
import { decryptJson } from '../../lib/encryption';
import { ObjectId } from 'mongodb';
import { env } from '../../config/env';
import { onProgress, offProgress, emitProgress } from '../../lib/events';
import { processJob as runJob } from './worker';

const preferencesSchema = z.object({
  acceptLanguage: z.string().optional(),
  userAgent: z.string().optional(),
  businessId: z.string().optional(),
  origin: z.string().optional(),
  referer: z.string().optional(),
  xFbUplSessionId: z.string().optional(),
  xBhFlowSessionId: z.string().optional(),
  platformTrustToken: z.string().optional(),
  e2eeNumber: z.string().optional(),
  e2eeCsc: z.string().optional(),
  adAccountId: z.string().optional(),
  usePrimaryAdAccount: z.boolean().optional(),
  // New fields for account update & wizard
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  paymentAccountID: z.string().optional(),
  updateAccountDocId: z.string().optional(),
  updateAccountVariables: z.record(z.string(), z.any()).optional(),
}).optional();

function toMongoIds(ids: string[]): any[] {
  return ids.map((id) => {
    try { return new ObjectId(id); } catch { return id as any; }
  });
}

const enqueueJobSchema = z.object({
  cookieIds: z.array(z.string()),
  cardIds: z.array(z.string()),
  proxyConfigs: z.array(z.object({
    type: z.enum(['http', 'https', 'socks5']),
    host: z.string(),
    port: z.number(),
    username: z.string().optional(),
    password: z.string().optional(),
    country: z.string().optional()
  })).optional(),
  maxConcurrent: z.number().min(1).max(50).default(10),
  retryAttempts: z.number().min(1).max(5).default(3),
  preferences: preferencesSchema,
  preferencesByCookieId: z.record(z.string(), preferencesSchema.unwrap()).optional(),
});

export async function jobRoutes(app: any) {
  app.get('/api/jobs/events', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('\n');

    const send = (payload: any) => {
      try {
        reply.raw.write(`event: progress\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    };

    // Heartbeat to keep connection alive behind proxies
    const heartbeat = setInterval(() => {
      try { reply.raw.write(`:\n\n`); } catch {}
    }, 25000);

    // Always listen to local progress events for fine-grained step updates
    const onLocal = (evt: any) => send(evt);
    onProgress(onLocal);

    // Also forward queue progress events when Redis is enabled
    let removeQueueListener: (() => void) | null = null;
    if (env.ENABLE_REDIS) {
      const events = getQueueEvents();
      const onQ = (data: any) => send({ jobId: data.jobId || data.id || null, progress: data.progress, status: 'progress' });
      (events as any).on('progress', onQ);
      removeQueueListener = () => { try { (events as any).off('progress', onQ); } catch {} };
    }

    req.raw.on('close', () => {
      if (removeQueueListener) removeQueueListener();
      offProgress(onLocal);
      clearInterval(heartbeat);
    });
  });

  app.post('/api/jobs/enqueue', { 
    preHandler: requireRole('operator'),
    schema: {
      body: {
        type: 'object',
        properties: {
          cookieIds: { type: 'array', items: { type: 'string' } },
          cardIds: { type: 'array', items: { type: 'string' } },
          proxyConfigs: { 
            type: 'array', 
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['http', 'https', 'socks5'] },
                host: { type: 'string' },
                port: { type: 'number' },
                username: { type: 'string' },
                password: { type: 'string' },
                country: { type: 'string' }
              },
              required: ['type', 'host', 'port']
            }
          },
          maxConcurrent: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          retryAttempts: { type: 'number', minimum: 1, maximum: 5, default: 3 },
          preferences: { type: 'object' },
          preferencesByCookieId: { type: 'object' },
        },
        required: ['cookieIds', 'cardIds']
      }
    }
  }, async (req: any) => {
    const body = enqueueJobSchema.parse(req.body);
    const db = await getDb();
    
    const cookieObjectIds = body.cookieIds.map((id) => new ObjectId(id));
    const cardObjectIds = body.cardIds.map((id) => new ObjectId(id));

    const cookies = await db.collection('cookies').find({
      _id: { $in: cookieObjectIds }
    }).toArray();
    
    const cards = await db.collection('cards').find({
      _id: { $in: cardObjectIds }
    }).toArray();
    
    if (cookies.length === 0 || cards.length === 0) {
      return { error: 'No cookies or cards found' };
    }

    const decodeCookie = (doc: any) => {
      try { return typeof doc?.payload === 'string' ? decryptJson<any>(doc.payload) : doc?.payload; } catch { return null; }
    };

    const pairs = Math.min(cookies.length, cards.length);
    let enqueued = 0;
    let skipped = 0;
    const jobs: Array<{ cookieId: string; jobId: string }> = [];
    const prefMap = body.preferencesByCookieId || {};
    
    for (let i = 0; i < pairs; i++) {
      const cookie = cookies[i];
      const card = cards[i];
      if (!cookie || !card) continue;
      const proxyConfig = body.proxyConfigs?.[i % (body.proxyConfigs?.length || 1)];

      const globalPrefs = body.preferences || {};
      const cookieIdStr = cookie._id.toString();
      const perCookie = (prefMap as any)[cookieIdStr] || {};
      const mergedPrefs = { ...globalPrefs, ...perCookie };

      const inlineCookiePayload = decodeCookie(cookie);
      if (!inlineCookiePayload || !inlineCookiePayload.c_user || !inlineCookiePayload.xs) { skipped++; continue; }

      if (env.ENABLE_REDIS) {
        try {
          const job = await enqueueAddCardJob({ 
            cookieId: cookieIdStr,
            cardId: card._id.toString(),
            proxyConfig,
            maxConcurrent: body.maxConcurrent,
            retryAttempts: body.retryAttempts,
            preferences: mergedPrefs,
            inlineCookiePayload,
          } as any, {
            attempts: body.retryAttempts,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 50
          });
          jobs.push({ cookieId: cookieIdStr, jobId: String((job as any).id) });
          enqueued++;
        } catch (e: any) {
          const fallbackId = `${Date.now()}_${i}`;
          emitProgress({ jobId: fallbackId, progress: 0, status: 'waiting' });
          try {
            await runJob({ cookieId: cookieIdStr, cardId: card._id.toString(), proxyConfig, preferences: mergedPrefs, inlineCookiePayload } as any, { id: fallbackId } as any);
            emitProgress({ jobId: fallbackId, progress: 100, status: 'completed' });
          } catch (err: any) {
            emitProgress({ jobId: fallbackId, progress: -1, status: 'failed', message: err?.message || 'failed' });
          }
          jobs.push({ cookieId: cookieIdStr, jobId: fallbackId });
          enqueued++;
        }
      } else {
        const fakeJobId = `${Date.now()}_${i}`;
        emitProgress({ jobId: fakeJobId, progress: 0, status: 'waiting' });
        try {
          await runJob({ cookieId: cookieIdStr, cardId: card._id.toString(), proxyConfig, preferences: mergedPrefs, inlineCookiePayload } as any, { id: fakeJobId } as any);
          emitProgress({ jobId: fakeJobId, progress: 100, status: 'completed' });
        } catch (e: any) {
          emitProgress({ jobId: fakeJobId, progress: -1, status: 'failed', message: e?.message || 'failed' });
        }
        jobs.push({ cookieId: cookieIdStr, jobId: fakeJobId });
        enqueued++;
      }
    }
    
    return { 
      enqueued,
      skipped,
      totalCookies: cookies.length,
      totalCards: cards.length,
      maxConcurrent: body.maxConcurrent,
      jobs,
    };
  });

  app.post('/api/jobs/enqueue-mapped', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const schema = z.object({
      batchId: z.string().min(6),
      cookieIds: z.array(z.string()).min(1),
      serverIds: z.array(z.string()).optional(),
      rateLimitPerServer: z.number().min(1).max(100).optional(),
      healthCheck: z.boolean().optional(),
      preferences: preferencesSchema,
      preferencesByCookieId: z.record(z.string(), preferencesSchema.unwrap()).optional(),
    });
    const body = schema.parse(req.body || {});

    const db = await getDb();
    const batch = await db.collection('temp_batches').findOne({ batchId: body.batchId });
    if (!batch || !Array.isArray(batch.items) || batch.items.length === 0) {
      return reply.code(400).send({ error: 'Invalid or empty batch' });
    }

    const cookieObjectIds = body.cookieIds.map((id: string) => new ObjectId(id));
    const cookies = await db.collection('cookies').find({
      _id: { $in: cookieObjectIds }
    }).toArray();
    if (cookies.length === 0) return reply.code(400).send({ error: 'No cookies found' });

    const decodeCookie = (doc: any) => {
      try { return typeof doc?.payload === 'string' ? decryptJson<any>(doc.payload) : doc?.payload; } catch { return null; }
    };

    const count = Math.min(cookies.length, batch.items.length);
    const jobs: Array<{ cookieId: string; jobId: string }> = [];
    const serverIds = body.serverIds || [];
    const globalPrefs = body.preferences || {};
    const prefMap = body.preferencesByCookieId || {};

    let skipped = 0;

    for (let i = 0; i < count; i++) {
      const cookie = cookies[i];
      const item = batch.items[i];
      if (!cookie || !item) continue;

      console.info(`[enqueue-mapped] ${i+1}/${count} -> preparing inline card & job`);

      const cookiePayload = decodeCookie(cookie);
      if (!cookiePayload || !cookiePayload.c_user || !cookiePayload.xs) { skipped++; continue; }

      const cardPayload = {
        number: String(item.number || ''),
        exp_month: String(item.exp_month || ''),
        exp_year: String(item.exp_year || ''),
        cvv: String(item.cvv || ''),
        country: String(item.country || 'US'),
        cardholder_name: String(item.cardholder_name || 'Card Holder'),
      } as any;

      const cookieIdStr = cookie._id.toString();
      const perCookie = (prefMap as any)[cookieIdStr] || {};
      const mergedPrefs = { ...globalPrefs, ...perCookie };

      const serverId = serverIds.length > 0 ? serverIds[i % serverIds.length] : undefined;

      if (env.ENABLE_REDIS) {
        console.info(`[enqueue-mapped] enqueue job (inline) -> cookie ${cookieIdStr}`);
        try {
          const job = await enqueueAddCardJob({ cookieId: cookieIdStr, inlineCardPayload: cardPayload, inlineCookiePayload: cookiePayload, serverId, retryAttempts: 3, preferences: mergedPrefs } as any);
          jobs.push({ cookieId: cookieIdStr, jobId: String(job.id) });
        } catch (e: any) {
          const fakeJobId = `${Date.now()}_${i}`;
          console.info(`[enqueue-mapped] fallback inline start -> job ${fakeJobId}`);
          emitProgress({ jobId: fakeJobId, progress: 0, status: 'waiting' });
          try {
            await runJob({ cookieId: cookieIdStr, inlineCardPayload: cardPayload, inlineCookiePayload: cookiePayload, serverId, preferences: mergedPrefs } as any, { id: fakeJobId } as any);
            emitProgress({ jobId: fakeJobId, progress: 100, status: 'completed' });
          } catch (err: any) {
            emitProgress({ jobId: fakeJobId, progress: -1, status: 'failed', message: err?.message || 'failed' });
          }
          jobs.push({ cookieId: cookieIdStr, jobId: fakeJobId });
        }
      } else {
        const fakeJobId = `${Date.now()}_${i}`;
        console.info(`[enqueue-mapped] inline start -> job ${fakeJobId}`);
        emitProgress({ jobId: fakeJobId, progress: 0, status: 'waiting' });
        try {
          await runJob({ cookieId: cookieIdStr, inlineCardPayload: cardPayload, inlineCookiePayload: cookiePayload, serverId, preferences: mergedPrefs } as any, { id: fakeJobId } as any);
          emitProgress({ jobId: fakeJobId, progress: 100, status: 'completed' });
          console.info(`[enqueue-mapped] inline done -> job ${fakeJobId}`);
          jobs.push({ cookieId: cookieIdStr, jobId: fakeJobId });
        } catch (e: any) {
          emitProgress({ jobId: fakeJobId, progress: -1, status: 'failed', message: e?.message || 'failed' });
          console.error(`[enqueue-mapped] inline failed -> job ${fakeJobId}:`, e instanceof Error ? e.message : String(e));
          jobs.push({ cookieId: cookieIdStr, jobId: fakeJobId });
        }
      }
    }

    return reply.send({ enqueued: jobs.length, skipped, jobs });
  });

  app.post('/api/jobs/enqueue-simple', { 
    preHandler: requireRole('operator') 
  }, async (req: any) => {
    const db = await getDb();
    const body = (req.body || {}) as { serverId?: string };
    const serverId = typeof body.serverId === 'string' ? body.serverId : undefined;

    const cookies = await db.collection('cookies').find().toArray();
    const cards = await db.collection('cards').find().toArray();
    
    const pairs = Math.min(cookies.length, cards.length);
    let enqueued = 0;
    
    for (let i = 0; i < pairs; i++) {
      const cookie = cookies[i];
      const card = cards[i];
      
      if (!cookie || !card) continue;
      
      await enqueueAddCardJob({ 
        cookieId: cookie._id.toString(), 
        cardId: card._id.toString(),
        serverId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      });
      
      enqueued++;
    }
    
    return { enqueued };
  });

  app.get('/api/jobs/results', { 
    preHandler: requireRole('operator'),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 200 },
          success: { type: 'string', enum: ['true', 'false', 'all'] },
          country: { type: 'string' },
          page: { type: 'number', minimum: 1, default: 1 }
        }
      }
    }
  }, async (req: any) => {
    const { limit, success, country, page } = req.query;
    const db = await getDb();
    
    let filter: any = {};
    
    if (success === 'true') filter.success = true;
    else if (success === 'false') filter.success = false;
    
    if (country) filter.country = country;
    
    const skip = (page - 1) * limit;
    
    const items = await db.collection('job_results')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    const total = await db.collection('job_results').countDocuments(filter);
    
    return { 
      items, 
      total, 
      page, 
      limit, 
      totalPages: Math.ceil(total / limit) 
    };
  });

  app.get('/api/jobs/status', { 
    preHandler: requireRole('operator') 
  }, async () => {
    const db = await getDb();
    
    const [pending, processing, completed, failed] = await Promise.all([
      db.collection('job_results').countDocuments({ success: null }),
      db.collection('job_results').countDocuments({ success: { $exists: false } }),
      db.collection('job_results').countDocuments({ success: true }),
      db.collection('job_results').countDocuments({ success: false })
    ]);
    
    return {
      pending,
      processing,
      completed,
      failed,
      total: pending + processing + completed + failed
    };
  });

  app.delete('/api/jobs/clear-completed', { 
    preHandler: requireRole('admin') 
  }, async () => {
    const db = await getDb();
    
    const result = await db.collection('job_results').deleteMany({
      success: { $in: [true, false] }
    });
    
    return { deleted: result.deletedCount };
  });

  // إضافة مسار لعرض اللوجز
  app.get('/api/jobs/logs', { preHandler: requireRole('operator') }, async (req: any) => {
    const { serverId, success, limit = 100, page = 1 } = req.query || {};
    const db = await getDb();
    const filter: any = {};
    if (serverId) filter.serverId = serverId;
    if (success === 'true') filter.success = true;
    else if (success === 'false') filter.success = false;
    const skip = (Number(page) - 1) * Number(limit);
    const items = await db.collection('job_results')
      .find(filter)
      .project({ response: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();
    const total = await db.collection('job_results').countDocuments(filter);
    return { items, total, page: Number(page), limit: Number(limit) };
  });

  // Queue management routes
  app.get('/api/queue/stats', { 
    preHandler: requireRole('operator') 
  }, async () => {
    return await getQueueStats();
  });

  app.post('/api/queue/pause', { 
    preHandler: requireRole('admin') 
  }, async () => {
    return await pauseQueue();
  });

  app.post('/api/queue/resume', { 
    preHandler: requireRole('admin') 
  }, async () => {
    return await resumeQueue();
  });

  app.delete('/api/queue/clear', { 
    preHandler: requireRole('admin') 
  }, async () => {
    return await clearQueue();
  });

  app.get('/api/queue/job/:id', { 
    preHandler: requireRole('operator'),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async (req: any) => {
    const { id } = req.params;
    const jobDetails = await getJobDetails(id);
    
    if (!jobDetails) {
      return { error: 'Job not found' };
    }
    
    return jobDetails;
  });
} 