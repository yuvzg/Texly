# @texly/db

Database abstraction layer, Prisma 7 ORM schema, raw SQL migrations, connection pooling, and development seeds for Texly.

## Overview

- **Database:** PostgreSQL 17
- **ORM:** Prisma 7.9.x with `@prisma/adapter-pg` driver adapter
- **Configuration:** `prisma.config.ts` (datasource and migration paths)
- **Primary Keys:** UUIDv7 (`@default(uuid(7))`)
- **Conventions:** `snake_case` mappings (`@@map`, `@map`), `timestamptz(6)` timestamps, explicit cascade / restrict constraints.

## Architecture

- `prisma/schema.prisma`: Core Prisma 7 models across Identity, Workspaces, Projects, Files, Documents, Versions, Compilations, AI, and Operations.
- `prisma/migrations/20261111000000_init/migration.sql`: Generated DDL combined with hand-crafted raw SQL constraints and partial unique indexes:
  - `project_files_project_path_live_uq`: Unique live file path per project (`WHERE deleted_at IS NULL`).
  - `project_files_project_path_ci_live_uq`: Case-insensitive sibling live path uniqueness.
  - `ai_proposals_one_active_per_document_uq`: Maximum 1 active (`QUEUED`, `GENERATING`, `PENDING`) proposal per document.
  - `compilations_one_running_per_project_uq`: Maximum 1 `RUNNING` compilation per project.
  - Check constraints: lowercase email (`users_email_lower_ck`), max 2 MiB document size and minimum revision 1 (`documents_size_ck`), complete proposal payload on `PENDING`, complete asset state on `READY`.
- `src/client.ts`: Singleton client factory using `pg.Pool` connection pooling and `@prisma/adapter-pg`.
- `src/health.ts`: Database connection health check with latency measurement.
- `src/transaction.ts`: Atomic transaction helper (`withTransaction`) with timeouts and rollback safety.
- `src/types.ts`: Strongly typed exports for models, enums, and transaction interfaces without leaking internal Prisma engine details.

## Development Scripts

```bash
# Generate Prisma Client
pnpm --filter @texly/db generate

# Run Prisma migrations
pnpm --filter @texly/db migrate:deploy

# Seed development database with demo user & templates
pnpm --filter @texly/db seed

# Run Testcontainers-backed integration tests against real PostgreSQL 17
pnpm --filter @texly/db test
```
