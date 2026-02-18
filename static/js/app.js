/**
 * Rolls-Royce SOA Dashboard — Main Application Controller
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

        // Filter valid files
        for (const file of fileList) {
            if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.pptx')) {
                validFiles.push(file);
            }
        }

        if (validFiles.length === 0) {
            RRComponents.showToast('Please upload .xlsx or .pptx files only', 'error');
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

            // Merge all items
            _allItems = [];
            Object.entries(_filesData).forEach(([fname, fdata]) => {
                (fdata.all_items || []).forEach(item => {
                    _allItems.push({ ...item, _source: fname });
                });
            });

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

        let html = '';
        Object.keys(_filesData).forEach(fname => {
            html += `
                <div class="file-chip">
                    <svg class="file-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span class="file-chip-name" title="${fname}">${fname}</span>
                </div>`;
        });
        container.innerHTML = html;
    }


    // ═══════════════════════════════════════════
    // DASHBOARD RENDERING
    // ═══════════════════════════════════════════

    function _showDashboard() {
        const welcome = $('welcomeState');
        const content = $('dashboardContent');
        const presContainer = $('presentationContainer');
        const compContainer = $('comparisonContainer');
        const filesContainer = $('filesContainer');
        const aiContainer = $('aiChatContainer');

        if (welcome) welcome.style.display = 'none';

        // Hide all view containers first
        if (content) content.style.display = 'none';
        if (presContainer) presContainer.style.display = 'none';
        if (compContainer) compContainer.style.display = 'none';
        if (filesContainer) filesContainer.style.display = 'none';
        if (aiContainer) aiContainer.style.display = 'none';

        // Render based on current view
        switch (_currentView) {
            case 'standard':
                if (content) content.style.display = 'block';
                _renderStandardView();
                break;
            case 'executive':
                if (content) content.style.display = 'block';
                _renderExecutiveView();
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

        // Initialize sidebar filters
        RRComponents.renderSidebarFilters(_allItems);

        // Refresh Lucide icons for new DOM
        if (window.lucide) lucide.createIcons();

        // Animate new content
        _animateDashboardContent();
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
                if (Object.keys(_filesData).length > 0) _showDashboard();
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
        // Listen for filter changes
        document.addEventListener('change', (e) => {
            if (e.target.matches('[data-filter]')) {
                _onFiltersChanged();
            }
        });

        // Reset filters
        const resetBtn = $('filterResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.querySelectorAll('[data-filter]').forEach(cb => { cb.checked = true; });
                _onFiltersChanged();
            });
        }
    }

    function _onFiltersChanged() {
        // Update filter badge
        const filters = RRComponents.getActiveFilters();
        const total = document.querySelectorAll('[data-filter]').length;
        const checked = document.querySelectorAll('[data-filter]:checked').length;
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
    }

    async function _exportPdf() {
        if (Object.keys(_filesData).length === 0) {
            RRComponents.showToast('No data to export. Upload files first.', 'error');
            return;
        }

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
            a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'SOA_Report.pdf';
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


    // ─── Public API ───
    return { init };
})();


// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    RRApp.init();
});
