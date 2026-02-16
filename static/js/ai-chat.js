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

        try {
            _log('api', 'POST /api/chat — connecting to OpenRouter AI...');

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            if (!response.ok) {
                const err = await response.json();
                _log('error', `API error (${response.status}): ${err.error || 'Unknown'}`);
                throw new Error(err.error || 'Chat request failed');
            }

            _log('receive', `Response received in ${elapsed}s — parsing...`);

            const data = await response.json();

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
