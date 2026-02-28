import { z } from 'zod';
import 'dotenv/config';

// Transform empty strings to undefined so optional fields work with Docker env defaults
const emptyToUndefined = z
  .string()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const optionalUrl = emptyToUndefined.pipe(z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis (for BullMQ)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Session / JWT (fallback local auth)
  SESSION_SECRET: z.string().min(32),

  // OIDC (Authentik) — all optional; leave blank to use local auth only
  OIDC_ISSUER: optionalUrl,
  OIDC_CLIENT_ID: emptyToUndefined,
  OIDC_CLIENT_SECRET: emptyToUndefined,
  OIDC_REDIRECT_URI: optionalUrl,

  // Local auth fallback
  LOCAL_AUTH_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3100'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
