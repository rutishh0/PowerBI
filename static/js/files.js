/**
 * Rolls-Royce SOA Dashboard — Files Module
 * Handles password-protected file viewing and downloading.
 */

const FilesModule = (() => {
    'use strict';

    // ─── Constants ───
    const PASSWORD = 'ChickenMan123'; // Same as Secret Chat
    const ENDPOINT_FILES = '/api/files';

    // ─── State ───
    let _isAuthenticated = false;

    // ─── DOM Elements ───
    const $ = (id) => document.getElementById(id);

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        console.log('Files Module Loaded');
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

        // Global listener for view change
        // We rely on app.js handling the main container switch.
        // But we need to check auth when "Files" view becomes active.
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
            }
        } else {
            // Not authenticated
            if (lockState) lockState.style.display = 'flex';
            if (listState) listState.style.display = 'none';
        }
    }

    // ═══════════════════════════════════════════
    // DATA HANDLING
    // ═══════════════════════════════════════════

    async function _fetchFiles() {
        const tbody = $('filesTableBody');
        if (!tbody) return;

        // Show loading state?
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

            // Format date
            const date = new Date(file.upload_date);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Format size
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
                    <a href="/api/files/${file.id}" target="_blank" class="btn-ghost btn-sm" title="Download">
                        <i data-lucide="download"></i> Download
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Initialize icons
        if (window.lucide) lucide.createIcons();
    }

    // ═══════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);

    return { init };

})();
