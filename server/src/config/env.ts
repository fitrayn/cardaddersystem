import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  AES_KEY_BASE64: z.string().min(1),
  AES_IV_BASE64: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  // Facebook session/config
  FB_DOC_ID: z.string().optional(),
  FB_USER_AGENT: z.string().optional().default('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'),
  FB_ACCEPT_LANGUAGE: z.string().optional().default('en-US,en;q=0.9'),
  ASBD_ID: z.string().optional().default('129477'),
  ENABLE_REDIS: z.coerce.boolean().optional().default(false),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env); 