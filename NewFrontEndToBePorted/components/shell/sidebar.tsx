"use client"

import { useRef } from "react"
import {
  Upload,
  FileText,
  LayoutGrid,
  Gauge,
  Presentation,
  GitCompare,
  FolderOpen,
  Sparkles,
  Download,
  LogOut,
} from "lucide-react"
import type { ViewMode, UploadedFile } from "@/lib/types"
import { FileChip } from "@/components/shared/file-chip"
import { RRMonogram, RRWordmark } from "@/components/brand/rr-wordmark"
import { cn } from "@/lib/utils"
import { logoutAction } from "@/app/login/actions"

interface SidebarProps {
  currentView: ViewMode
  onViewChange: (v: ViewMode) => void
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
  onRemoveFile: (name: string) => void
  onUploadFiles: (files: FileList | null) => void | Promise<void>
  uploading?: boolean
  onExport: () => void
}

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType; experimental?: boolean }[] = [
  { id: "standard", label: "Standard", icon: LayoutGrid },
  { id: "executive", label: "Executive", icon: Gauge },
  { id: "slides", label: "Slides", icon: Presentation },
  { id: "compare", label: "Compare", icon: GitCompare },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "ai", label: "AI Assistant", icon: Sparkles, experimental: true },
]

export function Sidebar({
  currentView,
  onViewChange,
  files,
  activeFile,
  onSelectFile,
  onRemoveFile,
  onUploadFiles,
  uploading = false,
  onExport,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasFiles = files.length > 0

  return (
    <aside className="flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border w-[18rem] flex-shrink-0 h-screen sticky top-0">
      {/* Logo header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <RRMonogram />
        <RRWordmark tone="light" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-6">
        {/* Upload */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[10px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/50">
            Upload Files
          </h2>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group flex flex-col items-center gap-2 rounded-lg border border-dashed border-sidebar-border bg-sidebar-accent/30 p-4 text-center text-sidebar-foreground/80 hover:border-sidebar-primary/60 hover:bg-sidebar-accent/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary/15 text-sidebar-primary">
              <Upload className="h-4 w-4" />
            </span>
            <span className="text-xs font-medium">
              {uploading ? "Parsing…" : "Drop Excel files here"}
            </span>
            <span className="text-[10px] text-sidebar-foreground/50">
              .xlsx · .xls · .xlsb · .xlsm · .pptx
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.xlsb,.xlsm,.pptx"
            className="hidden"
            onChange={(e) => {
              const picked = e.currentTarget.files
              void onUploadFiles(picked)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
          />
          {hasFiles ? (
            <ul className="flex flex-col gap-1.5">
              {files.map((f) => (
                <li key={f.name}>
                  <FileChip
                    name={f.name}
                    fileType={f.file_type}
                    active={activeFile === f.name}
                    onClick={() => onSelectFile(f.name)}
                    onRemove={() => onRemoveFile(f.name)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Views */}
        <section className="flex flex-col gap-2">
          <h2 className="text-[10px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/50">
            Dashboard View
          </h2>
          <nav className="flex flex-col gap-1">
            {VIEWS.map((v) => {
              const active = currentView === v.id
              const Icon = v.icon
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onViewChange(v.id)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-left transition-colors",
                    active
                      ? "bg-sidebar-primary/15 text-sidebar-foreground border border-sidebar-primary/40"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 border border-transparent",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        active ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                      )}
                    />
                    {v.label}
                  </span>
                  {v.experimental ? (
                    <span className="text-[9px] font-semibold tracking-[0.1em] uppercase text-sidebar-primary/80">
                      Exp.
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        </section>

        {/* Export */}
        {hasFiles ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[10px] font-semibold tracking-[0.18em] uppercase text-sidebar-foreground/50">
              Export
            </h2>
            <button
              type="button"
              onClick={onExport}
              className="flex items-center justify-center gap-2 rounded-md bg-sidebar-primary text-sidebar-primary-foreground px-3 py-2 text-sm font-medium hover:bg-sidebar-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export PDF Report
            </button>
          </section>
        ) : null}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-4 flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-sidebar-foreground/70 flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Data Visualizer
          </span>
          <span className="text-[10px] text-sidebar-foreground/50 truncate">
            Finance &amp; Receivables
          </span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center justify-center h-8 w-8 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  )
}
