"""
PDF Export Module for Rolls-Royce Power BI Dashboard
====================================================
Produces three branded, executive-briefing PDF reports:

    * ``generate_pdf_report``         -- SOA (Statement of Account) report
    * ``generate_opp_pdf_report``     -- Opportunity Tracker report
    * ``generate_hopper_pdf_report``  -- Global Commercial Optimisation Hopper report

All three entry-point signatures are preserved verbatim so existing
``server.py`` imports continue to work unchanged. The reports always render the
full briefing (the old per-section selection was removed) — any
``sections_to_include`` argument is accepted for backwards compatibility but
ignored.

Design language ("Executive briefing"):
    * A branded cover page (navy, gold hairline, title, scope, CONFIDENTIAL).
    * Executive summary with large KPI cards + a short narrative.
    * One large hero chart per analysis page, with a clean supporting table.
    * Generously-spaced zebra tables, a single cohesive palette, and a
      confidential footer with page numbers.

All three reports share the ``BriefingPDF`` base class and the matplotlib
chart builders below, so styling is consistent across deliverables.
"""

import io
from datetime import datetime

import pandas as pd
from fpdf import FPDF


# =============================================================================
# 1. SHARED PALETTE & TEXT HELPERS
# =============================================================================

# Cohesive executive palette (RGB tuples for fpdf, hex for matplotlib).
BRIEF_NAVY      = (12, 22, 41)       # cover + table headers + headings
BRIEF_NAVY_HEX  = "#0c1629"
BRIEF_PRIMARY   = (0, 51, 128)       # RR primary blue
BRIEF_PRIMARY_HEX = "#003380"
BRIEF_GOLD      = (181, 144, 88)     # restrained luxury accent
BRIEF_GOLD_HEX  = "#b59058"
BRIEF_INK       = (17, 24, 39)       # body text
BRIEF_MUTE      = (100, 116, 139)    # secondary text
BRIEF_CARD      = (247, 249, 252)    # KPI card fill
BRIEF_BORDER    = (223, 229, 238)
BRIEF_ALT       = (242, 246, 251)    # zebra row
BRIEF_WHITE     = (255, 255, 255)
BRIEF_GREEN     = (34, 120, 84)
BRIEF_GREEN_HEX = "#227854"
BRIEF_RED       = (176, 42, 42)

# Ordered chart series colours — harmonious, print-safe.
CHART_PALETTE = [
    "#003380", "#0e7490", "#b59058", "#3f6f52",
    "#7c3a6a", "#475569", "#9a6a2f", "#1d6fb8",
]

# Legacy tuples kept so any external reference still resolves.
NAVY = BRIEF_NAVY
WHITE = BRIEF_WHITE
ACCENT = BRIEF_PRIMARY
GREEN = BRIEF_GREEN
GREY_TXT = BRIEF_MUTE


def _safe_soa(text) -> str:
    """Sanitise text for fpdf2 Helvetica - SOA variant (legacy behaviour)."""
    s = str(text) if text is not None else "-"
    for old, new in [("—", "-"), ("–", "-"), ("‘", "'"), ("’", "'"),
                     ("“", '"'), ("”", '"'), ("…", "..."), (" ", " ")]:
        s = s.replace(old, new)
    return s


def _safe(text) -> str:
    """Sanitise text for fpdf2 Helvetica (collapses newlines, maps GBP, and
    strips any non-Latin-1 glyph so Helvetica never crashes)."""
    if text is None:
        return "-"
    s = str(text)
    for old, new in [
        ("—", "-"), ("–", "-"), ("‘", "'"), ("’", "'"),
        ("“", '"'), ("”", '"'), ("…", "..."), (" ", " "),
        ("£", "GBP"), ("\n", " "), ("\r", ""),
        ("•", "-"), ("·", "-"), ("×", "x"), ("→", "->"), ("←", "<-"),
    ]:
        s = s.replace(old, new)
    out = []
    for ch in s:
        try:
            ch.encode("latin-1")
            out.append(ch)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out).strip()


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


# -- Numeric formatting -------------------------------------------------------

def _fmt_currency(val, currency_symbol: str = "USD") -> str:
    if val is None or pd.isna(val):
        return "-"
    try:
        val = float(val)
        sign = "-" if val < 0 else ""
        return f"{sign}{currency_symbol} {abs(val):,.2f}"
    except (ValueError, TypeError):
        return "-"


def _fmt_date(val) -> str:
    if val is None or pd.isna(val):
        return "-"
    if isinstance(val, pd.Timestamp):
        return val.strftime("%d/%m/%Y")
    return _safe_soa(str(val))


def _fmt_number(val) -> str:
    if val is None or pd.isna(val):
        return "-"
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return _safe_soa(str(val))


def _fmtM(val):
    """Format as $X.Xm (Opportunity Tracker - USD-style millions)."""
    if val is None:
        return "-"
    v = _val(val)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.1f}m"


def _fmtM_gbp(val):
    """Format as 'GBP X.Xm' (Hopper-specific)."""
    if val is None:
        return "-"
    v = _val(val)
    sign = "-" if v < 0 else ""
    return f"{sign}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    """Shorter currency format for tight table cells."""
    if val is None:
        return "-"
    v = _val(val)
    sign = "-" if v < 0 else ""
    return f"{sign}{abs(v):,.1f}m"


def _pct(part, whole):
    if not whole:
        return "0.0%"
    return f"{(part / whole) * 100:.1f}%"


# =============================================================================
# 2. MATPLOTLIB CHART BUILDERS  (one chart per figure, large & readable)
# =============================================================================

def _png_size(data: bytes):
    """Return (width, height) in pixels from a PNG byte string (IHDR chunk)."""
    import struct
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    w, h = struct.unpack(">II", data[16:24])
    return (w, h)


def _fig_to_png(fig):
    import matplotlib.pyplot as plt
    buf = io.BytesIO()
    try:
        fig.tight_layout(pad=1.3)
    except Exception:
        pass
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf


def _style_axes(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#e2e8f0")
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.tick_params(colors="#475569", labelsize=11)
    ax.title.set_color(BRIEF_NAVY_HEX)
    ax.title.set_fontsize(15)
    ax.title.set_weight("bold")


def _chart_bar_v(labels, values, title, *, value_fmt=lambda v: f"{v:,.0f}",
                 color=BRIEF_PRIMARY_HEX, rotate=22):
    """Vertical bar chart with value labels on top of each bar."""
    if not labels or sum(abs(v) for v in values) == 0:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(10, 3.9), dpi=200)
    fig.patch.set_facecolor("white")
    _style_axes(ax)
    ax.grid(True, axis="y", linestyle="--", alpha=0.0)
    bars = ax.bar(range(len(labels)), values, color=color, width=0.62)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(
        [str(l) for l in labels],
        rotation=rotate, ha="right" if rotate else "center",
        fontsize=9.5, color="#475569",
    )
    for b, v in zip(bars, values):
        if v == 0:
            continue
        ax.text(b.get_x() + b.get_width() / 2, b.get_height(), value_fmt(v),
                ha="center", va="bottom", fontsize=9, color=BRIEF_NAVY_HEX, weight="bold")
    ax.set_title(title, loc="left", pad=10)
    ax.margins(y=0.18)
    ax.set_yticks([])
    ax.spines["left"].set_visible(False)
    return _fig_to_png(fig)


def _chart_bar_h(labels, values, title, *, value_fmt=lambda v: f"{v:,.0f}",
                 color=BRIEF_PRIMARY_HEX):
    """Horizontal bar chart (largest at top) with value labels to the right."""
    if not labels or sum(abs(v) for v in values) == 0:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    # Reverse so the largest sits at the top of the axis.
    labels = list(labels)[::-1]
    values = list(values)[::-1]
    h = max(3.2, min(6.2, 0.42 * len(labels) + 1.4))
    fig, ax = plt.subplots(figsize=(10, h), dpi=200)
    fig.patch.set_facecolor("white")
    _style_axes(ax)
    bars = ax.barh(range(len(labels)), values, color=color, height=0.66)
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels([str(l) for l in labels], fontsize=10, color="#334155")
    span = max(values) if values else 0
    for b, v in zip(bars, values):
        ax.text(b.get_width() + span * 0.01, b.get_y() + b.get_height() / 2,
                " " + value_fmt(v), va="center", ha="left",
                fontsize=9, color=BRIEF_NAVY_HEX, weight="bold")
    ax.set_title(title, loc="left", pad=10)
    ax.margins(x=0.12)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    return _fig_to_png(fig)


def _chart_donut(labels, values, title):
    """Donut chart with a side legend."""
    pairs = [(l, v) for l, v in zip(labels, values) if v and v > 0]
    if not pairs:
        return None
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    labels = [p[0] for p in pairs]
    values = [p[1] for p in pairs]
    colors = [CHART_PALETTE[i % len(CHART_PALETTE)] for i in range(len(labels))]
    fig, ax = plt.subplots(figsize=(10, 4.0), dpi=200)
    fig.patch.set_facecolor("white")
    wedges, _texts, autotexts = ax.pie(
        values, labels=None,
        autopct=lambda p: f"{p:.0f}%" if p >= 4 else "",
        startangle=90, colors=colors, pctdistance=0.78,
        wedgeprops={"width": 0.42, "edgecolor": "white", "linewidth": 2},
        textprops={"fontsize": 10, "color": "white", "weight": "bold"},
    )
    ax.set_title(title, loc="left", pad=12, color=BRIEF_NAVY_HEX,
                 fontsize=15, fontweight="bold")
    total = sum(values)
    leg_labels = [f"{str(l)[:24]}  ({v / total * 100:.0f}%)" for l, v in zip(labels, values)]
    ax.legend(wedges, leg_labels, loc="center left", bbox_to_anchor=(0.96, 0.5),
              fontsize=10, frameon=False)
    ax.axis("equal")
    return _fig_to_png(fig)


# =============================================================================
# 3. BRIEFING PDF BASE CLASS
# =============================================================================

class BriefingPDF(FPDF):
    """Landscape A4 executive-briefing base with shared layout primitives."""

    PAGE_W = 297
    PAGE_H = 210
    ML = 16
    MR = 16
    MT = 18

    def __init__(self, report_name="Report"):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.report_name = report_name
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(self.ML, self.MT, self.MR)
        self._cover_page_no = -1

    @property
    def content_w(self):
        return self.PAGE_W - self.ML - self.MR

    def header(self):
        pass

    def footer(self):
        if self.page_no() == self._cover_page_no:
            return
        self.set_y(-13)
        self.set_draw_color(*BRIEF_BORDER)
        self.set_line_width(0.2)
        self.line(self.ML, self.get_y(), self.PAGE_W - self.MR, self.get_y())
        self.set_y(-10)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*BRIEF_MUTE)
        self.cell(0, 5, _safe(f"ROLLS-ROYCE CIVIL AEROSPACE    |    {self.report_name}    |    CONFIDENTIAL"),
                  0, 0, "L")
        self.set_y(-10)
        self.cell(0, 5, f"Page {self.page_no()}", 0, 0, "R")

    # -- Cover --------------------------------------------------------------

    def cover_page(self, title, subtitle, tag, meta_lines):
        # Disable auto page-break while we paint near the page edges, else the
        # bottom meta block would spill onto a spurious blank page.
        self.set_auto_page_break(False)
        self.add_page()
        self._cover_page_no = self.page_no()
        self.set_fill_color(*BRIEF_NAVY)
        self.rect(0, 0, self.PAGE_W, self.PAGE_H, "F")

        # Wordmark
        self.set_xy(self.ML, 30)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*BRIEF_WHITE)
        self.cell(0, 8, "ROLLS-ROYCE", 0, 1, "L")
        self.set_x(self.ML)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(190, 200, 215)
        self.cell(0, 5, "CIVIL AEROSPACE  -  AFTERMARKET ANALYTICS", 0, 1, "L")

        # Tag pill
        self.set_xy(self.ML, 50)
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(*BRIEF_GOLD)
        self.set_text_color(*BRIEF_NAVY)
        tw = self.get_string_width(_safe(tag)) + 8
        self.cell(tw, 7, _safe(tag), 0, 1, "C", True)

        # Gold hairline
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(self.ML, 74, 44, 1.1, "F")

        # Title
        self.set_xy(self.ML, 82)
        self.set_font("Helvetica", "B", 30)
        self.set_text_color(*BRIEF_WHITE)
        self.multi_cell(self.content_w, 13, _safe(title))

        # Subtitle
        self.set_x(self.ML)
        self.ln(2)
        self.set_font("Helvetica", "", 14)
        self.set_text_color(*BRIEF_GOLD)
        self.cell(0, 9, _safe(subtitle), 0, 1, "L")

        # Meta block near the bottom
        self.set_xy(self.ML, self.PAGE_H - 16 - 6 * len(meta_lines))
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(205, 213, 225)
        for ln in meta_lines:
            self.set_x(self.ML)
            self.cell(0, 6, _safe(ln), 0, 1, "L")

        # Confidential strap
        self.set_xy(self.ML, self.PAGE_H - 12)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*BRIEF_GOLD)
        self.cell(0, 5, "CONFIDENTIAL - FOR INTERNAL USE ONLY", 0, 0, "L")

        # Restore auto page-break for the body pages.
        self.set_auto_page_break(True, margin=18)

    # -- Section header ------------------------------------------------------

    def section_page(self, title, subtitle=""):
        self.add_page()
        self.set_xy(self.ML, self.MT)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*BRIEF_NAVY)
        self.cell(0, 8, _safe(title), 0, 1, "L")
        if subtitle:
            self.set_x(self.ML)
            self.set_font("Helvetica", "", 9.5)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(0, 5, _safe(subtitle), 0, 1, "L")
        y = self.get_y() + 1.5
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(self.ML, y, 26, 1.0, "F")
        self.set_y(y + 5)

    def subhead(self, title):
        if self.get_y() > self.PAGE_H - 40:
            self.section_page(title)
            return
        self.ln(2)
        self.set_x(self.ML)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*BRIEF_NAVY)
        self.cell(0, 6, _safe(title), 0, 1, "L")
        y = self.get_y()
        self.set_draw_color(*BRIEF_GOLD)
        self.set_line_width(0.4)
        self.line(self.ML, y, self.ML + 18, y)
        self.set_line_width(0.2)
        self.ln(2)

    # -- KPI cards -----------------------------------------------------------

    def kpi_row(self, cards, h=27):
        n = max(1, len(cards))
        gap = 5
        w = (self.content_w - gap * (n - 1)) / n
        x = self.ML
        y = self.get_y()
        for card in cards:
            label, value, sub, accent = (list(card) + [None, None, None, BRIEF_PRIMARY])[:4]
            self._kpi_card(x, y, w, h, label, value, sub, accent)
            x += w + gap
        self.set_y(y + h + 6)

    def _kpi_card(self, x, y, w, h, label, value, sub, accent):
        self.set_fill_color(*BRIEF_CARD)
        self.rect(x, y, w, h, "F")
        self.set_draw_color(*BRIEF_BORDER)
        self.set_line_width(0.2)
        self.rect(x, y, w, h, "D")
        self.set_fill_color(*accent)
        self.rect(x, y, w, 1.4, "F")
        self.set_xy(x + 4, y + 4)
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*BRIEF_MUTE)
        self.cell(w - 8, 4, _safe(label).upper(), 0, 2, "L")
        self.set_xy(x + 4, y + 9.5)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*BRIEF_NAVY)
        self.cell(w - 8, 8, _safe(value), 0, 2, "L")
        if sub:
            self.set_xy(x + 4, y + h - 6)
            self.set_font("Helvetica", "", 6.8)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(w - 8, 4, _safe(sub), 0, 0, "L")

    # -- Narrative -----------------------------------------------------------

    def narrative(self, text):
        x = self.ML
        y = self.get_y()
        self.set_xy(x + 5, y)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*BRIEF_INK)
        self.multi_cell(self.content_w - 5, 5.8, _safe(text))
        y2 = self.get_y()
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(x, y, 1.5, max(1.0, y2 - y), "F")
        self.set_y(y2 + 4)

    # -- Hero chart ----------------------------------------------------------

    def hero_chart(self, buf):
        if buf is None:
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(0, 6, "(No data available for this chart.)", 0, 1, "L")
            return
        w = self.content_w
        # Compute the rendered height from the PNG aspect ratio and break to a
        # fresh page first if it wouldn't fit — avoids orphaned headers.
        try:
            pw, ph = _png_size(buf.getvalue())
            render_h = w * (ph / pw) if pw else 100
        except Exception:
            render_h = 100
        if self.get_y() + render_h > self.PAGE_H - 16:
            self.add_page()
            self.set_y(self.MT)
        self.image(buf, x=self.ML, w=w)
        self.ln(3)

    # -- Table ---------------------------------------------------------------

    def clean_table(self, headers, rows, widths, *, right_align_idx=None,
                    totals_row=None, max_rows=60, title=None):
        if title:
            self.subhead(title)

        def draw_head():
            self.set_fill_color(*BRIEF_NAVY)
            self.set_text_color(*BRIEF_WHITE)
            self.set_font("Helvetica", "B", 7.8)
            x = self.ML
            for i, hd in enumerate(headers):
                self.set_xy(x, self.get_y())
                self.cell(widths[i], 7, _safe(hd).upper(), 0, 0, "C", True)
                x += widths[i]
            self.ln(7)

        def align(i, val):
            if right_align_idx is not None:
                return "R" if i in right_align_idx else "L"
            sv = str(val).strip()
            if sv[:3] == "GBP" or sv[:1] == "$" or (sv and (sv[0].isdigit() or sv[0] == "-")):
                return "R"
            return "L"

        draw_head()
        self.set_font("Helvetica", "", 7.6)
        for ridx, row in enumerate(rows[:max_rows]):
            if self.get_y() > self.PAGE_H - 20:
                self.add_page()
                self.set_y(self.MT)
                draw_head()
                self.set_font("Helvetica", "", 7.6)
            self.set_fill_color(*(BRIEF_ALT if ridx % 2 == 0 else BRIEF_WHITE))
            self.set_text_color(*BRIEF_INK)
            x = self.ML
            for i, cv in enumerate(row):
                self.set_xy(x, self.get_y())
                self.cell(widths[i], 6.4, _safe(str(cv)), 0, 0, align(i, cv), True)
                x += widths[i]
            self.ln(6.4)

        if totals_row:
            if self.get_y() > self.PAGE_H - 20:
                self.add_page()
                self.set_y(self.MT)
                draw_head()
            y = self.get_y()
            self.set_draw_color(*BRIEF_NAVY)
            self.set_line_width(0.4)
            self.line(self.ML, y, self.ML + sum(widths), y)
            self.set_line_width(0.2)
            self.set_fill_color(*BRIEF_CARD)
            self.set_text_color(*BRIEF_NAVY)
            self.set_font("Helvetica", "B", 7.8)
            x = self.ML
            for i, cv in enumerate(totals_row):
                self.set_xy(x, self.get_y())
                self.cell(widths[i], 6.6, _safe(str(cv)), 0, 0, align(i, cv), True)
                x += widths[i]
            self.ln(6.6)

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 6.8)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(0, 4, f"   ... and {len(rows) - max_rows} more rows omitted", 0, 1, "L")
        self.ln(2)


# =============================================================================
# 4. SOA REPORT  (generate_pdf_report)
# =============================================================================

def generate_pdf_report(
    metadata: dict,
    grand_totals: dict,
    filtered_df: pd.DataFrame,
    sections_summary: dict,
    source_files: list = None,
    currency_symbol: str = "USD",
) -> bytes:
    """Generate a branded SOA executive-briefing PDF and return it as bytes."""
    cust = metadata.get("customer_name", "Customer")
    pdf = BriefingPDF(report_name="Statement of Account")

    # -- Cover --------------------------------------------------------------
    meta_lines = [
        f"Customer: {cust}",
        f"Report date: {_fmt_date(metadata.get('report_date'))}",
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
    ]
    if source_files:
        meta_lines.append(f"Sources: {', '.join(str(s) for s in source_files)[:90]}")
    pdf.cover_page(
        title="Statement of Account",
        subtitle="Executive Briefing",
        tag="SOA",
        meta_lines=meta_lines,
    )

    charges = grand_totals.get("total_charges", 0)
    credits = grand_totals.get("total_credits", 0)
    net = grand_totals.get("net_balance", 0)
    overdue = grand_totals.get("total_overdue", 0)
    items = grand_totals.get("item_count", 0)

    # -- Executive summary --------------------------------------------------
    pdf.section_page("Executive Summary", f"Account position for {_safe(cust)}")
    pdf.kpi_row([
        ("Total Charges", _fmt_currency(charges, currency_symbol), f"{_fmt_number(items)} open items", BRIEF_PRIMARY),
        ("Total Credits", _fmt_currency(credits, currency_symbol), None, BRIEF_GREEN),
        ("Net Balance", _fmt_currency(net, currency_symbol), None, BRIEF_RED if _val(net) > 0 else BRIEF_GREEN),
        ("Total Overdue", _fmt_currency(overdue, currency_symbol),
         f"Avg {_fmt_number(metadata.get('avg_days_late'))} days late", BRIEF_RED),
    ])

    pdf.narrative(
        f"This statement summarises the account position for {cust}. "
        f"Total charges of {_fmt_currency(charges, currency_symbol)} are offset by "
        f"{_fmt_currency(credits, currency_symbol)} in credits, leaving a net balance of "
        f"{_fmt_currency(net, currency_symbol)}. {_fmt_currency(overdue, currency_symbol)} is "
        f"currently overdue across {_fmt_number(items)} open items, with an average of "
        f"{_fmt_number(metadata.get('avg_days_late'))} days late. The breakdown by section and the "
        f"filtered invoice register follow."
    )

    # -- Section summary (chart leads the page, table beneath) --------------
    if sections_summary:
        sec_labels = [str(s)[:22] for s in sections_summary.keys()]
        sec_totals = [_val(d.get("total", 0)) for d in sections_summary.values()]
        pdf.section_page("Section Summary", "Charges, credits and overdue by account section")
        pdf.hero_chart(_chart_bar_v(
            sec_labels, sec_totals, "Balance by Section",
            value_fmt=lambda v: f"{v:,.0f}", color=BRIEF_PRIMARY_HEX, rotate=18,
        ))
        headers = ["Section", "Total", "Charges", "Credits", "Overdue", "Items"]
        widths = [70, 42, 42, 42, 42, 27]
        rows = []
        for section, d in sections_summary.items():
            rows.append([
                _trunc(section, 42),
                _fmt_currency(d.get("total", 0), currency_symbol),
                _fmt_currency(d.get("charges", 0), currency_symbol),
                _fmt_currency(d.get("credits", 0), currency_symbol),
                _fmt_currency(d.get("overdue", 0), currency_symbol),
                _fmt_number(d.get("items", 0)),
            ])
        totals = [
            "TOTAL",
            _fmt_currency(charges + credits, currency_symbol),
            _fmt_currency(charges, currency_symbol),
            _fmt_currency(credits, currency_symbol),
            _fmt_currency(overdue, currency_symbol),
            _fmt_number(items),
        ]
        pdf.clean_table(headers, rows, widths, right_align_idx={1, 2, 3, 4, 5},
                        totals_row=totals, max_rows=40)

    # -- Invoice register ----------------------------------------------------
    if filtered_df is not None and not getattr(filtered_df, "empty", True):
        display_df = filtered_df.head(120)
        pdf.section_page("Invoice Register", f"Filtered records ({len(filtered_df):,} total)")
        headers = ["Section", "Reference", "Doc Date", "Due Date", "Amount", "Status", "Type", "Days Late"]
        widths = [48, 32, 26, 26, 38, 30, 26, 22]
        rows = []
        for _idx, row in display_df.iterrows():
            rows.append([
                _trunc(row.get("Section", "-"), 24),
                _trunc(row.get("Reference", "-") or "-", 16),
                _fmt_date(row.get("Document Date")),
                _fmt_date(row.get("Due Date")),
                _fmt_currency(row.get("Amount", 0), currency_symbol),
                _trunc(row.get("Status", "-") or "-", 14),
                _trunc(row.get("Entry Type", "-") or "-", 12),
                _fmt_number(row.get("Days Late")),
            ])
        pdf.clean_table(headers, rows, widths,
                        right_align_idx={4, 7}, max_rows=120)

    return bytes(pdf.output())


# =============================================================================
# 5. OPPORTUNITY TRACKER REPORT  (generate_opp_pdf_report)
# =============================================================================

def generate_opp_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate the Opportunity Tracker executive briefing (full report)."""
    filters = filters or {}

    # -- Flatten opportunities ----------------------------------------------
    opportunities = parsed_data.get("opportunities", {})
    all_items = []
    for sheet_name, recs in opportunities.items() if isinstance(opportunities, dict) else []:
        if isinstance(recs, list):
            for r in recs:
                all_items.append({**r, "_sheet": sheet_name})
    if not all_items:
        all_items = parsed_data.get("all_items", [])

    # -- Apply filters (tolerant of comma-joined multi-select strings) -------
    def _matches(field_val, wanted):
        if wanted is None or wanted == "":
            return True
        wanted_list = [w.strip().lower() for w in str(wanted).split(",") if w.strip()]
        return str(field_val).strip().lower() in wanted_list

    filtered = []
    for row in all_items:
        if not _matches(row.get("customer"), filters.get("customer")):
            continue
        if not _matches(row.get("project"), filters.get("project")):
            continue
        if filters.get("priority") and not _matches(str(row.get("priority")).replace(".0", ""),
                                                     str(filters["priority"]).replace(".0", "")):
            continue
        if not _matches(row.get("ext_probability"), filters.get("ext_probability")):
            continue
        if not _matches(row.get("status"), filters.get("status")):
            continue
        if not _matches(row.get("opportunity_type", row.get("opp_type")), filters.get("opp_type")):
            continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("sum_26_27")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    meta = parsed_data.get("metadata", {})

    total_26 = sum(_val(r.get("benefit_2026")) for r in filtered)
    total_27 = sum(_val(r.get("benefit_2027")) for r in filtered)
    total_26_27 = sum(_val(r.get("sum_26_27")) for r in filtered)
    total_term = sum(_val(r.get("term_benefit")) for r in filtered)
    active = [r for r in filtered if str(r.get("status", "")).lower() not in ("completed", "lost", "declined")]
    customers = {r.get("customer") for r in filtered if r.get("customer")}

    pdf = BriefingPDF(report_name="Opportunity Tracker")

    # -- Cover --------------------------------------------------------------
    meta_lines = [
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
        f"Opportunities: {len(filtered)}  ({len(active)} active)   |   Customers: {len(customers)}",
        f"Away day: {meta.get('away_day_date', '-')}",
    ]
    if filters.get("customer"):
        meta_lines.insert(0, f"Filtered customer: {filters['customer']}")
    pdf.cover_page(
        title="Commercial Optimisation\nOpportunity Tracker",
        subtitle="Executive Briefing",
        tag="OPP TRACKER",
        meta_lines=meta_lines,
    )

    if not filtered:
        pdf.section_page("Executive Summary")
        pdf.narrative("No opportunities match the selected filters.")
        return bytes(pdf.output())

    # -- Executive summary --------------------------------------------------
    pdf.section_page("Executive Summary", "Pipeline value and priority mix")
    pdf.kpi_row([
        ("2026 Benefit", _fmtM(total_26), None, BRIEF_PRIMARY),
        ("2027 Benefit", _fmtM(total_27), None, BRIEF_PRIMARY),
        ("2026 + 2027", _fmtM(total_26_27), f"{len(active)} active of {len(filtered)}", BRIEF_GOLD),
        ("Term Impact", _fmtM(total_term), None, BRIEF_GREEN),
    ])
    pdf.narrative(
        f"The opportunity tracker covers {len(filtered)} opportunities across {len(customers)} customers, "
        f"representing {_fmtM(total_26_27)} of combined 2026-2027 benefit and {_fmtM(total_term)} of term impact. "
        f"{len(active)} opportunities remain active in the pipeline. The charts and tables that follow rank "
        f"opportunities by value, priority and customer."
    )

    # Priority donut
    by_priority = {}
    for r in filtered:
        p = str(r.get("priority", "?")).replace(".0", "")
        if p in ("", "None", "nan"):
            p = "Unspecified"
        else:
            p = f"Priority {p}"
        by_priority[p] = by_priority.get(p, 0) + _val(r.get("sum_26_27"))
    pri_items = sorted(by_priority.items(), key=lambda x: x[1], reverse=True)
    pdf.section_page("Priority Mix", "Value distribution by priority tier (2026 + 2027)")
    pdf.hero_chart(_chart_donut([k for k, _ in pri_items], [v for _, v in pri_items],
                                "Value by Priority"))

    # -- Top customers ------------------------------------------------------
    by_cust = {}
    for r in filtered:
        c = r.get("customer") or "Unknown"
        by_cust[c] = by_cust.get(c, 0) + _val(r.get("sum_26_27"))
    cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)
    top_cust = cust_sorted[:12]
    pdf.section_page("Customer Analysis", "Top customers by 2026-2027 value")
    pdf.hero_chart(_chart_bar_h([c[:22] for c, _ in top_cust], [v for _, v in top_cust],
                                "Top Customers - $m (26+27)",
                                value_fmt=lambda v: f"${v:,.0f}m", color=BRIEF_PRIMARY_HEX))

    cust_count = {}
    for r in filtered:
        c = r.get("customer") or "Unknown"
        cust_count[c] = cust_count.get(c, 0) + 1
    rows = []
    for cust, val in cust_sorted:
        rows.append([
            _trunc(cust, 40), str(cust_count.get(cust, 0)),
            _fmtM(val), _pct(val, total_26_27),
        ])
    pdf.clean_table(
        ["Customer", "Opportunities", "Value (26+27)", "% of Total"],
        rows, [110, 45, 60, 40], right_align_idx={1, 2, 3},
        totals_row=["TOTAL", str(len(filtered)), _fmtM(total_26_27), "100.0%"],
        max_rows=40, title="Customer breakdown",
    )

    # -- Top opportunities --------------------------------------------------
    pdf.section_page("Top Opportunities", "Ranked by combined 2026-2027 value")
    top_sorted = sorted(filtered, key=lambda r: _val(r.get("sum_26_27")), reverse=True)[:25]
    rows = []
    for i, r in enumerate(top_sorted, 1):
        rows.append([
            str(i), _trunc(r.get("customer", ""), 18), _trunc(r.get("project", ""), 16),
            _trunc(r.get("asks", ""), 60), _safe(r.get("ext_probability", "")),
            str(r.get("priority", "")).replace(".0", ""), _trunc(r.get("status", ""), 12),
            _fmtM(_val(r.get("sum_26_27"))),
        ])
    pdf.clean_table(
        ["#", "Customer", "Project", "Asks", "Ext Prob", "Priority", "Status", "Value (26+27)"],
        rows, [9, 34, 28, 92, 22, 18, 25, 37],
        right_align_idx={0, 7}, max_rows=25,
    )

    # -- Estimation level breakdown -----------------------------------------
    est_level_names = meta.get("estimation_levels", {})
    est_levels = {}
    for r in filtered:
        sh = r.get("_sheet", "Unknown")
        slot = est_levels.setdefault(sh, {"count": 0, "sum": 0.0, "term": 0.0})
        slot["count"] += 1
        slot["sum"] += _val(r.get("sum_26_27"))
        slot["term"] += _val(r.get("term_benefit"))
    if est_levels:
        pdf.section_page("Estimation Level Breakdown", "Value by confidence tier")
        rows = []
        for sh, d in sorted(est_levels.items(), key=lambda x: x[1]["sum"], reverse=True):
            rows.append([
                _trunc(est_level_names.get(sh, sh), 40), str(d["count"]),
                _fmtM(d["sum"]), _fmtM(d["term"]), _pct(d["sum"], total_26_27),
            ])
        pdf.clean_table(
            ["Estimation Level", "Opportunities", "Value (26+27)", "Term Benefit", "% of Total"],
            rows, [95, 38, 45, 45, 32], right_align_idx={1, 2, 3, 4},
            totals_row=["TOTAL", str(len(filtered)), _fmtM(total_26_27), _fmtM(total_term), "100.0%"],
        )

    # -- Opportunities & threats --------------------------------------------
    ot_rows = parsed_data.get("opps_and_threats", {}).get("rows", []) or \
        parsed_data.get("sections", {}).get("Opps and Threats", {}).get("rows", [])
    if ot_rows:
        pdf.section_page("Opportunities & Threats")
        rows = []
        for r in ot_rows:
            rows.append([
                _trunc(r.get("Customer", r.get("customer", "")), 20),
                _trunc(r.get("Description", r.get("description", "")), 80),
                _trunc(r.get("Type", r.get("type", "")), 14),
                _trunc(r.get("Status", r.get("status", "")), 16),
                _trunc(r.get("Action Owner", r.get("action_owner", "")), 16),
            ])
        pdf.clean_table(["Customer", "Description", "Type", "Status", "Owner"],
                        rows, [40, 132, 30, 33, 30], max_rows=30)

    return bytes(pdf.output())


# =============================================================================
# 6. GLOBAL HOPPER REPORT  (generate_hopper_pdf_report)
# =============================================================================

PIPELINE_ORDER = [
    "Initial idea", "ICT formed", "Strategy Approved",
    "Financial Modelling Started", "Financial Modelling Complete",
    "Financials Approved", "Negotiations Started",
    "Negotiations Concluded", "Contracting Started", "Contracting Concluded",
]


def _apply_hopper_filters(opportunities, filters):
    """Apply optional filters dict to the Hopper opportunity list. Tolerant of
    comma-joined multi-select strings (e.g. ``"EMEA, APAC"``)."""
    if not filters:
        return list(opportunities)

    SIMPLE_FILTERS = {
        "region": "region", "customer": "customer", "status": "status",
        "maturity": "maturity", "restructure_type": "restructure_type",
        "evs": "engine_value_stream", "engine_value_stream": "engine_value_stream",
        "vp_owner": "vp_owner", "onerous_type": "onerous_type", "initiative": "initiative",
    }

    def _matches(field_val, wanted):
        wanted_list = [w.strip().lower() for w in str(wanted).split(",") if w.strip()]
        if not wanted_list:
            return True
        return str(field_val).strip().lower() in wanted_list

    out = []
    for row in opportunities:
        keep = True
        for fkey, row_field in SIMPLE_FILTERS.items():
            wanted = filters.get(fkey)
            if not wanted:
                continue
            if not _matches(row.get(row_field, ""), wanted):
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
        out.append(row)
    return out


def _aggregate(rows, key, value_fn=None, count=False):
    out = {}
    for r in rows:
        k = str(r.get(key, "")).strip() or "Unknown"
        if count:
            out[k] = out.get(k, 0) + 1
        else:
            v = value_fn(r) if value_fn else _val(r.get("crp_term_benefit"))
            out[k] = out.get(k, 0) + v
    return out


def generate_hopper_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate the Global Commercial Optimisation Hopper executive briefing."""
    filters = filters or {}
    meta = parsed_data.get("metadata", {})
    opportunities = parsed_data.get("opportunities", [])
    filtered = _apply_hopper_filters(opportunities, filters)

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

    pdf = BriefingPDF(report_name="Global Commercial Optimisation Hopper")

    # -- Cover --------------------------------------------------------------
    meta_lines = [
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
        f"Opportunities: {total_opps}   |   Customers: {len(customers)}   |   Regions: {len(regions)}",
        "Currency: GBP (millions)",
    ]
    if filters.get("customer"):
        meta_lines.insert(0, f"Filtered customer: {filters['customer']}")
    if filters.get("region"):
        meta_lines.insert(0, f"Filtered region: {filters['region']}")
    pdf.cover_page(
        title="Global Commercial\nOptimisation Hopper",
        subtitle="Executive Briefing",
        tag="GLOBAL HOPPER",
        meta_lines=meta_lines,
    )

    if total_opps == 0:
        pdf.section_page("Executive Summary")
        pdf.narrative("No opportunities match the selected filters.")
        return bytes(pdf.output())

    single_region = len(regions) <= 1

    # -- Executive summary --------------------------------------------------
    pdf.section_page("Executive Summary", "Portfolio value and profile")
    pdf.kpi_row([
        ("CRP Term Benefit", _fmtM_gbp(total_crp), f"{total_opps} opps - {len(customers)} customers", BRIEF_PRIMARY),
        ("Profit 2026", _fmtM_gbp(totals_year[2026]),
         f"26-27: {_fmtM_gbp(totals_year[2026] + totals_year[2027])}", BRIEF_GOLD),
        ("Profit 2027", _fmtM_gbp(totals_year[2027]), None, BRIEF_PRIMARY),
        ("Profit 2028-30", _fmtM_gbp(long_term), f"Avg/yr {_fmtM_gbp(long_term / 3)}", BRIEF_GREEN),
    ])
    region_phrase = (f"the {sorted(regions)[0]} region" if single_region
                     else f"{len(regions)} regions")
    pdf.narrative(
        f"This briefing summarises {total_opps} commercial optimisation opportunities across "
        f"{region_phrase} and {len(customers)} customers, carrying {_fmtM_gbp(total_crp)} of CRP term benefit. "
        f"Near-term profit (2026-27) totals {_fmtM_gbp(totals_year[2026] + totals_year[2027])}, with a further "
        f"{_fmtM_gbp(long_term)} forecast across 2028-30. {mature} opportunities are assessed as mature and "
        f"{onerous} sit within onerous contracts. Stage, regional, customer and engine-value-stream detail follow."
    )
    # Secondary stat chips as a compact KPI row
    pdf.kpi_row([
        ("Mature", str(mature), f"{immature} immature", BRIEF_GREEN),
        ("Onerous", str(onerous), f"{not_onerous} not onerous", BRIEF_RED),
        ("Engine Value Streams", str(len(evss)), None, BRIEF_PRIMARY),
        ("Regions", str(len(regions)), ", ".join(sorted(regions)[:3]) + ("..." if len(regions) > 3 else ""), BRIEF_GOLD),
    ], h=22)

    # -- Pipeline / Status --------------------------------------------------
    by_status_count = _aggregate(filtered, "status", count=True)
    by_status_crp = _aggregate(filtered, "status")
    # Value by stage, descending by value
    val_items = sorted(by_status_crp.items(), key=lambda x: x[1], reverse=True)
    pdf.section_page("Pipeline & Status", "CRP term benefit and activity by stage")
    pdf.hero_chart(_chart_bar_v(
        [s for s, _ in val_items], [v for _, v in val_items],
        "Value by Stage - CRP GBP m", value_fmt=lambda v: f"£{v:,.0f}m", color=BRIEF_PRIMARY_HEX,
    ))

    # Pipeline table — canonical order then extras
    ordered = [s for s in PIPELINE_ORDER if s in by_status_count]
    ordered += sorted((s for s in by_status_count if s not in PIPELINE_ORDER),
                      key=lambda s: by_status_crp.get(s, 0), reverse=True)
    rows = [[_trunc(s, 60), str(by_status_count.get(s, 0)),
             _fmtM_gbp(by_status_crp.get(s, 0)), _pct(by_status_crp.get(s, 0), total_crp)]
            for s in ordered]
    pdf.clean_table(
        ["Stage", "Opportunities", "CRP Term (GBP m)", "% of CRP"],
        rows, [130, 45, 55, 35], right_align_idx={1, 2, 3},
        totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"],
        title="Pipeline by stage",
    )

    # -- Regional split (skipped when scoped to a single region) ------------
    if not single_region:
        by_region = _aggregate(filtered, "region")
        reg_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
        pdf.section_page("Regional Split", "CRP term benefit by region")
        pdf.hero_chart(_chart_donut([r for r, _ in reg_sorted], [v for _, v in reg_sorted],
                                    "CRP by Region"))
        reg_count = _aggregate(filtered, "region", count=True)
        rows = [[_trunc(r, 40), str(reg_count.get(r, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
                for r, v in reg_sorted]
        pdf.clean_table(["Region", "Opportunities", "CRP Term (GBP m)", "% of CRP"],
                        rows, [120, 45, 55, 45], right_align_idx={1, 2, 3},
                        totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"],
                        title="Region breakdown")

    # -- Customer analysis --------------------------------------------------
    by_cust = _aggregate(filtered, "customer")
    cust_count = _aggregate(filtered, "customer", count=True)
    cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)
    top_cust = cust_sorted[:12]
    pdf.section_page("Customer Analysis", "Top customers by CRP term benefit")
    pdf.hero_chart(_chart_bar_h([c[:22] for c, _ in top_cust], [v for _, v in top_cust],
                                "Top Customers - CRP GBP m",
                                value_fmt=lambda v: f"£{v:,.1f}m", color=BRIEF_PRIMARY_HEX))
    rows = [[str(i), _trunc(c, 42), str(cust_count.get(c, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
            for i, (c, v) in enumerate(cust_sorted[:15], 1)]
    top_total = sum(v for _, v in cust_sorted[:15])
    pdf.clean_table(
        ["#", "Customer", "Opportunities", "CRP Term (GBP m)", "% of Total"],
        rows, [10, 110, 40, 55, 35], right_align_idx={2, 3, 4},
        totals_row=["", f"Top {len(rows)} subtotal",
                    str(sum(cust_count.get(c, 0) for c, _ in cust_sorted[:15])),
                    _fmtM_gbp(top_total), _pct(top_total, total_crp)],
        title="Top 15 customers",
    )

    # -- Engine Value Stream ------------------------------------------------
    by_evs_count = _aggregate(filtered, "engine_value_stream", count=True)
    by_evs_crp = _aggregate(filtered, "engine_value_stream")
    evs_sorted = sorted(by_evs_count.items(), key=lambda x: x[1], reverse=True)
    pdf.section_page("Engine Value Stream", "Opportunity frequency by engine value stream")
    pdf.hero_chart(_chart_bar_v([e[:20] for e, _ in evs_sorted], [c for _, c in evs_sorted],
                                "Engine Value Stream - opportunities",
                                value_fmt=lambda v: f"{int(v)}", color=BRIEF_GOLD_HEX))
    rows = [[_trunc(e, 48), str(c), _fmtM_gbp(by_evs_crp.get(e, 0)), _pct(by_evs_crp.get(e, 0), total_crp)]
            for e, c in evs_sorted]
    pdf.clean_table(["Engine Value Stream", "Opportunities", "CRP Term (GBP m)", "% of Total"],
                    rows, [120, 45, 55, 35], right_align_idx={1, 2, 3},
                    totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"],
                    title="Engine value stream breakdown")

    # -- Annual profit forecast ---------------------------------------------
    pdf.section_page("Annual Profit Forecast", "Forecast profit 2026-2030")
    years = ["2026", "2027", "2028", "2029", "2030"]
    pdf.hero_chart(_chart_bar_v(years, [totals_year[int(y)] for y in years],
                                "Annual Profit Forecast - GBP m",
                                value_fmt=lambda v: f"£{v:,.0f}m", color=BRIEF_PRIMARY_HEX, rotate=0))
    rows = [[y, _fmtM_gbp(totals_year[int(y)]), _pct(totals_year[int(y)],
             sum(totals_year.values()))] for y in years]
    pdf.clean_table(["Year", "Profit (GBP m)", "% of Forecast"],
                    rows, [40, 60, 40], right_align_idx={1, 2},
                    totals_row=["TOTAL", _fmtM_gbp(sum(totals_year.values())), "100.0%"],
                    title="Annual profit")

    # -- Restructure & maturity ---------------------------------------------
    by_rtype_count = _aggregate(filtered, "restructure_type", count=True)
    by_rtype_crp = _aggregate(filtered, "restructure_type")
    rtype_sorted = sorted(by_rtype_crp.items(), key=lambda x: x[1], reverse=True)
    pdf.section_page("Restructure & Maturity", "Structural profile of the portfolio")
    rows = [[_trunc(rt, 50), str(by_rtype_count.get(rt, 0)), _fmtM_gbp(crp), _pct(crp, total_crp)]
            for rt, crp in rtype_sorted]
    pdf.clean_table(["Restructure Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"],
                    rows, [120, 45, 55, 35], right_align_idx={1, 2, 3},
                    totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"],
                    title="Restructure type")

    by_mat = _aggregate(filtered, "maturity")
    by_mat_count = _aggregate(filtered, "maturity", count=True)
    mat_rows = [[_trunc(t, 40), str(by_mat_count.get(t, 0)), _fmtM_gbp(c), _pct(c, total_crp)]
                for t, c in sorted(by_mat.items(), key=lambda x: x[1], reverse=True)]
    pdf.clean_table(["Maturity", "Opportunities", "CRP Term (GBP m)", "% of CRP"],
                    mat_rows, [120, 45, 55, 35], right_align_idx={1, 2, 3}, title="Maturity")

    by_oner = _aggregate(filtered, "onerous_type")
    by_oner_count = _aggregate(filtered, "onerous_type", count=True)
    oner_rows = [[_trunc(t, 40), str(by_oner_count.get(t, 0)), _fmtM_gbp(c), _pct(c, total_crp)]
                 for t, c in sorted(by_oner.items(), key=lambda x: x[1], reverse=True)]
    pdf.clean_table(["Onerous Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"],
                    oner_rows, [120, 45, 55, 35], right_align_idx={1, 2, 3}, title="Onerous type")

    # -- Top 25 opportunities -----------------------------------------------
    pdf.section_page("Top Opportunities", "Top 25 by CRP term benefit")
    top_sorted = sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)[:25]
    rows = []
    for i, r in enumerate(top_sorted, 1):
        rows.append([
            str(i), _trunc(r.get("region", ""), 12), _trunc(r.get("customer", ""), 18),
            _trunc(r.get("engine_value_stream", r.get("top_level_evs", "")), 16),
            _trunc(r.get("restructure_type", ""), 16), _trunc(r.get("status", ""), 14),
            _trunc(r.get("maturity", ""), 9), _fmtM_short(_val(r.get("crp_term_benefit"))),
            _fmtM_short(_val(r.get("profit_2026"))), _fmtM_short(_val(r.get("profit_2027"))),
            _trunc(r.get("vp_owner", ""), 18),
        ])
    pdf.clean_table(
        ["#", "Region", "Customer", "Engine VS", "Restructure", "Status",
         "Maturity", "CRP", "2026", "2027", "VP/Owner"],
        rows, [8, 22, 34, 30, 30, 28, 18, 22, 18, 18, 34],
        right_align_idx={0, 7, 8, 9}, max_rows=25,
    )

    # -- Full customer breakdown --------------------------------------------
    pdf.section_page("Customer Breakdown", "All customers ranked by CRP term benefit")
    full = {}
    for r in filtered:
        c = str(r.get("customer", "")).strip() or "Unknown"
        slot = full.setdefault(c, {"count": 0, "crp": 0.0, "p26": 0.0, "p27": 0.0, "p2830": 0.0})
        slot["count"] += 1
        slot["crp"] += _val(r.get("crp_term_benefit"))
        slot["p26"] += _val(r.get("profit_2026"))
        slot["p27"] += _val(r.get("profit_2027"))
        slot["p2830"] += (_val(r.get("profit_2028")) + _val(r.get("profit_2029")) + _val(r.get("profit_2030")))
    rows = []
    for i, (c, d) in enumerate(sorted(full.items(), key=lambda x: x[1]["crp"], reverse=True), 1):
        rows.append([
            str(i), _trunc(c, 42), str(d["count"]), _fmtM_gbp(d["crp"]),
            _fmtM_short(d["p26"]), _fmtM_short(d["p27"]), _fmtM_short(d["p2830"]),
            _pct(d["crp"], total_crp),
        ])
    pdf.clean_table(
        ["#", "Customer", "Opps", "CRP Term (GBP m)", "Profit 2026", "Profit 2027", "Profit 2028-30", "% of CRP"],
        rows, [8, 71, 18, 40, 32, 32, 38, 26],
        right_align_idx={2, 3, 4, 5, 6, 7},
        totals_row=["", "TOTAL", str(total_opps), _fmtM_gbp(total_crp),
                    _fmtM_short(totals_year[2026]), _fmtM_short(totals_year[2027]),
                    _fmtM_short(long_term), "100.0%"],
        max_rows=80,
    )

    return bytes(pdf.output())
