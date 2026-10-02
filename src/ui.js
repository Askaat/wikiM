// ============================================================
// WikiM - Module: Control Panel UI & Tabs
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

    // ============================================================
    // PANNEAU DE CONTRÔLE
    // ============================================================
    let currentTab = 'tracked';

    function setActiveTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.wm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.wm-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.tab !== tabName));
        if (tabName === 'balance') renderBalanceUI();
    }

    function createControlPanel() {
        if (document.getElementById('wm-floating-toggle')) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'wm-floating-toggle';
        toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span class="wm-badge">0</span>
        `;
        document.body.appendChild(toggleBtn);

        const savedPos = getMenuPosition();
        if (savedPos) {
            toggleBtn.style.left = savedPos.left + 'px';
            toggleBtn.style.top = savedPos.top + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
        }

        const panel = document.createElement('div');
        panel.id = 'wm-control-panel';
        panel.innerHTML = `
            <div class="wm-panel-header">
                <span class="wm-panel-header-title">⚙️ Wiki-Masters Tools</span>
                <button class="wm-panel-close" id="wm-close-panel">✕</button>
            </div>
            <div class="wm-tabs">
                <button class="wm-tab active" data-tab="tracked">
                    <span class="wm-tab-icon">🔔</span>
                    <span>Suivi</span>
                    <span class="wm-tab-badge">0</span>
                </button>
                <button class="wm-tab" data-tab="balance">
                    <span class="wm-tab-icon">💰</span>
                    <span>Solde</span>
                </button>
                <button class="wm-tab" data-tab="bulk">
                    <span class="wm-tab-icon">🗑️</span>
                    <span>Bulk</span>
                </button>
                <button class="wm-tab" data-tab="tools">
                    <span class="wm-tab-icon">🛠️</span>
                    <span>Outils</span>
                </button>
                <button class="wm-tab" data-tab="tags">
                    <span class="wm-tab-icon">🏷️</span>
                    <span>Tags</span>
                </button>
                <button class="wm-tab" data-tab="trade">
                    <span class="wm-tab-icon">🤝</span>
                    <span>Trade</span>
                </button>
                <button class="wm-tab" data-tab="prefs">
                    <span class="wm-tab-icon">⚙️</span>
                    <span>Préfs</span>
                </button>
                <button class="wm-tab" data-tab="patchnotes">
                    <span class="wm-tab-icon">📝</span>
                    <span>MÀJ</span>
                </button>
            </div>

            <div class="wm-tab-content" data-tab="tracked">
                <div>
                    <div class="wm-section-title">Enchères suivies</div>
                    <div id="wm-tracked-list"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="balance">
                <div id="wm-balance-content">
                    <div class="wm-tracked-empty">Chargement...</div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="bulk">
                <div>
                    <div class="wm-section-title">Panier Bulk Delete</div>
                    <div id="wm-bulk-list-container"></div>
                    <div style="display:flex; gap:6px;">
                        <button id="wm-bulk-exec-btn" class="wm-panel-btn danger" style="flex:1;">Tout Défausser</button>
                        <button id="wm-bulk-clear-btn" class="wm-panel-btn ghost">Vider</button>
                    </div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="tools">
                <div>
                    <div class="wm-section-title">Diagnostic Serveur</div>
                    <div class="wm-ping-box">
                        <span>Latence API : <span id="wm-ping-val" style="color:#fbbf24;">-- ms</span></span>
                        <button id="wm-ping-btn" class="wm-panel-btn" style="padding:6px 12px;">Ping</button>
                    </div>
                </div>
                <div>
                    <div class="wm-section-title">Scan des prix</div>
                    <button id="wm-scan-prices-btn" class="wm-panel-btn" style="width: 100%;">🔍 Scanner toute la collection</button>
                    <button id="wm-scan-prices-cancel" class="wm-panel-btn danger" style="width: 100%; margin-top: 6px; display: none;">⏹️ Annuler le scan</button>
                    <div id="wm-scan-progress" style="margin-top: 8px; font-size: 11px; font-family: monospace; color: #94a3b8; min-height: 16px;"></div>
                </div>
                <div>
                    <div class="wm-section-title">Recherche par ID de carte</div>
                    <div class="wm-input-group">
                        <input type="text" id="wm-card-id-input" class="wm-panel-input" placeholder="Coller l'UUID...">
                        <button id="wm-search-btn" class="wm-panel-btn">Chercher</button>
                    </div>
                    <div id="wm-result-box" style="margin-top:8px; padding:8px; background:rgba(30,41,59,0.6); border-radius:6px; font-size:11px; font-family:monospace; min-height:40px; color:#94a3b8;">Entrez un ID pour voir les infos...</div>
                </div>
                <div>
                    <div class="wm-section-title">Logs en direct</div>
                    <div id="wm-log-box"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="tags">
                <div class="wm-section-title">Gestionnaire de Tags</div>

                <!-- Toggle Auto-Tag -->
                <div class="wm-auto-tag-panel">
                    <span class="wm-auto-tag-lbl">⚡ Auto-Tag à l'ouverture des packs</span>
                    <label style="display:flex; align-items:center; cursor:pointer;">
                        <input type="checkbox" id="wm-toggle-autotag" style="width:16px; height:16px; accent-color:#10b981;">
                    </label>
                </div>
                <div>
                    <div class="wm-section-title">Mes étiquettes</div>
                    <div id="wm-tags-list" style="background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:8px;padding:8px;font-size:12px;max-height:180px;overflow-y:auto;margin-bottom:8px;">
            <div class="wm-tracked-empty">Chargement...</div>
                    </div>
                    <div class="wm-input-group" style="margin-bottom:6px;">
                        <input type="text" id="wm-new-tag-name" class="wm-panel-input" placeholder="Nouvelle étiquette...">
                        <input type="color" id="wm-new-tag-color" value="#6366f1" style="width:42px;height:38px;padding:2px;border-radius:8px;border:1px solid rgba(148,163,184,0.15);background:rgba(30,41,59,0.6);cursor:pointer;">
                    </div>
                    <button id="wm-add-tag-btn" class="wm-panel-btn" style="width:100%;">➕ Créer l'étiquette</button>
                </div>

                <div>
                    <div class="wm-section-title">Règles d'auto-tagging</div>
                    <div id="wm-rules-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;"></div>
                    <button id="wm-add-rule-btn" class="wm-panel-btn ghost" style="width:100%;">➕ Ajouter une règle</button>
                </div>

                <div>
                    <div class="wm-section-title">Application</div>

                    <div class="wm-pref-row" style="padding:4px 0;">
                        <label for="wm-tag-mode-page" style="font-size:11px;">📄 Page actuelle uniquement</label>
                        <input type="checkbox" id="wm-tag-mode-page">
                    </div>
                    <div id="wm-tag-mode-hint" style="font-size:10px;color:#64748b;font-family:monospace;margin-bottom:8px;">
                        Mode complet : parcourt toute la collection (long).<br>
                        Mode page : traite uniquement les cartes affichées.
                    </div>

                    <div id="wm-tag-run-summary" style="font-size:11px;font-family:monospace;color:#94a3b8;min-height:40px;background:rgba(2,6,23,0.5);border-radius:6px;padding:8px;margin-bottom:8px;">Prêt.</div>

                    <div style="display:flex;gap:6px;margin-bottom:6px;">
                        <button id="wm-tag-preview-btn" class="wm-panel-btn" style="flex:1;">🔍 Prévisualiser</button>
                        <button id="wm-tag-apply-btn" class="wm-panel-btn danger" style="flex:1;" disabled>🚀 Appliquer</button>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button id="wm-tag-pause-btn" class="wm-panel-btn ghost" style="flex:1;display:none;">⏸️ Pause</button>
                        <button id="wm-tag-cancel-btn" class="wm-panel-btn ghost" style="flex:1;display:none;">⏹️ Annuler</button>
                    </div>
                </div>
            </div>

            <!-- ONGLET SMART TRADE -->
            <div class="wm-tab-content hidden" data-tab="trade" style="position: relative;">

                <!-- VUE 1 : LISTE DES ROUTINES -->
                <div id="wm-st-main-view" style="display: flex; flex-direction: column; height: 100%;">
                    <div class="wm-section-title">Mes Routines d'Échange</div>
                    <div class="wm-st-list" id="wm-st-routines-list">
                        <div class="wm-tracked-empty">Aucune routine configurée.</div>
                    </div>
                    <button id="wm-st-btn-new" class="wm-panel-btn" style="margin-top: 10px; width: 100%;">+ Créer une routine d'échange</button>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="prefs">
                <div>
                    <div class="wm-section-title">Recherche Multi-Comptes</div>
                    <div class="wm-input-group">
                        <input type="text" id="wm-alt-input" class="wm-panel-input" placeholder="Pseudo exact d'un ami/alt...">
                        <button id="wm-alt-add-btn" class="wm-panel-btn">Ajouter</button>
                    </div>
                    <div id="wm-alt-list" style="margin-top:8px; display:flex; gap:4px; flex-wrap:wrap;"></div>
                </div>
                <div>
                    <div class="wm-section-title">Notifications</div>
                    <div class="wm-pref-row"><label for="wm-pref-browser">Notification navigateur</label><input type="checkbox" id="wm-pref-browser" ${getPrefs().browser ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-toast">Toast in-page</label><input type="checkbox" id="wm-pref-toast" ${getPrefs().toast ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-sound">Son (triple bip)</label><input type="checkbox" id="wm-pref-sound" ${getPrefs().sound ? 'checked' : ''}></div>
                </div>
                <div>
                    <div class="wm-section-title">Délais</div>
                    <div class="wm-pref-row"><label for="wm-pref-trigger">Délai par défaut (s)</label><input type="number" id="wm-pref-trigger" value="${getPrefs().defaultTriggerBefore}" min="5" max="3600"></div>
                    <div class="wm-pref-row"><label for="wm-pref-refresh">Refresh end_at (s)</label><input type="number" id="wm-pref-refresh" value="${getPrefs().refreshInterval}" min="10" max="300"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="patchnotes">
                <div>
                    <div class="wm-section-title">Historique des mises à jour</div>
                    <div id="wm-patch-notes-list" style="overflow-y: auto; max-height: 380px; padding-right: 4px;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        function repositionPanel() {
            const btnRect = toggleBtn.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            let left = btnRect.left;
            let top = btnRect.top - panelRect.height - 12;
            if (top < 12) top = btnRect.bottom + 12;
            if (top + panelRect.height > window.innerHeight - 12) {
                top = window.innerHeight - panelRect.height - 12;
            }
            if (left + panelRect.width > window.innerWidth - 12) {
                left = window.innerWidth - panelRect.width - 12;
            }
            if (left < 12) left = 12;
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        }

        let dragState = { isDown: false, startX: 0, startY: 0, btnStartX: 0, btnStartY: 0, longPressTimer: null, isDragging: false };

        toggleBtn.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const rect = toggleBtn.getBoundingClientRect();
            dragState.isDown = true;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.btnStartX = rect.left;
            dragState.btnStartY = rect.top;
            dragState.isDragging = false;

            dragState.longPressTimer = setTimeout(() => {
                dragState.isDragging = true;
                toggleBtn.classList.add('wm-dragging');
            }, 250);

            toggleBtn.setPointerCapture(e.pointerId);
        });

        toggleBtn.addEventListener('pointermove', (e) => {
            if (!dragState.isDown || !dragState.isDragging) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            let newLeft = dragState.btnStartX + dx;
            let newTop = dragState.btnStartY + dy;
            newLeft = Math.max(4, Math.min(window.innerWidth - toggleBtn.offsetWidth - 4, newLeft));
            newTop = Math.max(4, Math.min(window.innerHeight - toggleBtn.offsetHeight - 4, newTop));
            toggleBtn.style.left = newLeft + 'px';
            toggleBtn.style.top = newTop + 'px';
            toggleBtn.style.bottom = 'auto';
            toggleBtn.style.right = 'auto';
            if (panel.classList.contains('show')) repositionPanel();
        });

        toggleBtn.addEventListener('pointerup', () => {
            clearTimeout(dragState.longPressTimer);
            if (dragState.isDown && !dragState.isDragging) {
                if (panel.classList.contains('show')) {
                    panel.classList.remove('show');
                    toggleBtn.classList.remove('wm-menu-open');
                } else {
                    panel.classList.add('show');
                    toggleBtn.classList.add('wm-menu-open');
                    repositionPanel();
                    if (currentTab === 'balance') renderBalanceUI();
                }
            } else if (dragState.isDragging) {
                const rect = toggleBtn.getBoundingClientRect();
                saveMenuPosition({ left: rect.left, top: rect.top });
            }
            dragState.isDown = false;
            dragState.isDragging = false;
            toggleBtn.classList.remove('wm-dragging');
        });

        toggleBtn.addEventListener('pointercancel', () => {
            clearTimeout(dragState.longPressTimer);
            dragState.isDown = false;
            dragState.isDragging = false;
            toggleBtn.classList.remove('wm-dragging');
        });

        document.querySelectorAll('.wm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                setActiveTab(tab.dataset.tab);
                if (panel.classList.contains('show')) repositionPanel();
            });
        });

        document.getElementById('wm-close-panel').addEventListener('click', () => {
            panel.classList.remove('show');
            toggleBtn.classList.remove('wm-menu-open');
        });

        const savePrefsFromUI = () => {
            savePrefs({
                browser: document.getElementById('wm-pref-browser').checked,
                toast: document.getElementById('wm-pref-toast').checked,
                sound: document.getElementById('wm-pref-sound').checked,
                siteNotifs: true,
                refreshInterval: parseInt(document.getElementById('wm-pref-refresh').value, 10) || 30,
                defaultTriggerBefore: parseInt(document.getElementById('wm-pref-trigger').value, 10) || 60
            });
            logToPanel('⚙️ Préférences sauvegardées');
        };
        ['wm-pref-browser', 'wm-pref-toast', 'wm-pref-sound', 'wm-pref-trigger', 'wm-pref-refresh'].forEach(id => {
            document.getElementById(id).addEventListener('change', savePrefsFromUI);
        });

        document.getElementById('wm-ping-btn').addEventListener('click', async () => {
            const valDisplay = document.getElementById('wm-ping-val');
            valDisplay.innerText = "Calcul...";
            valDisplay.style.color = "#fbbf24";
            const start = performance.now();
            try {
                await fetch('https://www.wiki-masters.com/api/my-collection?page=0', { method: 'GET', credentials: 'include' });
                const diff = Math.round(performance.now() - start);
                valDisplay.innerText = `${diff} ms`;
                valDisplay.style.color = diff > 2000 ? "#ef4444" : (diff > 800 ? "#fbbf24" : "#10b981");
                logToPanel(`🏓 Ping Serveur : ${diff} ms`);
            } catch(e) {
                valDisplay.innerText = "Erreur"; valDisplay.style.color = "#ef4444";
            }
        });

        document.getElementById('wm-bulk-clear-btn').addEventListener('click', () => {
            saveBulkList([]); updateBulkUI(); logToPanel("🗑️ Panier Bulk vidé.");
            document.querySelectorAll('.wm-btn-bulk').forEach(btn => {
                btn.classList.remove('wm-btn-bulk-active');
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
            });
        });

        document.getElementById('wm-bulk-exec-btn').addEventListener('click', async () => {
            const list = getBulkList();
            if (list.length === 0) return;

            logToPanel(`🚀 Lancement Bulk Delete (${list.length} cartes)...`);

            const readyToDelete = [];
            const remainingList = [];
            let resolvedFromIndex = 0;
            let resolvedFromApi = 0;

            // ---- Phase 1 : résolution des user_card_id ----
            for (const item of list) {
                const title = typeof item === 'string' ? item : item.title;
                const cardId = typeof item === 'object' ? item.id : null;
                let userCardId = typeof item === 'object' ? item.userCardId : null;

                // Si déjà résolu (ajouté avec succès via toggleBulkForCard)
                if (userCardId) {
                    readyToDelete.push({ title, userCardId, cardId });
                    resolvedFromIndex++;
                    continue;
                }

                // Sinon, tente la résolution
                userCardId = await wmResolveUserCardId(cardId, title);

                if (userCardId) {
                    readyToDelete.push({ title, userCardId, cardId });
                    resolvedFromApi++;
                } else {
                    logToPanel(`⚠️ "${title}" — impossible de résoudre user_card_id`);
                    remainingList.push({ title, id: cardId, userCardId: null });
                }
            }

            logToPanel(`🔎 Résolution : ${resolvedFromIndex} depuis l'index, ${resolvedFromApi} via API, ${remainingList.length} échecs`);

            // ---- Phase 2 : appel bulk delete ----
            if (readyToDelete.length > 0) {
                logToPanel(`[API] ⚡ Exécution globale (${readyToDelete.length} cartes)...`);
                const userCardIds = readyToDelete.map(item => item.userCardId);
                const result = await executeBulkDiscard(userCardIds);

                if (result && result.success) {
                    logToPanel(`✅ Succès : ${result.count} défaussées (solde : ${result.balance ?? '?'} WB)`);
                    showWMToast(`Suppression réussie ! +${result.count} WB`, true);

                    for (const item of readyToDelete) {
                        markCardAsProcessedByTitle(item.title);
                        if (typeof userCardIdCache !== 'undefined') userCardIdCache.delete(item.title);
                        if (window.wmInventoryMap) delete window.wmInventoryMap[item.title];
                    }

                    // Met à jour le solde si dispo
                    if (typeof result.balance === 'number') {
                        recordBalance(result.balance, 'bulk_discard');
                    }
                } else {
                    logToPanel(`[API] ❌ Échec de la requête (status ${result?.status || 'inconnu'})`);
                    showWMToast("Erreur API lors de la défausse groupée.", false);
                    // Remet les cartes en attente
                    readyToDelete.forEach(item => remainingList.push({
                        title: item.title, id: item.cardId, userCardId: item.userCardId
                    }));
                }
            } else {
                logToPanel(`❌ Aucune carte valide prête à être défaussée.`);
            }

            // ---- Phase 3 : nettoyage ----
            saveBulkList(remainingList);
            updateBulkUI();
            logToPanel(`🏁 Bulk terminé. ${remainingList.length} restante(s).`);
            if (typeof updateAllBulkButtonsUI === 'function') updateAllBulkButtonsUI();
        });
        document.getElementById('wm-search-btn').addEventListener('click', async () => {
            const uuid = document.getElementById('wm-card-id-input').value.trim();
            const resultBox = document.getElementById('wm-result-box');
            if (!uuid) return;
            resultBox.innerHTML = '<span style="color:#fbbf24;">Recherche...</span>';
            try {
                const res = await fetch(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                    credentials: "include", method: "GET", headers: { "Accept": "application/json" }
                });
                const data = await res.json();
                if (data && data.wikipedia_title) {
                    resultBox.innerHTML = `<b>${data.wikipedia_title}</b><br>${JSON.stringify(data.summary || "Aucune vente")}`;
                } else { resultBox.innerHTML = '<span style="color:#ef4444;">Carte introuvable.</span>'; }
            } catch (e) { resultBox.innerHTML = '<span style="color:#ef4444;">Erreur réseau.</span>'; }
        });


        const scanBtn = document.getElementById('wm-scan-prices-btn');
        const scanCancelBtn = document.getElementById('wm-scan-prices-cancel');
        if (scanBtn) scanBtn.addEventListener('click', () => runPriceScan());
        if (scanCancelBtn) scanCancelBtn.addEventListener('click', () => {
            if (wmScanState.running) {
                wmScanState.cancelled = true;
                logToPanel('⏹️ Demande d\'annulation envoyée...');
            }
        });

        // Rendu des Patch Notes
        function renderPatchNotes() {
            const container = document.getElementById('wm-patch-notes-list');
            if (!container) return;

            // Le tableau est parcouru dans l'ordre (le plus récent en premier si tu les ajoutes en haut du tableau WM_PATCH_NOTES)
            container.innerHTML = WM_PATCH_NOTES.map(pn => `
                <div class="wm-patch-item">
                    <div class="wm-patch-header">
                        <span class="wm-patch-version">v${pn.version}</span>
                        <span class="wm-patch-date">${pn.date}</span>
                    </div>
                    <ul class="wm-patch-changes">
                        ${pn.changes.map(change => `<li>${change}</li>`).join('')}
                    </ul>
                </div>
            `).join('');
        }

        // Initialisation des sous-modules
        if (typeof initSmartTradesUI === 'function') initSmartTradesUI();
        if (typeof initTagGroupsUI === 'function') initTagGroupsUI();


        //ControlPanel fin
        renderSmartTradesList();
        renderPatchNotes();
        initTagsTab();
        updateBulkUI();
        renderTrackedAuctions();
        updateTrackBadge();
        renderBalanceUI();
        logToPanel("V2.0.0 Démarrée.");
    }


    // --- Cross-module exports ---
    if (typeof setActiveTab !== 'undefined') { window.setActiveTab = setActiveTab; window.WikiM.setActiveTab = setActiveTab; }
    if (typeof createControlPanel !== 'undefined') { window.createControlPanel = createControlPanel; window.WikiM.createControlPanel = createControlPanel; }
    if (typeof repositionPanel !== 'undefined') { window.repositionPanel = repositionPanel; window.WikiM.repositionPanel = repositionPanel; }
    if (typeof renderPatchNotes !== 'undefined') { window.renderPatchNotes = renderPatchNotes; window.WikiM.renderPatchNotes = renderPatchNotes; }
})();
