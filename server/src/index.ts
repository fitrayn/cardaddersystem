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

const app = (createFastify as any)({ logger: true });

app.register(helmet);
app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});
app.register(cookie);
app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

app.get('/health', async () => ({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  version: '1.0.0',
  environment: env.NODE_ENV
}));

// Initialize database connection
app.addHook('onReady', async () => {
  try {
    await connectToDatabase();
    app.log.info('✅ Database connected successfully');
  } catch (error) {
    app.log.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
});

app.register(authRoutes);
app.register(uploadRoutes);
app.register(jobRoutes);
app.register(statsRoutes);

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`Server listening on ${env.PORT}`);
  })
  .catch((err: unknown) => {
    app.log.error(err as any);
    process.exit(1);
  }); 