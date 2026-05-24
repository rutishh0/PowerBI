"use client"

import { useMemo, useState, type ReactElement } from "react"
import { X, ChevronRight, Home } from "lucide-react"
import type { HopperOpp } from "@/lib/types"
import { fmtGBP, fmtCount } from "@/lib/format"

/* ============================================================================
 *  Types
 * ========================================================================= */

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

export type DrilldownFrame =
  | {
      kind: "aggregate"
      segmentLabel: string
      segmentValue: string
      rows: HopperOpp[]
      metric: DrilldownMetric
      breakdowns: DrilldownBreakdownDef[]
      /** Dimensions already used to reach this frame (chart's source +
       * every panel row the user has clicked on the way down). Drives
       * pickNextBreakdowns so we never offer the same dimension twice. */
      usedDims: Set<string>
    }
  | {
      kind: "single-row"
      segmentLabel: string
      segmentValue: string
      row: HopperOpp
    }

export type DrilldownStack = DrilldownFrame[]

/* ============================================================================
 *  Reusable breakdown dimensions
 * ========================================================================= */

export const DIM: Record<string, DrilldownBreakdownDef> = {
  region:           { id: "region",           label: "By Region",                   group: (o) => o.region || "—" },
  customer:         { id: "customer",         label: "By Customer (Top 10)",        group: (o) => o.customer || "—", topN: 10 },
  evs:              { id: "evs",              label: "By Engine Value Stream",      group: (o) => o.engine_value_stream || "—", topN: 10 },
  status:           { id: "status",           label: "By Status",                   group: (o) => o.status || "—" },
  restructure_type: { id: "restructure_type", label: "By Restructure Type",         group: (o) => o.restructure_type || "—" },
  maturity:         { id: "maturity",         label: "By Maturity",                 group: (o) => o.maturity || "—" },
  vp_owner:         { id: "vp_owner",         label: "By VP / Owner (Top 10)",      group: (o) => o.vp_owner || "—", topN: 10 },
  onerous_type:     { id: "onerous_type",     label: "By Onerous Type",             group: (o) => o.onerous_type || "—" },
}

/** Order matters — pickNextBreakdowns walks left-to-right and returns the
 * first 4 dims that haven't been used yet. */
const DRILL_DIM_POOL: string[] = [
  "region", "customer", "evs", "status",
  "restructure_type", "maturity", "vp_owner", "onerous_type",
]

export function pickNextBreakdowns(usedDims: Set<string>, maxN = 4): DrilldownBreakdownDef[] {
  const out: DrilldownBreakdownDef[] = []
  for (const id of DRILL_DIM_POOL) {
    if (usedDims.has(id)) continue
    const def = DIM[id]
    if (def) out.push(def)
    if (out.length >= maxN) break
  }
  return out
}

/* ============================================================================
 *  Aggregation helpers
 * ========================================================================= */

export function aggregateValue(metric: DrilldownMetric, o: HopperOpp): number {
  if (metric.kind === "count") return 1
  if (metric.kind === "sum_crp") return o.crp_term_benefit
  if (metric.kind === "sum_profit_year") {
    const key = `profit_${metric.year}` as keyof HopperOpp
    const v = o[key]
    return typeof v === "number" ? v : 0
  }
  return 0
}

export function sumMetric(metric: DrilldownMetric, rows: HopperOpp[]): number {
  let s = 0
  for (const r of rows) s += aggregateValue(metric, r)
  return s
}

export function formatMetric(metric: DrilldownMetric, n: number): string {
  if (metric.kind === "count") return fmtCount(n) + " " + (n === 1 ? "opp" : "opps")
  return fmtGBP(n)
}

/* ============================================================================
 *  View
 * ========================================================================= */

interface DrilldownViewProps {
  /** Name of the chart the user originally clicked from — used as the
   * left-most breadcrumb crumb. */
  chartTitle: string
  stack: DrilldownStack
  /** Pop the stack to (and including) the given index. -1 = close entirely. */
  onPopTo: (index: number) => void
  /** Push a new frame onto the stack (used by clickable breakdown rows). */
  onPush: (frame: DrilldownFrame) => void
  /** Close the drill-down entirely (returns to the chart). */
  onClose: () => void
}

/** Convenience hook for chart components. Each chart calls
 * `openFrame(frame)` from its segment-click handler; if the returned
 * `drilldownView` is non-null, the chart renders that instead of the
 * recharts container.
 */
export function useChartDrilldown(chartTitle: string): {
  openFrame: (frame: DrilldownFrame) => void
  drilldownView: ReactElement | null
} {
  const [stack, setStack] = useState<DrilldownStack>([])
  return {
    openFrame: (frame) => setStack([frame]),
    drilldownView:
      stack.length === 0 ? null : (
        <DrilldownView
          chartTitle={chartTitle}
          stack={stack}
          onPopTo={(i) => setStack((s) => (i < 0 ? [] : s.slice(0, i + 1)))}
          onPush={(f) => setStack((s) => [...s, f])}
          onClose={() => setStack([])}
        />
      ),
  }
}

export function DrilldownView({ chartTitle, stack, onPopTo, onPush, onClose }: DrilldownViewProps) {
  const current = stack[stack.length - 1]
  if (!current) return null

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb + close */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
        <Breadcrumb
          chartTitle={chartTitle}
          stack={stack}
          onPopTo={onPopTo}
          onCloseAll={onClose}
        />
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close drill-down"
          title="Close drill-down"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Current frame value */}
      <div className="mb-2.5 px-0.5">
        <div className="text-sm font-semibold truncate" title={current.segmentLabel}>
          {current.segmentLabel}
          <span className="text-white/55 font-normal"> · </span>
          <span className="text-[var(--chart-2)]">{current.segmentValue}</span>
        </div>
      </div>

      {/* Body */}
      {current.kind === "single-row" ? (
        <SingleRowDetail row={current.row} />
      ) : (
        <AggregateBody frame={current} onPush={onPush} />
      )}
    </div>
  )
}

/* ---------- Breadcrumb ---------- */

function Breadcrumb({
  chartTitle,
  stack,
  onPopTo,
  onCloseAll,
}: {
  chartTitle: string
  stack: DrilldownStack
  onPopTo: (index: number) => void
  onCloseAll: () => void
}) {
  return (
    <nav
      aria-label="Drill-down breadcrumb"
      className="flex items-center gap-1 text-[10px] min-w-0 flex-1 overflow-hidden"
    >
      <button
        onClick={onCloseAll}
        className="flex items-center gap-1 text-white/55 hover:text-white truncate"
        title={`Back to ${chartTitle}`}
      >
        <Home className="h-3 w-3 flex-shrink-0" />
        <span className="uppercase tracking-[0.1em] font-semibold truncate">{chartTitle}</span>
      </button>
      {stack.map((frame, i) => {
        const isLast = i === stack.length - 1
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            <ChevronRight className="h-3 w-3 text-white/30 flex-shrink-0" />
            {isLast ? (
              <span
                className="font-semibold text-white truncate"
                title={frame.segmentLabel}
              >
                {truncate(frame.segmentLabel, 24)}
              </span>
            ) : (
              <button
                onClick={() => onPopTo(i)}
                className="text-white/70 hover:text-white underline-offset-2 hover:underline truncate"
                title={`Back to ${frame.segmentLabel}`}
              >
                {truncate(frame.segmentLabel, 18)}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

/* ---------- Aggregate body (4 breakdown panels) ---------- */

function AggregateBody({
  frame,
  onPush,
}: {
  frame: Extract<DrilldownFrame, { kind: "aggregate" }>
  onPush: (frame: DrilldownFrame) => void
}) {
  // If we've exhausted the dim pool OR matched a small handful of rows,
  // showing four mostly-empty panels feels wrong. Drop down into a
  // compact rows list (or a single-row detail if N=1).
  if (frame.breakdowns.length === 0 || frame.rows.length <= 2) {
    if (frame.rows.length === 1) {
      return <SingleRowDetail row={frame.rows[0]} />
    }
    return <CompactRowList rows={frame.rows} metric={frame.metric} />
  }

  function handleDrill(dim: DrilldownBreakdownDef, name: string) {
    const newRows = frame.rows.filter((r) => dim.group(r) === name)
    if (newRows.length === 0) return
    const nextUsed = new Set(frame.usedDims)
    nextUsed.add(dim.id)
    const nextBreakdowns = pickNextBreakdowns(nextUsed)
    if (newRows.length === 1) {
      onPush({
        kind: "single-row",
        segmentLabel: name,
        segmentValue: formatMetric(frame.metric, sumMetric(frame.metric, newRows)),
        row: newRows[0],
      })
      return
    }
    onPush({
      kind: "aggregate",
      segmentLabel: name,
      segmentValue: formatMetric(frame.metric, sumMetric(frame.metric, newRows)),
      rows: newRows,
      metric: frame.metric,
      breakdowns: nextBreakdowns,
      usedDims: nextUsed,
    })
  }

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-2 flex-1 min-h-0">
      {frame.breakdowns.slice(0, 4).map((def) => (
        <BreakdownPanel
          key={def.id}
          rows={frame.rows}
          metric={frame.metric}
          def={def}
          onDrill={(name) => handleDrill(def, name)}
        />
      ))}
    </div>
  )
}

function BreakdownPanel({
  rows,
  metric,
  def,
  onDrill,
}: {
  rows: HopperOpp[]
  metric: DrilldownMetric
  def: DrilldownBreakdownDef
  onDrill: (name: string) => void
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
              <button
                key={item.name}
                onClick={() => onDrill(item.name)}
                className="w-full flex items-center gap-1.5 text-[10px] min-w-0 rounded px-1 py-0.5 -mx-1 hover:bg-white/[0.06] transition-colors text-left"
                title={`Drill into ${item.name}`}
              >
                <span
                  className="w-[4.8rem] truncate text-white/85 flex-shrink-0"
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
                <span className="w-[3.5rem] text-right tnum text-white/85 flex-shrink-0">
                  {formatMetric(metric, item.value).replace(" opps", "").replace(" opp", "")}
                </span>
                <span className="w-[2.5rem] text-right tnum text-white/45 flex-shrink-0">
                  {Math.round(pct * 100)}%
                </span>
              </button>
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

/* ---------- Compact rows list (used when breakdowns are exhausted) ---------- */

function CompactRowList({ rows, metric }: { rows: HopperOpp[]; metric: DrilldownMetric }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
      <div className="text-[9px] uppercase tracking-[0.14em] text-white/55">
        {rows.length === 1 ? "Single matching row" : `${rows.length} matching opportunities`}
      </div>
      {rows.slice(0, 12).map((r, i) => (
        <div
          key={i}
          className="rounded border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[10px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white truncate" title={r.customer}>
              {r.customer || "—"}
            </span>
            <span className="text-[var(--chart-2)] tnum flex-shrink-0">
              {formatMetric(metric, aggregateValue(metric, r))}
            </span>
          </div>
          <div className="text-white/55 truncate mt-0.5">
            {r.region} · {r.engine_value_stream} · {r.status}
          </div>
        </div>
      ))}
      {rows.length > 12 && (
        <div className="text-[9px] text-white/45 italic">
          + {rows.length - 12} more not shown
        </div>
      )}
    </div>
  )
}

/* ---------- Single row detail ---------- */

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

      {row.initiative ? (
        <div className="rounded border border-[var(--chart-2)]/30 bg-[var(--chart-2)]/5 p-2.5">
          <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--chart-2)] mb-1">
            Initiative
          </div>
          <p className="text-[11px] text-white/85 leading-relaxed whitespace-pre-wrap">
            {row.initiative}
          </p>
        </div>
      ) : null}

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
