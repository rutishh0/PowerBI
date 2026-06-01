"""
PDF Export Module for Rolls-Royce Power BI Dashboard
====================================================
Produces three branded, executive-briefing PDF reports:

    * ``generate_pdf_report``         -- SOA (Statement of Account) report
    * ``generate_opp_pdf_report``     -- Opportunity Tracker report
    * ``generate_hopper_pdf_report``  -- Global Commercial Optimisation Hopper report

All three entry-point signatures are preserved verbatim. The reports always
render the full briefing (any ``sections_to_include`` argument is accepted for
backwards compatibility but ignored).

Design language ("Executive briefing"):
    * A branded cover page (navy, gold hairline, CONFIDENTIAL).
    * A flow-based layout engine (``BriefingPDF``) that packs each page,
      keeps headers with their content, and breaks tables cleanly — no
      orphaned headers, no one-row spill pages, minimal whitespace.
    * Analytical figures that aid understanding rather than repeat tables:
      pipeline value-vs-activity, customer Pareto/concentration, engine
      value-vs-activity, risk-composition bars, value-composition bars.
    * Auto-generated "key insight" callouts that read like an analyst note.

Charts are matplotlib → PNG, drawn without redundant titles (the PDF supplies
a Helvetica caption above each figure) and with zero-value series dropped.
"""

import io
from datetime import datetime

import pandas as pd
from fpdf import FPDF


# =============================================================================
# 1. PALETTE & TEXT HELPERS
# =============================================================================

BRIEF_NAVY        = (12, 22, 41)
BRIEF_NAVY_HEX    = "#0c1629"
BRIEF_PRIMARY     = (0, 51, 128)
BRIEF_PRIMARY_HEX = "#003380"
BRIEF_PRIMARY_TINT = (240, 244, 250)
BRIEF_GOLD        = (181, 144, 88)
BRIEF_GOLD_HEX    = "#b59058"
BRIEF_GOLD_DK     = (140, 108, 56)
BRIEF_GOLD_DK_HEX = "#8c6c38"
BRIEF_INK         = (17, 24, 39)
BRIEF_MUTE        = (100, 116, 139)
BRIEF_CARD        = (247, 249, 252)
BRIEF_BORDER      = (223, 229, 238)
BRIEF_ALT         = (242, 246, 251)
BRIEF_WHITE       = (255, 255, 255)
BRIEF_GREEN       = (34, 120, 84)
BRIEF_GREEN_HEX   = "#227854"
BRIEF_RED         = (176, 42, 42)
BRIEF_RED_HEX     = "#b02a2a"
BRIEF_SLATE_HEX   = "#94a3b8"

CHART_PALETTE = ["#003380", "#0e7490", "#b59058", "#3f6f52",
                 "#7c3a6a", "#475569", "#9a6a2f", "#1d6fb8"]

# Legacy aliases (kept so any stray external reference resolves).
NAVY = BRIEF_NAVY
WHITE = BRIEF_WHITE
ACCENT = BRIEF_PRIMARY
GREEN = BRIEF_GREEN
GREY_TXT = BRIEF_MUTE


def _safe_soa(text) -> str:
    s = str(text) if text is not None else "-"
    for old, new in [("—", "-"), ("–", "-"), ("‘", "'"), ("’", "'"),
                     ("“", '"'), ("”", '"'), ("…", "..."), (" ", " ")]:
        s = s.replace(old, new)
    return s


def _safe(text) -> str:
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
    if v is None:
        return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("€", "").replace("£", "")
        return float(v)
    except Exception:
        return 0.0


def _trunc(s, maxlen):
    s = _safe(s)
    return s[:maxlen - 2] + ".." if len(s) > maxlen else s


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
    if val is None:
        return "-"
    v = _val(val)
    return f"{'-' if v < 0 else ''}${abs(v):,.1f}m"


def _fmtM_gbp(val):
    if val is None:
        return "-"
    v = _val(val)
    return f"{'-' if v < 0 else ''}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    if val is None:
        return "-"
    v = _val(val)
    return f"{'-' if v < 0 else ''}{abs(v):,.1f}m"


def _pct(part, whole):
    if not whole:
        return "0.0%"
    return f"{(part / whole) * 100:.1f}%"


def _png_size(data: bytes):
    import struct
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    w, h = struct.unpack(">II", data[16:24])
    return (w, h)


# =============================================================================
# 2. MATPLOTLIB CHART BUILDERS  (no redundant titles; zero-series dropped)
# =============================================================================

def _mpl():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["DejaVu Sans", "Arial", "Helvetica"],
        "font.size": 11,
        "text.color": BRIEF_NAVY_HEX,
        "axes.edgecolor": "#cbd5e1",
        "axes.labelcolor": "#334155",
        "xtick.color": "#475569",
        "ytick.color": "#475569",
        "figure.facecolor": "white",
        "savefig.facecolor": "white",
    })
    return plt


def _fig_to_png(fig):
    import matplotlib.pyplot as plt
    buf = io.BytesIO()
    try:
        fig.tight_layout(pad=1.2)
    except Exception:
        pass
    fig.savefig(buf, format="png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf


def _hide(ax, sides):
    for s in sides:
        ax.spines[s].set_visible(False)


def _chart_bar_v(labels, values, *, vfmt=lambda v: f"{v:,.0f}",
                 color=BRIEF_PRIMARY_HEX, rotate=20, drop_zero=True):
    pairs = list(zip(labels, values))
    if drop_zero:
        pairs = [(l, v) for l, v in pairs if v]
    if not pairs:
        return None
    labels = [p[0] for p in pairs]
    values = [p[1] for p in pairs]
    plt = _mpl()
    fig, ax = plt.subplots(figsize=(11, 4.0), dpi=200)
    xs = range(len(labels))
    bars = ax.bar(xs, values, color=color, width=0.6)
    ax.set_xticks(list(xs))
    ax.set_xticklabels([str(l) for l in labels], rotation=rotate,
                       ha="right" if rotate else "center", fontsize=10)
    ax.set_yticks([])
    _hide(ax, ["top", "right", "left"])
    for b, v in zip(bars, values):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height(), vfmt(v),
                ha="center", va="bottom", fontsize=9, color=BRIEF_NAVY_HEX, weight="bold")
    ax.margins(y=0.18)
    return _fig_to_png(fig)


def _chart_donut(labels, values):
    pairs = [(l, v) for l, v in zip(labels, values) if v and v > 0]
    if not pairs:
        return None
    plt = _mpl()
    labels = [p[0] for p in pairs]
    values = [p[1] for p in pairs]
    colors = [CHART_PALETTE[i % len(CHART_PALETTE)] for i in range(len(labels))]
    fig, ax = plt.subplots(figsize=(11, 4.0), dpi=200)
    wedges, _t, autot = ax.pie(
        values, labels=None,
        autopct=lambda p: f"{p:.0f}%" if p >= 5 else "",
        startangle=90, colors=colors, pctdistance=0.78,
        wedgeprops={"width": 0.42, "edgecolor": "white", "linewidth": 2},
        textprops={"fontsize": 10, "color": "white", "weight": "bold"},
    )
    total = sum(values)
    leg = [f"{str(l)[:26]}  ({v / total * 100:.0f}%)" for l, v in zip(labels, values)]
    ax.legend(wedges, leg, loc="center left", bbox_to_anchor=(0.98, 0.5),
              fontsize=10, frameon=False)
    ax.axis("equal")
    return _fig_to_png(fig)


def _chart_pareto(labels, values, *, vfmt):
    """Sorted bars + cumulative % line — shows concentration."""
    pairs = [(l, v) for l, v in zip(labels, values) if v and v > 0]
    if not pairs:
        return None
    pairs.sort(key=lambda x: x[1], reverse=True)
    labels = [p[0] for p in pairs]
    values = [p[1] for p in pairs]
    total = sum(values)
    cum, s = [], 0.0
    for v in values:
        s += v
        cum.append(s / total * 100)
    plt = _mpl()
    fig, ax = plt.subplots(figsize=(11, 4.2), dpi=200)
    xs = range(len(labels))
    bars = ax.bar(xs, values, color=BRIEF_PRIMARY_HEX, width=0.62, zorder=2)
    ax.set_xticks(list(xs))
    ax.set_xticklabels([str(l) for l in labels], rotation=22, ha="right", fontsize=10)
    ax.set_yticks([])
    _hide(ax, ["top", "left"])
    for b, v in zip(bars, values):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height(), vfmt(v),
                ha="center", va="bottom", fontsize=9, color=BRIEF_NAVY_HEX, weight="bold")
    ax2 = ax.twinx()
    ax2.plot(list(xs), cum, color=BRIEF_GOLD_HEX, marker="o", markersize=5, linewidth=2, zorder=3)
    ax2.set_ylim(0, 108)
    ax2.set_yticks([0, 25, 50, 75, 100])
    ax2.set_yticklabels(["0%", "25%", "50%", "75%", "100%"], fontsize=9)
    ax2.spines["right"].set_color("#cbd5e1")
    _hide(ax2, ["top"])
    ax.margins(y=0.18)
    return _fig_to_png(fig)


def _chart_value_activity(labels, values, counts, *, vfmt, color=BRIEF_PRIMARY_HEX):
    """Value bars (left) + opportunity-count line/markers (right twin axis).

    Reveals where value concentrates vs. where activity sits — used for the
    pipeline (in stage order) and engine value streams (value-sorted)."""
    if not labels or (sum(abs(v) for v in values) == 0 and sum(counts) == 0):
        return None
    plt = _mpl()
    fig, ax = plt.subplots(figsize=(11, 4.2), dpi=200)
    xs = list(range(len(labels)))
    bars = ax.bar(xs, values, color=color, width=0.58, zorder=2)
    ax.set_xticks(xs)
    ax.set_xticklabels([str(l) for l in labels], rotation=22, ha="right", fontsize=9.5)
    ax.set_yticks([])
    _hide(ax, ["top", "right", "left"])
    for b, v in zip(bars, values):
        if v:
            ax.text(b.get_x() + b.get_width() / 2, b.get_height(), vfmt(v),
                    ha="center", va="bottom", fontsize=8.5, color=BRIEF_NAVY_HEX, weight="bold")
    ax2 = ax.twinx()
    ax2.plot(xs, counts, color=BRIEF_GOLD_HEX, marker="o", markersize=5, linewidth=2, zorder=3)
    for x, c in zip(xs, counts):
        ax2.text(x, c, f"  {int(c)}", color=BRIEF_GOLD_DK_HEX, fontsize=8.5,
                 va="bottom", ha="center", weight="bold")
    ax2.set_yticks([])
    _hide(ax2, ["top", "right", "left"])
    ax.margins(y=0.18)
    ax2.margins(y=0.24)
    from matplotlib.patches import Patch
    from matplotlib.lines import Line2D
    ax.legend(
        [Patch(color=color), Line2D([0], [0], color=BRIEF_GOLD_HEX, marker="o")],
        ["CRP term benefit (GBP m)", "Opportunities (count)"],
        loc="upper right", fontsize=9, frameon=False,
    )
    return _fig_to_png(fig)


def _chart_compose(segments, *, vfmt, height=1.5):
    """Single 100%-stacked horizontal bar with a legend — composition at a glance."""
    segments = [(l, v) for l, v in segments if v and v > 0]
    if not segments:
        return None
    plt = _mpl()
    fig, ax = plt.subplots(figsize=(12, height), dpi=200)
    total = sum(v for _, v in segments)
    left = 0.0
    for i, (l, v) in enumerate(segments):
        w = v / total * 100
        c = CHART_PALETTE[i % len(CHART_PALETTE)]
        ax.barh(0, w, left=left, color=c, height=0.55)
        if w > 7:
            ax.text(left + w / 2, 0, f"{int(round(w))}%", ha="center", va="center",
                    color="white", fontsize=10, weight="bold")
        left += w
    ax.set_xlim(0, 100)
    ax.set_yticks([])
    ax.set_xticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)
    from matplotlib.patches import Patch
    ax.legend([Patch(color=CHART_PALETTE[i % len(CHART_PALETTE)]) for i in range(len(segments))],
              [f"{_safe(l)[:22]}  {vfmt(v)}" for l, v in segments],
              loc="upper center", bbox_to_anchor=(0.5, -0.35),
              ncol=min(4, len(segments)), fontsize=9, frameon=False)
    return _fig_to_png(fig)


def _chart_risk(bars):
    """100%-stacked horizontal bars (one per category) for risk composition.

    ``bars`` = [(row_label, [(seg_label, value, color_hex), ...]), ...]"""
    bars = [(rl, [(sl, v, c) for sl, v, c in segs if v]) for rl, segs in bars]
    bars = [b for b in bars if b[1]]
    if not bars:
        return None
    plt = _mpl()
    fig, ax = plt.subplots(figsize=(11, 0.9 * len(bars) + 1.2), dpi=200)
    seen = {}
    for i, (rl, segs) in enumerate(bars):
        total = sum(v for _, v, _ in segs) or 1
        left = 0.0
        for sl, v, c in segs:
            w = v / total * 100
            ax.barh(i, w, left=left, color=c, height=0.5, zorder=2)
            if w > 8:
                ax.text(left + w / 2, i, f"{int(round(w))}%", ha="center", va="center",
                        color="white", fontsize=9.5, weight="bold")
            left += w
            seen[sl] = c
    ax.set_yticks(range(len(bars)))
    ax.set_yticklabels([rl for rl, _ in bars], fontsize=10.5)
    ax.set_xticks([])
    ax.set_xlim(0, 100)
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.invert_yaxis()
    from matplotlib.patches import Patch
    ax.legend([Patch(color=c) for c in seen.values()], list(seen.keys()),
              loc="upper center", bbox_to_anchor=(0.5, -0.12),
              ncol=min(4, len(seen)), fontsize=9.5, frameon=False)
    return _fig_to_png(fig)


# =============================================================================
# 3. BRIEFING PDF BASE (flow layout engine)
# =============================================================================

class BriefingPDF(FPDF):
    PAGE_W = 297
    PAGE_H = 210
    ML = 16
    MR = 16
    MT = 18
    FOOT = 18  # bottom reserve

    def __init__(self, report_name="Report"):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.report_name = report_name
        # Manual pagination throughout — predictable, no surprise breaks.
        self.set_auto_page_break(False)
        self.set_margins(self.ML, self.MT, self.MR)
        self._cover_page_no = -1

    @property
    def content_w(self):
        return self.PAGE_W - self.ML - self.MR

    @property
    def bottom(self):
        return self.PAGE_H - self.FOOT

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

    # -- low-level flow helpers --------------------------------------------

    def ensure(self, h):
        if self.get_y() + h > self.bottom:
            self.add_page()
            self.set_y(self.MT)

    def _wrap_lines(self, text, width):
        words = _safe(text).split()
        lines, cur = [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if self.get_string_width(t) <= width:
                cur = t
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines or [""]

    # -- cover --------------------------------------------------------------

    def cover_page(self, title, subtitle, tag, meta_lines):
        self.add_page()
        self._cover_page_no = self.page_no()
        self.set_fill_color(*BRIEF_NAVY)
        self.rect(0, 0, self.PAGE_W, self.PAGE_H, "F")

        self.set_xy(self.ML, 30)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*BRIEF_WHITE)
        self.cell(0, 8, "ROLLS-ROYCE", 0, 1, "L")
        self.set_x(self.ML)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(190, 200, 215)
        self.cell(0, 5, "CIVIL AEROSPACE  -  AFTERMARKET ANALYTICS", 0, 1, "L")

        self.set_xy(self.ML, 50)
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(*BRIEF_GOLD)
        self.set_text_color(*BRIEF_NAVY)
        tw = self.get_string_width(_safe(tag)) + 8
        self.cell(tw, 7, _safe(tag), 0, 1, "C", True)

        self.set_fill_color(*BRIEF_GOLD)
        self.rect(self.ML, 74, 44, 1.1, "F")

        self.set_xy(self.ML, 82)
        self.set_font("Helvetica", "B", 30)
        self.set_text_color(*BRIEF_WHITE)
        self.multi_cell(self.content_w, 13, _safe(title))

        self.set_x(self.ML)
        self.ln(2)
        self.set_font("Helvetica", "", 14)
        self.set_text_color(*BRIEF_GOLD)
        self.cell(0, 9, _safe(subtitle), 0, 1, "L")

        self.set_xy(self.ML, self.PAGE_H - 16 - 6 * len(meta_lines))
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(205, 213, 225)
        for ln in meta_lines:
            self.set_x(self.ML)
            self.cell(0, 6, _safe(ln), 0, 1, "L")

        self.set_xy(self.ML, self.PAGE_H - 12)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(*BRIEF_GOLD)
        self.cell(0, 5, "CONFIDENTIAL - FOR INTERNAL USE ONLY", 0, 0, "L")

    # -- section header (flow; breaks only when needed) --------------------

    def section(self, title, sub="", reserve=150):
        """Start a section. Breaks to a fresh page unless the header plus
        ``reserve`` mm of body will fit in the remaining space."""
        if self.get_y() > self.MT + 1:
            self.ln(6)
        if self.get_y() + 16 + reserve > self.bottom:
            self.add_page()
            self.set_y(self.MT)
        self.set_x(self.ML)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*BRIEF_NAVY)
        self.cell(0, 8, _safe(title), 0, 1, "L")
        if sub:
            self.set_x(self.ML)
            self.set_font("Helvetica", "", 9.5)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(0, 5, _safe(sub), 0, 1, "L")
        y = self.get_y() + 1.5
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(self.ML, y, 26, 1.0, "F")
        self.set_y(y + 5)

    def caption(self, text):
        self.ensure(8)
        self.set_x(self.ML)
        self.set_font("Helvetica", "B", 9.5)
        self.set_text_color(*BRIEF_NAVY)
        self.cell(0, 5, _safe(text), 0, 1, "L")
        self.ln(1)

    # -- KPI cards ----------------------------------------------------------

    def kpi_row(self, cards, h=27):
        n = max(1, len(cards))
        gap = 5
        w = (self.content_w - gap * (n - 1)) / n
        self.ensure(h + 6)
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

    # -- narrative ----------------------------------------------------------

    def narrative(self, text):
        self.set_font("Helvetica", "", 10)
        lines = self._wrap_lines(text, self.content_w - 6)
        h = len(lines) * 5.8 + 3
        self.ensure(h + 2)
        x, y = self.ML, self.get_y()
        self.set_xy(x + 6, y)
        self.set_text_color(*BRIEF_INK)
        for ln in lines:
            self.set_x(x + 6)
            self.cell(self.content_w - 6, 5.8, ln, 0, 1, "L")
        y2 = self.get_y()
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(x, y, 1.5, max(1.0, y2 - y - 1), "F")
        self.set_y(y2 + 4)

    # -- insight callout ----------------------------------------------------

    def insight(self, text, label="KEY INSIGHT"):
        self.set_font("Helvetica", "", 9)
        inner_w = self.content_w - 10
        lines = self._wrap_lines(text, inner_w)
        line_h = 4.8
        box_h = 3 + 5 + len(lines) * line_h + 3
        self.ensure(box_h + 3)
        x, y = self.ML, self.get_y()
        self.set_fill_color(*BRIEF_PRIMARY_TINT)
        self.rect(x, y, self.content_w, box_h, "F")
        self.set_fill_color(*BRIEF_GOLD)
        self.rect(x, y, 1.6, box_h, "F")
        self.set_xy(x + 5, y + 3)
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*BRIEF_GOLD_DK)
        self.cell(0, 4, label, 0, 1, "L")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(*BRIEF_INK)
        for ln in lines:
            self.set_x(x + 5)
            self.cell(inner_w, line_h, ln, 0, 1, "L")
        self.set_y(y + box_h + 3)

    # -- figure -------------------------------------------------------------

    def figure(self, buf, max_h=82):
        if buf is None:
            self.set_x(self.ML)
            self.set_font("Helvetica", "I", 9)
            self.set_text_color(*BRIEF_MUTE)
            self.cell(0, 6, "(No data available for this chart.)", 0, 1, "L")
            self.ln(2)
            return
        pw, ph = _png_size(buf.getvalue())
        w = self.content_w
        h = w * ph / pw if pw else max_h
        if h > max_h:
            h = max_h
            w = h * pw / ph
        self.ensure(h + 3)
        x = self.ML + (self.content_w - w) / 2
        self.image(buf, x=x, y=self.get_y(), w=w, h=h)
        self.set_y(self.get_y() + h + 3)

    # -- table (keep-together when it fits a page; else flow) --------------

    def table(self, headers, rows, widths, *, right_align_idx=None,
              totals_row=None, max_rows=60, title=None):
        rowh, headh = 6.4, 7
        n = min(len(rows), max_rows)
        cap_h = 8 if title else 0
        block_h = cap_h + headh + n * rowh + (7 if totals_row else 0)
        page_body = self.bottom - self.MT
        # If the whole table (with its caption) fits on a page but not here,
        # start it on a fresh page so the caption is never orphaned.
        if block_h <= page_body and self.get_y() + block_h > self.bottom:
            self.add_page()
            self.set_y(self.MT)
        if title:
            self.caption(title)

        def draw_head():
            self.set_fill_color(*BRIEF_NAVY)
            self.set_text_color(*BRIEF_WHITE)
            self.set_font("Helvetica", "B", 7.8)
            x = self.ML
            for i, hd in enumerate(headers):
                self.set_xy(x, self.get_y())
                self.cell(widths[i], headh, _safe(hd).upper(), 0, 0, "C", True)
                x += widths[i]
            self.ln(headh)

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
            if self.get_y() + rowh > self.bottom:
                self.add_page()
                self.set_y(self.MT)
                draw_head()
                self.set_font("Helvetica", "", 7.6)
            self.set_fill_color(*(BRIEF_ALT if ridx % 2 == 0 else BRIEF_WHITE))
            self.set_text_color(*BRIEF_INK)
            x = self.ML
            for i, cv in enumerate(row):
                self.set_xy(x, self.get_y())
                self.cell(widths[i], rowh, _safe(str(cv)), 0, 0, align(i, cv), True)
                x += widths[i]
            self.ln(rowh)
        if totals_row:
            if self.get_y() + 7 > self.bottom:
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
# 4. SHARED AGGREGATION HELPERS
# =============================================================================

PIPELINE_ORDER = [
    "Initial idea", "ICT formed", "Strategy Approved",
    "Financial Modelling Started", "Financial Modelling Complete",
    "Financials Approved", "Negotiations Started",
    "Negotiations Concluded", "Contracting Started", "Contracting Concluded",
]
LATE_STAGES = {"Negotiations Started", "Negotiations Concluded",
               "Contracting Started", "Contracting Concluded"}


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


def _apply_hopper_filters(opportunities, filters):
    if not filters:
        return list(opportunities)
    SIMPLE = {
        "region": "region", "customer": "customer", "status": "status",
        "maturity": "maturity", "restructure_type": "restructure_type",
        "evs": "engine_value_stream", "engine_value_stream": "engine_value_stream",
        "vp_owner": "vp_owner", "onerous_type": "onerous_type", "initiative": "initiative",
    }

    def matches(field_val, wanted):
        wl = [w.strip().lower() for w in str(wanted).split(",") if w.strip()]
        return (not wl) or str(field_val).strip().lower() in wl

    out = []
    for row in opportunities:
        keep = True
        for fk, rf in SIMPLE.items():
            wanted = filters.get(fk)
            if wanted and not matches(row.get(rf, ""), wanted):
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


# =============================================================================
# 5. GLOBAL HOPPER REPORT
# =============================================================================

def generate_hopper_pdf_report(parsed_data: dict, sections_to_include: list = None,
                               filters: dict = None) -> bytes:
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
    single_region = len(regions) <= 1

    pdf = BriefingPDF(report_name="Global Commercial Optimisation Hopper")

    meta_lines = [
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
        f"Opportunities: {total_opps}   |   Customers: {len(customers)}   |   Regions: {len(regions)}",
        "Currency: GBP (millions)",
    ]
    if filters.get("customer"):
        meta_lines.insert(0, f"Filtered customer: {filters['customer']}")
    if filters.get("region"):
        meta_lines.insert(0, f"Filtered region: {filters['region']}")
    pdf.cover_page("Global Commercial\nOptimisation Hopper", "Executive Briefing",
                   "GLOBAL HOPPER", meta_lines)

    if total_opps == 0:
        pdf.section("Executive Summary")
        pdf.narrative("No opportunities match the selected filters.")
        return bytes(pdf.output())

    # Aggregations reused across pages
    by_status_count = _aggregate(filtered, "status", count=True)
    by_status_crp = _aggregate(filtered, "status")
    by_cust = _aggregate(filtered, "customer")
    cust_count = _aggregate(filtered, "customer", count=True)
    cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)
    by_evs_count = _aggregate(filtered, "engine_value_stream", count=True)
    by_evs_crp = _aggregate(filtered, "engine_value_stream")
    late_crp = sum(v for s, v in by_status_crp.items() if s in LATE_STAGES)

    # ---- Executive Summary ----
    pdf.section("Executive Summary", "Portfolio value and profile", reserve=120)
    pdf.kpi_row([
        ("CRP Term Benefit", _fmtM_gbp(total_crp), f"{total_opps} opps - {len(customers)} customers", BRIEF_PRIMARY),
        ("Profit 2026", _fmtM_gbp(totals_year[2026]),
         f"26-27: {_fmtM_gbp(totals_year[2026] + totals_year[2027])}", BRIEF_GOLD),
        ("Profit 2027", _fmtM_gbp(totals_year[2027]), None, BRIEF_PRIMARY),
        ("Profit 2028-30", _fmtM_gbp(long_term), f"Avg/yr {_fmtM_gbp(long_term / 3)}", BRIEF_GREEN),
    ])
    region_phrase = f"the {sorted(regions)[0]} region" if single_region else f"{len(regions)} regions"
    pdf.narrative(
        f"This briefing summarises {total_opps} commercial optimisation opportunities across {region_phrase} "
        f"and {len(customers)} customers, carrying {_fmtM_gbp(total_crp)} of CRP term benefit. Near-term profit "
        f"(2026-27) totals {_fmtM_gbp(totals_year[2026] + totals_year[2027])}, with a further {_fmtM_gbp(long_term)} "
        f"forecast across 2028-30. {mature} opportunities are assessed as mature and {onerous} sit within onerous contracts."
    )
    pdf.kpi_row([
        ("Mature", str(mature), f"{immature} immature", BRIEF_GREEN),
        ("Onerous", str(onerous), f"{not_onerous} not onerous", BRIEF_RED),
        ("Engine Value Streams", str(len(evss)), None, BRIEF_PRIMARY),
        ("Regions", str(len(regions)), ", ".join(sorted(regions)[:3]) + ("..." if len(regions) > 3 else ""), BRIEF_GOLD),
    ], h=22)

    comp = sorted(by_status_crp.items(), key=lambda x: x[1], reverse=True)
    comp_top = comp[:5]
    if len(comp) > 5:
        comp_top.append(("Other stages", sum(v for _, v in comp[5:])))
    pdf.caption("CRP term benefit composition by pipeline stage")
    pdf.figure(_chart_compose(comp_top, vfmt=lambda v: _fmtM_gbp(v)), max_h=26)

    if cust_sorted:
        top_name, top_val = cust_sorted[0]
        top3 = sum(v for _, v in cust_sorted[:3])
        pdf.insight(
            f"Portfolio value is highly concentrated: {top_name} alone accounts for {_pct(top_val, total_crp)} "
            f"of CRP term benefit across {cust_count.get(top_name, 0)} opportunities, and the top three customers "
            f"represent {_pct(top3, total_crp)}. {_pct(late_crp, total_crp)} of value already sits in late-stage "
            f"(negotiation / contracting) opportunities."
        )

    # ---- Pipeline & Status (value vs activity, stage order) ----
    pdf.section("Pipeline & Status", "Where value and activity sit across the pipeline")
    stages = [s for s in PIPELINE_ORDER if s in by_status_count] + \
             [s for s in by_status_count if s not in PIPELINE_ORDER]
    pdf.caption("CRP term benefit (bars) and opportunity count (line) by stage")
    pdf.figure(_chart_value_activity(
        list(stages),
        [by_status_crp.get(s, 0) for s in stages],
        [by_status_count.get(s, 0) for s in stages],
        vfmt=lambda v: f"£{v:,.0f}m"), max_h=60)
    early_ct = sum(by_status_count.get(s, 0) for s in ("Initial idea", "ICT formed"))
    pdf.insight(
        f"{_pct(late_crp, total_crp)} of CRP term benefit is concentrated in late-stage opportunities, while "
        f"{early_ct} early-stage ideas (Initial idea / ICT formed) carry limited value today — a value-mature but "
        f"activity-front-loaded pipeline.")
    rows = [[_trunc(s, 60), str(by_status_count.get(s, 0)), _fmtM_gbp(by_status_crp.get(s, 0)),
             _pct(by_status_crp.get(s, 0), total_crp)] for s in stages]
    pdf.table(["Stage", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [130, 45, 55, 35],
              right_align_idx={1, 2, 3},
              totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"], title="Pipeline by stage")

    # ---- Regional split (only when more than one region) ----
    if not single_region:
        by_region = _aggregate(filtered, "region")
        reg_count = _aggregate(filtered, "region", count=True)
        reg_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
        pdf.section("Regional Split", "CRP term benefit by region")
        pdf.caption("Share of CRP term benefit by region")
        pdf.figure(_chart_donut([r for r, _ in reg_sorted], [v for _, v in reg_sorted]), max_h=70)
        top_r, top_rv = reg_sorted[0]
        pdf.insight(f"{top_r} leads with {_pct(top_rv, total_crp)} of CRP term benefit across "
                    f"{reg_count.get(top_r, 0)} opportunities.")
        rows = [[_trunc(r, 40), str(reg_count.get(r, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
                for r, v in reg_sorted]
        pdf.table(["Region", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [120, 45, 55, 45],
                  right_align_idx={1, 2, 3},
                  totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"], title="Region breakdown")

    # ---- Customer concentration (Pareto) ----
    pdf.section("Customer Concentration", "How CRP term benefit is distributed across customers")
    val_custs = [(c, v) for c, v in cust_sorted if v > 0]
    pdf.caption("CRP term benefit by customer with cumulative share")
    pdf.figure(_chart_pareto([c[:20] for c, _ in val_custs], [v for _, v in val_custs],
                             vfmt=lambda v: f"£{v:,.0f}m"), max_h=92)
    zero_custs = len(cust_sorted) - len(val_custs)
    if cust_sorted:
        pdf.insight(
            f"{cust_sorted[0][0]} is the dominant account at {_pct(cust_sorted[0][1], total_crp)} of CRP. "
            + (f"{zero_custs} customers currently carry no CRP value but remain active in the pipeline. "
               if zero_custs else "")
            + "Concentration this high concentrates both upside and renewal risk in a single relationship.")
    rows = [[str(i), _trunc(c, 42), str(cust_count.get(c, 0)), _fmtM_gbp(v), _pct(v, total_crp)]
            for i, (c, v) in enumerate(cust_sorted[:15], 1)]
    sub = sum(v for _, v in cust_sorted[:15])
    pdf.table(["#", "Customer", "Opportunities", "CRP Term (GBP m)", "% of Total"], rows, [10, 110, 40, 55, 35],
              right_align_idx={2, 3, 4},
              totals_row=["", f"Top {len(rows)} subtotal",
                          str(sum(cust_count.get(c, 0) for c, _ in cust_sorted[:15])),
                          _fmtM_gbp(sub), _pct(sub, total_crp)], title="Top customers")

    # ---- Engine value stream (value vs activity) ----
    evs_sorted = sorted(by_evs_count.items(), key=lambda x: by_evs_crp.get(x[0], 0), reverse=True)
    pdf.section("Engine Value Stream", "Value and activity by engine value stream")
    pdf.caption("CRP term benefit (bars) and opportunity count (line) by engine value stream")
    pdf.figure(_chart_value_activity(
        [e[:16] for e, _ in evs_sorted],
        [by_evs_crp.get(e, 0) for e, _ in evs_sorted],
        [c for _, c in evs_sorted],
        vfmt=lambda v: f"£{v:,.0f}m"), max_h=60)
    # value density insight
    dens = [(e, by_evs_crp.get(e, 0) / max(1, c)) for e, c in evs_sorted if by_evs_crp.get(e, 0) > 0]
    if dens:
        dens.sort(key=lambda x: x[1], reverse=True)
        hi = dens[0]
        pdf.insight(
            f"{hi[0]} carries the highest value density at {_fmtM_gbp(hi[1])} per opportunity. Activity (count) and "
            f"value do not always align — high-count streams with low value indicate early-stage volume worth maturing.")
    rows = [[_trunc(e, 48), str(c), _fmtM_gbp(by_evs_crp.get(e, 0)), _pct(by_evs_crp.get(e, 0), total_crp)]
            for e, c in evs_sorted]
    pdf.table(["Engine Value Stream", "Opportunities", "CRP Term (GBP m)", "% of Total"], rows, [120, 45, 55, 35],
              right_align_idx={1, 2, 3},
              totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"], title="Engine value stream breakdown")

    # ---- Annual profit forecast ----
    pdf.section("Annual Profit Forecast", "Forecast profit 2026-2030")
    years = ["2026", "2027", "2028", "2029", "2030"]
    pdf.caption("Forecast profit by year (GBP m)")
    pdf.figure(_chart_bar_v(years, [totals_year[int(y)] for y in years],
                            vfmt=lambda v: f"£{v:,.0f}m", color=BRIEF_PRIMARY_HEX, rotate=0, drop_zero=False),
               max_h=62)
    near = totals_year[2026] + totals_year[2027]
    allp = sum(totals_year.values()) or 1
    pdf.insight(f"Near-term profit (2026-27) of {_fmtM_gbp(near)} represents {_pct(near, allp)} of the five-year "
                f"forecast, indicating a front-loaded return profile.")
    rows = [[y, _fmtM_gbp(totals_year[int(y)]), _pct(totals_year[int(y)], allp)] for y in years]
    pdf.table(["Year", "Profit (GBP m)", "% of Forecast"], rows, [40, 60, 40], right_align_idx={1, 2},
              totals_row=["TOTAL", _fmtM_gbp(allp), "100.0%"], title="Annual profit")

    # ---- Structure & risk ----
    by_rtype_count = _aggregate(filtered, "restructure_type", count=True)
    by_rtype_crp = _aggregate(filtered, "restructure_type")
    rtype_sorted = sorted(by_rtype_crp.items(), key=lambda x: x[1], reverse=True)
    pdf.section("Structure & Risk", "Restructure mix and portfolio risk profile")
    pdf.caption("Portfolio risk composition")
    pdf.figure(_chart_risk([
        ("Maturity", [("Mature", mature, BRIEF_GREEN_HEX), ("Immature", immature, BRIEF_SLATE_HEX)]),
        ("Onerous", [("Not onerous", not_onerous, BRIEF_PRIMARY_HEX), ("Onerous", onerous, BRIEF_RED_HEX)]),
    ]), max_h=48)
    pdf.insight(
        f"{_pct(onerous, total_opps)} of opportunities sit within onerous contracts and {_pct(immature, total_opps)} "
        f"are immature — the principal execution risks to the forecast value above.")
    rows = [[_trunc(rt, 50), str(by_rtype_count.get(rt, 0)), _fmtM_gbp(crp), _pct(crp, total_crp)]
            for rt, crp in rtype_sorted]
    pdf.table(["Restructure Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"], rows, [120, 45, 55, 35],
              right_align_idx={1, 2, 3},
              totals_row=["TOTAL", str(total_opps), _fmtM_gbp(total_crp), "100.0%"], title="Restructure type")

    # ---- Top opportunities register ----
    pdf.section("Top Opportunities", "Top 25 by CRP term benefit", reserve=60)
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
    pdf.table(["#", "Region", "Customer", "Engine VS", "Restructure", "Status", "Maturity",
               "CRP", "2026", "2027", "VP/Owner"],
              rows, [8, 22, 34, 30, 30, 28, 18, 22, 18, 18, 34],
              right_align_idx={0, 7, 8, 9}, max_rows=25)

    # ---- Full customer breakdown (only when it adds detail) ----
    if len(cust_sorted) > 15:
        pdf.section("Customer Breakdown", "All customers ranked by CRP term benefit", reserve=60)
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
            rows.append([str(i), _trunc(c, 42), str(d["count"]), _fmtM_gbp(d["crp"]),
                         _fmtM_short(d["p26"]), _fmtM_short(d["p27"]), _fmtM_short(d["p2830"]),
                         _pct(d["crp"], total_crp)])
        pdf.table(["#", "Customer", "Opps", "CRP Term (GBP m)", "Profit 2026", "Profit 2027", "Profit 2028-30", "% of CRP"],
                  rows, [8, 71, 18, 40, 32, 32, 38, 26], right_align_idx={2, 3, 4, 5, 6, 7},
                  totals_row=["", "TOTAL", str(total_opps), _fmtM_gbp(total_crp),
                              _fmtM_short(totals_year[2026]), _fmtM_short(totals_year[2027]),
                              _fmtM_short(long_term), "100.0%"], max_rows=80)

    return bytes(pdf.output())


# =============================================================================
# 6. OPPORTUNITY TRACKER REPORT
# =============================================================================

def generate_opp_pdf_report(parsed_data: dict, sections_to_include: list = None,
                            filters: dict = None) -> bytes:
    filters = filters or {}
    opportunities = parsed_data.get("opportunities", {})
    all_items = []
    for sheet_name, recs in (opportunities.items() if isinstance(opportunities, dict) else []):
        if isinstance(recs, list):
            for r in recs:
                all_items.append({**r, "_sheet": sheet_name})
    if not all_items:
        all_items = parsed_data.get("all_items", [])

    def matches(field_val, wanted):
        if wanted is None or wanted == "":
            return True
        wl = [w.strip().lower() for w in str(wanted).split(",") if w.strip()]
        return str(field_val).strip().lower() in wl

    filtered = []
    for row in all_items:
        if not matches(row.get("customer"), filters.get("customer")):
            continue
        if not matches(row.get("status"), filters.get("status")):
            continue
        if not matches(row.get("ext_probability"), filters.get("ext_probability")):
            continue
        if filters.get("priority") and not matches(str(row.get("priority")).replace(".0", ""),
                                                   str(filters["priority"]).replace(".0", "")):
            continue
        if not matches(row.get("opportunity_type", row.get("opp_type")), filters.get("opp_type")):
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
    total_2627 = sum(_val(r.get("sum_26_27")) for r in filtered)
    total_term = sum(_val(r.get("term_benefit")) for r in filtered)
    active = [r for r in filtered if str(r.get("status", "")).lower() not in ("completed", "lost", "declined")]
    customers = {r.get("customer") for r in filtered if r.get("customer")}

    pdf = BriefingPDF(report_name="Opportunity Tracker")
    meta_lines = [
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
        f"Opportunities: {len(filtered)}  ({len(active)} active)   |   Customers: {len(customers)}",
        f"Away day: {meta.get('away_day_date', '-')}",
    ]
    if filters.get("customer"):
        meta_lines.insert(0, f"Filtered customer: {filters['customer']}")
    pdf.cover_page("Commercial Optimisation\nOpportunity Tracker", "Executive Briefing",
                   "OPP TRACKER", meta_lines)

    if not filtered:
        pdf.section("Executive Summary")
        pdf.narrative("No opportunities match the selected filters.")
        return bytes(pdf.output())

    # priority composition
    by_priority = {}
    for r in filtered:
        p = str(r.get("priority", "?")).replace(".0", "")
        p = "Unspecified" if p in ("", "None", "nan") else f"Priority {p}"
        by_priority[p] = by_priority.get(p, 0) + _val(r.get("sum_26_27"))
    pri_items = sorted(by_priority.items(), key=lambda x: x[1], reverse=True)

    by_cust = {}
    for r in filtered:
        c = r.get("customer") or "Unknown"
        by_cust[c] = by_cust.get(c, 0) + _val(r.get("sum_26_27"))
    cust_count = {}
    for r in filtered:
        c = r.get("customer") or "Unknown"
        cust_count[c] = cust_count.get(c, 0) + 1
    cust_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)

    pdf.section("Executive Summary", "Pipeline value and priority mix", reserve=120)
    pdf.kpi_row([
        ("2026 Benefit", _fmtM(total_26), None, BRIEF_PRIMARY),
        ("2027 Benefit", _fmtM(total_27), None, BRIEF_PRIMARY),
        ("2026 + 2027", _fmtM(total_2627), f"{len(active)} active of {len(filtered)}", BRIEF_GOLD),
        ("Term Impact", _fmtM(total_term), None, BRIEF_GREEN),
    ])
    pdf.narrative(
        f"The opportunity tracker covers {len(filtered)} opportunities across {len(customers)} customers, representing "
        f"{_fmtM(total_2627)} of combined 2026-2027 benefit and {_fmtM(total_term)} of term impact. {len(active)} "
        f"opportunities remain active in the pipeline.")
    pdf.caption("Value composition by priority (2026 + 2027)")
    pdf.figure(_chart_compose(pri_items, vfmt=lambda v: _fmtM(v)), max_h=26)
    if cust_sorted:
        pdf.insight(f"{cust_sorted[0][0]} is the largest account at {_pct(cust_sorted[0][1], total_2627)} of "
                    f"combined 2026-2027 value across {cust_count.get(cust_sorted[0][0], 0)} opportunities.")

    # customer concentration
    pdf.section("Customer Concentration", "2026-2027 value distribution across customers")
    val_c = [(c, v) for c, v in cust_sorted if v > 0]
    pdf.caption("Value by customer with cumulative share")
    pdf.figure(_chart_pareto([c[:16] for c, _ in val_c], [v for _, v in val_c],
                             vfmt=lambda v: f"${v:,.0f}m"), max_h=80)
    rows = [[_trunc(c, 40), str(cust_count.get(c, 0)), _fmtM(v), _pct(v, total_2627)] for c, v in cust_sorted]
    pdf.table(["Customer", "Opportunities", "Value (26+27)", "% of Total"], rows, [110, 45, 60, 40],
              right_align_idx={1, 2, 3},
              totals_row=["TOTAL", str(len(filtered)), _fmtM(total_2627), "100.0%"], title="Customer breakdown")

    # top opportunities
    pdf.section("Top Opportunities", "Ranked by combined 2026-2027 value", reserve=60)
    top = sorted(filtered, key=lambda r: _val(r.get("sum_26_27")), reverse=True)[:25]
    rows = []
    for i, r in enumerate(top, 1):
        rows.append([str(i), _trunc(r.get("customer", ""), 18), _trunc(r.get("project", ""), 16),
                     _trunc(r.get("asks", ""), 60), _safe(r.get("ext_probability", "")),
                     str(r.get("priority", "")).replace(".0", ""), _trunc(r.get("status", ""), 12),
                     _fmtM(_val(r.get("sum_26_27")))])
    pdf.table(["#", "Customer", "Project", "Asks", "Ext Prob", "Priority", "Status", "Value (26+27)"],
              rows, [9, 34, 28, 92, 22, 18, 25, 37], right_align_idx={0, 7}, max_rows=25)

    # estimation level
    est_names = meta.get("estimation_levels", {})
    est = {}
    for r in filtered:
        sh = r.get("_sheet", "Unknown")
        slot = est.setdefault(sh, {"count": 0, "sum": 0.0, "term": 0.0})
        slot["count"] += 1
        slot["sum"] += _val(r.get("sum_26_27"))
        slot["term"] += _val(r.get("term_benefit"))
    if est:
        pdf.section("Estimation Level", "Value by confidence tier")
        labels = [est_names.get(sh, sh) for sh in est]
        pdf.caption("Combined 2026-2027 value by estimation level")
        pdf.figure(_chart_bar_v(labels, [d["sum"] for d in est.values()],
                                vfmt=lambda v: f"${v:,.0f}m", color=BRIEF_PRIMARY_HEX, rotate=0), max_h=74)
        rows = [[_trunc(est_names.get(sh, sh), 40), str(d["count"]), _fmtM(d["sum"]), _fmtM(d["term"]),
                 _pct(d["sum"], total_2627)] for sh, d in sorted(est.items(), key=lambda x: x[1]["sum"], reverse=True)]
        pdf.table(["Estimation Level", "Opportunities", "Value (26+27)", "Term Benefit", "% of Total"],
                  rows, [95, 38, 45, 45, 32], right_align_idx={1, 2, 3, 4},
                  totals_row=["TOTAL", str(len(filtered)), _fmtM(total_2627), _fmtM(total_term), "100.0%"])

    return bytes(pdf.output())


# =============================================================================
# 7. SOA REPORT
# =============================================================================

def generate_pdf_report(metadata: dict, grand_totals: dict, filtered_df: pd.DataFrame,
                        sections_summary: dict, source_files: list = None,
                        currency_symbol: str = "USD") -> bytes:
    cust = metadata.get("customer_name", "Customer")
    pdf = BriefingPDF(report_name="Statement of Account")
    meta_lines = [
        f"Customer: {cust}",
        f"Report date: {_fmt_date(metadata.get('report_date'))}",
        f"Generated: {datetime.now().strftime('%d %B %Y')}",
    ]
    if source_files:
        meta_lines.append(f"Sources: {', '.join(str(s) for s in source_files)[:90]}")
    pdf.cover_page("Statement of Account", "Executive Briefing", "SOA", meta_lines)

    charges = _val(grand_totals.get("total_charges", 0))
    credits = _val(grand_totals.get("total_credits", 0))
    net = _val(grand_totals.get("net_balance", 0))
    overdue = _val(grand_totals.get("total_overdue", 0))
    items = grand_totals.get("item_count", 0)

    pdf.section("Executive Summary", f"Account position for {_safe(cust)}", reserve=90)
    pdf.kpi_row([
        ("Total Charges", _fmt_currency(charges, currency_symbol), f"{_fmt_number(items)} open items", BRIEF_PRIMARY),
        ("Total Credits", _fmt_currency(credits, currency_symbol), None, BRIEF_GREEN),
        ("Net Balance", _fmt_currency(net, currency_symbol), None, BRIEF_RED if net > 0 else BRIEF_GREEN),
        ("Total Overdue", _fmt_currency(overdue, currency_symbol),
         f"Avg {_fmt_number(metadata.get('avg_days_late'))} days late", BRIEF_RED),
    ])
    pdf.narrative(
        f"This statement summarises the account position for {cust}. Total charges of "
        f"{_fmt_currency(charges, currency_symbol)} are offset by {_fmt_currency(credits, currency_symbol)} in credits, "
        f"leaving a net balance of {_fmt_currency(net, currency_symbol)}. {_fmt_currency(overdue, currency_symbol)} is "
        f"currently overdue across {_fmt_number(items)} open items, averaging "
        f"{_fmt_number(metadata.get('avg_days_late'))} days late.")
    if charges:
        pdf.insight(f"Overdue exposure is {_pct(overdue, charges)} of total charges. Recovery of the overdue balance "
                    f"would materially improve the net position.")

    if sections_summary:
        sec_labels = [str(s)[:22] for s in sections_summary.keys()]
        sec_totals = [_val(d.get("total", 0)) for d in sections_summary.values()]
        pdf.section("Section Summary", "Balance by account section")
        pdf.caption(f"Total balance by section ({currency_symbol})")
        pdf.figure(_chart_bar_v(sec_labels, sec_totals,
                                vfmt=lambda v: f"{v:,.0f}", color=BRIEF_PRIMARY_HEX, rotate=16), max_h=62)
        rows = []
        for name, d in sections_summary.items():
            rows.append([_trunc(name, 40), _fmt_currency(d.get("total", 0), currency_symbol),
                         _fmt_currency(d.get("charges", 0), currency_symbol),
                         _fmt_currency(d.get("credits", 0), currency_symbol),
                         _fmt_currency(d.get("overdue", 0), currency_symbol), _fmt_number(d.get("items", 0))])
        pdf.table(["Section", "Total", "Charges", "Credits", "Overdue", "Items"], rows, [70, 42, 42, 42, 42, 27],
                  right_align_idx={1, 2, 3, 4, 5},
                  totals_row=["TOTAL", _fmt_currency(charges + credits, currency_symbol),
                              _fmt_currency(charges, currency_symbol), _fmt_currency(credits, currency_symbol),
                              _fmt_currency(overdue, currency_symbol), _fmt_number(items)],
                  title="Section detail")

    if filtered_df is not None and not getattr(filtered_df, "empty", True):
        pdf.section("Invoice Register", f"Filtered records ({len(filtered_df):,} total)", reserve=40)
        rows = []
        for _i, row in filtered_df.head(150).iterrows():
            rows.append([_trunc(row.get("Section", "-"), 24), _trunc(row.get("Reference", "-") or "-", 16),
                         _fmt_date(row.get("Document Date")), _fmt_date(row.get("Due Date")),
                         _fmt_currency(row.get("Amount", 0), currency_symbol),
                         _trunc(row.get("Status", "-") or "-", 14), _trunc(row.get("Entry Type", "-") or "-", 12),
                         _fmt_number(row.get("Days Late"))])
        pdf.table(["Section", "Reference", "Doc Date", "Due Date", "Amount", "Status", "Type", "Days Late"],
                  rows, [48, 32, 26, 26, 38, 30, 26, 22], right_align_idx={4, 7}, max_rows=150)

    return bytes(pdf.output())
