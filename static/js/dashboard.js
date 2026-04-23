// ============================================================
// dashboard.js — combined charts + visualizer
// Auto-merged from charts.js + visualizer.js
// ============================================================

(function () {
    'use strict';

    // ---------- RRUtil (shared helpers) ----------
    (function () {
        const RRUtil = {
            escapeHtml(str) {
                if (str == null) return '';
                const s = String(str);
                // Use replace chain — safe for template-literal interpolation
                return s.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;');
            },
            escapeAttr(str) {
                if (str == null) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            },
            /**
             * Trigger a browser download of rows as CSV.
             * rows = array of arrays | columns = array of header strings.
             */
            downloadCSV(filename, rows, columns) {
                const esc = (v) => {
                    if (v == null) return '';
                    const s = String(v);
                    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
                        return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const lines = [];
                if (columns && columns.length) lines.push(columns.map(esc).join(','));
                (rows || []).forEach(r => {
                    lines.push((r || []).map(esc).join(','));
                });
                const csv = '﻿' + lines.join('\r\n'); // BOM for Excel
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'export.csv';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
            },
        };
        window.RRUtil = RRUtil;
    })();

    // ---------- RRCharts (from charts.js) ----------
    (function () {
        /**
         * Rolls-Royce SOA Dashboard — Charts Module
         * ApexCharts wrapper functions with RR-themed styling.
         */

        const RRCharts = (() => {
            'use strict';

            // ─── Constants ───
            const CHART_COLORS = ['#10069F', '#1565C0', '#5E35B1', '#00838F', '#C62828', '#EF6C00', '#2E7D32', '#6A1B9A'];
            const AGING_COLORS = {
                'Current': '#059669', '1-30 Days': '#34D399', '31-60 Days': '#D97706',
                '61-90 Days': '#EA580C', '91-180 Days': '#DC2626', '180+ Days': '#991B1B', 'Unknown': '#94A3B8'
            };
            const AGING_ORDER = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '91-180 Days', '180+ Days', 'Unknown'];

            const FONT_FAMILY = "'Plus Jakarta Sans', 'DM Sans', sans-serif";
            const MONO_FONT = "'JetBrains Mono', monospace";

            // Store chart instances for cleanup
            const _instances = {};

            function _destroy(id) {
                if (_instances[id]) {
                    _instances[id].destroy();
                    delete _instances[id];
                }
            }

            function _formatCurrency(val) {
                if (val == null || isNaN(val)) return '—';
                const neg = val < 0;
                const abs = Math.abs(val);
                let str;
                if (abs >= 1_000_000) str = '$' + (abs / 1_000_000).toFixed(2) + 'M';
                else if (abs >= 1_000) str = '$' + (abs / 1_000).toFixed(1) + 'K';
                else str = '$' + abs.toFixed(2);
                return neg ? '-' + str : str;
            }

            // ─── Base Theme ───
            const baseTheme = {
                chart: {
                    fontFamily: FONT_FAMILY,
                    toolbar: { show: false },
                    animations: {
                        enabled: true,
                        easing: 'easeinout',
                        speed: 800,
                        dynamicAnimation: { enabled: true, speed: 350 }
                    },
                    dropShadow: { enabled: false }
                },
                grid: {
                    borderColor: '#E4E7F0',
                    strokeDashArray: 3,
                    xaxis: { lines: { show: false } },
                    yaxis: { lines: { show: true } },
                    padding: { top: 0, right: 0, bottom: 0, left: 0 }
                },
                tooltip: {
                    theme: 'light',
                    style: { fontSize: '12px', fontFamily: FONT_FAMILY },
                    y: { formatter: (val) => _formatCurrency(val) }
                },
                states: {
                    hover: { filter: { type: 'darken', value: 0.1 } },
                    active: { filter: { type: 'darken', value: 0.2 } }
                },
                dataLabels: {
                    style: { fontSize: '11px', fontFamily: FONT_FAMILY, fontWeight: 600 }
                },
            };

            // ═══════════════════════════════════════════
            // DONUT CHART — Section Breakdown
            // ═══════════════════════════════════════════

            function renderDonut(elementId, labels, values) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const total = values.reduce((a, b) => a + b, 0);
                const options = {
                    ...baseTheme,
                    series: values,
                    chart: {
                        ...baseTheme.chart,
                        type: 'donut',
                        height: 310,
                    },
                    labels: labels,
                    colors: CHART_COLORS.slice(0, labels.length),
                    plotOptions: {
                        pie: {
                            donut: {
                                size: '62%',
                                labels: {
                                    show: true,
                                    name: { show: true, fontSize: '13px', fontWeight: 600, color: '#475569', offsetY: -8 },
                                    value: { show: true, fontSize: '18px', fontWeight: 700, fontFamily: MONO_FONT, color: '#0F172A', offsetY: 4, formatter: (val) => _formatCurrency(parseFloat(val)) },
                                    total: { show: true, label: 'Total', fontSize: '12px', fontWeight: 600, color: '#94A3B8', formatter: () => _formatCurrency(total) }
                                }
                            },
                            expandOnClick: true,
                        }
                    },
                    stroke: { width: 3, colors: ['#FFFFFF'] },
                    legend: { position: 'bottom', fontSize: '12px', fontFamily: FONT_FAMILY, fontWeight: 500, labels: { colors: '#475569' }, markers: { width: 10, height: 10, radius: 3 }, itemMargin: { horizontal: 8, vertical: 4 } },
                    dataLabels: { enabled: false },
                    tooltip: { y: { formatter: (val) => _formatCurrency(val) } },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // GROUPED BAR — Charges vs Credits
            // ═══════════════════════════════════════════

            function renderChargesCredits(elementId, sections, charges, credits) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const options = {
                    ...baseTheme,
                    series: [
                        { name: 'Charges', data: charges },
                        { name: 'Credits', data: credits.map(v => Math.abs(v)) },
                    ],
                    chart: { ...baseTheme.chart, type: 'bar', height: 310 },
                    colors: ['#10069F', '#059669'],
                    plotOptions: {
                        bar: { horizontal: false, columnWidth: '55%', borderRadius: 4, borderRadiusApplication: 'end', dataLabels: { position: 'top' } }
                    },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), offsetY: -20, style: { fontSize: '10px', fontFamily: MONO_FONT, fontWeight: 600, colors: ['#475569'] } },
                    xaxis: { categories: sections, labels: { style: { fontSize: '11px', fontFamily: FONT_FAMILY, colors: '#475569' }, rotate: -35, trim: true, maxHeight: 80 }, axisBorder: { show: false }, axisTicks: { show: false } },
                    yaxis: { labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    legend: { position: 'top', fontSize: '12px', fontFamily: FONT_FAMILY, fontWeight: 500, labels: { colors: '#475569' }, markers: { width: 10, height: 10, radius: 3 } },
                    tooltip: { shared: true, intersect: false },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // AGING BAR — Color-coded aging buckets
            // ═══════════════════════════════════════════

            function renderAgingBar(elementId, agingData) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                // Sort by aging order
                const sorted = AGING_ORDER.filter(b => agingData[b] != null).map(b => ({ bucket: b, amount: agingData[b] || 0 }));
                const buckets = sorted.map(d => d.bucket);
                const amounts = sorted.map(d => d.amount);
                const colors = sorted.map(d => AGING_COLORS[d.bucket] || '#94A3B8');

                const options = {
                    ...baseTheme,
                    series: [{ name: 'Amount', data: amounts }],
                    chart: { ...baseTheme.chart, type: 'bar', height: 310 },
                    colors: colors,
                    plotOptions: {
                        bar: { horizontal: false, columnWidth: '60%', borderRadius: 5, borderRadiusApplication: 'end', distributed: true, dataLabels: { position: 'top' } }
                    },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), offsetY: -20, style: { fontSize: '10px', fontFamily: MONO_FONT, fontWeight: 600, colors: ['#475569'] } },
                    xaxis: { categories: buckets, labels: { style: { fontSize: '11px', fontFamily: FONT_FAMILY, colors: '#475569' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                    yaxis: { labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    legend: { show: false },
                    tooltip: { y: { formatter: (val) => _formatCurrency(val) } },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // BILATERAL BAR — Customer vs RR
            // ═══════════════════════════════════════════

            function renderBilateralBar(elementId, customerOwes, rrOwes) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const options = {
                    ...baseTheme,
                    series: [{ data: [customerOwes, Math.abs(rrOwes)] }],
                    chart: { ...baseTheme.chart, type: 'bar', height: 310 },
                    colors: ['#10069F', '#059669'],
                    plotOptions: {
                        bar: { horizontal: false, columnWidth: '45%', borderRadius: 6, borderRadiusApplication: 'end', distributed: true, dataLabels: { position: 'top' } }
                    },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), offsetY: -20, style: { fontSize: '12px', fontFamily: MONO_FONT, fontWeight: 700, colors: ['#0F172A'] } },
                    xaxis: { categories: ['Customer → RR', 'RR → Customer'], labels: { style: { fontSize: '12px', fontFamily: FONT_FAMILY, fontWeight: 600, colors: '#475569' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                    yaxis: { labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    legend: { show: false },
                    tooltip: { y: { formatter: (val) => _formatCurrency(val) } },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // HORIZONTAL BAR — Net Balance by Section
            // ═══════════════════════════════════════════

            function renderNetBalanceBar(elementId, sections, amounts) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const colors = amounts.map(a => a > 0 ? '#10069F' : '#059669');

                const options = {
                    ...baseTheme,
                    series: [{ name: 'Net Amount', data: amounts }],
                    chart: { ...baseTheme.chart, type: 'bar', height: Math.max(310, sections.length * 40 + 60) },
                    colors: ['#10069F'],
                    plotOptions: {
                        bar: { horizontal: true, barHeight: '55%', borderRadius: 4, distributed: true, dataLabels: { position: 'top' } }
                    },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), textAnchor: 'start', offsetX: 6, style: { fontSize: '10px', fontFamily: MONO_FONT, fontWeight: 600, colors: ['#475569'] } },
                    xaxis: { labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    yaxis: { labels: { style: { fontSize: '12px', fontFamily: FONT_FAMILY, fontWeight: 500, colors: '#475569' }, maxWidth: 150 } },
                    legend: { show: false },
                    tooltip: { y: { formatter: (val) => _formatCurrency(val) } },
                };

                // Override categories after construction
                options.xaxis.categories = undefined;
                options.series = [{ name: 'Net Amount', data: sections.map((s, i) => ({ x: s, y: amounts[i], fillColor: colors[i] })) }];

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // PIE — Status Distribution (per-section)
            // ═══════════════════════════════════════════

            function renderStatusPie(elementId, labels, values) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const options = {
                    ...baseTheme,
                    series: values,
                    chart: { ...baseTheme.chart, type: 'pie', height: 280 },
                    labels: labels,
                    colors: CHART_COLORS.slice(0, labels.length),
                    stroke: { width: 2, colors: ['#FFFFFF'] },
                    legend: { position: 'bottom', fontSize: '11px', fontFamily: FONT_FAMILY, fontWeight: 500, labels: { colors: '#475569' }, markers: { width: 8, height: 8, radius: 2 }, itemMargin: { horizontal: 6, vertical: 2 } },
                    dataLabels: { enabled: true, formatter: (val) => val.toFixed(0) + '%', style: { fontSize: '11px', fontWeight: 600, fontFamily: FONT_FAMILY } },
                    tooltip: { y: { formatter: (val) => val + ' items' } },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // HORIZONTAL BAR — Top Items
            // ═══════════════════════════════════════════

            function renderTopItemsBar(elementId, labels, amounts) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const options = {
                    ...baseTheme,
                    series: [{ name: 'Amount', data: amounts }],
                    chart: { ...baseTheme.chart, type: 'bar', height: Math.max(280, labels.length * 35 + 60) },
                    colors: ['#10069F'],
                    plotOptions: {
                        bar: { horizontal: true, barHeight: '55%', borderRadius: 4, dataLabels: { position: 'top' } }
                    },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), textAnchor: 'start', offsetX: 6, style: { fontSize: '10px', fontFamily: MONO_FONT, fontWeight: 600, colors: ['#475569'] } },
                    xaxis: { categories: labels, labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    yaxis: { labels: { style: { fontSize: '11px', fontFamily: FONT_FAMILY, fontWeight: 500, colors: '#475569' }, maxWidth: 180, trim: true } },
                    legend: { show: false },
                    tooltip: { y: { formatter: (val) => _formatCurrency(val) } },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ═══════════════════════════════════════════
            // SIMPLE BAR — Comparison per source
            // ═══════════════════════════════════════════

            function renderSimpleBar(elementId, categories, values, color) {
                _destroy(elementId);
                const el = document.getElementById(elementId);
                if (!el) return;
                el.innerHTML = '';

                const options = {
                    ...baseTheme,
                    series: [{ name: 'Amount', data: values }],
                    chart: { ...baseTheme.chart, type: 'bar', height: 260 },
                    colors: [color || '#10069F'],
                    plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 4, borderRadiusApplication: 'end' } },
                    dataLabels: { enabled: true, formatter: (val) => _formatCurrency(val), offsetY: -18, style: { fontSize: '10px', fontFamily: MONO_FONT, fontWeight: 600, colors: ['#475569'] } },
                    xaxis: { categories: categories, labels: { style: { fontSize: '11px', fontFamily: FONT_FAMILY, colors: '#475569' }, rotate: -25, trim: true } },
                    yaxis: { labels: { style: { fontSize: '11px', fontFamily: MONO_FONT, colors: '#94A3B8' }, formatter: (val) => _formatCurrency(val) } },
                    legend: { show: false },
                };

                const chart = new ApexCharts(el, options);
                chart.render();
                _instances[elementId] = chart;
                return chart;
            }

            // ─── Cleanup ───
            function destroyAll() {
                // Destroy all RRCharts-managed instances
                Object.keys(_instances).forEach(id => _destroy(id));
                // Also destroy all raw ApexCharts instances registered via register()
                _extRegistry.forEach((chart, id) => {
                    try { chart.destroy(); } catch (e) { /* noop */ }
                });
                _extRegistry.clear();
            }

            // Raw registry — any renderer that creates ApexCharts directly can
            // call RRCharts.register(id, chart) so destroyAll() cleans them up.
            const _extRegistry = new Map();
            function register(id, chart) {
                if (!id || !chart) return;
                const prev = _extRegistry.get(id);
                if (prev && prev !== chart) {
                    try { prev.destroy(); } catch (e) { /* noop */ }
                }
                _extRegistry.set(id, chart);
            }
            function unregister(id) {
                const c = _extRegistry.get(id);
                if (c) {
                    try { c.destroy(); } catch (e) { /* noop */ }
                    _extRegistry.delete(id);
                }
            }

            // ─── Public API ───
            return {
                renderDonut,
                renderChargesCredits,
                renderAgingBar,
                renderBilateralBar,
                renderNetBalanceBar,
                renderStatusPie,
                renderTopItemsBar,
                renderSimpleBar,
                destroyAll,
                register,
                unregister,
                _instances: _extRegistry, // expose for introspection
                formatCurrency: _formatCurrency,
                CHART_COLORS,
                AGING_COLORS,
                AGING_ORDER,
            };
        })();

        // Expose RRCharts to window (so app.js and visualizer can reach it)
        window.RRCharts = RRCharts;
    })();

    // ---------- RRVisualizer (from visualizer.js) ----------
    (function () {
        /**
         * Rolls-Royce Data Visualizer — Universal File Type Renderer
         * ===========================================================
         * Detects file_type from parsed data and renders the appropriate
         * visualization: SOA, INVOICE_LIST, OPPORTUNITY_TRACKER, SHOP_VISIT,
         * SVRG_MASTER, or generic fallback.
         *
         * Follows the frontend-design SKILL.md aesthetic: bold, distinctive,
         * premium Rolls-Royce visual language with dynamic charts and micro-animations.
         */

        window.RRVisualizer = (() => {
            'use strict';

            const $ = (id) => document.getElementById(id);

            // ─── Color palette ───
            const COLORS = {
                navy: '#10069F',
                dark: '#0C0033',
                blue2: '#1565C0',
                purple: '#5E35B1',
                teal: '#00838F',
                red: '#C62828',
                orange: '#EF6C00',
                green: '#2E7D32',
                gold: '#B8860B',
                amber: '#F9A825',
                silver: '#C0C0C0',
            };

            const FILE_TYPE_META = {
                SOA: { label: 'Statement of Account', icon: 'file-text', color: '#10069F', bg: 'rgba(16,6,159,0.08)' },
                INVOICE_LIST: { label: 'Invoice List', icon: 'receipt', color: '#1565C0', bg: 'rgba(21,101,192,0.08)' },
                OPPORTUNITY_TRACKER: { label: 'Opportunity Tracker', icon: 'trending-up', color: '#2E7D32', bg: 'rgba(46,125,50,0.08)' },
                SHOP_VISIT_HISTORY: { label: 'Shop Visit History', icon: 'wrench', color: '#EF6C00', bg: 'rgba(239,108,0,0.08)' },
                SVRG_MASTER: { label: 'SVRG Master', icon: 'shield-check', color: '#5E35B1', bg: 'rgba(94,53,177,0.08)' },
                GLOBAL_HOPPER: { label: 'Global Hopper', icon: 'globe', color: '#00C875', bg: 'rgba(0,200,117,0.08)' },
                UNKNOWN: { label: 'Data File', icon: 'file-spreadsheet', color: '#9E9E9E', bg: 'rgba(158,158,158,0.08)' },
                ERROR: { label: 'Error', icon: 'alert-triangle', color: '#C62828', bg: 'rgba(198,40,40,0.08)' },
            };

            // ═══════════════════════════════════════════════════
            // PUBLIC API
            // ═══════════════════════════════════════════════════

            // Single filter-state registry keyed by file_type.
            // Renderers push their latest filter object here so PDF export can
            // read the active global filters via getActiveGlobalFilters().
            const _filterState = {};
            function _registerFilterState(fileType, filters) {
                _filterState[fileType] = filters || {};
            }
            function getActiveGlobalFilters() {
                // Return a shallow copy so consumers cannot mutate internal state.
                const out = {};
                Object.keys(_filterState).forEach(k => { out[k] = { ...(_filterState[k] || {}) }; });
                return out;
            }

            // Current file type being rendered — used by PDF modal to swap sections.
            let _currentFileType = null;
            function getCurrentFileType() { return _currentFileType; }

            /**
             * Reset any dark-theme leaks onto the dashboard-body / main-content
             * parents. Renderers that want dark theme re-apply it themselves.
             */
            function _resetParentBackgrounds(container) {
                try {
                    let parent = container ? container.parentElement : null;
                    while (parent) {
                        if (parent.classList && (parent.classList.contains('dashboard-body') || parent.classList.contains('main-content'))) {
                            parent.style.background = '';
                        }
                        parent = parent.parentElement;
                    }
                    // Belt-and-braces: clear on direct selectors too
                    document.querySelectorAll('.dashboard-body, .main-content').forEach(el => {
                        if (el.style && el.style.background && /#03002E|rgb\(3,\s*0,\s*46\)/i.test(el.style.background)) {
                            el.style.background = '';
                        }
                    });
                } catch (e) { /* noop */ }
            }

            /**
             * Detect file types present in the uploaded data and render the
             * appropriate visualizer. Called by app.js after upload.
             * @param {Object} filesData - upload results keyed by filename
             * @param {HTMLElement} container - target container element
             * @param {Object} [opts] - { viewMode: 'standard' | 'executive' }
             */
            function renderVisualizer(filesData, container, opts) {
                if (!container) return;
                opts = opts || {};

                // P0: destroy any previously-rendered ApexCharts instances to
                // prevent memory leaks on filter change / file swap.
                if (window.RRCharts && typeof window.RRCharts.destroyAll === 'function') {
                    try { window.RRCharts.destroyAll(); } catch (e) { /* noop */ }
                }

                // P0: reset dark theme leaked onto parent containers by the
                // previous Opp-Tracker / Global-Hopper render.
                _resetParentBackgrounds(container);

                // Inject executive-mode CSS once (idempotent)
                if (!document.getElementById('viz-executive-mode-style')) {
                    const styleEl = document.createElement('style');
                    styleEl.id = 'viz-executive-mode-style';
                    styleEl.textContent = `
                        .viz-executive-mode .opp-global-filter-bar,
                        .viz-executive-mode .viz-global-filter-bar,
                        .viz-executive-mode .opp-table-filter-bar,
                        .viz-executive-mode .viz-csv-btn { display: none !important; }
                        .viz-executive-mode .viz-data-table tr:nth-child(n+11) { display: none; }
                        .viz-executive-mode .viz-chart-grid:nth-of-type(n+3) { display: none; }
                        .viz-executive-mode .svrg-panels .svrg-panel:not([data-tab="engines"]) { display: none !important; }
                        .viz-executive-mode .svrg-tabs { display: none !important; }
                        @keyframes viz-spin { to { transform: rotate(360deg); } }
                    `;
                    document.head.appendChild(styleEl);
                }

                // Apply / remove the executive-mode hook class
                try {
                    if (opts.viewMode === 'executive') container.classList.add('viz-executive-mode');
                    else container.classList.remove('viz-executive-mode');
                } catch (e) { /* noop */ }

                const fileEntries = Object.entries(filesData);
                if (fileEntries.length === 0) return;

                // Determine which file types are present
                const fileTypes = {};
                fileEntries.forEach(([fname, data]) => {
                    const ft = data.file_type || 'UNKNOWN';
                    if (!fileTypes[ft]) fileTypes[ft] = [];
                    fileTypes[ft].push({ name: fname, data });
                });

                const typeKeys = Object.keys(fileTypes);

                // If we have SOA data AND it has legacy format (sections as object with rows), delegate to old views
                if (typeKeys.length === 1 && typeKeys[0] === 'SOA' && _isLegacySOA(fileEntries[0][1])) {
                    return false; // Signal: let the old app.js handle it
                }

                // Build the visualizer UI
                let html = '';

                // File type badges bar
                html += '<div class="viz-type-bar">';
                fileEntries.forEach(([fname, data]) => {
                    const ft = data.file_type || 'UNKNOWN';
                    const meta = FILE_TYPE_META[ft] || FILE_TYPE_META.UNKNOWN;
                    html += `<div class="viz-file-badge" style="--badge-color:${meta.color};--badge-bg:${meta.bg}">
                <i data-lucide="${meta.icon}"></i>
                <span class="viz-file-badge-type">${meta.label}</span>
                <span class="viz-file-badge-name" title="${fname}">${_truncate(fname, 30)}</span>
            </div>`;
                });
                html += '</div>';

                // Render each file type's visualization
                typeKeys.forEach(ft => {
                    const files = fileTypes[ft];
                    files.forEach(({ name, data }, idx) => {
                        const containerId = `viz-${ft}-${idx}`;
                        html += `<div class="viz-section" id="${containerId}"></div>`;
                    });
                });

                // Cross-reference panel (if multiple files)
                if (fileEntries.length > 1) {
                    html += '<div class="viz-section" id="viz-crossref"></div>';
                }

                container.innerHTML = html;

                // Remember the "primary" file type for PDF modal / filter inspection.
                // Priority: first non-UNKNOWN/ERROR type wins.
                _currentFileType = typeKeys.find(t => t !== 'UNKNOWN' && t !== 'ERROR') || typeKeys[0] || null;
                try { if (window.RRApp) window.RRApp._currentFileType = _currentFileType; } catch (e) { /* noop */ }

                // Now render each section
                typeKeys.forEach(ft => {
                    const files = fileTypes[ft];
                    files.forEach(({ name, data }, idx) => {
                        const el = $(`viz-${ft}-${idx}`);
                        if (!el) return;
                        try {
                            switch (ft) {
                                case 'SOA': _renderSOA(el, data, name); break;
                                case 'INVOICE_LIST': _renderInvoiceList(el, data, name); break;
                                case 'OPPORTUNITY_TRACKER': _renderOpportunityTracker(el, data, name); break;
                                case 'GLOBAL_HOPPER': _renderGlobalHopper(el, data, name); break;
                                case 'SHOP_VISIT_HISTORY': _renderShopVisit(el, data, name); break;
                                case 'SHOP_VISIT': _renderShopVisit(el, data, name); break;
                                case 'SVRG_MASTER': _renderSVRG(el, data, name); break;
                                case 'ERROR': _renderError(el, data, name); break;
                                default: _renderUnknown(el, data, name); break;
                            }
                        } catch (e) {
                            _renderErrorState(el, `Failed to render ${name}: ${e.message}`);
                        }
                    });
                });

                // Cross-ref panel
                if (fileEntries.length > 1) {
                    _renderCrossRefHints($('viz-crossref'), filesData);
                }

                // Refresh Lucide icons
                if (window.lucide) lucide.createIcons();

                // Make tables sortable
                _makeTablesSortable(container);

                // Animate AFTER charts have rendered (charts use setTimeout 100ms)
                setTimeout(() => _animateVizEntrance(), 250);

                return true; // Signal: we handled the rendering
            }

            /**
             * Check if parsed SOA data is in the old format (legacy parser)
             */
            function _isLegacySOA(data) {
                // Old parser returns sections as OrderedDict with 'rows' arrays
                // New parser returns sections as array of objects with 'items'
                if (data.sections && !Array.isArray(data.sections) && data.all_items) {
                    return true;
                }
                return false;
            }

            /**
             * Get file type info for a given type string
             */
            function getFileTypeMeta(ft) {
                return FILE_TYPE_META[ft] || FILE_TYPE_META.UNKNOWN;
            }

            // ═══════════════════════════════════════════════════
            // HELPERS
            // ═══════════════════════════════════════════════════

            function _fmtCurrency(val, currency = 'USD') {
                if (val == null || isNaN(val)) return '—';
                const sign = val < 0 ? '-' : '';
                const abs = Math.abs(val);
                if (abs >= 1e6) return `${sign}${currency} ${(abs / 1e6).toFixed(2)}M`;
                if (abs >= 1e3) return `${sign}${currency} ${(abs / 1e3).toFixed(1)}K`;
                return `${sign}${currency} ${abs.toFixed(2)}`;
            }

            function _fmtNumber(val) {
                if (val == null || isNaN(val)) return '—';
                return Number(val).toLocaleString();
            }

            function _fmtPct(val) {
                if (val == null || isNaN(val)) return '—';
                return `${(val * 100).toFixed(1)}%`;
            }

            function _truncate(str, max) {
                if (!str) return '';
                return str.length > max ? str.slice(0, max - 3) + '…' : str;
            }

            function _safe(val, fallback = '—') {
                return (val != null && val !== '' && val !== 'null' && val !== 'None') ? val : fallback;
            }

            function _kpiCard(label, value, opts = {}) {
                const colorClass = opts.colorClass || '';
                const icon = opts.icon || '';
                const subtitle = opts.subtitle || '';
                return `<div class="viz-kpi-card ${colorClass}">
            ${icon ? `<div class="viz-kpi-icon"><i data-lucide="${icon}"></i></div>` : ''}
            <div class="viz-kpi-label">${label}</div>
            <div class="viz-kpi-value">${value}</div>
            ${subtitle ? `<div class="viz-kpi-subtitle">${subtitle}</div>` : ''}
        </div>`;
            }

            function _sectionHeader(title, icon, opts = {}) {
                const badge = opts.badge || '';
                return `<div class="viz-section-header">
            <div class="viz-section-header-pill">
                <i data-lucide="${icon}"></i> ${title}
            </div>
            ${badge ? `<span class="viz-section-badge" style="background:${opts.badgeColor || COLORS.navy}">${badge}</span>` : ''}
        </div>`;
            }

            function _dataTable(headers, rows, opts = {}) {
                const _escH = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const maxRows = opts.maxRows || 200;
                const tableId = opts.id || '';
                let html = `<div class="viz-table-wrap"><table class="viz-data-table" ${tableId ? `id="${tableId}"` : ''}>`;
                html += '<thead><tr>';
                headers.forEach(h => { html += `<th class="viz-sortable-th">${_escH(h)} <span class="viz-sort-icon"></span></th>`; });
                html += '</tr></thead><tbody>';
                rows.slice(0, maxRows).forEach(row => {
                    html += '<tr>';
                    row.forEach((cell, ci) => {
                        const cls = typeof cell === 'number' ? (cell < 0 ? 'neg' : 'pos') : '';
                        const formatted = typeof cell === 'number' ? _fmtNumber(cell) : _escH(_safe(cell));
                        const rawVal = cell === null || cell === undefined ? '' : String(cell).replace(/"/g, '&quot;');
                        html += `<td class="${cls}" data-raw="${rawVal}">${formatted}</td>`;
                    });
                    html += '</tr>';
                });
                html += '</tbody></table>';
                if (rows.length > maxRows) {
                    html += `<div class="viz-table-overflow">Showing ${maxRows} of ${rows.length} rows</div>`;
                }
                html += '</div>';
                return html;
            }

            // ═══════════════════════════════════════════════════
            // EMPTY / ERROR / LOADING STATE HELPERS
            // ═══════════════════════════════════════════════════

            /**
             * Empty state: renders a friendly message + optional reset button
             * into the given element. Used by each renderer's filter callback
             * when the filtered result is empty.
             */
            function _renderEmptyState(container, opts = {}) {
                if (!container) return;
                const msg = opts.message || 'No results match the current filters.';
                const hint = opts.hint || 'Reset filters to see all data.';
                const resetId = `viz-empty-reset-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                const showReset = opts.showReset !== false;
                container.innerHTML = `<div class="viz-empty-state" style="padding:48px 32px;text-align:center;border:1px dashed rgba(100,100,200,0.25);border-radius:12px;margin:24px 0;background:rgba(240,242,248,0.4)">
                    <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(67,97,238,0.08);margin-bottom:12px;">
                        <i data-lucide="inbox" style="width:28px;height:28px;color:#4361EE"></i>
                    </div>
                    <div style="font-size:15px;font-weight:600;color:#1a1a3a;margin-bottom:6px">${(window.RRUtil ? window.RRUtil.escapeHtml(msg) : msg)}</div>
                    <div style="font-size:13px;color:#6b6b8a;margin-bottom:14px">${(window.RRUtil ? window.RRUtil.escapeHtml(hint) : hint)}</div>
                    ${showReset ? `<button type="button" class="viz-empty-reset-btn" id="${resetId}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid #4361EE;background:#fff;color:#4361EE;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
                        <i data-lucide="rotate-ccw" style="width:14px;height:14px"></i> Reset Filters
                    </button>` : ''}
                </div>`;
                if (window.lucide) window.lucide.createIcons();
                if (opts.onReset && showReset) {
                    const btn = document.getElementById(resetId);
                    if (btn) btn.addEventListener('click', opts.onReset);
                }
            }

            function _renderErrorState(container, message) {
                if (!container) return;
                const safe = window.RRUtil ? window.RRUtil.escapeHtml(message) : message;
                container.innerHTML = `<div class="viz-error-card" style="padding:16px 20px;border:1px solid rgba(198,40,40,0.3);background:rgba(198,40,40,0.06);border-radius:10px;margin:16px 0;color:#7a1515"><i data-lucide="alert-triangle" style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"></i> ${safe}</div>`;
                if (window.lucide) window.lucide.createIcons();
            }

            function _renderLoadingState(container, label) {
                if (!container) return;
                const t = label || 'Loading…';
                container.innerHTML = `<div class="viz-loading-state" style="padding:48px;text-align:center;color:#6b6b8a"><i data-lucide="loader-2" class="viz-spin" style="width:24px;height:24px;animation:viz-spin 1s linear infinite"></i><div style="margin-top:8px">${window.RRUtil ? window.RRUtil.escapeHtml(t) : t}</div></div>`;
                if (window.lucide) window.lucide.createIcons();
            }

            /**
             * Wrap an ApexCharts render call: create instance, register it with
             * RRCharts so destroyAll() can clean it up later, return the chart.
             */
            function _renderChart(id, options) {
                const el = document.getElementById(id);
                if (!el) return null;
                try {
                    // Ensure chart.id is set so ApexCharts.getChartByID works too
                    options = options || {};
                    options.chart = Object.assign({ id: id }, options.chart || {});
                    const chart = new ApexCharts(el, options);
                    chart.render();
                    if (window.RRCharts && typeof window.RRCharts.register === 'function') {
                        window.RRCharts.register(id, chart);
                    }
                    return chart;
                } catch (e) {
                    console.warn('[RRVisualizer] chart render failed for', id, e);
                    return null;
                }
            }

            /**
             * Download-CSV button HTML. Pair with _wireCSVButton(id, fn).
             */
            function _csvButton(id, label) {
                return `<button type="button" class="viz-csv-btn" id="${id}" title="Download as CSV"
                    style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid rgba(67,97,238,0.3);background:#fff;color:#4361EE;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;margin-left:8px">
                    <i data-lucide="download" style="width:12px;height:12px"></i> ${label || 'CSV'}
                </button>`;
            }
            function _wireCSVButton(id, filename, headers, getRows) {
                const btn = document.getElementById(id);
                if (!btn) return;
                btn.addEventListener('click', () => {
                    const rows = typeof getRows === 'function' ? getRows() : getRows;
                    if (window.RRUtil && window.RRUtil.downloadCSV) {
                        window.RRUtil.downloadCSV(filename, rows, headers);
                    }
                });
            }

            // ═══════════════════════════════════════════════════
            // GLOBAL FILTER BAR (used at top of each visualizer)
            // ═══════════════════════════════════════════════════

            /**
             * Build a global filter bar for filtering all data in a renderer.
             * @param {Object} filterConfig - { fields: [{key, label, values}], onFilter: callback }
             * @returns {string} HTML string for the filter bar
             */
            function _globalFilterBar(filterConfig) {
                const barId = `gfb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                let html = `<div class="opp-global-filter-bar" id="${barId}">`;
                html += '<div class="opp-gfb-left"><i data-lucide="sliders-horizontal" style="width:16px;height:16px;color:var(--opp-accent-blue,#4361EE)"></i><span class="opp-gfb-title">Filters</span></div>';
                html += '<div class="opp-gfb-fields">';
                filterConfig.fields.forEach(f => {
                    if (f.type === 'threshold') {
                        html += `<div class="opp-gfb-group">
                    <label class="opp-gfb-label">${f.label}</label>
                    <input type="number" class="opp-gfb-input" data-filter-key="${f.key}" placeholder="${f.placeholder || '0'}" step="any" />
                </div>`;
                    } else {
                        html += `<div class="opp-gfb-group">
                    <label class="opp-gfb-label">${f.label}</label>
                    <select class="opp-gfb-select" data-filter-key="${f.key}" ${f.multiple ? 'multiple' : ''}>
                        <option value="">All</option>
                        ${(f.values || []).map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">${_truncate(String(v), 30)}</option>`).join('')}
                    </select>
                </div>`;
                        // Cascade container for projects
                        if (f.cascade) {
                            html += `<div class="opp-gfb-group opp-gfb-cascade" data-cascade-parent="${f.key}" data-cascade-key="${f.cascade.key}" style="display:none">
                        <label class="opp-gfb-label">${f.cascade.label}</label>
                        <select class="opp-gfb-select" data-filter-key="${f.cascade.key}">
                            <option value="">All</option>
                        </select>
                    </div>`;
                        }
                    }
                });
                html += '</div>';
                html += `<button class="opp-gfb-reset" data-bar-id="${barId}"><i data-lucide="rotate-ccw" style="width:14px;height:14px"></i> Reset</button>`;
                html += '</div>';
                return { html, barId };
            }

            /**
             * Wire up filter bar event listeners. Call after DOM insertion.
             * @param {string} barId - The filter bar container ID
             * @param {Object} cascadeData - { parentKey: { parentValue: [childValues] } }
             * @param {Function} onFilter - Called with the current filter state object
             */
            function _wireGlobalFilterBar(barId, cascadeData, onFilter) {
                const bar = $(barId);
                if (!bar) return;

                const getFilters = () => {
                    const filters = {};
                    bar.querySelectorAll('.opp-gfb-select, .opp-gfb-input').forEach(el => {
                        const key = el.dataset.filterKey;
                        if (el.tagName === 'INPUT') {
                            const val = parseFloat(el.value);
                            if (!isNaN(val)) filters[key] = val;
                        } else {
                            const val = el.value;
                            if (val) filters[key] = val;
                        }
                    });
                    return filters;
                };

                // Change handler
                bar.querySelectorAll('.opp-gfb-select, .opp-gfb-input').forEach(el => {
                    el.addEventListener('change', () => {
                        // Handle cascading
                        const key = el.dataset.filterKey;
                        if (cascadeData && cascadeData[key]) {
                            const cascadeEl = bar.querySelector(`[data-cascade-parent="${key}"]`);
                            if (cascadeEl) {
                                const selectedVal = el.value;
                                const childSelect = cascadeEl.querySelector('select');
                                if (selectedVal && cascadeData[key][selectedVal]) {
                                    const childValues = cascadeData[key][selectedVal];
                                    childSelect.innerHTML = '<option value="">All</option>' +
                                        childValues.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">${_truncate(String(v), 30)}</option>`).join('');
                                    cascadeEl.style.display = '';
                                } else {
                                    childSelect.innerHTML = '<option value="">All</option>';
                                    cascadeEl.style.display = 'none';
                                }
                            }
                        }
                        onFilter(getFilters());
                    });
                    // Also trigger on keyup for number inputs (debounced)
                    if (el.tagName === 'INPUT') {
                        let debounce = null;
                        el.addEventListener('input', () => {
                            clearTimeout(debounce);
                            debounce = setTimeout(() => onFilter(getFilters()), 400);
                        });
                    }
                });

                // Reset
                bar.querySelector('.opp-gfb-reset')?.addEventListener('click', () => {
                    bar.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    bar.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    bar.querySelectorAll('.opp-gfb-cascade').forEach(c => { c.style.display = 'none'; });
                    onFilter({});
                });
            }

            /**
             * Build a data table with inline filter dropdowns above it.
             * @param {string[]} headers - Table column headers
             * @param {Array[]} allRows - Full rows array (not yet filtered)
             * @param {Object[]} filterFields - [{col: colIndex, label: 'Customer'}]
             * @param {Object} opts - Options passed to _dataTable
             * @returns {{ html: string, containerId: string }}
             */
            function _filterableDataTable(headers, allRows, filterFields, opts = {}) {
                const cid = `fdt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

                // Extract unique values for each filter column
                const filterMeta = filterFields.map(f => {
                    const vals = [...new Set(allRows.map(r => r[f.col]).filter(v => v != null && v !== ''))].sort();
                    return { ...f, values: vals };
                });

                let html = `<div class="opp-table-filter-bar" id="${cid}">`;
                filterMeta.forEach(fm => {
                    html += `<div class="opp-tbl-filter-group">
                <label>${fm.label}</label>
                <select data-filter-col="${fm.col}">
                    <option value="">All</option>
                    ${fm.values.map(v => `<option value="${String(v).replace(/"/g, '&quot;')}">${_truncate(String(v), 28)}</option>`).join('')}
                </select>
            </div>`;
                });
                html += '</div>';
                html += `<div id="${cid}-table">${_dataTable(headers, allRows, opts)}</div>`;
                return { html, containerId: cid };
            }

            /**
             * Wire up a filterable data table. Call after DOM insertion.
             */
            function _wireFilterableDataTable(containerId, headers, allRows, opts, onCountChange) {
                const bar = $(containerId);
                if (!bar) return;
                const tableDiv = $(`${containerId}-table`);
                if (!tableDiv) return;

                const applyFilters = () => {
                    const activeFilters = {};
                    bar.querySelectorAll('select[data-filter-col]').forEach(sel => {
                        const col = parseInt(sel.dataset.filterCol);
                        const val = sel.value;
                        if (val) activeFilters[col] = val;
                    });

                    let filtered = allRows;
                    Object.entries(activeFilters).forEach(([col, val]) => {
                        const ci = parseInt(col);
                        filtered = filtered.filter(row => String(row[ci]) === val);
                    });

                    tableDiv.innerHTML = _dataTable(headers, filtered, opts);
                    _makeTablesSortable(tableDiv);

                    // Update collapse count if callback provided
                    if (onCountChange) onCountChange(filtered.length);
                };

                bar.querySelectorAll('select').forEach(sel => {
                    sel.addEventListener('change', applyFilters);
                });
            }

            // ═══════════════════════════════════════════════════
            // SOA RENDERER
            // ═══════════════════════════════════════════════════

            /**
             * Per-row currency formatter — honours item.currency when present,
             * otherwise falls back to the USD default.
             */
            function _fmtMoney(val, currency) {
                if (val == null || isNaN(val)) return '—';
                const cur = currency || 'USD';
                // Use native Intl when available for correct symbols ($, £, €, etc.)
                try {
                    const abs = Math.abs(val);
                    const sign = val < 0 ? '-' : '';
                    if (abs >= 1e6) return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(abs / 1e6) + 'M';
                    if (abs >= 1e3) return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(abs / 1e3) + 'K';
                    return sign + new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(abs);
                } catch (e) {
                    // Fallback for invalid currency code
                    return _fmtCurrency(val, cur);
                }
            }

            function _renderSOA(el, data, fname) {
                const esc = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const meta = data.metadata || {};
                const sections = data.sections || [];
                const grand = data.grand_totals || {};
                const aging = data.aging_buckets || {};
                const agingBreakdown = data.aging_breakdown || null; // new-parser 7-bucket field

                let masterItems = [];
                sections.forEach(sec => {
                    (sec.items || []).forEach(item => { masterItems.push({ ...item, _section: sec.name }); });
                });

                // Primary currency — the most-common one, used for headline KPIs
                const currencyCounts = {};
                masterItems.forEach(i => { if (i.currency) currencyCounts[i.currency] = (currencyCounts[i.currency] || 0) + 1; });
                const primaryCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || meta.currency || 'USD';
                const isMultiCurrency = Object.keys(currencyCounts).length > 1;

                // Unique values for filters
                const uniqueSections = [...new Set(masterItems.map(i => i._section).filter(Boolean))].sort();
                const uniqueCurrencies = [...new Set(masterItems.map(i => i.currency).filter(Boolean))].sort();

                // Global filter bar (light theme)
                const { html: filterBarHtml, barId: filterBarId } = _globalFilterBar({
                    fields: [
                        { key: 'section', label: 'Section', values: uniqueSections },
                        { key: 'currency', label: 'Currency', values: uniqueCurrencies },
                        { key: 'min_amount', label: 'Min Amount', type: 'threshold', placeholder: '0' },
                    ],
                });

                const contentId = `soa-content-${Date.now()}`;
                el.innerHTML = `${filterBarHtml}<div id="${contentId}"></div>`;

                // Add light theme class to bar
                const barEl = document.getElementById(filterBarId);
                if (barEl) barEl.classList.add('gfb-light');

                const resetFilters = () => {
                    if (!barEl) return;
                    barEl.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    renderContent(masterItems);
                };

                const renderContent = (filteredItems) => {
                    const contentEl = $(contentId);
                    if (!contentEl) return;

                    // P0: empty-state on filtered-to-zero
                    if (!filteredItems || filteredItems.length === 0) {
                        _renderEmptyState(contentEl, { onReset: resetFilters });
                        return;
                    }

                    const totalCharges = filteredItems.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
                    const totalCredits = filteredItems.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0);
                    const netBalance = totalCharges + totalCredits;
                    const totalOverdue = filteredItems.filter(i => (i.days_late || 0) > 0).reduce((s, i) => s + (i.amount || 0), 0);

                    // Mixed-currency note
                    const uniqCurs = [...new Set(filteredItems.map(i => i.currency).filter(Boolean))];
                    const kpiCurrency = uniqCurs.length === 1 ? uniqCurs[0] : primaryCurrency;

                    let html = '';
                    html += _sectionHeader(esc(meta.title || 'Statement of Account'), 'file-text', { badge: 'SOA', badgeColor: COLORS.navy });

                    html += '<div class="viz-customer-bar">';
                    if (meta.customer_name) html += `<div class="viz-info-chip"><b>Customer:</b> ${esc(meta.customer_name)}</div>`;
                    if (meta.customer_number) html += `<div class="viz-info-chip"><b>Customer No:</b> ${esc(meta.customer_number)}</div>`;
                    if (meta.contact_email) html += `<div class="viz-info-chip"><b>Email:</b> ${esc(meta.contact_email)}</div>`;
                    if (meta.lpi_rate) html += `<div class="viz-info-chip"><b>LPI Rate:</b> ${esc(meta.lpi_rate)}%</div>`;
                    if (meta.report_date) html += `<div class="viz-info-chip"><b>Report Date:</b> ${esc(meta.report_date)}</div>`;
                    if (meta.avg_days_late) html += `<div class="viz-info-chip"><b>Avg Days Late:</b> ${esc(meta.avg_days_late)}</div>`;
                    if (uniqCurs.length > 1) html += `<div class="viz-info-chip" style="border-left:3px solid #D97706"><b>Multi-currency:</b> ${esc(uniqCurs.join(', '))} (totals in ${esc(kpiCurrency)})</div>`;
                    html += '</div>';

                    html += '<div class="viz-kpi-grid viz-kpi-grid-5">';
                    html += _kpiCard('Net Balance', _fmtMoney(netBalance, kpiCurrency), { icon: 'wallet', colorClass: netBalance >= 0 ? 'kpi-danger' : 'kpi-success' });
                    html += _kpiCard('Total Charges', _fmtMoney(totalCharges, kpiCurrency), { icon: 'trending-up', colorClass: 'kpi-danger' });
                    html += _kpiCard('Total Credits', _fmtMoney(totalCredits, kpiCurrency), { icon: 'trending-down', colorClass: 'kpi-success' });
                    html += _kpiCard('Total Overdue', _fmtMoney(totalOverdue, kpiCurrency), { icon: 'alert-triangle', colorClass: 'kpi-warning' });
                    html += _kpiCard('Line Items', _fmtNumber(filteredItems.length), { icon: 'list' });
                    html += '</div>';

                    const donutId = `soa-donut-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const agingId = `soa-aging-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const ccId = `soa-cc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const topOverdueId = `soa-topover-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-3">
                <div class="viz-chart-card"><div class="viz-chart-header">Section Breakdown</div><div id="${donutId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Charges vs Credits</div><div id="${ccId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Aging Analysis</div><div id="${agingId}" class="viz-chart-body"></div></div>
            </div>`;

                    // Top-10 overdue chart (only if any overdue exist)
                    const overdueItems = filteredItems.filter(i => (i.days_late || 0) > 0 && (i.amount || 0) > 0);
                    if (overdueItems.length > 0) {
                        html += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
                            <div class="viz-chart-card"><div class="viz-chart-header">Top 10 Overdue Invoices by Amount</div><div id="${topOverdueId}" class="viz-chart-body"></div></div>
                        </div>`;
                    }

                    html += _sectionHeader('Section Details', 'layers');
                    // Build filtered sections, collapsible per V6_SPEC §14
                    const filteredSections = {};
                    filteredItems.forEach(i => {
                        if (!filteredSections[i._section]) filteredSections[i._section] = [];
                        filteredSections[i._section].push(i);
                    });
                    const collapsibleIds = [];
                    Object.entries(filteredSections).forEach(([secName, secItems]) => {
                        const secTotal = secItems.reduce((s, i) => s + (i.amount || 0), 0);
                        const secCurr = [...new Set(secItems.map(i => i.currency).filter(Boolean))][0] || kpiCurrency;
                        // Default: collapsed if > 20 rows
                        const startOpen = secItems.length <= 20;
                        const sid = `soa-sec-${Math.random().toString(36).slice(2, 8)}`;
                        collapsibleIds.push(sid);
                        const itemsHeaders = ['Reference', 'Doc Date', 'Due Date', 'Amount', 'Currency', 'Text', 'Days Late'];
                        const itemsRows = secItems.map(i => [i.reference, i.doc_date, i.due_date, i.amount, i.currency, _truncate(i.text, 50), i.days_late]);
                        html += `<div class="viz-subsection viz-collapse-section" data-sid="${sid}">
                            <div class="viz-subsection-header viz-collapse-toggle" data-target="${sid}" style="cursor:pointer;display:flex;align-items:center;gap:10px;user-select:none">
                                <i data-lucide="chevron-down" class="viz-collapse-chevron ${startOpen ? '' : 'collapsed'}" style="width:14px;height:14px;transition:transform 0.2s;${startOpen ? '' : 'transform:rotate(-90deg)'}"></i>
                                <span class="viz-subsection-name">${esc(secName)}</span>
                                <span class="viz-subsection-total">${_fmtMoney(secTotal, secCurr)}</span>
                                <span class="viz-subsection-count">${secItems.length} items</span>
                            </div>
                            <div class="viz-collapse-body" id="${sid}" style="${startOpen ? '' : 'display:none;'}padding:12px 0">
                                ${_dataTable(itemsHeaders, itemsRows, { maxRows: 200 })}
                            </div>
                        </div>`;
                    });

                    html += _sectionHeader('Invoice Register', 'table');
                    const headers = ['Reference', 'Doc Date', 'Due Date', 'Amount', 'Currency', 'Section', 'Text', 'Days Late'];
                    const rows = filteredItems.map(i => [i.reference, i.doc_date, i.due_date, i.amount, i.currency, i._section, _truncate(i.text, 40), i.days_late]);
                    const fdt = _filterableDataTable(headers, rows,
                        [{ col: 4, label: 'Currency' }, { col: 5, label: 'Section' }], { maxRows: 100 });
                    const csvBtnId = `soa-csv-${Date.now()}`;
                    html += `<div style="display:flex;justify-content:flex-end;margin:-28px 0 4px">${_csvButton(csvBtnId, 'Download CSV')}</div>`;
                    html += fdt.html;

                    contentEl.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();

                    // Wire filterable table
                    _wireFilterableDataTable(fdt.containerId, headers, rows, { maxRows: 100 });
                    _makeTablesSortable(contentEl);
                    _wireCSVButton(csvBtnId, `SOA_${(meta.customer_name || 'export').replace(/[^\w.-]/g, '_')}.csv`, headers, () => rows);

                    // Wire collapsibles
                    contentEl.querySelectorAll('.viz-collapse-toggle').forEach(hdr => {
                        hdr.addEventListener('click', () => {
                            const targetId = hdr.dataset.target;
                            const body = document.getElementById(targetId);
                            const chev = hdr.querySelector('.viz-collapse-chevron');
                            if (!body) return;
                            const isHidden = body.style.display === 'none';
                            body.style.display = isHidden ? 'block' : 'none';
                            if (chev) chev.style.transform = isHidden ? '' : 'rotate(-90deg)';
                        });
                    });

                    setTimeout(() => {
                        _renderSOACharts(donutId, ccId, agingId, sections, filteredItems, aging, agingBreakdown, kpiCurrency);
                        if (overdueItems.length > 0) {
                            _renderSOATopOverdue(topOverdueId, overdueItems, kpiCurrency);
                        }
                    }, 100);
                };

                renderContent(masterItems);

                _wireGlobalFilterBar(filterBarId, null, (filters) => {
                    _registerFilterState('SOA', filters);
                    let filtered = masterItems;
                    if (filters.section) filtered = filtered.filter(i => i._section === filters.section);
                    if (filters.currency) filtered = filtered.filter(i => i.currency === filters.currency);
                    if (filters.min_amount != null) filtered = filtered.filter(i => Math.abs(i.amount || 0) >= filters.min_amount);
                    renderContent(filtered);
                });
            }

            function _renderSOATopOverdue(id, items, currency) {
                const sorted = [...items].sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 10);
                const labels = sorted.map(i => _truncate(i.reference || i._section || '—', 18));
                const vals = sorted.map(i => Math.round((i.amount || 0) * 100) / 100);
                if (sorted.length === 0) return;
                _renderChart(id, {
                    chart: { type: 'bar', height: Math.max(260, sorted.length * 30 + 40), background: 'transparent', toolbar: { show: false } },
                    series: [{ name: 'Overdue', data: vals }],
                    xaxis: { categories: labels, labels: { formatter: v => _fmtMoney(v, currency), style: { fontSize: '10px' } } },
                    yaxis: { labels: { style: { fontSize: '11px' } } },
                    colors: ['#DC2626'],
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%' } },
                    dataLabels: { enabled: true, formatter: v => _fmtMoney(v, currency), style: { fontSize: '10px', colors: ['#fff'] } },
                    tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                });
            }

            function _renderSOACharts(donutId, ccId, agingId, sections, items, agingBuckets, agingBreakdown, currency) {
                currency = currency || 'USD';
                // Donut: section breakdown
                const secLabels = sections.map(s => s.name);
                const secValues = sections.map(s => {
                    return (s.items || []).reduce((sum, i) => sum + Math.abs(i.amount || 0), 0);
                });
                if ($(donutId) && secLabels.length > 0) {
                    _renderChart(donutId, {
                        chart: { type: 'donut', height: 280, background: 'transparent' },
                        series: secValues,
                        labels: secLabels,
                        colors: [COLORS.navy, COLORS.blue2, COLORS.purple, COLORS.teal, COLORS.red, COLORS.orange, COLORS.green, COLORS.gold],
                        plotOptions: { pie: { donut: { size: '70%' } } },
                        legend: { position: 'bottom', fontSize: '11px', markers: { width: 8, height: 8 } },
                        dataLabels: { enabled: false },
                        stroke: { width: 2, colors: ['#fff'] },
                        tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                    });
                }

                // Charges vs Credits
                const secCharges = {};
                const secCredits = {};
                items.forEach(i => {
                    const sec = i._section || 'Other';
                    if ((i.amount || 0) > 0) secCharges[sec] = (secCharges[sec] || 0) + i.amount;
                    else secCredits[sec] = (secCredits[sec] || 0) + i.amount;
                });
                const ccSections = [...new Set([...Object.keys(secCharges), ...Object.keys(secCredits)])];
                if ($(ccId) && ccSections.length > 0) {
                    _renderChart(ccId, {
                        chart: { type: 'bar', height: 280, background: 'transparent', stacked: true, toolbar: { show: false } },
                        series: [
                            { name: 'Charges', data: ccSections.map(s => secCharges[s] || 0) },
                            { name: 'Credits', data: ccSections.map(s => Math.abs(secCredits[s] || 0)) },
                        ],
                        xaxis: { categories: ccSections.map(s => _truncate(s, 15)) },
                        colors: [COLORS.red, COLORS.green],
                        plotOptions: { bar: { horizontal: false, columnWidth: '60%', borderRadius: 4 } },
                        legend: { position: 'top' },
                        dataLabels: { enabled: false },
                        tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                    });
                }

                // Aging — prefer 7-bucket agingBreakdown (horizontal bar), fall back to 6-bucket agingBuckets
                if ($(agingId)) {
                    const bb = agingBreakdown || null;
                    const keys7 = ['current', '1_30', '31_60', '61_90', '91_120', '121_180', 'over_180'];
                    const labels7 = ['Current', '1-30', '31-60', '61-90', '91-120', '121-180', '180+'];
                    const colors7 = ['#059669', '#34D399', '#EAB308', '#D97706', '#F97316', '#DC2626', '#991B1B'];
                    const keys6 = ['current', '1_30_days', '31_60_days', '61_90_days', '91_180_days', 'over_180_days'];
                    const labels6 = ['Current', '1-30', '31-60', '61-90', '91-180', '180+'];
                    const colors6 = ['#059669', '#34D399', '#F59E0B', '#EA580C', '#DC2626', '#991B1B'];
                    let labels, vals, colors;
                    if (bb && Object.keys(bb).length > 0) {
                        labels = keys7.map((k, i) => labels7[i]);
                        vals = keys7.map(k => Math.abs(bb[k] || 0));
                        colors = colors7;
                    } else {
                        labels = labels6;
                        vals = keys6.map(k => Math.abs((agingBuckets || {})[k] || 0));
                        colors = colors6;
                    }
                    if (vals.some(v => v > 0)) {
                        _renderChart(agingId, {
                            chart: { type: 'bar', height: 280, background: 'transparent', toolbar: { show: false } },
                            series: [{ name: 'Amount', data: vals }],
                            xaxis: { categories: labels, labels: { formatter: v => _fmtMoney(v, currency) } },
                            yaxis: { labels: { style: { fontSize: '11px' } } },
                            colors: colors,
                            plotOptions: { bar: { distributed: true, borderRadius: 4, barHeight: '65%', horizontal: true } },
                            legend: { show: false },
                            dataLabels: { enabled: true, formatter: val => val > 0 ? _fmtMoney(val, currency) : '', style: { fontSize: '10px', colors: ['#fff'] } },
                            tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                        });
                    }
                }
            }

            // ═══════════════════════════════════════════════════
            // INVOICE LIST RENDERER
            // ═══════════════════════════════════════════════════

            function _renderInvoiceList(el, data, fname) {
                const esc = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const meta = data.metadata || {};
                const masterItems = data.items || [];
                const totals = data.totals || {};
                const agingBreakdown = data.aging_breakdown || null;
                const sheetSubtotals = data.sheet_subtotals || [];

                const primaryCurrency = (meta.currencies && meta.currencies[0]) || 'USD';

                const uniqueCurrencies = [...new Set(masterItems.map(i => i.currency).filter(Boolean))].sort();
                const uniqueStatuses = [...new Set(masterItems.map(i => i.status || i.doc_status).filter(Boolean))].sort();

                const { html: filterBarHtml, barId: filterBarId } = _globalFilterBar({
                    fields: [
                        { key: 'currency', label: 'Currency', values: uniqueCurrencies },
                        { key: 'status', label: 'Status', values: uniqueStatuses },
                        { key: 'min_amount', label: 'Min Amount', type: 'threshold', placeholder: '0' },
                    ],
                });

                const contentId = `inv-content-${Date.now()}`;
                el.innerHTML = `${filterBarHtml}<div id="${contentId}"></div>`;
                const barEl = document.getElementById(filterBarId);
                if (barEl) barEl.classList.add('gfb-light');

                const resetFilters = () => {
                    if (!barEl) return;
                    barEl.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    renderContent(masterItems);
                };

                const renderContent = (filteredItems) => {
                    const contentEl = $(contentId);
                    if (!contentEl) return;

                    if (!filteredItems || filteredItems.length === 0) {
                        _renderEmptyState(contentEl, { onReset: resetFilters });
                        return;
                    }

                    const uniqCurs = [...new Set(filteredItems.map(i => i.currency).filter(Boolean))];
                    const kpiCurrency = uniqCurs.length === 1 ? uniqCurs[0] : primaryCurrency;

                    const totalAmt = filteredItems.reduce((s, i) => s + (i.amount || 0), 0);
                    const totalPos = filteredItems.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
                    const totalNeg = filteredItems.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0);

                    let html = '';
                    html += _sectionHeader('Invoice List — Open Items Register', 'receipt', { badge: 'EPI', badgeColor: COLORS.blue2 });
                    html += '<div class="viz-customer-bar">';
                    html += `<div class="viz-info-chip"><b>Source:</b> ${esc(_safe(meta.source_file))}</div>`;
                    html += `<div class="viz-info-chip"><b>Total Items:</b> ${filteredItems.length}</div>`;
                    if (uniqCurs.length) html += `<div class="viz-info-chip"><b>Currencies:</b> ${esc(uniqCurs.join(', '))}${uniqCurs.length > 1 ? ' (totals in ' + esc(kpiCurrency) + ')' : ''}</div>`;
                    html += '</div>';

                    html += '<div class="viz-kpi-grid viz-kpi-grid-4">';
                    html += _kpiCard('Total Amount', _fmtMoney(totalAmt, kpiCurrency), { icon: 'wallet' });
                    html += _kpiCard('Receivables', _fmtMoney(totalPos, kpiCurrency), { icon: 'trending-up', colorClass: 'kpi-danger' });
                    html += _kpiCard('Credits', _fmtMoney(totalNeg, kpiCurrency), { icon: 'trending-down', colorClass: 'kpi-success' });
                    html += _kpiCard('Line Items', _fmtNumber(filteredItems.length), { icon: 'hash' });
                    html += '</div>';

                    const timelineId = `inv-timeline-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const distId = `inv-dist-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const agingId = `inv-aging-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const statusId = `inv-status-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-2">
                <div class="viz-chart-card"><div class="viz-chart-header">Amount by Due Date</div><div id="${timelineId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Amount Distribution</div><div id="${distId}" class="viz-chart-body"></div></div>
            </div>`;

                    const hasAging = agingBreakdown && Object.keys(agingBreakdown).length > 0;
                    const hasStatus = uniqueStatuses.length > 0;
                    if (hasAging || hasStatus) {
                        html += `<div class="viz-chart-grid viz-chart-grid-${(hasAging && hasStatus) ? 2 : 1}">`;
                        if (hasAging) html += `<div class="viz-chart-card"><div class="viz-chart-header">Aging Buckets</div><div id="${agingId}" class="viz-chart-body"></div></div>`;
                        if (hasStatus) html += `<div class="viz-chart-card"><div class="viz-chart-header">Invoices by Status</div><div id="${statusId}" class="viz-chart-body"></div></div>`;
                        html += `</div>`;
                    }

                    // Subtotals rendering (if parser gave us sheet_subtotals)
                    if (sheetSubtotals && sheetSubtotals.length > 0) {
                        const subtotId = `inv-subt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                        html += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
                            <div class="viz-chart-card"><div class="viz-chart-header">Section Subtotals</div><div id="${subtotId}" class="viz-chart-body"></div></div>
                        </div>`;
                        // Schedule chart render together with others
                        setTimeout(() => _renderInvoiceSubtotals(subtotId, sheetSubtotals, kpiCurrency), 110);
                    }

                    html += _sectionHeader('Invoice Register', 'table');
                    const headers = ['Reference', 'Doc Date', 'Due Date', 'Amount', 'Currency', 'Status', 'Text', 'Assignment'];
                    const rows = filteredItems.map(i => [i.reference, i.doc_date, i.due_date, i.amount, i.currency, (i.status || i.doc_status || ''), _truncate(i.text, 35), i.assignment]);
                    const fdt = _filterableDataTable(headers, rows,
                        [{ col: 4, label: 'Currency' }, { col: 5, label: 'Status' }], { maxRows: 150 });
                    const csvId = `inv-csv-${Date.now()}`;
                    html += `<div style="display:flex;justify-content:flex-end;margin:-28px 0 4px">${_csvButton(csvId, 'Download CSV')}</div>`;
                    html += fdt.html;

                    contentEl.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                    _wireFilterableDataTable(fdt.containerId, headers, rows, { maxRows: 150 });
                    _makeTablesSortable(contentEl);
                    _wireCSVButton(csvId, 'invoice_list_export.csv', headers, () => rows);
                    setTimeout(() => {
                        _renderInvoiceCharts(timelineId, distId, filteredItems, kpiCurrency);
                        if (hasAging) _renderInvoiceAging(agingId, agingBreakdown, kpiCurrency);
                        if (hasStatus) _renderInvoiceStatus(statusId, filteredItems);
                    }, 80);
                };

                renderContent(masterItems);
                _wireGlobalFilterBar(filterBarId, null, (filters) => {
                    _registerFilterState('INVOICE_LIST', filters);
                    let filtered = masterItems;
                    if (filters.currency) filtered = filtered.filter(i => i.currency === filters.currency);
                    if (filters.status) filtered = filtered.filter(i => (i.status || i.doc_status) === filters.status);
                    if (filters.min_amount != null) filtered = filtered.filter(i => Math.abs(i.amount || 0) >= filters.min_amount);
                    renderContent(filtered);
                });
            }

            function _renderInvoiceCharts(timelineId, distId, items, currency) {
                currency = currency || 'USD';
                // Timeline: amounts by due date (group by month)
                const byMonth = {};
                let withoutDue = 0;
                items.forEach(i => {
                    if (!i.due_date) { withoutDue++; return; }
                    const month = String(i.due_date).substring(0, 7); // YYYY-MM
                    byMonth[month] = (byMonth[month] || 0) + (i.amount || 0);
                });
                const months = Object.keys(byMonth).sort();
                if ($(timelineId) && months.length > 0) {
                    _renderChart(timelineId, {
                        chart: { type: 'area', height: 280, background: 'transparent', toolbar: { show: false } },
                        series: [{ name: 'Amount', data: months.map(m => byMonth[m]) }],
                        xaxis: { categories: months },
                        colors: [COLORS.blue2],
                        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 } },
                        stroke: { curve: 'smooth', width: 2 },
                        dataLabels: { enabled: false },
                        tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                        yaxis: { labels: { formatter: v => _fmtMoney(v, currency) } },
                        subtitle: withoutDue > 0 ? { text: `${withoutDue} invoice(s) without due date omitted` } : undefined,
                    });
                }

                // Distribution: positive vs negative
                const positive = items.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
                const negative = Math.abs(items.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0));
                if ($(distId)) {
                    _renderChart(distId, {
                        chart: { type: 'donut', height: 280, background: 'transparent' },
                        series: [positive, negative],
                        labels: ['Receivables', 'Credits'],
                        colors: [COLORS.red, COLORS.green],
                        plotOptions: { pie: { donut: { size: '62%' } } },
                        dataLabels: { enabled: false },
                        legend: { position: 'bottom' },
                        tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                    });
                }
            }

            function _renderInvoiceAging(agingId, bb, currency) {
                const keys7 = ['current', '1_30', '31_60', '61_90', '91_120', '121_180', 'over_180'];
                const labels7 = ['Current', '1-30', '31-60', '61-90', '91-120', '121-180', '180+'];
                const colors7 = ['#059669', '#34D399', '#EAB308', '#D97706', '#F97316', '#DC2626', '#991B1B'];
                const vals = keys7.map(k => Math.abs(bb[k] || 0));
                if (vals.every(v => v === 0)) return;
                _renderChart(agingId, {
                    chart: { type: 'bar', height: 280, background: 'transparent', toolbar: { show: false } },
                    series: [{ name: 'Amount', data: vals }],
                    xaxis: { categories: labels7, labels: { formatter: v => _fmtMoney(v, currency) } },
                    colors: colors7,
                    plotOptions: { bar: { horizontal: true, barHeight: '65%', borderRadius: 4, distributed: true } },
                    dataLabels: { enabled: true, formatter: v => v > 0 ? _fmtMoney(v, currency) : '', style: { fontSize: '10px', colors: ['#fff'] } },
                    legend: { show: false },
                    tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                });
            }

            function _renderInvoiceStatus(id, items) {
                const counts = {};
                items.forEach(i => {
                    const s = i.status || i.doc_status || 'Unknown';
                    counts[s] = (counts[s] || 0) + 1;
                });
                const labels = Object.keys(counts);
                if (labels.length === 0) return;
                _renderChart(id, {
                    chart: { type: 'donut', height: 280, background: 'transparent' },
                    series: Object.values(counts),
                    labels: labels,
                    colors: [COLORS.blue2, COLORS.green, COLORS.orange, COLORS.red, COLORS.purple, COLORS.teal],
                    plotOptions: { pie: { donut: { size: '62%' } } },
                    dataLabels: { enabled: true, formatter: v => v.toFixed(0) + '%' },
                    legend: { position: 'bottom' },
                });
            }

            function _renderInvoiceSubtotals(id, subtotals, currency) {
                // Expect subtotals = [{section, amount}, ...]
                const labels = subtotals.map(s => _truncate(String(s.section || s.label || s.sheet || '—'), 25));
                const vals = subtotals.map(s => Math.round((s.amount || s.total || 0) * 100) / 100);
                if (vals.every(v => v === 0)) return;
                _renderChart(id, {
                    chart: { type: 'bar', height: Math.max(280, labels.length * 30 + 40), background: 'transparent', toolbar: { show: false } },
                    series: [{ name: 'Subtotal', data: vals }],
                    xaxis: { categories: labels, labels: { formatter: v => _fmtMoney(v, currency) } },
                    colors: [COLORS.blue2],
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%' } },
                    dataLabels: { enabled: true, formatter: v => _fmtMoney(v, currency), style: { fontSize: '10px' } },
                    tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                });
            }

            // ═══════════════════════════════════════════════════
            // OPPORTUNITY TRACKER RENDERER
            // ═══════════════════════════════════════════════════

            function _renderOpportunityTracker(el, data, fname) {
                const meta = data.metadata || {};
                const summary = data.summary || {};
                const opportunities = data.opportunities || {};
                const projectSummary = data.project_summary || {};
                const timeline = data.timeline || {};
                const customerAnalytics = data.customer_analytics || {};
                const cover = data.cover || {};
                const oppsAndThreats = data.opps_and_threats || {};

                // Flatten all opportunity records
                let masterRecords = [];
                Object.entries(opportunities).forEach(([sheet, recs]) => {
                    if (Array.isArray(recs)) recs.forEach(r => { masterRecords.push({ ...r, _sheet: sheet }); });
                });

                // Build cascade data: customer → projects
                const custProjects = {};
                masterRecords.forEach(r => {
                    const c = r.customer, p = r.project;
                    if (c && p) {
                        if (!custProjects[c]) custProjects[c] = new Set();
                        custProjects[c].add(p);
                    }
                });
                const cascadeData = { customer: {} };
                Object.entries(custProjects).forEach(([c, pSet]) => {
                    cascadeData.customer[c] = [...pSet].sort();
                });

                // Unique values for filter dropdowns
                const uniqueCustomers = [...new Set(masterRecords.map(r => r.customer).filter(Boolean))].sort();
                const uniqueStatuses = [...new Set(masterRecords.map(r => r.status).filter(Boolean))].sort();
                const uniqueProbs = [...new Set(masterRecords.map(r => r.ext_probability).filter(Boolean))].sort();
                const uniquePriorities = [...new Set(masterRecords.map(r => String(r.priority || '').replace('.0', '')).filter(v => v && v !== 'undefined'))].sort();
                const uniqueOppTypes = [...new Set(masterRecords.map(r => r.opportunity_type).filter(Boolean))].sort();

                // Build global filter bar
                const { html: filterBarHtml, barId: filterBarId } = _globalFilterBar({
                    fields: [
                        {
                            key: 'customer', label: 'Customer', values: uniqueCustomers,
                            cascade: { key: 'project', label: 'Project' }
                        },
                        { key: 'status', label: 'Status', values: uniqueStatuses },
                        { key: 'ext_probability', label: 'Ext Probability', values: uniqueProbs },
                        { key: 'priority', label: 'Priority', values: uniquePriorities },
                        { key: 'opportunity_type', label: 'Opp Type', values: uniqueOppTypes },
                        { key: 'min_value', label: 'Min Value ($M)', type: 'threshold', placeholder: '0' },
                    ],
                });

                // Setup containers
                const contentId = `opp-content-${Date.now()}`;
                el.innerHTML = `<div class="opp-tracker-dashboard">${filterBarHtml}<div id="${contentId}"></div></div>`;

                // Apply dark background
                el.style.background = '#03002E';
                el.style.borderRadius = '0';
                el.style.padding = '24px 32px';
                let parent = el.parentElement;
                while (parent) {
                    if (parent.classList && parent.classList.contains('dashboard-body')) parent.style.background = '#03002E';
                    if (parent.classList && parent.classList.contains('main-content')) parent.style.background = '#03002E';
                    parent = parent.parentElement;
                }

                const resetFilters = () => {
                    const barEl = document.getElementById(filterBarId);
                    if (!barEl) return;
                    barEl.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-cascade').forEach(c => { c.style.display = 'none'; });
                    renderContent(masterRecords);
                };

                // ─── Render content with given filtered records ───
                const renderContent = (filteredRecords) => {
                    const contentEl = $(contentId);
                    if (!contentEl) return;

                    // P0: empty-state on filter-to-zero
                    if (!filteredRecords || filteredRecords.length === 0) {
                        _renderEmptyState(contentEl, { onReset: resetFilters, message: 'No opportunities match the current filters.' });
                        return;
                    }

                    const _val = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
                    const _sumField = (arr, field) => arr.reduce((s, r) => s + _val(r[field]), 0);
                    const $m = (v) => { if (v == null || isNaN(v)) return '—'; return `$${Math.abs(v).toFixed(1)}m`; };

                    const totalOpps = filteredRecords.length;
                    const total2026 = _sumField(filteredRecords, 'benefit_2026');
                    const total2027 = _sumField(filteredRecords, 'benefit_2027');
                    const totalSum2627 = _sumField(filteredRecords, 'sum_26_27');
                    const totalTerm = _sumField(filteredRecords, 'term_benefit');

                    // Status / programme / customer counts from filtered
                    const byStatus = {};
                    const byCustomer = {};
                    const byProgramme = {};
                    const byOppType = {};
                    filteredRecords.forEach(r => {
                        if (r.status) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
                        if (r.customer) byCustomer[r.customer] = (byCustomer[r.customer] || 0) + 1;
                        if (r.programme) byProgramme[r.programme] = (byProgramme[r.programme] || 0) + 1;
                        if (r.opportunity_type) byOppType[r.opportunity_type] = (byOppType[r.opportunity_type] || 0) + 1;
                    });

                    const activeOpps = totalOpps - (byStatus['Cancelled'] || 0);
                    const completedOpps = byStatus['Completed'] || 0;

                    // Aggregate value by opp type x ext probability
                    const probLevels = ['High', 'Med', 'Low'];
                    const probColors = { 'High': '#10069F', 'Med': '#1565C0', 'Low': '#00838F' };
                    const oppTypes = [...new Set(filteredRecords.map(r => r.opportunity_type).filter(Boolean))];
                    const statusList = ['Hopper', 'ICT', 'Negotiations', 'Contracting', 'Completed', 'Cancelled'];

                    const valueByTypeProbObj = {};
                    oppTypes.forEach(t => { valueByTypeProbObj[t] = { High: 0, Med: 0, Low: 0 }; });
                    filteredRecords.forEach(r => {
                        const t = r.opportunity_type, p = r.ext_probability;
                        if (t && p && valueByTypeProbObj[t]) valueByTypeProbObj[t][p] += _val(r.sum_26_27);
                    });

                    const valueByStatusProbObj = {};
                    statusList.forEach(s => { valueByStatusProbObj[s] = { High: 0, Med: 0, Low: 0 }; });
                    filteredRecords.forEach(r => {
                        const s = r.status, p = r.ext_probability;
                        if (s && p && valueByStatusProbObj[s]) valueByStatusProbObj[s][p] += _val(r.sum_26_27);
                    });

                    const custValues = {};
                    filteredRecords.forEach(r => {
                        const c = r.customer;
                        if (c) custValues[c] = (custValues[c] || 0) + _val(r.sum_26_27);
                    });
                    const custTop10 = Object.entries(custValues).sort((a, b) => b[1] - a[1]).slice(0, 15);

                    const byPriority = {};
                    filteredRecords.forEach(r => {
                        const p = String(r.priority || '?').replace('.0', '');
                        if (!byPriority[p]) byPriority[p] = { count: 0, term: 0, sum_26_27: 0 };
                        byPriority[p].count += 1;
                        byPriority[p].term += _val(r.term_benefit);
                        byPriority[p].sum_26_27 += _val(r.sum_26_27);
                    });

                    const estLevels = {};
                    const sheetOrder = Object.keys(opportunities);
                    sheetOrder.forEach(sheetName => {
                        const recs = (opportunities[sheetName] || []).filter(r =>
                            filteredRecords.some(fr => fr._sheet === sheetName && fr.number === r.number && fr.asks === r.asks)
                        );
                        if (recs.length === 0) return;
                        const levelLabel = (meta.estimation_levels || {})[sheetName] || sheetName;
                        estLevels[levelLabel] = {
                            count: recs.length,
                            total_sum_26_27: recs.reduce((s, r) => s + _val(r.sum_26_27), 0),
                            total_term_benefit: recs.reduce((s, r) => s + _val(r.term_benefit), 0),
                            total_2026: recs.reduce((s, r) => s + _val(r.benefit_2026), 0),
                            total_2027: recs.reduce((s, r) => s + _val(r.benefit_2027), 0),
                        };
                    });

                    let html = '';

                    // TITLE BANNER
                    html += `<div class="viz-opp-banner">
                <div class="viz-opp-banner-inner">
                    <div class="viz-opp-banner-title"><i data-lucide="target"></i><span>${cover.title || 'MEA Commercial Optimisation Report'}</span></div>
                    <div style="display:flex;align-items:center;gap:16px">
                        <div class="viz-opp-banner-badge">OPP TRACKER</div>
                        <div class="viz-opp-banner-rr">ROLLS‑ROYCE</div>
                    </div>
                </div>
            </div>`;

                    // FINANCIAL HERO KPIs
                    html += `<div class="viz-opp-hero">
                <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">2026</div><div class="viz-opp-hero-value">${$m(total2026)}</div></div>
                <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">2027</div><div class="viz-opp-hero-value">${$m(total2027)}</div></div>
                <div class="viz-opp-hero-card viz-opp-hero-accent"><div class="viz-opp-hero-label">2026 + 2027</div><div class="viz-opp-hero-value">${$m(totalSum2627)}</div></div>
                <div class="viz-opp-hero-card viz-opp-hero-primary"><div class="viz-opp-hero-label">Term Impact</div><div class="viz-opp-hero-value">${$m(totalTerm)}</div></div>
            </div>`;

                    // Meta bar
                    html += '<div class="viz-customer-bar">';
                    if (meta.away_day_date) html += `<div class="viz-info-chip"><b>Away Day:</b> ${meta.away_day_date}</div>`;
                    if (meta.sheets_parsed) html += `<div class="viz-info-chip"><b>Sheets:</b> ${meta.sheets_parsed.join(', ')}</div>`;
                    html += `<div class="viz-info-chip"><b>Opportunities:</b> ${totalOpps} (${activeOpps} active)</div>`;
                    html += `<div class="viz-info-chip"><b>Customers:</b> ${Object.keys(byCustomer).length}</div>`;
                    html += `<div class="viz-info-chip"><b>Programmes:</b> ${Object.keys(byProgramme).length}</div>`;
                    html += '</div>';

                    // PRIORITY BREAKDOWN
                    const priorityKeys = Object.keys(byPriority).sort();
                    if (priorityKeys.length > 0) {
                        html += `<div class="viz-kpi-grid viz-kpi-grid-${Math.min(priorityKeys.length + 2, 5)}">`;
                        priorityKeys.forEach(p => {
                            const d = byPriority[p];
                            html += _kpiCard(`Priority ${p}`, $m(d.sum_26_27), {
                                icon: p === '1' ? 'star' : p === '2' ? 'circle' : 'minus',
                                colorClass: p === '1' ? 'kpi-success' : '',
                                subtitle: `${d.count} opps · Term: ${$m(d.term)}`
                            });
                        });
                        html += _kpiCard('Completed', _fmtNumber(completedOpps), {
                            icon: 'check-circle', colorClass: 'kpi-success',
                            subtitle: `${totalOpps > 0 ? ((completedOpps / totalOpps) * 100).toFixed(0) : 0}% of total`
                        });
                        html += _kpiCard('Pipeline', _fmtNumber(activeOpps - completedOpps), {
                            icon: 'git-branch', colorClass: 'kpi-warning',
                            subtitle: `${(byStatus['ICT'] || 0)} ICT · ${(byStatus['Negotiations'] || 0)} Neg · ${(byStatus['Contracting'] || 0)} Ctr`
                        });
                        html += '</div>';
                    }

                    // CHARTS ROW 1
                    const typeChartId = `opp-type-val-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const statusChartId = `opp-status-val-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-2">
                <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Type & External Probability</div><div id="${typeChartId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Status & External Probability</div><div id="${statusChartId}" class="viz-chart-body"></div></div>
            </div>`;

                    // CHARTS ROW 2
                    const custChartId = `opp-cust-val-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const finChartId = `opp-fin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const pipeDonutId = `opp-pipe-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-3">
                <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Customer</div><div id="${custChartId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Financial Forecast by Level</div><div id="${finChartId}" class="viz-chart-body"></div></div>
                <div class="viz-chart-card"><div class="viz-chart-header">Pipeline Status</div><div id="${pipeDonutId}" class="viz-chart-body"></div></div>
            </div>`;

                    // ESTIMATION LEVEL CARDS
                    const levelEntries = Object.entries(estLevels);
                    if (levelEntries.length > 0) {
                        html += _sectionHeader('Estimation Level Breakdown', 'layers');
                        html += `<div class="viz-kpi-grid viz-kpi-grid-${Math.min(levelEntries.length, 3)}">`;
                        levelEntries.forEach(([level, sums]) => {
                            const iconMap = { 'ICT': 'zap', 'Contract': 'file-check', 'Hopper': 'inbox' };
                            html += _kpiCard(
                                `${level} Estimates`, $m(sums.total_sum_26_27 || 0),
                                {
                                    icon: iconMap[level] || 'layers', colorClass: level === 'Contract' ? 'kpi-success' : '',
                                    subtitle: `${sums.count} opps · Term: ${$m(sums.total_term_benefit)} · 2026: ${$m(sums.total_2026)} · 2027: ${$m(sums.total_2027)}`
                                }
                            );
                        });
                        html += '</div>';
                    }

                    // EXT PROBABILITY BREAKDOWN
                    html += _sectionHeader('External Probability & Opportunity Types', 'bar-chart-3');
                    html += '<div class="viz-customer-bar">';
                    const probAgg = {};
                    filteredRecords.forEach(r => {
                        const p = r.ext_probability || '?';
                        if (!probAgg[p]) probAgg[p] = { count: 0, sum: 0, term: 0 };
                        probAgg[p].count += 1;
                        probAgg[p].sum += _val(r.sum_26_27);
                        probAgg[p].term += _val(r.term_benefit);
                    });
                    Object.entries(probAgg).forEach(([prob, d]) => {
                        const color = probColors[prob] || '#9E9E9E';
                        html += `<div class="viz-info-chip" style="border-left:3px solid ${color}"><b>${prob}:</b> ${d.count} opps · ${$m(d.sum)} (26+27) · ${$m(d.term)} term</div>`;
                    });
                    html += '</div>';
                    html += '<div class="viz-customer-bar" style="margin-top:8px">';
                    const typeColors = [COLORS.navy, COLORS.blue2, COLORS.green, COLORS.teal, COLORS.orange, COLORS.purple, COLORS.red, COLORS.gold];
                    Object.entries(byOppType).forEach(([type, count], i) => {
                        const color = typeColors[i % typeColors.length];
                        const typeVal = filteredRecords.filter(r => r.opportunity_type === type).reduce((s, r) => s + _val(r.sum_26_27), 0);
                        html += `<div class="viz-info-chip" style="border-left:3px solid ${color}"><b>${type}:</b> ${count} · ${$m(typeVal)}</div>`;
                    });
                    html += '</div>';

                    // ── COLLAPSIBLE HELPER ──
                    const _col = (title, icon, count, innerHtml, startOpen = false) => {
                        const colId = `opp-col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        return `<div class="opp-collapse-section">
                    <div class="opp-collapse-header" data-target="${colId}">
                        <div class="opp-collapse-header-left">
                            <i data-lucide="${icon}" style="width:16px;height:16px;color:var(--opp-accent-blue)"></i>
                            <span class="opp-collapse-title">${title}</span>
                            <span class="opp-collapse-count">${count}</span>
                        </div>
                        <i data-lucide="chevron-down" class="opp-collapse-chevron ${startOpen ? '' : 'collapsed'}"></i>
                    </div>
                    <div class="opp-collapse-body" id="${colId}" style="${startOpen ? '' : 'display:none'}">${innerHtml}</div>
                </div>`;
                    };

                    // ── TOP OPPORTUNITIES TABLE (filterable) ──
                    const topByValue = [...filteredRecords].sort((a, b) => _val(b.sum_26_27) - _val(a.sum_26_27)).slice(0, 30);
                    const topHeaders = ['Customer', 'Asks', 'Ext Prob', 'Status', 'Sum of Value (26+27)'];
                    const topRows = topByValue.map(r => [r.customer, _truncate(String(r.asks || ''), 45), r.ext_probability, r.status, _val(r.sum_26_27)]);
                    const topFdt = _filterableDataTable(topHeaders, topRows,
                        [{ col: 0, label: 'Customer' }, { col: 2, label: 'Ext Prob' }, { col: 3, label: 'Status' }], { maxRows: 30 });
                    html += _col('Top Opportunities by Value', 'trophy', `${topByValue.length} items`, topFdt.html, true);

                    // ── BY ESTIMATION LEVEL (filterable) ──
                    let estHtml = '';
                    let totalEstItems = 0;
                    const estFdts = [];
                    const sheetOrderEst = Object.keys(opportunities);
                    sheetOrderEst.forEach(sheetName => {
                        const recs = (opportunities[sheetName] || []).filter(r =>
                            filteredRecords.some(fr => fr._sheet === sheetName && fr.number === r.number && fr.asks === r.asks));
                        if (!Array.isArray(recs) || recs.length === 0) return;
                        totalEstItems += recs.length;
                        const levelLabel = (meta.estimation_levels || {})[sheetName] || sheetName;
                        const sheetSum = recs.reduce((s, r) => s + _val(r.sum_26_27), 0);
                        const sheetTerm = recs.reduce((s, r) => s + _val(r.term_benefit), 0);
                        estHtml += `<div class="viz-subsection"><div class="viz-subsection-header">
                    <span class="viz-subsection-name">${levelLabel} — ${sheetName}</span>
                    <span class="viz-subsection-total">${$m(sheetSum)} (26+27) · ${$m(sheetTerm)} term</span>
                    <span class="viz-subsection-count">${recs.length} opps</span>
                </div></div>`;
                        const eHeaders = ['#', 'Project', 'Programme', 'Customer', 'Asks', 'Ext Prob', 'Status', 'Priority', 'Sum $M', 'Term $M'];
                        const eRows = recs.map(r => [r.number, _truncate(String(r.project || ''), 18),
                        _truncate(String(r.programme || ''), 14), _truncate(String(r.customer || ''), 14),
                        _truncate(String(r.asks || ''), 30), r.ext_probability, r.status, r.priority,
                        _val(r.sum_26_27), _val(r.term_benefit)]);
                        const eFdt = _filterableDataTable(eHeaders, eRows,
                            [{ col: 3, label: 'Customer' }, { col: 5, label: 'Ext Prob' }, { col: 6, label: 'Status' }], { maxRows: 50 });
                        estHtml += eFdt.html;
                        estFdts.push({ containerId: eFdt.containerId, headers: eHeaders, rows: eRows });
                    });
                    if (totalEstItems > 0) html += _col('Opportunities by Estimation Level', 'table', `${totalEstItems} items`, estHtml);

                    // ── PROJECT TIMELINE ──
                    const milestones = (timeline.milestones || []).filter(m => m.project && m.milestones);
                    if (milestones.length > 0) {
                        let timeHtml = '';
                        const phaseHeaders = ['Project', 'Customer', 'Current Phase', 'Days to Sign'];
                        const phaseRows = milestones.slice(0, 30).map(m => {
                            const ms = m.milestones || {};
                            const signedDate = ms.proposal_signed ? new Date(ms.proposal_signed) : null;
                            const now = new Date();
                            const daysToSign = signedDate ? Math.round((signedDate - now) / (1000 * 60 * 60 * 24)) : '—';
                            return [_truncate(String(m.project || ''), 20), _truncate(String(m.customer || ''), 16),
                            String(m.current_phase || '').replace(/_/g, ' '), daysToSign];
                        });
                        timeHtml += _dataTable(phaseHeaders, phaseRows);
                        timeHtml += '<div class="viz-gantt-wrap">';
                        const phases = ['idea_generation', 'approval_to_launch', 'strategy_approval', 'be_generated', 'approval', 'negotiation_strategy', 'proposal_submitted', 'proposal_signed'];
                        const phaseLabels = ['Idea Gen', 'Launch', 'Strategy', 'BE Gen', 'Approval', 'Negotiation', 'Submitted', 'Signed'];
                        const phaseColorArr = ['#4361EE', '#3A86FF', '#5E60CE', '#48BFE3', '#00E396', '#FF8B42', '#FFB547', '#FF4560'];
                        timeHtml += '<table class="viz-gantt-table"><thead><tr><th>Project</th>';
                        phaseLabels.forEach(l => { timeHtml += `<th>${l}</th>`; });
                        timeHtml += '</tr></thead><tbody>';
                        milestones.slice(0, 20).forEach(m => {
                            const ms = m.milestones || {};
                            const currentPhase = m.current_phase || '';
                            timeHtml += `<tr><td class="viz-gantt-project">${_truncate(String(m.project || ''), 18)}</td>`;
                            let foundCurrent = false;
                            phases.forEach((phase, i) => {
                                const date = ms[phase];
                                const isCurrent = currentPhase === phase;
                                const isPast = date && new Date(date) <= new Date();
                                if (isCurrent) foundCurrent = true;
                                let cls = 'viz-gantt-empty';
                                if (isPast && !foundCurrent) cls = 'viz-gantt-done';
                                else if (isCurrent) cls = 'viz-gantt-current';
                                else cls = 'viz-gantt-future';
                                timeHtml += `<td class="${cls}" title="${phase}: ${date || 'N/A'}"><div class="viz-gantt-bar" style="background:${phaseColorArr[i]}"></div></td>`;
                            });
                            timeHtml += '</tr>';
                        });
                        timeHtml += '</tbody></table></div>';
                        html += _col('Project Timeline & Milestones', 'calendar', `${milestones.length} projects`, timeHtml);
                    }

                    // ── OPPS & THREATS (filterable) ──
                    const oatItems = oppsAndThreats.items || [];
                    let oatFdt = null;
                    if (oatItems.length > 0) {
                        const oatHeaders = ['Project', 'Customer', 'Opportunity', 'Status', 'Owner', 'Pack Improvement', 'Due Date'];
                        const oatRows = oatItems.map(i => [i.project, i.customer, _truncate(String(i.opportunity || ''), 40),
                        i.status, i.owner, typeof i.overall_pack_improvement === 'number' ? _fmtNumber(i.overall_pack_improvement) : '—', i.due_date]);
                        oatFdt = _filterableDataTable(oatHeaders, oatRows,
                            [{ col: 1, label: 'Customer' }, { col: 3, label: 'Status' }, { col: 4, label: 'Owner' }]);
                        html += _col('Opportunities & Threats', 'alert-triangle', `${oatItems.length} items`, oatFdt.html);
                    }

                    // ── PROJECT SUMMARY (filterable) ──
                    const projects = (projectSummary.projects || []);
                    let prjFdt = null;
                    if (projects.length > 0) {
                        const prjHeaders = ['Group', 'Project', 'Customer', 'Programme', 'CRP Margin ($M)', 'CRP %', 'Onerous'];
                        const prjRows = projects.map(p => [p.group, p.project, p.customer, p.programme,
                        typeof p.current_crp_margin === 'number' ? p.current_crp_margin.toFixed(1) : '—',
                        typeof p.current_crp_pct === 'number' ? (p.current_crp_pct * 100).toFixed(1) + '%' : '—',
                        typeof p.onerous_provision === 'number' ? p.onerous_provision.toFixed(1) : '—']);
                        prjFdt = _filterableDataTable(prjHeaders, prjRows,
                            [{ col: 0, label: 'Group' }, { col: 2, label: 'Customer' }, { col: 3, label: 'Programme' }]);
                        html += _col('Project Summary', 'briefcase', `${projects.length} projects`, prjFdt.html);
                    }

                    contentEl.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();

                    // Wire up collapsible sections
                    contentEl.querySelectorAll('.opp-collapse-header').forEach(header => {
                        header.addEventListener('click', () => {
                            const targetId = header.getAttribute('data-target');
                            const body = document.getElementById(targetId);
                            const chevron = header.querySelector('.opp-collapse-chevron');
                            if (!body) return;
                            const isHidden = body.style.display === 'none';
                            body.style.display = isHidden ? 'block' : 'none';
                            if (chevron) chevron.classList.toggle('collapsed', !isHidden);
                        });
                    });

                    // Wire up filterable data tables
                    _wireFilterableDataTable(topFdt.containerId, topHeaders, topRows, { maxRows: 30 });
                    estFdts.forEach(fdt => _wireFilterableDataTable(fdt.containerId, fdt.headers, fdt.rows, { maxRows: 50 }));
                    if (oatFdt) _wireFilterableDataTable(oatFdt.containerId,
                        ['Project', 'Customer', 'Opportunity', 'Status', 'Owner', 'Pack Improvement', 'Due Date'],
                        oatItems.map(i => [i.project, i.customer, _truncate(String(i.opportunity || ''), 40),
                        i.status, i.owner, typeof i.overall_pack_improvement === 'number' ? _fmtNumber(i.overall_pack_improvement) : '—', i.due_date]));
                    if (prjFdt) _wireFilterableDataTable(prjFdt.containerId,
                        ['Group', 'Project', 'Customer', 'Programme', 'CRP Margin ($M)', 'CRP %', 'Onerous'],
                        projects.map(p => [p.group, p.project, p.customer, p.programme,
                        typeof p.current_crp_margin === 'number' ? p.current_crp_margin.toFixed(1) : '—',
                        typeof p.current_crp_pct === 'number' ? (p.current_crp_pct * 100).toFixed(1) + '%' : '—',
                        typeof p.onerous_provision === 'number' ? p.onerous_provision.toFixed(1) : '—']));

                    // Make tables sortable
                    _makeTablesSortable(contentEl);

                    // Render charts
                    setTimeout(() => {
                        _renderOppCharts({
                            typeChartId, statusChartId, custChartId, finChartId, pipeDonutId,
                            oppTypes, statusList, probLevels, probColors,
                            valueByTypeProbObj, valueByStatusProbObj,
                            custTop10, estLevels, byStatus
                        });
                    }, 100);
                };

                // ─── Initial render ───
                renderContent(masterRecords);

                // ─── Wire global filter bar ───
                if (window.lucide) window.lucide.createIcons();
                _wireGlobalFilterBar(filterBarId, cascadeData, (filters) => {
                    _registerFilterState('OPPORTUNITY_TRACKER', filters);
                    let filtered = masterRecords;
                    if (filters.customer) filtered = filtered.filter(r => r.customer === filters.customer);
                    if (filters.project) filtered = filtered.filter(r => r.project === filters.project);
                    if (filters.status) filtered = filtered.filter(r => r.status === filters.status);
                    if (filters.ext_probability) filtered = filtered.filter(r => r.ext_probability === filters.ext_probability);
                    if (filters.priority) filtered = filtered.filter(r => String(r.priority || '').replace('.0', '') === filters.priority);
                    if (filters.opportunity_type) filtered = filtered.filter(r => r.opportunity_type === filters.opportunity_type);
                    if (filters.min_value != null) filtered = filtered.filter(r => {
                        const v = (typeof r.sum_26_27 === 'number' && isFinite(r.sum_26_27)) ? r.sum_26_27 : 0;
                        return v >= filters.min_value;
                    });
                    renderContent(filtered);
                });
            }

            function _renderOppCharts(cfg) {
                const { typeChartId, statusChartId, custChartId, finChartId, pipeDonutId,
                    oppTypes, statusList, probLevels, probColors,
                    valueByTypeProbObj, valueByStatusProbObj,
                    custTop10, estLevels, byStatus } = cfg;

                // Text color constants for dark background
                const TXT = '#C8C6DD';
                const TXT_BRIGHT = '#E8E6F8';
                const GRID_COLOR = 'rgba(100,100,200,0.12)';

                // Shared config — NO theme.mode (it overrides custom colors!)
                const baseGrid = { borderColor: GRID_COLOR, strokeDashArray: 3 };
                const baseTip = {
                    theme: 'dark', style: { fontSize: '12px' },
                    marker: { show: true }
                };

                // ─── 1. Value by Opportunity Type × External Probability ───
                if ($(typeChartId) && oppTypes.length > 0) {
                    new ApexCharts($(typeChartId), {
                        chart: {
                            type: 'bar', height: 340, background: 'transparent',
                            foreColor: TXT, stacked: true, toolbar: { show: false }
                        },
                        series: probLevels.map(p => ({
                            name: p, data: oppTypes.map(t => +(valueByTypeProbObj[t]?.[p] || 0).toFixed(1))
                        })),
                        xaxis: {
                            categories: oppTypes.map(t => _truncate(t, 14)),
                            labels: { rotate: -30, style: { fontSize: '10px', colors: TXT } },
                            axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR }
                        },
                        colors: ['#4361EE', '#3A86FF', '#48BFE3'],
                        fill: { opacity: 1 },
                        plotOptions: { bar: { columnWidth: '65%', borderRadius: 4 } },
                        dataLabels: { enabled: false },
                        legend: {
                            position: 'top', fontSize: '11px', labels: { colors: TXT },
                            markers: { size: 8, radius: 3 }
                        },
                        yaxis: {
                            title: { text: '$M', style: { color: TXT } },
                            labels: {
                                formatter: v => '$' + v.toFixed(0) + 'm',
                                style: { colors: TXT }
                            }
                        },
                        tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                        grid: baseGrid,
                    }).render();
                }

                // ─── 2. Value by Status × External Probability ───
                const activeStatuses = statusList.filter(s =>
                    valueByStatusProbObj[s] && (valueByStatusProbObj[s].High + valueByStatusProbObj[s].Med + valueByStatusProbObj[s].Low) > 0);
                if ($(statusChartId) && activeStatuses.length > 0) {
                    new ApexCharts($(statusChartId), {
                        chart: {
                            type: 'bar', height: 340, background: 'transparent',
                            foreColor: TXT, stacked: true, toolbar: { show: false }
                        },
                        series: probLevels.map(p => ({
                            name: p, data: activeStatuses.map(s => +(valueByStatusProbObj[s]?.[p] || 0).toFixed(1))
                        })),
                        xaxis: {
                            categories: activeStatuses,
                            labels: { rotate: -30, style: { fontSize: '10px', colors: TXT } },
                            axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR }
                        },
                        colors: ['#4361EE', '#3A86FF', '#48BFE3'],
                        fill: { opacity: 1 },
                        plotOptions: { bar: { columnWidth: '60%', borderRadius: 4 } },
                        dataLabels: { enabled: false },
                        legend: { position: 'top', fontSize: '11px', labels: { colors: TXT } },
                        yaxis: {
                            title: { text: '$M', style: { color: TXT } },
                            labels: {
                                formatter: v => '$' + v.toFixed(0) + 'm',
                                style: { colors: TXT }
                            }
                        },
                        tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                        grid: baseGrid,
                    }).render();
                }

                // ─── 3. Customer Top 15 by Value (Horizontal Bar) ───
                if ($(custChartId) && custTop10.length > 0) {
                    const custColors = ['#48BFE3', '#4361EE', '#3A86FF', '#5E60CE', '#7400B8',
                        '#6930C3', '#64DFDF', '#80FFDB', '#56CFE1', '#72EFDD',
                        '#4EA8DE', '#5390D9', '#6D6875', '#48BFE3', '#4361EE'];
                    new ApexCharts($(custChartId), {
                        chart: {
                            type: 'bar', height: Math.max(380, custTop10.length * 30),
                            background: 'transparent', foreColor: TXT, toolbar: { show: false }
                        },
                        series: [{ name: 'Sum 26+27 ($M)', data: custTop10.map(c => +c[1].toFixed(1)) }],
                        xaxis: {
                            categories: custTop10.map(c => c[0]),
                            labels: { style: { colors: TXT_BRIGHT, fontSize: '11px' } },
                            axisBorder: { show: false }, axisTicks: { show: false }
                        },
                        colors: custColors,
                        fill: { opacity: 1 },
                        plotOptions: { bar: { horizontal: true, borderRadius: 5, distributed: true, barHeight: '65%' } },
                        dataLabels: {
                            enabled: true, formatter: v => '$' + v + 'm', offsetX: 18,
                            style: { fontSize: '11px', fontWeight: 600, colors: [TXT_BRIGHT] }
                        },
                        legend: { show: false },
                        yaxis: { labels: { style: { fontSize: '11px', colors: TXT_BRIGHT } } },
                        grid: {
                            borderColor: GRID_COLOR, strokeDashArray: 3,
                            xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } }
                        },
                        tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                    }).render();
                }

                // ─── 4. Financial Forecast by Estimation Level ───
                const levelEntries = Object.entries(estLevels);
                if ($(finChartId) && levelEntries.length > 0) {
                    const names = levelEntries.map(([l]) => l);
                    new ApexCharts($(finChartId), {
                        chart: {
                            type: 'bar', height: 340, background: 'transparent',
                            foreColor: TXT, toolbar: { show: false }
                        },
                        series: [
                            { name: 'Term ($M)', data: levelEntries.map(([, s]) => +(s.total_term_benefit || 0).toFixed(1)) },
                            { name: '2026 ($M)', data: levelEntries.map(([, s]) => +(s.total_2026 || 0).toFixed(1)) },
                            { name: '2027 ($M)', data: levelEntries.map(([, s]) => +(s.total_2027 || 0).toFixed(1)) },
                        ],
                        xaxis: {
                            categories: names,
                            labels: { style: { colors: TXT } },
                            axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR }
                        },
                        colors: ['#FF8B42', '#4361EE', '#00E396'],
                        fill: { opacity: 1 },
                        plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 5 } },
                        dataLabels: {
                            enabled: true, formatter: v => '$' + v + 'm',
                            style: { fontSize: '10px', colors: [TXT_BRIGHT] }
                        },
                        legend: { position: 'top', fontSize: '11px', labels: { colors: TXT } },
                        yaxis: { labels: { formatter: v => '$' + v + 'm', style: { colors: TXT } } },
                        tooltip: { ...baseTip, y: { formatter: v => '$' + v + 'm' } },
                        grid: baseGrid,
                    }).render();
                }

                // ─── 5. Pipeline Status Donut ───
                const statusColors = {
                    'Completed': '#00E396', 'Contracting': '#3A86FF', 'Negotiations': '#FFB547',
                    'ICT': '#B39DDB', 'Hopper': '#48BFE3', 'Cancelled': '#FF4560',
                };
                const statusLabels = Object.keys(byStatus).filter(s => byStatus[s] > 0);
                const statusValues = statusLabels.map(s => byStatus[s]);
                if ($(pipeDonutId) && statusLabels.length > 0) {
                    new ApexCharts($(pipeDonutId), {
                        chart: {
                            type: 'donut', height: 340, background: 'transparent',
                            foreColor: TXT, toolbar: { show: false }
                        },
                        series: statusValues,
                        labels: statusLabels,
                        colors: statusLabels.map(l => statusColors[l] || '#6B67A0'),
                        fill: { opacity: 1 },
                        plotOptions: {
                            pie: {
                                donut: {
                                    size: '58%',
                                    labels: {
                                        show: true,
                                        name: { color: TXT_BRIGHT, fontSize: '13px' },
                                        value: { color: TXT_BRIGHT, fontSize: '20px', fontWeight: 700 },
                                        total: {
                                            show: true, label: 'Total', color: TXT, fontSize: '13px',
                                            fontWeight: 600,
                                            formatter: w => w.globals.seriesTotals.reduce((a, b) => a + b, 0)
                                        }
                                    }
                                }
                            }
                        },
                        stroke: { show: true, width: 2, colors: ['#0A0842'] },
                        dataLabels: {
                            enabled: true, formatter: val => val.toFixed(0) + '%',
                            style: { fontSize: '11px', colors: [TXT_BRIGHT] },
                            dropShadow: { enabled: false }
                        },
                        legend: {
                            position: 'bottom', fontSize: '11px', labels: { colors: TXT },
                            markers: { radius: 3 }
                        },
                    }).render();
                }
            }

            // ═══════════════════════════════════════════════════
            // SHOP VISIT RENDERER
            // ═══════════════════════════════════════════════════

            function _renderShopVisit(el, data, fname) {
                const esc = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const meta = data.metadata || {};
                const masterSV = data.shop_visits || [];
                const maintenance = data.maintenance_actions || [];
                const currentStatus = data.current_status || [];
                const stats = data.statistics || {};

                const uniqueOperators = [...new Set(masterSV.map(s => s.operator).filter(Boolean))].sort();
                const uniqueSVTypes = [...new Set(masterSV.map(s => s.sv_type).filter(Boolean))].sort();
                const uniqueSVLocs = [...new Set(masterSV.map(s => s.sv_location).filter(Boolean))].sort();
                const uniqueYears = [...new Set(masterSV.map(sv => {
                    const d = sv.event_datetime || sv.event_date;
                    if (!d) return null;
                    const y = String(d).slice(0, 4);
                    return /^\d{4}$/.test(y) ? y : null;
                }).filter(Boolean))].sort();

                const { html: filterBarHtml, barId: filterBarId } = _globalFilterBar({
                    fields: [
                        { key: 'operator', label: 'Operator', values: uniqueOperators },
                        { key: 'sv_type', label: 'SV Type', values: uniqueSVTypes },
                        { key: 'sv_location', label: 'Location', values: uniqueSVLocs },
                        { key: 'year', label: 'Year', values: uniqueYears },
                    ],
                });

                const contentId = `sv-content-${Date.now()}`;
                el.innerHTML = `${filterBarHtml}<div id="${contentId}"></div>`;
                const barEl = document.getElementById(filterBarId);
                if (barEl) barEl.classList.add('gfb-light');

                const resetFilters = () => {
                    if (!barEl) return;
                    barEl.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    renderContent(masterSV);
                };

                const renderContent = (filteredSV) => {
                    const contentEl = $(contentId);
                    if (!contentEl) return;

                    if (!filteredSV || filteredSV.length === 0) {
                        _renderEmptyState(contentEl, { onReset: resetFilters, message: 'No shop visits match the current filters.' });
                        return;
                    }

                    // Recompute stats from filtered
                    const svTypeCounts = {};
                    const svLocCounts = {};
                    const byYear = {};
                    const byOperator = {};
                    filteredSV.forEach(sv => {
                        if (sv.sv_type) svTypeCounts[sv.sv_type] = (svTypeCounts[sv.sv_type] || 0) + 1;
                        if (sv.sv_location) svLocCounts[sv.sv_location] = (svLocCounts[sv.sv_location] || 0) + 1;
                        if (sv.operator) byOperator[sv.operator] = (byOperator[sv.operator] || 0) + 1;
                        const d = sv.event_datetime || sv.event_date;
                        if (d) {
                            const y = String(d).slice(0, 4);
                            if (/^\d{4}$/.test(y)) byYear[y] = (byYear[y] || 0) + 1;
                        }
                    });

                    const totalMaintFiltered = filteredSV.length === masterSV.length
                        ? (stats.total_maintenance || maintenance.length)
                        : maintenance.length; // heuristic; parser-provided if unfiltered

                    let html = '';
                    html += _sectionHeader('Trent Engine Shop Visit History', 'wrench', { badge: 'SHOP VISIT', badgeColor: COLORS.orange });

                    html += '<div class="viz-customer-bar">';
                    html += `<div class="viz-info-chip"><b>Source:</b> ${esc(_safe(meta.source_file))}</div>`;
                    if (meta.engine_models && meta.engine_models.length) html += `<div class="viz-info-chip"><b>Engine Models:</b> ${esc(meta.engine_models.join(', '))}</div>`;
                    html += `<div class="viz-info-chip"><b>Operators:</b> ${Object.keys(byOperator).length}</div>`;
                    if (uniqueYears.length) html += `<div class="viz-info-chip"><b>Period:</b> ${esc(uniqueYears[0])}–${esc(uniqueYears[uniqueYears.length - 1])}</div>`;
                    html += '</div>';

                    html += '<div class="viz-kpi-grid viz-kpi-grid-4">';
                    const uniqueSerials = new Set(filteredSV.map(s => s.serial_number).filter(Boolean));
                    html += _kpiCard('Engines Tracked', _fmtNumber(uniqueSerials.size || meta.total_engines), { icon: 'disc' });
                    html += _kpiCard('Shop Visits', _fmtNumber(filteredSV.length), { icon: 'wrench', colorClass: 'kpi-warning' });
                    html += _kpiCard('Maintenance Actions', _fmtNumber(totalMaintFiltered), { icon: 'settings' });
                    html += _kpiCard('Current Status', _fmtNumber(currentStatus.length), { icon: 'activity', colorClass: 'kpi-success' });
                    html += '</div>';

                    // Row 1: type donut + location bar
                    const svTypeId = `sv-type-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const svLocId = `sv-loc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-2">
                    <div class="viz-chart-card"><div class="viz-chart-header">Shop Visit Types</div><div id="${svTypeId}" class="viz-chart-body"></div></div>
                    <div class="viz-chart-card"><div class="viz-chart-header">Shop Visit Locations</div><div id="${svLocId}" class="viz-chart-body"></div></div>
                </div>`;

                    // Row 2: events-by-year + top operators
                    const yearChartId = `sv-year-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const topOpId = `sv-topop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-2">
                    <div class="viz-chart-card"><div class="viz-chart-header">Events by Year</div><div id="${yearChartId}" class="viz-chart-body"></div></div>
                    <div class="viz-chart-card"><div class="viz-chart-header">Top 10 Operators by Visits</div><div id="${topOpId}" class="viz-chart-body"></div></div>
                </div>`;

                    // Row 3: Engine lifeline timeline (full-width)
                    const lifelineId = `sv-lifeline-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    html += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
                    <div class="viz-chart-card"><div class="viz-chart-header">Engine Lifeline — Shop Visits Over Time (by serial)</div><div id="${lifelineId}" class="viz-chart-body"></div></div>
                </div>`;

                    html += _sectionHeader('Shop Visit Events', 'table');
                    const headers = ['Serial No.', 'Event Date', 'Operator', 'Action Code', 'Rework Level', 'SV Type', 'SV Location', 'HSN', 'CSN'];
                    const rows = filteredSV.map(sv => [sv.serial_number, sv.event_datetime, sv.operator, sv.action_code, sv.rework_level, sv.sv_type, sv.sv_location, sv.hsn, sv.csn]);
                    const fdt = _filterableDataTable(headers, rows,
                        [{ col: 2, label: 'Operator' }, { col: 5, label: 'SV Type' }, { col: 6, label: 'Location' }], { maxRows: 150 });
                    const csvId = `sv-csv-${Date.now()}`;
                    html += `<div style="display:flex;justify-content:flex-end;margin:-28px 0 4px">${_csvButton(csvId, 'Download CSV')}</div>`;
                    html += fdt.html;

                    if (currentStatus.length > 0) {
                        html += _sectionHeader('Current Engine Status', 'activity');
                        const csHeaders = ['Serial No.', 'Part Number', 'Operator', 'Registration', 'HSN', 'CSN'];
                        const csRows = currentStatus.map(s => [s.serial_number, s.part_number, s.operator, s.registration, s.hsn, s.csn]);
                        html += _dataTable(csHeaders, csRows);
                    }

                    contentEl.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                    _wireFilterableDataTable(fdt.containerId, headers, rows, { maxRows: 150 });
                    _makeTablesSortable(contentEl);
                    _wireCSVButton(csvId, 'shop_visits_export.csv', headers, () => rows);

                    setTimeout(() => {
                        if (Object.keys(svTypeCounts).length > 0) {
                            _renderChart(svTypeId, {
                                chart: { type: 'donut', height: 280, background: 'transparent' },
                                series: Object.values(svTypeCounts),
                                labels: Object.keys(svTypeCounts),
                                colors: [COLORS.orange, COLORS.amber, COLORS.teal, COLORS.blue2, COLORS.purple],
                                plotOptions: { pie: { donut: { size: '62%' } } },
                                dataLabels: { enabled: false },
                                legend: { position: 'bottom' },
                            });
                        }
                        if (Object.keys(svLocCounts).length > 0) {
                            _renderChart(svLocId, {
                                chart: { type: 'bar', height: 280, background: 'transparent', toolbar: { show: false } },
                                series: [{ name: 'Visits', data: Object.values(svLocCounts) }],
                                xaxis: { categories: Object.keys(svLocCounts).map(l => _truncate(l, 15)) },
                                colors: [COLORS.orange],
                                plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                                dataLabels: { enabled: false },
                                legend: { show: false },
                            });
                        }
                        // Events by Year
                        const yearKeys = Object.keys(byYear).sort();
                        if (yearKeys.length > 0) {
                            _renderChart(yearChartId, {
                                chart: { type: 'bar', height: 280, background: 'transparent', toolbar: { show: false } },
                                series: [{ name: 'Events', data: yearKeys.map(k => byYear[k]) }],
                                xaxis: { categories: yearKeys },
                                colors: [COLORS.blue2],
                                plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
                                dataLabels: { enabled: true, style: { fontSize: '11px' } },
                            });
                        }
                        // Top 10 Operators
                        const opSorted = Object.entries(byOperator).sort((a, b) => b[1] - a[1]).slice(0, 10);
                        if (opSorted.length > 0) {
                            _renderChart(topOpId, {
                                chart: { type: 'bar', height: Math.max(280, opSorted.length * 28 + 40), background: 'transparent', toolbar: { show: false } },
                                series: [{ name: 'Visits', data: opSorted.map(o => o[1]) }],
                                xaxis: { categories: opSorted.map(o => _truncate(o[0], 20)) },
                                colors: [COLORS.teal],
                                plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%', distributed: true } },
                                dataLabels: { enabled: true, style: { fontSize: '11px' } },
                                legend: { show: false },
                            });
                        }
                        // Engine lifeline scatter: x=date, y=serial
                        _renderShopVisitLifeline(lifelineId, filteredSV);
                    }, 50);
                };

                renderContent(masterSV);
                _wireGlobalFilterBar(filterBarId, null, (filters) => {
                    _registerFilterState('SHOP_VISIT', filters);
                    let filtered = masterSV;
                    if (filters.operator) filtered = filtered.filter(s => s.operator === filters.operator);
                    if (filters.sv_type) filtered = filtered.filter(s => s.sv_type === filters.sv_type);
                    if (filters.sv_location) filtered = filtered.filter(s => s.sv_location === filters.sv_location);
                    if (filters.year) filtered = filtered.filter(s => {
                        const d = s.event_datetime || s.event_date;
                        return d && String(d).slice(0, 4) === filters.year;
                    });
                    renderContent(filtered);
                });
            }

            function _renderShopVisitLifeline(id, shopVisits) {
                // Group visits by serial_number; build a scatter where each point is (date, serial-index).
                const bySerial = {};
                shopVisits.forEach(sv => {
                    const s = sv.serial_number || 'Unknown';
                    if (!bySerial[s]) bySerial[s] = [];
                    const d = sv.event_datetime || sv.event_date;
                    if (!d) return;
                    const ts = Date.parse(d);
                    if (isNaN(ts)) return;
                    bySerial[s].push({ x: ts, y: s, type: sv.sv_type || 'SV', location: sv.sv_location });
                });
                const serials = Object.keys(bySerial).sort();
                if (serials.length === 0) return;
                // Limit to top 30 serials by visit count for readability
                const top = serials.sort((a, b) => bySerial[b].length - bySerial[a].length).slice(0, 30);
                // ApexCharts scatter with string y-axis works via category y axis
                const series = [{
                    name: 'Shop Visit',
                    data: [].concat(...top.map(s => bySerial[s].map(p => ({ x: p.x, y: s, meta: p }))))
                }];
                _renderChart(id, {
                    chart: { type: 'scatter', height: Math.max(360, top.length * 22 + 80), background: 'transparent', zoom: { enabled: true, type: 'x' }, toolbar: { show: false } },
                    series: series,
                    xaxis: { type: 'datetime', labels: { style: { fontSize: '11px' } } },
                    yaxis: { type: 'category', categories: top, labels: { style: { fontSize: '10px' } } },
                    colors: [COLORS.orange],
                    markers: { size: 6, strokeWidth: 1, hover: { size: 8 } },
                    tooltip: {
                        custom: ({ seriesIndex, dataPointIndex, w }) => {
                            const p = w.config.series[seriesIndex].data[dataPointIndex];
                            const dt = new Date(p.x).toLocaleDateString();
                            return `<div style="padding:8px 10px"><b>${p.y}</b><br/>${dt}<br/>${(p.meta && p.meta.type) || ''}${p.meta && p.meta.location ? ' @ ' + p.meta.location : ''}</div>`;
                        }
                    },
                    grid: { strokeDashArray: 3 },
                });
            }

            // ═══════════════════════════════════════════════════
            // SVRG MASTER RENDERER
            // ═══════════════════════════════════════════════════

            function _renderSVRG(el, data, fname) {
                const esc = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const meta = data.metadata || {};

                // Parser contracts supported (new spec + legacy fall-through):
                const engines = (data.engines && data.engines.items) || data.engines_items || [];
                const shopVisits = (data.shop_visits && data.shop_visits.items) || [];
                const hoursCycles = (data.hours_cycles && data.hours_cycles.summary) || {};
                const flightHours = (data.flight_hours && data.flight_hours.items) || [];
                const svrgSummary = data.svrg_summary || {};

                // Legacy shape (old parser): claims_summary/event_entries
                const claimsLegacy = (data.claims && data.claims.items) || (data.claims_summary && data.claims_summary.claims) || [];
                const eventsLegacy = (data.events && data.events.items) || (data.event_entries && data.event_entries.events) || [];

                const masterClaims = claimsLegacy;
                const masterEvents = eventsLegacy;

                // Filters — guarantee (claims/events), qualification (events), year (claims)
                const uniqueGuarantees = [...new Set([
                    ...masterClaims.map(c => c.guarantee),
                    ...masterEvents.map(e => e.guarantee_coverage)
                ].filter(Boolean))].sort();
                const uniqueQualifications = [...new Set(masterEvents.map(e => e.qualification).filter(Boolean))].sort();
                const uniqueYears = [...new Set(masterClaims.map(c => c.year).filter(Boolean))].sort();
                const uniqueEngineFamilies = [...new Set(engines.map(e => e.engine_family || e.family || e.engine_model).filter(Boolean))].sort();
                const uniqueEngineStatuses = [...new Set(engines.map(e => e.status).filter(Boolean))].sort();

                const filterFields = [];
                if (uniqueEngineFamilies.length > 0) filterFields.push({ key: 'engine_family', label: 'Engine Family', values: uniqueEngineFamilies });
                if (uniqueGuarantees.length > 0) filterFields.push({ key: 'guarantee', label: 'Guarantee', values: uniqueGuarantees });
                if (uniqueQualifications.length > 0) filterFields.push({ key: 'qualification', label: 'Qualification', values: uniqueQualifications });
                if (uniqueYears.length > 0) filterFields.push({ key: 'year', label: 'Year', values: uniqueYears });

                const { html: filterBarHtml, barId: filterBarId } = _globalFilterBar({ fields: filterFields });

                const contentId = `svrg-content-${Date.now()}`;
                el.innerHTML = `${filterBarHtml}<div id="${contentId}"></div>`;
                const barEl = document.getElementById(filterBarId);
                if (barEl) barEl.classList.add('gfb-light');

                const resetFilters = () => {
                    if (!barEl) return;
                    barEl.querySelectorAll('.opp-gfb-select').forEach(s => { s.value = ''; });
                    barEl.querySelectorAll('.opp-gfb-input').forEach(i => { i.value = ''; });
                    renderContent({ engines, shopVisits, flightHours, claims: masterClaims, events: masterEvents });
                };

                const renderContent = (filtered) => {
                    const contentEl = $(contentId);
                    if (!contentEl) return;

                    const fEngines = filtered.engines || [];
                    const fSV = filtered.shopVisits || [];
                    const fFH = filtered.flightHours || [];
                    const fClaims = filtered.claims || [];
                    const fEvents = filtered.events || [];

                    const totalRows = fEngines.length + fSV.length + fFH.length + fClaims.length + fEvents.length;
                    if (totalRows === 0) {
                        _renderEmptyState(contentEl, { onReset: resetFilters, message: 'No SVRG data matches the current filters.' });
                        return;
                    }

                    const qualCounts = {};
                    fEvents.forEach(e => {
                        const q = e.qualification || 'Unknown';
                        qualCounts[q] = (qualCounts[q] || 0) + 1;
                    });
                    const qualifiedCount = qualCounts['Qualified'] || qualCounts['qualified'] || 0;
                    const totalCreditVal = fClaims.reduce((s, c) => s + (c.credit_value || 0), 0);
                    const currency = meta.currency || 'USD';

                    let html = '';
                    html += _sectionHeader('SVRG Master — Service Valuation, Reliability & Guarantees', 'shield-check', { badge: 'SVRG', badgeColor: COLORS.purple });

                    html += '<div class="viz-customer-bar">';
                    if (meta.customer) html += `<div class="viz-info-chip"><b>Customer:</b> ${esc(meta.customer)}</div>`;
                    if (meta.engine_model) html += `<div class="viz-info-chip"><b>Engine Model:</b> ${esc(meta.engine_model)}</div>`;
                    html += `<div class="viz-info-chip"><b>Source:</b> ${esc(_safe(meta.source_file))}</div>`;
                    html += '</div>';

                    // Headline KPIs
                    html += '<div class="viz-kpi-grid viz-kpi-grid-5">';
                    html += _kpiCard('Total Engines', _fmtNumber(fEngines.length), { icon: 'disc' });
                    html += _kpiCard('Shop Visits', _fmtNumber(fSV.length), { icon: 'wrench', colorClass: 'kpi-warning' });
                    html += _kpiCard('Claims', _fmtNumber(fClaims.length), { icon: 'file-check' });
                    html += _kpiCard('Total Credit Value', _fmtMoney(totalCreditVal, currency), { icon: 'credit-card', colorClass: 'kpi-success' });
                    html += _kpiCard('Qualified Events', _fmtNumber(qualifiedCount), { icon: 'check-circle', colorClass: 'kpi-success', subtitle: `of ${fEvents.length} total` });
                    html += '</div>';

                    // Tab navigation
                    const tabsId = `svrg-tabs-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const tabs = [
                        { key: 'engines', label: 'Engine Fleet', icon: 'disc', count: fEngines.length },
                        { key: 'shop_visits', label: 'Shop Visits', icon: 'wrench', count: fSV.length },
                        { key: 'flight_hours', label: 'Flight Hours', icon: 'plane', count: fFH.length },
                        { key: 'claims_events', label: 'Claims & Events', icon: 'file-check', count: fClaims.length + fEvents.length },
                    ];
                    html += `<div class="svrg-tabs" id="${tabsId}" style="display:flex;gap:4px;border-bottom:2px solid rgba(100,100,200,0.15);margin:24px 0 16px;flex-wrap:wrap">`;
                    tabs.forEach((t, i) => {
                        html += `<button type="button" class="svrg-tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}" style="display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border:0;background:${i === 0 ? 'rgba(94,53,177,0.1)' : 'transparent'};color:${i === 0 ? '#5E35B1' : '#6B6B8A'};border-bottom:2px solid ${i === 0 ? '#5E35B1' : 'transparent'};margin-bottom:-2px;font-size:13px;font-weight:600;cursor:pointer;border-radius:8px 8px 0 0">
                            <i data-lucide="${t.icon}" style="width:14px;height:14px"></i> ${esc(t.label)} <span style="opacity:0.7;font-size:11px">(${t.count})</span>
                        </button>`;
                    });
                    html += `</div>`;

                    // Tab panels
                    const panelIds = {
                        engines: `svrg-pnl-eng-${Date.now()}`,
                        shop_visits: `svrg-pnl-sv-${Date.now()}`,
                        flight_hours: `svrg-pnl-fh-${Date.now()}`,
                        claims_events: `svrg-pnl-ce-${Date.now()}`,
                    };

                    // PANEL: Engines
                    let pEng = '';
                    if (fEngines.length > 0) {
                        const byFamily = {};
                        const byStatus = {};
                        fEngines.forEach(e => {
                            const f = e.engine_family || e.family || e.engine_model || 'Unknown';
                            byFamily[f] = (byFamily[f] || 0) + 1;
                            if (e.status) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
                        });
                        const famDonutId = `svrg-fam-${Date.now()}`;
                        const statDonutId = `svrg-stat-${Date.now()}`;
                        pEng += `<div class="viz-kpi-grid viz-kpi-grid-3" style="margin-bottom:16px">
                            ${_kpiCard('Engines by Family', Object.keys(byFamily).length, { icon: 'layers' })}
                            ${_kpiCard('Engines by Status', Object.keys(byStatus).length, { icon: 'activity' })}
                            ${_kpiCard('Total Engines', fEngines.length, { icon: 'disc', colorClass: 'kpi-success' })}
                        </div>`;
                        pEng += `<div class="viz-chart-grid viz-chart-grid-2">
                            <div class="viz-chart-card"><div class="viz-chart-header">Engine Family Distribution</div><div id="${famDonutId}" class="viz-chart-body"></div></div>
                            <div class="viz-chart-card"><div class="viz-chart-header">Engine Status Breakdown</div><div id="${statDonutId}" class="viz-chart-body"></div></div>
                        </div>`;
                        // Table + CSV
                        const engHeaders = ['Serial No.', 'Family', 'Model', 'Status', 'Operator', 'Registration', 'HSN', 'CSN'];
                        const engRows = fEngines.map(e => [
                            e.serial_number || e.serial || '', e.engine_family || e.family || '',
                            e.engine_model || e.model || '', e.status || '', e.operator || '',
                            e.registration || '', e.hsn || '', e.csn || ''
                        ]);
                        const engCsvId = `svrg-eng-csv-${Date.now()}`;
                        pEng += `<div style="display:flex;justify-content:flex-end;margin:8px 0 4px">${_csvButton(engCsvId, 'Download CSV')}</div>`;
                        pEng += _dataTable(engHeaders, engRows, { maxRows: 200 });
                        setTimeout(() => {
                            _renderChart(famDonutId, {
                                chart: { type: 'donut', height: 280 }, series: Object.values(byFamily),
                                labels: Object.keys(byFamily),
                                colors: [COLORS.purple, COLORS.blue2, COLORS.teal, COLORS.orange, COLORS.green],
                                plotOptions: { pie: { donut: { size: '62%' } } }, legend: { position: 'bottom' },
                                dataLabels: { enabled: false },
                            });
                            if (Object.keys(byStatus).length > 0) {
                                _renderChart(statDonutId, {
                                    chart: { type: 'donut', height: 280 }, series: Object.values(byStatus),
                                    labels: Object.keys(byStatus),
                                    colors: [COLORS.green, COLORS.orange, COLORS.red, COLORS.silver, COLORS.navy],
                                    plotOptions: { pie: { donut: { size: '62%' } } }, legend: { position: 'bottom' },
                                    dataLabels: { enabled: false },
                                });
                            }
                            _wireCSVButton(engCsvId, 'svrg_engines.csv', engHeaders, () => engRows);
                        }, 80);
                    } else {
                        pEng = '<p class="viz-empty-msg" style="padding:24px;text-align:center;color:#6b6b8a">No engine fleet data available.</p>';
                    }

                    // PANEL: Shop Visits
                    let pSV = '';
                    if (fSV.length > 0) {
                        const svTimelineId = `svrg-svtl-${Date.now()}`;
                        pSV += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
                            <div class="viz-chart-card"><div class="viz-chart-header">Shop Visits — Engine × Date</div><div id="${svTimelineId}" class="viz-chart-body"></div></div>
                        </div>`;
                        const svHeaders = ['Engine Serial', 'Date', 'Family', 'Location', 'Type', 'Duration (days)', 'Notes'];
                        const svRows = fSV.map(s => [
                            s.engine_serial || s.serial_number || '', s.date || s.sv_date || '',
                            s.engine_family || s.family || '', s.location || s.sv_location || '',
                            s.type || s.sv_type || '', s.duration_days || s.duration || '',
                            _truncate(s.notes || s.description || '', 40)
                        ]);
                        const svCsvId = `svrg-sv-csv-${Date.now()}`;
                        pSV += `<div style="display:flex;justify-content:flex-end;margin:8px 0 4px">${_csvButton(svCsvId, 'Download CSV')}</div>`;
                        pSV += _dataTable(svHeaders, svRows, { maxRows: 200 });
                        setTimeout(() => {
                            _renderShopVisitLifeline(svTimelineId, fSV.map(s => ({
                                serial_number: s.engine_serial || s.serial_number,
                                event_datetime: s.date || s.sv_date,
                                sv_type: s.type || s.sv_type,
                                sv_location: s.location || s.sv_location,
                            })));
                            _wireCSVButton(svCsvId, 'svrg_shop_visits.csv', svHeaders, () => svRows);
                        }, 80);
                    } else {
                        pSV = '<p class="viz-empty-msg" style="padding:24px;text-align:center;color:#6b6b8a">No shop-visit history in this SVRG file.</p>';
                    }

                    // PANEL: Flight Hours
                    let pFH = '';
                    if (fFH.length > 0) {
                        const fhChartId = `svrg-fh-${Date.now()}`;
                        pFH += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
                            <div class="viz-chart-card"><div class="viz-chart-header">Annual Flight Hours by Engine Family</div><div id="${fhChartId}" class="viz-chart-body"></div></div>
                        </div>`;
                        // Hours/Cycles summary KPIs
                        if (Object.keys(hoursCycles).length > 0) {
                            pFH += '<div class="viz-kpi-grid viz-kpi-grid-4">';
                            ['total_hours', 'total_cycles', 'avg_hours', 'avg_cycles'].forEach(k => {
                                if (hoursCycles[k] != null) {
                                    pFH += _kpiCard(k.replace(/_/g, ' '), _fmtNumber(hoursCycles[k]), { icon: 'activity' });
                                }
                            });
                            pFH += '</div>';
                        }
                        const fhHeaders = ['Year', 'Engine Serial', 'Family', 'Flight Hours', 'Cycles'];
                        const fhRows = fFH.map(f => [
                            f.year || '', f.engine_serial || f.serial_number || '',
                            f.engine_family || f.family || '',
                            f.flight_hours || f.hours || 0, f.cycles || 0
                        ]);
                        const fhCsvId = `svrg-fh-csv-${Date.now()}`;
                        pFH += `<div style="display:flex;justify-content:flex-end;margin:8px 0 4px">${_csvButton(fhCsvId, 'Download CSV')}</div>`;
                        pFH += _dataTable(fhHeaders, fhRows, { maxRows: 200 });
                        setTimeout(() => {
                            // Aggregate flight hours by year × family
                            const byYearFam = {};
                            const families = new Set();
                            fFH.forEach(f => {
                                const y = String(f.year || '').slice(0, 4);
                                const fam = f.engine_family || f.family || 'Unknown';
                                if (!y || !/^\d{4}$/.test(y)) return;
                                families.add(fam);
                                if (!byYearFam[y]) byYearFam[y] = {};
                                byYearFam[y][fam] = (byYearFam[y][fam] || 0) + (f.flight_hours || f.hours || 0);
                            });
                            const years = Object.keys(byYearFam).sort();
                            const famList = [...families];
                            const series = famList.map(fam => ({
                                name: fam,
                                data: years.map(y => Math.round((byYearFam[y][fam] || 0) * 10) / 10),
                            }));
                            if (years.length > 0) {
                                _renderChart(fhChartId, {
                                    chart: { type: 'line', height: 340, toolbar: { show: false } },
                                    series,
                                    xaxis: { categories: years },
                                    colors: [COLORS.purple, COLORS.blue2, COLORS.teal, COLORS.orange, COLORS.green, COLORS.red],
                                    stroke: { width: 3, curve: 'smooth' },
                                    dataLabels: { enabled: false },
                                    legend: { position: 'top' },
                                    tooltip: { y: { formatter: v => _fmtNumber(v) + ' hrs' } },
                                });
                            }
                            _wireCSVButton(fhCsvId, 'svrg_flight_hours.csv', fhHeaders, () => fhRows);
                        }, 80);
                    } else {
                        pFH = '<p class="viz-empty-msg" style="padding:24px;text-align:center;color:#6b6b8a">No flight-hours data in this SVRG file.</p>';
                    }

                    // PANEL: Claims + Events
                    let pCE = '';
                    const claimsChartId = `svrg-claims-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    const qualChartId = `svrg-qual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
                    if (fClaims.length > 0 || fEvents.length > 0) {
                        pCE += `<div class="viz-chart-grid viz-chart-grid-2">
                            <div class="viz-chart-card"><div class="viz-chart-header">Claims Over Time</div><div id="${claimsChartId}" class="viz-chart-body"></div></div>
                            <div class="viz-chart-card"><div class="viz-chart-header">Event Qualification</div><div id="${qualChartId}" class="viz-chart-body"></div></div>
                        </div>`;
                    }
                    let cFdtMeta = null, eFdtMeta = null;
                    if (fClaims.length > 0) {
                        pCE += _sectionHeader('Claims Summary', 'table');
                        const cHeaders = ['Date', 'Year', 'Credit Ref', 'Guarantee', 'Credit Value', 'Cumulative'];
                        const cRows = fClaims.map(c => [c.date, c.year, c.credit_ref, c.guarantee, c.credit_value, c.cumulative_value]);
                        const cFdt = _filterableDataTable(cHeaders, cRows,
                            [{ col: 3, label: 'Guarantee' }, { col: 1, label: 'Year' }]);
                        const claimsCsv = `svrg-claims-csv-${Date.now()}`;
                        pCE += `<div style="display:flex;justify-content:flex-end;margin:-28px 0 4px">${_csvButton(claimsCsv, 'Download CSV')}</div>`;
                        pCE += cFdt.html;
                        cFdtMeta = { containerId: cFdt.containerId, headers: cHeaders, rows: cRows, csvId: claimsCsv };
                    }
                    if (fEvents.length > 0) {
                        pCE += _sectionHeader('Event Entries', 'clipboard-list');
                        const eHeaders = ['Event Type', 'Date', 'Engine Serial', 'Aircraft', 'Description', 'Qualification', 'Coverage'];
                        const eRows = fEvents.map(e => [e.event_type, e.date, e.engine_serial, e.aircraft, _truncate(e.description, 40), e.qualification, e.guarantee_coverage]);
                        const eFdt = _filterableDataTable(eHeaders, eRows,
                            [{ col: 5, label: 'Qualification' }, { col: 6, label: 'Coverage' }]);
                        const eventsCsv = `svrg-events-csv-${Date.now()}`;
                        pCE += `<div style="display:flex;justify-content:flex-end;margin:-28px 0 4px">${_csvButton(eventsCsv, 'Download CSV')}</div>`;
                        pCE += eFdt.html;
                        eFdtMeta = { containerId: eFdt.containerId, headers: eHeaders, rows: eRows, csvId: eventsCsv };
                    }
                    if (fClaims.length === 0 && fEvents.length === 0) {
                        pCE = '<p class="viz-empty-msg" style="padding:24px;text-align:center;color:#6b6b8a">No claims or events in this SVRG file.</p>';
                    }

                    // Assemble panels (only first visible)
                    html += `<div class="svrg-panels">
                        <div class="svrg-panel" id="${panelIds.engines}" data-tab="engines">${pEng}</div>
                        <div class="svrg-panel" id="${panelIds.shop_visits}" data-tab="shop_visits" style="display:none">${pSV}</div>
                        <div class="svrg-panel" id="${panelIds.flight_hours}" data-tab="flight_hours" style="display:none">${pFH}</div>
                        <div class="svrg-panel" id="${panelIds.claims_events}" data-tab="claims_events" style="display:none">${pCE}</div>
                    </div>`;

                    contentEl.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                    _makeTablesSortable(contentEl);

                    // Wire tabs
                    const tabsEl = document.getElementById(tabsId);
                    if (tabsEl) {
                        tabsEl.querySelectorAll('.svrg-tab-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const key = btn.dataset.tab;
                                tabsEl.querySelectorAll('.svrg-tab-btn').forEach(b => {
                                    b.classList.remove('active');
                                    b.style.background = 'transparent';
                                    b.style.color = '#6B6B8A';
                                    b.style.borderBottomColor = 'transparent';
                                });
                                btn.classList.add('active');
                                btn.style.background = 'rgba(94,53,177,0.1)';
                                btn.style.color = '#5E35B1';
                                btn.style.borderBottomColor = '#5E35B1';
                                contentEl.querySelectorAll('.svrg-panel').forEach(p => {
                                    p.style.display = p.dataset.tab === key ? '' : 'none';
                                });
                            });
                        });
                    }

                    // Wire filterable tables + CSV
                    if (cFdtMeta) {
                        _wireFilterableDataTable(cFdtMeta.containerId, cFdtMeta.headers, cFdtMeta.rows);
                        _wireCSVButton(cFdtMeta.csvId, 'svrg_claims.csv', cFdtMeta.headers, () => cFdtMeta.rows);
                    }
                    if (eFdtMeta) {
                        _wireFilterableDataTable(eFdtMeta.containerId, eFdtMeta.headers, eFdtMeta.rows);
                        _wireCSVButton(eFdtMeta.csvId, 'svrg_events.csv', eFdtMeta.headers, () => eFdtMeta.rows);
                    }

                    // Charts: claims timeline + qualification donut
                    setTimeout(() => {
                        if (fClaims.length > 0 && document.getElementById(claimsChartId)) {
                            const claimDates = fClaims.filter(c => c.date).map(c => c.date);
                            const claimValues = fClaims.filter(c => c.date).map(c => c.credit_value || 0);
                            const cumValues = fClaims.filter(c => c.date).map(c => c.cumulative_value || 0);
                            _renderChart(claimsChartId, {
                                chart: { type: 'line', height: 280, background: 'transparent', toolbar: { show: false } },
                                series: [
                                    { name: 'Credit Value', type: 'column', data: claimValues },
                                    { name: 'Cumulative', type: 'line', data: cumValues },
                                ],
                                xaxis: { categories: claimDates, labels: { rotate: -45, style: { fontSize: '10px' } } },
                                colors: [COLORS.purple, COLORS.navy],
                                stroke: { width: [0, 3] },
                                plotOptions: { bar: { columnWidth: '50%', borderRadius: 3 } },
                                dataLabels: { enabled: false },
                                legend: { position: 'top' },
                                tooltip: { y: { formatter: v => _fmtMoney(v, currency) } },
                            });
                        }
                        if (Object.keys(qualCounts).length > 0 && document.getElementById(qualChartId)) {
                            _renderChart(qualChartId, {
                                chart: { type: 'donut', height: 280, background: 'transparent' },
                                series: Object.values(qualCounts),
                                labels: Object.keys(qualCounts),
                                colors: [COLORS.green, COLORS.red, COLORS.amber, COLORS.silver],
                                plotOptions: { pie: { donut: { size: '62%' } } },
                                dataLabels: { enabled: false },
                                legend: { position: 'bottom' },
                            });
                        }
                    }, 80);
                };

                renderContent({ engines, shopVisits, flightHours, claims: masterClaims, events: masterEvents });

                _wireGlobalFilterBar(filterBarId, null, (filters) => {
                    _registerFilterState('SVRG_MASTER', filters);
                    let fEng = engines;
                    let fSV = shopVisits;
                    let fFH = flightHours;
                    let fClaims = masterClaims;
                    let fEvents = masterEvents;
                    if (filters.engine_family) {
                        fEng = fEng.filter(e => (e.engine_family || e.family || e.engine_model) === filters.engine_family);
                        fSV = fSV.filter(s => (s.engine_family || s.family) === filters.engine_family);
                        fFH = fFH.filter(f => (f.engine_family || f.family) === filters.engine_family);
                    }
                    if (filters.guarantee) {
                        fClaims = fClaims.filter(c => c.guarantee === filters.guarantee);
                        fEvents = fEvents.filter(e => e.guarantee_coverage === filters.guarantee);
                    }
                    if (filters.qualification) fEvents = fEvents.filter(e => e.qualification === filters.qualification);
                    if (filters.year) fClaims = fClaims.filter(c => String(c.year) === String(filters.year));
                    renderContent({ engines: fEng, shopVisits: fSV, flightHours: fFH, claims: fClaims, events: fEvents });
                });
            }

            // ═══════════════════════════════════════════════════
            // GLOBAL HOPPER RENDERER
            // ═══════════════════════════════════════════════════

            function _renderGlobalHopper(el, data, fname) {
                const escH = (window.RRUtil && window.RRUtil.escapeHtml) || (v => v == null ? '' : String(v));
                const escA = (window.RRUtil && window.RRUtil.escapeAttr) || (v => v == null ? '' : String(v));
                const meta = data.metadata || {};
                const summary = data.summary || {};
                const opportunities = data.opportunities || [];
                const detailReport = data.detail_report || [];
                const execReport = data.exec_report || [];
                const currency = meta.currency || 'GBP';

                const uid = 'gh_' + Math.random().toString(36).slice(2, 8);

                // Apply dark theme (same method as MEA tracker)
                el.classList.add('opp-tracker-dashboard');
                el.style.background = '#03002E';
                el.style.borderRadius = '0';
                el.style.padding = '24px 32px';
                let parent = el.parentElement;
                while (parent) {
                    if (parent.classList && parent.classList.contains('dashboard-body')) parent.style.background = '#03002E';
                    if (parent.classList && parent.classList.contains('main-content')) parent.style.background = '#03002E';
                    parent = parent.parentElement;
                }

                // ── Filter bar ──
                const filterBarId = uid + '_filters';
                const regions = summary.unique_regions || [];
                const customers = summary.unique_customers || [];
                const statuses = summary.unique_statuses || [];
                const evsList = summary.unique_evs || [];
                const maturities = summary.unique_maturities || [];
                const restructureTypes = summary.unique_restructure_types || [];

                let filterHTML = `<div class="viz-global-filter-bar" id="${filterBarId}" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:14px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:16px">`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">Region</label><select data-filter="region" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${regions.map(r => `<option value="${escA(r)}">${escH(r)}</option>`).join('')}</select></div>`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">Customer</label><select data-filter="customer" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${customers.map(c => `<option value="${escA(c)}">${escH(c)}</option>`).join('')}</select></div>`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">EVS</label><select data-filter="evs" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${evsList.map(e => `<option value="${escA(e)}">${escH(e)}</option>`).join('')}</select></div>`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">Status</label><select data-filter="status" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${statuses.map(s => `<option value="${escA(s)}">${escH(s)}</option>`).join('')}</select></div>`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">Maturity</label><select data-filter="maturity" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${maturities.map(m => `<option value="${escA(m)}">${escH(m)}</option>`).join('')}</select></div>`;
                filterHTML += `<div class="viz-filter-item"><label style="display:block;font-size:11px;color:#C8C6DD;margin-bottom:4px">Restructure Type</label><select data-filter="restructure_type" style="min-width:140px;padding:6px 10px;background:#0A0842;color:#E8E6F8;border:1px solid rgba(255,255,255,0.12);border-radius:6px"><option value="">All</option>${restructureTypes.map(t => `<option value="${escA(t)}">${escH(t)}</option>`).join('')}</select></div>`;
                filterHTML += `<button type="button" id="${uid}_reset" style="padding:8px 14px;background:transparent;border:1px solid rgba(0,200,117,0.5);color:#00C875;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600"><i data-lucide="rotate-ccw" style="width:12px;height:12px;vertical-align:-2px;margin-right:4px"></i> Reset</button>`;
                filterHTML += `</div>`;

                // Helper to format GBP
                function fmtGBP(v) {
                    if (v == null || isNaN(v)) return '—';
                    const abs = Math.abs(v);
                    const s = abs >= 1000 ? `£${(abs / 1000).toFixed(1)}bn` : abs >= 1 ? `£${abs.toFixed(1)}m` : `£${(abs * 1000).toFixed(0)}k`;
                    return v < 0 ? `-${s}` : s;
                }
                function fmtGBPm(v) {
                    if (v == null || isNaN(v)) return '—';
                    return `£${v.toFixed(1)}m`;
                }

                // Build main HTML
                let html = '';

                // ── Title banner (matches MEA tracker viz-opp-banner) ──
                html += `<div class="viz-opp-banner">
            <div class="viz-opp-banner-inner">
                <div class="viz-opp-banner-title"><i data-lucide="globe"></i><span>${_safe(meta.title || 'Commercial Optimisation Opportunity Report')}</span></div>
                <div style="display:flex;align-items:center;gap:16px">
                    <div class="viz-opp-banner-badge" style="background:#00C875;">GLOBAL HOPPER</div>
                    <div class="viz-opp-banner-rr">ROLLS‑ROYCE</div>
                </div>
            </div>
        </div>`;

                // ── Filter bar ──
                html += filterHTML;

                // ── Content wrapper (for filter updates) ──
                html += `<div id="${uid}_content">`;

                // ── Hero KPIs (matches MEA tracker viz-opp-hero) ──
                html += `<div class="viz-opp-hero" id="${uid}_kpis">
            <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">CRP Term Benefit</div><div class="viz-opp-hero-value">${fmtGBP(summary.total_crp_term_benefit)}</div></div>
            <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">Profit 2026</div><div class="viz-opp-hero-value">${fmtGBPm(summary.total_profit_2026)}</div></div>
            <div class="viz-opp-hero-card viz-opp-hero-accent"><div class="viz-opp-hero-label">Profit 2027</div><div class="viz-opp-hero-value">${fmtGBPm(summary.total_profit_2027)}</div></div>
            <div class="viz-opp-hero-card viz-opp-hero-primary"><div class="viz-opp-hero-label">Profit 2028–30</div><div class="viz-opp-hero-value">${fmtGBPm((summary.total_profit_2028 || 0) + (summary.total_profit_2029 || 0) + (summary.total_profit_2030 || 0))}</div></div>
        </div>`;

                // ── Meta info bar ──
                const byMaturity = summary.by_maturity || {};
                const byOnerous = summary.by_onerous || {};
                html += '<div class="viz-customer-bar">';
                html += `<div class="viz-info-chip"><b>Currency:</b> ${currency}</div>`;
                html += `<div class="viz-info-chip"><b>Opportunities:</b> ${opportunities.length}</div>`;
                html += `<div class="viz-info-chip"><b>Customers:</b> ${customers.length}</div>`;
                html += `<div class="viz-info-chip"><b>Regions:</b> ${regions.join(', ')}</div>`;
                html += `<div class="viz-info-chip"><b>EVS Types:</b> ${evsList.length}</div>`;
                html += '</div>';

                // ── Secondary KPIs ──
                html += `<div class="viz-kpi-grid viz-kpi-grid-5" id="${uid}_kpis2">`;
                html += _kpiCard('Mature', `${byMaturity['Mature'] || 0}`, { icon: 'check-circle', colorClass: 'kpi-success', subtitle: 'opportunities' });
                html += _kpiCard('Immature', `${byMaturity['Immature'] || 0}`, { icon: 'clock', subtitle: 'opportunities' });
                html += _kpiCard('Onerous', `${byOnerous['Onerous Contract'] || 0}`, { icon: 'alert-triangle', colorClass: 'kpi-danger', subtitle: 'contracts' });
                html += _kpiCard('Not Onerous', `${byOnerous['Not Onerous'] || 0}`, { icon: 'shield-check', subtitle: 'contracts' });
                html += _kpiCard('Regions', `${regions.length}`, { icon: 'globe', subtitle: regions.join(', ') });
                html += `</div>`;

                // ── Charts row 1: Pipeline + Region ──
                const pipelineChartId = uid + '_pipeline';
                const regionChartId = uid + '_region';
                html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Pipeline by Status</div><div id="${pipelineChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">CRP by Region</div><div id="${regionChartId}" class="viz-chart-body"></div></div>
        </div>`;

                // ── Charts row 2: Top customers + EVS ──
                const custChartId = uid + '_customers';
                const evsChartId = uid + '_evs';
                html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Top 15 Customers by CRP Term Benefit</div><div id="${custChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Engine Value Stream Distribution</div><div id="${evsChartId}" class="viz-chart-body"></div></div>
        </div>`;

                // ── Charts row 3: Year-over-year + Restructure type ──
                const yoyChartId = uid + '_yoy';
                const restTypeChartId = uid + '_resttype';
                html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Annual Profit Forecast (${escH(currency)})</div><div id="${yoyChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Restructure Type Split</div><div id="${restTypeChartId}" class="viz-chart-body"></div></div>
        </div>`;

                // ── Charts row 4: Region × Restructure stacked bar + Owner leaderboard ──
                const stackedId = uid + '_stacked';
                const leaderId = uid + '_leader';
                html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">CRP Term Benefit by Region × Restructure Type</div><div id="${stackedId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Top 10 VP/Account Manager Owners by Benefit</div><div id="${leaderId}" class="viz-chart-body"></div></div>
        </div>`;

                // ── Charts row 5: Profit Treemap (full width) ──
                const treemapId = uid + '_treemap';
                html += `<div class="viz-chart-grid viz-chart-grid-1" style="grid-template-columns:1fr">
            <div class="viz-chart-card"><div class="viz-chart-header">Profit 2026-2030 by Engine Value Stream (Treemap)</div><div id="${treemapId}" class="viz-chart-body"></div></div>
        </div>`;

                // ── Opportunities table ──
                const oppHeaders = ['Region', 'Customer', 'EVS', 'Restructure Type', 'Maturity', 'Status', 'CRP Term (£m)', '2026 (£m)', '2027 (£m)', 'VP/Owner'];
                const oppRows = opportunities.map(r => [
                    _safe(r.region || ''), _safe(r.customer || ''), _safe(r.engine_value_stream || ''),
                    _safe(r.restructure_type || ''), _safe(r.maturity || ''), _safe(r.status || ''),
                    r.crp_term_benefit != null ? r.crp_term_benefit.toFixed(1) : '—',
                    r.profit_2026 != null ? r.profit_2026.toFixed(1) : '—',
                    r.profit_2027 != null ? r.profit_2027.toFixed(1) : '—',
                    _safe(r.vp_owner || '')
                ]);

                html += _sectionHeader('Opportunities Register', 'list', { badge: `${opportunities.length} records`, collapsible: true });
                html += `<div class="viz-collapsible-content">`;
                html += _dataTable(oppHeaders, oppRows, { maxHeight: '500px', moneyColumns: [6, 7, 8] });
                html += `</div>`;

                // ── Executive Report table ──
                if (execReport.length > 0) {
                    const execHeaders = Object.keys(execReport[0]);
                    const execRows = execReport.map(r => execHeaders.map(h => {
                        const v = r[h];
                        return v != null ? (typeof v === 'number' ? v.toFixed(1) : _safe(String(v))) : '—';
                    }));
                    html += _sectionHeader('Executive Report', 'briefcase', { badge: `${execReport.length} customers`, collapsible: true });
                    html += `<div class="viz-collapsible-content">`;
                    html += _dataTable(execHeaders, execRows, { maxHeight: '400px' });
                    html += `</div>`;
                }

                // ── Detail Report table ──
                if (detailReport.length > 0) {
                    const detHeaders = Object.keys(detailReport[0]);
                    const detRows = detailReport.map(r => detHeaders.map(h => {
                        const v = r[h];
                        return v != null ? (typeof v === 'number' ? v.toFixed(1) : _safe(String(v))) : '—';
                    }));
                    html += _sectionHeader('Detail Report', 'file-text', { badge: `${detailReport.length} rows`, collapsible: true });
                    html += `<div class="viz-collapsible-content">`;
                    html += _dataTable(detHeaders, detRows, { maxHeight: '400px' });
                    html += `</div>`;
                }

                html += `</div>`; // close content wrapper

                el.innerHTML = html;

                // Wire collapsible sections - start collapsed
                el.querySelectorAll('.viz-collapsible-content').forEach(content => {
                    content.style.display = 'none';
                });
                el.querySelectorAll('.viz-section-header').forEach(hdr => {
                    const content = hdr.nextElementSibling;
                    if (content && content.classList.contains('viz-collapsible-content')) {
                        hdr.style.cursor = 'pointer';
                        hdr.addEventListener('click', () => {
                            const isHidden = content.style.display === 'none';
                            content.style.display = isHidden ? 'block' : 'none';
                            hdr.classList.toggle('expanded', isHidden);
                        });
                    }
                });

                // Register empty filter state initially
                _registerFilterState('GLOBAL_HOPPER', {});

                // Make the 3 tables sortable (audit found this was silently broken)
                _makeTablesSortable(el);

                // ── Render charts ──
                setTimeout(() => {
                    _renderGlobalHopperCharts(uid, opportunities, summary, currency);
                }, 100);

                // ── Wire filters + reset ──
                const filterBar = document.getElementById(filterBarId);
                const applyCurrent = () => {
                    const filters = {};
                    if (filterBar) {
                        filterBar.querySelectorAll('select').forEach(s => {
                            if (s.value) filters[s.dataset.filter] = s.value;
                        });
                    }
                    _registerFilterState('GLOBAL_HOPPER', filters);
                    _applyGlobalHopperFilters(uid, opportunities, summary, currency, filters, el);
                };
                if (filterBar) {
                    filterBar.querySelectorAll('select').forEach(sel => {
                        sel.addEventListener('change', applyCurrent);
                    });
                }
                const resetBtn = document.getElementById(uid + '_reset');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        if (filterBar) filterBar.querySelectorAll('select').forEach(s => { s.value = ''; });
                        _registerFilterState('GLOBAL_HOPPER', {});
                        _applyGlobalHopperFilters(uid, opportunities, summary, currency, {}, el);
                    });
                }
            }

            function _applyGlobalHopperFilters(uid, allOpps, originalSummary, currency, filters, el) {
                let filtered = allOpps;

                if (filters.region) filtered = filtered.filter(r => r.region === filters.region);
                if (filters.customer) filtered = filtered.filter(r => r.customer === filters.customer);
                if (filters.evs) filtered = filtered.filter(r => r.engine_value_stream === filters.evs);
                if (filters.status) filtered = filtered.filter(r => r.status === filters.status);
                if (filters.maturity) filtered = filtered.filter(r => r.maturity === filters.maturity);
                if (filters.restructure_type) filtered = filtered.filter(r => r.restructure_type === filters.restructure_type);

                // Recompute summary for filtered data
                const totalCRP = filtered.reduce((s, r) => s + (r.crp_term_benefit || 0), 0);
                const total2026 = filtered.reduce((s, r) => s + (r.profit_2026 || 0), 0);
                const total2027 = filtered.reduce((s, r) => s + (r.profit_2027 || 0), 0);
                const total2028 = filtered.reduce((s, r) => s + (r.profit_2028 || 0), 0);
                const total2029 = filtered.reduce((s, r) => s + (r.profit_2029 || 0), 0);
                const total2030 = filtered.reduce((s, r) => s + (r.profit_2030 || 0), 0);

                function fmtGBP(v) {
                    if (v == null || isNaN(v)) return '—';
                    const abs = Math.abs(v);
                    const s = abs >= 1000 ? `£${(abs / 1000).toFixed(1)}bn` : abs >= 1 ? `£${abs.toFixed(1)}m` : `£${(abs * 1000).toFixed(0)}k`;
                    return v < 0 ? `-${s}` : s;
                }
                function fmtGBPm(v) { return v == null || isNaN(v) ? '—' : `£${v.toFixed(1)}m`; }

                // Update KPIs (hero cards)
                const kpis = document.getElementById(uid + '_kpis');
                if (kpis) {
                    kpis.innerHTML = `
                <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">CRP Term Benefit</div><div class="viz-opp-hero-value">${fmtGBP(totalCRP)}</div></div>
                <div class="viz-opp-hero-card"><div class="viz-opp-hero-label">Profit 2026</div><div class="viz-opp-hero-value">${fmtGBPm(total2026)}</div></div>
                <div class="viz-opp-hero-card viz-opp-hero-accent"><div class="viz-opp-hero-label">Profit 2027</div><div class="viz-opp-hero-value">${fmtGBPm(total2027)}</div></div>
                <div class="viz-opp-hero-card viz-opp-hero-primary"><div class="viz-opp-hero-label">Profit 2028–30</div><div class="viz-opp-hero-value">${fmtGBPm(total2028 + total2029 + total2030)}</div></div>`;
                    // remove old generic kpi lines below
                }

                // Rebuild summary for charts
                const filteredSummary = {
                    by_status_value: {}, by_region_value: {}, by_customer_value: {},
                    by_evs_value: {}, by_restructure_type_value: {},
                    total_profit_2026: total2026, total_profit_2027: total2027,
                    total_profit_2028: total2028, total_profit_2029: total2029,
                    total_profit_2030: total2030, total_crp_term_benefit: totalCRP,
                    pipeline_stages: [],
                };

                filtered.forEach(r => {
                    const s = r.status || 'Unknown';
                    filteredSummary.by_status_value[s] = (filteredSummary.by_status_value[s] || 0) + (r.crp_term_benefit || 0);
                    const reg = r.region || 'Unknown';
                    filteredSummary.by_region_value[reg] = (filteredSummary.by_region_value[reg] || 0) + (r.crp_term_benefit || 0);
                    const c = r.customer || 'Unknown';
                    filteredSummary.by_customer_value[c] = (filteredSummary.by_customer_value[c] || 0) + (r.crp_term_benefit || 0);
                    const e = r.engine_value_stream || 'Unknown';
                    filteredSummary.by_evs_value[e] = (filteredSummary.by_evs_value[e] || 0) + (r.crp_term_benefit || 0);
                    const rt = r.restructure_type || 'Unknown';
                    filteredSummary.by_restructure_type_value[rt] = (filteredSummary.by_restructure_type_value[rt] || 0) + (r.crp_term_benefit || 0);
                });

                // Re-render charts
                _renderGlobalHopperCharts(uid, filtered, filteredSummary, currency);
            }

            function _renderGlobalHopperCharts(uid, records, summary, currency) {
                const darkText = '#C8CAE0';
                const gridColor = 'rgba(200,202,224,0.1)';
                const chartColors = ['#00C875', '#2D8CFF', '#FF8B42', '#FFB547', '#FF4560', '#9B59B6', '#00D2FF', '#E91E63', '#4CAF50', '#FF9800'];

                function destroyChart(id) {
                    // Destroy via both registry and ApexCharts own lookup
                    if (window.RRCharts && window.RRCharts.unregister) window.RRCharts.unregister(id);
                    try {
                        const existing = ApexCharts.getChartByID(id);
                        if (existing) existing.destroy();
                    } catch (e) { /* noop */ }
                }

                // Helper: ApexCharts instance with registry
                function mkChart(elId, opts) {
                    destroyChart(elId);
                    const el = document.getElementById(elId);
                    if (!el) return null;
                    opts = opts || {};
                    opts.chart = Object.assign({ id: elId }, opts.chart || {});
                    try {
                        const c = new ApexCharts(el, opts);
                        c.render();
                        if (window.RRCharts && window.RRCharts.register) window.RRCharts.register(elId, c);
                        return c;
                    } catch (e) { console.warn('[hopper] chart failed', elId, e); return null; }
                }

                // ── Pipeline by Status (horizontal bar) ──
                const pipelineId = uid + '_pipeline';
                destroyChart(pipelineId);
                const statusVal = summary.by_status_value || {};
                const pipelineOrder = [
                    'Initial idea', 'ICT formed', 'Strategy Approved',
                    'Financial Modelling Started', 'Financial Modelling Complete',
                    'Financials Approved', 'Negotiations Started', 'Negotiations Concluded',
                    'Contracting Started', 'Contracting Concluded'
                ];
                const pipelineCats = pipelineOrder.filter(s => statusVal[s] !== undefined);
                const pipelineVals = pipelineCats.map(s => Math.round((statusVal[s] || 0) * 10) / 10);
                if (document.getElementById(pipelineId)) {
                    new ApexCharts(document.getElementById(pipelineId), {
                        chart: { id: pipelineId, type: 'bar', height: 350, background: 'transparent', toolbar: { show: false } },
                        series: [{ name: `CRP Term (${currency}m)`, data: pipelineVals }],
                        xaxis: { categories: pipelineCats, labels: { style: { colors: darkText, fontSize: '11px' }, maxWidth: 160, trim: true } },
                        yaxis: { labels: { style: { colors: darkText, fontSize: '11px' } } },
                        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
                        colors: ['#00C875'],
                        dataLabels: { enabled: true, formatter: v => `£${v}m`, style: { colors: ['#fff'], fontSize: '11px' } },
                        grid: { borderColor: gridColor },
                        tooltip: { theme: 'dark' },
                    }).render();
                }

                // ── Region Donut ──
                const regionId = uid + '_region';
                destroyChart(regionId);
                const regionVal = summary.by_region_value || {};
                const regionLabels = Object.keys(regionVal);
                const regionData = regionLabels.map(k => Math.round((regionVal[k] || 0) * 10) / 10);
                if (document.getElementById(regionId) && regionLabels.length) {
                    new ApexCharts(document.getElementById(regionId), {
                        chart: { id: regionId, type: 'donut', height: 350, background: 'transparent' },
                        series: regionData,
                        labels: regionLabels,
                        colors: chartColors.slice(0, regionLabels.length),
                        legend: { position: 'bottom', labels: { colors: darkText } },
                        dataLabels: { enabled: true, formatter: (val, opts) => `${opts.w.globals.labels[opts.seriesIndex]}: £${regionData[opts.seriesIndex]}m` },
                        plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: 'Total CRP', color: darkText, formatter: () => `£${Math.round(regionData.reduce((a, b) => a + b, 0))}m` } } } } },
                        tooltip: { theme: 'dark' },
                    }).render();
                }

                // ── Top 15 Customers (horizontal bar) ──
                const custId = uid + '_customers';
                destroyChart(custId);
                const custVal = summary.by_customer_value || {};
                const custSorted = Object.entries(custVal).sort((a, b) => b[1] - a[1]).slice(0, 15);
                const custLabels = custSorted.map(c => c[0]);
                const custData = custSorted.map(c => Math.round(c[1] * 10) / 10);
                if (document.getElementById(custId) && custLabels.length) {
                    new ApexCharts(document.getElementById(custId), {
                        chart: { id: custId, type: 'bar', height: 400, background: 'transparent', toolbar: { show: false } },
                        series: [{ name: `CRP Term (${currency}m)`, data: custData }],
                        xaxis: { categories: custLabels, labels: { style: { colors: darkText, fontSize: '10px' }, maxWidth: 120 } },
                        yaxis: { labels: { style: { colors: darkText, fontSize: '10px' } } },
                        plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '65%', distributed: true } },
                        colors: chartColors,
                        dataLabels: { enabled: true, formatter: v => `£${v}m`, style: { colors: ['#fff'], fontSize: '10px' } },
                        grid: { borderColor: gridColor },
                        legend: { show: false },
                        tooltip: { theme: 'dark' },
                    }).render();
                }

                // ── EVS Distribution (bar chart) ──
                const evsId = uid + '_evs';
                destroyChart(evsId);
                const evsVal = summary.by_evs_value || {};
                const evsLabels = Object.keys(evsVal).sort((a, b) => evsVal[b] - evsVal[a]);
                const evsData = evsLabels.map(k => Math.round((evsVal[k] || 0) * 10) / 10);
                if (document.getElementById(evsId) && evsLabels.length) {
                    new ApexCharts(document.getElementById(evsId), {
                        chart: { id: evsId, type: 'bar', height: 400, background: 'transparent', toolbar: { show: false } },
                        series: [{ name: `CRP Term (${currency}m)`, data: evsData }],
                        xaxis: { categories: evsLabels, labels: { style: { colors: darkText, fontSize: '10px' }, rotate: -45 } },
                        yaxis: { labels: { style: { colors: darkText }, formatter: v => `£${v}m` } },
                        plotOptions: { bar: { borderRadius: 4, columnWidth: '60%', distributed: true } },
                        colors: chartColors,
                        dataLabels: { enabled: true, formatter: v => `£${v}m`, style: { colors: ['#fff'], fontSize: '10px' } },
                        grid: { borderColor: gridColor },
                        legend: { show: false },
                        tooltip: { theme: 'dark' },
                    }).render();
                }

                // ── Year-over-year Profit Forecast (grouped bar) ──
                const yoyId = uid + '_yoy';
                destroyChart(yoyId);
                const years = ['2026', '2027', '2028', '2029', '2030'];
                const yoyData = [
                    summary.total_profit_2026 || 0, summary.total_profit_2027 || 0,
                    summary.total_profit_2028 || 0, summary.total_profit_2029 || 0,
                    summary.total_profit_2030 || 0,
                ].map(v => Math.round(v * 10) / 10);
                if (document.getElementById(yoyId)) {
                    new ApexCharts(document.getElementById(yoyId), {
                        chart: { id: yoyId, type: 'bar', height: 350, background: 'transparent', toolbar: { show: false } },
                        series: [{ name: `Profit (${currency}m)`, data: yoyData }],
                        xaxis: { categories: years, labels: { style: { colors: darkText, fontSize: '12px' } } },
                        yaxis: { labels: { style: { colors: darkText }, formatter: v => `£${v}m` } },
                        plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
                        colors: ['#2D8CFF'],
                        dataLabels: { enabled: true, formatter: v => `£${v}m`, style: { colors: ['#fff'] } },
                        grid: { borderColor: gridColor },
                        tooltip: { theme: 'dark' },
                    }).render();
                }

                // ── Restructure Type Donut ──
                const restId = uid + '_resttype';
                destroyChart(restId);
                const restVal = summary.by_restructure_type_value || {};
                const restLabels = Object.keys(restVal);
                const restData = restLabels.map(k => Math.round((restVal[k] || 0) * 10) / 10);
                if (document.getElementById(restId) && restLabels.length) {
                    mkChart(restId, {
                        chart: { type: 'donut', height: 350, background: 'transparent' },
                        series: restData,
                        labels: restLabels,
                        colors: ['#00C875', '#2D8CFF', '#FF8B42', '#FFB547'],
                        legend: { position: 'bottom', labels: { colors: darkText } },
                        dataLabels: { enabled: true, formatter: (val) => `${val.toFixed(0)}%` },
                        plotOptions: { pie: { donut: { size: '55%', labels: { show: true, total: { show: true, label: 'Total', color: darkText, formatter: () => `£${Math.round(restData.reduce((a, b) => a + b, 0))}m` } } } } },
                        tooltip: { theme: 'dark' },
                    });
                }

                // ── Region × Restructure Type Stacked Bar ──
                const stackedId = uid + '_stacked';
                const regionList = Object.keys(summary.by_region_value || {}).length > 0 ? Object.keys(summary.by_region_value) : [...new Set((records || []).map(r => r.region).filter(Boolean))];
                const restTypesList = [...new Set((records || []).map(r => r.restructure_type).filter(Boolean))];
                if (document.getElementById(stackedId) && regionList.length && restTypesList.length) {
                    const stackedSeries = restTypesList.map(rt => ({
                        name: rt,
                        data: regionList.map(rg => {
                            return Math.round((records || []).filter(r => r.region === rg && r.restructure_type === rt)
                                .reduce((s, r) => s + (r.crp_term_benefit || 0), 0) * 10) / 10;
                        }),
                    }));
                    mkChart(stackedId, {
                        chart: { type: 'bar', height: 360, background: 'transparent', stacked: true, foreColor: darkText, toolbar: { show: false } },
                        series: stackedSeries,
                        xaxis: { categories: regionList, labels: { style: { colors: darkText } } },
                        yaxis: { labels: { formatter: v => `£${v}m`, style: { colors: darkText } } },
                        colors: ['#00C875', '#2D8CFF', '#FF8B42', '#9B59B6'],
                        plotOptions: { bar: { borderRadius: 4, columnWidth: '55%' } },
                        legend: { position: 'top', labels: { colors: darkText } },
                        dataLabels: { enabled: false },
                        grid: { borderColor: gridColor },
                        tooltip: { theme: 'dark', y: { formatter: v => `£${v.toFixed(1)}m` } },
                    });
                }

                // ── Owner Leaderboard — top 10 ──
                const leaderId = uid + '_leader';
                const byOwner = {};
                (records || []).forEach(r => {
                    let owner = (r.vp_owner || r.owner || '').trim();
                    if (!owner) return;
                    // Normalize trivial whitespace/duplicate-space bug
                    owner = owner.replace(/\s+/g, ' ');
                    byOwner[owner] = (byOwner[owner] || 0) + (r.crp_term_benefit || 0);
                });
                const ownerSorted = Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 10);
                if (document.getElementById(leaderId) && ownerSorted.length) {
                    mkChart(leaderId, {
                        chart: { type: 'bar', height: Math.max(360, ownerSorted.length * 30 + 60), background: 'transparent', foreColor: darkText, toolbar: { show: false } },
                        series: [{ name: `CRP Term (${currency}m)`, data: ownerSorted.map(o => Math.round(o[1] * 10) / 10) }],
                        xaxis: { categories: ownerSorted.map(o => _truncate(o[0], 22)), labels: { style: { colors: darkText, fontSize: '11px' } } },
                        yaxis: { labels: { style: { colors: darkText } } },
                        colors: chartColors,
                        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '65%', distributed: true } },
                        dataLabels: { enabled: true, formatter: v => `£${v}m`, style: { colors: ['#fff'], fontSize: '11px' } },
                        legend: { show: false },
                        grid: { borderColor: gridColor },
                        tooltip: { theme: 'dark' },
                    });
                }

                // ── Profit 2026-2030 Treemap by EVS ──
                const treemapId = uid + '_treemap';
                const evsProfit = {};
                (records || []).forEach(r => {
                    const evs = r.engine_value_stream || r.evs || 'Unknown';
                    const v = (r.profit_2026 || 0) + (r.profit_2027 || 0) + (r.profit_2028 || 0) + (r.profit_2029 || 0) + (r.profit_2030 || 0);
                    if (v > 0) evsProfit[evs] = (evsProfit[evs] || 0) + v;
                });
                const treemapData = Object.entries(evsProfit).map(([k, v]) => ({ x: k, y: Math.round(v * 10) / 10 }));
                if (document.getElementById(treemapId) && treemapData.length) {
                    mkChart(treemapId, {
                        chart: { type: 'treemap', height: 380, background: 'transparent', foreColor: darkText, toolbar: { show: false } },
                        series: [{ data: treemapData }],
                        colors: chartColors,
                        plotOptions: { treemap: { distributed: true, enableShades: false } },
                        dataLabels: {
                            enabled: true,
                            formatter: (_t, { dataPointIndex, w }) => {
                                const d = w.config.series[0].data[dataPointIndex];
                                return [d.x, `£${d.y}m`];
                            },
                            style: { fontSize: '12px', fontWeight: 600 },
                        },
                        tooltip: { theme: 'dark', y: { formatter: v => `£${v.toFixed(1)}m` } },
                    });
                }
            }

            // ═══════════════════════════════════════════════════
            // UNKNOWN / FALLBACK RENDERER
            // ═══════════════════════════════════════════════════

            function _renderUnknown(el, data, fname) {
                const sheets = data.sheets || {};
                const sheetNames = Object.keys(sheets);

                let html = '';
                html += _sectionHeader('Data File — Generic View', 'file-spreadsheet', {
                    badge: data.file_type || 'UNKNOWN', badgeColor: '#9E9E9E'
                });

                html += '<div class="viz-customer-bar">';
                html += `<div class="viz-info-chip"><b>Source:</b> ${_safe(fname)}</div>`;
                html += `<div class="viz-info-chip"><b>Sheets:</b> ${sheetNames.length}</div>`;
                html += '</div>';

                if (data.errors && data.errors.length > 0) {
                    html += `<div class="viz-warning-box"><i data-lucide="alert-triangle"></i> ${data.errors.join('; ')}</div>`;
                }

                sheetNames.forEach(sheetName => {
                    const sheet = sheets[sheetName];
                    const sheetHeaders = sheet.headers || [];
                    const sheetRows = sheet.rows || [];
                    html += _sectionHeader(`Sheet: ${sheetName}`, 'table', { badge: `${sheet.row_count || sheetRows.length} rows` });

                    if (sheetRows.length > 0) {
                        const displayHeaders = sheetHeaders.slice(0, 15);
                        const displayRows = sheetRows.map(row => {
                            return displayHeaders.map(h => row[h] != null ? row[h] : '');
                        });
                        html += _dataTable(displayHeaders, displayRows, { maxRows: 100 });
                    } else {
                        html += '<p class="viz-empty-msg">No data rows found in this sheet.</p>';
                    }
                });

                el.innerHTML = html;
            }

            // ═══════════════════════════════════════════════════
            // ERROR RENDERER
            // ═══════════════════════════════════════════════════

            function _renderError(el, data, fname) {
                const errors = data.errors || ['Unknown error'];
                el.innerHTML = `
            ${_sectionHeader('Parse Error', 'alert-triangle')}
            <div class="viz-error-card">
                <p><b>File:</b> ${_safe(fname)}</p>
                <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
            </div>`;
            }

            // ═══════════════════════════════════════════════════
            // CROSS-REFERENCE PANEL
            // ═══════════════════════════════════════════════════

            function _renderCrossRefHints(el, filesData) {
                if (!el) return;

                // Simple cross-reference: find shared customers, references across files
                const fileEntries = Object.entries(filesData);
                const customersByFile = {};
                fileEntries.forEach(([fname, data]) => {
                    const customers = new Set();
                    // SOA
                    if (data.metadata && data.metadata.customer_name) customers.add(data.metadata.customer_name);
                    if (data.metadata && data.metadata.customer) customers.add(data.metadata.customer);
                    // Opportunity
                    if (data.summary && data.summary.by_customer) {
                        Object.keys(data.summary.by_customer).forEach(c => customers.add(c));
                    }
                    customersByFile[fname] = customers;
                });

                // Find common customers
                const allCustomers = new Set();
                Object.values(customersByFile).forEach(set => set.forEach(c => allCustomers.add(c)));

                const sharedCustomers = [];
                allCustomers.forEach(c => {
                    const files = fileEntries.filter(([fname]) => customersByFile[fname] && customersByFile[fname].has(c)).map(([fname]) => fname);
                    if (files.length > 1) sharedCustomers.push({ customer: c, files });
                });

                let html = _sectionHeader('Cross-File References', 'link-2');

                if (sharedCustomers.length > 0) {
                    html += '<div class="viz-crossref-grid">';
                    sharedCustomers.forEach(({ customer, files }) => {
                        html += `<div class="viz-crossref-card">
                    <div class="viz-crossref-key"><i data-lucide="user"></i> ${customer}</div>
                    <div class="viz-crossref-files">${files.map(f => `<span class="viz-crossref-file">${_truncate(f, 25)}</span>`).join('')}</div>
                </div>`;
                    });
                    html += '</div>';
                } else {
                    html += '<p class="viz-empty-msg">No shared references found across uploaded files.</p>';
                }

                // File type summary
                html += '<div class="viz-kpi-grid viz-kpi-grid-3" style="margin-top:16px;">';
                const typeCount = {};
                fileEntries.forEach(([, data]) => {
                    const ft = data.file_type || 'UNKNOWN';
                    typeCount[ft] = (typeCount[ft] || 0) + 1;
                });
                Object.entries(typeCount).forEach(([ft, count]) => {
                    const meta = FILE_TYPE_META[ft] || FILE_TYPE_META.UNKNOWN;
                    html += _kpiCard(meta.label, `${count} file(s)`, { icon: meta.icon });
                });
                html += '</div>';

                el.innerHTML = html;
            }

            // ═══════════════════════════════════════════════════
            // ANIMATIONS
            // ═══════════════════════════════════════════════════

            function _animateVizEntrance() {
                if (!window.gsap) return;
                // Use gsap.fromTo with clearProps to avoid leaving stale inline styles
                // that interfere with ApexCharts rendering inside these containers
                gsap.fromTo('.viz-section',
                    { opacity: 0, y: 30 },
                    { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out', clearProps: 'all' }
                );
                gsap.fromTo('.viz-kpi-card',
                    { opacity: 0, y: 20, scale: 0.95 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.05, ease: 'back.out(1.5)', delay: 0.1, clearProps: 'all' }
                );
                gsap.fromTo('.viz-chart-card',
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out', delay: 0.15, clearProps: 'all' }
                );
            }

            // ═══════════════════════════════════════════════════
            // INTERACTIVITY
            // ═══════════════════════════════════════════════════

            function _makeTablesSortable(containerElement) {
                if (!containerElement) return;
                const tables = containerElement.querySelectorAll('.viz-data-table');
                tables.forEach(table => {
                    const headers = table.querySelectorAll('thead th.viz-sortable-th');
                    const tbody = table.querySelector('tbody');
                    if (!tbody || !headers.length) return;

                    headers.forEach((th, index) => {
                        th.addEventListener('click', () => {
                            const isAsc = th.classList.contains('sort-asc');

                            headers.forEach(h => {
                                h.classList.remove('sort-asc', 'sort-desc');
                            });

                            const direction = isAsc ? 'desc' : 'asc';
                            th.classList.add(`sort-${direction}`);

                            const rows = Array.from(tbody.querySelectorAll('tr'));

                            rows.sort((a, b) => {
                                const cellA = a.children[index];
                                const cellB = b.children[index];
                                if (!cellA || !cellB) return 0;

                                const rawA = cellA.getAttribute('data-raw');
                                const rawB = cellB.getAttribute('data-raw');

                                const numA = Number(rawA);
                                const numB = Number(rawB);
                                const isNumA = rawA !== '' && !isNaN(numA);
                                const isNumB = rawB !== '' && !isNaN(numB);

                                let cmp = 0;
                                if (isNumA && isNumB) {
                                    cmp = numA - numB;
                                } else {
                                    cmp = String(rawA).toLowerCase().localeCompare(String(rawB).toLowerCase());
                                }

                                return direction === 'asc' ? cmp : -cmp;
                            });

                            // Re-append sorted rows
                            rows.forEach(row => tbody.appendChild(row));
                        });
                    });
                });
            }

            // ═══════════════════════════════════════════════════
            // PUBLIC
            // ═══════════════════════════════════════════════════

            return {
                renderVisualizer,
                getFileTypeMeta,
                FILE_TYPE_META,
                getActiveGlobalFilters,
                getCurrentFileType,
                _filterState, // introspection
                _renderEmptyState,
                _renderErrorState,
                _renderLoadingState,
            };

        })();
        // window.RRVisualizer is already set by the IIFE assignment above.
    })();

})();
