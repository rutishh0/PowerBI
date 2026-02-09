"use client"

import { useState, useCallback, useMemo } from "react"
import {
  parseSOAWorkbook,
  mergeParsedFiles,
  fmtCurrency,
} from "@/lib/soa-parser"
import type { ParsedSOA, SOARecord, GrandTotals } from "@/lib/soa-parser"
import { DashboardHeader } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { WelcomeScreen } from "@/components/dashboard/welcome"
import { CustomerInfo } from "@/components/dashboard/customer-info"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { ExecutiveOverview } from "@/components/dashboard/executive-overview"
import { BilateralPosition } from "@/components/dashboard/bilateral-position"
import { SectionBreakdown } from "@/components/dashboard/section-breakdown"
import { InvoiceRegister } from "@/components/dashboard/invoice-register"
import { DashboardFooter } from "@/components/dashboard/footer"
import { SectionHeader } from "@/components/dashboard/section-header"
import { DataTable } from "@/components/dashboard/data-table"
import { Loader2 } from "lucide-react"

export default function DashboardPage() {
  // State
  const [parsedFiles, setParsedFiles] = useState<Map<string, ParsedSOA>>(
    new Map()
  )
  const [fileNames, setFileNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // Settings
  const [dashboardView, setDashboardView] = useState("Standard")
  const [showCredits, setShowCredits] = useState(true)

  // Global filters
  const [globalFilters, setGlobalFilters] = useState<{
    sections: Set<string>
    types: Set<string>
    statuses: Set<string>
    currencies: Set<string>
  }>({
    sections: new Set<string>(),
    types: new Set<string>(),
    statuses: new Set<string>(),
    currencies: new Set<string>(),
  })
  const [filtersInitialised, setFiltersInitialised] = useState(false)

  // Handle file upload
  const handleFilesLoaded = useCallback(
    async (files: { name: string; buffer: ArrayBuffer }[]) => {
      setLoading(true)
      setErrors([])

      const newParsed = new Map(parsedFiles)
      const newNames = [...fileNames]
      const newErrors: string[] = []

      for (const file of files) {
        try {
          const result = parseSOAWorkbook(file.buffer)
          newParsed.set(file.name, result)
          if (!newNames.includes(file.name)) {
            newNames.push(file.name)
          }
        } catch (e) {
          newErrors.push(`Failed to parse ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      setParsedFiles(newParsed)
      setFileNames(newNames)
      if (newErrors.length > 0) setErrors(newErrors)
      setLoading(false)
      setFiltersInitialised(false)
    },
    [parsedFiles, fileNames]
  )

  const handleRemoveFile = useCallback(
    (name: string) => {
      const next = new Map(parsedFiles)
      next.delete(name)
      setParsedFiles(next)
      setFileNames((prev) => prev.filter((n) => n !== name))
      setFiltersInitialised(false)
    },
    [parsedFiles]
  )

  // Merge data
  const selectedSources = fileNames.filter((n) => parsedFiles.has(n))
  const merged = useMemo(() => {
    if (selectedSources.length === 0)
      return {
        df_all: [] as SOARecord[],
        merged_sections: new Map(),
        merged_grand: {
          total_charges: 0,
          total_credits: 0,
          net_balance: 0,
          item_count: 0,
          total_overdue: 0,
        } as GrandTotals,
        all_metadata: [],
      }
    return mergeParsedFiles(parsedFiles, selectedSources)
  }, [parsedFiles, selectedSources])

  // Initialise global filters once we have data
  if (!filtersInitialised && merged.df_all.length > 0) {
    const sections = new Set(merged.df_all.map((r) => r.Section))
    const types = new Set(merged.df_all.map((r) => r["Entry Type"]))
    setGlobalFilters({
      sections,
      types,
      statuses: new Set<string>(),
      currencies: new Set(
        merged.df_all
          .map((r) => r.Currency)
          .filter(Boolean) as string[]
      ),
    })
    setFiltersInitialised(true)
  }

  // Apply global filters
  const filteredItems = useMemo(() => {
    let result = merged.df_all
    if (globalFilters.sections.size > 0) {
      result = result.filter((r) => globalFilters.sections.has(r.Section))
    }
    if (globalFilters.types.size > 0) {
      result = result.filter((r) => globalFilters.types.has(r["Entry Type"]))
    }
    if (globalFilters.statuses.size > 0) {
      result = result.filter(
        (r) => r.Status && globalFilters.statuses.has(r.Status)
      )
    }
    if (globalFilters.currencies.size > 0) {
      result = result.filter(
        (r) =>
          !r.Currency || globalFilters.currencies.has(r.Currency)
      )
    }
    return result
  }, [merged.df_all, globalFilters])

  // Recompute grand totals from filtered
  const filteredGrand = useMemo((): GrandTotals => {
    if (filteredItems.length === 0) {
      return {
        total_charges: 0,
        total_credits: 0,
        net_balance: 0,
        item_count: 0,
        total_overdue: 0,
      }
    }
    const totalCharges = filteredItems
      .filter((r) => r.Amount > 0)
      .reduce((s, r) => s + r.Amount, 0)
    const totalCredits = filteredItems
      .filter((r) => r.Amount < 0)
      .reduce((s, r) => s + r.Amount, 0)
    const netBalance = filteredItems.reduce((s, r) => s + r.Amount, 0)
    return {
      total_charges: totalCharges,
      total_credits: totalCredits,
      net_balance: netBalance,
      item_count: filteredItems.length,
      total_overdue: merged.merged_grand.total_overdue || netBalance,
    }
  }, [filteredItems, merged.merged_grand.total_overdue])

  // Avg days late
  const avgDaysLate = useMemo(() => {
    const vals = merged.all_metadata
      .map((m) => m.avg_days_late)
      .filter((v): v is number => v != null)
    if (vals.length === 0) return null
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
  }, [merged.all_metadata])

  const hasData = selectedSources.length > 0

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        onFilesLoaded={handleFilesLoaded}
        loadedFiles={fileNames}
        onRemoveFile={handleRemoveFile}
        dashboardView={dashboardView}
        onDashboardViewChange={setDashboardView}
        showCredits={showCredits}
        onShowCreditsChange={setShowCredits}
        allItems={merged.df_all}
        allMetadata={merged.all_metadata}
        globalFilters={globalFilters}
        onGlobalFiltersChange={setGlobalFilters}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 space-y-5">
        <DashboardHeader />

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-rr-navy" />
            <span className="ml-3 text-sm text-muted-foreground font-medium">
              Parsing workbook(s)...
            </span>
          </div>
        )}

        {/* Errors */}
        {errors.map((err, i) => (
          <div
            key={i}
            className="bg-rr-red/10 border border-rr-red/30 text-rr-red text-sm rounded-lg px-4 py-3"
          >
            {err}
          </div>
        ))}

        {/* Empty state */}
        {!hasData && !loading && <WelcomeScreen />}

        {/* Dashboard views */}
        {hasData && !loading && (
          <>
            {dashboardView === "Standard" && (
              <>
                <CustomerInfo metaList={merged.all_metadata} />
                <KpiCards grand={filteredGrand} avgDaysLate={avgDaysLate} />
                <ExecutiveOverview items={filteredItems} />
                <BilateralPosition items={filteredItems} />
                <SectionBreakdown
                  sections={merged.merged_sections}
                  showCredits={showCredits}
                />
                <InvoiceRegister items={filteredItems} />
              </>
            )}

            {dashboardView === "Executive Summary" && (
              <>
                <CustomerInfo metaList={merged.all_metadata} />
                <KpiCards grand={filteredGrand} avgDaysLate={avgDaysLate} />
                <ExecutiveOverview items={filteredItems} />
              </>
            )}

            {dashboardView === "Comparison Mode" && (
              <ComparisonMode
                parsedFiles={parsedFiles}
                selectedSources={selectedSources}
              />
            )}
          </>
        )}

        {hasData && !loading && <DashboardFooter />}
      </main>
    </div>
  )
}

// ── Comparison Mode ────────────────────────────────────────────

function ComparisonMode({
  parsedFiles,
  selectedSources,
}: {
  parsedFiles: Map<string, ParsedSOA>
  selectedSources: string[]
}) {
  if (selectedSources.length < 2) {
    return (
      <div className="bg-rr-amber/10 border border-rr-amber/30 text-rr-dark text-sm rounded-lg px-4 py-3">
        Comparison Mode requires at least 2 uploaded files. Please upload more
        files or switch to Standard view.
      </div>
    )
  }

  const compareSources = selectedSources.slice(0, 4)

  // Build comparison table
  const comparisonRows = compareSources.map((fname) => {
    const data = parsedFiles.get(fname)!
    const g = data.grand_totals
    const m = data.metadata
    return {
      Source: fname,
      Customer: m.customer_name || "Unknown",
      "Total Charges": fmtCurrency(g.total_charges),
      "Total Credits": fmtCurrency(g.total_credits),
      "Net Balance": fmtCurrency(g.net_balance),
      "Total Overdue": fmtCurrency(g.total_overdue),
      Items: String(g.item_count),
      "Avg Days Late": m.avg_days_late ? String(m.avg_days_late) : "\u2014",
      "LPI Rate": m.lpi_rate ? `${(m.lpi_rate * 100).toFixed(2)}%` : "\u2014",
    }
  })

  const columns = [
    "Source",
    "Customer",
    "Total Charges",
    "Total Credits",
    "Net Balance",
    "Total Overdue",
    "Items",
    "Avg Days Late",
    "LPI Rate",
  ]

  return (
    <div className="space-y-5">
      <SectionHeader>Comparison Mode</SectionHeader>

      {/* Side by side KPI cards */}
      <div
        className={`grid gap-4`}
        style={{
          gridTemplateColumns: `repeat(${compareSources.length}, 1fr)`,
        }}
      >
        {compareSources.map((fname) => {
          const data = parsedFiles.get(fname)!
          const m = data.metadata
          const g = data.grand_totals

          return (
            <div
              key={fname}
              className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-3"
            >
              <div className="text-center pb-3 border-b border-border">
                <div className="font-extrabold text-rr-dark text-sm">
                  {m.customer_name || "Unknown"}
                </div>
                <div className="text-[0.65rem] text-muted-foreground mt-0.5">
                  ID: {m.customer_id || "\u2014"}
                  {m.report_date &&
                    ` \u2022 ${m.report_date.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}`}
                </div>
                <div className="text-[0.6rem] text-muted-foreground/60 mt-0.5 truncate">
                  {fname}
                </div>
              </div>
              <MetricRow
                label="Total Charges"
                value={fmtCurrency(g.total_charges, true)}
              />
              <MetricRow
                label="Total Credits"
                value={fmtCurrency(g.total_credits, true)}
                colorClass="text-rr-green"
              />
              <MetricRow
                label="Net Balance"
                value={fmtCurrency(g.net_balance, true)}
                colorClass={
                  g.net_balance > 0 ? "text-rr-red" : "text-rr-green"
                }
              />
            </div>
          )
        })}
      </div>

      {/* Comparison table */}
      <SectionHeader>Key Metrics Comparison</SectionHeader>
      <DataTable columns={columns} rows={comparisonRows} />
    </div>
  )
}

function MetricRow({
  label,
  value,
  colorClass = "text-rr-dark",
}: {
  label: string
  value: string
  colorClass?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={`text-sm font-extrabold ${colorClass}`}>{value}</span>
    </div>
  )
}
