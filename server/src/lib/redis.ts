import Redis from 'ioredis';
import { env } from '../config/env';

let redis: any = null;

export function getRedis(): any {
  if (redis) return redis;

  if (!env.REDIS_URL) {
    console.warn('[redis] REDIS_URL not set. Using mock queue (no Redis connection).');
    // Minimal mock compatible with bullmq usage in queue.ts
    return {
      // ioredis-like signatures used by bullmq
      status: 'mock',
    } as any;
  }

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  return redis;
} 