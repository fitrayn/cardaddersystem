import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UserService } from '../../lib/services/userService';
import { signToken, requireAuth } from '../../middleware/auth';

const signupSchema = z.object({ email: z.string().email(), password: z.string().min(8), role: z.enum(['admin', 'user', 'operator']).default('user') });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function authRoutes(app: any) {
  const userService = new UserService();

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
    return { token };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req: any, reply: any) => {
    try {
      const userId = req.user?.id as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const user = await userService.findUserById(userId);
      if (!user) return reply.code(404).send({ error: 'User not found' });
      return reply.send({ id: user._id?.toString() || userId, email: user.email, role: user.role });
    } catch (e) {
      return reply.code(500).send({ error: 'Failed to load profile' });
    }
  });
} 