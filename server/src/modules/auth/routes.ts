import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../lib/mongo';
import bcrypt from 'bcrypt';
import { signToken } from '../../middleware/auth';

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), role: z.enum(['admin', 'operator']).default('operator') });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function authRoutes(app: any) {
  app.post('/api/auth/signup', async (req: any, reply: any) => {
    const body = signupSchema.parse(req.body);
    const db = await getDb();
    const existing = await db.collection('users').findOne({ email: body.email });
    if (existing) return reply.code(409).send({ error: 'Email exists' });
    const passwordHash = await bcrypt.hash(body.password, 10);
    const result = await db.collection('users').insertOne({ email: body.email, passwordHash, role: body.role });
    const token = signToken({ id: result.insertedId.toHexString(), role: body.role });
    return { token };
  });

  app.post('/api/auth/login', async (req: any, reply: any) => {
    const body = loginSchema.parse(req.body);
    const db = await getDb();
    const user = await db.collection('users').findOne<{ _id: any; passwordHash: string; role: 'admin' | 'operator' }>({ email: body.email });
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });
    const token = signToken({ id: user._id.toHexString(), role: user.role });
    return { token };
  });
} 