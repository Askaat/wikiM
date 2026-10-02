// ============================================================
// WikiM - Module: Collection, Quick Actions & Bulk Discard
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

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


    window.WM_COLLECTION_CACHE_KEY = WM_COLLECTION_CACHE_KEY;
    window.WM_COLLECTION_CACHE_VERSION = WM_COLLECTION_CACHE_VERSION;

    // --- Cross-module exports ---
    if (typeof executeBulkDiscard !== 'undefined') { window.executeBulkDiscard = executeBulkDiscard; window.WikiM.executeBulkDiscard = executeBulkDiscard; }
    if (typeof resolveUserCardId !== 'undefined') { window.resolveUserCardId = resolveUserCardId; window.WikiM.resolveUserCardId = resolveUserCardId; }
    if (typeof directDiscardAPI !== 'undefined') { window.directDiscardAPI = directDiscardAPI; window.WikiM.directDiscardAPI = directDiscardAPI; }
    if (typeof wmLoadCollectionCache !== 'undefined') { window.wmLoadCollectionCache = wmLoadCollectionCache; window.WikiM.wmLoadCollectionCache = wmLoadCollectionCache; }
    if (typeof wmSaveCollectionCache !== 'undefined') { window.wmSaveCollectionCache = wmSaveCollectionCache; window.WikiM.wmSaveCollectionCache = wmSaveCollectionCache; }
    if (typeof wmClearCollectionCache !== 'undefined') { window.wmClearCollectionCache = wmClearCollectionCache; window.WikiM.wmClearCollectionCache = wmClearCollectionCache; }
    if (typeof wmSerializeCard !== 'undefined') { window.wmSerializeCard = wmSerializeCard; window.WikiM.wmSerializeCard = wmSerializeCard; }
    if (typeof wmDeserializeCard !== 'undefined') { window.wmDeserializeCard = wmDeserializeCard; window.WikiM.wmDeserializeCard = wmDeserializeCard; }
    if (typeof wmBuildCardIdIndex !== 'undefined') { window.wmBuildCardIdIndex = wmBuildCardIdIndex; window.WikiM.wmBuildCardIdIndex = wmBuildCardIdIndex; }
    if (typeof wmResolveUserCardId !== 'undefined') { window.wmResolveUserCardId = wmResolveUserCardId; window.WikiM.wmResolveUserCardId = wmResolveUserCardId; }
    if (typeof getCollectionCards !== 'undefined') { window.getCollectionCards = getCollectionCards; window.WikiM.getCollectionCards = getCollectionCards; }
    if (typeof getVisibleCollectionCards !== 'undefined') { window.getVisibleCollectionCards = getVisibleCollectionCards; window.WikiM.getVisibleCollectionCards = getVisibleCollectionCards; }
    if (typeof evaluateRule !== 'undefined') { window.evaluateRule = evaluateRule; window.WikiM.evaluateRule = evaluateRule; }
    if (typeof evaluateAllRules !== 'undefined') { window.evaluateAllRules = evaluateAllRules; window.WikiM.evaluateAllRules = evaluateAllRules; }
    if (typeof getCardDataFromReact !== 'undefined') { window.getCardDataFromReact = getCardDataFromReact; window.WikiM.getCardDataFromReact = getCardDataFromReact; }
    if (typeof renderTagsOnAllCards !== 'undefined') { window.renderTagsOnAllCards = renderTagsOnAllCards; window.WikiM.renderTagsOnAllCards = renderTagsOnAllCards; }
    if (typeof renderPricesOnAllCards !== 'undefined') { window.renderPricesOnAllCards = renderPricesOnAllCards; window.WikiM.renderPricesOnAllCards = renderPricesOnAllCards; }
    if (typeof handleQuickDiscard !== 'undefined') { window.handleQuickDiscard = handleQuickDiscard; window.WikiM.handleQuickDiscard = handleQuickDiscard; }
    if (typeof handleQuickAuction !== 'undefined') { window.handleQuickAuction = handleQuickAuction; window.WikiM.handleQuickAuction = handleQuickAuction; }
    if (typeof toggleBulkForCard !== 'undefined') { window.toggleBulkForCard = toggleBulkForCard; window.WikiM.toggleBulkForCard = toggleBulkForCard; }
    if (typeof stopPropagationOnElement !== 'undefined') { window.stopPropagationOnElement = stopPropagationOnElement; window.WikiM.stopPropagationOnElement = stopPropagationOnElement; }
    if (typeof shouldInjectActionButtons !== 'undefined') { window.shouldInjectActionButtons = shouldInjectActionButtons; window.WikiM.shouldInjectActionButtons = shouldInjectActionButtons; }
    if (typeof injectBoosterButtons !== 'undefined') { window.injectBoosterButtons = injectBoosterButtons; window.WikiM.injectBoosterButtons = injectBoosterButtons; }
    if (typeof getCardTitleFromEl !== 'undefined') { window.getCardTitleFromEl = getCardTitleFromEl; window.WikiM.getCardTitleFromEl = getCardTitleFromEl; }
    if (typeof getOpenCardModal !== 'undefined') { window.getOpenCardModal = getOpenCardModal; window.WikiM.getOpenCardModal = getOpenCardModal; }
    if (typeof closeCardModal !== 'undefined') { window.closeCardModal = closeCardModal; window.WikiM.closeCardModal = closeCardModal; }
    if (typeof navigateToCardIndex !== 'undefined') { window.navigateToCardIndex = navigateToCardIndex; window.WikiM.navigateToCardIndex = navigateToCardIndex; }
})();
