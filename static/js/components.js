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
