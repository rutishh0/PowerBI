"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  MapPin,
  Users,
  CalendarDays,
  Briefcase,
  Filter,
  Sun,
  Globe,
} from "lucide-react"
import type { EmployeeWhereaboutsData } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtCount } from "@/lib/format"

/* ──────────────────────────────────────────────────────────────────────────
 * Category mapper — mirrors the canonical _ewCategorize() in V6 dashboard.js
 * ────────────────────────────────────────────────────────────────────────── */

export const EW_CATEGORIES = [
  { key: "Eid Holiday", color: "#0EA5E9", label: "Eid Holiday" },
  { key: "Other Holidays", color: "#0369A1", label: "Other Holidays" },
  { key: "Leave", color: "#F59E0B", label: "Leave" },
  { key: "Office", color: "#10B981", label: "Office" },
  { key: "Work From Home", color: "#6366F1", label: "Work From Home" },
  { key: "Business", color: "#8B5CF6", label: "Business" },
  { key: "Cross Border", color: "#14B8A6", label: "Cross Border" },
  { key: "Sick", color: "#EF4444", label: "Sick" },
  { key: "Other", color: "#94A3B8", label: "Other" },
] as const

export type EwCategoryKey = (typeof EW_CATEGORIES)[number]["key"]

const CATEGORY_COLOR_BY_KEY = Object.fromEntries(
  EW_CATEGORIES.map((c) => [c.key, c.color]),
) as Record<EwCategoryKey, string>

export function ewCategorize(
  code: string | null | undefined,
  legend: Record<string, string>,
): EwCategoryKey | null {
  if (code == null) return null
  const raw = String(code).trim()
  if (!raw || raw === "_blank") return null
  const up = raw.toUpperCase()
  const lblRaw = legend?.[raw] ?? ""
  const hay = `${raw} ${lblRaw}`.toLowerCase()

  if (/\beid\b/.test(hay)) return "Eid Holiday"
  if (up === "O") return "Office"
  if (up === "H" || up === "WFH") return "Work From Home"
  if (up === "PL" || up === "L") return "Leave"
  if (up === "B") return "Business"
  if (up === "CB") return "Cross Border"
  if (up === "S") return "Sick"
  if (up === "EB" || up === "HOL") return "Other Holidays"
  if (/\b(public\s+)?holiday\b/.test(hay) || /easter\s+break/.test(hay))
    return "Other Holidays"
  if (/personal\s+leave/.test(hay) || /\bleave\b/.test(hay)) return "Leave"
  if (/cross\s+border/.test(hay)) return "Cross Border"
  if (/work\s+from\s+home/.test(hay) || /\bwfh\b/.test(hay)) return "Work From Home"
  if (/business\s+trip/.test(hay) || /\bbusiness\b/.test(hay)) return "Business"
  if (/\bsick\b/.test(hay)) return "Sick"
  if (/\boffice\b/.test(hay)) return "Office"
  return "Other"
}

function fmtIso(iso: string): string {
  if (!iso || typeof iso !== "string") return ""
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${MON[parseInt(m[2], 10) - 1]} ${m[3]}, ${m[1]}`
}

/* ──────────────────────────────────────────────────────────────────────────
 * Visualizer
 * ────────────────────────────────────────────────────────────────────────── */

interface WhereaboutsEvent {
  date: string
  code: string
  category: EwCategoryKey
  empNum: string
  empName: string
  country: string
  sector: string
  sheet: string
}

export function EmployeeWhereaboutsVisualizer({
  data,
  filename,
  mode = "standard",
}: {
  data: EmployeeWhereaboutsData
  filename: string
  mode?: "standard" | "executive"
}) {
  const meta = data.metadata
  const employees = data.employees ?? []
  const whereabouts = data.whereabouts ?? {}
  const legend = data.legend ?? {}
  const aggregates = data.aggregates ?? {}
  const sheetsParsed = meta.sheets_parsed ?? Object.keys(whereabouts)

  const [categoryFilter, setCategoryFilter] = useState<string>("__all__")
  const [countryFilter, setCountryFilter] = useState<string>("__all__")
  const [sheetFilter, setSheetFilter] = useState<string>("__all__")

  /* ---------------- Derive event log ---------------- */

  const allEvents = useMemo<WhereaboutsEvent[]>(() => {
    const empIndex: Record<string, (typeof employees)[number]> = {}
    for (const e of employees) {
      if (e?.employee_number != null) empIndex[String(e.employee_number)] = e
    }

    const out: WhereaboutsEvent[] = []
    for (const sheet of sheetsParsed) {
      const rows = whereabouts[sheet] ?? []
      for (const row of rows) {
        const empMeta = empIndex[String(row.employee_number ?? "")] ?? {
          employee_number: "",
          name: null,
          country: null,
          business_sector: null,
        }
        for (const [date, raw] of Object.entries(row.daily_status ?? {})) {
          if (raw == null || raw === "") continue
          const cat = ewCategorize(String(raw), legend)
          if (!cat) continue
          out.push({
            date,
            code: String(raw),
            category: cat,
            empNum: String(row.employee_number ?? ""),
            empName: row.name || empMeta.name || "",
            country: row.country || empMeta.country || "Unknown",
            sector: empMeta.business_sector || "",
            sheet,
          })
        }
      }
    }
    return out
  }, [employees, whereabouts, legend, sheetsParsed])

  /* ---------------- KPIs ---------------- */

  const totalEmployees = meta.total_employees ?? employees.length
  const uniqueCountries = meta.unique_countries ?? []
  const uniqueSectors = meta.unique_sectors ?? []
  const loggedEvents = allEvents.length
  const activeHolidays = allEvents.filter(
    (e) => e.category === "Eid Holiday" || e.category === "Other Holidays",
  ).length

  const coverageStr = useMemo(() => {
    const months = meta.months ?? []
    if (months.length) {
      const starts = months.map((m) => m.start_date).filter(Boolean) as string[]
      const ends = months.map((m) => m.end_date).filter(Boolean) as string[]
      starts.sort()
      ends.sort()
      if (starts.length && ends.length) {
        return `${fmtIso(starts[0])} → ${fmtIso(ends[ends.length - 1])}`
      }
    }
    if (allEvents.length) {
      const dates = allEvents.map((e) => e.date).sort()
      return `${fmtIso(dates[0])} → ${fmtIso(dates[dates.length - 1])}`
    }
    return "—"
  }, [meta.months, allEvents])

  const topCountry = useMemo(() => {
    const ag = aggregates.by_country ?? {}
    if (Object.keys(ag).length === 0) return "—"
    const entries = Object.entries(ag).sort((a, b) => b[1] - a[1])
    return entries[0]?.[0] ?? "—"
  }, [aggregates.by_country])

  /* ---------------- Charts ---------------- */

  const eventsByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of allEvents) m[e.category] = (m[e.category] || 0) + 1
    return EW_CATEGORIES.map((c) => ({
      name: c.label,
      value: m[c.key] || 0,
      key: c.key,
    })).filter((d) => d.value > 0)
  }, [allEvents])

  const eventsByCountry = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of allEvents) m[e.country] = (m[e.country] || 0) + 1
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }))
  }, [allEvents])

  const eventsByMonth = useMemo(() => {
    const m: Record<string, number> = {}
    for (const sheet of sheetsParsed) m[sheet.trim()] = 0
    for (const e of allEvents) m[e.sheet.trim()] = (m[e.sheet.trim()] || 0) + 1
    return Object.entries(m)
      .sort()
      .map(([sheet, count]) => ({ sheet, count }))
  }, [allEvents, sheetsParsed])

  /* ---------------- Filtered event log ---------------- */

  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (categoryFilter !== "__all__" && e.category !== categoryFilter) return false
      if (countryFilter !== "__all__" && e.country !== countryFilter) return false
      if (sheetFilter !== "__all__" && e.sheet.trim() !== sheetFilter) return false
      return true
    })
  }, [allEvents, categoryFilter, countryFilter, sheetFilter])

  /* ---------------- Columns ---------------- */

  const eventCols: DataTableColumn<WhereaboutsEvent>[] = [
    {
      key: "date",
      header: "Date",
      accessor: (r) => r.date,
      sortable: true,
      widthClass: "w-[7rem]",
      render: (r) => <span className="text-xs">{fmtIso(r.date)}</span>,
    },
    {
      key: "empName",
      header: "Employee",
      accessor: (r) => r.empName || r.empNum,
      sortable: true,
      fastFilter: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-foreground">{r.empName || "—"}</span>
          <span className="text-[10px] text-muted-foreground">{r.empNum}</span>
        </div>
      ),
    },
    {
      key: "country",
      header: "Country",
      accessor: (r) => r.country,
      sortable: true,
      fastFilter: true,
      widthClass: "w-[8rem]",
    },
    {
      key: "category",
      header: "Category",
      accessor: (r) => r.category,
      sortable: true,
      fastFilter: true,
      render: (r) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: `${CATEGORY_COLOR_BY_KEY[r.category]}1A`,
            color: CATEGORY_COLOR_BY_KEY[r.category],
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: CATEGORY_COLOR_BY_KEY[r.category] }}
          />
          {r.category}
        </span>
      ),
    },
    {
      key: "code",
      header: "Code",
      accessor: (r) => r.code,
      widthClass: "w-[5rem]",
      render: (r) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{r.code}</code>
      ),
    },
    {
      key: "sheet",
      header: "Month",
      accessor: (r) => r.sheet.trim(),
      sortable: true,
      fastFilter: true,
      widthClass: "w-[7rem]",
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.sheet.trim()}</span>
      ),
    },
  ]

  /* ---------------- Render ---------------- */

  const showFilters = mode !== "executive"

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      <SectionHeader
        icon={MapPin}
        title="Employee Whereabouts"
        badge="WHEREABOUTS"
        description={`${filename}${
          sheetsParsed.length ? ` · ${sheetsParsed.length} months: ${sheetsParsed.map((s) => s.trim()).join(", ")}` : ""
        }`}
      />

      <div className="flex flex-wrap gap-2">
        <InfoChip label="Source" value={meta.source_file} />
        <InfoChip label="Coverage" value={coverageStr} />
        <InfoChip label="Countries" value={fmtCount(uniqueCountries.length)} />
        <InfoChip
          label="Sectors"
          value={uniqueSectors.length ? uniqueSectors.join(", ") : "—"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Employees"
          value={fmtCount(totalEmployees)}
          icon={Users}
        />
        <KpiCard
          label="Logged Events"
          value={fmtCount(loggedEvents)}
          icon={CalendarDays}
          tone="primary"
        />
        <KpiCard
          label="Active Holidays"
          value={fmtCount(activeHolidays)}
          icon={Sun}
          tone="accent"
          subtitle="Eid + Other"
        />
        <KpiCard label="Top Country" value={topCountry} icon={Globe} />
        <KpiCard
          label="Sectors"
          value={fmtCount(uniqueSectors.length)}
          icon={Briefcase}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Events by Category" subtitle="All months" className="lg:col-span-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={eventsByCategory}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {eventsByCategory.map((d, i) => (
                  <Cell
                    key={i}
                    fill={CATEGORY_COLOR_BY_KEY[d.key as EwCategoryKey] ?? "#94A3B8"}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Events by Country"
          subtitle="Top 10 countries"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={eventsByCountry}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 60, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis
                type="category"
                dataKey="country"
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
              <Bar dataKey="count" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {eventsByMonth.length > 1 && (
        <ChartCard title="Events Logged per Month" subtitle="Across the parsed coverage window">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={eventsByMonth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="sheet"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
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
              <Bar dataKey="count" fill="#0369A1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="flex flex-col gap-3">
        <SectionHeader
          title="Event Log"
          description={`${filteredEvents.length} of ${loggedEvents} events shown · click headers to sort`}
        />
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[10rem]"
              >
                <option value="__all__">All</option>
                {EW_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Country</span>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[8rem]"
              >
                <option value="__all__">All</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">Month</span>
              <select
                value={sheetFilter}
                onChange={(e) => setSheetFilter(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[8rem]"
              >
                <option value="__all__">All</option>
                {sheetsParsed.map((s) => (
                  <option key={s} value={s.trim()}>
                    {s.trim()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <DataTable
          columns={eventCols}
          rows={filteredEvents}
          maxRows={200}
          getRowId={(r, i) => `${r.empNum}-${r.date}-${i}`}
        />
      </div>

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
