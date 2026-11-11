# DECISIONS.md — Architectural Decision Records (ADRs)

Format: **Status · Context · Decision · Alternatives considered · Consequences.** New decisions are appended; superseded ones are marked, never deleted. Statuses: *Accepted*, *Proposed* (to be confirmed by a spike), *Superseded*.

---

### ADR-001 — Modular monolith plus isolated compile runners
**Status:** Accepted. **Context:** Need simplicity for a small team, but LaTeX compilation executes untrusted code and scales differently from CRUD. **Decision:** One backend codebase (`apps/server`) with API and worker entrypoints; the compile runner is a separate app and deployment with no secrets. **Alternatives:** full microservices (operational overhead, no concrete need); compile inside the API process (unacceptable security). **Consequences:** Single DB, simple transactions; compile fleet scales independently; strict import boundaries must be enforced by tooling.

### ADR-002 — pnpm workspaces + Turborepo monorepo
**Status:** Accepted. **Context:** Shared Zod contracts across web, server and runner; AI agents need one repo view. **Decision:** pnpm + Turborepo. **Alternatives:** Nx (heavier), polyrepo (contract drift). **Consequences:** One lockfile, cached builds; need CODEOWNERS and boundary lint.

### ADR-003 — Text sources in PostgreSQL, binaries and derived artifacts in R2
**Status:** Accepted. **Context:** AI proposals, revisions and versions require atomic updates; large files must not live in Postgres. **Decision:** `.tex/.bib/.sty/.cls` etc. (≤ 2 MiB) in `documents.content`; everything binary or derived in R2 with metadata in Postgres. **Alternatives:** all files in R2 (no transactional revision checks; autosave latency; harder diffing); Git-like object store (over-engineered). **Consequences:** Compile needs a snapshot step to materialize files; consistency protocol between DB and R2 (outbox, reapers).

### ADR-004 — Prisma ORM pinned to the 7.x line
**Status:** Accepted. **Context:** Prisma 7 is the stable line; Prisma 8 was a release candidate in Oct 2026. **Decision:** Pin exact 7.x; upgrade to 8 after GA + one patch release + staging soak. Use hand-written SQL migrations for partial unique indexes/CHECKs. **Alternatives:** Drizzle/Kysely (better raw SQL ergonomics, but Prisma is the mandated ORM). **Consequences:** Prisma 7 specifics (`prisma-client` generator with output path, `prisma.config.ts`, driver adapter) must be followed; some constraints live outside the schema file.

### ADR-005 — Express 5 backend; Next.js used only as the UI layer
**Status:** Accepted. **Context:** Mandated Express backend with WebSockets and queue workers. **Decision:** All business logic in Express; Next.js 16 serves the app shell and static/marketing pages; no Next API routes for business logic. **Alternatives:** Next route handlers as BFF (splits logic, complicates WS/workers). **Consequences:** CORS and cookie-domain configuration required; clear ownership of logic.

### ADR-006 — Authentication: argon2id, in-memory JWT access token, rotating opaque refresh cookie
**Status:** Accepted. **Decision:** 15-min JWT (asymmetric, `kid` rotation) held in memory; 30-day opaque refresh token hashed in DB, rotated with reuse detection, httpOnly SameSite=Lax cookie. **Alternatives:** long-lived JWT in localStorage (XSS exposure); server sessions only (harder for WS/API separation). **Consequences:** silent-refresh logic in the client; need same-site domains.

### ADR-007 — Socket.IO for notifications only
**Status:** Accepted. **Context:** Need compile/AI status push and revision-change hints. **Decision:** Socket.IO with Redis adapter; events are hints, **all mutations over REST**; `project.sync` on reconnect. **Alternatives:** raw `ws` (rebuild rooms/reconnect), SSE (one-way only, fine but WS needed later for presence). **Consequences:** Simple validation/audit/rate limiting; clients must tolerate missed events.

### ADR-008 — BullMQ with a durable `compile-results` queue
**Status:** Accepted. **Decision:** Separate queues for compile jobs and results; idempotent ingestion; reconciler for lost messages. **Alternatives:** runner calling an internal HTTP callback (needs runner→API credentials/network path; lossy); QueueEvents (non-durable if API down). **Consequences:** Runner needs only Redis access; result handling survives API restarts.

### ADR-009 — AI edits as structured operations with exact-text anchors, applied server-side
**Status:** Accepted. **Context:** Must not remove content or modify unrelated sections. **Decision:** LLM returns `{summary, edits[]}`; server applies to immutable base; one repair round; full-document fallback only for small files with strict validators. **Alternatives:** full-document replacement, unified diff from LLM, CodeMirror ChangeSets/offsets, section-only generation. **Consequences:** Unmentioned text is byte-identical by construction; anchor-failure handling and validators are core engineering work.

### ADR-010 — Review mode via `@codemirror/merge` unified view; whole-proposal accept in MVP
**Status:** Accepted. **Decision:** Editor shows proposed text against original via merge view, read-only, autosave suspended, hash-verified reject; per-hunk controls post-MVP. **Alternatives:** custom decorations/widgets (reinvents deletion rendering), side-by-side merge (violates "in the main editor"). **Consequences:** Depends on library option names (verify at implementation); review transactions must be annotated and excluded from history/autosave.

### ADR-011 — Optimistic concurrency now; real-time collaboration deferred (Yjs path reserved)
**Status:** Accepted. **Decision:** Revision + hash checks on every write; conflicts surfaced to the user. When collaboration is built, adopt Yjs (CRDT) with a persistence adapter; document `content` remains the canonical snapshot and `revision` increments on persisted snapshots. **Alternatives:** OT (Overleaf-style; higher complexity), CRDT now (scope explosion). **Consequences:** AI proposals bind to a revision/hash, which must be reinterpreted as a Yjs state vector later (design note kept in `AI_ARCHITECTURE.md`).

### ADR-012 — One active AI proposal per document, enforced by a partial unique index
**Status:** Accepted. **Decision:** `UNIQUE (document_id) WHERE status IN ('QUEUED','GENERATING','PENDING')`; `supersede:true` atomically replaces. **Alternatives:** app-level checks only (race-prone). **Consequences:** Stale sweeper required to release indexes promptly; Prisma schema cannot express it (raw SQL migration).

### ADR-013 — Compile runner holds no secrets; presigned URLs per job
**Status:** Accepted. **Decision:** API mints presigned GET/PUT URLs inside the job payload; runner has Redis credentials only. **Alternatives:** scoped R2 credentials on nodes (R2 tokens are bucket-scoped; blast radius too large). **Consequences:** Larger job payloads; URL TTL management; runner cannot list or discover objects.

### ADR-014 — Sandbox isolation level: hardened Docker now; gVisor or rootless Docker before public launch
**Status:** Proposed (decision required in Phase 11). **Context:** A shared-kernel container is the weakest layer against kernel exploits. **Decision:** MVP uses hardened runc containers (all flags in `COMPILATION_ENGINE.md` §4.2) in an isolated, secret-free fleet; Phase 11 evaluates gVisor (`runsc`) vs rootless Docker vs Firecracker using real compile benchmarks and implements the winner before open sign-ups. **Alternatives:** Firecracker microVMs immediately (strongest, more ops work); managed compile services. **Consequences:** Closed beta only until resolved or risk accepted in writing.

### ADR-015 — TeX Live `scheme-full`, pinned release; `latexmk -norc`; shell escape fully disabled
**Status:** Accepted. **Decision:** One large pinned image to avoid missing-package support burden; no runtime `tlmgr`; engines run with `-no-shell-escape` + `shell_escape=f`; project `latexmkrc` ignored. **Alternatives:** curated smaller collections (faster pulls, more support), restricted shell escape (needed by e.g. `minted`; excluded). **Consequences:** `minted`-style packages unsupported at launch (documented; evaluate safe alternatives later); image build/pull time is an ops cost.

### ADR-016 — SyncTeX queries via sandboxed query job
**Status:** Proposed (measure latency in staging). **Decision:** Run `synctex view/edit` in the sandbox via a small queue; revisit with a hardened TypeScript parser if p95 > 800 ms. **Alternatives:** native `synctex` in API process (untrusted input to C code), TS parser first (more upfront work). **Consequences:** Extra queue and latency; strongest isolation.

### ADR-017 — Presigned URLs served from a separate cookie-less user-content domain
**Status:** Accepted. **Decision:** PDFs/assets are fetched directly from R2 on a dedicated domain with `nosniff`, CSP sandbox, and attachment disposition by default; PDF rendered via PDF.js. **Alternatives:** proxying all bytes through the API (cost, latency, scaling). **Consequences:** R2 custom-domain/CORS setup; verify presigned-URL behavior with the custom domain, else fall back to the S3 endpoint with strict headers.

### ADR-018 — Registration enumeration policy
**Status:** Proposed. **Decision:** MVP returns `409 EMAIL_TAKEN` for UX; revisit for generic `202` + email flow before public launch. **Consequences:** Minor enumeration risk mitigated by rate limits.

### ADR-019 — AWS: ECS Fargate for apps, EC2 Auto Scaling for compile, Terraform for IaC
**Status:** Accepted. **Decision:** Fargate for web/api/worker; EC2 ASG with pre-baked AMI for compile (needs Docker daemon); managed RDS and ElastiCache; Terraform. **Alternatives:** single VM Compose for everything (retained as the early low-cost profile), Kubernetes (unneeded), CDK (valid; Terraform chosen for ecosystem/agent familiarity), Vercel for Next.js (viable; extra vendor and cross-origin concerns). **Consequences:** Two deployment mechanisms (ECS + AMI/ASG).

### ADR-020 — LaTeX language support: legacy `stex` mode first, Lezer grammar later
**Status:** Accepted. **Decision:** `StreamLanguage` with `@codemirror/legacy-modes` stex + custom fold/indent/outline from `packages/latex`; evaluate a custom Lezer grammar in Phase 10. **Consequences:** Faster MVP; some highlighting/folding inaccuracies accepted.

### ADR-021 — Provider-independent LLM layer with a config-driven model catalog and structured outputs
**Status:** Accepted. **Decision:** `LLMProvider.generateStructured` implemented with each provider's native structured-output mechanism + Zod re-validation; model IDs, limits and prices in `config/models.ts`, not hard-coded; circuit breaker and optional visible fallback. **Alternatives:** third-party gateway/SDK (extra dependency, abstraction leakage), single provider (lock-in). **Consequences:** Adapter conformance tests required; catalog needs maintenance against provider docs.

### ADR-022 — Document versions stored as full snapshots in Postgres
**Status:** Accepted. **Decision:** Throttled full-content `DocumentVersion` rows with hash dedupe and thinning retention; revisit delta/R2 storage if size becomes material. **Alternatives:** delta chains (restore complexity), R2 objects (non-transactional with accept). **Consequences:** Simple restore/compare; storage growth managed by policy.

### ADR-023 — Compile caching by `inputHash`; latest-wins coalescing per project
**Status:** Accepted. **Consequences:** Faster repeat compiles, lower cost; clean-room compile each time (no aux reuse) keeps results deterministic; incremental compile deferred.

### ADR-024 — Frontend state: TanStack Query for server state, Zustand for editor/session state
**Status:** Accepted. **Alternatives:** Redux Toolkit (heavier), context-only (re-render issues with editor state). **Consequences:** WS events patch Query caches via one adapter.

### ADR-025 — Zod as single source of truth for contracts; OpenAPI generated
**Status:** Accepted. **Decision:** Schemas in `packages/shared`; OpenAPI 3.1 generated in CI; clients/mocks derived. **Alternatives:** hand-written OpenAPI, tRPC (REST is mandated). **Consequences:** Contract PR process (`CODING_STANDARDS.md` §12).

### ADR-026 — Observability: pino + Sentry + Prometheus-style metrics, OpenTelemetry later
**Status:** Accepted. **Consequences:** Minimal MVP footprint; tracing added in Phase 11 using the same IDs.

### ADR-027 — Additional (non-mandated) technologies introduced
**Status:** Accepted. pnpm/Turborepo, Zod, Socket.IO, TanStack Query, Zustand, `react-resizable-panels`, argon2, pino, `rate-limiter-flexible`, `dockerode`, jsdiff, Testcontainers, MinIO (dev), k6, Terraform, Sentry, `dependency-cruiser`. Each is justified above or in the relevant doc; none changes the mandated stack. **No deviation from the mandatory stack was required.**

---

# Consolidated Technical Decision Summary

## What we are building
A web-based LaTeX editor (Overleaf/Prism-style) whose differentiator is an **AI modification workflow that never changes a document without explicit user approval**. The UI follows the reference screenshot: sidebar (projects, files/chats, outline), CodeMirror editor with an AI composer docked beneath it, PDF.js preview with compile status.

## Final technology choices and rationale

| Concern | Choice | Why |
|---|---|---|
| Frontend | Next.js 16, React, TypeScript, Tailwind, shadcn/ui | Mandated; mature ecosystem; Next used as UI layer only |
| Editor | CodeMirror 6 + `@codemirror/merge` | Mandated; merge view gives native inserted/deleted/modified rendering for AI review |
| PDF | PDF.js in a custom viewer | Mandated; fine control over refresh/scroll restore, security (no PDF scripting) |
| Backend | Node 24, Express 5, TypeScript, REST + Socket.IO | Mandated; WS for notifications only |
| Database | PostgreSQL 17 + Prisma 7.x | Transactions for revisions/approval; partial unique indexes enforce invariants |
| Queue | Redis (noeviction) + BullMQ | Mandated; durable job and result queues |
| Storage | Cloudflare R2 (S3 API), MinIO locally | Mandated; zero egress; presigned access; outbox for consistency |
| LaTeX | TeX Live (pinned) + latexmk (`-norc`), pdfLaTeX/XeLaTeX/LuaLaTeX, BibTeX/Biber, SyncTeX | Mandated; flags/texmf harden execution |
| Isolation | Per-job hardened Docker container on secret-free EC2 fleet; gVisor/rootless before public launch | Untrusted code execution is the top risk |
| AI | Provider abstraction (OpenAI, Anthropic, Gemini), structured edit ops, validators, approval gate | Safest representation; no tools; provider independence |
| Auth | argon2id, short JWT in memory, rotating refresh cookie | Limits XSS/CSRF/replay risk |
| Infra | AWS (ECS Fargate + EC2 ASG), Terraform, GitHub Actions (OIDC) | Practical split between stateless apps and Docker-dependent compile nodes |
| Testing | Vitest, Supertest, Playwright, Testcontainers, k6 | Real-dependency integration tests; AI-approval and sandbox suites are release gates |

## Final architecture in one paragraph
Browsers talk to a Next.js UI and an Express API (REST + Socket.IO). Text documents, revisions, versions, AI proposals and all metadata live in PostgreSQL; binaries and compile artifacts live in R2 and travel via short-lived presigned URLs. Autosave is a revision-checked conditional update. A compile request snapshots the project, stores a text bundle in R2, and enqueues a BullMQ job; a secret-free runner on isolated EC2 nodes executes TeX Live inside a per-job, network-less, read-only, resource-capped container, uploads artifacts through presigned URLs and returns parsed diagnostics through a durable results queue, which the worker ingests and pushes to clients over WebSocket. An AI prompt flushes autosave, creates a proposal bound to `(document, revision, hash)`, and enqueues generation; the LLM returns structured edit operations that the server applies to the immutable base, validates (structure, packages, labels/citations, scope, dangerous primitives), and stores as `PENDING`. The editor shows the proposal in a read-only unified merge view; **Accept** is an atomic, revision-guarded commit creating `PRE_AI` and `AI_ACCEPT` versions, **Reject** discards without touching persisted state, and stale, failed, concurrent and refreshed scenarios are all handled by the state machine and DB constraints.

## Assumptions and unresolved decisions
- Model IDs, context sizes and prices are intentionally **not** hard-coded; populate `config/models.ts` from each provider's current documentation at implementation time.
- Verify at implementation: `@codemirror/merge` option names; Prisma 7 configuration details; R2 support for additional checksum headers, custom-domain presigned URLs, and lack of object versioning; LuaTeX `--safer/--nosocket` and latexmk `-norc` behaviour on the pinned TeX Live; BullMQ compatibility with the chosen managed Redis/Valkey; current AWS/Cloudflare/LLM pricing for the cost model.
- Open ADRs: **ADR-014** (sandbox isolation level), **ADR-016** (SyncTeX approach), **ADR-018** (enumeration policy).
- Business decisions pending: plan limits/pricing, BYO API keys, region/data-residency, template licensing, support for `minted`-style shell-escape packages.
- Estimated effort: ~20–24 weeks for one strong full-stack developer working with parallel AI-agent workstreams (see `IMPLEMENTATION_ROADMAP.md`); MVP cut = Phases 0–9 plus minimum security/observability from Phases 11–12.
