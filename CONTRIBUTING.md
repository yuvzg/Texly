# Contributing to Texly

Thank you for contributing to Texly! This document outlines our development workflow, standards, and guidelines.

## Prerequisites

- **Node.js**: `24.x LTS` (managed via `.nvmrc`)
- **Package Manager**: `pnpm` (Corepack enabled: `corepack enable`)
- **Docker**: For local services (PostgreSQL, Redis, MinIO, TeX Live)

## Quick Start

1. Install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

2. Run typecheck across all workspaces:

   ```bash
   pnpm typecheck
   ```

3. Build all packages and applications:

   ```bash
   pnpm build
   ```

4. Run tests:

   ```bash
   pnpm test
   ```

5. Verify dependency boundaries:
   ```bash
   pnpm check:boundaries
   ```

## Development Scripts

- `pnpm dev`: Start development servers across workspaces
- `pnpm build`: Build all packages and apps via Turborepo
- `pnpm lint`: Run ESLint across monorepo
- `pnpm typecheck`: Run TypeScript compiler checks
- `pnpm test`: Execute Vitest test suites
- `pnpm format`: Format files using Prettier
- `pnpm format:check`: Check formatting without modifying files
- `pnpm check:boundaries`: Verify architectural dependency boundaries via `dependency-cruiser`
- `pnpm clean`: Clean build artifacts and caches

## Architectural Rules & Module Boundaries

Please review `docs/CODING_STANDARDS.md` and `docs/SYSTEM_ARCHITECTURE.md`:

- `packages/shared`: Contract source of truth. Must not import from other packages or apps.
- `apps/compile-runner`: May import only `packages/shared` and `packages/latex`. Never import `packages/db` or `packages/llm`.
- `apps/web`: Strictly UI layer. May import only `packages/shared` and `packages/latex`.
- `packages/latex`: Pure TypeScript (no I/O, no Node-only APIs).

## Commit Conventions

We follow Conventional Commits:
`<type>(<scope>): <short summary>`

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`.
