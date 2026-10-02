// ============================================================
// WikiM - Module: App Entrypoint, Observer & Lifecycle
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

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
                    if (cardData && cardData.id) {
                        card.dataset.wmUuid = cardData.id;

                        // ---> BADGE MULTI-COMPTES <---
                        if (window.wmAltCardOwners && window.wmAltCardOwners[cardData.id]) {
                            const altName = window.wmAltCardOwners[cardData.id];
                            let altBadge = card.querySelector('.wm-alt-badge');
                            if (!altBadge) {
                                altBadge = document.createElement('div');
                                altBadge.className = 'wm-alt-badge';
                                // Positionné en bas à droite
                                altBadge.style.cssText = 'position:absolute; bottom:10px; right:10px; z-index:40; background:#fbbf24; color:#000; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.5); pointer-events:none;';
                                altBadge.textContent = `👤 ${altName}`;
                                card.appendChild(altBadge);

                                // On grise légèrement la carte et on désactive tes boutons d'action locaux
                                card.style.border = "2px solid #fbbf24";
                                card.querySelectorAll('.wm-action-btn').forEach(b => b.style.display = 'none');
                            }
                        } else {
                            // Si c'est notre carte, on fetch son prix
                            fetchPricesBackground(cardData.id, cardData.title);
                        }
                    }
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
