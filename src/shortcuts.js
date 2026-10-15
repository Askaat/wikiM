// ============================================================
// WikiM - Module: Keyboard Shortcuts
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // RACCOURCIS CLAVIER
    // ============================================================
    // ---- Gestion globale du clavier (Collection + Pulls + Bulk) ----
    document.addEventListener('keydown', (e) => {
        // On ignore si l'utilisateur tape dans une barre de recherche
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // ==========================================
        // 0. TOUCHE ÉCHAP (Fermer modal de carte)
        // ==========================================
        if (e.key === 'Escape') {
            const modal = typeof window.getOpenCardModal === 'function' ? window.getOpenCardModal() : null;
            if (modal) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.closeCardModal === 'function') {
                    window.closeCardModal();
                }
                return;
            }
        }

        /**
         * Attend que le bouton bulk soit présent et actif sur une carte avec polling (jusqu'à 1.5s max)
         */
        function clickBulkWithRetry(getCardFn, onDone) {
            let attempts = 0;
            const maxAttempts = 30; // 30 * 50ms = 1500ms
            const interval = setInterval(() => {
                attempts++;
                const card = getCardFn();
                if (card) {
                    let bulkBtn = card.querySelector('.wm-btn-bulk');
                    // Si le bouton n'a pas encore été injecté, tenter d'injecter immédiatement
                    if (!bulkBtn && typeof window.injectBoosterButtons === 'function') {
                        window.injectBoosterButtons();
                        bulkBtn = card.querySelector('.wm-btn-bulk');
                    }
                    if (bulkBtn && !bulkBtn.disabled) {
                        clearInterval(interval);
                        console.log(`[WM-Debug] 🟢 Clic sur Bulk effectué après ${attempts * 50}ms.`);
                        bulkBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                        if (typeof onDone === 'function') onDone(true);
                        return;
                    }
                }
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.warn("[WM-Debug] ⚠️ Timeout : Bouton Bulk non trouvé ou désactivé sur la carte.");
                    if (typeof onDone === 'function') onDone(false);
                }
            }, 50);
        }

        // ==========================================
        // 1. RACCOURCI "I" (Bulk Delete & Auto-Next)
        // ==========================================
        if (e.key.toLowerCase() === 'i') {
            e.preventDefault();

            clickBulkWithRetry(
                () => document.querySelector('.w-72:hover') || document.querySelector('.swiper-slide-active .w-72') || document.querySelector('.w-72'),
                () => {
                    // Une fois le clic effectué (ou timeout), on avance à la carte suivante
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
                }
            );
            return;
        }

        // ==========================================
        // 1.2 RACCOURCI "U" (Tag "Tri" / "Trier" & Auto-Next)
        // ==========================================
        if (e.key.toLowerCase() === 'u') {
            e.preventDefault();

            // 1. Résolution de l'étiquette de tri (Gist mapping ou nom de tag)
            let triTag = null;
            const groups = typeof window.getTagGroups === 'function' ? window.getTagGroups() : [];
            for (const g of groups) {
                if (g.tagMapping) {
                    for (const [slotId, tagId] of Object.entries(g.tagMapping)) {
                        if (/tri/i.test(slotId) && tagId) {
                            triTag = (window.wmTagsCache || []).find(t => t.id === tagId);
                            if (triTag) break;
                        }
                    }
                }
                if (triTag) break;
            }

            if (!triTag) {
                // Recherche directe dans le cache des étiquettes par nom
                triTag = (window.wmTagsCache || []).find(t => /^(tri|trier)$/i.test(t.name.trim()));
            }

            if (!triTag) {
                // Recherche plus souple contenant "tri"
                triTag = (window.wmTagsCache || []).find(t => /tri/i.test(t.name));
            }

            if (!triTag) {
                const msg = '⚠️ Étiquette "Tri" ou "Trier" introuvable. Créez-la ou associez-la dans votre Gist.';
                if (typeof window.showWMToast === 'function') window.showWMToast(msg, false);
                console.warn('[WM-Shortcuts]', msg);
                return;
            }

            // 2. Détection de la carte active
            const cardEl = document.querySelector('.w-72:hover') ||
                           document.querySelector('.swiper-slide-active .w-72') ||
                           document.querySelector('.w-72');

            if (!cardEl) return;

            const titleEl = cardEl.querySelector('h3') || cardEl.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            const cardTitle = titleEl ? titleEl.textContent.trim() : '';

            // 3. Résolution de l'identifiant physique user_card_id
            let userCardId = null;
            if (typeof window.getCardDataFromReact === 'function') {
                const cardData = window.getCardDataFromReact(cardEl);
                if (cardData) {
                    if (cardData.card_id && window.wmCardIdToUserCardId?.has(cardData.card_id)) {
                        userCardId = window.wmCardIdToUserCardId.get(cardData.card_id);
                    } else if (window.wmCardIdToUserCardId?.has(cardData.id)) {
                        userCardId = window.wmCardIdToUserCardId.get(cardData.id);
                    } else {
                        userCardId = cardData.userCardId || cardData.id;
                    }
                }
            }

            if (!userCardId) {
                userCardId = cardEl.dataset.wmUuid || null;
            }

            // 4. Application du tag
            if (userCardId && typeof window.wmApplyTag === 'function') {
                window.wmApplyTag(userCardId, triTag.id).then(res => {
                    if (res && res.ok) {
                        console.log(`[WM-Shortcuts] 🏷️ Tag "${triTag.name}" posé sur "${cardTitle}"`);
                    }
                }).catch(err => {
                    console.error('[WM-Shortcuts] ❌ Échec pose tag Tri:', err);
                });
            }

            // Mise à jour visuelle immédiate du badge sur la carte
            if (cardTitle) {
                if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                if (!window.wmVisualTagsCache[cardTitle]) window.wmVisualTagsCache[cardTitle] = [];
                if (!window.wmVisualTagsCache[cardTitle].some(t => t.id === triTag.id)) {
                    window.wmVisualTagsCache[cardTitle].push({
                        id: triTag.id,
                        name: triTag.name,
                        color: triTag.color || '#6366f1'
                    });
                }
                if (typeof window.renderTagsOnAllCards === 'function') {
                    window.renderTagsOnAllCards();
                }
            }

            if (typeof window.showWMToast === 'function') {
                window.showWMToast(`🏷️ ${triTag.name} : ${cardTitle.slice(0, 20)}`, true);
            }

            // 5. Avancement automatique vers la carte suivante
            setTimeout(() => {
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
            }, 180);

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

                // 2. Attendre que la carte précédente soit active et que son bouton bulk soit prêt
                clickBulkWithRetry(
                    () => document.querySelector('.swiper-slide-active .w-72') || document.querySelector('.w-72'),
                    () => {
                        console.log("[WM-Debug] 🟢 Carte précédente traitée avec succès.");
                    }
                );
            }
            return;
        }

        // ==========================================
        // 2. NAVIGATION DANS LA COLLECTION (Modal)
        // ==========================================
        const modal = typeof window.getOpenCardModal === 'function' ? window.getOpenCardModal() : null;

        if (modal) {
            // Si le modal est ouvert, on gère UNIQUEMENT la navigation inter-cartes
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

            e.preventDefault();
            e.stopPropagation();

            if (window._wmNavigating) return;

            const cards = typeof window.getCollectionCards === 'function' ? window.getCollectionCards() : [];
            if (!cards.length) return;

            // 1. Si l'index mémorisé correspond déjà exactement à la carte ouverte, on le conserve
            let currentIdx = -1;
            if (typeof window.wmCurrentCardIndex === 'number' && window.wmCurrentCardIndex >= 0 && window.wmCurrentCardIndex < cards.length) {
                const knownTitle = window.getCardTitleFromEl(cards[window.wmCurrentCardIndex]);
                if (knownTitle && knownTitle === modal.title) {
                    currentIdx = window.wmCurrentCardIndex;
                }
            }

            // 2. Sinon (ex: clic souris sur une autre carte), recherche par égalité STRICTE
            if (currentIdx === -1 && modal.title) {
                currentIdx = cards.findIndex(c => window.getCardTitleFromEl(c) === modal.title);
            }

            // 3. Fallbacks de sécurité
            if (currentIdx === -1 && typeof window.wmCurrentCardIndex === 'number' && window.wmCurrentCardIndex >= 0) {
                currentIdx = window.wmCurrentCardIndex;
            }
            if (currentIdx === -1) {
                currentIdx = 0;
            }

            window.wmCurrentCardIndex = currentIdx;
            window.wmCurrentCardTitle = modal.title;

            const delta = e.key === 'ArrowRight' ? 1 : -1;
            const targetIdx = currentIdx + delta;
            console.log(`[WM-Nav] ⌨️ Touche ${e.key} | Carte: "${modal.title}" (index ${currentIdx}/${cards.length - 1}) -> Vers index: ${targetIdx}`);

            if (typeof window.navigateToCardIndex === 'function') {
                window.navigateToCardIndex(targetIdx);
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

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
