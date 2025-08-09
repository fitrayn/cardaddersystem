import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { getDb } from '../../lib/mongo';
import { encryptJson } from '../../lib/encryption';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { parse } from 'csv-parse/sync';

const cookieSchema = z.object({ c_user: z.string(), xs: z.string(), fr: z.string().optional(), datr: z.string().optional(), country: z.string().optional() });
const cardSchema = z.object({ number: z.string(), exp_month: z.string(), exp_year: z.string(), cvv: z.string(), country: z.string().optional(), currency: z.string().optional(), timezone: z.string().optional() });

export async function uploadRoutes(app: any) {
  app.register(multipart);

  app.post('/api/upload/cookies/json', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const body = req.body as any[];
    const items = z.array(cookieSchema).parse(body);
    const db = await getDb();
    const docs = items.map((i) => ({ payload: encryptJson(i), createdAt: new Date() }));
    await db.collection('cookies').insertMany(docs);
    return { inserted: docs.length };
  });

  app.post('/api/upload/cookies/csv', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        const records = parse(buf.toString('utf8'), { columns: true, skip_empty_lines: true });
        const items = z.array(cookieSchema).parse(records);
        const db = await getDb();
        const docs = items.map((i) => ({ payload: encryptJson(i), createdAt: new Date() }));
        await db.collection('cookies').insertMany(docs);
        return { inserted: docs.length };
      }
    }
    return reply.code(400).send({ error: 'No file' });
  });

  app.post('/api/upload/cards/csv', { preHandler: requireRole('operator') }, async (req: any, reply: any) => {
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === 'file') {
        const buf = await part.toBuffer();
        const records = parse(buf.toString('utf8'), { columns: true, skip_empty_lines: true });
        const items = z.array(cardSchema).parse(records);
        const db = await getDb();
        const docs = items.map((i) => ({ payload: encryptJson(i), createdAt: new Date() }));
        await db.collection('cards').insertMany(docs);
        return { inserted: docs.length };
      }
    }
    return reply.code(400).send({ error: 'No file' });
  });
} 