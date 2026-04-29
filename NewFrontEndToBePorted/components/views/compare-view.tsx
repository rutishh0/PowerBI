"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Check,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import type {
  UploadedFile,
  SOAData,
  InvoiceListData,
  OppTrackerData,
  GlobalHopperData,
  ShopVisitData,
  SVRGData,
} from "@/lib/types"
import { FILE_TYPE_LABELS, FILE_TYPE_BADGES } from "@/lib/file-type-meta"
import { fmtMoney, fmtGBP, fmtCount, fmtPct } from "@/lib/format"
import { chat, ApiError } from "@/lib/api"
import { parseChatContent, type ChatSegment } from "@/lib/parse-chat-fences"
import { ChartFence } from "@/components/shared/chart-fence"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type KpiRow = {
  key: string
  label: string
  value: number | null
  format: "usd" | "gbp" | "count" | "pct1"
  direction?: "higher-better" | "lower-better"
}

function kpisForFile(file: UploadedFile | null): KpiRow[] {
  if (!file) return []
  switch (file.file_type) {
    case "SOA": {
      const d = file.parsed as SOAData
      const totalOpen =
        d.aging_buckets.current +
        d.aging_buckets["1_30_days"] +
        d.aging_buckets["31_60_days"] +
        d.aging_buckets["61_90_days"] +
        d.aging_buckets["91_180_days"] +
        d.aging_buckets.over_180_days
      const pastDue = totalOpen - d.aging_buckets.current
      return [
        { key: "open", label: "Total open balance", value: totalOpen, format: "usd" },
        { key: "overdue", label: "Total overdue", value: d.grand_totals.total_overdue, format: "usd", direction: "lower-better" },
        { key: "past_due_share", label: "Past-due share", value: totalOpen > 0 ? pastDue / totalOpen : 0, format: "pct1", direction: "lower-better" },
        { key: "avg_days_late", label: "Avg days late", value: d.metadata.avg_days_late ?? null, format: "count", direction: "lower-better" },
        { key: "sections", label: "Sections", value: d.sections.length, format: "count" },
        { key: "net", label: "Net balance", value: d.grand_totals.net_balance, format: "usd" },
      ]
    }
    case "INVOICE_LIST": {
      const d = file.parsed as InvoiceListData
      const avg = d.totals.item_count > 0 ? d.totals.total_amount / d.totals.item_count : 0
      return [
        { key: "total", label: "Total invoiced", value: d.totals.total_amount, format: "usd", direction: "higher-better" },
        { key: "positive", label: "Positive charges", value: d.totals.total_positive, format: "usd" },
        { key: "negative", label: "Credits", value: d.totals.total_negative, format: "usd" },
        { key: "count", label: "Invoice count", value: d.totals.item_count, format: "count" },
        { key: "avg", label: "Average invoice", value: avg, format: "usd" },
        { key: "currencies", label: "Currencies", value: d.metadata.currencies.length, format: "count" },
      ]
    }
    case "OPPORTUNITY_TRACKER": {
      const d = file.parsed as OppTrackerData
      return [
        { key: "count", label: "Opportunities", value: d.summary.total_opportunities, format: "count", direction: "higher-better" },
        { key: "term", label: "Total term benefit", value: d.summary.total_term_benefit, format: "gbp", direction: "higher-better" },
        { key: "hopper", label: "Hopper records", value: d.opportunities_by_level.Hopper.records.length, format: "count" },
        { key: "ict", label: "ICT records", value: d.opportunities_by_level.ICT.records.length, format: "count" },
        { key: "contract", label: "Contract records", value: d.opportunities_by_level.Contract.records.length, format: "count" },
        { key: "customers", label: "Customers", value: Object.keys(d.summary.by_customer).length, format: "count" },
      ]
    }
    case "GLOBAL_HOPPER": {
      const d = file.parsed as GlobalHopperData
      return [
        { key: "opps", label: "Opportunities", value: d.opportunities.length, format: "count" },
        { key: "crp", label: "CRP term benefit", value: d.summary.total_crp_term_benefit, format: "gbp", direction: "higher-better" },
        { key: "p26", label: "2026 profit", value: d.summary.total_profit_2026, format: "gbp", direction: "higher-better" },
        { key: "p27", label: "2027 profit", value: d.summary.total_profit_2027, format: "gbp", direction: "higher-better" },
        { key: "regions", label: "Regions", value: d.summary.unique_regions.length, format: "count" },
        { key: "customers", label: "Customers", value: d.summary.unique_customers.length, format: "count" },
      ]
    }
    case "SHOP_VISIT_HISTORY": {
      const d = file.parsed as ShopVisitData
      return [
        { key: "visits", label: "Shop visits", value: d.statistics.total_shop_visits, format: "count" },
        { key: "maint", label: "Maintenance actions", value: d.statistics.total_maintenance, format: "count" },
        { key: "engines", label: "Engines tracked", value: d.statistics.total_engines_tracked, format: "count" },
        { key: "operators", label: "Operators", value: d.metadata.operators.length, format: "count" },
        { key: "sv_types", label: "SV types", value: Object.keys(d.statistics.sv_types).length, format: "count" },
        { key: "sv_loc", label: "SV locations", value: Object.keys(d.statistics.sv_locations).length, format: "count" },
      ]
    }
    case "SVRG_MASTER": {
      const d = file.parsed as SVRGData
      return [
        { key: "claims", label: "Total claims", value: d.claims_summary.total_claims, format: "count" },
        { key: "credit", label: "Total credit value", value: d.claims_summary.total_credit_value, format: "usd", direction: "lower-better" },
        { key: "events", label: "Total events", value: d.event_entries.total_events, format: "count" },
        { key: "qualified", label: "Qualified events", value: d.event_entries.qualifications["Qualified"] ?? 0, format: "count", direction: "higher-better" },
        { key: "pending", label: "Pending qualification", value: d.event_entries.qualifications["Pending"] ?? 0, format: "count", direction: "lower-better" },
        { key: "sheets", label: "Available sheets", value: Object.keys(d.available_sheets ?? {}).length, format: "count" },
      ]
    }
    default:
      return []
  }
}

function formatVal(row: KpiRow): string {
  if (row.value === null || row.value === undefined) return "—"
  if (row.format === "usd") return fmtMoney(row.value, "USD")
  if (row.format === "gbp") return fmtGBP(row.value)
  if (row.format === "pct1") return fmtPct(row.value)
  return fmtCount(row.value)
}

function deltaMeta(a: KpiRow, b: KpiRow) {
  if (a.value === null || b.value === null || !Number.isFinite(a.value) || !Number.isFinite(b.value) || b.value === 0) {
    return { pct: 0, favorable: null as boolean | null }
  }
  const pct = ((a.value as number) - (b.value as number)) / Math.abs(b.value as number)
  const favorable =
    a.direction === "lower-better"
      ? (a.value as number) <= (b.value as number)
      : a.direction === "higher-better"
      ? (a.value as number) >= (b.value as number)
      : null
  return { pct, favorable }
}

type CompareViewProps = {
  files: UploadedFile[]
  activeFile: UploadedFile | null
}

export function CompareView({ files, activeFile }: CompareViewProps) {
  const enoughFiles = files.length >= 2

  // Initial selection: active file on the left if present, then pick another
  // file (preferring same type) on the right.
  const initialPair = useMemo(() => {
    if (!enoughFiles) return { left: null as string | null, right: null as string | null }
    const leftName = activeFile?.name ?? files[0].name
    const left = files.find((f) => f.name === leftName) ?? files[0]
    const same = files.find((f) => f.name !== left.name && f.file_type === left.file_type)
    const rightName = (same ?? files.find((f) => f.name !== left.name) ?? files[1]).name
    return { left: left.name, right: rightName }
  }, [files, activeFile, enoughFiles])

  const [leftName, setLeftName] = useState<string | null>(initialPair.left)
  const [rightName, setRightName] = useState<string | null>(initialPair.right)

  // Reset selection if the underlying file list changes such that the
  // previously-selected names no longer exist.
  useEffect(() => {
    if (!enoughFiles) {
      setLeftName(null)
      setRightName(null)
      return
    }
    if (!leftName || !files.find((f) => f.name === leftName)) {
      setLeftName(initialPair.left)
    }
    if (!rightName || !files.find((f) => f.name === rightName) || rightName === leftName) {
      setRightName(initialPair.right)
    }
  }, [files, enoughFiles, leftName, rightName, initialPair.left, initialPair.right])

  if (!enoughFiles) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
            Period comparison
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl text-pretty">
            Compare two workbooks side by side. When the files share a type, the tool
            aligns headline KPIs and surfaces favourable / unfavourable movement.
          </p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Upload at least two workbooks</EmptyTitle>
            <EmptyDescription>
              Comparison needs two parsed files. Upload another workbook from the
              sidebar to start comparing.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const left = files.find((f) => f.name === leftName) ?? files[0]
  const right = files.find((f) => f.name === rightName) ?? files[1]

  const comparable = left.file_type === right.file_type
  const leftRows = kpisForFile(left)
  const rightRows = kpisForFile(right)

  /* ---------- AI commentary ---------- */
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSegments, setAiSegments] = useState<ChatSegment[] | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  // Reset commentary whenever the pair changes
  useEffect(() => {
    setAiSegments(null)
    setAiError(null)
  }, [leftName, rightName])

  async function generateCommentary() {
    if (aiBusy) return
    setAiBusy(true)
    setAiError(null)
    const prompt =
      `Compare these two workbooks and surface the most important differences, ` +
      `trends and risks for a finance review. Reference specific numbers from each ` +
      `and call out any concentration or sudden movement.\n\n` +
      `BASELINE: ${left.name} (${FILE_TYPE_LABELS[left.file_type]})\n` +
      `COMPARISON: ${right.name} (${FILE_TYPE_LABELS[right.file_type]})\n\n` +
      `${comparable
        ? "Both files share a type — align KPI-by-KPI and explain the deltas in plain English."
        : "These files are different types — focus on what each independently tells us."}`
    try {
      const res = await chat(prompt)
      const segments = parseChatContent(res.content || "")
      const extra: ChatSegment[] = []
      for (const c of res.charts ?? []) extra.push({ kind: "chart", payload: c, raw: JSON.stringify(c) })
      setAiSegments([...segments, ...extra])
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 400
            ? "The backend has no parsed files for this session yet. Re-upload one of these workbooks and retry."
            : err.message
          : err instanceof Error
            ? err.message
            : "Could not generate commentary"
      setAiError(msg)
      toast.error("AI commentary failed", { description: msg })
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
          Period comparison
        </h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl text-pretty">
          Compare two workbooks side by side. When the files share a type, the tool
          aligns headline KPIs and surfaces favourable / unfavourable movement.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] items-end">
        <FileSelect
          label="Baseline"
          value={left.name}
          options={files}
          onChange={setLeftName}
        />
        <div className="hidden lg:flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary mx-auto">
          <ArrowLeftRight className="h-4 w-4" />
        </div>
        <FileSelect
          label="Comparison"
          value={right.name}
          options={files}
          onChange={setRightName}
        />
      </div>

      {!comparable && (
        <Card className="p-4 border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              These files are different types.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {FILE_TYPE_LABELS[left.file_type]} vs {FILE_TYPE_LABELS[right.file_type]}.
              Pick two files of the same type to see aligned KPIs and deltas.
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FileSummary file={left} accent="primary" rows={leftRows} />
        <FileSummary file={right} accent="muted" rows={rightRows} />
      </div>

      <Card className="border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground">
              AI commentary
            </h2>
          </div>
          <Button
            size="sm"
            variant={aiSegments ? "outline" : "default"}
            onClick={generateCommentary}
            disabled={aiBusy}
            className="gap-2"
          >
            {aiBusy ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : aiSegments ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {aiBusy ? "Generating…" : aiSegments ? "Regenerate" : "Generate commentary"}
          </Button>
        </div>
        <div className="p-5">
          {!aiSegments && !aiError && !aiBusy && (
            <p className="text-sm text-muted-foreground text-pretty">
              Click <span className="font-medium text-foreground">Generate commentary</span> for an LLM-written
              comparison of these two workbooks. The model has the parsed contents in
              context and will reference specific figures.
            </p>
          )}
          {aiError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {aiError}
            </div>
          )}
          {aiSegments && (
            <div className="space-y-3 text-sm text-foreground leading-relaxed">
              {aiSegments.map((seg, i) => {
                if (seg.kind === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {seg.text}
                    </p>
                  )
                }
                if (seg.kind === "chart") {
                  return (
                    <ChartFence
                      key={i}
                      payload={seg.payload}
                      filenameHint={`${left.name.replace(/\.[^.]+$/, "")}-vs-${right.name.replace(/\.[^.]+$/, "")}`}
                    />
                  )
                }
                if (seg.kind === "email") {
                  const p = seg.payload as { to?: string; subject?: string; body?: string }
                  return (
                    <div key={i} className="rounded-md border border-accent/40 bg-accent/5 p-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-accent-foreground font-semibold">
                        Drafted email
                      </div>
                      {p.subject && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Subject: </span>
                          {p.subject}
                        </div>
                      )}
                      {p.body && <pre className="whitespace-pre-wrap text-xs">{p.body}</pre>}
                    </div>
                  )
                }
                return (
                  <pre
                    key={i}
                    className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px]"
                  >
                    {seg.text}
                  </pre>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {comparable && leftRows.length > 0 && (
        <Card className="overflow-hidden border-border">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-foreground">
              KPI comparison
            </h2>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {FILE_TYPE_BADGES[left.file_type]}
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 border-b border-border">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Metric</th>
                  <th className="px-5 py-2.5 font-medium text-right">Baseline</th>
                  <th className="px-5 py-2.5 font-medium text-right">Comparison</th>
                  <th className="px-5 py-2.5 font-medium text-right">Δ</th>
                  <th className="px-5 py-2.5 font-medium text-right">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leftRows.map((row, idx) => {
                  const other = rightRows[idx] ?? { ...row, value: null }
                  const { pct, favorable } = deltaMeta(row, other)
                  return (
                    <tr key={row.key}>
                      <td className="px-5 py-3 font-medium text-foreground">{row.label}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">
                        {formatVal(row)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatVal(other)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            favorable === true
                              ? "text-success"
                              : favorable === false
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {pct === 0 ? "—" : `${pct > 0 ? "+" : ""}${fmtPct(pct)}`}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {favorable === true ? (
                          <Badge variant="outline" className="text-success border-success/40 bg-success/10 gap-1">
                            <Check className="h-3 w-3" />
                            Favorable
                          </Badge>
                        ) : favorable === false ? (
                          <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10 gap-1">
                            <TrendingDown className="h-3 w-3" />
                            Unfavorable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground gap-1">
                            <TrendingUp className="h-3 w-3" />
                            Neutral
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function FileSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: UploadedFile[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
        {label}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((f) => (
            <SelectItem key={f.name} value={f.name}>
              <span className="mr-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {FILE_TYPE_BADGES[f.file_type]}
              </span>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FileSummary({
  file,
  accent,
  rows,
}: {
  file: UploadedFile
  accent: "primary" | "muted"
  rows: KpiRow[]
}) {
  return (
    <Card
      className={`p-5 border ${
        accent === "primary"
          ? "border-primary/30 bg-primary/[0.03]"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold">
          {FILE_TYPE_BADGES[file.file_type]}
        </Badge>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {FILE_TYPE_LABELS[file.file_type]}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground break-words">{file.name}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        {rows.slice(0, 4).map((r) => (
          <div key={r.key} className="rounded-md border border-border bg-background p-2.5">
            <div className="uppercase tracking-wider text-[10px] text-muted-foreground">
              {r.label}
            </div>
            <div className="mt-1 font-mono tabular-nums text-sm text-foreground">
              {formatVal(r)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
