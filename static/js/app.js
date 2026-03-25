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

        let html = '';
        Object.entries(_filesData).forEach(([fname, fdata]) => {
            const ft = fdata.file_type || 'UNKNOWN';
            const meta = window.RRVisualizer ? RRVisualizer.getFileTypeMeta(ft) : { label: ft, color: '#10069F' };
            html += `
                <div class="file-chip">
                    <span class="file-chip-type-dot" style="background:${meta.color}"></span>
                    <span class="file-chip-name" title="${fname} (${meta.label})">${fname}</span>
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
                    RRVisualizer.renderVisualizer(_filesData, vizContainer);
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
                'SHOP_VISIT', 'SHOP_VISIT_HISTORY', 'SVRG_MASTER', 'UNKNOWN', 'ERROR'].includes(fdata.file_type);
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

    async function _exportPdf() {
        if (Object.keys(_filesData).length === 0) {
            RRComponents.showToast('No data to export. Upload files first.', 'error');
            return;
        }

        // Always show the PDF options modal
        const modal = $('pdfModalOverlay');
        if (modal) {
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
            const sectionsToInclude = [];
            if ($('pdfIncKPIs')?.checked) sectionsToInclude.push('kpis');
            if ($('pdfIncTopOpps')?.checked) sectionsToInclude.push('top_opps');
            if ($('pdfIncEstLevel')?.checked) sectionsToInclude.push('estimation_level');
            if ($('pdfIncTimeline')?.checked) sectionsToInclude.push('timeline');
            if ($('pdfIncOppsThreats')?.checked) sectionsToInclude.push('opps_threats');
            if ($('pdfIncProjSummary')?.checked) sectionsToInclude.push('project_summary');
            if ($('pdfIncCustomer')?.checked) sectionsToInclude.push('customer_breakdown');

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
