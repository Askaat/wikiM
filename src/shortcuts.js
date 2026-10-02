// ============================================================
// WikiM - Module: Keyboard Shortcuts
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

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

})();
