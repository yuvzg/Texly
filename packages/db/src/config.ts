import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  url: z
    .string()
    .url()
    .default('postgresql://postgres:postgres@localhost:5432/texly_dev?schema=public'),
  maxConnections: z.number().int().positive().default(10),
  idleTimeoutMs: z.number().int().positive().default(10000),
  connectionTimeoutMs: z.number().int().positive().default(5000),
  statementTimeoutMs: z.number().int().positive().default(10000),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export function resolveDatabaseConfig(overrides?: Partial<DatabaseConfig>): DatabaseConfig {
  const envUrl = process.env.DATABASE_URL;
  return DatabaseConfigSchema.parse({
    url:
      overrides?.url ??
      envUrl ??
      'postgresql://postgres:postgres@localhost:5432/texly_dev?schema=public',
    maxConnections:
      overrides?.maxConnections ??
      (process.env.DB_MAX_CONNECTIONS ? Number(process.env.DB_MAX_CONNECTIONS) : 10),
    idleTimeoutMs:
      overrides?.idleTimeoutMs ??
      (process.env.DB_IDLE_TIMEOUT_MS ? Number(process.env.DB_IDLE_TIMEOUT_MS) : 10000),
    connectionTimeoutMs:
      overrides?.connectionTimeoutMs ??
      (process.env.DB_CONNECTION_TIMEOUT_MS ? Number(process.env.DB_CONNECTION_TIMEOUT_MS) : 5000),
    statementTimeoutMs:
      overrides?.statementTimeoutMs ??
      (process.env.DB_STATEMENT_TIMEOUT_MS ? Number(process.env.DB_STATEMENT_TIMEOUT_MS) : 10000),
  });
}
