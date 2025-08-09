import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { getDb } from '../../lib/mongo';

export async function statsRoutes(app: any) {
  app.get('/api/stats/summary', { preHandler: requireRole('operator') }, async () => {
    const db = await getDb();
    const totalCards = await db.collection('cards').countDocuments();
    const totalCookies = await db.collection('cookies').countDocuments();
    const totalJobs = await db.collection('job_results').countDocuments();
    const successes = await db.collection('job_results').countDocuments({ success: true });
    const successRate = totalJobs ? Math.round((successes / totalJobs) * 100) : 0;
    return { totalCards, totalCookies, totalJobs, successRate };
  });

  app.get('/api/stats/top-countries', { preHandler: requireRole('operator') }, async () => {
    const db = await getDb();
    const agg = await db.collection('job_results').aggregate([
      { $match: { country: { $ne: null } } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();
    return { items: agg.map((x) => ({ country: x._id as string, count: x.count as number })) };
  });

  app.get('/api/stats/common-errors', { preHandler: requireRole('operator') }, async () => {
    const db = await getDb();
    const agg = await db.collection('job_results').aggregate([
      { $match: { success: false } },
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray();
    return { items: agg.map((x) => ({ error: x._id as string, count: x.count as number })) };
  });
} 