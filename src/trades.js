// ============================================================
// WikiM - Module: Trade Helper & Smart Trades Routines
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

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

    // Smart Trades UI & Routines initialization
    function initSmartTradesUI() {
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

        // --- LOGIQUE MULTI-COMPTES ---
        function renderAltAccounts() {
            const list = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
            const container = document.getElementById('wm-alt-list');
            if (!container) return;
            container.innerHTML = list.map((alt, i) =>
                `<div style="background:rgba(245,158,11,0.2); border:1px solid #fbbf24; color:#fbbf24; padding:2px 8px; border-radius:12px; font-size:11px; display:flex; align-items:center; gap:6px;">
                    👤 ${alt} <span data-alt-del="${i}" style="cursor:pointer; color:#ef4444; font-weight:bold;">✕</span>
                </div>`
            ).join('');
        }

        const altAddBtn = document.getElementById('wm-alt-add-btn');
        if (altAddBtn) {
            altAddBtn.addEventListener('click', () => {
                const input = document.getElementById('wm-alt-input');
                const pseudo = input.value.trim();
                if (!pseudo) return;
                const list = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
                if (!list.includes(pseudo)) { list.push(pseudo); localStorage.setItem('wmAltAccounts', JSON.stringify(list)); }
                input.value = '';
                renderAltAccounts();
            });
        }

        document.addEventListener('click', (e) => {
            if (e.target.dataset.altDel) {
                const idx = Number(e.target.dataset.altDel);
                const list = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
                list.splice(idx, 1);
                localStorage.setItem('wmAltAccounts', JSON.stringify(list));
                renderAltAccounts();
            }
        });

        renderAltAccounts();

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

    }
    window.initSmartTradesUI = initSmartTradesUI;
    window.WikiM.initSmartTradesUI = initSmartTradesUI;

    // --- Cross-module exports ---
    if (typeof getSmartTrades !== 'undefined') { window.getSmartTrades = getSmartTrades; window.WikiM.getSmartTrades = getSmartTrades; }
    if (typeof saveSmartTrades !== 'undefined') { window.saveSmartTrades = saveSmartTrades; window.WikiM.saveSmartTrades = saveSmartTrades; }
    if (typeof getOpenTradeModal !== 'undefined') { window.getOpenTradeModal = getOpenTradeModal; window.WikiM.getOpenTradeModal = getOpenTradeModal; }
    if (typeof getTradeSelectedCards !== 'undefined') { window.getTradeSelectedCards = getTradeSelectedCards; window.WikiM.getTradeSelectedCards = getTradeSelectedCards; }
    if (typeof getCardValue !== 'undefined') { window.getCardValue = getCardValue; window.WikiM.getCardValue = getCardValue; }
    if (typeof ensurePriceForTrade !== 'undefined') { window.ensurePriceForTrade = ensurePriceForTrade; window.WikiM.ensurePriceForTrade = ensurePriceForTrade; }
    if (typeof computeTradeHelper !== 'undefined') { window.computeTradeHelper = computeTradeHelper; window.WikiM.computeTradeHelper = computeTradeHelper; }
    if (typeof updateTradeHelperUI !== 'undefined') { window.updateTradeHelperUI = updateTradeHelperUI; window.WikiM.updateTradeHelperUI = updateTradeHelperUI; }
    if (typeof initSmartTradesUI !== 'undefined') { window.initSmartTradesUI = initSmartTradesUI; window.WikiM.initSmartTradesUI = initSmartTradesUI; }
    if (typeof ensureIdentity !== 'undefined') { window.ensureIdentity = ensureIdentity; window.WikiM.ensureIdentity = ensureIdentity; }
    if (typeof getCardPrice !== 'undefined') { window.getCardPrice = getCardPrice; window.WikiM.getCardPrice = getCardPrice; }
    if (typeof updateTradeRunUI !== 'undefined') { window.updateTradeRunUI = updateTradeRunUI; window.WikiM.updateTradeRunUI = updateTradeRunUI; }
    if (typeof openStModal !== 'undefined') { window.openStModal = openStModal; window.WikiM.openStModal = openStModal; }
    if (typeof closeStModal !== 'undefined') { window.closeStModal = closeStModal; window.WikiM.closeStModal = closeStModal; }
    if (typeof fetchFriendsForSelect !== 'undefined') { window.fetchFriendsForSelect = fetchFriendsForSelect; window.WikiM.fetchFriendsForSelect = fetchFriendsForSelect; }
    if (typeof renderAltAccounts !== 'undefined') { window.renderAltAccounts = renderAltAccounts; window.WikiM.renderAltAccounts = renderAltAccounts; }
    if (typeof renderSmartTradesList !== 'undefined') { window.renderSmartTradesList = renderSmartTradesList; window.WikiM.renderSmartTradesList = renderSmartTradesList; }
    if (typeof fetchCollectionByKeyword !== 'undefined') { window.fetchCollectionByKeyword = fetchCollectionByKeyword; window.WikiM.fetchCollectionByKeyword = fetchCollectionByKeyword; }
    if (typeof runAutoScan !== 'undefined') { window.runAutoScan = runAutoScan; window.WikiM.runAutoScan = runAutoScan; }
    if (typeof sendSmartTrade !== 'undefined') { window.sendSmartTrade = sendSmartTrade; window.WikiM.sendSmartTrade = sendSmartTrade; }
})();
