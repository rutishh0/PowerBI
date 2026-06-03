"""
Rolls-Royce Civil Aerospace — AI-powered dynamic PDF report
============================================================

A second report pathway (alongside the static generators in ``pdf_export.py``)
in which ``moonshotai/kimi-k2.6`` (via the NVIDIA integrate.api endpoint)
*designs* the report — structure, narrative insight, and visualizations — for a
polished, executive Rolls-Royce deliverable that adapts to the data.

Three render architectures are supported, switchable per request via ``mode``:

* ``"catalog"`` — the AI picks from a curated set of RR-themed chart types; we
  render them with matplotlib (most reliable, no extra system deps).
* ``"charts"``  — the AI invents each visualization as a Vega-Lite spec; we
  inject the REAL computed data + an RR theme and render via vl-convert.
* ``"html"``    — the AI writes the whole report as HTML/CSS; rendered to PDF
  with WeasyPrint (max design freedom; degrades gracefully if libs absent).

Accuracy rule: the backend computes every number. For ``catalog``/``charts`` the
AI only chooses encodings, structure and prose; real rows/aggregates are
injected so charts and tables can never show wrong figures. Prose is grounded
by a ``facts`` dict the model is told to quote.

Public entrypoint: ``generate_ai_report(parsed_data, filters, mode, progress)``.
"""

from __future__ import annotations

import io
import json
import os
import re
from datetime import datetime

import requests
from dotenv import load_dotenv

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Reuse the existing RR brand system, data helpers, PDF chrome and matplotlib
# styling rather than duplicating them.
from pdf_export import (
    HOPPER_NAVY, HOPPER_NAVY_RGB, HOPPER_GOLD, HOPPER_GOLD_RGB,
    HOPPER_PRIMARY, HOPPER_PRIMARY_RGB, HOPPER_PRIMARY_LT, HOPPER_GREEN,
    HOPPER_GREEN_RGB, HOPPER_RED, HOPPER_RED_RGB, HOPPER_SLATE,
    HOPPER_TEXT_DARK, HOPPER_TEXT_MUTE, HOPPER_BG_LIGHT, HOPPER_BG_ALT,
    HOPPER_BORDER, WHITE, DONUT_PALETTE, VALUE_HEX, COUNT_HEX, GRID_KW,
    PIPELINE_ORDER,
    _val, _safe, _trunc, _fmtM_gbp, _fmtM_short, _pct, _hex_to_rgb,
    _apply_hopper_filters, _aggregate, _embed_fit, _png_size,
    _style_value_axis, _finish_fig, _draw_cover, HopperPDF,
    generate_hopper_detailed_pdf_report,
)

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
KIMI_MODEL = "moonshotai/kimi-k2.6"

MODES = ("catalog", "charts", "html")

# kimi-k2.6 is a slow thinking model. We STREAM with thinking on (keeps NVIDIA's
# gateway alive on long generations — avoids the 504 a long non-streaming request
# hits — and lets us report live progress). If streaming is blocked (some proxies
# silently buffer text/event-stream) or returns nothing, we fall back to a fast
# NON-streaming call with thinking disabled and a capped budget.
BLUEPRINT_MAX_TOKENS = 24000
HTML_MAX_TOKENS = 32000
THINKING_OFF = {"chat_template_kwargs": {"thinking": False}}

# Bound the report so a single generation can't run away on cost / pages.
MAX_SECTIONS = 8
MAX_VISUALS_PER_SECTION = 3
MAX_TABLES_PER_SECTION = 2
MAX_RAW_ROWS = 140          # opportunities sent to the model / injected into charts


# =============================================================================
# 1. ANALYTICS PACK  — exact, pre-computed data the AI designs around
# =============================================================================

def _num(v):
    """Round numeric values for compact JSON; pass through non-numbers."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    return round(f, 2)


def build_hopper_pack(parsed_data: dict, filters: dict = None) -> dict:
    """Build the structured analytics pack for a Global Hopper workbook.

    Returns ``{meta, facts, schemas, datasets}`` where every number is computed
    here (mirrors ``pdf_export.generate_hopper_*``) so the AI never invents data.
    """
    filters = filters or {}
    meta_in = parsed_data.get("metadata", {}) or {}
    all_opps = parsed_data.get("opportunities", []) or []
    filtered = _apply_hopper_filters(all_opps, filters)

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
    near_term = totals_year[2026] + totals_year[2027]
    long_term = totals_year[2028] + totals_year[2029] + totals_year[2030]

    # ---- aggregations (value = CRP term benefit; count = opportunity tally) ----
    def agg_table(key, label_field):
        crp = _aggregate(filtered, key)
        cnt = _aggregate(filtered, key, count=True)
        rows = []
        for k in sorted(crp, key=lambda x: crp[x], reverse=True):
            rows.append({label_field: k, "opportunities": cnt.get(k, 0),
                         "crp": _num(crp[k]), "pct_crp": _num(_pct_raw(crp[k], total_crp))})
        return rows

    # pipeline ordered by the canonical stage order, then any extras
    st_crp = _aggregate(filtered, "status")
    st_cnt = _aggregate(filtered, "status", count=True)
    ordered_stages = [s for s in PIPELINE_ORDER if s in st_cnt] + \
        sorted((s for s in st_cnt if s not in PIPELINE_ORDER),
               key=lambda s: st_crp.get(s, 0), reverse=True)
    by_status = [{"status": s, "opportunities": st_cnt.get(s, 0),
                  "crp": _num(st_crp.get(s, 0)), "pct_crp": _num(_pct_raw(st_crp.get(s, 0), total_crp))}
                 for s in ordered_stages]

    # full customer breakdown with profit columns
    cust = {}
    for r in filtered:
        c = str(r.get("customer", "")).strip() or "Unknown"
        s = cust.setdefault(c, {"opportunities": 0, "crp": 0.0, "profit_2026": 0.0,
                                "profit_2027": 0.0, "profit_2028_30": 0.0})
        s["opportunities"] += 1
        s["crp"] += _val(r.get("crp_term_benefit"))
        s["profit_2026"] += _val(r.get("profit_2026"))
        s["profit_2027"] += _val(r.get("profit_2027"))
        s["profit_2028_30"] += (_val(r.get("profit_2028")) + _val(r.get("profit_2029"))
                                + _val(r.get("profit_2030")))
    by_customer = [{"customer": c, **{k: _num(v) for k, v in d.items()},
                    "pct_crp": _num(_pct_raw(d["crp"], total_crp))}
                   for c, d in sorted(cust.items(), key=lambda x: x[1]["crp"], reverse=True)]

    annual_profit = [{"year": str(y), "profit": _num(totals_year[y]),
                      "pct": _num(_pct_raw(totals_year[y], sum(totals_year.values())))}
                     for y in (2026, 2027, 2028, 2029, 2030)]

    # concentration (Pareto) of CRP by opportunity
    cvals = sorted([_val(r.get("crp_term_benefit")) for r in filtered
                    if _val(r.get("crp_term_benefit")) > 0], reverse=True)
    concentration, run = [], 0.0
    cv_total = sum(cvals) or 1
    for i, v in enumerate(cvals, 1):
        run += v
        concentration.append({"rank": i, "crp": _num(v), "cumulative_pct": _num(run / cv_total * 100)})

    def opp_row(r):
        return {
            "region": _safe(r.get("region", "")),
            "customer": _safe(r.get("customer", "")),
            "engine_value_stream": _safe(r.get("engine_value_stream", r.get("top_level_evs", ""))),
            "restructure_type": _safe(r.get("restructure_type", "")),
            "status": _safe(r.get("status", "")),
            "maturity": _safe(r.get("maturity", "")),
            "onerous_type": _safe(r.get("onerous_type", "")),
            "vp_owner": _safe(r.get("vp_owner", "")),
            "crp_term_benefit": _num(_val(r.get("crp_term_benefit"))),
            "profit_2026": _num(_val(r.get("profit_2026"))),
            "profit_2027": _num(_val(r.get("profit_2027"))),
            "profit_2028": _num(_val(r.get("profit_2028"))),
            "profit_2029": _num(_val(r.get("profit_2029"))),
            "profit_2030": _num(_val(r.get("profit_2030"))),
            "initiative": _trunc(r.get("initiative", "") or "", 400),
        }

    opps_sorted = sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)
    global_sorted = sorted(all_opps, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)

    top_cust = by_customer[0] if by_customer else None
    top3 = sum(c["crp"] for c in by_customer[:3])
    LATE = {"Negotiations Started", "Negotations Started", "Negotiations Concluded",
            "Contracting Started", "Contracting Concluded"}
    late_crp = sum(st_crp.get(s, 0) for s in st_crp if s in LATE)

    facts = {
        "total_crp_term_benefit": _fmtM_gbp(total_crp),
        "total_opportunities": total_opps,
        "customers": len(customers),
        "regions": len(regions),
        "region_names": sorted(regions),
        "engine_value_streams": len(evss),
        "profit_2026": _fmtM_gbp(totals_year[2026]),
        "profit_2027": _fmtM_gbp(totals_year[2027]),
        "near_term_profit_2026_27": _fmtM_gbp(near_term),
        "long_term_profit_2028_30": _fmtM_gbp(long_term),
        "mature_opportunities": mature,
        "immature_opportunities": immature,
        "onerous_opportunities": onerous,
        "not_onerous_opportunities": not_onerous,
        "top_customer": top_cust["customer"] if top_cust else "-",
        "top_customer_crp": _fmtM_gbp(top_cust["crp"]) if top_cust else "-",
        "top_customer_share_of_crp": _pct(top_cust["crp"], total_crp) if top_cust else "0.0%",
        "top3_customers_share_of_crp": _pct(top3, total_crp),
        "late_stage_share_of_crp": _pct(late_crp, total_crp),
        "currency": "GBP (millions)",
    }

    schemas = {
        "opportunities": "rows of individual opportunities. fields: region, customer, "
                         "engine_value_stream, restructure_type, status, maturity, onerous_type, "
                         "vp_owner, crp_term_benefit (GBP m), profit_2026..profit_2030 (GBP m), initiative.",
        "by_customer": "fields: customer, opportunities (count), crp (GBP m), profit_2026, "
                       "profit_2027, profit_2028_30, pct_crp.",
        "by_region": "fields: region, opportunities, crp (GBP m), pct_crp.",
        "by_status": "pipeline stages in canonical order. fields: status, opportunities, crp, pct_crp.",
        "by_evs": "fields: engine_value_stream, opportunities, crp, pct_crp.",
        "by_restructure": "fields: restructure_type, opportunities, crp, pct_crp.",
        "by_maturity": "fields: maturity, opportunities, crp, pct_crp.",
        "by_onerous": "fields: onerous_type, opportunities, crp, pct_crp.",
        "by_vp_owner": "fields: vp_owner, opportunities, crp, pct_crp.",
        "annual_profit": "fields: year, profit (GBP m), pct.",
        "concentration": "Pareto of CRP by opportunity. fields: rank, crp, cumulative_pct.",
        "global_opportunities": "top opportunities ACROSS ALL REGIONS (ignores filters). same "
                                "fields as opportunities.",
    }

    datasets = {
        "opportunities": [opp_row(r) for r in opps_sorted[:MAX_RAW_ROWS]],
        "by_customer": by_customer,
        "by_region": agg_table("region", "region"),
        "by_status": by_status,
        "by_evs": agg_table("engine_value_stream", "engine_value_stream"),
        "by_restructure": agg_table("restructure_type", "restructure_type"),
        "by_maturity": agg_table("maturity", "maturity"),
        "by_onerous": agg_table("onerous_type", "onerous_type"),
        "by_vp_owner": agg_table("vp_owner", "vp_owner"),
        "annual_profit": annual_profit,
        "concentration": concentration,
        "global_opportunities": [opp_row(r) for r in global_sorted[:25]],
    }

    meta = {
        "report_type": "Global Commercial Optimisation Hopper",
        "filters_applied": {k: v for k, v in filters.items() if v},
        "generated": datetime.now().strftime("%d %B %Y"),
        "currency": "GBP (millions)",
        "filtered_opportunities": total_opps,
        "global_opportunities": len(all_opps),
        "source_file": meta_in.get("source_file", ""),
    }
    return {"meta": meta, "facts": facts, "schemas": schemas, "datasets": datasets}


def _pct_raw(part, whole):
    return (part / whole * 100.0) if whole else 0.0


# =============================================================================
# 2. RR BRAND SYSTEM  — brief for the model, Vega theme, print CSS
# =============================================================================

RR_BRAND_BRIEF = f"""\
ROLLS-ROYCE CIVIL AEROSPACE — REPORT BRAND SYSTEM (follow exactly)

Palette (hex):
  navy   {HOPPER_NAVY}   (headers, cover, table header band)
  gold   {HOPPER_GOLD}   (brand accent, section rules, VALUE/£ series)
  blue   {HOPPER_PRIMARY} (primary data, COUNT/volume series)
  blue-lt {HOPPER_PRIMARY_LT}
  green  {HOPPER_GREEN}   (positive / mature / not-onerous)
  amber  #c98a2e          (caution / immature)
  red    {HOPPER_RED}     (risk / onerous)
  slate  {HOPPER_SLATE}   (muted / reference lines)

Colour SEMANTICS (do not pick colours arbitrarily):
  - Monetary value (CRP term benefit, profit, £) -> GOLD.
  - Counts / volume (number of opportunities)     -> BLUE.
  - Categorical splits (region, restructure type) -> the blue-led categorical palette.
  - Maturity/risk: mature/positive -> GREEN, immature -> AMBER, onerous -> RED.

Tone: concise, analytical, board-level. British spelling. Currency is GBP millions
(write "GBP 12.3m"). Never invent numbers — use only the figures provided.
Typography: clean sans-serif. Layout: navy cover, thin gold section rules, generous
whitespace, "CONFIDENTIAL — FOR INTERNAL USE ONLY" footer."""

# vl-convert needs a resolvable font or it silently drops ALL text. matplotlib
# always ships DejaVu Sans, so we register its font directory and use that
# family — guaranteeing labels render on any platform (incl. Render/Linux).
_VEGA_FONT = "DejaVu Sans"
_VEGA_FONTS_REGISTERED = False


def _ensure_vega_fonts():
    global _VEGA_FONTS_REGISTERED
    if _VEGA_FONTS_REGISTERED:
        return
    try:
        import vl_convert as vlc
        import matplotlib
        ttf_dir = os.path.join(matplotlib.get_data_path(), "fonts", "ttf")
        if hasattr(vlc, "register_font_directory") and os.path.isdir(ttf_dir):
            vlc.register_font_directory(ttf_dir)
    except Exception:
        pass
    _VEGA_FONTS_REGISTERED = True


# Vega-Lite config deep-merged into every mode-"charts" spec to enforce brand.
RR_VEGA_THEME = {
    "background": "#ffffff",
    "font": _VEGA_FONT,
    "title": {"color": HOPPER_NAVY, "fontSize": 15, "fontWeight": "bold",
              "anchor": "start", "subtitleColor": HOPPER_TEXT_MUTE[0:1] and "#6b7280"},
    "axis": {"labelColor": "#374151", "titleColor": "#6b7280", "gridColor": "#c2c9d4",
             "gridOpacity": 0.55, "domainColor": "#e5e7eb", "tickColor": "#e5e7eb",
             "labelFontSize": 11, "titleFontSize": 12},
    "legend": {"labelColor": "#374151", "titleColor": HOPPER_NAVY, "labelFontSize": 11,
               "titleFontSize": 12},
    "view": {"stroke": "transparent"},
    "range": {
        "category": [HOPPER_PRIMARY, HOPPER_GOLD, HOPPER_PRIMARY_LT, HOPPER_GREEN,
                     "#c98a2e", HOPPER_SLATE, "#2a7f8e", HOPPER_RED],
        "heatmap": [HOPPER_PRIMARY_LT, HOPPER_NAVY],
        "ramp": [HOPPER_PRIMARY_LT, HOPPER_NAVY],
    },
    "bar": {"color": HOPPER_GOLD},
    "line": {"color": HOPPER_PRIMARY, "strokeWidth": 2.5},
    "point": {"color": HOPPER_PRIMARY, "filled": True},
    "arc": {"stroke": "#ffffff", "strokeWidth": 2},
}

RR_REPORT_CSS = f"""
@page {{ size: A4 landscape; margin: 14mm 12mm 16mm 12mm;
         @bottom-center {{ content: "ROLLS-ROYCE CIVIL AEROSPACE   |   Global Commercial Optimisation Hopper   |   Page " counter(page) "   |   Internal use only";
                           font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #6b7280; }} }}
* {{ box-sizing: border-box; }}
body {{ font-family: Helvetica, Arial, sans-serif; color: #111827; margin: 0; font-size: 10.5pt; line-height: 1.45; }}
h1, h2, h3 {{ color: {HOPPER_NAVY}; font-weight: 700; margin: 0 0 6px; }}
h2 {{ font-size: 15pt; border-bottom: 2px solid {HOPPER_GOLD}; padding-bottom: 3px; }}
h3 {{ font-size: 12pt; }}
.rr-cover {{ background: {HOPPER_NAVY}; color: #fff; padding: 60px 40px; page-break-after: always; height: 180mm; }}
.rr-cover .wordmark {{ font-size: 15pt; font-weight: 700; letter-spacing: 1px; }}
.rr-cover .tag {{ display: inline-block; background: {HOPPER_GOLD}; color: {HOPPER_NAVY}; font-weight: 700;
                  font-size: 8pt; padding: 3px 8px; margin: 14px 0; }}
.rr-cover h1 {{ color: #fff; font-size: 30pt; margin-top: 24px; }}
.rr-cover .subtitle {{ color: {HOPPER_GOLD}; font-size: 14pt; }}
.kpis {{ display: flex; gap: 8px; margin: 10px 0 14px; }}
.kpi {{ flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-top: 3px solid {HOPPER_GOLD};
        padding: 8px 10px; }}
.kpi .label {{ font-size: 7.5pt; text-transform: uppercase; color: #6b7280; }}
.kpi .value {{ font-size: 15pt; font-weight: 700; color: {HOPPER_NAVY}; }}
.kpi .sub {{ font-size: 7pt; color: #6b7280; }}
.kpi.blue {{ border-top-color: {HOPPER_PRIMARY}; }}
.kpi.green {{ border-top-color: {HOPPER_GREEN}; }}
.kpi.red {{ border-top-color: {HOPPER_RED}; }}
table {{ border-collapse: collapse; width: 100%; font-size: 8pt; margin: 6px 0 12px; }}
th {{ background: {HOPPER_NAVY}; color: #fff; text-align: left; padding: 4px 6px; text-transform: uppercase; font-size: 7.5pt; }}
td {{ padding: 3px 6px; border-bottom: 1px solid #eef0f3; }}
tr:nth-child(even) td {{ background: #f5f6f8; }}
.section {{ page-break-inside: avoid; margin-bottom: 14px; }}
.callout {{ border-left: 3px solid {HOPPER_GOLD}; padding: 4px 10px; color: #111827; margin: 8px 0; }}
svg {{ max-width: 100%; }}
"""


# =============================================================================
# 3. KIMI CLIENT (NVIDIA)  — raw text, streaming-accumulate, JSON repair
# =============================================================================

class _EmptyCompletion(RuntimeError):
    """Raised when the model streamed no answer `content` (e.g. a thinking model
    that spent its whole output budget on reasoning)."""


def call_kimi_raw(system_prompt: str, user_prompt: str, *, max_tokens: int = 16384,
                  temperature: float = 0.45, response_json: bool = False,
                  extra: dict = None, progress=None) -> str:
    """Call Kimi K2.6 via NVIDIA and return the raw assistant text.

    Primary: STREAMING with thinking on (matches ai_chat.call_nvidia; keeps the
    gateway alive on long generations and reports live progress via ``progress``).
    Fallback: if streaming is blocked/silent (some proxies buffer SSE) or yields
    no answer, retry NON-streaming with thinking disabled and a capped budget —
    fast, proxy-safe and 504-safe.
    """
    if not NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY is not set — cannot reach the Kimi endpoint.")

    base = {
        "model": KIMI_MODEL,
        "messages": [{"role": "system", "content": system_prompt},
                     {"role": "user", "content": user_prompt}],
        "temperature": temperature,
        "top_p": 1.0,
        "max_tokens": max_tokens,
    }
    if response_json:
        base["response_format"] = {"type": "json_object"}
    if extra:
        base.update(extra)

    def _headers(accept):
        return {"Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json", "Accept": accept}

    def _report(label):
        if progress:
            try:
                progress(label)
            except Exception:
                pass

    def _stream(pl):
        # Per-chunk read timeout: if NVIDIA streams nothing for this long (blocked
        # proxy, or a very long silent reasoning phase) we give up and fall back.
        resp = requests.post(NVIDIA_URL, headers=_headers("text/event-stream"),
                             json={**pl, "stream": True}, timeout=(15, 90), stream=True)
        if resp.status_code != 200:
            raise RuntimeError(f"NVIDIA API error ({resp.status_code}): {resp.text[:300]}")
        content, reasoning, fr = [], [], None
        clen = rlen = last = 0
        for line in resp.iter_lines():
            if not line:
                continue
            s = line.decode("utf-8").strip()
            if not s.startswith("data:"):
                continue
            body = s[5:].strip()
            if body == "[DONE]":
                break
            try:
                ch = (json.loads(body).get("choices") or [{}])[0]
            except json.JSONDecodeError:
                continue
            delta = ch.get("delta") or {}
            if delta.get("content"):
                content.append(delta["content"]); clen += len(delta["content"])
            if delta.get("reasoning_content"):
                reasoning.append(delta["reasoning_content"]); rlen += len(delta["reasoning_content"])
            if ch.get("finish_reason"):
                fr = ch["finish_reason"]
            if clen + rlen - last >= 1200:   # throttle progress updates
                last = clen + rlen
                _report(f"Writing report… {clen:,} chars" if clen else f"Thinking… {rlen:,} chars")
        text = "".join(content).strip()
        if not text:
            raise _EmptyCompletion(f"Kimi streamed no answer (finish_reason={fr}, {rlen} reasoning chars).")
        return text

    def _nonstream(pl):
        resp = requests.post(NVIDIA_URL, headers=_headers("application/json"),
                             json={**pl, "stream": False}, timeout=300)
        if resp.status_code != 200:
            raise RuntimeError(f"NVIDIA API error ({resp.status_code}): {resp.text[:300]}")
        choice = (resp.json().get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        text = (msg.get("content") or msg.get("text") or "").strip()
        if not text:
            rc = len(msg.get("reasoning_content") or "")
            raise _EmptyCompletion(f"Kimi returned no answer (finish_reason="
                                   f"{choice.get('finish_reason')}, {rc} reasoning chars).")
        return text

    # 1) streaming + thinking (the server/Render path)
    try:
        return _stream(base)
    except (_EmptyCompletion, requests.exceptions.RequestException, RuntimeError):
        pass
    # 2) fallback: non-streaming, thinking OFF, capped budget (fast, 504-safe)
    _report("Finalising report…")
    return _nonstream({**base, **THINKING_OFF, "max_tokens": min(max_tokens, 18000)})


def _extract_json(text: str) -> dict:
    """Best-effort: pull a JSON object out of a model response (handles code
    fences and leading/trailing prose)."""
    t = text.strip()
    m = re.search(r"```(?:json)?\s*\n(.*?)\n```", t, re.DOTALL)
    if m:
        t = m.group(1).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(t[start:end + 1])
    raise ValueError("No JSON object found in model response.")


# =============================================================================
# 4. BLUEPRINT SCHEMA + VALIDATION (modes catalog / charts)
# =============================================================================

CATALOG_CHARTS = {"bar", "hbar", "line", "area", "donut", "grouped_bar",
                  "stacked_bar", "scatter", "pareto"}
KPI_ACCENTS = {"gold", "blue", "green", "red"}


def _clamp_list(x, n):
    return x[:n] if isinstance(x, list) else []


def validate_blueprint(bp: dict, pack: dict, mode: str) -> dict:
    """Sanitise/clamp an AI report blueprint into a safe, renderable structure.
    Drops unknown dataset keys and chart types; bounds counts."""
    if not isinstance(bp, dict):
        raise ValueError("Blueprint is not an object.")
    ds_keys = set(pack["datasets"].keys())
    out = {
        "title": str(bp.get("title") or pack["meta"]["report_type"])[:140],
        "subtitle": str(bp.get("subtitle") or "AI-Generated Executive Report")[:160],
        "executive_summary": str(bp.get("executive_summary") or "")[:2400],
        "sections": [],
    }
    for sec in _clamp_list(bp.get("sections"), MAX_SECTIONS):
        if not isinstance(sec, dict):
            continue
        s = {
            "heading": str(sec.get("heading") or "Section")[:90],
            "narrative": str(sec.get("narrative") or "")[:2000],
            "kpis": [], "visuals": [], "tables": [],
        }
        for k in _clamp_list(sec.get("kpis"), 4):
            if not isinstance(k, dict):
                continue
            s["kpis"].append({
                "label": str(k.get("label") or "")[:34],
                "value": str(k.get("value") or "")[:24],
                "sub": str(k.get("sub") or "")[:40],
                "accent": k.get("accent") if k.get("accent") in KPI_ACCENTS else "gold",
            })
        for v in _clamp_list(sec.get("visuals"), MAX_VISUALS_PER_SECTION):
            if not isinstance(v, dict):
                continue
            ds = v.get("dataset")
            if ds not in ds_keys:
                continue
            if mode == "charts":
                spec = v.get("spec")
                if not isinstance(spec, dict):
                    continue
                s["visuals"].append({"type": "vega", "title": str(v.get("title") or "")[:90],
                                     "dataset": ds, "spec": spec, "caption": str(v.get("caption") or "")[:160]})
            else:  # catalog
                ch = v.get("chart")
                if ch not in CATALOG_CHARTS:
                    continue
                enc = v.get("encoding") if isinstance(v.get("encoding"), dict) else {}
                s["visuals"].append({"type": "chart", "chart": ch, "title": str(v.get("title") or "")[:90],
                                     "dataset": ds, "encoding": enc, "caption": str(v.get("caption") or "")[:160]})
        for t in _clamp_list(sec.get("tables"), MAX_TABLES_PER_SECTION):
            if not isinstance(t, dict) or t.get("dataset") not in ds_keys:
                continue
            cols = [str(c) for c in (t.get("columns") or []) if isinstance(c, (str,))][:8]
            s["tables"].append({"title": str(t.get("title") or "")[:90], "dataset": t["dataset"],
                               "columns": cols, "max_rows": min(int(t.get("max_rows") or 25), 40)})
        if s["kpis"] or s["visuals"] or s["tables"] or s["narrative"]:
            out["sections"].append(s)
    if not out["sections"]:
        raise ValueError("Blueprint has no renderable sections.")
    return out


# =============================================================================
# 5. PROMPTS
# =============================================================================

def _pack_for_prompt(pack: dict, slim: bool = False) -> str:
    datasets = pack["datasets"]
    if slim:
        # HTML mode renders aggregates/tables, not the full raw register — drop the
        # big row arrays to leave more of the budget for generation.
        datasets = {k: v for k, v in datasets.items()
                    if k not in ("opportunities", "global_opportunities")}
    schemas = {k: v for k, v in pack["schemas"].items() if k in datasets}
    return json.dumps({"meta": pack["meta"], "facts": pack["facts"],
                       "schemas": schemas, "datasets": datasets}, ensure_ascii=False)


def _blueprint_prompt(pack: dict, mode: str) -> tuple:
    viz_rules = (
        'Each visual is {"type":"vega","title","dataset","spec","caption"} where "spec" is a '
        'Vega-Lite v5 spec WITHOUT a "data" property (we inject the dataset rows). Reference the '
        "dataset\'s exact field names. Use Vega-Lite transforms if you need to aggregate the raw "
        '"opportunities" rows. Follow the colour semantics.'
        if mode == "charts" else
        'Each visual is {"type":"chart","chart","title","dataset","encoding","caption"}. "chart" is '
        'one of: bar, hbar, line, area, donut, grouped_bar, stacked_bar, scatter, pareto. "encoding" '
        'is {"x":<field>,"y":<field>,"series":<field|null>,"agg":"sum"|"count"|"mean"|null,'
        '"sort":"desc"|"asc"|null,"top_n":<int|null>,"value_fmt":"gbp_m"|"int"|"pct"|null}. '
        'Most datasets are already aggregated (use agg=null and map x/y to their columns); use the raw '
        '"opportunities" dataset with an agg when you need a custom cross-tab.'
    )
    system = (
        "You are the lead data-visualisation designer and analyst for Rolls-Royce Civil Aerospace. "
        "You design a bespoke, board-level PDF report from the supplied analytics pack.\n\n"
        + RR_BRAND_BRIEF +
        "\n\nReturn ONLY a single JSON object (no prose, no code fence) with this shape:\n"
        '{"title","subtitle","executive_summary",'
        '"sections":[{"heading","narrative","kpis":[{"label","value","sub","accent"}],'
        '"visuals":[...],"tables":[{"title","dataset","columns":[...],"max_rows"}]}]}\n'
        + viz_rules +
        f"\n\nRULES: Use ONLY datasets/fields from the pack. Quote figures ONLY from facts/datasets — "
        f"never invent numbers. accent is one of gold|blue|green|red. Produce {3}-{MAX_SECTIONS} "
        f"sections telling a coherent executive story (overview, value drivers, pipeline, risk, "
        f"opportunities). At most {MAX_VISUALS_PER_SECTION} visuals per section. Make it genuinely "
        f"insightful and analytical, not a data dump."
    )
    user = ("Design the report from this analytics pack. Respond with the JSON object only.\n\n"
            + _pack_for_prompt(pack))
    return system, user


def _html_prompt(pack: dict) -> tuple:
    system = (
        "You are the lead report designer for Rolls-Royce Civil Aerospace. You produce a complete, "
        "print-ready, single-file HTML document (A4 LANDSCAPE) for an executive PDF.\n\n"
        + RR_BRAND_BRIEF +
        "\n\nOUTPUT RULES:\n"
        "- Return ONLY a full HTML document (<!DOCTYPE html> ... </html>). No markdown, no code fence.\n"
        "- Inline <style> only. NO <script>, NO external URLs, NO remote fonts/images.\n"
        "- A class set is available from a stylesheet we inject: .rr-cover/.wordmark/.tag/.subtitle, "
        ".kpis/.kpi(.blue/.green/.red) with .label/.value/.sub, h2/h3, table/th/td, .section, .callout. "
        "Use them for brand consistency; you may add minor inline styles.\n"
        "- Draw charts as INLINE SVG (bar/line/donut etc.), themed with the palette. Keep SVGs simple "
        "and sized to fit the page width.\n"
        "- Start with a <div class='rr-cover'> cover (wordmark 'ROLLS-ROYCE', tag 'GLOBAL HOPPER — AI', "
        "title, subtitle). Then sections with headings, KPI rows, charts, tables and short insights.\n"
        "- Use ONLY the supplied figures; never invent numbers. Currency GBP millions.\n"
        "- Keep it focused: 4-7 sections. Output the HTML immediately and directly — do NOT "
        "write any analysis, planning or commentary before the document."
    )
    user = ("Build the report HTML from this analytics pack. Output ONLY the HTML document, "
            "starting with <!DOCTYPE html> — no preamble.\n\n" + _pack_for_prompt(pack, slim=True))
    return system, user


# =============================================================================
# 6. RENDER — catalog (matplotlib) & charts (vega/vl-convert)
# =============================================================================

def _fmt_fn(value_fmt):
    if value_fmt == "gbp_m":
        return lambda v: f"£{v:,.0f}m"
    if value_fmt == "pct":
        return lambda v: f"{v:.1f}%"
    if value_fmt == "int":
        return lambda v: f"{int(round(v))}"
    return lambda v: (f"£{v:,.0f}m" if abs(v) >= 1 else f"£{v:,.1f}m")


def _aggregate_for_chart(rows, x, y, series, agg):
    """Return (categories, series_names, matrix[series][cat]) aggregating rows."""
    from collections import OrderedDict
    cats = OrderedDict()
    snames = OrderedDict()
    data = {}
    counts = {}
    for r in rows:
        cx = str(r.get(x, "")) if x else ""
        if not cx:
            continue
        cats.setdefault(cx, True)
        sv = str(r.get(series, "")) if series else "__single__"
        snames.setdefault(sv, True)
        key = (sv, cx)
        yval = _val(r.get(y)) if (y and agg != "count") else 1.0
        data[key] = data.get(key, 0.0) + (1.0 if agg == "count" else yval)
        counts[key] = counts.get(key, 0) + 1
    if agg == "mean":
        for k in data:
            data[k] = data[k] / max(1, counts[k])
    return list(cats.keys()), list(snames.keys()), data


def _catalog_chart(chart, rows, enc, title):
    """Render a curated chart type to a PNG buffer using the RR matplotlib style."""
    x = enc.get("x"); y = enc.get("y"); series = enc.get("series")
    agg = enc.get("agg"); sort = enc.get("sort"); top_n = enc.get("top_n")
    fmt = _fmt_fn(enc.get("value_fmt") or ("int" if agg == "count" else "gbp_m"))

    # Build (labels, value) — aggregate if asked, else read columns directly.
    if agg in ("sum", "count", "mean"):
        cats, snames, mat = _aggregate_for_chart(rows, x, y, series, agg)
    else:
        cats = [str(r.get(x, "")) for r in rows if str(r.get(x, "")) != ""]
        snames = ["__single__"]
        mat = {("__single__", str(r.get(x, ""))): _val(r.get(y)) for r in rows if str(r.get(x, "")) != ""}

    multi = len(snames) > 1 and snames != ["__single__"]

    if not multi:
        pairs = [(c, mat.get(("__single__", c), mat.get((snames[0], c), 0.0))) for c in cats]
        if sort in ("desc", "asc") or (sort is None and chart in ("bar", "hbar", "pareto")):
            pairs.sort(key=lambda p: p[1], reverse=(sort != "asc"))
        if top_n:
            pairs = pairs[:int(top_n)]
        labels = [p[0] for p in pairs]
        vals = [p[1] for p in pairs]

    is_value = (enc.get("value_fmt") != "int" and agg != "count")
    main_color = VALUE_HEX if is_value else COUNT_HEX

    fig = None
    if chart in ("bar", "area", "line", "pareto") and not multi:
        fig, ax = plt.subplots(figsize=(13, 4.4), dpi=160)
        if chart == "bar" or chart == "pareto":
            _style_value_axis(ax)
            bars = ax.bar(range(len(labels)), vals, color=main_color, width=0.7, zorder=2)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels([_wrap(str(l)) for l in labels], fontsize=8, rotation=20,
                               ha="right", color="#374151")
            for b, v in zip(bars, vals):
                if v:
                    ax.text(b.get_x() + b.get_width() / 2, b.get_height(), fmt(v), ha="center",
                            va="bottom", fontsize=8, color=HOPPER_NAVY, weight="bold")
            ax.margins(y=0.18)
            if chart == "pareto":
                tot = sum(vals) or 1
                cum, run = [], 0.0
                for v in vals:
                    run += v; cum.append(run / tot * 100)
                ax2 = ax.twinx()
                ax2.plot(range(len(labels)), cum, color=HOPPER_PRIMARY, lw=2, marker="o", ms=3)
                ax2.set_ylim(0, 106); ax2.set_yticks([0, 25, 50, 75, 100])
                ax2.set_yticklabels(["0%", "25%", "50%", "75%", "100%"])
                ax2.tick_params(colors=HOPPER_PRIMARY, labelsize=8, length=0)
                for sp in ("top",):
                    ax2.spines[sp].set_visible(False)
        else:  # line / area
            ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
            ax.spines["left"].set_color("#e5e7eb"); ax.spines["bottom"].set_color("#e5e7eb")
            ax.grid(True, axis="y", **GRID_KW); ax.set_axisbelow(True)
            ax.tick_params(colors="#374151", labelsize=9, length=0)
            ax.plot(range(len(labels)), vals, color=main_color, lw=2.5, marker="o", ms=4)
            if chart == "area":
                ax.fill_between(range(len(labels)), vals, color=main_color, alpha=0.18)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels([_wrap(str(l)) for l in labels], fontsize=8, color="#374151")
            for i, v in enumerate(vals):
                ax.text(i, v, fmt(v), ha="center", va="bottom", fontsize=8, color=HOPPER_NAVY, weight="bold")
            ax.margins(y=0.18)
        ax.set_title(title, loc="left", pad=8, color=HOPPER_NAVY, fontsize=12, fontweight="bold")

    elif chart == "hbar" and not multi:
        pairs2 = list(zip(labels, vals))[::-1]
        fig, ax = plt.subplots(figsize=(13, max(3.6, min(7.0, 0.42 * len(pairs2) + 1.6))), dpi=160)
        ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#e5e7eb"); ax.spines["bottom"].set_color("#e5e7eb")
        ax.grid(True, axis="x", **GRID_KW); ax.set_axisbelow(True)
        ax.tick_params(colors="#374151", labelsize=9.5, length=0)
        names = [str(l)[:30] for l, _ in pairs2]
        vv = [v for _, v in pairs2]
        bars = ax.barh(names, vv, color=main_color, height=0.66)
        span = max(vv) if vv else 0
        for b, v in zip(bars, vv):
            ax.text(b.get_width() + span * 0.005, b.get_y() + b.get_height() / 2, "  " + fmt(v),
                    va="center", ha="left", fontsize=9, color=HOPPER_NAVY, weight="bold")
        ax.margins(x=0.14)
        ax.set_title(title, loc="left", pad=10, color=HOPPER_NAVY, fontsize=12, fontweight="bold")

    elif chart == "donut" and not multi:
        pp = [(l, v) for l, v in zip(labels, vals) if v and v > 0]
        if not pp:
            return None
        fig, ax = plt.subplots(figsize=(11, 4.6), dpi=160)
        tot = sum(v for _, v in pp)
        colors = [DONUT_PALETTE[i % len(DONUT_PALETTE)] for i in range(len(pp))]
        wedges, _t, _a = ax.pie([v for _, v in pp], autopct=lambda p: f"{p:.0f}%" if p >= 4 else "",
                                colors=colors, startangle=90, pctdistance=0.78,
                                textprops={"color": "white", "fontsize": 9, "weight": "bold"},
                                wedgeprops={"width": 0.42, "edgecolor": "white", "linewidth": 2})
        ax.legend(wedges, [f"{str(l)[:24]} ({v / tot * 100:.0f}%)" for l, v in pp],
                  loc="center left", bbox_to_anchor=(0.98, 0.5), fontsize=9.5, frameon=False)
        ax.set_title(title, loc="left", pad=12, color=HOPPER_NAVY, fontsize=12, fontweight="bold")
        ax.axis("equal")

    elif chart in ("grouped_bar", "stacked_bar") or multi:
        import numpy as np
        cat_list = cats
        if top_n:
            cat_list = cat_list[:int(top_n)]
        ser = [s for s in snames if s != "__single__"] or snames
        fig, ax = plt.subplots(figsize=(13, 4.6), dpi=160)
        _style_value_axis(ax)
        xpos = np.arange(len(cat_list))
        palette = DONUT_PALETTE
        if chart == "stacked_bar":
            bottom = np.zeros(len(cat_list))
            for i, s in enumerate(ser):
                vals_s = np.array([mat.get((s, c), 0.0) for c in cat_list])
                ax.bar(xpos, vals_s, bottom=bottom, color=palette[i % len(palette)],
                       width=0.7, label=str(s)[:20])
                bottom += vals_s
        else:
            w = 0.8 / max(1, len(ser))
            for i, s in enumerate(ser):
                vals_s = [mat.get((s, c), 0.0) for c in cat_list]
                ax.bar(xpos + i * w - 0.4 + w / 2, vals_s, width=w,
                       color=palette[i % len(palette)], label=str(s)[:20])
        ax.set_xticks(xpos)
        ax.set_xticklabels([_wrap(str(c)) for c in cat_list], fontsize=8, rotation=20, ha="right",
                           color="#374151")
        ax.legend(fontsize=8, frameon=False, ncol=min(4, len(ser)))
        ax.margins(y=0.18)
        ax.set_title(title, loc="left", pad=8, color=HOPPER_NAVY, fontsize=12, fontweight="bold")

    elif chart == "scatter":
        fig, ax = plt.subplots(figsize=(13, 4.6), dpi=160)
        ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#e5e7eb"); ax.spines["bottom"].set_color("#e5e7eb")
        ax.grid(True, **GRID_KW); ax.set_axisbelow(True)
        ax.tick_params(colors="#374151", labelsize=9, length=0)
        xs = [_val(r.get(x)) for r in rows]
        ys = [_val(r.get(y)) for r in rows]
        ax.scatter(xs, ys, color=HOPPER_PRIMARY, alpha=0.7, s=36, edgecolor="white", linewidth=0.5)
        ax.set_xlabel(str(x), fontsize=9, color="#6b7280"); ax.set_ylabel(str(y), fontsize=9, color="#6b7280")
        ax.set_title(title, loc="left", pad=8, color=HOPPER_NAVY, fontsize=12, fontweight="bold")

    if fig is None:
        return None
    return _finish_fig(fig, pad=1.6)


def _wrap(s):
    return s.replace(" ", "\n", 1) if (" " in s and len(s) > 12) else s


def _render_vega(spec: dict, rows: list, title: str):
    """Inject real data + RR theme into an AI Vega-Lite spec and render to PNG.
    Returns a BytesIO or None on failure (caller falls back)."""
    import vl_convert as vlc
    _ensure_vega_fonts()
    spec = json.loads(json.dumps(spec))  # deep copy
    spec.setdefault("$schema", "https://vega.github.io/schema/vega-lite/v5.json")
    spec["data"] = {"values": rows}
    spec.pop("datasets", None)
    # Drop transforms that could load external data.
    if isinstance(spec.get("transform"), list):
        spec["transform"] = [t for t in spec["transform"]
                             if isinstance(t, dict) and "lookup" not in t and "url" not in str(t)]
    if title and "title" not in spec:
        spec["title"] = title
    # Enforce a page-friendly size.
    w = spec.get("width")
    if not isinstance(w, (int, float)) or w > 1400 or w < 200:
        spec["width"] = 1000
    h = spec.get("height")
    if not isinstance(h, (int, float)) or h > 700 or h < 120:
        spec["height"] = 420
    # Deep-merge the RR theme config (brand wins over AI config).
    cfg = spec.get("config") if isinstance(spec.get("config"), dict) else {}
    spec["config"] = _deep_merge(cfg, RR_VEGA_THEME)
    png = vlc.vegalite_to_png(vl_spec=json.dumps(spec), scale=2.0)
    return io.BytesIO(png)


def _deep_merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


# =============================================================================
# 7. PDF ASSEMBLY (modes catalog / charts)
# =============================================================================

class AIReportPDF(HopperPDF):
    """Landscape RR report; reuses HopperPDF chrome (cover/headers/footer/cards/
    tables) and overrides only the footer label."""

    def footer(self):
        if self.page_no() == getattr(self, "_cover_page_no", -1):
            return
        self.set_y(-14)
        self.set_draw_color(*HOPPER_BORDER)
        self.line(self.MARGIN_L, self.get_y(), self.PAGE_W - self.MARGIN_R, self.get_y())
        self.set_y(-11)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(0, 6, f"ROLLS-ROYCE CIVIL AEROSPACE   |   Global Commercial Optimisation Hopper "
                        f"(AI Report)   |   Page {self.page_no()}   |   Internal use only", 0, 0, "C")


_ACCENT_RGB = {"gold": HOPPER_GOLD_RGB, "blue": HOPPER_PRIMARY_RGB,
               "green": HOPPER_GREEN_RGB, "red": HOPPER_RED_RGB}


def _table_columns(rows, requested):
    """Resolve which columns to show: requested (filtered to those present) or
    all keys of the first row."""
    if not rows:
        return []
    keys = list(rows[0].keys())
    cols = [c for c in requested if c in keys] if requested else keys
    return cols[:8] or keys[:8]


def _assemble_pdf(blueprint: dict, pack: dict, mode: str, progress=None) -> bytes:
    pdf = AIReportPDF()
    avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
    meta = pack["meta"]
    cover_meta = []
    fa = meta.get("filters_applied") or {}
    for k, v in fa.items():
        cover_meta.append(f"Filtered {k}: {v}")
    cover_meta += [
        f"Generated: {meta['generated']}",
        f"Opportunities: {meta['filtered_opportunities']}   |   Currency: {meta['currency']}",
        "AI-generated report (Kimi K2.6) - design dynamic, figures verified",
    ]
    _draw_cover(pdf, blueprint["title"], blueprint["subtitle"], "GLOBAL HOPPER - AI", cover_meta)

    # Executive summary page
    if blueprint.get("executive_summary"):
        pdf.add_page()
        pdf._exec_header("Executive Summary", "AI analysis")
        pdf._narrative(blueprint["executive_summary"])

    for si, sec in enumerate(blueprint["sections"]):
        if progress:
            progress(f"Building section {si + 1}/{len(blueprint['sections'])}…")
        pdf.add_page()
        pdf._page_header(sec["heading"])
        if sec.get("kpis"):
            cards = [(k["label"], k["value"], k.get("sub") or "", _ACCENT_RGB.get(k["accent"], HOPPER_GOLD_RGB))
                     for k in sec["kpis"]]
            pdf._kpi_row_top(cards)
        if sec.get("narrative"):
            pdf._narrative(sec["narrative"])
        for vis in sec.get("visuals", []):
            buf = _render_visual(vis, pack, mode)
            if buf is None:
                continue
            if pdf.get_y() > pdf.PAGE_H - 70:
                pdf.add_page()
                pdf._page_header(sec["heading"] + " (continued)")
            max_h = (pdf.PAGE_H - 20) - pdf.get_y() - 6
            _embed_fit(pdf, buf, pdf.MARGIN_L, avail_w, max(60, max_h))
            if vis.get("caption"):
                pdf.set_x(pdf.MARGIN_L)
                pdf.set_font("Helvetica", "I", 7.5)
                pdf.set_text_color(*HOPPER_TEXT_MUTE)
                pdf.multi_cell(avail_w, 4, _safe(vis["caption"]))
            pdf.ln(2)
        for tbl in sec.get("tables", []):
            rows = pack["datasets"].get(tbl["dataset"], [])
            if not rows:
                continue
            cols = _table_columns(rows, tbl.get("columns"))
            if not cols:
                continue
            if pdf.get_y() > pdf.PAGE_H - 50:
                pdf.add_page()
                pdf._page_header(sec["heading"] + " (continued)")
            if tbl.get("title"):
                pdf._section_header(tbl["title"])
            widths = _even_widths(cols, avail_w, rows)
            headers = [c.replace("_", " ").title() for c in cols]
            right = {i for i, c in enumerate(cols) if _is_numeric_col(rows, c)}
            body = [[_fmt_cell(r.get(c)) for c in cols] for r in rows[:tbl["max_rows"]]]
            pdf._table(headers, body, widths, right_align_idx=right, max_rows=tbl["max_rows"])

    out = bytes(pdf.output())
    return out


def _even_widths(cols, avail_w, rows):
    """Give text-heavy columns more room; numeric columns less."""
    weights = []
    for c in cols:
        weights.append(1.0 if _is_numeric_col(rows, c) else 2.2)
    tot = sum(weights) or 1
    return [avail_w * w / tot for w in weights]


def _is_numeric_col(rows, col):
    for r in rows[:8]:
        v = r.get(col)
        if isinstance(v, (int, float)):
            return True
        if isinstance(v, str) and v.replace(",", "").replace(".", "").replace("-", "").isdigit():
            return True
    return False


def _fmt_cell(v):
    if isinstance(v, float):
        return f"{v:,.1f}"
    if isinstance(v, int):
        return str(v)
    return _trunc(str(v if v is not None else ""), 60)


def _render_visual(vis, pack, mode):
    rows = pack["datasets"].get(vis["dataset"], [])
    if not rows:
        return None
    try:
        if vis["type"] == "vega":
            try:
                return _render_vega(vis["spec"], rows, vis.get("title", ""))
            except Exception:
                return _catalog_fallback(rows, vis.get("title", ""))
        else:
            buf = _catalog_chart(vis["chart"], rows, vis.get("encoding", {}), vis.get("title", ""))
            return buf or _catalog_fallback(rows, vis.get("title", ""))
    except Exception:
        return None


def _catalog_fallback(rows, title):
    """Last-resort chart: bar of the first categorical vs first numeric column."""
    if not rows:
        return None
    keys = list(rows[0].keys())
    cat = next((k for k in keys if not _is_numeric_col(rows, k)), keys[0])
    num = next((k for k in keys if _is_numeric_col(rows, k)), None)
    if num is None:
        return None
    enc = {"x": cat, "y": num, "sort": "desc", "top_n": 12,
           "value_fmt": "gbp_m" if "crp" in num or "profit" in num else "int"}
    try:
        return _catalog_chart("bar", rows, enc, title or f"{num} by {cat}")
    except Exception:
        return None


# =============================================================================
# 8. MODE B — AI HTML -> WeasyPrint
# =============================================================================

def _sanitize_html(html: str) -> str:
    """Strip scripts and external resource references; keep inline styles + data URIs."""
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*')", "", html, flags=re.IGNORECASE)
    # neutralise external src/href (allow data: and #anchors)
    def _strip_ext(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if url.startswith("data:") or url.startswith("#"):
            return m.group(0)
        return f'{attr}={q}#{q}'
    html = re.sub(r'(src|href)\s*=\s*(["\'])(.*?)\2', _strip_ext, html, flags=re.IGNORECASE)
    html = re.sub(r"@import[^;]+;", "", html, flags=re.IGNORECASE)
    return html


def _weasyprint_available() -> bool:
    try:
        import weasyprint  # noqa: F401
        return True
    except Exception:
        return False


def _render_html_pdf(html: str) -> bytes:
    """Render AI HTML to PDF via WeasyPrint (lazy import; raises if unavailable)."""
    from weasyprint import HTML, CSS  # lazy — only mode B needs it
    clean = _sanitize_html(html)
    if "<style" not in clean.lower():
        clean = clean.replace("</head>", f"<style>{RR_REPORT_CSS}</style></head>", 1) \
            if "</head>" in clean.lower() else f"<style>{RR_REPORT_CSS}</style>" + clean
    return HTML(string=clean).write_pdf(stylesheets=[CSS(string=RR_REPORT_CSS)])


# =============================================================================
# 9. PUBLIC ENTRYPOINT
# =============================================================================

def generate_ai_report(parsed_data: dict, filters: dict = None, mode: str = "catalog",
                       progress=None):
    """Generate an AI-designed PDF. Returns ``(pdf_bytes, filename, note)`` where
    ``note`` is None on success or a string when the deterministic fallback was used.

    ``mode`` ∈ {"catalog", "charts", "html"}. On any hard failure we fall back to
    the deterministic detailed report so the user always gets a PDF."""
    mode = mode if mode in MODES else "catalog"
    filters = filters or {}

    def _say(msg):
        if progress:
            try:
                progress(msg)
            except Exception:
                pass

    try:
        _say("Analysing data…")
        pack = build_hopper_pack(parsed_data, filters)

        if mode == "html":
            if not _weasyprint_available():
                raise RuntimeError("HTML mode requires WeasyPrint, which is not installed on "
                                   "this server. Use the Charts or Catalog mode.")
            _say("Designing report (HTML)…")
            system, user = _html_prompt(pack)
            html = call_kimi_raw(system, user, max_tokens=HTML_MAX_TOKENS, temperature=0.5,
                                 progress=progress)
            # strip an accidental code fence
            m = re.search(r"```(?:html)?\s*\n(.*?)\n```", html, re.DOTALL)
            if m:
                html = m.group(1)
            _say("Rendering PDF…")
            pdf_bytes = _render_html_pdf(html)
        else:
            _say("Designing report…")
            system, user = _blueprint_prompt(pack, mode)
            raw = call_kimi_raw(system, user, max_tokens=BLUEPRINT_MAX_TOKENS, temperature=0.45,
                                response_json=True, progress=progress)
            try:
                bp = validate_blueprint(_extract_json(raw), pack, mode)
            except Exception as e1:
                _say("Refining report…")
                repair = (f"Your previous output could not be used ({e1}). Return ONLY a valid "
                          f"JSON object matching the required schema. Use only datasets/fields "
                          f"from the pack.\n\n{user}")
                raw2 = call_kimi_raw(system, repair, max_tokens=BLUEPRINT_MAX_TOKENS, temperature=0.3,
                                     response_json=True, progress=progress)
                bp = validate_blueprint(_extract_json(raw2), pack, mode)
            _say("Rendering charts & building PDF…")
            pdf_bytes = _assemble_pdf(bp, pack, mode, progress=progress)

        if not pdf_bytes:
            raise RuntimeError("Empty PDF produced.")
        fname = _filename(parsed_data, mode, fallback=False)
        return pdf_bytes, fname, None

    except Exception as e:
        # Deterministic fallback — always deliver a usable PDF.
        try:
            _say("AI unavailable — generating deterministic report…")
            pdf_bytes = generate_hopper_detailed_pdf_report(parsed_data, filters=filters)
            return pdf_bytes, _filename(parsed_data, mode, fallback=True), \
                f"AI report unavailable ({e}); deterministic detailed report provided instead."
        except Exception as e2:
            raise RuntimeError(f"AI report failed ({e}) and fallback failed ({e2}).")


def _filename(parsed_data, mode, fallback):
    base = (parsed_data.get("metadata", {}) or {}).get("source_file", "") or "Global_Hopper"
    base = re.sub(r"\.[^.]+$", "", base).replace(" ", "_") or "Global_Hopper"
    if fallback:
        return f"{base}_AI_fallback.pdf"
    return f"{base}_AI_{mode}.pdf"
