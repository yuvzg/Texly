import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

dotenv.config();

function defaultTexmfCnfPath(): string {
  const direct = path.resolve(process.cwd(), 'docker/texlive/texmf.cnf');
  if (fs.existsSync(direct)) return direct;
  const parent = path.resolve(process.cwd(), '../../docker/texlive/texmf.cnf');
  if (fs.existsSync(parent)) return parent;
  return direct;
}

const RunnerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  COMPILE_IMAGE: z.string().default('texly/texlive:dev'),
  COMPILE_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  COMPILE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  JOBS_ROOT_DIR: z.string().default('/tmp/texly-runner/jobs'),
  CACHE_ROOT_DIR: z.string().default('/tmp/texly-runner/cache/assets'),
  TEXMF_CNF_PATH: z.string().default(defaultTexmfCnfPath()),
  DOCKER_SOCKET_PATH: z.string().default('/var/run/docker.sock'),
  MIN_DISK_FREE_PERCENT: z.coerce.number().min(1).max(90).default(15),
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
