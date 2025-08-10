import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserService } from '../../lib/services/userService';
import { signToken } from '../../middleware/auth';
import { env } from '../../config/env';

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), role: z.enum(['admin', 'user', 'operator']).default('user') });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function authRoutes(app: any) {
  const userService = new UserService();

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://elaborate-youtiao-1fc402.netlify.app',
    'https://cardaddersystem.netlify.app',
    'https://cardaddersystem.vercel.app',
  ];

  function setCors(reply: any, origin?: string) {
    const o = origin || '';
    const allow = !o || allowedOrigins.includes(o) || env.NODE_ENV === 'development';
    if (allow && o) {
      reply.header('Access-Control-Allow-Origin', o);
      reply.header('Vary', 'Origin');
    } else if (allow) {
      reply.header('Access-Control-Allow-Origin', '*');
    }
    reply.header('Access-Control-Allow-Credentials', 'true');
  }

  app.options('/api/auth/login', async (req: any, reply: any) => {
    const origin = (req.headers?.origin as string | undefined) || '';
    setCors(reply, origin);
    reply
      .header('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, Origin, Accept')
      .header('Access-Control-Max-Age', '86400')
      .code(204)
      .send();
  });

  app.post('/api/auth/signup', async (req: any, reply: any) => {
    const body = signupSchema.parse(req.body);
    
    // Check if user exists
    const existing = await userService.findUserByEmail(body.email);
    if (existing) return reply.code(409).send({ error: 'Email exists' });
    
    // Create new user
    const user = await userService.createUser({
      username: body.email.split('@')[0] ?? 'user', // Use email prefix as username
      email: body.email,
      password: body.password,
      role: body.role
    });
    
    const userId = user._id?.toString() ?? 'unknown';
    const token = signToken({ id: userId, role: user.role });
    setCors(reply, (req.headers?.origin as string | undefined));
    return { token };
  });

  app.post('/api/auth/login', async (req: any, reply: any) => {
    const body = loginSchema.parse(req.body);
    
    // Find user by email
    const user = await userService.findUserByEmail(body.email);
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });
    
    // Verify password
    const isValid = await userService.verifyPassword(user, body.password);
    if (!isValid) return reply.code(401).send({ error: 'Invalid credentials' });
    
    // Update last login
    if (user._id) {
      await userService.updateLastLogin(user._id.toString());
    }
    
    const userId = user._id?.toString() ?? 'unknown';
    const token = signToken({ id: userId, role: user.role });
    setCors(reply, (req.headers?.origin as string | undefined));
    return { token };
  });
} 