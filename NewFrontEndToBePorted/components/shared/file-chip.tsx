"use client"

import { X } from "lucide-react"
import type { FileType } from "@/lib/types"
import { FILE_TYPE_BADGES, FILE_TYPE_DOT } from "@/lib/file-type-meta"
import { cn } from "@/lib/utils"

interface FileChipProps {
  name: string
  fileType: FileType
  active?: boolean
  onClick?: () => void
  onRemove?: () => void
  className?: string
}

export function FileChip({ name, fileType, active, onClick, onRemove, className }: FileChipProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "border-sidebar-primary/60 bg-sidebar-primary/15 text-sidebar-foreground"
          : "border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/85 hover:bg-sidebar-accent",
        className,
      )}
    >
      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", FILE_TYPE_DOT[fileType])} aria-hidden="true" />
      <button
        type="button"
        onClick={onClick}
        className="flex-1 text-left truncate min-w-0"
        title={name}
      >
        {name}
      </button>
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50 flex-shrink-0">
        {FILE_TYPE_BADGES[fileType]}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar/40"
          aria-label={`Remove ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )
}
