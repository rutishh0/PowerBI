"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Globe2,
  TrendingUp,
  Activity,
  AlertCircle,
  Filter,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  Database,
  LayoutDashboard,
  ChevronDown,
} from "lucide-react"
import type { GlobalHopperData, HopperOpp } from "@/lib/types"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { MultiSelect, inSel } from "@/components/shared/multi-select"
import { fmtGBP, fmtCount } from "@/lib/format"
import { loadPins, savePins } from "@/lib/chart-pins"
import {
  CHART_DEFS,
  HOPPER_PINS_KEY,
  HOPPER_DEFAULT_PINS,
} from "./hopper-charts"
import { HopperCustomizeSheet } from "./hopper-customize-sheet"

interface GlobalHopperVisualizerProps {
  data: GlobalHopperData
  filename: string
  /** Publishes the active filter state (omitting any "__all__" entries) so
   * the parent can forward filters into the Export PDF request. Fires
   * whenever a filter changes. */
  onFiltersChange?: (filters: Record<string, string>) => void
}

export function GlobalHopperVisualizer({ data, filename, onFiltersChange }: GlobalHopperVisualizerProps) {
  // Filters are multi-select: an empty array means "All".
  const [region, setRegion] = useState<string[]>([])
  const [customer, setCustomer] = useState<string[]>([])
  const [evs, setEvs] = useState<string[]>([])
  const [status, setStatus] = useState<string[]>([])
  const [maturity, setMaturity] = useState<string[]>([])
  const [rtype, setRtype] = useState<string[]>([])
  // Onerous-status filter (driven by the clickable Onerous / Not Onerous KPI cards).
  const [onerousFilter, setOnerousFilter] = useState<string[]>([])

  // Publish current filters whenever they change. Empty arrays are omitted;
  // multi-selections are joined so the wire shape stays Record<string,string>.
  useEffect(() => {
    if (!onFiltersChange) return
    const f: Record<string, string> = {}
    if (region.length) f.region = region.join(", ")
    if (customer.length) f.customer = customer.join(", ")
    if (evs.length) f.evs = evs.join(", ")
    if (status.length) f.status = status.join(", ")
    if (maturity.length) f.maturity = maturity.join(", ")
    if (rtype.length) f.restructure_type = rtype.join(", ")
    if (onerousFilter.length) f.onerous_type = onerousFilter.join(", ")
    onFiltersChange(f)
  }, [region, customer, evs, status, maturity, rtype, onerousFilter, onFiltersChange])

  const filtered = useMemo(() => {
    return data.opportunities.filter((o) => {
      if (!inSel(region, o.region)) return false
      if (!inSel(customer, o.customer)) return false
      if (!inSel(evs, o.engine_value_stream)) return false
      if (!inSel(status, o.status)) return false
      if (!inSel(maturity, o.maturity)) return false
      if (!inSel(rtype, o.restructure_type)) return false
      if (!inSel(onerousFilter, o.onerous_type)) return false
      return true
    })
  }, [data.opportunities, region, customer, evs, status, maturity, rtype, onerousFilter])

  // Toggle helper for the clickable KPI cards: set the single-value filter,
  // or clear it when it's already the only active value.
  function toggleFilter(cur: string[], set: (v: string[]) => void, val: string) {
    set(cur.length === 1 && cur[0] === val ? [] : [val])
  }

  // Hero KPIs
  const totalCRP = filtered.reduce((a, b) => a + b.crp_term_benefit, 0)
  const p2026 = filtered.reduce((a, b) => a + b.profit_2026, 0)
  const p2027 = filtered.reduce((a, b) => a + b.profit_2027, 0)
  const p2830 = filtered.reduce((a, b) => a + b.profit_2028 + b.profit_2029 + b.profit_2030, 0)

  // Secondary
  const mature = filtered.filter((o) => o.maturity === "Mature").length
  const immature = filtered.filter((o) => o.maturity === "Immature").length
  const onerous = filtered.filter((o) => o.onerous_type === "Onerous Contract").length
  const notOnerous = filtered.filter((o) => o.onerous_type === "Not Onerous").length
  const regionsInView = Array.from(new Set(filtered.map((o) => o.region)))

  // Pinned chart IDs (persists in browser localStorage)
  const [pinned, setPinned] = useState<Set<string>>(new Set(HOPPER_DEFAULT_PINS))

  // Hydrate from localStorage on the client (SSR-safe — server renders defaults)
  useEffect(() => {
    setPinned(loadPins(HOPPER_PINS_KEY, HOPPER_DEFAULT_PINS))
  }, [])

  function updatePinned(next: Set<string>) {
    setPinned(next)
    savePins(HOPPER_PINS_KEY, next)
  }

  function resetPinned() {
    const fresh = new Set<string>(HOPPER_DEFAULT_PINS)
    setPinned(fresh)
    savePins(HOPPER_PINS_KEY, fresh)
  }

  const registerCols: DataTableColumn<HopperOpp>[] = [
    { key: "region", header: "Region", accessor: (r) => r.region, sortable: true, fastFilter: true, widthClass: "w-[5.5rem]" },
    { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "evs", header: "Engine Value Stream", accessor: (r) => r.engine_value_stream, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "rtype", header: "Restructure Type", accessor: (r) => r.restructure_type, sortable: true, fastFilter: true, widthClass: "w-[10rem]" },
    {
      key: "maturity",
      header: "Maturity",
      accessor: (r) => r.maturity,
      sortable: true,
      fastFilter: true,
      widthClass: "w-[6rem]",
      render: (r) => (
        <span
          className={
            r.maturity === "Mature"
              ? "inline-flex rounded bg-[var(--chart-4)]/20 text-[var(--chart-4)] px-1.5 py-0.5 text-[10px] font-semibold"
              : "inline-flex rounded bg-white/10 text-white/70 px-1.5 py-0.5 text-[10px] font-semibold"
          }
        >
          {r.maturity}
        </span>
      ),
    },
    { key: "status", header: "Status", accessor: (r) => r.status, sortable: true, widthClass: "w-[12rem]" },
    {
      key: "crp",
      header: "CRP Term (£m)",
      accessor: (r) => r.crp_term_benefit,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum font-semibold">{fmtGBP(r.crp_term_benefit)}</span>,
      widthClass: "w-[7rem]",
    },
    {
      key: "p26",
      header: "2026 (£m)",
      accessor: (r) => r.profit_2026,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtGBP(r.profit_2026)}</span>,
      widthClass: "w-[6rem]",
    },
    {
      key: "p27",
      header: "2027 (£m)",
      accessor: (r) => r.profit_2027,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtGBP(r.profit_2027)}</span>,
      widthClass: "w-[6rem]",
    },
    { key: "vp", header: "VP/Owner", accessor: (r) => r.vp_owner, sortable: true, widthClass: "w-[8rem]" },
    {
      key: "initiative",
      header: "Initiative",
      accessor: (r) => r.initiative,
      sortable: false,
      fastFilter: true,
      widthClass: "min-w-[18rem]",
      render: (r) => (
        <span
          className="text-xs text-white/75 line-clamp-2 leading-snug"
          title={r.initiative || ""}
        >
          {r.initiative || "—"}
        </span>
      ),
    },
  ]

  return (
    <div className="bg-[oklch(0.17_0.03_165)] text-white min-h-full">
      <div className="px-6 py-6 flex flex-col gap-6 max-w-[125rem] mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--chart-4)]/15 text-[var(--chart-4)]">
              <Globe2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">{data.metadata.title}</h2>
              <p className="text-sm text-white/60 mt-1">
                {filename} · {data.metadata.regions.join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <span className="inline-flex items-center rounded bg-[var(--chart-4)]/20 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--chart-4)]">
              GLOBAL HOPPER
            </span>
            <span className="inline-flex items-center rounded bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
              ROLLS‑ROYCE
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
          </div>
          <MultiSelect label="Region" value={region} onChange={setRegion} options={data.summary.unique_regions} />
          <MultiSelect label="Customer" value={customer} onChange={setCustomer} options={data.summary.unique_customers} width="10rem" />
          <MultiSelect label="Engine Value Stream" value={evs} onChange={setEvs} options={data.summary.unique_evs} width="10rem" />
          <MultiSelect label="Status" value={status} onChange={setStatus} options={data.summary.unique_statuses} width="10rem" />
          <MultiSelect label="Maturity" value={maturity} onChange={setMaturity} options={data.summary.unique_maturities} />
          <MultiSelect label="Restructure" value={rtype} onChange={setRtype} options={data.summary.unique_restructure_types} width="9rem" />
          <HopperCustomizeSheet pinned={pinned} onChange={updatePinned} onReset={resetPinned} />
          {[region, customer, evs, status, maturity, rtype, onerousFilter].some((v) => v.length > 0) ? (
            <button
              onClick={() => {
                setRegion([])
                setCustomer([])
                setEvs([])
                setStatus([])
                setMaturity([])
                setRtype([])
                setOnerousFilter([])
              }}
              className="h-8 self-end rounded border border-white/20 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Reset
            </button>
          ) : null}
        </div>

        {/* Hero KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HopperKpi label="CRP Term Benefit" value={fmtGBP(totalCRP)} icon={<TrendingUp className="h-4 w-4" />} accent="primary" />
          <HopperKpi label="Profit 2026" value={fmtGBP(p2026)} icon={<Activity className="h-4 w-4" />} />
          <HopperKpi label="Profit 2027" value={fmtGBP(p2027)} icon={<Activity className="h-4 w-4" />} accent="gold" />
          <HopperKpi label="Profit 2028–30" value={fmtGBP(p2830)} icon={<Gauge className="h-4 w-4" />} accent="primary" />
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <HopperChip label="Currency" value="GBP (£m)" />
          <HopperChip label="Opportunities" value={`${fmtCount(filtered.length)} / ${fmtCount(data.opportunities.length)}`} />
          <HopperChip label="Customers" value={fmtCount(new Set(filtered.map((o) => o.customer)).size)} />
          <HopperChip label="Regions" value={regionsInView.join(" · ") || "—"} />
          <HopperChip label="Engine Value Streams" value={fmtCount(new Set(filtered.map((o) => o.engine_value_stream)).size)} />
        </div>

        {/* Secondary KPIs — the maturity / onerous cards are clickable filters:
            tap to drill the whole dashboard (and register) to those opportunities. */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <HopperKpi
            label="Mature" value={fmtCount(mature)} icon={<ShieldCheck className="h-4 w-4" />} accent="success"
            active={maturity.length === 1 && maturity[0] === "Mature"}
            onClick={() => toggleFilter(maturity, setMaturity, "Mature")}
          />
          <HopperKpi
            label="Immature" value={fmtCount(immature)} icon={<ShieldAlert className="h-4 w-4" />}
            active={maturity.length === 1 && maturity[0] === "Immature"}
            onClick={() => toggleFilter(maturity, setMaturity, "Immature")}
          />
          <HopperKpi
            label="Onerous" value={fmtCount(onerous)} icon={<AlertCircle className="h-4 w-4" />} accent="danger"
            active={onerousFilter.length === 1 && onerousFilter[0] === "Onerous Contract"}
            onClick={() => toggleFilter(onerousFilter, setOnerousFilter, "Onerous Contract")}
          />
          <HopperKpi
            label="Not Onerous" value={fmtCount(notOnerous)} icon={<ShieldCheck className="h-4 w-4" />}
            active={onerousFilter.length === 1 && onerousFilter[0] === "Not Onerous"}
            onClick={() => toggleFilter(onerousFilter, setOnerousFilter, "Not Onerous")}
          />
          <HopperKpi
            label="Regions"
            value={fmtCount(regionsInView.length)}
            sub={regionsInView.join(", ") || "—"}
            icon={<Globe2 className="h-4 w-4" />}
          />
        </div>

        {/* Charts (pinned only — manage via Customize button in the filter row) */}
        {(() => {
          // When the data is scoped to a single region the "CRP by Region"
          // donut is redundant (one slice) — drop it from the grid.
          const singleRegion = new Set(filtered.map((o) => o.region)).size <= 1
          const visible = CHART_DEFS.filter(
            (d) => pinned.has(d.id) && !(singleRegion && d.id === "crp-by-region"),
          )
          if (visible.length === 0) {
            return (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
                <LayoutDashboard className="h-6 w-6 mx-auto text-white/40" />
                <div className="mt-3 text-sm font-medium text-white/80">No charts pinned</div>
                <div className="mt-1 text-xs text-white/55 max-w-sm mx-auto">
                  Use the Customize button in the filter bar to pick which charts appear here.
                  Your choice is saved in this browser.
                </div>
              </div>
            )
          }
          return (
            <div className="grid gap-4 lg:grid-cols-2">
              {visible.map((def) => (
                <HopperChartCard key={def.id} title={def.title} subtitle={def.subtitle}>
                  <def.Component filtered={filtered} />
                </HopperChartCard>
              ))}
            </div>
          )
        })()}

        {/* Register */}
        <HopperCollapsible title="Opportunities Register" defaultOpen icon={<Database className="h-4 w-4" />}>
          <DataTable
            columns={registerCols}
            rows={filtered}
            maxRows={200}
            getRowId={(r, i) => `${r.region}-${r.customer}-${i}`}
          />
        </HopperCollapsible>
      </div>
    </div>
  )
}

/* ---------- Scoped dark helpers ---------- */

function HopperChip({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs">
      <span className="font-medium uppercase tracking-[0.1em] text-white/55">{label}</span>
      <span className="text-white tnum">{value}</span>
    </div>
  )
}

function HopperKpi({
  label,
  value,
  sub,
  icon,
  accent,
  onClick,
  active,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  accent?: "gold" | "primary" | "success" | "danger"
  /** When provided, the card becomes a clickable filter toggle. */
  onClick?: () => void
  /** Highlights the card when its filter is currently active. */
  active?: boolean
}) {
  const valueTone =
    accent === "gold"
      ? "text-[var(--chart-2)]"
      : accent === "primary"
        ? "text-[var(--chart-4)]"
        : accent === "success"
          ? "text-[var(--chart-4)]"
          : accent === "danger"
            ? "text-destructive"
            : "text-white"
  const iconBg =
    accent === "gold"
      ? "bg-[var(--chart-2)]/15 text-[var(--chart-2)]"
      : accent === "primary"
        ? "bg-[var(--chart-4)]/15 text-[var(--chart-4)]"
        : accent === "success"
          ? "bg-[var(--chart-4)]/15 text-[var(--chart-4)]"
          : accent === "danger"
            ? "bg-destructive/20 text-destructive"
            : "bg-white/10 text-white/70"
  const wrapCls = onClick
    ? `flex flex-col gap-3 rounded-lg border p-4 text-left transition-colors cursor-pointer ${
        active
          ? "border-[var(--chart-2)] bg-[var(--chart-2)]/10"
          : "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
      }`
    : "flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4"
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</span>
        {icon ? <span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}>{icon}</span> : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`font-display text-2xl font-semibold tracking-tight tnum ${valueTone}`}>{value}</span>
        {sub ? <span className="text-xs text-white/55 text-pretty truncate">{sub}</span> : null}
        {onClick ? (
          <span className="text-[10px] text-white/40 mt-0.5">{active ? "Filtering — tap to clear" : "Tap to filter"}</span>
        ) : null}
      </div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={wrapCls}>
        {inner}
      </button>
    )
  }
  return <div className={wrapCls}>{inner}</div>
}

function HopperChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-4">
      <div className="min-w-0">
        <h3 className="font-display text-sm font-semibold tracking-tight text-white/95 truncate">{title}</h3>
        {subtitle ? <p className="text-xs text-white/55 truncate mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="w-full" style={{ height: 300 }}>
        {children}
      </div>
    </div>
  )
}

function HopperCollapsible({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon ? <span className="text-white/70">{icon}</span> : null}
          <span className="font-display text-sm font-semibold text-white/95">{title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  )
}
