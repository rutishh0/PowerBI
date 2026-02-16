"""
Rolls-Royce Civil Aerospace — Statement of Account Parser
==========================================================
Extracted from app.py — a self-contained module that parses RR-style SOA
Excel workbooks and returns JSON-serializable data structures.

Nothing is hard-coded to a particular customer or column position.
The parser detects sections, headers, and amounts dynamically.
"""

import io
import re
import math
import json
from datetime import datetime, timedelta
from collections import OrderedDict

import numpy as np
import pandas as pd
from openpyxl import load_workbook


# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────

RR_NAVY   = "#10069F"
RR_DARK   = "#0C0033"
RR_SILVER = "#C0C0C0"
RR_LIGHT  = "#E8E8EE"
RR_WHITE  = "#FFFFFF"
RR_GOLD   = "#B8860B"
RR_RED    = "#D32F2F"
RR_GREEN  = "#2E7D32"
RR_BLUE2  = "#1565C0"
RR_AMBER  = "#F9A825"

SECTION_COLOURS = [RR_NAVY, "#1565C0", "#5E35B1", "#00838F", "#C62828", "#EF6C00", "#2E7D32", "#6A1B9A"]

AGING_ORDER = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-180 Days", "180+ Days", "Unknown"]
AGING_COLORS = {
    "Current": "#2E7D32", "1-30 Days": "#66BB6A", "31-60 Days": "#F9A825",
    "61-90 Days": "#EF6C00", "91-180 Days": "#D32F2F", "180+ Days": "#B71C1C", "Unknown": "#9E9E9E",
}

# Keywords that signal a section header row
SECTION_KEYWORDS = [
    "charges", "credits", "credit", "totalcare", "familycare", "missioncare",
    "spare parts", "late payment", "interest", "customer respon",
    "customer responsibility", "usable", "offset",
]

SUMMARY_KEYWORDS = ["total", "overdue", "available credit", "total overdue", "net balance"]

HEADER_KEYWORDS = [
    "company", "account", "reference", "document", "date", "amount", "curr",
    "text", "assignment", "arrangement", "comments", "status", "action",
    "days", "late", "lpi", "invoice", "type", "interest", "net due",
]


# ─────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────

def _is_section_header(row_values: list, col_count: int) -> bool:
    """Return True if this row looks like a section heading."""
    non_empty = [(i, v) for i, v in enumerate(row_values) if v is not None]
    if not non_empty:
        return False
    if len(non_empty) > 3:
        return False
    text = str(non_empty[0][1]).strip().lower()
    try:
        float(text.replace(",", ""))
        return False
    except ValueError:
        pass
    text_clean = text.rstrip(":")
    if text_clean in ("total", "overdue", "available credit", "total overdue", "net balance"):
        return False
    if len(non_empty) == 2:
        try:
            float(str(non_empty[1][1]).replace(",", "").replace("$", "").strip())
            if any(sw in text_clean for sw in ("total", "overdue", "credit", "balance")):
                return False
        except (ValueError, TypeError):
            pass
    return any(kw in text for kw in SECTION_KEYWORDS)


def _is_header_row(row_values: list) -> bool:
    """Return True if row looks like a column header row."""
    non_empty = [v for v in row_values if v is not None]
    if len(non_empty) < 4:
        return False
    for v in non_empty:
        try:
            n = float(str(v).replace(",", "").replace("$", "").strip())
            if abs(n) > 100:
                return False
        except (ValueError, TypeError):
            pass
    short_texts = [str(v).strip().lower() for v in non_empty if len(str(v).strip()) < 35]
    if len(short_texts) < 3:
        return False
    hits = sum(1 for t in short_texts for kw in HEADER_KEYWORDS if kw in t)
    return hits >= 3


def _is_summary_row(row_values: list):
    """Return the summary type if this looks like a Total/Overdue row, else None."""
    for v in row_values:
        if v is None:
            continue
        t = str(v).strip().lower().rstrip(":")
        if len(t) > 25:
            continue
        if t in ("total", "overdue", "available credit", "total overdue",
                 "net balance", "total:", "overdue:"):
            return t.rstrip(":")
    return None


def _find_amount_col(header: list):
    """Find the column index that holds amounts."""
    for i, h in enumerate(header):
        if h is None:
            continue
        hl = str(h).lower()
        if "amount" in hl:
            return i
    return None


def _coerce_amount(val):
    """Convert a cell value to a float, handling $, commas, etc."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", "").replace("$", "").replace(" ", "")
    if s in ("", "-", "$ -", "$-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _coerce_date(val):
    """Try to parse a date from various formats. Returns datetime or None."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, pd.Timestamp):
        return val.to_pydatetime()
    s = str(val).strip()
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _coerce_int(val):
    if val is None:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _normalise_header(raw: list) -> list:
    """Clean header names so they are consistent."""
    result = []
    for h in raw:
        if h is None:
            result.append(None)
            continue
        s = str(h).strip()
        s = re.sub(r"\s+", " ", s)
        result.append(s)
    return result


def _map_columns(header: list) -> dict:
    """Map semantic roles to column indices from the header row."""
    mapping = {}
    hl = [str(h).lower() if h else "" for h in header]
    for i, h in enumerate(hl):
        if not h:
            continue
        if "amount" in h:
            mapping["amount"] = i
        elif h in ("curr", "currency"):
            mapping["currency"] = i
        elif "net due" in h or "due date" in h:
            mapping["due_date"] = i
        elif "document" in h and "date" in h:
            mapping["doc_date"] = i
        elif "document" in h and "no" in h:
            mapping["doc_no"] = i
        elif "invoice date" in h:
            mapping["doc_date"] = i
        elif h == "reference" or "reference" in h:
            mapping["reference"] = i
        elif h == "company" or "company" in h:
            mapping["company"] = i
        elif h == "account" or "account" in h:
            mapping["account"] = i
        elif "text" == h:
            mapping["text"] = i
        elif "assignment" in h or "arrangement" in h:
            mapping["assignment"] = i
        elif "r-r comment" in h or "rr comment" in h:
            mapping["rr_comments"] = i
        elif "action" in h or "reqd" in h:
            mapping["action_owner"] = i
        elif "days" in h and "late" in h:
            mapping["days_late"] = i
        elif "rata" in h:
            mapping["rata_date"] = i
        elif "comment" in h and "r-r" not in h and "rr" not in h:
            mapping["customer_comments"] = i
        elif "status" in h:
            mapping["status"] = i
        elif "customer" in h and "comment" not in h and "name" not in h and "n" not in h and "respon" not in h:
            mapping["customer_name"] = i
        elif "lpi" in h:
            mapping["lpi_cumulated"] = i
        elif "etr" in h or "po" in h or "pr" in h:
            mapping["po_reference"] = i
        elif "type" in h:
            mapping["type"] = i
        elif "interest" in h or "calc" in h:
            mapping["interest_method"] = i

    if "doc_date" not in mapping:
        for i, h in enumerate(hl):
            if "date" in h and i not in mapping.values():
                mapping["doc_date"] = i
                break
    if "due_date" not in mapping:
        for i, h in enumerate(hl):
            if "due" in h and i not in mapping.values():
                mapping["due_date"] = i
                break
    return mapping


# ─────────────────────────────────────────────────────────────
# AGING HELPERS
# ─────────────────────────────────────────────────────────────

def aging_bucket(days) -> str:
    """Classify days late into aging buckets."""
    if days is None or (isinstance(days, float) and math.isnan(days)):
        return "Unknown"
    d = int(days)
    if d <= 0:
        return "Current"
    elif d <= 30:
        return "1-30 Days"
    elif d <= 60:
        return "31-60 Days"
    elif d <= 90:
        return "61-90 Days"
    elif d <= 180:
        return "91-180 Days"
    else:
        return "180+ Days"


def fmt_currency(val, short=False):
    """Format a number as USD currency string."""
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return "\u2014"
    neg = val < 0
    av = abs(val)
    if short and av >= 1_000_000:
        s = f"${av/1_000_000:,.2f}M"
    elif short and av >= 1_000:
        s = f"${av/1_000:,.1f}K"
    else:
        s = f"${av:,.2f}"
    return f"-{s}" if neg else s


# ─────────────────────────────────────────────────────────────
# MAIN PARSE FUNCTION
# ─────────────────────────────────────────────────────────────

def parse_soa_workbook(file) -> dict:
    """Parse a Rolls-Royce Statement of Account workbook.

    Returns a dict:
        metadata   : dict of customer info, LPI rate, avg days late, etc.
        sections   : OrderedDict  section_name -> { header, colmap, rows (list[dict]), totals }
        all_items  : list[dict]  flattened across all sections (JSON-serializable)
        grand_totals : dict
    """
    wb = load_workbook(file, data_only=True)
    ws = wb[wb.sheetnames[0]]

    max_col = ws.max_column or 20
    all_rows = []
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=max_col, values_only=True):
        all_rows.append(list(row))

    # ---- PASS 1: Metadata ----
    metadata = {}
    for idx, row in enumerate(all_rows[:15]):
        joined = " ".join(str(v) for v in row if v is not None).lower()
        for v in row:
            if v is None:
                continue
            s = str(v).strip()
            sl = s.lower()
            if "statement of account" in sl:
                metadata["title"] = s
            if "customer" in sl and ("name" in sl or ":" in sl) and "customer_name" not in metadata:
                vi = row.index(v)
                for nv in row[vi+1:]:
                    if nv is not None:
                        metadata["customer_name"] = str(nv).strip()
                        break
            if ("customer" in sl and ("#" in sl or "n" in sl and ":" in sl)) or "customer n" in sl:
                vi = row.index(v)
                for nv in row[vi+1:]:
                    if nv is not None:
                        metadata["customer_id"] = str(nv).strip()
                        break
            if "contact" in sl:
                vi = row.index(v)
                for nv in row[vi+1:]:
                    if nv is not None:
                        metadata["contact"] = str(nv).strip()
                        break
            if "lpi" in sl or "lp ratio" in sl or "lp rate" in sl:
                for nv in row:
                    if nv is None:
                        continue
                    nv_str = str(nv).strip()
                    if "%" in nv_str:
                        try:
                            metadata["lpi_rate"] = float(nv_str.replace("%", "")) / 100.0
                            break
                        except ValueError:
                            pass
                    amt = _coerce_amount(nv)
                    if amt is not None and 0 < abs(amt) < 1:
                        metadata["lpi_rate"] = amt
                        break
            if "average days late" in sl or "avg days late" in sl or "average days late" in joined:
                for nv in row:
                    if nv is None:
                        continue
                    val = _coerce_int(nv)
                    if val is not None and val > 0:
                        metadata["avg_days_late"] = val
                        break
            if "today" in sl:
                for nv in row:
                    d = _coerce_date(nv)
                    if d is not None:
                        metadata["report_date"] = d
                        break

    # ---- PASS 2: Identify section boundaries and headers ----
    master_header = None
    master_header_idx = None
    sections_info = []

    for idx, row in enumerate(all_rows):
        if _is_header_row(row) and master_header is None:
            master_header = _normalise_header(row)
            master_header_idx = idx
            continue
        if _is_section_header(row, max_col):
            name = str([v for v in row if v is not None][0]).strip()
            sections_info.append({"name": name, "start": idx})

    for i, sec in enumerate(sections_info):
        if i + 1 < len(sections_info):
            sec["end"] = sections_info[i + 1]["start"]
        else:
            sec["end"] = len(all_rows)

    # ---- PASS 3: Parse each section ----
    sections = OrderedDict()
    all_items_list = []

    for sec in sections_info:
        sec_name = sec["name"]
        start = sec["start"]
        end = sec["end"]

        header = master_header
        header_idx = master_header_idx
        col_map = None

        for offset in range(1, 4):
            ri = start + offset
            if ri >= end:
                break
            if _is_header_row(all_rows[ri]):
                header = _normalise_header(all_rows[ri])
                header_idx = ri
                break

        if header:
            col_map = _map_columns(header)
        else:
            col_map = {}

        amt_idx = col_map.get("amount")
        if amt_idx is None and header:
            amt_idx = _find_amount_col(header)
            if amt_idx is not None:
                col_map["amount"] = amt_idx

        data_rows = []
        totals = {}
        data_start = (header_idx + 1) if header_idx and header_idx >= start else start + 1

        for ri in range(data_start, end):
            row = all_rows[ri]
            summary_type = _is_summary_row(row)
            if summary_type:
                for v in row:
                    amt = _coerce_amount(v)
                    if amt is not None:
                        totals[summary_type] = amt
                        break
                continue

            if _is_section_header(row, max_col):
                continue
            if _is_header_row(row):
                header = _normalise_header(row)
                col_map = _map_columns(header)
                amt_idx = col_map.get("amount")
                if amt_idx is None and header:
                    amt_idx = _find_amount_col(header)
                    if amt_idx is not None:
                        col_map["amount"] = amt_idx
                continue

            amt_val = None
            if amt_idx is not None and amt_idx < len(row):
                amt_val = _coerce_amount(row[amt_idx])
            if amt_val is None:
                for ci, cv in enumerate(row):
                    a = _coerce_amount(cv)
                    if a is not None and abs(a) > 0.01:
                        if abs(a) > 100 or (col_map.get("days_late") is not None and ci != col_map.get("days_late")):
                            amt_val = a
                            break

            if amt_val is None:
                continue

            record = {
                "Section": sec_name,
                "Amount": amt_val,
            }

            def _get(key, coerce=str):
                ci = col_map.get(key)
                if ci is None or ci >= len(row):
                    return None
                v = row[ci]
                if v is None:
                    return None
                if coerce == float:
                    return _coerce_amount(v)
                if coerce == "date":
                    return _coerce_date(v)
                if coerce == int:
                    return _coerce_int(v)
                return str(v).strip()

            record["Company"]           = _get("company")
            record["Account"]           = _get("account")
            record["Reference"]         = _get("reference")
            record["Document Date"]     = _get("doc_date", "date")
            record["Due Date"]          = _get("due_date", "date")
            record["Currency"]          = _get("currency")
            record["Text"]              = _get("text")
            record["Assignment"]        = _get("assignment")
            record["R-R Comments"]      = _get("rr_comments")
            record["Action Owner"]      = _get("action_owner")
            record["Days Late"]         = _get("days_late", int)
            record["Customer Comments"] = _get("customer_comments")
            record["Status"]            = _get("status")
            record["PO Reference"]      = _get("po_reference")
            record["LPI Cumulated"]     = _get("lpi_cumulated")
            record["Type"]              = _get("type")
            record["Document No"]       = _get("doc_no")
            record["Interest Method"]   = _get("interest_method")
            record["Customer Name"]     = _get("customer_name")

            # Auto-compute Days Late from Due Date
            if record["Days Late"] is None and record["Due Date"] is not None:
                try:
                    due = record["Due Date"]
                    # Use report date if available, else today
                    anchor_date = metadata.get("report_date") or datetime.now()
                    anchor_date = anchor_date.replace(hour=0, minute=0, second=0, microsecond=0)
                    
                    if due < anchor_date:
                        record["Days Late"] = (anchor_date - due).days
                    else:
                        record["Days Late"] = 0
                except Exception:
                    pass

            # Derive a unified Status field
            if not record.get("Status"):
                for field in ["R-R Comments", "Action Owner", "Customer Comments"]:
                    v = record.get(field, "")
                    if v and any(kw in v.lower() for kw in [
                        "ready for payment", "under approval", "under review",
                        "dispute", "ongoing", "et to process", "payment pending",
                        "invoice sent", "credit note", "approved",
                        "transfer", "invoice approved", "pending for payment",
                    ]):
                        record["Status"] = v
                        break
            if not record.get("Status"):
                rrc = record.get("R-R Comments", "")
                if rrc:
                    record["Status"] = rrc

            record["Entry Type"] = "Credit" if amt_val < 0 else "Charge"

            data_rows.append(record)
            all_items_list.append(record)

        sections[sec_name] = {
            "header": header,
            "colmap": col_map,
            "rows": data_rows,
            "totals": totals,
        }

    # ---- Grand totals ----
    df = pd.DataFrame(all_items_list)
    if df.empty:
        df = pd.DataFrame(columns=["Section", "Amount", "Entry Type"])

    grand = {}
    for sec_name, sec_data in sections.items():
        for k, v in sec_data["totals"].items():
            if "total overdue" in k:
                grand["total_overdue"] = v
            elif "overdue" in k:
                grand.setdefault("section_overdue", {})[sec_name] = v
            elif "available credit" in k:
                grand.setdefault("available_credits", {})[sec_name] = v
            elif "total" in k:
                grand.setdefault("section_totals", {})[sec_name] = v

    if not df.empty:
        grand["total_charges"] = float(df.loc[df["Amount"] > 0, "Amount"].sum())
        grand["total_credits"] = float(df.loc[df["Amount"] < 0, "Amount"].sum())
        grand["net_balance"]   = float(df["Amount"].sum())
        grand["item_count"]    = int(len(df))
        if "total_overdue" not in grand:
            overdue_sum = sum(grand.get("section_overdue", {}).values())
            if overdue_sum:
                grand["total_overdue"] = overdue_sum

    return {
        "metadata": metadata,
        "sections": sections,
        "all_items": all_items_list,
        "grand_totals": grand,
    }


# ─────────────────────────────────────────────────────────────
# JSON SERIALIZATION HELPERS
# ─────────────────────────────────────────────────────────────

def _serialize_value(val):
    """Convert a single value to JSON-serializable form."""
    if val is None:
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.isoformat()
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        f = float(val)
        return None if math.isnan(f) else f
    if isinstance(val, (np.bool_,)):
        return bool(val)
    return val


def serialize_parsed_data(parsed: dict) -> dict:
    """Convert parsed workbook data to fully JSON-serializable dict.

    Handles: datetime -> ISO string, NaN -> None, numpy types -> Python types,
    OrderedDict -> dict, DataFrame -> list of dicts.
    """
    result = {}

    # Metadata
    meta = {}
    for k, v in parsed["metadata"].items():
        meta[k] = _serialize_value(v)
    result["metadata"] = meta

    # Sections
    sections = {}
    for sec_name, sec_data in parsed["sections"].items():
        rows = []
        for row in sec_data["rows"]:
            rows.append({k: _serialize_value(v) for k, v in row.items()})
        sections[sec_name] = {
            "header": sec_data.get("header"),
            "rows": rows,
            "totals": {k: _serialize_value(v) for k, v in sec_data.get("totals", {}).items()},
        }
    result["sections"] = sections

    # All items (already list of dicts from our modified parser)
    items = parsed.get("all_items", [])
    if isinstance(items, pd.DataFrame):
        items = items.to_dict("records")
    result["all_items"] = [
        {k: _serialize_value(v) for k, v in row.items()} for row in items
    ]

    # Grand totals
    grand = {}
    for k, v in parsed["grand_totals"].items():
        if isinstance(v, dict):
            grand[k] = {sk: _serialize_value(sv) for sk, sv in v.items()}
        else:
            grand[k] = _serialize_value(v)
    result["grand_totals"] = grand

    return result
