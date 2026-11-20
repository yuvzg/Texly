# Phase 06C Completion Report: Backend File System & Document Persistence

**Date:** 2026-11-20  
**Phase:** 06C  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Phase 06C establishes the complete backend foundation for Texly's project-level file system and document persistence layer.

This implementation delivers:
- **Hierarchical File Tree & Materialized Paths:** A robust tree structure supporting directories and text files up to 12 levels deep, with atomic materialized path updates across all descendants upon folder rename or move.
- **Strict Path Validation & Security Guards:** Rejection of path traversal (`..`), null bytes, control characters, illegal filesystem characters, leading hyphens, unauthorized hidden files, and case-insensitive sibling name collisions within folders.
- **Circular Reference Prevention:** Verification rejecting circular folder moves (moving a directory into itself or into any of its descendants).
- **Transactional Consistency:** Full multi-statement PostgreSQL transaction support via Prisma for file creation, renaming, moving, soft deletion, and main document management.
- **Main Document Lifecycle & Cascade Rules:** Explicit `.tex` main file selection with cascade rules ensuring that deleting the main file (or a parent folder containing it) atomically clears `project.mainFileId` to `null` and responds with `X-Main-File-Cleared: true`.
- **Revision-Controlled Document Persistence:** Optimistic concurrency control using `baseRevision` with LF newline normalization (`\r\n` → `\n`), SHA-256 hashing, 2 MiB content limit enforcement, and 409 conflict handling.
- **Realtime Integration:** Event emission (`file.tree.changed` and `document.revision.changed`) over Redis/Socket.IO to keep active editor sessions synchronized.
- **Comprehensive Test Suite:** 18 integration tests covering every file operation and edge case, alongside the existing 76 server integration tests and 76 web tests, all passing with zero regressions.

---

## 2. Architecture & Database Design

### 2.1 Model Relationships

Per `docs/DATABASE_DESIGN.md` §1 & §5:
- **`ProjectFile` (Tree Node):** Represents the file system node (`nodeType: 'FILE' | 'FOLDER'`), maintaining `name`, materialized `path`, `parentId`, `sizeBytes`, `mimeType`, and `deletedAt`.
- **`Document` (Text Content):** 1:1 relation to `ProjectFile` for `kind: 'TEXT'`, storing `content`, `contentHash` (SHA-256), `revision`, and `sizeBytes`.
- **`DocumentVersion` (Snapshot History):** Periodic and manual full-text snapshots keyed by `(documentId, revision)`.
- **`UploadedAsset` (Binary Metadata):** Metadata and R2 key for binary files.
- **`Project.mainFileId`:** Foreign key referencing a live `.tex` `ProjectFile` within the project.

### 2.2 Partial Unique Indexes

Supported by PostgreSQL migrations:
```sql
CREATE UNIQUE INDEX project_files_project_path_live_uq
  ON project_files (project_id, path) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX project_files_project_path_ci_live_uq
  ON project_files (project_id, lower(path)) WHERE deleted_at IS NULL;
```

---

## 3. Path Validation and Security Rules (`path-validator.ts`)

Located at `apps/server/src/modules/files/path-validator.ts`:

1. **Name Character Allowlist / Blocklist:**
   - Disallowed characters: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, null bytes (`\0`), and control characters (`[\x00-\x1f\x7f]`).
   - Reserved names disallowed: `.` and `..`.
   - Prohibited prefixes: leading hyphens (`-`) and leading dots (`.`) with an explicit exception for `.gitkeep`.
   - Prohibited suffixes: trailing dots (`.`) and whitespace.
   - Max name length: 255 bytes / characters.
2. **Path Materialization & Traversal:**
   - Unicode NFC normalization.
   - Backslash to slash normalization (`\` → `/`).
   - Slashes collapsed and stripped at edges.
   - Max path length: 1024 characters.
   - Max depth: 12 segments (maximum 11 `/` delimiters).
3. **Circular Move Prevention:**
   - Detects if `targetParentPath === sourcePath || targetParentPath.startsWith(sourcePath + '/')`.
   - Rejects with `422 INVALID_MOVE`.
4. **Allowed Text File Extensions:**
   - Allowlist: `.tex`, `.bib`, `.sty`, `.cls`, `.bst`, `.txt`, `.md`, `.csv` (and `.gitkeep`).
   - Disallowed extensions rejected with `422 UNSUPPORTED_FILE_TYPE`.

---

## 4. Endpoints & API Specifications

Mounted under `/api/v1/projects/:projectId/files`:

| Method | Endpoint | Access | Description | Status |
|---|---|---|---|---|
| `GET` | `/` | Member | Flat list of active project files + `mainFileId` | `200` |
| `POST` | `/` | Editor/Owner | Create folder or text file (initial content, revision 1) | `201` |
| `GET` | `/:fileId` | Member | Get details of single file node | `200` |
| `PATCH` | `/:fileId` | Editor/Owner | Rename or move file/directory (atomic descendant rewrite) | `200` |
| `DELETE` | `/:fileId` | Editor/Owner | Soft-delete file/directory subtree (main file cleanup) | `204` |
| `POST` | `/:fileId/restore` | Editor/Owner | Restore soft-deleted file/directory | `200` |
| `POST` | `/:fileId/set-main` | Editor/Owner | Set active `.tex` document as main compilation root | `200` |
| `POST` | `/main` | Editor/Owner | Alias body `{ fileId }` to set main document | `200` |

### Cascading & Cleanup Rules

- **Subtree Soft Delete:** Deleting a folder queries all active descendants with prefix `path LIKE '${folder.path}/%'` and sets `deletedAt = now()` in a single transaction.
- **Active Proposal Guard:** If any document within the deleted subtree has an active AI proposal (`QUEUED`, `GENERATING`, `PENDING`), deletion is blocked with `409 PENDING_PROPOSAL`.
- **Main File Deletion Cascade:** If the main document or a folder containing the main document is deleted, `project.mainFileId` is reset to `null` and the response sends header `X-Main-File-Cleared: true`.

---

## 5. Verification & Test Suite

### 5.1 Test Breakdown (`src/__tests__/files.integration.test.ts`)

- **Creation & Tree Structure:**
  - `creates a root-level folder successfully`
  - `creates a nested directory inside an existing folder`
  - `rejects sibling case-insensitive collision in same folder (NAME_TAKEN 409)`
  - `rejects invalid names with forbidden characters or path traversal (INVALID_NAME 422)`
  - `creates a text document with Document record and revision 1`
  - `rejects unsupported text file extensions with UNSUPPORTED_FILE_TYPE 422`
  - `rejects viewers with FORBIDDEN 403`
- **File Tree Retrieval:**
  - `returns all active files with mainFileId`
  - `rejects outsider with NOT_FOUND 404`
- **Rename & Move Operations:**
  - `renames a file and updates its materialized path`
  - `renames a directory and updates all descendant materialized paths atomically`
  - `rejects circular move (moving folder into itself or descendant) with INVALID_MOVE 422`
  - `moves a file from one directory to root level`
- **Main Document Management:**
  - `sets a valid .tex file as main file via set-main endpoint`
  - `rejects setting a folder as main document (INVALID_MAIN_FILE 422)`
- **Deletion & Cascading:**
  - `deleting main file clears project mainFileId and returns X-Main-File-Cleared header`
  - `deleting a directory cascades soft-delete to all descendants`
  - `excludes soft-deleted files from GET /files`

### 5.2 Test Execution Results

- **`@texly/server` Integration Suite:** 9 passed / 9 total test files (94 tests passed, 0 failed).
- **`@texly/web` Unit & Component Suite:** 15 passed / 15 total test files (76 tests passed, 0 failed).
- **TypeScript Typecheck:** Clean exit code 0 (`tsc -b` and `tsc --noEmit`).

