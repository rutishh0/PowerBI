"use client"

/**
 * Renders a chart-fence payload from the Flask AI backend.
 *
 * The backend's prompt (ai_chat.py §60-83) instructs the LLM to emit:
 *   ```chart
 *   { "type": "bar"|"line"|"donut"|"pie",
 *     "title": "...",
 *     "labels": ["a","b","c"],
 *     "series": [{ "name": "Series 1", "data": [1,2,3] }] }
 *   ```
 *
 * We're tolerant of small variations: donut/pie can supply a flat `data`
 * array; series may be a single object instead of an array; numeric
 * values may arrive as strings.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartCard } from "./chart-card"
import { seriesColors } from "@/lib/chart-palette"

interface RawSeries {
  name?: string
  data?: unknown[]
}

interface ChartFencePayload {
  type?: string
  title?: string
  subtitle?: string
  labels?: unknown[]
  data?: unknown[]
  series?: RawSeries | RawSeries[]
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const cleaned = v.replace(/[, _]/g, "")
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function normalizeSeries(p: ChartFencePayload): { name: string; data: number[] }[] {
  const raw = p.series
  if (!raw) {
    if (Array.isArray(p.data)) return [{ name: "Value", data: p.data.map(toNum) }]
    return []
  }
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr
    .filter(Boolean)
    .map((s, i) => ({
      name: (s.name ?? `Series ${i + 1}`).toString(),
      data: Array.isArray(s.data) ? s.data.map(toNum) : [],
    }))
    .filter((s) => s.data.length > 0)
}

function normalizeLabels(p: ChartFencePayload, length: number): string[] {
  if (Array.isArray(p.labels)) {
    return p.labels.map((l) => (l == null ? "" : String(l)))
  }
  return Array.from({ length }, (_, i) => `#${i + 1}`)
}

interface ChartFenceProps {
  payload: unknown
  filenameHint?: string
}

export function ChartFence({ payload, filenameHint }: ChartFenceProps) {
  if (!payload || typeof payload !== "object") {
    return <ChartFenceFallback raw={payload} />
  }
  const p = payload as ChartFencePayload
  const type = (p.type || "bar").toString().toLowerCase()
  const title = p.title || (type[0].toUpperCase() + type.slice(1) + " chart")
  const subtitle = p.subtitle

  const exportFilename = filenameHint
    ? `${filenameHint}-${title}`
    : title

  /* ---------- Pie / donut ---------- */

  if (type === "donut" || type === "pie") {
    // Donut data can come as: series[0].data, or top-level `data`, or
    // series with one entry per slice (each having a single-element data[]).
    let slices: { name: string; value: number }[] = []
    const series = normalizeSeries(p)
    if (series.length === 1) {
      const labels = normalizeLabels(p, series[0].data.length)
      slices = series[0].data.map((value, i) => ({ name: labels[i] ?? `Slice ${i + 1}`, value }))
    } else if (series.length > 1) {
      // Multi-series donut → use each series's first datum as the slice value
      slices = series.map((s) => ({ name: s.name, value: s.data[0] ?? 0 }))
    } else if (Array.isArray(p.data)) {
      const labels = normalizeLabels(p, p.data.length)
      slices = p.data.map((v, i) => ({ name: labels[i] ?? `Slice ${i + 1}`, value: toNum(v) }))
    }

    if (slices.length === 0) return <ChartFenceFallback raw={payload} />

    return (
      <ChartCard title={title} subtitle={subtitle} exportFilename={exportFilename} height={280}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={type === "donut" ? "55%" : 0}
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {slices.map((_, i) => (
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
    )
  }

  /* ---------- Bar / line ---------- */

  const series = normalizeSeries(p)
  const labelsLen = Math.max(0, ...series.map((s) => s.data.length))
  const labels = normalizeLabels(p, labelsLen)

  if (series.length === 0) return <ChartFenceFallback raw={payload} />

  // Pivot: row per category, columns are series names.
  const rows = labels.map((label, i) => {
    const r: Record<string, number | string> = { __label: label }
    for (const s of series) r[s.name] = s.data[i] ?? 0
    return r
  })

  if (type === "line") {
    return (
      <ChartCard title={title} subtitle={subtitle} exportFilename={exportFilename} height={280}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="__label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            {series.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={seriesColors[i % seriesColors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  // Default: bar
  return (
    <ChartCard title={title} subtitle={subtitle} exportFilename={exportFilename} height={280}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="__label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
          {series.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.name}
              dataKey={s.name}
              fill={seriesColors[i % seriesColors.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}

function ChartFenceFallback({ raw }: { raw: unknown }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        Chart payload (could not interpret)
      </div>
      <pre className="overflow-x-auto text-[11px] text-foreground/80">
        {JSON.stringify(raw, null, 2)}
      </pre>
    </div>
  )
}
