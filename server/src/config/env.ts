import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().optional().default('redis://127.0.0.1:6379'),
  JWT_SECRET: z.string().min(16),
  AES_KEY_BASE64: z.string().min(1),
  AES_IV_BASE64: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
});

export type Env = z.infer<typeof schema>;

export const env: Env = schema.parse(process.env); 