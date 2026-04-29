"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  CalendarClock,
  ListChecks,
  Plane,
  Target,
  UserCheck,
  Users,
  Filter,
} from "lucide-react"
import type {
  CommercialPlanData,
  CpOneYearItem,
  CpFiveYearItem,
} from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtCount, fmtMoney } from "@/lib/format"
import { palette, seriesColors } from "@/lib/chart-palette"

const STATUS_COLORS: Record<string, string> = {
  L1: "#93C5FD",
  L2: "#60A5FA",
  L3: "#3B82F6",
  L4: "#1E40AF",
}

function statusBadge(value: string | null | undefined) {
  if (!value) return null
  const code = String(value).trim().toUpperCase().slice(0, 2)
  const bg = STATUS_COLORS[code] ?? "#E2E8F0"
  return (
    <span
      className="inline-flex items-center justify-center rounded px-1.5 text-[10px] font-semibold"
      style={{
        background: bg,
        color: code === "L4" || code === "L3" ? "#fff" : "#0F172A",
      }}
    >
      {value}
    </span>
  )
}

export function CommercialPlanVisualizer({
  data,
  filename,
  mode = "standard",
}: {
  data: CommercialPlanData
  filename: string
  mode?: "standard" | "executive"
}) {
  const meta = data.metadata
  const oneYP = data.one_year_plan
  const fiveYP = data.five_year_spe_sales
  const annual = data.annual_summary

  const [ownerFilter, setOwnerFilter] = useState<string>("__all__")
  const [yearFilter, setYearFilter] = useState<string>("__all__")
  const [customerFilter, setCustomerFilter] = useState<string>("__all__")

  /* ---------------- KPI derivation ---------------- */

  const totalOneActions = oneYP.items.length
  const totalFiveOpps = fiveYP.totals.total_opportunities ?? fiveYP.items.length

  const yearlyTotals = useMemo(() => {
    const yrs = Object.entries(annual.by_year)
      .map(([year, block]) => ({ year, total: Number(block.grand_total ?? 0) }))
      .filter((x) => x.year)
      .sort((a, b) => a.year.localeCompare(b.year))
    return yrs
  }, [annual.by_year])

  const fiveYearEngines = yearlyTotals.reduce((s, y) => s + (y.total || 0), 0)

  const uniqueCustomers = useMemo(() => {
    const s = new Set<string>()
    for (const r of oneYP.items) if (r.customer) s.add(String(r.customer).trim())
    for (const r of fiveYP.items) if (r.customer) s.add(String(r.customer).trim())
    return s.size
  }, [oneYP.items, fiveYP.items])

  const uniqueOwners = useMemo(() => {
    const s = new Set<string>()
    for (const r of oneYP.items) if (r.owner) s.add(String(r.owner).trim())
    return s
  }, [oneYP.items])

  /* ---------------- Charts ---------------- */

  const engineFamilyByYear = useMemo(() => {
    const fams = new Set<string>()
    const map: Record<string, Record<string, number>> = {}
    for (const [yr, block] of Object.entries(annual.by_year)) {
      for (const c of block.customers ?? []) {
        for (const e of c.engines ?? []) {
          const t = e.type || "Unknown"
          fams.add(t)
          map[t] = map[t] || {}
          map[t][yr] = (map[t][yr] || 0) + (e.count || 0)
        }
      }
    }
    const years = yearlyTotals.map((y) => y.year)
    const stacked = years.map((yr) => {
      const row: Record<string, number | string> = { year: yr }
      for (const f of fams) row[f] = map[f]?.[yr] ?? 0
      return row
    })
    return { stacked, fams: Array.from(fams).sort() }
  }, [annual.by_year, yearlyTotals])

  const topCustomers = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const block of Object.values(annual.by_year)) {
      for (const c of block.customers ?? []) {
        totals[c.name] = (totals[c.name] || 0) + (c.total || 0)
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({ name, total }))
  }, [annual.by_year])

  const ownerWorkload = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of oneYP.items) {
      const o = (r.owner || "Unassigned").toString().trim() || "Unassigned"
      m[o] = (m[o] || 0) + 1
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([owner, count]) => ({ owner, count }))
  }, [oneYP.items])

  /* ---------------- Filtered tables ---------------- */

  const filteredActionLog = useMemo(() => {
    let rows = oneYP.items
    if (ownerFilter !== "__all__") {
      rows = rows.filter(
        (r) => (r.owner || "Unassigned").toString().trim() === ownerFilter,
      )
    }
    return rows
  }, [oneYP.items, ownerFilter])

  const fiveYearYears = useMemo(() => {
    const s = new Set<string>()
    for (const r of fiveYP.items) if (r.year != null) s.add(String(r.year))
    return Array.from(s).sort()
  }, [fiveYP.items])

  const fiveYearCustomers = useMemo(() => {
    const s = new Set<string>()
    for (const r of fiveYP.items) if (r.customer) s.add(String(r.customer).trim())
    return Array.from(s).sort()
  }, [fiveYP.items])

  const filteredPipeline = useMemo(() => {
    return fiveYP.items.filter((r) => {
      if (yearFilter !== "__all__" && String(r.year ?? "") !== yearFilter) return false
      if (
        customerFilter !== "__all__" &&
        (r.customer || "").toString().trim() !== customerFilter
      )
        return false
      return true
    })
  }, [fiveYP.items, yearFilter, customerFilter])

  /* ---------------- Columns ---------------- */

  const actionLogCols: DataTableColumn<CpOneYearItem>[] = [
    {
      key: "blue_chip",
      header: "Blue Chip",
      accessor: (r) => r.blue_chip,
      sortable: true,
      widthClass: "w-[6rem]",
    },
    {
      key: "customer",
      header: "Customer",
      accessor: (r) => r.customer,
      sortable: true,
      fastFilter: true,
    },
    {
      key: "issue",
      header: "Issue",
      accessor: (r) => r.issue,
      render: (r) => (
        <span className="text-foreground/90 text-xs">{r.issue ?? "—"}</span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      accessor: (r) => r.owner,
      sortable: true,
      fastFilter: true,
      widthClass: "w-[8rem]",
    },
    {
      key: "categories",
      header: "Status",
      accessor: () => "",
      render: (r) => (
        <div className="flex items-center gap-1 flex-wrap">
          {Object.entries(r.categories || {}).map(([cat, val]) =>
            val ? (
              <span key={cat} className="inline-flex items-center gap-1">
                <span className="text-[10px] uppercase text-muted-foreground tracking-wider">
                  {cat.slice(0, 3)}
                </span>
                {statusBadge(val)}
              </span>
            ) : null,
          )}
        </div>
      ),
    },
    {
      key: "latest_update",
      header: "Latest Update",
      accessor: (r) => r.latest_update,
      render: (r) => (
        <span className="text-muted-foreground text-xs truncate block max-w-md">
          {r.latest_update ?? ""}
        </span>
      ),
    },
  ]

  const pipelineCols: DataTableColumn<CpFiveYearItem>[] = [
    {
      key: "year",
      header: "Year",
      accessor: (r) => r.year,
      sortable: true,
      align: "right",
      widthClass: "w-[5rem]",
      fastFilter: true,
    },
    {
      key: "customer",
      header: "Customer",
      accessor: (r) => r.customer,
      sortable: true,
      fastFilter: true,
    },
    {
      key: "engine_type",
      header: "Engine",
      accessor: (r) => r.engine_type,
      sortable: true,
      fastFilter: true,
    },
    {
      key: "count",
      header: "Engines",
      accessor: (r) => r.count,
      sortable: true,
      align: "right",
      widthClass: "w-[6rem]",
    },
    {
      key: "amount",
      header: "Amount",
      accessor: (r) => r.amount,
      sortable: true,
      align: "right",
      render: (r) => (r.amount != null ? fmtMoney(Number(r.amount)) : "—"),
    },
  ]

  /* ---------------- Render ---------------- */

  const showFilters = mode !== "executive"

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      <SectionHeader
        icon={CalendarClock}
        title={`Commercial Plan${meta.plan_year ? ` — ${meta.plan_year}` : ""}`}
        badge="COMM PLAN"
        description={`${filename}${
          meta.sheets_parsed.length ? ` · Sheets: ${meta.sheets_parsed.join(", ")}` : ""
        }`}
      />

      <div className="flex flex-wrap gap-2">
        <InfoChip label="Source" value={meta.source_file} />
        <InfoChip label="Plan Year" value={meta.plan_year ? String(meta.plan_year) : "—"} />
        <InfoChip
          label="Weeks Tracked"
          value={fmtCount(oneYP.week_columns.length)}
        />
        <InfoChip
          label="Categories"
          value={oneYP.category_columns.length ? oneYP.category_columns.join(", ") : "—"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="1YP Actions"
          value={fmtCount(totalOneActions)}
          icon={ListChecks}
          subtitle={`${oneYP.week_columns.length} wks`}
        />
        <KpiCard
          label="5YP Opportunities"
          value={fmtCount(totalFiveOpps)}
          icon={Target}
          subtitle="SPE pipeline"
        />
        <KpiCard
          label="5-Year Engines"
          value={fmtCount(fiveYearEngines)}
          tone="success"
          icon={Plane}
        />
        <KpiCard
          label="Customers"
          value={fmtCount(uniqueCustomers)}
          icon={Users}
        />
        <KpiCard
          label="Owners"
          value={fmtCount(uniqueOwners.size)}
          icon={UserCheck}
        />
        <KpiCard
          label="Plan Year"
          value={meta.plan_year ? String(meta.plan_year) : "—"}
          icon={CalendarClock}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Forecast Engines by Year"
          subtitle="Grand totals across all customers"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearlyTotals} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {yearlyTotals.map((_, i) => (
                  <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Customers (5-yr engines)" subtitle="Top 10">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topCustomers} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="total" fill={palette.accent} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {engineFamilyByYear.fams.length > 0 && (
        <ChartCard title="Engine Family Mix Across Years" subtitle="Stacked counts">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={engineFamilyByYear.stacked}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {engineFamilyByYear.fams.map((f, i) => (
                <Bar
                  key={f}
                  dataKey={f}
                  stackId="a"
                  fill={seriesColors[i % seriesColors.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {ownerWorkload.length > 0 && (
        <ChartCard title="1YP Actions by Owner" subtitle="Top 12 owners">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ownerWorkload} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="owner"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill={palette.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeader
          title="1YP Action Log"
          description="Filtered view — click column headers to sort"
        />
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Owner</span>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[8rem]"
              >
                <option value="__all__">All</option>
                {Array.from(uniqueOwners)
                  .sort()
                  .map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        <DataTable
          columns={actionLogCols}
          rows={filteredActionLog}
          maxRows={150}
          getRowId={(r, i) =>
            `${r.customer ?? ""}-${r.issue ?? ""}-${i}`
          }
        />
      </div>

      {fiveYP.items.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="5YP SPE Sales Pipeline"
            description={`${fiveYP.items.length} opportunities · totalling ${fmtCount(
              fiveYearEngines,
            )} engines`}
          />
          {showFilters && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
              </div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">Year</span>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[6rem]"
                >
                  <option value="__all__">All</option>
                  {fiveYearYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">Customer</span>
                <select
                  value={customerFilter}
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[10rem]"
                >
                  <option value="__all__">All</option>
                  {fiveYearCustomers.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <DataTable
            columns={pipelineCols}
            rows={filteredPipeline}
            maxRows={200}
            getRowId={(r, i) => `${r.customer ?? ""}-${r.year ?? ""}-${i}`}
          />
        </div>
      )}

      {data.errors && data.errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="font-medium text-destructive mb-1">Parser warnings</div>
          <ul className="list-disc pl-5 space-y-1 text-xs text-foreground/80">
            {data.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
