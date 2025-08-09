import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { enqueueAddCardJob, getQueueStats, pauseQueue, resumeQueue, clearQueue, getJobDetails } from '../../lib/queue';
import { getDb } from '../../lib/mongo';
import { z } from 'zod';

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
      body: enqueueJobSchema
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
  }, async (req: any) => {
    const db = await getDb();
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
        cardId: card._id.toString() 
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
      querystring: z.object({
        limit: z.coerce.number().min(1).max(1000).default(200),
        success: z.enum(['true', 'false', 'all']).optional(),
        country: z.string().optional(),
        page: z.coerce.number().min(1).default(1)
      })
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
      params: z.object({
        id: z.string()
      })
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