# CONTRACTS.md — Texly Contract Changelog

This document tracks all cross-boundary contracts, DTOs, queue message payloads, and WebSocket events across the Texly monorepo. Any modifications to these contracts must follow the contract modification workflow outlined in `CODING_STANDARDS.md`.

---

## Contract Inventory & Changelog

### 1. Common API Envelopes & Pagination

- **Contract Name**: `API_ENVELOPES`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze. Success envelope `{ data, meta? }`, Error envelope `{ error: { code, message, details?, fields?, requestId? }, meta? }`, Cursor pagination `{ cursor?, limit }` / `{ nextCursor? }`.
- **Producers**: `apps/server` (Express API)
- **Consumers**: `apps/web` (Next.js TanStack Query API client)
- **Compatibility Implications**: Non-breaking initial release.

### 2. Authentication & Users

- **Contract Name**: `AUTH_USER_DTO`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for `RegisterRequest`, `LoginRequest`, `AuthTokenResponseData`, `UserDTO`, `UserSettingsDTO`, `SessionDTO`. Password hashes, salt, and token secrets are strictly omitted from all DTO contracts.
- **Producers**: `apps/server`
- **Consumers**: `apps/web`
- **Compatibility Implications**: Baseline v1.

### 3. Workspaces & Projects

- **Contract Name**: `WORKSPACE_PROJECT_DTO`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for `WorkspaceDTO`, `WorkspaceMemberDTO`, `ProjectDTO`, `ProjectMemberDTO`, `ProjectInviteDTO`. Includes project templates, LaTeX engines (`PDFLATEX`, `XELATEX`, `LUALATEX`), and bibliography tools (`AUTO`, `BIBTEX`, `BIBER`, `NONE`).
- **Producers**: `apps/server`
- **Consumers**: `apps/web`
- **Compatibility Implications**: Baseline v1.

### 4. Files & Documents

- **Contract Name**: `FILE_DOCUMENT_DTO`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for `ProjectFileDTO`, `DocumentDTO`, `PutDocumentContentRequest`, `PutDocumentContentResponseData`. Enforces UTF-8 content limits (2.5MB), optimistic concurrency via `baseRevision`, and client content hashing. Presigned asset upload flow contracts (`UploadAssetInitRequest`, `PresignedUploadDTO`).
- **Producers**: `apps/server`
- **Consumers**: `apps/web`
- **Compatibility Implications**: Baseline v1.

### 5. Compilation Queue & Runner

- **Contract Name**: `COMPILE_RUNNER_V1`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for `CompileJobV1` and `CompileResultV1`. Defines resource limits (`CompileLimits`), presigned input bundles, presigned output URLs, and structured `CompilationDiagnostic` outputs. Compile runner holds zero credentials.
- **Producers**: `apps/server` (produces `CompileJobV1`, consumes `CompileResultV1`), `apps/compile-runner` (consumes `CompileJobV1`, produces `CompileResultV1`)
- **Consumers**: `apps/server`, `apps/compile-runner`
- **Compatibility Implications**: Strict schema validation on job receive and result ingest; jobs with version mismatch are rejected.

### 6. AI Proposals & Edit Operations

- **Contract Name**: `AI_PROPOSALS_V1`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for `EditOp` (`insert_before`, `insert_after`, `replace`, `delete` with mandatory `confirmDeletion: true`), `StructuredLLMResponse`, `ProposalDTO`, `CreateAIMessageRequest`, `AcceptProposalRequest`, `DiffStats`. AI never writes directly to documents.
- **Producers**: `apps/server` (AI worker produces proposals; API serves them)
- **Consumers**: `apps/web` (Review mode merge view and AI chat panel)
- **Compatibility Implications**: Discriminated union on `op`.

### 7. Realtime WebSocket Events

- **Contract Name**: `REALTIME_EVENTS_V1`
- **Version**: `1.0.0`
- **Changelog**: Initial freeze for notification-only events: `compilation.queued`, `compilation.started`, `compilation.finished`, `ai.proposal.updated`, `document.revision.changed`, `file.tree.changed`, `project.sync`. Handshake and room management events: `project.join`, `project.leave`, `document.focus`, `auth.refresh`.
- **Producers**: `apps/server` (Socket.IO server)
- **Consumers**: `apps/web` (Socket.IO client)
- **Compatibility Implications**: Events are notification hints only; mutations always occur via REST.
