# API_SPECIFICATION.md

REST over HTTPS, JSON, base path **`/api/v1`**. Request/response shapes are defined once as Zod schemas in `packages/shared` and an OpenAPI 3.1 document is generated from them in CI (published as an artifact; used for client typing and contract tests). WebSocket events are specified in `SYSTEM_ARCHITECTURE.md` §9.

---

## 0. Conventions

### 0.1 Authentication
- `Authorization: Bearer <accessToken>` on every endpoint except those marked **public**.
- Refresh token is an `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` cookie named `rt`.
- Roles referenced: `VIEWER < COMMENTER < EDITOR < OWNER` (project roles). "member" = any project role.

### 0.2 Envelopes
```jsonc
// success
{ "data": { }, "meta": { "requestId": "…", "nextCursor": "…" } }
// error
{ "error": { "code": "REVISION_CONFLICT", "message": "Human-readable", "details": { }, "requestId": "…" } }
```

### 0.3 Standard errors (apply to every endpoint unless stated)
| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON / headers |
| 401 | `UNAUTHENTICATED` / `TOKEN_EXPIRED` | Missing/invalid/expired access token |
| 403 | `FORBIDDEN` | Authenticated but insufficient project role |
| 404 | `NOT_FOUND` | Resource missing **or** not visible to the caller (no existence leak) |
| 409 | `CONFLICT` (+ specific codes below) | State conflict |
| 413 | `PAYLOAD_TOO_LARGE` | Body/file over limits |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Non-JSON where JSON required |
| 422 | `VALIDATION_FAILED` | Zod validation failure; `details.fields[]` |
| 429 | `RATE_LIMITED` | `Retry-After` header set |
| 500 | `INTERNAL` | Unexpected; `requestId` for support |
| 503 | `SERVICE_UNAVAILABLE` | Dependency down (Redis/R2/DB); `Retry-After` |

### 0.4 Pagination, idempotency, IDs
- Cursor pagination: `?limit=` (default 25, max 100) & `?cursor=`; response `meta.nextCursor`.
- `Idempotency-Key: <uuid>` accepted on `POST` of compilations, AI messages, proposal accept/reject, uploads init; replays within 24 h return the original response.
- All IDs are UUIDv7 strings. Timestamps are ISO-8601 UTC.

### 0.5 Conditional/optimistic concurrency
Document content writes use `baseRevision` in the body (not ETag) so conflicts carry structured details.

---

## 1. Authentication

### POST `/auth/register` — public
- **Rate limit:** 5/hour/IP.
- **Request:** `{ "email": "a@b.com", "password": "≥10 chars", "name": "Yuvraj" }`
- **Validation:** email RFC-valid, normalized lowercase, ≤ 254; password 10–128, not in breached-password list; name 1–120.
- **201:** `{ "data": { "user": {id,email,name,emailVerified:false}, "accessToken": "…", "expiresIn": 900 } }` + `Set-Cookie: rt=…`
- **Errors:** `409 EMAIL_TAKEN` (see enumeration note), `422`, `429`.
- **DB:** insert `users` (argon2id hash), `user_settings`, personal `workspaces` + `workspace_members(OWNER)`, `subscriptions(FREE)`, `sessions`, `verification_tokens(EMAIL_VERIFY)`; enqueue email. One transaction.
- **Note:** to limit enumeration, production may return `202` generic for duplicates and email the existing owner; decision tracked in ADR-018 (MVP: `409`).

### POST `/auth/login` — public
- **Rate limit:** 10/min/IP + 5 failures/15 min/account (then exponential delay).
- **Request:** `{ "email", "password" }`
- **200:** same as register response.
- **Errors:** `401 INVALID_CREDENTIALS` (identical message for unknown email/wrong password), `403 ACCOUNT_DISABLED`, `429`.
- **DB:** read user; verify argon2id; insert `sessions` (new family); update `last_login_at`.

### POST `/auth/refresh` — public (cookie)
- **Request:** none (cookie `rt`). Requires `Origin` header ∈ allowed web origins.
- **200:** `{ "data": { "accessToken", "expiresIn" } }` + rotated `Set-Cookie`.
- **Errors:** `401 REFRESH_INVALID` (unknown/expired), `401 REFRESH_REUSED` (rotated token reused → whole `familyId` revoked, cookie cleared).
- **DB:** lookup by `token_hash`; mark old `revoked_at/replaced_by_id`; insert new session in same family.

### POST `/auth/logout` — member (any authenticated)
- **Request:** `{ "everywhere": false }` (optional; `true` revokes all sessions)
- **204.** Clears cookie. **DB:** set `revoked_at` on current family (or all user sessions).

### GET `/auth/me`
- **200:** `{ "data": { "user": {id,email,name,avatarUrl?,emailVerified}, "workspaces": [{id,name,slug,role,isPersonal}], "settings": UserSettingsDTO, "plan": "FREE" } }`
- **DB:** user + memberships + settings + subscription.

### Additional (MVP-adjacent)
| Method & URL | Auth | Notes |
|---|---|---|
| `POST /auth/verify-email` `{token}` | public | marks `email_verified_at`; `400 TOKEN_INVALID` |
| `POST /auth/forgot-password` `{email}` | public | always `202`; email contains one-time token (SHA-256 stored, 30 min) |
| `POST /auth/reset-password` `{token, password}` | public | revokes all sessions |
| `PATCH /users/me` `{name?, avatar?}` | user | |
| `GET /users/me/settings`, `PATCH /users/me/settings` | user | partial update of `UserSettingsDTO` (`theme`, `editorFontSize`, `keymap`, `defaultModelId`, `autoCompile`, `layout`) |

---

## 2. Workspaces and projects

### GET `/workspaces` — user
List workspaces for the caller. **200** `{data:[{id,name,slug,role,isPersonal,usage:{storageBytes,quota}}]}`. **DB:** `workspace_members` join `workspaces`.

### POST `/projects` — user (needs `workspaceId` membership)
- **Request:** `{ "workspaceId", "name", "description?", "template": "blank|article|report|beamer|ieee-conference|resume", "engine?": "PDFLATEX|XELATEX|LUALATEX" }`
- **Validation:** name 1–160; template ∈ allowlist; project count ≤ plan limit.
- **201:** `{ "data": ProjectDTO }` where `ProjectDTO = {id, workspaceId, name, description, engine, bibTool, mainFileId, autoCompile, role, storageBytes, createdAt, updatedAt, trashedAt}`
- **Errors:** `403`, `409 PROJECT_LIMIT_REACHED`, `422`.
- **DB (single tx):** insert `projects`; `project_members(OWNER)`; template files → `project_files` + `documents` (revision 1, hash); set `main_file_id`.

### GET `/projects` — user
- **Query:** `workspaceId?`, `q?`, `trashed?=false|true`, `sort=lastOpened|updated|name`, `limit`, `cursor`.
- **200:** `{data:[ProjectDTO], meta:{nextCursor}}`
- **DB:** `project_members(user_id)` join `projects`; index `(user_id,last_opened_at)`.

### GET `/projects/:projectId` — member
- **200:** `{data: ProjectDTO & { members?: [..] }}`; updates `project_members.last_opened_at` (throttled).
- **Errors:** `404` (also for non-members).

### PATCH `/projects/:projectId` — EDITOR (settings) / OWNER (name, description)
- **Request:** any of `{ name, description, engine, bibTool, mainFileId, autoCompile }`
- **Validation:** `mainFileId` must be a live TEXT `.tex` file in the project (`422 INVALID_MAIN_FILE`).
- **200:** `ProjectDTO`. **DB:** update `projects`; audit if engine/main changed.

### DELETE `/projects/:projectId` — OWNER
- Soft delete (`trashed_at`); `204`. Permanent deletion after 30 days by job (`?permanent=true` allowed for OWNER after trashing).
- **DB:** `projects.trashed_at`; on permanent: cascade delete + `storage_deletion_tasks` for every object key.

### POST `/projects/:projectId/restore` — OWNER (from trash) → `200 ProjectDTO`.

### POST `/projects/:projectId/duplicate` — VIEWER+ (copies into caller's workspace) — post-MVP
- **Request:** `{ name?, workspaceId? }` → `202 {data:{jobId}}`; assets copied server-side (`STORAGE_ARCHITECTURE.md` §9).

### Members and invites
| Method & URL | Auth | Request → Response | Errors / DB |
|---|---|---|---|
| `GET /projects/:id/members` | member | → `[{userId,name,email,role,since}]` | `project_members` join `users` |
| `POST /projects/:id/invites` | OWNER | `{email, role: EDITOR\|COMMENTER\|VIEWER}` → `201 {inviteId, status}` (email sent) | `409 ALREADY_MEMBER`, `409 INVITE_PENDING`; insert `project_invites` (token hashed, 7 d) |
| `GET /projects/:id/invites` | OWNER | → pending invites | |
| `DELETE /projects/:id/invites/:inviteId` | OWNER | → `204` | status `REVOKED` |
| `POST /invites/accept` | user | `{token}` → `200 {projectId}` | `400 INVITE_INVALID/EXPIRED`; insert `project_members`, invite `ACCEPTED` |
| `PATCH /projects/:id/members/:userId` | OWNER | `{role}` → `200` | `409 LAST_OWNER` |
| `DELETE /projects/:id/members/:userId` | OWNER, or self (leave) | → `204` | `409 LAST_OWNER` |
| `POST /projects/:id/transfer-ownership` | OWNER | `{userId}` → `200` | post-MVP |

---

## 3. Files, documents and assets

`ProjectFileDTO = { id, parentId, name, path, nodeType: "FILE"|"FOLDER", kind: "TEXT"|"BINARY"|null, sizeBytes, mimeType, documentId?, assetId?, revision?, updatedAt }`

### GET `/projects/:projectId/files` — member
- **200:** `{data:{ files: ProjectFileDTO[], mainFileId }}` (flat list, ≤ 2,000; client builds tree).
- **DB:** `project_files` where `deleted_at IS NULL` + left join documents (revision) / assets.

### POST `/projects/:projectId/files` — EDITOR *(creates folders and empty/initial text documents)*
- **Request:** `{ "nodeType": "FOLDER" | "FILE", "parentId": "uuid|null", "name": "chapter1.tex", "content?": "…" }` (`FILE` ⇒ TEXT only here; binary uses the upload flow)
- **Validation:** name rules (`DATABASE_DESIGN.md` §5), extension ∈ text allowlist, depth ≤ 12, sibling case-insensitive uniqueness, count/size quotas, `content` ≤ 2 MiB.
- **201:** `ProjectFileDTO` (+ `documentId`, `revision:1`).
- **Errors:** `409 NAME_TAKEN`, `409 FILE_LIMIT_REACHED`, `422 INVALID_NAME`, `404 PARENT_NOT_FOUND`.
- **DB tx:** insert `project_files` (+ `documents` with hash). WS `file.tree.changed`.

### PATCH `/projects/:projectId/files/:fileId` — EDITOR *(rename / move)*
- **Request:** `{ "name?": "…", "parentId?": "uuid|null" }`
- **Validation:** same naming rules; cannot move folder into its own descendant (`422 INVALID_MOVE`); changing extension of a TEXT file between `.tex`→other allowed, TEXT↔BINARY forbidden.
- **200:** updated `ProjectFileDTO` (and `affected: [{id,path}]` for descendants).
- **Errors:** `409 NAME_TAKEN`.
- **DB tx:** update node; rewrite `path` of all descendants (`path LIKE old/%`); if it's the main file keep `main_file_id`. **Side effect:** open editors for affected paths update from the `file.tree.changed` event.

### DELETE `/projects/:projectId/files/:fileId` — EDITOR
- **204.** Soft delete node + descendants; if it is the main file → project `main_file_id = NULL` and response header `X-Main-File-Cleared: true`; assets enqueue deletion tasks with grace.
- **Errors:** `409 PENDING_PROPOSAL` if an active AI proposal targets a document in the subtree (user must resolve first).

### Documents

`DocumentDTO = { id, fileId, projectId, path, content, contentHash, revision, sizeBytes, updatedAt, updatedBy? }`

| Method & URL | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `POST /projects/:pid/documents` | EDITOR | `{parentId?, name, content?}` | `201 DocumentDTO` | Alias of `POST /files` with `nodeType=FILE`, returns document. |
| `GET /projects/:pid/documents/:docId` | member | `?includeContent=true` | `200 DocumentDTO` | **DB:** `documents` by PK scoped `project_id`. |
| `PUT /projects/:pid/documents/:docId/content` | EDITOR | see below | `200 {revision, contentHash, updatedAt}` | **Autosave.** |
| `PATCH /projects/:pid/documents/:docId` | EDITOR | `{name?, parentId?}` | `200` | Delegates to file rename/move. |
| `DELETE /projects/:pid/documents/:docId` | EDITOR | — | `204` | Delegates to file delete. |
| `GET /projects/:pid/documents/:docId/active-proposal` | member | — | `200 ProposalDTO\|null` | Used to re-enter review mode after refresh. |

**`PUT …/content`**
- **Request:** `{ "baseRevision": 12, "content": "…", "clientHash": "sha256-hex (optional)" }` (gzip request body allowed)
- **Validation:** `baseRevision` int ≥ 1; content valid UTF-8, no NUL, ≤ 2 MiB (`413`), CRLF normalized to LF; if `clientHash` provided it must match server-computed hash (`422 HASH_MISMATCH`).
- **200:** `{ "data": { "revision": 13, "contentHash": "…", "updatedAt": "…", "unchanged": false } }`
- **Errors:** `409 REVISION_CONFLICT` with `details:{ serverRevision, serverHash, updatedBy, updatedAt }`; `409 DOCUMENT_UNDER_REVIEW` is **not** returned (review mode is client-side; server-side concurrency is handled by the accept check); `403` for VIEWER/COMMENTER.
- **DB:** conditional `UPDATE … WHERE id AND revision = baseRevision` (`DATABASE_DESIGN.md` §8.2); recompute `symbols`; maybe insert `CHECKPOINT` version; emit WS `document.revision.changed`.
- **Rate limit:** 60/min/user.

### Search and index
| Method & URL | Auth | Response |
|---|---|---|
| `GET /projects/:pid/index` | member | `{ files: [{path, headings[], labels[], cites[], inputs[], packages[]}], bibEntries: [{key,title,year}], labels: [{key,path,line}] }` aggregated from `documents.symbols` (cached by max revision). Feeds autocomplete/outline. |
| `GET /projects/:pid/search?q=&regex=false&case=false&path=` | member | `{matches:[{path,line,col,preview}], truncated}` (≤ 200 matches). **DB:** `documents.content ILIKE` using trigram index (Phase 10). |

### Assets (uploads and downloads) — see `STORAGE_ARCHITECTURE.md` §6–7

**POST `/projects/:projectId/assets/uploads`** — EDITOR *(init)*
- **Request:** `{ "name": "fig1.png", "sizeBytes": 483920, "declaredType": "image/png", "parentId": "uuid|null" }`
- **Validation:** extension ∈ binary allowlist; size ≤ plan max and ≤ remaining quota; name rules.
- **201:** `{ "data": { "assetId", "fileId", "upload": { "method":"PUT", "url":"<presigned>", "headers":{…}, "expiresAt" } } }`
- **Errors:** `409 NAME_TAKEN`, `413 ASSET_TOO_LARGE`, `409 QUOTA_EXCEEDED`, `422 UNSUPPORTED_FILE_TYPE`.
- **DB tx:** `project_files` + `uploaded_assets(PENDING)`.

**POST `/projects/:projectId/assets/uploads/:assetId/complete`** — EDITOR
- **Request:** `{ "sha256?": "hex" }` → **200** `ProjectFileDTO` (+asset metadata).
- **Errors:** `409 UPLOAD_NOT_FOUND` (object missing), `422 ASSET_VERIFICATION_FAILED` (size/magic/dimension), `409 ASSET_ALREADY_COMPLETE` (idempotent: returns 200 with same body).
- **DB:** verify via `HEAD` + ranged GET; update asset `READY`, project `storage_bytes`.

**DELETE `/projects/:projectId/assets/uploads/:assetId`** — EDITOR: cancel pending upload → `204`.

**GET `/projects/:projectId/files/:fileId/download`** — member
- **302** → presigned URL (60 s) for BINARY; for TEXT returns `200` raw content with `Content-Disposition: attachment`.
- **Errors:** `404`, `409 ASSET_NOT_READY`.

**POST `/projects/:projectId/exports`** (post-MVP) → `202 {exportId}`; **GET `…/exports/:exportId`** → `{status, url?}`.

---

## 4. Compilation

`CompilationDTO = { id, projectId, status, trigger, engine, bibTool, mainFilePath, queuedAt, startedAt, finishedAt, durationMs, errorCode, errorCount, warningCount, pageCount, hasPdf, cacheHit, requestedBy }`

### POST `/projects/:projectId/compilations` — EDITOR
- **Request:** `{ "trigger": "MANUAL|AUTO|AI_ACCEPT|RESTORE", "engine?": "PDFLATEX|XELATEX|LUALATEX", "bibTool?": "AUTO|BIBTEX|BIBER|NONE", "mainFileId?": "uuid" }` (omitted = project settings)
- **Validation:** `engine` allowlisted; `mainFileId` valid TEXT `.tex`; project limits.
- **Response:** `202 {data: CompilationDTO}` (`QUEUED`) — or `201` with `SUCCEEDED` + `cacheHit:true`.
- **Errors:** `409 COMPILE_LIMIT` (concurrent), `429 RATE_LIMITED`, `422 NO_MAIN_FILE`, `422 PROJECT_TOO_LARGE`, `503 QUEUE_UNAVAILABLE`.
- **DB:** snapshot read; insert `compilations`; possibly supersede queued; enqueue job.

### GET `/projects/:projectId/compilations` — member → `{data:[CompilationDTO], meta:{nextCursor}}` (`?status=&limit=`)
### GET `/projects/:projectId/compilations/latest` — member → `CompilationDTO | null` (latest terminal, plus `active` if any)
### GET `/compilations/:compilationId` — member (resolved via project) → `CompilationDTO`
- Polling fallback; WS preferred.

### GET `/compilations/:compilationId/log` — member
- **200:** `{ "data": { "diagnostics": [{ordinal, level, file, line, message, context, kind}], "counts": {errors, warnings}, "truncated": bool, "rawLogUrl?": "…" } }` (`?raw=1` → `302` to presigned raw log).
- **Errors:** `404`, `409 LOG_NOT_AVAILABLE` (still running).
- **DB:** `compilation_logs` ordered by `ordinal`.

### GET `/compilations/:compilationId/pdf` — member
- **200:** `{ "data": { "url": "<presigned GET>", "expiresAt": "…", "sizeBytes": 123, "pageCount": 7 } }` (`?download=1` adds `Content-Disposition: attachment; filename="<project>.pdf"`).
- **Errors:** `409 NO_PDF` (failed compile without PDF), `404`.

### DELETE `/compilations/:compilationId` — EDITOR → cancel `QUEUED`/`RUNNING` (`202`); `409 ALREADY_FINISHED`.

### SyncTeX
- **POST `/compilations/:id/synctex/forward`** `{file, line, column}` → `{matches:[{page,x,y,width,height}]}`
- **POST `/compilations/:id/synctex/inverse`** `{page, x, y}` → `{file, line, column}`
- **Errors:** `409 NO_SYNCTEX`, `504 SYNCTEX_TIMEOUT`. Rate limit 60/min.

---

## 5. AI

`ProposalDTO = { id, conversationId, documentId, status, baseRevision, model, provider, summary, diffStats:{added,removed,hunks}, validation:[{severity,code,message}], proposedContent?, errorCode?, errorMessage?, tokensIn?, tokensOut?, createdAt, expiresAt, resolvedAt?, resultRevision? }` (`proposedContent` only on `GET /ai/proposals/:id`, and only while `PENDING`)

### GET `/ai/models` — user → `{data:[{id,label,provider,tier,supportsReasoningEffort,contextWindow,default}]}` (plan-filtered)

### POST `/projects/:projectId/ai/conversations` — EDITOR
- **Request:** `{ "title?": "string" }` → `201 {data:{id,title,createdAt}}`. **DB:** insert `ai_conversations`.
- `GET /projects/:pid/ai/conversations` — EDITOR (own) → list (`updatedAt desc`).
- `PATCH …/conversations/:cid` `{title?, archived?}`; `DELETE` → archive.

### GET `/ai/conversations/:conversationId` — owner of conversation (retrieve chat history)
- **Query:** `?limit=50&cursor=`
- **200:** `{data:{ conversation, messages:[{id,role,content,model,createdAt,proposal?:ProposalSummaryDTO}], }, meta:{nextCursor}}`

### POST `/ai/conversations/:conversationId/messages` — EDITOR *(send prompt; for `mode:"edit"` this is "generate proposed changes")*
- **Request:**
```jsonc
{
  "content": "Add an abstract section before the introduction …",   // 1–8000 chars
  "mode": "edit",                                                    // "edit" (MVP) | "ask" (post-MVP)
  "documentId": "uuid",                                              // target file
  "baseRevision": 12,                                                // client's current revision (must equal server)
  "scope": { "kind": "file" },                                       // or {"kind":"selection","from":120,"to":480} | {"kind":"section","headingPath":["Introduction"]}
  "model": "provider:model-id", "reasoningEffort": "medium",
  "include": { "compileErrors": false, "attachments": ["fileId"], "supersede": false }
}
```
- **Validation:** `documentId` TEXT in project; `baseRevision` ≥ 1; scope range inside doc length; attachments are project files; model ∈ plan-enabled catalog; total attachment tokens within budget (`422 CONTEXT_TOO_LARGE`).
- **202:** `{ "data": { "message": {id,role:"USER",…}, "proposal": ProposalDTO /* QUEUED */ } }`
- **Errors:**
  - `409 REVISION_CONFLICT` — `baseRevision` ≠ server revision (client should flush autosave, refetch, retry).
  - `409 PROPOSAL_IN_PROGRESS` — `details:{proposalId,status}` unless `include.supersede=true`.
  - `409 DOCUMENT_CHANGED` — hash drift detected.
  - `422 CONTEXT_TOO_LARGE`, `429 AI_RATE_LIMITED` / `429 AI_QUOTA_EXCEEDED`, `503 AI_UNAVAILABLE`.
- **DB tx:** read document; insert user `ai_messages`; insert `ai_proposals(QUEUED, base_revision, base_content_hash)` (partial unique index guards concurrency); (supersede → old proposal `SUPERSEDED`); enqueue `ai-generate`.
- **Realtime:** `ai.proposal.updated` events follow (`GENERATING`, `PENDING|FAILED|STALE`).

### GET `/ai/proposals/:proposalId` — owner/EDITOR of project (retrieve proposal)
- **200:** `ProposalDTO` incl. `proposedContent` while `PENDING`, plus `baseContentHash`, `editOps` summary (op type, anchor line numbers) for UI tooltips.
- **Errors:** `404`, `410 PROPOSAL_EXPIRED_CONTENT` (content purged after retention).

### POST `/ai/proposals/:proposalId/accept` — EDITOR
- **Request:** `{ "expectedBaseRevision": 12 }` (must equal proposal's base; guards client/server mismatch)
- **200:** `{ "data": { "documentId", "revision": 13, "contentHash", "proposalId", "status": "ACCEPTED" } }`
- **Errors:** `409 PROPOSAL_STALE` (document advanced; proposal marked `STALE`), `409 PROPOSAL_NOT_PENDING` (`details.status`), `410 PROPOSAL_EXPIRED`, `403`.
- **DB:** accept transaction (`DATABASE_DESIGN.md` §9). **Idempotent** when already `ACCEPTED` by same user (returns same body).
- **Realtime:** `document.revision.changed` + `ai.proposal.updated`.

### POST `/ai/proposals/:proposalId/reject` — EDITOR → `200 {status:"REJECTED"}`; `409 PROPOSAL_NOT_PENDING`. **DB:** status update only; no document write.
### POST `/ai/proposals/:proposalId/cancel` — EDITOR → cancels `QUEUED|GENERATING` (`200`); worker aborts the provider call via `AbortSignal`.
### POST `/ai/proposals/:proposalId/regenerate` — EDITOR → `202 {data:{message, proposal}}` — new proposal with same prompt against **current** revision (`STALE|FAILED|EXPIRED|REJECTED` only).

---

## 6. Versions

`VersionDTO = { id, documentId, revision, source, label, sizeBytes, createdBy?, createdAt, proposalId? }`

| Method & URL | Auth | Request → Response | Errors / DB |
|---|---|---|---|
| `GET /projects/:pid/documents/:docId/versions` | member | `?limit&cursor` → `[VersionDTO]` | index `(document_id, created_at desc)` |
| `POST /projects/:pid/documents/:docId/versions` *(create snapshot)* | EDITOR | `{label?}` → `201 VersionDTO` | `409 NO_CHANGES` if identical to latest; inserts `MANUAL` version from **current** content |
| `GET /projects/:pid/documents/:docId/versions/:versionId` | member | `?includeContent=true` → `VersionDTO & {content?}` | |
| `POST /projects/:pid/documents/:docId/versions/:versionId/restore` | EDITOR | `{ baseRevision }` → `200 {revision, contentHash}` | `409 REVISION_CONFLICT`; tx: insert `PRE_RESTORE`, conditional update document to version content (revision+1), insert `RESTORE` version; **blocked** with `409 ACTIVE_PROPOSAL` if a proposal is active on the document (user must resolve it first) |
| `GET /projects/:pid/documents/:docId/versions/compare?from=<versionId\|current>&to=<versionId\|current>&format=unified\|hunks` | member | `200 {from:{…}, to:{…}, diff, stats}` | `404`; diff via jsdiff (line-level, with word-level hunks option) |
| `POST /projects/:pid/snapshots` *(project-level, post-MVP)* | EDITOR | `{label}` → `201` | manifest of live files |
| `GET /projects/:pid/snapshots` | member | list | |
| `POST /projects/:pid/snapshots/:sid/restore` | OWNER/EDITOR | `{mode:"files"|"all"}` → `202` | background job; creates new revisions, never rewrites history |

---

## 7. Comments (post-MVP, outline)

`GET /projects/:pid/documents/:docId/comments`, `POST …/comments {body, anchor:{revision,from,to,quote}, parentId?}`, `PATCH …/comments/:cid {body?|resolved?}`, `DELETE …/comments/:cid`. Roles: COMMENTER+ can create; author or OWNER can delete.

## 8. Health and ops

| Method & URL | Auth | Purpose |
|---|---|---|
| `GET /healthz` | public | liveness (process up) |
| `GET /readyz` | internal network | readiness: DB, Redis (R2 checked lazily; reported but non-fatal) |
| `GET /metrics` | internal network only | Prometheus metrics |

## 9. Endpoint summary

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/verify-email` · `POST /auth/forgot-password` · `POST /auth/reset-password` |
| User | `PATCH /users/me` · `GET /users/me/settings` · `PATCH /users/me/settings` |
| Workspaces | `GET /workspaces` |
| Projects | `POST /projects` · `GET /projects` · `GET/PATCH/DELETE /projects/:id` · `POST /projects/:id/restore` · `POST /projects/:id/duplicate`* |
| Members | `GET/PATCH/DELETE …/members(/:userId)` · `POST/GET/DELETE …/invites` · `POST /invites/accept` |
| Files | `GET/POST /projects/:id/files` · `PATCH/DELETE …/files/:fileId` · `GET …/files/:fileId/download` |
| Documents | `POST …/documents` · `GET/PATCH/DELETE …/documents/:docId` · `PUT …/documents/:docId/content` · `GET …/active-proposal` |
| Assets | `POST …/assets/uploads` · `POST …/uploads/:assetId/complete` · `DELETE …/uploads/:assetId` |
| Index/Search | `GET …/index` · `GET …/search` |
| Compilation | `POST/GET …/compilations` · `GET …/compilations/latest` · `GET/DELETE /compilations/:id` · `GET …/log` · `GET …/pdf` · `POST …/synctex/forward|inverse` |
| AI | `GET /ai/models` · `POST/GET …/ai/conversations` · `GET /ai/conversations/:id` · `POST …/messages` · `GET /ai/proposals/:id` · `POST …/accept|reject|cancel|regenerate` |
| Versions | `GET/POST …/versions` · `GET …/versions/:vid` · `POST …/restore` · `GET …/compare` · snapshots* |
| Ops | `GET /healthz` · `GET /readyz` · `GET /metrics` |

\* post-MVP

## 10. WebSockets vs polling

| Concern | Mechanism |
|---|---|
| Compilation status | **WebSocket** (`compilation.*`); polling only as fallback |
| AI proposal progress/ready | **WebSocket** (`ai.proposal.updated`); polling fallback `GET /ai/proposals/:id` |
| Document revision changes (stale detection), file-tree changes, presence | **WebSocket** |
| Autosave, all mutations, all reads | **REST** (WebSocket never mutates) |
| PDF bytes, asset bytes | **HTTPS to R2** via presigned URLs |
| Streaming AI text (ask-mode) | WebSocket `ai.message.delta` (post-MVP) |

## 11. Validation standards
- Every route declares `{ params, query, body }` Zod schemas from `packages/shared`; the `validate()` middleware rejects unknown keys (`.strict()`) with `422`.
- IDs validated as UUID before touching the DB; project-scoped lookups always include `projectId` in the `WHERE`.
- Strings trimmed/normalized (NFC) where user-visible; file names additionally checked against reserved names.
- Body size limits: global `1 MB`; `PUT …/content` `2.5 MB`; uploads bypass the API (direct to R2).
