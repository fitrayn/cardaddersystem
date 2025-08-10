import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getDb } from '../../lib/mongo';
import { requireAuth } from '../../middleware/auth';

function luhnCheckDigit(numberWithoutCheck: string): string {
  const digits = numberWithoutCheck.split('').map((d) => parseInt(d, 10));
  // Double every second digit from right (excluding rightmost)
  for (let i = digits.length - 2; i >= 0; i -= 2) {
    const val = digits[i] ?? 0;
    const doubled = val * 2;
    digits[i] = doubled > 9 ? (doubled - 9) : doubled;
  }
  const sum = digits.reduce((a, b) => a + b, 0);
  const mod = sum % 10;
  return String((10 - mod) % 10);
}

function generateCardNumberFromBin(bin: string, length: number = 16): string {
  const cleanBin = (bin || '').replace(/\D/g, '').slice(0, 6);
  const effectiveLen = Math.max(7, Math.min(19, length));
  let middle = '';
  const toFill = Math.max(0, (effectiveLen - 1 - cleanBin.length));
  for (let i = 0; i < toFill; i++) {
    middle += Math.floor(Math.random() * 10).toString();
  }
  const partial = cleanBin + middle;
  const check = luhnCheckDigit(partial);
  return partial + check;
}

function pickExpiry(expStart?: string, expEnd?: string): { exp_month: string; exp_year: string } {
  try {
    if (expStart && expEnd && /^\d{4}-\d{2}$/.test(expStart) && /^\d{4}-\d{2}$/.test(expEnd)) {
      const [ysStr, msStr] = expStart.split('-');
      const [yeStr, meStr] = expEnd.split('-');
      const ys = parseInt(ysStr || '0', 10);
      const ms = parseInt(msStr || '1', 10);
      const ye = parseInt(yeStr || '0', 10);
      const me = parseInt(meStr || '1', 10);
      if (Number.isFinite(ys) && Number.isFinite(ms) && Number.isFinite(ye) && Number.isFinite(me)) {
        const start = new Date(ys, ms - 1, 1).getTime();
        const end = new Date(ye, me - 1, 1).getTime();
        if (isFinite(start) && isFinite(end) && end >= start) {
          const ts = start + Math.floor(Math.random() * (end - start + 1));
          const d = new Date(ts);
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const y = String(d.getFullYear());
          return { exp_month: m, exp_year: y };
        }
      }
    }
  } catch {}
  const now = new Date();
  const monthsToAdd = 12 + Math.floor(Math.random() * 24);
  const d = new Date(now.getFullYear(), now.getMonth() + monthsToAdd, 1);
  return { exp_month: String(d.getMonth() + 1).padStart(2, '0'), exp_year: String(d.getFullYear()) };
}

function randomCvv(): string {
  return String(100 + Math.floor(Math.random() * 900));
}

export async function cardsRoutes(app: any) {
  const generateSchema = z.object({
    bin: z.string().min(6).max(12),
    quantity: z.number().min(1).max(1000),
    country: z.string().default('US'),
    expStart: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    expEnd: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  });

  app.post('/api/cards/generate-temp', { preHandler: requireAuth }, async (req: any, reply: any) => {
    const body = generateSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: body.error.issues });
    }
    const { bin, quantity, country, expStart, expEnd } = body.data;
    const items: Array<any> = [];
    for (let i = 0; i < quantity; i++) {
      const number = generateCardNumberFromBin(bin);
      const { exp_month, exp_year } = pickExpiry(expStart, expEnd);
      const cvv = randomCvv();
      items.push({
        number,
        exp_month,
        exp_year,
        cvv,
        country,
        cardholder_name: 'Card Holder',
      });
    }

    const batchId = nanoid(12);
    const db = await getDb();
    await db.collection('temp_batches').insertOne({
      batchId,
      createdAt: new Date(),
      params: { bin, quantity, country, expStart, expEnd },
      items,
    });

    const preview = items.slice(0, Math.min(10, items.length)).map((it) => ({
      last4: String(it.number).slice(-4),
      exp_month: it.exp_month,
      exp_year: it.exp_year,
      cardholder_name: it.cardholder_name,
    }));

    return reply.send({ batchId, count: items.length, preview });
  });
} 