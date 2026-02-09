"use client"

import { useCallback, useState } from "react"
import { Upload, X, FileSpreadsheet } from "lucide-react"

interface FileUploadProps {
  onFilesLoaded: (files: { name: string; buffer: ArrayBuffer }[]) => void
  loadedFiles: string[]
  onRemoveFile: (name: string) => void
}

export function FileUpload({ onFilesLoaded, loadedFiles, onRemoveFile }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const results: { name: string; buffer: ArrayBuffer }[] = []
      for (const file of Array.from(fileList)) {
        if (
          file.name.endsWith(".xlsx") ||
          file.name.endsWith(".xls") ||
          file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ) {
          const buffer = await file.arrayBuffer()
          results.push({ name: file.name, buffer })
        }
      }
      if (results.length > 0) onFilesLoaded(results)
    },
    [onFilesLoaded]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  return (
    <div className="space-y-3">
      <label className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
        Upload Statement of Account
      </label>
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-rr-navy bg-rr-navy/10"
            : "border-sidebar-border hover:border-rr-silver/40"
        }`}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
          }}
        />
        <Upload className="mx-auto h-6 w-6 text-rr-silver/60 mb-2" />
        <p className="text-xs text-sidebar-foreground/60">
          Drop .xlsx files here or click to browse
        </p>
      </div>

      {loadedFiles.length > 0 && (
        <div className="space-y-1.5">
          {loadedFiles.map((name) => (
            <div
              key={name}
              className="flex items-center gap-2 bg-sidebar-accent rounded-md px-3 py-1.5 text-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-rr-silver/80 shrink-0" />
              <span className="text-sidebar-foreground/80 truncate flex-1">{name}</span>
              <button
                onClick={() => onRemoveFile(name)}
                className="text-sidebar-foreground/40 hover:text-rr-red transition-colors"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
