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

const app = (createFastify as any)({ logger: true });

app.register(helmet);
app.register(cors, {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return cb(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://elaborate-youtiao-1fc402.netlify.app',
      'https://cardaddersystem.netlify.app',
      'https://cardaddersystem.vercel.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    
    // In development, allow all origins
    if (env.NODE_ENV === 'development') {
      return cb(null, true);
    }
    
    return cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
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

// Handle preflight requests
app.options('*', async (request: any, reply: any) => {
  reply.header('Access-Control-Allow-Origin', request.headers.origin || '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Origin, Accept');
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.send();
});

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
app.register(serverRoutes);

app
  .listen({ port: env.PORT, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`Server listening on ${env.PORT}`);
  })
  .catch((err: unknown) => {
    app.log.error(err as any);
    process.exit(1);
  }); 