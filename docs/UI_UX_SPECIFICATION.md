# UI_UX_SPECIFICATION.md

Primary visual reference: the supplied screenshot (a dark, IDE-style LaTeX editor with a file/outline sidebar, a central editor with an AI composer docked at its bottom, and a light PDF preview with a compile-status header). This spec translates that screenshot into implementable components and interaction rules. Where the screenshot shows an apparent defect, it is called out as a requirement (e.g., outline title cleanup).

---

## 1. Layout

```
┌──────────────┬─────────────────────────────────────────┬──────────────────────────┐
│ A. SIDEBAR   │ B. EDITOR COLUMN                        │ C. PDF PREVIEW           │
│ (resizable,  │  ┌ tab bar: [+] [YuvSDE.tex ×]  [Tools⚠]│ ┌ [✓ Compiled ▾] ⛶ ⬇ ⋯ ┐ │
│  collapsible)│  ├───────────────────────────────────────┤ │                        │ │
│              │  │ CodeMirror 6 editor                   │ │  PDF.js pages          │ │
│  workspace   │  │ (line numbers, gutter, right-edge     │ │                        │ │
│  & project   │  │  diagnostic marks)                    │ │                        │ │
│  selector    │  ├───────────────────────────────────────┤ │  [↺ ↻ ‹ Go to PDF ›]   │ │
│  Files|Chats │  │ D. AI PANEL (chat thread ▲ + composer)│ └────────────────────────┘ │
│  tree        │  │ [Ask anything…] [+] [model ▾] [🎙][➤] │                            │
│  Outline     │  └───────────────────────────────────────┘                            │
│  account     │                                                                       │
└──────────────┴─────────────────────────────────────────┴──────────────────────────┘
```

- Built with `react-resizable-panels` (shadcn/ui `Resizable`). Three horizontal panels (A | B | C); inside B a **vertical** split (editor over AI panel).
- Panel sizes/visibility persist in `user_settings.layout` (and `localStorage` for instant restore).
- **Defaults:** A 15 % (min 200 px, collapsible to 0), B 50 %, C 35 %. AI panel: collapsed to the composer bar (≈ 56 px) like the screenshot; expands to 35 % of B when a conversation is active; user-draggable (min 120 px expanded).
- **Hide/show:** toggle sidebar (top-left icon), toggle preview (header button / `Mod-Alt-P`), toggle AI thread (chevron on composer / `Mod-J`); sidebar toggle is `Mod-\`. Double-click a resize handle resets it.
- **Responsive:** ≥ 1280 px: three panels. 768–1279 px: sidebar becomes an overlay drawer; B and C side-by-side. < 768 px: single-column with bottom tab switcher (Files · Editor · PDF · AI); editing is functional but not optimized.

## 2. Design tokens and styling

- **Stack:** Tailwind CSS + shadcn/ui; CSS variables for theming (`--background`, `--foreground`, `--muted`, `--border`, `--primary`, `--destructive`, `--success`, `--diff-added`, `--diff-removed`, `--diff-modified`).
- **Theme:** dark (screenshot) and light; follows system by default. Editor theme maps to the same tokens (CodeMirror `EditorView.theme` + highlight style). PDF page area always renders white pages on a neutral panel background.
- **Typography:** UI — Inter (or system UI). Code — JetBrains Mono / Fira Code (ligatures optional) 14 px default (setting 11–20).
- **Syntax colors (dark, per screenshot):** commands (`\usepackage`) orange/amber; braces/brackets light gray; arguments green; comments muted green italics; math cyan; environments names in primary accent; errors red underline.
- **Spacing/radius:** 4 px grid; radius 8 px for controls, 12 px for floating bars (as in the PDF toolbar pill).
- **Iconography:** `lucide-react`.
- **Contrast:** all text ≥ 4.5:1 (WCAG 2.2 AA); focus ring 2 px primary with offset.

## 3. Component specifications

### A. Left sidebar

| Element (from screenshot) | Spec |
|---|---|
| App mark + collapse button (top) | Logo (links to dashboard) and sidebar toggle |
| **Project selector** ("Copy of Latest SDE res… ⌄") | Dropdown (command-palette style, `Mod-K`): search projects, recent first, "New project…", "All projects". Truncates long names with tooltip. |
| **Invite / collaborators button** (user-plus icon) | P1: opens share dialog; P0: hidden or disabled with tooltip "Sharing coming soon" |
| **Tabs: Files · Chats** | *Files* = explorer; *Chats* = AI conversation list for the project (title, last message, pending badge) |
| Toolbar: search (🔍), new (+) | Search = filter tree + (P1) project-wide search results; "+" menu: New file, New folder, Upload files, From template |
| **File tree** | Folders (expand/collapse, remembered), files with type icons (`.tex`, `.bib`, image, pdf, font). Selected file highlighted. Main file shows a small "main" badge. Image/PDF assets open in a **preview tab** (read-only viewer). |
| File tree interactions | Click = open in active tab (italic "preview" tab if single-click, pinned on double-click/edit); Context menu: Rename (`F2`), Duplicate, Delete, Set as main, Download, Copy path, New file/folder here. Drag to move; drop external files to upload (drop target highlight). Inline rename validation errors (name taken/invalid) shown in place. |
| **Outline** (collapsible section) | Hierarchical list from `symbols` of the active file (and `\input`ed files, P1): `\part/\chapter/\section/\subsection/\subsubsection`. Click → scroll/cursor to heading. Current section highlighted while scrolling. **Titles are cleaned for display:** strip `\hfill`, `\textbf{}`-style wrappers, `\\`, braces and comments, collapse whitespace; truncate with ellipsis. *(The screenshot shows a raw/duplicated entry "AchievementsAchievements\hfill\…" — this is the defect the cleanup rule fixes: take only the first brace-balanced argument of the sectioning command, then sanitize; never show raw TeX.)* |
| **Account chip** (bottom: avatar, "Yuvraj ⌃", "Personal workspace") | Popover: Settings, Usage, Theme, Keyboard shortcuts, Help, Sign out; workspace switcher (P1) |

States: loading skeleton rows; empty project hint ("Drop files or create your first file"); error banner with retry for failed tree fetch; upload progress rows (cancel button); offline badge.

### B. Editor column

**Tab bar** (screenshot: leading circle-plus, one tab "YuvSDE.tex"):
- Leading **New** button (file creation quick menu). Tabs: file icon, name, dirty dot (unsaved) / spinner (saving), close ×, middle-click closes, drag to reorder, overflow menu when crowded. Tab for a file under AI review shows a small ✨ badge.
- **Tools ⚠ button** (red when errors exist — screenshot): opens the **Diagnostics/Tools popover/panel** with tabs: *Problems* (errors/warnings from last compile + static checks; click → jump), *Compile log* (raw log viewer), *Compile settings* (engine, bibliography tool, main file, auto-compile, "Recompile from scratch"). Badge shows error count.

**Editor (CodeMirror 6)**
- Extensions: line numbers, active-line highlight, fold gutter (sections/environments), bracket matching & auto-close, indent guides optional, search/replace panel (`Mod-F`, `Mod-H`), multiple selections, `history`, `drawSelection`, `lintGutter` + right-edge **scroll marks** for diagnostics (the red marks in screenshot's right margin), autocomplete popup with docs preview, snippet support, `Tab` indent.
- **Status bar** (thin, bottom of editor, above AI panel): `Ln 12, Col 8`, selection length, engine, save state ("Saved" / "Saving…" / "Unsaved changes" / "Conflict" / "Offline – changes kept locally"), encoding LF/UTF-8.
- Read-only states: viewer role (lock icon), **AI review mode** (§5), over-limit file.
- Keyboard shortcuts (all remappable post-MVP; Mac `Cmd` = `Mod`):

| Action | Shortcut |
|---|---|
| Compile | `Mod-Enter` |
| Save now (flush autosave) | `Mod-S` |
| Find / Replace | `Mod-F` / `Mod-H` |
| Go to line | `Mod-G` |
| Toggle comment | `Mod-/` |
| Quick open file | `Mod-P` |
| Command palette | `Mod-Shift-P` |
| Toggle sidebar / preview / AI thread | `Mod-\` / `Mod-Alt-P` / `Mod-J` |
| Focus AI composer | `Mod-L` |
| Next/prev error | `F8` / `Shift-F8` |
| Bold / italic / emph (wrap selection in `\textbf{}` / `\textit{}` / `\emph{}`) | `Mod-B` / `Mod-I` / `Mod-Alt-E` |
| Go to PDF (SyncTeX forward) | `Mod-Alt-J` |
| Accept AI changes (only while review mode is active; Compile is suppressed in that state) | `Mod-Enter` |
| Reject AI changes (review mode) | `Esc` |

### C. PDF preview panel

- **Header** (screenshot: "✓ Compiled ⌄", fullscreen, download, more):
  - **Status control:** split button. Left = status chip with icon + text: `Compile` (idle/never), spinner `Compiling… 6s`, `✓ Compiled`, `✓ Compiled · 2 warnings`, `⚠ Compiled with 3 errors`, `✕ Failed`, `⏱ Timed out`. Clicking the chip recompiles; dropdown (⌄): Compile, Recompile from scratch, Stop, Auto-compile toggle, Engine, Open logs.
  - **Fullscreen** (⛶): panel to full viewport; `Esc` exits.
  - **Download** (⬇): downloads PDF (presigned URL, `Content-Disposition: attachment`).
  - **More** (⋯): Download source ZIP (P1), Download log, Copy share link (P1), Open in new tab.
- **Viewer:** PDF.js canvas pages with text layer; continuous scroll with virtualized pages; zoom (fit width default, fit page, 50–400 %, `Ctrl+wheel`); current page indicator; thumbnail rail (P1); text selection/search in PDF (`Ctrl+F` when focused, P1); high-DPI rendering; render in a worker.
- **Floating toolbar** (screenshot pill at bottom: ↺ ↻ ‹ **Go to PDF** ›): zoom out/in (the two leading icons are ambiguous in the screenshot; **this spec defines them as Zoom out / Zoom in**, with the final glyphs confirmed in design review), previous/next page, **Go to PDF** (SyncTeX forward search from editor cursor, P1; until then it scrolls to the page of the current section when known, otherwise disabled).
- **Refresh behavior:** new PDF loads in background; swap on first rendered page; preserve page/scroll/zoom; show subtle "Updated" flash; keep last good PDF with a "Out of date" badge when the latest compile failed.
- **Empty state:** "Press Compile to preview your document" with the compile button.
- **Errors:** inline banner above PDF summarizing top error with "Show all" → Tools panel.

### D. AI panel (directly below the editor)

**Collapsed (screenshot):** a rounded composer bar spanning the editor width:
`[ Ask anything… ]  [ + ]  [ model · effort ▾ ]  [ 🎙 ]  [ ➤ ]`
- Placeholder text varies: "Ask anything…" / when selection exists: "Edit selection…".
- **+ (attach/context menu):** Include compile errors · Attach file(s) from project · Use selection as scope · Scope: Whole file / Selection / Section (radio).
- **Model selector:** current model and reasoning effort (e.g., "Model-name Medium"), dropdown lists `GET /ai/models` (provider icon, tier, effort sub-menu). Persisted per user.
- **🎙** voice dictation (P2, hidden in MVP unless trivial via browser speech API).
- **➤ Send** (`Enter` sends; `Shift+Enter` newline; disabled when empty, during generation shows **■ Stop** which cancels the proposal).
- Active scope/context chips appear above the input (e.g., `main.tex`, `Selection 12–48`, `Compile errors`).

**Expanded:** thread area above the composer (opens automatically on send):
- Message list: user bubbles; assistant entries show the proposal **summary**, status badge, diffStats ("+18 −2, 1 change"), model/tokens, timestamp, and actions (View in editor, Regenerate, Copy).
- **Generation states:** `Queued…` → `Generating…` (animated, elapsed timer, **Stop** button) → `Proposal ready` (auto-opens review mode) / `Failed` (reason + **Retry** + **Switch model**) / `Stale` (**Regenerate**).
- Failed/unsafe validators: shown as warning list inside the message.
- History scroll with lazy load; conversation title auto-generated from first prompt; new conversation button; conversation switcher in the sidebar *Chats* tab.
- If a proposal is pending on a different file than the active tab, a banner "Proposal pending on `chapter2.tex` — Open".

## 4. Core flows

### 4.1 Open project → edit → autosave
1. Choose project (selector) → files load → last-open tabs restored → editor loads document (`revision`).
2. Typing marks the tab dirty; status bar "Unsaved changes…" → "Saving…" → "Saved ✓ (rev 13)". Failure → "Retrying…" with exponential backoff; persistent failure → banner "Changes are stored locally. Retry".
3. Conflict → modal "This file changed elsewhere": **Compare**, **Use server version**, **Keep mine (overwrite)**.

### 4.2 Compile → preview
`Mod-Enter` → flush save → status "Compiling…" → WS finished → PDF refresh → diagnostics update. Errors: Tools button turns red with count; markers appear in editor; clicking an error moves cursor and reveals line.

### 4.3 Upload assets
Drag onto explorer (or "+ → Upload") → per-file progress rows → on completion file appears; insert helper: dropping an image onto the editor offers "Insert `\includegraphics`" (P1).

## 5. AI review mode (the signature interaction)

**Entry:** automatically when a proposal reaches `PENDING` for the *active* file (or when the user opens the target file / clicks "View in editor").

**Presentation in the editor**
- Document shows the **proposed** text via unified merge view against the original:
  - **Inserted** lines: green background, `+` gutter marker.
  - **Deleted** lines: red, struck/dimmed, rendered inline above the change (read-only).
  - **Modified** lines: paired red/green with **word-level** highlights.
  - Unchanged: normal.
- The editor is **read-only**; a lock icon + "Reviewing AI proposal" label appears on the tab; autosave for this file is paused.
- **Review banner** pinned at the top of the editor (below tabs), keyboard-focusable region:

```
✨ AI proposal · "Added an Abstract section before the Introduction"
+18 −0 · 1 change   ⚠ 1 warning ▾        [‹ Prev] [Next ›]   [ REJECT CHANGES ]  [ ACCEPT CHANGES ]
```
  - Warnings dropdown lists validator findings (e.g., "Removes 2 citation uses", "Adds `\usepackage{amsmath}` already loaded").
  - Buttons: **REJECT CHANGES** (secondary/destructive-outline, `Esc`), **ACCEPT CHANGES** (primary, `Mod-Enter`). Both disabled while a request is in flight; show spinner.
  - Accept requires no confirmation by default (undo exists); if validators produced **errors-level** findings the proposal cannot be `PENDING` (it would have failed), if **warnings** exist the button label stays the same but the banner highlights in amber.
- Scroll-to-first-change on entry; Prev/Next navigates changes (`Alt-↓`/`Alt-↑`).
- **Navigating away:** switching tabs keeps the proposal pending (badge on tab); closing the tab does not reject. Page refresh re-enters review mode.
- **Concurrent change:** if `document.revision.changed` arrives for this file, banner turns amber: "This file changed. The proposal is out of date." with **Regenerate** and **Dismiss** (dismiss = reject); Accept disabled.

**After Accept:** banner closes; toast (8 s) "AI changes applied · **Undo** · **Compile**"; editor continues from revision N+1 with normal editing; Undo restores `PRE_AI` version as a new revision.
**After Reject:** brief toast "Changes discarded"; editor shows the exact original; the proposal is listed as Rejected in chat history.

## 6. Dashboard (projects page)
Grid/list toggle; search; sort (last opened, updated, name); "New project" with template picker (thumbnail preview, engine); trash tab; project card shows name, updated time, thumbnail (first page of last PDF, P1), context menu (rename, duplicate P2, move to trash). Empty state with templates.

## 7. Settings
Account (name, email, password), Editor (theme, font size, keymap: default/Vim/Emacs via CM extensions P1, line wrapping, autocomplete toggles), Compile defaults (engine, auto-compile), AI (default model/effort, "include compile errors by default"), Usage (tokens/cost per month, storage), Sessions (revoke).

## 8. Accessibility
- WCAG 2.2 AA; full keyboard operation of explorer (tree roles, arrow-key navigation), tabs (`role=tablist`), review banner (`role=region`, `aria-label`, live announcements: "AI proposal ready, 1 change"), status chip (`aria-live=polite`).
- Diff is not color-only: `+`/`−` gutter glyphs and text labels; high-contrast theme variant.
- Focus management: entering review mode moves focus to the banner heading; after accept/reject returns focus to the editor.
- Reduced motion respected (no spinner flourishes when `prefers-reduced-motion`).
- CodeMirror screen-reader support via its built-in a11y; announce diagnostics count changes.
- Touch targets ≥ 32 px in toolbars.

## 9. Error, empty and edge states (summary)

| Situation | UI |
|---|---|
| Offline | Global toast + status bar "Offline"; editing allowed; saves queue; compile/AI disabled with tooltip |
| Session expired | Silent refresh; if it fails, modal "Sign in again" preserving local drafts |
| Compile queue slow (> 10 s queued) | "Waiting for a compile worker… (position ~n)" |
| Compile timeout | Chip `⏱ Timed out`; message with hints (infinite loops, heavy TikZ) |
| AI provider down | Message-level failure with Retry and "Try another model" |
| File too large for editor | Read-only banner + download |
| Quota exceeded | Inline banner with usage and upgrade link (P1) |
| Binary asset selected | Preview tab (image viewer/PDF viewer), no editor |

## 10. Front-end architecture notes (for implementers)

- **State:** TanStack Query for server state (projects, files, compilations, conversations); Zustand stores for editor/session state (`openTabs`, `activeFile`, `saveState`, `reviewState`, `panelLayout`); WS events invalidate/patch Query caches.
- **Editor integration:** one `EditorView` per open tab kept alive (state preserved) or a single view with per-file `EditorState` swapped (decision: single view + state cache to limit memory; revisit if performance requires). Compartments: language, theme, keymap, lint, readOnly, review, autocompletion sources.
- **LaTeX language:** MVP uses CodeMirror's legacy `stex` mode wrapped in `StreamLanguage`, plus custom fold service (sections/environments) and a bracket-aware indent; a dedicated Lezer LaTeX grammar is a post-MVP improvement (better folding/outline/autocomplete context).
- **Autocomplete sources:** static command/environment catalog from `packages/latex` (package-aware by `\usepackage` detection), dynamic sources from `/projects/:id/index` (labels, cite keys, file paths).
- **PDF viewer:** custom React component over `pdfjs-dist` (worker, `renderTextLayer`, virtualization); stores `{page, scrollTop ratio, zoom}` across refreshes.
- **Performance budgets:** initial editor route JS ≤ 350 KB gz (PDF.js worker and heavy CM extensions lazy-loaded); open-file-to-interactive < 500 ms for 200 KB docs.
- **Component library (shadcn/ui):** `Button`, `DropdownMenu`, `ContextMenu`, `Dialog`, `Popover`, `Tabs`, `Tooltip`, `Resizable`, `ScrollArea`, `Command`, `Toast/Sonner`, `Badge`, `Skeleton`.
