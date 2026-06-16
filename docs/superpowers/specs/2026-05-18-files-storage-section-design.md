# Files Storage Section — Design

**Date:** 2026-05-18
**Scope:** `V8/NewFrontEndToBePorted/` (Next.js frontend served at `elevatechecked1.info/beta`)
**Status:** Approved design, pending implementation plan

## 1. Context

The legacy vanilla-JS frontend at `elevatechecked1.info/` has a password-gated **Files** view that lets users upload workbooks to persistent storage (Cloudflare R2 + Postgres metadata), browse the archive, download, delete, and re-parse stored files back into the live dashboard. The new Next.js frontend at `/beta` has a sidebar item called **Files**, but it only renders an in-memory session catalogue: it lists what has been parsed in the current browser tab, with no upload, download, or persistence. Reload the page and everything is gone.

This spec covers porting the persistent file-management feature into the new frontend. The backend already exposes the full API surface (`/api/r2/*` and `/api/parsed/*`) — no backend changes are required.

## 2. Decisions

Five design choices were settled with the user before this spec was drafted. Each links the chosen option to the constraint that drove it.

| # | Decision | Rationale |
|---|---|---|
| 1 | Expose **R2 only** (not the Postgres BYTEA path `/api/files/*`) | R2 is the modern path: chunked upload for large files, parse-from-storage support, no ~50 MB cap. The Postgres BYTEA endpoints remain alive on the backend but are not surfaced in the new UI. |
| 2 | Keep the **`ChickenMan123` password gate** | Mirrors legacy. Soft hide, not real auth — same string already used by the Secret Chat module. Stored client-side in `sessionStorage` so the gate doesn't re-prompt within a single browser session. |
| 3 | Sidebar layout: **one Files item, two internal tabs** (Session, Storage) | Avoids nav clutter. The current session-catalogue behavior survives as the Session tab; the new persistent-archive behavior is the Storage tab. |
| 4 | Storage upload: **separate drag-drop zone inside the Storage tab**, always archives via R2 chunked upload regardless of file size | The sidebar's existing upload routes small files through `/api/upload` which does NOT archive — so even small files must go via R2 chunked here to land in the archive. Clear mental model: anything dropped in the Storage tab is archived. |
| 5 | Code structure: **split `files-view.tsx` into a `views/files/` folder** with thin tabs wrapper + per-panel files | Matches existing single-purpose conventions in `lib/` and other `views/`. Keeps the storage panel (which has the most moving parts) isolated and small. |

## 3. File layout

```
NewFrontEndToBePorted/
├── lib/
│   ├── api.ts                          # +listR2Files, deleteR2File, parseR2File, r2FileDownloadUrl
│   └── types.ts                        # +R2FileRecord
└── components/views/
    └── files/                          # NEW folder; replaces files-view.tsx
        ├── index.tsx                   # FilesView — tabs wrapper, ~50 lines
        ├── session-panel.tsx           # current files-view.tsx body, lifted as-is
        ├── storage-panel.tsx           # orchestrates gate → list → upload → row actions
        ├── storage-password-gate.tsx   # input + unlock button + inline error
        ├── storage-upload-zone.tsx     # drag-drop multi-file with per-file progress
        └── storage-files-table.tsx     # rows: filename / date / size / actions
```

**Deletions:** `components/views/files-view.tsx` is removed. The single import in `components/shell/app-shell.tsx` switches from `./files-view` to `./files`. No other call sites.

## 4. New types

```ts
// lib/types.ts — append
export interface R2FileRecord {
  id: number
  filename: string
  file_size: number
  upload_date: string   // ISO string — coerced inside listR2Files() if backend returns a datetime
  r2_key: string
  public_url: string | null
}
```

Field names must be reconciled against `storage.get_all_r2_files()`'s projection before the UI code is written. If the server returns Python `datetime` objects rather than ISO strings, `listR2Files()` coerces them with `new Date(x).toISOString()` before returning.

## 5. New API helpers (`lib/api.ts`)

```ts
export async function listR2Files(): Promise<R2FileRecord[]>
export async function deleteR2File(id: number): Promise<void>
export async function parseR2File(id: number): Promise<UploadedFile[]>
export function r2FileDownloadUrl(id: number): string  // pure, no fetch
```

`parseR2File` returns the same `UploadedFile[]` shape as `uploadFile`/`uploadFileSmart`, so the merge path in `AppShell` (`setFiles(prev => …)`) reuses unchanged.

## 6. Component contracts

```ts
// FilesView (views/files/index.tsx)
interface FilesViewProps {
  files: UploadedFile[]                       // for Session tab
  activeFile: string | null                   // for Session tab
  onSelectFile: (name: string) => void        // for Session tab
  onParsed: (parsed: UploadedFile[]) => void  // NEW — Storage → AppShell
}

// SessionPanel
interface SessionPanelProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
}

// StoragePanel
interface StoragePanelProps {
  onParsed: (parsed: UploadedFile[]) => void
}
```

`AppShell`'s existing setter dedups by `name`, so a parse-and-load of a file already in the dashboard simply replaces the prior entry. No deduplication logic in StoragePanel.

## 7. State

| State | Owner | Reset trigger |
|---|---|---|
| `unlocked: boolean` | `storage-panel.tsx` | Mirrors `sessionStorage["rr.storage.unlocked"]`. Lost on browser tab close. |
| `r2Files: R2FileRecord[]` | `storage-panel.tsx` | Refetched on unlock, after upload, after delete. |
| `loading / error` | `storage-panel.tsx` | Per-fetch lifecycle. |
| `pendingActions: Set<number>` | `storage-panel.tsx` | Per-row spinner / disabled-state during parse or delete. |
| `AppShell.files[]` | `AppShell` (unchanged) | Storage panel pushes via `onParsed` callback. |

## 8. Flows

### 8.1 Tab activation

```
Storage tab clicked
  → read sessionStorage["rr.storage.unlocked"]
  → truthy:  render upload zone + table; fire listR2Files()
  → falsy:   render <StoragePasswordGate />
```

### 8.2 Password gate

```
Submit
  → password === "ChickenMan123"
       ? sessionStorage.setItem(...) + setUnlocked(true) + fire listR2Files()
       : show inline "Incorrect access code", clear input, keep gate
```

Soft hide, not security. Comment in source: *"Same string the legacy Files module and Secret Chat used. Main login already gated everything."*

### 8.3 Storage upload

```
for each dropped file:
  uploadFileChunked(file, onProgress)           # always chunked
    /api/r2/chunk-init
    /api/r2/chunk-upload  × N
    /api/r2/chunk-finalize  → R2FileRecord created
    /api/r2/files/{id}/parse → ParsedFile
  ↓
accepted UploadedFile[]
  → onParsed(...)            (AppShell merges into files[])
  → listR2Files() refetch    (table updates)
  → toast.success per file
```

Per-file progress surfaces via existing `uploadFileChunked` `onProgress` callback — phase + ratio — same toast pattern AppShell already uses.

### 8.4 Parse & load (existing R2 row)

```
Click play icon on row id
  → pendingActions.add(id)
  → parseR2File(id) → UploadedFile[]
  → onParsed(...)
  → toast.success "<filename> loaded to dashboard"
  → pendingActions.delete(id)    (in finally)
```

### 8.5 Delete

Pessimistic. shadcn `AlertDialog` confirms; on accept:

```
pendingActions.add(id)
  → deleteR2File(id)
       → success: refetch list, toast
       → 404:     tolerated, refetch list, toast "Already removed"
       → other:   toast error, refetch list to resync
  → pendingActions.delete(id)
```

### 8.6 Download

Plain `<a href={r2FileDownloadUrl(id)} download>`. Browser handles the binary stream via the existing Flask `send_file` route.

## 9. Edge cases & error handling

| Case | Behavior |
|---|---|
| Empty archive | shadcn `<Empty>` block: "No files in cloud storage yet. Drop a workbook above to archive it." |
| Initial list fetch fails | Error card with **Retry** button calling `listR2Files()` again. |
| 401 on any storage API call | `window.location.href = "/login"` (Flask session expired). |
| Chunk upload fails mid-stream | Toast error per file. Backend's own `abort_multipart_upload` handles cleanup. Row never appears. |
| Finalize succeeds but parse fails | File IS in R2 — list refetch will show it. User retries via the play button. Toast per file. |
| Duplicate filename | Backend's `generate_r2_key` produces a unique key per upload, so two rows with the same display filename can coexist. Disambiguated visually by upload date column. |
| Parse returns 404 | Stale row — refetch list, toast "File no longer in storage". |
| Parse returns 500 | Toast error, row stays, file stays archived, user can retry. |
| Tab unmount during in-flight upload | Fetch aborts, backend cleans up multipart, user retries. Acceptable. |
| Concurrent row actions | `pendingActions` is a Set, so multiple distinct rows can be parsed/deleted in parallel. Same row cannot have two pending actions. |
| Switching to Session tab while Storage is mid-upload | `StoragePanel` keeps state across tab changes — shadcn `<TabsContent forceMount>` or equivalent keeps both panels in the React tree, only toggling visibility. In-flight uploads continue and toast on completion. |

## 10. What does NOT change

- `server.py`, `storage.py`, `parser.py`, `pdf_export.py`, `ai_chat.py` — zero backend edits.
- Postgres BYTEA archive routes (`/api/files`, `/api/files/upload`, `/api/files/<id>`) — stay alive, just not surfaced.
- Legacy frontend (`templates/index.html`, `static/css/*`, `static/js/*`) — untouched. The two frontends coexist as before.
- Existing visualizers, AI chat, compare, slides, export modal — none are touched.
- `package.json` — no new dependencies. Everything needed (shadcn UI, sonner, lucide-react) is already present.

## 11. Out of scope

| Area | Reason |
|---|---|
| Postgres BYTEA archive UI | Decided in §2.1. |
| Tests | The new frontend has no test infra (only `scripts/snapshot-shapes.mjs`). Adding Jest/Vitest is a separate decision. |
| Bulk select / multi-row delete | Not in legacy. Scope creep. |
| Rename / move / tag / folder | Not in legacy. |
| Storage quota or usage indicator | Backend doesn't expose this. |
| Mobile-specific tweaks | Whatever shadcn responsive defaults give us. |
| Secret Chat or other hidden-feature rewires | Separate work. |
| Real auth on the storage gate | Decision §2.2 keeps the soft hide. |

## 12. Verification plan

| Step | How | Who |
|---|---|---|
| TypeScript clean | `pnpm tsc --noEmit` from `NewFrontEndToBePorted/` (`next.config.mjs` has `ignoreBuildErrors: true`, so manual tsc matters) | Implementer |
| Production build clean | `pnpm build` | Implementer |
| `R2FileRecord` shape matches reality | One live fetch against local Flask `:5000` `/api/r2/files`; reconcile field names | Implementer |
| Golden path | Upload small (~2 MB) → row appears + dashboard loads · Upload large (>40 MB) → progress + row appears + dashboard loads · Click play on existing row → dashboard loads · Click delete → confirm dialog → row gone | User in browser |
| Edge paths | Wrong password → inline error · Open second browser tab → password re-prompted · Empty archive state · Network failure → retry button works · Delete a row that was already removed via another tab | User in browser |
| Production smoke | After copy `V8/` → `PowerBI/` and push, open `elevatechecked1.info/beta` → Files → Storage → password → upload `ETH SOA 30.1.26.xlsx` | User |

## 13. Risk register

| Risk | Mitigation |
|---|---|
| `R2FileRecord` field names diverge from backend | Read `storage.get_all_r2_files()` and the `/api/r2/files` Flask handler before writing UI code; adjust the TS type to match. |
| Server returns `datetime` instead of ISO string | Coerce in `listR2Files` helper. |
| `parseR2File` response shape differs from `uploadFileChunked`'s parse step | Both call the same `/api/r2/files/{id}/parse` route. Use the existing parse-response normalisation already in `uploadFileChunked`. |
| Concurrent upload + parse races the list refetch | List refetch is idempotent; last write wins; backend is source of truth. |
| Large-file parse blocks for tens of seconds | Row spinner + toast keeps the user informed. Same UX bar as legacy. |

## 14. Ground rules

- No file edited outside `NewFrontEndToBePorted/`
- No new dependencies in `package.json`
- New strings match the tone in `app-shell.tsx` and existing `files-view.tsx`
- File names kebab-case; React exports PascalCase
- One PR-shaped diff
