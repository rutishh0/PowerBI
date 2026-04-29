/**
 * Type definitions mirroring the V6 universal parser output contracts.
 * See V6_SPEC.md §6 for the authoritative shapes.
 */

export type FileType =
  | "SOA"
  | "INVOICE_LIST"
  | "OPPORTUNITY_TRACKER"
  | "GLOBAL_HOPPER"
  | "SHOP_VISIT_HISTORY"
  | "SVRG_MASTER"
  | "COMMERCIAL_PLAN"
  | "EMPLOYEE_WHEREABOUTS"
  | "UNKNOWN"
  | "ERROR"

export type ViewMode = "standard" | "executive" | "slides" | "compare" | "files" | "ai"

/* ---------- SOA ---------- */
export interface SOASectionItem {
  company_code?: string | null
  account?: string | null
  reference?: string | null
  doc_date?: string | null
  due_date?: string | null
  amount?: number | null
  currency?: string | null
  text?: string | null
  assignment?: string | null
  rr_comments?: string | null
  action_owner?: string | null
  days_late?: number | null
  customer_comments?: string | null
  po_reference?: string | null
  lpi_cumulated?: number | null
}

export interface SOASection {
  name: string
  section_type: "charges" | "credits" | "totalcare" | "spare_parts" | "lpi" | "crc"
  total: number
  overdue: number
  available_credit?: number | null
  items: SOASectionItem[]
}

export interface SOAData {
  file_type: "SOA"
  metadata: {
    title?: string
    customer_name?: string | null
    customer_number?: string | null
    contact_email?: string | null
    lpi_rate?: number | null
    report_date?: string | null
    avg_days_late?: number | null
    source_file?: string
    source_sheet?: string
  }
  sections: SOASection[]
  grand_totals: {
    total_overdue: number
    total_credits: number
    net_balance: number
  }
  aging_buckets: {
    current: number
    "1_30_days": number
    "31_60_days": number
    "61_90_days": number
    "91_180_days": number
    over_180_days: number
  }
  summary_sheet?: Record<string, number>
  all_sheets?: string[]
  errors?: string[]
}

/* ---------- Invoice List ---------- */
export interface InvoiceItem {
  reference: string
  doc_date?: string | null
  due_date?: string | null
  currency: string
  amount: number
  reference_key3?: string | null
  text?: string | null
  assignment?: string | null
}

export interface InvoiceListData {
  file_type: "INVOICE_LIST"
  metadata: {
    source_file: string
    source_sheet: string
    total_items: number
    currencies: string[]
  }
  items: InvoiceItem[]
  totals: {
    total_amount: number
    total_positive: number
    total_negative: number
    item_count: number
  }
  errors?: string[]
}

/* ---------- Opportunity Tracker ---------- */
export interface OppRecord {
  number: number
  project: string
  programme: string
  customer: string
  region?: string
  asks: string
  opportunity_type: string
  priority: 1 | 2 | 3
  ext_probability: "High" | "Med" | "Low"
  int_complexity: "High" | "Med" | "Low"
  status: "Hopper" | "ICT" | "Negotiations" | "Contracting" | "Completed" | "Cancelled"
  evaluation_level: string
  term_benefit: number
  benefit_2026: number
  benefit_2027: number
  sum_26_27: number
}

export interface OppTrackerData {
  file_type: "OPPORTUNITY_TRACKER"
  metadata: {
    source_file: string
    away_day_date?: string | null
    report_title: string
    sheets_parsed: string[]
    all_sheets: string[]
    estimation_levels: Record<string, "Hopper" | "ICT" | "Contract">
  }
  opportunities_by_level: {
    Hopper: { sheet_name: string; records: OppRecord[] }
    ICT: { sheet_name: string; records: OppRecord[] }
    Contract: { sheet_name: string; records: OppRecord[] }
  }
  summary: {
    total_opportunities: number
    by_status: Record<string, number>
    by_programme: Record<string, number>
    by_customer: Record<string, number>
    by_opportunity_type: Record<string, number>
    total_term_benefit: number
  }
  opps_and_threats: {
    items: {
      project: string
      customer: string
      opportunity: string
      status: string
      owner: string
      pack_improvement?: string
      due_date?: string
    }[]
  }
  timeline: {
    milestones: {
      project: string
      customer: string
      milestones: Record<string, string | null>
      current_phase: string
    }[]
  }
  project_summary: {
    projects: {
      group: string
      project: string
      customer: string
      programme: string
      crp_margin: number
      crp_pct: number
      onerous: string
    }[]
  }
  cover?: { title?: string; subtitle?: string }
}

/* ---------- Global Hopper ---------- */
export interface HopperOpp {
  region: string
  customer: string
  engine_value_stream: string
  top_level_evs: string
  vp_owner: string
  restructure_type: string
  maturity: "Mature" | "Immature"
  onerous_type: "Onerous Contract" | "Not Onerous"
  initiative: string
  status: string
  expected_year: number | null
  signature_ap: string
  crp_term_benefit: number
  profit_2026: number
  profit_2027: number
  profit_2028: number
  profit_2029: number
  profit_2030: number
}

export interface HopperSummary {
  total_opportunities: number
  by_region: Record<string, number>
  by_region_value: Record<string, number>
  by_status: Record<string, number>
  by_status_value: Record<string, number>
  by_restructure_type: Record<string, number>
  by_restructure_type_value: Record<string, number>
  by_maturity: Record<string, number>
  by_evs: Record<string, number>
  by_customer: Record<string, number>
  by_customer_value: Record<string, number>
  by_onerous: Record<string, number>
  pipeline_stages: { stage: string; count: number; value: number }[]
  total_crp_term_benefit: number
  total_profit_2026: number
  total_profit_2027: number
  total_profit_2028: number
  total_profit_2029: number
  total_profit_2030: number
  unique_regions: string[]
  unique_evs: string[]
  unique_statuses: string[]
  unique_restructure_types: string[]
  unique_maturities: string[]
  unique_customers: string[]
}

export interface GlobalHopperData {
  file_type: "GLOBAL_HOPPER"
  metadata: {
    source_file: string
    title: string
    currency: "GBP"
    total_opportunities: number
    regions: string[]
  }
  opportunities: HopperOpp[]
  summary: HopperSummary
}

/* ---------- Shop Visit ---------- */
export interface ShopVisit {
  part_number: string
  serial_number: string
  event_datetime: string
  operator: string
  registration?: string
  action_code: string
  rework_level: string
  sv_type: string
  sv_location: string
  hsn?: number
  csn?: number
}

export interface ShopVisitData {
  file_type: "SHOP_VISIT_HISTORY"
  metadata: {
    source_file: string
    engine_models: string[]
    total_engines: number
    operators: string[]
  }
  shop_visits: ShopVisit[]
  maintenance_actions: ShopVisit[]
  current_status: ShopVisit[]
  statistics: {
    total_shop_visits: number
    total_maintenance: number
    total_engines_tracked: number
    sv_types: Record<string, number>
    sv_locations: Record<string, number>
  }
}

/* ---------- SVRG Master ---------- */
export interface SVRGClaim {
  date: string
  year: number
  credit_ref: string
  guarantee: string
  credit_value: number
  cumulative_value: number
}

export interface SVRGEvent {
  event_type: string
  date: string
  engine_serial: string
  aircraft: string
  description: string
  qualification: "Qualified" | "Non-Qualified" | "Pending"
  guarantee_coverage: "SVRG" | "eSVRG" | "None"
}

export interface SVRGData {
  file_type: "SVRG_MASTER"
  metadata: {
    source_file: string
    customer: string
    engine_model: string
  }
  claims_summary: {
    claims: SVRGClaim[]
    total_claims: number
    total_credit_value: number
  }
  event_entries: {
    events: SVRGEvent[]
    total_events: number
    qualifications: Record<string, number>
    guarantee_types: Record<string, number>
  }
  available_sheets: Record<string, { row_count: number; col_count: number }>
}

/* ---------- Commercial Plan (e.g. 2026_PLAN.xlsx) ---------- */
/* Shape mirrors V7 parser._parse_commercial_plan (parser.py §3498).
 * Three logical sheets: 1YP (action log), 5YP SPE SALES (pipeline),
 * SPE SALES PER YEAR (yearly rollup). */

export interface CpOneYearItem {
  blue_chip?: string | null
  customer?: string | null
  issue?: string | null
  description?: string | null
  owner?: string | null
  latest_update?: string | null
  /** category → status string (typically "L1".."L4") */
  categories?: Record<string, string | null>
  /** ISO date → status code per week column */
  weekly_status?: Record<string, string | null>
}

export interface CpFiveYearItem {
  customer?: string | null
  year?: number | null
  engine_type?: string | null
  count?: number | null
  amount?: number | null
  // Source workbooks vary; keep open for unknown fields.
  [extra: string]: unknown
}

export interface CpAnnualYearBlock {
  grand_total?: number | null
  customers?: {
    name: string
    total: number
    engines?: { type: string; count: number }[]
  }[]
}

export interface CommercialPlanData {
  file_type: "COMMERCIAL_PLAN"
  metadata: {
    source_file: string
    sheets_parsed: string[]
    sheets_ignored?: string[]
    plan_year: number | null
  }
  one_year_plan: {
    week_columns: string[]
    category_columns: string[]
    items: CpOneYearItem[]
  }
  five_year_spe_sales: {
    items: CpFiveYearItem[]
    totals: {
      by_year?: Record<string, number>
      by_engine?: Record<string, number>
      by_customer?: Record<string, number>
      total_opportunities?: number
      total_amount?: number
    }
  }
  annual_summary: {
    by_year: Record<string, CpAnnualYearBlock>
  }
  errors?: string[]
}

/* ---------- Employee Whereabouts ---------- */
/* Mirrors V7 parser branch (parser.py §4170). The data is stored as
 * a per-month sheet of per-employee day-by-day status codes — see
 * V6/static/js/dashboard.js _renderEmployeeWhereabouts for the
 * canonical event-log derivation. */

export interface EwEmployee {
  employee_number: string
  name?: string | null
  business_sector?: string | null
  country?: string | null
}

export interface EwSheetRecord {
  employee_number: string
  name?: string | null
  country?: string | null
  /** ISO date → raw status code (e.g. "O", "WFH", "Eid Holiday") */
  daily_status: Record<string, string | null>
  /** raw status code → count for this employee/month */
  status_counts: Record<string, number>
}

export interface EwMonthMeta {
  sheet_name: string
  year: number
  month: number
  start_date?: string
  end_date?: string
}

export interface EmployeeWhereaboutsData {
  file_type: "EMPLOYEE_WHEREABOUTS"
  metadata: {
    source_file: string
    sheets_parsed: string[]
    sheets_ignored?: string[]
    months: EwMonthMeta[]
    total_employees: number
    unique_countries: string[]
    unique_sectors: string[]
  }
  employees: EwEmployee[]
  /** keyed by sheet name (e.g. "Apr 2026 ") — note trailing whitespace seen in source */
  whereabouts: Record<string, EwSheetRecord[]>
  /** raw code → human-readable label */
  legend: Record<string, string>
  aggregates: {
    by_country?: Record<string, number>
    by_sector?: Record<string, number>
    daily_office_count_by_month?: Record<string, Record<string, number>>
    status_totals_by_month?: Record<string, Record<string, number>>
  }
  errors?: string[]
}

/* ---------- Union ---------- */
export type ParsedFile =
  | SOAData
  | InvoiceListData
  | OppTrackerData
  | GlobalHopperData
  | ShopVisitData
  | SVRGData
  | CommercialPlanData
  | EmployeeWhereaboutsData

export interface UploadedFile {
  name: string
  file_type: FileType
  parsed: ParsedFile
}
