"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DataTableColumn<T> {
  key: string
  header: string
  accessor: (row: T) => unknown
  render?: (row: T) => React.ReactNode
  align?: "left" | "right" | "center"
  sortable?: boolean
  widthClass?: string
  /** Provide distinct values for a fastfilter chip row above the table. */
  fastFilter?: boolean
  /** Function to pull a string used for fastfilter; defaults to accessor. */
  fastFilterValue?: (row: T) => string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  maxRows?: number
  emptyLabel?: string
  getRowId?: (row: T, index: number) => string | number
  dense?: boolean
  className?: string
}

type SortDir = "asc" | "desc" | null

export function DataTable<T>({
  columns,
  rows,
  maxRows,
  emptyLabel = "No records match the current filters.",
  getRowId,
  dense,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [fastFilters, setFastFilters] = useState<Record<string, string>>({})

  const fastCols = columns.filter((c) => c.fastFilter)

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return
    if (sortKey !== col.key) {
      setSortKey(col.key)
      setSortDir("asc")
    } else if (sortDir === "asc") {
      setSortDir("desc")
    } else if (sortDir === "desc") {
      setSortKey(null)
      setSortDir(null)
    } else {
      setSortDir("asc")
    }
  }

  const filtered = useMemo(() => {
    let out = rows
    for (const col of fastCols) {
      const sel = fastFilters[col.key]
      if (sel && sel !== "__all__") {
        const getValue = col.fastFilterValue ?? ((r: T) => String(col.accessor(r) ?? ""))
        out = out.filter((r) => getValue(r) === sel)
      }
    }
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey)
      if (col) {
        out = [...out].sort((a, b) => {
          const av = col.accessor(a) as any
          const bv = col.accessor(b) as any
          const na = typeof av === "number" ? av : av == null ? -Infinity : String(av)
          const nb = typeof bv === "number" ? bv : bv == null ? -Infinity : String(bv)
          if (na === nb) return 0
          const cmp = na < nb ? -1 : 1
          return sortDir === "asc" ? cmp : -cmp
        })
      }
    }
    return out
  }, [rows, sortKey, sortDir, fastFilters, columns, fastCols])

  const visible = maxRows ? filtered.slice(0, maxRows) : filtered

  return (
    <div className={cn("flex flex-col gap-3 min-w-0", className)}>
      {fastCols.length ? (
        <div className="flex flex-wrap gap-2 items-center">
          {fastCols.map((col) => {
            const getValue = col.fastFilterValue ?? ((r: T) => String(col.accessor(r) ?? ""))
            const values = Array.from(new Set(rows.map(getValue).filter(Boolean)))
            return (
              <label key={col.key} className="inline-flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">{col.header}:</span>
                <select
                  value={fastFilters[col.key] ?? "__all__"}
                  onChange={(e) =>
                    setFastFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                  }
                  className="h-7 rounded border border-input bg-background px-2 text-xs"
                >
                  <option value="__all__">All</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
      ) : null}

      <div className="rounded-md border border-border overflow-hidden">
        <div className="max-h-[30rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <tr>
                {columns.map((col) => {
                  const active = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground text-left border-b border-border select-none",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        col.widthClass,
                        col.sortable && "cursor-pointer hover:text-foreground",
                      )}
                      onClick={() => toggleSort(col)}
                      aria-sort={
                        !active ? "none" : sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "none"
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {col.sortable ? (
                          active && sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : active && sortDir === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )
                        ) : null}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                visible.map((row, i) => (
                  <tr
                    key={getRowId?.(row, i) ?? i}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/40 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "align-middle px-3",
                          dense ? "py-1.5" : "py-2.5",
                          col.align === "right" && "text-right tnum",
                          col.align === "center" && "text-center",
                          col.widthClass,
                        )}
                      >
                        {col.render ? col.render(row) : (col.accessor(row) as React.ReactNode) ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {maxRows && filtered.length > maxRows ? (
        <p className="text-xs text-muted-foreground text-right">
          Showing <span className="tnum">{maxRows}</span> of{" "}
          <span className="tnum">{filtered.length.toLocaleString()}</span> rows
        </p>
      ) : (
        <p className="text-xs text-muted-foreground text-right">
          <span className="tnum">{filtered.length.toLocaleString()}</span>{" "}
          {filtered.length === 1 ? "row" : "rows"}
        </p>
      )}
    </div>
  )
}
