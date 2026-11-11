# PRD.md — Product Requirements Document

**Product (working name):** Texly
**Version:** 0.1 (planning)
**Owner:** Product/Engineering
**Related:** `UI_UX_SPECIFICATION.md`, `AI_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`

---

## 1. Vision and problem statement

Writing LaTeX documents (papers, resumes, theses, reports) in the browser today means either a collaborative editor with weak AI integration, or an AI chat that rewrites whole documents with no review discipline. Texly is an IDE-like online LaTeX editor where **an AI assistant proposes precise, reviewable edits directly in the editor — and the user stays in control of every change.**

**Product pillars**
1. **Control:** AI never changes a document without explicit Accept; Reject restores the exact original.
2. **Speed:** save → compile → preview feels instant; compile errors are actionable.
3. **Trust:** work is never lost (autosave, versions, recovery); untrusted LaTeX is sandboxed.
4. **Familiar:** Overleaf-class capabilities (multi-file, bibliography, PDF side-by-side) in a modern IDE-style UI (see the reference screenshot: file/outline sidebar, central editor with an AI composer beneath it, live PDF preview).

## 2. Target users and personas

| Persona | Needs | Key scenarios |
|---|---|---|
| **Student/early-career researcher** (primary) | Write papers/theses/resumes without installing TeX; fix cryptic errors; format quickly | "Add an abstract", "Fix my table", "Convert to IEEE format" |
| **Job-seeker / resume writer** | Polished resume from templates, tweak spacing/sections; export PDF | Edit resume template, ask AI to tighten bullets, one-page fit |
| **Academic with collaborators** (secondary, post-MVP) | Share project, comment, co-edit | Invite coauthor, review comments |
| **LaTeX expert** | Fast editor, shortcuts, packages, full control | Multi-file projects, custom classes, biber |

## 3. Goals and non-goals

### Goals (MVP)
- G1. Create/manage multiple LaTeX projects with files/folders and asset uploads.
- G2. IDE-quality LaTeX editing (highlighting, autocomplete, folding, search, tabs, autosave).
- G3. Reliable server-side compilation (pdfLaTeX/XeLaTeX/LuaLaTeX, BibTeX/Biber) with side-by-side PDF and diagnostics.
- G4. AI edit proposals with diff-based review, Accept/Reject, and version safety.
- G5. Version history with restore.
- G6. Secure by design (sandboxed compilation, scoped storage access).

### Non-goals (MVP)
- Real-time multi-cursor collaboration (designed for, not built).
- Mobile-native editing experience (responsive viewing only).
- Autonomous/agentic AI that edits files or runs compilations on its own.
- Offline-first editing.
- Git integration, Overleaf import, Dropbox/GitHub sync.
- Self-hosting packaging.

## 4. Functional requirements

Priority: **P0** = MVP launch blocker, **P1** = MVP-if-time/fast-follow, **P2** = post-MVP.

### 4.1 Accounts and projects
| ID | Requirement | Pri |
|---|---|---|
| FR-A1 | Register/login/logout with email + password; refresh sessions | P0 |
| FR-A2 | Email verification, password reset | P0 |
| FR-A3 | Personal workspace created at signup | P0 |
| FR-P1 | Create project from template (blank, article, report, beamer, IEEE conference, resume) | P0 |
| FR-P2 | List/search/rename/trash/restore projects; project selector in sidebar | P0 |
| FR-P3 | Project settings: engine, bibliography tool, main file, auto-compile | P0 |
| FR-P4 | Share project by invite with roles (Editor/Commenter/Viewer) | P1 |
| FR-P5 | Duplicate project | P2 |

### 4.2 Files and editor
| ID | Requirement | Pri |
|---|---|---|
| FR-F1 | File explorer: create/rename/move/delete files and folders (drag-and-drop move) | P0 |
| FR-F2 | Upload assets (images, PDFs, fonts) with progress; drag-and-drop | P0 |
| FR-F3 | Multiple file tabs; reopen last session | P0 |
| FR-E1 | CodeMirror 6 editor: LaTeX highlighting, line numbers, bracket matching, folding, find/replace, undo/redo, keyboard shortcuts | P0 |
| FR-E2 | Autocomplete: commands, environments, `\ref`/`\cite` keys, file paths, packages | P0 (commands/environments/refs/cites), P1 (packages/paths) |
| FR-E3 | Autosave (debounced) with visible save state; crash-safe local draft | P0 |
| FR-E4 | Inline diagnostics (lint markers from compile + lightweight static checks) | P0 |
| FR-E5 | Cursor position display (Ln, Col) | P0 |
| FR-E6 | Document outline (sections/subsections) with click-to-navigate | P0 |
| FR-E7 | Project-wide search | P1 |
| FR-E8 | Table generator, equation helper (insert snippets) | P2 |

### 4.3 Compilation and preview
| ID | Requirement | Pri |
|---|---|---|
| FR-C1 | Manual compile (button + shortcut) with status (Queued/Compiling/Compiled/Failed) | P0 |
| FR-C2 | Auto-compile option (debounced after autosave) | P1 |
| FR-C3 | PDF viewer (PDF.js): page navigation, zoom, fit-width, full-screen, download | P0 |
| FR-C4 | Diagnostics panel with click-to-source (errors/warnings) | P0 |
| FR-C5 | Engine selection (pdfLaTeX/XeLaTeX/LuaLaTeX); BibTeX/Biber | P0 |
| FR-C6 | SyncTeX source ↔ PDF navigation ("Go to PDF") | P1 |
| FR-C7 | Keep last good PDF visible when a compile fails | P0 |
| FR-C8 | Resizable/hideable panels | P0 |

### 4.4 AI modification and approval (core)
| ID | Requirement | Pri |
|---|---|---|
| FR-AI1 | AI composer beneath the editor: prompt input, send, model selector (+reasoning effort), loading state | P0 |
| FR-AI2 | Chat history per project/conversation | P0 |
| FR-AI3 | Context-aware request: active file, project outline, selection, optional compile errors, attached files | P0 |
| FR-AI4 | Proposed changes rendered **in the main editor** with inserted/deleted/modified distinction; original not persisted/overwritten | P0 |
| FR-AI5 | **ACCEPT CHANGES** applies atomically, updates revision/autosave state, enables compile | P0 |
| FR-AI6 | **REJECT CHANGES** restores exact original; persisted document unchanged | P0 |
| FR-AI7 | Revision/hash safety: stale proposals can't be accepted; one active proposal per file; failed requests are recoverable; refresh preserves pending proposal | P0 |
| FR-AI8 | Safety validators (brace/env balance, duplicate packages, removed labels/citations, scope containment) with warnings in review banner | P0 |
| FR-AI9 | "Undo AI change" after accept (restore pre-AI version) | P0 |
| FR-AI10 | Multiple providers (OpenAI, Anthropic, Gemini) behind one abstraction; usage and cost tracking | P0 (≥ 2 providers), P1 (all 3) |
| FR-AI11 | AI error diagnosis ("Fix these compile errors") using diagnostics context | P1 |
| FR-AI12 | Per-hunk accept/reject | P2 |
| FR-AI13 | Trial-compile of a proposal before accepting | P2 |
| FR-AI14 | Ask-mode (Q&A without edits), proofreading, equation/table generation, research assistance | P2 |

### 4.5 History
| ID | Requirement | Pri |
|---|---|---|
| FR-V1 | Automatic checkpoints + manual labeled snapshots | P0 |
| FR-V2 | List versions, compare (diff), restore | P0 |
| FR-V3 | Project-level snapshots | P2 |

### 4.6 Account/settings
| ID | Requirement | Pri |
|---|---|---|
| FR-S1 | Theme (dark/light/system), editor font size, keymap | P0 |
| FR-S2 | Usage page (AI tokens/cost, storage) | P1 |

## 5. MVP scope decision (feature evaluation)

| Feature | MVP | Rationale |
|---|---|---|
| Document templates | **Yes** (6 templates) | Reduces blank-page friction; cheap |
| Multiple LaTeX files | **Yes** | Essential for real documents |
| Bibliography management (`.bib` files, compile with BibTeX/Biber) | **Yes** (as files) | Essential; no dedicated reference-manager UI |
| Citation management (cite autocomplete from `.bib`) | **Yes** | High value, low cost via `symbols` index |
| Equation editor / table generator | Defer | AI + snippets cover MVP needs |
| Image uploads | **Yes** | Essential |
| Drag-and-drop assets | **Yes** | Expected UX |
| Document outline | **Yes** | In screenshot; parse-based |
| Search across files | Fast-follow (P1) | Postgres trigram index in Phase 10 |
| Autosave | **Yes** | Core |
| Version history | **Yes** (document-level) | Required safety net for AI |
| Project duplication | Defer | |
| PDF export (download compiled PDF) | **Yes** | Trivial given presigned URL |
| Project export zip | Defer | |
| Document sharing (invite) | Fast-follow (P1) | RBAC is built in; invite UI later |
| Real-time collaboration | **Defer** | Large complexity; revision-based concurrency suffices; Yjs path documented |
| Comments/annotations | Defer | Schema-ready |
| AI proofreading / equation / table / research | Defer | Same edit pipeline can host them later as prompt presets |
| AI error diagnosis | **Fast-follow (P1)** | Uses same pipeline + diagnostics context |

## 6. User stories with acceptance criteria (selected)

**US-1 Accept an AI proposal**
*Given* an open `main.tex` at revision 12 with no unsaved edits, *when* I submit "Add an abstract before the introduction…", *then* within 60 s the editor shows the proposed abstract highlighted as inserted, the file is read-only, and a banner shows ACCEPT CHANGES / REJECT CHANGES; *when* I click ACCEPT, *then* the file becomes revision 13 containing the abstract, the banner disappears, a toast offers Undo, and a reload shows the abstract.

**US-2 Reject an AI proposal**
*Given* a pending proposal, *when* I click REJECT, *then* the editor text is byte-identical to the pre-proposal text (hash-verified), the server revision is unchanged (12), and the proposal appears as Rejected in chat history.

**US-3 Stale proposal**
*Given* a pending proposal on revision 12, *when* the file is changed from another tab (revision 13) and I click ACCEPT, *then* I see "Document changed — regenerate", nothing is written, and Regenerate creates a new proposal on revision 13.

**US-4 Refresh while pending**
*Given* a pending proposal, *when* I reload the page, *then* the editor re-enters review mode for the same proposal.

**US-5 Compile with errors**
*Given* a document with an undefined control sequence, *when* I compile, *then* the PDF area shows status "Failed" or "Compiled with errors" (with last good PDF), the Tools panel lists the error with file:line, and clicking it moves the cursor there.

**US-6 Autosave safety**
*Given* I type and lose connectivity, *when* connectivity returns, *then* my text is saved without loss; if the server version advanced meanwhile, I get a conflict dialog with Compare / Keep mine / Use server.

**US-7 Upload an image and use it**
*Given* a project, *when* I drag `fig1.png` into the explorer, *then* I see upload progress, the file appears in the tree, `\includegraphics{fig1}` autocompletes it, and the compiled PDF renders it.

**US-8 Restore a version**
*Given* version history, *when* I restore version V, *then* a new revision with V's content is created (history is not rewritten) and an automatic PRE_RESTORE snapshot exists.

## 7. Success metrics

| Metric | Target (first 90 days post-launch) |
|---|---|
| Time to first PDF from signup | median < 3 min |
| Compile success rate (non-user-error failures) | ≥ 99 % |
| Compile p95 latency | ≤ 25 s |
| AI proposal acceptance rate | ≥ 40 % (indicator of usefulness) |
| AI-caused data-loss incidents | 0 |
| Weekly active projects per active user | ≥ 2 |
| Day-7 retention | ≥ 30 % |

## 8. Constraints and assumptions

- Solo developer / small team using AI coding agents; budget-limited initial deployment (see `DEPLOYMENT.md`).
- LLM provider keys are platform-owned initially; cost is controlled by plan quotas.
- Users upload only content they have rights to; terms of service must prohibit abuse of compile resources.
- Open questions: pricing/plan limits; whether to offer BYO API keys; template licensing; data residency (region choice — e.g., Mumbai for India-based users); legal review of storing user documents.

## 9. MVP feature checklist

**Platform**
- [ ] Monorepo, CI, Docker Compose dev environment
- [ ] Auth (register, login, refresh rotation, logout, email verify, reset)
- [ ] Projects CRUD + templates + settings
**Editing**
- [ ] File tree CRUD + move + upload (R2) + drag-and-drop
- [ ] CodeMirror editor (highlighting, folding, search, brackets, tabs)
- [ ] Autocomplete (commands, envs, refs, cites)
- [ ] Autosave + conflict handling + local draft recovery
- [ ] Outline
**Compile & preview**
- [ ] Sandboxed compile pipeline (pdfLaTeX/XeLaTeX/LuaLaTeX, BibTeX/Biber)
- [ ] Diagnostics panel + inline markers
- [ ] PDF viewer (zoom, pages, fullscreen, download, no-flicker refresh)
- [ ] WebSocket status updates
**AI**
- [ ] Provider abstraction + ≥ 2 providers
- [ ] Prompt builder + edit-op engine + validators
- [ ] Proposal state machine + queue worker
- [ ] Review mode (merge view) + Accept/Reject + stale handling + refresh recovery
- [ ] Usage/cost tracking and rate limits
**History & safety**
- [ ] Checkpoints, manual snapshots, compare, restore, Undo-AI
- [ ] Security suite for compile sandbox passing
- [ ] Backups + restore drill documented
**Release**
- [ ] E2E tests for the AI approval workflow
- [ ] Observability dashboards + alerts
- [ ] Production readiness checklist (see `DEPLOYMENT.md`) signed off
