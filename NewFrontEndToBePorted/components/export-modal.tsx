"use client"

import { useState } from "react"
import { Download, FileText, Image as ImageIcon, Presentation, CheckCircle2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import type { UploadedFile } from "@/lib/types"
import { FILE_TYPE_LABELS } from "@/lib/file-type-meta"
import {
  exportReport, ApiError,
  startAiReport, getAiReportStatus, downloadAiReport,
  type AiReportMode, type AiReportProvider,
} from "@/lib/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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

const AI_MODES: { id: AiReportMode; label: string; blurb: string }[] = [
  { id: "charts", label: "Charts", blurb: "AI invents the visualizations (Vega-Lite), Rolls-Royce themed." },
  { id: "html", label: "HTML", blurb: "AI writes the entire HTML/CSS layout — the most bespoke look." },
  { id: "catalog", label: "Catalog", blurb: "AI picks from a curated RR chart set — the most reliable." },
]

const AI_PROVIDERS: { id: AiReportProvider; label: string; sub: string }[] = [
  { id: "nvidia", label: "Kimi K2.6", sub: "NVIDIA" },
  { id: "aistudio", label: "Gemma 4 31B", sub: "AI Studio" },
]

export function ExportModal({ open, onOpenChange, activeFile, filters }: Props) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [busy, setBusy] = useState<null | "std" | "detailed">(null)
  const [aiMode, setAiMode] = useState<AiReportMode>("charts")
  const [aiProvider, setAiProvider] = useState<AiReportProvider>("nvidia")
  const [aiBusy, setAiBusy] = useState(false)
  const [aiProgress, setAiProgress] = useState("")

  const isHopper = activeFile?.file_type === "GLOBAL_HOPPER"

  async function handleExport(detailed: boolean) {
    if (!activeFile) return
    setBusy(detailed ? "detailed" : "std")
    try {
      const blob = await exportReport({
        filename: activeFile.name,
        file_type: activeFile.file_type,
        format,
        filters: filters && Object.keys(filters).length > 0 ? filters : undefined,
        detailed: detailed || undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const ext = format === "pptx" ? "pptx" : format === "png" ? "png" : "pdf"
      const baseName = activeFile.name.replace(/\.[^.]+$/, "")
      a.download = `${baseName}${detailed ? "-detailed" : ""}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("Export ready", {
        description: `${activeFile.name} · ${detailed ? "Detailed PDF" : format.toUpperCase()} downloaded.`,
        icon: <CheckCircle2 className="h-4 w-4 text-success" />,
      })
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed"
      toast.error("Export failed", { description: msg })
    } finally {
      setBusy(null)
    }
  }

  async function handleAiExport() {
    if (!activeFile) return
    setAiBusy(true)
    setAiProgress("Starting…")
    try {
      const { job_id } = await startAiReport({
        filename: activeFile.name,
        file_type: activeFile.file_type,
        filters: filters && Object.keys(filters).length > 0 ? filters : undefined,
        mode: aiMode,
        provider: aiProvider,
      })
      let status = "queued"
      let note: string | null = null
      let serverName: string | null = null
      // Poll up to ~10 min — kimi-k2.6 is slow and a full report (esp. HTML)
      // can take several minutes.
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        const s = await getAiReportStatus(job_id)
        setAiProgress(s.progress || s.status)
        status = s.status
        note = s.note
        serverName = s.filename
        if (status === "done" || status === "failed") break
      }
      if (status === "failed") throw new Error("Generation failed on the server")
      if (status !== "done") throw new Error("Timed out waiting for the report")

      const blob = await downloadAiReport(job_id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const baseName = activeFile.name.replace(/\.[^.]+$/, "")
      a.download = serverName || `${baseName}-ai-${aiMode}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (note) {
        toast.warning("AI report unavailable — fallback provided", { description: note })
      } else {
        toast.success("AI report ready", {
          description: `${activeFile.name} · AI report (${aiMode}) downloaded.`,
          icon: <CheckCircle2 className="h-4 w-4 text-success" />,
        })
      }
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "AI report failed"
      toast.error("AI report failed", { description: msg })
    } finally {
      setAiBusy(false)
      setAiProgress("")
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

        {isHopper ? (
          <p className="text-[11px] text-white/45 -mt-1">
            <span className="text-white/70 font-medium">Detailed PDF</span> produces a long-form report
            (15-20+ pages) — every dimension as a chart and a supporting table.
          </p>
        ) : null}

        {/* AI Report (Beta) — Kimi K2.6 designs a bespoke report dynamically. */}
        {isHopper ? (
          <div className="rounded-md border border-[var(--chart-2)]/30 bg-[var(--chart-2)]/[0.06] p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--chart-2)]" />
              <span className="text-sm font-medium text-white">AI Report</span>
              <Badge
                variant="outline"
                className="text-[9px] uppercase tracking-wider border-[var(--chart-2)]/40 bg-[var(--chart-2)]/10 text-[var(--chart-2)]"
              >
                Beta · Kimi K2.6
              </Badge>
            </div>
            <p className="text-[11px] text-white/55 text-pretty">
              The AI designs a bespoke executive report from your data (respecting the filters above) —
              dynamic structure, written insight and custom visualizations, Rolls-Royce themed. Takes a few minutes.
            </p>
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Model</div>
            <div className="grid grid-cols-2 gap-1.5">
              {AI_PROVIDERS.map((pv) => {
                const active = aiProvider === pv.id
                return (
                  <button
                    key={pv.id}
                    type="button"
                    onClick={() => setAiProvider(pv.id)}
                    disabled={aiBusy}
                    className={`rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? "border-[var(--chart-2)] bg-[var(--chart-2)]/15"
                        : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="text-xs font-medium text-white">{pv.label}</div>
                    <div className="text-[9px] text-white/45">{pv.sub}</div>
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/45">Layout</div>
            <div className="grid grid-cols-3 gap-1.5">
              {AI_MODES.map((m) => {
                const active = aiMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAiMode(m.id)}
                    disabled={aiBusy}
                    className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-[var(--chart-2)] bg-[var(--chart-2)]/15 text-white"
                        : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-white/45">{AI_MODES.find((m) => m.id === aiMode)?.blurb}</p>
            <Button
              onClick={handleAiExport}
              disabled={aiBusy || !!busy || !activeFile}
              className="w-full gap-2 bg-[var(--chart-2)] text-[oklch(0.17_0.03_165)] hover:bg-[var(--chart-2)]/90"
            >
              {aiBusy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {aiBusy ? aiProgress || "Generating…" : "Generate AI Report"}
            </Button>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={!!busy || aiBusy}
            className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          {isHopper ? (
            <Button
              variant="outline"
              onClick={() => handleExport(true)}
              disabled={!!busy || aiBusy || !activeFile}
              className="gap-2 border-[var(--chart-2)]/60 bg-transparent text-[var(--chart-2)] hover:bg-[var(--chart-2)]/10 hover:text-[var(--chart-2)]"
            >
              {busy === "detailed" ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              {busy === "detailed" ? "Generating…" : "Generate Detailed PDF"}
            </Button>
          ) : null}
          <Button
            onClick={() => handleExport(false)}
            disabled={!!busy || aiBusy || !activeFile}
            className="gap-2 bg-[var(--chart-2)] text-[oklch(0.17_0.03_165)] hover:bg-[var(--chart-2)]/90"
          >
            {busy === "std" ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {busy === "std" ? "Generating…" : "Generate export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
