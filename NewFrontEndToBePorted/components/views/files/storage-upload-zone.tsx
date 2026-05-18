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
