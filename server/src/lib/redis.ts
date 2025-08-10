import Redis from 'ioredis';
import { env } from '../config/env';

let redis: any = null;

export function getRedis(): any {
  if (redis) return redis;

  const rawUrl = env.REDIS_URL;
  if (!rawUrl) {
    console.warn('[redis] REDIS_URL not set. Using mock queue (no Redis connection).');
    return { status: 'mock' } as any;
  }

  // Ensure TLS for Upstash or any remote provider requiring TLS
  let url = rawUrl;
  const needsTls = /upstash\.io/.test(url) || url.startsWith('rediss://');
  if (/upstash\.io/.test(url) && url.startsWith('redis://')) {
    url = url.replace(/^redis:\/\//, 'rediss://');
  }

  redis = new Redis(url, {
    // Avoid lazy connect; establish connection upfront and auto-retry
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => Math.min(times * 1000, 5000),
    enableOfflineQueue: true,
    autoResubscribe: true,
    autoResendUnfulfilledCommands: true,
    ...(needsTls ? { tls: {} } : {}),
  } as any);

  redis.on('error', (err: any) => {
    console.warn('[redis] connection error:', err?.code || err?.message || String(err));
  });
  redis.on('end', () => {
    console.warn('[redis] connection ended');
  });
  redis.on('close', () => {
    console.warn('[redis] connection closed');
  });

  return redis;
} 