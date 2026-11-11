import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  connectionString: string;
  pool: pg.Pool;
  client: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function setupTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('texly_test')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  const connectionString = container.getConnectionUri();

  // Run initial migration SQL file directly on container
  const migrationPath = path.resolve(
    __dirname,
    '../prisma/migrations/20261111000000_init/migration.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const pool = new pg.Pool({ connectionString });
  await pool.query(migrationSql);

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  return {
    container,
    connectionString,
    pool,
    client,
    async cleanup() {
      await client.$disconnect();
      await pool.end();
      await container.stop();
    },
  };
}
