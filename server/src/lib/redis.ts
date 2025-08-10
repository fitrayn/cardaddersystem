import Redis from 'ioredis';
import { env } from '../config/env';

let redis: any = null;

export function getRedis(): any {
  if (redis) return redis;

  if (!env.ENABLE_REDIS) {
    console.warn('[redis] Disabled by ENABLE_REDIS=false. Using mock.');
    return { status: 'mock' } as any;
  }

  const url = env.REDIS_URL;
  if (!url) {
    console.warn('[redis] REDIS_URL not set. Using mock queue (no Redis connection).');
    return { status: 'mock' } as any;
  }

  // Treat localhost URLs as absent in hosted environments
  if (/localhost|127\.0\.0\.1/.test(url)) {
    console.warn('[redis] Localhost URL detected; disabling Redis connection and using mock.');
    return { status: 'mock' } as any;
  }

  const isTls = url.startsWith('rediss://');
  redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: () => null, // do not retry endlessly
    enableOfflineQueue: false, // do not queue when offline
    autoResubscribe: false,
    autoResendUnfulfilledCommands: false,
    ...(isTls ? { tls: {} } : {}),
  } as any);

  // Soften error noise
  redis.on('error', (err: any) => {
    console.warn('[redis] connection error:', err?.code || err?.message || String(err));
  });

  return redis;
} 