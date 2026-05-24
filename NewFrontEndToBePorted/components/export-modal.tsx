"use client"

import { useState } from "react"
import { Download, FileText, Image as ImageIcon, Presentation, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import type { UploadedFile } from "@/lib/types"
import { FILE_TYPE_LABELS } from "@/lib/file-type-meta"
import { exportReport, ApiError } from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"

type ExportFormat = "pdf" | "pptx" | "png"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  activeFile: UploadedFile | null
  /** Active dashboard filters to apply to the exported deliverable. Empty
   * object = no filters. */
  filters?: Record<string, string>
}

const FORMATS: { id: ExportFormat; label: string; description: string; icon: typeof FileText }[] = [
  {
    id: "pdf",
    label: "PDF report",
    description: "Multi-page, print-ready executive report with RR header & footer.",
    icon: FileText,
  },
  {
    id: "pptx",
    label: "PowerPoint deck",
    description: "16:9 slideshow matching the Slides view for use in reviews. (Coming soon — falls back to PDF.)",
    icon: Presentation,
  },
  {
    id: "png",
    label: "Current view (PNG)",
    description: "Screenshot of the current visualizer for quick sharing. (Coming soon — falls back to PDF.)",
    icon: ImageIcon,
  },
]

const SECTIONS: { id: "summary" | "charts" | "tables" | "insights"; label: string; description: string }[] = [
  { id: "summary", label: "Executive summary", description: "Headline KPIs, meta strip and filter context." },
  { id: "charts", label: "Charts & visuals", description: "Pipeline · region donut · annual profit forecast." },
  { id: "tables", label: "Data tables", description: "Customer / EVS / pipeline / restructure breakdowns + Top 25 register." },
  { id: "insights", label: "AI insights", description: "Auto-generated commentary (planned — not yet in the PDF generator)." },
]

export function ExportModal({ open, onOpenChange, activeFile, filters }: Props) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [sections, setSections] = useState<Record<typeof SECTIONS[number]["id"], boolean>>({
    summary: true,
    charts: true,
    tables: true,
    insights: true,
  })
  const [busy, setBusy] = useState(false)

  function toggleSection(id: typeof SECTIONS[number]["id"]) {
    setSections((s) => ({ ...s, [id]: !s[id] }))
  }

  async function handleExport() {
    if (!activeFile) return
    setBusy(true)
    try {
      const blob = await exportReport({
        filename: activeFile.name,
        file_type: activeFile.file_type,
        format,
        sections,
        filters: filters && Object.keys(filters).length > 0 ? filters : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const ext = format === "pptx" ? "pptx" : format === "png" ? "png" : "pdf"
      const baseName = activeFile.name.replace(/\.[^.]+$/, "")
      a.download = `${baseName}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Export ready", {
        description: `${activeFile.name} · ${format.toUpperCase()} downloaded.`,
        icon: <CheckCircle2 className="h-4 w-4 text-success" />,
      })
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed"
      toast.error("Export failed", { description: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-[oklch(0.17_0.03_165)] text-white border-white/10 p-6 gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-white">
            <Download className="h-5 w-5 text-[var(--chart-2)]" />
            Export report
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Generate a shareable deliverable from the current workbook. The export is
            branded with the Rolls-Royce Civil Aerospace header &amp; footer.
          </DialogDescription>
        </DialogHeader>

        {/* Active file chip */}
        {activeFile ? (
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 flex items-center justify-between text-sm gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-white/55 shrink-0" />
              <span className="font-medium text-white truncate">{activeFile.name}</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider shrink-0 border-white/20 bg-white/5 text-white/80"
            >
              {FILE_TYPE_LABELS[activeFile.file_type]}
            </Badge>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/15 px-3 py-3 text-sm text-white/55">
            No file selected — load a dataset first.
          </div>
        )}

        {/* Filter chips — surfaced so the user knows the export will reflect them */}
        {filters && Object.keys(filters).length > 0 ? (
          <div className="rounded-md border border-[var(--chart-2)]/30 bg-[var(--chart-2)]/5 px-3 py-2 text-xs text-white/80">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--chart-2)] font-semibold mb-1.5">
              Filters applied to export
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(filters).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/[0.06] px-2 py-0.5"
                >
                  <span className="text-white/55 uppercase tracking-[0.08em] text-[9px]">{k.replace("_", " ")}</span>
                  <span className="text-white">{v}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Format */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/55 font-semibold">
            Format
          </div>
          <div className="grid gap-2">
            {FORMATS.map((f) => {
              const Icon = f.icon
              const active = format === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--chart-2)] bg-[var(--chart-2)]/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                  }`}
                >
                  <span
                    className={`mt-1 h-3.5 w-3.5 rounded-full border flex-shrink-0 ${
                      active
                        ? "border-[var(--chart-2)] bg-[var(--chart-2)]"
                        : "border-white/40"
                    }`}
                    aria-hidden
                  >
                    {active ? (
                      <span className="block h-1.5 w-1.5 rounded-full bg-[oklch(0.17_0.03_165)] m-auto translate-y-0.5" />
                    ) : null}
                  </span>
                  <div
                    className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                      active
                        ? "bg-[var(--chart-2)]/20 text-[var(--chart-2)]"
                        : "bg-white/5 text-white/55"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{f.label}</div>
                    <div className="text-xs text-white/55 mt-0.5 text-pretty">{f.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/55 font-semibold">
            Include sections
          </div>
          <div className="grid gap-1.5">
            {SECTIONS.map((s) => {
              const checked = sections[s.id]
              return (
                <label
                  key={s.id}
                  className="flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer hover:border-white/25 hover:bg-white/[0.06] transition-colors"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSection(s.id)}
                    className="mt-0.5 border-white/40 data-[state=checked]:bg-[var(--chart-2)] data-[state=checked]:border-[var(--chart-2)]"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{s.label}</div>
                    <div className="text-xs text-white/55 mt-0.5 text-pretty">{s.description}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={busy || !activeFile}
            className="gap-2 bg-[var(--chart-2)] text-[oklch(0.17_0.03_165)] hover:bg-[var(--chart-2)]/90"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {busy ? "Generating…" : "Generate export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
