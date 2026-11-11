import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabaseInstance, type DatabaseInstance } from '@texly/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  connectionString: string;
  db: DatabaseInstance;
  cleanup: () => Promise<void>;
}

export async function setupTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:17')
    .withDatabase('texly_server_test')
    .withUsername('test_user')
    .withPassword('test_pass')
    .start();

  const connectionString = container.getConnectionUri();

  // Run initial migration SQL file directly on container via pool in DatabaseInstance
  const migrationPath = path.resolve(
    __dirname,
    '../../../../packages/db/prisma/migrations/20261111000000_init/migration.sql',
  );
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const db = createDatabaseInstance({ url: connectionString });
  await db.pool.query(migrationSql);

  return {
    container,
    connectionString,
    db,
    async cleanup() {
      await db.disconnect();
      await container.stop();
    },
  };
}
