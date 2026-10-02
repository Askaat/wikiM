// ============================================================
// WikiM - Module: Price Engine & Cache
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

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


    window.WM_PRICE_DATA_KEY = WM_PRICE_DATA_KEY;
    window.WM_PRICE_TS_KEY = WM_PRICE_TS_KEY;
    window.userCardIdCache = userCardIdCache;
    window.wmScanState = wmScanState;

    // --- Cross-module exports ---
    if (typeof wmLoadPriceCache !== 'undefined') { window.wmLoadPriceCache = wmLoadPriceCache; window.WikiM.wmLoadPriceCache = wmLoadPriceCache; }
    if (typeof wmSavePriceToCache !== 'undefined') { window.wmSavePriceToCache = wmSavePriceToCache; window.WikiM.wmSavePriceToCache = wmSavePriceToCache; }
    if (typeof wmGetPriceFor !== 'undefined') { window.wmGetPriceFor = wmGetPriceFor; window.WikiM.wmGetPriceFor = wmGetPriceFor; }
    if (typeof fetchPricesBackground !== 'undefined') { window.fetchPricesBackground = fetchPricesBackground; window.WikiM.fetchPricesBackground = fetchPricesBackground; }
    if (typeof fetchAllCollectionCards !== 'undefined') { window.fetchAllCollectionCards = fetchAllCollectionCards; window.WikiM.fetchAllCollectionCards = fetchAllCollectionCards; }
    if (typeof runPriceScan !== 'undefined') { window.runPriceScan = runPriceScan; window.WikiM.runPriceScan = runPriceScan; }
})();
