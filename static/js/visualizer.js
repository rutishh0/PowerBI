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
        const maxRows = opts.maxRows || 200;
        const tableId = opts.id || '';
        let html = `<div class="viz-table-wrap"><table class="viz-data-table" ${tableId ? `id="${tableId}"` : ''}>`;
        html += '<thead><tr>';
        headers.forEach(h => { html += `<th class="viz-sortable-th">${h} <span class="viz-sort-icon"></span></th>`; });
        html += '</tr></thead><tbody>';
        rows.slice(0, maxRows).forEach(row => {
            html += '<tr>';
            row.forEach((cell, ci) => {
                const cls = typeof cell === 'number' ? (cell < 0 ? 'neg' : 'pos') : '';
                const formatted = typeof cell === 'number' ? _fmtNumber(cell) : _safe(cell);
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

        // Render charts after DOM is ready
        setTimeout(() => {
            _renderSOACharts(donutId, ccId, agingId, sections, allItems, aging);
        }, 100);
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
                plotOptions: { pie: { donut: { size: '70%' } } },
                legend: { position: 'bottom', fontSize: '11px', markers: { width: 8, height: 8 } },
                dataLabels: { enabled: false },
                stroke: { width: 2, colors: ['#fff'] }
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
                dataLabels: { enabled: false }
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
                dataLabels: { enabled: true, formatter: val => val > 0 ? _fmtCurrency(val) : '', offsetY: -20, style: { fontSize: '10px', colors: ['#304758'] } }
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
        const projectSummary = data.project_summary || {};
        const timeline = data.timeline || {};
        const customerAnalytics = data.customer_analytics || {};
        const cover = data.cover || {};
        const oppsAndThreats = data.opps_and_threats || {};

        // Flatten all opportunity records
        let allRecords = [];
        Object.entries(opportunities).forEach(([sheet, recs]) => {
            if (Array.isArray(recs)) recs.forEach(r => { allRecords.push({ ...r, _sheet: sheet }); });
        });

        // ─── Compute Aggregations client-side ───
        const _val = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
        const _sumField = (arr, field) => arr.reduce((s, r) => s + _val(r[field]), 0);

        const totalOpps = allRecords.length;
        const total2026 = _sumField(allRecords, 'benefit_2026');
        const total2027 = _sumField(allRecords, 'benefit_2027');
        const totalSum2627 = _sumField(allRecords, 'sum_26_27');
        const totalTerm = _sumField(allRecords, 'term_benefit');

        const byStatus = summary.by_status || {};
        const byProgramme = summary.by_programme || {};
        const byCustomer = summary.by_customer || {};
        const byOppType = summary.by_opportunity_type || {};
        const estLevels = summary.estimation_level_sums || {};

        const activeOpps = totalOpps - (byStatus['Cancelled'] || 0);
        const completedOpps = byStatus['Completed'] || 0;

        // Aggregate value by opp type × ext probability (for stacked bar)
        const probLevels = ['High', 'Med', 'Low'];
        const probColors = { 'High': '#10069F', 'Med': '#1565C0', 'Low': '#00838F' };
        const oppTypes = [...new Set(allRecords.map(r => r.opportunity_type).filter(Boolean))];
        const statusList = ['Hopper', 'ICT', 'Negotiations', 'Contracting', 'Completed', 'Cancelled'];

        // Value by Type × Probability
        const valueByTypeProbObj = {};
        oppTypes.forEach(t => { valueByTypeProbObj[t] = { High: 0, Med: 0, Low: 0 }; });
        allRecords.forEach(r => {
            const t = r.opportunity_type;
            const p = r.ext_probability;
            if (t && p && valueByTypeProbObj[t]) valueByTypeProbObj[t][p] += _val(r.sum_26_27);
        });

        // Value by Status × Probability
        const valueByStatusProbObj = {};
        statusList.forEach(s => { valueByStatusProbObj[s] = { High: 0, Med: 0, Low: 0 }; });
        allRecords.forEach(r => {
            const s = r.status;
            const p = r.ext_probability;
            if (s && p && valueByStatusProbObj[s]) valueByStatusProbObj[s][p] += _val(r.sum_26_27);
        });

        // Value by Customer (top 10 by sum_26_27)
        const custValues = {};
        allRecords.forEach(r => {
            const c = r.customer;
            if (c) custValues[c] = (custValues[c] || 0) + _val(r.sum_26_27);
        });
        const custTop10 = Object.entries(custValues).sort((a, b) => b[1] - a[1]).slice(0, 15);

        // By priority
        const byPriority = {};
        allRecords.forEach(r => {
            const p = String(r.priority || '?').replace('.0', '');
            if (!byPriority[p]) byPriority[p] = { count: 0, term: 0, sum_26_27: 0 };
            byPriority[p].count += 1;
            byPriority[p].term += _val(r.term_benefit);
            byPriority[p].sum_26_27 += _val(r.sum_26_27);
        });

        // Dollar formatter ($M)
        const $m = (v) => {
            if (v == null || isNaN(v)) return '—';
            return `$${Math.abs(v).toFixed(1)}m`;
        };

        let html = '';

        // Wrap everything in dark-themed scoped container
        html += '<div class="opp-tracker-dashboard">';

        // ═══════════════════════════════════════════
        // TITLE BANNER
        // ═══════════════════════════════════════════
        html += `<div class="viz-opp-banner">
            <div class="viz-opp-banner-inner">
                <div class="viz-opp-banner-title">
                    <i data-lucide="target"></i>
                    <span>${cover.title || 'MEA Commercial Optimisation Report'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:16px">
                    <div class="viz-opp-banner-badge">OPP TRACKER</div>
                    <div class="viz-opp-banner-rr">ROLLS‑ROYCE</div>
                </div>
            </div>
        </div>`;

        // ═══════════════════════════════════════════
        // FINANCIAL HERO KPIs
        // ═══════════════════════════════════════════
        html += `<div class="viz-opp-hero">
            <div class="viz-opp-hero-card">
                <div class="viz-opp-hero-label">2026</div>
                <div class="viz-opp-hero-value">${$m(total2026)}</div>
            </div>
            <div class="viz-opp-hero-card">
                <div class="viz-opp-hero-label">2027</div>
                <div class="viz-opp-hero-value">${$m(total2027)}</div>
            </div>
            <div class="viz-opp-hero-card viz-opp-hero-accent">
                <div class="viz-opp-hero-label">2026 + 2027</div>
                <div class="viz-opp-hero-value">${$m(totalSum2627)}</div>
            </div>
            <div class="viz-opp-hero-card viz-opp-hero-primary">
                <div class="viz-opp-hero-label">Term Impact</div>
                <div class="viz-opp-hero-value">${$m(totalTerm)}</div>
            </div>
        </div>`;

        // Meta bar
        html += '<div class="viz-customer-bar">';
        if (meta.away_day_date) html += `<div class="viz-info-chip"><b>Away Day:</b> ${meta.away_day_date}</div>`;
        if (meta.sheets_parsed) html += `<div class="viz-info-chip"><b>Sheets:</b> ${meta.sheets_parsed.join(', ')}</div>`;
        html += `<div class="viz-info-chip"><b>Opportunities:</b> ${totalOpps} (${activeOpps} active)</div>`;
        html += `<div class="viz-info-chip"><b>Customers:</b> ${Object.keys(byCustomer).length}</div>`;
        html += `<div class="viz-info-chip"><b>Programmes:</b> ${Object.keys(byProgramme).length}</div>`;
        html += '</div>';

        // ═══════════════════════════════════════════
        // PRIORITY BREAKDOWN
        // ═══════════════════════════════════════════
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
            // Add overall completed & pipeline KPIs
            html += _kpiCard('Completed', _fmtNumber(completedOpps), {
                icon: 'check-circle', colorClass: 'kpi-success',
                subtitle: `${((completedOpps / totalOpps) * 100).toFixed(0)}% of total`
            });
            html += _kpiCard('Pipeline', _fmtNumber(activeOpps - completedOpps), {
                icon: 'git-branch', colorClass: 'kpi-warning',
                subtitle: `${(byStatus['ICT'] || 0)} ICT · ${(byStatus['Negotiations'] || 0)} Neg · ${(byStatus['Contracting'] || 0)} Ctr`
            });
            html += '</div>';
        }

        // ═══════════════════════════════════════════
        // CHARTS ROW 1: Value by Type+Prob | Value by Status+Prob
        // ═══════════════════════════════════════════
        const typeChartId = `opp-type-val-${Date.now()}`;
        const statusChartId = `opp-status-val-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-2">
            <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Type of Opportunity & External Probability</div><div id="${typeChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Status & External Probability</div><div id="${statusChartId}" class="viz-chart-body"></div></div>
        </div>`;

        // ═══════════════════════════════════════════
        // CHARTS ROW 2: Customer Top | Financial Forecast
        // ═══════════════════════════════════════════
        const custChartId = `opp-cust-val-${Date.now()}`;
        const finChartId = `opp-fin-${Date.now()}`;
        const pipeDonutId = `opp-pipe-${Date.now()}`;
        html += `<div class="viz-chart-grid viz-chart-grid-3">
            <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Customer</div><div id="${custChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Financial Forecast by Level</div><div id="${finChartId}" class="viz-chart-body"></div></div>
            <div class="viz-chart-card"><div class="viz-chart-header">Pipeline Status</div><div id="${pipeDonutId}" class="viz-chart-body"></div></div>
        </div>`;

        // ═══════════════════════════════════════════
        // ESTIMATION LEVEL CARDS
        // ═══════════════════════════════════════════
        const levelEntries = Object.entries(estLevels);
        if (levelEntries.length > 0) {
            html += _sectionHeader('Estimation Level Breakdown', 'layers');
            html += `<div class="viz-kpi-grid viz-kpi-grid-${Math.min(levelEntries.length, 3)}">`;
            levelEntries.forEach(([level, sums]) => {
                const iconMap = { 'ICT': 'zap', 'Contract': 'file-check', 'Hopper': 'inbox' };
                html += _kpiCard(
                    `${level} Estimates`,
                    $m(sums.total_sum_26_27 || 0),
                    {
                        icon: iconMap[level] || 'layers',
                        colorClass: level === 'Contract' ? 'kpi-success' : '',
                        subtitle: `${sums.count} opps · Term: ${$m(sums.total_term_benefit)} · 2026: ${$m(sums.total_2026)} · 2027: ${$m(sums.total_2027)}`
                    }
                );
            });
            html += '</div>';
        }

        // ═══════════════════════════════════════════
        // EXT PROBABILITY BREAKDOWN
        // ═══════════════════════════════════════════
        html += _sectionHeader('External Probability & Opportunity Types', 'bar-chart-3');
        html += '<div class="viz-customer-bar">';
        // Probability chips
        const probAgg = {};
        allRecords.forEach(r => {
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
        // Opp type chips
        html += '<div class="viz-customer-bar" style="margin-top:8px">';
        const typeColors = [COLORS.navy, COLORS.blue2, COLORS.green, COLORS.teal, COLORS.orange, COLORS.purple, COLORS.red, COLORS.gold];
        Object.entries(byOppType).forEach(([type, count], i) => {
            const color = typeColors[i % typeColors.length];
            const typeVal = allRecords.filter(r => r.opportunity_type === type).reduce((s, r) => s + _val(r.sum_26_27), 0);
            html += `<div class="viz-info-chip" style="border-left:3px solid ${color}"><b>${type}:</b> ${count} · ${$m(typeVal)}</div>`;
        });
        html += '</div>';

        // ═══════════════════════════════════════════
        // COLLAPSIBLE SECTIONS HELPER
        // ═══════════════════════════════════════════
        const _collapsible = (title, icon, count, innerHtml, startOpen = false) => {
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
                <div class="opp-collapse-body" id="${colId}" style="${startOpen ? '' : 'display:none'}">
                    ${innerHtml}
                </div>
            </div>`;
        };

        // ═══════════════════════════════════════════
        // CUSTOMER-ASK TABLE (top opportunities by value)
        // ═══════════════════════════════════════════
        const topByValue = [...allRecords].sort((a, b) => _val(b.sum_26_27) - _val(a.sum_26_27)).slice(0, 20);
        const topHeaders = ['Customer', 'Asks', 'Ext Prob', 'Status', 'Sum of Value (26+27)'];
        const topRows = topByValue.map(r => [
            r.customer, _truncate(String(r.asks || ''), 45),
            r.ext_probability, r.status, _val(r.sum_26_27)
        ]);
        html += _collapsible('Top Opportunities by Value', 'trophy', `${topByValue.length} items`, _dataTable(topHeaders, topRows, { maxRows: 20 }), true);

        // ═══════════════════════════════════════════
        // TABLES BY ESTIMATION LEVEL
        // ═══════════════════════════════════════════
        let estHtml = '';
        const sheetOrder = Object.keys(opportunities);
        let totalEstItems = 0;
        sheetOrder.forEach(sheetName => {
            const recs = opportunities[sheetName] || [];
            if (!Array.isArray(recs) || recs.length === 0) return;
            totalEstItems += recs.length;
            const levelLabel = (meta.estimation_levels || {})[sheetName] || sheetName;
            const sheetSum = recs.reduce((s, r) => s + _val(r.sum_26_27), 0);
            const sheetTerm = recs.reduce((s, r) => s + _val(r.term_benefit), 0);

            estHtml += `<div class="viz-subsection">
                <div class="viz-subsection-header">
                    <span class="viz-subsection-name">${levelLabel} — ${sheetName}</span>
                    <span class="viz-subsection-total">${$m(sheetSum)} (26+27) · ${$m(sheetTerm)} term</span>
                    <span class="viz-subsection-count">${recs.length} opps</span>
                </div>
            </div>`;
            const headers = ['#', 'Project', 'Programme', 'Customer', 'Asks', 'Ext Prob', 'Status', 'Priority', 'Sum $M', 'Term $M'];
            const rows = recs.map(r => [
                r.number, _truncate(String(r.project || ''), 18),
                _truncate(String(r.programme || ''), 14), _truncate(String(r.customer || ''), 14),
                _truncate(String(r.asks || ''), 30), r.ext_probability, r.status,
                r.priority, _val(r.sum_26_27), _val(r.term_benefit),
            ]);
            estHtml += _dataTable(headers, rows, { maxRows: 50 });
        });
        if (totalEstItems > 0) {
            html += _collapsible('Opportunities by Estimation Level', 'table', `${totalEstItems} items`, estHtml);
        }

        // ═══════════════════════════════════════════
        // PROJECT TIMELINE (Gantt-style)
        // ═══════════════════════════════════════════
        const milestones = (timeline.milestones || []).filter(m => m.project && m.milestones);
        if (milestones.length > 0) {
            let timeHtml = '';
            // Phase progression table
            const phaseHeaders = ['Project', 'Customer', 'Current Phase', 'Days to Sign'];
            const phaseRows = milestones.slice(0, 30).map(m => {
                const ms = m.milestones || {};
                const signedDate = ms.proposal_signed ? new Date(ms.proposal_signed) : null;
                const now = new Date();
                const daysToSign = signedDate ? Math.round((signedDate - now) / (1000 * 60 * 60 * 24)) : '—';
                return [
                    _truncate(String(m.project || ''), 20),
                    _truncate(String(m.customer || ''), 16),
                    String(m.current_phase || '').replace(/_/g, ' '),
                    daysToSign,
                ];
            });
            timeHtml += _dataTable(phaseHeaders, phaseRows);

            // Gantt visual
            timeHtml += '<div class="viz-gantt-wrap">';
            const phases = ['idea_generation', 'approval_to_launch', 'strategy_approval', 'be_generated', 'approval', 'negotiation_strategy', 'proposal_submitted', 'proposal_signed'];
            const phaseLabels = ['Idea Gen', 'Launch', 'Strategy', 'BE Gen', 'Approval', 'Negotiation', 'Submitted', 'Signed'];
            const phaseColors = ['#4361EE', '#3A86FF', '#5E60CE', '#48BFE3', '#00E396', '#FF8B42', '#FFB547', '#FF4560'];

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
                    const isFuture = date && new Date(date) > new Date();
                    if (isCurrent) foundCurrent = true;
                    let cls = 'viz-gantt-empty';
                    if (isPast && !foundCurrent) cls = 'viz-gantt-done';
                    else if (isCurrent) cls = 'viz-gantt-current';
                    else if (isFuture || (!foundCurrent && !isPast)) cls = 'viz-gantt-future';
                    timeHtml += `<td class="${cls}" title="${phase}: ${date || 'N/A'}"><div class="viz-gantt-bar" style="background:${phaseColors[i]}"></div></td>`;
                });
                timeHtml += '</tr>';
            });
            timeHtml += '</tbody></table></div>';

            html += _collapsible('Project Timeline & Milestones', 'calendar', `${milestones.length} projects`, timeHtml);
        }

        // ═══════════════════════════════════════════
        // OPPS & THREATS
        // ═══════════════════════════════════════════
        const oatItems = oppsAndThreats.items || [];
        if (oatItems.length > 0) {
            const oatHeaders = ['Project', 'Customer', 'Opportunity', 'Status', 'Owner', 'Pack Improvement', 'Due Date'];
            const oatRows = oatItems.map(i => [
                i.project, i.customer, _truncate(String(i.opportunity || ''), 40),
                i.status, i.owner, typeof i.overall_pack_improvement === 'number' ? _fmtNumber(i.overall_pack_improvement) : '—',
                i.due_date,
            ]);
            html += _collapsible('Opportunities & Threats', 'alert-triangle', `${oatItems.length} items`, _dataTable(oatHeaders, oatRows));
        }

        // ═══════════════════════════════════════════
        // PROJECT SUMMARY
        // ═══════════════════════════════════════════
        const projects = (projectSummary.projects || []);
        if (projects.length > 0) {
            const prjHeaders = ['Group', 'Project', 'Customer', 'Programme', 'CRP Margin ($M)', 'CRP %', 'Onerous'];
            const prjRows = projects.map(p => [
                p.group, p.project, p.customer, p.programme,
                typeof p.current_crp_margin === 'number' ? p.current_crp_margin.toFixed(1) : '—',
                typeof p.current_crp_pct === 'number' ? (p.current_crp_pct * 100).toFixed(1) + '%' : '—',
                typeof p.onerous_provision === 'number' ? p.onerous_provision.toFixed(1) : '—',
            ]);
            html += _collapsible('Project Summary', 'briefcase', `${projects.length} projects`, _dataTable(prjHeaders, prjRows));
        }

        // Close the opp-tracker-dashboard wrapper
        html += '</div>';

        el.innerHTML = html;

        // Apply dark background to the visualizer container AND all parent containers
        el.style.background = '#03002E';
        el.style.borderRadius = '0';
        el.style.padding = '24px 32px';
        // Walk up the DOM to darken dashboard-body and header
        let parent = el.parentElement;
        while (parent) {
            if (parent.classList && parent.classList.contains('dashboard-body')) {
                parent.style.background = '#03002E';
            }
            if (parent.classList && parent.classList.contains('main-content')) {
                parent.style.background = '#03002E';
            }
            parent = parent.parentElement;
        }

        // Re-init Lucide icons for the new HTML
        if (window.lucide) window.lucide.createIcons();

        // Wire up collapsible sections
        el.querySelectorAll('.opp-collapse-header').forEach(header => {
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

        // ═══════════════════════════════════════════
        // RENDER CHARTS
        // ═══════════════════════════════════════════
        setTimeout(() => {
            _renderOppCharts({
                typeChartId, statusChartId, custChartId, finChartId, pipeDonutId,
                oppTypes, statusList, probLevels, probColors,
                valueByTypeProbObj, valueByStatusProbObj,
                custTop10, estLevels, byStatus
            });
        }, 100);
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
                    legend: { show: false }
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
    };

})();
