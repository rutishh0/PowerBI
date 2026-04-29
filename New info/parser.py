"""
parser.py — Universal Rolls-Royce Excel Parser
================================================
Handles all known RR Civil Aerospace file formats:
  • SOA  (Statement of Account)          — multi-section, heuristic layout
  • INVOICE_LIST                          — flat open-items register (EPI style)
  • OPPORTUNITY_TRACKER (MEA Tracker)    — wide opportunity log (L2/L3 sheets)
  • SHOP_VISIT_HISTORY                   — Trent shop visit event history
  • SVRG_MASTER                          — Trent 900 guarantee administration

Design principles
-----------------
  1. NEVER crash — every path ends in a valid dict with an "errors" key.
  2. NEVER hard-code column positions; use dynamic header discovery.
  3. NEVER trust data types — dates can be datetime | str | float | None.
  4. Detect file type by scoring sheet names + cell content.
  5. Return a canonical JSON-serialisable dict for every file type.

Usage
-----
    from parser import parse_file

    # From a file path:
    result = parse_file("/path/to/file.xlsx")

    # From a base64-encoded string (browser upload):
    result = parse_file(base64_string, filename="ETH SOA.xlsx", is_base64=True)
"""

from __future__ import annotations

import base64
import io
import logging
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Union

import pandas as pd

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════════
# Primitive helpers
# ══════════════════════════════════════════════════════════════════════════════

_DATE_FMTS = [
    "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y",
    "%Y/%m/%d", "%d.%m.%Y", "%m.%d.%Y",
    "%d/%m/%y", "%m/%d/%y",
]


def _clean(v: Any) -> str:
    """Return stripped string; '' when None/NaN."""
    if v is None:
        return ""
    if isinstance(v, float) and (v != v):          # NaN fast-path
        return ""
    return str(v).strip()


def _is_blank(v: Any) -> bool:
    return v is None or (isinstance(v, float) and (v != v)) or _clean(v) == ""


def _to_date(v: Any) -> Optional[str]:
    """Convert any date-like value → ISO 'YYYY-MM-DD' string, or None."""
    if _is_blank(v):
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = _clean(v)
    if not s or s.lower() in ("nat", "none", "nan"):
        return None
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    try:
        return pd.to_datetime(s, dayfirst=True).strftime("%Y-%m-%d")
    except Exception:
        return s                                     # return as-is if unparseable


def _to_float(v: Any) -> Optional[float]:
    """Convert any currency-like value → float, or None."""
    if _is_blank(v):
        return None
    if isinstance(v, (int, float)):
        if v != v:                                   # NaN
            return None
        return float(v)
    s = _clean(v).replace("$", "").replace(",", "").replace(" ", "")
    # parentheses → negative  e.g. (1,234.56) → -1234.56
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    if s in ("-", "", "n/a", "N/A", "#N/A", "#VALUE!"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _to_str_ref(v: Any) -> Optional[str]:
    """Normalise reference numbers to strings (strip .0 suffix from floats)."""
    if _is_blank(v):
        return None
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return _clean(v) or None


def _row_values(row: pd.Series) -> List[Any]:
    return list(row)


def _non_blank_vals(row: pd.Series) -> List[str]:
    return [_clean(v) for v in row if not _is_blank(v)]


# ══════════════════════════════════════════════════════════════════════════════
# Excel loader — accepts path, BytesIO, or base64 string
# ══════════════════════════════════════════════════════════════════════════════

def _load_workbook(source: Union[str, bytes, io.BytesIO], filename: str = "") -> Optional[Dict[str, pd.DataFrame]]:
    """
    Load every sheet of an Excel workbook into a {name: DataFrame} dict.
    DataFrames have no header applied (header=None); raw rows preserved.
    Returns None on failure (error logged).
    """
    try:
        if isinstance(source, str) and not source.endswith((".xlsx", ".xls", ".xlsb", ".xlsm")):
            # Assume base64
            raw = base64.b64decode(source)
            buf = io.BytesIO(raw)
        elif isinstance(source, (bytes, bytearray)):
            buf = io.BytesIO(source)
        elif isinstance(source, io.BytesIO):
            buf = source
        else:
            buf = source                             # file path string

        xl = pd.ExcelFile(buf)
        sheets: Dict[str, pd.DataFrame] = {}
        for name in xl.sheet_names:
            try:
                df = xl.parse(name, header=None, dtype=object)
                sheets[name] = df
            except Exception as e:
                logger.warning("Skipped sheet '%s': %s", name, e)
        return sheets if sheets else None
    except Exception as e:
        logger.error("Failed to load workbook: %s", e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# File-type detection
# ══════════════════════════════════════════════════════════════════════════════

_TYPE_SIGNALS: Dict[str, List[str]] = {
    "SOA": [
        "statement of account", "lpi rate", "lpi rate >",
        "customer name:", "totalcare charges", "customer responsible charges",
        "spare parts charges", "late payment interest", "credits usable",
        "total overdue",
    ],
    "INVOICE_LIST": [
        "reference key 3", "amount in doc. curr.", "net due date", "document date",
        "document currency",
    ],
    "OPPORTUNITY_TRACKER": [
        "opp log sheet", "type of opportunity", "external probability",
        "internal complexity", "evaluation level", "term benefit", "away day date",
        "ict estimates", "commercial optimisation", "profit opportunities tracker",
        "account management evaluations", "cash reciepts", "in year profit",
        "existing deal", "new deal", "resource prioritization",
        "contracting actuals", "financial criteria",
    ],
    "SHOP_VISIT": [
        "event item part number", "event item serial number", "action code",
        "rework level", "service event number", "shopvisit_type", "shopvisit_location",
    ],
    "SVRG_MASTER": [
        "trent 900 guarantee", "trent 900 guarantee administration",
        "claims summary", "event entry", "hptb", "svrg", "esvrg",
        "enhanced guarantees",
    ],
}

# Hard boosts keyed on lower-case sheet names
_SHEET_NAME_BOOSTS: Dict[str, str] = {
    "soa": "SOA", "soa summary": "SOA", "soa 26.1": "SOA",
    "l2": "OPPORTUNITY_TRACKER", "l3": "OPPORTUNITY_TRACKER",
    "mea log": "OPPORTUNITY_TRACKER", "opps and threats": "OPPORTUNITY_TRACKER",
    "date input": "OPPORTUNITY_TRACKER", "count": "OPPORTUNITY_TRACKER",
    "sum": "OPPORTUNITY_TRACKER", "timeline": "OPPORTUNITY_TRACKER",
    "input": "OPPORTUNITY_TRACKER", "cover": "OPPORTUNITY_TRACKER",
    "menu": "SVRG_MASTER", "claims summary": "SVRG_MASTER", "event entry": "SVRG_MASTER",
    "glossary_2": "SHOP_VISIT",
}

_SHEET_PREFIX_BOOSTS: Dict[str, str] = {
    "report page": "SHOP_VISIT",
    "soa ": "SOA",
}


def detect_file_type(all_sheets: Dict[str, pd.DataFrame]) -> str:
    scores: Dict[str, int] = {k: 0 for k in _TYPE_SIGNALS}

    for sheet_name, df in all_sheets.items():
        sn_lower = sheet_name.lower().strip()

        # Sheet-name hard boosts
        if sn_lower in _SHEET_NAME_BOOSTS:
            scores[_SHEET_NAME_BOOSTS[sn_lower]] += 8
        for prefix, ftype in _SHEET_PREFIX_BOOSTS.items():
            if sn_lower.startswith(prefix):
                scores[ftype] += 8

        # Content signal scan (only first 25 rows to keep it fast)
        try:
            sample = df.head(25)
            text_blob = " ".join(
                _clean(v).lower()
                for row in sample.values
                for v in row
                if not _is_blank(v)
            )
            for ftype, signals in _TYPE_SIGNALS.items():
                for sig in signals:
                    if sig in text_blob:
                        scores[ftype] += 1
        except Exception:
            pass

    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "UNKNOWN"


# ══════════════════════════════════════════════════════════════════════════════
# SOA Parser
# ══════════════════════════════════════════════════════════════════════════════

_SOA_SECTION_KW = [
    "credits usable",
    "totalcare charges",
    "totalcare",
    "customer responsible charges",
    "spare parts charges",
    "late payment interest",
    "other charges",
    "other credits",
]

_SOA_SUMMARY_KW = ["total", "overdue", "available credit"]

_SOA_COL_ALIASES: Dict[str, List[str]] = {
    "company_code":        ["company code", "co code", "company"],
    "account":             ["account"],
    "reference":           ["reference", "ref no", "doc no", "document no", "invoice no"],
    "doc_date":            ["document date", "doc date", "posting date", "inv date"],
    "due_date":            ["net due date", "due date", "payment date", "net due"],
    "amount":              ["amount in doc", "amount", "balance", "value"],
    "currency":            ["curr", "currency"],
    "text":                ["text", "description", "narrative", "detail"],
    "assignment":          ["assignment", "assign", "reference key 1", "ref key 1"],
    "rr_comments":         ["r-r comments", "rr comments", "rr note", "comments"],
    "action_owner":        ["action owner", "action", "awaiting approval", "owner"],
    "days_late":           ["days late", "days overdue", "overdue days"],
    "customer_comments":   ["eth comments", "customer comments", "airline comments",
                             "customer note"],
    "po_reference":        ["eth po reference", "eth po", "po reference", "po ref",
                             "purchase order", "po number"],
    "lpi_cumulated":       ["lpi cumulated", "lpi cum", "cumulated lpi"],
}

_SOA_POSITIONAL: Dict[str, int] = {
    "company_code": 0, "account": 1, "reference": 2, "doc_date": 3,
    "due_date": 4, "amount": 5, "currency": 6, "text": 7,
    "assignment": 8, "rr_comments": 9, "action_owner": 10,
    "days_late": 11, "customer_comments": 12, "po_reference": 13,
    "lpi_cumulated": 14,
}


def _map_soa_columns(header_row: pd.Series) -> Dict[str, int]:
    """
    Dynamically map field names to column indices.

    Uses a "first-claim-per-column" strategy: once a column is claimed by a
    field, no other field can steal it.  Fields are processed in dict-insertion
    order (most-specific first), so e.g. 'amount' claims column 5 before
    'currency' can incorrectly grab it via the substring "curr" in
    "Amount in doc. curr.".
    """
    claimed: Dict[int, str] = {}   # col_idx → field that owns it
    mapping: Dict[str, int] = {}

    for field, aliases in _SOA_COL_ALIASES.items():
        for i, val in enumerate(header_row):
            if _is_blank(val) or i in claimed or field in mapping:
                continue
            vl = _clean(val).lower()
            for alias in aliases:
                if alias in vl:
                    mapping[field] = i
                    claimed[i] = field
                    break

    # Fill any missing fields with positional defaults
    for field, idx in _SOA_POSITIONAL.items():
        if field not in mapping:
            mapping[field] = idx
    return mapping


def _get_col(row: pd.Series, col_map: Dict[str, int], field: str) -> Any:
    idx = col_map.get(field)
    if idx is None or idx >= len(row):
        return None
    return row.iloc[idx]


def _soa_is_section_header(row: pd.Series, col_map: Dict[str, int]) -> Optional[str]:
    """Return section label if row[0] is a known section keyword string."""
    v0 = row.iloc[0]
    if _is_blank(v0) or isinstance(v0, (int, float)):
        return None
    s = _clean(v0)
    s_lower = s.lower()
    for kw in _SOA_SECTION_KW:
        if kw in s_lower:
            return s
    return None


def _soa_is_summary_row(row: pd.Series, col_map: Dict[str, int]) -> Optional[tuple]:
    """
    Detect summary rows that have 'Total', 'Overdue', 'Available Credit' in
    the due_date column (or anywhere in the row).
    Returns (keyword, amount) or None.
    """
    due_val = _get_col(row, col_map, "due_date")
    if not _is_blank(due_val) and isinstance(due_val, str):
        keyword = _clean(due_val).lower()
        for kw in _SOA_SUMMARY_KW:
            if kw in keyword:
                amt = _to_float(_get_col(row, col_map, "amount"))
                return (keyword, amt)
    # Also scan all cells for "total overdue"
    for v in row:
        if not _is_blank(v) and isinstance(v, str):
            vl = _clean(v).lower()
            if "total overdue" in vl:
                # Find adjacent number
                for vv in row:
                    f = _to_float(vv)
                    if f is not None:
                        return ("total overdue", f)
    return None


def _soa_is_data_row(row: pd.Series, col_map: Dict[str, int]) -> bool:
    """Data rows have a numeric company_code OR a numeric reference + numeric amount."""
    v0 = _get_col(row, col_map, "company_code")
    if not _is_blank(v0):
        try:
            float(v0)
            amt = _to_float(_get_col(row, col_map, "amount"))
            if amt is not None:
                return True
        except (ValueError, TypeError):
            pass
    # Edge case: company_code blank but reference + amount present
    ref = _get_col(row, col_map, "reference")
    amt = _to_float(_get_col(row, col_map, "amount"))
    if not _is_blank(ref) and amt is not None:
        return True
    return False


def _soa_extract_item(row: pd.Series, col_map: Dict[str, int]) -> Dict:
    return {
        "company_code":      _to_str_ref(_get_col(row, col_map, "company_code")),
        "account":           _to_str_ref(_get_col(row, col_map, "account")),
        "reference":         _to_str_ref(_get_col(row, col_map, "reference")),
        "doc_date":          _to_date(_get_col(row, col_map, "doc_date")),
        "due_date":          _to_date(_get_col(row, col_map, "due_date")),
        "amount":            _to_float(_get_col(row, col_map, "amount")),
        "currency":          _clean(_get_col(row, col_map, "currency")) or "USD",
        "text":              _clean(_get_col(row, col_map, "text")) or None,
        "assignment":        _clean(_get_col(row, col_map, "assignment")) or None,
        "rr_comments":       _clean(_get_col(row, col_map, "rr_comments")) or None,
        "action_owner":      _clean(_get_col(row, col_map, "action_owner")) or None,
        "days_late":         _to_float(_get_col(row, col_map, "days_late")),
        "customer_comments": _clean(_get_col(row, col_map, "customer_comments")) or None,
        "po_reference":      _clean(_get_col(row, col_map, "po_reference")) or None,
        "lpi_cumulated":     _to_float(_get_col(row, col_map, "lpi_cumulated")),
    }


def _parse_soa(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    errors: List[str] = []

    # ── Pick primary data sheet ──────────────────────────────────────────────
    primary_df: Optional[pd.DataFrame] = None
    primary_sheet = ""

    preferred_order = [
        # prefer sheets with 'SoA' but not 'Summary'
        name for name in all_sheets
        if "soa" in name.lower() and "summary" not in name.lower()
    ]
    if not preferred_order:
        # fallback: largest sheet (most non-null cells)
        preferred_order = sorted(
            all_sheets.keys(),
            key=lambda n: all_sheets[n].notna().sum().sum(),
            reverse=True,
        )

    for name in preferred_order:
        df = all_sheets[name]
        text_blob = " ".join(
            _clean(v).lower() for row in df.head(20).values for v in row if not _is_blank(v)
        )
        if any(kw in text_blob for kw in ["customer name", "lpi rate", "totalcare", "amount in doc"]):
            primary_df = df
            primary_sheet = name
            break

    if primary_df is None:
        primary_sheet = preferred_order[0] if preferred_order else list(all_sheets.keys())[0]
        primary_df = all_sheets[primary_sheet]

    rows = [primary_df.iloc[i] for i in range(len(primary_df))]

    # ── Metadata scan (first 15 rows) ────────────────────────────────────────
    metadata: Dict[str, Any] = {
        "title": None,
        "customer_name": None,
        "customer_number": None,
        "contact_email": None,
        "lpi_rate": None,
        "report_date": None,
        "avg_days_late": None,
        "source_file": filename,
        "source_sheet": primary_sheet,
    }

    for row in rows[:15]:
        for j, val in enumerate(row):
            if _is_blank(val):
                continue
            s = _clean(val)
            sl = s.lower()

            def _look_right(start_j: int, row: pd.Series) -> Any:
                for k in range(start_j + 1, min(start_j + 6, len(row))):
                    v = row.iloc[k]
                    if not _is_blank(v):
                        return v
                return None

            if "statement of account" in sl:
                metadata["title"] = s
            elif "customer name" in sl and metadata["customer_name"] is None:
                v = _look_right(j, row)
                if v is not None:
                    metadata["customer_name"] = _clean(v)
            elif re.search(r"customer\s+n[oº°]", sl) and "name" not in sl:
                v = _look_right(j, row)
                if v is not None:
                    metadata["customer_number"] = _clean(v)
            elif "contact email" in sl:
                v = _look_right(j, row)
                if v is not None:
                    metadata["contact_email"] = _clean(v)
            elif "lpi rate" in sl:
                for k in range(j + 1, min(j + 6, len(row))):
                    f = _to_float(row.iloc[k])
                    if f is not None:
                        metadata["lpi_rate"] = f
                        break
            elif "today" in sl:
                for k in range(j + 1, min(j + 6, len(row))):
                    d = _to_date(row.iloc[k])
                    if d:
                        metadata["report_date"] = d
                        break
            elif "average days late" in sl or "avg days late" in sl:
                for k in range(j + 1, min(j + 6, len(row))):
                    f = _to_float(row.iloc[k])
                    if f is not None:
                        metadata["avg_days_late"] = round(f, 2)
                        break

    # ── Discover header row ──────────────────────────────────────────────────
    col_map: Dict[str, int] = dict(_SOA_POSITIONAL)   # start with positional
    header_row_idx: int = 6                            # safe default

    for i, row in enumerate(rows[:20]):
        match_count = sum(
            1 for v in row
            if not _is_blank(v) and any(
                kw in _clean(v).lower()
                for kw in ["reference", "amount", "document", "company code",
                           "days late", "assignment", "net due"]
            )
        )
        if match_count >= 3:
            header_row_idx = i
            col_map = _map_soa_columns(row)
            break

    # ── Section + line-item parsing ──────────────────────────────────────────
    sections: List[Dict] = []
    current_section: Optional[Dict] = None
    grand_totals: Dict[str, Optional[float]] = {
        "total_overdue": None,
        "total_credits": None,
        "net_balance": None,
    }

    def _flush_section():
        nonlocal current_section
        if current_section is not None:
            sections.append(current_section)
            current_section = None

    for i in range(header_row_idx + 1, len(rows)):
        row = rows[i]
        nb = _non_blank_vals(row)
        if not nb:
            continue

        # Summary row?
        summary = _soa_is_summary_row(row, col_map)
        if summary:
            kw, amt = summary
            if "total overdue" in kw:
                grand_totals["total_overdue"] = amt
            elif current_section:
                if "total" in kw and "overdue" not in kw:
                    current_section["total"] = amt
                elif "overdue" in kw:
                    current_section["overdue"] = amt
                elif "available credit" in kw:
                    current_section["available_credit"] = amt
            continue

        # Section header?
        sec_name = _soa_is_section_header(row, col_map)
        if sec_name:
            _flush_section()
            current_section = {
                "name": sec_name.rstrip(),
                "section_type": _classify_section(sec_name),
                "items": [],
                "total": None,
                "overdue": None,
                "available_credit": None,
            }
            continue

        # Data row?
        if _soa_is_data_row(row, col_map):
            if current_section is None:
                current_section = {
                    "name": "General",
                    "section_type": "charges",
                    "items": [],
                    "total": None,
                    "overdue": None,
                    "available_credit": None,
                }
            item = _soa_extract_item(row, col_map)
            if item["amount"] is not None:
                current_section["items"].append(item)

    _flush_section()

    # ── Grand totals ─────────────────────────────────────────────────────────
    if grand_totals["total_overdue"] is None:
        grand_totals["total_overdue"] = round(sum(
            (s["overdue"] or 0) for s in sections if (s["overdue"] or 0) > 0
        ), 2) or None

    all_amounts = [
        it["amount"] for s in sections for it in s["items"] if it["amount"] is not None
    ]
    credits = [a for a in all_amounts if a < 0]
    grand_totals["total_credits"] = round(sum(credits), 2) if credits else 0.0
    grand_totals["net_balance"] = round(sum(all_amounts), 2) if all_amounts else 0.0

    # ── Summary sheet (SoA Summary) ──────────────────────────────────────────
    summary_sheet: Dict[str, float] = {}
    for name, df in all_sheets.items():
        if "summary" in name.lower():
            for _, row in df.iterrows():
                nb_cells = [(j, v) for j, v in enumerate(row) if not _is_blank(v)]
                if len(nb_cells) >= 2:
                    label = _clean(nb_cells[0][1])
                    val = _to_float(nb_cells[-1][1])
                    if label and val is not None:
                        summary_sheet[label] = val
            break

    # ── Aging buckets ────────────────────────────────────────────────────────
    aging: Dict[str, float] = {
        "current": 0.0, "1_30_days": 0.0, "31_60_days": 0.0,
        "61_90_days": 0.0, "91_180_days": 0.0, "over_180_days": 0.0,
    }
    for sec in sections:
        for it in sec["items"]:
            amt = it.get("amount") or 0.0
            if amt <= 0:
                continue
            d = it.get("days_late")
            if d is None or d <= 0:
                aging["current"] += amt
            elif d <= 30:
                aging["1_30_days"] += amt
            elif d <= 60:
                aging["31_60_days"] += amt
            elif d <= 90:
                aging["61_90_days"] += amt
            elif d <= 180:
                aging["91_180_days"] += amt
            else:
                aging["over_180_days"] += amt
    aging = {k: round(v, 2) for k, v in aging.items()}

    return {
        "file_type": "SOA",
        "metadata": metadata,
        "sections": sections,
        "grand_totals": grand_totals,
        "summary_sheet": summary_sheet,
        "aging_buckets": aging,
        "all_sheets": list(all_sheets.keys()),
        "errors": errors,
    }


def _classify_section(name: str) -> str:
    nl = name.lower()
    if "credit" in nl:
        return "credits"
    if "totalcare" in nl:
        return "totalcare"
    if "spare" in nl or "parts" in nl:
        return "spare_parts"
    if "late payment" in nl or "lpi" in nl or "interest" in nl:
        return "lpi"
    if "customer responsible" in nl or "crc" in nl:
        return "crc"
    return "charges"


# ══════════════════════════════════════════════════════════════════════════════
# Invoice List Parser (EPI style)
# ══════════════════════════════════════════════════════════════════════════════

_INV_COL_ALIASES: Dict[str, List[str]] = {
    "reference":      ["reference", "doc no", "invoice no", "document no"],
    "doc_date":       ["document date", "doc date", "posting date"],
    "due_date":       ["net due date", "due date", "payment date"],
    "currency":       ["document currency", "currency", "curr"],
    "amount":         ["amount in doc", "amount", "value", "balance"],
    "reference_key3": ["reference key 3", "ref key 3", "ref 3"],
    "text":           ["text", "description", "narrative"],
    "assignment":     ["assignment", "assign", "ref key 1"],
}


def _find_header_row(df: pd.DataFrame, required_kws: List[str], max_scan: int = 20) -> int:
    """Return 0-indexed row index of the row that best matches required keywords."""
    best_idx, best_score = 0, 0
    for i in range(min(max_scan, len(df))):
        row = df.iloc[i]
        score = sum(
            1 for v in row
            if not _is_blank(v) and any(kw in _clean(v).lower() for kw in required_kws)
        )
        if score > best_score:
            best_score, best_idx = score, i
    return best_idx


def _map_generic_columns(header_row: pd.Series, aliases: Dict[str, List[str]]) -> Dict[str, int]:
    """
    Same first-claim-per-column strategy as _map_soa_columns:
    once column i is owned by a field, no other field can take it.
    """
    claimed: Dict[int, str] = {}
    mapping: Dict[str, int] = {}
    for field, kws in aliases.items():
        for i, val in enumerate(header_row):
            if _is_blank(val) or i in claimed or field in mapping:
                continue
            vl = _clean(val).lower()
            for kw in kws:
                if kw in vl:
                    mapping[field] = i
                    claimed[i] = field
                    break
    return mapping


def _parse_invoice_list(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    errors: List[str] = []
    # Use the first / largest sheet
    sheet_name = sorted(all_sheets.keys(), key=lambda n: all_sheets[n].notna().sum().sum(), reverse=True)[0]
    df = all_sheets[sheet_name]

    hdr_idx = _find_header_row(df, ["reference", "amount", "document", "net due", "currency"])
    col_map = _map_generic_columns(df.iloc[hdr_idx], _INV_COL_ALIASES)

    items: List[Dict] = []
    subtotals: List[Dict] = []
    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        if not _non_blank_vals(row):
            continue
        ref      = _to_str_ref(row.iloc[col_map.get("reference", 0)])
        doc_date = _to_date(row.iloc[col_map["doc_date"]] if "doc_date" in col_map else None)
        due_date = _to_date(row.iloc[col_map["due_date"]] if "due_date" in col_map else None)
        text     = _clean(row.iloc[col_map["text"]] if "text" in col_map else None) or None
        assign   = _clean(row.iloc[col_map["assignment"]] if "assignment" in col_map else None) or None
        amt      = _to_float(row.iloc[col_map.get("amount", 4)])

        if amt is None and ref is None:
            continue

        # Pure-total/subtotal rows: amount-only, all identifying fields are blank.
        # These are Excel formatting rows (colored running totals) — skip them.
        is_pure_total = (
            ref is None
            and doc_date is None
            and due_date is None
            and text is None
            and assign is None
        )
        if is_pure_total:
            if amt is not None:
                subtotals.append({"row_index": i + 1, "amount": amt})
            continue

        items.append({
            "reference":      ref,
            "doc_date":       doc_date,
            "due_date":       due_date,
            "currency":       _clean(row.iloc[col_map["currency"]] if "currency" in col_map else None) or "USD",
            "amount":         amt,
            "reference_key3": _clean(row.iloc[col_map["reference_key3"]] if "reference_key3" in col_map else None) or None,
            "text":           text,
            "assignment":     assign,
        })

    pos_amounts = [it["amount"] for it in items if it["amount"] and it["amount"] > 0]
    neg_amounts = [it["amount"] for it in items if it["amount"] and it["amount"] < 0]

    return {
        "file_type": "INVOICE_LIST",
        "metadata": {
            "source_file": filename,
            "source_sheet": sheet_name,
            "total_items": len(items),
            "currencies": list({it["currency"] for it in items if it["currency"]}),
        },
        "items": items,
        "totals": {
            "total_amount":   round(sum(it["amount"] for it in items if it["amount"]), 2),
            "total_positive": round(sum(pos_amounts), 2),
            "total_negative": round(sum(neg_amounts), 2),
            "item_count":     len(items),
        },
        # Subtotal/running-total rows found in the file (excluded from items).
        # These are the coloured formatting rows (e.g. orange, gold, green totals).
        "sheet_subtotals": subtotals,
        "all_sheets": list(all_sheets.keys()),
        "errors": errors,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Opportunity Tracker Parser (MEA Commercial Optimisation style)
# ══════════════════════════════════════════════════════════════════════════════
#
# Handles the full MEA Profit Opportunities Tracker workbook:
#   • MEA LOG  — Account Management level estimates (hopper)
#   • L2       — ICT-evaluated estimates
#   • L3       — Contract-level estimates
#   • Summary  — Project-level strategic/financial overview
#   • Opps and Threats — Pre-existing opportunities & 5YP improvement
#   • Timeline / Date Input — Project milestone timelines
#   • COUNT    — Analytics/aggregation by customer
#   • INPUT    — Reference/config data (dropdowns, weights, statuses)
#   • SUM      — Calculator/filter sheet
#   • COVER    — Report cover metadata
#   • Sheet1   — Lookup/reference data
# ══════════════════════════════════════════════════════════════════════════════

_OPP_HDR_SIGNALS = [
    "#", "project", "programme", "customer", "region", "asks",
    "type of opportunity", "priority", "status", "term benefit",
    "external probability", "internal complexity",
]

# Core columns present in MEA LOG, L2, and L3 sheets (cols 2-21)
_OPP_CORE_COLS: Dict[str, List[str]] = {
    "number":               ["#"],
    "project":              ["project"],
    "programme":            ["programme", "program"],
    "customer":             ["customer"],
    "region":               ["region"],
    "asks":                 ["asks"],
    "opportunity_type":     ["type of opportunity"],
    "levers":               ["levers"],
    "priority":             ["priority"],
    "spe_related":          ["spe related"],
    "num_spe":              ["no,of spe", "no. of spe", "no of spe"],
    "crp_pct":              ["crp%", "crp %"],
    "ext_probability":      ["external probability"],
    "int_complexity":       ["internal complexity"],
    "status":               ["status"],
    "evaluation_level":     ["evaluation level"],
    "term_benefit":         ["term benefit"],
    "benefit_2026":         ["2026"],
    "benefit_2027":         ["2027"],
    "sum_26_27":            ["sum of 26/27"],
}

# Supporting financial info columns (cols ~51-58)
_OPP_SUPPORT_FIN_COLS: Dict[str, List[str]] = {
    "deal_benefits":        ["deal benefits"],
    "expected_deal_costs":  ["expected deal costs"],
    "inyear_profit_impact": ["in-year profit impact", "in year profit impact"],
    "fyp_profit_improvement": ["5yp profit improvement", "5yp improvement"],
    "term_profit_improvement": ["term profit impr"],
    "total_crp_term_revenue":  ["total crp term rev"],
    "total_crp_term_margin":   ["total crp term margin"],
    "crp_margin_pct":       ["crp margin %"],
}

# "To Go" columns (cols ~60-62)
_OPP_TOGO_COLS: Dict[str, List[str]] = {
    "togo_term_revenue":    ["term revenue"],
    "togo_term_cost":       ["term cost"],
    "togo_term_profit":     ["term profit"],
}

# Resource Prioritisation columns (cols ~66-71)
_OPP_RESOURCE_COLS: Dict[str, List[str]] = {
    "res_account_mgmt":       ["account management"],
    "res_contract_mgmt":      ["contract management"],
    "res_service_business":   ["service business"],
    "res_business_evaluation":["business eval"],
    "res_sales_contracting":  ["sales & contracting", "sales and contracting"],
    "res_customer_ops":       ["customer operations"],
}

# ── Financial column layout in L2/L3/MEA LOG (cols 25-49) ──────────────────
# The wide financial area has 4 groups, each with years 2025-2030:
#   cols 25-30: Existing Deal — Cash Receipts
#   cols 31-36: Existing Deal — In Year Profit
#   cols 38-43: New Deal — Cash Receipts
#   cols 44-49: New Deal — In Year Profit
_FINANCIAL_GROUPS = [
    ("existing_deal_cash",   25, 30),   # Existing Deal Cash Receipts
    ("existing_deal_profit", 31, 36),   # Existing Deal In Year Profit
    ("new_deal_cash",        38, 43),   # New Deal Cash Receipts
    ("new_deal_profit",      44, 49),   # New Deal In Year Profit
]
_FINANCIAL_YEARS = [2025, 2026, 2027, 2028, 2029, 2030]


def _classify_opp_sheet(sheet_name: str) -> str:
    """Map sheet name → estimation level label."""
    sn = sheet_name.lower().strip()
    if sn == "l2":
        return "ICT"
    elif sn == "l3":
        return "Contract"
    elif "mea log" in sn or "opp log" in sn:
        return "Hopper"
    return "Unknown"


def _extract_opp_sums_row(df: pd.DataFrame) -> Dict[str, Optional[float]]:
    """Extract the SUMS row (row 11 typically) from an opp log sheet."""
    sums: Dict[str, Optional[float]] = {}
    for i in range(min(15, len(df))):
        row = df.iloc[i]
        for j, val in enumerate(row):
            if not _is_blank(val) and "SUMS" in _clean(val).upper():
                # Found the sums row — extract known positions
                sums["term_benefit_sum"] = _to_float(row.iloc[18]) if 18 < len(row) else None
                sums["sum_2026"] = _to_float(row.iloc[19]) if 19 < len(row) else None
                sums["sum_2027"] = _to_float(row.iloc[20]) if 20 < len(row) else None
                sums["sum_26_27"] = _to_float(row.iloc[21]) if 21 < len(row) else None
                return sums
    return sums


def _extract_financial_breakdown(row: pd.Series) -> Dict[str, Dict[str, Optional[float]]]:
    """
    Extract the 4-group financial breakdown from a wide opp row.
    Returns {group_name: {yr_2025: val, yr_2026: val, ...}}.
    """
    fin: Dict[str, Dict[str, Optional[float]]] = {}
    for group_name, start_col, end_col in _FINANCIAL_GROUPS:
        year_vals: Dict[str, Optional[float]] = {}
        for offset, year in enumerate(_FINANCIAL_YEARS):
            col_idx = start_col + offset
            if col_idx <= end_col and col_idx < len(row):
                year_vals[f"yr_{year}"] = _to_float(row.iloc[col_idx])
            else:
                year_vals[f"yr_{year}"] = None
        fin[group_name] = year_vals
    return fin


def _extract_supporting_financials(row: pd.Series, col_map: Dict[str, int]) -> Dict[str, Optional[float]]:
    """Extract supporting financial info columns (Deal Benefits, etc.)."""
    return {
        field: _to_float(_get_generic(row, col_map, field))
        for field in _OPP_SUPPORT_FIN_COLS
    }


def _extract_togo(row: pd.Series, col_map: Dict[str, int]) -> Dict[str, Optional[float]]:
    """Extract 'To Go' columns."""
    return {
        field: _to_float(_get_generic(row, col_map, field))
        for field in _OPP_TOGO_COLS
    }


def _extract_resource_priority(row: pd.Series, col_map: Dict[str, int]) -> Dict[str, Any]:
    """Extract resource prioritisation columns."""
    return {
        field: _to_float(_get_generic(row, col_map, field))
        for field in _OPP_RESOURCE_COLS
    }


def _parse_opp_log_sheet(df: pd.DataFrame, sheet_name: str) -> Dict:
    """
    Parse a single opportunity log sheet (MEA LOG, L2, or L3).
    These all share the same 83-column layout.
    """
    estimation_level = _classify_opp_sheet(sheet_name)
    sums = _extract_opp_sums_row(df)

    # Find header row
    hdr_idx = _find_header_row(df, _OPP_HDR_SIGNALS, max_scan=20)
    hdr_row = df.iloc[hdr_idx]

    # Map core columns
    col_map = _map_generic_columns(hdr_row, _OPP_CORE_COLS)

    # Map supporting financial, to-go, and resource columns
    support_map = _map_generic_columns(hdr_row, _OPP_SUPPORT_FIN_COLS)
    togo_map = _map_generic_columns(hdr_row, _OPP_TOGO_COLS)
    resource_map = _map_generic_columns(hdr_row, _OPP_RESOURCE_COLS)

    records: List[Dict] = []
    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        if not _non_blank_vals(row):
            continue
        num_val = _to_float(_get_generic(row, col_map, "number"))
        if num_val is None:
            continue

        # The spreadsheet pre-populates row numbers 1-500 but most are
        # empty template rows.  Require at least one key data field to
        # be populated (project, customer, asks, or status).
        project_v  = _clean(_get_generic(row, col_map, "project")) or None
        customer_v = _clean(_get_generic(row, col_map, "customer")) or None
        asks_v     = _clean(_get_generic(row, col_map, "asks")) or None
        status_v   = _clean(_get_generic(row, col_map, "status")) or None
        if not any([project_v, customer_v, asks_v, status_v]):
            continue

        rec: Dict[str, Any] = {
            "number":           int(num_val),
            "project":          project_v,
            "programme":        _clean(_get_generic(row, col_map, "programme")) or None,
            "customer":         customer_v,
            "region":           _clean(_get_generic(row, col_map, "region")) or None,
            "asks":             asks_v,
            "opportunity_type": _clean(_get_generic(row, col_map, "opportunity_type")) or None,
            "levers":           _clean(_get_generic(row, col_map, "levers")) or None,
            "priority":         _to_float(_get_generic(row, col_map, "priority")),
            "spe_related":      _clean(_get_generic(row, col_map, "spe_related")) or None,
            "num_spe":          _to_float(_get_generic(row, col_map, "num_spe")),
            "crp_pct":          _to_float(_get_generic(row, col_map, "crp_pct")),
            "ext_probability":  _clean(_get_generic(row, col_map, "ext_probability")) or None,
            "int_complexity":   _clean(_get_generic(row, col_map, "int_complexity")) or None,
            "status":           status_v,
            "evaluation_level": _clean(_get_generic(row, col_map, "evaluation_level")) or None,
            "term_benefit":     _to_float(_get_generic(row, col_map, "term_benefit")),
            "benefit_2026":     _to_float(_get_generic(row, col_map, "benefit_2026")),
            "benefit_2027":     _to_float(_get_generic(row, col_map, "benefit_2027")),
            "sum_26_27":        _to_float(_get_generic(row, col_map, "sum_26_27")),
            # Structured financial breakdown
            "financials":       _extract_financial_breakdown(row),
            # Supporting financial info
            "supporting_financials": _extract_supporting_financials(row, support_map),
            # To Go
            "to_go":            _extract_togo(row, togo_map),
            # Resource prioritisation
            "resource_priority": _extract_resource_priority(row, resource_map),
        }
        records.append(rec)

    return {
        "estimation_level": estimation_level,
        "sheet_name": sheet_name,
        "sums": sums,
        "records": records,
    }


def _parse_opp_summary_sheet(df: pd.DataFrame) -> Dict:
    """
    Parse the Summary sheet — project-level strategic/financial overview.

    Layout:
      Row 1: section labels ("Strategic", "Financials")
      Row 2: headers (Project, Customer, Programme, KAM Pack Complete, ...)
      Row 3: sub-headers for 5YP years (2025-2029)
      Row 4+: data rows with "Launched" / "Pending" group labels in col 1
    """
    projects: List[Dict] = []
    current_group = None

    # Find header row (row with "Project", "Customer", "Programme")
    hdr_idx = _find_header_row(df, ["project", "customer", "programme", "crp", "onerous"], max_scan=5)
    hdr_row = df.iloc[hdr_idx]

    _SUMMARY_COLS: Dict[str, List[str]] = {
        "project":          ["project"],
        "customer":         ["customer"],
        "programme":        ["programme", "program"],
        "kam_pack":         ["kam pack"],
        "crp_deep_dive":    ["crp deep dive"],
        "risk_review":      ["risk review"],
        "contract_dcr":     ["contract dcr"],
        "ov_review":        ["o&v review"],
        "current_crp_margin":  ["current crp margin"],
        "onerous_provision":   ["onerous provision"],
        "current_crp_pct":     ["current crp %"],
        "onerous_2024":        ["2024 onerous"],
        "onerous_2025":        ["2025 onerous"],
        "overall_pack_improvement": ["overall pack improvement"],
    }
    col_map = _map_generic_columns(hdr_row, _SUMMARY_COLS)

    # 5YP year sub-header row (usually hdr_idx + 1)
    fyp_start_col = 15   # columns 15-19 = 2025..2029
    fyp_years = [2025, 2026, 2027, 2028, 2029]

    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        nb = _non_blank_vals(row)
        if not nb:
            continue

        # Check for group label in col 1
        v1 = _clean(row.iloc[1]) if 1 < len(row) else ""
        if v1.lower() in ("launched", "pending"):
            current_group = v1
            # May also have data in same row
            proj = _clean(_get_generic(row, col_map, "project"))
            if not proj:
                continue

        proj = _clean(_get_generic(row, col_map, "project"))
        cust = _clean(_get_generic(row, col_map, "customer"))
        prog = _clean(_get_generic(row, col_map, "programme"))

        # Skip sub-header rows (years row)
        if not proj and not cust and not prog:
            # Could be a continuation row with only programme
            if prog:
                pass
            else:
                continue

        # 5YP improvement by year
        fyp: Dict[str, Optional[float]] = {}
        for offset, year in enumerate(fyp_years):
            col_idx = fyp_start_col + offset
            if col_idx < len(row):
                fyp[f"yr_{year}"] = _to_float(row.iloc[col_idx])

        rec = {
            "group":             current_group,
            "project":           proj or None,
            "customer":          cust or None,
            "programme":         prog or None,
            "kam_pack_complete":      _to_date(_get_generic(row, col_map, "kam_pack")),
            "crp_deep_dive_complete": _to_date(_get_generic(row, col_map, "crp_deep_dive")),
            "risk_review_complete":   _to_date(_get_generic(row, col_map, "risk_review")),
            "contract_dcr_complete":  _to_date(_get_generic(row, col_map, "contract_dcr")),
            "ov_review_complete":     _to_date(_get_generic(row, col_map, "ov_review")),
            "current_crp_margin":     _to_float(_get_generic(row, col_map, "current_crp_margin")),
            "onerous_provision":      _to_float(_get_generic(row, col_map, "onerous_provision")),
            "current_crp_pct":        _to_float(_get_generic(row, col_map, "current_crp_pct")),
            "onerous_release_2024":   _to_float(_get_generic(row, col_map, "onerous_2024")),
            "onerous_release_2025":   _to_float(_get_generic(row, col_map, "onerous_2025")),
            "fyp_improvement":        fyp,
            "overall_pack_improvement": _to_float(_get_generic(row, col_map, "overall_pack_improvement")),
        }
        projects.append(rec)

    return {"projects": projects}


def _parse_opp_opps_and_threats(df: pd.DataFrame) -> Dict:
    """
    Parse the 'Opps and Threats' sheet — pre-existing opportunities with
    profit releases, 5YP improvement, owner, status, and comments.
    """
    _OT_COLS: Dict[str, List[str]] = {
        "project":              ["project"],
        "programme":            ["programme", "program"],
        "customer":             ["customer"],
        "opportunity":          ["opportunity"],
        "profit_release_2024":  ["2024 profit release"],
        "profit_release_2025":  ["2025 profit release"],
        "overall_pack_improvement": ["overall pack improvement"],
        "window_for_forecast":  ["window for forecast"],
        "due_date":             ["due date"],
        "owner":                ["owner"],
        "status":               ["status"],
        "comments":             ["comments"],
    }

    # Row 0 has totals, Row 1 has headers, Row 2 has "5YP Improvement" sub-header
    hdr_idx = _find_header_row(df, ["project", "customer", "opportunity", "owner", "due date"], max_scan=5)
    hdr_row = df.iloc[hdr_idx]
    col_map = _map_generic_columns(hdr_row, _OT_COLS)

    # 5YP year columns (2025-2029 in cols 7-11)
    fyp_year_cols: Dict[str, int] = {}
    for i, val in enumerate(hdr_row):
        if _is_blank(val):
            continue
        vl = _clean(val).lower()
        m = re.match(r"^(20\d{2})(\.0)?$", vl)
        if m:
            year = int(m.group(1))
            fyp_year_cols[f"fyp_{year}"] = i

    # Extract totals from row 0
    totals_row = df.iloc[0] if len(df) > 0 else None
    totals: Dict[str, Optional[float]] = {}
    if totals_row is not None:
        for i, val in enumerate(totals_row):
            f = _to_float(val)
            if f is not None:
                totals[f"col_{i}"] = f

    records: List[Dict] = []
    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        if not _non_blank_vals(row):
            continue

        proj = _clean(_get_generic(row, col_map, "project")) or None
        prog = _clean(_get_generic(row, col_map, "programme")) or None
        cust = _clean(_get_generic(row, col_map, "customer")) or None
        opp  = _clean(_get_generic(row, col_map, "opportunity")) or None

        # Skip rows that have nothing meaningful
        if not any([proj, prog, cust, opp]):
            continue

        # 5YP improvement by year
        fyp: Dict[str, Optional[float]] = {}
        for key, col_idx in fyp_year_cols.items():
            if col_idx < len(row):
                fyp[key] = _to_float(row.iloc[col_idx])

        rec = {
            "project":               proj,
            "programme":             prog,
            "customer":              cust,
            "opportunity":           opp,
            "profit_release_2024":   _to_float(_get_generic(row, col_map, "profit_release_2024")),
            "profit_release_2025":   _to_float(_get_generic(row, col_map, "profit_release_2025")),
            "fyp_improvement":       fyp,
            "overall_pack_improvement": _to_float(_get_generic(row, col_map, "overall_pack_improvement")),
            "window_for_forecast":   _clean(_get_generic(row, col_map, "window_for_forecast")) or None,
            "due_date":              _to_date(_get_generic(row, col_map, "due_date")),
            "owner":                 _clean(_get_generic(row, col_map, "owner")) or None,
            "status":                _clean(_get_generic(row, col_map, "status")) or None,
            "comments":              _clean(_get_generic(row, col_map, "comments")) or None,
        }
        records.append(rec)

    return {"totals": totals, "items": records}


def _parse_opp_timeline(all_sheets: Dict[str, pd.DataFrame]) -> Dict:
    """
    Parse Timeline + Date Input sheets into a unified milestone map.

    Date Input sheet (preferred): clean table with columns:
      Project | Customer | Idea Generation | Approval to Launch | Strategy Approval |
      BE Generated | Approval | Negotiation Strategy | Proposal Submitted | Proposal Signed

    Timeline sheet: Gantt-style with week columns — milestones placed in cells.
    """
    milestones: List[Dict] = []

    # ── Date Input (structured, preferred) ───────────────────────────────
    for name in ("Date Input", "date input"):
        if name not in all_sheets:
            continue
        df = all_sheets[name]
        hdr_idx = _find_header_row(df, ["project", "customer", "idea generation", "approval"], max_scan=5)
        hdr_row = df.iloc[hdr_idx]

        _DI_COLS: Dict[str, List[str]] = {
            "project":              ["project"],
            "customer":             ["customer"],
            "idea_generation":      ["idea generation"],
            "approval_to_launch":   ["approval to launch"],
            "strategy_approval":    ["strategy approval"],
            "be_generated":         ["be generated"],
            "approval":             ["approval"],
            "negotiation_strategy": ["negotiation strategy"],
            "proposal_submitted":   ["proposal submitted"],
            "proposal_signed":      ["proposal signed"],
        }
        col_map = _map_generic_columns(hdr_row, _DI_COLS)

        _MILESTONE_ORDER = [
            "idea_generation", "approval_to_launch", "strategy_approval",
            "be_generated", "approval", "negotiation_strategy",
            "proposal_submitted", "proposal_signed",
        ]

        for i in range(hdr_idx + 1, len(df)):
            row = df.iloc[i]
            if not _non_blank_vals(row):
                continue
            proj = _clean(_get_generic(row, col_map, "project")) or None
            cust = _clean(_get_generic(row, col_map, "customer")) or None
            if not proj and not cust:
                continue

            ms_dates: Dict[str, Optional[str]] = {}
            for ms_key in _MILESTONE_ORDER:
                ms_dates[ms_key] = _to_date(_get_generic(row, col_map, ms_key))

            # Determine current phase based on latest non-null milestone
            current_phase = None
            for ms_key in reversed(_MILESTONE_ORDER):
                if ms_dates.get(ms_key):
                    current_phase = ms_key
                    break

            milestones.append({
                "project":       proj,
                "customer":      cust,
                "milestones":    ms_dates,
                "current_phase": current_phase,
                "source":        "Date Input",
            })
        break   # only parse once

    # ── Timeline sheet (Gantt-style, supplementary) ──────────────────────
    for name in all_sheets:
        if name.lower().strip() != "timeline":
            continue
        df = all_sheets[name]
        # Timeline row 13 has Project | Customer | week-date headers
        # Data rows have project/customer in cols 2-3 and milestone labels in week columns
        hdr_idx = _find_header_row(df, ["project", "customer"], max_scan=15)
        if hdr_idx < 2:
            hdr_idx = 13   # known position

        for i in range(hdr_idx + 1, min(hdr_idx + 50, len(df))):
            row = df.iloc[i]
            if not _non_blank_vals(row):
                continue
            proj = _clean(row.iloc[2]) if 2 < len(row) else None
            cust = _clean(row.iloc[3]) if 3 < len(row) else None
            if not proj:
                continue

            # Collect milestone labels from week columns
            timeline_milestones: List[Dict] = []
            for j in range(4, len(row)):
                val = _clean(row.iloc[j])
                if val and val.lower() not in ("false", "true", "0", "nan"):
                    timeline_milestones.append({
                        "column_index": j,
                        "milestone_label": val,
                    })

            if timeline_milestones:
                milestones.append({
                    "project":            proj,
                    "customer":           cust,
                    "timeline_milestones": timeline_milestones,
                    "source":             "Timeline",
                })
        break

    return {"milestones": milestones}


def _parse_opp_count_sheet(df: pd.DataFrame) -> Dict:
    """
    Parse the COUNT sheet — analytics/aggregation breakdowns by customer.

    Layout:
      Row 7: "PROJECTS" label
      Row 8: section headers (PROGRAM, PROBABILITY, COMPLEXITY, STATUS, YEARS)
      Row 9: column headers
      Row 10+: data rows by customer
    """
    _COUNT_COLS: Dict[str, List[str]] = {
        "customer":           ["project"],    # labelled "PROJECT" but contains customer names
        "count_of_asks":      ["count of asks"],
        "spe_related":        ["of which spe", "spe related"],
        "num_spe":            ["no.of spe", "no of spe"],
        # Programme breakdown
        "prog_xwb84":         ["trent xwb-84"],
        "prog_xwb97":         ["trent xwb-97"],
        "prog_t1000":         ["trent 1000"],
        "prog_t500":          ["trent 500"],
        "prog_t700":          ["trent 700"],
        "prog_rb211":         ["rb211"],
        "prog_t7000":         ["trent 7000"],
        # Probability
        "count_high_prob":    ["count of high prob"],
        "count_med_prob":     ["count of med prob"],
        "count_low_prob":     ["count of low prob"],
        # Complexity
        "count_high_comp":    ["count of high comp"],
        "count_med_comp":     ["count of med comp"],
        "count_low_comp":     ["count of low comp"],
        # Status
        "count_completed":    ["count of completed"],
        "count_contracting":  ["count of contracting"],
        "count_negotiations": ["count of negotiations"],
        "count_ict":          ["count of ict"],
        "count_hopper":       ["count of hopper"],
        # Financial sums
        "sum_2026":           ["2026"],
        "sum_2027":           ["2027"],
        "sum_26_27":          ["sum of 26/27"],
        "sum_term_benefit":   ["sum of term benefit"],
    }

    hdr_idx = _find_header_row(df, ["project", "count of asks", "trent", "count of high"], max_scan=15)
    col_map = _map_generic_columns(df.iloc[hdr_idx], _COUNT_COLS)

    customers: List[Dict] = []
    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        if not _non_blank_vals(row):
            continue
        cust = _clean(_get_generic(row, col_map, "customer"))
        if not cust:
            continue

        rec: Dict[str, Any] = {"customer": cust}
        for field in _COUNT_COLS:
            if field == "customer":
                continue
            rec[field] = _to_float(_get_generic(row, col_map, field))
        customers.append(rec)

    # Also extract sorted rankings if present (cols 29+)
    sorted_rankings: Dict[str, List[Dict]] = {}
    hdr_row = df.iloc[hdr_idx]
    # Look for "SORTED CUSTOMER" / "SORTED TERM IMPACT" etc. in header
    sort_col_pairs: List[tuple] = []
    for j, val in enumerate(hdr_row):
        if not _is_blank(val) and "sorted" in _clean(val).lower():
            label = _clean(val)
            sort_col_pairs.append((j, label))

    # Parse sorted columns in pairs (customer_col, value_col)
    for idx in range(0, len(sort_col_pairs) - 1, 2):
        cust_col_idx = sort_col_pairs[idx][0]
        val_col_idx = sort_col_pairs[idx + 1][0]
        label = sort_col_pairs[idx + 1][1]

        ranking: List[Dict] = []
        for i in range(hdr_idx + 1, len(df)):
            row = df.iloc[i]
            c = _clean(row.iloc[cust_col_idx]) if cust_col_idx < len(row) else None
            v = _to_float(row.iloc[val_col_idx]) if val_col_idx < len(row) else None
            if c:
                ranking.append({"customer": c, "value": v})
        if ranking:
            sorted_rankings[label] = ranking

    return {"customers": customers, "sorted_rankings": sorted_rankings}


def _parse_opp_input_sheet(df: pd.DataFrame) -> Dict:
    """
    Parse the INPUT sheet — reference/config data for dropdowns and weights.

    Contains:
      - Probability scores (High=3, Med=2, Low=1)
      - Complexity scores (High=1, Med=1, Low=1)
      - Weights (PROB=1, COMPLEX=1)
      - Years list (2026-2031)
      - Status values
      - Customer/Project/Programme lookup lists
    """
    config: Dict[str, Any] = {
        "probability_scores": {},
        "complexity_scores": {},
        "weights": {},
        "years": [],
        "statuses": [],
        "customers": [],
        "projects": [],
        "programmes": [],
    }

    # Scan rows for known config sections
    for i in range(min(50, len(df))):
        row = df.iloc[i]
        for j, val in enumerate(row):
            if _is_blank(val):
                continue
            s = _clean(val)
            sl = s.lower()

            # Probability table: col j=label, col j+1=score
            if sl in ("high", "med", "low") and j + 1 < len(row):
                score = _to_float(row.iloc[j + 1])
                if score is not None:
                    # Determine if this is probability or complexity by checking header above
                    context_label = ""
                    for ci in range(max(0, i - 3), i):
                        for cj, cv in enumerate(df.iloc[ci]):
                            if not _is_blank(cv):
                                cvl = _clean(cv).lower()
                                if "prob" in cvl:
                                    context_label = "probability"
                                elif "complex" in cvl:
                                    context_label = "complexity"
                    if context_label == "probability" and sl not in config["probability_scores"]:
                        config["probability_scores"][s] = score
                    elif context_label == "complexity" and sl not in config["complexity_scores"]:
                        config["complexity_scores"][s] = score

            # Status values
            if sl in ("hopper", "ict", "negotiations", "contracting", "completed"):
                if s not in config["statuses"]:
                    config["statuses"].append(s)

            # Years
            m = re.match(r"^(20\d{2})(\.0)?$", sl)
            if m:
                year = int(m.group(1))
                if year not in config["years"]:
                    config["years"].append(year)

    # Extract lookup lists from the lower part of INPUT (rows 16+)
    # Typically: col 5 = CUSTOMER, col 6 = PROJECT, col 8 = PROGRAMME
    for i in range(16, min(50, len(df))):
        row = df.iloc[i]
        for j, val in enumerate(row):
            if _is_blank(val):
                continue
            s = _clean(val)
            if not s or s == "-":
                continue
            # Heuristic: col 5 → customer, col 6 → project, col 8 → programme
            # Skip header labels
            if s.upper() in ("CUSTOMER", "PROJECT", "PROGRAMME", "PROEJCT", "STATUS"):
                continue
            if j == 5 and s not in config["customers"]:
                config["customers"].append(s)
            elif j == 6 and s not in config["projects"]:
                config["projects"].append(s)
            elif j == 8 and s not in config["programmes"]:
                config["programmes"].append(s)

    config["years"].sort()
    return config


def _parse_opp_cover(df: pd.DataFrame) -> Dict:
    """Extract metadata from the COVER sheet."""
    cover: Dict[str, Optional[str]] = {"title": None, "subtitle": None}
    for i in range(min(15, len(df))):
        row = df.iloc[i]
        for val in row:
            if _is_blank(val):
                continue
            s = _clean(val)
            if "commercial optimisation" in s.lower() or "opportunity report" in s.lower():
                if cover["title"] is None:
                    cover["title"] = s
                else:
                    cover["subtitle"] = s
    return cover


def _parse_opp_sum_sheet(df: pd.DataFrame) -> Dict:
    """
    Parse the SUM calculator sheet — filter/aggregation tool.
    Returns the filter criteria and computed sums.
    """
    result: Dict[str, Any] = {"filters": {}, "computed_sums": {}}

    hdr_idx = _find_header_row(df, ["probability", "complexity", "status", "sum", "term"], max_scan=12)
    if hdr_idx >= len(df) - 1:
        return result

    hdr_row = df.iloc[hdr_idx]
    _SUM_COLS: Dict[str, List[str]] = {
        "probability": ["probability"],
        "complexity":  ["complexity"],
        "status":      ["status"],
        "sum_term":    ["term impact", "sum"],
        "sum_2026":    ["2026"],
        "sum_2027":    ["2027"],
    }
    col_map = _map_generic_columns(hdr_row, _SUM_COLS)

    # First data row = filter criteria
    if hdr_idx + 1 < len(df):
        frow = df.iloc[hdr_idx + 1]
        result["filters"] = {
            "probability": _clean(_get_generic(frow, col_map, "probability")) or None,
            "complexity":  _clean(_get_generic(frow, col_map, "complexity")) or None,
            "status":      _clean(_get_generic(frow, col_map, "status")) or None,
        }
        result["computed_sums"] = {
            "term_impact": _to_float(_get_generic(frow, col_map, "sum_term")),
            "sum_2026":    _to_float(_get_generic(frow, col_map, "sum_2026")),
            "sum_2027":    _to_float(_get_generic(frow, col_map, "sum_2027")),
        }

    # Check for totals row (usually last non-blank row)
    for i in range(len(df) - 1, hdr_idx + 1, -1):
        row = df.iloc[i]
        if _non_blank_vals(row):
            result["totals"] = {
                "term_impact": _to_float(_get_generic(row, col_map, "sum_term")),
                "sum_2026":    _to_float(_get_generic(row, col_map, "sum_2026")),
                "sum_2027":    _to_float(_get_generic(row, col_map, "sum_2027")),
            }
            break

    return result


def _parse_opp_reference_data(df: pd.DataFrame) -> Dict:
    """
    Parse Sheet1 — lookup/reference data containing valid values for
    Programme, Operator, Project, TCA Agreement types, SPE/Services types,
    Opportunity types, Lever types, etc.
    """
    ref: Dict[str, List[str]] = {
        "programmes": [],
        "operators": [],
        "projects": [],
        "tca_agreement_types": [],
        "spe_services_types": [],
        "opportunity_types": [],
        "lever_types": [],
    }

    # Row 0 has headers: Programme | Operator | Project | TCA_AGREEMENT | SPE__SERVICES...
    # Row 1+ has values
    if len(df) < 2:
        return ref

    hdr_row = df.iloc[0]
    col_mapping: Dict[str, int] = {}
    for j, val in enumerate(hdr_row):
        if _is_blank(val):
            continue
        s = _clean(val).lower()
        if "programme" in s:
            col_mapping["programmes"] = j
        elif "operator" in s:
            col_mapping["operators"] = j
        elif "project" in s:
            col_mapping["projects"] = j
        elif "tca" in s:
            col_mapping["tca_agreement_types"] = j
        elif "spe" in s:
            col_mapping["spe_services_types"] = j

    # Also scan for opportunity type / lever columns (cols 7-13 area)
    for j, val in enumerate(hdr_row):
        if _is_blank(val):
            continue
        s = _clean(val)
        # These are deeper columns with asks, levers, etc.

    for i in range(1, len(df)):
        row = df.iloc[i]
        for field, col_idx in col_mapping.items():
            if col_idx < len(row):
                v = _clean(row.iloc[col_idx])
                if v and v not in ref[field]:
                    ref[field].append(v)

        # Also extract opportunity type/lever from known positions
        # Col 7 = broader category, col 8 = specific asks, col 9/10 = levers
        for col_idx, field_name in [(7, "opportunity_types"), (9, "lever_types"), (13, "lever_types")]:
            if col_idx < len(row):
                v = _clean(row.iloc[col_idx])
                if v and v not in ref.get(field_name, []):
                    ref.setdefault(field_name, []).append(v)

    return ref


def _parse_opportunity_tracker(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    """
    Master parser for the MEA Profit Opportunities Tracker workbook.
    Parses all sheets and returns a comprehensive, structured result.
    """
    errors: List[str] = []
    metadata: Dict[str, Any] = {
        "source_file": filename,
        "away_day_date": None,
        "exchange_rate": None,
        "report_title": None,
    }
    opportunities_by_sheet: Dict[str, Dict] = {}

    # ── Identify opportunity log sheets (MEA LOG, L2, L3) ────────────────
    opp_log_sheets = [
        name for name in all_sheets
        if any(kw in name.lower() for kw in ["l2", "l3", "mea log", "opp log"])
    ]
    if not opp_log_sheets:
        # Fallback: look for sheets with opportunity header signals
        for name, df in all_sheets.items():
            text_blob = " ".join(
                _clean(v).lower() for row in df.head(20).values for v in row if not _is_blank(v)
            )
            if "opp log sheet" in text_blob or "type of opportunity" in text_blob:
                opp_log_sheets.append(name)

    # ── Extract global metadata from first opp log sheet ─────────────────
    for sheet_name in opp_log_sheets[:1]:
        df = all_sheets[sheet_name]
        for i in range(min(15, len(df))):
            row = df.iloc[i]
            for j, val in enumerate(row):
                if _is_blank(val):
                    continue
                sl = _clean(val).lower()
                if "away day date" in sl:
                    for k in range(j + 1, min(j + 5, len(row))):
                        d = _to_date(row.iloc[k])
                        if d:
                            metadata["away_day_date"] = d
                            break

    # ── Parse each opportunity log sheet ─────────────────────────────────
    for sheet_name in opp_log_sheets:
        try:
            df = all_sheets[sheet_name]
            parsed_sheet = _parse_opp_log_sheet(df, sheet_name)
            if parsed_sheet["records"]:
                opportunities_by_sheet[sheet_name] = parsed_sheet
        except Exception as e:
            errors.append(f"Failed to parse opp sheet '{sheet_name}': {e}")

    # ── Parse Summary sheet ──────────────────────────────────────────────
    summary_data: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "summary":
            try:
                summary_data = _parse_opp_summary_sheet(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse Summary sheet: {e}")
            break

    # ── Parse Opps and Threats sheet ─────────────────────────────────────
    opps_threats_data: Dict = {}
    for name in all_sheets:
        if "opps" in name.lower() and "threat" in name.lower():
            try:
                opps_threats_data = _parse_opp_opps_and_threats(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse Opps and Threats sheet: {e}")
            break

    # ── Parse Timeline + Date Input ──────────────────────────────────────
    timeline_data: Dict = {}
    try:
        timeline_data = _parse_opp_timeline(all_sheets)
    except Exception as e:
        errors.append(f"Failed to parse Timeline/Date Input: {e}")

    # ── Parse COUNT sheet ────────────────────────────────────────────────
    count_data: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "count":
            try:
                count_data = _parse_opp_count_sheet(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse COUNT sheet: {e}")
            break

    # ── Parse INPUT sheet ────────────────────────────────────────────────
    input_config: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "input":
            try:
                input_config = _parse_opp_input_sheet(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse INPUT sheet: {e}")
            break

    # ── Parse SUM sheet ──────────────────────────────────────────────────
    sum_data: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "sum":
            try:
                sum_data = _parse_opp_sum_sheet(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse SUM sheet: {e}")
            break

    # ── Parse COVER sheet ────────────────────────────────────────────────
    cover_data: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "cover":
            try:
                cover_data = _parse_opp_cover(all_sheets[name])
                if cover_data.get("title"):
                    metadata["report_title"] = cover_data["title"]
            except Exception as e:
                errors.append(f"Failed to parse COVER sheet: {e}")
            break

    # ── Parse Sheet1 (reference data) ────────────────────────────────────
    reference_data: Dict = {}
    for name in all_sheets:
        if name.lower().strip() == "sheet1":
            try:
                reference_data = _parse_opp_reference_data(all_sheets[name])
            except Exception as e:
                errors.append(f"Failed to parse reference data (Sheet1): {e}")
            break

    # ── Build global summary statistics ──────────────────────────────────
    # Flatten all records across all estimation levels
    all_records: List[Dict] = []
    for sheet_data in opportunities_by_sheet.values():
        all_records.extend(sheet_data.get("records", []))

    statuses: Dict[str, int] = {}
    for r in all_records:
        s = r.get("status") or "Unknown"
        statuses[s] = statuses.get(s, 0) + 1

    programmes: Dict[str, int] = {}
    for r in all_records:
        p = r.get("programme") or "Unknown"
        programmes[p] = programmes.get(p, 0) + 1

    customers: Dict[str, int] = {}
    for r in all_records:
        c = r.get("customer") or "Unknown"
        customers[c] = customers.get(c, 0) + 1

    opp_types: Dict[str, int] = {}
    for r in all_records:
        t = r.get("opportunity_type") or "Unknown"
        opp_types[t] = opp_types.get(t, 0) + 1

    # Per-estimation-level sums
    estimation_sums: Dict[str, Dict] = {}
    for sheet_name, sheet_data in opportunities_by_sheet.items():
        level = sheet_data.get("estimation_level", "Unknown")
        recs = sheet_data.get("records", [])
        estimation_sums[level] = {
            "sheet_name": sheet_name,
            "count": len(recs),
            "total_term_benefit": round(sum(r.get("term_benefit") or 0 for r in recs), 2),
            "total_2026": round(sum(r.get("benefit_2026") or 0 for r in recs), 2),
            "total_2027": round(sum(r.get("benefit_2027") or 0 for r in recs), 2),
            "total_sum_26_27": round(sum(r.get("sum_26_27") or 0 for r in recs), 2),
            "sums_from_sheet": sheet_data.get("sums", {}),
        }

    # ── Build backward-compatible "opportunities" dict ───────────────────
    # Keep the old format (sheet_name → [records]) for backward compat
    opportunities_flat: Dict[str, List[Dict]] = {}
    for sheet_name, sheet_data in opportunities_by_sheet.items():
        opportunities_flat[sheet_name] = sheet_data.get("records", [])

    return {
        "file_type": "OPPORTUNITY_TRACKER",
        "metadata": {
            **metadata,
            "sheets_parsed": list(opportunities_by_sheet.keys()),
            "all_sheets": list(all_sheets.keys()),
            "estimation_levels": {
                sn: sd.get("estimation_level") for sn, sd in opportunities_by_sheet.items()
            },
        },
        # Backward-compatible flat opportunities dict
        "opportunities": opportunities_flat,
        # New: structured per-sheet data with estimation levels
        "opportunities_by_level": {
            sheet_data.get("estimation_level", "Unknown"): {
                "sheet_name": sn,
                "records": sheet_data.get("records", []),
                "sums": sheet_data.get("sums", {}),
            }
            for sn, sheet_data in opportunities_by_sheet.items()
        },
        "summary": {
            "total_opportunities": len(all_records),
            "by_status": statuses,
            "by_programme": programmes,
            "by_customer": customers,
            "by_opportunity_type": opp_types,
            "total_term_benefit": round(
                sum(r.get("term_benefit") or 0 for r in all_records), 2
            ),
            "estimation_level_sums": estimation_sums,
        },
        # New: additional parsed sheets
        "project_summary": summary_data,
        "opps_and_threats": opps_threats_data,
        "timeline": timeline_data,
        "customer_analytics": count_data,
        "calculator": sum_data,
        "cover": cover_data,
        "input_config": input_config,
        "reference_data": reference_data,
        "errors": errors,
    }


def _get_generic(row: pd.Series, col_map: Dict[str, int], field: str) -> Any:
    idx = col_map.get(field)
    if idx is None or idx >= len(row):
        return None
    return row.iloc[idx]


# ══════════════════════════════════════════════════════════════════════════════
# Shop Visit History Parser
# ══════════════════════════════════════════════════════════════════════════════

_SV_COL_ALIASES: Dict[str, List[str]] = {
    "part_number":    ["event item part number", "part number"],
    "serial_number":  ["event item serial number", "serial number", "esn"],
    "event_datetime": ["event date time", "event date", "date"],
    "operator":       ["operator"],
    "parent_serial":  ["parent serial number"],
    "registration":   ["parent item registration", "registration"],
    "action_code":    ["action code"],
    "rework_level":   ["rework level"],
    "service_event":  ["service event number"],
    "hsn":            ["hsn"],
    "csn":            ["csn"],
    "hssv":           ["hssv"],
    "cssv":           ["cssv"],
    "sv_type":        ["shopvisit_type", "shop visit type"],
    "sv_location":    ["shopvisit_location", "shop visit location"],
}


def _parse_shop_visit(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    errors: List[str] = []

    # Main data sheet
    data_sheet = next(
        (n for n in all_sheets if "report" in n.lower() or "page" in n.lower()),
        list(all_sheets.keys())[0],
    )
    df = all_sheets[data_sheet]

    hdr_idx = _find_header_row(df, list(_SV_COL_ALIASES.keys()) + ["action code", "csn", "hsn"])
    col_map = _map_generic_columns(df.iloc[hdr_idx], _SV_COL_ALIASES)

    current_status_rows: List[Dict] = []
    shop_visit_rows: List[Dict] = []
    maintenance_rows: List[Dict] = []

    for i in range(hdr_idx + 1, len(df)):
        row = df.iloc[i]
        if not _non_blank_vals(row):
            continue

        part_num = _clean(_get_generic(row, col_map, "part_number")) or None
        serial   = _to_str_ref(_get_generic(row, col_map, "serial_number"))
        action   = _clean(_get_generic(row, col_map, "action_code")).lower()
        rework   = _clean(_get_generic(row, col_map, "rework_level")).lower()

        if not serial:
            continue

        rec = {
            "part_number":    part_num,
            "serial_number":  serial,
            "event_datetime": _to_date(_get_generic(row, col_map, "event_datetime")),
            "operator":       _clean(_get_generic(row, col_map, "operator")) or None,
            "parent_serial":  _to_str_ref(_get_generic(row, col_map, "parent_serial")),
            "registration":   _clean(_get_generic(row, col_map, "registration")) or None,
            "action_code":    _clean(_get_generic(row, col_map, "action_code")) or None,
            "rework_level":   _clean(_get_generic(row, col_map, "rework_level")) or None,
            "service_event":  _to_str_ref(_get_generic(row, col_map, "service_event")),
            "hsn":            _to_float(_get_generic(row, col_map, "hsn")),
            "csn":            _to_float(_get_generic(row, col_map, "csn")),
            "hssv":           _to_float(_get_generic(row, col_map, "hssv")),
            "cssv":           _to_float(_get_generic(row, col_map, "cssv")),
            "sv_type":        _clean(_get_generic(row, col_map, "sv_type")) or None,
            "sv_location":    _clean(_get_generic(row, col_map, "sv_location")) or None,
        }

        if "current status" in action or "current status" in rework:
            current_status_rows.append(rec)
        elif "shop visit" in rework:
            shop_visit_rows.append(rec)
        else:
            maintenance_rows.append(rec)

    # Unique serials and operators
    all_serials = {r["serial_number"] for r in shop_visit_rows + maintenance_rows if r["serial_number"]}
    all_operators = {r["operator"] for r in shop_visit_rows if r["operator"] and r["operator"] != "NO OPERATOR"}

    # Detect engine model from part numbers
    part_nums = {r["part_number"] for r in (shop_visit_rows or current_status_rows) if r["part_number"]}
    engine_models = list({pn.split(" ")[0] for pn in part_nums if pn})

    return {
        "file_type": "SHOP_VISIT_HISTORY",
        "metadata": {
            "source_file": filename,
            "source_sheet": data_sheet,
            "engine_models": engine_models,
            "total_engines": len(all_serials),
            "operators": sorted(all_operators),
        },
        "shop_visits": shop_visit_rows,
        "maintenance_actions": maintenance_rows,
        "current_status": current_status_rows,
        "statistics": {
            "total_shop_visits":    len(shop_visit_rows),
            "total_maintenance":    len(maintenance_rows),
            "total_engines_tracked": len(all_serials),
            "sv_types": _count_field(shop_visit_rows, "sv_type"),
            "sv_locations": _count_field(shop_visit_rows, "sv_location"),
        },
        "all_sheets": list(all_sheets.keys()),
        "errors": errors,
    }


def _count_field(records: List[Dict], field: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for r in records:
        v = r.get(field) or "Unknown"
        counts[v] = counts.get(v, 0) + 1
    return counts


# ══════════════════════════════════════════════════════════════════════════════
# SVRG Master Parser
# ══════════════════════════════════════════════════════════════════════════════

_SVRG_CLAIMS_ALIASES: Dict[str, List[str]] = {
    "date":             ["date"],
    "year":             ["year"],
    "credit_ref":       ["credit note reference", "reference"],
    "guarantee":        ["guarantee"],
    "credit_value":     ["credit note value", "value"],
    "cumulative_value": ["cumulative claim value", "cumulative"],
}

_SVRG_EVENT_ALIASES: Dict[str, List[str]] = {
    "event_type":       ["event type", "#", "type"],
    "date":             ["date"],
    "engine_serial":    ["engine serial no", "esn", "serial"],
    "aircraft":         ["a/c no", "aircraft", "a/c"],
    "tsn_tsr":          ["tsn or tsr", "tsn", "hours"],
    "csn_csr":          ["csn or csr", "csn", "cycles"],
    "description":      ["cause of event", "description", "disruption"],
    "qualification":    ["qualified/non-qualified", "qualification", "emirates input"],
    "justification":    ["justification", "emirates - justification"],
    "rr_input":         ["rr input", "rr qualification"],
    "rr_justification": ["rr - justification", "rr justification"],
    "guarantee_coverage":["guarantee coverage", "coverage"],
    "comments":         ["further comments", "comments"],
}


def _parse_svrg_master(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    errors: List[str] = []
    metadata: Dict[str, Any] = {"source_file": filename, "customer": None, "engine_model": None}

    # Extract metadata from MENU sheet
    if "MENU" in all_sheets:
        menu_df = all_sheets["MENU"]
        for i in range(min(10, len(menu_df))):
            row = menu_df.iloc[i]
            for val in row:
                if _is_blank(val):
                    continue
                s = _clean(val)
                sl = s.lower()
                if "emirates" in sl or "singapore" in sl or "airline" in sl:
                    if metadata["customer"] is None:
                        metadata["customer"] = s
                if "trent" in sl or "t900" in sl:
                    if metadata["engine_model"] is None:
                        metadata["engine_model"] = s

    # Claims Summary
    claims: List[Dict] = []
    if "CLAIMS SUMMARY" in all_sheets:
        df = all_sheets["CLAIMS SUMMARY"]
        hdr_idx = _find_header_row(df, ["date", "credit note", "guarantee", "cumulative"])
        col_map = _map_generic_columns(df.iloc[hdr_idx], _SVRG_CLAIMS_ALIASES)
        for i in range(hdr_idx + 1, len(df)):
            row = df.iloc[i]
            date_v = _to_date(_get_generic(row, col_map, "date"))
            val_v  = _to_float(_get_generic(row, col_map, "credit_value"))
            if date_v or (val_v is not None and val_v != 0):
                claims.append({
                    "date":             date_v,
                    "year":             _to_float(_get_generic(row, col_map, "year")),
                    "credit_ref":       _to_str_ref(_get_generic(row, col_map, "credit_ref")),
                    "guarantee":        _clean(_get_generic(row, col_map, "guarantee")) or None,
                    "credit_value":     val_v,
                    "cumulative_value": _to_float(_get_generic(row, col_map, "cumulative_value")),
                })

    # Event Entry
    events: List[Dict] = []
    if "EVENT ENTRY" in all_sheets:
        df = all_sheets["EVENT ENTRY"]
        hdr_idx = _find_header_row(df, ["date", "engine serial", "a/c", "cause", "qualified"])
        col_map = _map_generic_columns(df.iloc[hdr_idx], _SVRG_EVENT_ALIASES)
        for i in range(hdr_idx + 1, len(df)):
            row = df.iloc[i]
            date_v   = _to_date(_get_generic(row, col_map, "date"))
            serial_v = _to_str_ref(_get_generic(row, col_map, "engine_serial"))
            desc_v   = _clean(_get_generic(row, col_map, "description"))
            if not (date_v or serial_v or desc_v):
                continue
            events.append({
                "event_type":        _clean(_get_generic(row, col_map, "event_type")) or None,
                "date":              date_v,
                "engine_serial":     serial_v,
                "aircraft":          _clean(_get_generic(row, col_map, "aircraft")) or None,
                "tsn_tsr":           _to_float(_get_generic(row, col_map, "tsn_tsr")),
                "csn_csr":           _to_float(_get_generic(row, col_map, "csn_csr")),
                "description":       desc_v or None,
                "qualification":     _clean(_get_generic(row, col_map, "qualification")) or None,
                "justification":     _clean(_get_generic(row, col_map, "justification")) or None,
                "rr_input":          _clean(_get_generic(row, col_map, "rr_input")) or None,
                "rr_justification":  _clean(_get_generic(row, col_map, "rr_justification")) or None,
                "guarantee_coverage":_clean(_get_generic(row, col_map, "guarantee_coverage")) or None,
                "comments":          _clean(_get_generic(row, col_map, "comments")) or None,
            })

    # Available sheet summaries (best-effort for each named sheet)
    available_sheets: Dict[str, Dict] = {}
    for sname, df in all_sheets.items():
        if sname in ("MENU", "EVENT ENTRY", "CLAIMS SUMMARY", "Chart1", "Chart2",
                     "DESCRIPTIONS", "Sheet3"):
            continue
        row_count = df.notna().any(axis=1).sum()
        available_sheets[sname] = {
            "row_count": int(row_count),
            "col_count": int(df.shape[1]),
        }

    return {
        "file_type": "SVRG_MASTER",
        "metadata": {
            **metadata,
            "all_sheets": list(all_sheets.keys()),
        },
        "claims_summary": {
            "claims": claims,
            "total_claims": len(claims),
            "total_credit_value": round(sum(c["credit_value"] or 0 for c in claims), 2),
        },
        "event_entries": {
            "events": events,
            "total_events": len(events),
            "qualifications": _count_field(events, "qualification"),
            "guarantee_types": _count_field(events, "guarantee_coverage"),
        },
        "available_sheets": available_sheets,
        "errors": errors,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Unknown / Fallback Parser
# ══════════════════════════════════════════════════════════════════════════════

def _parse_unknown(all_sheets: Dict[str, pd.DataFrame], filename: str) -> Dict:
    """Best-effort generic extraction for unrecognised files."""
    sheets_data: Dict[str, Any] = {}
    for name, df in all_sheets.items():
        # Try to find a header row
        hdr_idx = 0
        for i in range(min(10, len(df))):
            row = df.iloc[i]
            non_blank = _non_blank_vals(row)
            if len(non_blank) >= 3:
                hdr_idx = i
                break
        headers = [_clean(v) or f"col_{j}" for j, v in enumerate(df.iloc[hdr_idx])]
        rows = []
        for i in range(hdr_idx + 1, len(df)):
            row = df.iloc[i]
            if not _non_blank_vals(row):
                continue
            rec = {}
            for j, h in enumerate(headers):
                if j < len(row) and not _is_blank(row.iloc[j]):
                    v = row.iloc[j]
                    # Serialise
                    if isinstance(v, (datetime, date)):
                        rec[h] = v.strftime("%Y-%m-%d")
                    elif isinstance(v, float) and v == int(v):
                        rec[h] = int(v)
                    else:
                        rec[h] = v if not _is_blank(v) else None
            if rec:
                rows.append(rec)
        sheets_data[name] = {"headers": headers, "rows": rows, "row_count": len(rows)}

    return {
        "file_type": "UNKNOWN",
        "metadata": {"source_file": filename},
        "sheets": sheets_data,
        "errors": ["File type could not be determined; generic extraction applied."],
    }


# ══════════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════════

def parse_file(
    source: Union[str, bytes, io.BytesIO],
    filename: str = "",
    is_base64: bool = False,
) -> Dict:
    """
    Parse any supported RR Excel file and return a canonical dict.

    Parameters
    ----------
    source   : file path (str), raw bytes, BytesIO, or base64-encoded string
    filename : original file name (used for type hints and metadata)
    is_base64: True when ``source`` is a base64-encoded string

    Returns
    -------
    dict with keys: file_type, metadata, [type-specific keys], errors
    The dict is always JSON-serialisable.
    """
    if is_base64 and isinstance(source, str):
        try:
            source = base64.b64decode(source)
        except Exception as e:
            return {"file_type": "ERROR", "errors": [f"base64 decode failed: {e}"]}

    all_sheets = _load_workbook(source, filename)
    if not all_sheets:
        return {
            "file_type": "ERROR",
            "metadata": {"source_file": filename},
            "errors": ["Could not load workbook — file may be corrupt or unsupported."],
        }

    file_type = detect_file_type(all_sheets)

    try:
        if file_type == "SOA":
            return _parse_soa(all_sheets, filename)
        elif file_type == "INVOICE_LIST":
            return _parse_invoice_list(all_sheets, filename)
        elif file_type == "OPPORTUNITY_TRACKER":
            return _parse_opportunity_tracker(all_sheets, filename)
        elif file_type == "SHOP_VISIT":
            return _parse_shop_visit(all_sheets, filename)
        elif file_type == "SVRG_MASTER":
            return _parse_svrg_master(all_sheets, filename)
        else:
            return _parse_unknown(all_sheets, filename)
    except Exception as e:
        logger.exception("Parser crashed on file '%s'", filename)
        # Attempt generic fallback so backend never gets an empty response
        try:
            fallback = _parse_unknown(all_sheets, filename)
            fallback["errors"].append(f"Primary parser crashed: {e}. Fell back to generic extraction.")
            fallback["file_type"] = f"{file_type}_FALLBACK"
            return fallback
        except Exception as e2:
            return {
                "file_type": "ERROR",
                "metadata": {"source_file": filename},
                "errors": [f"Primary parser crashed: {e}", f"Fallback also failed: {e2}"],
            }


# ══════════════════════════════════════════════════════════════════════════════
# Multi-file session layer — cross-references + combined views
# ══════════════════════════════════════════════════════════════════════════════

# Regex patterns for extracting engine serial numbers from free-text fields
_ESN_IN_TEXT = re.compile(
    r'\bESN\s*(\d{4,6})\b'            # "ESN 10499"
    r'|\b(9[0-9]{4})\b',              # 5-digit 9xxxx Trent 900 serials
    re.IGNORECASE,
)


def _extract_esns_from_text(text: str) -> List[str]:
    """Pull engine serial numbers from a free-text cell."""
    if not text:
        return []
    found: List[str] = []
    for m in _ESN_IN_TEXT.finditer(text):
        val = m.group(1) or m.group(2)
        if val:
            found.append(val.strip())
    return found


def _extract_file_keys(result: Dict, filename: str) -> List[Dict]:
    """
    Walk a parsed-file result and yield every 'linkable' key with enough
    context to reconstruct where it came from.

    Key types emitted
    -----------------
    invoice_ref   — document / invoice reference numbers
    assignment    — assignment / PO cross-reference values
    account       — customer account numbers
    customer      — customer name strings
    esn           — engine serial numbers (extracted from text or explicit fields)
    """
    keys: List[Dict] = []
    ft = result.get("file_type", "UNKNOWN")

    def _k(key_type: str, value: Any, **ctx) -> None:
        """Append a key entry only when value is meaningful."""
        if value is None:
            return
        v = _clean(str(value))
        if not v or v.lower() in ("none", "nan", "unknown"):
            return
        keys.append({"key_type": key_type, "value": v, "file": filename,
                     "file_type": ft, **ctx})

    # ── SOA ──────────────────────────────────────────────────────────────────
    if ft == "SOA":
        customer = result.get("metadata", {}).get("customer_name")
        _k("customer", customer)

        for sec in result.get("sections", []):
            sname = sec["name"]
            for item in sec.get("items", []):
                _k("invoice_ref", item.get("reference"),
                   section=sname, amount=item.get("amount"),
                   days_late=item.get("days_late"), due_date=item.get("due_date"),
                   text=item.get("text"))
                _k("assignment", item.get("assignment"),
                   section=sname, amount=item.get("amount"))
                _k("account", item.get("account"),
                   section=sname)
                # ESNs buried in text / assignment
                for esn in _extract_esns_from_text(item.get("text") or ""):
                    _k("esn", esn, section=sname,
                       amount=item.get("amount"), ref=item.get("reference"))
                for esn in _extract_esns_from_text(item.get("rr_comments") or ""):
                    _k("esn", esn, section=sname, ref=item.get("reference"))

    # ── INVOICE_LIST ─────────────────────────────────────────────────────────
    elif ft == "INVOICE_LIST":
        for item in result.get("items", []):
            _k("invoice_ref", item.get("reference"),
               amount=item.get("amount"), due_date=item.get("due_date"),
               text=item.get("text"))
            _k("assignment", item.get("assignment"),
               amount=item.get("amount"))
            for esn in _extract_esns_from_text(item.get("text") or ""):
                _k("esn", esn, ref=item.get("reference"),
                   amount=item.get("amount"))

    # ── SHOP_VISIT_HISTORY ───────────────────────────────────────────────────
    elif ft == "SHOP_VISIT_HISTORY":
        for event in (result.get("shop_visits", [])
                      + result.get("maintenance_actions", [])
                      + result.get("current_status", [])):
            _k("esn", event.get("serial_number"),
               event_datetime=event.get("event_datetime"),
               operator=event.get("operator"),
               sv_type=event.get("sv_type"),
               sv_location=event.get("sv_location"))

    # ── SVRG_MASTER ──────────────────────────────────────────────────────────
    elif ft == "SVRG_MASTER":
        _k("customer", result.get("metadata", {}).get("customer"))
        for event in result.get("event_entries", {}).get("events", []):
            _k("esn", event.get("engine_serial"),
               date=event.get("date"),
               description=event.get("description"),
               qualification=event.get("qualification"))

    # ── OPPORTUNITY_TRACKER ──────────────────────────────────────────────────
    elif ft == "OPPORTUNITY_TRACKER":
        for sheet, opps in result.get("opportunities", {}).items():
            for opp in opps:
                _k("customer", opp.get("customer"),
                   section=sheet, project=opp.get("project"),
                   programme=opp.get("programme"), status=opp.get("status"))
                _k("programme", opp.get("programme"),
                   section=sheet, project=opp.get("project"),
                   customer=opp.get("customer"))
                _k("project", opp.get("project"),
                   section=sheet, customer=opp.get("customer"),
                   programme=opp.get("programme"), status=opp.get("status"),
                   term_benefit=opp.get("term_benefit"))

        # Opps and Threats cross-references
        for item in result.get("opps_and_threats", {}).get("items", []):
            _k("customer", item.get("customer"),
               project=item.get("project"), programme=item.get("programme"),
               opportunity=item.get("opportunity"), owner=item.get("owner"))
            _k("project", item.get("project"),
               customer=item.get("customer"), programme=item.get("programme"))

        # Project summary cross-references
        for proj in result.get("project_summary", {}).get("projects", []):
            _k("customer", proj.get("customer"),
               project=proj.get("project"), programme=proj.get("programme"),
               crp_margin=proj.get("current_crp_margin"))
            _k("project", proj.get("project"),
               customer=proj.get("customer"), programme=proj.get("programme"))

        # Timeline cross-references
        for ms in result.get("timeline", {}).get("milestones", []):
            _k("project", ms.get("project"),
               customer=ms.get("customer"), current_phase=ms.get("current_phase"))

    return keys


def _build_cross_references(all_results: Dict[str, Dict]) -> Dict:
    """
    Build a cross-reference index from all parsed files in a session.

    Returns
    -------
    {
        "cross_refs": {
            "invoice_ref": {
                "<ref_value>": [
                    {file, file_type, section, amount, days_late, ...},
                    {file, file_type, section, amount, ...},
                ]
            },
            "assignment": { ... },
            "account":    { ... },
            "customer":   { ... },
            "esn":        { ... },
        },
        "stats": {
            "total_keys_extracted": N,
            "cross_file_matches":   M,
            "matches_by_type":      { invoice_ref: x, ... },
        }
    }

    Only entries that appear in 2 or more *distinct* files are included in
    cross_refs (single-file occurrences are noise, not cross-references).
    """
    from collections import defaultdict

    # Group raw keys by (key_type → value → [occurrences])
    index: Dict[str, Dict[str, List[Dict]]] = defaultdict(lambda: defaultdict(list))
    total_extracted = 0

    for filename, result in all_results.items():
        if result.get("file_type") == "ERROR":
            continue
        keys = _extract_file_keys(result, filename)
        total_extracted += len(keys)
        for k in keys:
            kt, val = k["key_type"], k["value"]
            entry = {kk: vv for kk, vv in k.items() if kk not in ("key_type", "value")}
            index[kt][val].append(entry)

    cross_refs: Dict[str, Dict] = {}
    matches_by_type: Dict[str, int] = {}

    for key_type, value_map in index.items():
        multi: Dict[str, List] = {}
        for value, occurrences in value_map.items():
            distinct_files = {occ["file"] for occ in occurrences}
            if len(distinct_files) >= 2:
                multi[value] = occurrences
        if multi:
            cross_refs[key_type] = multi
            matches_by_type[key_type] = len(multi)

    total_matches = sum(matches_by_type.values())

    return {
        "cross_refs": cross_refs,
        "stats": {
            "total_keys_extracted": total_extracted,
            "cross_file_matches":   total_matches,
            "matches_by_type":      matches_by_type,
        },
    }


def _build_combined_open_items(all_results: Dict[str, Dict]) -> List[Dict]:
    """
    Merge all overdue / open items from SOA and INVOICE_LIST files into a
    single flat list, sorted by days_late descending.

    Each item carries _source_file, _source_section, and _file_type so the
    AI/backend always knows which file a record came from.
    """
    combined: List[Dict] = []

    for fname, result in all_results.items():
        ft = result.get("file_type")

        if ft == "SOA":
            for sec in result.get("sections", []):
                for item in sec.get("items", []):
                    if item.get("amount") is not None:
                        combined.append({
                            **item,
                            "_source_file":    fname,
                            "_source_section": sec["name"],
                            "_file_type":      ft,
                        })

        elif ft == "INVOICE_LIST":
            for item in result.get("items", []):
                if item.get("amount") is not None:
                    combined.append({
                        **item,
                        "_source_file":    fname,
                        "_source_section": None,
                        "_file_type":      ft,
                    })

    # Sort: overdue items first (highest days_late), then by amount descending
    combined.sort(
        key=lambda x: (-(x.get("days_late") or 0), -(abs(x.get("amount") or 0)))
    )
    return combined


def parse_session(
    files: List[Dict],
    is_base64: bool = True,
) -> Dict:
    """
    Parse multiple uploaded Excel files and build a unified session object.

    This is the primary entry point when multiple files are uploaded together.
    It:
      1. Parses every file with the appropriate per-type parser.
      2. Builds a cross-reference index linking matching keys across files
         (invoice refs, assignments, account numbers, ESNs, customer names).
      3. Produces a combined open-items list merging SOA + INVOICE_LIST data.
      4. Returns one dict ready to be stored in flask.session.

    Parameters
    ----------
    files     : list of {"name": "...", "data": "<base64 or path>"}
    is_base64 : True when data fields are base64-encoded (browser upload)

    Returns
    -------
    {
        "files": {
            "ETH SOA.xlsx": { <full parse result> },
            "EPI 16.02.xlsx": { <full parse result> },
            ...
        },
        "cross_references": {
            "cross_refs": {
                "invoice_ref": { "1820146074": [<SOA entry>, <EPI entry>], ... },
                "assignment":  { "DEG 9054":   [...], ... },
                "account":     { "1009374":    [...], ... },
                "esn":         { "91020":      [...], ... },
                "customer":    { "Emirates":   [...], ... },
            },
            "stats": {
                "total_keys_extracted": N,
                "cross_file_matches":   M,
                "matches_by_type":      { invoice_ref: x, ... },
            }
        },
        "combined_open_items": [ ... ],   # all SOA+INVOICE items, sorted
        "session_summary": {
            "files_loaded":       N,
            "file_types_present": [...],
            "cross_file_matches": M,
            "session_errors":     [...],
        }
    }
    """
    parsed: Dict[str, Dict] = {}
    session_errors: List[str] = []

    for f in files:
        name = f.get("name", "unknown.xlsx")
        data = f.get("data", "")
        try:
            result = parse_file(data, filename=name, is_base64=is_base64)
            result["original_filename"] = name
            parsed[name] = result
        except Exception as e:
            logger.exception("Session parse failed for '%s'", name)
            session_errors.append(f"Failed to parse '{name}': {e}")
            parsed[name] = {
                "file_type":          "ERROR",
                "metadata":           {"source_file": name},
                "errors":             [str(e)],
                "original_filename":  name,
            }

    xref             = _build_cross_references(parsed)
    combined_items   = _build_combined_open_items(parsed)
    file_types       = list({r.get("file_type", "UNKNOWN") for r in parsed.values()})

    return {
        "files":               parsed,
        "cross_references":    xref,
        "combined_open_items": combined_items,
        "session_summary": {
            "files_loaded":       len(parsed),
            "file_types_present": file_types,
            "cross_file_matches": xref["stats"]["cross_file_matches"],
            "session_errors":     session_errors,
        },
    }


# ══════════════════════════════════════════════════════════════════════════════
# Convenience: parse a base64 payload as sent by the frontend
# ══════════════════════════════════════════════════════════════════════════════

def parse_upload_payload(payload: Dict) -> Dict:
    """
    Parse the JSON payload sent by app.js to /api/upload.

    Expected format:
        { "files": [ {"name": "...", "data": "<base64>"}, ... ] }

    Returns a full session dict (files + cross_references + combined_open_items).
    The return type changed from List[Dict] → Dict to support multi-file linking.

    server.py migration note
    ------------------------
    Old:  results = parse_upload_payload(payload)   # list
          session["files_data"] = results

    New:  session_data = parse_upload_payload(payload)
          session["files_data"] = session_data["files"]   # individual results
          session["session"]    = session_data             # full session
    """
    files = payload.get("files", [])
    return parse_session(files, is_base64=True)
