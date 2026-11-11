# DEPLOYMENT.md — DevOps, Infrastructure and Operations

---

## 1. Environments

| Env | Purpose | Topology | Data |
|---|---|---|---|
| **local** | Development | Docker Compose: Postgres 17, Redis 7, MinIO, Mailpit, `web`, `server:api`, `server:worker`, `compile-runner` (uses host Docker) | seeded demo data |
| **ci** | Tests | Testcontainers / `compose.test.yml` | ephemeral |
| **staging** | Pre-production, nightly E2E, load tests | Production-shaped, smaller (single-AZ, 1 compile node), real R2 bucket, real LLM keys with low spend caps | synthetic |
| **production** | Live | Multi-AZ DB, ≥ 2 app tasks, compile ASG ≥ 2 nodes | real |

Promotion: `main` → auto-deploy to staging → manual approval → production (same image digests; configuration differs only by env/secrets).

## 2. Recommended cloud architecture

```mermaid
flowchart TB
  U["Users"] --> CF["DNS + optional CDN/WAF"]
  CF --> ALB["AWS ALB + WAF"]
  subgraph VPC["AWS VPC (region e.g. ap-south-1)"]
    subgraph PubSub["Public subnets"]
      ALB
      NAT["NAT / egress"]
    end
    subgraph AppSub["Private app subnets"]
      WEB["ECS Fargate: web"]
      API["ECS Fargate: server:api"]
      WRK["ECS Fargate: server:worker"]
    end
    subgraph DataSub["Private data subnets"]
      RDS[("RDS PostgreSQL 17, Multi-AZ in prod")]
      REDIS[("ElastiCache Redis/Valkey, noeviction")]
    end
    subgraph CompSub["Isolated compile subnet"]
      ASG["EC2 Auto Scaling Group: compile-runner + Docker + TeX Live image"]
    end
  end
  ALB --> WEB
  ALB --> API
  API --> RDS
  API --> REDIS
  WRK --> RDS
  WRK --> REDIS
  REDIS --> ASG
  API -->|S3 API| R2[("Cloudflare R2")]
  WRK --> R2
  U -->|"presigned URLs"| R2
  WRK -->|HTTPS| LLM["LLM providers"]
  ASG -->|"presigned URLs only"| R2
  ECR["ECR images"] -.-> WEB
  ECR -.-> API
  ECR -.-> ASG
  SM["Secrets Manager / SSM"] -.-> API
  SM -.-> WRK
```

Design choices (details in `DECISIONS.md`):
- **App tier on ECS Fargate** (no servers to patch; Docker-in-Docker not needed). **Compile tier on EC2** because per-job containers need a Docker daemon and cannot run on Fargate.
- **Early/cheap option (≤ ~100 users):** one EC2 host runs `web`, `api`, `worker`, Redis (Compose) and a second EC2 runs the compile runner; RDS stays managed. Same images and config; Terraform modules allow switching to Fargate later.
- Compile subnet egress: Redis + HTTPS to R2 only (security groups; use NAT or restricted public egress with SG allow-list — NAT adds ~\$30+/month, so the early option places compile nodes in a public subnet with no inbound rules and egress-only SG).
- Region: choose by user base (e.g., `ap-south-1` Mumbai for India); R2 location hint to match. Cross-border data transfer implications reviewed before launch.

## 3. Local development

### 3.1 Prerequisites
Node.js 24 LTS, pnpm (via Corepack), Docker Desktop/Engine ≥ 25, Git. Linux/macOS/WSL2.

### 3.2 Setup steps
```
git clone <repo> && cd texly
corepack enable && pnpm install --frozen-lockfile
cp .env.example .env                      # fill LLM keys (optional for non-AI work)
docker compose -f docker/compose.dev.yml up -d postgres redis minio mailpit
docker build -t texly/texlive:dev docker/texlive    # first build is slow (TeX Live); cached after
pnpm --filter @texly/db prisma migrate dev          # applies migrations incl. raw SQL constraints
pnpm --filter @texly/db seed                        # demo user + sample project
pnpm dev                                            # turbo: web :3000, api :4000, worker, compile-runner
```
Default dev URLs: web `http://localhost:3000`, API `http://localhost:4000/api/v1`, MinIO console `:9001`, Mailpit `:8025`. A fake LLM provider (`LLM_FAKE=true`) allows working on the approval flow without API keys.

### 3.3 Compose services (dev)
| Service | Image | Notes |
|---|---|---|
| postgres | `postgres:17` | volume; `pg_trgm` available |
| redis | `redis:7` with `--maxmemory-policy noeviction` | required by BullMQ |
| minio | `minio/minio` | S3-compatible stand-in for R2; bucket auto-created by init container; CORS configured |
| mailpit | `axllent/mailpit` | catches verification emails |
| compile-runner | runs on host via `pnpm dev` (needs host Docker socket) | never expose the Docker socket to other containers in shared environments |

## 4. Environment variable inventory

Never commit real values. All parsed/validated by Zod at startup (fail fast). `NEXT_PUBLIC_*` values are public by definition.

| Variable | Used by | Example | Description |
|---|---|---|---|
| `NODE_ENV` | all | `production` | runtime mode |
| `APP_ENV` | all | `staging` | environment name (logs/metrics tags) |
| `LOG_LEVEL` | server, runner | `info` | pino level |
| `PORT` | api | `4000` | HTTP port |
| `WEB_ORIGIN` | api | `https://app.example.com` | CORS allowlist (comma-separated) |
| `API_ORIGIN` | web | `https://api.example.com` | server-side base URL |
| `NEXT_PUBLIC_API_URL` | web | `https://api.example.com/api/v1` | browser REST base |
| `NEXT_PUBLIC_WS_URL` | web | `wss://api.example.com` | Socket.IO endpoint |
| `DATABASE_URL` | server, db | `postgresql://app:***@host:5432/texly?sslmode=require` | pooled app connection |
| `DATABASE_MIGRATION_URL` | CI/migrate task | `postgresql://migrator:***@host:5432/texly` | DDL-capable role |
| `DB_POOL_MAX` | server | `20` | connection pool size |
| `REDIS_URL` | server, runner | `rediss://:***@host:6379` | BullMQ/rate limits/Socket.IO adapter |
| `JWT_ACCESS_PRIVATE_KEY` | api | `<PEM or SM ref>` | signing key (EdDSA/RS256) |
| `JWT_ACCESS_PUBLIC_KEYS` | api | `kid1:<PEM>,kid2:<PEM>` | verification keys (rotation) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | api | `texly` / `texly-web` | claims |
| `ACCESS_TOKEN_TTL_SEC` | api | `900` | |
| `REFRESH_TOKEN_TTL_DAYS` | api | `30` | |
| `COOKIE_DOMAIN` | api | `.example.com` | refresh cookie domain |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST` | api | `19456` / `2` | password hashing params |
| `R2_ACCOUNT_ID` | server | `abc123…` | Cloudflare account |
| `R2_ENDPOINT` | server | `https://<account>.r2.cloudflarestorage.com` (MinIO: `http://minio:9000`) | S3 endpoint |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | server | `***` | scoped token |
| `R2_BUCKET` | server | `texly-prod-projects` | |
| `R2_BACKUP_BUCKET` | backup job | `texly-prod-backups` | |
| `R2_FILES_PUBLIC_BASE` | server | `https://files.example-usercontent.com` | custom domain for presigned URLs (if used) |
| `R2_FORCE_PATH_STYLE` | server | `false` (MinIO: `true`) | |
| `OPENAI_API_KEY` | worker | `sk-***` | enable provider |
| `ANTHROPIC_API_KEY` | worker | `***` | enable provider |
| `GEMINI_API_KEY` | worker | `***` | enable provider |
| `LLM_DEFAULT_MODEL` | server | `<provider>:<model-id>` | catalog key |
| `LLM_FAKE` | dev/test | `true` | use scripted provider |
| `AI_ENABLED` | server | `true` | global kill switch |
| `AI_REQUEST_TIMEOUT_MS` | worker | `120000` | |
| `COMPILE_IMAGE` | runner | `registry/texly/texlive@sha256:…` | sandbox image (by digest) |
| `COMPILE_CONCURRENCY` | runner | `3` | concurrent jobs per node |
| `COMPILE_DEFAULT_TIMEOUT_SEC` | server | `60` | plan caps in config |
| `COMPILE_WORK_ROOT` | runner | `/var/compile` | job dirs (dedicated volume) |
| `COMPILE_CACHE_DIR` / `COMPILE_CACHE_MAX_GB` | runner | `/var/cache/texly` / `20` | asset cache |
| `COMPILE_RUNTIME` | runner | `runc` or `runsc` | OCI runtime (gVisor) |
| `COMPILE_ENABLED` | server | `true` | kill switch |
| `SMTP_URL` / `EMAIL_FROM` | server | `smtp://mailpit:1025` / `no-reply@example.com` | transactional mail |
| `SENTRY_DSN` | all | `https://…@sentry.io/…` | error tracking |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | server | `https://otlp…` | tracing (hardening) |
| `RATE_LIMIT_REDIS_PREFIX` | server | `rl:` | |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | server | `***` | post-MVP billing |

Secrets (`*_KEY`, `*_SECRET`, `DATABASE_URL`, `REDIS_URL`, JWT keys) live in AWS Secrets Manager/SSM and are injected by ECS task definitions; compile nodes receive **only** `REDIS_URL` and non-secret config.

## 5. CI/CD (GitHub Actions)

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | PR, push | checkout → pnpm cache → install (frozen) → lint → typecheck → unit/component → Testcontainers integration → `prisma migrate diff` drift check → dependency-cruiser boundaries → build |
| `security.yml` | PR + nightly | gitleaks, `osv-scanner`, Trivy (fs + images), CodeQL (JS/TS) |
| `compile-security.yml` | PR touching `docker/texlive`, `apps/compile-runner`, `packages/latex`; nightly | build sandbox image → run golden + sandbox security suites |
| `e2e.yml` | PR (smoke), nightly (full) | compose up → Playwright (Chromium; nightly + Firefox/WebKit) → artifacts (traces/videos) |
| `images.yml` | merge to `main` | build `web`, `server`, `compile-runner`, `texlive` → push to ECR by digest → SBOM + sign |
| `deploy-staging.yml` | after `images.yml` | OIDC → AWS role → run migrations (ECS one-off task) → ECS service update → smoke tests → bake compile AMI/launch template → ASG instance refresh |
| `deploy-prod.yml` | manual dispatch / release tag + environment approval | same as staging, with canary (10 % → 100 %) and automatic rollback on alarm |
| `infra.yml` | PR on `infra/**` | `terraform fmt/validate/plan` (comment on PR); apply on merge with approval |

Conventions: actions pinned by SHA; OIDC (no stored AWS keys); concurrency groups per environment; required checks on `main`.

## 6. Database migrations
- `prisma migrate deploy` as a **one-off ECS task** before app rollout; app version N must work with schema N−1 (expand/contract).
- Migrations that lock large tables use `CONCURRENTLY`/batched backfills; run staging rehearsal with production-sized data before risky changes.
- Pre-migration snapshot is automatic (RDS) before production migrations.
- Rollback: redeploy previous app image; **never** run down-migrations; fix forward with a new migration.

## 7. Redis, workers and compile fleet
- **Redis:** managed (ElastiCache Redis OSS/Valkey; verify BullMQ compatibility notes for the chosen engine), TLS + auth, `maxmemory-policy noeviction`, replica + automatic failover in production, AOF/snapshots enabled. Separate logical key prefixes (`bull:`, `rl:`, `sio:`).
- **server:worker:** ECS service scaling on queue depth/age (custom CloudWatch metrics emitted by the server: `ai_queue_waiting`, `ai_job_age_p95`). Graceful shutdown: stop accepting jobs, finish or return in-flight work (BullMQ `worker.close()`), SIGTERM grace ≥ job timeout for AI.
- **compile fleet:** EC2 Auto Scaling Group from a launch template using a **pre-baked AMI** (Docker, runner systemd unit, sandbox image pre-pulled by digest, CloudWatch agent, SSM agent, no SSH). Scale policy: target-tracking on `compile_queue_waiting_per_slot` (e.g., keep ≤ 1) with min 2 (prod)/1 (staging), max by budget; scale-in protection while jobs running (lifecycle hook drains runner). Weekly instance refresh. Dedicated EBS volume (`/var/compile`, XFS with `prjquota` in hardening) sized for concurrency × work dir quota.
- Health: runner exposes local health (Docker reachable, disk free, last job success) → ASG health via CloudWatch alarm / custom health reporting.

## 8. Logging, monitoring, alerting, error tracking
- **Logs:** pino JSON → stdout → CloudWatch Logs (ECS awslogs driver; compile nodes via CloudWatch agent); retention 30 d (prod 90 d for audit-relevant); redaction per `SECURITY.md` §7.
- **Metrics (Prometheus format → CloudWatch EMF or Grafana Cloud):** HTTP latency/error rate by route; WS connections; autosave latency & conflict rate; compile queue depth/age, duration, success/failure by reason; sandbox container count; AI proposals by status, provider latency/error rate, tokens, cost; R2 error rate; Postgres connections/slow queries/replication lag; Redis memory/evictions(=0)/latency.
- **Alerts (page):** API 5xx > 2 % for 5 min; p95 latency > 1 s for 10 min; compile queue age p95 > 30 s for 10 min; compile `INFRA` failure rate > 5 %; zero healthy compile nodes; Postgres CPU/connection saturation, replication lag; Redis memory > 80 % or any eviction; outbox backlog > 1 h; AI provider error rate > 20 %; unexpected spend/hour; sandbox suite failure on main; integrity scan finds missing objects.
- **Dashboards:** API health, compile fleet, AI pipeline, storage/outbox, auth/security.
- **Error tracking:** Sentry (web + server + runner) with release tags and source maps (web); user-visible `requestId` links to logs.
- **Tracing:** OpenTelemetry (hardening phase) propagating `requestId`/`traceId` across API → queue → worker → runner.
- **Synthetic checks:** every 5 min: login, create+compile minimal doc in a canary project; alarm on failure.

## 9. Backups and disaster recovery
Summary (details in `STORAGE_ARCHITECTURE.md` §10): RDS automated backups + PITR (≥ 14 d prod), weekly logical dump to backups bucket, nightly asset copy to a second provider/region, quarterly restore drill, runbook for region failure (restore DB snapshot + assets in alternate region, redeploy via Terraform; target RTO ≤ 4 h for regional loss, RPO ≤ 24 h for assets/≤ 5 min DB within region).

## 10. Deployment, release and rollback
- **Blue/green or rolling** for ECS (min healthy 100 %, max 200 %); ALB health checks `/readyz`; WebSocket draining via connection draining + client auto-reconnect.
- **Feature flags** (env/DB-backed): `AI_ENABLED`, `COMPILE_ENABLED`, per-provider enable, `AUTO_COMPILE`, `PROJECT_SHARING`.
- **Rollback:** (1) flip flag if feature-level; (2) redeploy previous image digest (ECS) — automatic on failed canary alarm; (3) compile fleet: revert launch template version + instance refresh; (4) schema: forward-fix only; expand/contract guarantees N−1 compatibility.
- Release notes + changelog generated from conventional commits.
- **Maintenance:** TeX Live image bump = new image tag → CI golden tests → staging bake → canary on 1 prod node → fleet.

## 11. Infrastructure cost estimates

> **Estimates for planning only.** Prices are approximate on-demand figures (USD/month, rounded) from memory of public pricing, vary by region (`ap-south-1` typically higher than `us-east-1`), and **must be re-checked with the AWS Pricing Calculator and Cloudflare/LLM provider pricing pages before committing**. Fixed and variable costs are separated.

### 11.1 Assumptions
- Active users (monthly): 100 / 1,000 / 10,000. 20 % weekly-active concurrency peak ≈ 5 % simultaneous.
- Per active user per month: 60 compiles (avg 8 s CPU-time on 1 vCPU), 15 AI edit requests (avg ~12k input + 2k output tokens), 150 MB stored (mostly assets), 2 GB PDF reads (R2 egress free).
- LLM blended cost assumed **$0.03–$0.08 per proposal** (mid-tier model with prompt caching); heavy-model usage multiplies this. Free tier caps AI to limit exposure.
- Compile capacity: each node (4 vCPU) sustains ~3 concurrent jobs; peak concurrency = 5 % of users × 1 job.

### 11.2 Fixed infrastructure (mostly independent of usage)

| Component | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|
| App compute (web+api+worker) | 1 × small EC2 (t4g.medium) ≈ $25 | 4 Fargate tasks (0.5–1 vCPU) ≈ $90 | 12–16 Fargate tasks ≈ $450 |
| ALB (+ WAF from staging up) | $20 (no WAF) | $45 | $120 |
| PostgreSQL (RDS) | db.t4g.small single-AZ ≈ $30 | db.t4g.large Multi-AZ ≈ $250 | db.m6g.xlarge Multi-AZ + replica ≈ $900 |
| Redis | self-hosted on app host $0 | cache.t4g.small × 2 ≈ $50 | cache.m6g.large × 2 ≈ $300 |
| Networking (NAT, data transfer, logs) | $15 | $90 | $450 |
| Monitoring/error tracking (Sentry/Grafana tiers) | $0–25 | $50 | $250 |
| Terraform state, ECR, Secrets Manager, misc | $10 | $20 | $50 |
| **Fixed subtotal (≈)** | **$100–125** | **$600** | **$2,500** |

### 11.3 Variable costs

| Component | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|
| **Compile fleet** (EC2; min 1–2 nodes then autoscale) | 1 × c7i.large ≈ $65 | 2–3 × c7i.xlarge ≈ $260–390 | 10–16 × c7i.xlarge (avg, with autoscale) ≈ $1,300–2,100 |
| **R2 storage** (≈150 MB/user; $/GB-month) | ~15 GB → ~$0 (free tier) | ~150 GB ≈ $2–3 | ~1.5 TB ≈ $22 |
| R2 operations (A/B classes) | ~$0 | ~$5 | ~$50 |
| Backup copy (second provider) | ~$1 | ~$5 | ~$40 |
| **LLM** (15 proposals/user/mo × $0.03–0.08) | $45–120 | $450–1,200 | $4,500–12,000 (cap with plans/quotas) |
| Email (SES/Postmark) | ~$1 | ~$5 | ~$40 |
| **Variable subtotal (≈)** | **$110–185** | **$720–1,600** | **$6,000–14,000** |

### 11.4 Totals

| | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|
| Fixed + compile infrastructure | ~$165–190 | ~$860–990 | ~$3,800–4,600 |
| LLM (variable, controllable) | $45–120 | $450–1,200 | $4,500–12,000 |
| **All-in monthly (≈)** | **$210–310** | **$1,300–2,200** | **$8,300–16,600** |

Cost levers: AI is the dominant variable cost → plan quotas, cheaper default model, section-scoped context, prompt caching; compile cost → cache hits (`inputHash`), latest-wins coalescing, per-plan timeouts; use Savings Plans/Reserved for steady baseline at ≥ 1,000 users; R2's zero egress keeps PDF delivery cheap.

## 12. Production readiness checklist

**Security & compliance**
- [ ] Compile sandbox suite green on the production image digest; gVisor/rootless decision implemented or risk-accepted (ADR-014)
- [ ] WAF, TLS, HSTS, CSP, CORS verified; separate user-content domain live
- [ ] Secrets in Secrets Manager; rotation runbooks tested; no secrets in repo/images/logs
- [ ] Authz matrix + IDOR tests green; audit logging verified
- [ ] Privacy policy/ToS (compute-abuse clause), data deletion & export processes, LLM provider data-handling reviewed

**Reliability**
- [ ] Multi-AZ RDS, Redis replica, ≥ 2 app tasks, ≥ 2 compile nodes
- [ ] Backups + PITR enabled; **restore drill completed** (DB + assets)
- [ ] Failure-injection tests passed (Redis, R2, DB, runner, LLM)
- [ ] Reconciler, outbox runner, reapers deployed and alarmed
- [ ] Graceful shutdown/drain verified for api, worker, runner

**Performance**
- [ ] Load tests meet targets (`TESTING_STRATEGY.md` §10)
- [ ] DB indexes verified with `EXPLAIN` on hot queries; autovacuum settings applied
- [ ] Web performance budget met (JS size, LCP)

**Observability & operations**
- [ ] Dashboards, alerts, on-call rota and runbooks (compile outage, LLM outage, DB failover, R2 outage, queue backlog, sandbox incident)
- [ ] Synthetic canary running; Sentry releases/sourcemaps wired
- [ ] Cost alarms (AWS Budgets, LLM provider spend caps)

**Release**
- [ ] CI/CD with approvals and automatic rollback tested (including a deliberate bad deploy)
- [ ] Feature flags/kill switches tested (`AI_ENABLED`, `COMPILE_ENABLED`)
- [ ] E2E suite (incl. AI-1…AI-8) green on staging
- [ ] Docs current: runbooks, `.env.example`, onboarding guide
