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
