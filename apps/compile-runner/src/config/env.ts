import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const RunnerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  COMPILE_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
});

export type RunnerEnv = z.infer<typeof RunnerEnvSchema>;

export function loadRunnerEnv(): RunnerEnv {
  const result = RunnerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Invalid compile runner environment: ${errorDetails}`);
  }
  return result.data;
}

export const env = loadRunnerEnv();
