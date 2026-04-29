"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  action,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn("rounded-lg border border-border bg-card overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold tracking-tight truncate">{title}</h3>
            {subtitle ? (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            ) : null}
          </div>
        </button>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </header>
      {open ? <div className="border-t border-border">{children}</div> : null}
    </section>
  )
}
