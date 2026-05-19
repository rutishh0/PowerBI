"use client"

import { useMemo } from "react"
import { X } from "lucide-react"
import type { HopperOpp } from "@/lib/types"
import { fmtGBP, fmtCount } from "@/lib/format"

/* ---------- Types ---------- */

export type DrilldownMetric =
  | { kind: "count" }
  | { kind: "sum_crp" }
  | { kind: "sum_profit_year"; year: 2026 | 2027 | 2028 | 2029 | 2030 }

export interface DrilldownBreakdownDef {
  id: string
  label: string
  group: (o: HopperOpp) => string
  topN?: number
}

export type DrilldownInvocation =
  | {
      kind: "aggregate"
      segmentLabel: string
      segmentValue: string
      rows: HopperOpp[]
      metric: DrilldownMetric
      breakdowns: DrilldownBreakdownDef[]
    }
  | {
      kind: "single-row"
      segmentLabel: string
      segmentValue: string
      row: HopperOpp
    }

/* ---------- Reusable breakdown dimensions ---------- */

export const DIM: Record<string, DrilldownBreakdownDef> = {
  region: { id: "region", label: "By Region", group: (o) => o.region || "—" },
  customer: { id: "customer", label: "By Customer (Top 10)", group: (o) => o.customer || "—", topN: 10 },
  evs: { id: "evs", label: "By Engine Value Stream (Top 10)", group: (o) => o.engine_value_stream || "—", topN: 10 },
  status: { id: "status", label: "By Status", group: (o) => o.status || "—" },
  restructure_type: { id: "restructure_type", label: "By Restructure Type", group: (o) => o.restructure_type || "—" },
  maturity: { id: "maturity", label: "By Maturity", group: (o) => o.maturity || "—" },
  vp_owner: { id: "vp_owner", label: "By VP / Owner (Top 10)", group: (o) => o.vp_owner || "—", topN: 10 },
  onerous_type: { id: "onerous_type", label: "By Onerous Type", group: (o) => o.onerous_type || "—" },
}

/* ---------- Aggregation ---------- */

function aggregateValue(metric: DrilldownMetric, o: HopperOpp): number {
  if (metric.kind === "count") return 1
  if (metric.kind === "sum_crp") return o.crp_term_benefit
  if (metric.kind === "sum_profit_year") {
    const key = `profit_${metric.year}` as keyof HopperOpp
    const v = o[key]
    return typeof v === "number" ? v : 0
  }
  return 0
}

function formatValue(metric: DrilldownMetric, n: number): string {
  if (metric.kind === "count") return fmtCount(n)
  return fmtGBP(n)
}

/* ---------- View ---------- */

interface DrilldownViewProps {
  invocation: DrilldownInvocation
  onClose: () => void
}

export function DrilldownView({ invocation, onClose }: DrilldownViewProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-2.5 pb-2 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-[0.14em] text-white/55">Drilling into</div>
          <div className="text-sm font-semibold mt-0.5 truncate" title={invocation.segmentLabel}>
            {invocation.segmentLabel}
            <span className="text-white/55 font-normal"> · </span>
            <span className="text-[var(--chart-2)]">{invocation.segmentValue}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close drill-down"
          title="Close drill-down"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {invocation.kind === "single-row" ? (
        <SingleRowDetail row={invocation.row} />
      ) : (
        <BreakdownGrid rows={invocation.rows} metric={invocation.metric} breakdowns={invocation.breakdowns} />
      )}
    </div>
  )
}

function BreakdownGrid({
  rows,
  metric,
  breakdowns,
}: {
  rows: HopperOpp[]
  metric: DrilldownMetric
  breakdowns: DrilldownBreakdownDef[]
}) {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-1 min-h-0">
      {breakdowns.slice(0, 4).map((def) => (
        <BreakdownPanel key={def.id} rows={rows} metric={metric} def={def} />
      ))}
    </div>
  )
}

function BreakdownPanel({
  rows,
  metric,
  def,
}: {
  rows: HopperOpp[]
  metric: DrilldownMetric
  def: DrilldownBreakdownDef
}) {
  const { items, total } = useMemo(() => {
    const map = new Map<string, number>()
    let sum = 0
    for (const o of rows) {
      const k = def.group(o)
      if (!k) continue
      const v = aggregateValue(metric, o)
      map.set(k, (map.get(k) ?? 0) + v)
      sum += v
    }
    let arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
    arr.sort((a, b) => b.value - a.value)
    if (def.topN !== undefined) arr = arr.slice(0, def.topN)
    return { items: arr, total: sum }
  }, [rows, metric, def])

  const max = items[0]?.value ?? 0
  const visible = items.slice(0, 5)
  const hidden = items.length - visible.length

  return (
    <div className="rounded border border-white/10 bg-white/[0.02] p-2.5 overflow-hidden flex flex-col min-h-0">
      <div className="text-[9px] uppercase tracking-[0.14em] text-white/55 mb-1.5 flex-shrink-0 truncate">
        {def.label}
      </div>
      <div className="space-y-1 flex-1 min-h-0 overflow-hidden">
        {visible.length === 0 ? (
          <div className="text-[10px] text-white/40 italic">No data</div>
        ) : (
          visible.map((item) => {
            const pct = total > 0 ? item.value / total : 0
            const barPct = max > 0 ? item.value / max : 0
            return (
              <div key={item.name} className="flex items-center gap-1.5 text-[10px] min-w-0">
                <span
                  className="w-[5rem] truncate text-white/85 flex-shrink-0"
                  title={item.name}
                >
                  {item.name}
                </span>
                <div className="flex-1 h-1.5 bg-white/5 rounded-sm overflow-hidden min-w-[1rem]">
                  <div
                    className="h-full bg-[var(--chart-2)]"
                    style={{ width: `${Math.max(2, barPct * 100)}%` }}
                  />
                </div>
                <span className="w-[3.75rem] text-right tnum text-white/85 flex-shrink-0">
                  {formatValue(metric, item.value)}
                </span>
                <span className="w-[2.5rem] text-right tnum text-white/45 flex-shrink-0">
                  {Math.round(pct * 100)}%
                </span>
              </div>
            )
          })
        )}
        {hidden > 0 && (
          <div className="text-[9px] text-white/45 pt-0.5">+ {hidden} more</div>
        )}
      </div>
    </div>
  )
}

function SingleRowDetail({ row }: { row: HopperOpp }) {
  const fields: ReadonlyArray<readonly [string, string | number | null | undefined]> = [
    ["Region", row.region],
    ["Customer", row.customer],
    ["Engine Value Stream", row.engine_value_stream],
    ["Top-level EVS", row.top_level_evs],
    ["VP / Owner", row.vp_owner],
    ["Restructure Type", row.restructure_type],
    ["Maturity", row.maturity],
    ["Onerous Type", row.onerous_type],
    ["Initiative", row.initiative],
    ["Status", row.status],
    ["Expected Year", row.expected_year != null ? String(row.expected_year) : "—"],
    ["Signature AP", row.signature_ap],
  ]

  const profitYears: ReadonlyArray<readonly [string, string]> = [
    ["CRP Term", fmtGBP(row.crp_term_benefit)],
    ["2026", fmtGBP(row.profit_2026)],
    ["2027", fmtGBP(row.profit_2027)],
    ["2028", fmtGBP(row.profit_2028)],
    ["2029", fmtGBP(row.profit_2029)],
    ["2030", fmtGBP(row.profit_2030)],
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        {fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 min-w-0">
            <span className="text-white/55 uppercase tracking-[0.08em] flex-shrink-0">{label}</span>
            <span className="text-white/85 text-right truncate" title={String(value ?? "—")}>
              {value || "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-2.5">
        <div className="text-[9px] uppercase tracking-[0.14em] text-white/55 mb-2">Financials</div>
        <div className="grid grid-cols-3 gap-1.5">
          {profitYears.map(([label, value]) => (
            <div key={label} className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-[0.1em] text-white/55">{label}</div>
              <div className="font-display text-xs font-semibold tnum mt-0.5 truncate" title={value}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
