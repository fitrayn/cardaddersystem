import { FastifyInstance } from 'fastify';
import { ServerService } from './service';
import { requireAuth } from '../../middleware/auth';
import { getDb } from '../../lib/mongo';

export async function serverRoutes(fastify: any) {
  // الحصول على جميع السيرفرات للمستخدم
  fastify.get('/api/servers', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const servers = await ServerService.getServersByUserId(userId);
        
        return reply.send({
          success: true,
          data: servers,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في جلب السيرفرات',
        });
      }
    },
  });

  // الحصول على سيرفر واحد
  fastify.get('/api/servers/:id', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const { id } = request.params as { id: string };
        
        const server = await ServerService.getServerById(id, userId);
        
        if (!server) {
          return reply.status(404).send({
            success: false,
            error: 'السيرفر غير موجود',
          });
        }
        
        return reply.send({
          success: true,
          data: server,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في جلب السيرفر',
        });
      }
    },
  });

  // إنشاء سيرفر جديد
  fastify.post('/api/servers', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'apiUrl'],
        properties: {
          name: { type: 'string', minLength: 1 },
          apiUrl: { type: 'string', format: 'uri' },
          description: { type: 'string' },
          maxConcurrentJobs: { type: 'number', minimum: 1, maximum: 100 },
          settings: {
            type: 'object',
            properties: {
              timeout: { type: 'number', minimum: 1000, maximum: 300000 },
              retryAttempts: { type: 'number', minimum: 1, maximum: 10 },
              proxyEnabled: { type: 'boolean' },
              proxyConfig: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  port: { type: 'number' },
                  username: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const input = request.body as any;
        
        const server = await ServerService.createServer({
          ...input,
          userId,
        });
        
        return reply.status(201).send({
          success: true,
          data: server,
          message: 'تم إنشاء السيرفر بنجاح',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في إنشاء السيرفر',
        });
      }
    },
  });

  // تحديث سيرفر
  fastify.put('/api/servers/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          apiUrl: { type: 'string', format: 'uri' },
          description: { type: 'string' },
          isActive: { type: 'boolean' },
          maxConcurrentJobs: { type: 'number', minimum: 1, maximum: 100 },
          status: { type: 'string', enum: ['online', 'offline', 'maintenance'] },
          settings: {
            type: 'object',
            properties: {
              timeout: { type: 'number', minimum: 1000, maximum: 300000 },
              retryAttempts: { type: 'number', minimum: 1, maximum: 10 },
              proxyEnabled: { type: 'boolean' },
              proxyConfig: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  port: { type: 'number' },
                  username: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const { id } = request.params as { id: string };
        const input = request.body as any;
        
        const server = await ServerService.updateServer(id, userId, input);
        
        if (!server) {
          return reply.status(404).send({
            success: false,
            error: 'السيرفر غير موجود',
          });
        }
        
        return reply.send({
          success: true,
          data: server,
          message: 'تم تحديث السيرفر بنجاح',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في تحديث السيرفر',
        });
      }
    },
  });

  // حذف سيرفر
  fastify.delete('/api/servers/:id', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const { id } = request.params as { id: string };
        
        const deleted = await ServerService.deleteServer(id, userId);
        
        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: 'السيرفر غير موجود',
          });
        }
        
        return reply.send({
          success: true,
          message: 'تم حذف السيرفر بنجاح',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في حذف السيرفر',
        });
      }
    },
  });

  // تفعيل/إلغاء تفعيل سيرفر
  fastify.patch('/api/servers/:id/toggle', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const { id } = request.params as { id: string };
        
        const server = await ServerService.toggleServerStatus(id, userId);
        
        if (!server) {
          return reply.status(404).send({
            success: false,
            error: 'السيرفر غير موجود',
          });
        }
        
        return reply.send({
          success: true,
          data: server,
          message: `تم ${server.isActive ? 'تفعيل' : 'إلغاء تفعيل'} السيرفر بنجاح`,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في تغيير حالة السيرفر',
        });
      }
    },
  });

  // فحص صحة السيرفر
  fastify.post('/api/servers/:id/health-check', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const { id } = request.params as { id: string };
        
        const result = await ServerService.healthCheck(id);
        
        return reply.send({
          success: true,
          data: result,
          message: 'تم فحص صحة السيرفر بنجاح',
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في فحص صحة السيرفر',
        });
      }
    },
  });

  // الحصول على السيرفرات المتاحة
  fastify.get('/api/servers/available', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const servers = await ServerService.getAvailableServers(userId);
        
        return reply.send({
          success: true,
          data: servers,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في جلب السيرفرات المتاحة',
        });
      }
    },
  });

  // إحصائيات السيرفرات
  fastify.get('/api/servers/stats', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const stats = await ServerService.getServerStats(userId);
        
        return reply.send({
          success: true,
          data: stats,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: 'فشل في جلب إحصائيات السيرفرات',
        });
      }
    },
  });

  // سيرفرات مع النِسَب
  fastify.get('/api/servers/with-metrics', {
    preHandler: requireAuth,
    handler: async (request: any, reply: any) => {
      try {
        const userId = request.user.id;
        const servers = await ServerService.getServersByUserId(userId);
        const db = await getDb();
        const ids = servers.map(s => s._id?.toString()).filter(Boolean);

        let metrics: Record<string, { total: number; success: number }> = {};
        if (ids.length > 0) {
          const agg = await db.collection('job_results').aggregate([
            { $match: { serverId: { $in: ids } } },
            { $group: { _id: '$serverId', total: { $sum: 1 }, success: { $sum: { $cond: [{ $eq: ['$success', true] }, 1, 0] } } } }
          ]).toArray();
          metrics = Object.fromEntries(agg.map((x: any) => [x._id, { total: x.total, success: x.success }]));
        }

        const items = servers.map(s => {
          const m = metrics[s._id?.toString() || ''] || { total: 0, success: 0 };
          const successRate = m.total > 0 ? Math.round((m.success / m.total) * 100) : 0;
          return { ...s, successRate };
        });

        return reply.send({ success: true, data: items });
      } catch (error) {
        return reply.status(500).send({ success: false, error: 'فشل في جلب السيرفرات مع الإحصاءات' });
      }
    },
  });
} 