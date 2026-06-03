"""
PDF Export Module for Rolls-Royce Power BI Dashboard
====================================================
Consolidated module that produces three distinct branded PDF reports:

    * ``generate_pdf_report``         -- Legacy SOA (Statement of Account) report
    * ``generate_opp_pdf_report``     -- Opportunity Tracker report (with charts)
    * ``generate_hopper_pdf_report``  -- Global Commercial Optimisation Hopper report

All three entry-point signatures are preserved verbatim so that existing
``server.py`` imports continue to function unchanged.

The file is organised as:

    1. Shared constants & helpers
    2. SOA report (RRPDFReport + generate_pdf_report)
    3. Opportunity Tracker report (OppPDF + generate_opp_pdf_report)
    4. Global Hopper report (HopperPDF + generate_hopper_pdf_report)
"""

import io
from datetime import datetime

import pandas as pd
from fpdf import FPDF


# =============================================================================
# 1. SHARED CONSTANTS & HELPERS
# =============================================================================

# -- Shared brand palette (used by Opp + Hopper, and re-exposed on the SOA
#    PDF class via its own attribute names to preserve legacy styling). ------

NAVY     = (3, 0, 46)
DARK     = (12, 0, 51)
ACCENT   = (16, 6, 159)
WHITE    = (255, 255, 255)
LIGHT    = (232, 232, 238)
GREEN    = (0, 200, 117)
RED      = (255, 69, 58)
CYAN     = (0, 200, 255)
AMBER    = (255, 179, 0)
GREY_BG  = (245, 245, 250)
GREY_TXT = (130, 130, 150)


def _hex_to_rgb(hex_str: str) -> tuple:
    """Convert a hex colour string (e.g. '#102030') to an (R, G, B) tuple."""
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i + 2], 16) for i in (0, 2, 4))


# -- Text sanitisation -------------------------------------------------------
#
# Two flavours of _safe exist because the three reports have subtly different
# expectations:
#
#   * _safe_soa       -- Legacy SOA behaviour (no .strip(), no newline
#                        handling, does not map GBP). Preserves exact SOA
#                        output.
#   * _safe           -- Shared Opp/Hopper behaviour: strips whitespace,
#                        collapses newlines, and maps the GBP symbol to the
#                        literal string "GBP" (required because the Hopper
#                        report uses Helvetica which cannot render U+00A3).
#                        The GBP mapping is a harmless no-op for the Opp
#                        report since its source data contains no GBP symbols.

def _safe_soa(text) -> str:
    """Sanitise text for fpdf2 Helvetica - SOA variant (legacy behaviour)."""
    s = str(text) if text is not None else "-"
    s = s.replace("—", "-")    # em dash
    s = s.replace("–", "-")    # en dash
    s = s.replace("‘", "'")    # left single quote
    s = s.replace("’", "'")    # right single quote
    s = s.replace("“", '"')    # left double quote
    s = s.replace("”", '"')    # right double quote
    s = s.replace("…", "...")  # ellipsis
    s = s.replace(" ", " ")    # non-breaking space
    return s


def _safe(text) -> str:
    """Sanitise text for fpdf2 Helvetica (Opp + Hopper variant).

    Includes GBP-symbol replacement for Helvetica safety (preserved from the
    original Hopper module -- Helvetica cannot render U+00A3).
    """
    if text is None:
        return "-"
    s = str(text)
    for old, new in [
        ("—", "-"), ("–", "-"), ("‘", "'"), ("’", "'"),
        ("“", '"'), ("”", '"'), ("…", "..."), (" ", " "),
        ("£", "GBP"), ("\n", " "), ("\r", ""),
        ("•", "-"), ("·", "-"),                # bullets
        ("×", "x"), ("→", "->"), ("←", "<-"),  # math / arrows
    ]:
        s = s.replace(old, new)
    # Final guard: strip anything outside Latin-1 so a rogue glyph never
    # crashes Helvetica. Replaced with '?' so omissions are visible.
    out = []
    for ch in s:
        try:
            ch.encode("latin-1")
            out.append(ch)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out).strip()


# -- Numeric coercion / formatting (shared between Opp & Hopper) ------------

def _val(v):
    """Coerce a value to float, stripping common currency symbols."""
    if v is None:
        return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("€", "").replace("£", "")
        return float(v)
    except Exception:
        return 0.0


def _trunc(s, maxlen):
    """Safe-truncate a value to ``maxlen`` chars with a trailing '..'."""
    s = _safe(s)
    return s[:maxlen - 2] + ".." if len(s) > maxlen else s


# =============================================================================
# 2. SOA REPORT  (generate_pdf_report)
# =============================================================================

def _fmt_currency(val, currency_symbol: str = "USD") -> str:
    """Format a currency value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    try:
        val = float(val)
        sign = "-" if val < 0 else ""
        abs_val = abs(val)
        return f"{sign}{currency_symbol} {abs_val:,.2f}"
    except (ValueError, TypeError):
        return "-"


def _fmt_date(val) -> str:
    """Format a date value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    if isinstance(val, pd.Timestamp):
        return val.strftime("%d/%m/%Y")
    if isinstance(val, str):
        return _safe_soa(val)
    return _safe_soa(str(val))


def _fmt_number(val) -> str:
    """Format an integer-like value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return _safe_soa(str(val))


class RRPDFReport(FPDF):
    """Custom PDF class with Rolls-Royce SOA branding."""

    # Brand colours (RGB tuples) - kept as class attributes for backwards
    # compatibility with the legacy call-sites inside generate_pdf_report.
    RR_NAVY  = (16, 6, 159)
    RR_DARK  = (12, 0, 51)
    RR_WHITE = (255, 255, 255)
    RR_RED   = (211, 47, 47)
    RR_GREEN = (46, 125, 50)
    RR_LIGHT = (232, 232, 238)

    def __init__(self):
        super().__init__(orientation='L', unit='mm', format='A4')
        self.set_auto_page_break(auto=True, margin=15)
        # First page is added by the caller (after the cover page).

    def header(self):
        """Override header - leave empty as we'll add a custom title bar."""
        pass

    def footer(self):
        """Add branded footer."""
        if self.page_no() == getattr(self, "_cover_page_no", -1):
            return
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(*self.RR_NAVY)
        self.cell(0, 10, 'ROLLS-ROYCE CIVIL AEROSPACE - For internal use only', 0, 0, 'C')


def generate_pdf_report(
    metadata: dict,
    grand_totals: dict,
    filtered_df: pd.DataFrame,
    sections_summary: dict,
    source_files: list = None,
    currency_symbol: str = "USD",
) -> bytes:
    """
    Generate a branded SOA PDF report and return the PDF as bytes.

    Args:
        metadata: Customer info dict
        grand_totals: Summary totals dict
        filtered_df: Filtered DataFrame with all items
        sections_summary: Per-section summary dict
        source_files: List of source file names (optional)
        currency_symbol: Currency display symbol

    Returns:
        bytes: PDF file content
    """

    pdf = RRPDFReport()

    # ========== COVER PAGE ==========
    _cust = metadata.get("customer_name", "Customer")
    _draw_cover(pdf, "Statement of Account", "Account Summary", "SOA", [
        f"Customer: {_cust}",
        f"Report date: {_fmt_date(metadata.get('report_date'))}",
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
    ])
    pdf.add_page()

    # ========== PAGE HEADING (the cover carries the full title) ==========
    pdf.set_xy(10, 12)
    pdf.set_font('Helvetica', 'B', 13)
    pdf.set_text_color(*RRPDFReport.RR_DARK)
    pdf.cell(0, 7, 'Statement of Account', 0, 1, 'L')
    _hy = pdf.get_y() + 1
    pdf.set_fill_color(*HOPPER_GOLD_RGB)
    pdf.rect(10, _hy, 24, 1.0, 'F')
    pdf.set_y(_hy + 4)

    # ========== CUSTOMER INFO SECTION ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Customer Information', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    # Customer info grid
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(0, 0, 0)

    info_items = [
        ("Customer Name", metadata.get("customer_name", "-")),
        ("Customer ID", metadata.get("customer_id", "-")),
        ("Contact", metadata.get("contact", "-")),
        ("LPI Rate", f"{metadata.get('lpi_rate', 0) * 100:.4f}%" if metadata.get('lpi_rate') else "-"),
        ("Avg Days Late", _fmt_number(metadata.get("avg_days_late"))),
        ("Report Date", _fmt_date(metadata.get("report_date"))),
    ]

    col_width = 90
    x_start = 10
    y_start = pdf.get_y()

    for i, (label, value) in enumerate(info_items):
        row = i // 3
        col = i % 3
        x = x_start + (col * col_width)
        y = y_start + (row * 7)

        pdf.set_xy(x, y)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(30, 6, label + ":", 0, 0)
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(60, 6, _safe_soa(value), 0, 0)

    pdf.ln(20)

    # ========== KPI SUMMARY ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Key Performance Indicators', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    kpis = [
        ("Total Charges", grand_totals.get("total_charges", 0), None),
        ("Total Credits", grand_totals.get("total_credits", 0), RRPDFReport.RR_GREEN),
        ("Net Balance", grand_totals.get("net_balance", 0),
         RRPDFReport.RR_RED if grand_totals.get("net_balance", 0) > 0 else RRPDFReport.RR_GREEN),
        ("Total Overdue", grand_totals.get("total_overdue", 0), RRPDFReport.RR_RED),
        ("Avg Days Late", metadata.get("avg_days_late", 0), None),
        ("Open Items", grand_totals.get("item_count", 0), None),
    ]

    box_width = 90
    box_height = 20
    x_start = 10
    y_start = pdf.get_y()

    for i, (label, value, color) in enumerate(kpis):
        row = i // 3
        col = i % 3
        x = x_start + (col * box_width)
        y = y_start + (row * (box_height + 3))

        # Border
        pdf.set_draw_color(*RRPDFReport.RR_NAVY)
        pdf.rect(x, y, box_width - 3, box_height)

        # Label
        pdf.set_xy(x + 2, y + 3)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(box_width - 7, 5, label, 0, 0)

        # Value
        pdf.set_xy(x + 2, y + 10)
        pdf.set_font('Helvetica', 'B', 12)
        if color:
            pdf.set_text_color(*color)
        else:
            pdf.set_text_color(*RRPDFReport.RR_NAVY)

        if "Items" in label or "Days Late" in label:
            val_str = _fmt_number(value)
        else:
            val_str = _fmt_currency(value, currency_symbol)

        pdf.cell(box_width - 7, 8, val_str, 0, 0)

    pdf.ln(50)

    # ========== SECTION SUMMARY TABLE ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Section Summary', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    # Table headers
    headers = ["Section", "Total", "Charges", "Credits", "Overdue", "Items"]
    col_widths = [70, 35, 35, 35, 35, 25]

    pdf.set_fill_color(*RRPDFReport.RR_NAVY)
    pdf.set_text_color(*RRPDFReport.RR_WHITE)
    pdf.set_font('Helvetica', 'B', 9)

    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 7, header, 1, 0, 'C', fill=True)
    pdf.ln()

    # Table rows
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Helvetica', '', 8)

    row_num = 0
    for section, data in sections_summary.items():
        if row_num % 2 == 0:
            pdf.set_fill_color(*RRPDFReport.RR_WHITE)
        else:
            pdf.set_fill_color(*RRPDFReport.RR_LIGHT)

        pdf.cell(col_widths[0], 6, _safe_soa(section)[:35], 1, 0, 'L', fill=True)
        pdf.cell(col_widths[1], 6, _fmt_currency(data.get("total", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[2], 6, _fmt_currency(data.get("charges", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[3], 6, _fmt_currency(data.get("credits", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[4], 6, _fmt_currency(data.get("overdue", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[5], 6, _fmt_number(data.get("items", 0)), 1, 0, 'C', fill=True)
        pdf.ln()
        row_num += 1

    pdf.ln(5)

    # ========== FILTERED INVOICE REGISTER ==========
    if not filtered_df.empty:
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(*RRPDFReport.RR_NAVY)
        pdf.cell(0, 8, 'Invoice Register (Filtered)', 0, 1)
        pdf.set_draw_color(*RRPDFReport.RR_NAVY)
        pdf.line(10, pdf.get_y(), 287, pdf.get_y())
        pdf.ln(3)

        # Limit to 100 rows to keep PDF manageable
        display_df = filtered_df.head(100).copy()

        # Table headers
        inv_headers = ["Section", "Reference", "Doc Date", "Due Date", "Amount", "Status", "Type", "Days Late"]
        inv_col_widths = [45, 30, 25, 25, 35, 30, 25, 20]

        pdf.set_fill_color(*RRPDFReport.RR_NAVY)
        pdf.set_text_color(*RRPDFReport.RR_WHITE)
        pdf.set_font('Helvetica', 'B', 8)

        for i, header in enumerate(inv_headers):
            pdf.cell(inv_col_widths[i], 7, header, 1, 0, 'C', fill=True)
        pdf.ln()

        # Table rows
        pdf.set_font('Helvetica', '', 7)

        row_num = 0
        for idx, row in display_df.iterrows():
            # Check if we need a new page
            if pdf.get_y() > 180:
                pdf.add_page()
                # Re-print headers
                pdf.set_fill_color(*RRPDFReport.RR_NAVY)
                pdf.set_text_color(*RRPDFReport.RR_WHITE)
                pdf.set_font('Helvetica', 'B', 8)
                for i, header in enumerate(inv_headers):
                    pdf.cell(inv_col_widths[i], 7, header, 1, 0, 'C', fill=True)
                pdf.ln()
                pdf.set_font('Helvetica', '', 7)
                row_num = 0

            if row_num % 2 == 0:
                pdf.set_fill_color(*RRPDFReport.RR_WHITE)
            else:
                pdf.set_fill_color(*RRPDFReport.RR_LIGHT)

            # Amount coloring
            amount = row.get("Amount", 0)
            try:
                amount_float = float(amount) if amount is not None else 0
            except (ValueError, TypeError):
                amount_float = 0

            pdf.set_text_color(0, 0, 0)
            pdf.cell(inv_col_widths[0], 6, _safe_soa(row.get("Section", "-"))[:22], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[1], 6, _safe_soa(row.get("Reference", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[2], 6, _fmt_date(row.get("Document Date")), 1, 0, 'C', fill=True)
            pdf.cell(inv_col_widths[3], 6, _fmt_date(row.get("Due Date")), 1, 0, 'C', fill=True)

            if amount_float < 0:
                pdf.set_text_color(*RRPDFReport.RR_RED)
            pdf.cell(inv_col_widths[4], 6, _fmt_currency(amount_float, currency_symbol), 1, 0, 'R', fill=True)
            pdf.set_text_color(0, 0, 0)

            pdf.cell(inv_col_widths[5], 6, _safe_soa(row.get("Status", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[6], 6, _safe_soa(row.get("Entry Type", "-") or "-")[:12], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[7], 6, _fmt_number(row.get("Days Late")), 1, 0, 'C', fill=True)
            pdf.ln()
            row_num += 1

        if len(filtered_df) > 100:
            pdf.ln(3)
            pdf.set_font('Helvetica', 'I', 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 5, f'Showing first 100 of {len(filtered_df)} filtered records', 0, 1, 'L')

    # ========== DATA SOURCES ==========
    if source_files:
        pdf.ln(5)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(*RRPDFReport.RR_NAVY)
        pdf.cell(0, 6, 'Data Sources:', 0, 1)
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(0, 0, 0)
        for fname in source_files:
            pdf.cell(0, 5, f'  - {_safe_soa(fname)}', 0, 1)

    # Return PDF as bytes
    return bytes(pdf.output())


# =============================================================================
# 3. OPPORTUNITY TRACKER REPORT  (generate_opp_pdf_report)
# =============================================================================

def _fmtM(val):
    """Format as $X.Xm (Opportunity Tracker - USD-style millions)."""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.1f}m"


def _generate_charts(records):
    """Generate a horizontal strip of 3 styling charts and return as BytesIO PNG."""
    # Lazy-import matplotlib so the SOA & Hopper paths don't pay the cost
    # when they don't need it.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    NAVY_HEX   = '#03002e'
    ACCENT_HEX = '#10069f'
    GREEN_HEX  = '#00c875'
    AMBER_HEX  = '#ffb300'
    CYAN_HEX   = '#00c8ff'
    GREY_HEX   = '#828296'

    plt.style.use('default')
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(11, 3.5), dpi=150)
    fig.patch.set_facecolor('white')

    def clean_ax(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#E8E8EE')
        ax.spines['bottom'].set_color('#E8E8EE')
        ax.tick_params(colors=GREY_HEX, labelsize=8)
        ax.title.set_color(NAVY_HEX)
        ax.title.set_fontsize(10)
        ax.title.set_weight('bold')

    # CHART 1: Priority Doughnut
    by_priority = {}
    for r in records:
        p = str(r.get('priority', '?')).replace('.0', '')
        if p in ('', 'None', 'nan'):
            p = '?'
        if p == '?':
            continue
        by_priority[p] = by_priority.get(p, 0) + _val(r.get('sum_26_27'))

    p_keys = sorted(by_priority.keys())
    p_vals = [by_priority[k] for k in p_keys]
    p_labels = [f"Priority {k}" for k in p_keys]
    color_map = {'1': GREEN_HEX, '2': ACCENT_HEX, '3': AMBER_HEX}
    p_colors = [color_map.get(k, CYAN_HEX) for k in p_keys]

    if sum(p_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            p_vals, labels=p_labels, autopct='%1.0f%%',
            colors=p_colors, startangle=90,
            textprops={'color': NAVY_HEX, 'fontsize': 8, 'weight': 'bold'},
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
        bars = ax2.bar(l_names, l_vals, color=ACCENT_HEX, alpha=0.9, width=0.6)
        for bar in bars:
            h = bar.get_height()
            ax2.annotate(f"${h:,.0f}m",
                         xy=(bar.get_x() + bar.get_width() / 2, h),
                         xytext=(0, 3),
                         textcoords="offset points",
                         ha='center', va='bottom', fontsize=7, color=NAVY_HEX, weight='bold')

    ax2.set_title("Value by Source (26+27)")
    ax2.set_yticks([])
    ax2.spines['left'].set_visible(False)

    # CHART 3: Top Customers Horizontal Bar
    by_cust = {}
    for r in records:
        c = r.get('customer', 'Unknown')
        if not c or c.lower() == 'nan':
            continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('sum_26_27'))

    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:5]
    c_sorted.reverse()
    c_names = [x[0][:15] for x in c_sorted]
    c_vals = [x[1] for x in c_sorted]

    clean_ax(ax3)
    if sum(c_vals) > 0:
        bars_h = ax3.barh(c_names, c_vals, color=GREEN_HEX, alpha=0.9, height=0.6)
        for bar in bars_h:
            w = bar.get_width()
            ax3.annotate(f"${w:,.0f}m",
                         xy=(w, bar.get_y() + bar.get_height() / 2),
                         xytext=(3, 0),
                         textcoords="offset points",
                         ha='left', va='center', fontsize=7, color=NAVY_HEX, weight='bold')

    ax3.set_title("Top 5 Customers by Value")
    ax3.set_xticks([])
    ax3.spines['bottom'].set_visible(False)

    plt.tight_layout(pad=2.0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


class OppPDF(FPDF):
    """Custom PDF class for the Opportunity Tracker report."""

    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)

    def header(self):
        pass

    def footer(self):
        if self.page_no() == getattr(self, "_cover_page_no", -1):
            return
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GREY_TXT)
        self.cell(0, 10,
                  f"ROLLS-ROYCE CIVIL AEROSPACE  |  Opportunity Tracker  |  "
                  f"Page {self.page_no()}  |  Internal use only", 0, 0, "C")

    # -- Drawing helpers -----------------------------------------------------

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
        """Draw a styled table with alternating row colors.

        Alignment rule: last column is right-aligned, all others left.
        """
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


def generate_opp_pdf_report(
    parsed_data: dict,
    sections_to_include: list,
    filters: dict,
) -> bytes:
    """Generate a premium Opportunity Tracker PDF report."""

    pdf = OppPDF()

    # -- Flatten opportunities -----------------------------------------------
    opportunities = parsed_data.get("opportunities", {})
    all_items = []
    for sheet_name, recs in opportunities.items():
        if isinstance(recs, list):
            for r in recs:
                all_items.append({**r, "_sheet": sheet_name})

    if not all_items:
        all_items = parsed_data.get("all_items", [])

    # -- Apply filters -------------------------------------------------------
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

    # -- Compute aggregates --------------------------------------------------
    total_26 = sum(_val(r.get("benefit_2026")) for r in filtered)
    total_27 = sum(_val(r.get("benefit_2027")) for r in filtered)
    total_26_27 = sum(_val(r.get("sum_26_27")) for r in filtered)
    total_term = sum(_val(r.get("term_benefit")) for r in filtered)
    active = [r for r in filtered if str(r.get("status", "")).lower() not in ("completed", "lost", "declined")]
    customers = set(r.get("customer") for r in filtered if r.get("customer"))

    # -- Cover page ----------------------------------------------------------
    _cover_meta = []
    if filters.get("customer"):
        _cover_meta.append(f"Filtered customer: {filters['customer']}")
    _cover_meta += [
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
        f"Opportunities: {len(filtered)}   |   Customers: {len(customers)}",
        f"Away day: {meta.get('away_day_date', '-')}",
    ]
    _draw_cover(pdf, "Commercial Optimisation Opportunity Tracker",
                "Executive Briefing", "OPP TRACKER", _cover_meta)
    pdf.add_page()

    # =========================================================================
    # PAGE 1: Title + KPIs + Priority Breakdown
    # =========================================================================

    # Slim heading — the cover carries the full report title.
    pdf.set_xy(12, 12)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 7, "Opportunity Overview", 0, 1, "L")
    _hy = pdf.get_y() + 1
    pdf.set_fill_color(*HOPPER_GOLD_RGB)
    pdf.rect(12, _hy, 24, 1.0, "F")
    pdf.set_y(_hy + 4)

    if len(filtered) == 0:
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    # -- KPI Cards row -------------------------------------------------------
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

        # -- Priority breakdown ----------------------------------------------
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

        # -- Visual Charts ---------------------------------------------------
        chart_data = [r for r in filtered if _val(r.get("sum_26_27")) > 0]
        if chart_data:
            chart_buf = _generate_charts(chart_data)
            # Center the image. Width 280mm out of 297mm page width (A4 Landscape)
            x_img = (297 - 280) / 2
            pdf.image(chart_buf, x=x_img, w=280)
            pdf.ln(5)

    # =========================================================================
    # TOP OPPORTUNITIES TABLE
    # =========================================================================

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

    # =========================================================================
    # ESTIMATION LEVEL BREAKDOWN
    # =========================================================================

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

    # =========================================================================
    # OPPORTUNITIES & THREATS
    # =========================================================================

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

    # =========================================================================
    # PROJECT SUMMARY
    # =========================================================================

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

    # =========================================================================
    # CUSTOMER BREAKDOWN
    # =========================================================================

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

    # =========================================================================
    # TIMELINE (if selected)
    # =========================================================================

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


# =============================================================================
# 4. GLOBAL HOPPER REPORT  (generate_hopper_pdf_report)
# =============================================================================

# -- Palette tuned to match the dashboard's dark-navy theme -----------------
# These hex values are the closest sRGB equivalents to the oklch CSS vars
# the React dashboard uses. The shared (NAVY, ACCENT, GREEN, ...) RGB tuples
# above are kept for the SOA / Opp reports; the Hopper report layers a
# warmer gold accent on top to match the var(--chart-2) used in the UI.
HOPPER_NAVY      = '#0a1d2e'   # panel/header background
HOPPER_NAVY_RGB  = (10, 29, 46)
# Professional blue-led palette. A single deep corporate blue carries every
# data series; gold is reserved as a restrained accent (header rule, headline
# KPI). This replaces the previous gold/copper/blue mix which clashed.
HOPPER_PRIMARY      = '#1f4e79'   # deep corporate blue — all bars / primary series
HOPPER_PRIMARY_RGB  = (31, 78, 121)
HOPPER_PRIMARY_LT   = '#3a6ea5'   # lighter blue — secondary / long-term shading
HOPPER_PRIMARY_LT_RGB = (58, 110, 165)
HOPPER_TEAL      = '#2a7f8e'
HOPPER_SLATE     = '#94a3b8'
HOPPER_GOLD      = '#b08d57'   # restrained gold accent (header rule, headline KPI)
HOPPER_GOLD_RGB  = (176, 141, 87)
HOPPER_BLUE      = '#1f4e79'   # alias kept; now same as primary
HOPPER_BLUE_RGB  = (31, 78, 121)
HOPPER_COPPER    = '#3a6ea5'   # alias kept; now a blue shade (no orange)
HOPPER_COPPER_RGB = (58, 110, 165)
HOPPER_GREEN     = '#2f8a5b'   # success (mature, not-onerous)
HOPPER_GREEN_RGB = (47, 138, 91)
HOPPER_RED       = '#b3452f'   # warning (onerous, immature)
HOPPER_RED_RGB   = (179, 69, 47)
HOPPER_TEXT_DARK = (17, 24, 39)
HOPPER_TEXT_MUTE = (107, 114, 128)
HOPPER_BG_LIGHT  = (249, 250, 251)
HOPPER_BG_ALT    = (243, 244, 246)
HOPPER_BORDER    = (229, 231, 235)

# Cohesive blue-led series palette (used for donuts / multi-series charts).
DONUT_PALETTE = ['#1f4e79', '#3a6ea5', '#2a7f8e', '#6b8fb5',
                 '#b08d57', '#5b8a72', '#8a6d3b', '#7f8aa3']


def _fmtM_gbp(val):
    """Format as GBP millions: 'GBP X.Xm' (Hopper-specific)."""
    if val is None:
        return "-"
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "-"
    sign = "-" if v < 0 else ""
    return f"{sign}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    """Shorter currency format for tight Hopper table cells."""
    if val is None:
        return "-"
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "-"
    sign = "-" if v < 0 else ""
    return f"{sign}{abs(v):,.1f}m"


def _pct(part, whole):
    """Safe percentage string."""
    if not whole:
        return "0.0%"
    return f"{(part / whole) * 100:.1f}%"


# =============================================================================
# Hopper chart rendering — matplotlib → PNG embedded into the PDF
# =============================================================================
#
# Principled colour system (mirrors the dashboard):
#   - VALUE  (£ / CRP / profit)  -> HOPPER_GOLD   (the RR brand accent)
#   - COUNT  (opportunity tally) -> HOPPER_PRIMARY (deep blue)
#   - share-of-total donuts      -> DONUT_PALETTE (distinguishes categories)
#   - risk semantics             -> green / amber / red
# Colour therefore always means the same thing, never arbitrary per-chart.
VALUE_HEX = HOPPER_GOLD       # '#b08d57'
COUNT_HEX = HOPPER_PRIMARY    # '#1f4e79'


def _png_size(data: bytes):
    """Return (width, height) px from a PNG byte string (IHDR chunk)."""
    import struct
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    w, h = struct.unpack(">II", data[16:24])
    return (w, h)


def _embed_fit(pdf, buf, x, avail_w, max_h):
    """Embed a chart image at ``avail_w`` wide unless that would exceed
    ``max_h`` mm tall, in which case scale down (and centre) to fit. Keeps the
    aspect ratio so charts never distort or overflow the page."""
    pw, ph = _png_size(buf.getvalue())
    if not pw:
        pdf.image(buf, x=x, w=avail_w)
        return
    h_full = avail_w * ph / pw
    if h_full <= max_h:
        pdf.image(buf, x=x, y=pdf.get_y(), w=avail_w)
        pdf.set_y(pdf.get_y() + h_full)
    else:
        w2 = max_h * pw / ph
        pdf.image(buf, x=x + (avail_w - w2) / 2, y=pdf.get_y(), w=w2)
        pdf.set_y(pdf.get_y() + max_h)


def _add_separators(fig, axes):
    """Draw thin vertical rules between adjacent chart panels so it reads
    clearly as several distinct charts sharing one page."""
    import matplotlib.pyplot as plt
    try:
        fig.canvas.draw()
        for a, b in zip(axes, axes[1:]):
            x = (a.get_position().x1 + b.get_position().x0) / 2.0
            fig.add_artist(plt.Line2D([x, x], [0.07, 0.93], transform=fig.transFigure,
                                      color='#d3d9e2', linewidth=0.9))
    except Exception:
        pass


# Reference gridline style — deliberately substantial so amounts read clearly.
GRID_KW = dict(linewidth=1.1, alpha=0.55, color='#c2c9d4', zorder=0)


def _style_value_axis(ax):
    """Common styling for a vertical value/count bar axis: thick horizontal
    reference gridlines for the amounts, but no numeric y-axis clutter (the
    bars carry value labels)."""
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.grid(True, axis='y', **GRID_KW)
    ax.set_axisbelow(True)
    ax.tick_params(axis='y', left=False, labelleft=False)
    ax.tick_params(axis='x', colors='#374151', labelsize=8, length=0)
    ax.title.set_color(HOPPER_NAVY)
    ax.title.set_fontsize(11)
    ax.title.set_weight('bold')


PIPELINE_ORDER = [
    "Initial idea", "ICT formed", "Strategy Approved",
    "Financial Modelling Started", "Financial Modelling Complete",
    "Financials Approved", "Negotiations Started",
    "Negotiations Concluded", "Contracting Started",
    "Contracting Concluded",
]


def _pipeline_stages(filtered):
    """Stages actually present (canonical order first, then any spelling
    variants by value) with their CRP totals. Zero-CRP stages are kept."""
    status_crp = {}
    for r in filtered:
        st = str(r.get('status', '')).strip() or 'Unknown'
        status_crp[st] = status_crp.get(st, 0) + _val(r.get('crp_term_benefit'))
    stages = [s for s in PIPELINE_ORDER if s in status_crp] + \
             sorted((s for s in status_crp if s not in PIPELINE_ORDER),
                    key=lambda s: status_crp[s], reverse=True)
    return stages, [status_crp[s] for s in stages]


def _generate_pipeline_chart(filtered):
    """Standalone large Pipeline-by-Status value chart (gold) for its own
    page, with thick reference gridlines."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    stages, p_vals = _pipeline_stages(filtered)
    if not stages:
        return None
    plt.style.use('default')
    fig, ax = plt.subplots(figsize=(13, 5.2), dpi=160)
    fig.patch.set_facecolor('white')
    _style_value_axis(ax)
    bars = ax.bar(range(len(stages)), p_vals, color=VALUE_HEX, width=0.6)
    ax.set_xticks(range(len(stages)))
    _fs = 9 if len(stages) <= 7 else (7.5 if len(stages) <= 9 else 6.5)
    ax.set_xticklabels([s.replace(" ", "\n", 1) if " " in s else s for s in stages],
                       fontsize=_fs, rotation=20, ha='right', color='#374151')
    for bar, v in zip(bars, p_vals):
        if v > 0:
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                    f"£{v:,.0f}m", ha='center', va='bottom',
                    fontsize=9, color=HOPPER_NAVY, weight='bold')
    ax.margins(y=0.18)
    ax.set_title("Pipeline by Status — CRP term benefit (£m)", loc='left', pad=8)
    plt.tight_layout(pad=1.6)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_hopper_charts(filtered, summary):
    """Page-2 chart strip: Annual-Profit (value, gold) plus a CRP-by-Region
    donut *only* when more than one region is present. (Pipeline by Status now
    has its own page.) Thin rules separate the panels."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    by_region = {}
    for r in filtered:
        rgn = str(r.get('region', 'Unknown')).strip() or 'Unknown'
        by_region[rgn] = by_region.get(rgn, 0) + _val(r.get('crp_term_benefit'))
    show_region = len([k for k in by_region]) > 1

    plt.style.use('default')
    if show_region:
        fig, axes = plt.subplots(1, 2, figsize=(13, 4.3), dpi=160,
                                 gridspec_kw={'width_ratios': [1, 1.1]})
        ax2, ax3 = axes
        sep_axes = [ax2, ax3]
    else:
        fig, ax3 = plt.subplots(1, 1, figsize=(13, 4.0), dpi=160)
        ax2 = None
        sep_axes = []
    fig.patch.set_facecolor('white')

    # -- CRP by Region donut (categorical; only when >1 region) -----------
    if ax2 is not None:
        r_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
        r_labels = [x[0] for x in r_sorted]
        r_vals = [x[1] for x in r_sorted]
        if sum(r_vals) > 0:
            colors = [DONUT_PALETTE[i % len(DONUT_PALETTE)] for i in range(len(r_labels))]
            wedges, _t, autot = ax2.pie(
                r_vals, labels=None,
                autopct=lambda p: f"{p:.0f}%" if p >= 5 else "",
                colors=colors, startangle=90, pctdistance=0.78,
                textprops={'color': 'white', 'fontsize': 8, 'weight': 'bold'},
                wedgeprops={'width': 0.40, 'edgecolor': 'white', 'linewidth': 2},
            )
            ax2.legend(wedges, [l[:16] for l in r_labels], loc='center left',
                       bbox_to_anchor=(0.92, 0.5), fontsize=8, frameon=False)
        ax2.set_title("CRP by Region", loc='left', pad=8)
        ax2.axis('equal')

    # -- Annual Profit Forecast (VALUE -> single gold) --------------------
    years = ['2026', '2027', '2028', '2029', '2030']
    year_totals = [sum(_val(r.get(f'profit_{y}')) for r in filtered) for y in years]
    _style_value_axis(ax3)
    if any(abs(t) > 0 for t in year_totals):
        bars = ax3.bar(years, year_totals, color=VALUE_HEX, width=0.6)
        for bar, v in zip(bars, year_totals):
            if v != 0:
                ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                         f"£{v:,.0f}m", ha='center',
                         va='bottom' if v >= 0 else 'top',
                         fontsize=9, color=HOPPER_NAVY, weight='bold')
        ax3.margins(y=0.18)
    ax3.set_title("Annual Profit Forecast — £m", loc='left', pad=8)

    plt.tight_layout(pad=2.0)
    _add_separators(fig, sep_axes)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_customer_chart(filtered, top_n=20):
    """Large horizontal bar chart of customers by CRP. Zero-CRP customers are
    kept (shown as a labelled £0.0m bar) — they are still live opportunities."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    by_cust = {}
    for r in filtered:
        c = str(r.get('customer', '')).strip()
        if c and c.lower() not in ('nan', 'none'):
            by_cust[c] = by_cust.get(c, 0) + _val(r.get('crp_term_benefit'))

    items = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:top_n]
    items.reverse()
    if not items:
        return None
    names = [n[:26] for n, _ in items]
    vals = [v for _, v in items]

    # Height scales with the number of customers but is capped so the
    # supporting table still fits beneath on the page.
    h = max(4.0, min(6.0, 0.42 * len(items) + 1.8))
    fig, ax = plt.subplots(figsize=(13, h), dpi=160)
    fig.patch.set_facecolor('white')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e5e7eb')
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.tick_params(colors='#374151', labelsize=10)
    # Vertical reference gridlines (value axis) — thick so magnitudes read.
    ax.grid(True, axis='x', **GRID_KW)
    ax.set_axisbelow(True)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'£{int(x)}m'))
    bars = ax.barh(names, vals, color=VALUE_HEX, height=0.66)
    span = max(vals) if vals else 0
    for bar, v in zip(bars, vals):
        ax.text(bar.get_width() + span * 0.005, bar.get_y() + bar.get_height()/2,
                f"  £{v:,.1f}m", va='center', ha='left',
                fontsize=9, color=HOPPER_NAVY, weight='bold')
    ax.margins(x=0.12)
    plt.tight_layout(pad=1.5)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_evs_charts(filtered, top_n=10):
    """Two-panel EVS analysis: opportunity COUNT (blue) and CRP VALUE (gold)
    per engine value stream, side by side with a separator. Showing both is
    the analytical point — where the *activity* is vs where the *value* is."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    by_count = {}
    by_value = {}
    for r in filtered:
        e = str(r.get('engine_value_stream', '')).strip() or 'Unknown'
        by_count[e] = by_count.get(e, 0) + 1
        by_value[e] = by_value.get(e, 0) + _val(r.get('crp_term_benefit'))
    # Order both panels the same way (by count) so the eye can compare them.
    order = [e for e, _ in sorted(by_count.items(), key=lambda x: x[1], reverse=True)][:top_n]
    if not order:
        return None
    names = [e[:14] for e in order]
    counts = [by_count[e] for e in order]
    values = [by_value[e] for e in order]

    plt.style.use('default')
    fig, (axc, axv) = plt.subplots(1, 2, figsize=(13, 4.4), dpi=160)
    fig.patch.set_facecolor('white')

    def _style(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_visible(False)
        ax.spines['bottom'].set_color('#e5e7eb')
        ax.grid(True, axis='y', **GRID_KW)
        ax.set_axisbelow(True)
        ax.tick_params(axis='y', left=False, labelleft=False)
        ax.tick_params(axis='x', colors='#374151', labelsize=9, length=0)
        ax.title.set_color(HOPPER_NAVY)
        ax.title.set_fontsize(11.5)
        ax.title.set_weight('bold')

    # COUNT panel (blue)
    _style(axc)
    barsc = axc.bar(names, counts, color=COUNT_HEX, width=0.62)
    for b, c in zip(barsc, counts):
        axc.text(b.get_x() + b.get_width()/2, b.get_height(), str(c),
                 ha='center', va='bottom', fontsize=8.5, color=HOPPER_NAVY, weight='bold')
    axc.set_xticklabels(names, rotation=20, ha='right')
    axc.set_title("By opportunities (count)", loc='left', pad=8)
    axc.margins(y=0.18)

    # VALUE panel (gold)
    _style(axv)
    barsv = axv.bar(names, values, color=VALUE_HEX, width=0.62)
    for b, v in zip(barsv, values):
        if v > 0:
            axv.text(b.get_x() + b.get_width()/2, b.get_height(), f"£{v:,.0f}m",
                     ha='center', va='bottom', fontsize=8, color=HOPPER_NAVY, weight='bold')
    axv.set_xticklabels(names, rotation=20, ha='right')
    axv.set_title("By CRP term benefit (£m)", loc='left', pad=8)
    axv.margins(y=0.18)

    plt.tight_layout(pad=2.0)
    _add_separators(fig, [axc, axv])
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_structure_charts(filtered):
    """Page-4 visual: restructure type by CRP VALUE (gold) and by opportunity
    COUNT (blue), side by side with a separator. (Maturity / onerous donuts
    were removed — that split is already covered by the KPI cards and the
    register, so repeating it here was redundant.)"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    rtype = {}
    rtype_n = {}
    for r in filtered:
        k = str(r.get('restructure_type', '')).strip() or 'Unknown'
        rtype[k] = rtype.get(k, 0) + _val(r.get('crp_term_benefit'))
        rtype_n[k] = rtype_n.get(k, 0) + 1
    # Order by value desc (largest first, left to right).
    order = [k for k, _ in sorted(rtype.items(), key=lambda x: x[1], reverse=True)]
    if not order:
        return None
    names = [k for k in order]
    vals = [rtype[k] for k in order]
    counts = [rtype_n[k] for k in order]

    def _wrap(s):  # wrap long restructure names onto 2 lines for x-axis
        return s.replace(" ", "\n", 1) if " " in s else s
    labels = [_wrap(n[:34]) for n in names]
    _fs = 8.5 if len(names) <= 4 else 7

    plt.style.use('default')
    fig, (axv, axc) = plt.subplots(1, 2, figsize=(13, 4.4), dpi=160)
    fig.patch.set_facecolor('white')

    # VALUE panel (gold) — vertical bars
    _style_value_axis(axv)
    bv = axv.bar(range(len(names)), vals, color=VALUE_HEX, width=0.6)
    axv.set_xticks(range(len(names)))
    axv.set_xticklabels(labels, fontsize=_fs, color='#374151')
    for b, v in zip(bv, vals):
        if v > 0:
            axv.text(b.get_x() + b.get_width()/2, b.get_height(), f"£{v:,.0f}m",
                     ha='center', va='bottom', fontsize=8.5, color=HOPPER_NAVY, weight='bold')
    axv.margins(y=0.18)
    axv.set_title("By CRP term benefit (£m)", loc='left', pad=8)

    # COUNT panel (blue) — vertical bars
    _style_value_axis(axc)
    bc = axc.bar(range(len(names)), counts, color=COUNT_HEX, width=0.6)
    axc.set_xticks(range(len(names)))
    axc.set_xticklabels(labels, fontsize=_fs, color='#374151')
    for b, c in zip(bc, counts):
        axc.text(b.get_x() + b.get_width()/2, b.get_height(), f"{c}",
                 ha='center', va='bottom', fontsize=8.5, color=HOPPER_NAVY, weight='bold')
    axc.margins(y=0.18)
    axc.set_title("By opportunities (count)", loc='left', pad=8)

    plt.tight_layout(pad=2.0)
    _add_separators(fig, [axv, axc])
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _draw_cover(pdf, title, subtitle, tag, meta_lines):
    """Full-page navy cover used by every report. Operates on any FPDF
    instance via absolute coordinates. Records the cover page number on the
    instance so footers can skip it. Auto page-break is disabled while we
    paint to the page edges, then restored."""
    PAGE_W, PAGE_H, ML = 297, 210, 18
    pdf.set_auto_page_break(False)
    pdf.add_page()
    pdf._cover_page_no = pdf.page_no()

    pdf.set_fill_color(*HOPPER_NAVY_RGB)
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F")

    # Wordmark
    pdf.set_xy(ML, 40)
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, "ROLLS-ROYCE", 0, 1, "L")
    pdf.set_x(ML)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(150, 170, 195)
    pdf.cell(0, 5, "CIVIL AEROSPACE  -  AFTERMARKET ANALYTICS", 0, 1, "L")

    # Tag pill
    pdf.set_xy(ML, 58)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(*HOPPER_GOLD_RGB)
    pdf.set_text_color(*HOPPER_NAVY_RGB)
    tw = pdf.get_string_width(_safe(tag)) + 8
    pdf.cell(tw, 7, _safe(tag), 0, 1, "C", True)

    # Gold hairline
    pdf.set_fill_color(*HOPPER_GOLD_RGB)
    pdf.rect(ML, 82, 44, 1.1, "F")

    # Title
    pdf.set_xy(ML, 90)
    pdf.set_font("Helvetica", "B", 30)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(PAGE_W - 2 * ML, 13, _safe(title))

    # Subtitle
    pdf.set_x(ML)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(*HOPPER_GOLD_RGB)
    pdf.cell(0, 9, _safe(subtitle), 0, 1, "L")

    # Meta block near the bottom
    pdf.set_xy(ML, PAGE_H - 20 - 6 * len(meta_lines))
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(190, 205, 225)
    for ln in meta_lines:
        pdf.set_x(ML)
        pdf.cell(0, 6, _safe(ln), 0, 1, "L")

    # Confidential strap
    pdf.set_xy(ML, PAGE_H - 13)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*HOPPER_GOLD_RGB)
    pdf.cell(0, 5, "CONFIDENTIAL - FOR INTERNAL USE ONLY", 0, 0, "L")

    pdf.set_auto_page_break(True, margin=20)


class HopperPDF(FPDF):
    """PDF for the Global Commercial Optimisation Hopper report.

    Landscape A4. Color palette matches the React dashboard's dark-navy
    theme so the printed deliverable visually maps back to what the user
    saw on screen.
    """

    PAGE_W = 297
    PAGE_H = 210
    MARGIN_L = 12
    MARGIN_R = 12

    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(self.MARGIN_L, 16, self.MARGIN_R)

    def header(self):
        # Drawn explicitly per-page via _page_header(); header() left blank.
        pass

    def footer(self):
        # The full-page navy cover has no footer.
        if self.page_no() == getattr(self, "_cover_page_no", -1):
            return
        # Footer band
        self.set_y(-14)
        self.set_draw_color(*HOPPER_BORDER)
        self.line(self.MARGIN_L, self.get_y(), self.PAGE_W - self.MARGIN_R, self.get_y())
        self.set_y(-11)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(0, 6,
                  f"ROLLS-ROYCE CIVIL AEROSPACE   |   Global Commercial Optimisation Hopper   |   "
                  f"Page {self.page_no()}   |   Internal use only",
                  0, 0, "C")

    # -- Executive-summary helpers (page 1 content) --------------------------

    def _exec_header(self, title, sub=""):
        """Section heading with a subtitle and a gold rule beneath."""
        self.set_xy(self.MARGIN_L, self.MARGIN_T if hasattr(self, "MARGIN_T") else 16)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(0, 8, _safe(title), 0, 1, "L")
        if sub:
            self.set_x(self.MARGIN_L)
            self.set_font("Helvetica", "", 9.5)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(0, 5, _safe(sub), 0, 1, "L")
        y = self.get_y() + 1.5
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(self.MARGIN_L, y, 26, 1.0, "F")
        self.set_y(y + 5)

    def _kpi_card_top(self, x, y, w, h, label, value, accent_rgb, sub=""):
        """KPI card with a coloured strip across the TOP (matches the
        executive-summary mock). The value is rendered in navy so the colour
        coding lives in the strip, not the number."""
        self.set_fill_color(*HOPPER_BG_LIGHT)
        self.rect(x, y, w, h, "F")
        self.set_draw_color(*HOPPER_BORDER)
        self.set_line_width(0.2)
        self.rect(x, y, w, h, "D")
        self.set_fill_color(*accent_rgb)
        self.rect(x, y, w, 1.6, "F")
        self.set_xy(x + 4, y + 4)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(w - 8, 4, _safe(label).upper(), 0, 2, "L")
        self.set_xy(x + 4, y + 9)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(w - 8, 8, _safe(value), 0, 2, "L")
        if sub:
            self.set_xy(x + 4, y + h - 5.5)
            self.set_font("Helvetica", "", 6.8)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(w - 8, 3.5, _safe(sub), 0, 0, "L")

    def _kpi_row_top(self, cards, h=24):
        """Lay a row of top-accent KPI cards across the content width."""
        gap = 5
        n = max(1, len(cards))
        w = (self.PAGE_W - self.MARGIN_L - self.MARGIN_R - gap * (n - 1)) / n
        x = self.MARGIN_L
        y = self.get_y()
        for label, value, sub, accent in cards:
            self._kpi_card_top(x, y, w, h, label, value, accent, sub or "")
            x += w + gap
        self.set_y(y + h + 5)

    def _narrative(self, text):
        """A short paragraph with a gold left rule — the briefing summary."""
        body_w = self.PAGE_W - self.MARGIN_L - self.MARGIN_R - 6
        self.set_font("Helvetica", "", 9.5)
        y0 = self.get_y()
        self.set_xy(self.MARGIN_L + 6, y0)
        self.set_text_color(*HOPPER_TEXT_DARK)
        self.multi_cell(body_w, 5.2, _safe(text))
        y1 = self.get_y()
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(self.MARGIN_L, y0, 1.6, max(1.0, y1 - y0 - 1), "F")
        self.set_y(y1 + 4)

    # -- Page-level templates ------------------------------------------------

    def _title_bar(self, title, subtitle=""):
        """Full-bleed navy band at the very top of page 1."""
        # Reset and draw the bar
        self.set_y(0)
        self.set_fill_color(*HOPPER_NAVY_RGB)
        self.rect(0, 0, self.PAGE_W, 28, "F")
        # Thin gold accent strip below the bar
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(0, 28, self.PAGE_W, 1.2, "F")

        # Title text
        self.set_xy(self.MARGIN_L, 6)
        self.set_font("Helvetica", "B", 17)
        self.set_text_color(*WHITE)
        self.cell(200, 8, _safe(title), 0, 0, "L")

        # Subtitle
        if subtitle:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(190, 200, 215)
            self.set_xy(self.MARGIN_L, 16)
            self.cell(220, 5, _safe(subtitle), 0, 0, "L")

        # Right-hand badges (gold + grey)
        self.set_font("Helvetica", "B", 8)
        bx = self.PAGE_W - self.MARGIN_R - 70
        self.set_xy(bx, 9)
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(34, 6.5, "GLOBAL HOPPER", 0, 0, "C", True)
        self.set_xy(bx + 36, 9)
        self.set_fill_color(45, 55, 72)
        self.set_text_color(*WHITE)
        self.cell(34, 6.5, "ROLLS-ROYCE", 0, 0, "C", True)

        # Park cursor below the title bar
        self.set_y(34)

    def _page_header(self, title):
        """Compact section header for pages 2+ (no navy band)."""
        # Remember the base page title (sans any "(continued)" suffix) so a
        # table that spills onto the next page can repeat a meaningful heading.
        if "continued" not in title.lower():
            self._page_title_base = title
        self.set_y(8)
        self.set_x(self.MARGIN_L)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(0, 6, _safe(title), 0, 1, "L")
        # Gold underline
        y = self.get_y() + 1
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(self.MARGIN_L, y, 18, 0.8, "F")
        self.set_y(y + 3)

    def _section_header(self, title):
        """Inline section title used between blocks on the same page."""
        y = self.get_y()
        if y > self.PAGE_H - 50:
            self.add_page()
            y = self.get_y()
        self.ln(2)
        self.set_x(self.MARGIN_L)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(0, 6, _safe(title), 0, 1, "L")
        # Thin underline
        y2 = self.get_y()
        self.set_draw_color(*HOPPER_GOLD_RGB)
        self.set_line_width(0.4)
        self.line(self.MARGIN_L, y2, self.MARGIN_L + 18, y2)
        self.set_line_width(0.2)
        self.ln(2)

    # -- Drawing primitives --------------------------------------------------

    def _kpi_card(self, x, y, w, h, label, value, accent_rgb, sub=""):
        """KPI card with left accent strip, label, value, optional sub-line."""
        # Card background
        self.set_fill_color(*HOPPER_BG_LIGHT)
        self.rect(x, y, w, h, "F")
        # Thin border
        self.set_draw_color(*HOPPER_BORDER)
        self.set_line_width(0.2)
        self.rect(x, y, w, h, "D")
        # Left accent strip
        self.set_fill_color(*accent_rgb)
        self.rect(x, y, 1.6, h, "F")

        # Label
        self.set_xy(x + 4, y + 2.5)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(w - 5, 4, _safe(label).upper(), 0, 2, "L")
        # Value
        self.set_xy(x + 4, y + 7)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*accent_rgb)
        self.cell(w - 5, 7, _safe(value), 0, 2, "L")
        # Sub
        if sub:
            self.set_xy(x + 4, y + h - 5)
            self.set_font("Helvetica", "", 6.5)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(w - 5, 3, _safe(sub), 0, 0, "L")

    def _chip(self, label, value, x=None, y=None):
        """Inline pill: 'LABEL' (small grey) + value (dark)."""
        if x is not None:
            self.set_xy(x, y)
        self.set_font("Helvetica", "B", 6.5)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        lab_w = self.get_string_width(label.upper()) + 1
        self.cell(lab_w, 4, label.upper(), 0, 0, "L")
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*HOPPER_NAVY_RGB)
        val_w = self.get_string_width(str(value)) + 4
        self.cell(val_w, 4, " " + _safe(value), 0, 0, "L")
        return lab_w + val_w + 4

    def _table(self, headers, rows, col_widths, *, max_rows=80,
               right_align_idx=None, totals_row=None):
        """Branded data table with alternating rows.

        Parameters
        ----------
        right_align_idx : iterable of int, optional
            Column indices to right-align (numeric columns). If None,
            auto-detect (cells starting with GBP/digit/-).
        totals_row : list, optional
            A pre-formatted last row to render in bold with a top border.
        """
        # Scale the columns to span the full content width so the table is not
        # left-hugging with a large empty gap on the right. Widths keep their
        # relative proportions; an already full-width table is unchanged.
        avail_full = self.PAGE_W - self.MARGIN_L - self.MARGIN_R
        _tot = sum(col_widths)
        if _tot > 0 and _tot < avail_full - 0.5:
            _scale = avail_full / _tot
            col_widths = [w * _scale for w in col_widths]

        # -- Per-column alignment. Headers are aligned the SAME way as their
        # data column so a right-aligned number sits directly under its header
        # (avoids the "centred header over left/right data" misalignment).
        def _col_align(idx):
            if right_align_idx is not None:
                return "R" if idx in right_align_idx else "L"
            return "L"

        def _cell_align(idx, val):
            if right_align_idx is not None:
                return "R" if idx in right_align_idx else "L"
            sv = str(val).strip()
            if sv.startswith("GBP") or sv.startswith("-") or (sv and (sv[0].isdigit() or sv[0] == "£")):
                return "R"
            return "L"

        # Small horizontal padding so right-aligned text doesn't touch the
        # column edge and left-aligned text doesn't hug the previous column.
        PAD = 1.2

        def _draw_header():
            self.set_fill_color(*HOPPER_NAVY_RGB)
            self.set_text_color(*WHITE)
            self.set_font("Helvetica", "B", 7.5)
            xx = x_start
            for ii, hh in enumerate(headers):
                self.set_xy(xx, self.get_y())
                a = _col_align(ii)
                self.cell(col_widths[ii] - PAD, 6.5, _safe(hh).upper(), 0, 0, a, True)
                # paint the padding strip with the same fill so the band is solid
                self.set_xy(xx + col_widths[ii] - PAD, self.get_y())
                self.cell(PAD, 6.5, "", 0, 0, "L", True)
                xx += col_widths[ii]
            self.ln(6.5)

        # -- Header
        x_start = self.MARGIN_L
        _draw_header()

        # -- Data rows
        self.set_font("Helvetica", "", 7)
        for idx_row, row in enumerate(rows[:max_rows]):
            # Break BEFORE a row would cross the auto page-break trigger, so the
            # continued rows always carry a repeated column header (never bleed
            # onto a bare page).
            if self.get_y() + 6 > self.PAGE_H - 20:
                self.add_page()
                self._page_header(f"{getattr(self, '_page_title_base', 'Table')} (continued)")
                _draw_header()
                self.set_font("Helvetica", "", 7)

            # Alternating fill
            if idx_row % 2 == 0:
                self.set_fill_color(*HOPPER_BG_ALT)
            else:
                self.set_fill_color(*WHITE)
            self.set_text_color(*HOPPER_TEXT_DARK)

            x = x_start
            for i, cell_val in enumerate(row):
                self.set_xy(x, self.get_y())
                self.cell(col_widths[i] - PAD, 5.8, _safe(str(cell_val)),
                          0, 0, _cell_align(i, cell_val), True)
                self.set_xy(x + col_widths[i] - PAD, self.get_y())
                self.cell(PAD, 5.8, "", 0, 0, "L", True)
                x += col_widths[i]
            self.ln(5.8)

        # -- Optional totals row
        if totals_row:
            if self.get_y() + 8 > self.PAGE_H - 20:
                self.add_page()
                self._page_header(f"{getattr(self, '_page_title_base', 'Table')} (continued)")
                _draw_header()
            # Top border
            y_now = self.get_y()
            self.set_draw_color(*HOPPER_NAVY_RGB)
            self.set_line_width(0.4)
            self.line(x_start, y_now, x_start + sum(col_widths), y_now)
            self.set_line_width(0.2)

            self.set_fill_color(*HOPPER_BG_LIGHT)
            self.set_text_color(*HOPPER_NAVY_RGB)
            self.set_font("Helvetica", "B", 7.5)
            x = x_start
            for i, cell_val in enumerate(totals_row):
                self.set_xy(x, self.get_y())
                self.cell(col_widths[i] - PAD, 6, _safe(str(cell_val)),
                          0, 0, _cell_align(i, cell_val), True)
                self.set_xy(x + col_widths[i] - PAD, self.get_y())
                self.cell(PAD, 6, "", 0, 0, "L", True)
                x += col_widths[i]
            self.ln(6)

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 6.5)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(0, 4, f"   ... and {len(rows) - max_rows} more rows omitted",
                      0, 1, "L")


def _apply_hopper_filters(opportunities, filters):
    """Apply optional filters dict to the Hopper opportunity list.

    Supported keys (all optional, exact-match case-insensitive):
        region, customer, status, maturity, restructure_type,
        evs / engine_value_stream, vp_owner, onerous_type, initiative,
        min_value (numeric — minimum CRP term benefit).
    """
    if not filters:
        return list(opportunities)

    # Map each accepted filter key onto the row field it should match.
    SIMPLE_FILTERS = {
        "region":             "region",
        "customer":           "customer",
        "status":             "status",
        "maturity":           "maturity",
        "restructure_type":   "restructure_type",
        "evs":                "engine_value_stream",
        "engine_value_stream":"engine_value_stream",
        "vp_owner":           "vp_owner",
        "onerous_type":       "onerous_type",
        "initiative":         "initiative",
    }

    filtered = []
    for row in opportunities:
        keep = True
        for fkey, row_field in SIMPLE_FILTERS.items():
            wanted = filters.get(fkey)
            if not wanted:
                continue
            if str(row.get(row_field, "")).strip().lower() != str(wanted).strip().lower():
                keep = False
                break
        if not keep:
            continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("crp_term_benefit")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    return filtered


HOPPER_SECTIONS = (
    "summary",            # title bar + KPI cards + meta strip + secondary KPI chips
    "charts",             # 3-chart hero (Pipeline / Region donut / Annual profit)
    "customer_analysis",  # Top customers chart + table
    "engine_analysis",    # EVS distribution chart + table
    "pipeline",           # Pipeline by Status table with totals
    "restructure",        # Restructure / Maturity / Onerous mini-tables
    "top_opportunities",  # Top 25 opportunities register
    "customer_breakdown", # Full ranked customer table
)


def _aggregate(rows, key, value_fn=None, count=False):
    """Helper: group rows by ``key`` and sum a value field (or count)."""
    out = {}
    for r in rows:
        k = str(r.get(key, "")).strip() or "Unknown"
        if count:
            out[k] = out.get(k, 0) + 1
        else:
            v = value_fn(r) if value_fn else _val(r.get("crp_term_benefit"))
            out[k] = out.get(k, 0) + v
    return out


def _hopper_top25_page(pdf, opps, title, subtitle=None):
    """Render a 'Top 25 opportunities by CRP term benefit' page (ranked
    descending). Shared by the filtered (e.g. MEA) and the global versions."""
    pdf.add_page()
    pdf._page_header(title)
    if subtitle:
        pdf.set_x(pdf.MARGIN_L)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(*HOPPER_TEXT_MUTE)
        pdf.cell(0, 4, _safe(subtitle), 0, 1, "L")
        pdf.ln(1)
    top = sorted(opps, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)[:25]
    rows = []
    for i, r in enumerate(top, 1):
        rows.append([str(i), _trunc(r.get("region", ""), 12), _trunc(r.get("customer", ""), 18),
                     _trunc(r.get("engine_value_stream", r.get("top_level_evs", "")), 16),
                     _trunc(r.get("restructure_type", ""), 16), _trunc(r.get("status", ""), 14),
                     _trunc(r.get("maturity", ""), 9), _fmtM_short(_val(r.get("crp_term_benefit"))),
                     _fmtM_short(_val(r.get("profit_2026"))), _fmtM_short(_val(r.get("profit_2027"))),
                     _trunc(r.get("vp_owner", ""), 18)])
    pdf._table(["#", "Region", "Customer", "Engine VS", "Restructure", "Status", "Maturity",
                "CRP", "2026", "2027", "VP/Owner"], rows,
               [8, 22, 35, 30, 30, 28, 18, 22, 18, 18, 35], right_align_idx={0, 7, 8, 9}, max_rows=25)


def _top25_titles(filters, region_set):
    """Build the (filtered_title, filtered_subtitle) for the scoped Top-25 page
    based on the active filters."""
    region = (filters or {}).get("region")
    if region:
        return (f"{region} Top 25 Opportunities by CRP Term Benefit",
                "Top opportunities within the current report filters, ranked by CRP term benefit.")
    if len(region_set) == 1:
        only = next(iter(region_set))
        return (f"{only} Top 25 Opportunities by CRP Term Benefit",
                "Top opportunities within the current report filters, ranked by CRP term benefit.")
    return ("Top 25 Opportunities by CRP Term Benefit (Filtered selection)",
            "Top opportunities within the current report filters, ranked by CRP term benefit.")


def generate_hopper_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate the Global Commercial Optimisation Hopper PDF report.

    Sections (canonical names): ``summary``, ``charts``, ``customer_analysis``,
    ``engine_analysis``, ``pipeline``, ``restructure``, ``top_opportunities``,
    ``customer_breakdown``.

    For backwards compatibility this function also accepts the older section
    names ``kpis``, ``top_opps``, and ``exec_report`` — they map onto the new
    section set.

    Parameters
    ----------
    parsed_data : dict
        Output from ``parser.parse_file`` for a Global Hopper workbook.
    sections_to_include : list, optional
        Subset of ``HOPPER_SECTIONS``. ``None`` or empty -> all sections.
    filters : dict, optional
        Optional row filters with keys: region, customer, status, maturity,
        restructure_type, min_value.

    Returns
    -------
    bytes
        The rendered PDF as a byte string.
    """
    # ------------------------------------------------------------------- inputs
    if not sections_to_include:
        sections_to_include = list(HOPPER_SECTIONS)
    # Legacy section-name aliases (preserve old contract):
    _alias = {"kpis": "summary", "top_opps": "top_opportunities", "exec_report": "customer_breakdown"}
    sections = {(_alias.get(s, s)) for s in sections_to_include}
    if filters is None:
        filters = {}

    meta = parsed_data.get("metadata", {})
    opportunities = parsed_data.get("opportunities", [])
    filtered = _apply_hopper_filters(opportunities, filters)

    # ------------------------------------------------------------------ totals
    total_crp = sum(_val(r.get("crp_term_benefit")) for r in filtered)
    totals_year = {y: sum(_val(r.get(f"profit_{y}")) for r in filtered)
                   for y in (2026, 2027, 2028, 2029, 2030)}
    total_opps = len(filtered)
    customers = {str(r.get("customer", "")).strip() for r in filtered if r.get("customer")}
    regions = {str(r.get("region", "")).strip() for r in filtered if r.get("region")}
    evss = {str(r.get("engine_value_stream", "")).strip() for r in filtered if r.get("engine_value_stream")}
    mature = sum(1 for r in filtered if str(r.get("maturity", "")).strip().lower() == "mature")
    immature = total_opps - mature
    onerous = sum(1 for r in filtered if "onerous" in str(r.get("onerous_type", "")).lower()
                  and "not" not in str(r.get("onerous_type", "")).lower())
    not_onerous = total_opps - onerous

    long_term = totals_year[2028] + totals_year[2029] + totals_year[2030]
    near_term = totals_year[2026] + totals_year[2027]
    date_str = datetime.now().strftime("%d %B %Y")

    pdf = HopperPDF()

    # ============================================================ COVER
    cover_meta = []
    if filters.get("region"):
        cover_meta.append(f"Filtered region: {filters['region']}")
    if filters.get("customer"):
        cover_meta.append(f"Filtered customer: {filters['customer']}")
    cover_meta += [
        f"Generated: {date_str}",
        f"Opportunities: {total_opps}   |   Customers: {len(customers)}   |   Regions: {len(regions)}",
        "Currency: GBP (millions)",
    ]
    _draw_cover(pdf, "Global Commercial Optimisation Hopper",
                "Executive Briefing", "GLOBAL HOPPER", cover_meta)

    if total_opps == 0:
        pdf.add_page()
        pdf._page_header("Executive Summary")
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(*HOPPER_TEXT_MUTE)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    # ============================================================ PAGE 1
    # Executive Summary: KPI cards (top accent) + narrative + secondary cards,
    # then the two hero bar charts below.
    pdf.add_page()
    pdf._exec_header("Executive Summary", "Portfolio value and profile")

    pdf._kpi_row_top([
        ("CRP Term Benefit", _fmtM_gbp(total_crp),
         f"{total_opps} opps - {len(customers)} customers", HOPPER_GOLD_RGB),
        ("Profit 2026", _fmtM_gbp(totals_year[2026]),
         f"26-27: {_fmtM_gbp(near_term)}", HOPPER_GOLD_RGB),
        ("Profit 2027", _fmtM_gbp(totals_year[2027]), None, HOPPER_PRIMARY_RGB),
        ("Profit 2028-30", _fmtM_gbp(long_term),
         f"Avg/year: {_fmtM_gbp(long_term / 3)}", HOPPER_GREEN_RGB),
    ])

    region_phrase = (f"the {sorted(regions)[0]} region" if len(regions) <= 1
                     else f"{len(regions)} regions")
    pdf._narrative(
        f"This briefing summarises {total_opps} commercial optimisation opportunities across "
        f"{region_phrase} and {len(customers)} customers, carrying {_fmtM_gbp(total_crp)} of CRP term "
        f"benefit. Near-term profit (2026-27) totals {_fmtM_gbp(near_term)}, with a further "
        f"{_fmtM_gbp(long_term)} forecast across 2028-30. {mature} opportunities are assessed as mature "
        f"and {onerous} sit within onerous contracts.")

    pdf._kpi_row_top([
        ("Mature", str(mature), f"{immature} immature", HOPPER_GREEN_RGB),
        ("Onerous", str(onerous), f"{not_onerous} not onerous", HOPPER_RED_RGB),
        ("Engine Value Streams", str(len(evss)), None, HOPPER_PRIMARY_RGB),
        ("Regions", str(len(regions)),
         ", ".join(sorted(regions)[:3]) + ("..." if len(regions) > 3 else ""), HOPPER_GOLD_RGB),
    ], h=20)

    # -- Two hero bar charts (Pipeline by Status + Annual Profit) -----------
    if "charts" in sections:
        try:
            chart_buf = _generate_hopper_charts(filtered, parsed_data.get("summary", {}))
            avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
            max_h = (pdf.PAGE_H - 20) - pdf.get_y() - 2
            _embed_fit(pdf, chart_buf, pdf.MARGIN_L, avail_w, max_h)
        except Exception as e:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(*HOPPER_TEXT_MUTE)
            pdf.cell(0, 5, _safe(f"(charts unavailable: {e})"), 0, 1, "L")

    # ============================================================ PIPELINE (own page)
    if "pipeline" in sections:
        pdf.add_page()
        pdf._page_header("Pipeline by Status")
        avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        try:
            pbuf = _generate_pipeline_chart(filtered)
            if pbuf is not None:
                pdf.image(pbuf, x=pdf.MARGIN_L, w=avail_w)
                pdf.ln(3)
        except Exception:
            pass
        by_status_count = _aggregate(filtered, "status", count=True)
        by_status_crp = _aggregate(filtered, "status")
        ordered = [s for s in PIPELINE_ORDER if s in by_status_count] + \
                  sorted((s for s in by_status_count if s not in PIPELINE_ORDER),
                         key=lambda s: by_status_crp.get(s, 0), reverse=True)
        if ordered:
            rows = [[_trunc(s, 60), str(by_status_count.get(s, 0)),
                     _fmtM_gbp(by_status_crp.get(s, 0)), _pct(by_status_crp.get(s, 0), total_crp)]
                    for s in ordered]
            pdf._section_header("Pipeline by stage")
            pdf._table(["Stage", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows,
                       [130, 40, 55, 30], right_align_idx={1, 2, 3},
                       totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])

    # ============================================================ CUSTOMER (chart + table)
    if "customer_analysis" in sections:
        pdf.add_page()
        pdf._page_header("CRP term benefit by customer")
        avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        try:
            cbuf = _generate_customer_chart(filtered, top_n=20)
            if cbuf is not None:
                pdf.image(cbuf, x=pdf.MARGIN_L, w=avail_w)
                pdf.ln(3)
        except Exception:
            pass
        by_cust = _aggregate(filtered, "customer")
        cust_n = _aggregate(filtered, "customer", count=True)
        cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)
        if cust_sorted:
            rows = [[str(i), _trunc(c, 42), str(cust_n.get(c, 0)), _fmtM_gbp(v),
                     _pct(v, total_crp)] for i, (c, v) in enumerate(cust_sorted, 1)]
            pdf._section_header("Customer breakdown")
            pdf._table(["#", "Customer", "Opportunities", "CRP Term (GBP m)", "% of Total"], rows,
                       [10, 110, 40, 55, 35], right_align_idx={2, 3, 4},
                       totals_row=["", "TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"],
                       max_rows=40)

    # ============================================================ ENGINE VALUE STREAM (charts + table)
    if "engine_analysis" in sections:
        pdf.add_page()
        pdf._page_header("Engine Value Stream Analysis")
        avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        try:
            ebuf = _generate_evs_charts(filtered, top_n=10)
            if ebuf is not None:
                pdf.image(ebuf, x=pdf.MARGIN_L, w=avail_w)
                pdf.ln(3)
        except Exception:
            pass

        by_evs_count = _aggregate(filtered, "engine_value_stream", count=True)
        by_evs_crp = _aggregate(filtered, "engine_value_stream")
        evs_sorted = sorted(by_evs_count.items(), key=lambda x: x[1], reverse=True)
        if evs_sorted:
            rows = [[_trunc(e, 50), str(c), _fmtM_gbp(by_evs_crp.get(e, 0)),
                     _pct(by_evs_crp.get(e, 0), total_crp)] for e, c in evs_sorted]
            pdf._section_header("Engine value stream breakdown")
            pdf._table(["Engine Value Stream", "Opportunities", "CRP Term (GBP m)", "% of Total"], rows,
                       [120, 40, 55, 30], right_align_idx={1, 2, 3},
                       totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])
        dens = [(e, by_evs_crp.get(e, 0) / max(1, c))
                for e, c in by_evs_count.items() if by_evs_crp.get(e, 0) > 0]
        if dens:
            dens.sort(key=lambda x: x[1], reverse=True)
            lead = dens[0]
            top_cnt = max(by_evs_count.items(), key=lambda x: x[1])
            pdf._narrative(
                f"Insight - {lead[0]} carries the highest value density at {_fmtM_gbp(lead[1])} per "
                f"opportunity, while {top_cnt[0]} leads on volume with {top_cnt[1]} opportunities. "
                f"Streams with high count but low CRP are early-stage volume worth maturing.")

    # ============================================================ RESTRUCTURE (charts + table, own page)
    if "restructure" in sections:
        pdf.add_page()
        pdf._page_header("Restructure Type")
        avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        try:
            sbuf = _generate_structure_charts(filtered)
            if sbuf is not None:
                pdf.image(sbuf, x=pdf.MARGIN_L, w=avail_w)
                pdf.ln(3)
        except Exception:
            pass
        rt_crp = _aggregate(filtered, "restructure_type")
        rt_n = _aggregate(filtered, "restructure_type", count=True)
        rt_sorted = sorted(rt_crp.items(), key=lambda x: x[1], reverse=True)
        if rt_sorted:
            rows = [[_trunc(k, 60), str(rt_n.get(k, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
                    for k, v in rt_sorted]
            pdf._section_header("Restructure type breakdown")
            pdf._table(["Restructure Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows,
                       [130, 40, 55, 30], right_align_idx={1, 2, 3},
                       totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])
            top_rt = rt_sorted[0]
            pdf._narrative(
                f"Insight - {top_rt[0]} accounts for {_pct(top_rt[1], total_crp)} of CRP term benefit. "
                f"The value and volume views together show where restructuring effort and reward concentrate.")

    # ============================================================ TOP 25 (own pages)
    if "top_opportunities" in sections:
        global_opps = parsed_data.get("opportunities", []) or filtered
        # Scoped (filtered, e.g. MEA) Top 25 first — only when filters actually
        # narrow the data (otherwise it would duplicate the global page).
        if len(filtered) != len(global_opps):
            f_title, f_sub = _top25_titles(filters, regions)
            _hopper_top25_page(pdf, filtered, f_title, f_sub)
        # Global Top 25 — across all regions, ignoring the report filters.
        _hopper_top25_page(
            pdf, global_opps, "Global Top 25 Opportunities by CRP Term Benefit",
            "Highest-value opportunities portfolio-wide, ranked by CRP term benefit "
            "(all regions — not limited by the report filters).")

    # ============================================================ PAGE 6
    # Opportunity Initiatives — the narrative behind each opportunity.
    # Every opportunity with an initiative is listed (including zero-CRP ones).
    init_opps = [r for r in sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")),
                                   reverse=True)
                 if str(r.get("initiative", "") or "").strip()]
    if init_opps:
        pdf.add_page()
        pdf._page_header("Opportunities")
        body_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        for idx, r in enumerate(init_opps):
            init_text = str(r.get("initiative", "") or "").strip()
            # Keep the heading with at least the first lines of its initiative.
            if pdf.get_y() > pdf.PAGE_H - 36:
                pdf.add_page()
                pdf._page_header("Opportunities (continued)")
            elif idx > 0:
                # Thin rule between entries for readability.
                y = pdf.get_y()
                pdf.set_draw_color(*HOPPER_BORDER)
                pdf.set_line_width(0.2)
                pdf.line(pdf.MARGIN_L, y, pdf.PAGE_W - pdf.MARGIN_R, y)
                pdf.ln(3)
            cust = _safe(r.get("customer", "") or "-")
            evs = _safe(r.get("engine_value_stream", r.get("top_level_evs", "")) or "-")
            status = _safe(r.get("status", "") or "-")
            crp = _fmtM_gbp(_val(r.get("crp_term_benefit")))
            pdf.set_x(pdf.MARGIN_L)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*HOPPER_PRIMARY_RGB)
            pdf.cell(0, 6, _safe(f"{cust}   |   {evs}   |   {status}   |   CRP {crp}"), 0, 1, "L")
            pdf.set_x(pdf.MARGIN_L)
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(*HOPPER_TEXT_DARK)
            pdf.multi_cell(body_w, 5.2, _safe(init_text))
            pdf.ln(3)

    return bytes(pdf.output())


# =============================================================================
# Generic chart builders (used by the DETAILED report)
# =============================================================================

def _finish_fig(fig, pad=1.6, seps=None):
    import matplotlib.pyplot as plt
    fig.patch.set_facecolor('white')
    try:
        plt.tight_layout(pad=pad)
    except Exception:
        pass
    if seps:
        _add_separators(fig, seps)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _chart_vbars(panels, labels, rotate=20, label_fs=8, height=4.4):
    """1- or 2-panel vertical bar chart. ``panels`` = list of
    (values, title, color_hex, fmt_fn). Thick reference gridlines + separators."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = len(panels)
    fig, axes = plt.subplots(1, n, figsize=(13, height), dpi=160)
    if n == 1:
        axes = [axes]

    def wrap(s):
        return s.replace(" ", "\n", 1) if (" " in s and len(s) > 12) else s

    for ax, (vals, title, color, fmt) in zip(axes, panels):
        _style_value_axis(ax)
        bars = ax.bar(range(len(labels)), vals, color=color, width=0.62)
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels([wrap(str(l)) for l in labels], fontsize=label_fs,
                           rotation=rotate, ha='right' if rotate else 'center', color='#374151')
        for b, v in zip(bars, vals):
            if v:
                ax.text(b.get_x() + b.get_width()/2, b.get_height(), fmt(v),
                        ha='center', va='bottom', fontsize=label_fs, color=HOPPER_NAVY, weight='bold')
        ax.margins(y=0.18)
        ax.set_title(title, loc='left', pad=8)
    return _finish_fig(fig, pad=2.0, seps=list(axes) if n > 1 else None)


def _chart_donut(pairs, title, palette=None):
    pairs = [(l, v) for l, v in pairs if v and v > 0]
    if not pairs:
        return None
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    palette = palette or DONUT_PALETTE
    labels = [p[0] for p in pairs]
    vals = [p[1] for p in pairs]
    total = sum(vals)
    fig, ax = plt.subplots(figsize=(11, 4.6), dpi=160)
    colors = [palette[i % len(palette)] for i in range(len(labels))]
    wedges, _t, _a = ax.pie(
        vals, labels=None, autopct=lambda p: f"{p:.0f}%" if p >= 4 else "",
        colors=colors, startangle=90, pctdistance=0.78,
        textprops={'color': 'white', 'fontsize': 9, 'weight': 'bold'},
        wedgeprops={'width': 0.42, 'edgecolor': 'white', 'linewidth': 2})
    ax.legend(wedges, [f"{str(l)[:24]} ({v / total * 100:.0f}%)" for l, v in zip(labels, vals)],
              loc='center left', bbox_to_anchor=(0.98, 0.5), fontsize=9.5, frameon=False)
    ax.set_title(title, loc='left', pad=12, color=HOPPER_NAVY, fontsize=12, fontweight='bold')
    ax.axis('equal')
    return _finish_fig(fig, pad=1.4)


def _chart_hbar(pairs, title, value_fmt, color=VALUE_HEX, top_n=15):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    pairs = sorted(pairs, key=lambda x: x[1], reverse=True)[:top_n]
    pairs.reverse()
    if not pairs:
        return None
    names = [str(l)[:26] for l, _ in pairs]
    vals = [v for _, v in pairs]
    h = max(3.6, min(7.0, 0.42 * len(pairs) + 1.6))
    fig, ax = plt.subplots(figsize=(13, h), dpi=160)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e5e7eb')
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.grid(True, axis='x', **GRID_KW)
    ax.set_axisbelow(True)
    ax.tick_params(colors='#374151', labelsize=9.5, length=0)
    bars = ax.barh(names, vals, color=color, height=0.66)
    span = max(vals) if vals else 0
    for b, v in zip(bars, vals):
        ax.text(b.get_width() + span * 0.005, b.get_y() + b.get_height()/2,
                "  " + value_fmt(v), va='center', ha='left', fontsize=9,
                color=HOPPER_NAVY, weight='bold')
    ax.set_title(title, loc='left', pad=10, color=HOPPER_NAVY, fontsize=12, fontweight='bold')
    ax.margins(x=0.14)
    return _finish_fig(fig, pad=1.5)


def _chart_concentration(values, title):
    """Pareto of CRP term benefit by individual opportunity (ranked desc):
    gold value bars + a navy cumulative-share line on a right-hand % axis with
    an 80% reference line and the count of opportunities needed to reach it.
    A portfolio concentration view not shown on any other page."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    vals = sorted([float(v) for v in values if v and float(v) > 0], reverse=True)
    if len(vals) < 2:
        return None
    total = sum(vals)
    cum, run = [], 0.0
    for v in vals:
        run += v
        cum.append(run / total * 100.0)
    n = len(vals)
    n80 = next((i + 1 for i, c in enumerate(cum) if c >= 80.0), n)

    fig, ax = plt.subplots(figsize=(13, 3.5), dpi=160)
    xs = list(range(1, n + 1))
    ax.bar(xs, vals, color=VALUE_HEX, width=0.85, zorder=2)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.grid(True, axis='y', **GRID_KW)
    ax.set_axisbelow(True)
    ax.tick_params(axis='y', left=False, labelleft=False)
    ax.tick_params(axis='x', colors='#374151', labelsize=8, length=0)
    ax.set_xlim(0.3, n + 0.7)
    ax.set_xlabel("Opportunities ranked by CRP term benefit (highest to lowest)",
                  fontsize=8, color='#6b7280')

    ax2 = ax.twinx()
    ax2.plot(xs, cum, color=HOPPER_PRIMARY, linewidth=2.0, marker='o',
             markersize=3, zorder=3)
    ax2.axhline(80, color=HOPPER_SLATE, linewidth=1.0, linestyle='--', zorder=1)
    ax2.set_ylim(0, 106)
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_color('#e5e7eb')
    ax2.tick_params(axis='y', colors=HOPPER_PRIMARY, labelsize=8, length=0)
    ax2.set_yticks([0, 20, 40, 60, 80, 100])
    ax2.set_yticklabels(["0%", "20%", "40%", "60%", "80%", "100%"])
    ax2.annotate(
        f"{n80} of {n} opportunities ({n80 / n * 100:.0f}%) drive 80% of CRP term benefit",
        xy=(n80, 80), xytext=(min(n80 + 1, max(2, n - 1)), 50),
        fontsize=8.5, color=HOPPER_NAVY, weight='bold',
        arrowprops=dict(arrowstyle='->', color=HOPPER_SLATE, lw=1))
    ax.set_title(title, loc='left', pad=8, color=HOPPER_NAVY, fontsize=12, fontweight='bold')

    fig.patch.set_facecolor('white')
    try:
        plt.tight_layout(pad=1.4)
    except Exception:
        pass
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


# Deterministic donut layout (data-space half-extent and wedge mid-radius) so
# the maturity donut's wedges can be mapped to exact page coordinates for the
# interactive hover panels in _inject_maturity_rollovers.
_DONUT_HALF = 1.35
_DONUT_MIDR = 0.79


def _maturity_donut(mat_n, mat_crp, total_crp):
    """Square maturity donut (no embedded legend) drawn with a fixed layout so
    each wedge's mid-angle maps to a known page position. Returns
    ``(png_buf, wedges)``; each wedge dict carries its mid-angle (degrees, math
    convention) and the breakdown lines shown on hover."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    items = [(k, v) for k, v in sorted(mat_n.items(), key=lambda x: x[1], reverse=True)
             if v and v > 0]
    if not items:
        return None, []
    total = sum(v for _, v in items) or 1
    sem = {"mature": HOPPER_GREEN, "immature": "#c98a2e"}
    palette = [sem.get(str(k).strip().lower(), HOPPER_SLATE) for k, _ in items]

    fig = plt.figure(figsize=(4.6, 4.6), dpi=200)
    ax = fig.add_axes([0, 0, 1, 1])   # axes fills the whole (square) figure
    ax.set_aspect('equal')
    ax.axis('off')
    ax.pie([v for _, v in items], radius=1.0, startangle=90, counterclock=False,
           colors=palette, autopct=lambda p: f"{p:.0f}%" if p >= 5 else "",
           pctdistance=0.79,
           textprops=dict(color='white', fontsize=13, fontweight='bold'),
           wedgeprops=dict(width=0.42, edgecolor='white', linewidth=2))
    ax.set_xlim(-_DONUT_HALF, _DONUT_HALF)
    ax.set_ylim(-_DONUT_HALF, _DONUT_HALF)
    ax.text(0, 0, "MATURITY", ha='center', va='center', fontsize=8.5,
            color=HOPPER_NAVY, fontweight='bold')
    # NOTE: no bbox_inches='tight' — we need the full square frame intact so
    # the fraction->page-coordinate mapping below stays valid.
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=200, facecolor='white')
    plt.close(fig)
    buf.seek(0)

    wedges, a = [], 90.0
    for (k, v), col in zip(items, palette):
        frac = v / total
        mid = a - frac * 180.0
        a -= frac * 360.0
        crp = mat_crp.get(k, 0)
        rgb = _hex_to_rgb(col)
        wedges.append({
            "label": str(k),
            "mid_deg": mid,
            "accent": (rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0),
            "lines": [
                f"{int(round(v))} opportunities  ({v / total * 100:.0f}% of opportunities)",
                f"CRP term benefit: {_fmtM_gbp(crp)}",
                f"Share of CRP term benefit: {_pct(crp, total_crp)}",
            ],
        })
    return buf, wedges


def _mm_to_pt(mm):
    return mm * 72.0 / 25.4


def _inject_maturity_rollovers(pdf_bytes, page_index, img_x, img_y, side, wedges,
                               page_w_mm=297, page_h_mm=210):
    """Add hover-reveal detail panels over each maturity donut wedge so the PDF
    becomes interactive (pop-up on hover, works in Adobe Acrobat / Reader). The
    panel for the hovered wedge is shown via /AA Hide actions — no JavaScript.

    Best-effort: returns ``pdf_bytes`` unchanged if pikepdf is unavailable or
    anything goes wrong (the report is still valid, just non-interactive)."""
    if not wedges:
        return pdf_bytes
    try:
        import math
        import pikepdf
        from pikepdf import Name, Dictionary, Array, String, Stream
    except Exception:
        return pdf_bytes

    def esc(s):
        return str(s).replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    try:
        pdf = pikepdf.open(io.BytesIO(bytes(pdf_bytes)))
        if page_index < 0 or page_index >= len(pdf.pages):
            return pdf_bytes
        helv = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1,
                                             BaseFont=Name.Helvetica))
        helvb = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1,
                                              BaseFont=Name("/Helvetica-Bold")))
        font_res = Dictionary(Font=Dictionary(Helv=helv, HeBo=helvb))
        page = pdf.pages[page_index]
        if "/Annots" not in page.obj:
            page.obj.Annots = pdf.make_indirect(Array())
        annots = page.obj.Annots
        fields = []
        counter = [0]

        def uname():
            counter[0] += 1
            return f"mzdonut{counter[0]}"

        def make_ap(w, h, content):
            st = Stream(pdf, content)
            st.Type = Name.XObject
            st.Subtype = Name.Form
            st.FormType = 1
            st.BBox = Array([0, 0, w, h])
            st.Resources = Dictionary(Font=Dictionary(Helv=helv, HeBo=helvb))
            return pdf.make_indirect(st)

        # Shared panel rectangle (points), placed to the right of the donut.
        pw_mm, ph_mm = 120.0, 38.0
        px0_mm = img_x + side + 8
        if px0_mm + pw_mm > page_w_mm - 10:
            px0_mm = page_w_mm - 10 - pw_mm
        py_top_mm = img_y + 2
        panel_x0 = _mm_to_pt(px0_mm)
        panel_x1 = _mm_to_pt(px0_mm + pw_mm)
        panel_y1 = _mm_to_pt(page_h_mm) - _mm_to_pt(py_top_mm)
        panel_y0 = _mm_to_pt(page_h_mm) - _mm_to_pt(py_top_mm + ph_mm)
        pw_pt, ph_pt = panel_x1 - panel_x0, panel_y1 - panel_y0

        for w in wedges:
            r, g, b = w["accent"]
            ops = [
                "0.972 0.976 0.984 rg 0 0 %.1f %.1f re f" % (pw_pt, ph_pt),
                "%.3f %.3f %.3f rg 0 0 4 %.1f re f" % (r, g, b, ph_pt),
                "0.80 0.82 0.86 RG 0.8 w 0 0 %.1f %.1f re S" % (pw_pt, ph_pt),
            ]
            ty = ph_pt - 17
            ops.append("BT /HeBo 12 Tf 0.039 0.114 0.180 rg 12 %.1f Td (%s) Tj ET"
                       % (ty, esc(w["label"].upper())))
            ty -= 16
            for ln in w["lines"]:
                ops.append("BT /Helv 9.5 Tf 0.16 0.18 0.22 rg 12 %.1f Td (%s) Tj ET"
                           % (ty, esc(ln)))
                ty -= 12.5
            panel_ap = make_ap(pw_pt, ph_pt, ("\n".join(ops) + "\n").encode("latin-1"))
            pname = uname()
            panel = pdf.make_indirect(Dictionary(
                Type=Name.Annot, Subtype=Name.Widget, FT=Name.Btn, Ff=65536,
                T=String(pname), F=2,   # hidden until hover
                Rect=Array([panel_x0, panel_y0, panel_x1, panel_y1]),
                AP=Dictionary(N=panel_ap), MK=Dictionary(),
                BS=Dictionary(W=0, S=Name.S)))
            panel.P = page.obj
            annots.append(panel)
            fields.append(panel)

            show = pdf.make_indirect(Dictionary(Type=Name.Action, S=Name.Hide,
                                                T=String(pname), H=False))
            hide = pdf.make_indirect(Dictionary(Type=Name.Action, S=Name.Hide,
                                                T=String(pname), H=True))

            mid = math.radians(w["mid_deg"])
            fx = (_DONUT_MIDR * math.cos(mid) + _DONUT_HALF) / (2 * _DONUT_HALF)
            fy = (_DONUT_MIDR * math.sin(mid) + _DONUT_HALF) / (2 * _DONUT_HALF)
            cx_mm = img_x + fx * side
            cy_mm = img_y + (1 - fy) * side   # page-y grows downward
            hb = 14.0                          # half-box (mm) -> 28mm hotspot
            hx0 = _mm_to_pt(cx_mm - hb)
            hx1 = _mm_to_pt(cx_mm + hb)
            hy1 = _mm_to_pt(page_h_mm) - _mm_to_pt(cy_mm - hb)
            hy0 = _mm_to_pt(page_h_mm) - _mm_to_pt(cy_mm + hb)
            hot = pdf.make_indirect(Dictionary(
                Type=Name.Annot, Subtype=Name.Widget, FT=Name.Btn, Ff=65536,
                T=String(uname()), F=4,
                Rect=Array([hx0, hy0, hx1, hy1]),
                AP=Dictionary(N=make_ap(hx1 - hx0, hy1 - hy0, b"")),
                AA=Dictionary(E=show, X=hide),
                MK=Dictionary(), BS=Dictionary(W=0, S=Name.S)))
            hot.P = page.obj
            annots.append(hot)
            fields.append(hot)

        # AcroForm lets the Hide actions resolve panels by name. NEVER set
        # NeedAppearances — it would clobber our custom appearance streams.
        if "/AcroForm" in pdf.Root:
            acro = pdf.Root.AcroForm
            if "/Fields" not in acro:
                acro.Fields = Array(fields)
            else:
                for f in fields:
                    acro.Fields.append(f)
            acro.DR = font_res
            acro.DA = String("/Helv 0 Tf 0 g")
        else:
            pdf.Root.AcroForm = pdf.make_indirect(Dictionary(
                Fields=Array(fields), DA=String("/Helv 0 Tf 0 g"), DR=font_res))

        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()
    except Exception:
        return pdf_bytes


# =============================================================================
# DETAILED Hopper report — long-form, every analysis, respects filters
# =============================================================================

def generate_hopper_detailed_pdf_report(parsed_data: dict, sections_to_include: list = None,
                                        filters: dict = None) -> bytes:
    """A comprehensive, long-form Hopper briefing (typically 15-20+ pages):
    every analysis rendered as a chart AND a supporting table, with insight
    notes throughout. Respects the same filters as the standard report."""
    filters = filters or {}
    meta = parsed_data.get("metadata", {})
    filtered = _apply_hopper_filters(parsed_data.get("opportunities", []), filters)

    total_crp = sum(_val(r.get("crp_term_benefit")) for r in filtered)
    totals_year = {y: sum(_val(r.get(f"profit_{y}")) for r in filtered)
                   for y in (2026, 2027, 2028, 2029, 2030)}
    total_opps = len(filtered)
    customers = {str(r.get("customer", "")).strip() for r in filtered if r.get("customer")}
    regions = {str(r.get("region", "")).strip() for r in filtered if r.get("region")}
    evss = {str(r.get("engine_value_stream", "")).strip() for r in filtered if r.get("engine_value_stream")}
    mature = sum(1 for r in filtered if str(r.get("maturity", "")).strip().lower() == "mature")
    immature = total_opps - mature
    onerous = sum(1 for r in filtered if "onerous" in str(r.get("onerous_type", "")).lower()
                  and "not" not in str(r.get("onerous_type", "")).lower())
    not_onerous = total_opps - onerous
    long_term = totals_year[2028] + totals_year[2029] + totals_year[2030]
    near_term = totals_year[2026] + totals_year[2027]
    date_str = datetime.now().strftime("%d %B %Y")
    avail_w = HopperPDF.PAGE_W - HopperPDF.MARGIN_L - HopperPDF.MARGIN_R

    pdf = HopperPDF()

    cover_meta = []
    if filters.get("region"):
        cover_meta.append(f"Filtered region: {filters['region']}")
    if filters.get("customer"):
        cover_meta.append(f"Filtered customer: {filters['customer']}")
    cover_meta += [
        f"Generated: {date_str}",
        f"Opportunities: {total_opps}   |   Customers: {len(customers)}   |   Regions: {len(regions)}",
        "Currency: GBP (millions)   |   Detailed report",
    ]
    _draw_cover(pdf, "Global Commercial Optimisation Hopper",
                "Detailed Report", "GLOBAL HOPPER - DETAILED", cover_meta)

    if total_opps == 0:
        pdf.add_page()
        pdf._page_header("Executive Summary")
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(*HOPPER_TEXT_MUTE)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    by_cust = _aggregate(filtered, "customer")
    cust_n = _aggregate(filtered, "customer", count=True)
    cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)

    # ---- Executive Summary ----
    pdf.add_page()
    pdf._exec_header("Executive Summary", "Portfolio value and profile")
    pdf._kpi_row_top([
        ("CRP Term Benefit", _fmtM_gbp(total_crp),
         f"{total_opps} opps - {len(customers)} customers", HOPPER_GOLD_RGB),
        ("Profit 2026", _fmtM_gbp(totals_year[2026]), f"26-27: {_fmtM_gbp(near_term)}", HOPPER_GOLD_RGB),
        ("Profit 2027", _fmtM_gbp(totals_year[2027]), None, HOPPER_PRIMARY_RGB),
        ("Profit 2028-30", _fmtM_gbp(long_term), f"Avg/year: {_fmtM_gbp(long_term / 3)}", HOPPER_GREEN_RGB),
    ])
    region_phrase = (f"the {sorted(regions)[0]} region" if len(regions) <= 1
                     else f"{len(regions)} regions")
    pdf._narrative(
        f"This detailed briefing covers {total_opps} commercial optimisation opportunities across "
        f"{region_phrase} and {len(customers)} customers, carrying {_fmtM_gbp(total_crp)} of CRP term "
        f"benefit. Near-term profit (2026-27) totals {_fmtM_gbp(near_term)}, with {_fmtM_gbp(long_term)} "
        f"forecast across 2028-30. Every dimension below is shown as both a chart and a supporting table.")
    pdf._kpi_row_top([
        ("Mature", str(mature), f"{immature} immature", HOPPER_GREEN_RGB),
        ("Onerous", str(onerous), f"{not_onerous} not onerous", HOPPER_RED_RGB),
        ("Engine Value Streams", str(len(evss)), None, HOPPER_PRIMARY_RGB),
        ("Regions", str(len(regions)),
         ", ".join(sorted(regions)[:3]) + ("..." if len(regions) > 3 else ""), HOPPER_GOLD_RGB),
    ], h=20)
    # Fill the lower half with a portfolio concentration (Pareto) view — a
    # cumulative-share curve that appears on no other page.
    conc_vals = [_val(r.get("crp_term_benefit")) for r in filtered]
    try:
        kbuf = _chart_concentration(conc_vals, "Value concentration - cumulative share of CRP term benefit")
        if kbuf is not None:
            pdf._section_header("Portfolio value concentration")
            max_h = (pdf.PAGE_H - 20) - pdf.get_y() - 2
            _embed_fit(pdf, kbuf, pdf.MARGIN_L, avail_w, max(70, max_h))
    except Exception:
        pass

    # ---- Pipeline by Status (value + count) ----
    pdf.add_page()
    pdf._page_header("Pipeline by Status")
    stages, p_vals = _pipeline_stages(filtered)
    st_count = _aggregate(filtered, "status", count=True)
    p_counts = [st_count.get(s, 0) for s in stages]
    try:
        buf = _chart_vbars([(p_vals, "By CRP term benefit (£m)", VALUE_HEX, lambda v: f"£{v:,.0f}m"),
                            (p_counts, "By opportunities (count)", COUNT_HEX, lambda v: f"{int(v)}")],
                           [s[:14] for s in stages], rotate=25, label_fs=7, height=4.0)
        _embed_fit(pdf, buf, pdf.MARGIN_L, avail_w, 92)
        pdf.ln(2)
    except Exception:
        pass
    by_status_crp = _aggregate(filtered, "status")
    rows = [[_trunc(s, 60), str(st_count.get(s, 0)), _fmtM_gbp(by_status_crp.get(s, 0)),
             _pct(by_status_crp.get(s, 0), total_crp)] for s in stages]
    pdf._section_header("Pipeline by stage")
    pdf._table(["Stage", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [130, 40, 55, 30],
               right_align_idx={1, 2, 3},
               totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])

    # ---- Annual Profit Forecast ----
    pdf.add_page()
    pdf._page_header("Annual Profit Forecast")
    years = ["2026", "2027", "2028", "2029", "2030"]
    try:
        buf = _chart_vbars([([totals_year[int(y)] for y in years], "Forecast profit by year (£m)",
                             VALUE_HEX, lambda v: f"£{v:,.0f}m")], years, rotate=0, label_fs=9, height=4.2)
        _embed_fit(pdf, buf, pdf.MARGIN_L, avail_w, 95)
        pdf.ln(2)
    except Exception:
        pass
    allp = sum(totals_year.values()) or 1
    rows = [[y, _fmtM_gbp(totals_year[int(y)]), _pct(totals_year[int(y)], allp)] for y in years]
    pdf._section_header("Annual profit")
    pdf._table(["Year", "Profit (GBP m)", "% of Forecast"], rows, [40, 60, 40], right_align_idx={1, 2},
               totals_row=["TOTAL", _fmtM_gbp(allp), "100.0%"])

    # ---- Regional Analysis (only when the data spans more than one region) ----
    if len(regions) > 1:
        pdf.add_page()
        pdf._page_header("Regional Analysis")
        by_region = _aggregate(filtered, "region")
        reg_n = _aggregate(filtered, "region", count=True)
        reg_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
        try:
            buf = _chart_donut(reg_sorted, "CRP by region")
            _embed_fit(pdf, buf, pdf.MARGIN_L, avail_w, 92)
            pdf.ln(2)
        except Exception:
            pass
        rows = [[_trunc(r, 40), str(reg_n.get(r, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
                for r, v in reg_sorted]
        pdf._section_header("Region breakdown")
        pdf._table(["Region", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [120, 45, 55, 45],
                   right_align_idx={1, 2, 3},
                   totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])

    # ---- Customer Analysis (chart + full breakdown w/ profit columns) ----
    pdf.add_page()
    pdf._page_header("Customer Analysis")
    try:
        cbuf = _generate_customer_chart(filtered, top_n=15)
        if cbuf is not None:
            _embed_fit(pdf, cbuf, pdf.MARGIN_L, avail_w, 96)
            pdf.ln(2)
    except Exception:
        pass
    # full customer breakdown with profit columns
    full = {}
    for r in filtered:
        c = str(r.get("customer", "")).strip() or "Unknown"
        slot = full.setdefault(c, {"n": 0, "crp": 0.0, "p26": 0.0, "p27": 0.0, "p2830": 0.0})
        slot["n"] += 1
        slot["crp"] += _val(r.get("crp_term_benefit"))
        slot["p26"] += _val(r.get("profit_2026"))
        slot["p27"] += _val(r.get("profit_2027"))
        slot["p2830"] += (_val(r.get("profit_2028")) + _val(r.get("profit_2029")) + _val(r.get("profit_2030")))
    rows = []
    for i, (c, d) in enumerate(sorted(full.items(), key=lambda x: x[1]["crp"], reverse=True), 1):
        rows.append([str(i), _trunc(c, 42), str(d["n"]), _fmtM_gbp(d["crp"]),
                     _fmtM_short(d["p26"]), _fmtM_short(d["p27"]), _fmtM_short(d["p2830"]),
                     _pct(d["crp"], total_crp)])
    pdf._section_header("Customer breakdown")
    pdf._table(["#", "Customer", "Opps", "CRP Term (GBP m)", "Profit 2026", "Profit 2027",
                "Profit 2028-30", "% of CRP"], rows, [8, 71, 18, 40, 32, 32, 38, 26],
               right_align_idx={2, 3, 4, 5, 6, 7},
               totals_row=["", "TOTAL", str(total_opps), _fmtM_gbp(total_crp),
                           _fmtM_short(totals_year[2026]), _fmtM_short(totals_year[2027]),
                           _fmtM_short(long_term), "100.0%"], max_rows=80)

    # ---- Engine Value Stream (charts + table) ----
    pdf.add_page()
    pdf._page_header("Engine Value Stream Analysis")
    try:
        ebuf = _generate_evs_charts(filtered, top_n=12)
        if ebuf is not None:
            _embed_fit(pdf, ebuf, pdf.MARGIN_L, avail_w, 90)
            pdf.ln(2)
    except Exception:
        pass
    by_evs_count = _aggregate(filtered, "engine_value_stream", count=True)
    by_evs_crp = _aggregate(filtered, "engine_value_stream")
    evs_sorted = sorted(by_evs_count.items(), key=lambda x: x[1], reverse=True)
    rows = [[_trunc(e, 50), str(c), _fmtM_gbp(by_evs_crp.get(e, 0)), _pct(by_evs_crp.get(e, 0), total_crp)]
            for e, c in evs_sorted]
    pdf._section_header("Engine value stream breakdown")
    pdf._table(["Engine Value Stream", "Opportunities", "CRP Term (GBP m)", "% of Total"], rows,
               [120, 40, 55, 30], right_align_idx={1, 2, 3},
               totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])

    # ---- Restructure Type (charts + table) ----
    pdf.add_page()
    pdf._page_header("Restructure Type")
    try:
        sbuf = _generate_structure_charts(filtered)
        if sbuf is not None:
            _embed_fit(pdf, sbuf, pdf.MARGIN_L, avail_w, 90)
            pdf.ln(2)
    except Exception:
        pass
    rt_crp = _aggregate(filtered, "restructure_type")
    rt_n = _aggregate(filtered, "restructure_type", count=True)
    rows = [[_trunc(k, 60), str(rt_n.get(k, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
            for k, v in sorted(rt_crp.items(), key=lambda x: x[1], reverse=True)]
    pdf._section_header("Restructure type breakdown")
    pdf._table(["Restructure Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows,
               [130, 40, 55, 30], right_align_idx={1, 2, 3},
               totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"])

    # ---- Maturity & Risk (interactive donut + tables) ----
    maturity_inject = None   # (page_no, img_x, img_y, side, wedges) for post-processing
    pdf.add_page()
    pdf._page_header("Maturity & Risk Profile")
    mat_crp = _aggregate(filtered, "maturity")
    mat_n = _aggregate(filtered, "maturity", count=True)
    on_crp = _aggregate(filtered, "onerous_type")
    on_n = _aggregate(filtered, "onerous_type", count=True)
    d_x, d_y, d_side = pdf.MARGIN_L + 4, 24, 84
    try:
        mbuf, mwedges = _maturity_donut(mat_n, mat_crp, total_crp)
        if mbuf is not None:
            pdf.image(mbuf, x=d_x, y=d_y, w=d_side, h=d_side)
            # Static key + interactivity hint to the right of the donut.
            sem = {"mature": HOPPER_GREEN, "immature": "#c98a2e"}
            lx, ly = d_x + d_side + 12, d_y + d_side - 30
            mat_total = sum(mat_n.values()) or 1
            for k, v in sorted(mat_n.items(), key=lambda x: x[1], reverse=True):
                if not v:
                    continue
                rgb = _hex_to_rgb(sem.get(str(k).strip().lower(), HOPPER_SLATE))
                pdf.set_fill_color(*rgb)
                pdf.rect(lx, ly, 4, 4, "F")
                pdf.set_xy(lx + 6, ly - 0.6)
                pdf.set_font("Helvetica", "B", 9)
                pdf.set_text_color(*HOPPER_TEXT_DARK)
                pdf.cell(60, 5, _safe(f"{k}  -  {v / mat_total * 100:.0f}%"), 0, 0, "L")
                ly += 7
            pdf.set_xy(lx, ly + 1)
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.set_text_color(*HOPPER_TEXT_MUTE)
            pdf.cell(0, 4, "Hover a segment for its breakdown (interactive in Adobe Acrobat / Reader).",
                     0, 1, "L")
            if mwedges:
                maturity_inject = (pdf.page_no(), d_x, d_y, d_side, mwedges)
            pdf.set_y(d_y + d_side + 4)
    except Exception:
        pdf.set_y(d_y + d_side + 4)
    pdf._section_header("Maturity breakdown")
    rows = [[_trunc(k, 40), str(mat_n.get(k, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
            for k, v in sorted(mat_crp.items(), key=lambda x: x[1], reverse=True)]
    pdf._table(["Maturity", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [120, 45, 55, 45],
               right_align_idx={1, 2, 3})
    pdf._section_header("Onerous contract status")
    rows = [[_trunc(k, 40), str(on_n.get(k, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
            for k, v in sorted(on_crp.items(), key=lambda x: x[1], reverse=True)]
    pdf._table(["Onerous Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [120, 45, 55, 45],
               right_align_idx={1, 2, 3})
    pdf._narrative(f"Insight - {_pct(onerous, total_opps)} of opportunities are onerous and "
                   f"{_pct(immature, total_opps)} are immature — the principal execution risks to the forecast.")

    # ---- Top 25 (scoped/filtered first, then global) ----
    global_opps = parsed_data.get("opportunities", []) or filtered
    if len(filtered) != len(global_opps):
        f_title, f_sub = _top25_titles(filters, regions)
        _hopper_top25_page(pdf, filtered, f_title, f_sub)
    _hopper_top25_page(
        pdf, global_opps, "Global Top 25 Opportunities by CRP Term Benefit",
        "Highest-value opportunities portfolio-wide, ranked by CRP term benefit "
        "(all regions — not limited by the report filters).")

    # ---- Opportunities (initiatives) ----
    init_opps = [r for r in sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)
                 if str(r.get("initiative", "") or "").strip()]
    if init_opps:
        pdf.add_page()
        pdf._page_header("Opportunities")  # detailed-report initiatives
        body_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
        for idx, r in enumerate(init_opps):
            init_text = str(r.get("initiative", "") or "").strip()
            if pdf.get_y() > pdf.PAGE_H - 36:
                pdf.add_page()
                pdf._page_header("Opportunities (continued)")
            elif idx > 0:
                y = pdf.get_y()
                pdf.set_draw_color(*HOPPER_BORDER)
                pdf.set_line_width(0.2)
                pdf.line(pdf.MARGIN_L, y, pdf.PAGE_W - pdf.MARGIN_R, y)
                pdf.ln(3)
            cust = _safe(r.get("customer", "") or "-")
            evs = _safe(r.get("engine_value_stream", r.get("top_level_evs", "")) or "-")
            status = _safe(r.get("status", "") or "-")
            crp = _fmtM_gbp(_val(r.get("crp_term_benefit")))
            pdf.set_x(pdf.MARGIN_L)
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_text_color(*HOPPER_PRIMARY_RGB)
            pdf.cell(0, 6, _safe(f"{cust}   |   {evs}   |   {status}   |   CRP {crp}"), 0, 1, "L")
            pdf.set_x(pdf.MARGIN_L)
            pdf.set_font("Helvetica", "", 9.5)
            pdf.set_text_color(*HOPPER_TEXT_DARK)
            pdf.multi_cell(body_w, 5.2, _safe(init_text))
            pdf.ln(3)

    out = bytes(pdf.output())
    # Make the maturity donut interactive: hover a wedge to reveal its details.
    if maturity_inject:
        page_no, ix, iy, side, wedges = maturity_inject
        out = _inject_maturity_rollovers(out, page_no - 1, ix, iy, side, wedges)
    return out
