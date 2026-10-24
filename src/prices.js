// ============================================================
// WikiM - Module: Price Engine & Cache
// ============================================================
(function(W, WikiM) {
    'use strict';

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

    function compressPriceSummary(summary) {
        if (!summary || typeof summary !== 'object') return summary;
        const compressed = {};
        for (const [rarity, val] of Object.entries(summary)) {
            if (typeof val === 'number') {
                compressed[rarity] = val;
            } else if (val && typeof val.average === 'number') {
                compressed[rarity] = val.average;
            } else if (val && typeof val.price === 'number') {
                compressed[rarity] = val.price;
            }
        }
        return Object.keys(compressed).length > 0 ? compressed : "EMPTY";
    }

    function wmSavePriceToCache(title, data, uuid = null) {
        if (data === "LOADING" || data === "ERROR") return;

        const compressed = (typeof data === 'object' && data !== null) ? compressPriceSummary(data) : data;

        if (title) {
            const cleanTitle = String(title).trim();
            window.wmPrices[cleanTitle] = compressed;
            window.wmPriceTimestamps[cleanTitle] = Date.now();
        }

        if (uuid) {
            window.wmPrices[uuid] = compressed;
            window.wmPriceTimestamps[uuid] = Date.now();
        }

        // Sauvegarde data
        try {
            const existing = JSON.parse(localStorage.getItem(WM_PRICE_DATA_KEY) || '{}');
            if (title) existing[String(title).trim()] = compressed;
            if (uuid) existing[uuid] = compressed;
            localStorage.setItem(WM_PRICE_DATA_KEY, JSON.stringify(existing));
        } catch (e) { console.warn('[WM-Price] save data échoué:', e); }

        // Sauvegarde ts
        try {
            const existing = JSON.parse(localStorage.getItem(WM_PRICE_TS_KEY) || '{}');
            if (title) existing[String(title).trim()] = Date.now();
            if (uuid) existing[uuid] = Date.now();
            localStorage.setItem(WM_PRICE_TS_KEY, JSON.stringify(existing));
        } catch (e) { console.warn('[WM-Price] save ts échoué:', e); }
    }

    /**
 * Renvoie le prix moyen d'une carte pour SA rareté possédée.
 * @param {string} titleOrUuid
 * @param {string} rarity
 * @returns {number|null}
 */
    function wmGetPriceFor(titleOrUuid, rarity) {
        const key = String(titleOrUuid || '').trim();
        const p = window.wmPrices[key];
        if (!p || typeof p !== 'object') return null;
        const v = p[rarity];
        if (typeof v === 'number') return v;
        if (v && typeof v.average === 'number') return v.average;
        return null;
    }

    const userCardIdCache = new Map();

    // ============================================================
    // FILE D'ATTENTE THROTTLED POUR ÉVITER LE RATE-LIMIT (429)
    // ============================================================
    const priceQueue = [];
    let isQueueProcessing = false;
    const QUEUE_DELAY_MS = 2000; // 2000ms (2s) sécurisé entre requêtes pour éviter 429
    let rateLimitBackoffUntil = 0;

    function enqueuePriceFetch(uuid, cardTitle) {
        if (!uuid) return;
        const cleanTitle = cardTitle ? String(cardTitle).trim() : '';

        // Si déjà en cache et valide (< 24h)
        const now = Date.now();
        const cached = window.wmPrices[uuid] || (cleanTitle ? window.wmPrices[cleanTitle] : null);
        const ts = window.wmPriceTimestamps[uuid] || (cleanTitle ? window.wmPriceTimestamps[cleanTitle] : 0);
        if (cached && cached !== "LOADING" && cached !== "ERROR" && (now - ts) < 259200000) {
            return;
        }

        // Si déjà dans la file ou en cours
        if (window.wmFetching.has(uuid)) return;
        if (priceQueue.some(item => item.uuid === uuid)) return;

        window.wmFetching.add(uuid);
        if (cleanTitle) window.wmPrices[cleanTitle] = "LOADING";
        window.wmPrices[uuid] = "LOADING";
        if (typeof window.renderPricesOnAllCards === 'function') {
            window.renderPricesOnAllCards();
        }

        priceQueue.push({ uuid, cardTitle: cleanTitle, attempt: 1 });
        processPriceQueue();
    }

    async function processSinglePriceItem(item) {
        const { uuid, cardTitle, attempt } = item;

        try {
            const res = await fetch(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                credentials: "include",
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (res.status === 429) {
                // Rate limit détecté ! Pause de 3 secondes et ré-empilement
                console.warn(`[WM-Price] ⏳ Rate-limit 429 détecté pour ${cardTitle || uuid}, mise en pause de 3s...`);
                rateLimitBackoffUntil = Date.now() + 3000;
                if (attempt < 3) {
                    priceQueue.unshift({ uuid, cardTitle, attempt: attempt + 1 });
                    processPriceQueue();
                } else {
                    window.wmPrices[uuid] = "ERROR";
                    if (cardTitle) window.wmPrices[cardTitle] = "ERROR";
                    window.wmFetching.delete(uuid);
                    if (typeof window.renderPricesOnAllCards === 'function') {
                        window.renderPricesOnAllCards();
                    }
                }
                return;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            const hasSales = data && Object.keys(data.summary || {}).length > 0;
            const finalData = hasSales ? data.summary : "EMPTY";
            const apiTitle = data.wikipedia_title || cardTitle;

            wmSavePriceToCache(apiTitle, finalData, uuid);
            window.wmFetching.delete(uuid);
            if (typeof window.renderPricesOnAllCards === 'function') {
                window.renderPricesOnAllCards();
            }

        } catch (e) {
            console.error(`[WM-Price] ⚠️ Échec prix pour ${cardTitle || uuid} (Essai ${attempt}/3):`, e.message);
            if (attempt < 3) {
                priceQueue.push({ uuid, cardTitle, attempt: attempt + 1 });
                processPriceQueue();
            } else {
                window.wmPrices[uuid] = "ERROR";
                if (cardTitle) window.wmPrices[cardTitle] = "ERROR";
                window.wmFetching.delete(uuid);
                if (typeof window.renderPricesOnAllCards === 'function') {
                    window.renderPricesOnAllCards();
                }
            }
        }
    }

    async function processPriceQueue() {
        if (isQueueProcessing) return;
        isQueueProcessing = true;

        while (priceQueue.length > 0) {
            const now = Date.now();
            if (now < rateLimitBackoffUntil) {
                await new Promise(r => setTimeout(r, rateLimitBackoffUntil - now));
            }

            const item = priceQueue.shift();
            if (!item) break;

            // Déclenche la requête en tâche de fond sans bloquer le dispatching
            processSinglePriceItem(item);

            // Respecte la cadence décidée entre les départs de requêtes
            await new Promise(r => setTimeout(r, QUEUE_DELAY_MS));
        }

        isQueueProcessing = false;
    }

    function fetchPricesBackground(uuid, cardTitle) {
        enqueuePriceFetch(uuid, cardTitle);
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
                data = await window.withRetry(async () => {
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
                const desc = item?.card?.summary || item?.card?.description || item?.card?.extract || item?.summary || item?.description || item?.extract || '';
                all.push({
                    id: cardId,
                    userCardId: userCardId,
                    title: title,
                    rarity: item?.card?.rarity,
                    category: item?.card?.category || desc,
                    summary: desc,
                    description: desc
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

        window.logToPanel('🔍 Démarrage du scan des prix...');
        setProgress('📥 Récupération de la collection...');

        let cards = [];
        try {
            cards = await fetchAllCollectionCards(txt => setProgress(txt));
        } catch (e) {
            window.logToPanel('❌ Erreur lors de la récupération de la collection');
            setProgress('❌ Erreur');
            wmScanState.running = false;
            if (btn) { btn.disabled = false; btn.textContent = '🔍 Scanner toute la collection'; }
            if (cancelBtn) cancelBtn.style.display = 'none';
            return;
        }

        window.logToPanel(`📦 ${cards.length} cartes dans la collection`);
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

        window.logToPanel(`🎯 ${toFetch.length} cartes à mettre à jour (${cards.length - toFetch.length} déjà à jour)`);

        let done = 0;
        let failed = 0;
        const DELAY_MS = 1000; // ← throttle entre chaque fetch

        for (const { id, title } of toFetch) {
            if (wmScanState.cancelled) {
                window.logToPanel('⏹️ Scan annulé par l\'utilisateur');
                break;
            }

            try {
                await window.withRetry(() => fetchPricesBackground(id, title), {
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
        window.logToPanel(msg);
        setProgress(msg);
        window.showWMToast(msg, failed === 0);

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
    window.wmLoadPriceCache = WikiM.wmLoadPriceCache = wmLoadPriceCache;
    window.wmSavePriceToCache = WikiM.wmSavePriceToCache = wmSavePriceToCache;
    window.wmGetPriceFor = WikiM.wmGetPriceFor = wmGetPriceFor;
    window.fetchPricesBackground = WikiM.fetchPricesBackground = fetchPricesBackground;
    window.fetchAllCollectionCards = WikiM.fetchAllCollectionCards = fetchAllCollectionCards;
    window.runPriceScan = WikiM.runPriceScan = runPriceScan;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
