"use client"

import { useMemo, useState } from "react"
import { FileSpreadsheet, Search } from "lucide-react"
import type { UploadedFile, FileType } from "@/lib/types"
import { FILE_TYPE_LABELS, FILE_TYPE_BADGES, FILE_TYPE_DOT } from "@/lib/file-type-meta"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"

const TYPE_FILTERS: { id: FileType | "ALL"; label: string }[] = [
  { id: "ALL", label: "All files" },
  { id: "SOA", label: "SOA" },
  { id: "INVOICE_LIST", label: "Invoices" },
  { id: "OPPORTUNITY_TRACKER", label: "Opportunity" },
  { id: "GLOBAL_HOPPER", label: "Hopper" },
  { id: "SHOP_VISIT_HISTORY", label: "Shop visits" },
  { id: "SVRG_MASTER", label: "SVRG" },
  { id: "COMMERCIAL_PLAN", label: "Comm plan" },
  { id: "EMPLOYEE_WHEREABOUTS", label: "Whereabouts" },
]

function summaryFor(f: UploadedFile): string {
  const p: any = f.parsed
  switch (f.file_type) {
    case "SOA": {
      const sections = p.sections?.length ?? 0
      const items = (p.sections ?? []).reduce(
        (s: number, sec: any) => s + (sec.items?.length ?? 0),
        0,
      )
      return `${sections} sections · ${items} items`
    }
    case "INVOICE_LIST": {
      return `${p.totals?.item_count ?? 0} invoices · ${(p.metadata?.currencies ?? []).join(", ") || "—"}`
    }
    case "OPPORTUNITY_TRACKER": {
      return `${p.summary?.total_opportunities ?? 0} opportunities`
    }
    case "GLOBAL_HOPPER": {
      return `${p.opportunities?.length ?? 0} opportunities · ${(p.summary?.unique_regions ?? []).length} regions`
    }
    case "SHOP_VISIT_HISTORY": {
      return `${p.statistics?.total_shop_visits ?? 0} shop visits · ${p.statistics?.total_engines_tracked ?? 0} engines`
    }
    case "SVRG_MASTER": {
      return `${p.claims_summary?.total_claims ?? 0} claims · ${p.event_entries?.total_events ?? 0} events`
    }
    case "COMMERCIAL_PLAN": {
      return `${p.one_year_plan?.items?.length ?? 0} 1YP actions · ${
        p.five_year_spe_sales?.items?.length ?? 0
      } SPE opps`
    }
    case "EMPLOYEE_WHEREABOUTS": {
      return `${p.metadata?.total_employees ?? 0} employees · ${
        (p.metadata?.unique_countries ?? []).length
      } countries`
    }
    default:
      return "Workbook parsed by the Finance Data Visualizer."
  }
}

interface FilesViewProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
}

export function FilesView({ files, activeFile, onSelectFile }: FilesViewProps) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<FileType | "ALL">("ALL")

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return files.filter((f) => {
      if (filter !== "ALL" && f.file_type !== filter) return false
      if (!needle) return true
      return (
        f.name.toLowerCase().includes(needle) ||
        FILE_TYPE_LABELS[f.file_type].toLowerCase().includes(needle)
      )
    })
  }, [files, q, filter])

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
            Document catalogue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-xl text-pretty">
            All uploaded workbooks parsed in this session. Click a file to open the
            matching visualizer; use search or the type filter to narrow the list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InputGroup className="w-full lg:w-72">
            <InputGroupAddon>
              <Search className="h-4 w-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search filename or type"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </InputGroup>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files uploaded yet</EmptyTitle>
            <EmptyDescription>
              Drop a workbook into the sidebar uploader to parse it. The catalogue will
              populate as you upload more files in this session.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files match</EmptyTitle>
            <EmptyDescription>
              Try a different search term or switch the type filter back to &quot;All files&quot;.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => { setQ(""); setFilter("ALL") }}>
              Clear filters
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const isActive = activeFile === f.name
            return (
              <Card
                key={f.name}
                onClick={() => onSelectFile(f.name)}
                className={`p-5 transition shadow-sm cursor-pointer ${
                  isActive
                    ? "border-primary ring-1 ring-primary/40"
                    : "border-border hover:border-ring"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-muted/50 shrink-0 relative">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                    <span
                      className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-card ${FILE_TYPE_DOT[f.file_type]}`}
                      aria-hidden="true"
                    />
                  </div>
                  <Badge variant="outline" className="text-[10px] tracking-wider uppercase font-semibold">
                    {FILE_TYPE_BADGES[f.file_type]}
                  </Badge>
                </div>

                <h3 className="mt-4 font-medium text-sm text-foreground break-words leading-snug">
                  {f.name}
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed text-pretty">
                  {summaryFor(f)}
                </p>

                <div className="mt-4 text-[11px] text-muted-foreground uppercase tracking-wider">
                  {FILE_TYPE_LABELS[f.file_type]}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
