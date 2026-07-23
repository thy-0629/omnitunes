import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  AUTH_TOKEN: z.string().min(8).default('change-me-in-production'),
  CORS_ORIGIN: z.string().default('*'),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail-fast on misconfiguration
  // eslint-disable-next-line no-console
  console.error('[config] invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type AppConfig = typeof config;
