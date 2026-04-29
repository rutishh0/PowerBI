import { ChevronRight, Home } from "lucide-react"
import type { ViewMode } from "@/lib/types"
import { cn } from "@/lib/utils"

interface MainHeaderProps {
  view: ViewMode
  activeFileName: string | null
  activeFileLabel: string | null
}

const VIEW_LABELS: Record<ViewMode, string> = {
  standard: "Standard View",
  executive: "Executive View",
  slides: "Slides View",
  compare: "Compare View",
  files: "File Archive",
  ai: "AI Assistant",
}

export function MainHeader({ view, activeFileName, activeFileLabel }: MainHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex items-start justify-between gap-6 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Home className="h-3 w-3" />
            <span>Data Visualizer</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-foreground font-medium">{VIEW_LABELS[view]}</span>
            {activeFileLabel ? (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span className="truncate max-w-[22rem]" title={activeFileName ?? undefined}>
                  {activeFileLabel}
                </span>
              </>
            ) : null}
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mt-1">Data Visualizer</h1>
          <p className="text-sm text-muted-foreground mt-0.5 text-pretty">
            Rolls-Royce Civil Aerospace — Finance &amp; Receivables
          </p>
        </div>
        <div className={cn("flex flex-col items-end gap-1 flex-shrink-0")}>
          <span className="font-display text-[0.72rem] font-semibold tracking-[0.2em] text-foreground">
            ROLLS-ROYCE
          </span>
          <span className="font-display text-[0.62rem] tracking-[0.28em] text-accent-foreground/70">
            CIVIL AEROSPACE
          </span>
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
            Internal use only
          </span>
        </div>
      </div>
    </header>
  )
}
