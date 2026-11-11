# STORAGE_ARCHITECTURE.md

Cloudflare R2 (S3-compatible API) for binary and derived objects; PostgreSQL for text sources and all metadata. Local development uses MinIO behind the same `StorageService` interface.

---

## 1. What lives where

| Data | Store | Reason |
|---|---|---|
| `.tex`, `.bib`, `.sty`, `.cls`, `.bst`, `.txt`, `.md`, `.csv` (current content) | **PostgreSQL** `documents.content` | Transactional revisioning, AI proposals, diffing, search. ≤ 2 MiB each. |
| Document versions (text) | **PostgreSQL** `document_versions` | Atomic with accept/restore; small. |
| Images (`png jpg jpeg gif pdf eps svg*`), fonts (`ttf otf`), data files > 2 MiB, other binaries | **R2** (`uploaded_assets.object_key`) | Large/binary; never in Postgres. (*SVG is stored but not usable by pdfLaTeX without conversion; see §5.) |
| Uploaded PDFs (figures) | **R2** | Same as other binaries. |
| Compiled PDFs | **R2** | Derived, regenerable. |
| SyncTeX files (`.synctex.gz`) | **R2** | Derived. |
| Compile logs (raw `.log`) | **R2** | Large, rarely read; parsed diagnostics are in Postgres (`compilation_logs`). |
| Compile input text bundles | **R2** (`inputs.tar.gz`, short retention) | Immutable snapshot handed to the runner. |
| Project exports (`.zip`) | **R2** (TTL 7 days) | Generated on demand. |
| Project snapshot manifests | **PostgreSQL** (`project_snapshots.manifest`) | Reference doc versions + immutable assets; no copy. |
| Avatars | **R2** (`public-ish` prefix) | Small. |

**Invariant:** Postgres rows are the authority on what exists. An R2 object without a referencing row is garbage; a row pointing at a missing object is an integrity incident (alerted).

## 2. Buckets and domains

| Bucket | Purpose | Public? |
|---|---|---|
| `texly-{env}-projects` | All project objects (assets, artifacts, inputs, exports) | **Private**; presigned URLs only |
| `texly-{env}-backups` | Nightly backup copies of `assets/` (second region/provider, see §10) | Private |

User-served content (PDF, images) is delivered from a **separate, cookie-less custom domain** (e.g., `files.texly-usercontent.com`, mapped to the R2 bucket via R2 custom domain/Worker route) so that any active content a user manages to upload can never execute in the application's origin. Presigned URLs are generated against the S3 API endpoint or the custom domain according to the final Cloudflare setup (verify custom-domain presigned-URL support at implementation; fallback: serve through the S3 endpoint with strict response headers).

CORS on the projects bucket: allow `GET`, `HEAD` from the web origin(s) (for PDF.js `fetch`, with `Range`), and `PUT` from the web origin for upload presigned URLs; expose `ETag`, `Content-Length`, `Accept-Ranges`, `Content-Range`.

## 3. Object key conventions

All keys are lowercase UUID segments (no user-controlled strings in keys → no path traversal / injection, no PII).

```
ws/{workspaceId}/p/{projectId}/
  assets/{assetId}/original                      # uploaded binary (immutable)
  compilations/{compilationId}/output.pdf
  compilations/{compilationId}/output.synctex.gz
  compilations/{compilationId}/compile.log
  compilations/{compilationId}/inputs.tar.gz     # immutable text bundle, TTL 24h
  exports/{exportId}.zip                         # TTL 7d
tmp/uploads/{uploadId}                           # reserved; not used if direct-to-final-key (see §6)
u/{userId}/avatar/{sha256}                       # avatars
```

Rules:
- The **original filename never appears in a key**; it is metadata (`uploaded_assets.original_name`) and appears only in `Content-Disposition` on download.
- Assets are immutable. Replacing an image = new `assetId`; the file node's asset pointer changes in a transaction. This makes content-addressed caching on compile nodes and snapshot references safe.
- A project's namespace is a prefix: listing/deleting by `ws/{w}/p/{p}/` is how project deletion and quota audits work.

## 4. Access control

- **The bucket is never public.** Clients receive **presigned URLs** minted by the API *after* an authorization check (`role ≥ VIEWER` for reads; `≥ EDITOR` for uploads).
- **TTLs:** download URLs 5 min (PDF) / 60 s (asset redirect); upload URLs 10 min; runner URLs 15 min (single-use semantics by TTL).
- **R2 credentials:** two scoped API tokens — (a) *server* token with object read/write on the projects bucket; (b) *backup* token with read on projects + write on backups bucket (used only by the backup job). **Compile runners have no R2 credentials.**
- **Response headers** (set via `ResponseContentType`/`ResponseContentDisposition` on presign, or bucket/Worker rules): PDFs `application/pdf` + `inline`; everything else `attachment` unless it is a sniff-verified raster image; always `X-Content-Type-Options: nosniff`; `Content-Security-Policy: sandbox` on user-content domain.
- URLs are bearer tokens: never logged, never persisted, never put in emails.

## 5. Upload policy

| Check | Rule |
|---|---|
| Allowed extensions (binary) | `png jpg jpeg gif pdf eps svg ttf otf` (MVP). `.bst .sty .cls .bib .tex` are **text** and go to Postgres. WebP is rejected (not supported by the TeX engines) |
| Size | ≤ 25 MiB free / 100 MiB paid per file; project total quota enforced at `init` |
| MIME | Server **sniffs** magic bytes after upload (ranged GET of first 4 KiB); client-claimed type is ignored. Mismatch → asset `FAILED`, object deleted |
| Image dimensions | Read from headers (PNG/JPEG/GIF) without decoding pixels; reject > 20,000 px on either side or > 100 MP (decompression-bomb guard for pdfLaTeX) |
| SVG | Accepted as an asset (for future conversion pipeline) but flagged `compilable=false` in UI until converted; never served inline |
| Archives | `.zip` accepted only through the **project import** flow (post-MVP) with zip-slip, symlink, absolute-path and zip-bomb (ratio/size/file-count) protections |
| Antivirus | Out of scope for MVP; hook point: `assets.postProcess` queue; ClamAV or a managed scanning service in hardening |

## 6. Upload workflow (direct-to-R2 with server-side verification)

```mermaid
sequenceDiagram
  participant C as Browser
  participant A as API
  participant DB as PostgreSQL
  participant R as R2
  C->>A: POST /projects/:id/assets/uploads {name, size, declaredType, parentId}
  A->>A: authz, quota, name/ext validation
  A->>DB: INSERT project_files (FILE, BINARY) + uploaded_assets(PENDING, objectKey)
  A-->>C: {assetId, uploadUrl (presigned PUT, 10 min), headers}
  C->>R: PUT bytes (progress UI; multipart for > 100 MiB post-MVP)
  C->>A: POST /projects/:id/assets/uploads/:assetId/complete
  A->>R: HEAD object (size) + ranged GET 4KiB (sniff, image dims)
  A->>DB: UPDATE uploaded_assets READY (sha256 computed by background job or from checksum header)
  A-->>C: file node + asset metadata
  A-->>C: WS file.tree.changed to project room
  Note over A,R: PENDING > 24h or FAILED -> reaper deletes object + rows
```

Details:
- **sha256:** the client sends `x-amz-checksum-sha256` on PUT (S3-compatible; verify R2 support for the additional checksum headers at implementation). If unavailable, a background job streams the object once and stores `sha256` (compile cache needs it; runner re-verifies after download).
- **Size enforcement:** presigned PUT cannot hard-cap body size, so `complete` verifies `Content-Length` ≤ declared ≤ quota; oversize objects are deleted and the asset marked `FAILED`. A lifecycle rule aborts incomplete multipart uploads after 1 day.
- **Idempotency:** `complete` is idempotent on `assetId`.
- **Drag-and-drop** uses the same API per file; the UI queues up to 3 concurrent uploads.

## 7. Download workflows

| Resource | Flow |
|---|---|
| PDF preview | `GET /compilations/:id/pdf` → `{url, expiresAt}` (JSON) → PDF.js loads with Range requests directly from R2. Cache the URL in memory until 30 s before expiry. |
| Asset (image preview/download) | `GET /projects/:pid/files/:fid/download` → `302` to presigned URL (60 s). |
| Compile log | `GET /compilations/:id/log` → parsed diagnostics JSON; `?raw=1` → `302` presigned. |
| Export zip | `POST /projects/:id/exports` → async job builds zip (streams from DB + R2 into R2) → `GET …/exports/:eid` → presigned URL. (post-MVP) |

## 8. Compile-runner object access (no credentials)

The API mints, per compilation: one presigned GET for `inputs.tar.gz`, one presigned GET per binary asset in the manifest, and presigned PUTs for `output.pdf`, `output.synctex.gz`, `compile.log`. The runner treats these URLs as opaque. It never learns bucket names or credentials. Details in `COMPILATION_ENGINE.md` §6.

## 9. Consistency between PostgreSQL and R2

R2 and Postgres cannot share a transaction. The design enforces **"DB intent first, object second, verify third"** for creates and **"DB tombstone first, object delete later via outbox"** for deletes.

| Operation | Protocol | Failure handling |
|---|---|---|
| **Upload** | 1) `PENDING` row (key allocated) 2) client PUT 3) `complete` verifies object then flips to `READY` | Crash after 1: PENDING reaper (24 h) deletes row + any object. Crash after 2: same. Crash during 3: retry is idempotent. |
| **Compile artifacts** | Runner PUTs artifacts; result message names keys; ingest worker `HEAD`s each key before marking `SUCCEEDED` | Missing/short object → compilation `FAILED(INFRA)`; keys that were written are queued for deletion. |
| **Delete asset/file/project** | Same transaction as the DB change: set `deletedAt`/status `DELETING` and insert `storage_deletion_tasks(objectKey, runAfter)` | Outbox runner (every minute, `FOR UPDATE SKIP LOCKED`) issues `DeleteObject`; `404` counts as success; failures retried with exponential backoff, alert after 10 attempts. |
| **Replace asset** | New asset row + node pointer swap in one transaction; old asset's deletion task scheduled with grace period | — |
| **Project duplicate** | Copy rows; assets copied **server-side** with S3 `CopyObject` to new keys *before* the transaction commits; failures delete partial copies | Copy keys are registered as PENDING deletion tasks first, cancelled on commit (so crashes self-clean). |

**Reconciliation jobs (nightly, `storage-gc` queue):**
1. *Orphan scan:* list `ws/*/p/{id}/assets/` objects ↔ `uploaded_assets`; objects with no live row older than 48 h → deletion tasks (dry-run mode first in production).
2. *Missing scan:* `READY` assets whose `HEAD` returns 404 → raise alert (`storage.integrity.missing`) and mark asset `FAILED` so compilation fails with a clear message rather than a TeX error.
3. *Quota recompute:* `projects.storage_bytes` recomputed from `uploaded_assets` + `documents.size_bytes`.
4. *Artifact retention:* compilations older than retention → delete artifacts (R2 lifecycle rules additionally expire `compilations/*/inputs.tar.gz` after 1 day and `exports/*` after 7 days as a safety net).

## 10. Quotas, cleanup, backup and recovery

### Quotas (config-driven; defaults)
| | Free | Pro |
|---|---|---|
| Storage per workspace | 1 GiB | 25 GiB |
| Project size | 200 MiB | 1 GiB |
| Max single asset | 25 MiB | 100 MiB |
| Files per project | 500 | 2,000 |
| Compile artifacts retained | last 20 / 7 d | last 50 / 30 d |

Checked at `uploads/init` (reserve) and again at `complete`. Soft-deleted content counts toward quota until physically deleted.

### Temporary files
- R2 lifecycle rules: abort incomplete multipart uploads (1 d), expire `inputs.tar.gz` (1 d), `exports/` (7 d).
- Runner scratch directories are deleted in `finally`; a reaper removes any older than 10 minutes.

### Backup and recovery
| Data | Backup | RPO / RTO |
|---|---|---|
| PostgreSQL (text, versions, metadata) | RDS automated backups + PITR (14–35 d) + weekly logical dump to the backups bucket | RPO ≤ 5 min, RTO ≤ 1 h |
| User-uploaded assets (`assets/`) | **Nightly incremental copy to `texly-{env}-backups` in a second provider/region** (e.g., `rclone` sync job, or R2→S3 copy). R2 is not assumed to offer S3-style object versioning — confirm in Cloudflare docs at implementation; the 7–30 day deletion grace period + DB tombstones are the first line of defense against accidental deletes. | RPO ≤ 24 h, RTO hours |
| Derived artifacts (PDF/log/synctex) | **Not backed up** — regenerated by recompiling from Postgres + assets | n/a |

Recovery drills (quarterly): restore Postgres to a point-in-time into staging, restore a sample project's assets from backup, run integrity scan, compile project and compare PDF page count.

## 11. Cost notes (see `DEPLOYMENT.md` for estimates)
R2 has no egress fees; costs are storage (per GB-month) and operation classes (Class A writes/lists, Class B reads). Dominant operations: PDF PUT per compile, PDF GETs (PDF.js uses Range requests, many small GETs per view). Mitigations: cache presigned URL per compilation, reuse `compilations.inputHash` cache hit to avoid re-uploading identical PDFs, keep retention short. **Verify current R2 pricing and free tier on Cloudflare's pricing page when budgeting.**

## 12. Interfaces (for parallel development)

`StorageService` (in `apps/server/src/infrastructure/storage`), implemented by `R2StorageService` and `MinioStorageService` (same S3 client, different endpoint):

```
buildKey.asset(ws, project, asset)           -> string
buildKey.compilation(ws, project, cid, name) -> string
presignPut(key, {contentType?, maxBytes?, ttl, checksumSha256?}) -> {url, headers}
presignGet(key, {ttl, downloadName?, contentType?, inline?})      -> url
head(key)               -> {size, etag, contentType, lastModified} | null
getRange(key, from, to) -> Buffer
copy(srcKey, dstKey)    -> void
delete(key)             -> void            // 404 == success
listPrefix(prefix, {limit, cursor}) -> {keys[], next}
```

Contract tests run the same suite against MinIO in CI to catch S3-compat assumptions early; a smaller smoke suite runs against a real R2 bucket in staging.
