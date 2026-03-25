"""
PDF Export Module for Rolls-Royce Global Commercial Optimisation Hopper
=======================================================================
Generates a premium, multi-page branded PDF report that mirrors the
dashboard layout: KPI cards, region/customer/profit charts, pipeline
table, top-opportunities table, and executive report.
"""

import pandas as pd
from datetime import datetime
from fpdf import FPDF
import math

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io


# -- Helpers ------------------------------------------------------------------

def _safe(text) -> str:
    """Sanitize text for fpdf2 Helvetica (replace Unicode chars with ASCII)."""
    if text is None:
        return "-"
    s = str(text)
    for old, new in [
        ("\u2014", "-"), ("\u2013", "-"), ("\u2018", "'"), ("\u2019", "'"),
        ("\u201c", '"'), ("\u201d", '"'), ("\u2026", "..."), ("\u00a0", " "),
        ("\u00a3", "GBP"), ("\n", " "), ("\r", ""),
    ]:
        s = s.replace(old, new)
    return s.strip()


def _val(v):
    """Coerce a value to float, stripping common currency symbols."""
    if v is None:
        return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("\u20ac", "").replace("\u00a3", "")
        return float(v)
    except Exception:
        return 0.0


def _fmtM(val):
    """Format as GBP millions: GBP X.Xm"""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    """Shorter currency format for tight table cells."""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}{abs(v):,.1f}m"


def _trunc(s, maxlen):
    s = _safe(s)
    return s[:maxlen - 2] + ".." if len(s) > maxlen else s


# -- Chart generation ---------------------------------------------------------

def _generate_hopper_charts(filtered, summary):
    """Generate a horizontal strip of 3 charts and return as BytesIO PNG.

    Left   : Region donut (CRP by region)
    Center : Top 10 customers horizontal bar
    Right  : Year-over-year profit forecast bar (2026-2030)
    """
    NAVY   = '#03002e'
    ACCENT = '#10069f'
    GREEN  = '#00c875'
    AMBER  = '#ffb300'
    CYAN   = '#00c8ff'
    GREY   = '#828296'

    # Extra palette for donut slices
    DONUT_COLORS = [ACCENT, GREEN, AMBER, CYAN, '#e84393', '#6c5ce7',
                    '#fd79a8', '#00b894', '#636e72', '#d63031']

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

    # ── CHART 1: Region Donut (CRP by region) ──────────────────────────────
    by_region = {}
    for r in filtered:
        rgn = str(r.get('region', 'Unknown')).strip()
        if not rgn or rgn.lower() in ('nan', 'none', ''):
            rgn = 'Unknown'
        by_region[rgn] = by_region.get(rgn, 0) + _val(r.get('crp_term_benefit'))

    r_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
    r_labels = [x[0] for x in r_sorted]
    r_vals = [x[1] for x in r_sorted]
    r_colors = [DONUT_COLORS[i % len(DONUT_COLORS)] for i in range(len(r_labels))]

    if sum(r_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            r_vals, labels=[l[:12] for l in r_labels], autopct='%1.0f%%',
            colors=r_colors, startangle=90,
            textprops={'color': NAVY, 'fontsize': 7, 'weight': 'bold'},
            wedgeprops={'width': 0.4, 'edgecolor': 'white', 'linewidth': 2}
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
    ax1.set_title("CRP by Region")

    # ── CHART 2: Top 10 Customers horizontal bar ───────────────────────────
    by_cust = {}
    for r in filtered:
        c = str(r.get('customer', 'Unknown')).strip()
        if not c or c.lower() in ('nan', 'none', ''):
            continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('crp_term_benefit'))

    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:10]
    c_sorted.reverse()  # smallest at top for horizontal bar
    c_names = [x[0][:18] for x in c_sorted]
    c_vals = [x[1] for x in c_sorted]

    clean_ax(ax2)
    if sum(c_vals) > 0:
        bars_h = ax2.barh(c_names, c_vals, color=GREEN, alpha=0.9, height=0.6)
        for bar in bars_h:
            w = bar.get_width()
            ax2.annotate(f"GBP {w:,.1f}m",
                         xy=(w, bar.get_y() + bar.get_height() / 2),
                         xytext=(3, 0),
                         textcoords="offset points",
                         ha='left', va='center', fontsize=6, color=NAVY, weight='bold')
    ax2.set_title("Top 10 Customers (CRP)")
    ax2.set_xticks([])
    ax2.spines['bottom'].set_visible(False)

    # ── CHART 3: Year-over-year profit forecast bar (2026-2030) ─────────────
    years = ['2026', '2027', '2028', '2029', '2030']
    year_keys = [f'profit_{y}' for y in years]
    year_totals = []
    for yk in year_keys:
        total = sum(_val(r.get(yk)) for r in filtered)
        year_totals.append(total)

    clean_ax(ax3)
    bar_colors = [ACCENT, GREEN, AMBER, CYAN, '#6c5ce7']
    if sum(year_totals) > 0:
        bars = ax3.bar(years, year_totals, color=bar_colors[:len(years)], alpha=0.9, width=0.6)
        for bar in bars:
            h = bar.get_height()
            if h != 0:
                ax3.annotate(f"GBP {h:,.1f}m",
                             xy=(bar.get_x() + bar.get_width() / 2, h),
                             xytext=(0, 3),
                             textcoords="offset points",
                             ha='center', va='bottom', fontsize=7, color=NAVY, weight='bold')
    ax3.set_title("Profit Forecast by Year")
    ax3.set_yticks([])
    ax3.spines['left'].set_visible(False)

    plt.tight_layout(pad=2.0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


# -- Colour palette (matching dashboard) -------------------------------------

NAVY     = (3, 0, 46)
ACCENT   = (16, 6, 159)
GREEN    = (0, 200, 117)
WHITE    = (255, 255, 255)
LIGHT    = (232, 232, 238)
GREY_BG  = (245, 245, 250)
GREY_TXT = (130, 130, 150)
DARK     = (12, 0, 51)
CYAN     = (0, 200, 255)
AMBER    = (255, 179, 0)


# -- Custom PDF class --------------------------------------------------------

class HopperPDF(FPDF):

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
                  f"ROLLS-ROYCE CIVIL AEROSPACE  |  Global Hopper  |  "
                  f"Page {self.page_no()}  |  Internal use only", 0, 0, "C")

    # -- Drawing helpers ------------------------------------------------------

    def _title_bar(self, title, subtitle=""):
        """Full-width navy bar with title and right-hand badges."""
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
        # Right-hand badges
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(218, 8)
        self.set_fill_color(*ACCENT)
        self.cell(30, 7, "GLOBAL HOPPER", 0, 0, "C", True)
        self.set_xy(251, 8)
        self.set_fill_color(40, 40, 70)
        self.cell(34, 7, "ROLLS-ROYCE", 0, 0, "C", True)
        self.set_y(30)

    def _section_header(self, title, icon_char=""):
        """Styled section header with accent pill."""
        y = self.get_y()
        if y > 170:
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
            if self.get_y() > 185:
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
                # Right-align numeric columns (those starting with GBP, -, or a digit)
                sv = str(cell_val).strip()
                align = "R" if (sv.startswith("GBP") or sv.startswith("-")
                                or (sv and sv[0].isdigit())) else "L"
                self.cell(col_widths[i], 6.5, _safe(str(cell_val)), 0, 0, align, True)
                x += col_widths[i]
            self.ln(6.5)
            count += 1

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(0, 5, f"  ... and {len(rows) - max_rows} more rows", 0, 1)


# -- Filter helper ------------------------------------------------------------

def _apply_filters(opportunities, filters):
    """Apply optional filters dict to the opportunity list."""
    if not filters:
        return list(opportunities)

    filtered = []
    for row in opportunities:
        if filters.get("region"):
            if str(row.get("region", "")).strip().lower() != str(filters["region"]).strip().lower():
                continue
        if filters.get("customer"):
            if str(row.get("customer", "")).strip().lower() != str(filters["customer"]).strip().lower():
                continue
        if filters.get("status"):
            if str(row.get("status", "")).strip().lower() != str(filters["status"]).strip().lower():
                continue
        if filters.get("maturity"):
            if str(row.get("maturity", "")).strip().lower() != str(filters["maturity"]).strip().lower():
                continue
        if filters.get("restructure_type"):
            if str(row.get("restructure_type", "")).strip().lower() != str(filters["restructure_type"]).strip().lower():
                continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("crp_term_benefit")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    return filtered


# -- Main generator -----------------------------------------------------------

def generate_hopper_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate a premium Global Hopper PDF report.

    Parameters
    ----------
    parsed_data : dict
        Output from the Global Hopper parser with keys: metadata,
        opportunities, summary, exec_report, detail_report, errors.
    sections_to_include : list, optional
        Subset of: "kpis", "pipeline", "top_opps", "exec_report",
        "customer_breakdown", "charts". Default: all sections.
    filters : dict, optional
        Optional filters with keys: region, customer, status,
        maturity, restructure_type, min_value.

    Returns
    -------
    bytes
        The rendered PDF as a byte string.
    """
    ALL_SECTIONS = ["kpis", "charts", "pipeline", "top_opps", "exec_report", "customer_breakdown"]
    if sections_to_include is None:
        sections_to_include = ALL_SECTIONS
    if filters is None:
        filters = {}

    pdf = HopperPDF()
    pdf.add_page()

    meta = parsed_data.get("metadata", {})
    summary = parsed_data.get("summary", {})
    opportunities = parsed_data.get("opportunities", [])

    # ── Apply filters ────────────────────────────────────────────────────────
    filtered = _apply_filters(opportunities, filters)

    # ── Compute aggregates ───────────────────────────────────────────────────
    total_crp   = sum(_val(r.get("crp_term_benefit")) for r in filtered)
    total_2026  = sum(_val(r.get("profit_2026")) for r in filtered)
    total_2027  = sum(_val(r.get("profit_2027")) for r in filtered)
    total_2028  = sum(_val(r.get("profit_2028")) for r in filtered)
    total_2029  = sum(_val(r.get("profit_2029")) for r in filtered)
    total_2030  = sum(_val(r.get("profit_2030")) for r in filtered)
    total_opps  = len(filtered)
    customers   = set(str(r.get("customer", "")).strip() for r in filtered if r.get("customer"))
    regions     = set(str(r.get("region", "")).strip() for r in filtered if r.get("region"))

    # =========================================================================
    # PAGE 1: Title + KPIs + Charts
    # =========================================================================

    date_str = datetime.now().strftime("%d %B %Y")
    subtitle = (
        f"Generated: {date_str}  |  {total_opps} Opportunities  |  "
        f"{len(customers)} Customers  |  {len(regions)} Regions  |  Currency: GBP"
    )
    if filters.get("region"):
        subtitle = f"Region: {filters['region']}  |  " + subtitle
    if filters.get("customer"):
        subtitle = f"Customer: {filters['customer']}  |  " + subtitle
    pdf._title_bar("COMMERCIAL OPTIMISATION OPPORTUNITY REPORT", subtitle)

    if total_opps == 0:
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

        pdf._kpi_card(x, y, card_w, 22, "CRP TERM BENEFIT",
                       _fmtM(total_crp), ACCENT,
                       f"{total_opps} opportunities")
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "PROFIT 2026",
                       _fmtM(total_2026), NAVY)
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "PROFIT 2027",
                       _fmtM(total_2027), GREEN)
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "TOTAL OPPORTUNITIES",
                       str(total_opps), ACCENT,
                       f"{len(customers)} customers, {len(regions)} regions")
        pdf.set_y(y + 28)

        # Info badges row
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*GREY_TXT)
        src_file = meta.get("source_file", "-")
        region_list = ", ".join(sorted(regions)[:5])
        if len(regions) > 5:
            region_list += f" +{len(regions) - 5} more"
        info_line = (
            f"Source: {src_file}   |   "
            f"Regions: {region_list}   |   "
            f"Currency: {meta.get('currency', 'GBP')}"
        )
        pdf.cell(0, 5, _safe(info_line), 0, 1, "L")
        pdf.ln(3)

    # ── Visual Charts ────────────────────────────────────────────────────────
    if "charts" in sections_to_include:
        chart_data = [r for r in filtered if _val(r.get("crp_term_benefit")) > 0]
        if chart_data:
            chart_buf = _generate_hopper_charts(chart_data, summary)
            x_img = (297 - 280) / 2
            pdf.image(chart_buf, x=x_img, w=280)
            pdf.ln(5)

    # =========================================================================
    # PIPELINE TABLE
    # =========================================================================

    if "pipeline" in sections_to_include:
        pipeline_stages = summary.get("pipeline_stages", [])
        if not pipeline_stages:
            # Build from filtered data if not pre-computed
            by_status = {}
            for r in filtered:
                st = str(r.get("status", "Unknown")).strip()
                if not st or st.lower() in ('nan', 'none', ''):
                    st = "Unknown"
                if st not in by_status:
                    by_status[st] = {"count": 0, "value": 0.0}
                by_status[st]["count"] += 1
                by_status[st]["value"] += _val(r.get("crp_term_benefit"))
            pipeline_stages = [
                {"stage": k, "count": v["count"], "value": v["value"]}
                for k, v in sorted(by_status.items(), key=lambda x: x[1]["value"], reverse=True)
            ]

        if pipeline_stages:
            pdf._section_header("Pipeline by Status")
            headers = ["Status / Stage", "Count", "CRP Term Benefit (GBP m)"]
            col_widths = [120, 40, 60]
            rows = []
            for ps in pipeline_stages:
                rows.append([
                    _trunc(ps.get("stage", ""), 60),
                    str(ps.get("count", 0)),
                    _fmtM(_val(ps.get("value"))),
                ])
            # Totals row
            t_count = sum(ps.get("count", 0) for ps in pipeline_stages)
            t_value = sum(_val(ps.get("value")) for ps in pipeline_stages)
            rows.append([
                "TOTAL",
                str(t_count),
                _fmtM(t_value),
            ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # =========================================================================
    # TOP 25 OPPORTUNITIES TABLE
    # =========================================================================

    if "top_opps" in sections_to_include:
        pdf._section_header("Top 25 Opportunities by CRP Term Benefit")
        top_sorted = sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)[:25]

        headers = ["#", "Region", "Customer", "EVS", "Restructure", "Status",
                    "CRP Term", "2026", "2027"]
        col_widths = [8, 30, 38, 40, 32, 28, 30, 30, 30]

        rows = []
        for i, r in enumerate(top_sorted, 1):
            rows.append([
                str(i),
                _trunc(r.get("region", ""), 14),
                _trunc(r.get("customer", ""), 18),
                _trunc(r.get("engine_value_stream", r.get("top_level_evs", "")), 20),
                _trunc(r.get("restructure_type", ""), 15),
                _trunc(r.get("status", ""), 12),
                _fmtM_short(_val(r.get("crp_term_benefit"))),
                _fmtM_short(_val(r.get("profit_2026"))),
                _fmtM_short(_val(r.get("profit_2027"))),
            ])
        pdf._table(headers, rows, col_widths, max_rows=25)

    # =========================================================================
    # EXECUTIVE REPORT TABLE
    # =========================================================================

    if "exec_report" in sections_to_include:
        exec_data = parsed_data.get("exec_report", [])
        if exec_data:
            pdf._section_header("Executive Report")
            headers = ["Customer", "CRP Term (GBP m)", "2026", "2027", "2028", "2029"]
            col_widths = [60, 40, 35, 35, 35, 35]

            rows = []
            for er in exec_data:
                rows.append([
                    _trunc(er.get("Customer", er.get("customer", "")), 30),
                    _fmtM_short(_val(er.get("Sum of CRP Term Benefit \u00a3m",
                                            er.get("crp_term_benefit", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2026 \u00a3m",
                                            er.get("profit_2026", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2027 \u00a3m",
                                            er.get("profit_2027", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2028 \u00a3m",
                                            er.get("profit_2028", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2029 \u00a3m",
                                            er.get("profit_2029", 0)))),
                ])
            pdf._table(headers, rows, col_widths, max_rows=40)

    # =========================================================================
    # CUSTOMER BREAKDOWN
    # =========================================================================

    if "customer_breakdown" in sections_to_include:
        by_cust = {}
        for r in filtered:
            c = str(r.get("customer", "Unknown")).strip()
            if not c or c.lower() in ('nan', 'none', ''):
                c = "Unknown"
            if c not in by_cust:
                by_cust[c] = {"count": 0, "crp": 0.0, "p2026": 0.0, "p2027": 0.0}
            by_cust[c]["count"] += 1
            by_cust[c]["crp"]   += _val(r.get("crp_term_benefit"))
            by_cust[c]["p2026"] += _val(r.get("profit_2026"))
            by_cust[c]["p2027"] += _val(r.get("profit_2027"))

        sorted_custs = sorted(by_cust.items(), key=lambda x: x[1]["crp"], reverse=True)

        pdf._section_header("Customer Breakdown")
        headers = ["Customer", "Opps", "CRP Term (GBP m)", "Profit 2026", "Profit 2027", "% of Total CRP"]
        col_widths = [60, 20, 40, 40, 40, 35]
        rows = []
        for cust, data in sorted_custs:
            pct = round(data["crp"] / max(total_crp, 0.001) * 100, 1)
            rows.append([
                _trunc(cust, 30),
                str(data["count"]),
                _fmtM_short(data["crp"]),
                _fmtM_short(data["p2026"]),
                _fmtM_short(data["p2027"]),
                f"{pct}%",
            ])
        pdf._table(headers, rows, col_widths, max_rows=30)

    return bytes(pdf.output())
