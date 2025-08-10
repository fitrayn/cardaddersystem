import 'dotenv/config';
import createFastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { env } from './config/env';
import { connectToDatabase } from './lib/database';
import { authRoutes } from './modules/auth/routes';
import { uploadRoutes } from './modules/uploads/routes';
import { jobRoutes } from './modules/jobs/routes';
import { statsRoutes } from './modules/stats/routes';
import { serverRoutes } from './modules/servers/routes';
import { cardsRoutes } from './modules/cards/routes';

const app = (createFastify as any)({ logger: true });

app.register(helmet);

// Accept empty JSON bodies to avoid FST_ERR_CTP_EMPTY_JSON_BODY
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req: any, body: string, done: any) => {
  if (!body) return done(null, {});
  try { done(null, JSON.parse(body)); } catch (err) { done(err as any); }
});

app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
app.register(cookie);

// Health endpoint
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  env: env.NODE_ENV,
}));

// Register routes BEFORE server starts
app.register(authRoutes);
app.register(uploadRoutes);
app.register(jobRoutes);
app.register(statsRoutes);
app.register(serverRoutes);
app.register(cardsRoutes);

async function start() {
  try {
    await connectToDatabase();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server listening on port ${env.PORT}`);
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start(); 