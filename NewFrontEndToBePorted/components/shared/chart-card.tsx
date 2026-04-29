"use client"

import { useRef, useState } from "react"
import { Download, FileImage, FileText, MoreVertical } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { exportChartAsPng, exportChartAsPdf } from "@/lib/chart-export"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

interface ChartCardProps {
  title: string
  subtitle?: string
  /** Optional override for the rendered top-right action. By default a
   * download menu (PNG / PDF) is rendered. Pass `false` to hide it. */
  action?: React.ReactNode | false
  className?: string
  children: React.ReactNode
  height?: number
  /** Filename stem for the downloaded chart. Defaults to the title. */
  exportFilename?: string
}

export function ChartCard({
  title,
  subtitle,
  action,
  className,
  children,
  height = 280,
  exportFilename,
}: ChartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null)

  const fname = exportFilename || title

  async function handleDownload(kind: "png" | "pdf") {
    if (!cardRef.current || busy) return
    setBusy(kind)
    try {
      if (kind === "png") {
        await exportChartAsPng(cardRef.current, fname)
        toast.success("PNG downloaded", { description: `${fname}.png` })
      } else {
        await exportChartAsPdf(cardRef.current, fname)
        toast.success("PDF downloaded", { description: `${fname}.pdf` })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed"
      toast.error("Couldn't generate file", { description: msg })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold tracking-tight truncate">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex-shrink-0 flex items-center gap-2" data-ignore-export="true">
          {action !== false && (action ?? null)}
          {action !== false && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:text-foreground hover:bg-muted/40 transition disabled:opacity-50"
                disabled={!!busy}
                aria-label="Chart options"
              >
                {busy ? (
                  <Download className="h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Download
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    void handleDownload("png")
                  }}
                  disabled={!!busy}
                >
                  <FileImage className="h-4 w-4" />
                  <span>As PNG image</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault()
                    void handleDownload("pdf")
                  }}
                  disabled={!!busy}
                >
                  <FileText className="h-4 w-4" />
                  <span>As PDF</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-normal">
                  Export-quality 2× resolution
                </DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="w-full" style={{ height }}>
        {children}
      </div>
    </div>
  )
}
