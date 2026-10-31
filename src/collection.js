// ============================================================
// WikiM - Module: Collection, Quick Actions & Bulk Discard
// ============================================================
(function(W, WikiM) {
    'use strict';

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

        window.logToPanel(`📦 Bulk discard : ${userCardIdsArray.length} cartes en ${totalChunks} lot(s) de ${CHUNK_SIZE} max`);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = userCardIdsArray.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            window.logToPanel(`[Lot ${i + 1}/${totalChunks}] Envoi de ${chunk.length} cartes...`);

            let response, data;
            try {
                // Retry sur chaque chunk
                data = await window.withRetry(async () => {
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

                // PERSISTANCE IMMÉDIATE : retirer ce lot de wmBulkList dès qu'il est validé
                try {
                    const currentStored = JSON.parse(localStorage.getItem('wmBulkList') || '[]');
                    const failedIdsInChunk = new Set((data?.failed || []).map(f => f.card_id || f.id));
                    const chunkSet = new Set(chunk.filter(id => !failedIdsInChunk.has(id)));
                    const remainingStored = currentStored.filter(item => {
                        const uId = typeof item === 'object' ? (item.user_card_id || item.userCardId) : null;
                        return !uId || !chunkSet.has(uId);
                    });
                    localStorage.setItem('wmBulkList', JSON.stringify(remainingStored));
                    if (typeof window.updateBulkUI === 'function') window.updateBulkUI();
                    if (typeof window.updateAllBulkButtonsUI === 'function') window.updateAllBulkButtonsUI();
                } catch(e) {}

                if (typeof data?.balance === 'number') {
                    lastBalance = data.balance;
                }

                if (data?.failed && Array.isArray(data.failed)) {
                    allFailed.push(...data.failed);
                    if (data.failed.length > 0) {
                        window.logToPanel(`[Lot ${i + 1}/${totalChunks}] ⚠️ ${data.failed.length} échecs (${data.failed[0]?.error || '?'})`);
                    }
                }

                window.logToPanel(`[Lot ${i + 1}/${totalChunks}] ✅ ${discarded} défaussées (cumul : ${totalDiscarded})`);

                // Interruption propre si demandée par l'utilisateur
                if (window._wmCancelBulkDiscard) {
                    window.logToPanel(`⏹️ Défausse interrompue par l'utilisateur (${totalDiscarded} cartes défaussées).`);
                    break;
                }

            } catch (e) {
                console.error(`[WM-Bulk] ❌ Lot ${i + 1} échoué :`, e);
                window.logToPanel(`[Lot ${i + 1}/${totalChunks}] ❌ Échec : ${e.message}`);
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

    /**
     * Nettoie le panier Bulk en vérifiant l'existence réelle des cartes sur Supabase.
     * Élimine les cartes fantômes (déjà défaussées ou vendues).
     */
    async function wmCleanBulkList() {
        const rawBulkList = JSON.parse(localStorage.getItem('wmBulkList') || '[]');
        if (rawBulkList.length === 0) {
            window.logToPanel("ℹ️ Panier Bulk vide, rien à nettoyer.");
            return { removed: 0, remaining: 0 };
        }

        const authObj = window.wmAuth || (typeof W !== 'undefined' && W.wmAuth) || {};
        if (!authObj.token || !authObj.apikey) {
            window.logToPanel("⚠️ Authentification introuvable pour synchroniser le bulk avec le serveur.");
            return { removed: 0, remaining: rawBulkList.length };
        }

        const validItems = rawBulkList.filter(item => typeof item === 'object' && (item.user_card_id || item.userCardId));
        if (validItems.length === 0) {
            window.logToPanel("ℹ️ Aucune carte avec identifiant physique dans le bulk.");
            return { removed: 0, remaining: rawBulkList.length };
        }

        window.logToPanel(`🧹 Analyse du bulk : vérification de ${validItems.length} cartes sur le serveur...`);

        const allIds = validItems.map(item => item.user_card_id || item.userCardId);
        const BATCH_SIZE = 120;
        const existingIds = new Set();
        const token = authObj.token.startsWith('Bearer') ? authObj.token : `Bearer ${authObj.token}`;
        const supabaseRef = window.SUPABASE_REF || 'cyrxjeppjqsxxjayfrur';
        const nativeFetch = window._wmNativeFetch || fetch;

        for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
            const batch = allIds.slice(i, i + BATCH_SIZE);
            const targetUrl = `https://${supabaseRef}.supabase.co/rest/v1/user_cards?select=id&id=in.(${batch.join(',')})`;

            try {
                const res = await nativeFetch(targetUrl, {
                    method: 'GET',
                    headers: {
                        'apikey': authObj.apikey,
                        'authorization': token,
                        'accept': 'application/json',
                        'content-profile': 'public'
                    },
                    credentials: 'omit'
                });

                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        data.forEach(row => existingIds.add(row.id));
                    }
                }
            } catch (e) {
                console.error("[WM-Bulk] Erreur lors du scan Supabase :", e);
            }
        }

        let removedCount = 0;
        const cleanList = rawBulkList.filter(item => {
            const uId = typeof item === 'object' ? (item.user_card_id || item.userCardId) : null;
            if (!uId) return true;
            const exists = existingIds.has(uId);
            if (!exists) removedCount++;
            return exists;
        });

        localStorage.setItem('wmBulkList', JSON.stringify(cleanList));
        window.logToPanel(`✅ Nettoyage terminé : ${removedCount} cartes fantômes supprimées, ${cleanList.length} cartes réelles conservées.`);
        if (typeof window.showWMToast === 'function') {
            window.showWMToast(`Bulk nettoyé : -${removedCount} cartes fantômes`, true);
        }

        if (typeof window.updateBulkUI === 'function') window.updateBulkUI();
        if (typeof window.updateAllBulkButtonsUI === 'function') window.updateAllBulkButtonsUI();

        // Si l'utilisateur est sur la page collection avec la vue [WM-BULK], rafraîchir la page
        const searchInput = document.querySelector('input[placeholder*="titre"], input[placeholder*="echerche"], input[type="search"]');
        if (searchInput && searchInput.value.includes('[WM-BULK]')) {
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return { removed: removedCount, remaining: cleanList.length };
    }

    // ============================================================
    // RÉSOLUTION TITRE -> userCardId
    // ============================================================
    async function resolveUserCardId(title) {
        if (!title) return null;
        if (window.userCardIdCache.has(title)) return window.userCardIdCache.get(title);
        if (window.wmInventoryMap[title]) {
            window.userCardIdCache.set(title, window.wmInventoryMap[title]);
            return window.wmInventoryMap[title];
        }
        try {
            const r = await fetch(`/api/my-collection?q=${encodeURIComponent(title)}&page=0&stats=0`, { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            const items = data.collection || data.cards || data.data || [];
            const match = items.find(c => (c.card?.wikipedia_title || c.wikipedia_title) === title);
            if (match && match.id) {
                window.userCardIdCache.set(title, match.id);
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
            if (window.wmIDB) {
                window.wmIDB.getAll(window.wmIDB.stores.COLLECTION).then(idbCards => {
                    if (Array.isArray(idbCards) && idbCards.length > (window.wmCollectionCache.cards || []).length) {
                        window.wmCollectionCache.cards = idbCards.map(it => it.raw || [it.id, it.card_id, it.title, it.rarity, it.category, it.atk, it.def, it.is_shiny, it.obtainIndex]);
                        window.wmCollectionCache.ts = Date.now();
                        wmBuildCardIdIndex();
                        console.log(`[WM-Cache] 🚀 ${idbCards.length} cartes restaurées depuis IndexedDB`);
                    }
                }).catch(() => {});
            }
        } catch (e) {
            console.warn('[WM-Cache] Erreur chargement:', e);
        }
    }

    function wmSaveCollectionCache() {
        try {
            window.wmCollectionCache.ts = Date.now();
            localStorage.setItem(WM_COLLECTION_CACHE_KEY, JSON.stringify(window.wmCollectionCache));
            // Sauvegarde dans IndexedDB (espace illimité)
            if (window.wmIDB && Array.isArray(window.wmCollectionCache.cards)) {
                const idbCards = window.wmCollectionCache.cards.map(entry => {
                    if (Array.isArray(entry)) {
                        const [id, card_id, title, rarity, category, atk, def, is_shiny, obtainIndex] = entry;
                        return {
                            id: String(id || card_id || ''),
                            card_id: String(card_id || id || ''),
                            userCardId: String(id || ''),
                            title: String(title || ''),
                            rarity: String(rarity || 'C'),
                            category: category || '',
                            atk: atk ?? null,
                            def: def ?? null,
                            is_shiny: Boolean(is_shiny),
                            obtainIndex: obtainIndex ?? 0,
                            raw: entry
                        };
                    } else if (entry && typeof entry === 'object') {
                        return {
                            id: String(entry.id || entry.ucId || entry.card_id || ''),
                            card_id: String(entry.id || entry.card_id || ''),
                            userCardId: String(entry.ucId || entry.userCardId || ''),
                            title: String(entry.t || entry.title || ''),
                            rarity: String(entry.r || entry.rarity || 'C'),
                            category: entry.c || entry.category || '',
                            raw: entry
                        };
                    }
                    return null;
                }).filter(Boolean);
                if (idbCards.length > 0) {
                    window.wmIDB.bulkPut(window.wmIDB.stores.COLLECTION, idbCards).catch(() => {});
                }
            }
            if (typeof window.checkLocalStorageQuota === 'function') {
                window.checkLocalStorageQuota();
            }
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                window.logToPanel('⚠️ Cache collection : quota localStorage dépassé');
                if (typeof window.showPersistentStorageAlert === 'function') {
                    const stats = typeof window.getLocalStorageStats === 'function' ? window.getLocalStorageStats() : { percent: 100, usedMo: '5+', maxMo: '5.0', topKeys: [] };
                    window.showPersistentStorageAlert({ ...stats, percent: 100 }, true);
                }
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

    // ============================================================
    // INGESTION PASSIVE DE LA COLLECTION
    // ============================================================
    window.wmLastCollectionPage = [];
    let wmSaveCollectionTimeout = null;

    function debouncedSaveCollectionCache() {
        if (wmSaveCollectionTimeout) clearTimeout(wmSaveCollectionTimeout);
        wmSaveCollectionTimeout = setTimeout(() => {
            wmSaveCollectionCache();
            wmSaveCollectionTimeout = null;
        }, 1500);
    }

    function ingestCollectionData(collectionItems) {
        if (!Array.isArray(collectionItems) || collectionItems.length === 0) return;
        window.wmLastCollectionPage = collectionItems;

        const cacheMap = new Map();
        for (const stored of (window.wmCollectionCache.cards || [])) {
            if (stored.id) cacheMap.set(stored.id, stored);
            else if (stored.t) cacheMap.set(stored.t, stored);
        }

        let updated = false;
        for (const item of collectionItems) {
            const userCardId = item.id;
            const cardId = item.card?.id || item.card_id;
            const title = item.card?.wikipedia_title || item.wikipedia_title || item.title;
            const rarity = item.card?.rarity;
            const desc = item.card?.summary || item.card?.description || item.card?.extract || item.summary || item.description || item.extract || '';
            const category = item.card?.category || desc;
            const tags = Array.isArray(item.tags) ? item.tags : [];

            if (cardId && userCardId) {
                window.wmCardIdToUserCardId.set(cardId, userCardId);
            }

            // Mémorisation des tags existants dans le cache Map
            if (userCardId && window.wmUserCardTagsCache) {
                window.wmUserCardTagsCache.set(userCardId, new Set(tags.map(t => t.id)));
            }

            // Cache visuel des tags pour l'affichage immédiat
            if (title && tags.length > 0) {
                if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                window.wmVisualTagsCache[title] = tags.map(t => ({
                    id: t.id,
                    name: t.name,
                    color: t.color || '#a78bfa'
                }));
            }

            // Mise à jour du cache de collection
            if (cardId && title) {
                const existing = cacheMap.get(cardId) || cacheMap.get(title);
                if (existing) {
                    existing.ucId = userCardId || existing.ucId;
                    existing.r = rarity || existing.r;
                    existing.c = category || existing.c;
                    existing.t = title || existing.t;
                } else {
                    const newEntry = {
                        id: cardId,
                        ucId: userCardId,
                        t: title,
                        r: rarity,
                        c: category
                    };
                    window.wmCollectionCache.cards.push(newEntry);
                    cacheMap.set(cardId, newEntry);
                }
                updated = true;
            }
        }

        if (updated) {
            debouncedSaveCollectionCache();
        }
        console.log(`[WM-Collection] 📥 Ingestion passive de ${collectionItems.length} cartes (Index: ${window.wmCardIdToUserCardId.size}, Cache: ${window.wmCollectionCache.cards.length})`);
    }

    // Exposition immédiate pour les intercepteurs et traitement du tampon
    window.ingestCollectionData = WikiM.ingestCollectionData = ingestCollectionData;
    if (window._wmPendingCollectionData && Array.isArray(window._wmPendingCollectionData)) {
        console.log(`[WM-Collection] 📥 Traitement du tampon en attente (${window._wmPendingCollectionData.length} cartes)...`);
        ingestCollectionData(window._wmPendingCollectionData);
        window._wmPendingCollectionData = null;
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
        const cards = await window.fetchAllCollectionCards(onProgress);
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

        const normalize = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

        // Index du cache persistant par titre normalisé
        const cacheByTitle = new Map();
        for (const stored of (window.wmCollectionCache.cards || [])) {
            if (stored.t) cacheByTitle.set(normalize(stored.t), stored);
        }

        // Index de la dernière page API interceptée par titre normalisé
        const lastPageByTitle = new Map();
        for (const item of (window.wmLastCollectionPage || [])) {
            const t = item.card?.wikipedia_title || item.wikipedia_title || item.title;
            if (t) lastPageByTitle.set(normalize(t), item);
        }

        console.log(`[WM-Visible] DOM: ${cardEls.length} cartes | Dernière page API: ${lastPageByTitle.size} | Cache: ${cacheByTitle.size}`);

        const missing = [];

        for (let idx = 0; idx < cardEls.length; idx++) {
            const el = cardEls[idx];

            // 1. Extraction directe via React Fiber
            const reactData = getCardDataFromReact(el);
            let title = reactData?.title;

            // 2. Fallback titre DOM
            if (!title) {
                const h = el.querySelector('h3, h2, h1');
                if (h && h.textContent.trim().length > 1) title = h.textContent.trim();
                if (!title) {
                    const img = el.querySelector('img');
                    if (img && img.alt && img.alt.trim().length > 1) title = img.alt.trim();
                }
            }

            if (!title || seenTitles.has(title)) continue;
            seenTitles.add(title);

            const normT = normalize(title);

            let userCardId = reactData?.userCardId;
            let cardId = reactData?.id;
            let rarity = reactData?.rarity;
            let category = reactData?.category;
            let existingTags = reactData?.tags && reactData.tags.length > 0
                ? new Set(reactData.tags.map(t => t.id))
                : null;

            // 3. Complétion via la dernière page API interceptée
            const pageItem = lastPageByTitle.get(normT);
            if (pageItem) {
                userCardId = userCardId || pageItem.id;
                cardId = cardId || pageItem.card?.id || pageItem.card_id;
                rarity = rarity || pageItem.card?.rarity;
                category = category || pageItem.card?.category;
                if (!existingTags && Array.isArray(pageItem.tags)) {
                    existingTags = new Set(pageItem.tags.map(t => t.id));
                }
            }

            // 4. Complétion via le cache persistant
            const stored = cacheByTitle.get(normT);
            if (stored) {
                userCardId = userCardId || stored.ucId || window.wmCardIdToUserCardId.get(stored.id);
                cardId = cardId || stored.id;
                rarity = rarity || stored.r;
                category = category || stored.c;
            }

            // 5. Complétion via la table wmCardIdToUserCardId
            if (!userCardId && cardId && window.wmCardIdToUserCardId.has(cardId)) {
                userCardId = window.wmCardIdToUserCardId.get(cardId);
            }

            // 6. Complétion via wmUserCardTagsCache
            if (userCardId && !existingTags && window.wmUserCardTagsCache?.has(userCardId)) {
                existingTags = window.wmUserCardTagsCache.get(userCardId);
            }

            if (userCardId) {
                result.push({
                    id: cardId || userCardId,
                    userCardId: userCardId,
                    title: title,
                    rarity: rarity,
                    category: category,
                    existingTags: existingTags
                });
            } else {
                missing.push({ el, title, index: idx });
            }
        }

        console.log(`[WM-Visible] ✅ ${result.length} résolues sans requête, ${missing.length} manquantes`);

        // Si des cartes manquent dans la page actuelle, on fait UN SEUL fetch groupé pour la page au lieu de requêtes individuelles
        if (missing.length > 0) {
            console.log(`[WM-Visible] 🔄 Tentative de résolution groupée pour ${missing.length} cartes...`);
            if (onProgress) onProgress(`Synchronisation de la page (${missing.length} cartes)...`);

            try {
                // Détection de l'URL de collection ou des filtres de la page actuelle
                let fetchTarget = window._wmLastCollectionUrl;
                if (!fetchTarget) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const pageNum = urlParams.get('page') || '0';
                    const sortParam = urlParams.get('sort') || 'rarity';
                    fetchTarget = `/api/my-collection?sort=${encodeURIComponent(sortParam)}&page=${pageNum}&stats=0`;
                }

                const pageData = await window.withRetry(async () => {
                    const resp = await fetch(fetchTarget, {
                        credentials: 'include',
                        headers: { 'Accept': '*/*' }
                    });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    return await resp.json();
                }, {
                    label: 'collection page sync',
                    retries: 2,
                    baseDelay: 600,
                    maxDelay: 2000
                });

                const items = pageData?.collection || [];
                if (items.length > 0) {
                    ingestCollectionData(items);

                    // Ré-indexation rapide des cartes manquantes avec les données de la page ingérée
                    const pageMap = new Map();
                    for (const it of items) {
                        const t = it.card?.wikipedia_title || it.wikipedia_title || it.title;
                        if (t) pageMap.set(normalize(t), it);
                    }

                    const stillMissing = [];
                    for (const m of missing) {
                        const normT = normalize(m.title);
                        const match = pageMap.get(normT);
                        if (match && match.id) {
                            const cid = match.card?.id || match.card_id || m.title;
                            const desc = match.card?.summary || match.card?.description || match.card?.extract || '';
                            result.push({
                                id: cid,
                                userCardId: match.id,
                                title: m.title,
                                rarity: match.card?.rarity,
                                category: match.card?.category || desc,
                                summary: desc,
                                description: desc,
                                existingTags: Array.isArray(match.tags) ? new Set(match.tags.map(t => t.id)) : null
                            });
                        } else {
                            stillMissing.push(m);
                        }
                    }

                    console.log(`[WM-Visible] Résolution groupée réussie : ${missing.length - stillMissing.length} cartes récupérées en 1 seule requête !`);
                }
            } catch (err) {
                console.warn('[WM-Visible] Échec du fetch groupé de la page:', err);
            }
        }

        console.log(`[WM-Visible] Résolu: ${result.filter(c => c.userCardId).length} / ${result.length}`);
        return result;
    }

    // ============================================================
    // ÉVALUATION RÉCURSIVE DES RÈGLES (Supporte ET/OU imbriqués & Ancien format)
    // ============================================================
    function evaluateConditionLeaf(card, cond, prices) {
        if (!cond || !cond.field) return false;
        const field = window.WM_RULE_FIELDS[cond.field];
        if (!field) return false;
        let value = field.getter(card, prices);
        // Si la catégorie est nulle ou vide, repli par défaut sur la description
        if (cond.field === 'category' && (!value || String(value).trim() === '')) {
            value = card.summary || card.description || card.extract || '';
        }
        if (value === null || value === undefined) return false;
        const op = window.WM_RULE_OPERATORS[cond.operator];
        if (!op) return false;
        return op(value, cond.value);
    }

    function evaluateLogicNode(card, node, prices) {
        if (!node) return false;

        // Si le nœud est un groupe logique (possède un tableau 'children')
        if (Array.isArray(node.children)) {
            if (node.children.length === 0) return false;
            const logic = (node.logic || node.operator || 'AND').toUpperCase();
            if (logic === 'OR') {
                return node.children.some(child => evaluateLogicNode(card, child, prices));
            } else {
                return node.children.every(child => evaluateLogicNode(card, child, prices));
            }
        }

        // Sinon, c'est une condition terminale (feuille)
        return evaluateConditionLeaf(card, node, prices);
    }

    function evaluateRule(card, rule, prices) {
        if (!rule) return false;

        // 1. Nouvelle structure arborescente (rootGroup)
        if (rule.rootGroup && Array.isArray(rule.rootGroup.children)) {
            return evaluateLogicNode(card, rule.rootGroup, prices);
        }

        // 2. Alternative où la règle porte directement children
        if (Array.isArray(rule.children)) {
            return evaluateLogicNode(card, rule, prices);
        }

        // 3. Rétrocompatibilité totale avec l'ancienne structure plate (conditions = AND)
        if (Array.isArray(rule.conditions) && rule.conditions.length > 0) {
            return rule.conditions.every(cond => evaluateLogicNode(card, cond, prices));
        }

        return false;
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
        if (!el) return null;
        const target = el.closest ? (el.closest('.w-72, div.rounded-2xl, div.relative.isolate.group') || el) : el;
        const reactKey = Object.keys(target).find(k => k.startsWith('__reactFiber$')) || Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (!reactKey) return null;
        let fiber = target[reactKey] || el[reactKey];
        let attempts = 0;
        let foundCard = null;
        let foundUserCardId = null;

        while (fiber && attempts < 35) {
            const props = fiber.memoizedProps;
            if (props) {
                // Recherche directe d'un userCardId ou item/userCard
                if (!foundUserCardId) {
                    if (props.userCard?.id) foundUserCardId = props.userCard.id;
                    else if (props.userCardId) foundUserCardId = props.userCardId;
                    else if (props.item?.id && (props.item?.card || props.item?.user_id || props.item?.obtained_at)) {
                        foundUserCardId = props.item.id;
                    }
                }

                if (!foundCard) {
                    const candidates = [props.item, props.userCard, props.card, props.data, props.value];
                    for (const c of candidates) {
                        if (c && typeof c === 'object' && (c.id || c.wikipedia_title || c.title)) {
                            const isUserCard = Boolean(c.card || c.user_id || c.obtained_at);
                            const uId = isUserCard ? c.id : (foundUserCardId || window.wmCardIdToUserCardId?.get(c.id) || null);
                            const cId = isUserCard ? (c.card?.id || c.card_id || c.id) : (c.id || c.card_id);
                            const title = c.wikipedia_title || c.card?.wikipedia_title || c.title;
                            const rarity = c.rarity || c.card?.rarity;
                            const desc = c.summary || c.card?.summary || c.description || c.card?.description || c.extract || c.card?.extract || '';
                            const category = c.category || c.card?.category || desc;
                            const tags = Array.isArray(c.tags) ? c.tags : (Array.isArray(c.card?.tags) ? c.card.tags : []);

                            foundCard = {
                                id: cId || c.id,
                                userCardId: uId,
                                title: title,
                                rarity: rarity,
                                category: category,
                                summary: desc,
                                description: desc,
                                tags: tags
                            };
                            break;
                        }
                    }
                }

                if (foundCard && foundUserCardId) {
                    foundCard.userCardId = foundUserCardId;
                    return foundCard;
                }
            }
            fiber = fiber.return;
            attempts++;
        }
        if (foundCard) {
            if (foundUserCardId) foundCard.userCardId = foundUserCardId;
            return foundCard;
        }
        return null;
    }

    window.wmVisualTagsCache = {}; // Cache global pour stocker les tags appliqués

    function handleRemoveVisualTag(userCardId, tagId, cardTitle, event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (!userCardId) {
            console.warn('[WM-Tags] Impossible de supprimer le tag : userCardId manquant');
            if (typeof window.showWMToast === 'function') window.showWMToast('Erreur : ID physique introuvable', false);
            return;
        }

        // 1. Mise à jour optimiste immédiate (0 ms de délai ressenti)
        if (window.wmUserCardTagsCache && window.wmUserCardTagsCache.has(userCardId)) {
            window.wmUserCardTagsCache.get(userCardId).delete(tagId);
        }

        let previousTags = null;
        if (cardTitle && window.wmVisualTagsCache[cardTitle]) {
            previousTags = [...window.wmVisualTagsCache[cardTitle]];
            window.wmVisualTagsCache[cardTitle] = window.wmVisualTagsCache[cardTitle].filter(t => t.id !== tagId);
            if (window.wmVisualTagsCache[cardTitle].length === 0) {
                delete window.wmVisualTagsCache[cardTitle];
            }
        }

        renderTagsOnAllCards();

        const tagName = (window.wmTagsCache || []).find(t => t.id === tagId)?.name || 'Tag';
        window.logToPanel(`🗑️ Tag "${tagName}" retiré de "${cardTitle}"`);
        if (typeof window.showWMToast === 'function') {
            window.showWMToast(`🗑️ ${tagName} retiré`, true);
        }

        // 2. Requête réseau exécutée en arrière-plan
        if (typeof window.wmRemoveTag === 'function') {
            window.wmRemoveTag(userCardId, tagId).then(res => {
                if (res && res.ok === false) throw new Error(res.error || 'Erreur API');
            }).catch(e => {
                console.error('[WM-Tags] ❌ Erreur suppression tag en arrière-plan :', e);
                // Annulation / rollback en cas d'échec réseau
                if (window.wmUserCardTagsCache && window.wmUserCardTagsCache.has(userCardId)) {
                    window.wmUserCardTagsCache.get(userCardId).add(tagId);
                }
                if (cardTitle && previousTags) {
                    window.wmVisualTagsCache[cardTitle] = previousTags;
                }
                renderTagsOnAllCards();
                if (typeof window.showWMToast === 'function') {
                    window.showWMToast(`Erreur suppression : ${e.message}`, false);
                }
            });
        }
    }

    function renderTagsOnAllCards() {
        const cards = document.querySelectorAll('.w-72');
        cards.forEach(card => {
            let cardData = null;
            if (typeof window.getCardDataFromReact === 'function') {
                cardData = window.getCardDataFromReact(card);
            }

            const titleEl = card.querySelector('h3, h2, h1') || card.closest('.flex-col, .flex-row')?.querySelector('h1, h2, h3');
            const title = (titleEl ? titleEl.textContent.trim() : null) || cardData?.title;
            if (!title) return;

            let userCardId = null;
            if (cardData) {
                if (cardData.card_id && window.wmCardIdToUserCardId?.has(cardData.card_id)) {
                    userCardId = window.wmCardIdToUserCardId.get(cardData.card_id);
                } else if (window.wmCardIdToUserCardId?.has(cardData.id)) {
                    userCardId = window.wmCardIdToUserCardId.get(cardData.id);
                } else {
                    userCardId = cardData.userCardId || cardData.id;
                }
            }
            if (!userCardId) {
                userCardId = card.dataset.wmUuid || null;
            }
            if (!userCardId && title) {
                userCardId = window.wmCardIdToUserCardId?.get(title) || null;
            }

            let tags = window.wmVisualTagsCache?.[title];

            // 1. Synchronisation depuis React si pas en cache visuel (ex: rafraichissement collection)
            if ((!tags || tags.length === 0) && cardData && Array.isArray(cardData.tags) && cardData.tags.length > 0) {
                tags = cardData.tags.map(t => ({
                    id: t.id,
                    name: t.name,
                    color: t.color || '#a78bfa'
                }));
                if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                window.wmVisualTagsCache[title] = tags;
                if (userCardId && window.wmUserCardTagsCache) {
                    window.wmUserCardTagsCache.set(userCardId, new Set(cardData.tags.map(t => t.id)));
                }
            }

            // 2. Synchronisation depuis wmUserCardTagsCache
            if ((!tags || tags.length === 0) && userCardId && window.wmUserCardTagsCache?.has(userCardId)) {
                const tagIds = window.wmUserCardTagsCache.get(userCardId);
                if (tagIds && tagIds.size > 0 && Array.isArray(window.wmTagsCache) && window.wmTagsCache.length > 0) {
                    tags = Array.from(tagIds).map(id => {
                        const tObj = window.wmTagsCache.find(t => t.id === id);
                        return tObj ? { id: tObj.id, name: tObj.name, color: tObj.color || '#a78bfa' } : null;
                    }).filter(Boolean);
                    if (tags.length > 0) {
                        if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                        window.wmVisualTagsCache[title] = tags;
                    }
                }
            }

            let tagContainer = card.querySelector('.wm-visual-tags');

            if (tags && tags.length > 0) {
                if (getComputedStyle(card).position === 'static') {
                    card.style.position = 'relative';
                }

                if (!tagContainer) {
                    tagContainer = document.createElement('div');
                    tagContainer.className = 'wm-visual-tags';
                    card.appendChild(tagContainer);
                }

                // Rendu des badges (clic direct sur le badge pour supprimer le tag)
                tagContainer.innerHTML = '';
                tags.forEach(t => {
                    const badge = document.createElement('div');
                    badge.className = 'wm-visual-tag-badge';
                    badge.style.backgroundColor = t.color || '#a78bfa';
                    badge.style.boxShadow = `0 0 8px ${t.color || '#a78bfa'}80`;
                    badge.title = `Cliquer pour retirer "${t.name}"`;
                    badge.addEventListener('click', (ev) => {
                        handleRemoveVisualTag(userCardId, t.id, title, ev);
                    });

                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'wm-visual-tag-name';
                    labelSpan.textContent = t.name;
                    badge.appendChild(labelSpan);

                    tagContainer.appendChild(badge);
                });
            } else if (tagContainer) {
                tagContainer.remove();
            }
        });
    }

    function renderPricesOnAllCards() {
        const cards = document.querySelectorAll('.w-72.rounded-2xl');
        cards.forEach(card => {
            const cachedUuid = card.dataset.wmUuid;
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            const title = titleEl ? titleEl.textContent.trim() : null;

            // Déclenche le fetch via la queue si pas encore en cache
            if (cachedUuid && !window.wmPrices[cachedUuid] && (!title || !window.wmPrices[title])) {
                window.fetchPricesBackground(cachedUuid, title);
            }

            // Récupère les données : priorité au UUID, puis au titre
            const priceData = (cachedUuid && window.wmPrices[cachedUuid]) || (title && window.wmPrices[title]);
            if (priceData) {
                let rowsHtml = '';
                if (priceData === "LOADING") rowsHtml = `<div class="wm-price-row wm-loading-badge">⏳ Chargement...</div>`;
                else if (priceData === "EMPTY") rowsHtml = `<div class="wm-price-row wm-empty-sales">Aucune vente</div>`;
                else if (priceData === "ERROR") rowsHtml = `<div class="wm-price-row wm-empty-sales" style="color:#ef4444;">Erreur</div>`;
                else {
                    // Détection de la rareté de la carte
                    let cardRarity = card.dataset.wmRarity;
                    if (!cardRarity) {
                        // 1. Badge DOM natif (ex: <div class="absolute top-2 left-2 ...">C</div>)
                        const rarityBadge = card.querySelector('div.absolute.top-2.left-2, .wm-rarity-badge');
                        if (rarityBadge && rarityBadge.textContent.trim().length <= 2) {
                            cardRarity = rarityBadge.textContent.trim().toUpperCase();
                        }
                    }
                    if (!cardRarity) {
                        // 2. Classes CSS du conteneur (ex: glow-c, glow-pc, glow-ur)
                        const classMatch = card.className.match(/glow-([a-z]+)/i);
                        if (classMatch) {
                            const rMap = { 'c': 'C', 'pc': 'PC', 'r': 'R', 'sr': 'SR', 'ur': 'UR', 'l': 'L' };
                            cardRarity = rMap[classMatch[1].toLowerCase()] || null;
                        }
                    }

                    let hasPrices = false;
                    // Si la rareté de la carte est connue, on affiche en priorité son prix
                    const raritiesToCheck = cardRarity ? [cardRarity] : ['L', 'UR', 'SR', 'R', 'PC', 'C'];

                    raritiesToCheck.forEach(r => {
                        const val = priceData[r];
                        const num = typeof val === 'number' ? val : (val && typeof val.average === 'number' ? val.average : null);
                        if (num !== null) {
                            rowsHtml += `<div class="wm-price-row"><span class="wm-rarity-label wm-r-${r}">${r}</span><span class="wm-val">${num}</span></div>`;
                            hasPrices = true;
                        }
                    });

                    // Si la carte a une rareté connue mais aucune vente pour cette rareté spécifique
                    if (!hasPrices) rowsHtml = `<div class="wm-price-row wm-empty-sales">Aucune vente</div>`;
                }

                const existingPanel = card.querySelector('.wm-price-panel');
                if (existingPanel) {
                    if (existingPanel.innerHTML !== rowsHtml) existingPanel.innerHTML = rowsHtml;
                } else {
                    const panel = document.createElement('div');
                    panel.className = 'wm-price-panel';
                    panel.innerHTML = rowsHtml;
                    card.appendChild(panel);
                }
            }
        });
    }

    function renderAltBadgesOnAllCards() {
        if (!window.wmAltCardOwners) return;
        // Sélecteur large : cartes de la grille ou modales
        const cards = document.querySelectorAll('.w-72, div.rounded-2xl.overflow-hidden.relative');

        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (!titleEl) return;

            let altName = null;
            const cardData = getCardDataFromReact(card);

            // 1. Recherche par identifiant React
            if (cardData && cardData.id && window.wmAltCardOwners[cardData.id]) {
                altName = window.wmAltCardOwners[cardData.id];
            }

            // 2. Recherche par dataset UUID
            if (!altName && card.dataset.wmUuid && window.wmAltCardOwners[card.dataset.wmUuid]) {
                altName = window.wmAltCardOwners[card.dataset.wmUuid];
            }

            // 3. Recherche par titre normalisé
            if (!altName) {
                const title = titleEl.textContent.replace(/\s+/g, ' ').trim();
                altName = window.wmAltCardOwners[title] || window.wmAltCardOwners[`title:${title}`];
            }

            let altBadge = card.querySelector('.wm-alt-badge');

            if (altName) {
                if (!altBadge) {
                    card.style.setProperty('position', 'relative', 'important');
                    altBadge = document.createElement('div');
                    altBadge.className = 'wm-alt-badge';
                    altBadge.style.cssText = 'position:absolute; bottom:12px; right:12px; z-index:9999; background:#fbbf24; color:#000; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.8); pointer-events:none;';
                    altBadge.textContent = `👤 ${altName}`;
                    card.appendChild(altBadge);
                }
                card.style.setProperty('border', '3px solid #fbbf24', 'important');
                card.style.setProperty('box-shadow', '0 0 15px rgba(251, 191, 36, 0.4)', 'important');
                card.querySelectorAll('.wm-action-btn').forEach(b => b.style.display = 'none');
            } else {
                if (altBadge) altBadge.remove();
                if (card.style.borderColor === 'rgb(251, 191, 36)' || card.style.borderColor === '#fbbf24' || card.style.getPropertyValue('border').includes('251')) {
                    card.style.border = '';
                    card.style.boxShadow = '';
                }
                card.querySelectorAll('.wm-action-btn').forEach(b => b.style.display = 'flex');
            }
        });
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
                    if (isDirectDiscard) { confirmBtn.click(); if (window.wmPendingCardTitle) window.markCardAsProcessedByTitle(window.wmPendingCardTitle); }
                    else {
                        confirmBtn.addEventListener('click', () => {
                            if (window.wmPendingCardTitle) window.markCardAsProcessedByTitle(window.wmPendingCardTitle);
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
                if (window.wmPendingCardTitle) window.markCardAsProcessedByTitle(window.wmPendingCardTitle);
            } else if (attempts > 150) { clearInterval(checkModal); }
        }, 50);
    }

    function toggleBulkForCard(card) {
        const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
        if (!titleEl) return;
        const title = titleEl.textContent.trim();
        let list = window.getBulkList();

        const existingIndex = list.findIndex(item => (typeof item === 'string' ? item : item.title) === title);

        if (existingIndex > -1) {
            list.splice(existingIndex, 1);
            window.saveBulkList(list);
            window.logToPanel(`[Bulk] Retiré : ${title}`);
        } else {
            const cardData = getCardDataFromReact(card);
            let userCardId = null;

            if (cardData) {
                // On croise toutes nos données pour extraire l'ID physique avec certitude
                if (cardData.card_id && window.wmCardIdToUserCardId.has(cardData.card_id)) {
                    userCardId = window.wmCardIdToUserCardId.get(cardData.card_id);
                } else if (window.wmCardIdToUserCardId.has(cardData.id)) {
                    userCardId = window.wmCardIdToUserCardId.get(cardData.id);
                } else {
                    userCardId = cardData.id; // Fallback
                }
            } else {
                userCardId = card.dataset.wmUuid || null;
            }

            list.push({ title: title, user_card_id: userCardId, id: cardData?.id, userCardId: userCardId });
            window.saveBulkList(list);
            window.logToPanel(`[Bulk] ✅ Ajouté : ${title}`);
        }

        window.updateBulkUI();
        window.updateAllBulkButtonsUI();
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
                const inList = window.isTitleInBulkList(title);
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

    /**
     * Injecte la case à cocher 'Multi-comptes', la flèche de sélection des comptes et la barre d'inspection
     */
    function ensureCollectionMultiSearchToggle() {
        if (!window.location.pathname.includes('/collection')) return;
        if (document.getElementById('wm-col-multi-wrapper')) return;

        // Trouver le champ de recherche de la collection
        const searchInput = document.querySelector('input[placeholder*="titre"], input[placeholder*="echerche"], input[type="search"], input[placeholder*="Search"]');
        if (!searchInput) return;

        // Écoute de la saisie utilisateur pour annuler immédiatement toute recherche multi-compte en cours
        if (!searchInput._wmAbortAttached) {
            searchInput._wmAbortAttached = true;
            searchInput.addEventListener('input', () => {
                if (typeof window.abortMultiSearch === 'function') {
                    window.abortMultiSearch();
                }
            });
        }

        const parent = searchInput.parentElement;
        if (!parent) return;

        const isEnabled = localStorage.getItem('wmMultiSearchEnabled') === 'true';
        const inspectTarget = localStorage.getItem('wmInspectUser') || '';

        const wrapper = document.createElement('div');
        wrapper.id = 'wm-col-multi-wrapper';
        wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:8px; margin-left:8px; position:relative; z-index:100; user-select:none; font-family:sans-serif;';

        wrapper.innerHTML = `
            <!-- Checkbox Multi-comptes & Flèche déroulante -->
            <div style="display:inline-flex; align-items:center; background:rgba(30,41,59,0.85); border:1px solid rgba(251,191,36,0.3); border-radius:8px; padding:4px 8px; gap:6px;">
                <label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-size:12px; color:#fbbf24; font-weight:bold; margin:0;">
                    <input type="checkbox" id="wm-col-multi-toggle" ${isEnabled ? 'checked' : ''} style="cursor:pointer; accent-color:#fbbf24;">
                    <span>👥 Multi-comptes</span>
                </label>
                <button type="button" id="wm-col-multi-menu-btn" title="Choisir les comptes" style="background:none; border:none; color:#fbbf24; cursor:pointer; padding:0 3px; font-size:11px; line-height:1; opacity:0.85; transition:opacity 0.2s;">
                    ▼
                </button>
            </div>

            <!-- Menu déroulant des comptes -->
            <div id="wm-col-multi-dropdown" style="display:none; position:absolute; top:calc(100% + 6px); left:0; z-index:99999; background:rgba(15,23,42,0.98); border:1px solid rgba(251,191,36,0.4); border-radius:10px; padding:8px 10px; box-shadow:0 8px 24px rgba(0,0,0,0.7); min-width:180px; max-height:240px; overflow-y:auto; backdrop-filter:blur(8px);">
                <div style="font-size:11px; font-weight:bold; color:#fbbf24; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                    <span>Comptes inclus :</span>
                    <button type="button" id="wm-col-multi-select-all" style="background:none; border:none; color:#38bdf8; font-size:10px; cursor:pointer;">Tous</button>
                </div>
                <div id="wm-col-multi-accounts-list" style="display:flex; flex-direction:column; gap:5px;"></div>
            </div>

            <!-- Inspecter la collection d'un joueur -->
            <div id="wm-col-inspect-container" style="display:inline-flex; align-items:center; background:rgba(30,41,59,0.85); border:1px solid rgba(56,189,248,0.3); border-radius:8px; padding:2px 6px; gap:4px;">
                <input type="text" id="wm-col-inspect-input" placeholder="👤 Voir collection de..." value="${inspectTarget}" style="background:transparent; border:none; color:#e0f2fe; font-size:11px; width:135px; outline:none;" title="Entrez le pseudo d'un joueur et appuyez sur Entrée">
                <button type="button" id="wm-col-inspect-btn" title="Inspecter cette collection" style="background:linear-gradient(135deg, #0284c7, #0369a1); border:none; border-radius:5px; color:#fff; font-size:10px; font-weight:bold; padding:2px 6px; cursor:pointer;">OK</button>
                <button type="button" id="wm-col-inspect-clear" title="Revenir à ma collection" style="background:none; border:none; color:#ef4444; font-size:11px; font-weight:bold; cursor:pointer; padding:0 2px; ${inspectTarget ? '' : 'display:none;'}">✕</button>
            </div>

            <span id="wm-multi-progress" style="font-size:11px; font-weight:normal; transition:color 0.2s;"></span>
        `;

        // 1. Logique Checkbox Multi-comptes
        const mainCheckbox = wrapper.querySelector('#wm-col-multi-toggle');
        mainCheckbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            localStorage.setItem('wmMultiSearchEnabled', checked ? 'true' : 'false');
            window.logToPanel(checked ? '👥 Recherche multi-comptes activée' : '👤 Recherche multi-comptes désactivée');
            if (!checked && typeof window.abortMultiSearch === 'function') {
                window.abortMultiSearch();
            }
            const panelToggle = document.getElementById('wm-pref-multi-enabled');
            if (panelToggle) panelToggle.checked = checked;
        });

        // 2. Logique Menu Déroulant des Comptes
        const menuBtn = wrapper.querySelector('#wm-col-multi-menu-btn');
        const dropdown = wrapper.querySelector('#wm-col-multi-dropdown');
        const accountsList = wrapper.querySelector('#wm-col-multi-accounts-list');
        const selectAllBtn = wrapper.querySelector('#wm-col-multi-select-all');

        const renderDropdownAccounts = () => {
            const allAlts = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
            const savedSelected = JSON.parse(localStorage.getItem('wmMultiSelectedAccounts') || 'null');
            const activeSet = new Set(Array.isArray(savedSelected) ? savedSelected : allAlts);

            selectAllBtn.textContent = (activeSet.size === allAlts.length && allAlts.length > 0) ? 'Aucun' : 'Tous';

            if (allAlts.length === 0) {
                accountsList.innerHTML = `<span style="font-size:11px; color:#94a3b8; font-style:italic;">Aucun compte configuré (voir onglet Préférences du panel).</span>`;
                return;
            }

            accountsList.innerHTML = allAlts.map(alt => `
                <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#cbd5e1; cursor:pointer; padding:2px 0;">
                    <input type="checkbox" class="wm-alt-choice" data-alt="${alt}" ${activeSet.has(alt) ? 'checked' : ''} style="cursor:pointer; accent-color:#fbbf24;">
                    <span>${alt}</span>
                </label>
            `).join('');

            accountsList.querySelectorAll('.wm-alt-choice').forEach(cb => {
                cb.addEventListener('change', () => {
                    const selected = Array.from(accountsList.querySelectorAll('.wm-alt-choice:checked')).map(el => el.dataset.alt);
                    localStorage.setItem('wmMultiSelectedAccounts', JSON.stringify(selected));
                    window.wmMultiSearchCache = null;
                    if (typeof window.abortMultiSearch === 'function') {
                        window.abortMultiSearch();
                    }
                    selectAllBtn.textContent = (selected.length === allAlts.length && allAlts.length > 0) ? 'Aucun' : 'Tous';
                    window.logToPanel(`👥 Comptes sélectionnés : ${selected.join(', ') || 'Aucun'}`);
                });
            });
        };

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.style.display === 'block';
            dropdown.style.display = isOpen ? 'none' : 'block';
            menuBtn.textContent = isOpen ? '▼' : '▲';
            if (!isOpen) renderDropdownAccounts();
        });

        selectAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const allAlts = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
            const currentSelected = Array.from(accountsList.querySelectorAll('.wm-alt-choice:checked')).map(el => el.dataset.alt);
            const newSelected = (currentSelected.length === allAlts.length && allAlts.length > 0) ? [] : allAlts;
            localStorage.setItem('wmMultiSelectedAccounts', JSON.stringify(newSelected));
            window.wmMultiSearchCache = null;
            if (typeof window.abortMultiSearch === 'function') {
                window.abortMultiSearch();
            }
            renderDropdownAccounts();
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.style.display = 'none';
                menuBtn.textContent = '▼';
            }
        });

        // 3. Logique Inspection Individuelle d'un Joueur
        const inspectInput = wrapper.querySelector('#wm-col-inspect-input');
        const inspectBtn = wrapper.querySelector('#wm-col-inspect-btn');
        const inspectClear = wrapper.querySelector('#wm-col-inspect-clear');

        const triggerInspect = () => {
            const targetUser = inspectInput.value.trim();
            if (targetUser) {
                localStorage.setItem('wmInspectUser', targetUser);
                inspectBtn.textContent = '⏳';
                inspectBtn.disabled = true;
                window.logToPanel(`🔍 Inspection de la collection de "${targetUser}" en cours...`);
            } else {
                localStorage.removeItem('wmInspectUser');
                window.logToPanel(`👤 Retour à votre collection...`);
            }

            // Invalide le cache et annule toute recherche en cours
            window.wmMultiSearchCache = null;
            if (typeof window.abortMultiSearch === 'function') {
                window.abortMultiSearch();
            }

            // Rechargement immédiat de la page pour rafraîchir l'arbre React et charger la collection
            window.location.reload();
        };

        inspectBtn.addEventListener('click', triggerInspect);
        inspectInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                triggerInspect();
            }
        });

        inspectClear.addEventListener('click', () => {
            inspectInput.value = '';
            localStorage.removeItem('wmInspectUser');
            window.logToPanel(`👤 Retour à votre collection...`);
            window.wmMultiSearchCache = null;
            if (typeof window.abortMultiSearch === 'function') {
                window.abortMultiSearch();
            }
            window.location.reload();
        });

        // Injection dans le DOM à côté du champ de recherche
        if (typeof parent.insertAdjacentElement === 'function') {
            parent.insertAdjacentElement('afterend', wrapper);
        } else if (parent.parentElement) {
            parent.parentElement.appendChild(wrapper);
        } else {
            parent.appendChild(wrapper);
        }
    }

    function updateMultiSearchProgress(text, isDone = false) {
        const el = document.getElementById('wm-multi-progress');
        if (el) {
            el.textContent = text;
            el.style.color = isDone ? '#10b981' : '#fbbf24';
            if (isDone) {
                setTimeout(() => { if (el && el.textContent === text) el.textContent = ''; }, 4500);
            }
        }
    }
    window.updateMultiSearchProgress = updateMultiSearchProgress;
    window.WikiM.updateMultiSearchProgress = updateMultiSearchProgress;

    function injectBulkButtonInCollection() {
        if (!window.location.pathname.startsWith('/collection')) return;
        if (document.getElementById('wm-btn-collection-bulk')) return;

        // On cherche le bouton natif "Sélectionner"
        const buttons = Array.from(document.querySelectorAll('button'));
        const selectBtn = buttons.find(b => b.textContent.trim() === 'Sélectionner');

        if (selectBtn && selectBtn.parentNode) {
            const bulkBtn = document.createElement('button');
            bulkBtn.id = 'wm-btn-collection-bulk';
            bulkBtn.className = selectBtn.className;
            bulkBtn.style.borderColor = '#6366f1';
            bulkBtn.style.color = '#a5b4fc';
            bulkBtn.innerHTML = `🗑️ Afficher mon Bulk`;

            bulkBtn.addEventListener('click', () => {
                window.wmBulkViewActive = !window.wmBulkViewActive;
                bulkBtn.style.background = window.wmBulkViewActive ? 'rgba(99,102,241,0.15)' : '';

                if (window.wmBulkViewActive) {
                    window.wmBulkFullCardsCache = null; // Force le rafraîchissement au clic
                }

                // Recherche de l'input de recherche (placeholder titre / search / recherche)
                const searchInput = document.querySelector('input[placeholder*="titre"], input[placeholder*="echerche"], input[type="search"], input[placeholder*="Search"]');
                if (searchInput) {
                    const currentVal = searchInput.value || '';
                    let newVal = '';

                    if (window.wmBulkViewActive) {
                        // Si l'utilisateur avait déjà tapé un filtre, on le garde après [WM-BULK]
                        const cleanWord = currentVal.replace(/\[WM-BULK\]/gi, '').trim();
                        newVal = cleanWord ? `[WM-BULK] ${cleanWord}` : '[WM-BULK]';
                    } else {
                        // En désactivant le mode bulk, on retire le préfixe [WM-BULK]
                        newVal = currentVal.replace(/\[WM-BULK\]\s*/gi, '').trim();
                    }

                    console.log(`[WM-Bulk] 🔄 Commutation vue Bulk: ${window.wmBulkViewActive ? 'ACTIVE' : 'INACTIVE'}, valeur input: "${newVal}"`);
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(searchInput, newVal);
                    } else {
                        searchInput.value = newVal;
                    }
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    console.warn("[WM-Bulk] ⚠️ Input de recherche introuvable sur la page /collection.");
                }
            });

            selectBtn.parentNode.insertBefore(bulkBtn, selectBtn);
        }
    }
    window.injectBulkButtonInCollection = WikiM.injectBulkButtonInCollection = injectBulkButtonInCollection;

    // ============================================================
    // NAVIGATION ENTRE CARTES DANS LE MODAL (COLLECTION)
    // ============================================================

    // Conteneur de la grille de collection
    const WM_GRID_CONTAINER_SELECTOR = 'div.flex.flex-wrap.justify-center';
    // Carte individuelle dans la grille
    const WM_CARD_SELECTOR = 'div.relative.isolate.group';
    // Modal de carte
    const WM_MODAL_SELECTOR = 'div.card-frame.animate-fade-in-up';

    window.wmCurrentCardIndex = window.wmCurrentCardIndex ?? -1;
    window.wmCurrentCardTitle = window.wmCurrentCardTitle ?? null;

    /**
 * Récupère les cartes visibles de la collection.
 * On prend toutes les div.relative.isolate.group qui contiennent une image
 * (filtre pour éviter les faux positifs).
 */
    function getCollectionCards() {
        const modal = document.querySelector(WM_MODAL_SELECTOR);
        return Array.from(document.querySelectorAll(WM_CARD_SELECTOR))
            .filter(el => el.querySelector('img') && (!modal || !modal.contains(el)));
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
        // Cherche un bouton de fermeture dans le modal ou son conteneur
        const modal = document.querySelector(WM_MODAL_SELECTOR);
        const container = modal ? (modal.closest('.fixed, [role="dialog"]') || modal.parentElement || document) : document;

        const closeBtn = (modal && (
            modal.querySelector('button[aria-label="Fermer"]')
            || modal.querySelector('button[aria-label="Close"]')
            || modal.querySelector('button[aria-label*="erm"]')
        )) || container.querySelector('button[aria-label="Fermer"]')
           || container.querySelector('button[aria-label="Close"]')
           || container.querySelector('button[aria-label*="erm"]')
           || document.querySelector('button[aria-label="Fermer"]');

        if (closeBtn) {
            closeBtn.click();
            return;
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
        if (window._wmNavigating) return;
        window._wmNavigating = true;

        const cards = getCollectionCards();
        if (!cards.length) {
            window._wmNavigating = false;
            return;
        }

        // --- GESTION DU CHANGEMENT DE PAGE ---
        if (targetIdx < 0 || targetIdx >= cards.length) {
            const isNext = targetIdx >= cards.length;
            const btnKeyword = isNext ? 'Suivant' : 'Précédent';

            // Recherche du bouton de pagination actif (supporte les variantes d'icônes/flèches)
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetBtn = buttons.find(b => !b.disabled && b.textContent.includes(btnKeyword));

            if (!targetBtn) {
                console.log(`[WM-Nav] 🛑 Fin de la liste, et page ${isNext ? 'suivante' : 'précédente'} indisponible.`);
                window._wmNavigating = false;
                return;
            }

            console.log(`[WM-Nav] 🔄 Changement de page : clic sur bouton "${btnKeyword}"...`);

            // 1) Fermer le modal actuel
            closeCardModal();

            // 2) Mémoriser les titres de la page actuelle pour s'assurer que la nouvelle page a bien chargé
            const oldTitles = new Set(cards.map(c => getCardTitleFromEl(c)).filter(Boolean));
            const oldFirstCard = cards[0];

            // 3) Déclencher le changement de page
            targetBtn.click();

            // 4) Attendre que la requête réseau soit terminée ET que la grille React soit mise à jour
            let pageAttempts = 0;
            const waitForPage = setInterval(() => {
                pageAttempts++;

                // Tant qu'une requête collection est en cours de transfert, on attend impérativement
                if (window.wmCollectionLoading) {
                    if (pageAttempts > 120) {
                        clearInterval(waitForPage);
                        window._wmNavigating = false;
                    }
                    return;
                }

                const freshCards = getCollectionCards();
                if (!freshCards.length) {
                    if (pageAttempts > 120) {
                        clearInterval(waitForPage);
                        window._wmNavigating = false;
                    }
                    return;
                }

                const newFirstTitle = getCardTitleFromEl(freshCards[0]);
                const isDifferentTitle = Boolean(newFirstTitle && !oldTitles.has(newFirstTitle));

                if (pageAttempts % 10 === 0) {
                    console.log(`[WM-Nav] ⏳ En attente nouvelle page (req: ${Boolean(window.wmCollectionLoading)}, titre vu: "${newFirstTitle}")`);
                }

                // Si le titre de la 1ère carte est nouveau OU si l'élément DOM a changé avec un titre valide
                if (isDifferentTitle || pageAttempts > 80) {
                    clearInterval(waitForPage);
                    console.log(`[WM-Nav] 🎯 Page chargée détectée (titre: "${newFirstTitle}")`);

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

                            window.wmCurrentCardIndex = newTargetIdx;
                            window.wmCurrentCardTitle = newTargetTitle;
                            console.log(`[WM-Nav] ✅ Nouvelle page chargée, ouverture de "${newTargetTitle}"`);
                            setTimeout(() => { window._wmNavigating = false; }, 300);
                        }, 200);
                    } else {
                        window._wmNavigating = false;
                    }
                }
            }, 60);

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
                    window.wmCurrentCardIndex = targetIdx;
                    window.wmCurrentCardTitle = targetTitle;
                    console.log(`[WM-Nav] ✅ Clic effectué sur index ${targetIdx}`);
                    setTimeout(() => { window._wmNavigating = false; }, 200);
                }, 150);
            }
        }, 50);
    }


    window.WM_COLLECTION_CACHE_KEY = WM_COLLECTION_CACHE_KEY;
    window.WM_COLLECTION_CACHE_VERSION = WM_COLLECTION_CACHE_VERSION;

    // --- Cross-module exports ---
    window.executeBulkDiscard = WikiM.executeBulkDiscard = executeBulkDiscard;
    window.resolveUserCardId = WikiM.resolveUserCardId = resolveUserCardId;
    window.directDiscardAPI = WikiM.directDiscardAPI = directDiscardAPI;
    window.wmLoadCollectionCache = WikiM.wmLoadCollectionCache = wmLoadCollectionCache;
    window.wmSaveCollectionCache = WikiM.wmSaveCollectionCache = wmSaveCollectionCache;
    window.wmClearCollectionCache = WikiM.wmClearCollectionCache = wmClearCollectionCache;
    window.wmSerializeCard = WikiM.wmSerializeCard = wmSerializeCard;
    window.wmDeserializeCard = WikiM.wmDeserializeCard = wmDeserializeCard;
    window.wmBuildCardIdIndex = WikiM.wmBuildCardIdIndex = wmBuildCardIdIndex;
    window.wmResolveUserCardId = WikiM.wmResolveUserCardId = wmResolveUserCardId;
    window.getCollectionCards = WikiM.getCollectionCards = getCollectionCards;
    window.getVisibleCollectionCards = WikiM.getVisibleCollectionCards = getVisibleCollectionCards;
    window.evaluateRule = WikiM.evaluateRule = evaluateRule;
    window.evaluateAllRules = WikiM.evaluateAllRules = evaluateAllRules;
    window.getCardDataFromReact = WikiM.getCardDataFromReact = getCardDataFromReact;
    window.handleRemoveVisualTag = WikiM.handleRemoveVisualTag = handleRemoveVisualTag;
    window.renderTagsOnAllCards = WikiM.renderTagsOnAllCards = renderTagsOnAllCards;
    window.renderPricesOnAllCards = WikiM.renderPricesOnAllCards = renderPricesOnAllCards;
    window.handleQuickDiscard = WikiM.handleQuickDiscard = handleQuickDiscard;
    window.handleQuickAuction = WikiM.handleQuickAuction = handleQuickAuction;
    window.toggleBulkForCard = WikiM.toggleBulkForCard = toggleBulkForCard;
    window.stopPropagationOnElement = WikiM.stopPropagationOnElement = stopPropagationOnElement;
    window.shouldInjectActionButtons = WikiM.shouldInjectActionButtons = shouldInjectActionButtons;
    window.injectBoosterButtons = WikiM.injectBoosterButtons = injectBoosterButtons;
    window.getCardTitleFromEl = WikiM.getCardTitleFromEl = getCardTitleFromEl;
    window.getOpenCardModal = WikiM.getOpenCardModal = getOpenCardModal;
    window.closeCardModal = WikiM.closeCardModal = closeCardModal;
    window.navigateToCardIndex = WikiM.navigateToCardIndex = navigateToCardIndex;
    window.ensureCollectionMultiSearchToggle = WikiM.ensureCollectionMultiSearchToggle = ensureCollectionMultiSearchToggle;
    window.injectBulkButtonInCollection = WikiM.injectBulkButtonInCollection = injectBulkButtonInCollection;
    window.renderAltBadgesOnAllCards = WikiM.renderAltBadgesOnAllCards = renderAltBadgesOnAllCards;
    window.wmCleanBulkList = WikiM.wmCleanBulkList = wmCleanBulkList;
    window.ingestCollectionData = WikiM.ingestCollectionData = ingestCollectionData;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
