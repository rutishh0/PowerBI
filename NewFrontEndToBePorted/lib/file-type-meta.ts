import type { FileType } from "./types"

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  SOA: "Statement of Account",
  INVOICE_LIST: "Invoice List",
  OPPORTUNITY_TRACKER: "MEA Opportunity Tracker",
  GLOBAL_HOPPER: "Global Commercial Optimisation Hopper",
  SHOP_VISIT_HISTORY: "Shop Visit History",
  SVRG_MASTER: "SVRG Master",
  COMMERCIAL_PLAN: "Commercial Plan",
  EMPLOYEE_WHEREABOUTS: "Employee Whereabouts",
  UNKNOWN: "Unknown Workbook",
  ERROR: "Parse Error",
}

export const FILE_TYPE_BADGES: Record<FileType, string> = {
  SOA: "SOA",
  INVOICE_LIST: "EPI",
  OPPORTUNITY_TRACKER: "OPP TRACKER",
  GLOBAL_HOPPER: "GLOBAL HOPPER",
  SHOP_VISIT_HISTORY: "SHOP VISIT",
  SVRG_MASTER: "SVRG",
  COMMERCIAL_PLAN: "COMM PLAN",
  EMPLOYEE_WHEREABOUTS: "WHEREABOUTS",
  UNKNOWN: "UNKNOWN",
  ERROR: "ERROR",
}

/** CSS var colors per file type for file-chip dots and badges */
export const FILE_TYPE_DOT: Record<FileType, string> = {
  SOA: "bg-chart-1",
  INVOICE_LIST: "bg-chart-5",
  OPPORTUNITY_TRACKER: "bg-chart-2",
  GLOBAL_HOPPER: "bg-success",
  SHOP_VISIT_HISTORY: "bg-chart-6",
  SVRG_MASTER: "bg-chart-3",
  COMMERCIAL_PLAN: "bg-chart-4",
  EMPLOYEE_WHEREABOUTS: "bg-chart-2",
  UNKNOWN: "bg-muted-foreground",
  ERROR: "bg-destructive",
}
