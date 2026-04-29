"use client"

import type { UploadedFile } from "@/lib/types"
import { SoaVisualizer } from "./soa-visualizer"
import { InvoiceListVisualizer } from "./invoice-list-visualizer"
import { OppTrackerVisualizer } from "./opp-tracker-visualizer"
import { GlobalHopperVisualizer } from "./global-hopper-visualizer"
import { ShopVisitVisualizer } from "./shop-visit-visualizer"
import { SvrgVisualizer } from "./svrg-visualizer"
import { CommercialPlanVisualizer } from "./commercial-plan-visualizer"
import { EmployeeWhereaboutsVisualizer } from "./employee-whereabouts-visualizer"

interface FileVisualizerProps {
  file: UploadedFile
  mode?: "standard" | "executive"
}

export function FileVisualizer({ file, mode = "standard" }: FileVisualizerProps) {
  switch (file.file_type) {
    case "SOA":
      return <SoaVisualizer data={file.parsed as any} filename={file.name} mode={mode} />
    case "INVOICE_LIST":
      return <InvoiceListVisualizer data={file.parsed as any} filename={file.name} />
    case "OPPORTUNITY_TRACKER":
      return <OppTrackerVisualizer data={file.parsed as any} filename={file.name} />
    case "GLOBAL_HOPPER":
      return <GlobalHopperVisualizer data={file.parsed as any} filename={file.name} />
    case "SHOP_VISIT_HISTORY":
      return <ShopVisitVisualizer data={file.parsed as any} filename={file.name} />
    case "SVRG_MASTER":
      return <SvrgVisualizer data={file.parsed as any} filename={file.name} />
    case "COMMERCIAL_PLAN":
      return (
        <CommercialPlanVisualizer
          data={file.parsed as any}
          filename={file.name}
          mode={mode}
        />
      )
    case "EMPLOYEE_WHEREABOUTS":
      return (
        <EmployeeWhereaboutsVisualizer
          data={file.parsed as any}
          filename={file.name}
          mode={mode}
        />
      )
    default:
      return (
        <div className="p-12 text-center text-muted-foreground">
          Unknown file type: {file.file_type}
        </div>
      )
  }
}
