import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserToken = { id: string; role: 'admin' | 'user' };

export function signToken(payload: UserToken): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export async function requireAuth(request: any, reply: any) {
  const auth = request.headers?.authorization ?? '';
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return reply.code(401).send({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as UserToken;
    request.user = decoded;
  } catch (e) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(role: 'admin' | 'user' | 'operator') {
  return async (request: any, reply: any) => {
    await requireAuth(request, reply);
    const user = request.user as UserToken | undefined;
    if (!user) return; // already handled
    
    // Check role permissions
    if (role === 'admin' && user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden: Admin access required' });
    }
    if (role === 'operator' && user.role !== 'admin' && user.role !== 'operator') {
      return reply.code(403).send({ error: 'Forbidden: Operator access required' });
    }
    
    return; // Allow the request to continue
  };
} 