"""
PDF Export Module for Rolls-Royce Opportunity Tracker
=====================================================
Generates a premium, multi-page branded PDF report that mirrors the
dashboard layout: KPI cards, priority breakdown, estimation levels,
top-opportunities table, opps & threats, and project summary.
"""

import pandas as pd
from datetime import datetime
from fpdf import FPDF
import math

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe(text) -> str:
    """Sanitize text for fpdf2 Helvetica (replace Unicode chars with ASCII)."""
    if text is None:
        return "-"
    s = str(text)
    for old, new in [
        ("\u2014", "-"), ("\u2013", "-"), ("\u2018", "'"), ("\u2019", "'"),
        ("\u201c", '"'), ("\u201d", '"'), ("\u2026", "..."), ("\u00a0", " "),
        ("\n", " "), ("\r", ""),
    ]:
        s = s.replace(old, new)
    return s.strip()


def _val(v):
    if v is None:
        return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("\u20ac", "").replace("\u00a3", "")
        return float(v)
    except Exception:
        return 0.0


def _fmtM(val):
    """Format as $X.Xm"""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.1f}m"


def _fmtK(val):
    """Format as $X,XXX"""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.0f}"


def _trunc(s, maxlen):
    s = _safe(s)
    return s[:maxlen - 2] + ".." if len(s) > maxlen else s


def _generate_charts(records):
    """Generate a horizontal strip of 3 styling charts and return as BytesIO PNG."""
    NAVY    = '#03002e'
    ACCENT  = '#10069f'
    GREEN   = '#00c875'
    AMBER   = '#ffb300'
    CYAN    = '#00c8ff'
    GREY    = '#828296'
    
    plt.style.use('default')
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(11, 3.5), dpi=150)
    fig.patch.set_facecolor('white')
    
    def clean_ax(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#E8E8EE')
        ax.spines['bottom'].set_color('#E8E8EE')
        ax.tick_params(colors=GREY, labelsize=8)
        ax.title.set_color(NAVY)
        ax.title.set_fontsize(10)
        ax.title.set_weight('bold')

    # CHART 1: Priority Doughnut
    by_priority = {}
    for r in records:
        p = str(r.get('priority', '?')).replace('.0', '')
        if p in ('', 'None', 'nan'): p = '?'
        if p == '?': continue
        by_priority[p] = by_priority.get(p, 0) + _val(r.get('sum_26_27'))
    
    p_keys = sorted(by_priority.keys())
    p_vals = [by_priority[k] for k in p_keys]
    p_labels = [f"Priority {k}" for k in p_keys]
    color_map = {'1': GREEN, '2': ACCENT, '3': AMBER}
    p_colors = [color_map.get(k, CYAN) for k in p_keys]
    
    if sum(p_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            p_vals, labels=p_labels, autopct='%1.0f%%', 
            colors=p_colors, startangle=90,
            textprops={'color': NAVY, 'fontsize': 8, 'weight': 'bold'},
            wedgeprops={'width': 0.4, 'edgecolor': 'white', 'linewidth': 2}
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
    ax1.set_title("Value by Priority (26+27)")

    # CHART 2: Estimation Level Bar Chart
    by_level = {}
    for r in records:
        sh = r.get('_sheet', 'Unknown')
        by_level[sh] = by_level.get(sh, 0) + _val(r.get('sum_26_27'))
    
    l_sorted = sorted(by_level.items(), key=lambda x: x[1], reverse=True)
    l_names = [x[0] for x in l_sorted]
    l_vals = [x[1] for x in l_sorted]
    
    clean_ax(ax2)
    if sum(l_vals) > 0:
        bars = ax2.bar(l_names, l_vals, color=ACCENT, alpha=0.9, width=0.6)
        for bar in bars:
            h = bar.get_height()
            ax2.annotate(f"${h:,.0f}m",
                         xy=(bar.get_x() + bar.get_width() / 2, h),
                         xytext=(0, 3),
                         textcoords="offset points",
                         ha='center', va='bottom', fontsize=7, color=NAVY, weight='bold')

    ax2.set_title("Value by Source (26+27)")
    ax2.set_yticks([])
    ax2.spines['left'].set_visible(False)

    # CHART 3: Top Customers Horizontal Bar
    by_cust = {}
    for r in records:
        c = r.get('customer', 'Unknown')
        if not c or c.lower() == 'nan': continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('sum_26_27'))
    
    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:5]
    c_sorted.reverse()
    c_names = [x[0][:15] for x in c_sorted]
    c_vals = [x[1] for x in c_sorted]
    
    clean_ax(ax3)
    if sum(c_vals) > 0:
        bars_h = ax3.barh(c_names, c_vals, color=GREEN, alpha=0.9, height=0.6)
        for bar in bars_h:
            w = bar.get_width()
            ax3.annotate(f"${w:,.0f}m",
                         xy=(w, bar.get_y() + bar.get_height() / 2),
                         xytext=(3, 0),  
                         textcoords="offset points",
                         ha='left', va='center', fontsize=7, color=NAVY, weight='bold')
                     
    ax3.set_title("Top 5 Customers by Value")
    ax3.set_xticks([])
    ax3.spines['bottom'].set_visible(False)

    plt.tight_layout(pad=2.0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


# ── Color palette (matching dashboard) ──────────────────────────────────────

NAVY    = (3, 0, 46)
DARK    = (12, 0, 51)
ACCENT  = (16, 6, 159)
WHITE   = (255, 255, 255)
LIGHT   = (232, 232, 238)
GREEN   = (0, 200, 117)
RED     = (255, 69, 58)
CYAN    = (0, 200, 255)
AMBER   = (255, 179, 0)
GREY_BG = (245, 245, 250)
GREY_TXT = (130, 130, 150)


# ── Custom PDF class ────────────────────────────────────────────────────────

class OppPDF(FPDF):

    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)

    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GREY_TXT)
        self.cell(0, 10,
                  f"ROLLS-ROYCE CIVIL AEROSPACE  |  Opportunity Tracker  |  "
                  f"Page {self.page_no()}  |  Internal use only", 0, 0, "C")

    # ── Drawing helpers ─────────────────────────────────────────────────────

    def _title_bar(self, title, subtitle=""):
        """Full-width navy bar with title."""
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 297, 25, "F")
        self.set_xy(10, 5)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*WHITE)
        self.cell(200, 8, _safe(title), 0, 0, "L")
        if subtitle:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(180, 180, 210)
            self.set_xy(10, 14)
            self.cell(200, 6, _safe(subtitle), 0, 0, "L")
        # Right side: RR badge
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(230, 8)
        self.set_fill_color(*ACCENT)
        self.cell(25, 7, "OPP TRACKER", 0, 0, "C", True)
        self.set_xy(258, 8)
        self.set_fill_color(40, 40, 70)
        self.cell(28, 7, "ROLLS-ROYCE", 0, 0, "C", True)
        self.set_y(30)

    def _section_header(self, title, icon_char=""):
        """Styled section header with accent pill."""
        y = self.get_y()
        if y > 170:   # Near bottom? New page
            self.add_page()
            y = self.get_y()
        self.ln(4)
        self.set_fill_color(*ACCENT)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 10)
        label = f"  {icon_char}  {title}  " if icon_char else f"  {title}  "
        w = self.get_string_width(label) + 8
        self.cell(w, 7, label, 0, 1, "L", True)
        self.ln(3)

    def _kpi_card(self, x, y, w, h, label, value, color=NAVY, small_text=""):
        """Draw a single KPI box."""
        self.set_fill_color(*GREY_BG)
        self.rect(x, y, w, h, "F")
        # Accent top border
        self.set_fill_color(*color)
        self.rect(x, y, w, 1.5, "F")
        # Label
        self.set_xy(x, y + 3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GREY_TXT)
        self.cell(w, 5, label, 0, 2, "C")
        # Value
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*color)
        self.cell(w, 8, str(value), 0, 2, "C")
        # Small text
        if small_text:
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(w, 4, small_text, 0, 0, "C")

    def _table(self, headers, rows, col_widths, max_rows=40):
        """Draw a styled table with alternating row colors."""
        y_start = self.get_y()
        # Header row
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 8)
        x = self.l_margin
        for i, h in enumerate(headers):
            self.set_xy(x, self.get_y())
            self.cell(col_widths[i], 7, h, 0, 0, "C", True)
            x += col_widths[i]
        self.ln(7)

        # Data rows
        self.set_font("Helvetica", "", 7.5)
        count = 0
        for row in rows[:max_rows]:
            if self.get_y() > 185:   # Near bottom
                self.add_page()
                # Re-draw header on new page
                self.set_fill_color(*NAVY)
                self.set_text_color(*WHITE)
                self.set_font("Helvetica", "B", 8)
                x = self.l_margin
                for i2, h2 in enumerate(headers):
                    self.set_xy(x, self.get_y())
                    self.cell(col_widths[i2], 7, h2, 0, 0, "C", True)
                    x += col_widths[i2]
                self.ln(7)
                self.set_font("Helvetica", "", 7.5)

            fill = count % 2 == 0
            if fill:
                self.set_fill_color(245, 245, 252)
            else:
                self.set_fill_color(*WHITE)
            self.set_text_color(*DARK)

            x = self.l_margin
            for i, cell_val in enumerate(row):
                self.set_xy(x, self.get_y())
                align = "R" if i == len(row) - 1 else "L"
                self.cell(col_widths[i], 6.5, _safe(str(cell_val)), 0, 0, align, True)
                x += col_widths[i]
            self.ln(6.5)
            count += 1

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(0, 5, f"  ... and {len(rows) - max_rows} more rows", 0, 1)


# ── Main generator ──────────────────────────────────────────────────────────

def generate_opp_pdf_report(
    parsed_data: dict,
    sections_to_include: list,
    filters: dict,
) -> bytes:
    """Generate a premium Opportunity Tracker PDF report."""

    pdf = OppPDF()
    pdf.add_page()

    # ── Flatten opportunities ────────────────────────────────────────────────
    opportunities = parsed_data.get("opportunities", {})
    all_items = []
    for sheet_name, recs in opportunities.items():
        if isinstance(recs, list):
            for r in recs:
                all_items.append({**r, "_sheet": sheet_name})

    if not all_items:
        all_items = parsed_data.get("all_items", [])

    # ── Apply filters ────────────────────────────────────────────────────────
    filtered = []
    for row in all_items:
        if filters.get("customer") and row.get("customer") != filters["customer"]:
            continue
        if filters.get("project") and row.get("project") != filters["project"]:
            continue
        if filters.get("priority") and str(row.get("priority")) != str(filters["priority"]):
            continue
        if filters.get("ext_probability") and row.get("ext_probability") != filters["ext_probability"]:
            continue
        if filters.get("status") and row.get("status") != filters["status"]:
            continue
        opp_types = filters.get("opp_type", [])
        if opp_types and isinstance(opp_types, list) and len(opp_types) > 0:
            if row.get("opp_type", "Unknown") not in opp_types:
                continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("sum_26_27")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    meta = parsed_data.get("metadata", {})
    summary = parsed_data.get("summary", {})

    # ── Compute aggregates ───────────────────────────────────────────────────
    total_26 = sum(_val(r.get("benefit_2026")) for r in filtered)
    total_27 = sum(_val(r.get("benefit_2027")) for r in filtered)
    total_26_27 = sum(_val(r.get("sum_26_27")) for r in filtered)
    total_term = sum(_val(r.get("term_benefit")) for r in filtered)
    active = [r for r in filtered if str(r.get("status", "")).lower() not in ("completed", "lost", "declined")]
    customers = set(r.get("customer") for r in filtered if r.get("customer"))

    # ═══════════════════════════════════════════════════════════════════════════
    # PAGE 1: Title + KPIs + Priority Breakdown
    # ═══════════════════════════════════════════════════════════════════════════

    date_str = datetime.now().strftime("%d %B %Y")
    subtitle = f"Generated: {date_str}  |  {len(filtered)} Opportunities  |  {len(customers)} Customers"
    if filters.get("customer"):
        subtitle = f"Filtered: {filters['customer']}  |  " + subtitle
    pdf._title_bar("COMMERCIAL OPTIMISATION OPPORTUNITY REPORT", subtitle)

    if len(filtered) == 0:
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    # ── KPI Cards row ────────────────────────────────────────────────────────
    if "kpis" in sections_to_include:
        y = pdf.get_y() + 2
        card_w = 62
        gap = 6
        x = 12
        pdf._kpi_card(x, y, card_w, 22, "2026", _fmtM(total_26), NAVY)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "2027", _fmtM(total_27), NAVY)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "2026 + 2027", _fmtM(total_26_27), GREEN)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "TERM IMPACT", _fmtM(total_term), ACCENT,
                       f"{len(active)} active of {len(filtered)} total")
        pdf.set_y(y + 28)

        # Info badges
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*GREY_TXT)
        away_day = meta.get("away_day_date", "-")
        sheets_str = ", ".join(opportunities.keys()) if opportunities else "-"
        info_line = (
            f"Away Day: {away_day}   |   Sheets: {sheets_str}   |   "
            f"Opportunities: {len(filtered)} ({len(active)} active)   |   "
            f"Customers: {len(customers)}   |   "
            f"Programmes: {meta.get('programmes', '-')}"
        )
        pdf.cell(0, 5, info_line, 0, 1, "L")
        pdf.ln(3)

        # ── Priority breakdown ───────────────────────────────────────────────
        by_priority = {}
        for r in filtered:
            p = str(r.get("priority", "?")).replace(".0", "")
            if p in ("", "None", "nan"):
                p = "?"
            if p not in by_priority:
                by_priority[p] = {"count": 0, "sum_26_27": 0, "term": 0}
            by_priority[p]["count"] += 1
            by_priority[p]["sum_26_27"] += _val(r.get("sum_26_27"))
            by_priority[p]["term"] += _val(r.get("term_benefit"))

        completed = len([r for r in filtered if str(r.get("status", "")).lower() == "completed"])
        pipeline = len(active)

        priority_order = sorted([k for k in by_priority if k not in ("?",)]) + (["?"] if "?" in by_priority else [])
        p_colors = {"1": GREEN, "2": ACCENT, "3": AMBER}

        y = pdf.get_y()
        card_w2 = 50
        gap2 = 4
        x = 12
        for pk in priority_order[:3]:
            pd_item = by_priority[pk]
            color = p_colors.get(pk, GREY_TXT)
            pdf._kpi_card(x, y, card_w2, 22, f"PRIORITY {pk}", _fmtM(pd_item["sum_26_27"]),
                           color, f"{pd_item['count']} opps · Term: {_fmtM(pd_item['term'])}")
            x += card_w2 + gap2

        # Completed + Pipeline cards
        pdf._kpi_card(x, y, card_w2, 22, "COMPLETED", str(completed), GREEN,
                       f"{round(completed / max(len(filtered), 1) * 100)}% of total")
        x += card_w2 + gap2
        pdf._kpi_card(x, y, card_w2, 22, "PIPELINE", str(pipeline), CYAN,
                       f"{len(set(r.get('customer') for r in active if r.get('customer')))} customers")
        pdf.set_y(y + 28)

        # ── Visual Charts ────────────────────────────────────────────────────
        chart_data = [r for r in filtered if _val(r.get("sum_26_27")) > 0]
        if chart_data:
            chart_buf = _generate_charts(chart_data)
            # Center the image. Width 280mm out of 297mm page width (A4 Landscape)
            x_img = (297 - 280) / 2
            pdf.image(chart_buf, x=x_img, w=280)
            pdf.ln(5)

    # ═══════════════════════════════════════════════════════════════════════════
    # TOP OPPORTUNITIES TABLE
    # ═══════════════════════════════════════════════════════════════════════════

    if "top_opps" in sections_to_include:
        pdf._section_header("Top Opportunities by Value")
        top_sorted = sorted(filtered, key=lambda r: _val(r.get("sum_26_27")), reverse=True)[:25]

        headers = ["#", "Customer", "Project", "Asks", "Ext Prob", "Priority", "Status", "Value (26+27)"]
        col_widths = [8, 35, 30, 90, 22, 18, 25, 35]

        rows = []
        for i, r in enumerate(top_sorted, 1):
            rows.append([
                str(i),
                _trunc(r.get("customer", ""), 18),
                _trunc(r.get("project", ""), 16),
                _trunc(r.get("asks", ""), 55),
                _safe(r.get("ext_probability", "")),
                str(r.get("priority", "")).replace(".0", ""),
                _trunc(r.get("status", ""), 12),
                _fmtM(_val(r.get("sum_26_27"))),
            ])
        pdf._table(headers, rows, col_widths, max_rows=25)

    # ═══════════════════════════════════════════════════════════════════════════
    # ESTIMATION LEVEL BREAKDOWN
    # ═══════════════════════════════════════════════════════════════════════════

    if "estimation_level" in sections_to_include:
        est_levels = {}
        est_level_names = meta.get("estimation_levels", {})
        for r in filtered:
            sh = r.get("_sheet", "Unknown")
            if sh not in est_levels:
                est_levels[sh] = {"count": 0, "sum_26_27": 0, "term": 0}
            est_levels[sh]["count"] += 1
            est_levels[sh]["sum_26_27"] += _val(r.get("sum_26_27"))
            est_levels[sh]["term"] += _val(r.get("term_benefit"))

        pdf._section_header("Estimation Level Breakdown")

        # Summary cards per level
        y = pdf.get_y()
        card_w3 = 85
        gap3 = 6
        x = 12
        level_colors = [ACCENT, GREEN, AMBER, CYAN, NAVY]
        for idx, (sh, data) in enumerate(est_levels.items()):
            if x + card_w3 > 290:
                pdf.set_y(y + 26)
                y = pdf.get_y()
                x = 12
            level_label = est_level_names.get(sh, sh)
            color = level_colors[idx % len(level_colors)]
            pdf._kpi_card(x, y, card_w3, 22, f"{level_label} ({sh})",
                           _fmtM(data["sum_26_27"]), color,
                           f"{data['count']} opps · Term: {_fmtM(data['term'])}")
            x += card_w3 + gap3
        pdf.set_y(y + 28)

        # Detailed table per sheet
        for sh, data in est_levels.items():
            level_label = est_level_names.get(sh, sh)
            sheet_recs = [r for r in filtered if r.get("_sheet") == sh]
            sheet_recs.sort(key=lambda r: _val(r.get("sum_26_27")), reverse=True)

            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6,
                     f"{level_label} ({sh}) - {len(sheet_recs)} opps - "
                     f"{_fmtM(data['sum_26_27'])} (26+27)  ·  {_fmtM(data['term'])} term",
                     0, 1, "L")
            pdf.ln(1)

            headers = ["Customer", "Asks", "Ext Prob", "Status", "2026", "2027", "26+27"]
            col_widths = [35, 100, 22, 25, 30, 30, 25]
            rows = []
            for r in sheet_recs[:20]:
                rows.append([
                    _trunc(r.get("customer", ""), 18),
                    _trunc(r.get("asks", ""), 60),
                    _safe(r.get("ext_probability", "")),
                    _trunc(r.get("status", ""), 12),
                    _fmtM(_val(r.get("benefit_2026"))),
                    _fmtM(_val(r.get("benefit_2027"))),
                    _fmtM(_val(r.get("sum_26_27"))),
                ])
            pdf._table(headers, rows, col_widths, max_rows=20)
            pdf.ln(3)

    # ═══════════════════════════════════════════════════════════════════════════
    # OPPORTUNITIES & THREATS
    # ═══════════════════════════════════════════════════════════════════════════

    if "opps_threats" in sections_to_include:
        ot_data = parsed_data.get("opps_and_threats", {})
        ot_rows = ot_data.get("rows", [])
        if not ot_rows:
            # Try alternate key structure
            ot_rows = parsed_data.get("sections", {}).get("Opps and Threats", {}).get("rows", [])

        # Apply customer filter
        if filters.get("customer"):
            ot_rows = [r for r in ot_rows if r.get("Customer") == filters["customer"]
                       or r.get("customer") == filters["customer"]]

        if ot_rows:
            pdf._section_header("Opportunities & Threats")
            headers = ["Customer", "Description", "Type", "Status", "Owner"]
            col_widths = [40, 130, 30, 35, 30]
            rows = []
            for r in ot_rows:
                rows.append([
                    _trunc(r.get("Customer", r.get("customer", "")), 20),
                    _trunc(r.get("Description", r.get("description", "")), 78),
                    _trunc(r.get("Type", r.get("type", "")), 14),
                    _trunc(r.get("Status", r.get("status", "")), 16),
                    _trunc(r.get("Action Owner", r.get("action_owner", "")), 14),
                ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # ═══════════════════════════════════════════════════════════════════════════
    # PROJECT SUMMARY
    # ═══════════════════════════════════════════════════════════════════════════

    if "project_summary" in sections_to_include:
        proj_summary = parsed_data.get("project_summary", {})
        proj_rows = proj_summary.get("rows", [])

        if proj_rows:
            pdf._section_header("Project Summary")
            headers = ["Project", "Customer", "Status", "Value", "Notes"]
            col_widths = [40, 35, 30, 35, 127]
            rows = []
            for r in proj_rows:
                rows.append([
                    _trunc(r.get("Project", r.get("project", "")), 20),
                    _trunc(r.get("Customer", r.get("customer", "")), 18),
                    _trunc(r.get("Status", r.get("status", "")), 14),
                    _fmtM(_val(r.get("Value", r.get("value", 0)))),
                    _trunc(r.get("Notes", r.get("notes", "")), 75),
                ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # ═══════════════════════════════════════════════════════════════════════════
    # CUSTOMER BREAKDOWN
    # ═══════════════════════════════════════════════════════════════════════════

    if "customer_breakdown" in sections_to_include:
        by_cust = {}
        for r in filtered:
            c = r.get("customer", "Unknown")
            if c not in by_cust:
                by_cust[c] = {"count": 0, "sum_26_27": 0, "term": 0}
            by_cust[c]["count"] += 1
            by_cust[c]["sum_26_27"] += _val(r.get("sum_26_27"))
            by_cust[c]["term"] += _val(r.get("term_benefit"))

        sorted_custs = sorted(by_cust.items(), key=lambda x: x[1]["sum_26_27"], reverse=True)

        pdf._section_header("Customer Breakdown")
        headers = ["Customer", "Opportunities", "Value (26+27)", "Term Benefit", "% of Total"]
        col_widths = [60, 30, 45, 45, 30]
        rows = []
        for cust, data in sorted_custs:
            pct = round(data["sum_26_27"] / max(total_26_27, 1) * 100, 1)
            rows.append([
                _trunc(cust, 30),
                str(data["count"]),
                _fmtM(data["sum_26_27"]),
                _fmtM(data["term"]),
                f"{pct}%",
            ])
        pdf._table(headers, rows, col_widths, max_rows=30)

    # ═══════════════════════════════════════════════════════════════════════════
    # TIMELINE (if selected)
    # ═══════════════════════════════════════════════════════════════════════════

    if "timeline" in sections_to_include:
        timeline = parsed_data.get("timeline", {})
        t_rows = timeline.get("rows", [])
        if t_rows:
            pdf._section_header("Project Timeline & Milestones")
            headers = ["Milestone", "Date", "Status", "Owner", "Notes"]
            col_widths = [50, 30, 30, 30, 127]
            rows = []
            for r in t_rows:
                rows.append([
                    _trunc(r.get("Milestone", r.get("milestone", "")), 25),
                    _safe(r.get("Date", r.get("date", ""))),
                    _trunc(r.get("Status", r.get("status", "")), 14),
                    _trunc(r.get("Owner", r.get("owner", "")), 14),
                    _trunc(r.get("Notes", r.get("notes", "")), 75),
                ])
            pdf._table(headers, rows, col_widths, max_rows=25)

    return bytes(pdf.output())
