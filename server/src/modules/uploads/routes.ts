import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth';
import { getDb } from '../../lib/mongo';
import { encryptJson } from '../../lib/encryption';
import { z } from 'zod';
import multipart from '@fastify/multipart';
import { parse } from 'csv-parse/sync';
import { ObjectId } from 'mongodb';

const cookieSchema = z.object({ c_user: z.string(), xs: z.string(), fr: z.string().optional(), datr: z.string().optional(), country: z.string().optional() });
const cardSchema = z.object({ 
  number: z.string(), 
  exp_month: z.string(), 
  exp_year: z.string(), 
  cvv: z.string(), 
  country: z.string().optional()
});

export async function uploadRoutes(app: any) {
  app.register(multipart);

  app.post('/api/upload/cookies/json', { preHandler: requireAuth }, async (req: any, reply: any) => {
    try {
      const body = req.body as any[];
      if (!Array.isArray(body)) {
        return reply.code(400).send({ error: 'Request body must be an array' });
      }
      
      const items = z.array(cookieSchema).parse(body);
      const db = await getDb();
      
      // Ensure cookies collection exists
      const cookiesCollection = db.collection('cookies');
      
      const docs = items.map((i) => ({ 
        payload: encryptJson(i), 
        createdAt: new Date(),
        userId: new ObjectId('000000000000000000000000') // Default user ID
      }));
      
      await cookiesCollection.insertMany(docs);
      return { inserted: docs.length };
    } catch (error) {
      console.error('Error uploading cookies:', error);
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid cookie data format', details: error.issues });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/api/upload/cards/json', { preHandler: requireAuth }, async (req: any, reply: any) => {
    try {
      const body = req.body as any[];
      if (!Array.isArray(body)) {
        return reply.code(400).send({ error: 'Request body must be an array' });
      }
      
      const items = z.array(cardSchema).parse(body);
      const db = await getDb();
      
      // Ensure cards collection exists
      const cardsCollection = db.collection('cards');
      
      const docs = items.map((i) => ({ 
        payload: encryptJson(i), 
        createdAt: new Date(),
        userId: new ObjectId('000000000000000000000000') // Default user ID
      }));
      
      await cardsCollection.insertMany(docs);
      return { inserted: docs.length };
    } catch (error) {
      console.error('Error uploading cards:', error);
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid card data format', details: error.issues });
      }
      return reply.code(500).send({ error: 'Internal server error' });
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