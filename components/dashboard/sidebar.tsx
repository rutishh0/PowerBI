"use client"

import { FileUpload } from "./file-upload"
import { Settings, ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import type { SOARecord, SOAMetadata } from "@/lib/soa-parser"

interface SidebarProps {
  onFilesLoaded: (files: { name: string; buffer: ArrayBuffer }[]) => void
  loadedFiles: string[]
  onRemoveFile: (name: string) => void
  dashboardView: string
  onDashboardViewChange: (view: string) => void
  showCredits: boolean
  onShowCreditsChange: (show: boolean) => void
  // Global filters
  allItems: SOARecord[]
  allMetadata: SOAMetadata[]
  globalFilters: {
    sections: Set<string>
    types: Set<string>
    statuses: Set<string>
    currencies: Set<string>
  }
  onGlobalFiltersChange: (filters: {
    sections: Set<string>
    types: Set<string>
    statuses: Set<string>
    currencies: Set<string>
  }) => void
}

export function Sidebar({
  onFilesLoaded,
  loadedFiles,
  onRemoveFile,
  dashboardView,
  onDashboardViewChange,
  showCredits,
  onShowCreditsChange,
  allItems,
  globalFilters,
  onGlobalFiltersChange,
}: SidebarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  const allSections = Array.from(new Set(allItems.map((r) => r.Section))).sort()
  const allTypes = Array.from(new Set(allItems.map((r) => r["Entry Type"]))).sort()
  const allStatuses = Array.from(
    new Set(allItems.map((r) => r.Status).filter(Boolean) as string[])
  ).sort()
  const allCurrencies = Array.from(
    new Set(allItems.map((r) => r.Currency).filter(Boolean) as string[])
  ).sort()

  function toggleFilter(
    key: "sections" | "types" | "statuses" | "currencies",
    val: string
  ) {
    const next = new Set(globalFilters[key])
    if (next.has(val)) next.delete(val)
    else next.add(val)
    onGlobalFiltersChange({ ...globalFilters, [key]: next })
  }

  return (
    <aside className="w-64 bg-sidebar shrink-0 flex flex-col h-screen sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="text-center py-5 border-b border-sidebar-border">
        <div className="inline-block text-sidebar-primary-foreground text-sm font-bold tracking-[3px] uppercase border-2 border-rr-silver/40 px-4 py-1.5 rounded">
          ROLLS-ROYCE
        </div>
        <div className="text-rr-silver/60 text-[0.6rem] mt-1 tracking-[2px] uppercase">
          Civil Aerospace
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5">
        {/* File Upload */}
        <FileUpload
          onFilesLoaded={onFilesLoaded}
          loadedFiles={loadedFiles}
          onRemoveFile={onRemoveFile}
        />

        {/* Settings */}
        <div className="border-t border-sidebar-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="h-3.5 w-3.5 text-rr-silver/60" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
              Dashboard Settings
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[0.65rem] font-medium text-sidebar-foreground/60 mb-1">
                Dashboard View
              </label>
              <select
                value={dashboardView}
                onChange={(e) => onDashboardViewChange(e.target.value)}
                className="w-full bg-sidebar-accent text-sidebar-foreground text-xs rounded-md px-2.5 py-1.5 border border-sidebar-border focus:outline-none focus:ring-1 focus:ring-rr-navy"
              >
                <option value="Standard">Standard</option>
                <option value="Executive Summary">Executive Summary</option>
                <option value="Comparison Mode">Comparison Mode</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showCredits}
                onChange={(e) => onShowCreditsChange(e.target.checked)}
                className="accent-rr-navy h-3.5 w-3.5"
              />
              <span className="text-xs text-sidebar-foreground/80">
                Show credits in line tables
              </span>
            </label>
          </div>
        </div>

        {/* Global Filters */}
        {allItems.length > 0 && (
          <div className="border-t border-sidebar-border pt-4">
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="flex items-center gap-2 w-full text-left"
            >
              {filtersOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-rr-silver/60" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-rr-silver/60" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                Global Filters
              </span>
            </button>

            {filtersOpen && (
              <div className="mt-3 space-y-3">
                {/* Section filter */}
                {allSections.length > 0 && (
                  <div>
                    <label className="block text-[0.65rem] font-medium text-sidebar-foreground/60 mb-1">
                      Section
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {allSections.map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleFilter("sections", s)}
                          className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium transition-colors ${
                            globalFilters.sections.has(s)
                              ? "bg-rr-navy text-card"
                              : "bg-sidebar-accent text-sidebar-foreground/50"
                          }`}
                        >
                          {s.length > 12 ? s.slice(0, 10) + "..." : s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Type filter */}
                {allTypes.length > 0 && (
                  <div>
                    <label className="block text-[0.65rem] font-medium text-sidebar-foreground/60 mb-1">
                      Type
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {allTypes.map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleFilter("types", t)}
                          className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium transition-colors ${
                            globalFilters.types.has(t)
                              ? "bg-rr-navy text-card"
                              : "bg-sidebar-accent text-sidebar-foreground/50"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status filter */}
                {allStatuses.length > 0 && (
                  <div>
                    <label className="block text-[0.65rem] font-medium text-sidebar-foreground/60 mb-1">
                      Status
                    </label>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {allStatuses.slice(0, 12).map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleFilter("statuses", s)}
                          className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium transition-colors ${
                            globalFilters.statuses.has(s)
                              ? "bg-rr-navy text-card"
                              : "bg-sidebar-accent text-sidebar-foreground/50"
                          }`}
                        >
                          {s.length > 15 ? s.slice(0, 13) + "..." : s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Currency filter */}
                {allCurrencies.length > 0 && (
                  <div>
                    <label className="block text-[0.65rem] font-medium text-sidebar-foreground/60 mb-1">
                      Currency
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {allCurrencies.map((c) => (
                        <button
                          key={c}
                          onClick={() => toggleFilter("currencies", c)}
                          className={`px-1.5 py-0.5 rounded text-[0.6rem] font-medium transition-colors ${
                            globalFilters.currencies.has(c)
                              ? "bg-rr-navy text-card"
                              : "bg-sidebar-accent text-sidebar-foreground/50"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
