# CODING_STANDARDS.md

Engineering standards for humans and AI coding agents (Claude Code, Codex, Cursor). The goal is that two agents working in parallel make the same fundamental choices. When in doubt: **follow the existing pattern, keep modules small, and never cross a boundary without a contract.**

---

## 1. Repository and module ownership

| Path | Owner (CODEOWNERS group) | May import |
|---|---|---|
| `packages/shared` | contracts-owners (all workstreams review) | nothing internal |
| `packages/db` | server-core | `shared` |
| `packages/latex` | latex-libs | `shared` |
| `packages/llm` | llm | `shared`, `latex` |
| `apps/server` | server-core | `shared`, `db`, `latex`, `llm` |
| `apps/compile-runner` | compile | `shared`, `latex` **only** |
| `apps/web` | web | `shared`, `latex` |
| `docker/texlive`, `infra/**`, `.github/**` | infra-security | — |

Boundary rules are enforced in CI by `dependency-cruiser`; violations fail the build.

## 2. TypeScript conventions
- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. **No `any`** (use `unknown` + narrowing); `@ts-expect-error` requires a comment with an issue link.
- ESM everywhere; path aliases only within an app (`@/…`), never across packages (use package names `@texly/shared`).
- Prefer `type` for data shapes and unions, `interface` for extendable contracts; discriminated unions over boolean flags; `as const` enums mirrored from Zod/Prisma — **single source of truth in `packages/shared`**.
- Immutability by default (`readonly`), pure functions in `packages/*`; no side effects at import time.
- Dates are `Date` internally, ISO-8601 strings at boundaries; money/cost as integer micro-USD (`bigint`/`number` ≤ 2^53, never floats).
- No default exports except Next.js pages/layouts.
- Formatting: Prettier (printWidth 100, single quotes, trailing commas); lint: ESLint (typescript-eslint strict-type-checked, `eslint-plugin-import`, `unicorn` selected rules, `eslint-plugin-boundaries`).

## 3. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | `kebab-case.ts`; suffix by role | `document.service.ts`, `proposal.repository.ts`, `auth.routes.ts` |
| React components | `PascalCase.tsx`, one component per file | `ReviewBanner.tsx` |
| Hooks | `useX` | `useAutosave` |
| Types/Interfaces/Classes | `PascalCase` | `ProposalDTO`, `StorageService` |
| Functions/variables | `camelCase`; booleans `is/has/can` | `hasActiveProposal` |
| Constants | `UPPER_SNAKE_CASE` only for true constants | `MAX_DOCUMENT_BYTES` |
| DB tables/columns | `snake_case`, plural tables (via `@@map`/`@map`) | `ai_proposals.base_revision` |
| Prisma models | `PascalCase` singular | `AIProposal` |
| API paths | plural nouns, kebab-case, no verbs except RPC-style actions (`/accept`) | `/ai/proposals/:id/accept` |
| JSON fields | `camelCase` | `baseRevision` |
| Error codes | `UPPER_SNAKE_CASE`, stable, documented | `PROPOSAL_STALE` |
| Queue names | `kebab-case`; job names `noun.verb` | `ai-generate`, `compile.run` |
| WS events | `domain.entity.verb` lowercase | `ai.proposal.updated` |
| Env vars | `UPPER_SNAKE_CASE`, prefixed by area | `COMPILE_CONCURRENCY` |
| Branches | see §10 | `feat/ai-accept-transaction` |

## 4. Layering and structure (backend)
- Follow the module layout in `SYSTEM_ARCHITECTURE.md` §7: `routes → controller → service → repository`; infra behind interfaces.
- **Controllers** contain no logic beyond: parse (validated) input → call one service method → map to DTO → respond.
- **Services** own transactions (`withTransaction(tx => …)` helper) and business rules; receive an explicit `Actor` (`{userId, projectRole}`) — never read request globals.
- **Repositories** return plain objects/DTO-ready types, accept an optional `tx` client, and **always include scoping columns** (`projectId`) in `WHERE` clauses for child resources.
- Cross-module calls only via the other module's **service interface**; shared domain events via a typed in-process event bus (`domainEvents.emit('document.saved', …)`) for decoupling (e.g., versions listening to saves) — handlers must be idempotent and must not throw into the caller.
- Dependency injection: constructor injection with a tiny manual composition root (`container.ts`); no DI framework.
- Business rules never live in route handlers or React components.

## 5. API standards
- Contracts first: add/modify Zod schemas in `packages/shared`, regenerate OpenAPI, then implement. **No endpoint without a schema.**
- Responses use the envelope in `API_SPECIFICATION.md` §0.2; controllers use `ok(res, data, meta?)`, errors thrown as `AppError(code, httpStatus, message, details?)` and rendered by the single error middleware.
- Versioning: `/api/v1`; breaking changes → `/api/v2` or additive evolution; never remove fields without a deprecation release.
- Status codes: `200/201/202/204`, `400/401/403/404/409/413/422/429/503` as specified; `409` carries machine-readable `details`.
- Idempotency: mutating endpoints with side effects accept `Idempotency-Key` (stored in Redis 24 h).
- Pagination: cursor-based; never offset on large tables.
- Never return Prisma entities directly; map to DTOs (hash/`passwordHash`/internal keys never leave the server).

## 6. Validation standards
- **Zod at every boundary**: HTTP (params/query/body), WS handshake and events, queue job payloads (validate on enqueue **and** on consume), environment variables, provider (LLM) outputs, parsed JSON columns.
- `.strict()` on objects; coerce only in query parsing; trim/normalize strings; UUID format checks before DB access.
- Domain validation (name rules, path rules, quotas) lives in pure functions in `packages/shared` and is reused by client and server.
- Validation errors map to `422 VALIDATION_FAILED` with `details.fields: [{path, code, message}]`.

## 7. Error-handling conventions
- Throw `AppError` for expected failures; let unexpected errors bubble to the global handler (→ `500 INTERNAL`, logged with `requestId`, Sentry).
- **Never swallow errors.** `catch` blocks must either handle meaningfully, rethrow with context (`cause`), or log at the correct level and continue only when documented as safe.
- Async: no floating promises (`@typescript-eslint/no-floating-promises`); every `await` of I/O has timeout/abort support at the adapter boundary.
- External adapters convert vendor errors to internal typed errors (`LLMError`, `StorageError`, `QueueError`) with `retryable` flags.
- Workers: classify failures as **retryable** (infra) vs **terminal** (user/validation); terminal errors are recorded on the owning entity and the job is completed (not retried).
- Never expose internal messages, stack traces, SQL or provider errors to clients.
- Transactions: keep short; no network calls (R2, LLM) inside a DB transaction.

## 8. Logging conventions
- `pino` JSON; one logger per module (`logger.child({ module: 'ai' })`); request-scoped child with `requestId`, `userId`, `projectId`.
- Levels: `error` (actionable, pages), `warn` (degraded but handled), `info` (state changes: compile started/finished, proposal status), `debug` (dev only).
- Message = constant string, data in fields: `log.info({ proposalId, status }, 'proposal.status.changed')`.
- **Never log:** document/prompt/LLM content, tokens, passwords, presigned URLs, full emails (mask), auth headers. Redaction configured centrally; tests assert it.
- Every queue job logs `jobId`, `entityId`, `attempt`, duration.

## 9. Database and migration standards
- Schema changes via Prisma Migrate only; one logical change per migration; descriptive names; raw SQL only in migration files or tagged `$queryRaw`.
- Expand → migrate → contract; no destructive change in the same release as the code that stops using it.
- Every new table: PK `uuid(7)`, `created_at`, `updated_at` (where mutable), FK indexes, explicit `onDelete`.
- Queries: select only needed columns on hot paths; no N+1 (use `include`/batching); `FOR UPDATE SKIP LOCKED` for queue-like tables; set statement timeouts (5 s default) per connection.
- Repository tests run against real Postgres (Testcontainers).

## 10. Git workflow and pull requests
- **Trunk-based with short-lived branches** off `main`; `main` always deployable (auto-deploys to staging).
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `test/…`; include task ID when applicable (`feat/p9-b4-accept-transaction`).
- **Conventional Commits** (`feat(ai): add accept transaction`), enforced by commitlint; squash-merge.
- PR size: target ≤ 400 changed lines excluding generated/lock files; split otherwise.
- **PR template checklist:** task ID(s); contract changes (shared schema/OpenAPI/WS) flagged; migration included + reviewed; tests added (unit + integration where applicable); security impact considered (authz, input, logging); docs updated; screenshots/GIFs for UI; rollback notes.
- Reviews: ≥ 1 approval; CODEOWNERS approval required for `compile-runner`, `docker/texlive`, `infra`, `packages/db`, `packages/shared`; AI-agent PRs are labeled `agent` and get the same bar plus a human review of boundary and security-sensitive code.
- Required checks: lint, typecheck, tests, boundary rules, migration drift, security scans.
- Releases: tagged `vX.Y.Z`; changelog generated; hotfixes branch from the release tag and are merged back.

## 11. Testing standards
- Co-located tests: `foo.service.ts` → `foo.service.test.ts` (unit); integration/e2e under `tests/`.
- Names: `describe('<unit>')` / `it('<does X when Y>')`; Arrange-Act-Assert; one behavior per test.
- No `sleep`; use fake timers or polling helpers (`waitFor`). No shared mutable state between tests; each integration test file gets isolated DB schema/Redis prefix/bucket prefix.
- Mock only at process boundaries (LLM provider, clock, email); **do not mock repositories** in integration tests.
- Every bug fix includes a regression test. Security and AI-approval suites cannot be skipped/quarantined without security-owner approval.
- Coverage gates per `TESTING_STRATEGY.md` §2.

## 12. Parallel development rules (preventing conflicting implementations)
1. **Contracts first, frozen per phase.** Changes to `packages/shared` schemas, WS events, queue payloads (`CompileJobV1`, `CompileResultV1`), `EditOp` or `LLMProvider` go through a dedicated *contract PR* reviewed by both producer and consumer owners; breaking changes bump a version suffix (`V2`) and keep `V1` support until consumers migrate.
2. **One owner per table.** Only the owning module's repository writes to its tables (`documents` ← documents module; accept transaction is invoked via `DocumentService.applyProposal(...)` called from the ai module, not by writing `documents` directly).
3. **Single migration lane:** schema migrations are authored by server-core and merged in order; other streams request schema changes via an issue/contract PR.
4. **Interface stubs:** when a dependency is not ready, depend on the interface and a fake (e.g., `FakeLLMProvider`, `FakeStorageService`, MSW handlers) — never on a half-built implementation.
5. **Feature flags** for incomplete features; flags default off in production.
6. **Agent task format:** each task includes task ID, files allowed to change, contract references, acceptance tests to add/pass, and "do not touch" list. Agents must not modify files outside their allowed paths without a contract PR.
7. Keep `CONTRACTS.md` (changelog of shared contracts) updated in the same PR as any contract change.

## 13. Frontend conventions
- Next.js App Router; **client components for the editor routes**; no business logic in Next route handlers (API lives in Express); server components only for static/marketing/auth shells.
- Data fetching via generated API client + TanStack Query (stable query keys per resource); mutations invalidate/patch caches; WS events update caches through a single `realtime.ts` adapter.
- Local UI/editor state in Zustand stores (slices per concern); never store server entities in two places.
- CodeMirror: all editor behavior as **extensions/compartments** in `features/editor/extensions/*`; a single `useEditorController` owns view lifecycle; review mode lives in `features/ai/review-extension.ts` and is the only code allowed to replace document text outside user input (annotated with `reviewAnnotation`).
- Styling: Tailwind utilities + shadcn/ui primitives; tokens via CSS variables; no inline hex colors.
- Accessibility: every interactive element keyboard-reachable with visible focus; ARIA roles per UI spec; automated axe checks in E2E.
- Performance: lazy-load PDF.js and heavy CM extensions; avoid re-render storms (selectors, memoization on tree/outline); web workers for parsing > 200 KB.

## 14. Security-in-code checklist (applies to every PR)
- [ ] Authz enforced and scoped by `projectId`; tests cover other-project access.
- [ ] Inputs validated by Zod; no string-built SQL/paths/shell commands.
- [ ] No user data in logs; no secrets in code/config.
- [ ] External calls have timeouts and abort signals; retries bounded.
- [ ] New endpoints added to the authz matrix test and rate-limit config.
- [ ] Anything that touches compile sandbox config, texmf, runner flags requires security-owner review.

## 15. Documentation standards
- Every package/app has a `README.md` (purpose, boundaries, commands). Public functions in `packages/*` have TSDoc.
- Architectural changes require an ADR entry in `DECISIONS.md` (Context/Decision/Alternatives/Consequences) in the same PR.
- Keep `.env.example`, OpenAPI artifact, and runbooks current; docs are reviewed like code.
- Comments explain *why*, not *what*; TODOs must reference an issue (`// TODO(#123): …`).
- API changes are documented by the schema; behaviour changes by updating the relevant `docs/*.md`.
