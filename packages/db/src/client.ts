import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { resolveDatabaseConfig, type DatabaseConfig } from './config.js';
import { checkDatabaseHealth, type DatabaseHealthResult } from './health.js';
import { withTransaction, type TransactionClient, type TransactionOptions } from './transaction.js';

export interface DatabaseInstance {
  client: PrismaClient;
  pool: pg.Pool;
  config: DatabaseConfig;
  disconnect(): Promise<void>;
  healthCheck(): Promise<DatabaseHealthResult>;
  transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}

let singletonInstance: DatabaseInstance | null = null;

export function createDatabaseInstance(
  configOverrides?: Partial<DatabaseConfig>,
): DatabaseInstance {
  const config = resolveDatabaseConfig(configOverrides);

  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
  });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  const instance: DatabaseInstance = {
    client,
    pool,
    config,
    async disconnect() {
      await client.$disconnect();
      await pool.end();
    },
    async healthCheck() {
      return checkDatabaseHealth(client);
    },
    async transaction<T>(fn: (tx: TransactionClient) => Promise<T>, options?: TransactionOptions) {
      return withTransaction(client, fn, options);
    },
  };

  return instance;
}

export function getDbClient(configOverrides?: Partial<DatabaseConfig>): DatabaseInstance {
  if (!singletonInstance) {
    singletonInstance = createDatabaseInstance(configOverrides);
  }
  return singletonInstance;
}

export async function disconnectDb(): Promise<void> {
  if (singletonInstance) {
    await singletonInstance.disconnect();
    singletonInstance = null;
  }
}

export { checkDatabaseHealth, withTransaction };
export type { DatabaseHealthResult, TransactionClient, TransactionOptions };
export type { PrismaClient } from './generated/prisma/client.js';
