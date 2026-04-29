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
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"

type ExportFormat = "pdf" | "pptx" | "png"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  activeFile: UploadedFile | null
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
    description: "16:9 slideshow matching the Slides view for use in reviews.",
    icon: Presentation,
  },
  {
    id: "png",
    label: "Current view (PNG)",
    description: "Screenshot of the current visualizer for quick sharing.",
    icon: ImageIcon,
  },
]

export function ExportModal({ open, onOpenChange, activeFile }: Props) {
  const [format, setFormat] = useState<ExportFormat>("pdf")
  const [includeSummary, setIncludeSummary] = useState(true)
  const [includeCharts, setIncludeCharts] = useState(true)
  const [includeTables, setIncludeTables] = useState(true)
  const [includeInsights, setIncludeInsights] = useState(true)
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    if (!activeFile) return
    setBusy(true)
    try {
      const blob = await exportReport({
        filename: activeFile.name,
        file_type: activeFile.file_type,
        format,
        sections: {
          summary: includeSummary,
          charts: includeCharts,
          tables: includeTables,
          insights: includeInsights,
        },
      })
      // Trigger browser download.
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Download className="h-5 w-5 text-primary" />
            Export report
          </DialogTitle>
          <DialogDescription>
            Generate a shareable deliverable from the current workbook. Exports are
            branded with the Rolls-Royce Civil Aerospace header &amp; disclaimer.
          </DialogDescription>
        </DialogHeader>

        {activeFile ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground truncate">{activeFile.name}</span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0">
              {FILE_TYPE_LABELS[activeFile.file_type]}
            </Badge>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            No file selected — load a dataset first.
          </div>
        )}

        <FieldSet>
          <FieldLegend>Format</FieldLegend>
          <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
            <FieldGroup className="gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon
                const active = format === f.id
                return (
                  <Label
                    key={f.id}
                    htmlFor={`fmt-${f.id}`}
                    className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:border-ring"
                    }`}
                  >
                    <RadioGroupItem id={`fmt-${f.id}`} value={f.id} className="mt-0.5" />
                    <div className="flex gap-3 flex-1">
                      <div
                        className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{f.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 text-pretty">
                          {f.description}
                        </div>
                      </div>
                    </div>
                  </Label>
                )
              })}
            </FieldGroup>
          </RadioGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend>Include sections</FieldLegend>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="sec-summary"
                checked={includeSummary}
                onCheckedChange={(v) => setIncludeSummary(Boolean(v))}
              />
              <div>
                <FieldLabel htmlFor="sec-summary">Executive summary</FieldLabel>
                <FieldDescription>Headline KPIs and narrative lead-in.</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="sec-charts"
                checked={includeCharts}
                onCheckedChange={(v) => setIncludeCharts(Boolean(v))}
              />
              <div>
                <FieldLabel htmlFor="sec-charts">Charts &amp; visuals</FieldLabel>
                <FieldDescription>All charts rendered at export-quality.</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="sec-tables"
                checked={includeTables}
                onCheckedChange={(v) => setIncludeTables(Boolean(v))}
              />
              <div>
                <FieldLabel htmlFor="sec-tables">Data tables</FieldLabel>
                <FieldDescription>Detail tables with totals and aging buckets.</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="sec-insights"
                checked={includeInsights}
                onCheckedChange={(v) => setIncludeInsights(Boolean(v))}
              />
              <div>
                <FieldLabel htmlFor="sec-insights">AI insights</FieldLabel>
                <FieldDescription>Auto-generated commentary and highlights.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </FieldSet>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy || !activeFile} className="gap-2">
            {busy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {busy ? "Generating…" : "Generate export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
