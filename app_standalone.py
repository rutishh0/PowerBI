"""
Rolls-Royce Civil Aerospace — Statement of Account Dashboard (Standalone)
=========================================================================
Zero-dependency version — runs with only Python standard library.
Usage:  python app_standalone.py
Then open http://localhost:8050 in your browser (auto-opens).

Replaces: streamlit, pandas, plotly, openpyxl, numpy
With:     http.server, zipfile, xml.etree, json, math
Charts:   Chart.js loaded from CDN
"""

import os, sys, io, re, math, json, zipfile, html as html_mod, threading, webbrowser, cgi
from datetime import datetime, timedelta
from collections import OrderedDict
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import xml.etree.ElementTree as ET

PORT = 8050

# ─────────────────────────────────────────────────────────────
# 0.  COLOUR PALETTE
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
AGING_COLORS = {"Current": "#2E7D32", "1-30 Days": "#66BB6A", "31-60 Days": "#F9A825",
                "61-90 Days": "#EF6C00", "91-180 Days": "#D32F2F", "180+ Days": "#B71C1C", "Unknown": "#9E9E9E"}

# ─────────────────────────────────────────────────────────────
# 1.  PURE-PYTHON XLSX READER
# ─────────────────────────────────────────────────────────────
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def _col_letter_to_idx(col_str):
    """Convert Excel column letter(s) to 0-based index. A→0, B→1, Z→25, AA→26."""
    result = 0
    for ch in col_str:
        result = result * 26 + (ord(ch.upper()) - ord('A') + 1)
    return result - 1

def _cell_ref_to_col(ref):
    """Extract column index from cell reference like 'AB12'."""
    col_str = re.match(r"([A-Z]+)", ref)
    return _col_letter_to_idx(col_str.group(1)) if col_str else 0

def _excel_serial_to_date(serial):
    """Convert Excel serial number to datetime."""
    try:
        serial = float(serial)
    except (ValueError, TypeError):
        return None
    if serial < 1 or serial > 200000:
        return None
    return datetime(1899, 12, 30) + timedelta(days=int(serial))

def read_xlsx(file_bytes):
    """Read an .xlsx file (as bytes) and return (sheet_name, list_of_rows).
    Each row is a list of values (str, float, or None)."""
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        # --- Shared Strings ---
        shared_strings = []
        if "xl/sharedStrings.xml" in zf.namelist():
            ss_xml = zf.read("xl/sharedStrings.xml")
            ss_tree = ET.fromstring(ss_xml)
            for si in ss_tree.findall(f"{NS}si"):
                # May have <t> directly or <r><t> runs
                texts = []
                t_el = si.find(f"{NS}t")
                if t_el is not None and t_el.text:
                    texts.append(t_el.text)
                else:
                    for r in si.findall(f"{NS}r"):
                        rt = r.find(f"{NS}t")
                        if rt is not None and rt.text:
                            texts.append(rt.text)
                shared_strings.append("".join(texts))

        # --- Date format detection from styles ---
        date_style_indices = set()
        BUILTIN_DATE_FMTS = set(range(14, 23)) | {45, 46, 47}
        if "xl/styles.xml" in zf.namelist():
            st_xml = zf.read("xl/styles.xml")
            st_tree = ET.fromstring(st_xml)
            # Custom date formats
            custom_date_fmts = set()
            nf_el = st_tree.find(f"{NS}numFmts")
            if nf_el is not None:
                for nf in nf_el.findall(f"{NS}numFmt"):
                    fid = int(nf.get("numFmtId", "0"))
                    code = (nf.get("formatCode") or "").lower()
                    if any(p in code for p in ["yy", "mm", "dd", "d/m", "m/d"]) and "h" not in code:
                        custom_date_fmts.add(fid)
            # Cell format index → numFmtId
            xfs_el = st_tree.find(f"{NS}cellXfs")
            if xfs_el is not None:
                for i, xf in enumerate(xfs_el.findall(f"{NS}xf")):
                    nfid = int(xf.get("numFmtId", "0"))
                    if nfid in BUILTIN_DATE_FMTS or nfid in custom_date_fmts:
                        date_style_indices.add(i)

        # --- Workbook: sheet names ---
        wb_xml = zf.read("xl/workbook.xml")
        wb_tree = ET.fromstring(wb_xml)
        sheets = []
        for s in wb_tree.find(f"{NS}sheets").findall(f"{NS}sheet"):
            sheets.append(s.get("name"))

        # --- Read first worksheet ---
        ws_path = "xl/worksheets/sheet1.xml"
        ws_xml = zf.read(ws_path)
        ws_tree = ET.fromstring(ws_xml)

        rows_out = []
        max_col = 0
        for row_el in ws_tree.iter(f"{NS}row"):
            row_idx = int(row_el.get("r", "1")) - 1
            # Extend rows_out to reach this row
            while len(rows_out) <= row_idx:
                rows_out.append([])
            row_data = rows_out[row_idx]

            for c_el in row_el.findall(f"{NS}c"):
                ref = c_el.get("r", "A1")
                col_idx = _cell_ref_to_col(ref)
                cell_type = c_el.get("t", "")
                style_idx = int(c_el.get("s", "0"))
                v_el = c_el.find(f"{NS}v")
                val = None

                if cell_type == "s" and v_el is not None:
                    # Shared string
                    idx = int(v_el.text)
                    val = shared_strings[idx] if idx < len(shared_strings) else None
                elif cell_type == "inlineStr":
                    is_el = c_el.find(f"{NS}is")
                    if is_el is not None:
                        t_el = is_el.find(f"{NS}t")
                        val = t_el.text if t_el is not None else None
                elif cell_type == "b" and v_el is not None:
                    val = v_el.text == "1"
                elif v_el is not None and v_el.text:
                    # Number or date
                    try:
                        num = float(v_el.text)
                        if style_idx in date_style_indices:
                            val = _excel_serial_to_date(num)
                        else:
                            val = int(num) if num == int(num) and abs(num) < 1e15 else num
                    except ValueError:
                        val = v_el.text

                # Place value in row
                while len(row_data) <= col_idx:
                    row_data.append(None)
                row_data[col_idx] = val
                max_col = max(max_col, col_idx + 1)

        # Pad all rows to same width
        for r in rows_out:
            while len(r) < max_col:
                r.append(None)

        return sheets[0] if sheets else "Sheet1", rows_out


# ─────────────────────────────────────────────────────────────
# 2.  SOA PARSER  (ported from app.py — no pandas/numpy)
# ─────────────────────────────────────────────────────────────
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

def _is_section_header(row_values, col_count):
    non_empty = [(i, v) for i, v in enumerate(row_values) if v is not None]
    if not non_empty or len(non_empty) > 3:
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

def _is_header_row(row_values):
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

def _is_summary_row(row_values):
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

def _coerce_amount(val):
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
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    # Try Excel serial number
    if isinstance(val, (int, float)):
        d = _excel_serial_to_date(val)
        if d:
            return d
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

def _normalise_header(raw):
    result = []
    for h in raw:
        if h is None:
            result.append(None)
            continue
        s = re.sub(r"\s+", " ", str(h).strip())
        result.append(s)
    return result

def _map_columns(header):
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
        elif "reference" in h:
            mapping["reference"] = i
        elif "company" in h:
            mapping["company"] = i
        elif "account" in h:
            mapping["account"] = i
        elif h == "text":
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
        elif "customer" in h and "comment" not in h and "name" not in h and "respon" not in h:
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

def _find_amount_col(header):
    for i, h in enumerate(header):
        if h and "amount" in str(h).lower():
            return i
    return None

def parse_soa(file_bytes):
    """Parse an SOA workbook from raw bytes. Returns dict with metadata, sections, all_items, grand_totals."""
    sheet_name, all_rows = read_xlsx(file_bytes)
    max_col = max((len(r) for r in all_rows), default=20)

    # ---- Metadata ----
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

    # ---- Identify section boundaries ----
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
        sec["end"] = sections_info[i + 1]["start"] if i + 1 < len(sections_info) else len(all_rows)

    # ---- Parse each section ----
    sections = OrderedDict()
    all_items = []

    for sec in sections_info:
        sec_name = sec["name"]
        start, end = sec["start"], sec["end"]
        header = master_header
        header_idx = master_header_idx
        for offset in range(1, 4):
            ri = start + offset
            if ri >= end:
                break
            if _is_header_row(all_rows[ri]):
                header = _normalise_header(all_rows[ri])
                header_idx = ri
                break
        col_map = _map_columns(header) if header else {}
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

            record = {"Section": sec_name, "Amount": amt_val}
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

            if record["Days Late"] is None and record["Due Date"] is not None:
                try:
                    due = record["Due Date"]
                    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                    record["Days Late"] = max(0, (today - due).days)
                except Exception:
                    pass

            if not record.get("Status"):
                for field in ["R-R Comments", "Action Owner", "Customer Comments"]:
                    v = record.get(field, "")
                    if v and any(kw in v.lower() for kw in ["ready for payment", "under approval",
                            "under review", "dispute", "ongoing", "payment pending",
                            "invoice sent", "credit note", "approved", "transfer",
                            "invoice approved", "pending for payment"]):
                        record["Status"] = v
                        break
            if not record.get("Status"):
                rrc = record.get("R-R Comments", "")
                if rrc:
                    record["Status"] = rrc

            record["Entry Type"] = "Credit" if amt_val < 0 else "Charge"
            data_rows.append(record)
            all_items.append(record)

        sections[sec_name] = {"header": header, "colmap": col_map, "rows": data_rows, "totals": totals}

    # ---- Grand totals ----
    grand = {}
    for sn, sd in sections.items():
        for k, v in sd["totals"].items():
            if "total overdue" in k:
                grand["total_overdue"] = v
            elif "overdue" in k:
                grand.setdefault("section_overdue", {})[sn] = v
            elif "available credit" in k:
                grand.setdefault("available_credits", {})[sn] = v
            elif "total" in k:
                grand.setdefault("section_totals", {})[sn] = v
    if all_items:
        grand["total_charges"] = sum(r["Amount"] for r in all_items if r["Amount"] > 0)
        grand["total_credits"] = sum(r["Amount"] for r in all_items if r["Amount"] < 0)
        grand["net_balance"]   = sum(r["Amount"] for r in all_items)
        grand["item_count"]    = len(all_items)
        if "total_overdue" not in grand:
            ov = sum(grand.get("section_overdue", {}).values())
            if ov:
                grand["total_overdue"] = ov

    return {"metadata": metadata, "sections": sections, "all_items": all_items, "grand_totals": grand}


# ─────────────────────────────────────────────────────────────
# 3.  FORMATTING HELPERS
# ─────────────────────────────────────────────────────────────
def fmt_currency(val, short=False):
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

def fmt_date(val):
    if val is None:
        return "\u2014"
    if isinstance(val, datetime):
        return val.strftime("%d/%m/%Y")
    return str(val)

def esc(val):
    """HTML-escape a value."""
    if val is None:
        return "\u2014"
    return html_mod.escape(str(val))

def aging_bucket(days):
    if days is None:
        return "Unknown"
    d = int(days)
    if d <= 0: return "Current"
    elif d <= 30: return "1-30 Days"
    elif d <= 60: return "31-60 Days"
    elif d <= 90: return "61-90 Days"
    elif d <= 180: return "91-180 Days"
    else: return "180+ Days"


# ─────────────────────────────────────────────────────────────
# 4.  CSS
# ─────────────────────────────────────────────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#F0F1F5;color:#1a1a2e;padding:1.5rem 2.5rem;min-height:100vh}
.rr-header{background:linear-gradient(135deg,#10069F 0%,#0C0033 100%);padding:1.8rem 2.2rem;border-radius:14px;
    margin-bottom:1.4rem;display:flex;align-items:center;justify-content:space-between;
    box-shadow:0 6px 24px rgba(16,6,159,.30)}
.rr-header .title{color:#FFFFFF;font-size:1.65rem;font-weight:700;letter-spacing:.5px}
.rr-header .subtitle{color:#D0D0E0;font-size:.92rem;margin-top:.2rem;font-weight:400}
.rr-logo-text{color:#FFFFFF;font-size:1.15rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;
    border:2px solid rgba(255,255,255,.6);padding:.4rem 1rem;border-radius:4px}
.grid{display:grid;gap:1rem}.grid-6{grid-template-columns:repeat(6,1fr)}
.grid-5{grid-template-columns:repeat(5,1fr)}.grid-3{grid-template-columns:repeat(3,1fr)}
.grid-2{grid-template-columns:repeat(2,1fr)}
.metric-card{background:#FFF;border-radius:12px;padding:1.2rem 1rem;text-align:center;
    border-left:5px solid #10069F;box-shadow:0 2px 12px rgba(0,0,0,.08);transition:transform .15s}
.metric-card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.12)}
.metric-card .label{color:#444;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.9px;margin-bottom:.35rem}
.metric-card .value{color:#0C0033;font-size:1.45rem;font-weight:800}
.metric-card .value.negative{color:#C62828}.metric-card .value.positive{color:#1B5E20}
.section-hdr{background:linear-gradient(90deg,#10069F,#1565C0);color:#FFF;padding:.7rem 1.4rem;
    border-radius:8px;font-weight:700;font-size:1.05rem;margin:1.8rem 0 1rem 0;letter-spacing:.5px;
    box-shadow:0 2px 8px rgba(16,6,159,.18)}
.info-bar{background:#FFF;padding:1rem 1.8rem;border-radius:12px;margin-bottom:1.2rem;
    display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
    box-shadow:0 2px 10px rgba(0,0,0,.07);border:1px solid #E0E1EC}
.info-chip{display:inline-block;background:#E0E1EC;padding:.3rem .75rem;border-radius:6px;
    font-size:.82rem;color:#1a1a2e;font-weight:500;margin-right:.5rem;margin-bottom:.35rem;border:1px solid #D0D1DC}
.info-chip b{color:#0C0033}
.chart-box{background:#FFF;border-radius:12px;padding:1rem;box-shadow:0 2px 10px rgba(0,0,0,.06);min-height:380px}
table.data-table{width:100%;border-collapse:collapse;font-size:.84rem;border-radius:10px;overflow:hidden;
    box-shadow:0 2px 10px rgba(0,0,0,.08)}
table.data-table th{background:#10069F;color:#FFF;font-weight:600;font-size:.82rem;padding:.7rem .6rem;
    text-align:left;white-space:nowrap}
table.data-table td{color:#1a1a2e;font-size:.84rem;padding:.6rem;border-bottom:1px solid #E8E8EE}
table.data-table tr:nth-child(even){background:#F5F5FA}
table.data-table tr:hover{background:#EEEEF5}
.tab-bar{display:flex;gap:6px;margin-bottom:1rem;flex-wrap:wrap}
.tab-btn{background:#FFF;border-radius:8px 8px 0 0;padding:.65rem 1.3rem;font-weight:600;color:#333;
    border:1px solid #CCC;border-bottom:none;font-size:.9rem;cursor:pointer;font-family:inherit}
.tab-btn.active{background:#10069F;color:#FFF;border-color:#10069F}
.tab-panel{display:none}.tab-panel.active{display:block}
.filter-row{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;align-items:flex-end}
.filter-group label{display:block;font-weight:600;font-size:.85rem;margin-bottom:.3rem;color:#1a1a2e}
.filter-group select,.filter-group input{font-family:inherit;font-size:.85rem;padding:.45rem .6rem;
    border:1px solid #CCC;border-radius:6px;background:#FFF;color:#1a1a2e}
.summary-metrics{display:flex;gap:2rem;margin-top:1rem}
.summary-metrics .sm{text-align:center}
.summary-metrics .sm .sm-label{color:#555;font-weight:600;font-size:.82rem}
.summary-metrics .sm .sm-val{color:#0C0033;font-weight:700;font-size:1.3rem}
.table-wrap{max-height:500px;overflow:auto;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.footer{text-align:center;color:#999;font-size:.75rem;padding:2rem 0 1rem 0}
.footer b{color:#666}
@media(max-width:900px){.grid-6{grid-template-columns:repeat(3,1fr)}
    .grid-5{grid-template-columns:repeat(2,1fr)}.grid-2,.grid-3{grid-template-columns:1fr}
    body{padding:1rem}}
"""

# ─────────────────────────────────────────────────────────────
# 5.  HTML BUILDERS
# ─────────────────────────────────────────────────────────────
def _metric_card_html(label, value, cls=""):
    return f'<div class="metric-card"><div class="label">{esc(label)}</div><div class="value {cls}">{esc(value)}</div></div>'

def _section_hdr(text):
    return f'<div class="section-hdr">{esc(text)}</div>'

def _build_table_html(rows, columns, table_id=""):
    """Build an HTML table from list-of-dicts."""
    h = f'<div class="table-wrap"><table class="data-table" id="{table_id}"><thead><tr>'
    for c in columns:
        h += f"<th>{esc(c)}</th>"
    h += "</tr></thead><tbody>"
    for r in rows:
        h += "<tr>"
        for c in columns:
            val = r.get(c)
            if isinstance(val, datetime):
                val = fmt_date(val)
            elif c == "Amount" and isinstance(val, (int, float)):
                val = fmt_currency(val)
            h += f"<td>{esc(val)}</td>"
        h += "</tr>"
    h += "</tbody></table></div>"
    return h

def _get_display_cols(rows):
    preferred = ["Section","Reference","Document No","Document Date","Due Date","Amount",
                 "Currency","Text","Type","Assignment","R-R Comments","Status","Action Owner",
                 "Days Late","Customer Comments","Customer Name","PO Reference","LPI Cumulated",
                 "Interest Method","Entry Type"]
    cols = []
    for c in preferred:
        if any(r.get(c) is not None for r in rows):
            cols.append(c)
    for r in rows:
        for c in r:
            if c not in cols and c != "Section" and any(row.get(c) is not None for row in rows):
                cols.append(c)
                break
    return cols


def build_dashboard_html(data):
    """Build the complete dashboard HTML page from parsed data."""
    meta = data["metadata"]
    sections = data["sections"]
    all_items = data["all_items"]
    grand = data["grand_totals"]

    cust_name = meta.get("customer_name", "Unknown Customer")
    cust_id   = meta.get("customer_id", "\u2014")
    contact   = meta.get("contact", "\u2014")
    lpi_rate  = meta.get("lpi_rate")
    avg_late  = meta.get("avg_days_late")
    report_dt = meta.get("report_date")

    total_charges = grand.get("total_charges", 0)
    total_credits = grand.get("total_credits", 0)
    net_balance   = grand.get("net_balance", 0)
    total_overdue = grand.get("total_overdue", net_balance)
    item_count    = grand.get("item_count", 0)

    # Start HTML
    html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rolls-Royce SOA Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>{CSS}</style></head><body>
"""
    # ---- Header ----
    html += """<div class="rr-header"><div>
<div class="title">Statement of Account Dashboard</div>
<div class="subtitle">Rolls-Royce Civil Aerospace &mdash; Finance &amp; Receivables</div>
</div><div class="rr-logo-text">ROLLS-ROYCE</div></div>
"""
    # ---- Customer Info Bar ----
    chips = f'<span class="info-chip">ID: {esc(cust_id)}</span><span class="info-chip">{esc(contact)}</span>'
    right_chips = ""
    if lpi_rate:
        right_chips += f'<span class="info-chip"><b>LPI Rate:</b> {lpi_rate*100:.2f}%</span>'
    if avg_late:
        right_chips += f'<span class="info-chip"><b>Avg Days Late:</b> {avg_late}</span>'
    if report_dt:
        right_chips += f'<span class="info-chip"><b>Report:</b> {report_dt.strftime("%d %b %Y")}</span>'
    html += f"""<div class="info-bar"><div><span style="font-weight:800;color:#0C0033;font-size:1.15rem">{esc(cust_name)}</span>
{chips}</div><div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">{right_chips}</div></div>
"""
    # ---- KPI Cards ----
    kpis = [
        ("Total Charges", fmt_currency(total_charges, True), ""),
        ("Total Credits", fmt_currency(total_credits, True), "positive" if total_credits < 0 else ""),
        ("Net Balance", fmt_currency(net_balance, True), "negative" if net_balance > 0 else "positive"),
        ("Total Overdue", fmt_currency(total_overdue, True), "negative"),
        ("Avg Days Late", str(avg_late) if avg_late else "\u2014", ""),
        ("Open Items", str(item_count), ""),
    ]
    html += '<div class="grid grid-6">'
    for label, value, cls in kpis:
        html += _metric_card_html(label, value, cls)
    html += '</div>'

    # ---- Executive Overview ----
    html += _section_hdr("Executive Overview")
    html += '<div class="grid grid-3">'

    # Chart 1: Breakdown by Section (donut)
    sec_amounts = {}
    for r in all_items:
        sec_amounts[r["Section"]] = sec_amounts.get(r["Section"], 0) + abs(r["Amount"])
    sec_labels = list(sec_amounts.keys())
    sec_values = [sec_amounts[s] for s in sec_labels]
    colors_1 = SECTION_COLOURS[:len(sec_labels)]
    html += f"""<div class="chart-box"><canvas id="chartDonut"></canvas>
<script>new Chart(document.getElementById('chartDonut'),{{type:'doughnut',
data:{{labels:{json.dumps(sec_labels)},datasets:[{{data:{json.dumps(sec_values)},
backgroundColor:{json.dumps(colors_1)},borderColor:'#FFF',borderWidth:2}}]}},
options:{{responsive:true,plugins:{{title:{{display:true,text:'Breakdown by Section',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{position:'bottom',labels:{{font:{{size:11}},color:'#333'}}}}}},cutout:'55%'}}}});</script></div>"""

    # Chart 2: Charges vs Credits by Section
    charge_data = {}
    credit_data = {}
    for r in all_items:
        s = r["Section"]
        if r["Amount"] > 0:
            charge_data[s] = charge_data.get(s, 0) + r["Amount"]
        else:
            credit_data[s] = credit_data.get(s, 0) + abs(r["Amount"])
    all_secs = list(dict.fromkeys(r["Section"] for r in all_items))
    ch_vals = [round(charge_data.get(s, 0), 2) for s in all_secs]
    cr_vals = [round(credit_data.get(s, 0), 2) for s in all_secs]
    html += f"""<div class="chart-box"><canvas id="chartCC"></canvas>
<script>new Chart(document.getElementById('chartCC'),{{type:'bar',
data:{{labels:{json.dumps(all_secs)},datasets:[
{{label:'Charges',data:{json.dumps(ch_vals)},backgroundColor:'{RR_NAVY}'}},
{{label:'Credits',data:{json.dumps(cr_vals)},backgroundColor:'{RR_GREEN}'}}]}},
options:{{responsive:true,plugins:{{title:{{display:true,text:'Charges vs Credits by Section',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{labels:{{color:'#333'}}}}}},scales:{{x:{{ticks:{{color:'#333'}}}},y:{{ticks:{{color:'#333'}},grid:{{color:'#E0E0E0'}}}}}}}}}});</script></div>"""

    # Chart 3: Aging Analysis
    aging_data = {}
    for r in all_items:
        b = aging_bucket(r.get("Days Late"))
        aging_data[b] = aging_data.get(b, 0) + r["Amount"]
    aging_labels = [b for b in AGING_ORDER if b in aging_data]
    aging_vals = [round(aging_data[b], 2) for b in aging_labels]
    aging_cols = [AGING_COLORS.get(b, "#999") for b in aging_labels]
    html += f"""<div class="chart-box"><canvas id="chartAging"></canvas>
<script>new Chart(document.getElementById('chartAging'),{{type:'bar',
data:{{labels:{json.dumps(aging_labels)},datasets:[{{data:{json.dumps(aging_vals)},
backgroundColor:{json.dumps(aging_cols)}}}]}},
options:{{responsive:true,plugins:{{title:{{display:true,text:'Aging Analysis',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#333'}}}},y:{{ticks:{{color:'#333'}},grid:{{color:'#E0E0E0'}}}}}}}}}});</script></div>"""
    html += '</div>'  # end grid-3

    # ---- Bilateral Position ----
    html += _section_hdr("Bilateral Position")
    html += '<div class="grid grid-2">'
    they_owe = sum(r["Amount"] for r in all_items if r["Amount"] > 0)
    we_owe = abs(sum(r["Amount"] for r in all_items if r["Amount"] < 0))
    html += f"""<div class="chart-box"><canvas id="chartBP"></canvas>
<script>new Chart(document.getElementById('chartBP'),{{type:'bar',
data:{{labels:['Customer → RR (Charges)','RR → Customer (Credits)'],
datasets:[{{data:[{they_owe:.2f},{we_owe:.2f}],backgroundColor:['{RR_NAVY}','{RR_GREEN}']}}]}},
options:{{responsive:true,plugins:{{title:{{display:true,text:'Bilateral Position',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#333'}}}},y:{{ticks:{{color:'#333'}},grid:{{color:'#E0E0E0'}}}}}}}}}});</script></div>"""

    # Net Balance by Section (horizontal bar)
    sec_net = {}
    for r in all_items:
        sec_net[r["Section"]] = sec_net.get(r["Section"], 0) + r["Amount"]
    sn_labels = list(sec_net.keys())
    sn_vals = [round(sec_net[s], 2) for s in sn_labels]
    sn_colors = [RR_NAVY if v > 0 else RR_GREEN for v in sn_vals]
    html += f"""<div class="chart-box"><canvas id="chartSN"></canvas>
<script>new Chart(document.getElementById('chartSN'),{{type:'bar',
data:{{labels:{json.dumps(sn_labels)},datasets:[{{data:{json.dumps(sn_vals)},
backgroundColor:{json.dumps(sn_colors)}}}]}},
options:{{indexAxis:'y',responsive:true,plugins:{{title:{{display:true,text:'Net Balance by Section',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#333'}},grid:{{color:'#E0E0E0'}}}},y:{{ticks:{{color:'#333'}}}}}}}}}});</script></div>"""
    html += '</div>'

    # ---- Section Breakdown (Tabs) ----
    html += _section_hdr("Section Breakdown")
    tab_names = list(sections.keys())
    html += '<div class="tab-bar">'
    for i, tn in enumerate(tab_names):
        cls = " active" if i == 0 else ""
        html += f'<button class="tab-btn{cls}" onclick="switchTab({i})">{esc(tn)}</button>'
    html += '</div>'

    chart_idx = 0
    for i, sec_name in enumerate(tab_names):
        sec = sections[sec_name]
        sec_rows = sec["rows"]
        active = " active" if i == 0 else ""
        html += f'<div class="tab-panel{active}" id="tabpanel-{i}">'

        if not sec_rows:
            html += f'<p>No line items found in <b>{esc(sec_name)}</b>.</p></div>'
            continue

        sec_totals = sec["totals"]
        sec_total = sec_totals.get("total", sum(r["Amount"] for r in sec_rows))
        sec_charges = sum(r["Amount"] for r in sec_rows if r["Amount"] > 0)
        sec_credits = sum(r["Amount"] for r in sec_rows if r["Amount"] < 0)
        sec_overdue = sec_totals.get("overdue")
        sec_credits_avail = sec_totals.get("available credit")
        sec_items = len(sec_rows)

        html += '<div class="grid grid-5" style="margin-bottom:1rem">'
        html += _metric_card_html("Section Total", fmt_currency(sec_total, True))
        html += _metric_card_html("Charges", fmt_currency(sec_charges, True))
        html += _metric_card_html("Credits", fmt_currency(sec_credits, True), "positive")
        if sec_overdue is not None:
            html += _metric_card_html("Overdue", fmt_currency(sec_overdue, True), "negative")
        else:
            html += _metric_card_html("Items", str(sec_items))
        if sec_credits_avail is not None:
            html += _metric_card_html("Available Credit", fmt_currency(sec_credits_avail, True), "positive")
        else:
            html += _metric_card_html("Net", fmt_currency(sec_charges + sec_credits, True))
        html += '</div>'

        # Charts row
        html += '<div class="grid grid-2" style="margin-bottom:1rem">'

        # Status Distribution (pie)
        status_counts = {}
        for r in sec_rows:
            st = r.get("Status") or "Unknown"
            st = st[:40] + "..." if len(str(st)) > 40 else st
            status_counts[st] = status_counts.get(st, 0) + 1
        st_labels = list(status_counts.keys())
        st_vals = [status_counts[s] for s in st_labels]
        st_colors = SECTION_COLOURS[:len(st_labels)]
        cid_pie = f"secPie{chart_idx}"
        html += f"""<div class="chart-box"><canvas id="{cid_pie}"></canvas>
<script>new Chart(document.getElementById('{cid_pie}'),{{type:'pie',
data:{{labels:{json.dumps(st_labels)},datasets:[{{data:{json.dumps(st_vals)},
backgroundColor:{json.dumps(st_colors)}}}]}},
options:{{responsive:true,plugins:{{title:{{display:true,text:'Status Distribution',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{position:'right',labels:{{font:{{size:11}},color:'#333'}}}}}}}}}});</script></div>"""

        # Top Items by Amount (horizontal bar)
        sorted_items = sorted(sec_rows, key=lambda r: r["Amount"], reverse=True)[:8]
        top_labels = []
        top_vals = []
        for r in sorted_items:
            lbl = (r.get("Text") or r.get("Assignment") or r.get("Reference") or "Item")[:35]
            ref = r.get("Reference")
            if ref:
                lbl = f"{lbl} ({ref})"
            top_labels.append(lbl)
            top_vals.append(round(r["Amount"], 2))
        cid_bar = f"secBar{chart_idx}"
        html += f"""<div class="chart-box"><canvas id="{cid_bar}"></canvas>
<script>new Chart(document.getElementById('{cid_bar}'),{{type:'bar',
data:{{labels:{json.dumps(top_labels)},datasets:[{{data:{json.dumps(top_vals)},
backgroundColor:'{RR_NAVY}'}}]}},
options:{{indexAxis:'y',responsive:true,plugins:{{title:{{display:true,text:'Top Items by Amount',font:{{size:15,weight:'bold'}},color:'#1a1a2e'}},
legend:{{display:false}}}},scales:{{x:{{ticks:{{color:'#333'}},grid:{{color:'#E0E0E0'}}}},y:{{ticks:{{color:'#333',font:{{size:10}}}}}}}}}}}});</script></div>"""
        html += '</div>'
        chart_idx += 1

        # Detailed table
        html += '<h4 style="margin:1rem 0 .5rem;color:#0C0033">Detailed Line Items</h4>'
        display_cols = _get_display_cols(sec_rows)
        display_cols = [c for c in display_cols if c != "Section"]
        html += _build_table_html(sec_rows, display_cols)
        html += '</div>'  # end tab-panel

    # ---- Complete Invoice Register ----
    html += _section_hdr("Complete Invoice Register")

    # Filters
    all_sections_unique = list(dict.fromkeys(r["Section"] for r in all_items))
    all_types_unique = list(dict.fromkeys(r["Entry Type"] for r in all_items))
    html += '<div class="filter-row">'
    html += '<div class="filter-group"><label>Section</label><select id="filterSection" onchange="filterTable()" multiple style="min-width:200px;height:80px">'
    for s in all_sections_unique:
        html += f'<option value="{esc(s)}" selected>{esc(s)}</option>'
    html += '</select></div>'
    html += '<div class="filter-group"><label>Type</label><select id="filterType" onchange="filterTable()" multiple style="min-width:120px;height:80px">'
    for t in all_types_unique:
        html += f'<option value="{esc(t)}" selected>{esc(t)}</option>'
    html += '</select></div>'
    html += '<div class="filter-group"><label>Search</label><input type="text" id="filterSearch" oninput="filterTable()" placeholder="Search text..." style="width:200px"></div>'
    html += '</div>'

    # Full table with filterable rows
    reg_cols = _get_display_cols(all_items)
    html += '<div class="table-wrap" style="max-height:600px"><table class="data-table" id="registerTable"><thead><tr>'
    for c in reg_cols:
        html += f"<th>{esc(c)}</th>"
    html += "</tr></thead><tbody>"
    for idx, r in enumerate(all_items):
        sec_val = esc(r.get("Section", ""))
        type_val = esc(r.get("Entry Type", ""))
        html += f'<tr data-section="{sec_val}" data-type="{type_val}">'
        for c in reg_cols:
            val = r.get(c)
            if isinstance(val, datetime):
                val = fmt_date(val)
            elif c == "Amount" and isinstance(val, (int, float)):
                val = fmt_currency(val)
            html += f"<td>{esc(val)}</td>"
        html += "</tr>"
    html += "</tbody></table></div>"

    # Summary metrics
    total_sum = sum(r["Amount"] for r in all_items)
    overdue_sum = sum(r["Amount"] for r in all_items if (r.get("Days Late") or 0) > 0)
    html += f"""<div class="summary-metrics" id="summaryMetrics">
<div class="sm"><div class="sm-label">Filtered Items</div><div class="sm-val" id="smItems">{len(all_items)}</div></div>
<div class="sm"><div class="sm-label">Filtered Total</div><div class="sm-val" id="smTotal">{fmt_currency(total_sum)}</div></div>
<div class="sm"><div class="sm-label">Filtered Overdue</div><div class="sm-val" id="smOverdue">{fmt_currency(overdue_sum)}</div></div>
</div>"""

    # ---- Footer ----
    html += """<hr style="margin:2rem 0 0;border:none;border-top:1px solid #DDD">
<div class="footer"><b>ROLLS-ROYCE</b> CIVIL AEROSPACE &mdash; Statement of Account Dashboard<br>
Data sourced from uploaded workbook &bull; For internal use only</div>"""

    # ---- JavaScript ----
    # Embed raw amounts for filtering summary recalculation
    amounts_json = json.dumps([r["Amount"] for r in all_items])
    days_late_json = json.dumps([r.get("Days Late") or 0 for r in all_items])
    html += f"""
<script>
const rawAmounts = {amounts_json};
const rawDaysLate = {days_late_json};

function switchTab(idx) {{
    document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===idx));
    document.querySelectorAll('.tab-panel').forEach((p,i) => p.classList.toggle('active', i===idx));
}}

function filterTable() {{
    const secSel = document.getElementById('filterSection');
    const typeSel = document.getElementById('filterType');
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const selSections = Array.from(secSel.selectedOptions).map(o => o.value);
    const selTypes = Array.from(typeSel.selectedOptions).map(o => o.value);

    const rows = document.querySelectorAll('#registerTable tbody tr');
    let count = 0, total = 0, overdue = 0;
    rows.forEach((row, i) => {{
        const sec = row.getAttribute('data-section');
        const typ = row.getAttribute('data-type');
        const text = row.textContent.toLowerCase();
        const show = selSections.includes(sec) && selTypes.includes(typ) && (search === '' || text.includes(search));
        row.style.display = show ? '' : 'none';
        if (show) {{
            count++;
            total += rawAmounts[i];
            if (rawDaysLate[i] > 0) overdue += rawAmounts[i];
        }}
    }});
    document.getElementById('smItems').textContent = count;
    document.getElementById('smTotal').textContent = fmtCurrency(total);
    document.getElementById('smOverdue').textContent = fmtCurrency(overdue);
}}

function fmtCurrency(val) {{
    const neg = val < 0;
    const av = Math.abs(val);
    let s = '$' + av.toLocaleString('en-US', {{minimumFractionDigits:2, maximumFractionDigits:2}});
    return neg ? '-' + s : s;
}}
</script>
</body></html>"""
    return html


# ─────────────────────────────────────────────────────────────
# 6.  UPLOAD PAGE
# ─────────────────────────────────────────────────────────────
UPLOAD_HTML = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rolls-Royce SOA Dashboard</title>
<style>{CSS}</style></head><body>
<div class="rr-header"><div>
<div class="title">Statement of Account Dashboard</div>
<div class="subtitle">Rolls-Royce Civil Aerospace &mdash; Finance &amp; Receivables</div>
</div><div class="rr-logo-text">ROLLS-ROYCE</div></div>
<div style="background:#FFF;padding:2.5rem;border-radius:12px;text-align:center;margin:2rem auto;
max-width:600px;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<div style="font-size:3rem;margin-bottom:1rem">✈</div>
<h2 style="color:#10069F;margin-bottom:.5rem">Welcome to the RR SOA Dashboard</h2>
<p style="color:#666;margin-bottom:1.5rem">Upload any Rolls-Royce Statement of Account workbook (.xlsx).<br>
The dashboard automatically detects sections like <b>TotalCare</b>, <b>Spare Parts</b>,
<b>Late Payment Interest</b>, and more.</p>
<form method="POST" action="/upload" enctype="multipart/form-data" style="margin:1.5rem 0">
<input type="file" name="file" accept=".xlsx,.xls" required
style="font-family:inherit;font-size:.95rem;padding:.5rem;border:2px dashed #10069F;border-radius:8px;
background:#F5F5FA;width:100%;cursor:pointer;margin-bottom:1rem">
<br><button type="submit" style="background:linear-gradient(135deg,#10069F,#1565C0);color:#FFF;
border:none;padding:.8rem 2.5rem;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;
font-family:inherit;letter-spacing:.5px;box-shadow:0 4px 12px rgba(16,6,159,.25)">
Upload &amp; Analyse</button>
</form></div>
<div class="footer"><b>ROLLS-ROYCE</b> CIVIL AEROSPACE &mdash; Statement of Account Dashboard<br>
Zero-dependency standalone version &bull; For internal use only</div>
</body></html>"""


# ─────────────────────────────────────────────────────────────
# 7.  HTTP SERVER
# ─────────────────────────────────────────────────────────────
_dashboard_cache = {"html": None}

def _parse_multipart(body, boundary):
    """Parse multipart form data, return dict {field: (filename, bytes)}."""
    parts = body.split(b"--" + boundary)
    result = {}
    for part in parts:
        if b"Content-Disposition" not in part:
            continue
        hdr_end = part.find(b"\r\n\r\n")
        if hdr_end < 0:
            continue
        hdrs = part[:hdr_end].decode("utf-8", errors="replace")
        content = part[hdr_end + 4:]
        if content.endswith(b"\r\n"):
            content = content[:-2]
        nm = re.search(r'name="([^"]+)"', hdrs)
        fn = re.search(r'filename="([^"]*)"', hdrs)
        if nm:
            result[nm.group(1)] = (fn.group(1) if fn else None, content)
    return result


class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/dashboard" and _dashboard_cache["html"]:
            self._respond(200, _dashboard_cache["html"])
        else:
            self._respond(200, UPLOAD_HTML)

    def do_POST(self):
        if urlparse(self.path).path == "/upload":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            content_type = self.headers.get("Content-Type", "")
            boundary = content_type.split("boundary=")[-1].encode()
            parts = _parse_multipart(body, boundary)
            file_data = parts.get("file")
            if file_data and file_data[1]:
                try:
                    data = parse_soa(file_data[1])
                    _dashboard_cache["html"] = build_dashboard_html(data)
                    self.send_response(303)
                    self.send_header("Location", "/dashboard")
                    self.end_headers()
                    return
                except Exception as e:
                    self._respond(500, f"<html><body><h2>Error parsing file</h2><pre>{html_mod.escape(str(e))}</pre>"
                                       f"<a href='/'>Try again</a></body></html>")
                    return
        self._respond(400, "<html><body><h2>Bad request</h2><a href='/'>Go back</a></body></html>")

    def _respond(self, code, html_content):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        encoded = html_content.encode("utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, fmt, *args):
        # Suppress default request logging clutter
        pass


# ─────────────────────────────────────────────────────────────
# 8.  MAIN
# ─────────────────────────────────────────────────────────────
def main():
    server = HTTPServer(("", PORT), DashboardHandler)
    url = f"http://localhost:{PORT}"
    print(f"\n  ╔══════════════════════════════════════════════════╗")
    print(f"  ║  Rolls-Royce SOA Dashboard (Standalone)          ║")
    print(f"  ║  Running at: {url:<36} ║")
    print(f"  ║  Press Ctrl+C to stop                            ║")
    print(f"  ╚══════════════════════════════════════════════════╝\n")
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()

if __name__ == "__main__":
    main()
