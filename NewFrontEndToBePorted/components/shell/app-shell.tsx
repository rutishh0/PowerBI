"use client"

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { UploadedFile, ViewMode } from "@/lib/types"
import { FILE_TYPE_LABELS } from "@/lib/file-type-meta"
import { uploadFileSmart, deleteParsed, ApiError } from "@/lib/api"
import { Sidebar } from "./sidebar"
import { MainHeader } from "./main-header"
import { WelcomeState } from "./welcome-state"
import { FileVisualizer } from "@/components/visualizers/file-visualizer"
import { SlidesView } from "@/components/views/slides-view"
import { CompareView } from "@/components/views/compare-view"
import { FilesView } from "@/components/views/files-view"
import { AiAssistantView } from "@/components/views/ai-assistant-view"
import { ExportModal } from "@/components/export-modal"

export function AppShell() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>("standard")
  const [exportOpen, setExportOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inFlight = useRef<Set<string>>(new Set())

  const active = useMemo(
    () => files.find((f) => f.name === activeFile) ?? files[0] ?? null,
    [files, activeFile],
  )

  async function handleUpload(picked?: FileList | null) {
    if (!picked || picked.length === 0) {
      toast.info("Pick a workbook", {
        description: "Click the dashed upload area to choose a .xlsx file.",
      })
      return
    }

    setUploading(true)
    const accepted: UploadedFile[] = []
    const failed: { name: string; error: string }[] = []

    const LARGE = 40 * 1024 * 1024
    let bigToast: string | number | undefined

    for (const f of Array.from(picked)) {
      if (inFlight.current.has(f.name)) continue
      inFlight.current.add(f.name)
      try {
        if (f.size > LARGE) {
          bigToast = toast.loading(`Uploading ${f.name}…`, {
            description: "Streaming to R2 in chunks (large file).",
          })
        }
        const parsed = await uploadFileSmart(f, (p) => {
          if (bigToast == null) return
          const label =
            p.phase === "uploading"
              ? `Uploading ${f.name} · ${Math.round(p.ratio * 100)}%`
              : p.phase === "finalizing"
                ? `Finalizing ${f.name}…`
                : `Parsing ${f.name}…`
          toast.loading(label, { id: bigToast })
        })
        if (bigToast != null) {
          toast.dismiss(bigToast)
          bigToast = undefined
        }
        for (const u of parsed) accepted.push(u)
      } catch (err) {
        if (bigToast != null) {
          toast.dismiss(bigToast)
          bigToast = undefined
        }
        const msg =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Upload failed"
        failed.push({ name: f.name, error: msg })
      } finally {
        inFlight.current.delete(f.name)
      }
    }

    if (accepted.length > 0) {
      setFiles((prev) => {
        const byName = new Map(prev.map((p) => [p.name, p]))
        for (const a of accepted) byName.set(a.name, a)
        return Array.from(byName.values())
      })
      setActiveFile((curr) => curr ?? accepted[0]?.name ?? null)
      const labels = accepted.map((a) => `${a.name} → ${FILE_TYPE_LABELS[a.file_type]}`).join(", ")
      toast.success(
        accepted.length === 1 ? "Workbook parsed" : `${accepted.length} workbooks parsed`,
        { description: labels },
      )
    }

    for (const f of failed) {
      toast.error(`Upload failed: ${f.name}`, { description: f.error })
    }

    setUploading(false)
  }

  async function removeFile(name: string) {
    // Optimistic UI: drop from local state, rollback on backend failure.
    const snapshot = files
    setFiles((prev) => prev.filter((f) => f.name !== name))
    if (activeFile === name) {
      const next = snapshot.filter((f) => f.name !== name)[0]?.name ?? null
      setActiveFile(next)
    }
    try {
      await deleteParsed(name)
      toast.message(`Removed ${name}`)
    } catch (err) {
      setFiles(snapshot)
      const msg = err instanceof Error ? err.message : "Could not remove file"
      toast.error(`Couldn't remove ${name}`, { description: msg })
    }
  }

  function resetView(next: ViewMode) {
    setView(next)
  }

  const activeLabel = active ? FILE_TYPE_LABELS[active.file_type] : null
  const activeFileName = active?.name ?? null

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar
        currentView={view}
        onViewChange={resetView}
        files={files}
        activeFile={activeFileName}
        onSelectFile={(name) => {
          setActiveFile(name)
          if (view === "files" || view === "ai" || view === "compare") setView("standard")
        }}
        onRemoveFile={removeFile}
        onUploadFiles={handleUpload}
        uploading={uploading}
        onExport={() => setExportOpen(true)}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        <MainHeader view={view} activeFileName={activeFileName} activeFileLabel={activeLabel} />

        <div className="flex-1 min-w-0">
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
            <AiAssistantView activeFile={active} />
          ) : view === "compare" ? (
            <CompareView files={files} activeFile={active} />
          ) : view === "slides" ? (
            active ? (
              <SlidesView file={active} />
            ) : (
              <WelcomeState onUpload={() => handleUpload()} />
            )
          ) : active ? (
            <FileVisualizer file={active} mode={view === "executive" ? "executive" : "standard"} />
          ) : (
            <WelcomeState onUpload={() => handleUpload()} />
          )}
        </div>

        <footer className="border-t border-border bg-muted/30 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span className="uppercase tracking-[0.15em] font-semibold">
            ROLLS-ROYCE Civil Aerospace — Data Visualizer
          </span>
          <span>
            Data sourced from uploaded workbook(s) &middot; For internal use only
          </span>
        </footer>
      </main>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} activeFile={active} />
    </div>
  )
}
