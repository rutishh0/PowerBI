# Files Storage Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the persistent file-storage section from the legacy vanilla-JS frontend into the new Next.js frontend at `/beta`, exposing the existing `/api/r2/*` backend through a password-gated Storage tab alongside the current Session catalogue.

**Architecture:** `components/views/files-view.tsx` is replaced by a `components/views/files/` folder. A tabs wrapper (`index.tsx`) renders two panels: `session-panel.tsx` (lifted current behavior, unchanged) and `storage-panel.tsx` (new — password gate → R2 file list → upload zone → row actions: download, parse-and-load, delete). New API helpers (`listR2Files`, `deleteR2File`, `parseR2File`, `r2FileDownloadUrl`) live in `lib/api.ts`; the new `R2FileRecord` type lives in `lib/types.ts`. Storage uploads always route through the chunked R2 path regardless of file size. Parsed payloads are bubbled up to `AppShell` via an `onParsed` callback so they slot into the same dashboard state path that sidebar uploads use.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui (Tabs, AlertDialog, Empty, Skeleton, Card, Button, Input), `sonner` toasts, `lucide-react` icons. No new dependencies. Manual verification (no test infra in the new frontend).

**Note on commits:** V8 is not a git repository. The user pushes by copying V8 → PowerBI and pushing from PowerBI. Each task therefore ends at a "leave the working tree clean and runnable" checkpoint instead of `git commit`. The user takes the snapshot when they're ready.

**Verification mantra per task:** `pnpm tsc --noEmit` from `NewFrontEndToBePorted/` must pass before moving to the next task.

**Spec:** `docs/superpowers/specs/2026-05-18-files-storage-section-design.md`

---

## Task 1: Add R2 types, API helpers, and format utilities

**Files:**
- Modify: `NewFrontEndToBePorted/lib/types.ts` (append `R2FileRecord` near the end, before `ParsedFile` union)
- Modify: `NewFrontEndToBePorted/lib/api.ts` (append four new exports at the end of the R2 section)
- Modify: `NewFrontEndToBePorted/lib/format.ts` (append `fmtBytes` and `fmtDateTime`)

- [ ] **Step 1: Add `R2FileRecord` type**

Append to `NewFrontEndToBePorted/lib/types.ts`, immediately above the `/* ---------- Union ---------- */` comment:

```ts
/* ---------- R2 archived file (persistent storage row) ---------- */
/* Mirrors storage.get_all_r2_files() projection (id, filename, r2_key,
 * public_url, file_size, upload_date — upload_date is already coerced
 * to an ISO string server-side at storage.py:258-259). */
export interface R2FileRecord {
  id: number
  filename: string
  r2_key: string
  public_url: string | null
  file_size: number
  upload_date: string
}
```

- [ ] **Step 2: Add four API helpers**

Append to `NewFrontEndToBePorted/lib/api.ts`, after `exportReport` (i.e. at end of file). The chunked `uploadFileChunked` already calls `POST /api/r2/files/{id}/parse` internally; we expose a standalone helper for re-parsing existing rows:

```ts
/* ---------- R2 archive (persistent file storage) ---------- */

import type { R2FileRecord } from "@/lib/types"

/** GET /api/r2/files — list everything in the R2 archive. */
export async function listR2Files(): Promise<R2FileRecord[]> {
  const res = await fetch("/api/r2/files", { cache: "no-store" })
  return handle<R2FileRecord[]>(res)
}

/** DELETE /api/r2/files/{id} — remove from R2 AND the metadata row.
 * Tolerates 404 (already gone). */
export async function deleteR2File(id: number): Promise<void> {
  const res = await fetch(`/api/r2/files/${id}`, { method: "DELETE" })
  if (!res.ok && res.status !== 404) {
    await handle(res)
  }
}

/** POST /api/r2/files/{id}/parse — re-parse a stored workbook on the
 * server and return it in the same UploadedFile[] shape uploads produce,
 * so callers can feed it straight into AppShell's `setFiles`. */
export async function parseR2File(id: number): Promise<UploadedFile[]> {
  const res = await fetch(`/api/r2/files/${id}/parse`, { method: "POST" })
  const body = await handle<{ files: Record<string, ParsedFile> }>(res)
  const out: UploadedFile[] = []
  for (const [name, parsed] of Object.entries(body.files ?? {})) {
    out.push({
      name,
      file_type: (parsed as { file_type?: FileType }).file_type ?? "UNKNOWN",
      parsed: parsed as ParsedFile,
    })
  }
  return out
}

/** Pure helper — the URL a browser uses to download a stored file. */
export function r2FileDownloadUrl(id: number): string {
  return `/api/r2/files/${id}`
}
```

Note: `R2FileRecord` import must be added at top of file alongside the existing `FileType, ParsedFile, UploadedFile` import — change the existing line to:

```ts
import type { FileType, ParsedFile, R2FileRecord, UploadedFile } from "@/lib/types"
```

- [ ] **Step 3: Add `fmtBytes` and `fmtDateTime` to `lib/format.ts`**

Append to `NewFrontEndToBePorted/lib/format.ts`:

```ts
/** Compact byte-size string, e.g. 1234 → "1.2 KB", 5_500_000 → "5.5 MB". */
export function fmtBytes(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v) || v < 0) return "—"
  if (v < 1024) return `${v} B`
  const kb = v / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** ISO-ish "Apr 22, 2026 · 13:20" for the storage table upload-date column. */
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—"
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
}
```

- [ ] **Step 4: Verify typecheck**

Run from `NewFrontEndToBePorted/`:
```
pnpm tsc --noEmit
```
Expected: exit 0, no errors. (`next.config.mjs` has `ignoreBuildErrors: true`, so we MUST run tsc manually — `pnpm build` would silently pass even if types are broken.)

- [ ] **Step 5: Checkpoint**

Working tree should now have three modified files and zero new files. Nothing user-visible has changed yet. Move on.

---

## Task 2: Scaffold `views/files/` folder and lift the Session panel (no behavior change)

After this task, the Files sidebar item still does exactly what it does today — but the code now lives in a folder with a tabs wrapper, and the Storage tab shows a "coming soon" stub.

**Files:**
- Create: `NewFrontEndToBePorted/components/views/files/session-panel.tsx`
- Create: `NewFrontEndToBePorted/components/views/files/index.tsx`
- Modify: `NewFrontEndToBePorted/components/shell/app-shell.tsx` (one import path change)
- Delete: `NewFrontEndToBePorted/components/views/files-view.tsx`

- [ ] **Step 1: Create `session-panel.tsx` by lifting the body of `files-view.tsx`**

Create `NewFrontEndToBePorted/components/views/files/session-panel.tsx`. This is the current `FilesView` component renamed to `SessionPanel`, identical logic, just one new prop signature (no `view`/`onParsed` — those belong on the wrapper):

```tsx
"use client"

import { useMemo, useState } from "react"
import { FileSpreadsheet, Search } from "lucide-react"
import type { UploadedFile, FileType } from "@/lib/types"
import { FILE_TYPE_LABELS, FILE_TYPE_BADGES, FILE_TYPE_DOT } from "@/lib/file-type-meta"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"

const TYPE_FILTERS: { id: FileType | "ALL"; label: string }[] = [
  { id: "ALL", label: "All files" },
  { id: "SOA", label: "SOA" },
  { id: "INVOICE_LIST", label: "Invoices" },
  { id: "OPPORTUNITY_TRACKER", label: "Opportunity" },
  { id: "GLOBAL_HOPPER", label: "Hopper" },
  { id: "SHOP_VISIT_HISTORY", label: "Shop visits" },
  { id: "SVRG_MASTER", label: "SVRG" },
  { id: "COMMERCIAL_PLAN", label: "Comm plan" },
  { id: "EMPLOYEE_WHEREABOUTS", label: "Whereabouts" },
]

function summaryFor(f: UploadedFile): string {
  const p: any = f.parsed
  switch (f.file_type) {
    case "SOA": {
      const sections = p.sections?.length ?? 0
      const items = (p.sections ?? []).reduce(
        (s: number, sec: any) => s + (sec.items?.length ?? 0),
        0,
      )
      return `${sections} sections · ${items} items`
    }
    case "INVOICE_LIST": {
      return `${p.totals?.item_count ?? 0} invoices · ${(p.metadata?.currencies ?? []).join(", ") || "—"}`
    }
    case "OPPORTUNITY_TRACKER": {
      return `${p.summary?.total_opportunities ?? 0} opportunities`
    }
    case "GLOBAL_HOPPER": {
      return `${p.opportunities?.length ?? 0} opportunities · ${(p.summary?.unique_regions ?? []).length} regions`
    }
    case "SHOP_VISIT_HISTORY": {
      return `${p.statistics?.total_shop_visits ?? 0} shop visits · ${p.statistics?.total_engines_tracked ?? 0} engines`
    }
    case "SVRG_MASTER": {
      return `${p.claims_summary?.total_claims ?? 0} claims · ${p.event_entries?.total_events ?? 0} events`
    }
    case "COMMERCIAL_PLAN": {
      return `${p.one_year_plan?.items?.length ?? 0} 1YP actions · ${
        p.five_year_spe_sales?.items?.length ?? 0
      } SPE opps`
    }
    case "EMPLOYEE_WHEREABOUTS": {
      return `${p.metadata?.total_employees ?? 0} employees · ${
        (p.metadata?.unique_countries ?? []).length
      } countries`
    }
    default:
      return "Workbook parsed by the Finance Data Visualizer."
  }
}

interface SessionPanelProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
}

export function SessionPanel({ files, activeFile, onSelectFile }: SessionPanelProps) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<FileType | "ALL">("ALL")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return files.filter((f) => {
      if (filter !== "ALL" && f.file_type !== filter) return false
      if (!needle) return true
      return (
        f.name.toLowerCase().includes(needle) ||
        FILE_TYPE_LABELS[f.file_type].toLowerCase().includes(needle)
      )
    })
  }, [files, q, filter])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground max-w-xl text-pretty">
            All uploaded workbooks parsed in this session. Click a file to open the
            matching visualizer; use search or the type filter to narrow the list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InputGroup className="w-full lg:w-72">
            <InputGroupAddon>
              <Search className="h-4 w-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search filename or type"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files uploaded yet</EmptyTitle>
            <EmptyDescription>
              Drop a workbook into the sidebar uploader to parse it. The catalogue will
              populate as you upload more files in this session.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files match</EmptyTitle>
            <EmptyDescription>
              Try a different search term or switch the type filter back to &quot;All files&quot;.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => { setQ(""); setFilter("ALL") }}>
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const isActive = activeFile === f.name
            return (
              <Card
                key={f.name}
                onClick={() => onSelectFile(f.name)}
                className={`p-5 transition shadow-sm cursor-pointer ${
                  isActive
                    ? "border-primary ring-1 ring-primary/40"
                    : "border-border hover:border-ring"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 shrink-0 relative">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                    <span
                      className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${FILE_TYPE_DOT[f.file_type]}`}
                      aria-hidden="true"
                    />
                  </div>
                  <Badge variant="outline" className="text-[10px] tracking-wider uppercase font-semibold">
                    {FILE_TYPE_BADGES[f.file_type]}
                  </Badge>
                </div>

                <h3 className="mt-4 font-medium text-sm text-foreground break-words leading-snug">
                  {f.name}
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed text-pretty">
                  {summaryFor(f)}
                </p>

                <div className="mt-4 text-[11px] text-muted-foreground uppercase tracking-wider">
                  {FILE_TYPE_LABELS[f.file_type]}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

Note the body removed the outer `<div className="p-6 lg:p-8 ...">` padding wrapper and the page-title block (`<h1>Document catalogue</h1>` etc.) — those move up to the wrapper in Step 2 so they aren't duplicated per tab.

- [ ] **Step 2: Create `index.tsx` (the tabs wrapper)**

Create `NewFrontEndToBePorted/components/views/files/index.tsx`:

```tsx
"use client"

import type { UploadedFile } from "@/lib/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SessionPanel } from "./session-panel"

interface FilesViewProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
}

export function FilesView({ files, activeFile, onSelectFile }: FilesViewProps) {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
          Document catalogue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse files parsed in this session or stored in cloud archive.
        </p>
      </div>

      <Tabs defaultValue="session">
        <TabsList>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="session" className="pt-6">
          <SessionPanel files={files} activeFile={activeFile} onSelectFile={onSelectFile} />
        </TabsContent>

        <TabsContent value="storage" className="pt-6">
          <div className="text-sm text-muted-foreground italic">
            Storage tab coming online in the next task…
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

(The `forceMount` prop on `TabsContent` is added in Task 4, once the storage panel actually has state worth preserving. Adding it now would just delay the warning that an empty placeholder isn't worth preserving.)

- [ ] **Step 3: Update `app-shell.tsx` to import from the new path**

In `NewFrontEndToBePorted/components/shell/app-shell.tsx`, change the import on line 14 (currently `import { FilesView } from "@/components/views/files-view"`) to:

```ts
import { FilesView } from "@/components/views/files"
```

No other changes to `app-shell.tsx` in this task.

- [ ] **Step 4: Delete `files-view.tsx`**

```
Delete: NewFrontEndToBePorted/components/views/files-view.tsx
```

(In PowerShell: `Remove-Item "C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V8\NewFrontEndToBePorted\components\views\files-view.tsx"`)

- [ ] **Step 5: Verify typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0. The only behaviour change should be: clicking Files opens a tabs view; Session tab works identically to before; Storage tab shows the placeholder text.

- [ ] **Step 6: Checkpoint**

Folder structure is in place. Session catalogue feature is preserved. Move on.

---

## Task 3: Password gate + Storage panel scaffold

Storage tab now shows a working password gate. Right password → "Storage coming online…" body (table comes in Task 4). Wrong password → inline error.

**Files:**
- Create: `NewFrontEndToBePorted/components/views/files/storage-password-gate.tsx`
- Create: `NewFrontEndToBePorted/components/views/files/storage-panel.tsx`
- Modify: `NewFrontEndToBePorted/components/views/files/index.tsx` (swap placeholder for `<StoragePanel />`)

- [ ] **Step 1: Create `storage-password-gate.tsx`**

Create `NewFrontEndToBePorted/components/views/files/storage-password-gate.tsx`:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import { Lock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface StoragePasswordGateProps {
  onUnlock: () => void
}

export function StoragePasswordGate({ onUnlock }: StoragePasswordGateProps) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Soft hide, not real auth. Same string the legacy Files module and Secret
  // Chat used. The main Flask login already gated everything.
  const STORAGE_GATE_PASSWORD = "ChickenMan123"

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (value === STORAGE_GATE_PASSWORD) {
      setError(null)
      onUnlock()
    } else {
      setError("Incorrect access code")
      setValue("")
    }
  }

  return (
    <div className="flex justify-center py-10">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Cloud archive</h2>
            <p className="text-xs text-muted-foreground">Enter access code to view persistent storage.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Access code"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "storage-gate-error" : undefined}
          />
          {error ? (
            <p id="storage-gate-error" className="text-xs text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={value.length === 0}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Create `storage-panel.tsx`**

Create `NewFrontEndToBePorted/components/views/files/storage-panel.tsx`. This is the scaffold — fetch logic and table arrive in Task 4:

```tsx
"use client"

import { useEffect, useState } from "react"
import { StoragePasswordGate } from "./storage-password-gate"

const UNLOCK_KEY = "rr.storage.unlocked"

export function StoragePanel() {
  // Lazy-init so SSR doesn't read sessionStorage. The initial server render
  // shows the gate; the first client effect rehydrates the unlocked state.
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
      setUnlocked(true)
    }
  }, [])

  function handleUnlock() {
    sessionStorage.setItem(UNLOCK_KEY, "1")
    setUnlocked(true)
  }

  if (!unlocked) {
    return <StoragePasswordGate onUnlock={handleUnlock} />
  }

  return (
    <div className="text-sm text-muted-foreground italic">
      Unlocked — storage table coming in the next task.
    </div>
  )
}
```

- [ ] **Step 3: Swap placeholder for `<StoragePanel />` in `index.tsx`**

In `NewFrontEndToBePorted/components/views/files/index.tsx`, add the import and replace the Storage tab body. Add to imports:

```ts
import { StoragePanel } from "./storage-panel"
```

Replace the existing Storage `TabsContent` body (currently the italic placeholder) with:

```tsx
<TabsContent value="storage" className="pt-6">
  <StoragePanel />
</TabsContent>
```

- [ ] **Step 4: Verify typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Manual sanity (only if you happen to be running the dev server)**

If the dev stack is up, switch to the Storage tab → see gate. Try empty password (Unlock disabled). Try "wrong" → inline error appears. Try "ChickenMan123" → body changes to the italic "Unlocked — storage table coming…" text. Close the browser tab, reopen `/beta` → password is asked again (sessionStorage cleared on tab close). Open a NEW tab in the same window → unlock still remembered.

If the dev stack is NOT running, skip this step; Task 7 covers full verification.

- [ ] **Step 6: Checkpoint**

Gate works. Move on.

---

## Task 4: R2 file list + table (read-only display)

Storage tab now fetches `/api/r2/files` and renders a table of stored files. No row actions wired yet — those come in Task 5. Also adds `forceMount` to both `TabsContent` panels so state survives tab switches.

**Files:**
- Create: `NewFrontEndToBePorted/components/views/files/storage-files-table.tsx`
- Modify: `NewFrontEndToBePorted/components/views/files/storage-panel.tsx` (replace italic placeholder)
- Modify: `NewFrontEndToBePorted/components/views/files/index.tsx` (add `forceMount` to both `TabsContent`)

- [ ] **Step 1: Create `storage-files-table.tsx`**

Create `NewFrontEndToBePorted/components/views/files/storage-files-table.tsx`. Pure presentational component — receives the list and renders rows. Row-action props are wired in Task 5.

```tsx
"use client"

import { FileSpreadsheet } from "lucide-react"
import type { R2FileRecord } from "@/lib/types"
import { fmtBytes, fmtDateTime } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface StorageFilesTableProps {
  files: R2FileRecord[]
}

export function StorageFilesTable({ files }: StorageFilesTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%]">File</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => (
            <TableRow key={f.id}>
              <TableCell>
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm truncate">{f.filename}</span>
                  <Badge variant="outline" className="text-[9px] tracking-wider uppercase font-semibold shrink-0">
                    R2
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {fmtDateTime(f.upload_date)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {fmtBytes(f.file_size)}
              </TableCell>
              <TableCell className="text-right pr-4">
                <span className="text-xs text-muted-foreground italic">
                  actions in next task
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Wire fetch + states into `storage-panel.tsx`**

Replace the current `storage-panel.tsx` with the version below. Adds: list state, loading skeleton, error card with retry, empty state, table render.

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import type { R2FileRecord } from "@/lib/types"
import { listR2Files, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { StoragePasswordGate } from "./storage-password-gate"
import { StorageFilesTable } from "./storage-files-table"

const UNLOCK_KEY = "rr.storage.unlocked"

export function StoragePanel() {
  const [unlocked, setUnlocked] = useState(false)

  const [files, setFiles] = useState<R2FileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
      setUnlocked(true)
    }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listR2Files()
      setFiles(list)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load storage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked) void refetch()
  }, [unlocked, refetch])

  function handleUnlock() {
    sessionStorage.setItem(UNLOCK_KEY, "1")
    setUnlocked(true)
  }

  if (!unlocked) {
    return <StoragePasswordGate onUnlock={handleUnlock} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Cloud archive</h2>
          <p className="text-xs text-muted-foreground">
            Files persisted to Cloudflare R2. Available across sessions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && files.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="mt-3"
          >
            Retry
          </Button>
        </Card>
      ) : files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files in cloud storage yet</EmptyTitle>
            <EmptyDescription>
              Files uploaded here persist across sessions and can be reopened
              into the dashboard at any time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StorageFilesTable files={files} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add `forceMount` to both `TabsContent` in `index.tsx`**

Open `NewFrontEndToBePorted/components/views/files/index.tsx`. Update the two `TabsContent` lines to keep both panels mounted across tab switches (so an in-flight Storage upload survives a tab change to Session):

```tsx
<TabsContent value="session" forceMount className="pt-6 data-[state=inactive]:hidden">
  <SessionPanel files={files} activeFile={activeFile} onSelectFile={onSelectFile} />
</TabsContent>

<TabsContent value="storage" forceMount className="pt-6 data-[state=inactive]:hidden">
  <StoragePanel />
</TabsContent>
```

The `data-[state=inactive]:hidden` class is required because `forceMount` keeps the inactive panel in the DOM by default — Radix doesn't auto-hide it.

- [ ] **Step 4: Verify typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Manual sanity (if dev stack running)**

Unlock → either see skeleton, then table OR Empty state ("No files in cloud storage yet"). Click Refresh → list refetches. If Flask is offline, click Retry on the error card. Switch to Session tab and back → no flicker, no refetch (state preserved via `forceMount`).

- [ ] **Step 6: Checkpoint**

Read-only table view works. Move on to row actions.

---

## Task 5: Row actions — Download, Parse & Load, Delete

Wires up the three row buttons. Download is a plain anchor. Parse & Load and Delete bubble through callbacks; Parse & Load reaches `AppShell` so the dashboard updates.

**Files:**
- Modify: `NewFrontEndToBePorted/components/views/files/storage-files-table.tsx` (replace italic placeholder with three buttons + AlertDialog)
- Modify: `NewFrontEndToBePorted/components/views/files/storage-panel.tsx` (add `pendingActions`, `handleParse`, `handleDelete`)
- Modify: `NewFrontEndToBePorted/components/views/files/index.tsx` (add `onParsed` prop, pass through)
- Modify: `NewFrontEndToBePorted/components/shell/app-shell.tsx` (add `handleStorageParsed`, pass as `onParsed` to `FilesView`)

- [ ] **Step 1: Rewrite `storage-files-table.tsx` with row actions**

Replace the entire file with the version below. New props: `onParse`, `onDelete`, `pendingActions`. Download stays a plain anchor — no callback needed.

```tsx
"use client"

import { FileSpreadsheet, Download, Play, Trash2, Loader2 } from "lucide-react"
import type { R2FileRecord } from "@/lib/types"
import { r2FileDownloadUrl } from "@/lib/api"
import { fmtBytes, fmtDateTime } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface StorageFilesTableProps {
  files: R2FileRecord[]
  pendingActions: Set<number>
  onParse: (file: R2FileRecord) => void
  onDelete: (file: R2FileRecord) => void
}

export function StorageFilesTable({
  files,
  pendingActions,
  onParse,
  onDelete,
}: StorageFilesTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%]">File</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => {
            const pending = pendingActions.has(f.id)
            return (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{f.filename}</span>
                    <Badge variant="outline" className="text-[9px] tracking-wider uppercase font-semibold shrink-0">
                      R2
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDateTime(f.upload_date)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtBytes(f.file_size)}
                </TableCell>
                <TableCell className="text-right pr-4">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      title="Download"
                      disabled={pending}
                    >
                      <a href={r2FileDownloadUrl(f.id)} download={f.filename}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Parse & load to dashboard"
                      onClick={() => onParse(f)}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete from cloud storage"
                          disabled={pending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete from cloud storage?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-medium">{f.filename}</span> will be
                            removed from Cloudflare R2 and its metadata row deleted.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(f)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Add `pendingActions` + handlers to `storage-panel.tsx`**

Replace `storage-panel.tsx` with the version below. Adds: `onParsed` prop, `pendingActions` state, `handleParse`, `handleDelete`, `sonner` toasts.

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { R2FileRecord, UploadedFile } from "@/lib/types"
import {
  listR2Files,
  parseR2File,
  deleteR2File,
  ApiError,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { StoragePasswordGate } from "./storage-password-gate"
import { StorageFilesTable } from "./storage-files-table"

const UNLOCK_KEY = "rr.storage.unlocked"

interface StoragePanelProps {
  onParsed: (files: UploadedFile[]) => void
}

export function StoragePanel({ onParsed }: StoragePanelProps) {
  const [unlocked, setUnlocked] = useState(false)

  const [files, setFiles] = useState<R2FileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
      setUnlocked(true)
    }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listR2Files()
      setFiles(list)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load storage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked) void refetch()
  }, [unlocked, refetch])

  function markPending(id: number, on: boolean) {
    setPendingActions((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleParse(file: R2FileRecord) {
    markPending(file.id, true)
    try {
      const parsed = await parseR2File(file.id)
      onParsed(parsed)
      toast.success(`${file.filename} loaded to dashboard`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.error(`${file.filename} no longer in storage`)
        await refetch()
      } else {
        const msg = err instanceof Error ? err.message : "Parse failed"
        toast.error(`Parse failed: ${file.filename}`, { description: msg })
      }
    } finally {
      markPending(file.id, false)
    }
  }

  async function handleDelete(file: R2FileRecord) {
    markPending(file.id, true)
    try {
      await deleteR2File(file.id)
      toast.success(`Removed ${file.filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed"
      toast.error(`Couldn't remove ${file.filename}`, { description: msg })
    } finally {
      markPending(file.id, false)
      await refetch()
    }
  }

  function handleUnlock() {
    sessionStorage.setItem(UNLOCK_KEY, "1")
    setUnlocked(true)
  }

  if (!unlocked) {
    return <StoragePasswordGate onUnlock={handleUnlock} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Cloud archive</h2>
          <p className="text-xs text-muted-foreground">
            Files persisted to Cloudflare R2. Available across sessions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && files.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="mt-3"
          >
            Retry
          </Button>
        </Card>
      ) : files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files in cloud storage yet</EmptyTitle>
            <EmptyDescription>
              Files uploaded here persist across sessions and can be reopened
              into the dashboard at any time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StorageFilesTable
          files={files}
          pendingActions={pendingActions}
          onParse={handleParse}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add `onParsed` prop to `FilesView` and pass through to `StoragePanel`**

In `NewFrontEndToBePorted/components/views/files/index.tsx`:

```tsx
"use client"

import type { UploadedFile } from "@/lib/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SessionPanel } from "./session-panel"
import { StoragePanel } from "./storage-panel"

interface FilesViewProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
  onParsed: (files: UploadedFile[]) => void
}

export function FilesView({
  files,
  activeFile,
  onSelectFile,
  onParsed,
}: FilesViewProps) {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
          Document catalogue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse files parsed in this session or stored in cloud archive.
        </p>
      </div>

      <Tabs defaultValue="session">
        <TabsList>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="session" forceMount className="pt-6 data-[state=inactive]:hidden">
          <SessionPanel files={files} activeFile={activeFile} onSelectFile={onSelectFile} />
        </TabsContent>

        <TabsContent value="storage" forceMount className="pt-6 data-[state=inactive]:hidden">
          <StoragePanel onParsed={onParsed} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 4: Wire `onParsed` in `app-shell.tsx`**

In `NewFrontEndToBePorted/components/shell/app-shell.tsx`, add a small handler. The dashboard's existing `setFiles(prev => …)` flow already dedups by name, so this is a thin shim mirroring the success path inside `handleUpload`. Add it directly after `removeFile`:

```tsx
function handleStorageParsed(parsed: UploadedFile[]) {
  if (parsed.length === 0) return
  setFiles((prev) => {
    const byName = new Map(prev.map((p) => [p.name, p]))
    for (const a of parsed) byName.set(a.name, a)
    return Array.from(byName.values())
  })
  setActiveFile((curr) => curr ?? parsed[0]?.name ?? null)
}
```

Then update the `<FilesView />` render to pass it. Replace the existing block:

```tsx
{view === "files" ? (
  <FilesView
    files={files}
    activeFile={activeFileName}
    onSelectFile={(name) => {
      setActiveFile(name)
      setView("standard")
    }}
  />
) : view === "ai" ? (
```

with:

```tsx
{view === "files" ? (
  <FilesView
    files={files}
    activeFile={activeFileName}
    onSelectFile={(name) => {
      setActiveFile(name)
      setView("standard")
    }}
    onParsed={handleStorageParsed}
  />
) : view === "ai" ? (
```

- [ ] **Step 5: Verify typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Manual sanity (if dev stack running, and assuming at least one row exists in R2)**

In Storage tab: click Download icon → file downloads (browser-native). Click Play → row spinner shows briefly, toast "loaded to dashboard", sidebar file chip appears, switching to Standard view renders the visualizer. Click Trash → AlertDialog appears, cancel keeps the row, confirm removes the row + toast "Removed …". Try deleting a row in a second browser tab while the first tab is open → after the first tab's next Refresh the row is gone.

- [ ] **Step 7: Checkpoint**

All row actions work. Move on to upload.

---

## Task 6: Storage upload zone

Adds a drag-and-drop upload zone above the table inside the Storage tab. Every drop routes through `uploadFileChunked` (always, regardless of file size — per spec §2.4) so it always lands in the archive, and bubbles parsed payloads up to the dashboard via the same `onParsed` callback.

**Files:**
- Create: `NewFrontEndToBePorted/components/views/files/storage-upload-zone.tsx`
- Modify: `NewFrontEndToBePorted/components/views/files/storage-panel.tsx` (insert `<StorageUploadZone />` above the table; add `handleUploaded` that refetches list + bubbles `onParsed`)

- [ ] **Step 1: Create `storage-upload-zone.tsx`**

Create `NewFrontEndToBePorted/components/views/files/storage-upload-zone.tsx`. Mirrors the existing sidebar upload behavior (toast pattern from `app-shell.tsx` lines 32-104), but locked to chunked-R2 always:

```tsx
"use client"

import { useRef, useState, type DragEvent } from "react"
import { UploadCloud } from "lucide-react"
import { toast } from "sonner"
import type { UploadedFile } from "@/lib/types"
import { uploadFileChunked, ApiError } from "@/lib/api"

interface StorageUploadZoneProps {
  /** Called once with every parsed file after a successful archive+parse. */
  onUploaded: (files: UploadedFile[]) => void
}

export function StorageUploadZone({ onUploaded }: StorageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function handleFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return

    setBusy(true)
    const accepted: UploadedFile[] = []

    for (const f of Array.from(picked)) {
      if (inFlight.current.has(f.name)) continue
      inFlight.current.add(f.name)

      const toastId = toast.loading(`Archiving ${f.name}…`, {
        description: "Streaming to R2 in chunks.",
      })

      try {
        const parsed = await uploadFileChunked(f, (p) => {
          const label =
            p.phase === "uploading"
              ? `Archiving ${f.name} · ${Math.round(p.ratio * 100)}%`
              : p.phase === "finalizing"
                ? `Finalizing ${f.name}…`
                : `Parsing ${f.name}…`
          toast.loading(label, { id: toastId })
        })
        for (const u of parsed) accepted.push(u)
        toast.success(`Archived ${f.name}`, { id: toastId })
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed"
        toast.error(`Upload failed: ${f.name}`, { id: toastId, description: msg })
      } finally {
        inFlight.current.delete(f.name)
      }
    }

    if (accepted.length > 0) {
      onUploaded(accepted)
    }
    setBusy(false)
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(true)
  }

  function onDragLeave() {
    setDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    void handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`group flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center cursor-pointer transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:border-ring hover:bg-muted/50"
      } ${busy ? "opacity-70 pointer-events-none" : ""}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UploadCloud className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">
        {busy ? "Archiving…" : "Drop workbooks to archive"}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Saved to Cloudflare R2 and loaded into the dashboard · .xlsx · .xls · .xlsb · .xlsm
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.xlsb,.xlsm"
        className="hidden"
        onChange={(e) => {
          const picked = e.currentTarget.files
          void handleFiles(picked)
          if (inputRef.current) inputRef.current.value = ""
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Mount the upload zone above the table in `storage-panel.tsx`**

Two changes:

(a) Add the import at the top of `storage-panel.tsx`:

```ts
import { StorageUploadZone } from "./storage-upload-zone"
```

(b) Inside the unlocked-render block (the final `return (...)` in `StoragePanel`), insert `<StorageUploadZone … />` between the header row and the table/empty/error/skeleton block. The full new return block:

```tsx
return (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold">Cloud archive</h2>
        <p className="text-xs text-muted-foreground">
          Files persisted to Cloudflare R2. Available across sessions.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void refetch()}
        disabled={loading}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>

    <StorageUploadZone
      onUploaded={(parsed) => {
        onParsed(parsed)
        void refetch()
      }}
    />

    {loading && files.length === 0 ? (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    ) : error ? (
      <Card className="p-4 border-destructive/40 bg-destructive/5">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          className="mt-3"
        >
          Retry
        </Button>
      </Card>
    ) : files.length === 0 ? (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No files in cloud storage yet</EmptyTitle>
          <EmptyDescription>
            Files uploaded here persist across sessions and can be reopened
            into the dashboard at any time.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <StorageFilesTable
        files={files}
        pendingActions={pendingActions}
        onParse={handleParse}
        onDelete={handleDelete}
      />
    )}
  </div>
)
```

- [ ] **Step 3: Verify typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Manual sanity (if dev stack running)**

Drag a small workbook onto the zone → toast progresses through Archiving/Finalizing/Parsing → ends at "Archived …" → row appears in table → dashboard sidebar shows file chip → switching to Standard view renders visualizer. Drag a >40 MB workbook → progress percentage updates inside the toast.

- [ ] **Step 5: Checkpoint**

Feature is functionally complete. Move on to final verification.

---

## Task 7: Final verification

No code changes. Confirms type cleanliness, production build, then hands off to user for browser walkthrough.

**Files:** none modified.

- [ ] **Step 1: Final typecheck**

```
pnpm tsc --noEmit
```
Expected: exit 0, no errors anywhere in the project (not just the new files).

- [ ] **Step 2: Production build**

```
pnpm build
```
Expected: build succeeds. `ignoreBuildErrors: true` in `next.config.mjs` means tsc isn't run here — Step 1 already covered types. We're checking that webpack/turbopack can produce a deployable bundle (chunk size warnings are fine).

- [ ] **Step 3: Hand off the browser walkthrough**

Inform the user: implementation is complete and the working tree under `V8/NewFrontEndToBePorted/` is ready to copy into `PowerBI/` for push. Surface the spec §12 manual walkthrough so the user can validate before pushing:

- **Golden path:** Upload small file from Storage tab → row appears + dashboard loads it. Upload large file (>40 MB) → progress shown in toast. Click Play on a stored row → dashboard loads it. Click Trash → confirm dialog → row gone.
- **Edges:** Wrong password → inline error. Open a fresh browser tab → password re-prompted. Empty archive shows the Empty card. Kill Flask backend → list shows error card with Retry. Switch to Session tab during upload → upload continues, toast still updates.
- **Production smoke (after push):** Open `elevatechecked1.info/beta` → Files → Storage tab → unlock → upload a known-good `ETH SOA 30.1.26.xlsx` → row appears → click Play → SOA visualizer renders.

- [ ] **Step 4: Done**

All seven tasks complete.

---

## Spec coverage check

Done after writing the plan (per writing-plans skill). Every spec requirement maps to at least one task:

| Spec section | Task(s) |
|---|---|
| §2.1 R2 only | Task 1 (helpers wrap `/api/r2/*` only), Tasks 4-6 (UI only ever talks to R2 endpoints) |
| §2.2 ChickenMan123 gate | Task 3 (`storage-password-gate.tsx`) |
| §2.3 One Files item, two tabs | Task 2 (tabs wrapper + Session lift) |
| §2.4 Separate upload zone, always chunked | Task 6 (`storage-upload-zone.tsx`, hardcoded to `uploadFileChunked`) |
| §2.5 `views/files/` folder split | Task 2 |
| §3 File layout | Tasks 1-6 each create/modify the files listed |
| §4 `R2FileRecord` | Task 1 step 1 |
| §5 Four API helpers | Task 1 step 2 |
| §6 Component contracts | Task 3 (Storage scaffold), Task 5 (Session/Storage prop signatures), Task 6 (UploadZone prop) |
| §7 State ownership | Tasks 3-6 keep state in `storage-panel.tsx` |
| §8.1 Tab activation + sessionStorage | Task 3 |
| §8.2 Password gate logic | Task 3 |
| §8.3 Upload flow | Task 6 |
| §8.4 Parse & load | Task 5 |
| §8.5 Delete with AlertDialog | Task 5 |
| §8.6 Download via anchor | Task 5 |
| §9 Empty/loading/error/401 | Task 4 (initial states), Task 5 (per-row errors) |
| §10 No backend or legacy edits | Implicit across all tasks |
| §11 Out-of-scope items | Not in any task ✓ |
| §12 Verification plan | Task 7 |
| §13 Risk register | R2FileRecord shape verified at planning time via storage.py read; addressed before Task 1. |
| §14 Ground rules (no deps, no edits outside `NewFrontEndToBePorted/`) | Implicit across all tasks |
