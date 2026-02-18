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

        _bindUpload();

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
