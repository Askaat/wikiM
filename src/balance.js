// ============================================================
// WikiM - Module: Balance & Currency Tracking
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // TRACKING DU SOLDE WIKIBIDOUS
    // ============================================================
    const BALANCE_HISTORY_KEY = 'wmBalanceHistory';
    const BALANCE_MAX_ENTRIES = 500;
    const BALANCE_REFRESH_INTERVAL = 120000;

    function getBalanceHistory() {
        try { return JSON.parse(localStorage.getItem(BALANCE_HISTORY_KEY) || '[]'); }
        catch { return []; }
    }
    function saveBalanceHistory(history) {
        if (history.length > BALANCE_MAX_ENTRIES) history = history.slice(-BALANCE_MAX_ENTRIES);
        localStorage.setItem(BALANCE_HISTORY_KEY, JSON.stringify(history));
    }
    function recordBalance(newBalance, reason = 'unknown') {
        if (typeof newBalance !== 'number') return;
        const history = getBalanceHistory();
        const last = history[history.length - 1];
        if (last && last.balance === newBalance && reason === 'refresh') return;
        const delta = last ? newBalance - last.balance : 0;
        history.push({ timestamp: Date.now(), balance: newBalance, delta, reason });
        saveBalanceHistory(history);
        renderBalanceUI();
        console.log(`[WM] Balance: ${newBalance} WB (delta: ${delta}, reason: ${reason})`);
        if (reason !== 'refresh' && reason !== 'startup' && Math.abs(delta) >= 100) {
            logToPanel(`💰 Solde : ${delta > 0 ? '+' : ''}${delta} WB → ${newBalance} WB`);
        }
    }

    function fetchBalanceFromApi(reason = 'refresh') {
        return new Promise(resolve => {
            if (!W.wmAuth.token || !W.wmAuth.apikey) { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://${SUPABASE_REF}.supabase.co/rest/v1/rpc/get_my_profile`,
                headers: {
                    'apikey': W.wmAuth.apikey,
                    'Authorization': `Bearer ${W.wmAuth.token}`,
                    'Content-Type': 'application/json'
                },
                data: '{}',
                onload: res => {
                    try {
                        if (res.status === 401) { extractTokenFromCookies(); resolve(null); return; }
                        if (res.status !== 200) { resolve(null); return; }
                        const data = JSON.parse(res.responseText);
                        const balance = data?.wikibidous_balance;
                        if (typeof balance === 'number') { recordBalance(balance, reason); resolve(balance); }
                        else resolve(null);
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    setInterval(() => fetchBalanceFromApi('refresh'), BALANCE_REFRESH_INTERVAL);
    setTimeout(() => fetchBalanceFromApi('startup'), 3000);

    function getBalanceStats() {
        const history = getBalanceHistory();
        if (history.length === 0) return null;
        const current = history[history.length - 1].balance;
        const now = Date.now();
        const oneDayAgo = now - 24 * 3600 * 1000;
        const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
        const points24h = history.filter(e => e.timestamp >= oneDayAgo);
        const delta24h = points24h.length > 0 ? current - points24h[0].balance : 0;
        const points7d = history.filter(e => e.timestamp >= sevenDaysAgo);
        const delta7d = points7d.length > 0 ? current - points7d[0].balance : 0;
        return { current, delta24h, delta7d, history };
    }

    function renderBalanceSparkline(history) {
        const points = history.slice(-50);
        if (points.length < 2) return '';
        const balances = points.map(p => p.balance);
        const min = Math.min(...balances);
        const max = Math.max(...balances);
        const range = max - min || 1;
        const width = 320, height = 60;
        const stepX = width / (points.length - 1);
        const pathPoints = points.map((p, i) => {
            const x = i * stepX;
            const y = height - ((p.balance - min) / range) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const pathD = 'M' + pathPoints.join(' L');
        const areaD = pathD + ` L${width},${height} L0,${height} Z`;
        const trending = points[points.length - 1].balance >= points[0].balance;
        const color = trending ? '#10b981' : '#ef4444';
        const gradientId = 'wm-spark-grad-' + Date.now();
        return `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: 60px; display: block;">
                <defs>
                    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
                        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <path d="${areaD}" fill="url(#${gradientId})" />
                <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
        `;
    }

    function renderBalanceUI() {
        const container = document.getElementById('wm-balance-content');
        if (!container) return;
        const stats = getBalanceStats();
        if (!stats) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucune donnée.<br>Attends quelques instants, le solde sera chargé automatiquement.</div>';
            return;
        }
        const { current, delta24h, delta7d, history } = stats;
        const delta24hClass = delta24h > 0 ? 'up' : (delta24h < 0 ? 'down' : 'flat');
        const delta7dClass = delta7d > 0 ? 'up' : (delta7d < 0 ? 'down' : 'flat');
        const delta24hStr = (delta24h > 0 ? '+' : '') + delta24h;
        const delta7dStr = (delta7d > 0 ? '+' : '') + delta7d;
        const variations = history.filter(e => e.delta !== 0).slice(-15).reverse();
        container.innerHTML = `
            <div class="wm-balance-card">
                <div class="wm-balance-current">
                    <span class="wm-balance-icon">💰</span>
                    <span class="wm-balance-value">${current}</span>
                    <span class="wm-balance-unit">WB</span>
                </div>
                <div class="wm-balance-deltas">
                    <div class="wm-balance-delta ${delta24hClass}">
                        <span class="wm-balance-delta-label">24h</span>
                        <span class="wm-balance-delta-value">${delta24hStr}</span>
                    </div>
                    <div class="wm-balance-delta ${delta7dClass}">
                        <span class="wm-balance-delta-label">7j</span>
                        <span class="wm-balance-delta-value">${delta7dStr}</span>
                    </div>
                </div>
            </div>
            <div class="wm-balance-chart">${renderBalanceSparkline(history)}</div>
            <div class="wm-section-title">Dernières variations</div>
            <div class="wm-balance-list">
                ${variations.length === 0
                    ? '<div class="wm-tracked-empty">Aucune variation enregistrée.</div>'
                    : variations.map(v => {
                        const date = new Date(v.timestamp);
                        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        const sign = v.delta > 0 ? '+' : '';
                        const cls = v.delta > 0 ? 'up' : 'down';
                        return `
                            <div class="wm-balance-entry">
                                <span class="wm-balance-entry-date">${dateStr}</span>
                                <span class="wm-balance-entry-delta ${cls}">${sign}${v.delta}</span>
                                <span class="wm-balance-entry-balance">${v.balance}</span>
                            </div>
                        `;
                    }).join('')
                }
            </div>
            <button id="wm-balance-refresh-btn" class="wm-panel-btn" style="width: 100%; margin-top: 8px;">🔄 Rafraîchir maintenant</button>
            <button id="wm-cache-fill-btn" class="wm-panel-btn" style="flex:1;" title="Ajoute les cartes de la page actuelle au cache sans tout rescanner">📥 Remplir la page</button>
        `;
        const refreshBtn = document.getElementById('wm-balance-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳ Chargement...';
                const b = await fetchBalanceFromApi('manual');
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 Rafraîchir maintenant';
                if (b === null) logToPanel('❌ Échec du rafraîchissement');
                else logToPanel(`💰 Solde rafraîchi : ${b} WB`);
            });
        }
    }


    window.BALANCE_HISTORY_KEY = BALANCE_HISTORY_KEY;

    // --- Cross-module exports ---
    if (typeof getBalanceHistory !== 'undefined') { window.getBalanceHistory = getBalanceHistory; window.WikiM.getBalanceHistory = getBalanceHistory; }
    if (typeof saveBalanceHistory !== 'undefined') { window.saveBalanceHistory = saveBalanceHistory; window.WikiM.saveBalanceHistory = saveBalanceHistory; }
    if (typeof recordBalance !== 'undefined') { window.recordBalance = recordBalance; window.WikiM.recordBalance = recordBalance; }
    if (typeof fetchBalanceFromApi !== 'undefined') { window.fetchBalanceFromApi = fetchBalanceFromApi; window.WikiM.fetchBalanceFromApi = fetchBalanceFromApi; }
    if (typeof getBalanceStats !== 'undefined') { window.getBalanceStats = getBalanceStats; window.WikiM.getBalanceStats = getBalanceStats; }
    if (typeof renderBalanceSparkline !== 'undefined') { window.renderBalanceSparkline = renderBalanceSparkline; window.WikiM.renderBalanceSparkline = renderBalanceSparkline; }
    if (typeof renderBalanceUI !== 'undefined') { window.renderBalanceUI = renderBalanceUI; window.WikiM.renderBalanceUI = renderBalanceUI; }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
