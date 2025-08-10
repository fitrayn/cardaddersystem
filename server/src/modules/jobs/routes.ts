import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { enqueueAddCardJob, getQueueStats, pauseQueue, resumeQueue, clearQueue, getJobDetails } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { z } from 'zod';
import { getRedis } from '../../lib/redis';

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
  retryAttempts: z.number().min(1).max(5).default(3)
});

export async function jobRoutes(app: any) {
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
          retryAttempts: { type: 'number', minimum: 1, maximum: 5, default: 3 }
        },
        required: ['cookieIds', 'cardIds']
      }
    }
  }, async (req: any) => {
    const body = enqueueJobSchema.parse(req.body);
    const db = await getDb();
    
    // Get cookies and cards
    const cookies = await db.collection('cookies').find({
      _id: { $in: body.cookieIds.map(id => (id as any)) }
    }).toArray();
    
    const cards = await db.collection('cards').find({
      _id: { $in: body.cardIds.map(id => (id as any)) }
    }).toArray();
    
    if (cookies.length === 0 || cards.length === 0) {
      return { error: 'No cookies or cards found' };
    }

    // Create job pairs
    const pairs = Math.min(cookies.length, cards.length);
    let enqueued = 0;
    
    for (let i = 0; i < pairs; i++) {
      const cookie = cookies[i];
      const card = cards[i];
      
      if (!cookie || !card) continue;
      
      // Get proxy config for this job (if available)
      const proxyConfig = body.proxyConfigs?.[i % (body.proxyConfigs?.length || 1)];
      
      const jobData = {
        cookieId: cookie._id.toString(),
        cardId: card._id.toString(),
        proxyConfig,
        maxConcurrent: body.maxConcurrent,
        retryAttempts: body.retryAttempts
      };
      
      await enqueueAddCardJob(jobData, {
        attempts: body.retryAttempts,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50
      });
      
      enqueued++;
    }
    
    return { 
      enqueued,
      totalCookies: cookies.length,
      totalCards: cards.length,
      maxConcurrent: body.maxConcurrent
    };
  });

  app.post('/api/jobs/enqueue-simple', { 
    preHandler: requireRole('operator') 
  }, async (req: any, reply: any) => {
    try {
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
    } catch (err: any) {
      const message = (err?.message || '').toLowerCase();
      if (message.includes('closed') || message.includes('redis')) {
        return reply.code(503).send({ error: 'Queue unavailable', message: err?.message || 'Redis connection issue' });
      }
      return reply.code(500).send({ error: 'Internal Server Error', message: err?.message || 'Unknown error' });
    }
  });

  // Generate temporary cards (not stored in DB) and store in Redis with TTL
  app.post('/api/cards/generate-temp', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const body = (req.body || {}) as { bin: string; quantity: number; country?: string; expStart?: string; expEnd?: string };
    const bin = String(body.bin || '').replace(/\D/g, '').slice(0, 8);
    const quantity = Math.max(1, Math.min(Number(body.quantity || 0), 10000));
    if (bin.length < 6) return reply.code(400).send({ error: 'Invalid BIN' });
    if (!quantity) return reply.code(400).send({ error: 'Invalid quantity' });

    function luhnCheck(num: string) {
      let sum = 0, alt = false;
      for (let i = num.length - 1; i >= 0; i--) {
        let n = parseInt(num.charAt(i), 10);
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n; alt = !alt;
      }
      return sum % 10 === 0;
    }
    function randomDigits(n: number) { return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join(''); }

    const cards: any[] = [];
    const now = new Date();
    const start = body.expStart ? new Date(body.expStart + '-01') : new Date(now.getFullYear() + 1, 0, 1);
    const end = body.expEnd ? new Date(body.expEnd + '-01') : new Date(now.getFullYear() + 4, 11, 1);

    for (let i = 0; i < quantity; i++) {
      // generate PAN with BIN + random and fix with Luhn
      let pan = bin + randomDigits(Math.max(12 - bin.length, 0));
      // adjust last digit to satisfy luhn if needed by brute force last digit 0-9
      let panCandidate = pan + '0';
      for (let d = 0; d <= 9; d++) {
        panCandidate = pan + String(d);
        if (luhnCheck(panCandidate)) break;
      }
      const dm = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
      const exp_month = String(dm.getMonth() + 1).padStart(2, '0');
      const exp_year = String(dm.getFullYear());
      const cvv = randomDigits(3);
      const cardholder_name = 'Card Holder ' + (i + 1);
      cards.push({ number: panCandidate, exp_month, exp_year, cvv, country: body.country || 'US', cardholder_name });
    }

    const batchId = 'batch_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const redis = getRedis();
    try {
      if ((redis as any)?.status === 'mock') {
        // fallback to in-memory on single instance
        (global as any).__TEMP_CARDS__ = (global as any).__TEMP_CARDS__ || new Map<string, any>();
        (global as any).__TEMP_CARDS__.set(batchId, cards);
      } else {
        await (redis as any).setex(`temp:cards:${batchId}`, 600, JSON.stringify(cards));
      }
    } catch (e) {
      return reply.code(500).send({ error: 'Failed to store temporary cards' });
    }

    const preview = cards.slice(0, 5000).map((c: any) => ({
      last4: String(c.number).slice(-4),
      exp_month: c.exp_month,
      exp_year: c.exp_year,
      cardholder_name: c.cardholder_name
    }));

    return { batchId, count: cards.length, preview };
  });

  // Enqueue mapped jobs using a temp batch: one card per cookie in order, round-robin servers
  app.post('/api/jobs/enqueue-mapped', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const body = (req.body || {}) as { batchId: string; cookieIds: string[]; serverIds: string[] };
    const { batchId, cookieIds = [], serverIds = [] } = body;
    if (!batchId || !Array.isArray(cookieIds) || cookieIds.length === 0) {
      return reply.code(400).send({ error: 'batchId and cookieIds required' });
    }
    const redis = getRedis();
    let cards: any[] | null = null;
    try {
      if ((redis as any)?.status === 'mock') {
        const map = (global as any).__TEMP_CARDS__ as Map<string, any> | undefined;
        cards = map?.get(batchId) || null;
      } else {
        const raw = await (redis as any).get(`temp:cards:${batchId}`);
        cards = raw ? JSON.parse(raw) : null;
      }
    } catch {
      cards = null;
    }
    if (!cards || cards.length === 0) return reply.code(400).send({ error: 'No cards for this batchId' });

    const jobs: { cookieId: string; jobId: string }[] = [];
    const servers = Array.isArray(serverIds) && serverIds.length > 0 ? serverIds : [undefined as any];

    const pairs = Math.min(cookieIds.length, cards.length);
    for (let i = 0; i < pairs; i++) {
      const cookieId = String(cookieIds[i]);
      const card = cards[i];
      const serverId = servers[i % servers.length];
      const job = await enqueueAddCardJob({
        cookieId,
        cardData: card,
        serverId,
      });
      jobs.push({ cookieId, jobId: String((job as any).id || '') });
    }

    return { enqueued: jobs.length, jobs };
  });

  // Fetch progress for a list of jobIds
  app.post('/api/jobs/progress', { preHandler: requireRole('operator') }, async (req: any) => {
    const body = (req.body || {}) as { jobIds: string[] };
    const jobIds = Array.isArray(body.jobIds) ? body.jobIds : [];
    const results: Record<string, any> = {};
    for (const id of jobIds) {
      const info = await getJobDetails(id);
      results[id] = info ? { progress: info.progress, status: info.status } : null;
    }
    return { results };
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