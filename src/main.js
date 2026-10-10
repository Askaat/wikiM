// ============================================================
// WikiM - Module: App Entrypoint, Observer & Lifecycle
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // OBSERVER DOM
    // ============================================================
    const observer = new MutationObserver((mutations) => {
        if (window._wmMutating) return;

        window.renderPricesOnAllCards();
        if (typeof window.renderTagsOnAllCards === 'function') window.renderTagsOnAllCards();
        window.applyPersistentFilters();

        const hasNewNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (!hasNewNodes) return;

        window._wmMutating = true;
        try {
            document.querySelectorAll('.w-72.rounded-2xl:not(.wm-uuid-processed)').forEach(card => {
                card.classList.add('wm-uuid-processed');
                const cardData = window.getCardDataFromReact(card);
                if (cardData && cardData.id) {
                    card.dataset.wmUuid = cardData.id;

                    // ---> BADGE MULTI-COMPTES <---
                    const altName = window.wmAltCardOwners && (window.wmAltCardOwners[cardData.id] || (cardData.title && window.wmAltCardOwners[`title:${cardData.title}`]));
                    if (altName) {
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
                        window.fetchPricesBackground(cardData.id, cardData.title);
                    }
                } else {
                    setTimeout(() => {
                        const retryData = window.getCardDataFromReact(card);
                        if (retryData && retryData.id) {
                            card.dataset.wmUuid = retryData.id;
                            const retryAltName = window.wmAltCardOwners && (window.wmAltCardOwners[retryData.id] || (retryData.title && window.wmAltCardOwners[`title:${retryData.title}`]));
                            if (retryAltName) {
                                let altBadge = card.querySelector('.wm-alt-badge');
                                if (!altBadge) {
                                    altBadge = document.createElement('div');
                                    altBadge.className = 'wm-alt-badge';
                                    altBadge.style.cssText = 'position:absolute; bottom:10px; right:10px; z-index:40; background:#fbbf24; color:#000; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.5); pointer-events:none;';
                                    altBadge.textContent = `👤 ${retryAltName}`;
                                    card.appendChild(altBadge);
                                    card.style.border = "2px solid #fbbf24";
                                    card.querySelectorAll('.wm-action-btn').forEach(b => b.style.display = 'none');
                                }
                            } else {
                                window.fetchPricesBackground(retryData.id, retryData.title);
                            }
                            window.applyPersistentFilters();
                        }
                    }, 300);
                }
            });

            window.injectBoosterButtons();

            // NOUVELLE VÉRIFICATION : centralisée et compatible avec les UUIDs
            if (typeof window.updateAllBulkButtonsUI === 'function') {
                window.updateAllBulkButtonsUI();
            }

        } finally {
            setTimeout(() => { window._wmMutating = false; }, 80);
        }
    });

    function startObserver() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body) {
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            });
        }
    }
    startObserver();

    // ============================================================
    // DÉTECTION SPA + BOUTON SUIVRE + PANEL SNIPER
    // ============================================================
    let lastPath = window.location.pathname;
    setInterval(() => {
        if (window.location.pathname !== lastPath) {
            lastPath = window.location.pathname;
            document.querySelectorAll('.wm-btns-injected').forEach(el => el.classList.remove('wm-btns-injected'));
            document.querySelectorAll('.wm-uuid-processed').forEach(el => el.classList.remove('wm-uuid-processed'));
            window.lastTrackBtnAuctionId = null;
            // Retire le panneau sniper (sera réinjecté avec la config de la nouvelle enchère)
            const oldSniper = document.getElementById('wm-sniper-panel');
            if (oldSniper) oldSniper.remove();
        }
        window.ensureTrackButton();
        if (typeof window.ensureCollectionMultiSearchToggle === 'function') window.ensureCollectionMultiSearchToggle();

        // Sur une page d'enchère : s'assurer que le panneau est là et à jour
        const auctionId = window.getAuctionIdFromUrl();
        if (auctionId) {
            const panel = document.getElementById('wm-sniper-panel');
            if (!panel || panel.dataset.auctionId !== auctionId) {
                setTimeout(window.injectSniperPanel, 600);
            } else {
                window.syncSniperPanelFromConfig();
            }
        }
    }, 500);


    window.wmLoadPriceCache();
    window.wmLoadCollectionCache();

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.createControlPanel();
            window.ensureTrackButton();
        });
    } else {
        window.createControlPanel();
        window.ensureTrackButton();
    }

    // ============================================================
    // DEBUG : exposer les fonctions/variables clés sur window
    // ============================================================
    /**
     * API publique d'inspection et de débogage exposée sur window.wmDebug.
     * Permet d'interagir directement avec l'état et les services depuis la console du navigateur.
     * @namespace window.wmDebug
     */
    W.wmDebug = Object.assign(W.wmDebug || {}, {
        // --- Accès direct à l'état global ---
        /** @type {Record<string, any>} Cache mémoire des prix par titre de carte */
        get prices() { return window.wmPrices; },
        /** @type {Record<string, number>} Horodatages de mise en cache des prix */
        get priceTs() { return window.wmPriceTimestamps; },
        /** @type {object} Cache mémoire de la collection utilisateur */
        get collectionCache() { return window.wmCollectionCache; },
        /** @type {Map<string, string>} Index cardId -> userCardId */
        get cardIdIndex() { return window.wmCardIdToUserCardId; },
        /** @type {Array<object>} Cache mémoire des étiquettes (tags) */
        get tagsCache() { return window.wmTagsCache; },
        /** @type {object} État du scan automatique de tags en cours */
        get scanState() { return window.wmTagScanState; },

        // --- Fonctions Prix ---
        /**
         * Récupère le prix en cache d'une carte selon sa rareté.
         * @param {string} title Titre exact de la carte
         * @param {string} rarity Rareté (ex: 'UR', 'SR', 'R')
         * @returns {number|null} Prix ou null si absent
         */
        getPriceFor: (title, rarity) => window.wmGetPriceFor(title, rarity),
        /** Charge le cache des prix depuis le localStorage */
        loadPriceCache: () => window.wmLoadPriceCache(),
        /**
         * Enregistre un prix dans le cache et le localStorage.
         * @param {string} t Titre de la carte
         * @param {any} d Données de prix
         */
        savePriceToCache: (t, d) => window.wmSavePriceToCache(t, d),

        // --- Fonctions Collection ---
        /** Charge la collection en cache depuis le localStorage */
        loadCollectionCache: () => window.wmLoadCollectionCache(),
        /** Sauvegarde le cache de collection dans le localStorage */
        saveCollectionCache: () => window.wmSaveCollectionCache(),
        /** Réinitialise le cache de collection */
        clearCollectionCache: () => window.wmClearCollectionCache(),
        /**
         * Récupère les cartes actuellement visibles sur la page collection.
         * @param {function(string): void} [onProgress] Callback de progression
         * @returns {Promise<Array>} Cartes extraites du DOM
         */
        getVisibleCollectionCards: (onProgress) => window.getVisibleCollectionCards(onProgress),
        /**
         * Parcourt et récupère toutes les pages de la collection via l'API.
         * @param {function(string): void} [onProgress] Callback de progression
         * @returns {Promise<Array>} Liste complète des cartes
         */
        fetchAllCollectionCards: (onProgress) => window.fetchAllCollectionCards(onProgress),
        /**
         * Récupère les cartes de collection selon les options passées.
         * @param {object} [opts] Options de filtrage
         * @returns {Array|Promise<Array>}
         */
        getCollectionCards: (opts) => window.getCollectionCards(opts),
        /**
         * Résout le user_card_id pour une carte donnée.
         * @param {string} cardId UUID de la carte
         * @param {string} title Titre de la carte
         * @returns {Promise<string|null>}
         */
        resolveUserCardId: (cardId, title) => window.wmResolveUserCardId(cardId, title),

        // --- Fonctions Tags (Supabase) ---
        /** Récupère la liste des tags de l'utilisateur depuis Supabase */
        fetchTags: () => window.wmFetchTags(),
        /**
         * Crée un nouveau tag dans Supabase.
         * @param {string} name Nom du tag
         * @param {string} color Code couleur hexadécimal
         */
        createTag: (name, color) => window.wmCreateTag(name, color),
        /**
         * Supprime un tag par son ID.
         * @param {string} id UUID du tag
         */
        deleteTag: (id) => window.wmDeleteTag(id),
        /**
         * Récupère les tags appliqués à une carte utilisateur.
         * @param {string} ucId user_card_id
         */
        fetchUserCardTags: (ucId) => window.wmFetchUserCardTags(ucId),
        /**
         * Associe un tag à une carte utilisateur.
         * @param {string} ucId user_card_id
         * @param {string} tagId UUID du tag
         */
        applyTag: (ucId, tagId) => window.wmApplyTag(ucId, tagId),
        /**
         * Retire un tag d'une carte utilisateur.
         * @param {string} ucId user_card_id
         * @param {string} tagId UUID du tag
         */
        removeTag: (ucId, tagId) => window.wmRemoveTag(ucId, tagId),

        // --- Moteur de Règles ---
        /** Retourne la liste à plat de toutes les règles actives */
        getRules: () => window.getFlatRules(),
        /** Sauvegarde l'arborescence des groupes de tags */
        saveTagGroups: (r) => window.saveTagGroups(r),
        /**
         * Évalue une règle unique contre une carte.
         * @param {object} card Données de la carte
         * @param {object} rule Règle à tester
         * @returns {boolean}
         */
        evaluateRule: (card, rule) => window.evaluateRule(card, rule, window.wmPrices),
        /**
         * Évalue l'ensemble des règles contre une carte.
         * @param {object} card Données de la carte
         * @param {Array<object>} rules Liste des règles
         * @returns {Array<string>} IDs des tags correspondants
         */
        evaluateAllRules: (card, rules) => window.evaluateAllRules(card, rules, window.wmPrices),
        /** Liste des champs exploitables dans les règles */
        ruleFields: () => window.WM_RULE_FIELDS,
        /** Liste des opérateurs disponibles */
        ruleOperators: () => window.WM_RULE_OPERATORS,

        // --- Réseau & Utilitaires ---
        /** Exécute une requête directe vers Supabase via GM_xmlhttpRequest */
        supabaseRequest: (m, p, b) => window.supabaseRequest(m, p, b),
        /** Écrit un message dans la console de log du panneau WikiM */
        log: (msg) => window.logToPanel(msg),
        /** Affiche une notification toast temporaire */
        toast: (msg) => window.showWMToast(msg)
    });

    console.log('[WM-Debug] window.wmDebug disponible pour tests');

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
