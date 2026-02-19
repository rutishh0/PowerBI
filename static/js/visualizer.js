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

const RRVisualizer = (() => {
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
        UNKNOWN: { label: 'Data File', icon: 'file-spreadsheet', color: '#9E9E9E', bg: 'rgba(158,158,158,0.08)' },
        ERROR: { label: 'Error', icon: 'alert-triangle', color: '#C62828', bg: 'rgba(198,40,40,0.08)' },
    };

    // ═══════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════

    /**
     * Detect file types present in the uploaded data and render the
     * appropriate visualizer. Called by app.js after upload.
     */
    function renderVisualizer(filesData, container) {
        if (!container) return;

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
                        case 'SHOP_VISIT_HISTORY': _renderShopVisit(el, data, name); break;
                        case 'SHOP_VISIT': _renderShopVisit(el, data, name); break;
                        case 'SVRG_MASTER': _renderSVRG(el, data, name); break;
                        case 'ERROR': _renderError(el, data, name); break;
                        default: _renderUnknown(el, data, name); break;
                    }
                } catch (e) {
                    el.innerHTML = `<div class="viz-error-card"><i data-lucide="alert-triangle"></i> Failed to render ${name}: ${e.message}</div>`;
                }
            });
        });

        // Cross-ref panel
        if (fileEntries.length > 1) {
            _renderCrossRefHints($('viz-crossref'), filesData);
        }

        // Refresh Lucide icons
        if (window.lucide) lucide.createIcons();

        // Animate
        _animateVizEntrance();

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
        const maxRows = opts.maxRows || 200;
        const tableId = opts.id || '';
        let html = `<div class="viz-table-wrap"><table class="viz-data-table" ${tableId ? `id="${tableId}"` : ''}>`;
        html += '<thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';
        rows.slice(0, maxRows).forEach(row => {
            html += '<tr>';
            row.forEach((cell, ci) => {
                const cls = typeof cell === 'number' ? (cell < 0 ? 'neg' : 'pos') : '';
                const formatted = typeof cell === 'number' ? _fmtNumber(cell) : _safe(cell);
                html += `<td class="${cls}">${formatted}</td>`;
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
    // SOA RENDERER
    // ═══════════════════════════════════════════════════

    function _renderSOA(el, data, fname) {
        const meta = data.metadata || {};
        const sections = data.sections || [];
        const grand = data.grand_totals || {};
        const aging = data.aging_buckets || {};
        const summarySheet = data.summary_sheet || {};

        let allItems = [];
        sections.forEach(sec => {
            (sec.items || []).forEach(item => {
                allItems.push({ ...item, _section: sec.name });
            });
        });

        const totalCharges = allItems.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
        const totalCredits = allItems.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0);
        const netBalance = grand.net_balance || (totalCharges + totalCredits);
        const totalOverdue = grand.total_overdue || 0;

        let html = '';

        // Title
        html += _sectionHeader(meta.title || 'Statement of Account', 'file-text', {
            badge: 'SOA', badgeColor: COLORS.navy
        });

        // Customer info
        html += '<div class="viz-customer-bar">';
        if (meta.customer_name) html += `<div class="viz-info-chip"><b>Customer:</b> ${meta.customer_name}</div>`;
        if (meta.customer_number) html += `<div class="viz-info-chip"><b>Customer No:</b> ${meta.customer_number}</div>`;
        if (meta.contact_email) html += `<div class="viz-info-chip"><b>Email:</b> ${meta.contact_email}</div>`;
        if (meta.lpi_rate) html += `<div class="viz-info-chip"><b>LPI Rate:</b> ${meta.lpi_rate}%</div>`;
        if (meta.report_date) html += `<div class="viz-info-chip"><b>Report Date:</b> ${meta.report_date}</div>`;
        if (meta.avg_days_late) html += `<div class="viz-info-chip"><b>Avg Days Late:</b> ${meta.avg_days_late}</div>`;
        html += '</div>';

        // KPIs
        html += '<div class="viz-kpi-grid viz-kpi-grid-5">';
        html += _kpiCard('Net Balance', _fmtCurrency(netBalance), { icon: 'wallet', colorClass: netBalance >= 0 ? 'kpi-danger' : 'kpi-success' });
        html += _kpiCard('Total Charges', _fmtCurrency(totalCharges), { icon: 'trending-up', colorClass: 'kpi-danger' });
        html += _kpiCard('Total Credits', _fmtCurrency(totalCredits), { icon: 'trending-down', colorClass: 'kpi-success' });
        html += _kpiCard('Total Overdue', _fmtCurrency(totalOverdue), { icon: 'alert-triangle', colorClass: 'kpi-warning' });
        html += _kpiCard('Line Items', _fmtNumber(allItems.length), { icon: 'list' });
        html += '</div>';

        // Charts row
        const donutId = `soa-donut-${Date.now()}`;
        const agingId = `soa-aging-${Date.now()}`;
        const ccId = `soa-cc-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-3">
            <div class="viz-chart-card"><div class="viz-chart-header">Section Breakdown</div><div id="${donutId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Charges vs Credits</div><div id="${ccId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Aging Analysis</div><div id="${agingId}" class="viz-chart-body"></div></div>
        </div>`;

        // Section breakdown table
        html += _sectionHeader('Section Details', 'layers');
        sections.forEach(sec => {
            const secItems = sec.items || [];
            const secTotal = sec.total != null ? sec.total : secItems.reduce((s, i) => s + (i.amount || 0), 0);
            html += `<div class="viz-subsection">
                <div class="viz-subsection-header">
                    <span class="viz-subsection-name">${sec.name}</span>
                    <span class="viz-subsection-total">${_fmtCurrency(secTotal)}</span>
                    <span class="viz-subsection-count">${secItems.length} items</span>
                </div>
            </div>`;
        });

        // Invoice register
        html += _sectionHeader('Invoice Register', 'table');
        const headers = ['Reference', 'Doc Date', 'Due Date', 'Amount', 'Currency', 'Section', 'Text', 'Days Late'];
        const rows = allItems.map(i => [
            i.reference, i.doc_date, i.due_date, i.amount, i.currency, i._section,
            _truncate(i.text, 40), i.days_late
        ]);
        html += _dataTable(headers, rows, { maxRows: 100 });

        el.innerHTML = html;

        // Render charts after DOM
        setTimeout(() => {
            _renderSOACharts(donutId, ccId, agingId, sections, allItems, aging);
        }, 50);
    }

    function _renderSOACharts(donutId, ccId, agingId, sections, items, agingBuckets) {
        // Donut: section breakdown
        const secLabels = sections.map(s => s.name);
        const secValues = sections.map(s => {
            return (s.items || []).reduce((sum, i) => sum + Math.abs(i.amount || 0), 0);
        });
        if ($(donutId) && secLabels.length > 0) {
            new ApexCharts($(donutId), {
                chart: { type: 'donut', height: 280, background: 'transparent' },
                series: secValues,
                labels: secLabels,
                colors: [COLORS.navy, COLORS.blue2, COLORS.purple, COLORS.teal, COLORS.red, COLORS.orange, COLORS.green, COLORS.gold],
                legend: { position: 'bottom', fontSize: '11px' },
                plotOptions: { pie: { donut: { size: '62%' } } },
                dataLabels: { enabled: false },
                theme: { mode: 'light' },
            }).render();
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
            new ApexCharts($(ccId), {
                chart: { type: 'bar', height: 280, background: 'transparent', stacked: true },
                series: [
                    { name: 'Charges', data: ccSections.map(s => secCharges[s] || 0) },
                    { name: 'Credits', data: ccSections.map(s => Math.abs(secCredits[s] || 0)) },
                ],
                xaxis: { categories: ccSections.map(s => _truncate(s, 15)) },
                colors: [COLORS.red, COLORS.green],
                plotOptions: { bar: { horizontal: false, columnWidth: '60%', borderRadius: 4 } },
                legend: { position: 'top' },
                dataLabels: { enabled: false },
                theme: { mode: 'light' },
            }).render();
        }

        // Aging
        const agingOrder = ['current', '1_30_days', '31_60_days', '61_90_days', '91_180_days', 'over_180_days'];
        const agingLabels = ['Current', '1-30', '31-60', '61-90', '91-180', '180+'];
        const agingColors = ['#2E7D32', '#66BB6A', '#F9A825', '#EF6C00', '#D32F2F', '#B71C1C'];
        const agingVals = agingOrder.map(k => agingBuckets[k] || 0);
        if ($(agingId) && agingVals.some(v => v > 0)) {
            new ApexCharts($(agingId), {
                chart: { type: 'bar', height: 280, background: 'transparent' },
                series: [{ name: 'Amount', data: agingVals }],
                xaxis: { categories: agingLabels },
                colors: agingColors,
                plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: '65%' } },
                legend: { show: false },
                dataLabels: { enabled: false },
                theme: { mode: 'light' },
            }).render();
        }
    }

    // ═══════════════════════════════════════════════════
    // INVOICE LIST RENDERER
    // ═══════════════════════════════════════════════════

    function _renderInvoiceList(el, data, fname) {
        const meta = data.metadata || {};
        const items = data.items || [];
        const totals = data.totals || {};

        let html = '';
        html += _sectionHeader('Invoice List — Open Items Register', 'receipt', {
            badge: 'EPI', badgeColor: COLORS.blue2
        });

        // Customer bar
        html += '<div class="viz-customer-bar">';
        html += `<div class="viz-info-chip"><b>Source:</b> ${_safe(meta.source_file)}</div>`;
        html += `<div class="viz-info-chip"><b>Total Items:</b> ${meta.total_items || items.length}</div>`;
        if (meta.currencies && meta.currencies.length) html += `<div class="viz-info-chip"><b>Currencies:</b> ${meta.currencies.join(', ')}</div>`;
        html += '</div>';

        // KPIs
        html += '<div class="viz-kpi-grid viz-kpi-grid-4">';
        html += _kpiCard('Total Amount', _fmtCurrency(totals.total_amount), { icon: 'wallet' });
        html += _kpiCard('Receivables', _fmtCurrency(totals.total_positive), { icon: 'trending-up', colorClass: 'kpi-danger' });
        html += _kpiCard('Credits', _fmtCurrency(totals.total_negative), { icon: 'trending-down', colorClass: 'kpi-success' });
        html += _kpiCard('Line Items', _fmtNumber(totals.item_count || items.length), { icon: 'hash' });
        html += '</div>';

        // Charts
        const timelineId = `inv-timeline-${Date.now()}`;
        const distId = `inv-dist-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Amount by Due Date</div><div id="${timelineId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Amount Distribution</div><div id="${distId}" class="viz-chart-body"></div></div>
        </div>`;

        // Register table
        html += _sectionHeader('Invoice Register', 'table');
        const headers = ['Reference', 'Doc Date', 'Due Date', 'Amount', 'Currency', 'Text', 'Assignment'];
        const rows = items.map(i => [i.reference, i.doc_date, i.due_date, i.amount, i.currency, _truncate(i.text, 35), i.assignment]);
        html += _dataTable(headers, rows, { maxRows: 150 });

        el.innerHTML = html;

        // Charts
        setTimeout(() => {
            _renderInvoiceCharts(timelineId, distId, items);
        }, 50);
    }

    function _renderInvoiceCharts(timelineId, distId, items) {
        // Timeline: amounts by due date (group by month)
        const byMonth = {};
        items.forEach(i => {
            if (!i.due_date) return;
            const month = i.due_date.substring(0, 7); // YYYY-MM
            byMonth[month] = (byMonth[month] || 0) + (i.amount || 0);
        });
        const months = Object.keys(byMonth).sort();
        if ($(timelineId) && months.length > 0) {
            new ApexCharts($(timelineId), {
                chart: { type: 'area', height: 280, background: 'transparent' },
                series: [{ name: 'Amount', data: months.map(m => byMonth[m]) }],
                xaxis: { categories: months },
                colors: [COLORS.blue2],
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.5, opacityTo: 0.1 } },
                stroke: { curve: 'smooth', width: 2 },
                dataLabels: { enabled: false },
                theme: { mode: 'light' },
            }).render();
        }

        // Distribution: positive vs negative
        const positive = items.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
        const negative = Math.abs(items.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0));
        if ($(distId)) {
            new ApexCharts($(distId), {
                chart: { type: 'donut', height: 280, background: 'transparent' },
                series: [positive, negative],
                labels: ['Receivables', 'Credits'],
                colors: [COLORS.red, COLORS.green],
                plotOptions: { pie: { donut: { size: '62%' } } },
                dataLabels: { enabled: false },
                legend: { position: 'bottom' },
                theme: { mode: 'light' },
            }).render();
        }
    }

    // ═══════════════════════════════════════════════════
    // OPPORTUNITY TRACKER RENDERER
    // ═══════════════════════════════════════════════════

    function _renderOpportunityTracker(el, data, fname) {
        const meta = data.metadata || {};
        const summary = data.summary || {};
        const opportunities = data.opportunities || {};
        const byLevel = data.opportunities_by_level || {};
        const projectSummary = data.project_summary || {};
        const timeline = data.timeline || {};
        const customerAnalytics = data.customer_analytics || {};

        // Flatten all records
        let allRecords = [];
        Object.values(opportunities).forEach(recs => {
            if (Array.isArray(recs)) allRecords = allRecords.concat(recs);
        });

        let html = '';
        html += _sectionHeader('MEA Profit Opportunities Tracker', 'trending-up', {
            badge: 'OPP TRACKER', badgeColor: COLORS.green
        });

        // Meta bar
        html += '<div class="viz-customer-bar">';
        html += `<div class="viz-info-chip"><b>Source:</b> ${_safe(meta.source_file)}</div>`;
        if (meta.away_day_date) html += `<div class="viz-info-chip"><b>Away Day:</b> ${meta.away_day_date}</div>`;
        if (meta.sheets_parsed) html += `<div class="viz-info-chip"><b>Sheets Parsed:</b> ${meta.sheets_parsed.join(', ')}</div>`;
        html += '</div>';

        // KPIs
        html += '<div class="viz-kpi-grid viz-kpi-grid-5">';
        html += _kpiCard('Total Opportunities', _fmtNumber(summary.total_opportunities || allRecords.length), { icon: 'target' });
        html += _kpiCard('Term Benefit', _fmtCurrency(summary.total_term_benefit, '$'), { icon: 'dollar-sign' });

        const byStatus = summary.by_status || {};
        const completed = byStatus['Completed'] || 0;
        const contracting = byStatus['Contracting'] || 0;
        html += _kpiCard('Completed', _fmtNumber(completed), { icon: 'check-circle', colorClass: 'kpi-success' });
        html += _kpiCard('Contracting', _fmtNumber(contracting), { icon: 'pen-tool' });

        const uniqueCustomers = Object.keys(summary.by_customer || {}).length;
        html += _kpiCard('Customers', _fmtNumber(uniqueCustomers), { icon: 'users' });
        html += '</div>';

        // Charts
        const statusId = `opp-status-${Date.now()}`;
        const progId = `opp-prog-${Date.now()}`;
        const custId = `opp-cust-${Date.now()}`;

        html += `<div class="viz-chart-grid viz-chart-grid-3">
            <div class="viz-chart-card"><div class="viz-chart-header">By Status</div><div id="${statusId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">By Programme</div><div id="${progId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">By Customer (Top 10)</div><div id="${custId}" class="viz-chart-body"></div></div>
        </div>`;

        // Estimation level comparison
        const levelEntries = Object.entries(summary.estimation_level_sums || {});
        if (levelEntries.length > 0) {
            html += _sectionHeader('Estimation Levels', 'git-branch');
            html += '<div class="viz-kpi-grid viz-kpi-grid-3">';
            levelEntries.forEach(([level, sums]) => {
                html += _kpiCard(
                    level,
                    `${sums.count} opps · ${_fmtCurrency(sums.total_term_benefit, '$')}`,
                    { icon: 'layers', subtitle: `2026: ${_fmtCurrency(sums.total_2026, '$')} | 2027: ${_fmtCurrency(sums.total_2027, '$')}` }
                );
            });
            html += '</div>';
        }

        // Opportunities table
        html += _sectionHeader('All Opportunities', 'table');
        const headers = ['#', 'Project', 'Programme', 'Customer', 'Status', 'Priority', 'Ext Prob', 'Int Complex', 'Term Benefit', '2026', '2027'];
        const rows = allRecords.map(r => [
            r.number, _truncate(r.project, 25), r.programme, _truncate(r.customer, 20),
            r.status, r.priority, r.ext_probability, r.int_complexity,
            r.term_benefit, r.benefit_2026, r.benefit_2027
        ]);
        html += _dataTable(headers, rows, { maxRows: 200 });

        // Timeline milestones
        const milestones = (timeline.milestones || []).filter(m => m.source === 'Date Input');
        if (milestones.length > 0) {
            html += _sectionHeader('Project Milestones', 'calendar');
            const msHeaders = ['Project', 'Customer', 'Idea Gen', 'Launch', 'Strategy', 'BE Gen', 'Approval', 'Negotiation', 'Submitted', 'Signed', 'Current Phase'];
            const msRows = milestones.map(m => {
                const ms = m.milestones || {};
                return [m.project, m.customer, ms.idea_generation, ms.approval_to_launch,
                ms.strategy_approval, ms.be_generated, ms.approval, ms.negotiation_strategy,
                ms.proposal_submitted, ms.proposal_signed, (m.current_phase || '').replace(/_/g, ' ')];
            });
            html += _dataTable(msHeaders, msRows);
        }

        el.innerHTML = html;

        // Charts
        setTimeout(() => {
            _renderOppCharts(statusId, progId, custId, summary);
        }, 50);
    }

    function _renderOppCharts(statusId, progId, custId, summary) {
        // Status donut
        const statusData = summary.by_status || {};
        const statusLabels = Object.keys(statusData);
        const statusValues = Object.values(statusData);
        if ($(statusId) && statusLabels.length > 0) {
            new ApexCharts($(statusId), {
                chart: { type: 'donut', height: 280, background: 'transparent' },
                series: statusValues,
                labels: statusLabels,
                colors: [COLORS.green, COLORS.blue2, COLORS.orange, COLORS.purple, COLORS.amber, COLORS.teal, COLORS.red],
                plotOptions: { pie: { donut: { size: '62%' } } },
                dataLabels: { enabled: false },
                legend: { position: 'bottom', fontSize: '11px' },
                theme: { mode: 'light' },
            }).render();
        }

        // Programme bar
        const progData = summary.by_programme || {};
        const progLabels = Object.keys(progData).slice(0, 10);
        const progValues = progLabels.map(k => progData[k]);
        if ($(progId) && progLabels.length > 0) {
            new ApexCharts($(progId), {
                chart: { type: 'bar', height: 280, background: 'transparent' },
                series: [{ name: 'Count', data: progValues }],
                xaxis: { categories: progLabels.map(l => _truncate(l, 12)) },
                colors: [COLORS.navy],
                plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
                dataLabels: { enabled: false },
                theme: { mode: 'light' },
            }).render();
        }

        // Customer bar (top 10)
        const custData = summary.by_customer || {};
        const custSorted = Object.entries(custData).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if ($(custId) && custSorted.length > 0) {
            new ApexCharts($(custId), {
                chart: { type: 'bar', height: 280, background: 'transparent' },
                series: [{ name: 'Opportunities', data: custSorted.map(c => c[1]) }],
                xaxis: { categories: custSorted.map(c => _truncate(c[0], 15)) },
                colors: [COLORS.teal],
                plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                dataLabels: { enabled: false },
                legend: { show: false },
                theme: { mode: 'light' },
            }).render();
        }
    }

    // ═══════════════════════════════════════════════════
    // SHOP VISIT RENDERER
    // ═══════════════════════════════════════════════════

    function _renderShopVisit(el, data, fname) {
        const meta = data.metadata || {};
        const shopVisits = data.shop_visits || [];
        const maintenance = data.maintenance_actions || [];
        const currentStatus = data.current_status || [];
        const stats = data.statistics || {};

        let html = '';
        html += _sectionHeader('Trent Engine Shop Visit History', 'wrench', {
            badge: 'SHOP VISIT', badgeColor: COLORS.orange
        });

        // Meta
        html += '<div class="viz-customer-bar">';
        html += `<div class="viz-info-chip"><b>Source:</b> ${_safe(meta.source_file)}</div>`;
        if (meta.engine_models && meta.engine_models.length) html += `<div class="viz-info-chip"><b>Engine Models:</b> ${meta.engine_models.join(', ')}</div>`;
        if (meta.operators && meta.operators.length) html += `<div class="viz-info-chip"><b>Operators:</b> ${meta.operators.slice(0, 5).join(', ')}${meta.operators.length > 5 ? '...' : ''}</div>`;
        html += '</div>';

        // KPIs
        html += '<div class="viz-kpi-grid viz-kpi-grid-4">';
        html += _kpiCard('Engines Tracked', _fmtNumber(stats.total_engines_tracked || meta.total_engines), { icon: 'disc' });
        html += _kpiCard('Shop Visits', _fmtNumber(stats.total_shop_visits || shopVisits.length), { icon: 'wrench', colorClass: 'kpi-warning' });
        html += _kpiCard('Maintenance Actions', _fmtNumber(stats.total_maintenance || maintenance.length), { icon: 'settings' });
        html += _kpiCard('Current Status', _fmtNumber(currentStatus.length), { icon: 'activity', colorClass: 'kpi-success' });
        html += '</div>';

        // Charts
        const svTypeId = `sv-type-${Date.now()}`;
        const svLocId = `sv-loc-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Shop Visit Types</div><div id="${svTypeId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Shop Visit Locations</div><div id="${svLocId}" class="viz-chart-body"></div></div>
        </div>`;

        // Shop visits table
        html += _sectionHeader('Shop Visit Events', 'table');
        const headers = ['Serial No.', 'Event Date', 'Operator', 'Action Code', 'Rework Level', 'SV Type', 'SV Location', 'HSN', 'CSN'];
        const rows = shopVisits.map(sv => [
            sv.serial_number, sv.event_datetime, sv.operator, sv.action_code,
            sv.rework_level, sv.sv_type, sv.sv_location, sv.hsn, sv.csn
        ]);
        html += _dataTable(headers, rows, { maxRows: 150 });

        // Current status table
        if (currentStatus.length > 0) {
            html += _sectionHeader('Current Engine Status', 'activity');
            const csHeaders = ['Serial No.', 'Part Number', 'Operator', 'Registration', 'HSN', 'CSN'];
            const csRows = currentStatus.map(s => [s.serial_number, s.part_number, s.operator, s.registration, s.hsn, s.csn]);
            html += _dataTable(csHeaders, csRows);
        }

        el.innerHTML = html;

        // Charts
        setTimeout(() => {
            const svTypes = stats.sv_types || {};
            const svLocs = stats.sv_locations || {};

            if ($(svTypeId) && Object.keys(svTypes).length > 0) {
                new ApexCharts($(svTypeId), {
                    chart: { type: 'donut', height: 280, background: 'transparent' },
                    series: Object.values(svTypes),
                    labels: Object.keys(svTypes),
                    colors: [COLORS.orange, COLORS.amber, COLORS.teal, COLORS.blue2, COLORS.purple],
                    plotOptions: { pie: { donut: { size: '62%' } } },
                    dataLabels: { enabled: false },
                    legend: { position: 'bottom' },
                    theme: { mode: 'light' },
                }).render();
            }

            if ($(svLocId) && Object.keys(svLocs).length > 0) {
                const locLabels = Object.keys(svLocs);
                const locValues = Object.values(svLocs);
                new ApexCharts($(svLocId), {
                    chart: { type: 'bar', height: 280, background: 'transparent' },
                    series: [{ name: 'Visits', data: locValues }],
                    xaxis: { categories: locLabels.map(l => _truncate(l, 15)) },
                    colors: [COLORS.orange],
                    plotOptions: { bar: { horizontal: true, borderRadius: 4, distributed: true } },
                    dataLabels: { enabled: false },
                    legend: { show: false },
                    theme: { mode: 'light' },
                }).render();
            }
        }, 50);
    }

    // ═══════════════════════════════════════════════════
    // SVRG MASTER RENDERER
    // ═══════════════════════════════════════════════════

    function _renderSVRG(el, data, fname) {
        const meta = data.metadata || {};
        const claimsSummary = data.claims_summary || {};
        const eventEntries = data.event_entries || {};
        const claims = claimsSummary.claims || [];
        const events = eventEntries.events || [];

        let html = '';
        html += _sectionHeader('SVRG Master — Guarantee Administration', 'shield-check', {
            badge: 'SVRG', badgeColor: COLORS.purple
        });

        // Meta
        html += '<div class="viz-customer-bar">';
        if (meta.customer) html += `<div class="viz-info-chip"><b>Customer:</b> ${meta.customer}</div>`;
        if (meta.engine_model) html += `<div class="viz-info-chip"><b>Engine Model:</b> ${meta.engine_model}</div>`;
        html += `<div class="viz-info-chip"><b>Source:</b> ${_safe(meta.source_file)}</div>`;
        html += '</div>';

        // KPIs
        html += '<div class="viz-kpi-grid viz-kpi-grid-5">';
        html += _kpiCard('Total Claims', _fmtNumber(claimsSummary.total_claims || claims.length), { icon: 'file-check' });
        html += _kpiCard('Total Credit Value', _fmtCurrency(claimsSummary.total_credit_value, '$'), { icon: 'credit-card', colorClass: 'kpi-success' });
        html += _kpiCard('Total Events', _fmtNumber(eventEntries.total_events || events.length), { icon: 'alert-circle' });

        const qualifications = eventEntries.qualifications || {};
        const qualified = qualifications['Qualified'] || qualifications['qualified'] || 0;
        html += _kpiCard('Qualified Events', _fmtNumber(qualified), { icon: 'check-circle', colorClass: 'kpi-success' });

        const guaranteeTypes = eventEntries.guarantee_types || {};
        html += _kpiCard('Guarantee Types', Object.keys(guaranteeTypes).filter(k => k !== 'Unknown').join(', ') || '—', { icon: 'shield' });
        html += '</div>';

        // Charts
        const claimsChartId = `svrg-claims-${Date.now()}`;
        const qualChartId = `svrg-qual-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Claims Over Time</div><div id="${claimsChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Event Qualification</div><div id="${qualChartId}" class="viz-chart-body"></div></div>
        </div>`;

        // Claims table
        if (claims.length > 0) {
            html += _sectionHeader('Claims Summary', 'table');
            const headers = ['Date', 'Year', 'Credit Ref', 'Guarantee', 'Credit Value', 'Cumulative'];
            const rows = claims.map(c => [c.date, c.year, c.credit_ref, c.guarantee, c.credit_value, c.cumulative_value]);
            html += _dataTable(headers, rows);
        }

        // Events table
        if (events.length > 0) {
            html += _sectionHeader('Event Entries', 'clipboard-list');
            const evHeaders = ['Event Type', 'Date', 'Engine Serial', 'Aircraft', 'Description', 'Qualification', 'Coverage'];
            const evRows = events.map(e => [
                e.event_type, e.date, e.engine_serial, e.aircraft,
                _truncate(e.description, 40), e.qualification, e.guarantee_coverage
            ]);
            html += _dataTable(evHeaders, evRows);
        }

        // Available sheets info (SVRG files have many specialized sheets)
        const availSheets = data.available_sheets || {};
        const sheetNames = Object.keys(availSheets);
        if (sheetNames.length > 0) {
            html += _sectionHeader('Available Data Sheets', 'database');
            const shHeaders = ['Sheet Name', 'Rows', 'Columns'];
            const shRows = sheetNames.map(name => [
                name, availSheets[name].row_count, availSheets[name].col_count
            ]);
            html += _dataTable(shHeaders, shRows);
        }

        el.innerHTML = html;

        // Charts
        setTimeout(() => {
            // Claims timeline
            if ($(claimsChartId) && claims.length > 0) {
                const claimDates = claims.filter(c => c.date).map(c => c.date);
                const claimValues = claims.filter(c => c.date).map(c => c.credit_value || 0);
                const cumValues = claims.filter(c => c.date).map(c => c.cumulative_value || 0);

                new ApexCharts($(claimsChartId), {
                    chart: { type: 'line', height: 280, background: 'transparent' },
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
                    theme: { mode: 'light' },
                }).render();
            }

            // Qualification donut
            if ($(qualChartId) && Object.keys(qualifications).length > 0) {
                new ApexCharts($(qualChartId), {
                    chart: { type: 'donut', height: 280, background: 'transparent' },
                    series: Object.values(qualifications),
                    labels: Object.keys(qualifications),
                    colors: [COLORS.green, COLORS.red, COLORS.amber, COLORS.silver],
                    plotOptions: { pie: { donut: { size: '62%' } } },
                    dataLabels: { enabled: false },
                    legend: { position: 'bottom' },
                    theme: { mode: 'light' },
                }).render();
            }
        }, 50);
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
        gsap.from('.viz-section', {
            opacity: 0, y: 30, duration: 0.5, stagger: 0.1, ease: 'power2.out',
        });
        gsap.from('.viz-kpi-card', {
            opacity: 0, y: 20, scale: 0.95, duration: 0.4, stagger: 0.05, ease: 'back.out(1.5)', delay: 0.2,
        });
        gsap.from('.viz-chart-card', {
            opacity: 0, y: 20, duration: 0.5, stagger: 0.08, ease: 'power2.out', delay: 0.3,
        });
    }

    // ═══════════════════════════════════════════════════
    // PUBLIC
    // ═══════════════════════════════════════════════════

    return {
        renderVisualizer,
        getFileTypeMeta,
        FILE_TYPE_META,
    };

})();
