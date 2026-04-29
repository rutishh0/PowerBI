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
  Disc3,
  Wrench,
  Settings,
  Activity,
  Filter,
  Plane,
  GaugeCircle,
} from "lucide-react"
import type { ShopVisitData, ShopVisit } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtCount } from "@/lib/format"
import { palette, seriesColors } from "@/lib/chart-palette"

interface ShopVisitVisualizerProps {
  data: ShopVisitData
  filename: string
}

export function ShopVisitVisualizer({ data, filename }: ShopVisitVisualizerProps) {
  const [operator, setOperator] = useState("__all__")
  const [svType, setSvType] = useState("__all__")
  const [svLocation, setSvLocation] = useState("__all__")

  const operators = useMemo(
    () => Array.from(new Set([...data.shop_visits, ...data.maintenance_actions, ...data.current_status].map((v) => v.operator))).sort(),
    [data],
  )
  const svTypes = useMemo(() => Array.from(new Set(data.shop_visits.map((v) => v.sv_type))).sort(), [data.shop_visits])
  const svLocations = useMemo(() => Array.from(new Set(data.shop_visits.map((v) => v.sv_location))).sort(), [data.shop_visits])

  function pass(v: ShopVisit) {
    if (operator !== "__all__" && v.operator !== operator) return false
    if (svType !== "__all__" && v.sv_type !== svType) return false
    if (svLocation !== "__all__" && v.sv_location !== svLocation) return false
    return true
  }

  const filteredVisits = useMemo(() => data.shop_visits.filter(pass), [data.shop_visits, operator, svType, svLocation])
  const filteredMaint = useMemo(
    () =>
      data.maintenance_actions.filter((v) => operator === "__all__" || v.operator === operator),
    [data.maintenance_actions, operator],
  )
  const filteredCurrent = useMemo(
    () =>
      data.current_status.filter((v) => operator === "__all__" || v.operator === operator),
    [data.current_status, operator],
  )

  const uniqueEngines = useMemo(
    () => new Set([...filteredVisits, ...filteredCurrent].map((v) => v.serial_number)).size,
    [filteredVisits, filteredCurrent],
  )

  // SV types donut
  const svTypeDonut = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of filteredVisits) map.set(v.sv_type, (map.get(v.sv_type) ?? 0) + 1)
    return Array.from(map.entries())
      .filter(([k]) => k !== "—")
      .map(([name, value]) => ({ name, value }))
  }, [filteredVisits])

  // SV locations bar
  const svLocationData = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of filteredVisits) map.set(v.sv_location, (map.get(v.sv_location) ?? 0) + 1)
    return Array.from(map.entries())
      .filter(([k]) => k !== "—")
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredVisits])

  const eventsCols: DataTableColumn<ShopVisit>[] = [
    { key: "serial", header: "Serial No.", accessor: (r) => r.serial_number, sortable: true, widthClass: "w-[6rem]" },
    { key: "date", header: "Event Date", accessor: (r) => r.event_datetime, sortable: true, widthClass: "w-[7rem]" },
    { key: "op", header: "Operator", accessor: (r) => r.operator, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "action", header: "Action Code", accessor: (r) => r.action_code, sortable: true, widthClass: "w-[7rem]" },
    { key: "rework", header: "Rework Level", accessor: (r) => r.rework_level, sortable: true, widthClass: "w-[8rem]" },
    { key: "svtype", header: "SV Type", accessor: (r) => r.sv_type, sortable: true, fastFilter: true, widthClass: "w-[7rem]" },
    { key: "loc", header: "SV Location", accessor: (r) => r.sv_location, sortable: true, fastFilter: true, widthClass: "w-[8rem]" },
    {
      key: "hsn",
      header: "HSN",
      accessor: (r) => r.hsn ?? 0,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtCount(r.hsn ?? 0)}</span>,
      widthClass: "w-[6rem]",
    },
    {
      key: "csn",
      header: "CSN",
      accessor: (r) => r.csn ?? 0,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtCount(r.csn ?? 0)}</span>,
      widthClass: "w-[6rem]",
    },
  ]

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      <SectionHeader
        icon={Plane}
        title="Trent Engine Shop Visit History"
        badge="SHOP VISIT"
        description={`${filename} · ${data.metadata.total_engines} engines tracked`}
      />

      <div className="flex flex-wrap gap-2">
        <InfoChip label="Source" value={data.metadata.source_file} />
        <InfoChip label="Engine Models" value={data.metadata.engine_models.join(" · ")} />
        <InfoChip label="Operators" value={fmtCount(data.metadata.operators.length)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
        </div>
        <FilterSelect label="Operator" value={operator} onChange={setOperator} options={operators} width="10rem" />
        <FilterSelect label="SV Type" value={svType} onChange={setSvType} options={svTypes} width="8rem" />
        <FilterSelect label="SV Location" value={svLocation} onChange={setSvLocation} options={svLocations} width="10rem" />
        {(operator !== "__all__" || svType !== "__all__" || svLocation !== "__all__") ? (
          <button
            onClick={() => {
              setOperator("__all__")
              setSvType("__all__")
              setSvLocation("__all__")
            }}
            className="h-8 self-end rounded border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
          >
            Reset
          </button>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Engines Tracked" value={fmtCount(uniqueEngines)} subtitle="Unique serial numbers" icon={Disc3} tone="primary" />
        <KpiCard label="Shop Visits" value={fmtCount(filteredVisits.length)} icon={Wrench} tone="warning" />
        <KpiCard label="Maintenance Actions" value={fmtCount(filteredMaint.length)} icon={Settings} />
        <KpiCard label="Current Status" value={fmtCount(filteredCurrent.length)} subtitle="Records with on-wing status" icon={Activity} tone="success" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Shop Visit Types" subtitle="Counts per SV type">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={svTypeDonut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                {svTypeDonut.map((_, i) => (
                  <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
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

        <ChartCard title="Shop Visit Locations" subtitle="Visits per MRO location" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={svLocationData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill={palette.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Events table */}
      <div className="flex flex-col gap-3">
        <SectionHeader icon={Wrench} title="Shop Visit Events" description="Full event register — filter in place with column chips" />
        <DataTable
          columns={eventsCols}
          rows={filteredVisits}
          maxRows={150}
          getRowId={(r, i) => `${r.serial_number}-${r.event_datetime}-${i}`}
        />
      </div>

      {/* Current status */}
      {filteredCurrent.length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionHeader icon={GaugeCircle} title="Current Engine Status" description={`${filteredCurrent.length} engines with a live on-wing record`} />
          <DataTable
            columns={[
              { key: "serial", header: "Serial No.", accessor: (r) => r.serial_number, sortable: true, widthClass: "w-[6rem]" },
              { key: "pn", header: "Part Number", accessor: (r) => r.part_number, sortable: true, widthClass: "w-[9rem]" },
              { key: "op", header: "Operator", accessor: (r) => r.operator, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
              { key: "reg", header: "Registration", accessor: (r) => r.registration ?? "—", widthClass: "w-[7rem]" },
              {
                key: "hsn",
                header: "HSN",
                accessor: (r) => r.hsn ?? 0,
                sortable: true,
                align: "right",
                render: (r) => <span className="tnum">{fmtCount(r.hsn ?? 0)}</span>,
              },
              {
                key: "csn",
                header: "CSN",
                accessor: (r) => r.csn ?? 0,
                sortable: true,
                align: "right",
                render: (r) => <span className="tnum">{fmtCount(r.csn ?? 0)}</span>,
              },
            ]}
            rows={filteredCurrent}
            maxRows={100}
            getRowId={(r, i) => `cur-${r.serial_number}-${i}`}
          />
        </div>
      ) : null}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  width,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  width: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border border-input bg-background px-2 text-xs"
        style={{ minWidth: width }}
      >
        <option value="__all__">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
