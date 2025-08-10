import Redis from 'ioredis';
import { env } from '../config/env';

let redis: any = null;

export function getRedis(): any {
  if (redis) return redis;

  if (!env.ENABLE_REDIS) {
    console.warn('[redis] Disabled by ENABLE_REDIS=false. Using mock.');
    return { status: 'mock' } as any;
  }

  // Prefer REDIS_URL; fallback to Upstash REST credentials if present
  let url = env.REDIS_URL;
  if (!url && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const u = new URL(env.UPSTASH_REDIS_REST_URL);
      // Upstash REST cannot be used by ioredis; attempt to synthesize rediss URL if hostname/port matches
      // Example: https://<host> => rediss://<host>:6379
      const host = u.host; // includes hostname[:port]
      const [hostname, portMaybe] = host.split(':');
      const port = portMaybe || '6379';
      // Upstash typically requires a password (token). Use it in URL userinfo
      url = `rediss://default:${encodeURIComponent(env.UPSTASH_REDIS_REST_TOKEN)}@${hostname}:${port}`;
      console.info('[redis] Synthesized REDIS_URL from Upstash REST env');
    } catch (e) {
      console.warn('[redis] Failed to synthesize REDIS_URL from Upstash env; using mock');
      return { status: 'mock' } as any;
    }
  }

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