// ============================================================
// app.js — combined components + files + ai-chat + app bootstrap
// Auto-merged; each original file is preserved inside its own nested IIFE
// for scope isolation. secret-chat.js remains a separate file.
// ============================================================

(function() {
  'use strict';

  // ---------- RRComponents (from components.js) ----------
  (function() {
/**
 * Rolls-Royce SOA Dashboard — Components Module
 * DOM rendering for KPI cards, data tables, filters, section tabs, etc.
 */

const RRComponents = (() => {
    'use strict';

    const AGING_ORDER = ['Current', '1-30 Days', '31-60 Days', '61-90 Days', '91-180 Days', '180+ Days', 'Unknown'];

    // ─── Helpers ───

    function _esc(str) {
        if (str == null) return '—';
        const s = String(str);
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function _fmtCurrency(val, short = true) {
        if (val == null || isNaN(val)) return '—';
        const neg = val < 0;
        const abs = Math.abs(val);
        let str;
        if (short && abs >= 1_000_000) str = '$' + (abs / 1_000_000).toFixed(2) + 'M';
        else if (short && abs >= 1_000) str = '$' + (abs / 1_000).toFixed(1) + 'K';
        else str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return neg ? '-' + str : str;
    }

    function _fmtDate(val) {
        if (!val) return '—';
        try {
            const d = new Date(val);
            if (isNaN(d.getTime())) return String(val);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return String(val); }
    }

    function _agingBucket(days) {
        if (days == null) return 'Unknown';
        const d = parseInt(days);
        if (isNaN(d)) return 'Unknown';
        if (d <= 0) return 'Current';
        if (d <= 30) return '1-30 Days';
        if (d <= 60) return '31-60 Days';
        if (d <= 90) return '61-90 Days';
        if (d <= 180) return '91-180 Days';
        return '180+ Days';
    }


    // ═══════════════════════════════════════════
    // CUSTOMER INFO BAR
    // ═══════════════════════════════════════════

    function renderCustomerInfo(container, metadataList) {
        if (!metadataList || metadataList.length === 0) { container.innerHTML = ''; return; }

        let html = '';
        for (const meta of metadataList) {
            const name = _esc(meta.customer_name || 'Unknown Customer');
            const id = _esc(meta.customer_id || '—');
            const contact = _esc(meta.contact || '—');
            const lpi = meta.lpi_rate ? (meta.lpi_rate * 100).toFixed(2) + '%' : null;
            const avgLate = meta.avg_days_late;
            const reportDate = meta.report_date ? _fmtDate(meta.report_date) : null;

            html += `
                <div class="customer-card gsap-hidden">
                    <div>
                        <span class="customer-name">${name}</span>
                        <div class="info-chips" style="margin-top:8px;">
                            <span class="info-chip"><strong>ID:</strong> ${id}</span>
                            <span class="info-chip">${contact}</span>
                            ${lpi ? `<span class="info-chip"><strong>LPI Rate:</strong> ${lpi}</span>` : ''}
                            ${avgLate ? `<span class="info-chip"><strong>Avg Days Late:</strong> ${avgLate}</span>` : ''}
                            ${reportDate ? `<span class="info-chip"><strong>Report:</strong> ${reportDate}</span>` : ''}
                        </div>
                    </div>
                </div>`;
        }
        container.innerHTML = html;
    }


    // ═══════════════════════════════════════════
    // KPI CARDS
    // ═══════════════════════════════════════════

    function renderKPICards(container, grandTotals, avgLate, itemCount) {
        const tc = grandTotals.total_charges || 0;
        const tcr = grandTotals.total_credits || 0;
        const nb = grandTotals.net_balance || 0;
        const to = grandTotals.total_overdue || nb;
        const items = grandTotals.item_count || itemCount || 0;

        const kpis = [
            { label: 'Total Charges', value: _fmtCurrency(tc), cls: '' },
            { label: 'Total Credits', value: _fmtCurrency(tcr), cls: tcr < 0 ? 'positive' : '' },
            { label: 'Net Balance', value: _fmtCurrency(nb), cls: nb > 0 ? 'negative' : 'positive' },
            { label: 'Total Overdue', value: _fmtCurrency(to), cls: 'negative', clickable: true },
            { label: 'Avg Days Late', value: avgLate || '—', cls: '' },
            { label: 'Open Items', value: items.toLocaleString(), cls: '' },
        ];

        let html = '<div class="kpi-grid">';
        kpis.forEach((kpi, i) => {
            html += `
                <div class="kpi-card ${kpi.cls === 'positive' ? 'positive' : kpi.cls === 'negative' ? 'negative' : ''} ${kpi.clickable ? 'clickable' : ''} gsap-hidden" data-index="${i}">
                    <div class="kpi-label">${_esc(kpi.label)}</div>
                    <div class="kpi-value ${kpi.cls}">${_esc(kpi.value)}</div>
                </div>`;
        });
        html += '</div>';

        // Credit highlight bar
        if (tcr !== 0) {
            html += `
                <div class="credit-bar gsap-hidden">
                    <span class="credit-bar-label">Credit Available: ${_fmtCurrency(Math.abs(tcr))}</span>
                </div>`;
        }

        container.innerHTML = html;
    }


    // ═══════════════════════════════════════════
    // DEBT DECOMPOSITION
    // ═══════════════════════════════════════════

    function renderDebtDecomposition(container, items) {
        if (!items || items.length === 0) { container.innerHTML = ''; return; }

        // Compute charges per section
        const chargesBySection = {};
        items.forEach(item => {
            if (item.Amount > 0) {
                chargesBySection[item.Section] = (chargesBySection[item.Section] || 0) + item.Amount;
            }
        });

        const entries = Object.entries(chargesBySection).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) { container.innerHTML = ''; return; }

        const totalDebt = entries.reduce((sum, [, v]) => sum + v, 0);
        if (totalDebt <= 0) { container.innerHTML = ''; return; }

        const COLORS = RRCharts.CHART_COLORS;

        let segmentsHtml = '';
        let chipsHtml = '';
        entries.forEach(([name, amount], i) => {
            const pct = (amount / totalDebt) * 100;
            const color = COLORS[i % COLORS.length];
            segmentsHtml += `<div class="debt-bar-segment" style="width:${pct.toFixed(1)}%;background:${color}" title="${_esc(name)}: ${_fmtCurrency(amount)} (${pct.toFixed(0)}%)"></div>`;
            chipsHtml += `<span class="debt-chip"><span class="debt-chip-dot" style="background:${color}"></span><strong>${_esc(name)}:</strong> ${_fmtCurrency(amount)} (${pct.toFixed(0)}%)</span>`;
        });

        container.innerHTML = `
            <div class="debt-card gsap-hidden">
                <div class="debt-title">Total Debt: ${_fmtCurrency(totalDebt)}</div>
                <div class="debt-bar">${segmentsHtml}</div>
                <div class="debt-breakdown">${chipsHtml}</div>
            </div>`;
    }


    // ═══════════════════════════════════════════
    // SECTION TABS
    // ═══════════════════════════════════════════

    function renderSectionTabs(tabBarEl, tabContentEl, sections, items) {
        if (!sections || Object.keys(sections).length === 0) {
            tabBarEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">No sections found.</p>';
            tabContentEl.innerHTML = '';
            return;
        }

        const secNames = Object.keys(sections);

        // Tab buttons
        let tabsHtml = '';
        secNames.forEach((name, i) => {
            tabsHtml += `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${i}">${_esc(name)}</button>`;
        });
        tabBarEl.innerHTML = tabsHtml;

        // Tab panels
        let panelsHtml = '';
        secNames.forEach((name, i) => {
            const sec = sections[name];
            const rows = sec.rows || [];
            const totals = sec.totals || {};

            // KPIs
            const secCharges = rows.filter(r => r.Amount > 0).reduce((s, r) => s + r.Amount, 0);
            const secCredits = rows.filter(r => r.Amount < 0).reduce((s, r) => s + r.Amount, 0);
            const secTotal = totals.total != null ? totals.total : secCharges + secCredits;
            const secOverdue = totals.overdue;
            const secItems = rows.length;

            panelsHtml += `
                <div class="tab-panel ${i === 0 ? 'active' : ''}" data-tab="${i}">
                    <div class="section-kpi-grid">
                        <div class="section-kpi-card"><div class="section-kpi-label">Section Total</div><div class="section-kpi-value">${_fmtCurrency(secTotal)}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">Charges</div><div class="section-kpi-value">${_fmtCurrency(secCharges)}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">Credits</div><div class="section-kpi-value" style="color:var(--success)">${_fmtCurrency(secCredits)}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">${secOverdue != null ? 'Overdue' : 'Items'}</div><div class="section-kpi-value" ${secOverdue != null ? 'style="color:var(--danger)"' : ''}>${secOverdue != null ? _fmtCurrency(secOverdue) : secItems}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">Net</div><div class="section-kpi-value">${_fmtCurrency(secCharges + secCredits)}</div></div>
                    </div>
                    <div class="section-charts-grid">
                        <div class="chart-card"><div class="chart-card-header">Status Distribution</div><div id="sectionPie_${i}" class="chart-container" style="min-height:280px;"></div></div>
                        <div class="chart-card"><div class="chart-card-header">Top Items by Amount</div><div id="sectionTopItems_${i}" class="chart-container" style="min-height:280px;"></div></div>
                    </div>
                    <div class="chart-card" style="margin-top:var(--space-4);">
                        <div class="chart-card-header">Detailed Line Items (${secItems})</div>
                        <div class="register-table-wrap" style="max-height:350px;">
                            <table class="data-table" id="sectionTable_${i}">
                                <thead id="sectionThead_${i}"></thead>
                                <tbody id="sectionTbody_${i}"></tbody>
                            </table>
                        </div>
                    </div>
                </div>`;
        });
        tabContentEl.innerHTML = panelsHtml;

        // Tab click handlers
        tabBarEl.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                tabBarEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                tabContentEl.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = tabContentEl.querySelector(`.tab-panel[data-tab="${btn.dataset.tab}"]`);
                if (panel) {
                    panel.classList.add('active');
                    panel.style.animation = 'none';
                    panel.offsetHeight; // trigger reflow
                    panel.style.animation = 'tabFadeIn 0.3s ease';
                }
                _renderSectionCharts(parseInt(btn.dataset.tab), sections, secNames);
            });
        });

        // Render first tab charts
        _renderSectionCharts(0, sections, secNames);
    }

    function _renderSectionCharts(tabIndex, sections, secNames) {
        const name = secNames[tabIndex];
        const sec = sections[name];
        const rows = sec.rows || [];

        // Status pie
        const statusCounts = {};
        rows.forEach(r => {
            const st = r.Status || r['R-R Comments'] || 'Unknown';
            const trimmed = st.length > 40 ? st.substring(0, 37) + '...' : st;
            statusCounts[trimmed] = (statusCounts[trimmed] || 0) + 1;
        });

        const statusLabels = Object.keys(statusCounts);
        const statusValues = Object.values(statusCounts);
        if (statusLabels.length > 0) {
            RRCharts.renderStatusPie(`sectionPie_${tabIndex}`, statusLabels, statusValues);
        }

        // Top items bar
        const sortedRows = [...rows].sort((a, b) => Math.abs(b.Amount) - Math.abs(a.Amount)).slice(0, 8);
        const topLabels = sortedRows.map(r => {
            const text = r.Text || r.Reference || 'Item';
            return text.length > 35 ? text.substring(0, 32) + '...' : text;
        });
        const topAmounts = sortedRows.map(r => r.Amount);
        if (topLabels.length > 0) {
            RRCharts.renderTopItemsBar(`sectionTopItems_${tabIndex}`, topLabels, topAmounts);
        }

        // Section detail table
        _renderSectionTable(tabIndex, rows);
    }

    function _renderSectionTable(tabIndex, rows) {
        const theadEl = document.getElementById(`sectionThead_${tabIndex}`);
        const tbodyEl = document.getElementById(`sectionTbody_${tabIndex}`);
        if (!theadEl || !tbodyEl) return;

        const cols = ['Reference', 'Document No', 'Document Date', 'Due Date', 'Amount', 'Currency', 'Text', 'Status', 'Days Late', 'Entry Type'];
        const activeCols = cols.filter(c => rows.some(r => r[c] != null && r[c] !== ''));

        theadEl.innerHTML = '<tr>' + activeCols.map(c => `<th>${_esc(c)}</th>`).join('') + '</tr>';

        let bodyHtml = '';
        rows.forEach(row => {
            bodyHtml += '<tr>';
            activeCols.forEach(col => {
                let val = row[col];
                let cls = '';
                if (col === 'Amount') {
                    cls = val > 0 ? 'amount-positive' : val < 0 ? 'amount-negative' : '';
                    val = _fmtCurrency(val, false);
                } else if (col === 'Document Date' || col === 'Due Date') {
                    val = _fmtDate(val);
                }
                bodyHtml += `<td class="${cls}">${_esc(val)}</td>`;
            });
            bodyHtml += '</tr>';
        });
        tbodyEl.innerHTML = bodyHtml;
    }


    // ═══════════════════════════════════════════
    // INVOICE REGISTER
    // ═══════════════════════════════════════════

    function renderInvoiceRegister(filtersEl, theadEl, tbodyEl, footerEl, items, sections) {
        if (!items || items.length === 0) {
            filtersEl.innerHTML = '';
            theadEl.innerHTML = '';
            tbodyEl.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">No data available</td></tr>';
            footerEl.innerHTML = '';
            return;
        }

        // Get unique values for filters
        const allSections = [...new Set(items.map(i => i.Section))].sort();
        const allTypes = [...new Set(items.map(i => i['Entry Type']))].sort();

        // Render filters
        filtersEl.innerHTML = `
            <div class="register-filter-item">
                <label class="register-filter-label">Section</label>
                <select class="register-filter-select" id="regFilterSection">
                    <option value="">All Sections</option>
                    ${allSections.map(s => `<option value="${_esc(s)}">${_esc(s)}</option>`).join('')}
                </select>
            </div>
            <div class="register-filter-item">
                <label class="register-filter-label">Type</label>
                <select class="register-filter-select" id="regFilterType">
                    <option value="">All Types</option>
                    ${allTypes.map(t => `<option value="${_esc(t)}">${_esc(t)}</option>`).join('')}
                </select>
            </div>
            <div class="register-filter-item">
                <label class="register-filter-label">Overdue</label>
                <select class="register-filter-select" id="regFilterOverdue">
                    <option value="">All</option>
                    <option value="overdue">Overdue Only</option>
                    <option value="current">Current Only</option>
                </select>
            </div>
        `;

        // Define columns
        const allCols = ['Section', 'Reference', 'Document No', 'Document Date', 'Due Date', 'Amount', 'Currency', 'Text', 'Status', 'Action Owner', 'Days Late', 'Entry Type'];
        const activeCols = allCols.filter(c => items.some(i => i[c] != null && i[c] !== ''));

        // Sort state
        let sortCol = null;
        let sortAsc = true;

        function _renderTable(filtered) {
            // Sort
            let sorted = [...filtered];
            if (sortCol != null) {
                sorted.sort((a, b) => {
                    let va = a[sortCol], vb = b[sortCol];
                    if (sortCol === 'Amount' || sortCol === 'Days Late') {
                        va = parseFloat(va) || 0;
                        vb = parseFloat(vb) || 0;
                    } else {
                        va = String(va || '').toLowerCase();
                        vb = String(vb || '').toLowerCase();
                    }
                    if (va < vb) return sortAsc ? -1 : 1;
                    if (va > vb) return sortAsc ? 1 : -1;
                    return 0;
                });
            }

            // Render header
            theadEl.innerHTML = '<tr>' + activeCols.map(c => {
                const isSorted = sortCol === c;
                const icon = isSorted ? (sortAsc ? ' ▲' : ' ▼') : '';
                return `<th class="${isSorted ? 'sorted' : ''}" data-col="${_esc(c)}">${_esc(c)}<span class="sort-icon">${icon}</span></th>`;
            }).join('') + '</tr>';

            // Limit display to 200 rows for performance
            const displayRows = sorted.slice(0, 200);

            let bodyHtml = '';
            displayRows.forEach(row => {
                bodyHtml += '<tr>';
                activeCols.forEach(col => {
                    let val = row[col];
                    let cls = '';
                    if (col === 'Amount') {
                        cls = val > 0 ? 'amount-positive' : val < 0 ? 'amount-negative' : '';
                        val = _fmtCurrency(val, false);
                    } else if (col === 'Document Date' || col === 'Due Date') {
                        val = _fmtDate(val);
                    }
                    bodyHtml += `<td class="${cls}">${_esc(val)}</td>`;
                });
                bodyHtml += '</tr>';
            });
            tbodyEl.innerHTML = bodyHtml;

            // Footer stats
            const totalAmt = filtered.reduce((s, r) => s + (r.Amount || 0), 0);
            const overdueItems = filtered.filter(r => (r['Days Late'] || 0) > 0);
            const overdueAmt = overdueItems.reduce((s, r) => s + (r.Amount || 0), 0);

            footerEl.innerHTML = `
                <div class="register-stat">Showing <strong>${Math.min(displayRows.length, filtered.length)}</strong> of <strong>${filtered.length}</strong> items${sorted.length > 200 ? ' (limited to 200)' : ''}</div>
                <div class="register-stat">Total: <strong>${_fmtCurrency(totalAmt, false)}</strong></div>
                <div class="register-stat">Overdue: <strong style="color:var(--danger)">${_fmtCurrency(overdueAmt, false)}</strong></div>
            `;

            // Sort click handlers
            theadEl.querySelectorAll('th').forEach(th => {
                th.addEventListener('click', () => {
                    const col = th.dataset.col;
                    if (sortCol === col) sortAsc = !sortAsc;
                    else { sortCol = col; sortAsc = true; }
                    _renderTable(filtered);
                });
            });
        }

        function _applyFilters() {
            let filtered = [...items];
            const secVal = document.getElementById('regFilterSection')?.value;
            const typeVal = document.getElementById('regFilterType')?.value;
            const overdueVal = document.getElementById('regFilterOverdue')?.value;

            if (secVal) filtered = filtered.filter(i => i.Section === secVal);
            if (typeVal) filtered = filtered.filter(i => i['Entry Type'] === typeVal);
            if (overdueVal === 'overdue') filtered = filtered.filter(i => (i['Days Late'] || 0) > 0);
            if (overdueVal === 'current') filtered = filtered.filter(i => (i['Days Late'] || 0) <= 0);

            _renderTable(filtered);
        }

        // Initial render
        _applyFilters();

        // Filter change handlers
        ['regFilterSection', 'regFilterType', 'regFilterOverdue'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', _applyFilters);
        });
    }


    // ═══════════════════════════════════════════
    // SIDEBAR FILTERS
    // ═══════════════════════════════════════════

    function renderSidebarFilters(items) {
        if (!items || items.length === 0) return;

        const sectionFiltersEl = document.getElementById('sectionFilters');
        const typeFiltersEl = document.getElementById('typeFilters');
        const overdueFiltersEl = document.getElementById('overdueFilters');
        const filtersSection = document.getElementById('filtersSection');
        const exportSection = document.getElementById('exportSection');

        filtersSection.style.display = 'block';
        exportSection.style.display = 'block';

        // Section filters
        const allSections = [...new Set(items.map(i => i.Section))].sort();
        sectionFiltersEl.innerHTML = allSections.map(s =>
            `<label class="filter-check"><input type="checkbox" checked data-filter="section" value="${_esc(s)}"><span>${_esc(s)}</span></label>`
        ).join('');

        // Type filters
        const allTypes = [...new Set(items.map(i => i['Entry Type']))].sort();
        typeFiltersEl.innerHTML = allTypes.map(t =>
            `<label class="filter-check"><input type="checkbox" checked data-filter="type" value="${_esc(t)}"><span>${_esc(t)}</span></label>`
        ).join('');

        // Overdue filters
        overdueFiltersEl.innerHTML = `
            <label class="filter-check"><input type="checkbox" checked data-filter="overdue" value="Overdue"><span>Overdue</span></label>
            <label class="filter-check"><input type="checkbox" checked data-filter="overdue" value="Current"><span>Current</span></label>
        `;
    }

    function getActiveFilters() {
        const sections = [...document.querySelectorAll('[data-filter="section"]:checked')].map(el => el.value);
        const types = [...document.querySelectorAll('[data-filter="type"]:checked')].map(el => el.value);
        const overdue = [...document.querySelectorAll('[data-filter="overdue"]:checked')].map(el => el.value);
        return { sections, types, overdue };
    }

    function applyFiltersToItems(items, filters) {
        if (!items) return [];
        let filtered = [...items];

        if (filters.sections && filters.sections.length > 0) {
            filtered = filtered.filter(i => filters.sections.includes(i.Section));
        }
        if (filters.types && filters.types.length > 0) {
            filtered = filtered.filter(i => filters.types.includes(i['Entry Type']));
        }
        if (filters.overdue) {
            const hasOverdue = filters.overdue.includes('Overdue');
            const hasCurrent = filters.overdue.includes('Current');
            if (hasOverdue && !hasCurrent) {
                filtered = filtered.filter(i => (i['Days Late'] || 0) > 0);
            } else if (!hasOverdue && hasCurrent) {
                filtered = filtered.filter(i => (i['Days Late'] || 0) <= 0);
            }
        }
        return filtered;
    }


    // ═══════════════════════════════════════════
    // COMPARISON MODE
    // ═══════════════════════════════════════════

    function renderComparisonMode(container, filesData) {
        const fileNames = Object.keys(filesData);
        if (fileNames.length < 2) {
            container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px;">Upload 2+ files for comparison mode.</p>';
            return;
        }

        const cols = Math.min(fileNames.length, 4);
        let html = `<div class="comparison-grid" style="grid-template-columns:repeat(${cols}, 1fr);">`;

        fileNames.forEach((fname, idx) => {
            const data = filesData[fname];
            const meta = data.metadata || {};
            const grand = data.grand_totals || {};
            const items = data.all_items || [];

            const custName = _esc(meta.customer_name || 'Unknown');
            const custId = _esc(meta.customer_id || '—');

            // Section totals for chart
            const secTotals = {};
            items.forEach(item => {
                secTotals[item.Section] = (secTotals[item.Section] || 0) + (item.Amount || 0);
            });

            html += `
                <div class="comparison-column">
                    <div class="comparison-column-header">
                        <div class="comparison-column-name">${custName}</div>
                        <div class="comparison-column-sub">ID: ${custId}</div>
                        <div class="comparison-column-sub" style="font-size:0.7rem;margin-top:4px;">${_esc(fname)}</div>
                    </div>
                    <div class="section-kpi-grid" style="grid-template-columns:1fr;">
                        <div class="section-kpi-card"><div class="section-kpi-label">Total Charges</div><div class="section-kpi-value">${_fmtCurrency(grand.total_charges || 0)}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">Total Credits</div><div class="section-kpi-value" style="color:var(--success)">${_fmtCurrency(grand.total_credits || 0)}</div></div>
                        <div class="section-kpi-card"><div class="section-kpi-label">Net Balance</div><div class="section-kpi-value" style="color:${(grand.net_balance || 0) > 0 ? 'var(--danger)' : 'var(--success)'}">${_fmtCurrency(grand.net_balance || 0)}</div></div>
                    </div>
                    <div id="compChart_${idx}" style="margin-top:16px;"></div>
                </div>`;
        });

        html += '</div>';

        // Comparison table
        html += `
            <div class="chart-card" style="margin-top:var(--space-6);">
                <div class="chart-card-header">Key Metrics Comparison</div>
                <div class="register-table-wrap" style="max-height:300px;">
                    <table class="data-table">
                        <thead><tr>
                            <th>Metric</th>
                            ${fileNames.map(f => `<th>${_esc(f)}</th>`).join('')}
                        </tr></thead>
                        <tbody>
                            <tr><td>Customer</td>${fileNames.map(f => `<td>${_esc(filesData[f].metadata?.customer_name || '—')}</td>`).join('')}</tr>
                            <tr><td>Total Charges</td>${fileNames.map(f => `<td class="amount-positive">${_fmtCurrency(filesData[f].grand_totals?.total_charges || 0)}</td>`).join('')}</tr>
                            <tr><td>Total Credits</td>${fileNames.map(f => `<td class="amount-negative">${_fmtCurrency(filesData[f].grand_totals?.total_credits || 0)}</td>`).join('')}</tr>
                            <tr><td>Net Balance</td>${fileNames.map(f => `<td>${_fmtCurrency(filesData[f].grand_totals?.net_balance || 0)}</td>`).join('')}</tr>
                            <tr><td>Open Items</td>${fileNames.map(f => `<td>${filesData[f].grand_totals?.item_count || 0}</td>`).join('')}</tr>
                            <tr><td>Avg Days Late</td>${fileNames.map(f => `<td>${filesData[f].metadata?.avg_days_late || '—'}</td>`).join('')}</tr>
                        </tbody>
                    </table>
                </div>
            </div>`;

        container.innerHTML = html;

        // Render per-source charts
        fileNames.forEach((fname, idx) => {
            const items = filesData[fname].all_items || [];
            const secTotals = {};
            items.forEach(item => {
                secTotals[item.Section] = (secTotals[item.Section] || 0) + (item.Amount || 0);
            });
            const cats = Object.keys(secTotals);
            const vals = Object.values(secTotals);
            if (cats.length > 0) {
                RRCharts.renderSimpleBar(`compChart_${idx}`, cats, vals);
            }
        });
    }


    // ═══════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ═══════════════════════════════════════════

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }


    // ═══════════════════════════════════════════
    // LOADING OVERLAY
    // ═══════════════════════════════════════════

    function showLoading() {
        if (document.getElementById('loadingOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(overlay);
    }

    function hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.remove();
    }


    // ─── Public API ───
    return {
        renderCustomerInfo,
        renderKPICards,
        renderDebtDecomposition,
        renderSectionTabs,
        renderInvoiceRegister,
        renderSidebarFilters,
        getActiveFilters,
        applyFiltersToItems,
        renderComparisonMode,
        showToast,
        showLoading,
        hideLoading,
        fmtCurrency: _fmtCurrency,
        fmtDate: _fmtDate,
        agingBucket: _agingBucket,
        AGING_ORDER,
    };
})();

    window.RRComponents = RRComponents;
  })();

  // ---------- FilesModule (from files.js) ----------
  (function() {
/**
 * Rolls-Royce SOA Dashboard — Files Module
 * Handles password-protected file viewing and downloading.
 * V2: Chunked upload to Cloudflare R2 for large files (up to 200MB).
 */

const FilesModule = (() => {
    'use strict';

    // ─── Constants ───
    const PASSWORD = 'ChickenMan123'; // Same as Secret Chat
    const ENDPOINT_FILES = '/api/files';
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks (safe for NetSkope + Base64 overhead ~10.6MB per request)

    // ─── State ───
    let _isAuthenticated = false;

    // ─── DOM Elements ───
    const $ = (id) => document.getElementById(id);

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        console.log('Files Module Loaded (V1 + V2 R2)');
        _bindEvents();
    }

    // ═══════════════════════════════════════════
    // EVENT BINDINGS
    // ═══════════════════════════════════════════

    function _bindEvents() {
        const unlockBtn = $('filesUnlockBtn');
        const passwordInput = $('filesPasswordInput');

        if (unlockBtn && passwordInput) {
            unlockBtn.addEventListener('click', _handleUnlock);
            passwordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') _handleUnlock();
            });
        }

        const refreshBtn = $('filesRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', _fetchFiles);
        }

        _bindUpload();
        _bindR2Upload();

        // R2 refresh button
        const r2RefreshBtn = $('r2RefreshBtn');
        if (r2RefreshBtn) {
            r2RefreshBtn.addEventListener('click', _fetchR2Files);
        }

        // Global listener for view change
        const pills = document.querySelectorAll('.view-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                const view = e.currentTarget.getAttribute('data-view');
                if (view === 'files') {
                    _checkAuth();
                }
            });
        });
    }

    function _bindUpload() {
        const zone = $('filesUploadZone');
        const input = $('filesUploadInput');
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            if (input.files.length > 0) _handleFilesUpload(input.files);
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--rr-blue)';
            zone.style.background = 'rgba(0, 102, 204, 0.1)';
        });

        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = 'var(--rr-border)';
            zone.style.background = 'rgba(255,255,255,0.05)';
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = 'var(--rr-border)';
            zone.style.background = 'rgba(255,255,255,0.05)';
            if (e.dataTransfer.files.length > 0) _handleFilesUpload(e.dataTransfer.files);
        });
    }

    // ═══════════════════════════════════════════
    // V2: R2 CHUNKED UPLOAD
    // ═══════════════════════════════════════════

    function _bindR2Upload() {
        const zone = $('r2UploadZone');
        const input = $('r2UploadInput');
        if (!zone || !input) return;

        zone.addEventListener('click', (e) => {
            if (e.target === input) return;
            input.click();
        });
        input.addEventListener('change', () => {
            if (input.files.length > 0) _handleR2Upload(input.files);
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.style.borderColor = '#F6821F';
            zone.style.background = 'rgba(246, 130, 31, 0.15)';
        });

        zone.addEventListener('dragleave', () => {
            zone.style.borderColor = '#F6821F';
            zone.style.background = 'rgba(246, 130, 31, 0.05)';
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.style.borderColor = '#F6821F';
            zone.style.background = 'rgba(246, 130, 31, 0.05)';
            if (e.dataTransfer.files.length > 0) _handleR2Upload(e.dataTransfer.files);
        });
    }

    /**
     * Safely parse JSON from a response, handling 502/503 HTML error pages.
     */
    async function _safeJson(resp) {
        const text = await resp.text();
        try {
            return JSON.parse(text);
        } catch {
            // Server returned HTML (e.g. 502/503 proxy error)
            throw new Error(`Server error ${resp.status}: ${text.substring(0, 120)}`);
        }
    }

    async function _handleR2Upload(fileList) {
        const files = Array.from(fileList);
        const progressContainer = $('r2UploadProgressContainer');

        for (let fi = 0; fi < files.length; fi++) {
            const file = files[fi];
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            // Show progress UI
            if (progressContainer) {
                progressContainer.style.display = 'block';
                progressContainer.innerHTML = `
                    <div style="background: var(--rr-bg-card); padding: 15px; border-radius: 8px; border: 1px solid #F6821F;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-weight:500;">Uploading: ${file.name} (${_fmtSize(file.size)})</span>
                            <span id="r2UploadPct">0%</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.8rem; color:var(--rr-text-muted);">
                            <span>File ${fi + 1} of ${files.length}</span>
                            <span id="r2UploadChunkInfo">Chunk 0/${totalChunks}</span>
                        </div>
                        <div style="width:100%; height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                            <div id="r2UploadBar" style="width:0%; height:100%; background:linear-gradient(90deg, #F6821F, #FBAD41); border-radius:4px; transition:width 0.3s ease;"></div>
                        </div>
                        <div id="r2UploadStatus" style="margin-top:8px; font-size:0.8rem; color:var(--rr-text-muted);">Initializing...</div>
                    </div>
                `;
            }

            try {
                // Step 1: Init multipart upload on R2
                _updateR2Progress(0, totalChunks, 'Starting multipart upload on R2...');
                const initResp = await fetch('/api/r2/chunk-init', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: file.name, total_chunks: totalChunks }),
                });

                if (!initResp.ok) {
                    const err = await _safeJson(initResp);
                    throw new Error(err.error || `Init failed (${initResp.status})`);
                }

                const { upload_id } = await initResp.json();

                // Step 2: Send chunks sequentially — each goes directly to R2 as a multipart part
                for (let i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, file.size);
                    const blob = file.slice(start, end);

                    const arrayBuf = await blob.arrayBuffer();
                    const b64 = _arrayBufferToBase64(arrayBuf);

                    _updateR2Progress(i, totalChunks, `Streaming part ${i + 1} of ${totalChunks} to R2...`);

                    const chunkResp = await fetch('/api/r2/chunk-upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            upload_id: upload_id,
                            chunk_index: i,
                            data: b64,
                        }),
                    });

                    if (!chunkResp.ok) {
                        const err = await _safeJson(chunkResp);
                        throw new Error(err.error || `Part ${i + 1} failed (${chunkResp.status})`);
                    }
                }

                // Step 3: Finalize — R2 assembles the parts server-side (no memory needed)
                _updateR2Progress(totalChunks, totalChunks, 'Completing multipart upload on R2...');

                const finalResp = await fetch('/api/r2/chunk-finalize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ upload_id: upload_id }),
                });

                if (!finalResp.ok) {
                    const err = await _safeJson(finalResp);
                    throw new Error(err.error || `Finalize failed (${finalResp.status})`);
                }

                const result = await finalResp.json();
                _updateR2Progress(totalChunks, totalChunks, 'Upload complete!');
                RRComponents.showToast(`${file.name} uploaded to R2 (${_fmtSize(result.file_size)})`, 'success');

            } catch (error) {
                console.error('R2 upload error:', error);
                RRComponents.showToast(`R2 upload failed: ${error.message}`, 'error');
                if (progressContainer) {
                    const statusEl = $('r2UploadStatus');
                    if (statusEl) statusEl.innerHTML = `<span style="color:var(--rr-error);">Failed: ${error.message}</span>`;
                }
                // Stop processing remaining files if server crashed
                break;
            }
        }

        // Refresh R2 file list
        _fetchR2Files();

        // Clear input
        const input = $('r2UploadInput');
        if (input) input.value = '';

        // Hide progress after delay
        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
        }, 4000);
    }

    function _updateR2Progress(current, total, statusText) {
        const bar = $('r2UploadBar');
        const pct = $('r2UploadPct');
        const chunkInfo = $('r2UploadChunkInfo');
        const status = $('r2UploadStatus');

        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        if (bar) bar.style.width = percent + '%';
        if (pct) pct.textContent = percent + '%';
        if (chunkInfo) chunkInfo.textContent = `Chunk ${current}/${total}`;
        if (status) status.textContent = statusText;
    }

    function _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    }

    function _fmtSize(bytes) {
        if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    }


    // ═══════════════════════════════════════════
    // V1: ORIGINAL UPLOAD (PostgreSQL BYTEA)
    // ═══════════════════════════════════════════

    async function _handleFilesUpload(fileList) {
        const progressContainer = $('filesUploadProgressContainer');
        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressContainer.innerHTML = `
                <div style="background: var(--rr-bg-card); padding: 15px; border-radius: 8px; border: 1px solid var(--rr-border);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span>Uploading ${fileList.length} file(s)...</span>
                        <span id="filesUploadPct">0%</span>
                    </div>
                    <div class="upload-progress-bar" id="filesUploadBar" style="width: 0%;"></div>
                </div>
            `;
        }

        try {
            // Read files
            const files = Array.from(fileList);
            const encodedFiles = await Promise.all(files.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ name: file.name, data: reader.result });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }));

            // Simulate progress
            const bar = $('filesUploadBar');
            const pct = $('filesUploadPct');
            if (bar) bar.style.width = '50%';
            if (pct) pct.textContent = '50%';

            // Send to backend
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: encodedFiles }),
            });

            if (bar) bar.style.width = '100%';
            if (pct) pct.textContent = '100%';

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Upload failed');
            }

            const data = await response.json();
            RRComponents.showToast(data.message || 'Files uploaded successfully', 'success');

            // Refresh list
            _fetchFiles();

        } catch (error) {
            console.error('Upload error:', error);
            RRComponents.showToast(error.message, 'error');
            if (progressContainer) progressContainer.innerHTML = `<div style="color:var(--rr-error); padding:10px;">Upload failed: ${error.message}</div>`;
        } finally {
            // Clear input
            const input = $('filesUploadInput');
            if (input) input.value = '';

            // Hide progress after delay
            setTimeout(() => {
                if (progressContainer) progressContainer.style.display = 'none';
            }, 3000);
        }
    }


    // ═══════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════

    function _handleUnlock() {
        const passwordInput = $('filesPasswordInput');
        const password = passwordInput.value;

        if (password === PASSWORD) {
            _isAuthenticated = true;
            passwordInput.value = ''; // Clear password
            RRComponents.showToast('Access Granted', 'success');
            _checkAuth();
        } else {
            RRComponents.showToast('Access Denied: Invalid Password', 'error');
            passwordInput.classList.add('shake');
            setTimeout(() => passwordInput.classList.remove('shake'), 500);
        }
    }

    function _checkAuth() {
        // If authenticated, show list, hide lock
        const lockState = $('filesLockState');
        const listState = $('filesListState');

        if (_isAuthenticated) {
            if (lockState) lockState.style.display = 'none';
            if (listState) {
                listState.style.display = 'block';
                // Trigger animation for nice entry
                if (window.gsap) {
                    gsap.fromTo(listState, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 });
                }
                _fetchFiles();
                _fetchR2Files();
            }
        } else {
            // Not authenticated
            if (lockState) lockState.style.display = 'flex';
            if (listState) listState.style.display = 'none';
        }
    }

    // ═══════════════════════════════════════════
    // DATA HANDLING — V1 (PostgreSQL)
    // ═══════════════════════════════════════════

    async function _fetchFiles() {
        const tbody = $('filesTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Loading files...</td></tr>';

        try {
            const response = await fetch(ENDPOINT_FILES);
            if (!response.ok) throw new Error('Failed to fetch files');

            const files = await response.json();
            _renderFiles(files);
        } catch (error) {
            console.error('Files fetch error:', error);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--rr-error);">Error loading files: ${error.message}</td></tr>`;
        }
    }

    function _renderFiles(files) {
        const tbody = $('filesTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--rr-text-muted);">No files archived yet.</td></tr>';
            return;
        }

        files.forEach(file => {
            const tr = document.createElement('tr');

            const date = new Date(file.upload_date);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const sizeKB = (file.file_size / 1024).toFixed(1);
            let sizeStr = `${sizeKB} KB`;
            if (file.file_size > 1024 * 1024) {
                sizeStr = `${(file.file_size / (1024 * 1024)).toFixed(1)} MB`;
            }

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="file" style="width:16px; height:16px; color:var(--rr-blue);"></i>
                        <span style="font-weight:500;">${file.filename}</span>
                    </div>
                </td>
                <td>${dateStr}</td>
                <td>${sizeStr}</td>
                <td>
                    <div style="display:flex; gap: 8px;">
                        <a href="/api/files/${file.id}" target="_blank" class="btn-ghost btn-sm" title="Download">
                            <i data-lucide="download"></i>
                        </a>
                        <button class="btn-ghost btn-sm" style="color:var(--rr-error);" title="Delete" onclick="FilesModule.deleteFile(${file.id})">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    async function deleteFile(id) {
        if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) return;

        try {
            const response = await fetch(`${ENDPOINT_FILES}/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Delete failed');

            RRComponents.showToast('File deleted successfully', 'success');
            _fetchFiles();

        } catch (error) {
            console.error('Delete error:', error);
            RRComponents.showToast('Failed to delete file', 'error');
        }
    }


    // ═══════════════════════════════════════════
    // DATA HANDLING — V2 (R2 Cloud)
    // ═══════════════════════════════════════════

    async function _fetchR2Files() {
        const tbody = $('r2FilesTableBody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">Loading R2 files...</td></tr>';

        try {
            const response = await fetch('/api/r2/files');
            if (!response.ok) throw new Error('Failed to fetch R2 files');

            const files = await response.json();
            _renderR2Files(files);
        } catch (error) {
            console.error('R2 files fetch error:', error);
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--rr-error);">Error loading R2 files: ${error.message}</td></tr>`;
        }
    }

    function _renderR2Files(files) {
        const tbody = $('r2FilesTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--rr-text-muted);">No files in R2 cloud storage yet.</td></tr>';
            return;
        }

        files.forEach(file => {
            const tr = document.createElement('tr');

            const date = new Date(file.upload_date);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let sizeStr = _fmtSize(file.file_size || 0);

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="cloud" style="width:16px; height:16px; color:#F6821F;"></i>
                        <span style="font-weight:500;">${file.filename}</span>
                        <span style="font-size:0.65rem; padding:2px 6px; background:rgba(246,130,31,0.15); color:#F6821F; border-radius:4px; font-weight:600;">R2</span>
                    </div>
                </td>
                <td>${dateStr}</td>
                <td>${sizeStr}</td>
                <td>
                    <div style="display:flex; gap: 8px;">
                        <a href="/api/r2/files/${file.id}" target="_blank" class="btn-ghost btn-sm" title="Download from R2">
                            <i data-lucide="download"></i>
                        </a>
                        <button class="btn-ghost btn-sm" style="color:#F6821F;" title="Parse & Load to Dashboard" onclick="FilesModule.parseR2File(${file.id}, '${file.filename.replace(/'/g, "\\'")}')">
                            <i data-lucide="play-circle"></i>
                        </button>
                        <button class="btn-ghost btn-sm" style="color:var(--rr-error);" title="Delete from R2" onclick="FilesModule.deleteR2File(${file.id})">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) lucide.createIcons();
    }

    async function deleteR2File(id) {
        if (!confirm('Delete this file from R2 cloud storage? This cannot be undone.')) return;

        try {
            const response = await fetch(`/api/r2/files/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Delete failed');

            RRComponents.showToast('File deleted from R2', 'success');
            _fetchR2Files();
        } catch (error) {
            console.error('R2 delete error:', error);
            RRComponents.showToast('Failed to delete R2 file', 'error');
        }
    }

    async function parseR2File(id, filename) {
        RRComponents.showLoading();
        RRComponents.showToast(`Downloading & parsing ${filename} from R2...`, 'info');

        try {
            const response = await fetch(`/api/r2/files/${id}/parse`, { method: 'POST' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Parse failed');
            }

            const data = await response.json();

            // Feed parsed data into main app (same as regular upload response)
            if (window.RRApp && RRApp.mergeUploadResponse) {
                RRApp.mergeUploadResponse(data);
            }

            RRComponents.showToast(`${filename} loaded to dashboard`, 'success');
        } catch (error) {
            console.error('R2 parse error:', error);
            RRComponents.showToast(`Parse failed: ${error.message}`, 'error');
        } finally {
            RRComponents.hideLoading();
        }
    }


    // ═══════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);

    return { init, deleteFile, deleteR2File, parseR2File };

})();

    window.FilesModule = FilesModule;
  })();

  // ---------- RRAIChat (from ai-chat.js) ----------
  (function() {
/**
 * Rolls-Royce SOA Dashboard — AI Chat Module
 * Handles chat UI, message rendering, chart generation, and email templates.
 */

var RRAIChat = (() => {
    'use strict';

    // ─── State ───
    let _chatHistory = [];
    let _isLoading = false;
    let _chartInstances = {};
    let _timerInterval = null;

    const $ = (id) => document.getElementById(id);

    // ─── Quick Actions ───
    const QUICK_ACTIONS = [
        { icon: 'file-text', label: 'Summarize Account', prompt: 'Give me a complete summary of this Statement of Account, including key metrics, overdue amounts, and aging breakdown.' },
        { icon: 'mail', label: 'Draft Collection Email', prompt: 'Draft a professional email to the customer regarding their outstanding balance and overdue invoices. Include specific amounts and dates from the data.' },
        { icon: 'bar-chart-3', label: 'Aging Analysis', prompt: 'Show me a detailed aging analysis chart with the breakdown by aging bucket. Also explain any concerning trends.' },
        { icon: 'alert-triangle', label: 'Risk Assessment', prompt: 'Analyze the overdue items and provide a risk assessment. Which items are most critical and need immediate attention?' },
        { icon: 'trending-up', label: 'Top Charges', prompt: 'What are the top 5 largest charges? Show me a chart of the biggest outstanding items.' },
        { icon: 'file-check', label: 'Generate Report', prompt: 'Generate a comprehensive written report of this Statement of Account that I can share with management. Include all key figures and analysis.' },
    ];


    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        _bindChatInput();
        _renderQuickActions();
        _log('init', 'AI Chat module initialized');
    }

    function _bindChatInput() {
        const input = $('aiChatInput');
        const sendBtn = $('aiChatSendBtn');

        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    _sendMessage();
                }
            });

            // Auto-resize textarea
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', _sendMessage);
        }

        // Clear chat button
        const clearBtn = $('aiChatClearBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', _clearChat);
        }

        // Toggle log panel
        const logToggle = $('aiLogToggle');
        if (logToggle) {
            logToggle.addEventListener('click', () => {
                const panel = $('aiLogPanel');
                if (panel) panel.classList.toggle('open');
            });
        }
    }


    // ═══════════════════════════════════════════
    // STATUS LOG
    // ═══════════════════════════════════════════

    function _log(type, message) {
        const logBody = $('aiLogBody');
        if (!logBody) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const iconMap = {
            'init': '🔧',
            'send': '📤',
            'api': '🌐',
            'wait': '⏳',
            'receive': '📥',
            'render': '🎨',
            'error': '❌',
            'success': '✅',
            'info': 'ℹ️',
        };
        const icon = iconMap[type] || '•';

        const entry = document.createElement('div');
        entry.className = `ai-log-entry ai-log-${type}`;
        entry.innerHTML = `<span class="ai-log-time">${time}</span> <span class="ai-log-icon">${icon}</span> <span class="ai-log-msg">${_esc(message)}</span>`;
        logBody.appendChild(entry);
        logBody.scrollTop = logBody.scrollHeight;
    }


    // ═══════════════════════════════════════════
    // QUICK ACTIONS
    // ═══════════════════════════════════════════

    function _renderQuickActions() {
        const container = $('aiQuickActions');
        if (!container) return;

        container.innerHTML = QUICK_ACTIONS.map(action => `
            <button class="ai-quick-action" data-prompt="${_escAttr(action.prompt)}">
                <i data-lucide="${action.icon}"></i>
                <span>${action.label}</span>
            </button>
        `).join('');

        // Bind click handlers
        container.querySelectorAll('.ai-quick-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.dataset.prompt;
                const input = $('aiChatInput');
                if (input) input.value = prompt;
                _sendMessage();
            });
        });

        if (window.lucide) lucide.createIcons();
    }


    // ═══════════════════════════════════════════
    // SENDING MESSAGES
    // ═══════════════════════════════════════════

    async function _sendMessage() {
        const input = $('aiChatInput');
        if (!input) return;

        const message = input.value.trim();
        if (!message || _isLoading) return;

        // Clear input
        input.value = '';
        input.style.height = 'auto';

        // Hide quick actions after first message
        const quickActions = $('aiQuickActions');
        const welcome = $('aiWelcomeState');
        if (quickActions) quickActions.style.display = 'none';
        if (welcome) welcome.style.display = 'none';

        // Add user message to UI
        _addMessage('user', message);
        _chatHistory.push({ role: 'user', content: message });

        // Show typing indicator + start timer
        _setLoading(true);
        _log('send', `Sending: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);

        const startTime = Date.now();
        _startTimer(startTime);

        // Get selected model
        const modelSelect = $('aiModelSelector');
        const model = modelSelect ? modelSelect.value : null;

        try {
            _log('api', 'POST /api/chat — connecting to OpenRouter AI...');

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, model }),
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const errMsg = err.error || `Server Error (${response.status})`;
                _log('error', `API error: ${errMsg}`);
                throw new Error(errMsg);
            }

            _log('receive', `Response received in ${elapsed}s — parsing...`);

            let data;
            try {
                data = await response.json();
            } catch (e) {
                console.error("JSON Parse Error:", e);
                throw new Error("Connection Error: The server took too long to respond or returned an invalid response. Please try again.");
            }

            _log('render', `Rendering: ${data.content?.length || 0} chars, ${data.charts?.length || 0} chart(s), ${data.emails?.length || 0} email(s)`);

            // Add AI response to UI
            _addAIResponse(data);
            _chatHistory.push({ role: 'assistant', content: data.content });
            _log('success', 'Response rendered successfully');

        } catch (err) {
            _log('error', err.message || 'Failed to get response from AI');
            _addMessage('error', err.message || 'Failed to get response from AI');
        } finally {
            _setLoading(false);
            _stopTimer();
        }
    }


    // ═══════════════════════════════════════════
    // TIMER
    // ═══════════════════════════════════════════

    function _startTimer(startTime) {
        const timerEl = $('aiTimerDisplay');
        if (!timerEl) return;

        _timerInterval = setInterval(() => {
            const sec = ((Date.now() - startTime) / 1000).toFixed(0);
            timerEl.textContent = `${sec}s`;
        }, 500);
    }

    function _stopTimer() {
        if (_timerInterval) {
            clearInterval(_timerInterval);
            _timerInterval = null;
        }
        const timerEl = $('aiTimerDisplay');
        if (timerEl) timerEl.textContent = '';
    }


    // ═══════════════════════════════════════════
    // MESSAGE RENDERING
    // ═══════════════════════════════════════════

    function _addMessage(role, content) {
        const container = $('aiChatMessages');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = `ai-chat-message ai-chat-${role}`;

        const avatar = role === 'user'
            ? '<div class="ai-msg-avatar ai-msg-avatar-user"><i data-lucide="user"></i></div>'
            : role === 'error'
                ? '<div class="ai-msg-avatar ai-msg-avatar-error"><i data-lucide="alert-circle"></i></div>'
                : '<div class="ai-msg-avatar ai-msg-avatar-ai"><i data-lucide="bot"></i></div>';

        const bodyHTML = role === 'user' ? _esc(content) : _renderMarkdown(content);

        msgEl.innerHTML = `
            ${avatar}
            <div class="ai-msg-content">
                <div class="ai-msg-body">${bodyHTML}</div>
                <div class="ai-msg-time">${_formatTime()}</div>
            </div>
        `;

        container.appendChild(msgEl);
        _scrollToBottom();
        if (window.lucide) lucide.createIcons();
    }

    function _addAIResponse(data) {
        const container = $('aiChatMessages');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'ai-chat-message ai-chat-assistant';

        let bodyContent = '';
        const deferredCharts = [];     // { id, spec }
        const usedChartIdx = new Set();
        const usedEmailIdx = new Set();

        if (data.content) {
            let text = data.content;
            let cIdx = 0;
            let eIdx = 0;

            // Step 1: Replace [CHART_PLACEHOLDER] with safe tokens
            text = text.replace(/\[CHART_PLACEHOLDER\]/g, () => {
                const chart = (data.charts || [])[cIdx];
                if (chart) {
                    const id = `ai-chart-${Date.now()}-${cIdx}`;
                    deferredCharts.push({ id, spec: chart });
                    usedChartIdx.add(cIdx);
                    const token = `%%AICHART_${deferredCharts.length - 1}%%`;
                    cIdx++;
                    return token;
                }
                cIdx++;
                return '';
            });

            // Step 2: Replace [EMAIL_PLACEHOLDER] with safe tokens
            const emailTokens = [];
            text = text.replace(/\[EMAIL_PLACEHOLDER\]/g, () => {
                const email = (data.emails || [])[eIdx];
                if (email) {
                    usedEmailIdx.add(eIdx);
                    emailTokens.push(email);
                    const token = `%%AIEMAIL_${emailTokens.length - 1}%%`;
                    eIdx++;
                    return token;
                }
                eIdx++;
                return '';
            });

            // Step 3: Render markdown (tokens survive _esc because they have no HTML chars)
            bodyContent = _renderMarkdown(text);

            // Step 4: Replace tokens with actual HTML
            deferredCharts.forEach((dc, i) => {
                bodyContent = bodyContent.replace(
                    `%%AICHART_${i}%%`,
                    `<div class="ai-chart-container" id="${dc.id}"></div>`
                );
            });

            emailTokens.forEach((emailText, i) => {
                bodyContent = bodyContent.replace(
                    `%%AIEMAIL_${i}%%`,
                    _renderEmailBlock(emailText)
                );
            });
        }

        // Step 5: Render any charts NOT consumed by placeholders
        if (data.charts) {
            data.charts.forEach((chart, i) => {
                if (!usedChartIdx.has(i)) {
                    const id = `ai-chart-extra-${Date.now()}-${i}`;
                    deferredCharts.push({ id, spec: chart });
                    bodyContent += `<div class="ai-chart-container" id="${id}"></div>`;
                }
            });
        }

        // Step 6: Render any emails NOT consumed by placeholders
        if (data.emails) {
            data.emails.forEach((email, i) => {
                if (!usedEmailIdx.has(i)) {
                    bodyContent += _renderEmailBlock(email);
                }
            });
        }

        msgEl.innerHTML = `
            <div class="ai-msg-avatar ai-msg-avatar-ai"><i data-lucide="bot"></i></div>
            <div class="ai-msg-content">
                <div class="ai-msg-body">${bodyContent}</div>
                <div class="ai-msg-time">${_formatTime()}</div>
            </div>
        `;

        container.appendChild(msgEl);
        _scrollToBottom();

        // Deferred chart rendering
        deferredCharts.forEach(dc => {
            setTimeout(() => _renderChartSpec(dc.id, dc.spec), 150);
        });

        if (window.lucide) lucide.createIcons();
    }


    // ═══════════════════════════════════════════
    // MARKDOWN RENDERER (with table support)
    // ═══════════════════════════════════════════

    function _renderMarkdown(text) {
        if (!text) return '';

        // 1. Extract fenced code blocks and protect them
        const codeBlocks = [];
        let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
            codeBlocks.push({ lang, code: code.trim() });
            return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
        });

        // 2. Extract and render markdown tables
        processed = _renderMarkdownTables(processed);

        // 3. Escape HTML in the remaining text
        processed = _esc(processed);

        // 4. Restore tables (they were turned into HTML before escaping—
        //    but we escaped AFTER tables were rendered. To fix this,
        //    we must extract tables fully BEFORE escaping.)
        //    Re-approach: do table extraction AFTER escaping but on pipe lines.

        // Actually, let's re-do the approach:
        //    a) We already rendered tables into HTML tokens above
        //    b) Those HTML tokens got escaped by _esc.
        //    c) We need a different approach.

        // NEW APPROACH: Do NOT use _renderMarkdownTables before _esc.
        // Instead, split text into lines and process manually.

        // Reset and start over with clean approach
        processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
            return `%%CODEBLOCK_${codeBlocks.indexOf(codeBlocks.find(b => b.code === code.trim()))}%%`;
        });

        // Split into lines for processing
        const lines = processed.split('\n');
        const outputLines = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();

            // Detect start of a markdown table
            if (_isTableRow(line) && i + 1 < lines.length && _isTableSeparator(lines[i + 1].trim())) {
                // Parse the full table
                const tableHTML = _parseTable(lines, i);
                outputLines.push(tableHTML.html);
                i = tableHTML.endIndex;
                continue;
            }

            // Regular line — escape and apply markdown
            outputLines.push(lines[i]);
            i++;
        }

        processed = outputLines.join('\n');

        // NOW escape HTML (but skip table HTML which is already safe)
        // We need to mark table HTML so it survives escaping
        const tableBlocks = [];
        processed = processed.replace(/<table class="ai-md-table">[\s\S]*?<\/table>/g, (match) => {
            tableBlocks.push(match);
            return `%%TABLE_${tableBlocks.length - 1}%%`;
        });

        // Escape remaining text
        processed = _esc(processed);

        // Apply inline markdown formatting
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        processed = processed.replace(/^#### (.*$)/gm, '<h5 class="ai-md-h5">$1</h5>');
        processed = processed.replace(/^### (.*$)/gm, '<h4 class="ai-md-h4">$1</h4>');
        processed = processed.replace(/^## (.*$)/gm, '<h3 class="ai-md-h3">$1</h3>');
        processed = processed.replace(/^# (.*$)/gm, '<h2 class="ai-md-h2">$1</h2>');

        // Bullet lists
        processed = processed.replace(/^[-•]\s+(.*$)/gm, '<li>$1</li>');
        processed = processed.replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/g, '<ul class="ai-md-list">$1</ul>');

        // Numbered lists
        processed = processed.replace(/^\d+\.\s+(.*$)/gm, '<li class="ai-md-ol">$1</li>');
        processed = processed.replace(/((?:<li class="ai-md-ol">[\s\S]*?<\/li>\s*)+)/g, '<ol class="ai-md-list">$1</ol>');

        // Horizontal rule
        processed = processed.replace(/^---$/gm, '<hr class="ai-md-hr">');

        // Paragraphs and line breaks
        processed = processed.replace(/\n\n+/g, '</p><p>');
        processed = processed.replace(/\n/g, '<br>');
        processed = `<p>${processed}</p>`;
        processed = processed.replace(/<p>\s*<\/p>/g, '');

        // Fix: don't wrap block elements in <p>
        processed = processed.replace(/<p>\s*(<h[2-5]|<ul|<ol|<table|<hr|<div)/g, '$1');
        processed = processed.replace(/(<\/h[2-5]>|<\/ul>|<\/ol>|<\/table>|<hr[^>]*>|<\/div>)\s*<\/p>/g, '$1');

        // Restore table blocks
        tableBlocks.forEach((html, idx) => {
            processed = processed.replace(`%%TABLE_${idx}%%`, html);
        });

        // Restore code blocks
        codeBlocks.forEach((block, idx) => {
            processed = processed.replace(
                `%%CODEBLOCK_${idx}%%`,
                `<pre class="ai-code-block"><code>${_esc(block.code)}</code></pre>`
            );
        });

        // Restore chart/email tokens (they'll be replaced later by _addAIResponse)
        // These survive because %% tokens have no HTML-special characters

        return processed;
    }

    function _isTableRow(line) {
        return line.startsWith('|') && line.endsWith('|') && line.split('|').length >= 3;
    }

    function _isTableSeparator(line) {
        return /^\|[\s\-:|]+(\|[\s\-:|]+)+\|$/.test(line);
    }

    function _parseTable(lines, startIdx) {
        let i = startIdx;
        const headerLine = lines[i].trim();
        i++; // skip header

        // Skip separator
        if (i < lines.length && _isTableSeparator(lines[i].trim())) {
            i++;
        }

        // Parse header cells
        const headerCells = headerLine.split('|').slice(1, -1).map(c => c.trim());

        let html = '<table class="ai-md-table"><thead><tr>';
        headerCells.forEach(cell => {
            html += `<th>${_esc(cell)}</th>`;
        });
        html += '</tr></thead><tbody>';

        // Parse data rows
        while (i < lines.length) {
            const row = lines[i].trim();
            if (!_isTableRow(row)) break;

            const cells = row.split('|').slice(1, -1).map(c => c.trim());
            html += '<tr>';
            cells.forEach(cell => {
                // Apply simple inline formatting inside cells
                let cellHtml = _esc(cell);
                cellHtml = cellHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                html += `<td>${cellHtml}</td>`;
            });
            html += '</tr>';
            i++;
        }

        html += '</tbody></table>';

        return { html, endIndex: i };
    }


    // ═══════════════════════════════════════════
    // TABLE RENDERER (unused, kept for reference)
    // ═══════════════════════════════════════════

    function _renderMarkdownTables(text) {
        // This function is now handled inline in _renderMarkdown
        return text;
    }


    // ═══════════════════════════════════════════
    // CHART RENDERING
    // ═══════════════════════════════════════════

    function _renderChartSpec(containerId, spec) {
        const container = document.getElementById(containerId);
        if (!container) return;

        try {
            const chartType = (spec.type || 'bar').toLowerCase();
            let options = {
                chart: {
                    height: 300,
                    fontFamily: "'DM Sans', sans-serif",
                    toolbar: { show: false },
                    background: 'transparent',
                },
                title: {
                    text: spec.title || '',
                    style: { fontSize: '14px', fontWeight: 600, color: '#1a1a2e' },
                },
                colors: ['#10069F', '#1565C0', '#2E7D32', '#D32F2F', '#F9A825', '#5E35B1', '#00838F', '#EF6C00'],
                grid: { borderColor: '#e8e8ee', strokeDashArray: 3 },
                tooltip: { theme: 'light' },
            };

            if (chartType === 'donut' || chartType === 'pie') {
                options.chart.type = 'donut';
                options.labels = spec.labels || [];
                options.series = (spec.series && spec.series[0] && spec.series[0].data) || spec.data || [];
                options.plotOptions = {
                    pie: { donut: { size: '65%', labels: { show: true, total: { show: true } } } }
                };
            } else if (chartType === 'line') {
                options.chart.type = 'line';
                options.xaxis = { categories: spec.labels || [] };
                options.series = spec.series || [];
                options.stroke = { curve: 'smooth', width: 3 };
            } else {
                options.chart.type = 'bar';
                options.xaxis = { categories: spec.labels || [] };
                options.series = spec.series || [];
                options.plotOptions = {
                    bar: { borderRadius: 4, columnWidth: '60%' }
                };
            }

            // Destroy existing chart if any
            if (_chartInstances[containerId]) {
                _chartInstances[containerId].destroy();
            }

            const chart = new ApexCharts(container, options);
            chart.render();
            _chartInstances[containerId] = chart;
            _log('render', `Chart "${spec.title || chartType}" rendered`);

        } catch (e) {
            container.innerHTML = `<div class="ai-chart-error">Could not render chart: ${e.message}</div>`;
            _log('error', `Chart render failed: ${e.message}`);
        }
    }


    // ═══════════════════════════════════════════
    // EMAIL RENDERING
    // ═══════════════════════════════════════════

    function _renderEmailBlock(emailText) {
        const emailId = `email-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        // Render the email content with markdown formatting
        const renderedEmail = _renderEmailContent(emailText);
        return `
            <div class="ai-email-block" id="${emailId}">
                <div class="ai-email-header">
                    <i data-lucide="mail"></i>
                    <span>Email Template</span>
                    <button class="ai-email-copy-btn" onclick="RRAIChat.copyEmail('${emailId}')">
                        <i data-lucide="copy"></i> Copy
                    </button>
                </div>
                <div class="ai-email-body">${renderedEmail}</div>
            </div>
        `;
    }

    function _renderEmailContent(text) {
        // Light markdown rendering for emails — preserve formatting but render bold etc.
        let html = _esc(text);
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/^### (.*$)/gm, '<strong style="font-size:1em">$1</strong>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function copyEmail(blockId) {
        const block = document.getElementById(blockId);
        if (!block) return;

        const emailText = block.querySelector('.ai-email-body')?.textContent || '';
        navigator.clipboard.writeText(emailText).then(() => {
            const btn = block.querySelector('.ai-email-copy-btn');
            if (btn) {
                btn.innerHTML = '<i data-lucide="check"></i> Copied!';
                btn.classList.add('copied');
                if (window.lucide) lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = '<i data-lucide="copy"></i> Copy';
                    btn.classList.remove('copied');
                    if (window.lucide) lucide.createIcons();
                }, 2000);
            }
        });
    }


    // ═══════════════════════════════════════════
    // CLEAR CHAT
    // ═══════════════════════════════════════════

    async function _clearChat() {
        _chatHistory = [];
        _log('info', 'Chat cleared');

        // Clear server-side history
        try {
            await fetch('/api/chat/clear', { method: 'POST' });
        } catch (e) { /* ignore */ }

        // Reset UI
        const messages = $('aiChatMessages');
        if (messages) messages.innerHTML = '';

        const quickActions = $('aiQuickActions');
        const welcome = $('aiWelcomeState');
        if (quickActions) quickActions.style.display = '';
        if (welcome) welcome.style.display = '';

        _renderQuickActions();

        // Destroy all charts
        Object.values(_chartInstances).forEach(c => { try { c.destroy(); } catch (e) { } });
        _chartInstances = {};
    }


    // ═══════════════════════════════════════════
    // LOADING / TYPING INDICATOR
    // ═══════════════════════════════════════════

    function _setLoading(loading) {
        _isLoading = loading;
        const indicator = $('aiTypingIndicator');
        const sendBtn = $('aiChatSendBtn');

        if (indicator) indicator.style.display = loading ? 'flex' : 'none';
        if (sendBtn) sendBtn.disabled = loading;

        if (loading) _scrollToBottom();
    }


    // ═══════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════

    function _esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _escAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _formatTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function _scrollToBottom() {
        const container = $('aiChatMessages');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 50);
        }
    }

    // Called when AI view is activated to reset quick actions visibility
    function onViewActivated() {
        if (_chatHistory.length === 0) {
            const quickActions = $('aiQuickActions');
            const welcome = $('aiWelcomeState');
            if (quickActions) quickActions.style.display = '';
            if (welcome) welcome.style.display = '';
            _renderQuickActions();
        }
        if (window.lucide) lucide.createIcons();
    }


    // ─── Public API ───
    return {
        init,
        copyEmail,
        onViewActivated,
    };
})();

    window.RRAIChat = RRAIChat;
  })();

  // ---------- RRApp bootstrap (from app.js) ----------
  (function() {
/**
 * Rolls-Royce Data Visualizer — Main Application Controller
 * Handles file upload, API calls, view management, and GSAP animations.
 */

const RRApp = (() => {
    'use strict';

    // ─── State ───
    let _filesData = {};       // { filename: parsedData }
    let _allItems = [];        // Merged items from all files
    let _currentView = 'standard';
    let _presSlide = 0;
    let _presSlides = [];

    // ─── DOM Elements ───
    const $ = (id) => document.getElementById(id);

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        _bindUpload();
        _bindViewPills();
        _bindSidebarAccordions();
        _bindExportButtons();
        _bindPresentationNav();
        _bindWelcomeUpload();
        _bindFilterListeners();

        // Initialize AI Chat module
        if (window.RRAIChat) RRAIChat.init();

        // Initialize Secret Chat module
        if (window.SecretChat) SecretChat.init();

        // Initialize Lucide icons
        if (window.lucide) lucide.createIcons();

        // Run initial GSAP animations
        _animatePageLoad();
    }

    // ═══════════════════════════════════════════
    // FILE UPLOAD
    // ═══════════════════════════════════════════

    function _bindUpload() {
        const zone = $('uploadZone');
        const input = $('fileInput');
        if (!zone || !input) return;

        // Click to upload
        zone.addEventListener('click', (e) => {
            if (e.target === input) return;
            input.click();
        });

        // File input change
        input.addEventListener('change', () => {
            if (input.files.length > 0) _uploadFiles(input.files);
        });

        // Drag and drop
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) _uploadFiles(e.dataTransfer.files);
        });
    }

    async function _uploadFiles(fileList) {
        const validFiles = [];

        // Filter valid files — accept all Excel formats + pptx
        const validExts = ['.xlsx', '.xls', '.xlsb', '.xlsm', '.pptx'];
        for (const file of fileList) {
            const lower = file.name.toLowerCase();
            if (validExts.some(ext => lower.endsWith(ext))) {
                validFiles.push(file);
            }
        }

        if (validFiles.length === 0) {
            RRComponents.showToast('Please upload Excel (.xlsx/.xls/.xlsb) or .pptx files', 'error');
            return;
        }

        // Show progress
        const progress = $('uploadProgress');
        const progressBar = $('uploadProgressBar');
        if (progress) progress.classList.add('active');
        if (progressBar) { progressBar.style.width = '30%'; }

        RRComponents.showLoading();

        try {
            // Convert files to Base64 strings (NetSkope Bypass)
            const filePromises = validFiles.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ name: file.name, data: reader.result });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            const encodedFiles = await Promise.all(filePromises);

            if (progressBar) progressBar.style.width = '60%';

            // Send as JSON payload instead of FormData
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: encodedFiles }),
            });

            if (progressBar) progressBar.style.width = '90%';

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Upload failed');
            }

            const data = await response.json();

            if (data.errors && data.errors.length > 0) {
                data.errors.forEach(e => {
                    RRComponents.showToast(`Error parsing ${e.file}: ${e.error}`, 'error');
                });
            }

            // Merge with existing data
            Object.assign(_filesData, data.files || {});

            if (progressBar) progressBar.style.width = '100%';

            // Update file chips in sidebar
            _renderFileChips();

            // Merge all items — handle both old and new parser formats
            _allItems = [];
            Object.entries(_filesData).forEach(([fname, fdata]) => {
                console.log(`[RR Visualizer] File: ${fname}, file_type: ${fdata.file_type}, keys: ${Object.keys(fdata).join(',')}`);

                // New parser format: items in sections[].items (SOA) or items[] (INVOICE_LIST)
                if (fdata.file_type) {
                    if (fdata.sections && Array.isArray(fdata.sections)) {
                        fdata.sections.forEach(sec => {
                            (sec.items || []).forEach(item => {
                                _allItems.push({ ...item, _source: fname, _section: sec.name });
                            });
                        });
                    }
                    if (fdata.items && Array.isArray(fdata.items)) {
                        fdata.items.forEach(item => {
                            _allItems.push({ ...item, _source: fname });
                        });
                    }
                }
                // Old parser format: flat all_items array
                else if (fdata.all_items) {
                    (fdata.all_items || []).forEach(item => {
                        _allItems.push({ ...item, _source: fname });
                    });
                }
            });

            console.log(`[RR Visualizer] Total items merged: ${_allItems.length}, hasNewFormat: ${_detectNewParserFormat()}`);

            // Show dashboard
            _showDashboard();

            RRComponents.showToast(`${validFiles.length} file(s) loaded successfully`, 'success');

        } catch (err) {
            RRComponents.showToast(err.message || 'Upload failed', 'error');
        } finally {
            RRComponents.hideLoading();
            setTimeout(() => {
                if (progress) progress.classList.remove('active');
                if (progressBar) progressBar.style.width = '0%';
            }, 500);
        }
    }

    function _renderFileChips() {
        const container = $('uploadedFiles');
        if (!container) return;

        const esc = (window.RRUtil && RRUtil.escapeHtml) ? RRUtil.escapeHtml : (s) => String(s == null ? '' : s);
        const escAttr = (window.RRUtil && RRUtil.escapeAttr) ? RRUtil.escapeAttr : (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

        let html = '';
        Object.entries(_filesData).forEach(([fname, fdata]) => {
            const ft = fdata.file_type || 'UNKNOWN';
            const meta = window.RRVisualizer ? RRVisualizer.getFileTypeMeta(ft) : { label: ft, color: '#10069F' };
            html += `
                <div class="file-chip">
                    <span class="file-chip-type-dot" style="background:${meta.color}"></span>
                    <span class="file-chip-name" title="${esc(fname)} (${esc(meta.label)})">${esc(fname)}</span>
                    <span class="file-chip-remove" title="Remove file" data-fname="${escAttr(fname)}" role="button" tabindex="0" aria-label="Remove ${escAttr(fname)}">&times;</span>
                </div>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.file-chip-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                _removeFile(el.getAttribute('data-fname'));
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    _removeFile(el.getAttribute('data-fname'));
                }
            });
        });
    }

    async function _removeFile(fname) {
        if (!fname || !(fname in _filesData)) return;

        try {
            await fetch(`/api/parsed/${encodeURIComponent(fname)}`, { method: 'DELETE' });
        } catch (err) {
            console.warn('[RRApp] Server-side parsed-file delete failed; removing client-side only:', err);
        }

        delete _filesData[fname];

        _allItems = [];
        Object.entries(_filesData).forEach(([fn, fdata]) => {
            if (fdata.file_type) {
                if (fdata.sections && Array.isArray(fdata.sections)) {
                    fdata.sections.forEach(sec => {
                        (sec.items || []).forEach(item => {
                            _allItems.push({ ...item, _source: fn, _section: sec.name });
                        });
                    });
                }
                if (fdata.items && Array.isArray(fdata.items)) {
                    fdata.items.forEach(item => {
                        _allItems.push({ ...item, _source: fn });
                    });
                }
            } else if (fdata.all_items) {
                (fdata.all_items || []).forEach(item => {
                    _allItems.push({ ...item, _source: fn });
                });
            }
        });

        _renderFileChips();
        _showDashboard();

        if (window.RRComponents && RRComponents.showToast) {
            RRComponents.showToast(`Removed ${fname}`, 'info');
        }
    }


    // ═══════════════════════════════════════════
    // DASHBOARD RENDERING
    // ═══════════════════════════════════════════

    function _showDashboard() {
        const welcome = $('welcomeState');
        const content = $('dashboardContent');
        const vizContainer = $('visualizerContainer');
        const presContainer = $('presentationContainer');
        const compContainer = $('comparisonContainer');
        const filesContainer = $('filesContainer');
        const aiContainer = $('aiChatContainer');

        if (welcome) {
            if (_currentView === 'files' || Object.keys(_filesData).length > 0) {
                welcome.style.display = 'none';
            } else {
                welcome.style.display = 'flex';
            }
        }

        // Hide all view containers first
        if (content) content.style.display = 'none';
        if (vizContainer) vizContainer.style.display = 'none';
        if (presContainer) presContainer.style.display = 'none';
        if (compContainer) compContainer.style.display = 'none';
        if (filesContainer) filesContainer.style.display = 'none';
        if (aiContainer) aiContainer.style.display = 'none';

        // Detect if data uses the new universal parser format
        const hasNewFormat = _detectNewParserFormat();
        console.log('[RR Debug] _showDashboard:', {
            currentView: _currentView,
            hasNewFormat,
            vizContainerExists: !!vizContainer,
            rrVisualizerExists: !!window.RRVisualizer,
            fileCount: Object.keys(_filesData).length,
            fileTypes: Object.entries(_filesData).map(([f, d]) => `${f}: ${d.file_type || 'NO_TYPE'}`),
        });

        // Render based on current view
        switch (_currentView) {
            case 'standard':
                if (hasNewFormat && vizContainer && window.RRVisualizer) {
                    console.log('[RR Debug] → Rendering NEW universal visualizer');
                    if (content) content.style.display = 'none';
                    vizContainer.style.display = 'block';
                    try { vizContainer.classList.remove('viz-executive-mode'); } catch (e) { /* noop */ }
                    const result = RRVisualizer.renderVisualizer(_filesData, vizContainer);
                    console.log('[RR Debug] → Visualizer result:', result);
                    if (result === false) {
                        // Visualizer said "legacy format, let old view handle it"
                        vizContainer.style.display = 'none';
                        if (content) content.style.display = 'block';
                        _renderStandardView();
                    }
                } else {
                    console.log('[RR Debug] → Falling back to OLD view (hasNewFormat:', hasNewFormat, 'vizContainer:', !!vizContainer, 'RRVisualizer:', !!window.RRVisualizer, ')');
                    if (content) content.style.display = 'block';
                    _renderStandardView();
                }
                break;
            case 'executive':
                if (hasNewFormat && vizContainer && window.RRVisualizer) {
                    vizContainer.style.display = 'block';
                    RRVisualizer.renderVisualizer(_filesData, vizContainer, { viewMode: 'executive' });
                    // Executive view: hide filters + full tables, keep KPI + top chart only
                    try {
                        vizContainer.classList.add('viz-executive-mode');
                    } catch (e) { /* noop */ }
                } else {
                    if (content) content.style.display = 'block';
                    _renderExecutiveView();
                }
                break;
            case 'presentation':
                if (presContainer) presContainer.style.display = 'block';
                _renderPresentationView();
                break;
            case 'comparison':
                if (compContainer) compContainer.style.display = 'block';
                _renderComparisonView();
                break;
            case 'files':
                if (filesContainer) filesContainer.style.display = 'block';
                break;
            case 'ai':
                if (aiContainer) aiContainer.style.display = 'flex';
                if (window.RRAIChat) RRAIChat.onViewActivated();
                break;
        }

        // Initialize sidebar filters only for legacy SOA data
        if (!hasNewFormat && _allItems.length > 0) {
            RRComponents.renderSidebarFilters(_allItems);
        }

        // Refresh Lucide icons for new DOM
        if (window.lucide) lucide.createIcons();

        // Show/hide export section based on whether data is loaded
        const exportSec = $('exportSection');
        if (exportSec) {
            exportSec.style.display = Object.keys(_filesData).length > 0 ? '' : 'none';
        }

        // Animate new content — only for legacy views;
        // the new RRVisualizer has its own animation system (_animateVizEntrance)
        if (!hasNewFormat || !window.RRVisualizer) {
            _animateDashboardContent();
        }
    }

    function _detectNewParserFormat() {
        // Check if any file uses the new universal parser format
        // New parser returns file_type as a top-level key
        return Object.values(_filesData).some(fdata => {
            return fdata.file_type && ['SOA', 'INVOICE_LIST', 'OPPORTUNITY_TRACKER', 'GLOBAL_HOPPER',
                'SHOP_VISIT', 'SHOP_VISIT_HISTORY', 'SVRG_MASTER', 'COMMERCIAL_PLAN',
                'EMPLOYEE_WHEREABOUTS', 'UNKNOWN', 'ERROR'].includes(fdata.file_type);
        });
    }

    function _renderStandardView() {
        const filters = RRComponents.getActiveFilters();
        const filtered = RRComponents.applyFiltersToItems(_allItems, filters);
        const mergedSections = _getMergedSections();

        // Get metadata list
        const metaList = Object.values(_filesData).map(d => d.metadata).filter(Boolean);
        const avgLate = _getAvgDaysLate(metaList);

        // Compute grand totals from filtered items
        const grand = _computeGrandTotals(filtered);

        // Render all sections
        RRComponents.renderCustomerInfo($('customerInfoSection'), metaList);
        RRComponents.renderKPICards($('kpiSection'), grand, avgLate);
        RRComponents.renderDebtDecomposition($('debtSection'), filtered);

        // Show all sections
        _showSections(['customerInfoSection', 'kpiSection', 'debtSection', 'executiveSection',
            'bilateralSection', 'sectionBreakdown', 'invoiceRegister', 'exportFooterSection']);

        // Charts
        _renderExecutiveCharts(filtered);
        _renderBilateralCharts(filtered);

        // Section tabs
        RRComponents.renderSectionTabs($('tabBar'), $('tabContent'), mergedSections, filtered);

        // Invoice register
        RRComponents.renderInvoiceRegister(
            $('registerFilters'), $('registerThead'), $('registerTbody'), $('registerFooter'),
            filtered, mergedSections
        );
    }

    function _renderExecutiveView() {
        const filters = RRComponents.getActiveFilters();
        const filtered = RRComponents.applyFiltersToItems(_allItems, filters);

        const metaList = Object.values(_filesData).map(d => d.metadata).filter(Boolean);
        const avgLate = _getAvgDaysLate(metaList);
        const grand = _computeGrandTotals(filtered);

        RRComponents.renderCustomerInfo($('customerInfoSection'), metaList);
        RRComponents.renderKPICards($('kpiSection'), grand, avgLate);
        RRComponents.renderDebtDecomposition($('debtSection'), filtered);

        _showSections(['customerInfoSection', 'kpiSection', 'debtSection', 'executiveSection']);
        _hideSections(['bilateralSection', 'sectionBreakdown', 'invoiceRegister', 'exportFooterSection']);

        _renderExecutiveCharts(filtered);
    }

    function _renderPresentationView() {
        // Detect if we have new-format data (Opportunity Tracker, SOA new, etc.)
        const hasNewFormat = _detectNewParserFormat();

        if (hasNewFormat) {
            _renderNewFormatPresentationView();
        } else {
            _renderLegacyPresentationView();
        }
    }

    // ─── Legacy SOA Presentation ───
    function _renderLegacyPresentationView() {
        const filters = RRComponents.getActiveFilters();
        const filtered = RRComponents.applyFiltersToItems(_allItems, filters);
        const metaList = Object.values(_filesData).map(d => d.metadata).filter(Boolean);
        const avgLate = _getAvgDaysLate(metaList);
        const grand = _computeGrandTotals(filtered);
        const sections = _getMergedSections();

        _presSlides = [
            { name: 'Customer Overview', render: () => _presRenderCustomerOverview(metaList, filtered) },
            { name: 'Key Metrics', render: () => _presRenderKPIs(grand, avgLate) },
            { name: 'Executive Charts', render: () => _presRenderCharts(filtered) },
            { name: 'Bilateral Position', render: () => _presRenderBilateral(filtered) },
        ];

        Object.keys(sections).forEach(secName => {
            _presSlides.push({
                name: `Section: ${secName}`,
                render: () => _presRenderSection(secName, sections[secName])
            });
        });

        _presSlide = 0;
        _presRenderCurrentSlide();
    }

    // ─── New Format Presentation (Opportunity Tracker, etc.) ───
    function _renderNewFormatPresentationView() {
        _presSlides = [];

        // Iterate over files and build slides per file type
        Object.entries(_filesData).forEach(([fname, data]) => {
            const ft = data.file_type;
            if (ft === 'OPPORTUNITY_TRACKER') {
                _buildOppTrackerSlides(data, fname);
            } else if (ft === 'GLOBAL_HOPPER') {
                _buildGlobalHopperSlides(data, fname);
            } else if (ft === 'SOA') {
                _buildNewSOASlides(data, fname);
            } else if (ft === 'INVOICE_LIST') {
                _buildInvoiceListSlides(data, fname);
            } else {
                // Generic summary slide for other types
                _presSlides.push({
                    name: `${fname}`,
                    render: () => _presRenderGenericSummary(data, fname)
                });
            }
        });

        if (_presSlides.length === 0) {
            _presSlides.push({
                name: 'No Data', render: () => {
                    const s = $('presSlide');
                    s.innerHTML = '<div style="text-align:center;padding:60px;color:#C8C6DD;font-size:1.2rem;">No presentation data available. Upload a file first.</div>';
                }
            });
        }

        _presSlide = 0;
        _presRenderCurrentSlide();
    }

    // ─── Opportunity Tracker Slide Builders ───
    function _buildOppTrackerSlides(data, fname) {
        const meta = data.metadata || {};
        const summary = data.summary || {};
        const opportunities = data.opportunities || {};
        const cover = data.cover || {};
        const timeline = data.timeline || {};
        const oppsAndThreats = data.opps_and_threats || {};
        const projectSummary = data.project_summary || {};

        // Flatten all records
        let allRecords = [];
        Object.entries(opportunities).forEach(([sheet, recs]) => {
            if (Array.isArray(recs)) recs.forEach(r => allRecords.push({ ...r, _sheet: sheet }));
        });

        const _val = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
        const _sumField = (arr, field) => arr.reduce((s, r) => s + _val(r[field]), 0);
        const $m = (v) => { if (v == null || isNaN(v)) return '—'; return `$${Math.abs(v).toFixed(1)}m`; };

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

        // Aggregations for charts
        const probLevels = ['High', 'Med', 'Low'];
        const oppTypes = [...new Set(allRecords.map(r => r.opportunity_type).filter(Boolean))];
        const statusList = ['Hopper', 'ICT', 'Negotiations', 'Contracting', 'Completed', 'Cancelled'];

        const valueByTypeProbObj = {};
        oppTypes.forEach(t => { valueByTypeProbObj[t] = { High: 0, Med: 0, Low: 0 }; });
        allRecords.forEach(r => {
            const t = r.opportunity_type, p = r.ext_probability;
            if (t && p && valueByTypeProbObj[t]) valueByTypeProbObj[t][p] += _val(r.sum_26_27);
        });

        const valueByStatusProbObj = {};
        statusList.forEach(s => { valueByStatusProbObj[s] = { High: 0, Med: 0, Low: 0 }; });
        allRecords.forEach(r => {
            const s = r.status, p = r.ext_probability;
            if (s && p && valueByStatusProbObj[s]) valueByStatusProbObj[s][p] += _val(r.sum_26_27);
        });

        const custValues = {};
        allRecords.forEach(r => { const c = r.customer; if (c) custValues[c] = (custValues[c] || 0) + _val(r.sum_26_27); });
        const custTop10 = Object.entries(custValues).sort((a, b) => b[1] - a[1]).slice(0, 15);

        const byPriority = {};
        allRecords.forEach(r => {
            const p = String(r.priority || '?').replace('.0', '');
            if (!byPriority[p]) byPriority[p] = { count: 0, term: 0, sum_26_27: 0 };
            byPriority[p].count += 1;
            byPriority[p].term += _val(r.term_benefit);
            byPriority[p].sum_26_27 += _val(r.sum_26_27);
        });

        // Chart colors consistent with main dashboard
        const TXT = '#C8C6DD';
        const GRID_COLOR = 'rgba(100,100,200,0.12)';
        const baseTip = { theme: 'dark', style: { fontSize: '12px' }, marker: { show: true } };
        const baseGrid = { borderColor: GRID_COLOR, strokeDashArray: 3 };

        // ─── SLIDE 1: Overview & Financial KPIs ───
        _presSlides.push({
            name: 'Commercial Overview',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-opp-banner">
                        <div class="viz-opp-banner-inner">
                            <div class="viz-opp-banner-title">
                                <i data-lucide="target"></i>
                                <span>${cover.title || 'COMMERCIAL OPTIMISATION OPPORTUNITY REPORT'}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:16px">
                                <div class="viz-opp-banner-badge">OPP TRACKER</div>
                                <div class="viz-opp-banner-rr">ROLLS‑ROYCE</div>
                            </div>
                        </div>
                    </div>
                    <div class="viz-opp-hero">
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
                    </div>
                    <div class="viz-customer-bar">
                        ${meta.away_day_date ? `<div class="viz-info-chip"><b>Away Day:</b> ${meta.away_day_date}</div>` : ''}
                        ${meta.sheets_parsed ? `<div class="viz-info-chip"><b>Sheets:</b> ${meta.sheets_parsed.join(', ')}</div>` : ''}
                        <div class="viz-info-chip"><b>Opportunities:</b> ${totalOpps} (${activeOpps} active)</div>
                        <div class="viz-info-chip"><b>Customers:</b> ${Object.keys(byCustomer).length}</div>
                        <div class="viz-info-chip"><b>Programmes:</b> ${Object.keys(byProgramme).length}</div>
                    </div>
                </div>`;
                if (window.lucide) lucide.createIcons();
            }
        });

        // ─── SLIDE 2: Pipeline & Priority Breakdown ───
        _presSlides.push({
            name: 'Pipeline & Priority',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                const priorityKeys = Object.keys(byPriority).sort();
                let kpiHtml = '';
                priorityKeys.forEach(p => {
                    const d = byPriority[p];
                    const icon = p === '1' ? 'star' : p === '2' ? 'circle' : 'minus';
                    kpiHtml += `<div class="viz-kpi-card ${p === '1' ? 'kpi-success' : ''}">
                        <div class="viz-kpi-icon"><i data-lucide="${icon}"></i></div>
                        <div class="viz-kpi-label">Priority ${p}</div>
                        <div class="viz-kpi-value">${$m(d.sum_26_27)}</div>
                        <div class="viz-kpi-subtitle">${d.count} opps · Term: ${$m(d.term)}</div>
                    </div>`;
                });
                kpiHtml += `<div class="viz-kpi-card kpi-success">
                    <div class="viz-kpi-icon"><i data-lucide="check-circle"></i></div>
                    <div class="viz-kpi-label">Completed</div>
                    <div class="viz-kpi-value">${completedOpps}</div>
                    <div class="viz-kpi-subtitle">${((completedOpps / totalOpps) * 100).toFixed(0)}% of total</div>
                </div>`;
                kpiHtml += `<div class="viz-kpi-card kpi-warning">
                    <div class="viz-kpi-icon"><i data-lucide="git-branch"></i></div>
                    <div class="viz-kpi-label">Pipeline</div>
                    <div class="viz-kpi-value">${activeOpps - completedOpps}</div>
                    <div class="viz-kpi-subtitle">${byStatus['ICT'] || 0} ICT · ${byStatus['Negotiations'] || 0} Neg · ${byStatus['Contracting'] || 0} Ctr</div>
                </div>`;

                // Estimation level row
                let estHtml = '';
                const levelEntries = Object.entries(estLevels);
                if (levelEntries.length > 0) {
                    estHtml = `<div class="viz-section-header" style="margin-top:28px">
                        <div class="viz-section-header-pill"><i data-lucide="layers"></i> Estimation Level Breakdown</div>
                    </div><div class="viz-kpi-grid viz-kpi-grid-${Math.min(levelEntries.length, 3)}">`;
                    levelEntries.forEach(([level, sums]) => {
                        const iconMap = { 'ICT': 'zap', 'Contract': 'file-check', 'Hopper': 'inbox' };
                        estHtml += `<div class="viz-kpi-card ${level === 'Contract' ? 'kpi-success' : ''}">
                            <div class="viz-kpi-icon"><i data-lucide="${iconMap[level] || 'layers'}"></i></div>
                            <div class="viz-kpi-label">${level} Estimates</div>
                            <div class="viz-kpi-value">${$m(sums.total_sum_26_27 || 0)}</div>
                            <div class="viz-kpi-subtitle">${sums.count} opps · Term: ${$m(sums.total_term_benefit)} · 2026: ${$m(sums.total_2026)} · 2027: ${$m(sums.total_2027)}</div>
                        </div>`;
                    });
                    estHtml += '</div>';
                }

                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-kpi-grid viz-kpi-grid-${Math.min(priorityKeys.length + 2, 5)}">${kpiHtml}</div>
                    ${estHtml}
                </div>`;
                if (window.lucide) lucide.createIcons();
            }
        });

        // ─── SLIDE 3: Charts — Type & Status ───
        _presSlides.push({
            name: 'Value by Type & Status',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                const typeId = 'pres-opp-type-' + Date.now();
                const statusId = 'pres-opp-status-' + Date.now();
                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-chart-grid viz-chart-grid-2">
                        <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Type of Opportunity & External Probability</div><div id="${typeId}" class="viz-chart-body"></div></div>
                        <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Status & External Probability</div><div id="${statusId}" class="viz-chart-body"></div></div>
                    </div>
                </div>`;
                setTimeout(() => {
                    // Type chart
                    if ($(typeId) && oppTypes.length > 0) {
                        new ApexCharts($(typeId), {
                            chart: { type: 'bar', height: 380, background: 'transparent', foreColor: TXT, stacked: true, toolbar: { show: false } },
                            series: probLevels.map(p => ({ name: p, data: oppTypes.map(t => +(valueByTypeProbObj[t]?.[p] || 0).toFixed(1)) })),
                            xaxis: { categories: oppTypes.map(t => t.length > 14 ? t.slice(0, 11) + '…' : t), labels: { rotate: -30, style: { fontSize: '10px', colors: TXT } }, axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR } },
                            colors: ['#4361EE', '#3A86FF', '#48BFE3'],
                            fill: { opacity: 1 },
                            plotOptions: { bar: { columnWidth: '65%', borderRadius: 4 } },
                            dataLabels: { enabled: false },
                            legend: { position: 'top', fontSize: '11px', labels: { colors: TXT }, markers: { size: 8, radius: 3 } },
                            yaxis: { title: { text: '$M', style: { color: TXT } }, labels: { formatter: v => '$' + v.toFixed(0) + 'm', style: { colors: TXT } } },
                            tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                            grid: baseGrid,
                        }).render();
                    }
                    // Status chart
                    const activeStatuses = statusList.filter(st => valueByStatusProbObj[st] && (valueByStatusProbObj[st].High + valueByStatusProbObj[st].Med + valueByStatusProbObj[st].Low) > 0);
                    if ($(statusId) && activeStatuses.length > 0) {
                        new ApexCharts($(statusId), {
                            chart: { type: 'bar', height: 380, background: 'transparent', foreColor: TXT, stacked: true, toolbar: { show: false } },
                            series: probLevels.map(p => ({ name: p, data: activeStatuses.map(st => +(valueByStatusProbObj[st]?.[p] || 0).toFixed(1)) })),
                            xaxis: { categories: activeStatuses, labels: { rotate: -30, style: { fontSize: '10px', colors: TXT } }, axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR } },
                            colors: ['#4361EE', '#3A86FF', '#48BFE3'],
                            fill: { opacity: 1 },
                            plotOptions: { bar: { columnWidth: '60%', borderRadius: 4 } },
                            dataLabels: { enabled: false },
                            legend: { position: 'top', fontSize: '11px', labels: { colors: TXT } },
                            yaxis: { title: { text: '$M', style: { color: TXT } }, labels: { formatter: v => '$' + v.toFixed(0) + 'm', style: { colors: TXT } } },
                            tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                            grid: baseGrid,
                        }).render();
                    }
                }, 150);
            }
        });

        // ─── SLIDE 4: Charts — Customer, Financial Forecast, Pipeline ───
        _presSlides.push({
            name: 'Customer & Financial Forecast',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                const custId = 'pres-cust-' + Date.now();
                const finId = 'pres-fin-' + Date.now();
                const pipeId = 'pres-pipe-' + Date.now();
                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-chart-grid viz-chart-grid-3">
                        <div class="viz-chart-card"><div class="viz-chart-header">Sum of Value by Customer</div><div id="${custId}" class="viz-chart-body"></div></div>
                        <div class="viz-chart-card"><div class="viz-chart-header">Financial Forecast by Level</div><div id="${finId}" class="viz-chart-body"></div></div>
                        <div class="viz-chart-card"><div class="viz-chart-header">Pipeline Status</div><div id="${pipeId}" class="viz-chart-body"></div></div>
                    </div>
                </div>`;
                const TXT_BRIGHT = '#E8E6F8';
                setTimeout(() => {
                    // Customer chart
                    if ($(custId) && custTop10.length > 0) {
                        const custColors = ['#48BFE3', '#4361EE', '#3A86FF', '#5E60CE', '#7400B8', '#6930C3', '#64DFDF', '#80FFDB', '#56CFE1', '#72EFDD', '#4EA8DE', '#5390D9', '#6D6875', '#48BFE3', '#4361EE'];
                        new ApexCharts($(custId), {
                            chart: { type: 'bar', height: Math.max(380, custTop10.length * 30), background: 'transparent', foreColor: TXT, toolbar: { show: false } },
                            series: [{ name: 'Sum 26+27 ($M)', data: custTop10.map(c => +c[1].toFixed(1)) }],
                            xaxis: { categories: custTop10.map(c => c[0]), labels: { style: { colors: TXT_BRIGHT, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                            colors: custColors, fill: { opacity: 1 },
                            plotOptions: { bar: { horizontal: true, borderRadius: 5, distributed: true, barHeight: '65%' } },
                            dataLabels: { enabled: true, formatter: v => '$' + v + 'm', offsetX: 18, style: { fontSize: '11px', fontWeight: 600, colors: [TXT_BRIGHT] } },
                            legend: { show: false },
                            yaxis: { labels: { style: { fontSize: '11px', colors: TXT_BRIGHT } } },
                            grid: { borderColor: GRID_COLOR, strokeDashArray: 3, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
                            tooltip: { ...baseTip, y: { formatter: v => '$' + v.toFixed(1) + 'm' } },
                        }).render();
                    }
                    // Financial forecast
                    const levelEntries2 = Object.entries(estLevels);
                    if ($(finId) && levelEntries2.length > 0) {
                        new ApexCharts($(finId), {
                            chart: { type: 'bar', height: 380, background: 'transparent', foreColor: TXT, toolbar: { show: false } },
                            series: [
                                { name: 'Term ($M)', data: levelEntries2.map(([, s2]) => +(s2.total_term_benefit || 0).toFixed(1)) },
                                { name: '2026 ($M)', data: levelEntries2.map(([, s2]) => +(s2.total_2026 || 0).toFixed(1)) },
                                { name: '2027 ($M)', data: levelEntries2.map(([, s2]) => +(s2.total_2027 || 0).toFixed(1)) },
                            ],
                            xaxis: { categories: levelEntries2.map(([l]) => l), labels: { style: { colors: TXT } }, axisBorder: { color: GRID_COLOR }, axisTicks: { color: GRID_COLOR } },
                            colors: ['#FF8B42', '#4361EE', '#00E396'], fill: { opacity: 1 },
                            plotOptions: { bar: { horizontal: false, columnWidth: '55%', borderRadius: 5 } },
                            dataLabels: { enabled: true, formatter: v => '$' + v + 'm', style: { fontSize: '10px', colors: [TXT_BRIGHT] } },
                            legend: { position: 'top', fontSize: '11px', labels: { colors: TXT } },
                            yaxis: { labels: { formatter: v => '$' + v + 'm', style: { colors: TXT } } },
                            tooltip: { ...baseTip, y: { formatter: v => '$' + v + 'm' } },
                            grid: baseGrid,
                        }).render();
                    }
                    // Pipeline donut
                    const statusColors2 = { 'Completed': '#00E396', 'Contracting': '#3A86FF', 'Negotiations': '#FFB547', 'ICT': '#B39DDB', 'Hopper': '#48BFE3', 'Cancelled': '#FF4560' };
                    const statusLabels2 = Object.keys(byStatus).filter(st => byStatus[st] > 0);
                    const statusValues2 = statusLabels2.map(st => byStatus[st]);
                    if ($(pipeId) && statusLabels2.length > 0) {
                        new ApexCharts($(pipeId), {
                            chart: { type: 'donut', height: 380, background: 'transparent', foreColor: TXT, toolbar: { show: false } },
                            series: statusValues2, labels: statusLabels2,
                            colors: statusLabels2.map(l => statusColors2[l] || '#6B67A0'),
                            fill: { opacity: 1 },
                            plotOptions: { pie: { donut: { size: '58%', labels: { show: true, name: { color: TXT_BRIGHT, fontSize: '13px' }, value: { color: TXT_BRIGHT, fontSize: '20px', fontWeight: 700 }, total: { show: true, label: 'Total', color: TXT, fontSize: '13px', fontWeight: 600, formatter: w => w.globals.seriesTotals.reduce((a, b) => a + b, 0) } } } } },
                            stroke: { show: true, width: 2, colors: ['#0A0842'] },
                            dataLabels: { enabled: true, formatter: val => val.toFixed(0) + '%', style: { fontSize: '11px', colors: [TXT_BRIGHT] }, dropShadow: { enabled: false } },
                            legend: { position: 'bottom', fontSize: '11px', labels: { colors: TXT }, markers: { radius: 3 } },
                        }).render();
                    }
                }, 150);
            }
        });

        // ─── SLIDE 5: External Probability & Opp Types ───
        _presSlides.push({
            name: 'Probability & Opportunity Types',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                const probColors = { 'High': '#10069F', 'Med': '#1565C0', 'Low': '#00838F' };
                const typeColors = ['#10069F', '#1565C0', '#2E7D32', '#00838F', '#EF6C00', '#5E35B1', '#C62828', '#B8860B'];
                const probAgg = {};
                allRecords.forEach(r => {
                    const p = r.ext_probability || '?';
                    if (!probAgg[p]) probAgg[p] = { count: 0, sum: 0, term: 0 };
                    probAgg[p].count += 1;
                    probAgg[p].sum += _val(r.sum_26_27);
                    probAgg[p].term += _val(r.term_benefit);
                });

                let probChips = '';
                Object.entries(probAgg).forEach(([prob, d]) => {
                    const color = probColors[prob] || '#9E9E9E';
                    probChips += `<div class="viz-info-chip" style="border-left:3px solid ${color}"><b>${prob}:</b> ${d.count} opps · ${$m(d.sum)} (26+27) · ${$m(d.term)} term</div>`;
                });

                let typeChips = '';
                Object.entries(byOppType).forEach(([type, count], i) => {
                    const color = typeColors[i % typeColors.length];
                    const typeVal = allRecords.filter(r => r.opportunity_type === type).reduce((su, r) => su + _val(r.sum_26_27), 0);
                    typeChips += `<div class="viz-info-chip" style="border-left:3px solid ${color}"><b>${type}:</b> ${count} · ${$m(typeVal)}</div>`;
                });

                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-section-header"><div class="viz-section-header-pill"><i data-lucide="bar-chart-3"></i> External Probability & Opportunity Types</div></div>
                    <div class="viz-customer-bar">${probChips}</div>
                    <div class="viz-customer-bar" style="margin-top:8px">${typeChips}</div>
                </div>`;
                if (window.lucide) lucide.createIcons();
            }
        });

        // ─── SLIDE 6: Top Opportunities Table ───
        _presSlides.push({
            name: 'Top Opportunities',
            render: () => {
                const s = $('presSlide');
                _applyOppDarkTheme(s);
                const topByValue = [...allRecords].sort((a, b) => _val(b.sum_26_27) - _val(a.sum_26_27)).slice(0, 20);
                let rowsHtml = '';
                topByValue.forEach(r => {
                    const valColor = _val(r.sum_26_27) >= 0 ? '#00E396' : '#FF4560';
                    rowsHtml += `<tr>
                        <td style="color:#E8E6F8">${r.customer || '—'}</td>
                        <td style="color:#C8C6DD">${(r.asks || '').toString().substring(0, 45)}</td>
                        <td style="color:#C8C6DD">${r.ext_probability || '—'}</td>
                        <td style="color:#C8C6DD">${r.status || '—'}</td>
                        <td style="color:${valColor};font-weight:600">${$m(_val(r.sum_26_27))}</td>
                    </tr>`;
                });

                s.innerHTML = `<div class="opp-tracker-dashboard">
                    <div class="viz-section-header"><div class="viz-section-header-pill"><i data-lucide="trophy"></i> Top Opportunities by Value</div>
                        <span class="viz-section-badge" style="background:#10069F">${topByValue.length} items</span>
                    </div>
                    <div class="viz-table-wrap">
                        <table class="viz-data-table">
                            <thead><tr>
                                <th>Customer</th><th>Asks</th><th>Ext Prob</th><th>Status</th><th>Sum of Value (26+27)</th>
                            </tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>`;
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    // ─── Global Hopper Slide Builders ───
    function _buildGlobalHopperSlides(data, fname) {
        const meta = data.metadata || {};
        const summary = data.summary || {};
        const opps = data.opportunities || [];
        const currency = meta.currency || 'GBP';

        // Slide 1: Overview
        _presSlides.push({
            name: 'Commercial Overview',
            render: () => {
                const s = $('presSlide');
                const totalCRP = summary.total_crp_term_benefit || 0;
                const fmtGBP = v => v >= 1000 ? `£${(v/1000).toFixed(1)}bn` : `£${v.toFixed(1)}m`;

                s.innerHTML = `
                    <div style="padding:40px;">
                        <div style="text-align:center;margin-bottom:40px;">
                            <h2 style="color:#fff;font-size:1.8rem;margin:0;">${meta.title || 'Commercial Optimisation Opportunity Report'}</h2>
                            <p style="color:#9B97C0;font-size:1rem;margin-top:8px;">${fname} · ${opps.length} Opportunities · ${(summary.unique_regions||[]).length} Regions</p>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:30px;">
                            <div class="pres-kpi-card" style="background:#0A0842;border-radius:12px;padding:24px;text-align:center;border-top:3px solid #00C875;">
                                <div style="color:#9B97C0;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;">CRP Term Benefit</div>
                                <div style="color:#00C875;font-size:2rem;font-weight:800;margin-top:8px;">${fmtGBP(totalCRP)}</div>
                            </div>
                            <div class="pres-kpi-card" style="background:#0A0842;border-radius:12px;padding:24px;text-align:center;border-top:3px solid #2D8CFF;">
                                <div style="color:#9B97C0;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;">Profit 2026</div>
                                <div style="color:#2D8CFF;font-size:2rem;font-weight:800;margin-top:8px;">£${(summary.total_profit_2026||0).toFixed(1)}m</div>
                            </div>
                            <div class="pres-kpi-card" style="background:#0A0842;border-radius:12px;padding:24px;text-align:center;border-top:3px solid #FF8B42;">
                                <div style="color:#9B97C0;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;">Profit 2027</div>
                                <div style="color:#FF8B42;font-size:2rem;font-weight:800;margin-top:8px;">£${(summary.total_profit_2027||0).toFixed(1)}m</div>
                            </div>
                            <div class="pres-kpi-card" style="background:#0A0842;border-radius:12px;padding:24px;text-align:center;border-top:3px solid #FFB547;">
                                <div style="color:#9B97C0;font-size:.75rem;text-transform:uppercase;letter-spacing:1px;">Opportunities</div>
                                <div style="color:#FFB547;font-size:2rem;font-weight:800;margin-top:8px;">${opps.length}</div>
                            </div>
                        </div>
                    </div>`;
            }
        });

        // Slide 2: Pipeline & Status
        _presSlides.push({
            name: 'Pipeline Status',
            render: () => {
                const s = $('presSlide');
                const stages = summary.pipeline_stages || [];
                let tableRows = stages.map(st =>
                    `<tr><td style="color:#E8E6F8;padding:10px 16px;">${st.stage}</td>
                     <td style="color:#00C875;padding:10px 16px;text-align:center;font-weight:700;">${st.count}</td>
                     <td style="color:#2D8CFF;padding:10px 16px;text-align:right;font-family:'JetBrains Mono';">£${st.value.toFixed(1)}m</td></tr>`
                ).join('');
                s.innerHTML = `
                    <div style="padding:40px;">
                        <h2 style="color:#fff;font-size:1.4rem;margin-bottom:24px;">Pipeline by Status</h2>
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="border-bottom:2px solid rgba(200,202,224,0.2);">
                                <th style="color:#9B97C0;text-align:left;padding:12px 16px;font-size:.75rem;text-transform:uppercase;">Stage</th>
                                <th style="color:#9B97C0;text-align:center;padding:12px 16px;font-size:.75rem;text-transform:uppercase;">Count</th>
                                <th style="color:#9B97C0;text-align:right;padding:12px 16px;font-size:.75rem;text-transform:uppercase;">CRP (£m)</th>
                            </tr></thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>`;
            }
        });

        // Slide 3: Top Customers
        _presSlides.push({
            name: 'Top Customers',
            render: () => {
                const s = $('presSlide');
                const top = (summary.top_customers || []).slice(0, 10);
                let rows = top.map((c, i) =>
                    `<tr><td style="color:#9B97C0;padding:8px 16px;">${i+1}</td>
                     <td style="color:#E8E6F8;padding:8px 16px;font-weight:600;">${c.customer}</td>
                     <td style="color:#00C875;padding:8px 16px;text-align:right;font-family:'JetBrains Mono';font-weight:700;">£${c.crp_term_benefit.toFixed(1)}m</td></tr>`
                ).join('');
                s.innerHTML = `
                    <div style="padding:40px;">
                        <h2 style="color:#fff;font-size:1.4rem;margin-bottom:24px;">Top 10 Customers by CRP Term Benefit</h2>
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="border-bottom:2px solid rgba(200,202,224,0.2);">
                                <th style="color:#9B97C0;text-align:left;padding:10px 16px;width:40px;">#</th>
                                <th style="color:#9B97C0;text-align:left;padding:10px 16px;">Customer</th>
                                <th style="color:#9B97C0;text-align:right;padding:10px 16px;">CRP Term (£m)</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
            }
        });

        // Slide 4: Region Breakdown
        _presSlides.push({
            name: 'Region Analysis',
            render: () => {
                const s = $('presSlide');
                const byRegion = summary.by_region_value || {};
                let rows = Object.entries(byRegion).sort((a,b) => b[1]-a[1]).map(([region, val]) => {
                    const count = (summary.by_region || {})[region] || 0;
                    return `<tr><td style="color:#E8E6F8;padding:10px 16px;font-weight:600;">${region}</td>
                            <td style="color:#9B97C0;padding:10px 16px;text-align:center;">${count}</td>
                            <td style="color:#00C875;padding:10px 16px;text-align:right;font-family:'JetBrains Mono';">£${val.toFixed(1)}m</td></tr>`;
                }).join('');
                s.innerHTML = `
                    <div style="padding:40px;">
                        <h2 style="color:#fff;font-size:1.4rem;margin-bottom:24px;">Opportunities by Region</h2>
                        <table style="width:100%;border-collapse:collapse;">
                            <thead><tr style="border-bottom:2px solid rgba(200,202,224,0.2);">
                                <th style="color:#9B97C0;text-align:left;padding:10px 16px;">Region</th>
                                <th style="color:#9B97C0;text-align:center;padding:10px 16px;">Count</th>
                                <th style="color:#9B97C0;text-align:right;padding:10px 16px;">CRP Term (£m)</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
            }
        });
    }

    // ─── New-format SOA Slides ───
    function _buildNewSOASlides(data, fname) {
        const meta = data.metadata || {};
        const sections = data.sections || [];
        const grand = data.grand_totals || {};

        let allItems = [];
        sections.forEach(sec => {
            (sec.items || []).forEach(item => allItems.push({ ...item, _section: sec.name }));
        });

        const totalCharges = allItems.filter(i => (i.amount || 0) > 0).reduce((s, i) => s + i.amount, 0);
        const totalCredits = allItems.filter(i => (i.amount || 0) < 0).reduce((s, i) => s + i.amount, 0);
        const netBalance = grand.net_balance || (totalCharges + totalCredits);
        const fmtC = (v) => { if (v == null) return '—'; const sign = v < 0 ? '-' : ''; const abs = Math.abs(v); if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`; if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`; return `${sign}$${abs.toFixed(2)}`; };

        _presSlides.push({
            name: `${meta.customer_name || fname} — Overview`,
            render: () => {
                const s = $('presSlide');
                s.style.background = '#fff'; s.style.color = '#1a1a2e';
                let html = '<div style="padding:20px">';
                if (meta.customer_name) html += `<h2 style="margin-bottom:12px">${meta.customer_name}</h2>`;
                html += `<div class="viz-kpi-grid viz-kpi-grid-4">
                    <div class="viz-kpi-card"><div class="viz-kpi-label">Net Balance</div><div class="viz-kpi-value">${fmtC(netBalance)}</div></div>
                    <div class="viz-kpi-card"><div class="viz-kpi-label">Total Charges</div><div class="viz-kpi-value">${fmtC(totalCharges)}</div></div>
                    <div class="viz-kpi-card"><div class="viz-kpi-label">Total Credits</div><div class="viz-kpi-value">${fmtC(totalCredits)}</div></div>
                    <div class="viz-kpi-card"><div class="viz-kpi-label">Line Items</div><div class="viz-kpi-value">${allItems.length}</div></div>
                </div></div>`;
                s.innerHTML = html;
            }
        });
    }

    // ─── New-format Invoice List Slides ───
    function _buildInvoiceListSlides(data, fname) {
        const meta = data.metadata || {};
        const items = data.items || [];
        const totals = data.totals || {};
        const fmtC = (v) => { if (v == null) return '—'; const sign = v < 0 ? '-' : ''; const abs = Math.abs(v); if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`; if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`; return `${sign}$${abs.toFixed(2)}`; };

        _presSlides.push({
            name: `Invoice List — ${fname}`,
            render: () => {
                const s = $('presSlide');
                s.style.background = '#fff'; s.style.color = '#1a1a2e';
                s.innerHTML = `<div style="padding:20px">
                    <h2 style="margin-bottom:12px">Invoice List</h2>
                    <div class="viz-kpi-grid viz-kpi-grid-4">
                        <div class="viz-kpi-card"><div class="viz-kpi-label">Total Amount</div><div class="viz-kpi-value">${fmtC(totals.total_amount)}</div></div>
                        <div class="viz-kpi-card"><div class="viz-kpi-label">Receivables</div><div class="viz-kpi-value">${fmtC(totals.total_positive)}</div></div>
                        <div class="viz-kpi-card"><div class="viz-kpi-label">Credits</div><div class="viz-kpi-value">${fmtC(totals.total_negative)}</div></div>
                        <div class="viz-kpi-card"><div class="viz-kpi-label">Items</div><div class="viz-kpi-value">${totals.item_count || items.length}</div></div>
                    </div>
                </div>`;
            }
        });
    }

    // ─── Generic Summary Slide ───
    function _presRenderGenericSummary(data, fname) {
        const s = $('presSlide');
        s.style.background = '#fff'; s.style.color = '#1a1a2e';
        const ft = data.file_type || 'DATA';
        s.innerHTML = `<div style="padding:40px;text-align:center;">
            <h2 style="font-size:1.5rem;margin-bottom:12px;">${fname}</h2>
            <p style="color:#666;">File Type: <strong>${ft}</strong></p>
        </div>`;
    }

    // ─── Apply dark theme to presentation slide for Opportunity Tracker ───
    function _applyOppDarkTheme(slideEl) {
        slideEl.style.background = '#03002E';
        slideEl.style.color = '#C8C6DD';
        slideEl.style.borderRadius = '12px';
        slideEl.style.padding = '24px 32px';
        // Also darken the parent presentation container
        const presContainer = $('presentationContainer');
        if (presContainer) presContainer.style.background = '#03002E';
    }

    function _renderComparisonView() {
        const container = $('comparisonContainer');
        if (!container) return;

        // Only render if empty to preserve history (optional, or clear every time?)
        // Let's clear for now to ensure fresh state or we can keep if populated
        if (container.innerHTML.trim() === '') {
            container.innerHTML = `
                <div class="comparison-grid">
                    <!-- Qwen -->
                    <div class="comparison-col" id="col-qwen">
                        <div class="comparison-col-header">
                            <i data-lucide="cpu"></i> Qwen 3 VL (OpenRouter)
                            <span class="comparison-col-time" id="time-qwen" style="display:none">0s</span>
                        </div>
                        <div class="comparison-col-body" id="body-qwen"></div>
                    </div>
                    <!-- GPT -->
                    <div class="comparison-col" id="col-gpt">
                        <div class="comparison-col-header">
                            <i data-lucide="zap"></i> GPT 120b (DigitalOcean)
                             <span class="comparison-col-time" id="time-gpt" style="display:none">0s</span>
                        </div>
                        <div class="comparison-col-body" id="body-gpt"></div>
                    </div>
                    <!-- Kimi -->
                    <div class="comparison-col" id="col-kimi">
                        <div class="comparison-col-header">
                            <i data-lucide="sparkles"></i> Kimi K2.5 (NVIDIA)
                             <span class="comparison-col-time" id="time-kimi" style="display:none">0s</span>
                        </div>
                        <div class="comparison-col-body" id="body-kimi"></div>
                    </div>
                </div>

                <div class="comparison-input-bar">
                    <textarea class="comparison-input" id="compInput" placeholder="Enter prompt to compare models... (uses uploaded data)" rows="1"></textarea>
                    <button class="comparison-send-btn" id="compSendBtn">
                        <i data-lucide="send"></i>
                    </button>
                </div>
            `;

            _bindComparisonEvents();
            if (window.lucide) lucide.createIcons();
        }
    }

    function _bindComparisonEvents() {
        const btn = $('compSendBtn');
        const input = $('compInput');

        const send = async () => {
            const prompt = input.value.trim();
            if (!prompt) return;

            // Clear previous results
            ['qwen', 'gpt', 'kimi'].forEach(key => {
                const body = $(`body-${key}`);
                const time = $(`time-${key}`);
                if (body) body.innerHTML = '<div class="ai-typing-dots"><span></span><span></span><span></span></div>'; // Spinner
                if (time) time.style.display = 'none';
            });

            input.value = '';
            input.disabled = true;
            btn.disabled = true;

            try {
                const response = await fetch('/api/compare', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: prompt }),
                });

                if (!response.ok) throw new Error('Comparison failed');

                const data = await response.json();

                // Populate results
                (data.results || []).forEach(res => {
                    let key = '';
                    if (res.model_id.includes('qwen')) key = 'qwen';
                    else if (res.model_id.includes('digitalocean')) key = 'gpt';
                    else if (res.model_id.includes('kimi')) key = 'kimi';

                    const body = $(`body-${key}`);
                    const time = $(`time-${key}`);

                    if (body) {
                        if (res.error) {
                            body.innerHTML = `<span style="color:var(--danger)">Error: ${res.error}</span>`;
                        } else {
                            // Simple markdown parsing
                            body.innerHTML = RRComponents.markdownToHtml(res.content || 'No response');
                        }
                    }
                    if (time && res.time) {
                        time.textContent = res.time;
                        time.style.display = 'inline-block';
                    }
                });

            } catch (err) {
                RRComponents.showToast(err.message, 'error');
                ['qwen', 'gpt', 'kimi'].forEach(key => {
                    const body = $(`body-${key}`);
                    if (body && body.innerHTML.includes('ai-typing-dots')) {
                        body.innerHTML = '<span style="color:var(--danger)">Request failed</span>';
                    }
                });
            } finally {
                input.disabled = false;
                btn.disabled = false;
                input.focus();
            }
        };

        if (btn) btn.addEventListener('click', send);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                }
            });
        }
    }


    // ─── Presentation Slide Renderers ───

    function _presRenderCurrentSlide() {
        const slideEl = $('presSlide');
        const indicator = $('presIndicator');
        const prevBtn = $('presPrev');
        const nextBtn = $('presNext');

        if (!slideEl || _presSlides.length === 0) return;

        if (indicator) indicator.textContent = `${_presSlides[_presSlide].name}  —  Slide ${_presSlide + 1} of ${_presSlides.length}`;
        if (prevBtn) prevBtn.disabled = _presSlide === 0;
        if (nextBtn) nextBtn.disabled = _presSlide >= _presSlides.length - 1;

        slideEl.style.animation = 'none';
        slideEl.offsetHeight;
        slideEl.style.animation = 'tabFadeIn 0.3s ease';

        _presSlides[_presSlide].render();
        if (window.lucide) lucide.createIcons();
    }

    function _presRenderCustomerOverview(metaList, filtered) {
        const slideEl = $('presSlide');
        slideEl.innerHTML = '<div id="presCustomerInfo"></div><div id="presDebt" style="margin-top:24px;"></div>';
        RRComponents.renderCustomerInfo($('presCustomerInfo'), metaList);
        RRComponents.renderDebtDecomposition($('presDebt'), filtered);
    }

    function _presRenderKPIs(grand, avgLate) {
        const slideEl = $('presSlide');
        slideEl.innerHTML = '<div id="presKPIs"></div>';
        RRComponents.renderKPICards($('presKPIs'), grand, avgLate);
    }

    function _presRenderCharts(filtered) {
        const slideEl = $('presSlide');
        slideEl.innerHTML = `
            <div class="chart-grid chart-grid-3">
                <div class="chart-card"><div class="chart-card-header">Breakdown by Section</div><div id="presDonut" class="chart-container"></div></div>
                <div class="chart-card"><div class="chart-card-header">Charges vs Credits</div><div id="presCC" class="chart-container"></div></div>
                <div class="chart-card"><div class="chart-card-header">Aging Analysis</div><div id="presAging" class="chart-container"></div></div>
            </div>`;
        _renderExecChartsInto(filtered, 'presDonut', 'presCC', 'presAging');
    }

    function _presRenderBilateral(filtered) {
        const slideEl = $('presSlide');
        slideEl.innerHTML = `
            <div class="chart-grid chart-grid-2">
                <div class="chart-card"><div class="chart-card-header">Customer vs RR Position</div><div id="presBilateral" class="chart-container"></div></div>
                <div class="chart-card"><div class="chart-card-header">Net Balance by Section</div><div id="presNetBalance" class="chart-container"></div></div>
            </div>`;
        _renderBilateralChartsInto(filtered, 'presBilateral', 'presNetBalance');
    }

    function _presRenderSection(secName, secData) {
        const slideEl = $('presSlide');
        const rows = secData.rows || [];
        const totals = secData.totals || {};
        const secCharges = rows.filter(r => r.Amount > 0).reduce((s, r) => s + r.Amount, 0);
        const secCredits = rows.filter(r => r.Amount < 0).reduce((s, r) => s + r.Amount, 0);
        const secTotal = totals.total != null ? totals.total : secCharges + secCredits;

        slideEl.innerHTML = `
            <div class="section-header"><div class="section-header-pill"><i data-lucide="layers"></i> ${secName}</div></div>
            <div class="section-kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
                <div class="section-kpi-card"><div class="section-kpi-label">Section Total</div><div class="section-kpi-value">${RRComponents.fmtCurrency(secTotal)}</div></div>
                <div class="section-kpi-card"><div class="section-kpi-label">Charges</div><div class="section-kpi-value">${RRComponents.fmtCurrency(secCharges)}</div></div>
                <div class="section-kpi-card"><div class="section-kpi-label">Credits</div><div class="section-kpi-value" style="color:var(--success)">${RRComponents.fmtCurrency(secCredits)}</div></div>
                <div class="section-kpi-card"><div class="section-kpi-label">Items</div><div class="section-kpi-value">${rows.length}</div></div>
            </div>`;
    }


    // ─── Chart Rendering Helpers ───

    function _renderExecutiveCharts(items) {
        _renderExecChartsInto(items, 'chartDonut', 'chartChargesCredits', 'chartAging');
    }

    function _renderExecChartsInto(items, donutId, ccId, agingId) {
        if (!items || items.length === 0) return;

        // Donut: section breakdown
        const secAbs = {};
        items.forEach(i => { secAbs[i.Section] = (secAbs[i.Section] || 0) + Math.abs(i.Amount || 0); });
        RRCharts.renderDonut(donutId, Object.keys(secAbs), Object.values(secAbs));

        // Charges vs Credits per section
        const secCharges = {};
        const secCredits = {};
        items.forEach(i => {
            if (i.Amount > 0) secCharges[i.Section] = (secCharges[i.Section] || 0) + i.Amount;
            else secCredits[i.Section] = (secCredits[i.Section] || 0) + i.Amount;
        });
        const ccSections = [...new Set([...Object.keys(secCharges), ...Object.keys(secCredits)])];
        RRCharts.renderChargesCredits(ccId, ccSections,
            ccSections.map(s => secCharges[s] || 0),
            ccSections.map(s => secCredits[s] || 0));

        // Aging analysis
        const agingData = {};
        items.forEach(i => {
            const bucket = RRComponents.agingBucket(i['Days Late']);
            agingData[bucket] = (agingData[bucket] || 0) + (i.Amount || 0);
        });
        RRCharts.renderAgingBar(agingId, agingData);
    }

    function _renderBilateralCharts(items) {
        _renderBilateralChartsInto(items, 'chartBilateral', 'chartNetBalance');
    }

    function _renderBilateralChartsInto(items, bilateralId, netBalanceId) {
        if (!items || items.length === 0) return;

        const customerOwes = items.filter(i => i.Amount > 0).reduce((s, i) => s + i.Amount, 0);
        const rrOwes = items.filter(i => i.Amount < 0).reduce((s, i) => s + i.Amount, 0);
        RRCharts.renderBilateralBar(bilateralId, customerOwes, rrOwes);

        // Net balance by section
        const secNet = {};
        items.forEach(i => { secNet[i.Section] = (secNet[i.Section] || 0) + (i.Amount || 0); });
        RRCharts.renderNetBalanceBar(netBalanceId, Object.keys(secNet), Object.values(secNet));
    }


    // ─── Data Helpers ───

    function _getMergedSections() {
        const merged = {};
        Object.values(_filesData).forEach(fdata => {
            Object.entries(fdata.sections || {}).forEach(([name, sec]) => {
                if (!merged[name]) {
                    merged[name] = { rows: [], totals: sec.totals || {}, header: sec.header };
                }
                (sec.rows || []).forEach(r => merged[name].rows.push(r));
            });
        });
        return merged;
    }

    function _computeGrandTotals(items) {
        const tc = items.filter(i => i.Amount > 0).reduce((s, i) => s + i.Amount, 0);
        const tcr = items.filter(i => i.Amount < 0).reduce((s, i) => s + i.Amount, 0);
        return {
            total_charges: tc,
            total_credits: tcr,
            net_balance: tc + tcr,
            item_count: items.length,
            total_overdue: items.filter(i => (i['Days Late'] || 0) > 0).reduce((s, i) => s + (i.Amount || 0), 0) || (tc + tcr),
        };
    }

    function _getAvgDaysLate(metaList) {
        const vals = metaList.map(m => m.avg_days_late).filter(v => v != null);
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    function _showSections(ids) {
        ids.forEach(id => { const el = $(id); if (el) el.style.display = ''; });
    }

    function _hideSections(ids) {
        ids.forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    }


    // ═══════════════════════════════════════════
    // VIEW MODE SWITCHING
    // ═══════════════════════════════════════════

    function _bindViewPills() {
        const pills = document.querySelectorAll('.view-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                _currentView = pill.dataset.view;
                _updateBreadcrumb();

                // Special case for files: allow viewing without data
                if (_currentView === 'files') {
                    _showDashboard();
                } else if (Object.keys(_filesData).length > 0) {
                    _showDashboard();
                }
            });
        });
    }

    function _updateBreadcrumb() {
        const bc = $('breadcrumbView');
        if (!bc) return;
        const labels = { standard: 'Standard View', executive: 'Executive Summary', presentation: 'Presentation Mode', comparison: 'Comparison Mode', ai: 'AI Assistant', files: 'Restricted Files' };
        bc.textContent = labels[_currentView] || 'Standard View';
    }


    // ═══════════════════════════════════════════
    // SIDEBAR INTERACTIONS
    // ═══════════════════════════════════════════

    function _bindSidebarAccordions() {
        document.querySelectorAll('.sidebar-accordion-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const target = trigger.dataset.target;
                const content = $(target);
                if (!content) return;
                const isCollapsed = content.classList.contains('collapsed');
                content.classList.toggle('collapsed');
                trigger.classList.toggle('collapsed');
            });
        });
    }

    function _bindFilterListeners() {
        // Listen for filter changes on LEGACY sidebar filters only (checkboxes).
        // Visualizer filters (Hopper, Commercial Plan, Whereabouts, etc.) use <select>
        // elements with the same data-filter attribute — those are handled locally
        // inside each renderer. Narrowing this selector to checkboxes prevents the
        // global re-render from wiping visualizer filter state on every dropdown change.
        document.addEventListener('change', (e) => {
            if (e.target.matches('input[type="checkbox"][data-filter]')) {
                _onFiltersChanged();
            }
        });

        // Reset filters
        const resetBtn = $('filterResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.querySelectorAll('input[type="checkbox"][data-filter]').forEach(cb => { cb.checked = true; });
                _onFiltersChanged();
            });
        }
    }

    function _onFiltersChanged() {
        // Update filter badge
        const filters = RRComponents.getActiveFilters();
        const total = document.querySelectorAll('input[type="checkbox"][data-filter]').length;
        const checked = document.querySelectorAll('input[type="checkbox"][data-filter]:checked').length;
        const badge = $('filterBadge');
        if (badge) {
            const diff = total - checked;
            if (diff > 0) {
                badge.textContent = diff;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }

        // Re-render dashboard
        if (Object.keys(_filesData).length > 0) _showDashboard();
    }


    // ═══════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════

    function _bindExportButtons() {
        [$('exportPdfBtn'), $('footerExportBtn')].forEach(btn => {
            if (btn) btn.addEventListener('click', _exportPdf);
        });

        // Bind PDF Modal logic
        const modal = $('pdfModalOverlay');
        const btnCancel = $('pdfModalCancel');
        const btnClose = $('pdfModalClose');
        const btnGenerate = $('pdfModalGenerate');

        if (btnCancel) btnCancel.addEventListener('click', () => modal.style.display = 'none');
        if (btnClose) btnClose.addEventListener('click', () => modal.style.display = 'none');

        if (btnGenerate) {
            btnGenerate.addEventListener('click', async () => {
                modal.style.display = 'none';
                await _generateModularPdf();
            });
        }
    }

    // PDF modal file-type-aware section catalog
    const _PDF_SECTIONS_BY_TYPE = {
        OPPORTUNITY_TRACKER: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs & Financial Summary', checked: true },
            { id: 'pdfIncTopOpps', key: 'top_opps', label: 'Top Opportunities', checked: true },
            { id: 'pdfIncEstLevel', key: 'estimation_level', label: 'Estimation Level breakdown', checked: true },
            { id: 'pdfIncTimeline', key: 'timeline', label: 'Project Timeline', checked: true },
            { id: 'pdfIncOppsThreats', key: 'opps_threats', label: 'Opportunities & Threats', checked: true },
            { id: 'pdfIncProjSummary', key: 'project_summary', label: 'Project Summary', checked: true },
            { id: 'pdfIncCustomer', key: 'customer_breakdown', label: 'Customer Breakdown (Charts)', checked: true },
        ],
        SOA: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs & Totals', checked: true },
            { id: 'pdfIncAging', key: 'aging', label: 'Aging Breakdown', checked: true },
            { id: 'pdfIncSections', key: 'sections', label: 'Section Details', checked: true },
            { id: 'pdfIncRegister', key: 'invoice_register', label: 'Invoice Register', checked: true },
            { id: 'pdfIncOverdue', key: 'top_overdue', label: 'Top 10 Overdue', checked: true },
        ],
        INVOICE_LIST: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs & Totals', checked: true },
            { id: 'pdfIncAging', key: 'aging', label: 'Aging Breakdown', checked: true },
            { id: 'pdfIncStatus', key: 'status', label: 'Status Distribution', checked: true },
            { id: 'pdfIncSubtot', key: 'subtotals', label: 'Section Subtotals', checked: true },
            { id: 'pdfIncRegister', key: 'invoice_register', label: 'Invoice Register', checked: true },
        ],
        GLOBAL_HOPPER: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs & Financials', checked: true },
            { id: 'pdfIncPipeline', key: 'pipeline', label: 'Pipeline by Status', checked: true },
            { id: 'pdfIncRegion', key: 'region', label: 'Region Breakdown', checked: true },
            { id: 'pdfIncCustomer', key: 'customer_breakdown', label: 'Top Customers', checked: true },
            { id: 'pdfIncLeaderboard', key: 'owner_leaderboard', label: 'Owner Leaderboard', checked: true },
            { id: 'pdfIncTreemap', key: 'evs_treemap', label: 'EVS Profit Treemap', checked: true },
            { id: 'pdfIncRegister', key: 'opps_register', label: 'Opportunities Register', checked: true },
        ],
        SHOP_VISIT: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs', checked: true },
            { id: 'pdfIncTypes', key: 'sv_types', label: 'Shop Visit Types', checked: true },
            { id: 'pdfIncLocations', key: 'sv_locations', label: 'Shop Visit Locations', checked: true },
            { id: 'pdfIncTimeline', key: 'engine_lifeline', label: 'Engine Lifeline Timeline', checked: true },
            { id: 'pdfIncTopOps', key: 'top_operators', label: 'Top Operators', checked: true },
            { id: 'pdfIncRegister', key: 'sv_events', label: 'Shop Visit Events Register', checked: true },
        ],
        SHOP_VISIT_HISTORY: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'KPIs', checked: true },
            { id: 'pdfIncTypes', key: 'sv_types', label: 'Shop Visit Types', checked: true },
            { id: 'pdfIncLocations', key: 'sv_locations', label: 'Shop Visit Locations', checked: true },
            { id: 'pdfIncTimeline', key: 'engine_lifeline', label: 'Engine Lifeline Timeline', checked: true },
            { id: 'pdfIncTopOps', key: 'top_operators', label: 'Top Operators', checked: true },
            { id: 'pdfIncRegister', key: 'sv_events', label: 'Shop Visit Events Register', checked: true },
        ],
        SVRG_MASTER: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'Summary KPIs', checked: true },
            { id: 'pdfIncEngines', key: 'engines', label: 'Engine Fleet', checked: true },
            { id: 'pdfIncSV', key: 'shop_visits', label: 'Shop Visit History', checked: true },
            { id: 'pdfIncFH', key: 'flight_hours', label: 'Flight Hours', checked: false },
            { id: 'pdfIncClaims', key: 'claims', label: 'Claims Summary', checked: true },
            { id: 'pdfIncEvents', key: 'events', label: 'Event Entries', checked: true },
        ],
        COMMERCIAL_PLAN: [
            { id: 'pdfIncOverview', key: 'overview', label: 'Overview KPIs', checked: true },
            { id: 'pdfIncActionLog', key: 'action_log', label: 'Action Log', checked: true },
            { id: 'pdfIncPipeline', key: 'pipeline', label: 'SPE Pipeline', checked: true },
            { id: 'pdfIncYearly', key: 'yearly_summary', label: 'Yearly Summary', checked: true },
        ],
        EMPLOYEE_WHEREABOUTS: [
            { id: 'pdfIncOverview', key: 'overview', label: 'Overview & KPIs', checked: true },
            { id: 'pdfIncCountry', key: 'country_breakdown', label: 'Country Breakdown', checked: true },
            { id: 'pdfIncEmployeeList', key: 'employee_list', label: 'Employee List', checked: true },
        ],
        UNKNOWN: [
            { id: 'pdfIncKPIs', key: 'kpis', label: 'Summary', checked: true },
            { id: 'pdfIncSheets', key: 'sheets', label: 'Raw Sheet Tables', checked: true },
        ],
    };

    function _populatePDFModalForType(fileType) {
        const list = document.querySelector('#pdfModalOverlay .pdf-checkbox-list');
        if (!list) return [];
        const cfg = _PDF_SECTIONS_BY_TYPE[fileType] || _PDF_SECTIONS_BY_TYPE.OPPORTUNITY_TRACKER;
        list.innerHTML = cfg.map(s => `
            <label class="pdf-checkbox-item">
                <input type="checkbox" id="${s.id}" data-section-key="${s.key}" ${s.checked ? 'checked' : ''}>
                <span>${_esc(s.label)}</span>
            </label>`).join('');
        // Store the active config for _generateModularPdf
        window.__pdfActiveSections = cfg;
        return cfg;
    }

    async function _exportPdf() {
        if (Object.keys(_filesData).length === 0) {
            RRComponents.showToast('No data to export. Upload files first.', 'error');
            return;
        }

        // Always show the PDF options modal
        const modal = $('pdfModalOverlay');
        if (modal) {
            // Populate sections based on current file type
            const detectedType = Object.values(_filesData).map(d => d.file_type).find(Boolean) || 'UNKNOWN';
            _populatePDFModalForType(detectedType);
            modal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
            return;
        }

        // Fallback for SOA & other types
        RRComponents.showLoading();
        try {
            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_files: Object.keys(_filesData),
                    currency_symbol: 'USD',
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Export failed');
            }

            // Download the PDF
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            let filename = 'Report.pdf';
            const contentDisp = response.headers.get('content-disposition');
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            RRComponents.showToast('PDF report downloaded', 'success');
        } catch (err) {
            RRComponents.showToast(err.message || 'Export failed', 'error');
        } finally {
            RRComponents.hideLoading();
        }
    }

    async function _generateModularPdf() {
        RRComponents.showLoading();
        try {
            // Read dynamically-populated checkboxes via data-section-key
            const sectionsToInclude = [];
            const modalList = document.querySelector('#pdfModalOverlay .pdf-checkbox-list');
            if (modalList) {
                modalList.querySelectorAll('input[type="checkbox"][data-section-key]').forEach(cb => {
                    if (cb.checked) sectionsToInclude.push(cb.dataset.sectionKey);
                });
            }
            // Legacy fallback: if the static IDs still exist & nothing picked up, use them
            if (sectionsToInclude.length === 0) {
                if ($('pdfIncKPIs')?.checked) sectionsToInclude.push('kpis');
                if ($('pdfIncTopOpps')?.checked) sectionsToInclude.push('top_opps');
                if ($('pdfIncEstLevel')?.checked) sectionsToInclude.push('estimation_level');
                if ($('pdfIncTimeline')?.checked) sectionsToInclude.push('timeline');
                if ($('pdfIncOppsThreats')?.checked) sectionsToInclude.push('opps_threats');
                if ($('pdfIncProjSummary')?.checked) sectionsToInclude.push('project_summary');
                if ($('pdfIncCustomer')?.checked) sectionsToInclude.push('customer_breakdown');
            }

            // Auto-detect file type from loaded data
            const detectedType = Object.values(_filesData).map(d => d.file_type).find(Boolean) || 'UNKNOWN';

            let activeFilters = {};
            if (window.RRVisualizer && window.RRVisualizer.getActiveGlobalFilters) {
                activeFilters = window.RRVisualizer.getActiveGlobalFilters();
            }

            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_files: Object.keys(_filesData),
                    file_type: detectedType,
                    sections_to_include: sectionsToInclude,
                    filters: activeFilters,
                    currency_symbol: '$'
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Export failed');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            let filename = 'Opportunity_Tracker_Report.pdf';
            const contentDisp = response.headers.get('content-disposition');
            if (contentDisp && contentDisp.includes('filename=')) {
                filename = contentDisp.split('filename=')[1].replace(/"/g, '');
            }
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            RRComponents.showToast('Modular PDF report generated', 'success');
        } catch (err) {
            RRComponents.showToast(err.message || 'Modular Export failed', 'error');
        } finally {
            RRComponents.hideLoading();
        }
    }


    // ═══════════════════════════════════════════
    // PRESENTATION NAV
    // ═══════════════════════════════════════════

    function _bindPresentationNav() {
        const prevBtn = $('presPrev');
        const nextBtn = $('presNext');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (_presSlide > 0) { _presSlide--; _presRenderCurrentSlide(); }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (_presSlide < _presSlides.length - 1) { _presSlide++; _presRenderCurrentSlide(); }
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (_currentView !== 'presentation') return;
            if (e.key === 'ArrowLeft' && _presSlide > 0) { _presSlide--; _presRenderCurrentSlide(); }
            if (e.key === 'ArrowRight' && _presSlide < _presSlides.length - 1) { _presSlide++; _presRenderCurrentSlide(); }
        });
    }


    // ═══════════════════════════════════════════
    // WELCOME UPLOAD
    // ═══════════════════════════════════════════

    function _bindWelcomeUpload() {
        const btn = $('welcomeUploadBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                const input = $('fileInput');
                if (input) input.click();
            });
        }
    }


    // ═══════════════════════════════════════════
    // GSAP ANIMATIONS
    // ═══════════════════════════════════════════

    function _animatePageLoad() {
        if (typeof gsap === 'undefined') return;

        gsap.registerPlugin(ScrollTrigger);

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // Header sweep in
        tl.from('.dashboard-header', {
            opacity: 0,
            y: -30,
            duration: 0.6,
        });

        // Header content stagger
        tl.from('.header-title', { opacity: 0, y: 15, duration: 0.4 }, '-=0.3');
        tl.from('.header-subtitle', { opacity: 0, y: 10, duration: 0.3 }, '-=0.2');
        tl.from('.header-logo-mark', { opacity: 0, x: 20, duration: 0.3 }, '-=0.3');
        tl.from('.header-breadcrumb', { opacity: 0, y: 8, duration: 0.3 }, '-=0.15');

        // Sidebar slide in
        tl.from('.sidebar', {
            x: -40,
            opacity: 0,
            duration: 0.5,
            ease: 'power3.out',
        }, '-=0.4');

        // Sidebar children stagger
        tl.from('.sidebar-logo, .sidebar-section, .sidebar-divider', {
            opacity: 0,
            x: -15,
            duration: 0.3,
            stagger: 0.05,
        }, '-=0.2');

        // Welcome state
        tl.from('.welcome-hero', { opacity: 0, y: 30, duration: 0.5 }, '-=0.1');
        tl.from('.welcome-feature-card', {
            opacity: 0,
            y: 20,
            duration: 0.4,
            stagger: 0.1,
        }, '-=0.2');
    }

    function _animateDashboardContent() {
        if (typeof gsap === 'undefined') return;

        // Animate customer info
        gsap.utils.toArray('.customer-card.gsap-hidden').forEach(el => {
            gsap.to(el, {
                opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'all',
                onComplete: () => el.classList.remove('gsap-hidden')
            });
        });

        // Cascade KPI cards
        const kpiCards = gsap.utils.toArray('.kpi-card.gsap-hidden');
        kpiCards.forEach((card, i) => {
            gsap.to(card, {
                opacity: 1, y: 0, duration: 0.5, delay: i * 0.08,
                ease: 'power3.out', clearProps: 'all',
                onComplete: () => card.classList.remove('gsap-hidden'),
            });
        });

        // Credit bar
        gsap.utils.toArray('.credit-bar.gsap-hidden').forEach(el => {
            gsap.to(el, {
                opacity: 1, y: 0, duration: 0.4, delay: 0.5, ease: 'power3.out', clearProps: 'all',
                onComplete: () => el.classList.remove('gsap-hidden')
            });
        });

        // Debt card
        gsap.utils.toArray('.debt-card.gsap-hidden').forEach(el => {
            gsap.to(el, {
                opacity: 1, y: 0, duration: 0.5, delay: 0.3, ease: 'power3.out', clearProps: 'all',
                onComplete: () => el.classList.remove('gsap-hidden')
            });
        });

        // ScrollTrigger for chart sections
        gsap.utils.toArray('.chart-section, .export-section').forEach(section => {
            gsap.from(section, {
                scrollTrigger: {
                    trigger: section,
                    start: 'top 85%',
                    once: true,
                },
                opacity: 0,
                y: 30,
                duration: 0.6,
                ease: 'power3.out',
            });
        });

        // Chart cards stagger within each section
        gsap.utils.toArray('.chart-grid').forEach(grid => {
            const cards = grid.querySelectorAll('.chart-card');
            gsap.from(cards, {
                scrollTrigger: {
                    trigger: grid,
                    start: 'top 80%',
                    once: true,
                },
                opacity: 0,
                y: 20,
                scale: 0.97,
                duration: 0.5,
                stagger: 0.1,
                ease: 'power3.out',
            });
        });

        // Section header pills
        gsap.utils.toArray('.section-header-pill').forEach(pill => {
            gsap.from(pill, {
                scrollTrigger: {
                    trigger: pill,
                    start: 'top 90%',
                    once: true,
                },
                opacity: 0,
                x: -20,
                duration: 0.4,
                ease: 'power3.out',
            });
        });
    }


    // ═══════════════════════════════════════════
    // PUBLIC: Merge parsed data from external source (e.g. R2 parse)
    // ═══════════════════════════════════════════

    function mergeUploadResponse(data) {
        // Same merge logic as _uploadFiles success path
        Object.assign(_filesData, data.files || {});
        _renderFileChips();

        // Rebuild _allItems
        _allItems = [];
        Object.entries(_filesData).forEach(([fname, fdata]) => {
            if (fdata.file_type) {
                if (fdata.sections && Array.isArray(fdata.sections)) {
                    fdata.sections.forEach(sec => {
                        (sec.items || []).forEach(item => {
                            _allItems.push({ ...item, _source: fname, _section: sec.name });
                        });
                    });
                }
                if (fdata.items && Array.isArray(fdata.items)) {
                    fdata.items.forEach(item => {
                        _allItems.push({ ...item, _source: fname });
                    });
                }
            } else if (fdata.all_items) {
                (fdata.all_items || []).forEach(item => {
                    _allItems.push({ ...item, _source: fname });
                });
            }
        });

        _showDashboard();
    }


    // ─── Public API ───
    return { init, mergeUploadResponse };
})();


// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    RRApp.init();
});

    window.RRApp = RRApp;
  })();

})();
