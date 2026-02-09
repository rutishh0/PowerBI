"use client"

import { useState, useMemo } from "react"
import { SectionHeader } from "./section-header"
import { DataTable } from "./data-table"
import { fmtCurrency, formatDate } from "@/lib/soa-parser"
import type { SOARecord } from "@/lib/soa-parser"
import { Filter, FileText, DollarSign, AlertTriangle } from "lucide-react"

interface InvoiceRegisterProps {
  items: SOARecord[]
}

export function InvoiceRegister({ items }: InvoiceRegisterProps) {
  const allSections = useMemo(
    () => Array.from(new Set(items.map((r) => r.Section))).sort(),
    [items]
  )
  const allTypes = useMemo(
    () => Array.from(new Set(items.map((r) => r["Entry Type"]))).sort(),
    [items]
  )
  const allStatuses = useMemo(
    () =>
      Array.from(new Set(items.map((r) => r.Status).filter(Boolean))).sort() as string[],
    [items]
  )

  const [secFilter, setSecFilter] = useState<Set<string>>(new Set(allSections))
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(allTypes))
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const maxAmt = useMemo(
    () => (items.length > 0 ? Math.max(...items.map((r) => Math.abs(r.Amount))) : 0),
    [items]
  )
  const [amtRange, setAmtRange] = useState<[number, number]>([0, maxAmt])

  const filtered = useMemo(() => {
    let result = items
    if (secFilter.size < allSections.length) {
      result = result.filter((r) => secFilter.has(r.Section))
    }
    if (typeFilter.size < allTypes.length) {
      result = result.filter((r) => typeFilter.has(r["Entry Type"]))
    }
    if (statusFilter.size > 0) {
      result = result.filter((r) => r.Status && statusFilter.has(r.Status))
    }
    result = result.filter(
      (r) => Math.abs(r.Amount) >= amtRange[0] && Math.abs(r.Amount) <= amtRange[1]
    )
    return result
  }, [items, secFilter, typeFilter, statusFilter, amtRange, allSections.length, allTypes.length])

  const filteredTotal = filtered.reduce((s, r) => s + r.Amount, 0)
  const filteredOverdue = filtered
    .filter((r) => (r["Days Late"] ?? 0) > 0)
    .reduce((s, r) => s + r.Amount, 0)

  const tableRows = filtered.map((r) => ({
    Section: r.Section.length > 20 ? r.Section.slice(0, 18) + "..." : r.Section,
    Reference: r.Reference || "\u2014",
    "Doc No": r["Document No"] || "\u2014",
    "Doc Date": formatDate(r["Document Date"]),
    "Due Date": formatDate(r["Due Date"]),
    Amount: fmtCurrency(r.Amount),
    Currency: r.Currency || "\u2014",
    Text: r.Text ? (r.Text.length > 35 ? r.Text.slice(0, 33) + "..." : r.Text) : "\u2014",
    Status: r.Status ? (r.Status.length > 25 ? r.Status.slice(0, 23) + "..." : r.Status) : "\u2014",
    "Days Late": r["Days Late"] != null ? String(r["Days Late"]) : "\u2014",
    Type: r["Entry Type"],
  }))

  const columns = [
    "Section",
    "Reference",
    "Doc No",
    "Doc Date",
    "Due Date",
    "Amount",
    "Currency",
    "Text",
    "Status",
    "Days Late",
    "Type",
  ]

  function toggleSet(set: Set<string>, val: string): Set<string> {
    const next = new Set(set)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    return next
  }

  return (
    <div>
      <SectionHeader>Complete Invoice Register</SectionHeader>

      {/* Filters */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Filters
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Section */}
          <div>
            <label className="block text-[0.7rem] font-semibold text-card-foreground mb-1.5">
              Section
            </label>
            <div className="flex flex-wrap gap-1">
              {allSections.map((s) => (
                <button
                  key={s}
                  onClick={() => setSecFilter(toggleSet(secFilter, s))}
                  className={`px-2 py-0.5 rounded text-[0.65rem] font-medium border transition-colors ${
                    secFilter.has(s)
                      ? "bg-rr-navy text-card border-rr-navy"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {s.length > 15 ? s.slice(0, 13) + "..." : s}
                </button>
              ))}
            </div>
          </div>
          {/* Type */}
          <div>
            <label className="block text-[0.7rem] font-semibold text-card-foreground mb-1.5">
              Type
            </label>
            <div className="flex flex-wrap gap-1">
              {allTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(toggleSet(typeFilter, t))}
                  className={`px-2 py-0.5 rounded text-[0.65rem] font-medium border transition-colors ${
                    typeFilter.has(t)
                      ? "bg-rr-navy text-card border-rr-navy"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Status */}
          <div>
            <label className="block text-[0.7rem] font-semibold text-card-foreground mb-1.5">
              Status
            </label>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {allStatuses.slice(0, 10).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(toggleSet(statusFilter, s))}
                  className={`px-2 py-0.5 rounded text-[0.65rem] font-medium border transition-colors ${
                    statusFilter.has(s)
                      ? "bg-rr-navy text-card border-rr-navy"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {s.length > 20 ? s.slice(0, 18) + "..." : s}
                </button>
              ))}
            </div>
          </div>
          {/* Amount range */}
          <div>
            <label className="block text-[0.7rem] font-semibold text-card-foreground mb-1.5">
              Amount Range (absolute)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={maxAmt}
                step={maxAmt / 100 || 1}
                value={amtRange[1]}
                onChange={(e) =>
                  setAmtRange([amtRange[0], parseFloat(e.target.value)])
                }
                className="flex-1 accent-rr-navy"
              />
              <span className="text-[0.65rem] text-muted-foreground font-medium tabular-nums w-20 text-right">
                {fmtCurrency(amtRange[1], true)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable columns={columns} rows={tableRows} maxHeight={550} />

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-rr-blue2/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-rr-blue2" />
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Filtered Items
            </div>
            <div className="text-lg font-extrabold text-rr-dark">
              {filtered.length}
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-rr-navy/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-rr-navy" />
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Filtered Total
            </div>
            <div className="text-lg font-extrabold text-rr-dark">
              {fmtCurrency(filteredTotal)}
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border shadow-sm flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-rr-red/10 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-rr-red" />
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              Filtered Overdue
            </div>
            <div className="text-lg font-extrabold text-rr-red">
              {fmtCurrency(filteredOverdue)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
