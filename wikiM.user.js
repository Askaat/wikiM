(function() {
    'use strict';

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // Expose les APIs GM pour le debug depuis la console
    W.wmGmXhr = GM_xmlhttpRequest;

    // ============================================================
    // ÉTAT GLOBAL
    // ============================================================
    const WM_PATCH_NOTES = [
        {
            version: "2.1.7",
            date: "01/10/2026 - 23:21",
            changes: [
                "Ajout du raccourci 'O' lors de l'ouverture d'un pack (Inverse de 'I', ça retourne en arrière et coche la case bulk)\nFix du bouton espace dans un tirage qui appuyait sur continuer qd on était en plein milieu du pack\nAjout des tags ajoutés automatiquement sur les cartes (ça met du temps à load)"
            ]
        },
        {
            version: "2.1.6",
            date: "30/09/2026 - 12:30",
            changes: [
                "Ajout de groupes de règles et une fonction d'export/import"
            ]
        },
        {
            version: "2.1.5",
            date: "29/09/2026 - 15:30",
            changes: [
                "Fix des routines de trade + Ajout du tag auto lors des tirages + Fix de montant fantôme lors des tirages"
            ]
        },
        {
            version: "2.1.0",
            date: "29/09/2026 - 09:50",
            changes: [
                "Ajout des routines de trade !"
            ]
        },
        {
            version: "2.0.0",
            date: "29/09/2026 - 08:45",
            changes: [
                "Ajout de l'onglet Patch Notes avec historique.",
                "Ajout des MàJ automatique via github",
                "Ajout du changement de pages avec les flèches dans la collection (des fois ça déconne un peu)",
                "Raccourci CTRL+I transformé juste en I"
            ]
        }
    ]

    window.wmAuth = window.wmAuth || { apikey: "", token: "" };
    window.wmPrices = {};
    window.wmFetching = new Set();
    window.wmProcessedCards = new Set();
    window.wmPendingCardTitle = null;
    window.wmInventoryMap = {};
    window.wmUserId = null;
    window._wmMutating = false;

    window.wmTagScanState = {
        running: false,
        paused: false,
        cancelled: false,
        phase: 'idle',      // 'idle' | 'loading-collection' | 'computing' | 'checking' | 'applying'
        mode: 'full',       // 'full' | 'page'
        progress: { current: 0, total: 0, text: '' },
        preview: null,      // { toAdd, toRemove }
        startedAt: 0
    };

    // ============================================================
    // SMART TRADES (Routines sauvegardées)
    // ============================================================
    function getSmartTrades() {
        try { return JSON.parse(localStorage.getItem('wmSmartTrades') || '[]'); }
        catch { return []; }
    }
    function saveSmartTrades(trades) {
        localStorage.setItem('wmSmartTrades', JSON.stringify(trades));
    }

    // ============================================================
    // CACHE PRIX (nouvelle structure allégée)
    // ============================================================
    const WM_PRICE_DATA_KEY = 'wmPriceData';
    const WM_PRICE_TS_KEY = 'wmPriceTs';

    window.wmPrices = {}; // { title: {L: 100, UR: 500} | "EMPTY" | "ERROR" }
    window.wmPriceTimestamps = {}; // { title: 1790198922000 }

    function wmLoadPriceCache() {
        try {
            const dataRaw = localStorage.getItem(WM_PRICE_DATA_KEY);
            const tsRaw = localStorage.getItem(WM_PRICE_TS_KEY);
            if (dataRaw) {
                const data = JSON.parse(dataRaw);
                for (const [k, v] of Object.entries(data)) window.wmPrices[k] = v;
            }
            if (tsRaw) {
                const ts = JSON.parse(tsRaw);
                for (const [k, v] of Object.entries(ts)) window.wmPriceTimestamps[k] = v;
            }
            console.log(`[WM-Price] ${Object.keys(window.wmPrices).length} prix chargés`);
        } catch (e) {
            console.warn('[WM-Price] Erreur chargement:', e);
        }
    }

    function wmSavePriceToCache(title, data) {
        if (data === "LOADING" || data === "ERROR") return;

        // Compresse : { L: {average: 100} } → { L: 100 }
        let compressed = data;
        if (data && typeof data === 'object') {
            compressed = {};
            for (const [rarity, val] of Object.entries(data)) {
                if (val && typeof val.average === 'number') {
                    compressed[rarity] = val.average;
                }
            }
        }

        window.wmPrices[title] = compressed;
        window.wmPriceTimestamps[title] = Date.now();

        // Sauvegarde data
        try {
            const existing = JSON.parse(localStorage.getItem(WM_PRICE_DATA_KEY) || '{}');
            existing[title] = compressed;
            localStorage.setItem(WM_PRICE_DATA_KEY, JSON.stringify(existing));
        } catch (e) { console.warn('[WM-Price] save data échoué:', e); }

        // Sauvegarde ts
        try {
            const existing = JSON.parse(localStorage.getItem(WM_PRICE_TS_KEY) || '{}');
            existing[title] = Date.now();
            localStorage.setItem(WM_PRICE_TS_KEY, JSON.stringify(existing));
        } catch (e) { console.warn('[WM-Price] save ts échoué:', e); }
    }

    /**
 * Renvoie le prix moyen d'une carte pour SA rareté possédée.
 * @param {string} title
 * @param {string} rarity
 * @returns {number|null}
 */
    function wmGetPriceFor(title, rarity) {
        const p = window.wmPrices[title];
        if (!p || typeof p !== 'object') return null;
        const v = p[rarity];
        return typeof v === 'number' ? v : null;
    }

    const userCardIdCache = new Map();

    // ============================================================
    // CAPTURE TOKEN + APIKEY (dynamique)
    // ============================================================
    const SUPABASE_REF = 'cyrxjeppjqsxxjayfrur';
    const SUPABASE_APIKEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg';

    W.wmAuth = {
        apikey: SUPABASE_APIKEY_FALLBACK,
        token: null,
        userId: null,
        ref: SUPABASE_REF
    };

    function decodeJwt(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        } catch { return null; }
    }

    const _origFetchForAuth = W.fetch;
    W.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const opts = args[1] || {};
        if (url.includes('supabase.co') && opts.headers) {
            const h = opts.headers;
            const apikey = h.apikey || h.Apikey || h['X-Api-Key'];
            const auth = h.Authorization || h.authorization;

            if (apikey && typeof apikey === 'string' && apikey.length > 100 && apikey !== W.wmAuth.apikey) {
                W.wmAuth.apikey = apikey;
                console.log('[WM] Apikey mise à jour depuis le trafic');
            }
            if (auth && auth.startsWith('Bearer ')) {
                const candidate = auth.slice(7);
                if (candidate.length >= 500) {
                    const claims = decodeJwt(candidate);
                    if (claims && claims.sub && W.wmAuth.token !== candidate) {
                        W.wmAuth.token = candidate;
                        W.wmAuth.userId = claims.sub;
                        W.wmUserId = claims.sub;
                        console.log('[WM] Token utilisateur capturé, userId:', claims.sub);
                    }
                }
            }
        }
        return _origFetchForAuth.apply(this, args);
    };

    function extractTokenFromCookies() {
        const cookies = document.cookie.split(';').map(c => c.trim());
        const parts = {};
        cookies.forEach(c => {
            const [name, ...rest] = c.split('=');
            if (name.startsWith('sb-') && name.includes('auth-token')) {
                parts[name] = decodeURIComponent(rest.join('='));
            }
        });
        const keys = Object.keys(parts).sort();
        if (keys.length === 0) return false;
        let combined = keys.map(k => parts[k]).join('');
        if (combined.startsWith('base64-')) combined = combined.slice(7);
        try {
            const session = JSON.parse(atob(combined));
            if (session?.access_token && session.access_token.length >= 500) {
                const claims = decodeJwt(session.access_token);
                W.wmAuth.token = session.access_token;
                W.wmAuth.userId = claims?.sub || session.user?.id || null;
                W.wmUserId = W.wmAuth.userId;
                console.log('[WM] Token extrait des cookies, userId:', W.wmUserId);
                return true;
            }
        } catch (e) {
            console.warn('[WM] Échec extraction token cookies:', e);
        }
        return false;
    }

    extractTokenFromCookies();
    setTimeout(() => { if (!W.wmAuth.token) extractTokenFromCookies(); }, 1500);

    W.wmDebug = {
        getAuth: () => W.wmAuth || null,
        getUserId: () => W.wmUserId || null,
        refreshFromCookies: () => extractTokenFromCookies()
    };

    // ============================================================
    // MOTEUR D'AUTO-TAGGING SUPABASE (Intelligent & Anti-CORS)
    // ============================================================
    async function processAutoTags(pulledCards) {
        const isAutoTagEnabled = localStorage.getItem('wmAutoTagEnabled') === 'true';
        if (!isAutoTagEnabled || !pulledCards || pulledCards.length === 0) return;

        try {
            console.log("[WM-Tags] 🏷️ Démarrage de l'Auto-Tagging intelligent...");

            // Récupération de l'ID utilisateur
            const userId = (typeof W !== 'undefined' && W.wmUserId) ? W.wmUserId : window.wmUserId;
            if (!userId) throw new Error("ID utilisateur introuvable.");

            // 1. Récupération des user_card_id physiques
            const physicalCards = await supabaseRequestWithRetry(
                'GET',
                `/rest/v1/user_cards?select=id,card_id&user_id=eq.${userId}&order=obtained_at.desc&limit=${pulledCards.length}`
            );

            if (!physicalCards || !Array.isArray(physicalCards)) throw new Error("Impossible de récupérer les cartes physiques.");

            // 2. Chargement de TES règles avancées
            const activeRules = getFlatRules();

            // 3. Croisement des données et envoi des requêtes
            // 3. Croisement des données et envoi des requêtes
            for (const pc of pulledCards) {
                const physical = physicalCards.find(p => p.card_id === pc.id);
                if (!physical) continue;

                const title = pc.wikipedia_title || pc.title;

                let waitTime = 0;
                while ((!window.wmPrices[title] || window.wmPrices[title] === "LOADING") && waitTime < 80) {
                    await new Promise(r => setTimeout(r, 100));
                    waitTime++;
                }

                // Formatage de la carte avec la Description !
                const cardForEval = {
                    id: pc.id,
                    userCardId: physical.id,
                    title: title,
                    rarity: pc.rarity,
                    category: pc.category,
                    summary: pc.summary || pc.extract || pc.description || ''
                };

                const desiredTagIds = evaluateAllRules(cardForEval, activeRules, window.wmPrices);

                for (const tagId of desiredTagIds) {
                    await supabaseRequestWithRetry('POST', '/rest/v1/user_card_tags', {
                        user_card_id: physical.id,
                        tag_id: tagId
                    });

                    // Récupération des infos du tag
                    const tagObj = window.wmTagsCache.find(t => t.id === tagId);
                    const tagName = tagObj ? tagObj.name : 'Tag';
                    const tagColor = tagObj ? tagObj.color : '#a78bfa';

                    console.log(`[WM-Tags] ✅ Étiquette "${tagName}" appliquée sur ${title}`);

                    // Sauvegarde dans le cache visuel global
                    if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                    if (!window.wmVisualTagsCache[title]) window.wmVisualTagsCache[title] = [];

                    // On évite les doublons visuels
                    if (!window.wmVisualTagsCache[title].some(t => t.id === tagId)) {
                        window.wmVisualTagsCache[title].push({ id: tagId, name: tagName, color: tagColor });
                    }

                    // On force le rafraîchissement immédiat de l'UI
                    if (typeof renderTagsOnAllCards === 'function') renderTagsOnAllCards();

                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        } catch (e) {
            console.error("[WM-Tags] ❌ Erreur d'Auto-Tagging :", e);
        }
    }

    // ============================================================
    // WRAPPER DE RETRY GÉNÉRIQUE
    // ============================================================
    /**
 * Exécute une fonction async avec retry automatique.
 * @param {Function} fn - fonction async à exécuter (retourne une promesse)
 * @param {Object} opts
 *   - retries   : nombre max de tentatives (défaut 4)
 *   - baseDelay : délai initial en ms (défaut 800)
 *   - maxDelay  : plafond du délai (défaut 10000)
 *   - factor    : multiplicateur exponentiel (défaut 2)
 *   - label     : texte pour les logs
 *   - shouldRetry : (error, attempt) => bool  (par défaut : tout sauf erreurs 4xx "client")
 * @returns la valeur retournée par fn
 */
    async function withRetry(fn, opts = {}) {
        const retries = opts.retries ?? 4;
        const baseDelay = opts.baseDelay ?? 800;
        const maxDelay = opts.maxDelay ?? 10000;
        const factor = opts.factor ?? 2;
        const label = opts.label || 'requête';
        const shouldRetry = opts.shouldRetry || ((err, attempt) => {
            // Par défaut : on retry sur erreurs réseau, 5xx, 429, timeouts
            const msg = String(err?.message || err);
            // Erreurs 4xx (sauf 429) → pas de retry
            if (/\b(400|401|403|404|409|422)\b/.test(msg)) return false;
            return true;
        });

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (attempt === retries || !shouldRetry(err, attempt)) {
                    throw err;
                }
                const delay = Math.min(maxDelay, baseDelay * Math.pow(factor, attempt));
                const jitter = Math.random() * 0.3 * delay; // jitter pour éviter les pics synchronisés
                const wait = Math.round(delay + jitter);
                console.warn(`[WM-Retry] ${label} — échec (${err.message}), retry ${attempt + 1}/${retries} dans ${wait}ms`);
                await new Promise(r => setTimeout(r, wait));
            }
        }
        throw lastError;
    }

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

    // ============================================================
    // SNIPER — CONFIGURATION (par enchère)
    // ============================================================
    const SNIPER_PER_AUCTION_KEY = 'wmSniperPerAuction';

    /**
     * Structure : { [auctionId]: { maxBid, trigger, step, enabled } }
     *   maxBid  : plafond de dépense (WB)
     *   trigger : secondes restantes pour commencer à surveiller (ex: 20)
     *   step    : intervalle de re-vérification en secondes (ex: 3)
     *   enabled : sniper actif sur cette enchère
     */
    function getAllSniperConfigs() {
        try { return JSON.parse(localStorage.getItem(SNIPER_PER_AUCTION_KEY) || '{}'); }
        catch { return {}; }
    }
    function saveAllSniperConfigs(cfgs) {
        localStorage.setItem(SNIPER_PER_AUCTION_KEY, JSON.stringify(cfgs));
    }
    function getSniperConfigFor(auctionId) {
        if (!auctionId) return null;
        const all = getAllSniperConfigs();
        return all[auctionId] || { maxBid: 100, trigger: 20, step: 3, enabled: false };
    }
    function setSniperConfigFor(auctionId, patch) {
        if (!auctionId) return;
        const all = getAllSniperConfigs();
        const current = all[auctionId] || { maxBid: 100, trigger: 20, step: 3, enabled: false };
        all[auctionId] = { ...current, ...patch };
        saveAllSniperConfigs(all);
    }

    // État runtime par enchère
    const sniperRuntime = {};
    function getSniperRuntime(auctionId) {
        if (!sniperRuntime[auctionId]) {
            sniperRuntime[auctionId] = {
                lastBidAt: 0,
                lastCheckAt: 0,
                inFlight: false,
                lastStatus: 'idle',
                bidCount: 0
            };
        }
        return sniperRuntime[auctionId];
    }

    /** Formule officielle du site : max(ceil(1.1 * current_bid), current_bid + 1) */
    function getMinBid(auction) {
        if (auction.current_bid === null || auction.current_bid === undefined) {
            return auction.base_amount;
        }
        return Math.max(Math.ceil(1.1 * auction.current_bid), auction.current_bid + 1);
    }

    /** POST direct sur la route de mise. */
    async function placeBid(auctionId, amount) {
        try {
            const r = await fetch(`/api/marketplace/${auctionId}/bid`, {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ amount })
            });
            let data = null;
            try { data = await r.json(); } catch {}
            if (!r.ok) {
                return { ok: false, data: null, error: (data && data.error) || `HTTP ${r.status}` };
            }
            return { ok: true, data, error: null };
        } catch (e) {
            return { ok: false, data: null, error: e.message || 'network error' };
        }
    }

    // ============================================================
    // SNIPER — UI IN-PAGE
    // ============================================================

    function injectSniperPanel() {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        // Retire l'ancien panneau (au cas où on change d'enchère sans recharger)
        const old = document.getElementById('wm-sniper-panel');
        if (old) old.remove();

        const cfg = getSniperConfigFor(auctionId);

                // Trouve le <h2> "Historique des mises"
        const h2Hist = Array.from(document.querySelectorAll('h2')).find(h =>
            /historique\s+des\s+mises/i.test(h.textContent || '')
        );

        // Si on ne trouve pas le h2, on abandonne (ne devrait pas arriver sur cette page)
        if (!h2Hist) {
            console.warn('[WM-Sniper] Impossible de trouver "Historique des mises"');
            return;
        }

        // Le parent du h2 contient h2 + ul (le bloc "Historique")
        // Le grand-parent (avec max-w-4xl) contient tout le contenu de la page d'enchère
        // On veut insérer le panneau APRÈS le bloc Historique, dans le grand-parent
        const historiqueBlock = h2Hist.parentElement;
        const contentContainer = historiqueBlock.parentElement;

        if (!contentContainer) {
            console.warn('[WM-Sniper] Parent introuvable');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'wm-sniper-panel';
        panel.className = 'wm-sniper-panel';
        panel.dataset.auctionId = auctionId;
        panel.innerHTML = `
            <div class="wm-sniper-header">
                <span class="wm-sniper-title">🎯 Sniper d'enchère</span>
                <label class="wm-sniper-toggle">
                    <input type="checkbox" id="wm-sniper-enabled" ${cfg.enabled ? 'checked' : ''}>
                    <span>Activer</span>
                </label>
            </div>
            <div class="wm-sniper-body">
                <div class="wm-sniper-row">
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-max">Mise max (WB)</label>
                        <input type="number" id="wm-sniper-max" min="1" step="1" value="${cfg.maxBid}" disabled>
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-trigger">Trigger (s)</label>
                        <input type="number" id="wm-sniper-trigger" min="1" max="600" step="1" value="${cfg.trigger}" disabled>
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-step">Pas (s)</label>
                        <input type="number" id="wm-sniper-step" min="1" max="60" step="1" value="${cfg.step}" disabled>
                    </div>
                </div>
                <div class="wm-sniper-status" id="wm-sniper-status">
                    <span class="wm-sniper-status-dot" id="wm-sniper-dot"></span>
                    <span id="wm-sniper-status-text">Inactif</span>
                </div>
                <div class="wm-sniper-meta" id="wm-sniper-meta"></div>
            </div>
        `;

        // Insertion APRÈS le bloc Historique, dans le conteneur max-w-4xl
        contentContainer.insertBefore(panel, historiqueBlock.nextSibling);

        document.getElementById('wm-sniper-enabled').addEventListener('change', async e => {
            if (e.target.checked) {
                const auction = await fetchAuctionDetails(auctionId);
                if (auction) {
                    setSniperConfigFor(auctionId, { enabled: true, endAt: auction.end_at });
                } else {
                    setSniperConfigFor(auctionId, { enabled: true });
                }
            } else {
                setSniperConfigFor(auctionId, { enabled: false });
            }

            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            rt.lastStatus = e.target.checked ? 'waiting' : 'idle';
            updateSniperStatusUI();
            logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${auctionId.slice(0, 8)}`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-max').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { maxBid: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Mise max : ${v} WB`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-trigger').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { trigger: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Trigger : ${v}s`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-step').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { step: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Pas : ${v}s`);
            renderTrackedAuctions();
        });

        updateSniperStatusUI();
    }

    /** Synchronise les inputs du panneau in-page avec la config en localStorage. */
    function syncSniperPanelFromConfig() {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        const panel = document.getElementById('wm-sniper-panel');
        if (!panel) return;
        const cfg = getSniperConfigFor(auctionId);

        const enabledEl = document.getElementById('wm-sniper-enabled');
        const maxEl = document.getElementById('wm-sniper-max');
        const trigEl = document.getElementById('wm-sniper-trigger');
        const stepEl = document.getElementById('wm-sniper-step');
        if (enabledEl && enabledEl.checked !== cfg.enabled) enabledEl.checked = cfg.enabled;
        if (maxEl && parseInt(maxEl.value, 10) !== cfg.maxBid) maxEl.value = cfg.maxBid;
        if (trigEl && parseInt(trigEl.value, 10) !== cfg.trigger) trigEl.value = cfg.trigger;
        if (stepEl && parseInt(stepEl.value, 10) !== cfg.step) stepEl.value = cfg.step;
    }

    function updateSniperStatusUI() {
        const statusText = document.getElementById('wm-sniper-status-text');
        const dot = document.getElementById('wm-sniper-dot');
        const meta = document.getElementById('wm-sniper-meta');
        if (!statusText || !dot) return;

        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        const cfg = getSniperConfigFor(auctionId);
        const rt = getSniperRuntime(auctionId);

        let label = 'Inactif';
        let color = '#6b7280';

        if (cfg.enabled) {
            switch (rt.lastStatus) {
                case 'waiting':
                    label = `En attente (déclenche à ${cfg.trigger}s)`;
                    color = '#fbbf24';
                    break;
                case 'watching':
                    label = 'Surveillance active';
                    color = '#10b981';
                    break;
                case 'leader':
                    label = 'Tu es meneur ✓';
                    color = '#10b981';
                    break;
                case 'bidding':
                    label = 'Mise en cours...';
                    color = '#3b82f6';
                    break;
                case 'max_reached':
                    label = `Mise max atteinte (${cfg.maxBid} WB)`;
                    color = '#ef4444';
                    break;
                case 'error':
                    label = 'Erreur';
                    color = '#ef4444';
                    break;
                default:
                    label = 'Actif';
                    color = '#10b981';
            }
        }

        statusText.textContent = label;
        dot.style.background = color;

        if (meta) {
            meta.textContent = `Mises effectuées : ${rt.bidCount}${rt.lastBidAt ? ' • dernière ' + new Date(rt.lastBidAt).toLocaleTimeString('fr-FR') : ''}`;
        }
    }

    // ============================================================
    // SNIPER — BOUCLE PRINCIPALE
    // ============================================================
    setInterval(async () => {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;

        const cfg = getSniperConfigFor(auctionId);
        if (!cfg || !cfg.enabled || !cfg.endAt) return;

        const rt = getSniperRuntime(auctionId);
        if (rt.inFlight) return;

        const endMs = new Date(cfg.endAt).getTime();
        const secondsLeft = Math.floor((endMs - Date.now()) / 1000);

        // AVANT LE TRIGGER → aucune requête, on attend
        if (secondsLeft > cfg.trigger) {
            if (rt.lastStatus !== 'waiting') {
                rt.lastStatus = 'waiting';
                updateSniperStatusUI();
            }
            return;
        }

        if (secondsLeft <= 0) {
            if (rt.lastStatus !== 'idle') {
                rt.lastStatus = 'idle';
                updateSniperStatusUI();
            }
            return;
        }

        // DANS LA FENÊTRE DE TIR → on fetch + on agit
        const now = Date.now();
        if (now - rt.lastCheckAt < cfg.step * 1000) return;
        rt.lastCheckAt = now;

        const auction = await fetchAuctionDetails(auctionId);
        if (!auction || auction.status !== 'active') {
             const fresh = await fetchAuctionDetails(auctionId);
             if (fresh && fresh.end_at) {
                 setSniperConfigFor(auctionId, { endAt: fresh.end_at });
             }
             return;
        }

        if (auction.end_at !== cfg.endAt) {
            setSniperConfigFor(auctionId, { endAt: auction.end_at });
        }

        const myUserId = W.wmAuth.userId;
        if (!myUserId) {
            rt.lastStatus = 'error';
            updateSniperStatusUI();
            return;
        }

        const isLeader = auction.current_bidder_id === myUserId;
        if (isLeader) {
            rt.lastStatus = 'leader';
            updateSniperStatusUI();
            return;
        }

        const minBid = getMinBid(auction);
        if (minBid > cfg.maxBid) {
            rt.lastStatus = 'max_reached';
            updateSniperStatusUI();
            logToPanel(`🎯 Sniper STOP : mise min ${minBid} > max ${cfg.maxBid}`);
            return;
        }

        if (now - rt.lastBidAt < 2000) return;

        rt.inFlight = true;
        rt.lastStatus = 'bidding';
        updateSniperStatusUI();
        logToPanel(`🎯 SNIPE à ${secondsLeft}s : mise ${minBid} WB`);

        const result = await placeBid(auctionId, minBid);
        rt.inFlight = false;

        if (result.ok) {
            rt.lastBidAt = Date.now();
            rt.bidCount++;
            logToPanel(`✅ Mise acceptée : ${minBid} WB (total: ${rt.bidCount})`);
            if (result.data && typeof result.data.bidder_balance === 'number') {
                recordBalance(result.data.bidder_balance, 'bid');
            }
            rt.lastStatus = 'watching';

            setTimeout(async () => {
                const updatedAuction = await fetchAuctionDetails(auctionId);
                if (updatedAuction && updatedAuction.end_at !== cfg.endAt) {
                    setSniperConfigFor(auctionId, { endAt: updatedAuction.end_at });
                }
            }, 500);

        } else {
            logToPanel(`❌ Mise refusée : ${result.error}`);
            rt.lastStatus = 'error';
        }
        updateSniperStatusUI();
    }, 1000);

    // ============================================================
    // PRÉFÉRENCES ET RAPPELS
    // ============================================================
    const DEFAULT_PREFS = {
        browser: true, toast: true, sound: false, siteNotifs: true,
        refreshInterval: 30, defaultTriggerBefore: 60
    };
    function getPrefs() {
        try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('wmNotifPrefs') || '{}') }; }
        catch { return { ...DEFAULT_PREFS }; }
    }
    function savePrefs(p) { localStorage.setItem('wmNotifPrefs', JSON.stringify(p)); }
    function getReminders() {
        try { return JSON.parse(localStorage.getItem('wmAuctionReminders') || '{}'); } catch { return {}; }
    }
    function saveReminders(r) { localStorage.setItem('wmAuctionReminders', JSON.stringify(r)); }
    function getBulkList() {
        try { return JSON.parse(localStorage.getItem('wmBulkList') || '[]'); } catch(e) { return []; }
    }
    function saveBulkList(list) { localStorage.setItem('wmBulkList', JSON.stringify(list)); }

    function getMenuPosition() {
        try { return JSON.parse(localStorage.getItem('wmMenuPosition') || 'null'); }
        catch { return null; }
    }
    function saveMenuPosition(pos) {
        localStorage.setItem('wmMenuPosition', JSON.stringify(pos));
    }

    // ============================================================
    // STYLE CSS
    // ============================================================
    GM_addStyle(`
        /* ===== Boutons d'action sur cartes (uniquement /pulls) ===== */
        .wm-actions-wrapper { position: absolute; top: 10px; right: 10px; z-index: 50; display: flex; flex-direction: column; gap: 8px; }
        .wm-action-btn { color: white; border: none; border-radius: 8px; padding: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); user-select: none; }
        .wm-action-btn svg { width: 18px; height: 18px; }
        .wm-btn-discard { background-color: rgba(220, 38, 38, 0.9); } .wm-btn-discard:hover:not(:disabled) { background-color: rgba(239, 68, 68, 1); transform: scale(1.1); }
        .wm-btn-auction { background-color: rgba(16, 185, 129, 0.9); } .wm-btn-auction:hover:not(:disabled) { background-color: rgba(5, 150, 105, 1); transform: scale(1.1); }
        .wm-btn-bulk { background-color: rgba(59, 130, 246, 0.9); } .wm-btn-bulk:hover:not(:disabled) { background-color: rgba(37, 99, 235, 1); transform: scale(1.1); }
        .wm-btn-bulk-active { background-color: rgba(16, 185, 129, 0.95) !important; } .wm-btn-bulk-active:hover:not(:disabled) { background-color: rgba(5, 150, 105, 1) !important; transform: scale(1.1); }
        .wm-action-btn:disabled { background-color: #4b5563 !important; cursor: not-allowed !important; transform: none !important; opacity: 0.5; }
        .wm-processed-card { filter: grayscale(100%) brightness(0.7) opacity(0.6) !important; pointer-events: none !important; transition: all 0.2s ease !important; }

        /* ===== Prix en cache ===== */
        .wm-price-panel { position: absolute; bottom: 12px; left: 12px; z-index: 40; background-color: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-family: monospace; box-shadow: 0 4px 6px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 4px; pointer-events: none; min-width: 80px; }
        .wm-price-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; }
        .wm-price-row:last-child { border-bottom: none; padding-bottom: 0; }
        .wm-rarity-label { font-weight: bold; } .wm-val { color: var(--color-accent, #fbbf24); font-weight: bold; }
        .wm-r-L { color: #ef4444; } .wm-r-UR { color: #f97316; } .wm-r-SR { color: #a855f7; } .wm-r-R { color: #3b82f6; } .wm-r-PC { color: #10b981; } .wm-r-C { color: #9ca3af; }
        .wm-empty-sales { color: #9ca3af; font-size: 10px; justify-content: center; font-style: italic; }
        .wm-loading-badge { color: #fbbf24; font-size: 10px; justify-content: center; font-style: italic; }

        /* ===== Sniper (nouvelle version) ===== */
        .wm-sniper-row {
            display: flex; gap: 8px;
        }
        .wm-sniper-row .wm-sniper-field { flex: 1; }

        .wm-sniper-panel {
            margin: 0;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            padding: 14px 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #e5e7eb;
            box-shadow: 0 6px 24px rgba(0,0,0,0.4);
        }
        .wm-sniper-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .wm-sniper-title { font-size: 14px; font-weight: 700; color: #a5b4fc; }
        .wm-sniper-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; cursor: pointer; }
        .wm-sniper-toggle input { cursor: pointer; width: 16px; height: 16px; accent-color: #6366f1; }
        .wm-sniper-body { display: flex; flex-direction: column; gap: 10px; }
        .wm-sniper-field { display: flex; flex-direction: column; gap: 4px; }
        .wm-sniper-field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .wm-sniper-field input { background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 6px; padding: 8px 10px; color: white; font-size: 13px; outline: none; }
        .wm-sniper-field input:focus { border-color: #6366f1; }
        .wm-sniper-status {
            display: flex; align-items: center; gap: 8px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            margin-top: 4px;
        }
        .wm-sniper-status-dot { width: 10px; height: 10px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
        .wm-sniper-meta { font-size: 10.5px; color: #64748b; font-family: monospace; }

        /* ===== Enchères suivies : mini sniper ===== */
        .wm-tracked-sniper {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 8px;
            background: rgba(15, 23, 42, 0.5);
            border-radius: 6px;
            font-size: 11px;
            margin-top: 2px;
        }
        .wm-sniper-mini-toggle {
            display: flex; align-items: center; gap: 4px;
            cursor: pointer; color: #cbd5e1; font-size: 11px;
        }
        .wm-sniper-mini-toggle input { cursor: pointer; width: 14px; height: 14px; accent-color: #6366f1; }
        .wm-sniper-mini-info { color: #64748b; font-family: monospace; font-size: 10px; flex: 1; }
        .wm-sniper-mini-edit {
            background: rgba(79, 70, 229, 0.4) !important;
            padding: 3px 8px !important;
            font-size: 12px !important;
        }
        .wm-sniper-mini-edit:hover { background: rgba(79, 70, 229, 0.7) !important; }

        /* ===== Bouton engrenage (drag & drop) ===== */
        #wm-floating-toggle {
            position: fixed; bottom: 20px; left: 20px; z-index: 99999;
            width: 52px; height: 52px; border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
            color: white; border: 2px solid rgba(255,255,255,0.15);
            display: flex; align-items: center; justify-content: center;
            cursor: grab; user-select: none;
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
            transition: transform 0.15s, box-shadow 0.15s;
        }
        #wm-floating-toggle:hover { transform: scale(1.08); box-shadow: 0 8px 26px rgba(79, 70, 229, 0.55); }
        #wm-floating-toggle:active, #wm-floating-toggle.wm-dragging { cursor: grabbing; transform: scale(1.05); }
        #wm-floating-toggle svg { width: 26px; height: 26px; transition: transform 0.4s; }
        #wm-floating-toggle.wm-menu-open svg { transform: rotate(90deg); }
        #wm-floating-toggle .wm-badge {
            position: absolute; top: -4px; right: -4px;
            min-width: 20px; height: 20px; padding: 0 5px;
            background: #ef4444; color: white; border-radius: 999px;
            font-size: 11px; font-weight: bold; display: none;
            align-items: center; justify-content: center;
            border: 2px solid #0f172a;
        }
        #wm-floating-toggle .wm-badge.show { display: flex; }

        /* ===== Panneau de contrôle ===== */
        #wm-control-panel {
            position: fixed; z-index: 99999;
            width: 380px; max-height: 640px;
            background: rgba(15, 23, 42, 0.98);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 14px;
            box-shadow: 0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset;
            display: none; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #e5e7eb; overflow: hidden;
            backdrop-filter: blur(12px);
        }
        #wm-control-panel.show { display: flex; }

        .wm-panel-header {
            padding: 12px 16px;
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%);
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex; justify-content: space-between; align-items: center;
        }
        .wm-panel-header-title {
            font-weight: 700; font-size: 14px; letter-spacing: 0.02em;
            background: linear-gradient(135deg, #a5b4fc 0%, #c7d2fe 100%);
            -webkit-background-clip: text; background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .wm-panel-close { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 18px; padding: 4px; border-radius: 6px; }
        .wm-panel-close:hover { color: white; background: rgba(255,255,255,0.08); }

        .wm-tabs {
            display: flex; gap: 2px; padding: 8px 6px 0;
            background: rgba(30, 41, 59, 0.5);
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .wm-tab {
            flex: 1; padding: 10px 4px; background: none; border: none;
            color: #94a3b8; font-size: 11px; font-weight: 600;
            cursor: pointer; border-radius: 8px 8px 0 0;
            display: flex; flex-direction: column; align-items: center; gap: 2px;
            transition: all 0.15s; position: relative;
        }
        .wm-tab:hover { color: #e5e7eb; background: rgba(255,255,255,0.04); }
        .wm-tab.active { color: #a5b4fc; background: rgba(79, 70, 229, 0.12); }
        .wm-tab.active::after {
            content: ''; position: absolute; bottom: -1px; left: 12%; right: 12%;
            height: 2px; background: linear-gradient(90deg, #6366f1, #a5b4fc);
            border-radius: 2px;
        }
        .wm-tab-icon { font-size: 16px; }
        .wm-tab .wm-tab-badge {
            position: absolute; top: 4px; right: 6px;
            min-width: 16px; height: 16px; padding: 0 4px;
            background: #ef4444; color: white; border-radius: 999px;
            font-size: 9px; font-weight: bold; display: none;
            align-items: center; justify-content: center;
        }
        .wm-tab .wm-tab-badge.show { display: flex; }

        .wm-tab-content {
            padding: 14px;
            overflow-y: auto; flex: 1;
            display: flex; flex-direction: column; gap: 14px;
        }
        .wm-tab-content.hidden { display: none; }

        .wm-section-title {
            font-size: 10px; font-weight: 700; color: #64748b;
            text-transform: uppercase; letter-spacing: 0.08em;
            margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
        }
        .wm-section-title::after {
            content: ''; flex: 1; height: 1px;
            background: linear-gradient(90deg, rgba(100,116,139,0.3), transparent);
        }

        .wm-panel-input {
            flex: 1; background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 9px 12px;
            color: white; font-size: 12px; outline: none;
            transition: border-color 0.15s;
        }
        .wm-panel-input:focus { border-color: #6366f1; background: rgba(30, 41, 59, 0.9); }
        .wm-input-group { display: flex; gap: 6px; }

        .wm-panel-btn {
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            color: white; border: none; border-radius: 8px;
            padding: 9px 14px; font-size: 12px; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
        }
        .wm-panel-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .wm-panel-btn:active { transform: translateY(0); }
        .wm-panel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wm-panel-btn.danger { background: linear-gradient(135deg, #dc2626, #ef4444); box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3); }
        .wm-panel-btn.ghost { background: rgba(71, 85, 105, 0.5); box-shadow: none; }
        .wm-panel-btn.ghost:hover { background: rgba(71, 85, 105, 0.8); }

        #wm-log-box {
            background: rgba(2, 6, 23, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 8px; padding: 10px;
            font-family: 'SF Mono', Consolas, monospace; font-size: 10.5px;
            overflow-y: auto; max-height: 140px; color: #7dd3fc;
            display: flex; flex-direction: column; gap: 3px;
        }
        .wm-log-item { padding: 2px 0; word-break: break-all; opacity: 0.85; }
        .wm-log-item:last-child { opacity: 1; color: #38bdf8; }

        .wm-ping-box {
            display: flex; justify-content: space-between; align-items: center;
            background: rgba(30, 41, 59, 0.6);
            padding: 10px 12px; border-radius: 8px;
            font-size: 12px; font-weight: 600;
            border: 1px solid rgba(148, 163, 184, 0.1);
        }

        #wm-bulk-list-container {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 8px; font-size: 11px;
            max-height: 120px; overflow-y: auto; margin-bottom: 8px;
        }
        .wm-bulk-item {
            display: flex; justify-content: space-between; align-items: center;
            padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .wm-bulk-item:last-child { border-bottom: none; }
        .wm-bulk-empty { color: #64748b; font-style: italic; text-align: center; padding: 8px; }

        #wm-tracked-list {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 8px; font-size: 12px;
            max-height: 300px; overflow-y: auto;
        }
        .wm-tracked-item {
            padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.04);
            display: flex; flex-direction: column; gap: 5px;
        }
        .wm-tracked-item:last-child { border-bottom: none; }
        .wm-tracked-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .wm-tracked-title { font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-size: 12px; }
        .wm-tracked-timer { font-family: monospace; font-weight: bold; color: #fbbf24; font-size: 11px; }
        .wm-tracked-timer.urgent { color: #ef4444; animation: wmPulse 1s infinite; }
        .wm-tracked-info { font-size: 10px; color: #94a3b8; display: flex; gap: 10px; }
        .wm-tracked-actions { display: flex; gap: 6px; }
        .wm-tracked-btn {
            background: rgba(51, 65, 85, 0.7); color: #e5e7eb;
            border: none; border-radius: 6px; padding: 4px 10px;
            font-size: 10.5px; cursor: pointer; font-weight: 600;
            transition: all 0.15s;
        }
        .wm-tracked-btn:hover { background: rgba(71, 85, 105, 0.9); }
        .wm-tracked-btn.danger { background: rgba(127, 29, 29, 0.7); }
        .wm-tracked-btn.danger:hover { background: rgba(153, 27, 27, 0.9); }
        .wm-tracked-empty { color: #64748b; font-style: italic; text-align: center; padding: 16px; }
        @keyframes wmPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        .wm-balance-card {
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.08) 100%);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 12px; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
        }
        .wm-balance-current { display: flex; align-items: baseline; gap: 6px; justify-content: center; }
        .wm-balance-icon { font-size: 24px; }
        .wm-balance-value { font-size: 32px; font-weight: 800; color: #fbbf24; font-family: monospace; line-height: 1; }
        .wm-balance-unit { font-size: 14px; font-weight: 600; color: #cbd5e1; }
        .wm-balance-deltas { display: flex; gap: 8px; justify-content: center; }
        .wm-balance-delta {
            display: flex; flex-direction: column; align-items: center;
            padding: 6px 14px; border-radius: 8px;
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.1);
            min-width: 80px;
        }
        .wm-balance-delta-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .wm-balance-delta-value { font-size: 15px; font-weight: 700; font-family: monospace; }
        .wm-balance-delta.up .wm-balance-delta-value { color: #10b981; }
        .wm-balance-delta.down .wm-balance-delta-value { color: #ef4444; }
        .wm-balance-delta.flat .wm-balance-delta-value { color: #94a3b8; }
        .wm-balance-chart {
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 10px; padding: 8px 4px;
            overflow: hidden;
        }
        .wm-balance-list {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 6px;
            max-height: 200px; overflow-y: auto;
        }
        .wm-balance-entry {
            display: grid; grid-template-columns: 1fr auto auto;
            gap: 10px; align-items: center;
            padding: 6px 8px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            font-size: 11px;
        }
        .wm-balance-entry:last-child { border-bottom: none; }
        .wm-balance-entry-date { color: #94a3b8; font-family: monospace; }
        .wm-balance-entry-delta { font-weight: 700; font-family: monospace; }
        .wm-balance-entry-delta.up { color: #10b981; }
        .wm-balance-entry-delta.down { color: #ef4444; }
        .wm-balance-entry-balance { color: #fbbf24; font-family: monospace; font-weight: 600; }

        .wm-pref-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 7px 0; font-size: 12px; color: #cbd5e1;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .wm-pref-row:last-child { border-bottom: none; }
        .wm-pref-row label { cursor: pointer; user-select: none; flex: 1; }
        .wm-pref-row input[type="checkbox"] { cursor: pointer; width: 16px; height: 16px; accent-color: #6366f1; }
        .wm-pref-row input[type="number"] {
            width: 64px; background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 6px; padding: 5px 8px;
            color: white; font-size: 11px; text-align: center;
        }

        /* ===== Règles d'auto-tagging ===== */
        .wm-rule-card {
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 10px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .wm-rule-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }
        .wm-rule-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #cbd5e1;
            cursor: pointer;
            font-weight: 700;
        }
        .wm-rule-toggle input { accent-color: #6366f1; cursor: pointer; }
        .wm-rule-del {
            background: rgba(127, 29, 29, 0.7);
            border: none;
            border-radius: 6px;
            color: white;
            padding: 3px 8px;
            cursor: pointer;
            font-size: 11px;
        }
        .wm-rule-tag-row {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .wm-rule-tag-label {
            font-size: 10px;
            color: #94a3b8;
            font-weight: 700;
        }
        .wm-rule-conditions {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .wm-cond-row {
            display: grid;
            grid-template-columns: 1.4fr 0.9fr 1.2fr auto;
            gap: 4px;
            align-items: center;
        }
        .wm-cond-field,
        .wm-cond-op,
        .wm-cond-input {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 6px;
            padding: 6px;
            color: white;
            font-size: 11px;
            outline: none;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .wm-cond-field:focus,
        .wm-cond-op:focus,
        .wm-cond-input:focus {
            border-color: #6366f1;
        }
        .wm-cond-del {
            background: rgba(127, 29, 29, 0.7);
            border: none;
            border-radius: 6px;
            color: white;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 12px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .wm-rule-add-cond {
            background: rgba(51, 65, 85, 0.7);
            border: none;
            border-radius: 6px;
            color: #cbd5e1;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            align-self: flex-start;
        }
        .wm-rule-add-cond:hover {
            background: rgba(71, 85, 105, 0.9);
        }

        #wm-track-btn {
            position: fixed; top: 80px; right: 20px; z-index: 9999;
            background: linear-gradient(135deg, #4f46e5, #6366f1);
            color: white; border: none; border-radius: 10px;
            padding: 10px 14px; font-size: 12px; font-weight: 700;
            cursor: pointer; display: flex; align-items: center; gap: 6px;
            box-shadow: 0 6px 20px rgba(79, 70, 229, 0.4);
            transition: all 0.15s;
        }
        #wm-track-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(79, 70, 229, 0.55); }
        #wm-track-btn.tracked { background: linear-gradient(135deg, #dc2626, #ef4444); box-shadow: 0 6px 20px rgba(220, 38, 38, 0.4); }
        #wm-track-btn.tracked:hover { box-shadow: 0 8px 24px rgba(220, 38, 38, 0.55); }

        #wm-track-modal-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
            animation: wmFadeIn 0.15s ease-out;
        }
        @keyframes wmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        #wm-track-modal {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 14px; padding: 22px; max-width: 420px; width: 90%;
            color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 24px 48px rgba(0,0,0,0.7);
            animation: wmSlideUp 0.2s ease-out;
        }
        @keyframes wmSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        #wm-track-modal h3 { margin: 0 0 6px 0; font-size: 17px; font-weight: 700; }
        #wm-track-modal .wm-subtitle { color: #94a3b8; font-size: 12px; margin-bottom: 18px; }
        #wm-track-modal .wm-modal-label {
            display: block; font-size: 11px; font-weight: 600;
            color: #cbd5e1; margin-bottom: 6px;
            text-transform: uppercase; letter-spacing: 0.05em;
        }
        #wm-track-modal input[type="number"] {
            width: 100%; background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; padding: 10px; color: white;
            font-size: 15px; margin-bottom: 16px; outline: none;
        }
        #wm-track-modal input[type="number"]:focus { border-color: #6366f1; }
        #wm-track-modal .wm-checkbox-row {
            display: flex; align-items: center; gap: 10px;
            padding: 8px 0; font-size: 13px; color: #cbd5e1;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        #wm-track-modal .wm-checkbox-row:last-of-type { border-bottom: none; }
        #wm-track-modal .wm-checkbox-row input { width: 16px; height: 16px; cursor: pointer; accent-color: #6366f1; }
        #wm-track-modal .wm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
        #wm-track-modal .wm-modal-btn {
            padding: 10px 18px; border-radius: 8px; border: none;
            font-size: 13px; font-weight: 700; cursor: pointer;
            transition: all 0.15s;
        }
        #wm-track-modal .wm-modal-btn.cancel { background: rgba(51, 65, 85, 0.7); color: #cbd5e1; }
        #wm-track-modal .wm-modal-btn.cancel:hover { background: rgba(71, 85, 105, 0.9); }
        #wm-track-modal .wm-modal-btn.confirm {
            background: linear-gradient(135deg, #4f46e5, #6366f1); color: white;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
        }
        #wm-track-modal .wm-modal-btn.confirm:hover { filter: brightness(1.15); }



        #wm-toast-container {
            position: fixed; bottom: 20px; right: 20px; z-index: 99998;
            display: flex; flex-direction: column-reverse; gap: 10px;
            max-width: 340px; pointer-events: none;
        }
        .wm-toast {
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border: 1px solid rgba(255,255,255,0.1);
            border-left: 4px solid #fbbf24;
            border-radius: 12px; padding: 14px 16px;
            color: #e5e7eb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px; box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            pointer-events: auto; animation: wmSlideIn 0.3s ease-out;
        }
        .wm-toast.urgent { border-left-color: #ef4444; }
        .wm-toast.expired { border-left-color: #6b7280; opacity: 0.8; }
        .wm-toast-title { font-weight: 700; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .wm-toast-title .wm-toast-close { background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 0; line-height: 1; }
        .wm-toast-title .wm-toast-close:hover { color: white; }
        .wm-toast-body { font-size: 12px; color: #cbd5e1; margin-bottom: 10px; line-height: 1.4; }
        .wm-toast-timer { font-family: monospace; color: #fbbf24; font-weight: bold; }
        .wm-toast-actions { display: flex; gap: 6px; }
        .wm-toast-btn {
            padding: 6px 12px; border-radius: 7px; border: none;
            font-size: 11px; font-weight: 600; cursor: pointer;
            transition: all 0.15s;
        }
        .wm-toast-btn.view { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; }
        .wm-toast-btn.dismiss { background: rgba(51, 65, 85, 0.7); color: #cbd5e1; }
        .wm-toast-btn:hover { filter: brightness(1.15); }
        @keyframes wmSlideIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }

        #wm-trade-helper {
            position: sticky; top: 0; z-index: 5;
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%);
            border-bottom: 1px solid rgba(99, 102, 241, 0.25);
            padding: 10px 16px;
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #wm-trade-helper .wm-th-label {
            font-size: 10px; color: #94a3b8;
            text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;
        }
        #wm-trade-helper .wm-th-value {
            font-size: 16px; font-weight: 800; color: #fbbf24;
            font-family: monospace;
        }
        #wm-trade-helper .wm-th-side { display: flex; flex-direction: column; gap: 3px; }
        #wm-trade-helper .wm-th-count { font-size: 12px; color: #cbd5e1; font-weight: 500; }

        /* ===== Patch Notes ===== */
        .wm-patch-item {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 8px; padding: 10px; margin-bottom: 8px;
        }
        .wm-patch-item:last-child { margin-bottom: 0; }
        .wm-patch-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 4px;
        }
        .wm-patch-version { font-weight: 700; color: #a5b4fc; font-size: 13px; }
        .wm-patch-date { font-family: monospace; color: #94a3b8; font-size: 10px; }
        .wm-patch-changes { margin: 0; padding-left: 16px; font-size: 11px; color: #cbd5e1; }
        .wm-patch-changes li { margin-bottom: 4px; line-height: 1.3; }

        /* ===== Smart Trades (Routines) ===== */
        .wm-st-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .wm-st-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 10px; transition: border-color 0.15s; }
        .wm-st-card:hover { border-color: rgba(99, 102, 241, 0.5); }
        .wm-st-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
        .wm-st-title { font-weight: 700; color: #e5e7eb; font-size: 13px; }
        .wm-st-friend { font-size: 11px; color: #a5b4fc; background: rgba(79, 70, 229, 0.15); padding: 2px 6px; border-radius: 4px; }
        .wm-st-rules { font-size: 10px; color: #94a3b8; margin-bottom: 8px; display: flex; flex-direction: column; gap: 2px; }
        .wm-st-rule span { color: #cbd5e1; font-weight: 600; }
        .wm-st-actions { display: flex; gap: 6px; }

        /* ===== Modales internes (Création & Exécution) ===== */
        .wm-internal-modal { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.98); z-index: 10; display: none; flex-direction: column; padding: 12px; animation: fadeIn 0.15s; }
        .wm-internal-modal.show { display: flex; }
        .wm-trade-container { display: flex; gap: 8px; margin: 8px 0; flex: 1; min-height: 0; }
        .wm-trade-side { flex: 1; background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
        .wm-trade-header { font-size: 11px; color: #cbd5e1; font-weight: 700; display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; }
        .wm-trade-val { color: #fbbf24; font-family: monospace; }
        .wm-trade-list { flex: 1; overflow-y: auto; background: rgba(15, 23, 42, 0.5); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 4px; }
        .wm-trade-item { display: flex; justify-content: space-between; align-items: center; background: rgba(51, 65, 85, 0.8); padding: 4px 6px; border-radius: 4px; font-size: 10px; color: #e5e7eb; }
        .wm-trade-item-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; }
        .wm-trade-item-remove { color: #ef4444; cursor: pointer; font-weight: bold; padding: 0 4px; }

        /* ===== Modale Grand Format (Smart Trade) ===== */
        #wm-st-overlay {
            position: fixed; inset: 0; z-index: 100000;
            background: rgba(0,0,0,0.8); backdrop-filter: blur(6px);
            display: none; align-items: center; justify-content: center;
        }
        #wm-st-overlay.show { display: flex; animation: fadeIn 0.15s; }
        .wm-st-large-modal {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.4);
            border-radius: 14px; padding: 24px;
            width: 90%; max-width: 800px; max-height: 90vh;
            color: #e5e7eb; display: flex; flex-direction: column; gap: 16px;
            box-shadow: 0 24px 48px rgba(0,0,0,0.7);
        }
        .wm-st-large-modal .wm-panel-input { font-size: 14px; padding: 10px; }
        .wm-trade-wb-container {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; padding: 6px 10px; margin-top: 4px;
        }
        .wm-trade-wb-label { font-size: 11px; color: #94a3b8; }
        .wm-trade-wb-input {
            background: transparent; border: none; color: #fbbf24; font-family: monospace;
            font-size: 14px; width: 80px; text-align: right; outline: none;
        }

        /* ===== Modale de Prévisualisation Grand Format ===== */
        #wm-preview-overlay {
            position: fixed; inset: 0; z-index: 999999;
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
            display: none; align-items: center; justify-content: center;
            animation: fadeIn 0.15s ease;
        }
        #wm-preview-overlay.show { display: flex; }
        .wm-preview-box {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid rgba(99, 102, 241, 0.5);
            border-radius: 16px; padding: 24px;
            width: 90%; max-width: 400px;
            color: #e5e7eb; display: flex; flex-direction: column; gap: 16px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.8);
            position: relative; text-align: center;
        }
        .wm-preview-close {
            position: absolute; top: 12px; right: 12px;
            background: transparent; border: none; color: #94a3b8;
            font-size: 20px; cursor: pointer;
        }
        .wm-preview-close:hover { color: #fff; }
        .wm-preview-img-container {
            width: 100%; height: 300px; border-radius: 10px; overflow: hidden;
            position: relative; background: #000; border: 1px solid rgba(255,255,255,0.1);
        }
        .wm-preview-img-container img { width: 100%; height: 100%; object-fit: contain; }
        .wm-preview-title { font-size: 18px; font-weight: bold; color: #fff; font-family: var(--font-heading, sans-serif); }
        .wm-preview-desc { font-size: 12px; color: #94a3b8; line-height: 1.4; max-height: 100px; overflow-y: auto; text-align: left; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; }
        .wm-preview-stats { display: flex; justify-content: space-around; background: rgba(30, 41, 59, 0.7); padding: 10px; border-radius: 8px; font-size: 14px; font-weight: bold; }

        /* ===== Groupes de Tags & Auto-Tag ===== */
        .wm-auto-tag-panel {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 8px; padding: 12px; margin-bottom: 16px;
        }
        .wm-auto-tag-lbl { font-size: 13px; font-weight: bold; color: #10b981; }

        .wm-tag-group {
            background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px; margin-bottom: 8px; overflow: hidden;
        }
        .wm-tag-group-header {
            padding: 10px 12px; background: rgba(15, 23, 42, 0.6);
            display: flex; justify-content: space-between; align-items: center;
            cursor: pointer; transition: background 0.2s;
        }
        .wm-tag-group-header:hover { background: rgba(30, 41, 59, 0.8); }
        .wm-tag-group-title { font-size: 13px; font-weight: bold; color: #e5e7eb; }

        .wm-tag-group-content {
            padding: 12px; display: none; flex-direction: column; gap: 8px;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        .wm-tag-group.open .wm-tag-group-content { display: flex; }

        .wm-tag-rule-row {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(15, 23, 42, 0.4); padding: 6px 10px; border-radius: 6px;
        }
        .wm-tag-badge {
            font-size: 10px; padding: 2px 6px; border-radius: 12px;
            color: #000; font-weight: bold;
        }
    `);
    // GM_addStyle fin

    // ============================================================
    // LOG / UTILITAIRES UI
    // ============================================================
    function logToPanel(msg) {
        const logBox = document.getElementById('wm-log-box');
        if (!logBox) return;
        const div = document.createElement('div');
        div.className = 'wm-log-item';
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function isTitleInBulkList(title) {
        return getBulkList().some(item => (typeof item === 'string' ? item : item.title) === title);
    }

    function updateAllBulkButtonsUI() {
        document.querySelectorAll('.wm-btn-bulk').forEach(btn => {
            const c = btn.closest('.w-72');
            if (!c) return;
            const t = c.querySelector('h3')?.textContent?.trim();
            if (!t) return;
            const isIn = isTitleInBulkList(t);
            btn.classList.toggle('wm-btn-bulk-active', isIn);
            btn.innerHTML = isIn
                ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        });
    }

    function updateBulkUI() {
        const container = document.getElementById('wm-bulk-list-container');
        if (!container) return;
        const list = getBulkList();
        if (list.length === 0) {
            container.innerHTML = '<div class="wm-bulk-empty">Panier vide.</div>';
        } else {
            container.innerHTML = list.map(item => {
                const title = typeof item === 'string' ? item : item.title;
                const hasUserCardId = typeof item === 'object' && (
                    item.userCardId || (item.id && window.wmCardIdToUserCardId.has(item.id))
                );
                const hasCardId = typeof item === 'object' && item.id;
                const icon = hasUserCardId ? '✅' : (hasCardId ? '⏳' : '❓');
                const tip = hasUserCardId ? 'Prêt (user_card_id connu)' : (hasCardId ? 'user_card_id à résoudre' : 'Aucun ID');
                return `<div class="wm-bulk-item"><span title="${tip}">${icon} ${title}</span></div>`;
            }).join('');
        }
    }

    // ============================================================
    // SYSTÈME DE NOTIFICATION (TOAST)
    // ============================================================
    function showWMToast(message, isSuccess = true) {
        const toast = document.createElement('div');
        // Styles Tailwind intégrés pour matcher avec l'interface du jeu (Next.js)
        toast.className = `fixed bottom-5 right-5 z-[9999] flex items-center p-4 mb-4 text-sm rounded-lg shadow-xl transition-all duration-500 transform translate-y-4 opacity-0 border ${isSuccess ? 'text-green-400 bg-gray-900 border-green-800' : 'text-red-400 bg-gray-900 border-red-800'}`;
        toast.innerHTML = `<span class="font-semibold flex items-center gap-2">${isSuccess ? '✅' : '❌'} ${message}</span>`;

        document.body.appendChild(toast);

        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.classList.replace('translate-y-4', 'translate-y-0');
            toast.classList.replace('opacity-0', 'opacity-100');
        });

        // Disparition automatique après 3.5 secondes
        setTimeout(() => {
            toast.classList.replace('translate-y-0', 'translate-y-4');
            toast.classList.replace('opacity-100', 'opacity-0');
            setTimeout(() => toast.remove(), 500); // Nettoyage du DOM
        }, 3500);
    }

    // ============================================================
    // FONCTION API MISE À JOUR (EXTRACTION DU JSON)
    // ============================================================
    async function executeBulkDiscard(userCardIdsArray) {
        if (!Array.isArray(userCardIdsArray) || userCardIdsArray.length === 0) {
            return { success: true, count: 0, balance: null, failed: [] };
        }

        const CHUNK_SIZE = 100;
        const totalChunks = Math.ceil(userCardIdsArray.length / CHUNK_SIZE);

        let totalDiscarded = 0;
        let lastBalance = null;
        const allFailed = [];
        let anySuccess = false;

        logToPanel(`📦 Bulk discard : ${userCardIdsArray.length} cartes en ${totalChunks} lot(s) de ${CHUNK_SIZE} max`);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = userCardIdsArray.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            logToPanel(`[Lot ${i + 1}/${totalChunks}] Envoi de ${chunk.length} cartes...`);

            let response, data;
            try {
                // Retry sur chaque chunk
                data = await withRetry(async () => {
                    response = await fetch("https://www.wiki-masters.com/api/user-cards/bulk-discard", {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "accept": "*/*",
                            "content-type": "application/json"
                        },
                        body: JSON.stringify({ card_ids: chunk })
                    });

                    let parsed = null;
                    try { parsed = await response.json(); } catch (e) {}

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${parsed ? JSON.stringify(parsed).slice(0, 200) : 'no body'}`);
                    }
                    return parsed;
                }, {
                    label: `bulk-discard lot ${i + 1}`,
                    retries: 3,
                    baseDelay: 2000,
                    maxDelay: 10000
                });

                anySuccess = true;
                const discarded = data?.discarded_count ?? chunk.length;
                totalDiscarded += discarded;

                if (typeof data?.balance === 'number') {
                    lastBalance = data.balance;
                }

                if (data?.failed && Array.isArray(data.failed)) {
                    allFailed.push(...data.failed);
                    if (data.failed.length > 0) {
                        logToPanel(`[Lot ${i + 1}/${totalChunks}] ⚠️ ${data.failed.length} échecs (${data.failed[0]?.error || '?'})`);
                    }
                }

                logToPanel(`[Lot ${i + 1}/${totalChunks}] ✅ ${discarded} défaussées (cumul : ${totalDiscarded})`);

            } catch (e) {
                console.error(`[WM-Bulk] ❌ Lot ${i + 1} échoué :`, e);
                logToPanel(`[Lot ${i + 1}/${totalChunks}] ❌ Échec : ${e.message}`);
                // Ajoute toutes les cartes du lot raté dans les failed
                chunk.forEach(id => allFailed.push({ card_id: id, error: 'chunk_failed' }));
            }

            // Petit délai entre les chunks pour ne pas spammer
            if (i < totalChunks - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        localStorage.removeItem('wm-bulk-delete-cart');

        return {
            success: anySuccess,
            count: totalDiscarded,
            balance: lastBalance,
            failed: allFailed,
            chunks: totalChunks
        };
    }

    // ============================================================
    // SON
    // ============================================================
    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.2, 0.4].forEach(offset => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 800;
                const t = ctx.currentTime + offset;
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.start(t); osc.stop(t + 0.15);
            });
        } catch(e) {}
    }

    // ============================================================
    // TOASTS
    // ============================================================
    function getToastContainer() {
        let c = document.getElementById('wm-toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'wm-toast-container'; document.body.appendChild(c); }
        return c;
    }

    function showToast({ title, body, auctionId, urgent, secondsLeft }) {
        const container = getToastContainer();
        const id = 'wm-toast-' + auctionId;
        const old = document.getElementById(id);
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = id;
        toast.className = 'wm-toast' + (urgent ? ' urgent' : '');
        toast.innerHTML = `
            <div class="wm-toast-title">
                <span>🔔 ${title}</span>
                <button class="wm-toast-close" aria-label="Fermer">✕</button>
            </div>
            <div class="wm-toast-body">
                ${body}
                ${secondsLeft !== undefined ? `<div style="margin-top:6px;">Fin dans <span class="wm-toast-timer" data-auction="${auctionId}">${formatSec(secondsLeft)}</span></div>` : ''}
            </div>
            <div class="wm-toast-actions">
                <button class="wm-toast-btn view">Voir</button>
                <button class="wm-toast-btn dismiss">Fermer</button>
            </div>
        `;
        container.appendChild(toast);
        toast.querySelector('.wm-toast-close').addEventListener('click', () => toast.remove());
        toast.querySelector('.dismiss').addEventListener('click', () => toast.remove());
        toast.querySelector('.view').addEventListener('click', () => { window.location.href = `/marketplace/${auctionId}`; });

        if (secondsLeft !== undefined) {
            const timerEl = toast.querySelector('.wm-toast-timer');
            const interval = setInterval(() => {
                if (!document.body.contains(timerEl)) { clearInterval(interval); return; }
                const rem = getReminders()[auctionId];
                if (!rem) { clearInterval(interval); return; }
                const s = Math.floor((new Date(rem.endAt).getTime() - Date.now()) / 1000);
                timerEl.textContent = s > 0 ? formatSec(s) : 'Terminée';
                if (s <= 0) { toast.classList.add('expired'); clearInterval(interval); }
            }, 1000);
        }
    }

    function formatSec(s) {
        if (s <= 0) return '0s';
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
        const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
        return `${h}h ${m}m`;
    }

    // ============================================================
    // RAPPELS ENCHÈRES
    // ============================================================
    function addReminder({ auctionId, cardTitle, endAt, triggerBefore, channels }) {
        const reminders = getReminders();
        reminders[auctionId] = { auctionId, cardTitle, endAt, triggerBefore, channels, createdAt: Date.now(), fired: false };
        saveReminders(reminders);
        logToPanel(`🔔 Rappel ajouté : "${cardTitle}" à ${triggerBefore}s de la fin.`);
        renderTrackedAuctions();
        updateTrackBadge();
    }

    function removeReminder(auctionId) {
        const reminders = getReminders();
        delete reminders[auctionId];
        saveReminders(reminders);
        const toast = document.getElementById('wm-toast-' + auctionId);
        if (toast) toast.remove();
        // Nettoie aussi la config sniper associée
        const all = getAllSniperConfigs();
        if (all[auctionId]) {
            delete all[auctionId];
            saveAllSniperConfigs(all);
        }
        renderTrackedAuctions();
        updateTrackBadge();
    }

    function updateTrackBadge() {
        const reminders = getReminders();
        const count = Object.keys(reminders).length;
        const badge = document.querySelector('#wm-floating-toggle .wm-badge');
        if (badge) {
            if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('show'); }
            else badge.classList.remove('show');
        }
        const tabBadge = document.querySelector('.wm-tab[data-tab="tracked"] .wm-tab-badge');
        if (tabBadge) {
            if (count > 0) { tabBadge.textContent = count > 99 ? '99+' : count; tabBadge.classList.add('show'); }
            else tabBadge.classList.remove('show');
        }
    }

    // ============================================================
    // BOUTON SUIVRE (page enchère)
    // ============================================================
    function getAuctionIdFromUrl() {
        const m = window.location.pathname.match(/\/marketplace\/([a-f0-9-]+)/i);
        return m ? m[1] : null;
    }

    async function fetchAuctionDetails(auctionId) {
        try {
            const r = await fetch(`/api/marketplace/${auctionId}`, { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            return data.auction || null;
        } catch(e) { return null; }
    }

    let lastTrackBtnAuctionId = null;
    function ensureTrackButton() {
        const auctionId = getAuctionIdFromUrl();
        const existingBtn = document.getElementById('wm-track-btn');

        if (!auctionId) {
            if (existingBtn) existingBtn.remove();
            lastTrackBtnAuctionId = null;
            return;
        }

        if (existingBtn && lastTrackBtnAuctionId === auctionId) return;

        if (existingBtn) existingBtn.remove();
        lastTrackBtnAuctionId = auctionId;

        const reminders = getReminders();
        const isTracked = !!reminders[auctionId];

        const btn = document.createElement('button');
        btn.id = 'wm-track-btn';
        if (isTracked) btn.classList.add('tracked');
        btn.innerHTML = isTracked ? '<span>🔕</span> Ne plus suivre' : '<span>🔔</span> Suivre cette enchère';
        btn.title = isTracked ? 'Retirer le rappel' : 'Ajouter un rappel';

        btn.addEventListener('click', async () => {
            const rems = getReminders();
            if (rems[auctionId]) {
                removeReminder(auctionId);
                btn.classList.remove('tracked');
                btn.innerHTML = '<span>🔔</span> Suivre cette enchère';
            } else {
                // Fetch uniquement au moment de l'action
                const auction = await fetchAuctionDetails(auctionId);
                if (!auction) {
                    logToPanel('❌ Impossible de récupérer les détails de l\'enchère');
                    return;
                }
                openTrackModal(auction);
            }
        });

        document.body.appendChild(btn);
    }

    function openTrackModal(auction) {
        const prefs = getPrefs();
        const existing = document.getElementById('wm-track-modal-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'wm-track-modal-overlay';
        overlay.innerHTML = `
            <div id="wm-track-modal">
                <h3>🔔 Suivre cette enchère</h3>
                <div class="wm-subtitle">"${auction.card?.wikipedia_title || auction.card_id}"</div>
                <label class="wm-modal-label">Préviens-moi X secondes avant la fin</label>
                <input type="number" id="wm-trigger-input" value="${prefs.defaultTriggerBefore}" min="5" max="3600" step="5">
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-browser" ${prefs.browser ? 'checked' : ''}><label for="wm-opt-browser">Notification navigateur</label></div>
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-toast" ${prefs.toast ? 'checked' : ''}><label for="wm-opt-toast">Toast in-page</label></div>
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-sound" ${prefs.sound ? 'checked' : ''}><label for="wm-opt-sound">Son</label></div>
                <div class="wm-modal-actions">
                    <button class="wm-modal-btn cancel">Annuler</button>
                    <button class="wm-modal-btn confirm">Suivre</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const closeModal = () => overlay.remove();
        overlay.querySelector('.cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        overlay.querySelector('.confirm').addEventListener('click', () => {
            const triggerBefore = parseInt(overlay.querySelector('#wm-trigger-input').value, 10) || prefs.defaultTriggerBefore;
            const channels = {
                browser: overlay.querySelector('#wm-opt-browser').checked,
                toast: overlay.querySelector('#wm-opt-toast').checked,
                sound: overlay.querySelector('#wm-opt-sound').checked
            };
            addReminder({
                auctionId: auction.id,
                cardTitle: auction.card?.wikipedia_title || auction.card_id,
                endAt: auction.end_at,
                triggerBefore, channels
            });
            closeModal();
            const btn = document.getElementById('wm-track-btn');
            if (btn) { btn.classList.add('tracked'); btn.innerHTML = '<span>🔕</span> Ne plus suivre'; }
        });
    }

    // ============================================================
    // PANNEAU ENCHÈRES SUIVIES
    // ============================================================
    function renderTrackedAuctions() {
        const container = document.getElementById('wm-tracked-list');
        if (!container) return;
        const reminders = getReminders();
        const entries = Object.values(reminders).sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
        if (entries.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucune enchère suivie.<br>Va sur une enchère et clique sur "🔔 Suivre"</div>';
            return;
        }
        container.innerHTML = entries.map(rem => {
            const secondsLeft = Math.floor((new Date(rem.endAt).getTime() - Date.now()) / 1000);
            const urgent = secondsLeft > 0 && secondsLeft <= rem.triggerBefore;
            const expired = secondsLeft <= 0;
            const cfg = getSniperConfigFor(rem.auctionId);
            return `
                <div class="wm-tracked-item" data-id="${rem.auctionId}">
                    <div class="wm-tracked-header">
                        <span class="wm-tracked-title" title="${rem.cardTitle}">${rem.cardTitle}</span>
                        <span class="wm-tracked-timer ${urgent ? 'urgent' : ''}" data-end="${rem.endAt}" data-id="${rem.auctionId}">
                            ${expired ? 'Terminée' : formatSec(secondsLeft)}
                        </span>
                    </div>
                    <div class="wm-tracked-info">
                        <span>🔔 ${rem.triggerBefore}s avant</span>
                    </div>
                    <div class="wm-tracked-actions">
                        <button class="wm-tracked-btn" data-action="view" data-id="${rem.auctionId}">Voir</button>
                        <button class="wm-tracked-btn danger" data-action="remove" data-id="${rem.auctionId}">Annuler</button>
                    </div>
                    <div class="wm-tracked-sniper">
                        <label class="wm-sniper-mini-toggle" title="Activer le sniper sur cette enchère">
                            <input type="checkbox" data-action="sniper-toggle" data-id="${rem.auctionId}" ${cfg.enabled ? 'checked' : ''}>
                            <span>Sniper</span>
                        </label>
                        <span class="wm-sniper-mini-info">Max ${cfg.maxBid} WB • ${cfg.trigger}s / ${cfg.step}s</span>
                        <button class="wm-tracked-btn wm-sniper-mini-edit" data-action="sniper-edit" data-id="${rem.auctionId}" title="Modifier les paramètres">⚙️</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind listeners
        container.querySelectorAll('[data-action]').forEach(el => {
            if (el.tagName === 'INPUT') {
                el.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    if (e.target.checked) {
                         const auction = await fetchAuctionDetails(id);
                         if (auction) {
                             setSniperConfigFor(id, { enabled: true, endAt: auction.end_at });
                         } else {
                             setSniperConfigFor(id, { enabled: true });
                         }
                    } else {
                         setSniperConfigFor(id, { enabled: false });
                    }

                    logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${id.slice(0, 8)}`);
                    const currentAuctionId = getAuctionIdFromUrl();
                    if (currentAuctionId === id) syncSniperPanelFromConfig();
                });
            } else {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.dataset.id;
                    const action = el.dataset.action;
                    if (action === 'view') window.location.href = `/marketplace/${id}`;
                    else if (action === 'remove') removeReminder(id);
                    else if (action === 'sniper-edit') openSniperEditModal(id);
                });
            }
        });
    }

    /** Ouvre une popup pour modifier la config sniper d'une enchère depuis l'onglet Suivi. */
    function openSniperEditModal(auctionId) {
        const cfg = getSniperConfigFor(auctionId);
        const existing = document.getElementById('wm-sniper-edit-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wm-sniper-edit-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border:1px solid rgba(99,102,241,0.3);border-radius:14px;padding:22px;max-width:420px;width:90%;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                <h3 style="margin:0 0 6px 0;font-size:17px;font-weight:700;">⚙️ Paramètres du sniper</h3>
                <div style="color:#94a3b8;font-size:12px;margin-bottom:18px;">Enchère ${auctionId.slice(0, 8)}…</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Mise max (WB)</label>
                        <input type="number" id="wm-sniper-edit-max" min="1" step="1" value="${cfg.maxBid}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <div style="flex:1;">
                            <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Trigger (s)</label>
                            <input type="number" id="wm-sniper-edit-trigger" min="1" step="1" value="${cfg.trigger}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                        </div>
                        <div style="flex:1;">
                            <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Pas (s)</label>
                            <input type="number" id="wm-sniper-edit-step" min="1" step="1" value="${cfg.step}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
                    <button id="wm-sniper-edit-cancel" style="padding:10px 18px;border-radius:8px;border:none;background:rgba(51,65,85,0.7);color:#cbd5e1;font-size:13px;font-weight:700;cursor:pointer;">Annuler</button>
                    <button id="wm-sniper-edit-save" style="padding:10px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;font-size:13px;font-weight:700;cursor:pointer;">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('wm-sniper-edit-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        document.getElementById('wm-sniper-edit-save').addEventListener('click', () => {
            const maxBid = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-max').value, 10) || 1);
            const trigger = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-trigger').value, 10) || 1);
            const step = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-step').value, 10) || 1);
            setSniperConfigFor(auctionId, { maxBid, trigger, step });
            logToPanel(`🎯 Config sniper mise à jour : max ${maxBid} WB, trigger ${trigger}s, pas ${step}s`);
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            const currentAuctionId = getAuctionIdFromUrl();
            if (currentAuctionId === auctionId) syncSniperPanelFromConfig();
            close();
            renderTrackedAuctions();
        });
    }

    setInterval(() => {
        document.querySelectorAll('.wm-tracked-timer').forEach(el => {
            const endAt = el.dataset.end;
            if (!endAt) return;
            const s = Math.floor((new Date(endAt).getTime() - Date.now()) / 1000);
            el.textContent = s > 0 ? formatSec(s) : 'Terminée';
        });
    }, 1000);

    setInterval(() => {
        const reminders = getReminders();
        const now = Date.now();
        let changed = false;
        for (const id of Object.keys(reminders)) {
            const rem = reminders[id];
            const endMs = new Date(rem.endAt).getTime();
            const secondsLeft = Math.floor((endMs - now) / 1000);
            if (!rem.fired && secondsLeft <= rem.triggerBefore && secondsLeft > 0) {
                const prefs = getPrefs();
                const ch = rem.channels || { browser: prefs.browser, toast: prefs.toast, sound: prefs.sound };
                const title = `Fin imminente — ${rem.cardTitle}`;
                const body = `Se termine dans ${formatSec(secondsLeft)}`;
                if (ch.browser && Notification.permission === 'granted') {
                    try {
                        const n = new Notification(title, { body, icon: 'https://www.wiki-masters.com/icon-192.png', tag: 'wm-auction-' + id });
                        n.onclick = () => { window.focus(); window.location.href = `/marketplace/${id}`; n.close(); };
                    } catch(e) {}
                }
                if (ch.toast) showToast({ title: 'Fin imminente', body: `"${rem.cardTitle}" arrive à échéance.`, auctionId: id, urgent: secondsLeft < 30, secondsLeft });
                if (ch.sound) playBeep();
                rem.fired = true; changed = true;
                logToPanel(`🔔 Rappel déclenché : ${rem.cardTitle} (${secondsLeft}s)`);
            }
            if (secondsLeft < -300) {
                delete reminders[id]; changed = true;
                const toast = document.getElementById('wm-toast-' + id);
                if (toast) toast.remove();
            }
        }
        if (changed) saveReminders(reminders);
        renderTrackedAuctions();
        updateTrackBadge();
    }, 5000);


    // ============================================================
    // INTERCEPTEUR Response.prototype.json (Packs & Balance)
    // ============================================================
    const originalResponseJson = Response.prototype.json;
    Response.prototype.json = function(...args) {
        return originalResponseJson.apply(this, args).then(data => {
            try {
                // Détection de l'ouverture d'un pack
                if (data && typeof data === 'object' && Array.isArray(data.cards) && data.cards.length > 0
                    && 'packs_remaining' in data && data.cards[0] && (data.cards[0].wikipedia_title || data.cards[0].title)) {

                    console.log(`[WM-Pack] 🎴 Pack ouvert : ${data.cards.length} cartes — lancement des routines...`);
                    logToPanel(`🎴 Pack ouvert : ${data.cards.length} cartes`);

                    // 1. Lancement du scan des prix
                    data.cards.forEach((card, i) => {
                        const uuid = card.id;
                        const title = card.wikipedia_title || card.title;
                        if (uuid && title) setTimeout(() => fetchPricesBackground(uuid, title), i * 120);
                    });

                    // 2. Lancement de l'Auto-Tag intelligent (1.5s après, le temps que la DB s'actualise)
                    if (typeof processAutoTags === 'function') {
                        setTimeout(() => processAutoTags(data.cards), 1500);
                    }
                }

                // Détection de la mise à jour du solde
                if (data && typeof data === 'object' && typeof data.wikibidous_balance === 'number' && data.username) {
                    recordBalance(data.wikibidous_balance, 'passive');
                }
            } catch(e) {}
            return data;
        });
    };

    // ============================================================
    // INTERCEPTEUR FETCH CLASSIQUE
    // ============================================================
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const options = args[1] || {};

        if (options.headers) {
            const headers = new Headers(options.headers);
            if (headers.has('apikey')) window.wmAuth.apikey = headers.get('apikey');
            if (headers.has('authorization')) {
                const token = headers.get('authorization');
                window.wmAuth.token = token;
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if (payload && payload.sub) window.wmUserId = payload.sub;
                } catch(e) {}
            }
        }

        const response = await originalFetch.apply(this, args);

        try {
            // Interception des prix du marché
            if (url && url.includes('sales?scope=summary')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.wikipedia_title) {
                        window.wmPrices[data.wikipedia_title] = data.summary || {};
                    }
                }).catch(() => {});
            }

            // Interception de tes tags existants
            if (url && url.includes('/rest/v1/tags?select=')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (Array.isArray(data)) {
                        data.forEach(tag => {
                            window.wmTags[tag.name] = { id: tag.id, color: tag.color || '#a78bfa' };
                        });
                    }
                }).catch(() => {});
            }
        } catch (e) {}

        return response;
    };

    // ============================================================
    // RÉSOLUTION TITRE -> userCardId
    // ============================================================
    async function resolveUserCardId(title) {
        if (!title) return null;
        if (userCardIdCache.has(title)) return userCardIdCache.get(title);
        if (window.wmInventoryMap[title]) {
            userCardIdCache.set(title, window.wmInventoryMap[title]);
            return window.wmInventoryMap[title];
        }
        try {
            const r = await fetch(`/api/my-collection?q=${encodeURIComponent(title)}&page=0&stats=0`, { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            const items = data.collection || data.cards || data.data || [];
            const match = items.find(c => (c.card?.wikipedia_title || c.wikipedia_title) === title);
            if (match && match.id) {
                userCardIdCache.set(title, match.id);
                window.wmInventoryMap[title] = match.id;
                return match.id;
            }
        } catch(e) {}
        return null;
    }

    // ============================================================
    // BULK DELETE API
    // ============================================================
    async function directDiscardAPI(uuid) {
        try {
            const res = await fetch(`https://www.wiki-masters.com/api/user-cards/${uuid}/discard`, {
                method: 'POST', headers: { 'Accept': '*/*' }, credentials: 'include'
            });
            let errorText = "";
            try { const data = await res.json(); if (data.error) errorText = data.error; } catch(e) {}
            return (res.ok || res.status === 409 || errorText.includes('possédez plus'));
        } catch(e) { return false; }
    }

    // ============================================================
    // PRIX EN CACHE (Avec Retry 3 essais + Erreur UI)
    // ============================================================
    async function fetchPricesBackground(uuid, cardTitle, attempt = 1) {
        if (!uuid || !cardTitle) return;

        const now = Date.now();
        const timestamp = window.wmPriceTimestamps[cardTitle] || 0;
        const isStale = (now - timestamp) > 259200000; // 24h

        // Si on a déjà une requête en cours, ou si le prix est valide et frais
        if (attempt === 1 && window.wmFetching.has(uuid)) return;
        if (attempt === 1 && window.wmPrices[cardTitle] && window.wmPrices[cardTitle] !== "LOADING" && window.wmPrices[cardTitle] !== "ERROR" && !isStale) return;

        if (attempt === 1) {
            window.wmFetching.add(uuid);
            if (!window.wmPrices[cardTitle] || window.wmPrices[cardTitle] === "ERROR") {
                window.wmPrices[cardTitle] = "LOADING";
            }
            renderPricesOnAllCards();
        }

        try {
            const fetcher = typeof originalFetch !== 'undefined' ? originalFetch : fetch;
            const res = await fetcher(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                credentials: "include", method: "GET", headers: { "Accept": "application/json" }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const hasSales = data && data.wikipedia_title && Object.keys(data.summary || {}).length > 0;
            const finalData = hasSales ? data.summary : "EMPTY";

            wmSavePriceToCache(cardTitle, finalData);
            window.wmFetching.delete(uuid);
            renderPricesOnAllCards();

        } catch (e) {
            console.error(`[WM-Price] ⚠️ Échec prix pour ${cardTitle} (Essai ${attempt}/3):`, e.message);

            if (attempt < 3) {
                // Retry avec délai progressif (1s, puis 1.5s...)
                setTimeout(() => fetchPricesBackground(uuid, cardTitle, attempt + 1), 1000 + (attempt * 500));
            } else {
                console.error(`[WM-Price] ❌ Abandon pour ${cardTitle} après 3 essais.`);
                window.wmPrices[cardTitle] = "ERROR";
                window.wmFetching.delete(uuid);
                renderPricesOnAllCards();
            }
        }
    }

    // ============================================================
    // MODULE TAGS (Supabase)
    // ============================================================
    const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;

    window.wmTagsCache = [];
    window.wmUserCardTagsCache = new Map(); // userCardId -> Set(tagId)

    /**
 * Helper générique pour requêtes Supabase via GM_xmlhttpRequest (contourne CORS).
 */
    function supabaseRequest(method, path, body = null) {
        return new Promise((resolve, reject) => {
            if (!W.wmAuth.token || !W.wmAuth.apikey) {
                reject(new Error('Auth non disponible'));
                return;
            }
            GM_xmlhttpRequest({
                method,
                url: `${SUPABASE_URL}${path}`,
                headers: {
                    'apikey': W.wmAuth.apikey,
                    'Authorization': `Bearer ${W.wmAuth.token}`,
                    'Content-Type': 'application/json',
                    'Content-Profile': 'public',
                    'Prefer': 'return=representation'
                },
                data: body ? JSON.stringify(body) : undefined,
                onload: res => {
                    if (res.status === 204) {
                        resolve(null);
                    } else if (res.status >= 200 && res.status < 300) {
                        try { resolve(res.responseText ? JSON.parse(res.responseText) : null); }
                        catch { resolve(null); }
                    } else {
                        reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
                    }
                },
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Timeout'))
            });
        });
    }

    /**
 * Version de supabaseRequest avec retry automatique.
 */
    function supabaseRequestWithRetry(method, path, body = null, opts = {}) {
        return withRetry(
            () => supabaseRequest(method, path, body),
            {
                label: `Supabase ${method} ${path.split('?')[0]}`,
                retries: 4,
                baseDelay: 1500,
                maxDelay: 12000,
                ...opts,
                shouldRetry: (err) => {
                    const msg = String(err.message || '');
                    // 4xx → pas de retry (sauf 429)
                    if (/HTTP 4\d\d/.test(msg) && !/HTTP 429/.test(msg)) return false;
                    // 409 duplicate → pas de retry
                    if (/409/.test(msg)) return false;
                    // Tout le reste (5xx, timeouts, SSL) → retry
                    return true;
                }
            }
        );
    }

    async function wmFetchTags() {
        const tags = await supabaseRequestWithRetry('GET', '/rest/v1/tags?select=*');
        window.wmTagsCache = tags || [];
        return window.wmTagsCache;
    }

    async function wmCreateTag(name, color) {
        const userId = W.wmAuth.userId;
        if (!userId) throw new Error('user_id manquant');
        const result = await supabaseRequestWithRetry('POST', '/rest/v1/tags', {
            user_id: userId, name, color
        });
        const newTag = Array.isArray(result) ? result[0] : result;
        if (newTag) window.wmTagsCache.push(newTag);
        return newTag;
    }

    async function wmDeleteTag(tagId) {
        await supabaseRequestWithRetry('DELETE', `/rest/v1/tags?id=eq.${tagId}`);
        window.wmTagsCache = window.wmTagsCache.filter(t => t.id !== tagId);
    }

    async function wmFetchUserCardTags(userCardId) {
        if (window.wmUserCardTagsCache.has(userCardId)) {
            return window.wmUserCardTagsCache.get(userCardId);
        }
        const rows = await supabaseRequestWithRetry('GET',
                                           `/rest/v1/user_card_tags?select=*&user_card_id=eq.${userCardId}`);
        const tagIds = new Set((rows || []).map(r => r.tag_id));
        window.wmUserCardTagsCache.set(userCardId, tagIds);
        return tagIds;
    }

    async function wmApplyTag(userCardId, tagId) {
        const existing = await wmFetchUserCardTags(userCardId);
        if (existing.has(tagId)) return { ok: true, skipped: true };
        try {
            await supabaseRequestWithRetry('POST', '/rest/v1/user_card_tags', {
                user_card_id: userCardId,
                tag_id: tagId
            });
            existing.add(tagId);
            return { ok: true, skipped: false };
        } catch (e) {
            if (String(e.message).includes('409') || String(e.message).includes('duplicate')) {
                existing.add(tagId);
                return { ok: true, skipped: true };
            }
            return { ok: false, error: e.message };
        }
    }

    async function wmRemoveTag(userCardId, tagId) {
        const existing = await wmFetchUserCardTags(userCardId);
        if (!existing.has(tagId)) return { ok: true, skipped: true };
        try {
            await supabaseRequestWithRetry('DELETE',
                                  `/rest/v1/user_card_tags?user_card_id=eq.${userCardId}&tag_id=eq.${tagId}`);
            existing.delete(tagId);
            return { ok: true, skipped: false };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ============================================================
    // MOTEUR DE RÈGLES D'AUTO-TAGGING (GROUPES & IMPORT/EXPORT)
    // ============================================================
    const WM_TAG_GROUPS_KEY = 'wmTagGroups';

    function getTagGroups() {
        try {
            let groups = JSON.parse(localStorage.getItem(WM_TAG_GROUPS_KEY));
            if (!groups || !Array.isArray(groups)) {
                // Migration automatique : on récupère tes anciennes règles
                const oldRules = JSON.parse(localStorage.getItem('wmTagRules') || '[]');
                if (oldRules.length > 0) {
                    groups = [{ id: 'g_' + Date.now(), name: 'Mes Anciennes Règles', isOpen: true, rules: oldRules }];
                    saveTagGroups(groups);
                } else {
                    groups = [];
                }
            }
            return groups;
        } catch { return []; }
    }

    function saveTagGroups(groups) {
        localStorage.setItem(WM_TAG_GROUPS_KEY, JSON.stringify(groups));
    }

    function getFlatRules() {
        // Aplatit tous les dossiers pour obtenir une liste simple, et ignore les règles sans étiquette
        return getTagGroups()
            .flatMap(g => g.rules || [])
            .filter(r => r.enabled !== false && r.tagId && r.tagId !== '');
    }

    const WM_RULE_FIELDS = {
        'avgPrice': {
            label: 'Prix moyen',
            type: 'number',
            getter: (card, prices) => {
                return wmGetPriceFor(card.title, card.rarity);
            }
        },
        'rarity': { label: 'Rareté', type: 'enum', values: ['C','PC','R','SR','UR','L'],
                   getter: (card) => card.rarity },
        'title': { label: 'Titre', type: 'string', getter: (card) => card.title || '' },
        'category': { label: 'Catégorie', type: 'string', getter: (card) => card.category || '' },
        'description': { label: 'Description', type: 'string', getter: (card) => card.summary || '' }
    };

    const WM_RULE_OPERATORS = {
        '>':  (a, b) => Number(a) > Number(b),
        '>=': (a, b) => Number(a) >= Number(b),
        '<':  (a, b) => Number(a) < Number(b),
        '<=': (a, b) => Number(a) <= Number(b),
        '=':  (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
        '!=': (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
        'contains': (a, b) => {
            const valA = String(a).toLowerCase();
            // Découpe les termes séparés par ";" et retire les espaces vides
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return true;
            // Retourne vrai si AU MOINS UN terme est présent (Logique OU)
            return terms.some(term => valA.includes(term));
        },
        'not_contains': (a, b) => {
            const valA = String(a).toLowerCase();
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return true;
            // Retourne vrai si AUCUN des termes n'est présent (Logique ET)
            return terms.every(term => !valA.includes(term));
        }
    };


    // ============================================================
    // CACHE COLLECTION (nouvelle structure allégée)
    // ============================================================
    const WM_COLLECTION_CACHE_KEY = 'wmCollectionCache';
    const WM_COLLECTION_CACHE_VERSION = 2;

    window.wmCollectionCache = { v: WM_COLLECTION_CACHE_VERSION, ts: 0, cards: [] };
    window.wmCardIdToUserCardId = new Map();

    function wmLoadCollectionCache() {
        try {
            const raw = localStorage.getItem(WM_COLLECTION_CACHE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);

            // Migration depuis l'ancienne structure
            if (parsed && parsed.version === 1 && Array.isArray(parsed.cards)) {
                console.log(`[WM-Cache] Migration v1 → v2 (${parsed.cards.length} cartes)`);
                window.wmCollectionCache = {
                    v: WM_COLLECTION_CACHE_VERSION,
                    ts: parsed.lastSync || 0,
                    cards: parsed.cards.map(c => wmSerializeCard({
                        id: c.id,
                        userCardId: c.userCardId,
                        title: c.title,
                        rarity: c.rarity,
                        category: c.category
                    }))
                };
                wmSaveCollectionCache();
            } else if (parsed && parsed.v === WM_COLLECTION_CACHE_VERSION && Array.isArray(parsed.cards)) {
                window.wmCollectionCache = parsed;
            } else {
                return;
            }
            wmBuildCardIdIndex();
            console.log(`[WM-Cache] ${window.wmCollectionCache.cards.length} cartes chargées`);
        } catch (e) {
            console.warn('[WM-Cache] Erreur chargement:', e);
        }
    }

    function wmSaveCollectionCache() {
        try {
            window.wmCollectionCache.ts = Date.now();
            localStorage.setItem(WM_COLLECTION_CACHE_KEY, JSON.stringify(window.wmCollectionCache));
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                logToPanel('⚠️ Cache collection : quota localStorage dépassé');
            } else {
                console.warn('[WM-Cache] Erreur save:', e);
            }
            return false;
        }
    }

    function wmClearCollectionCache() {
        localStorage.removeItem(WM_COLLECTION_CACHE_KEY);
        window.wmCollectionCache = { v: WM_COLLECTION_CACHE_VERSION, ts: 0, cards: [] };
        window.wmCardIdToUserCardId.clear();
        console.log('[WM-Cache] Effacé');
    }

    function wmSerializeCard(card) {
        return {
            id: card.id,
            ucId: card.userCardId,
            t: card.title,
            r: card.rarity,
            c: card.category
        };
    }

    function wmDeserializeCard(stored) {
        return {
            id: stored.id,
            userCardId: stored.ucId,
            title: stored.t,
            rarity: stored.r,
            category: stored.c
        };
    }

    function wmBuildCardIdIndex() {
        window.wmCardIdToUserCardId.clear();
        for (const stored of (window.wmCollectionCache.cards || [])) {
            if (stored.id && stored.ucId) {
                window.wmCardIdToUserCardId.set(stored.id, stored.ucId);
            }
        }
        console.log(`[WM-Index] ${window.wmCardIdToUserCardId.size} entrées cardId→userCardId`);
    }

    /**
 * Résout un card_id vers user_card_id :
 * 1. Index local (instantané)
 * 2. Cache collection (instantané aussi)
 * 3. Fallback API par titre
 */
    async function wmResolveUserCardId(cardId, title = null) {
        // 1. Index local
        if (cardId && window.wmCardIdToUserCardId.has(cardId)) {
            return window.wmCardIdToUserCardId.get(cardId);
        }

        // 2. Recherche dans le cache collection par titre (utile si l'index est vide pour une raison X)
        if (title) {
            for (const stored of (window.wmCollectionCache.cards || [])) {
                if (stored.t === title) {
                    if (stored.id) window.wmCardIdToUserCardId.set(stored.id, stored.ucId);
                    return stored.ucId;
                }
            }
        }

        // 3. Fallback API par titre
        if (title) {
            try {
                const r = await fetch(`/api/my-collection?q=${encodeURIComponent(title)}&page=0&stats=0`, {
                    credentials: 'include'
                });
                if (r.ok) {
                    const data = await r.json();
                    const items = data.collection || [];
                    // Priorité : match par cardId, sinon match par titre exact
                    let match = null;
                    if (cardId) match = items.find(it => it.card?.id === cardId);
                    if (!match) match = items.find(it => it.card?.wikipedia_title === title);
                    if (match?.id) {
                        if (match.card?.id) window.wmCardIdToUserCardId.set(match.card.id, match.id);
                        return match.id;
                    }
                }
            } catch (e) {
                console.warn('[WM-Resolve] Fallback API échoué:', e);
            }
        }

        return null;
    }

    /**
 * Renvoie les cartes DÉSÉRIALISÉES (avec noms longs).
 */
    async function getCollectionCards({ maxAge = 24 * 3600 * 1000, forceRefresh = false, onProgress } = {}) {
        const cacheAge = Date.now() - window.wmCollectionCache.ts;
        const cacheValid = !forceRefresh
        && window.wmCollectionCache.cards.length > 0
        && cacheAge < maxAge;

        if (cacheValid) {
            console.log(`[WM-Cache] Cache utilisé (${window.wmCollectionCache.cards.length} cartes)`);
            if (onProgress) onProgress(`📦 Cache : ${window.wmCollectionCache.cards.length} cartes`);
            return window.wmCollectionCache.cards.map(wmDeserializeCard);
        }

        console.log('[WM-Cache] Fetch complet...');
        const cards = await fetchAllCollectionCards(onProgress);
        window.wmCollectionCache.cards = cards.map(wmSerializeCard);
        wmSaveCollectionCache();
        wmBuildCardIdIndex();
        console.log(`[WM-Cache] ${cards.length} cartes mises en cache`);
        return cards;
    }

    /**
 * Récupère les cartes VISIBLES dans le DOM de la collection.
 * Résout leur userCardId via l'index local.
 * Renvoie le même format que getCollectionCards().
 */
    /**
 * Récupère les cartes VISIBLES dans le DOM de la collection.
 * Pour chaque carte absente du cache, la fetch via l'API et l'ajoute au cache.
 * @param {Function} onProgress - callback optionnel pour la progression
 */
    async function getVisibleCollectionCards(onProgress) {
        const cardEls = Array.from(document.querySelectorAll('div.relative.isolate.group'))
        .filter(el => el.querySelector('img'));
        const result = [];
        const seenTitles = new Set();

        // Index du cache par titre normalisé
        const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const cacheByTitle = new Map();
        for (const stored of (window.wmCollectionCache.cards || [])) {
            if (stored.t) cacheByTitle.set(normalize(stored.t), stored);
        }

        console.log(`[WM-Visible] DOM: ${cardEls.length} cartes | Cache: ${cacheByTitle.size} entrées`);

        // 1ère passe : extraire les titres + matcher avec le cache
        const missing = []; // { el, title, index }
        const found = [];   // { el, title, stored }

        for (let idx = 0; idx < cardEls.length; idx++) {
            const el = cardEls[idx];
            let title = null;
            const h = el.querySelector('h3, h2, h1');
            if (h && h.textContent.trim().length > 1) title = h.textContent.trim();
            if (!title) {
                const img = el.querySelector('img');
                if (img && img.alt && img.alt.trim().length > 1) title = img.alt.trim();
            }
            if (!title || seenTitles.has(title)) continue;
            seenTitles.add(title);

            const stored = cacheByTitle.get(normalize(title));
            if (stored) {
                found.push({ el, title, stored });
            } else {
                missing.push({ el, title, index: idx });
            }
        }

        console.log(`[WM-Visible] ${found.length} en cache, ${missing.length} manquantes à fetcher`);

        // 2ème passe : fetch des manquantes (avec throttling)
        let fetched = 0;
        let fetchFailures = 0;
        let cacheUpdated = false;

        for (let i = 0; i < missing.length; i++) {
            const { title, index } = missing[i];
            if (onProgress) {
                onProgress(`🔍 Carte manquante ${i + 1}/${missing.length} : "${title.slice(0, 30)}"`);
            }

            try {
                const r = await withRetry(async () => {
                    const resp = await fetch(
                        `/api/my-collection?q=${encodeURIComponent(title)}&page=0&stats=0`,
                        { credentials: 'include', headers: { 'Accept': '*/*' } }
                    );
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    return await resp.json();
                }, {
                    label: `collection q="${title.slice(0, 20)}"`,
                    retries: 3,
                    baseDelay: 800,
                    maxDelay: 4000
                });

                const items = r?.collection || [];
                // Match par titre exact (insensible à la casse)
                const match = items.find(it =>
                                         normalize(it.card?.wikipedia_title) === normalize(title)
                                        );

                if (match?.id && match.card?.id) {
                    const stored = {
                        id: match.card.id,
                        ucId: match.id,
                        t: match.card.wikipedia_title,
                        r: match.card.rarity,
                        c: match.card.category
                    };
                    // Ajoute au cache + à l'index
                    window.wmCollectionCache.cards.push(stored);
                    window.wmCardIdToUserCardId.set(match.card.id, match.id);
                    cacheByTitle.set(normalize(title), stored);
                    found.push({ el: null, title, stored });
                    fetched++;
                    cacheUpdated = true;
                } else {
                    console.warn(`[WM-Visible] ❌ "${title}" introuvable côté API`);
                    fetchFailures++;
                }
            } catch (e) {
                console.warn(`[WM-Visible] ❌ Fetch échoué pour "${title}": ${e.message}`);
                fetchFailures++;
            }

            // Throttle
            await new Promise(res => setTimeout(res, 250));
        }

        // Persiste le cache si on a ajouté des cartes
        if (cacheUpdated) {
            wmSaveCollectionCache();
            console.log(`[WM-Visible] ${fetched} cartes ajoutées au cache (total: ${window.wmCollectionCache.cards.length})`);
        }

        // Construit le résultat
        for (const { title, stored } of found) {
            result.push({
                id: stored.id,
                userCardId: stored.ucId,
                title: title,
                rarity: stored.r,
                category: stored.c
            });
        }

        console.log(`[WM-Visible] Résolu: ${result.filter(c => c.userCardId).length} / ${result.length} — échecs: ${fetchFailures}`);
        return result;
    }

    function evaluateRule(card, rule, prices) {
        if (!rule.conditions || rule.conditions.length === 0) return false;
        for (const cond of rule.conditions) {
            const field = WM_RULE_FIELDS[cond.field];
            if (!field) return false;
            const value = field.getter(card, prices);
            if (value === null || value === undefined) return false;
            const op = WM_RULE_OPERATORS[cond.operator];
            if (!op) return false;
            if (!op(value, cond.value)) return false;
        }
        return true;
    }

    function evaluateAllRules(card, rules, prices) {
        const tagIds = new Set();
        for (const rule of rules) {
            if (rule.enabled === false) continue;
            if (evaluateRule(card, rule, prices)) tagIds.add(rule.tagId);
        }
        return tagIds;
    }

    function getCardDataFromReact(el) {
        const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (!reactKey) return null;
        let fiber = el[reactKey];
        let attempts = 0;
        while (fiber && attempts < 30) {
            const props = fiber.memoizedProps;
            if (props) {
                const candidates = [props.card, props.userCard, props.item, props.data, props.value];
                for (const c of candidates) {
                    if (c && typeof c === 'object' && c.id) {
                        return {
                            id: c.id,
                            title: c.wikipedia_title || c.card?.wikipedia_title || c.title
                        };
                    }
                }
            }
            fiber = fiber.return;
            attempts++;
        }
        return null;
    }

    window.wmVisualTagsCache = {}; // Cache global pour stocker les tags appliqués

    function renderTagsOnAllCards() {
        const cards = document.querySelectorAll('.w-72');
        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (!titleEl) return;

            const title = titleEl.textContent.trim();
            const tags = window.wmVisualTagsCache[title];

            if (tags && tags.length > 0) {
                let tagContainer = card.querySelector('.wm-visual-tags');

                if (!tagContainer) {
                    tagContainer = document.createElement('div');
                    tagContainer.className = 'wm-visual-tags';
                    tagContainer.style.cssText = 'position: absolute; top: 36px; left: 8px; z-index: 30; display: flex; flex-direction: column; gap: 4px; pointer-events: none;';
                    card.appendChild(tagContainer);
                }

                // Rendu des badges avec l'esthétique du jeu
                tagContainer.innerHTML = tags.map(t =>
                    `<div style="background-color: ${t.color}; color: #000; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: bold; box-shadow: 0 0 8px ${t.color}80; text-transform: uppercase; width: fit-content; max-width: 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</div>`
                ).join('');
            }
        });
    }

    function renderPricesOnAllCards() {
        const cards = document.querySelectorAll('.w-72.rounded-2xl');
        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (!titleEl) return;
            const title = titleEl.textContent.trim();
            const cachedUuid = card.dataset.wmUuid;
            if (cachedUuid && !window.wmPrices[title]) fetchPricesBackground(cachedUuid, title);
            const existingPanel = card.querySelector('.wm-price-panel');
            const priceData = window.wmPrices[title];
            if (priceData) {
                let rowsHtml = '';
                if (priceData === "LOADING") rowsHtml = `<div class="wm-price-row wm-loading-badge">⏳ Chargement...</div>`;
                else if (priceData === "EMPTY") rowsHtml = `<div class="wm-price-row wm-empty-sales">Aucune vente</div>`;
                else if (priceData === "ERROR") rowsHtml = `<div class="wm-price-row wm-empty-sales" style="color:#ef4444;">Erreur</div>`;
                else {
                    let hasPrices = false;
                    ['L', 'UR', 'SR', 'R', 'PC', 'C'].forEach(r => {
                        if (typeof priceData[r] === 'number') {
                            rowsHtml += `<div class="wm-price-row"><span class="wm-rarity-label wm-r-${r}">${r}</span><span class="wm-val">${priceData[r]}</span></div>`;
                            hasPrices = true;
                        }
                    });
                    if (!hasPrices) rowsHtml = `<div class="wm-price-row wm-empty-sales">Aucune vente</div>`;
                }
                if (existingPanel) { if (existingPanel.innerHTML !== rowsHtml) existingPanel.innerHTML = rowsHtml; }
                else {
                    const panel = document.createElement('div');
                    panel.className = 'wm-price-panel';
                    panel.innerHTML = rowsHtml;
                    card.appendChild(panel);
                }
            }
        });
    }

    // ============================================================
    // SCANNER DE PRIX (parcours complet de la collection)
    // ============================================================
    let wmScanState = { running: false, cancelled: false };

    async function fetchAllCollectionCards(onProgress) {
        const PAGE_SIZE = 50;
        const all = [];
        const seenIds = new Set();
        let page = 0;
        const MAX_PAGES = 500;
        const MAX_FAILED_PAGES = 3; // abandonne après 3 pages consécutives en échec
        let consecutiveFailures = 0;

        while (page < MAX_PAGES) {
            if (wmScanState.cancelled || window.wmTagScanState?.cancelled) break;

            while (window.wmTagScanState?.paused && !window.wmTagScanState.cancelled) {
                await new Promise(r => setTimeout(r, 300));
            }
            if (window.wmTagScanState?.cancelled) break;
            if (wmScanState.cancelled) break;

            // ⬇️ Retry automatique sur chaque page
            let data = null;
            try {
                data = await withRetry(async () => {
                    const r = await fetch(`/api/my-collection?sort=rarity&page=${page}&stats=0`, {
                        credentials: 'include',
                        headers: { 'Accept': '*/*' }
                    });
                    if (!r.ok) {
                        throw new Error(`HTTP ${r.status}`);
                    }
                    return await r.json();
                }, {
                    label: `collection page ${page}`,
                    retries: 5,
                    baseDelay: 1500,
                    maxDelay: 15000,
                    shouldRetry: (err) => {
                        const msg = String(err.message);
                        // 401 = token expiré, inutile de retry
                        if (/HTTP 401/.test(msg)) return false;
                        return true;
                    }
                });
            } catch (e) {
                consecutiveFailures++;
                console.warn(`[WM-Scan] Page ${page} échouée définitivement (${consecutiveFailures}/${MAX_FAILED_PAGES}): ${e.message}`);
                if (onProgress) onProgress(`⚠️ Page ${page} échouée — retry global...`);
                // Si on a trop d'échecs consécutifs, on abandonne
                if (consecutiveFailures >= MAX_FAILED_PAGES) {
                    console.error(`[WM-Scan] Trop d'échecs consécutifs, arrêt.`);
                    if (onProgress) onProgress(`❌ Arrêt : ${consecutiveFailures} pages en échec`);
                    break;
                }
                // Sinon on attend un peu plus et on retente la MÊME page
                await new Promise(r => setTimeout(r, 3000 * consecutiveFailures));
                continue;
            }

            // Succès → reset le compteur d'échecs
            consecutiveFailures = 0;

            const items = Array.isArray(data?.collection) ? data.collection : [];
            if (items.length === 0) break;

            let newOnes = 0;
            for (const item of items) {
                const userCardId = item?.id;
                const cardId = item?.card?.id;
                const title = item?.card?.wikipedia_title || item?.wikipedia_title;
                if (!cardId || !title) continue;
                if (seenIds.has(cardId)) continue;
                seenIds.add(cardId);
                all.push({
                    id: cardId,
                    userCardId: userCardId,
                    title: title,
                    rarity: item?.card?.rarity,
                    category: item?.card?.category,
                });
                newOnes++;
            }

            if (onProgress) onProgress(`📄 Page ${page + 1} : ${all.length} cartes récupérées`);
            if (newOnes === 0) break;
            if (items.length < PAGE_SIZE) break;

            page++;
            await new Promise(r => setTimeout(r, 1500));
        }

        return all;
    }

    /**
 * Lance le scan complet : parcourt la collection, fetch les prix manquants/expirés.
 */
    async function runPriceScan() {
        if (wmScanState.running) return;
        wmScanState.running = true;
        wmScanState.cancelled = false;

        const btn = document.getElementById('wm-scan-prices-btn');
        const cancelBtn = document.getElementById('wm-scan-prices-cancel');
        const progress = document.getElementById('wm-scan-progress');

        if (btn) { btn.disabled = true; btn.textContent = '⏳ Scan en cours...'; }
        if (cancelBtn) cancelBtn.style.display = 'block';

        const setProgress = (txt) => { if (progress) progress.textContent = txt; };

        logToPanel('🔍 Démarrage du scan des prix...');
        setProgress('📥 Récupération de la collection...');

        let cards = [];
        try {
            cards = await fetchAllCollectionCards(txt => setProgress(txt));
        } catch (e) {
            logToPanel('❌ Erreur lors de la récupération de la collection');
            setProgress('❌ Erreur');
            wmScanState.running = false;
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Scanner toute la collection'; }
            if (cancelBtn) cancelBtn.style.display = 'none';
            return;
        }

        logToPanel(`📦 ${cards.length} cartes dans la collection`);
        setProgress(`📦 ${cards.length} cartes — début du scan des prix...`);

        // Filtre : ne garde que celles qui ont besoin d'un fetch
        const now = Date.now();
        const toFetch = cards.filter(c => {
            const price = window.wmPrices[c.title];
            const ts = window.wmPriceTimestamps[c.title] || 0;
            const isStale = (now - ts) > 86400000;
            // Skip si prix valide et < 24h
            if (price && price !== "LOADING" && price !== "ERROR" && !isStale) return false;
            return true;
        });

        logToPanel(`🎯 ${toFetch.length} cartes à mettre à jour (${cards.length - toFetch.length} déjà à jour)`);

        let done = 0;
        let failed = 0;
        const DELAY_MS = 1000; // ← throttle entre chaque fetch

        for (const { id, title } of toFetch) {
            if (wmScanState.cancelled) {
                logToPanel('⏹️ Scan annulé par l\'utilisateur');
                break;
            }

            try {
                await withRetry(() => fetchPricesBackground(id, title), {
                    label: `prix "${title.slice(0, 20)}"`,
                    retries: 2,
                    baseDelay: 1500,
                    maxDelay: 5000
                });
                done++;
            } catch (e) {
                failed++;
                console.warn(`[WM-Scan] Prix échoué pour "${title}": ${e.message}`);
            }

            setProgress(`🎯 ${done + failed} / ${toFetch.length} — "${title.slice(0, 30)}"`);
            await new Promise(r => setTimeout(r, DELAY_MS));
        }

        // Fin
        const msg = `✅ Scan terminé : ${done} prix mis à jour${failed > 0 ? `, ${failed} échecs` : ''}`;
        logToPanel(msg);
        setProgress(msg);
        showWMToast(msg, failed === 0);

        wmScanState.running = false;
        wmScanState.cancelled = false;
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Scanner toute la collection'; }
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    // ============================================================
    // ACTIONS MANUELLES
    // ============================================================
    function handleQuickDiscard(event) {
        event.stopPropagation(); event.preventDefault();
        const myBtn = event.currentTarget;
        if (myBtn.disabled || myBtn.dataset.locked === "true") return;
        const cardContainer = event.target.closest('.w-72');
        if (!cardContainer) return;
        const titleEl = cardContainer.querySelector('h3') || cardContainer.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
        if (titleEl) window.wmPendingCardTitle = titleEl.textContent.trim();
        myBtn.dataset.locked = "true";
        setTimeout(() => { myBtn.dataset.locked = "false"; }, 1500);
        const isDirectDiscard = event.shiftKey || event.ctrlKey || event.metaKey;
        cardContainer.click();
        let step = 1; let attempts = 0;
        const checkModal = setInterval(() => {
            attempts++;
            const buttons = Array.from(document.querySelectorAll('button'));
            if (step === 1) {
                const initialBtn = buttons.find(b => /défausser/i.test(b.textContent) && !b.className.includes('red') && b.offsetParent !== null);
                if (initialBtn && !initialBtn.disabled) { initialBtn.click(); step = 2; attempts = 0; }
            } else if (step === 2) {
                const confirmBtn = buttons.find(b => /défausser|confirmer/i.test(b.textContent) && b.className.includes('red') && b.offsetParent !== null);
                if (confirmBtn && !confirmBtn.disabled) {
                    clearInterval(checkModal);
                    if (isDirectDiscard) { confirmBtn.click(); if (window.wmPendingCardTitle) markCardAsProcessedByTitle(window.wmPendingCardTitle); }
                    else {
                        confirmBtn.addEventListener('click', () => {
                            if (window.wmPendingCardTitle) markCardAsProcessedByTitle(window.wmPendingCardTitle);
                        }, { once: true });
                    }
                }
            }
            if (attempts > 150) clearInterval(checkModal);
        }, 100);
    }

    function handleQuickAuction(event) {
        event.stopPropagation(); event.preventDefault();
        const myBtn = event.currentTarget;
        if (myBtn.disabled || myBtn.dataset.locked === "true") return;
        const cardContainer = event.target.closest('.w-72');
        if (!cardContainer) return;
        const titleEl = cardContainer.querySelector('h3') || cardContainer.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
        if (titleEl) window.wmPendingCardTitle = titleEl.textContent.trim();
        myBtn.dataset.locked = "true";
        setTimeout(() => { myBtn.dataset.locked = "false"; }, 1500);
        cardContainer.click();
        let attempts = 0;
        const checkModal = setInterval(() => {
            attempts++;
            const buttons = Array.from(document.querySelectorAll('button'));
            const auctionBtn = buttons.find(b => /mettre aux enchères/i.test(b.textContent) && !b.classList.contains('wm-action-btn') && b.offsetParent !== null);
            if (auctionBtn && !auctionBtn.disabled) {
                clearInterval(checkModal);
                auctionBtn.click();
                if (window.wmPendingCardTitle) markCardAsProcessedByTitle(window.wmPendingCardTitle);
            } else if (attempts > 150) { clearInterval(checkModal); }
        }, 50);
    }

    function toggleBulkForCard(card) {
        const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
        if (!titleEl) return;
        const title = titleEl.textContent.trim();
        let list = getBulkList();

        const existingIndex = list.findIndex(item => (typeof item === 'string' ? item : item.title) === title);

        if (existingIndex > -1) {
            list.splice(existingIndex, 1);
            saveBulkList(list);
            logToPanel(`[Bulk] Retiré : ${title}`);
        } else {
            // Extraction du card_id via React ou data-attribute
            const cardData = getCardDataFromReact(card);
            const cardId = cardData ? cardData.id : (card.dataset.wmUuid || null);

            // 🎯 Résolution immédiate du user_card_id via l'index local
            let userCardId = null;
            if (cardId && window.wmCardIdToUserCardId.has(cardId)) {
                userCardId = window.wmCardIdToUserCardId.get(cardId);
            }

            list.push({ title: title, id: cardId, userCardId: userCardId });
            saveBulkList(list);

            if (userCardId) {
                logToPanel(`[Bulk] ✅ Ajouté : ${title} (user_card_id résolu)`);
            } else if (cardId) {
                logToPanel(`[Bulk] ⏳ Ajouté : ${title} (user_card_id sera cherché au moment du delete)`);
            } else {
                logToPanel(`[Bulk] ⚠️ Ajouté : ${title} (aucun ID trouvé)`);
            }
        }

        updateBulkUI();
        updateAllBulkButtonsUI();
    }

    function stopPropagationOnElement(element) {
        ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(evt => element.addEventListener(evt, (e) => e.stopPropagation()));
    }

    function shouldInjectActionButtons() {
        return window.location.pathname.startsWith('/pulls') || window.location.pathname.startsWith('/collection') ;
    }

    function injectBoosterButtons() {
        if (!shouldInjectActionButtons()) return;

        const cards = document.querySelectorAll('.w-72.rounded-2xl:not(.wm-btns-injected)');
        cards.forEach(card => {
            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            card.classList.add('wm-btns-injected');
            const actionWrapper = document.createElement('div');
            actionWrapper.className = 'wm-actions-wrapper';
            stopPropagationOnElement(actionWrapper);

            const discardBtn = document.createElement('button');
            discardBtn.className = 'wm-action-btn wm-btn-discard';
            discardBtn.title = "Défausser (Ctrl+X pour direct)";
            discardBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`;
            discardBtn.addEventListener('click', handleQuickDiscard);
            actionWrapper.appendChild(discardBtn);

            const bulkBtn = document.createElement('button');
            bulkBtn.className = 'wm-action-btn wm-btn-bulk';
            bulkBtn.title = "Ajouter/Retirer du Panier Bulk (Ctrl+I)";

            const updateBulkBtnState = () => {
                const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
                if (!titleEl) return;
                const title = titleEl.textContent.trim();
                const inList = isTitleInBulkList(title);
                if (inList) {
                    bulkBtn.classList.add('wm-btn-bulk-active');
                    bulkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                } else {
                    bulkBtn.classList.remove('wm-btn-bulk-active');
                    bulkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
                }
            };
            updateBulkBtnState();

            bulkBtn.addEventListener('click', (e) => {
                e.stopPropagation(); e.preventDefault();
                toggleBulkForCard(card);
            });
            actionWrapper.appendChild(bulkBtn);

            const auctionBtn = document.createElement('button');
            auctionBtn.className = 'wm-action-btn wm-btn-auction';
            auctionBtn.title = "Mettre aux enchères (Ctrl+L)";
            auctionBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381"></path><path d="m16 16 6-6"></path><path d="m21.5 10.5-8-8"></path><path d="m8 8 6-6"></path><path d="m8.5 7.5 8 8"></path></svg>`;
            auctionBtn.addEventListener('click', handleQuickAuction);
            actionWrapper.appendChild(auctionBtn);

            card.appendChild(actionWrapper);
        });
    }

    // ============================================================
    // NAVIGATION ENTRE CARTES DANS LE MODAL (COLLECTION)
    // ============================================================

    // Conteneur de la grille de collection
    const WM_GRID_CONTAINER_SELECTOR = 'div.flex.flex-wrap.justify-center';
    // Carte individuelle dans la grille
    const WM_CARD_SELECTOR = 'div.relative.isolate.group';
    // Modal de carte
    const WM_MODAL_SELECTOR = 'div.card-frame.animate-fade-in-up';

    let wmCurrentCardIndex = -1;
    let wmCurrentCardTitle = null;

    /**
 * Récupère les cartes visibles de la collection.
 * On prend toutes les div.relative.isolate.group qui contiennent une image
 * (filtre pour éviter les faux positifs).
 */
    function getCollectionCards() {
        return Array.from(document.querySelectorAll(WM_CARD_SELECTOR))
            .filter(el => el.querySelector('img'));
    }

    /**
 * Récupère le titre d'une carte depuis son <div> racine.
 * Essaie plusieurs emplacements pour être robuste.
 */
    function getCardTitleFromEl(cardEl) {
        // 1) Titre visible (h3 en priorité, puis h2/h1)
        const h = cardEl.querySelector('h3, h2, h1');
        if (h && h.textContent.trim().length > 1) return h.textContent.trim();
        // 2) Attribut alt de l'image
        const img = cardEl.querySelector('img');
        if (img && img.alt && img.alt.trim().length > 1) return img.alt.trim();
        // 3) Attribut title d'un élément
        const titled = cardEl.querySelector('[title]');
        if (titled && titled.getAttribute('title').trim().length > 1) return titled.getAttribute('title').trim();
        return null;
    }

    /**
 * Récupère le modal de carte ouvert (s'il y en a un).
 */
    function getOpenCardModal() {
        const modal = document.querySelector(WM_MODAL_SELECTOR);
        if (!modal) return null;
        const h = modal.querySelector('h1, h2, h3');
        return {
            el: modal,
            title: h ? h.textContent.trim() : null
        };
    }

    /**
 * Ferme le modal courant (bouton X ou Escape).
 */
    function closeCardModal() {
        // Cherche un bouton de fermeture
        const modal = document.querySelector(WM_MODAL_SELECTOR);
        if (modal) {
            // Priorité aux boutons avec aria-label
            const closeBtn = modal.querySelector('button[aria-label="Fermer"]')
            || modal.querySelector('button[aria-label="Close"]')
            || modal.querySelector('button[aria-label*="erm"]');
            if (closeBtn) { closeBtn.click(); return; }
        }
        // Fallback : Escape sur le document
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
            bubbles: true, cancelable: true
        }));
    }

    /**
 * Navigue vers l'index cible dans la liste des cartes.
 */
        function navigateToCardIndex(targetIdx) {
        const cards = getCollectionCards();

        // --- GESTION DU CHANGEMENT DE PAGE ---
        if (targetIdx < 0 || targetIdx >= cards.length) {
            const isNext = targetIdx >= cards.length;
            const btnText = isNext ? 'Suivant →' : '← Précédent';

            // Recherche du bouton de pagination actif
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetBtn = buttons.find(b => b.textContent.trim() === btnText && !b.disabled);

            if (!targetBtn) {
                console.log(`[WM-Nav] 🛑 Fin de la liste, et page ${isNext ? 'suivante' : 'précédente'} indisponible.`);
                return;
            }

            console.log(`[WM-Nav] 🔄 Changement de page : clic sur "${btnText}"...`);

            // 1) Fermer le modal actuel
            closeCardModal();

            // 2) Mémoriser la première carte pour détecter le rechargement de la grille par React
            const oldFirstCard = cards[0];

            // 3) Déclencher le changement de page
            targetBtn.click();

            // 4) Attendre que la grille se mette à jour
            let pageAttempts = 0;
            const waitForPage = setInterval(() => {
                pageAttempts++;
                const freshCards = getCollectionCards();

                // La page a changé si le premier élément du DOM est différent
                if (freshCards.length > 0 && (freshCards[0] !== oldFirstCard || pageAttempts > 20)) {
                    clearInterval(waitForPage);

                    // Cible la première carte (si on avance) ou la dernière (si on recule)
                    const newTargetIdx = isNext ? 0 : freshCards.length - 1;
                    const newTargetCard = freshCards[newTargetIdx];
                    const newTargetTitle = getCardTitleFromEl(newTargetCard);

                    if (newTargetCard) {
                        newTargetCard.scrollIntoView({ behavior: 'auto', block: 'center' });

                        setTimeout(() => {
                            const clickable = newTargetCard.querySelector('img')
                                || newTargetCard.querySelector('[role="button"]')
                                || newTargetCard;
                            clickable.click();

                            wmCurrentCardIndex = newTargetIdx;
                            wmCurrentCardTitle = newTargetTitle;
                            console.log(`[WM-Nav] ✅ Nouvelle page chargée, ouverture de "${newTargetTitle}"`);
                        }, 150);
                    }
                } else if (pageAttempts > 40) {
                    clearInterval(waitForPage); // Sécurité anti-boucle
                }
            }, 50);

            return;
        }

        // --- NAVIGATION NORMALE (Même page) ---
        const targetCard = cards[targetIdx];
        const targetTitle = getCardTitleFromEl(targetCard);
        console.log(`[WM-Nav] ➡️ Navigation vers index ${targetIdx} / ${cards.length} : "${targetTitle}"`);

        // 1) Fermer le modal
        closeCardModal();

        // 2) Attendre la disparition du modal, puis cliquer sur la nouvelle carte
        let attempts = 0;
        const waitForClose = setInterval(() => {
            attempts++;
            const stillOpen = document.querySelector(WM_MODAL_SELECTOR);
            if (!stillOpen || attempts > 40) {
                clearInterval(waitForClose);

                // Scroll dans la vue
                targetCard.scrollIntoView({ behavior: 'auto', block: 'center' });

                setTimeout(() => {
                    const clickable = targetCard.querySelector('img')
                    || targetCard.querySelector('[role="button"]')
                    || targetCard;
                    clickable.click();
                    wmCurrentCardIndex = targetIdx;
                    wmCurrentCardTitle = targetTitle;
                    console.log(`[WM-Nav] ✅ Clic effectué sur index ${targetIdx}`);
                }, 150);
            }
        }, 50);
    }

    // ============================================================
    // TRADE HELPER
    // ============================================================
    function getOpenTradeModal() {
        const candidates = document.querySelectorAll('div.fixed.inset-0.z-50');
        for (const el of candidates) {
            const cls = el.className || '';
            if (!cls.includes('backdrop-blur')) continue;
            if (!cls.includes('p-2') || cls.includes('p-4')) continue;
            const h = el.querySelector('h2');
            if (h && /Échanger avec/i.test(h.textContent)) return el;
        }
        return null;
    }

    function getTradeSelectedCards(modal) {
        const grid = modal.querySelector('div.grid.w-full.grid-cols-2');
        if (!grid) return [];
        const cards = grid.querySelectorAll('button.relative');
        const selected = [];
        cards.forEach(c => {
            const cls = c.className || '';
            if (cls.includes('border-transparent')) return;
            if (!cls.includes('border-[var(--color-accent)]')) return;
            const title = c.querySelector('h3')?.textContent?.trim();
            if (!title) return;
            const cardData = getCardDataFromReact(c);
            selected.push({ el: c, title, cardId: cardData?.id || null });
        });
        return selected;
    }

    function getCardValue(title, rarity = null) {
        const data = window.wmPrices[title];
        if (!data || typeof data !== 'object') return null;
        if (rarity) return typeof data[rarity] === 'number' ? data[rarity] : null;
        // Sinon : max de toutes les raretés
        const vals = Object.values(data).filter(v => typeof v === 'number');
        return vals.length > 0 ? Math.max(...vals) : null;
    }

    async function ensurePriceForTrade(cardId, title) {
        if (!cardId || !title) return;
        if (window.wmPrices[title] && window.wmPrices[title] !== 'LOADING') return;
        await fetchPricesBackground(cardId, title);
    }

    async function computeTradeHelper() {
        const modal = getOpenTradeModal();
        if (!modal) return;
        const selected = getTradeSelectedCards(modal);
        const total = selected.length;
        await Promise.all(selected.map(({ cardId, title }) => ensurePriceForTrade(cardId, title)));
        let totalValue = 0;
        let known = 0;
        selected.forEach(({ title }) => {
            const v = getCardValue(title, null);
            if (v !== null) { totalValue += v; known++; }
        });
        updateTradeHelperUI(total, totalValue, known);
    }

    function updateTradeHelperUI(total, totalValue, known) {
        const modal = getOpenTradeModal();
        if (!modal) return;
        let helper = modal.querySelector('#wm-trade-helper');
        if (!helper) {
            helper = document.createElement('div');
            helper.id = 'wm-trade-helper';
            const inner = modal.querySelector('div.w-full.max-w-5xl') || modal.firstElementChild;
            if (!inner) return;
            const firstChild = inner.firstElementChild;
            if (firstChild && firstChild.nextSibling) {
                inner.insertBefore(helper, firstChild.nextSibling);
            } else {
                inner.appendChild(helper);
            }
        }
        const activeTab = modal.querySelector('button.border-b-2');
        const tabLabel = activeTab?.textContent?.trim() || 'Tab actif';
        const valueDisplay = known === 0
            ? (total === 0 ? '—' : '⏳')
            : (known < total ? `≈ ${totalValue} WB (${known}/${total})` : `≈ ${totalValue} WB`);
        helper.innerHTML = `
            <div class="wm-th-side">
                <span class="wm-th-label">${tabLabel}</span>
                <span class="wm-th-count">${total} carte${total > 1 ? 's' : ''} sélectionnée${total > 1 ? 's' : ''}</span>
            </div>
            <div class="wm-th-side" style="text-align: right;">
                <span class="wm-th-label">Valeur estimée</span>
                <span class="wm-th-value">${valueDisplay}</span>
            </div>
        `;
    }

    let tradeObserver = null;
    let tradeModalRef = null;
    setInterval(() => {
        const modal = getOpenTradeModal();
        if (modal) {
            if (tradeModalRef !== modal) {
                if (tradeObserver) { tradeObserver.disconnect(); tradeObserver = null; }
                tradeModalRef = modal;
                tradeObserver = new MutationObserver(() => {
                    clearTimeout(window._wmTradeDebounce);
                    window._wmTradeDebounce = setTimeout(computeTradeHelper, 200);
                });
                tradeObserver.observe(modal, { childList: true, subtree: true });
            }
            computeTradeHelper();
        } else {
            if (tradeObserver) { tradeObserver.disconnect(); tradeObserver = null; }
            tradeModalRef = null;
            const h = document.getElementById('wm-trade-helper');
            if (h) h.remove();
        }
    }, 1000);

    // ============================================================
    // PANNEAU DE CONTRÔLE
    // ============================================================
    let currentTab = 'tracked';

    function setActiveTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.wm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.wm-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.tab !== tabName));
        if (tabName === 'balance') renderBalanceUI();
    }

    function createControlPanel() {
        if (document.getElementById('wm-floating-toggle')) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'wm-floating-toggle';
        toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="wm-badge">0</span>
        `;
        document.body.appendChild(toggleBtn);

        const savedPos = getMenuPosition();
        if (savedPos) {
            toggleBtn.style.left = savedPos.left + 'px';
            toggleBtn.style.top = savedPos.top + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
        }

        const panel = document.createElement('div');
        panel.id = 'wm-control-panel';
        panel.innerHTML = `
            <div class="wm-panel-header">
                <span class="wm-panel-header-title">⚙️ Wiki-Masters Tools</span>
                <button class="wm-panel-close" id="wm-close-panel">✕</button>
            </div>
            <div class="wm-tabs">
                <button class="wm-tab active" data-tab="tracked">
                    <span class="wm-tab-icon">🔔</span>
                    <span>Suivi</span>
                    <span class="wm-tab-badge">0</span>
                </button>
                <button class="wm-tab" data-tab="balance">
                    <span class="wm-tab-icon">💰</span>
                    <span>Solde</span>
                </button>
                <button class="wm-tab" data-tab="bulk">
                    <span class="wm-tab-icon">🗑️</span>
                    <span>Bulk</span>
                </button>
                <button class="wm-tab" data-tab="tools">
                    <span class="wm-tab-icon">🛠️</span>
                    <span>Outils</span>
                </button>
                <button class="wm-tab" data-tab="tags">
                    <span class="wm-tab-icon">🏷️</span>
                    <span>Tags</span>
                </button>
                <button class="wm-tab" data-tab="trade">
                    <span class="wm-tab-icon">🤝</span>
                    <span>Trade</span>
                </button>
                <button class="wm-tab" data-tab="prefs">
                    <span class="wm-tab-icon">⚙️</span>
                    <span>Préfs</span>
                </button>
                <button class="wm-tab" data-tab="patchnotes">
                    <span class="wm-tab-icon">📝</span>
                    <span>MÀJ</span>
                </button>
            </div>

            <div class="wm-tab-content" data-tab="tracked">
                <div>
                    <div class="wm-section-title">Enchères suivies</div>
                    <div id="wm-tracked-list"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="balance">
                <div id="wm-balance-content">
                    <div class="wm-tracked-empty">Chargement...</div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="bulk">
                <div>
                    <div class="wm-section-title">Panier Bulk Delete</div>
                    <div id="wm-bulk-list-container"></div>
                    <div style="display:flex; gap:6px;">
                        <button id="wm-bulk-exec-btn" class="wm-panel-btn danger" style="flex:1;">Tout Défausser</button>
                        <button id="wm-bulk-clear-btn" class="wm-panel-btn ghost">Vider</button>
                    </div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="tools">
                <div>
                    <div class="wm-section-title">Diagnostic Serveur</div>
                    <div class="wm-ping-box">
                        <span>Latence API : <span id="wm-ping-val" style="color:#fbbf24;">-- ms</span></span>
                        <button id="wm-ping-btn" class="wm-panel-btn" style="padding:6px 12px;">Ping</button>
                    </div>
                </div>
                <div>
                    <div class="wm-section-title">Scan des prix</div>
                    <button id="wm-scan-prices-btn" class="wm-panel-btn" style="width: 100%;">🔍 Scanner toute la collection</button>
                    <button id="wm-scan-prices-cancel" class="wm-panel-btn danger" style="width: 100%; margin-top: 6px; display: none;">⏹️ Annuler le scan</button>
                    <div id="wm-scan-progress" style="margin-top: 8px; font-size: 11px; font-family: monospace; color: #94a3b8; min-height: 16px;"></div>
                </div>
                <div>
                    <div class="wm-section-title">Recherche par ID de carte</div>
                    <div class="wm-input-group">
                        <input type="text" id="wm-card-id-input" class="wm-panel-input" placeholder="Coller l'UUID...">
                        <button id="wm-search-btn" class="wm-panel-btn">Chercher</button>
                    </div>
                    <div id="wm-result-box" style="margin-top:8px; padding:8px; background:rgba(30,41,59,0.6); border-radius:6px; font-size:11px; font-family:monospace; min-height:40px; color:#94a3b8;">Entrez un ID pour voir les infos...</div>
                </div>
                <div>
                    <div class="wm-section-title">Logs en direct</div>
                    <div id="wm-log-box"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="tags">
                <div class="wm-section-title">Gestionnaire de Tags</div>

                <!-- Toggle Auto-Tag -->
                <div class="wm-auto-tag-panel">
                    <span class="wm-auto-tag-lbl">⚡ Auto-Tag à l'ouverture des packs</span>
                    <label style="display:flex; align-items:center; cursor:pointer;">
                        <input type="checkbox" id="wm-toggle-autotag" style="width:16px; height:16px; accent-color:#10b981;">
                    </label>
                </div>
                <div>
                    <div class="wm-section-title">Mes étiquettes</div>
                    <div id="wm-tags-list" style="background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:8px;padding:8px;font-size:12px;max-height:180px;overflow-y:auto;margin-bottom:8px;">
            <div class="wm-tracked-empty">Chargement...</div>
                    </div>
                    <div class="wm-input-group" style="margin-bottom:6px;">
                        <input type="text" id="wm-new-tag-name" class="wm-panel-input" placeholder="Nouvelle étiquette...">
                        <input type="color" id="wm-new-tag-color" value="#6366f1" style="width:42px;height:38px;padding:2px;border-radius:8px;border:1px solid rgba(148,163,184,0.15);background:rgba(30,41,59,0.6);cursor:pointer;">
                    </div>
                    <button id="wm-add-tag-btn" class="wm-panel-btn" style="width:100%;">➕ Créer l'étiquette</button>
                </div>

                <div>
                    <div class="wm-section-title">Règles d'auto-tagging</div>
                    <div id="wm-rules-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
                    <button id="wm-add-rule-btn" class="wm-panel-btn ghost" style="width:100%;">➕ Ajouter une règle</button>
                </div>

                <div>
                    <div class="wm-section-title">Application</div>

                    <div class="wm-pref-row" style="padding:4px 0;">
                        <label for="wm-tag-mode-page" style="font-size:11px;">📄 Page actuelle uniquement</label>
                        <input type="checkbox" id="wm-tag-mode-page">
                    </div>
                    <div id="wm-tag-mode-hint" style="font-size:10px;color:#64748b;font-family:monospace;margin-bottom:8px;">
                        Mode complet : parcourt toute la collection (long).<br>
                        Mode page : traite uniquement les cartes affichées.
                    </div>

                    <div id="wm-tag-run-summary" style="font-size:11px;font-family:monospace;color:#94a3b8;min-height:40px;background:rgba(2,6,23,0.5);border-radius:6px;padding:8px;margin-bottom:8px;">Prêt.</div>

                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button id="wm-tag-preview-btn" class="wm-panel-btn" style="flex:1;">🔍 Prévisualiser</button>
                        <button id="wm-tag-apply-btn" class="wm-panel-btn danger" style="flex:1;" disabled>🚀 Appliquer</button>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button id="wm-tag-pause-btn" class="wm-panel-btn ghost" style="flex:1;display:none;">⏸️ Pause</button>
                        <button id="wm-tag-cancel-btn" class="wm-panel-btn ghost" style="flex:1;display:none;">⏹️ Annuler</button>
                    </div>
                </div>
            </div>

            <!-- ONGLET SMART TRADE -->
            <div class="wm-tab-content hidden" data-tab="trade" style="position: relative;">

                <!-- VUE 1 : LISTE DES ROUTINES -->
                <div id="wm-st-main-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="wm-section-title">Mes Routines d'Échange</div>
                    <div class="wm-st-list" id="wm-st-routines-list">
                        <div class="wm-tracked-empty">Aucune routine configurée.</div>
                    </div>
                    <button id="wm-st-btn-new" class="wm-panel-btn" style="margin-top: 10px; width: 100%;">+ Créer une routine d'échange</button>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="prefs">
                <div>
                    <div class="wm-section-title">Notifications</div>
                    <div class="wm-pref-row"><label for="wm-pref-browser">Notification navigateur</label><input type="checkbox" id="wm-pref-browser" ${getPrefs().browser ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-toast">Toast in-page</label><input type="checkbox" id="wm-pref-toast" ${getPrefs().toast ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-sound">Son (triple bip)</label><input type="checkbox" id="wm-pref-sound" ${getPrefs().sound ? 'checked' : ''}></div>
                </div>
                <div>
                    <div class="wm-section-title">Délais</div>
                    <div class="wm-pref-row"><label for="wm-pref-trigger">Délai par défaut (s)</label><input type="number" id="wm-pref-trigger" value="${getPrefs().defaultTriggerBefore}" min="5" max="3600"></div>
                    <div class="wm-pref-row"><label for="wm-pref-refresh">Refresh end_at (s)</label><input type="number" id="wm-pref-refresh" value="${getPrefs().refreshInterval}" min="10" max="300"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="patchnotes">
                <div>
                    <div class="wm-section-title">Historique des mises à jour</div>
                    <div id="wm-patch-notes-list" style="overflow-y: auto; max-height: 380px; padding-right: 4px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        function repositionPanel() {
            const btnRect = toggleBtn.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            let left = btnRect.left;
            let top = btnRect.top - panelRect.height - 12;
            if (top < 12) top = btnRect.bottom + 12;
            if (top + panelRect.height > window.innerHeight - 12) {
                top = window.innerHeight - panelRect.height - 12;
            }
            if (left + panelRect.width > window.innerWidth - 12) {
                left = window.innerWidth - panelRect.width - 12;
            }
            if (left < 12) left = 12;
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        }

        let dragState = { isDown: false, startX: 0, startY: 0, btnStartX: 0, btnStartY: 0, longPressTimer: null, isDragging: false };

        toggleBtn.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = toggleBtn.getBoundingClientRect();
            dragState.isDown = true;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.btnStartX = rect.left;
            dragState.btnStartY = rect.top;
            dragState.isDragging = false;

            dragState.longPressTimer = setTimeout(() => {
                dragState.isDragging = true;
                toggleBtn.classList.add('wm-dragging');
            }, 250);

            toggleBtn.setPointerCapture(e.pointerId);
        });

        toggleBtn.addEventListener('pointermove', (e) => {
            if (!dragState.isDown || !dragState.isDragging) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            let newLeft = dragState.btnStartX + dx;
            let newTop = dragState.btnStartY + dy;
            newLeft = Math.max(4, Math.min(window.innerWidth - toggleBtn.offsetWidth - 4, newLeft));
            newTop = Math.max(4, Math.min(window.innerHeight - toggleBtn.offsetHeight - 4, newTop));
            toggleBtn.style.left = newLeft + 'px';
            toggleBtn.style.top = newTop + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
            if (panel.classList.contains('show')) repositionPanel();
        });

        toggleBtn.addEventListener('pointerup', () => {
            clearTimeout(dragState.longPressTimer);
            if (dragState.isDown && !dragState.isDragging) {
                if (panel.classList.contains('show')) {
                    panel.classList.remove('show');
                    toggleBtn.classList.remove('wm-menu-open');
                } else {
                    panel.classList.add('show');
                    toggleBtn.classList.add('wm-menu-open');
                    repositionPanel();
                    if (currentTab === 'balance') renderBalanceUI();
                }
            } else if (dragState.isDragging) {
                const rect = toggleBtn.getBoundingClientRect();
                saveMenuPosition({ left: rect.left, top: rect.top });
            }
            dragState.isDown = false;
            dragState.isDragging = false;
            toggleBtn.classList.remove('wm-dragging');
        });

        toggleBtn.addEventListener('pointercancel', () => {
            clearTimeout(dragState.longPressTimer);
            dragState.isDown = false;
            dragState.isDragging = false;
            toggleBtn.classList.remove('wm-dragging');
        });

        document.querySelectorAll('.wm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                setActiveTab(tab.dataset.tab);
                if (panel.classList.contains('show')) repositionPanel();
            });
        });

        document.getElementById('wm-close-panel').addEventListener('click', () => {
            panel.classList.remove('show');
            toggleBtn.classList.remove('wm-menu-open');
        });

        const savePrefsFromUI = () => {
            savePrefs({
                browser: document.getElementById('wm-pref-browser').checked,
                toast: document.getElementById('wm-pref-toast').checked,
                sound: document.getElementById('wm-pref-sound').checked,
                siteNotifs: true,
                refreshInterval: parseInt(document.getElementById('wm-pref-refresh').value, 10) || 30,
                defaultTriggerBefore: parseInt(document.getElementById('wm-pref-trigger').value, 10) || 60
            });
            logToPanel('⚙️ Préférences sauvegardées');
        };
        ['wm-pref-browser', 'wm-pref-toast', 'wm-pref-sound', 'wm-pref-trigger', 'wm-pref-refresh'].forEach(id => {
            document.getElementById(id).addEventListener('change', savePrefsFromUI);
        });

        document.getElementById('wm-ping-btn').addEventListener('click', async () => {
            const valDisplay = document.getElementById('wm-ping-val');
            valDisplay.innerText = "Calcul...";
            valDisplay.style.color = "#fbbf24";
            const start = performance.now();
            try {
                await fetch('https://www.wiki-masters.com/api/my-collection?page=0', { method: 'GET', credentials: 'include' });
                const diff = Math.round(performance.now() - start);
                valDisplay.innerText = `${diff} ms`;
                valDisplay.style.color = diff > 2000 ? "#ef4444" : (diff > 800 ? "#fbbf24" : "#10b981");
                logToPanel(`🏓 Ping Serveur : ${diff} ms`);
            } catch(e) {
                valDisplay.innerText = "Erreur"; valDisplay.style.color = "#ef4444";
            }
        });

        document.getElementById('wm-bulk-clear-btn').addEventListener('click', () => {
            saveBulkList([]); updateBulkUI(); logToPanel("🗑️ Panier Bulk vidé.");
            document.querySelectorAll('.wm-btn-bulk').forEach(btn => {
                btn.classList.remove('wm-btn-bulk-active');
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
            });
        });

        document.getElementById('wm-bulk-exec-btn').addEventListener('click', async () => {
            const list = getBulkList();
            if (list.length === 0) return;

            logToPanel(`🚀 Lancement Bulk Delete (${list.length} cartes)...`);

            const readyToDelete = [];
            const remainingList = [];
            let resolvedFromIndex = 0;
            let resolvedFromApi = 0;

            // ---- Phase 1 : résolution des user_card_id ----
            for (const item of list) {
                const title = typeof item === 'string' ? item : item.title;
                const cardId = typeof item === 'object' ? item.id : null;
                let userCardId = typeof item === 'object' ? item.userCardId : null;

                // Si déjà résolu (ajouté avec succès via toggleBulkForCard)
                if (userCardId) {
                    readyToDelete.push({ title, userCardId, cardId });
                    resolvedFromIndex++;
                    continue;
                }

                // Sinon, tente la résolution
                userCardId = await wmResolveUserCardId(cardId, title);

                if (userCardId) {
                    readyToDelete.push({ title, userCardId, cardId });
                    resolvedFromApi++;
                } else {
                    logToPanel(`⚠️ "${title}" — impossible de résoudre user_card_id`);
                    remainingList.push({ title, id: cardId, userCardId: null });
                }
            }

            logToPanel(`🔎 Résolution : ${resolvedFromIndex} depuis l'index, ${resolvedFromApi} via API, ${remainingList.length} échecs`);

            // ---- Phase 2 : appel bulk delete ----
            if (readyToDelete.length > 0) {
                logToPanel(`[API] ⚡ Exécution globale (${readyToDelete.length} cartes)...`);
                const userCardIds = readyToDelete.map(item => item.userCardId);
                const result = await executeBulkDiscard(userCardIds);

                if (result && result.success) {
                    logToPanel(`✅ Succès : ${result.count} défaussées (solde : ${result.balance ?? '?'} WB)`);
                    showWMToast(`Suppression réussie ! +${result.count} WB`, true);

                    for (const item of readyToDelete) {
                        markCardAsProcessedByTitle(item.title);
                        if (typeof userCardIdCache !== 'undefined') userCardIdCache.delete(item.title);
                        if (window.wmInventoryMap) delete window.wmInventoryMap[item.title];
                    }

                    // Met à jour le solde si dispo
                    if (typeof result.balance === 'number') {
                        recordBalance(result.balance, 'bulk_discard');
                    }
                } else {
                    logToPanel(`[API] ❌ Échec de la requête (status ${result?.status || 'inconnu'})`);
                    showWMToast("Erreur API lors de la défausse groupée.", false);
                    // Remet les cartes en attente
                    readyToDelete.forEach(item => remainingList.push({
                        title: item.title, id: item.cardId, userCardId: item.userCardId
                    }));
                }
            } else {
                logToPanel(`❌ Aucune carte valide prête à être défaussée.`);
            }

            // ---- Phase 3 : nettoyage ----
            saveBulkList(remainingList);
            updateBulkUI();
            logToPanel(`🏁 Bulk terminé. ${remainingList.length} restante(s).`);
            if (typeof updateAllBulkButtonsUI === 'function') updateAllBulkButtonsUI();
        });
        document.getElementById('wm-search-btn').addEventListener('click', async () => {
            const uuid = document.getElementById('wm-card-id-input').value.trim();
            const resultBox = document.getElementById('wm-result-box');
            if (!uuid) return;
            resultBox.innerHTML = '<span style="color:#fbbf24;">Recherche...</span>';
            try {
                const res = await fetch(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                    credentials: "include", method: "GET", headers: { "Accept": "application/json" }
                });
                const data = await res.json();
                if (data && data.wikipedia_title) {
                    resultBox.innerHTML = `<b>${data.wikipedia_title}</b><br>${JSON.stringify(data.summary || "Aucune vente")}`;
                } else { resultBox.innerHTML = '<span style="color:#ef4444;">Carte introuvable.</span>'; }
            } catch (e) { resultBox.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>'; }
        });


        const scanBtn = document.getElementById('wm-scan-prices-btn');
        const scanCancelBtn = document.getElementById('wm-scan-prices-cancel');
        if (scanBtn) scanBtn.addEventListener('click', () => runPriceScan());
        if (scanCancelBtn) scanCancelBtn.addEventListener('click', () => {
            if (wmScanState.running) {
                wmScanState.cancelled = true;
                logToPanel('⏹️ Demande d\'annulation envoyée...');
            }
        });

        // Rendu des Patch Notes
        function renderPatchNotes() {
            const container = document.getElementById('wm-patch-notes-list');
            if (!container) return;

            // Le tableau est parcouru dans l'ordre (le plus récent en premier si tu les ajoutes en haut du tableau WM_PATCH_NOTES)
            container.innerHTML = WM_PATCH_NOTES.map(pn => `
                <div class="wm-patch-item">
                    <div class="wm-patch-header">
                        <span class="wm-patch-version">v${pn.version}</span>
                        <span class="wm-patch-date">${pn.date}</span>
                    </div>
                    <ul class="wm-patch-changes">
                        ${pn.changes.map(change => `<li>${change}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
        }

        // ============================================================
        // LOGIQUE SMART TRADE (Routines & Grande Modale)
        // ============================================================

        let stCurrentTrade = null;
        let stSelectedMe = [];
        let stSelectedThem = [];

        // 1. Injection de la Grande Modale dans le body
        const stOverlay = document.createElement('div');
        stOverlay.id = 'wm-st-overlay';
        stOverlay.innerHTML = `
            <div class="wm-st-large-modal">
                <div class="wm-panel-header" style="background:none; border-bottom: 1px solid rgba(255,255,255,0.1); padding:0 0 12px 0;">
                    <span class="wm-panel-header-title" id="wm-st-modal-title" style="font-size: 18px;">Nouvelle Routine</span>
                    <button class="wm-panel-close" id="wm-st-overlay-close" style="font-size: 24px;">✕</button>
                </div>

                <!-- VUE CRÉATION -->
                <div id="wm-st-modal-create" style="display:none; flex-direction: column; gap: 16px; overflow-y: auto;">
                    <div style="display: flex; gap: 16px;">
                        <div style="flex:1;">
                            <label style="font-size:12px; color:#cbd5e1; font-weight:bold;">Nom du Trade</label>
                            <input type="text" id="wm-st-input-name" class="wm-panel-input" placeholder="Ex: Razzia d'Astéroïdes" style="width:100%; margin-top:6px;">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:12px; color:#cbd5e1; font-weight:bold;">Ami cible</label>
                            <select id="wm-st-input-friend" class="wm-panel-input" style="width:100%; margin-top:6px;">
                                <option value="">⏳ Chargement de la liste d'amis...</option>
                            </select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 16px;">
                        <div style="flex:1; background: rgba(79, 70, 229, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 8px; padding: 12px;">
                            <label style="font-size:12px; color:#a5b4fc; font-weight:bold;">Mots-clés de SES cartes (Que je veux)</label>
                            <input type="text" id="wm-st-input-keywords-them" class="wm-panel-input" placeholder="Ex: astéroïde, espace, lune" style="width:100%; margin-top:6px;">
                        </div>
                        <div style="flex:1; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; padding: 12px;">
                            <label style="font-size:12px; color:#94a3b8; font-weight:bold;">Mots-clés de MES cartes (À donner)</label>
                            <input type="text" id="wm-st-input-keywords-me" class="wm-panel-input" placeholder="Ex: double, commun" style="width:100%; margin-top:6px;">
                        </div>
                    </div>
                    <button id="wm-st-btn-save" class="wm-panel-btn" style="margin-top: 10px; font-size: 14px; padding: 12px;">💾 Enregistrer la routine</button>
                </div>

                <!-- VUE EXÉCUTION -->
                <div id="wm-st-modal-run" style="display:none; flex-direction: column; gap: 16px; flex:1; min-height:0;">
                    <div style="font-size: 13px; color: #fbbf24; text-align: center; font-weight: bold;" id="wm-st-run-status">
                        Prêt à scanner.
                    </div>

                    <div class="wm-trade-container" style="margin:0; gap:16px;">
                        <!-- Colonne MOI -->
                        <div class="wm-trade-side" style="padding:12px;">
                            <div class="wm-trade-header" style="font-size:14px;">
                                <span id="wm-st-header-me" style="cursor:help;">Moi ❓</span>
                                <span class="wm-trade-val" id="wm-run-my-val" style="font-size:16px;">0 WB</span>
                            </div>
                            <div class="wm-trade-list" id="wm-run-my-list" style="min-height: 180px;"></div>
                            <button class="wm-panel-btn ghost" id="wm-run-btn-browse-me" style="padding:8px; font-size:12px;">+ Parcourir ma collection</button>
                            <div class="wm-trade-wb-container">
                                <span class="wm-trade-wb-label">WB ajoutés :</span>
                                <input type="number" id="wm-run-my-wb" class="wm-trade-wb-input" value="0" min="0">
                            </div>
                        </div>

                        <!-- Colonne AMI -->
                        <div class="wm-trade-side" style="padding:12px;">
                            <div class="wm-trade-header" style="font-size:14px;">
                                <span id="wm-st-header-them" style="cursor:help;"><span id="wm-st-lbl-friend">L'ami</span> ❓</span>
                                <span class="wm-trade-val" id="wm-run-their-val" style="font-size:16px;">0 WB</span>
                            </div>
                            <div class="wm-trade-list" id="wm-run-their-list" style="min-height: 180px;"></div>
                            <button class="wm-panel-btn ghost" id="wm-run-btn-browse-them" style="padding:8px; font-size:12px;">+ Parcourir sa collection</button>
                            <div class="wm-trade-wb-container">
                                <span class="wm-trade-wb-label">WB demandés :</span>
                                <input type="number" id="wm-run-their-wb" class="wm-trade-wb-input" value="0" min="0">
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; gap:12px;">
                        <button id="wm-st-run-start" class="wm-panel-btn ghost" style="flex:1; font-size:14px; padding:12px;">🔄 Lancer l'auto-scan</button>
                        <button id="wm-st-run-send" class="wm-panel-btn" style="flex:2; font-size:14px; padding:12px; background: linear-gradient(135deg, #10b981, #059669);" disabled>Envoyer</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(stOverlay);

        // 2. Fonctions Utilitaires & Identité Dynamique
        // 2. Fonctions Utilitaires & Identité Dynamique
        async function ensureIdentity() {
            // Si on a déjà les deux infos, pas besoin de refaire l'appel
            if (window.wmUsername && window.wmUserId) return true;

            try {
                const res = await fetch("https://www.wiki-masters.com/api/friends", { credentials: "include" });
                const data = await res.json();
                const friendships = data.friendships || [];

                if (friendships.length > 0) {
                    const counts = {};
                    const idMap = {}; // On crée une carte pour lier le pseudo à l'ID

                    friendships.forEach(f => {
                        if (f.requester) {
                            counts[f.requester.username] = (counts[f.requester.username] || 0) + 1;
                            idMap[f.requester.username] = f.requester.id;
                        }
                        if (f.addressee) {
                            counts[f.addressee.username] = (counts[f.addressee.username] || 0) + 1;
                            idMap[f.addressee.username] = f.addressee.id;
                        }
                    });

                    // Le pseudo qui apparaît le plus est le tien
                    const myName = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
                    window.wmUsername = myName;
                    window.wmUserId = idMap[myName]; // On sauvegarde l'ID !

                    console.log(`[WM-Trade] Identité confirmée : ${window.wmUsername} (${window.wmUserId})`);
                    return true;
                }
            } catch (e) {
                console.error("[WM-Trade] Identité introuvable:", e);
            }
            return false;
        }

        function getCardPrice(title, rarity) {
            if (!title) return 0;
            // Normalisation pour chercher dans le cache des prix du script principal
            const summary = window.wmPrices[title];
            if (summary && summary[rarity] !== undefined) {
                if (typeof summary[rarity] === 'object' && summary[rarity].average !== undefined) {
                    return summary[rarity].average;
                }
                if (typeof summary[rarity] === 'number') {
                    return summary[rarity];
                }
            }
            return 0; // Valeur par défaut si le prix n'est pas en cache
        }

        function updateTradeRunUI() {
            const listMe = document.getElementById('wm-run-my-list');
            const listThem = document.getElementById('wm-run-their-list');

            let sumMe = 0;
            listMe.innerHTML = stSelectedMe.map((c, i) => {
                const title = c.card?.wikipedia_title || 'Carte sans titre';
                const rarity = c.card?.rarity || 'C';
                const price = getCardPrice(title, rarity);
                sumMe += price;

                return `<div class="wm-trade-item">
                    <span class="wm-trade-item-title" title="${title}">[${rarity}] ${title}</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:#fbbf24;">${price} WB</span>
                        <button class="wm-trade-preview-trigger" data-side="me" data-idx="${i}" style="background:none; border:none; cursor:pointer; font-size:12px;" title="Aperçu">🔍</button>
                        <button class="wm-trade-del-trigger" data-side="me" data-idx="${i}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:12px;" title="Supprimer">✕</button>
                    </div>
                </div>`;
            }).join('');

            let sumThem = 0;
            listThem.innerHTML = stSelectedThem.map((c, i) => {
                const title = c.card?.wikipedia_title || 'Carte sans titre';
                const rarity = c.card?.rarity || 'C';
                const price = getCardPrice(title, rarity);
                sumThem += price;

                return `<div class="wm-trade-item">
                    <span class="wm-trade-item-title" title="${title}">[${rarity}] ${title}</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:#fbbf24;">${price} WB</span>
                        <button class="wm-trade-preview-trigger" data-side="them" data-idx="${i}" style="background:none; border:none; cursor:pointer; font-size:12px;" title="Aperçu">🔍</button>
                        <button class="wm-trade-del-trigger" data-side="them" data-idx="${i}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; font-size:12px;" title="Supprimer">✕</button>
                    </div>
                </div>`;
            }).join('');

            document.getElementById('wm-run-my-val').textContent = `${sumMe} WB`;
            document.getElementById('wm-run-their-val').textContent = `${sumThem} WB`;

            const diff = sumMe - sumThem;
            const inputMyWb = document.getElementById('wm-run-my-wb');
            const inputTheirWb = document.getElementById('wm-run-their-wb');
            const btnSend = document.getElementById('wm-st-run-send');

            if (inputMyWb && inputTheirWb) {
                if (parseInt(inputMyWb.value || 0, 10) === 0 && parseInt(inputTheirWb.value || 0, 10) === 0) {
                    if (diff > 0) inputTheirWb.value = diff;
                    else if (diff < 0) inputMyWb.value = Math.abs(diff);
                }
            }

            btnSend.disabled = (stSelectedMe.length === 0 && stSelectedThem.length === 0);
            btnSend.textContent = "Envoyer";
        }

        function openStModal(mode, trade = null) {
            stOverlay.classList.add('show');
            const vCreate = document.getElementById('wm-st-modal-create');
            const vRun = document.getElementById('wm-st-modal-run');
            const title = document.getElementById('wm-st-modal-title');

            if (mode === 'create') {
                title.textContent = '✨ Nouvelle Routine';
                vCreate.style.display = 'flex';
                vRun.style.display = 'none';

                document.getElementById('wm-st-input-name').value = '';
                document.getElementById('wm-st-input-keywords-me').value = '';
                document.getElementById('wm-st-input-keywords-them').value = '';
                fetchFriendsForSelect();
            } else if (mode === 'run') {
                title.textContent = `🤝 Exécution : ${trade.name}`;
                vCreate.style.display = 'none';
                vRun.style.display = 'flex';

                document.getElementById('wm-st-lbl-friend').textContent = trade.friendName;
            }
        }

        function closeStModal() {
            const overlay = document.getElementById('wm-st-overlay');
            if (overlay) overlay.classList.remove('show');
        }

        // 4. Récupération des Amis et du Rendu Menu
        async function fetchFriendsForSelect() {
            const select = document.getElementById('wm-st-input-friend');
            select.innerHTML = '<option value="">⏳ Chargement...</option>';
            try {
                await ensureIdentity();
                const res = await fetch("https://www.wiki-masters.com/api/friends", { credentials: "include" });
                const data = await res.json();

                const friends = (data.friendships || [])
                    .filter(f => f.status === 'accepted')
                    .map(f => {
                        const isRequesterMe = f.requester.username === window.wmUsername;
                        return isRequesterMe ? f.addressee : f.requester;
                    });

                if (friends.length === 0) { select.innerHTML = '<option value="">Aucun ami trouvé</option>'; return; }

                select.innerHTML = '<option value="">-- Choisir un ami --</option>' +
                    friends.map(fr => `<option value="${fr.id}" data-name="${fr.username}">${fr.username}</option>`).join('');
            } catch (e) {
                select.innerHTML = '<option value="">❌ Erreur chargement amis</option>';
            }
        }

        function renderSmartTradesList() {
            const container = document.getElementById('wm-st-routines-list');
            if (!container) return;
            const trades = getSmartTrades();

            if (trades.length === 0) { container.innerHTML = '<div class="wm-tracked-empty">Aucune routine configurée.</div>'; return; }

            container.innerHTML = trades.map(t => `
                <div class="wm-st-card">
                    <div class="wm-st-header">
                        <span class="wm-st-title">${t.name}</span>
                        <span class="wm-st-friend">👤 ${t.friendName}</span>
                    </div>
                    <div class="wm-st-rules">
                        <div class="wm-st-rule">Je veux : <span>${t.keywordsThem || 'Tout'}</span></div>
                        <div class="wm-st-rule">Je donne : <span>${t.keywordsMe || 'Tout'}</span></div>
                    </div>
                    <div class="wm-st-actions">
                        <button class="wm-panel-btn wm-st-run-btn" data-id="${t.id}" style="flex:1;">▶ Lancer</button>
                        <button class="wm-panel-btn ghost wm-st-del-btn" data-id="${t.id}" style="padding: 4px 8px; color: #ef4444;">🗑️</button>
                    </div>
                </div>
            `).join('');
        }

        // 5. Moteur d'Auto-Scan API avec Gestion d'Erreur Visible
        async function fetchCollectionByKeyword(username, keywords, isMe) {
            if (!keywords || keywords.trim() === '') return []; // Scan ignoré si vide

            // Séparation des mots-clés par des virgules pour faire une recherche par terme
            const kws = keywords.split(',').map(k => k.trim()).filter(k => k);
            let foundCardsMap = new Map(); // Utilisation d'une Map pour éviter les doublons si une carte matche 2 mots-clés différents

            for (const kw of kws) {
                const encodedKw = encodeURIComponent(kw);

                // On boucle sur les pages du résultat de recherche (max 5 pages de résultats purs)
                for (let p = 0; p < 5; p++) {
                    try {
                        const url = isMe
                            ? `https://www.wiki-masters.com/api/my-collection?sort=rarity&stats=0&page=${p}&q=${encodedKw}`
                            : `https://www.wiki-masters.com/api/profile/${username}/collection?sort=rarity&page=${p}&q=${encodedKw}`;

                        const res = await fetch(url, { credentials: "include" });

                        if (!res.ok) {
                            const errText = await res.text();
                            let errMsg = `Erreur HTTP ${res.status}`;
                            try { errMsg = JSON.parse(errText).error || errMsg; } catch(e){}
                            throw new Error(errMsg);
                        }

                        const data = await res.json();
                        if (!data.collection || data.collection.length === 0) break; // Fin des résultats pour ce mot-clé

                        // Le serveur a déjà fait le tri, on ajoute tout ce qu'il renvoie
                        data.collection.forEach(c => {
                            if (!foundCardsMap.has(c.id)) foundCardsMap.set(c.id, c);
                        });

                        // Si la page contient moins de 20 cartes, c'est forcément la dernière page de la recherche
                        if (data.collection.length < 20) break;

                    } catch (e) {
                        console.error(`[WM-Trade] Erreur scan page ${p} pour ${username} avec le mot-clé "${kw}":`, e);
                        if (p === 0) throw e; // On remonte l'erreur uniquement si c'est la toute première page qui plante
                        break;
                    }
                }
            }
            return Array.from(foundCardsMap.values());
        }

        async function runAutoScan() {
            if (!stCurrentTrade) return;
            const btn = document.getElementById('wm-st-run-start');
            const status = document.getElementById('wm-st-run-status');

            try {
                btn.disabled = true;
                btn.textContent = "⏳ Scan en cours...";
                status.textContent = "1/3 : Vérification de votre profil...";
                status.style.color = "#60a5fa";

                const isIdentified = await ensureIdentity();
                if (!isIdentified) throw new Error("Impossible de trouver votre pseudo.");

                status.textContent = `2/3 : Recherche chez ${stCurrentTrade.friendName}...`;
                // isMe = false
                const theirCards = await fetchCollectionByKeyword(stCurrentTrade.friendName, stCurrentTrade.keywordsThem, false);

                status.textContent = "3/3 : Recherche dans votre collection...";
                // isMe = true
                const myCards = await fetchCollectionByKeyword(window.wmUsername, stCurrentTrade.keywordsMe, true);

                // Ajout au panier global (sans doublons avec les cartes déjà présentes dans les listes)
                stSelectedThem = [...stSelectedThem, ...theirCards.filter(nc => !stSelectedThem.find(oc => oc.id === nc.id))];
                stSelectedMe = [...stSelectedMe, ...myCards.filter(nc => !stSelectedMe.find(oc => oc.id === nc.id))];

                updateTradeRunUI();

                btn.disabled = false;
                btn.textContent = "🔄 Relancer le scan";
                status.textContent = `✅ Scan terminé : ${myCards.length} cartes trouvées chez vous, ${theirCards.length} chez lui.`;
                status.style.color = "#10b981";
            } catch (error) {
                console.error("[WM-Trade] Erreur Auto-Scan:", error);
                btn.disabled = false;
                btn.textContent = "🔄 Réessayer";
                status.textContent = `❌ Erreur : ${error.message}`;
                status.style.color = "#ef4444";
            }
        }

        // 6. Délégation d'événements Globale
        document.addEventListener('click', (e) => {
            // Création
            if (e.target.id === 'wm-st-btn-new') openStModal('create');
            // Fermeture
            else if (e.target.id === 'wm-st-overlay-close' || e.target === stOverlay) stOverlay.classList.remove('show');
            // Sauvegarde
            else if (e.target.id === 'wm-st-btn-save') {
                const name = document.getElementById('wm-st-input-name').value.trim();
                const friendSelect = document.getElementById('wm-st-input-friend');
                const friendId = friendSelect.value;
                const friendName = friendSelect.options[friendSelect.selectedIndex]?.dataset.name || 'Ami inconnu';
                const kwThem = document.getElementById('wm-st-input-keywords-them').value.trim();
                const kwMe = document.getElementById('wm-st-input-keywords-me').value.trim();

                if (!name || !friendId) return alert("Le nom et l'ami sont obligatoires !");

                const trades = getSmartTrades();
                trades.push({ id: Date.now().toString(), name, friendId, friendName, keywordsThem: kwThem, keywordsMe: kwMe });
                saveSmartTrades(trades);
                renderSmartTradesList();
                stOverlay.classList.remove('show');
            }
            // Supprimer Routine
            else if (e.target.closest('.wm-st-del-btn')) {
                const btn = e.target.closest('.wm-st-del-btn');
                saveSmartTrades(getSmartTrades().filter(tr => tr.id !== btn.dataset.id));
                renderSmartTradesList();
            }
            // Lancer Routine depuis le petit menu
            // Clic sur l'ouverture d'une routine (pour injecter les titres dans les tooltips ❓)
            else if (e.target.closest('.wm-st-run-btn')) {
                const btn = e.target.closest('.wm-st-run-btn');
                const trade = getSmartTrades().find(tr => tr.id === btn.dataset.id);
                if (trade) {
                    stCurrentTrade = trade;
                    stSelectedMe = [];
                    stSelectedThem = [];

                    // Assignation propre des tooltips au survol
                    document.getElementById('wm-st-header-me').title = `Filtre actif : ${trade.keywordsMe || 'Aucun'}`;
                    document.getElementById('wm-st-header-them').title = `Filtre actif : ${trade.keywordsThem || 'Aucun'}`;

                    document.getElementById('wm-st-run-status').textContent = "Prêt à scanner.";
                    document.getElementById('wm-st-run-status').style.color = "#fbbf24";

                    updateTradeRunUI();
                    openStModal('run', trade);
                }
            }

            // Gestion de la suppression d'une carte avec mini-confirmation
            else if (e.target.closest('.wm-trade-del-trigger')) {
                const btn = e.target.closest('.wm-trade-del-trigger');
                const side = btn.dataset.side;
                const idx = parseInt(btn.dataset.idx, 10);

                if (btn.dataset.confirm === "true") {
                    if (side === 'me') stSelectedMe.splice(idx, 1);
                    else stSelectedThem.splice(idx, 1);
                    updateTradeRunUI();
                } else {
                    btn.dataset.confirm = "true";
                    btn.textContent = "Confirmer ?";
                    btn.style.color = "#fbbf24";
                    setTimeout(() => {
                        if (btn) {
                            btn.dataset.confirm = "false";
                            btn.textContent = "✕";
                            btn.style.color = "#ef4444";
                        }
                    }, 2500);
                }
            }

            // Boutons "+ Parcourir" (Ouvre une alerte / input temporaire pour ajouter par ID ou mot-clé manuel en attendant le navigateur complet)
            else if (e.target.id === 'wm-run-btn-browse-me' || e.target.id === 'wm-run-btn-browse-them') {
                const side = e.target.id.includes('me') ? 'me' : 'them';
                const keyword = prompt(`Entrez un mot-clé précis pour ajouter des cartes (${side === 'me' ? 'vos' : 'ses'} cartes) :`);
                if (keyword) {
                    const username = side === 'me' ? window.wmUsername : stCurrentTrade.friendName;
                    fetchCollectionByKeyword(username, keyword, side === 'me').then(cards => {
                        if (cards.length === 0) {
                            alert("Aucune carte trouvée avec ce mot-clé.");
                            return;
                        }
                        if (side === 'me') {
                            stSelectedMe = [...stSelectedMe, ...cards.filter(nc => !stSelectedMe.find(oc => oc.id === nc.id))];
                        } else {
                            stSelectedThem = [...stSelectedThem, ...cards.filter(nc => !stSelectedThem.find(oc => oc.id === nc.id))];
                        }
                        updateTradeRunUI();
                    });
                }
            }

            // Boutons d'Exécution interne
            else if (e.target.id === 'wm-st-run-start') {
                runAutoScan();
            }
            // Croix pour enlever une carte
            else if (e.target.closest('.wm-trade-item-remove')) {
                const btn = e.target.closest('.wm-trade-item-remove');
                const side = btn.dataset.side;
                const idx = parseInt(btn.dataset.idx, 10);
                if (side === 'me') stSelectedMe.splice(idx, 1);
                else stSelectedThem.splice(idx, 1);
                updateTradeRunUI();
            }

            // Clic sur le bouton Envoyer de la modale Trade
            else if (e.target.id === 'wm-st-run-send') {
                sendSmartTrade();
            }

            // Clic sur la loupe 🔍 pour la preview
            else if (e.target.closest('.wm-trade-preview-trigger')) {
                const btn = e.target.closest('.wm-trade-preview-trigger');
                const side = btn.dataset.side;
                const idx = parseInt(btn.dataset.idx, 10);

                // On récupère directement les infos depuis l'objet JSON déjà en mémoire
                const cardObj = side === 'me' ? stSelectedMe[idx].card : stSelectedThem[idx].card;

                // On injecte le HTML de la modale de preview s'il n'existe pas encore
                let prevOverlay = document.getElementById('wm-preview-overlay');
                if (!prevOverlay) {
                    prevOverlay = document.createElement('div');
                    prevOverlay.id = 'wm-preview-overlay';
                    prevOverlay.innerHTML = `
                        <div class="wm-preview-box">
                            <button class="wm-preview-close" id="wm-preview-close-btn">✕</button>
                            <div class="wm-preview-title" id="wm-prev-title">Titre</div>
                            <div class="wm-preview-img-container"><img id="wm-prev-img" src="" alt=""></div>
                            <div class="wm-preview-stats">
                                <span style="color:#f87171;">⚔️ ATK: <span id="wm-prev-atk">0</span></span>
                                <span style="color:#60a5fa;">🛡️ DEF: <span id="wm-prev-def">0</span></span>
                            </div>
                            <div class="wm-preview-desc" id="wm-prev-desc">Desc</div>
                        </div>
                    `;
                    document.body.appendChild(prevOverlay);

                    document.getElementById('wm-preview-close-btn').addEventListener('click', () => prevOverlay.classList.remove('show'));
                    prevOverlay.addEventListener('click', (ev) => { if (ev.target === prevOverlay) prevOverlay.classList.remove('show'); });
                }

                // Remplissage des données
                document.getElementById('wm-prev-title').textContent = cardObj.wikipedia_title || 'Inconnu';
                document.getElementById('wm-prev-img').src = cardObj.image_url || '';
                document.getElementById('wm-prev-atk').textContent = cardObj.atk || '0';
                document.getElementById('wm-prev-def').textContent = cardObj.def || '0';
                document.getElementById('wm-prev-desc').textContent = cardObj.category || 'Aucune description.';

                prevOverlay.classList.add('show');
            }

        });

        async function sendSmartTrade() {
            if (!stCurrentTrade) return;
            const btnSend = document.getElementById('wm-st-run-send');
            const status = document.getElementById('wm-st-run-status');
            const myUserId = window.wmUserId || "";

            const items = [
                ...stSelectedMe.map(c => ({ user_card_id: c.id, card_id: c.card_id || c.card?.id, offered_by: myUserId })),
                ...stSelectedThem.map(c => ({ user_card_id: c.id, card_id: c.card_id || c.card?.id, offered_by: stCurrentTrade.friendId }))
            ];

            const initiatorWb = parseInt(document.getElementById('wm-run-my-wb').value, 10) || 0;
            const recipientWb = parseInt(document.getElementById('wm-run-their-wb').value, 10) || 0;

            const payload = {
                recipient_id: stCurrentTrade.friendId,
                items: items,
                initiator_wikibidous: initiatorWb,
                recipient_wikibidous: recipientWb
            };

            try {
                btnSend.disabled = true;
                btnSend.textContent = "⏳ Envoi...";
                status.textContent = "Transmission de l'offre au serveur...";
                status.style.color = "#60a5fa";

                const headers = { "accept": "*/*", "content-type": "application/json" };
                // Fix apikey : On vérifie proprement si l'objet et la clé existent
                if (window.wmAuth?.apikey) headers["apikey"] = window.wmAuth.apikey;
                if (window.wmAuth?.token) headers["authorization"] = window.wmAuth.token;

                const res = await fetch("https://www.wiki-masters.com/api/trades", {
                    method: "POST", headers: headers, body: JSON.stringify(payload), credentials: "include"
                });

                if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);

                status.textContent = "🎉 Offre envoyée !";
                status.style.color = "#10b981";
                btnSend.textContent = "Envoyé !";
                setTimeout(() => closeStModal(), 1500);

            } catch (error) {
                btnSend.disabled = false;
                btnSend.textContent = "Envoyer";
                status.textContent = `❌ Échec: ${error.message}`;
                status.style.color = "#ef4444";
            }
        }

        // ============================================================
        // LOGIQUE GESTIONNAIRE DE TAGS (Groupes)
        // ============================================================

        function getTagGroups() {
            return JSON.parse(localStorage.getItem('wmTagGroups') || '[]');
        }
        function saveTagGroups(groups) {
            localStorage.setItem('wmTagGroups', JSON.stringify(groups));
        }

        function renderTagGroups() {
            const container = document.getElementById('wm-tags-groups-list');
            if (!container) return;
            const groups = getTagGroups();

            const autoTagCheckbox = document.getElementById('wm-toggle-autotag');
            if (autoTagCheckbox) {
                autoTagCheckbox.checked = localStorage.getItem('wmAutoTagEnabled') === 'true';
            }

            if (groups.length === 0) {
                container.innerHTML = '<div class="wm-tracked-empty" style="margin-top:10px;">Aucun groupe configuré.</div>';
                return;
            }

            container.innerHTML = groups.map((g, gIdx) => `
        <div class="wm-tag-group">
            <div class="wm-tag-group-header" data-idx="${gIdx}">
                <span class="wm-tag-group-title">📁 ${g.name} (${g.rules ? g.rules.length : 0})</span>
                <span style="color:#ef4444; font-size:12px;" class="wm-del-group-btn" data-idx="${gIdx}">✕</span>
            </div>
            <div class="wm-tag-group-content">
                ${(g.rules || []).map((r, rIdx) => `
                    <div class="wm-tag-rule-row">
                        <span style="font-size:11px; color:#cbd5e1;">Contient : <b>"${r.keyword}"</b></span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="wm-tag-badge" style="background-color:${r.tagColor || '#a78bfa'};">${r.tagName || 'Tag'}</span>
                            <button class="wm-del-rule-btn" data-gidx="${gIdx}" data-ridx="${rIdx}" style="background:none; border:none; color:#ef4444; cursor:pointer;">✕</button>
                        </div>
                    </div>
                `).join('')}
                <div style="display:flex; gap:6px; margin-top:4px;">
                    <input type="text" id="wm-rule-kw-${gIdx}" class="wm-panel-input" placeholder="Mot clé..." style="flex:1; font-size:10px; padding:4px;">
                    <select id="wm-rule-tag-${gIdx}" class="wm-panel-input" style="flex:1; font-size:10px; padding:4px;">
                        ${Object.keys(window.wmTags).map(tagName =>
                                                         `<option value="${window.wmTags[tagName].id}|${tagName}|${window.wmTags[tagName].color}">${tagName}</option>`
                                                        ).join('')}
                    </select>
                    <button class="wm-panel-btn wm-add-rule-btn" data-idx="${gIdx}" style="padding:4px 8px; font-size:10px;">+</button>
                </div>
            </div>
        </div>
    `).join('');
        }

        // Écouteurs globaux pour l'onglet Tags
        document.addEventListener('click', (e) => {
            // Créer un groupe
            if (e.target.id === 'wm-btn-add-group') {
                const input = document.getElementById('wm-new-group-name');
                if (!input.value.trim()) return;
                const groups = getTagGroups();
                groups.push({ name: input.value.trim(), rules: [] });
                saveTagGroups(groups);
                input.value = '';
                renderTagGroups();
            }
            // Ouvrir/Fermer un groupe (Accordéon)
            else if (e.target.closest('.wm-tag-group-header') && !e.target.classList.contains('wm-del-group-btn')) {
                const header = e.target.closest('.wm-tag-group-header');
                header.parentElement.classList.toggle('open');
            }
            // Supprimer un groupe
            else if (e.target.classList.contains('wm-del-group-btn')) {
                const groups = getTagGroups();
                groups.splice(e.target.dataset.idx, 1);
                saveTagGroups(groups);
                renderTagGroups();
            }
            // Ajouter une règle
            else if (e.target.classList.contains('wm-add-rule-btn')) {
                const gIdx = e.target.dataset.idx;
                const kw = document.getElementById(`wm-rule-kw-${gIdx}`).value.trim();
                const tagData = document.getElementById(`wm-rule-tag-${gIdx}`).value.split('|');

                if (!kw || tagData.length !== 3) return;

                const groups = getTagGroups();
                groups[gIdx].rules.push({ keyword: kw, tagId: tagData[0], tagName: tagData[1], tagColor: tagData[2] });
                saveTagGroups(groups);
                renderTagGroups();

                // Garder l'accordéon ouvert
                setTimeout(() => {
                    const header = document.querySelector(`.wm-tag-group-header[data-idx="${gIdx}"]`);
                    if(header) header.parentElement.classList.add('open');
                }, 10);
            }
            // Supprimer une règle
            else if (e.target.classList.contains('wm-del-rule-btn')) {
                const gIdx = e.target.dataset.gidx;
                const rIdx = e.target.dataset.ridx;
                const groups = getTagGroups();
                groups[gIdx].rules.splice(rIdx, 1);
                saveTagGroups(groups);
                renderTagGroups();

                // Garder l'accordéon ouvert
                setTimeout(() => {
                    const header = document.querySelector(`.wm-tag-group-header[data-idx="${gIdx}"]`);
                    if(header) header.parentElement.classList.add('open');
                }, 10);
            }
        });

        // Écouteur pour la checkbox Auto-Tag
        document.addEventListener('change', (e) => {
            if (e.target.id === 'wm-toggle-autotag') {
                localStorage.setItem('wmAutoTagEnabled', e.target.checked);
            }
        });

        // Actualiser l'affichage de l'onglet si on clique dessus
        document.addEventListener('click', (e) => {
            if (e.target.closest('.wm-menu-item') && e.target.closest('.wm-menu-item').dataset.tab === 'tags') {
                renderTagGroups();
            }
        });



        //ControlPanel fin
        renderSmartTradesList();
        renderPatchNotes();
        initTagsTab();
        updateBulkUI();
        renderTrackedAuctions();
        updateTrackBadge();
        renderBalanceUI();
        logToPanel("V2.0.0 Démarrée.");
    }

    // ============================================================
    // UTILITAIRES
    // ============================================================
    window.applyPersistentFilters = function() {
        const cards = document.querySelectorAll('.w-72');
        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (titleEl) {
                const title = titleEl.textContent.trim();
                if (window.wmProcessedCards.has(title)) {
                    card.classList.add('wm-processed-card');
                    card.querySelectorAll('.wm-action-btn').forEach(b => b.disabled = true);
                }
            }
        });
    };

    function markCardAsProcessedByTitle(title) {
        if (!title) return;
        window.wmProcessedCards.add(title);
        window.applyPersistentFilters();
    }

    // ============================================================
    // RACCOURCIS CLAVIER
    // ============================================================
    // ---- Gestion globale du clavier (Collection + Pulls + Bulk) ----
    document.addEventListener('keydown', (e) => {
        // On ignore si l'utilisateur tape dans une barre de recherche
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // ==========================================
        // 1. RACCOURCI "I" (Bulk Delete & Auto-Next)
        // ==========================================
        if (e.key.toLowerCase() === 'i') {
            e.preventDefault();
            const targetCard = document.querySelector('.w-72:hover') || document.querySelector('.swiper-slide-active .w-72') || document.querySelector('.w-72');

            if (targetCard) {
                const bulkBtn = targetCard.querySelector('.wm-btn-bulk');
                if (bulkBtn && !bulkBtn.disabled) {
                    console.log("[WM-Debug] 🟢 Clic sur Bulk effectué.");
                    bulkBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
            }

            // On laisse 200ms (au lieu de 80) pour que le bouton Bulk devienne vert
            // et que l'Observer déverrouille son verrou de sécurité avant de tourner la page.
            setTimeout(() => {
                console.log("[WM-Debug] ⏩ Passage à la carte suivante...");
                const rightArrowSvg = document.querySelector('svg polyline[points="9 18 15 12 9 6"]');
                if (rightArrowSvg) {
                    rightArrowSvg.closest('button').click();
                } else {
                    const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Continuer' && !btn.disabled);
                    if (continueBtn) {
                        console.log("[WM-Debug] 🏁 Fin du paquet, on clique sur Continuer.");
                        continueBtn.click();
                    }
                }
            }, 200);
            return;
        }

        // ==========================================
        // 1.5 RACCOURCI "O" (Auto-Prev & Bulk Delete)
        // ==========================================
        if (e.key.toLowerCase() === 'o') {
            e.preventDefault();

            // 1. Retourner sur la carte précédente
            const leftArrowSvg = document.querySelector('svg polyline[points="15 18 9 12 15 6"]');
            if (leftArrowSvg) {
                leftArrowSvg.closest('button').click();

                // 2. Attendre la fin du slide, puis ajouter au Bulk
                setTimeout(() => {
                    const targetCard = document.querySelector('.swiper-slide-active .w-72') || document.querySelector('.w-72');
                    if (targetCard) {
                        const bulkBtn = targetCard.querySelector('.wm-btn-bulk');
                        if (bulkBtn && !bulkBtn.disabled) {
                            console.log("[WM-Debug] 🟢 Clic sur Bulk (Rétroactif) effectué.");
                            bulkBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        }
                    }
                }, 200);
            }
            return;
        }

        // ==========================================
        // 2. NAVIGATION DANS LA COLLECTION (Modal)
        // ==========================================
        const modal = typeof getOpenCardModal === 'function' ? getOpenCardModal() : null;

        if (modal) {
            // Si le modal est ouvert, on gère UNIQUEMENT la navigation inter-cartes
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

            e.preventDefault();
            e.stopPropagation();

            if (typeof wmCurrentCardIndex !== 'undefined' && wmCurrentCardIndex === -1 && modal.title) {
                const cards = typeof getCollectionCards === 'function' ? getCollectionCards() : [];
                const idx = cards.findIndex(c => getCardTitleFromEl(c) === modal.title);
                if (idx !== -1) {
                    wmCurrentCardIndex = idx;
                    wmCurrentCardTitle = modal.title;
                } else {
                    return;
                }
            }

            const delta = e.key === 'ArrowRight' ? 1 : -1;
            if (typeof navigateToCardIndex === 'function') {
                navigateToCardIndex(wmCurrentCardIndex + delta);
            }
            return; // On s'arrête ici pour bloquer la suite
        }

        // ==========================================
        // 3. NAVIGATION DANS LES TIRAGES (/pulls)
        // ==========================================
        if (e.key === 'ArrowLeft') {
            const leftArrowSvg = document.querySelector('svg polyline[points="15 18 9 12 15 6"]');
            if (leftArrowSvg) { e.preventDefault(); leftArrowSvg.closest('button').click(); }
        }
        else if (e.key === 'ArrowRight') {
            const rightArrowSvg = document.querySelector('svg polyline[points="9 18 15 12 9 6"]');
            if (rightArrowSvg) { e.preventDefault(); rightArrowSvg.closest('button').click(); }
        }
        else if (e.key === ' ') { // Espace pour ouvrir vite
            e.preventDefault();

            // Ouvrir un paquet
            const openImg = document.querySelector('img[alt="Ouvrir un paquet"]');
            if (openImg) { openImg.closest('button').click(); return; }

            // Vérifier si on est sur la toute dernière carte (via les points de pagination)
            let isLastCard = false;
            const paginationDivs = document.querySelectorAll('.flex.items-center.gap-2');
            for (const div of paginationDivs) {
                const buttons = div.querySelectorAll('button');
                // On s'assure qu'on regarde bien des bulles de pagination
                if (buttons.length > 0 && Array.from(buttons).every(b => b.className.includes('rounded-full'))) {
                    const lastBtn = buttons[buttons.length - 1];
                    if (lastBtn.className.includes('bg-[var(--color-accent)]')) {
                        isLastCard = true;
                    }
                    break; // On a trouvé la bonne div, on sort de la boucle
                }
            }

            const rightArrowSvg = document.querySelector('svg polyline[points="9 18 15 12 9 6"]');
            // Fallback : si on ne trouve pas de pagination, on se base sur l'absence de flèche droite
            if (!isLastCard && !rightArrowSvg) {
                 isLastCard = true;
            }

            // Si c'est la dernière carte, on cherche le bouton "Continuer"
            if (isLastCard) {
                const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Continuer' && !btn.disabled);
                if (continueBtn) { continueBtn.click(); return; }
            }

            // Sinon, on avance d'une carte
            if (rightArrowSvg) rightArrowSvg.closest('button').click();
        }

    }, true);

    // ============================================================
    // UI ONGLET TAGS
    // ============================================================

    async function initTagsTab() {
        if (window.wmTagsCache.length === 0) {
            try { await wmFetchTags(); } catch(e) { console.warn('[WM-Tags] fetch échoué:', e); }
        }

        // ---> FIX: Restauration de l'état de la checkbox Auto-Tag au démarrage <---
        const autoTagCheckbox = document.getElementById('wm-toggle-autotag');
        if (autoTagCheckbox) {
            autoTagCheckbox.checked = localStorage.getItem('wmAutoTagEnabled') === 'true';
        }

        const fillBtn = document.getElementById('wm-cache-fill-btn');
        if (fillBtn && !fillBtn._wmBound) {
            fillBtn._wmBound = true;
            fillBtn.addEventListener('click', async () => {
                fillBtn.disabled = true;
                fillBtn.textContent = '⏳...';
                try {
                    const before = window.wmCollectionCache.cards.length;
                    await getVisibleCollectionCards(txt => logToPanel(txt));
                    const after = window.wmCollectionCache.cards.length;
                    logToPanel(`📥 ${after - before} cartes ajoutées au cache (total: ${after})`);
                    if (typeof renderCacheInfo === 'function') renderCacheInfo();
                } catch (e) {
                    logToPanel(`❌ ${e.message}`);
                } finally {
                    fillBtn.disabled = false;
                    fillBtn.textContent = '📥 Remplir la page';
                }
            });
        }
        // ---> INJECTION DES BOUTONS GROUPES ET MODALE IMPORT/EXPORT <---
        const oldAddRuleBtn = document.getElementById('wm-add-rule-btn');
        if (oldAddRuleBtn) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; gap:6px; margin-bottom:8px;";
            wrapper.innerHTML = `
                <button id="wm-btn-add-group" class="wm-panel-btn" style="flex:1;">📁 Nouveau Groupe</button>
                <button id="wm-btn-ie-modal" class="wm-panel-btn ghost" style="flex:1;">⚙️ Import / Export</button>
            `;
            oldAddRuleBtn.replaceWith(wrapper);

            document.getElementById('wm-btn-add-group').addEventListener('click', () => {
                const name = prompt("Nom du nouveau dossier :");
                if (name) {
                    const groups = getTagGroups();
                    groups.push({ id: 'g_'+Date.now(), name, isOpen: true, rules: [] });
                    saveTagGroups(groups);
                    renderRulesList();
                }
            });

            document.getElementById('wm-btn-ie-modal').addEventListener('click', () => document.getElementById('wm-ie-overlay').style.display = 'flex');
        }

        if (!document.getElementById('wm-ie-overlay')) {
            const modal = document.createElement('div');
            modal.id = "wm-ie-overlay";
            modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100001;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
            modal.innerHTML = `
                <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:12px;padding:20px;width:90%;max-width:500px;color:white;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                    <h3 style="margin-top:0;font-size:16px;">⚙️ Import / Export des Règles</h3>
                    <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Générez votre code d'export (les IDs locaux des étiquettes sont supprimés pour le partage), ou collez un code pour importer des dossiers.</p>
                    <textarea id="wm-ie-textarea" style="width:100%;height:150px;background:rgba(30,41,59,0.8);color:#fbbf24;border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:10px;font-family:monospace;font-size:11px;outline:none;resize:vertical;" placeholder="Collez un code d'import ici..."></textarea>
                    <div style="display:flex;gap:10px;margin-top:16px;justify-content:space-between;">
                        <button id="wm-btn-ie-close" class="wm-panel-btn ghost">Fermer</button>
                        <div style="display:flex;gap:10px;">
                            <button id="wm-btn-ie-export" class="wm-panel-btn ghost">📤 Exporter</button>
                            <button id="wm-btn-ie-import" class="wm-panel-btn">📥 Importer</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('wm-btn-ie-close').addEventListener('click', () => modal.style.display = 'none');

            document.getElementById('wm-btn-ie-export').addEventListener('click', () => {
                const groups = getTagGroups();
                // On efface le tagId à l'export pour que le code soit universel
                const exportData = groups.map(g => ({ ...g, rules: g.rules.map(r => ({ ...r, tagId: '' })) }));
                const ta = document.getElementById('wm-ie-textarea');
                ta.value = JSON.stringify(exportData, null, 2);
                ta.select();
                document.execCommand('copy');
                logToPanel("📤 Export copié dans le presse-papier !");
            });

            document.getElementById('wm-btn-ie-import').addEventListener('click', () => {
                try {
                    const ta = document.getElementById('wm-ie-textarea');
                    const imported = JSON.parse(ta.value);
                    if (!Array.isArray(imported)) throw new Error("Format invalide");

                    const groups = getTagGroups();
                    imported.forEach(ig => {
                        groups.push({
                            id: 'g_' + Date.now() + Math.random(),
                            name: ig.name + " (Importé)",
                            isOpen: true,
                            rules: Array.isArray(ig.rules) ? ig.rules : []
                        });
                    });
                    saveTagGroups(groups);
                    renderRulesList();
                    modal.style.display = 'none';
                    ta.value = '';
                    logToPanel("📥 Groupes importés avec succès ! Pensez à réassigner vos étiquettes.");
                } catch(e) { alert("Erreur d'importation : Le code fourni est invalide."); }
            });
        }
        renderTagsList();
        renderRulesList();
        bindTagButtons();
        restoreScanUI();
    }

    function bindTagButtons() {
        const addTagBtn = document.getElementById('wm-add-tag-btn');
        if (addTagBtn && !addTagBtn._wmBound) {
            addTagBtn._wmBound = true;
            addTagBtn.addEventListener('click', async () => {
                const nameEl = document.getElementById('wm-new-tag-name');
                const colorEl = document.getElementById('wm-new-tag-color');
                const name = nameEl.value.trim();
                const color = colorEl.value;
                if (!name) return;
                try {
                    await wmCreateTag(name, color);
                    nameEl.value = '';
                    renderTagsList();
                    renderRulesList(); // pour rafraîchir les dropdowns
                    logToPanel(`🏷️ Étiquette "${name}" créée`);
                } catch(e) {
                    logToPanel(`❌ Erreur création tag: ${e.message}`);
                }
            });
        }

        const previewBtn = document.getElementById('wm-tag-preview-btn');
        if (previewBtn && !previewBtn._wmBound) {
            previewBtn._wmBound = true;
            previewBtn.addEventListener('click', runTagPreview);
        }

        const applyBtn = document.getElementById('wm-tag-apply-btn');
        if (applyBtn && !applyBtn._wmBound) {
            applyBtn._wmBound = true;
            applyBtn.addEventListener('click', runTagApply);
        }

        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        if (cancelBtn && !cancelBtn._wmBound) {
            cancelBtn._wmBound = true;
            cancelBtn.addEventListener('click', () => {
                const st = window.wmTagScanState;
                if (st.running) {
                    st.cancelled = true;
                    logToPanel('⏹️ Annulation demandée...');
                }
            });
        }

        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        if (pauseBtn && !pauseBtn._wmBound) {
            pauseBtn._wmBound = true;
            pauseBtn.addEventListener('click', () => {
                const st = window.wmTagScanState;
                if (!st.running) return;
                st.paused = !st.paused;
                pauseBtn.textContent = st.paused ? '▶️ Reprendre' : '⏸️ Pause';
                renderScanProgress();
                logToPanel(st.paused ? '⏸️ Scan mis en pause' : '▶️ Scan repris');
            });
        }

        const modePage = document.getElementById('wm-tag-mode-page');
        const modeHint = document.getElementById('wm-tag-mode-hint');
        if (modePage && !modePage._wmBound) {
            modePage._wmBound = true;
            // Restaure le dernier choix
            const saved = localStorage.getItem('wmTagModePage') === '1';
            modePage.checked = saved;
            updateModeHint();
            modePage.addEventListener('change', () => {
                localStorage.setItem('wmTagModePage', modePage.checked ? '1' : '0');
                updateModeHint();
            });
        }
        function updateModeHint() {
            if (!modeHint || !modePage) return;
            if (modePage.checked) {
                modeHint.innerHTML = '⚡ Mode page : traite uniquement les cartes affichées dans le DOM.<br>Rapide, mais ne touche pas au reste.';
            } else {
                modeHint.innerHTML = 'Mode complet : parcourt toute la collection (long).<br>Mode page : traite uniquement les cartes affichées.';
            }
        }
    }

    function restoreScanUI() {
        const st = window.wmTagScanState;
        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        if (!summary) return;

        if (st.running) {
            previewBtn.disabled = true;
            applyBtn.disabled = true;
            pauseBtn.style.display = 'block';
            cancelBtn.style.display = 'block';
            pauseBtn.textContent = st.paused ? '▶️ Reprendre' : '⏸️ Pause';
            renderScanProgress();
        } else if (st.preview) {
            previewBtn.disabled = false;
            applyBtn.disabled = (st.preview.toAdd.length + st.preview.toRemove.length) === 0;
            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            renderPreviewResult(st.preview);
        } else {
            previewBtn.disabled = false;
            applyBtn.disabled = true;
            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }
    }

    function renderScanProgress() {
        const st = window.wmTagScanState;
        const summary = document.getElementById('wm-tag-run-summary');
        if (!summary) return;
        const phaseLabels = {
            'loading-collection': '📥 Chargement collection',
            'computing': '🧮 Calcul des correspondances',
            'checking': '🔎 Vérification des tags',
            'applying': '🚀 Application'
        };
        const label = phaseLabels[st.phase] || '⏳ En cours';
        const { current, total, text } = st.progress;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const paused = st.paused ? '<div style="color:#fbbf24;font-weight:700;">⏸️ EN PAUSE</div>' : '';
        summary.innerHTML = `
        ${paused}
        <div>${label} ${total > 0 ? `— ${current} / ${total}` : ''}</div>
        ${text ? `<div style="color:#94a3b8;">${escapeHtml(text)}</div>` : ''}
        ${total > 0 ? `<div style="background:rgba(99,102,241,0.2);border-radius:4px;height:4px;margin-top:4px;"><div style="background:#6366f1;height:100%;width:${pct}%;border-radius:4px;transition:width 0.2s;"></div></div>` : ''}
    `;
    }

    function renderPreviewResult(preview) {
        const summary = document.getElementById('wm-tag-run-summary');
        if (!summary) return;
        const { toAdd, toRemove } = preview;
        const perTag = new Map();
        for (const { tagId } of toAdd) perTag.set(tagId, (perTag.get(tagId) || 0) + 1);

        const lines = [];
        lines.push(`✅ ${toAdd.length} tags à poser`);
        if (toRemove.length > 0) lines.push(`🗑️ ${toRemove.length} tags à retirer`);
        lines.push('---');
        for (const [tagId, count] of perTag.entries()) {
            const tag = window.wmTagsCache.find(t => t.id === tagId);
            lines.push(`${tag?.name || tagId.slice(0,8)} : +${count}`);
        }
        summary.innerHTML = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
    }

    // Helper de pause avec attente active
    async function waitIfPaused() {
        const st = window.wmTagScanState;
        while (st.paused && !st.cancelled) {
            await new Promise(r => setTimeout(r, 300));
        }
        return !st.cancelled;
    }

    function renderTagsList() {
        const container = document.getElementById('wm-tags-list');
        if (!container) return;
        if (window.wmTagsCache.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucune étiquette.</div>';
            return;
        }
        container.innerHTML = window.wmTagsCache.map(tag => `
        <div class="wm-bulk-item" style="padding:6px 0;">
            <span style="display:flex;align-items:center;gap:8px;">
                <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${tag.color || '#6366f1'};"></span>
                <span style="font-weight:600;">${escapeHtml(tag.name)}</span>
            </span>
            <button class="wm-tracked-btn danger" data-tag-delete="${tag.id}" style="padding:3px 8px;font-size:10px;">🗑️</button>
        </div>
    `).join('');

        container.querySelectorAll('[data-tag-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tagId = btn.dataset.tagDelete;
                const tag = window.wmTagsCache.find(t => t.id === tagId);
                if (!confirm(`Supprimer l'étiquette "${tag?.name}" ?`)) return;
                try {
                    await wmDeleteTag(tagId);
                    renderTagsList();
                    renderRulesList();
                    logToPanel(`🗑️ Étiquette supprimée`);
                } catch(e) {
                    logToPanel(`❌ Erreur suppression: ${e.message}`);
                }
            });
        });
    }

    function renderRulesList() {
        const container = document.getElementById('wm-rules-list');
        if (!container) return;
        const groups = getTagGroups();

        if (groups.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucun groupe. Cliquez sur "📁 Nouveau Groupe".</div>';
            return;
        }

        container.innerHTML = groups.map((g, gIdx) => {
            const emoji = g.emoji || '📁';
            return `
            <div style="background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.2);border-radius:8px;overflow:hidden;margin-bottom:8px;">
                <div data-group-toggle="${gIdx}" style="padding:10px 12px;background:rgba(15,23,42,0.6);display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:${g.isOpen ? '1px solid rgba(255,255,255,0.05)' : 'none'};">
                    <span style="font-size:13px;font-weight:bold;color:#e5e7eb;pointer-events:none;">${escapeHtml(emoji)} ${escapeHtml(g.name)} (${(g.rules||[]).length})</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button data-group-edit="${gIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;" title="Modifier le dossier">⚙️</button>
                        <button data-group-remove="${gIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;" title="Supprimer le dossier">🗑️</button>
                        <span style="color:#94a3b8;font-size:12px;pointer-events:none;margin-left:4px;">${g.isOpen ? '▲' : '▼'}</span>
                    </div>
                </div>
                <div style="display:${g.isOpen ? 'flex' : 'none'};flex-direction:column;gap:8px;padding:12px;">
                    ${(g.rules || []).map((rule, rIdx) => {
                        const tagBorder = rule.tagId ? 'rgba(148,163,184,0.15)' : '#ef4444';
                        const conditionsHtml = rule.conditions.map((cond, cIdx) => {
                            const field = WM_RULE_FIELDS[cond.field] || {};
                            const isEnum = field.type === 'enum';
                            const isString = field.type === 'string';
                            let opOptions = ['>', '>=', '<', '<=', '=', '!='];
                            if (isString) opOptions = ['contains', 'not_contains', '=', '!='];
                            if (isEnum) opOptions = ['=', '!='];

                            let valueInput = '';
                            if (isEnum) {
                                const opts = (field.values || []).map(v => `<option value="${v}" ${cond.value === v ? 'selected' : ''}>${v}</option>`).join('');
                                valueInput = `<select data-cond-value="${gIdx}-${rIdx}-${cIdx}" style="flex:1;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">${opts}</select>`;
                            } else {
                                const inputType = field.type === 'number' ? 'number' : 'text';
                                valueInput = `<input type="${inputType}" data-cond-value="${gIdx}-${rIdx}-${cIdx}" value="${escapeHtml(String(cond.value))}" style="flex:1;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;outline:none;">`;
                            }

                            return `
                            <div style="display:flex;gap:4px;align-items:center;width:100%;">
                                <select data-cond-field="${gIdx}-${rIdx}-${cIdx}" style="flex:1.2;min-width:0;text-overflow:ellipsis;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    ${Object.entries(WM_RULE_FIELDS).map(([k, f]) => `<option value="${k}" ${cond.field === k ? 'selected' : ''}>${f.label}</option>`).join('')}
                                </select>
                                <select data-cond-op="${gIdx}-${rIdx}-${cIdx}" style="flex:0.6;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    ${opOptions.map(op => `<option value="${op}" ${cond.operator === op ? 'selected' : ''}>${op}</option>`).join('')}
                                </select>
                                ${valueInput}
                                <button data-cond-remove="${gIdx}-${rIdx}-${cIdx}" style="flex-shrink:0;background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;width:24px;height:24px;cursor:pointer;font-size:12px;">✕</button>
                            </div>
                            `;
                        }).join('');

                        return `
                        <div class="wm-rule-card-draggable" data-drag-rule="${gIdx}-${rIdx}" style="background:rgba(15,23,42,0.5);border:1px solid ${tagBorder};border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;transition:opacity 0.2s;">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cbd5e1;cursor:pointer;">
                                    <input type="checkbox" data-rule-toggle="${gIdx}-${rIdx}" ${rule.enabled !== false ? 'checked' : ''} style="accent-color:#6366f1;cursor:pointer;">
                                    <span style="font-weight:700;">Règle #${rIdx + 1}</span>
                                </label>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <span class="wm-drag-handle" style="cursor:grab;color:#64748b;font-size:16px;padding:0 4px;user-select:none;" title="Glisser pour réorganiser">☰</span>
                                    <button data-rule-remove="${gIdx}-${rIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;">🗑️</button>
                                </div>
                            </div>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <span style="font-size:10px;color:#94a3b8;font-weight:700;">TAG →</span>
                                <select data-rule-tag="${gIdx}-${rIdx}" style="flex:1;background:rgba(30,41,59,0.6);border:1px solid ${tagBorder};border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    <option value="">⚠️ Sélectionner une étiquette...</option>
                                    ${window.wmTagsCache.map(t => `<option value="${t.id}" ${rule.tagId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">${conditionsHtml}</div>
                            <button data-cond-add="${gIdx}-${rIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:#cbd5e1;padding:4px 8px;cursor:pointer;font-size:10px;font-weight:600;align-self:flex-start;">+ Condition (ET)</button>
                        </div>
                        `;
                    }).join('')}
                    <button data-rule-add="${gIdx}" class="wm-panel-btn ghost" style="width:100%;font-size:11px;padding:6px;">➕ Ajouter une règle ici</button>
                </div>
            </div>
            `;
        }).join('');
        bindRuleListeners();
    }

    function bindRuleListeners() {
        const container = document.getElementById('wm-rules-list');
        if (!container || container._wmBound) return;
        container._wmBound = true;

        // ==========================================
        // GESTION DU DRAG & DROP
        // ==========================================
        let draggedRule = null;
        let dragSourceEl = null;

        // Active le drag uniquement si on clique sur l'icône ☰
        container.addEventListener('mousedown', (e) => {
            if (e.target.matches('.wm-drag-handle')) {
                const card = e.target.closest('.wm-rule-card-draggable');
                if (card) card.setAttribute('draggable', 'true');
            }
        });

        // Sécurité : désactive le drag quand on lâche le clic
        document.addEventListener('mouseup', () => {
            if (container) {
                container.querySelectorAll('.wm-rule-card-draggable').forEach(c => c.removeAttribute('draggable'));
            }
        });

        container.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card) {
                const [g, r] = card.dataset.dragRule.split('-').map(Number);
                draggedRule = { g, r };
                dragSourceEl = card;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => card.style.opacity = '0.4', 0); // Effet fantôme transparent
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.wm-rule-card-draggable');
            // On s'assure qu'on reste dans le même groupe (dossier)
            if (card && draggedRule && card !== dragSourceEl) {
                const [gTarget] = card.dataset.dragRule.split('-').map(Number);
                if (gTarget === draggedRule.g) {
                    e.dataTransfer.dropEffect = 'move';
                    const rect = card.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    // Ligne d'indication visuelle (dessus ou dessous)
                    if (e.clientY < mid) {
                        card.style.borderTop = '2px solid #6366f1';
                        card.style.borderBottom = '';
                    } else {
                        card.style.borderBottom = '2px solid #6366f1';
                        card.style.borderTop = '';
                    }
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card) {
                card.style.borderTop = '';
                card.style.borderBottom = '';
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card && draggedRule && card !== dragSourceEl) {
                card.style.borderTop = '';
                card.style.borderBottom = '';
                const [gTarget, rTarget] = card.dataset.dragRule.split('-').map(Number);

                if (gTarget === draggedRule.g) {
                    const groups = getTagGroups();
                    const group = groups[gTarget];

                    const rect = card.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    let insertIndex = rTarget;
                    if (e.clientY >= mid) insertIndex++; // Insertion en dessous

                    // Modification du tableau pour appliquer le nouvel ordre
                    const [movedRule] = group.rules.splice(draggedRule.r, 1);
                    if (draggedRule.r < insertIndex) insertIndex--;
                    group.rules.splice(insertIndex, 0, movedRule);

                    saveTagGroups(groups);
                    renderRulesList();
                }
            }
        });

        container.addEventListener('dragend', () => {
            if (dragSourceEl) dragSourceEl.style.opacity = '1';
            container.querySelectorAll('.wm-rule-card-draggable').forEach(c => {
                c.style.borderTop = '';
                c.style.borderBottom = '';
                c.removeAttribute('draggable');
            });
            draggedRule = null;
            dragSourceEl = null;
        });

        // ==========================================
        // GESTION DES SELECT ET INPUTS
        // ==========================================
        container.addEventListener('change', (e) => {
            const target = e.target;
            const groups = getTagGroups();

            if (target.matches('[data-rule-toggle]')) {
                const [g, r] = target.dataset.ruleToggle.split('-').map(Number);
                groups[g].rules[r].enabled = target.checked;
                saveTagGroups(groups); return;
            }
            if (target.matches('[data-rule-tag]')) {
                const [g, r] = target.dataset.ruleTag.split('-').map(Number);
                groups[g].rules[r].tagId = target.value;
                saveTagGroups(groups); renderRulesList(); return;
            }
            if (target.matches('[data-cond-field]')) {
                const [g, r, c] = target.dataset.condField.split('-').map(Number);
                const newField = target.value;
                groups[g].rules[r].conditions[c].field = newField;
                const fieldType = WM_RULE_FIELDS[newField]?.type;
                groups[g].rules[r].conditions[c].operator = fieldType === 'string' ? 'contains' : fieldType === 'enum' ? '=' : '>';
                groups[g].rules[r].conditions[c].value = fieldType === 'enum' ? (WM_RULE_FIELDS[newField]?.values?.[0] || '') : (fieldType === 'number' ? 0 : '');
                saveTagGroups(groups); renderRulesList(); return;
            }
            if (target.matches('[data-cond-op]')) {
                const [g, r, c] = target.dataset.condOp.split('-').map(Number);
                groups[g].rules[r].conditions[c].operator = target.value;
                saveTagGroups(groups); return;
            }
            if (target.matches('[data-cond-value]')) {
                const [g, r, c] = target.dataset.condValue.split('-').map(Number);
                const fieldType = WM_RULE_FIELDS[groups[g].rules[r].conditions[c].field]?.type;
                groups[g].rules[r].conditions[c].value = fieldType === 'number' ? Number(target.value) : target.value;
                saveTagGroups(groups); return;
            }
        });

        // ==========================================
        // GESTION DES BOUTONS D'ACTION
        // ==========================================
        container.addEventListener('click', (e) => {
            const groups = getTagGroups();
            const btn = e.target.closest('button');

            if (btn) {
                if (btn.matches('[data-group-edit]')) {
                    const gIdx = Number(btn.dataset.groupEdit);
                    openGroupEditModal(gIdx); return;
                }
                if (btn.matches('[data-group-remove]')) {
                    const gIdx = Number(btn.dataset.groupRemove);
                    if(confirm("Supprimer ce dossier et toutes ses règles ?")) {
                        groups.splice(gIdx, 1);
                        saveTagGroups(groups); renderRulesList();
                    } return;
                }
                if (btn.matches('[data-rule-add]')) {
                    const gIdx = Number(btn.dataset.ruleAdd);
                    if (!groups[gIdx].rules) groups[gIdx].rules = [];
                    groups[gIdx].rules.push({
                        id: 'rule_' + Date.now(),
                        tagId: '',
                        enabled: true,
                        conditions: [{ field: 'avgPrice', operator: '>', value: 100 }]
                    });
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-rule-remove]')) {
                    const [g, r] = btn.dataset.ruleRemove.split('-').map(Number);
                    groups[g].rules.splice(r, 1);
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-cond-remove]')) {
                    const [g, r, c] = btn.dataset.condRemove.split('-').map(Number);
                    groups[g].rules[r].conditions.splice(c, 1);
                    if (groups[g].rules[r].conditions.length === 0) {
                        groups[g].rules[r].conditions.push({ field: 'avgPrice', operator: '>', value: 100 });
                    }
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-cond-add]')) {
                    const [g, r] = btn.dataset.condAdd.split('-').map(Number);
                    groups[g].rules[r].conditions.push({ field: 'avgPrice', operator: '>', value: 100 });
                    saveTagGroups(groups); renderRulesList(); return;
                }
            }

            const toggleDiv = e.target.closest('[data-group-toggle]');
            if (toggleDiv) {
                const gIdx = Number(toggleDiv.dataset.groupToggle);
                groups[gIdx].isOpen = !groups[gIdx].isOpen;
                saveTagGroups(groups); renderRulesList(); return;
            }
        });
    }

    function openGroupEditModal(gIdx) {
        const groups = getTagGroups();
        const g = groups[gIdx];
        const currentEmoji = g.emoji || '📁';
        const currentName = g.name || '';

        const existing = document.getElementById('wm-group-edit-overlay');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'wm-group-edit-overlay';
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
        modal.innerHTML = `
            <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:12px;padding:20px;width:90%;max-width:400px;color:white;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                <h3 style="margin-top:0;font-size:16px;">⚙️ Paramètres du dossier</h3>

                <div style="display:flex; gap:10px; margin-bottom:16px;">
                    <div style="flex:0 0 60px;">
                        <label style="font-size:11px;color:#cbd5e1;font-weight:bold;">Émoji</label>
                        <input type="text" id="wm-edit-g-emoji" value="${escapeHtml(currentEmoji)}" maxlength="2" style="width:100%;margin-top:6px;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:8px;color:white;text-align:center;font-size:14px;outline:none;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:11px;color:#cbd5e1;font-weight:bold;">Nom du dossier</label>
                        <input type="text" id="wm-edit-g-name" value="${escapeHtml(currentName)}" style="width:100%;margin-top:6px;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:8px;color:white;font-size:13px;outline:none;">
                    </div>
                </div>

                <div style="margin-bottom:16px; padding:12px; background:rgba(30,41,59,0.5); border:1px solid rgba(148,163,184,0.2); border-radius:8px;">
                    <span style="font-size:11px;color:#94a3b8;display:block;margin-bottom:8px;">Export spécifique (partage inter-comptes) :</span>
                    <button id="wm-btn-export-single" class="wm-panel-btn ghost" style="width:100%;">📤 Exporter uniquement ce dossier</button>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="wm-btn-edit-g-close" class="wm-panel-btn ghost">Annuler</button>
                    <button id="wm-btn-edit-g-save" class="wm-panel-btn">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('wm-btn-edit-g-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });

        document.getElementById('wm-btn-export-single').addEventListener('click', () => {
            // Clone du groupe en nettoyant les tagIds
            const exportData = [{
                ...g,
                rules: (g.rules || []).map(r => ({ ...r, tagId: '' }))
            }];
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
                logToPanel("📤 Dossier copié dans le presse-papier !");
                const btn = document.getElementById('wm-btn-export-single');
                btn.textContent = "✅ Copié !";
                setTimeout(() => btn.textContent = "📤 Exporter uniquement ce dossier", 2000);
            });
        });

        document.getElementById('wm-btn-edit-g-save').addEventListener('click', () => {
            const newEmoji = document.getElementById('wm-edit-g-emoji').value.trim() || '📁';
            const newName = document.getElementById('wm-edit-g-name').value.trim() || 'Sans nom';

            const currentGroups = getTagGroups();
            if (currentGroups[gIdx]) {
                currentGroups[gIdx].emoji = newEmoji;
                currentGroups[gIdx].name = newName;
                saveTagGroups(currentGroups);
                renderRulesList();
            }
            modal.remove();
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ----- Prévisualisation -----
    async function runTagPreview() {
        const st = window.wmTagScanState;
        if (st.running) return;

        const rules = getFlatRules();
        if (rules.length === 0) {
            logToPanel('❌ Aucune règle active.');
            return;
        }

        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        const modePage = document.getElementById('wm-tag-mode-page');

        const mode = modePage?.checked ? 'page' : 'full';

        // Reset state
        st.running = true;
        st.paused = false;
        st.cancelled = false;
        st.phase = 'idle';
        st.mode = mode;
        st.progress = { current: 0, total: 0, text: '' };
        st.preview = null;
        st.startedAt = Date.now();

        previewBtn.disabled = true;
        applyBtn.disabled = true;
        pauseBtn.style.display = 'block';
        cancelBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';

        logToPanel(`🔍 Prévisualisation (mode ${mode === 'page' ? 'page actuelle' : 'complet'})...`);

        try {
            // ============ PHASE 1 : récupération des cartes ============
            st.phase = 'loading-collection';
            renderScanProgress();

            let cards;
            if (mode === 'page') {
                st.phase = 'loading-collection';
                st.progress.text = 'Lecture du DOM...';
                renderScanProgress();
                cards = await getVisibleCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (cards.length === 0) {
                    logToPanel('❌ Aucune carte visible sur la page.');
                    st.running = false;
                    restoreScanUI();
                    return;
                }
                logToPanel(`📄 ${cards.length} cartes visibles`);
            } else {
                wmScanState.cancelled = false;
                cards = await fetchAllCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (st.cancelled) throw new Error('cancelled');
                logToPanel(`📦 ${cards.length} cartes récupérées`);
            }

            if (!(await waitIfPaused())) throw new Error('cancelled');

            // ============ PHASE 2 : calcul des tags voulus ============
            st.phase = 'computing';
            st.progress = { current: 0, total: cards.length, text: 'Évaluation des règles...' };
            renderScanProgress();

            const managedTagIds = new Set(rules.map(r => r.tagId));
            const desiredTagsByCard = new Map();
            const cardsWithDesired = [];

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const desired = evaluateAllRules(card, rules, window.wmPrices);
                desiredTagsByCard.set(card.userCardId || card.id || card.title, desired);
                if (desired.size > 0) cardsWithDesired.push(card);

                if (i % 20 === 0) {
                    st.progress.current = i;
                    st.progress.text = `"${card.title.slice(0, 30)}"`;
                    renderScanProgress();
                    if (!(await waitIfPaused())) throw new Error('cancelled');
                }
            }

            st.progress.current = cards.length;
            renderScanProgress();

            // ============ PHASE 3 : vérif des tags existants ============
            st.phase = 'checking';
            st.progress = { current: 0, total: cardsWithDesired.length, text: '' };
            renderScanProgress();

            const toAdd = [];
            const toRemove = [];
            let fetchErrors = 0;
            let skippedNoUserCard = 0;

            for (let i = 0; i < cardsWithDesired.length; i++) {
                if (!(await waitIfPaused())) throw new Error('cancelled');

                const card = cardsWithDesired[i];
                st.progress.current = i + 1;
                st.progress.text = `"${card.title.slice(0, 30)}"`;
                if (i % 3 === 0 || i === cardsWithDesired.length - 1) renderScanProgress();

                // Skip si pas de userCardId (rare en mode page si cache incomplet)
                if (!card.userCardId) {
                    skippedNoUserCard++;
                    continue;
                }

                let existingTags;
                try {
                    existingTags = await withRetry(
                        () => wmFetchUserCardTags(card.userCardId),
                        { label: `tags "${card.title.slice(0, 20)}"`, retries: 2, baseDelay: 1200, maxDelay: 4000 }
                    );
                } catch (e) {
                    fetchErrors++;
                    continue;
                }

                const desiredTags = desiredTagsByCard.get(card.userCardId) || new Set();
                for (const tagId of desiredTags) {
                    if (!existingTags.has(tagId)) toAdd.push({ card, tagId });
                }
                for (const existingTagId of existingTags) {
                    if (managedTagIds.has(existingTagId) && !desiredTags.has(existingTagId)) {
                        toRemove.push({ card, tagId: existingTagId });
                    }
                }
            }

            // ============ Résumé final ============
            st.preview = { toAdd, toRemove };
            st.running = false;
            st.phase = 'idle';

            renderPreviewResult({ toAdd, toRemove });
            if (fetchErrors > 0) logToPanel(`⚠️ ${fetchErrors} erreurs réseau`);
            if (skippedNoUserCard > 0) logToPanel(`⏭️ ${skippedNoUserCard} cartes ignorées (userCardId manquant)`);

            applyBtn.disabled = (toAdd.length + toRemove.length) === 0;
            logToPanel(`✅ Prévisualisation : +${toAdd.length} / -${toRemove.length}`);

        } catch (e) {
            st.running = false;
            st.phase = 'idle';
            if (e.message === 'cancelled') {
                summary.textContent = '⏹️ Annulé.';
                logToPanel('⏹️ Prévisualisation annulée');
            } else {
                summary.textContent = '❌ Erreur : ' + e.message;
                logToPanel(`❌ Erreur : ${e.message}`);
            }
        } finally {
            st.running = false;
            st.paused = false;
            restoreScanUI();
        }
    }

    // ----- Application -----
    async function runTagApply() {
        const st = window.wmTagScanState;
        if (st.running || !st.preview) return;
        const { toAdd, toRemove } = st.preview;
        if (toAdd.length === 0 && toRemove.length === 0) return;

        st.running = true;
        st.paused = false;
        st.cancelled = false;
        st.phase = 'applying';
        st.progress = { current: 0, total: toAdd.length + toRemove.length, text: '' };

        const summary = document.getElementById('wm-tag-run-summary');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');

        applyBtn.disabled = true;
        previewBtn.disabled = true;
        pauseBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';
        cancelBtn.style.display = 'block';

        logToPanel(`🚀 Application : +${toAdd.length} / -${toRemove.length}`);

        let done = 0, failed = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10;
        const DELAY_MS = 200;

        const updateProgress = () => {
            st.progress.current = done + failed;
            st.progress.text = `✅ ${done} ok, ❌ ${failed} erreurs`;
            renderScanProgress();
        };

        try {
            // Ajouts
            for (const { card, tagId } of toAdd) {
                if (st.cancelled) break;
                if (!(await waitIfPaused())) break;

                let r;
                try {
                    r = await withRetry(() => wmApplyTag(card.userCardId, tagId), {
                        label: `apply "${card.title.slice(0,20)}"`, retries: 3, baseDelay: 1000, maxDelay: 6000
                    });
                } catch (e) { r = { ok: false, error: e.message }; }

                if (r.ok) { done++; consecutiveErrors = 0; }
                else {
                    failed++; consecutiveErrors++;
                    console.warn('[WM-Tags] apply fail:', card.title, r.error);
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs consécutives, arrêt`);
                        break;
                    }
                }
                updateProgress();
                await new Promise(res => setTimeout(res, DELAY_MS));
            }

            // Retraits
            if (!st.cancelled && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
                consecutiveErrors = 0;
                for (const { card, tagId } of toRemove) {
                    if (st.cancelled) break;
                    if (!(await waitIfPaused())) break;

                    let r;
                    try {
                        r = await withRetry(() => wmRemoveTag(card.userCardId, tagId), {
                            label: `remove "${card.title.slice(0,20)}"`, retries: 3, baseDelay: 1000, maxDelay: 6000
                        });
                    } catch (e) { r = { ok: false, error: e.message }; }

                    if (r.ok) { done++; consecutiveErrors = 0; }
                    else {
                        failed++; consecutiveErrors++;
                        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                            logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs, arrêt`);
                            break;
                        }
                    }
                    updateProgress();
                    await new Promise(res => setTimeout(res, DELAY_MS));
                }
            }

            const msg = `✅ Terminé : ${done} opérations, ${failed} erreurs`;
            summary.innerHTML = `<div>${msg}</div>`;
            logToPanel(msg);
            showWMToast(msg, failed === 0);

        } finally {
            st.running = false;
            st.paused = false;
            st.phase = 'idle';
            st.preview = null;
            applyBtn.disabled = true;
            previewBtn.disabled = false;
            restoreScanUI();
        }
    }

    // ============================================================
    // OBSERVER DOM
    // ============================================================
    const observer = new MutationObserver((mutations) => {
        if (window._wmMutating) return;

        renderPricesOnAllCards();
        if (typeof renderTagsOnAllCards === 'function') renderTagsOnAllCards();
        window.applyPersistentFilters();

        const hasNewNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (!hasNewNodes) return;

        window._wmMutating = true;
        try {
            document.querySelectorAll('.w-72.rounded-2xl:not(.wm-uuid-processed)').forEach(card => {
                card.classList.add('wm-uuid-processed');
                const cardData = getCardDataFromReact(card);
                if (cardData && cardData.id) {
                    card.dataset.wmUuid = cardData.id;
                    fetchPricesBackground(cardData.id, cardData.title);
                } else {
                    setTimeout(() => {
                        const retryData = getCardDataFromReact(card);
                        if (retryData && retryData.id) {
                            card.dataset.wmUuid = retryData.id;
                            fetchPricesBackground(retryData.id, retryData.title);
                            window.applyPersistentFilters();
                        }
                    }, 300);
                }
            });

            injectBoosterButtons();

            // NOUVELLE VÉRIFICATION : centralisée et compatible avec les UUIDs
            if (typeof updateAllBulkButtonsUI === 'function') {
                updateAllBulkButtonsUI();
            }

        } finally {
            setTimeout(() => { window._wmMutating = false; }, 80);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ============================================================
    // DÉTECTION SPA + BOUTON SUIVRE + PANEL SNIPER
    // ============================================================
    let lastPath = window.location.pathname;
    setInterval(() => {
        if (window.location.pathname !== lastPath) {
            lastPath = window.location.pathname;
            document.querySelectorAll('.wm-btns-injected').forEach(el => el.classList.remove('wm-btns-injected'));
            document.querySelectorAll('.wm-uuid-processed').forEach(el => el.classList.remove('wm-uuid-processed'));
            lastTrackBtnAuctionId = null;
            // Retire le panneau sniper (sera réinjecté avec la config de la nouvelle enchère)
            const oldSniper = document.getElementById('wm-sniper-panel');
            if (oldSniper) oldSniper.remove();
        }
        ensureTrackButton();

        // Sur une page d'enchère : s'assurer que le panneau est là et à jour
        const auctionId = getAuctionIdFromUrl();
        if (auctionId) {
            const panel = document.getElementById('wm-sniper-panel');
            if (!panel || panel.dataset.auctionId !== auctionId) {
                setTimeout(injectSniperPanel, 600);
            } else {
                syncSniperPanelFromConfig();
            }
        }
    }, 500);


    wmLoadPriceCache();
    wmLoadCollectionCache();

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createControlPanel();
            ensureTrackButton();
        });
    } else {
        createControlPanel();
        ensureTrackButton();
    }

    // ============================================================
    // DEBUG : exposer les fonctions/variables clés sur window
    // ============================================================
    W.wmDebug = {
        // State
        get prices() { return window.wmPrices; },
        get priceTs() { return window.wmPriceTimestamps; },
        get collectionCache() { return window.wmCollectionCache; },
        get cardIdIndex() { return window.wmCardIdToUserCardId; },
        get tagsCache() { return window.wmTagsCache; },
        get scanState() { return window.wmTagScanState; },

        // Fonctions prix
        getPriceFor: (title, rarity) => wmGetPriceFor(title, rarity),
        loadPriceCache: () => wmLoadPriceCache(),
        savePriceToCache: (t, d) => wmSavePriceToCache(t, d),

        // Fonctions collection
        loadCollectionCache: () => wmLoadCollectionCache(),
        saveCollectionCache: () => wmSaveCollectionCache(),
        clearCollectionCache: () => wmClearCollectionCache(),
        getVisibleCollectionCards: (onProgress) => getVisibleCollectionCards(onProgress),
        fetchAllCollectionCards: (onProgress) => fetchAllCollectionCards(onProgress),
        getCollectionCards: (opts) => getCollectionCards(opts),
        resolveUserCardId: (cardId, title) => wmResolveUserCardId(cardId, title),

        // Fonctions tags
        fetchTags: () => wmFetchTags(),
        createTag: (name, color) => wmCreateTag(name, color),
        deleteTag: (id) => wmDeleteTag(id),
        fetchUserCardTags: (ucId) => wmFetchUserCardTags(ucId),
        applyTag: (ucId, tagId) => wmApplyTag(ucId, tagId),
        removeTag: (ucId, tagId) => wmRemoveTag(ucId, tagId),

        // Règles
        getRules: () => getTagRules(),
        saveRules: (r) => saveTagRules(r),
        evaluateRule: (card, rule) => evaluateRule(card, rule, window.wmPrices),
        evaluateAllRules: (card, rules) => evaluateAllRules(card, rules, window.wmPrices),
        ruleFields: () => WM_RULE_FIELDS,
        ruleOperators: () => WM_RULE_OPERATORS,

        // Supabase
        supabaseRequest: (m, p, b) => supabaseRequest(m, p, b),

        // Utils
        log: (msg) => logToPanel(msg),
        toast: (msg) => showWMToast(msg)
    };

    console.log('[WM-Debug] window.wmDebug disponible pour tests');

})();
