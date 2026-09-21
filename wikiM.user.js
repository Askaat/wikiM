// ==UserScript==
// @name         Wiki-Masters - Améliorations de l'interface V16
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Menu déroulant d'étiquettes personnalisé directement sur la carte.
// @author       Ton Développeur
// @match        https://www.wiki-masters.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- STOCKAGE GLOBAL ---
    window.wmPrices = {};
    window.wmAuth = { apikey: "", token: "" };
    window.wmTags = {}; // Ex: { "A vendre": { id: "...", color: "rgb(167, 139, 250)" } }

    GM_addStyle(`
        /* Panneau de droite */
        .wm-actions-wrapper {
            position: absolute; top: 10px; right: 10px; z-index: 40;
            display: flex; flex-direction: column; gap: 8px;
        }

        /* Conteneur d'étiquette à gauche */
        .wm-tag-wrapper {
            position: absolute; top: 38px; left: 8px; z-index: 50;
            display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
        }

        .wm-action-btn {
            color: white; border: none; border-radius: 8px; padding: 8px;
            cursor: pointer; transition: all 0.2s; display: flex;
            align-items: center; justify-content: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3); user-select: none;
        }
        .wm-action-btn svg { width: 18px; height: 18px; }
        
        .wm-btn-discard { background-color: rgba(220, 38, 38, 0.9); }
        .wm-btn-discard:hover { background-color: rgba(239, 68, 68, 1); transform: scale(1.1); }
        .wm-btn-auction { background-color: rgba(16, 185, 129, 0.9); }
        .wm-btn-auction:hover { background-color: rgba(5, 150, 105, 1); transform: scale(1.1); }
        
        .wm-btn-tag { background-color: rgba(99, 102, 241, 0.9); padding: 6px; }
        .wm-btn-tag:hover { background-color: rgba(79, 70, 229, 1); transform: scale(1.1); }
        .wm-btn-tag svg { width: 16px; height: 16px; }

        /* Le nouveau menu déroulant personnalisé */
        .wm-tag-dropdown {
            width: 160px; max-height: 180px; overflow-y: auto;
            background-color: var(--color-background, rgb(13, 17, 23));
            border: 1px solid var(--color-border, rgba(255,255,255,0.2));
            border-radius: 8px; padding: 4px; z-index: 60;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
            display: none; flex-direction: column; gap: 2px;
        }
        .wm-tag-dropdown.show { display: flex; animation: fadeIn 0.15s ease-out; }
        
        .wm-tag-item {
            text-align: left; padding: 6px 8px; font-size: 12px;
            color: var(--color-foreground, #e5e7eb); background: transparent; border: none;
            border-radius: 4px; cursor: pointer; display: flex;
            align-items: center; gap: 8px; width: 100%; transition: background-color 0.15s;
        }
        .wm-tag-item:hover { background-color: var(--color-surface-light, rgba(255,255,255,0.1)); }
        
        .wm-tag-color {
            width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
            border: 1px solid rgba(255,255,255,0.3);
        }

        .wm-price-panel {
            position: absolute; bottom: 12px; left: 12px; z-index: 40;
            background-color: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px;
            padding: 6px 10px; font-size: 12px; font-family: monospace;
            box-shadow: 0 4px 6px rgba(0,0,0,0.5);
            display: flex; flex-direction: column; gap: 4px; pointer-events: none;
            animation: fadeIn 0.3s ease-in-out; min-width: 80px;
        }
        .wm-price-row {
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;
        }
        .wm-price-row:last-child { border-bottom: none; padding-bottom: 0; }
        .wm-rarity-label { font-weight: bold; }
        .wm-val { color: var(--color-accent, #fbbf24); font-weight: bold; }

        .wm-r-L { color: #ef4444; } .wm-r-UR { color: #f97316; } .wm-r-SR { color: #a855f7; }
        .wm-r-R { color: #3b82f6; } .wm-r-PC { color: #10b981; } .wm-r-C { color: #9ca3af; }
        .wm-empty-sales { color: #9ca3af; font-size: 10px; justify-content: center; font-style: italic; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    `);

    // --- FERMETURE DU MENU AU CLIC EXTERNE ---
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.wm-tag-wrapper')) {
            document.querySelectorAll('.wm-tag-dropdown.show').forEach(d => d.classList.remove('show'));
        }
    });

    // --- INTERCEPTION API ---
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const options = args[1] || {};

        if (options.headers) {
            const headers = new Headers(options.headers);
            if (headers.has('apikey')) window.wmAuth.apikey = headers.get('apikey');
            if (headers.has('authorization')) window.wmAuth.token = headers.get('authorization');
        }

        const response = await originalFetch.apply(this, args);

        try {
            if (url && url.includes('sales?scope=summary')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.wikipedia_title) {
                        window.wmPrices[data.wikipedia_title] = data.summary || {};
                        renderPricesOnAllCards();
                    }
                }).catch(() => {});
            }
            
            // On intercepte et stocke la liste complète de tes étiquettes
            if (url && url.includes('/rest/v1/tags?select=')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (Array.isArray(data)) {
                        data.forEach(tag => {
                            // On essaie de sauvegarder la couleur si l'API la fournit, sinon violet par défaut
                            window.wmTags[tag.name] = { 
                                id: tag.id, 
                                color: tag.color || '#a78bfa' 
                            };
                        });
                    }
                }).catch(() => {});
            }
        } catch (e) {}

        return response;
    };

    // --- REQUÊTE FANTÔME D'ÉTIQUETAGE ---
    window.assignTagToCard = async function(cardUuid, tagName) {
        if (!window.wmAuth.apikey || !window.wmAuth.token) return false;
        const tagData = window.wmTags[tagName];
        if (!tagData || !tagData.id) return false;

        try {
            const res = await fetch("https://cyrxjeppjqsxxjayfrur.supabase.co/rest/v1/user_card_tags", {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "apikey": window.wmAuth.apikey,
                    "authorization": window.wmAuth.token,
                    "content-type": "application/json",
                    "prefer": "return=minimal"
                },
                body: JSON.stringify({ user_card_id: cardUuid, tag_id: tagData.id })
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    };

    function findCardIdInReact(el) {
        const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (!reactKey) return null;
        let fiber = el[reactKey];
        let attempts = 0;
        while (fiber && attempts < 15) {
            const props = fiber.memoizedProps;
            if (props) {
                if (props.card && props.card.id) return props.card.id;
                if (props.data && props.data.id) return props.data.id;
                if (props.item && props.item.id) return props.item.id;
                if (typeof props.id === 'string' && props.id.length > 30) return props.id; 
            }
            fiber = fiber.return;
            attempts++;
        }
        return null;
    }

    async function fetchPricesBackground(uuid) {
        try {
            const response = await fetch(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                "credentials": "include",
                "method": "GET",
                "mode": "cors",
                "headers": { "Accept": "application/json" }
            });
            const data = await response.json();
            if (data && data.wikipedia_title) {
                window.wmPrices[data.wikipedia_title] = data.summary || {};
                renderPricesOnAllCards();
            }
        } catch (e) {}
    }

    function renderPricesOnAllCards() {
        const cards = document.querySelectorAll('.w-72.rounded-2xl');
        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (!titleEl) return;
            const title = titleEl.textContent.trim();

            if (window.wmPrices[title] && !card.querySelector('.wm-price-panel')) {
                const summaryData = window.wmPrices[title];
                let rowsHtml = '';
                let hasPrices = false;
                const rarityOrder = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
                rarityOrder.forEach(r => {
                    if (summaryData[r] && summaryData[r].average !== undefined) {
                        rowsHtml += `<div class="wm-price-row"><span class="wm-rarity-label wm-r-${r}">${r}</span><span class="wm-val">${summaryData[r].average}</span></div>`;
                        hasPrices = true;
                    }
                });
                if (!hasPrices) rowsHtml = `<div class="wm-price-row wm-empty-sales">Aucune vente</div>`;
                const panel = document.createElement('div');
                panel.className = 'wm-price-panel';
                panel.innerHTML = rowsHtml;
                card.appendChild(panel);
            }
        });
    }

    function processAllCardsForPrices() {
        const cards = document.querySelectorAll('.w-72.rounded-2xl:not(.wm-price-processed)');
        cards.forEach(card => {
            card.classList.add('wm-price-processed');
            const uuid = findCardIdInReact(card);
            if (uuid) fetchPricesBackground(uuid);
        });
    }

    function handleQuickDiscard(event) {
        event.stopPropagation();
        event.preventDefault();
        
        const myBtn = event.currentTarget;
        if (myBtn.dataset.locked === "true") return;
        myBtn.dataset.locked = "true";
        setTimeout(() => { myBtn.dataset.locked = "false"; }, 2000);

        const isShift = event.shiftKey;
        const cardContainer = event.target.closest('.w-72');
        if (!cardContainer) return;
        
        cardContainer.click();
        let attempts = 0;
        const checkModal = setInterval(() => {
            attempts++;
            const buttons = Array.from(document.querySelectorAll('button'));
            const initialDiscardBtn = buttons.find(b => b.textContent.includes('Défausser') && !b.className.includes('bg-red-500'));
            
            if (initialDiscardBtn && !initialDiscardBtn.disabled) {
                clearInterval(checkModal);
                initialDiscardBtn.click();
                
                if (isShift) {
                    let confirmAttempts = 0;
                    const checkConfirm = setInterval(() => {
                        confirmAttempts++;
                        const confirmBtn = document.querySelector('button.bg-red-500');
                        if (confirmBtn && !confirmBtn.disabled) {
                            clearInterval(checkConfirm);
                            confirmBtn.click();
                        } else if (confirmAttempts > 100) {
                            clearInterval(checkConfirm);
                        }
                    }, 100);
                }
            } else if (attempts > 100) {
                clearInterval(checkModal);
            }
        }, 100);
    }

    function handleQuickAuction(event) {
        event.stopPropagation();
        event.preventDefault();
        const cardContainer = event.target.closest('.w-72');
        if (!cardContainer) return;
        
        cardContainer.click(); 
        let attempts = 0;
        const checkModal = setInterval(() => {
            attempts++;
            const buttons = Array.from(document.querySelectorAll('button'));
            const realAuctionBtn = buttons.find(b => b.textContent.includes('Mettre aux enchères'));
            if (realAuctionBtn && !realAuctionBtn.disabled) {
                clearInterval(checkModal);
                realAuctionBtn.click();
            } else if (attempts > 60) {
                clearInterval(checkModal);
            }
        }, 50);
    }

    function injectBoosterButtons() {
        const boosterCards = document.querySelectorAll('.animate-card-flip .w-72:not(.wm-booster-processed), .animate-card-flip-back .w-72:not(.wm-booster-processed)');
        
        boosterCards.forEach(card => {
            card.classList.add('wm-booster-processed');
            
            // --- DROITE : Défausse & Enchères ---
            const actionWrapper = document.createElement('div');
            actionWrapper.className = 'wm-actions-wrapper';

            const discardBtn = document.createElement('button');
            discardBtn.className = 'wm-action-btn wm-btn-discard';
            discardBtn.title = "Défausser (Maj+Clic pour valider auto)";
            discardBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>`;
            discardBtn.addEventListener('click', handleQuickDiscard);
            actionWrapper.appendChild(discardBtn);

            const auctionBtn = document.createElement('button');
            auctionBtn.className = 'wm-action-btn wm-btn-auction';
            auctionBtn.title = "Mettre aux enchères";
            auctionBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3l8.384-8.381"></path><path d="m16 16 6-6"></path><path d="m21.5 10.5-8-8"></path><path d="m8 8 6-6"></path><path d="m8.5 7.5 8 8"></path></svg>`;
            auctionBtn.addEventListener('click', handleQuickAuction);
            actionWrapper.appendChild(auctionBtn);

            card.appendChild(actionWrapper);

            // --- GAUCHE : Étiquettes (Menu Personnalisé) ---
            const tagWrapper = document.createElement('div');
            tagWrapper.className = 'wm-tag-wrapper';
            
            const tagBtn = document.createElement('button');
            tagBtn.className = 'wm-action-btn wm-btn-tag';
            tagBtn.title = "Ajouter une étiquette";
            tagBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>`;
            
            const tagDropdown = document.createElement('div');
            tagDropdown.className = 'wm-tag-dropdown';

            tagBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Fermer les autres menus ouverts
                document.querySelectorAll('.wm-tag-dropdown.show').forEach(d => {
                    if (d !== tagDropdown) d.classList.remove('show');
                });
                
                tagDropdown.classList.toggle('show');
                
                if (tagDropdown.classList.contains('show')) {
                    tagDropdown.innerHTML = ''; // Nettoyer
                    const tagNames = Object.keys(window.wmTags);
                    
                    if (tagNames.length === 0) {
                        tagDropdown.innerHTML = '<div style="padding:6px;font-size:11px;color:#9ca3af;text-align:center;">Ouvrez votre collection 1 fois pour charger vos étiquettes</div>';
                    } else {
                        tagNames.forEach(name => {
                            const t = window.wmTags[name];
                            const btn = document.createElement('button');
                            btn.className = 'wm-tag-item';
                            btn.innerHTML = `<span class="wm-tag-color" style="background-color: ${t.color}"></span>${name}`;
                            
                            btn.onclick = async (evt) => {
                                evt.stopPropagation();
                                btn.textContent = "⏳..."; // Indicateur visuel
                                const uuid = findCardIdInReact(card);
                                if (uuid) {
                                    const success = await window.assignTagToCard(uuid, name);
                                    if (success) {
                                        btn.textContent = "✅ Validé";
                                    } else {
                                        btn.textContent = "❌ Erreur";
                                    }
                                    // Fermer le menu après 1 seconde
                                    setTimeout(() => tagDropdown.classList.remove('show'), 1000);
                                }
                            };
                            tagDropdown.appendChild(btn);
                        });
                    }
                }
            });
            
            tagWrapper.appendChild(tagBtn);
            tagWrapper.appendChild(tagDropdown);
            card.appendChild(tagWrapper);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === ' ') {
            e.preventDefault();
            const openImg = document.querySelector('img[alt="Ouvrir un paquet"]');
            if (openImg) { openImg.closest('button').click(); return; }

            const continueBtn = Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.trim() === 'Continuer' && !btn.disabled
            );
            if (continueBtn) { continueBtn.click(); return; }

            const rightArrowSvg = document.querySelector('svg polyline[points="9 18 15 12 9 6"]');
            if (rightArrowSvg) rightArrowSvg.closest('button').click();
        } 
        else if (e.key === 'ArrowLeft') {
            const leftArrowSvg = document.querySelector('svg polyline[points="15 18 9 12 15 6"]');
            if (leftArrowSvg) { e.preventDefault(); leftArrowSvg.closest('button').click(); }
        }
        else if (e.key === 'ArrowRight') {
            const rightArrowSvg = document.querySelector('svg polyline[points="9 18 15 12 9 6"]');
            if (rightArrowSvg) { e.preventDefault(); rightArrowSvg.closest('button').click(); }
        }
    });

    const observer = new MutationObserver((mutations) => {
        const hasNewNodes = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (hasNewNodes) {
            processAllCardsForPrices();
            injectBoosterButtons();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
