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
        Object.keys(_instances).forEach(id => _destroy(id));
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
        formatCurrency: _formatCurrency,
        CHART_COLORS,
        AGING_COLORS,
        AGING_ORDER,
    };
})();
