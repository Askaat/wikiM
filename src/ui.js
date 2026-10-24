// ============================================================
// WikiM - Module: Control Panel UI & Tabs
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // PANNEAU DE CONTRÔLE
    // ============================================================
    let currentTab = 'tracked';

    function setActiveTab(tabName) {
        currentTab = tabName;
        document.querySelectorAll('.wm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        document.querySelectorAll('.wm-tab-content').forEach(c => c.classList.toggle('hidden', c.dataset.tab !== tabName));
        if (tabName === 'balance') window.renderBalanceUI();
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

        const savedPos = window.getMenuPosition();
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
                <button class="wm-tab" data-tab="hub">
                    <span class="wm-tab-icon">☁️</span>
                    <span>Hub</span>
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
                    <div class="wm-section-title" id="wm-bulk-section-title">Panier Bulk Delete</div>
                    <div id="wm-bulk-list-container"></div>
                    <div style="display:flex; gap:6px; margin-bottom: 6px;">
                        <button id="wm-bulk-page-btn" class="wm-panel-btn danger" style="flex:1;" disabled>🔥 Défausser la page (0)</button>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button id="wm-bulk-exec-btn" class="wm-panel-btn danger" style="flex:1;">Tout Défausser</button>
                        <button id="wm-bulk-clean-btn" class="wm-panel-btn" title="Vérifier et nettoyer les cartes fantômes déjà supprimées du jeu" style="padding:4px 8px; font-size:11px;">🧹 Nettoyer</button>
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

                    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                        <button id="wm-tag-preview-btn" class="wm-panel-btn" style="flex:1;">🔍 Prévisualiser</button>
                        <button id="wm-tag-details-btn" class="wm-panel-btn ghost" style="flex:1;display:none;border-color:#6366f1;color:#a5b4fc;">👁️ Détails (0)</button>
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
                    <div class="wm-pref-row" style="margin-bottom:8px;">
                        <label for="wm-pref-multi-enabled" style="font-weight:bold; color:#fbbf24;">Activer la recherche multi-comptes</label>
                        <input type="checkbox" id="wm-pref-multi-enabled" ${localStorage.getItem('wmMultiSearchEnabled') === 'true' ? 'checked' : ''}>
                    </div>
                    <div class="wm-input-group">
                        <input type="text" id="wm-alt-input" class="wm-panel-input" placeholder="Pseudo exact d'un ami/alt...">
                        <button id="wm-alt-add-btn" class="wm-panel-btn">Ajouter</button>
                    </div>
                    <div id="wm-alt-list" style="margin-top:8px; display:flex; gap:4px; flex-wrap:wrap;"></div>
                </div>
                <div>
                    <div class="wm-section-title">Ouverture de Paquets</div>
                    <div class="wm-pref-row" style="margin-bottom:8px;">
                        <label for="wm-pref-auto-pack-prices" style="font-size:12px;" title="Récupérer le prix moyen des 5 cartes lors d'une ouverture manuelle">💰 Prix auto à l'ouverture de paquet</label>
                        <input type="checkbox" id="wm-pref-auto-pack-prices" ${localStorage.getItem('wmAutoPackPricesEnabled') !== 'false' ? 'checked' : ''}>
                    </div>
                </div>
                <div>
                    <div class="wm-section-title">Notifications</div>
                    <div class="wm-pref-row"><label for="wm-pref-browser">Notification navigateur</label><input type="checkbox" id="wm-pref-browser" ${window.getPrefs().browser ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-toast">Toast in-page</label><input type="checkbox" id="wm-pref-toast" ${window.getPrefs().toast ? 'checked' : ''}></div>
                    <div class="wm-pref-row"><label for="wm-pref-sound">Son (triple bip)</label><input type="checkbox" id="wm-pref-sound" ${window.getPrefs().sound ? 'checked' : ''}></div>
                </div>
                <div>
                    <div class="wm-section-title">Délais</div>
                    <div class="wm-pref-row"><label for="wm-pref-trigger">Délai par défaut (s)</label><input type="number" id="wm-pref-trigger" value="${window.getPrefs().defaultTriggerBefore}" min="5" max="3600"></div>
                    <div class="wm-pref-row"><label for="wm-pref-refresh">Refresh end_at (s)</label><input type="number" id="wm-pref-refresh" value="${window.getPrefs().refreshInterval}" min="10" max="300"></div>
                </div>
            </div>

            <div class="wm-tab-content hidden" data-tab="hub">
                <div>
                    <div class="wm-section-title">☁️ Synchronisation Cloud & Hub Multi-Comptes</div>
                    <div style="font-size:11px; color:#94a3b8; margin-bottom:10px;">
                        Partagez votre collection vers Supabase (délai sécurisé de 2s par page). Mutualisez vos cartes entre comptes pour compléter le succès <b>5 exemplaires</b>.
                    </div>

                    <!-- Configuration du compte courant -->
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:10px; background:rgba(15,23,42,0.6); padding:8px; border-radius:6px; border:1px solid rgba(148,163,184,0.15);">
                        <span style="font-size:11px; color:#94a3b8; white-space:nowrap;">👤 Compte :</span>
                        <input id="wm-hub-username-input" type="text" placeholder="Détection auto en cours..." style="background:#0f172a; border:1px solid #334155; color:#38bdf8; font-weight:bold; font-size:11px; border-radius:4px; padding:4px 8px; flex:1;" value="${localStorage.getItem('wmMyUsername') || ''}">
                        <button id="wm-hub-username-save-btn" class="wm-panel-btn ghost" style="padding:4px 8px; font-size:10px;" title="Enregistrer ce pseudo">💾 Sauver</button>
                    </div>
                    
                    <div style="display:flex; gap:6px; margin-bottom:8px;">
                        <button id="wm-hub-sync-start-btn" class="wm-panel-btn" style="flex:1;">🚀 Scanner & Envoyer</button>
                        <button id="wm-hub-sync-pause-btn" class="wm-panel-btn ghost" style="display:none; padding:6px 12px;">⏸️ Pause</button>
                        <button id="wm-hub-sync-stop-btn" class="wm-panel-btn danger" style="display:none; padding:6px 12px;">⏹️ Arrêter</button>
                        <button id="wm-hub-sync-pull-btn" class="wm-panel-btn ghost" style="flex:1;">📥 Tout actualiser</button>
                    </div>
                    
                    <div id="wm-hub-sync-status" style="font-size:11px; font-family:monospace; color:#38bdf8; min-height:16px; margin-bottom:12px;">Prêt.</div>
                </div>

                <div>
                    <div class="wm-section-title">🎯 Détecteur de Doublons Multi-Comptes (Succès 5x)</div>
                    <div id="wm-hub-synergies-list" style="background:rgba(30,41,59,0.6); border:1px solid rgba(148,163,184,0.15); border-radius:8px; padding:8px; font-size:11px; max-height:220px; overflow-y:auto;">
                        <div class="wm-tracked-empty">Cliquez sur 'Tout actualiser' pour charger les synergies.</div>
                    </div>
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
        window.repositionPanel = repositionPanel;
        window.WikiM.repositionPanel = repositionPanel;

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
                    if (currentTab === 'balance') window.renderBalanceUI();
                }
            } else if (dragState.isDragging) {
                const rect = toggleBtn.getBoundingClientRect();
                window.saveMenuPosition({ left: rect.left, top: rect.top });
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
            window.savePrefs({
                browser: document.getElementById('wm-pref-browser').checked,
                toast: document.getElementById('wm-pref-toast').checked,
                sound: document.getElementById('wm-pref-sound').checked,
                siteNotifs: true,
                refreshInterval: parseInt(document.getElementById('wm-pref-refresh').value, 10) || 30,
                defaultTriggerBefore: parseInt(document.getElementById('wm-pref-trigger').value, 10) || 60
            });
            window.logToPanel('⚙️ Préférences sauvegardées');
        };
        // --- LOGIQUE DU HUB SUPABASE & SUCCÈS 5X ---
        function getSyncModule() {
            return (typeof unsafeWindow !== 'undefined' ? unsafeWindow.wmSync : null)
                || window.wmSync
                || (W && W.wmSync)
                || WikiM.Sync;
        }

        const hubStartBtn = document.getElementById('wm-hub-sync-start-btn');
        const hubPauseBtn = document.getElementById('wm-hub-sync-pause-btn');
        const hubStopBtn = document.getElementById('wm-hub-sync-stop-btn');
        const hubPullBtn = document.getElementById('wm-hub-sync-pull-btn');
        const hubStatus = document.getElementById('wm-hub-sync-status');
        const hubList = document.getElementById('wm-hub-synergies-list');
        const hubUserInput = document.getElementById('wm-hub-username-input');
        const hubUserSaveBtn = document.getElementById('wm-hub-username-save-btn');

        // Détection automatique du pseudo à l'ouverture
        (async () => {
            const sync = getSyncModule();
            if (sync && typeof sync.detectMyUsername === 'function') {
                const detected = await sync.detectMyUsername();
                if (detected && hubUserInput && !hubUserInput.value) {
                    hubUserInput.value = detected;
                }
            }
        })();

        if (hubUserSaveBtn && hubUserInput) {
            hubUserSaveBtn.addEventListener('click', () => {
                const val = (hubUserInput.value || '').trim();
                if (val) {
                    localStorage.setItem('wmMyUsername', val);
                    const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                    targetWin.wmUsername = val;
                    if (hubStatus) hubStatus.textContent = `✅ Pseudo enregistré : ${val}`;
                }
            });
        }

        async function refreshHubSynergiesUI() {
            if (!hubList) return;
            hubList.innerHTML = '<div class="wm-tracked-empty">⏳ Calcul des synergies multi-comptes en cours...</div>';
            try {
                const sync = getSyncModule();
                const res = typeof sync?.calculateSynergies === 'function'
                    ? await sync.calculateSynergies()
                    : { achievable5x: [], near5x: [], totalUniqueCardsTracked: 0 };

                if (!res.achievable5x.length && !res.near5x.length) {
                    hubList.innerHTML = '<div class="wm-tracked-empty">Aucune synergie de doublons détectée pour le moment. Synchronisez vos autres comptes pour voir les correspondances !</div>';
                    return;
                }

                let html = '';
                if (res.achievable5x.length > 0) {
                    html += `<div style="font-weight:bold;color:#34d399;margin-bottom:6px;">🎉 Succès 5x Prêts à Débloquer (${res.achievable5x.length}) :</div>`;
                    res.achievable5x.forEach(c => {
                        const accountsDetail = Object.entries(c.byAccount).map(([acc, count]) => `${acc} (${count})`).join(', ');
                        html += `
                            <div style="background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.3);border-radius:6px;padding:6px;margin-bottom:5px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-weight:700;color:#f8fafc;">${c.title}</span>
                                    <span style="background:#10b981;color:#000;font-size:10px;font-weight:800;padding:1px 5px;border-radius:4px;">${c.totalCopies} EX.</span>
                                </div>
                                <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Répartition : ${accountsDetail}</div>
                            </div>
                        `;
                    });
                }

                if (res.near5x.length > 0) {
                    html += `<div style="font-weight:bold;color:#fbbf24;margin-top:10px;margin-bottom:6px;">⚡ Proches du 5x [3 à 4 ex.] (${res.near5x.length}) :</div>`;
                    res.near5x.forEach(c => {
                        const accountsDetail = Object.entries(c.byAccount).map(([acc, count]) => `${acc} (${count})`).join(', ');
                        html += `
                            <div style="background:rgba(30,41,59,0.5);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;margin-bottom:5px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-weight:600;color:#cbd5e1;">${c.title}</span>
                                    <span style="color:#fbbf24;font-weight:700;">${c.totalCopies} / 5</span>
                                </div>
                                <div style="font-size:10px;color:#64748b;margin-top:2px;">${accountsDetail}</div>
                            </div>
                        `;
                    });
                }

                hubList.innerHTML = html;
            } catch (err) {
                hubList.innerHTML = `<div class="wm-tracked-empty" style="color:#f87171;">Erreur lors du calcul: ${err.message}</div>`;
            }
        }

        if (hubStartBtn) {
            hubStartBtn.addEventListener('click', async () => {
                console.log('[WM-Hub] 🖱️ Clic sur "Scanner & Envoyer"...');
                const sync = getSyncModule();
                if (!sync) {
                    console.error('[WM-Hub] ❌ Module wmSync introuvable !');
                    if (hubStatus) hubStatus.textContent = '❌ Module Sync non initialisé. Rechargez la page.';
                    return;
                }

                // Vérification ou saisie du pseudo
                let currentUsername = (hubUserInput?.value || '').trim() || localStorage.getItem('wmMyUsername');
                if (!currentUsername && typeof sync.detectMyUsername === 'function') {
                    currentUsername = await sync.detectMyUsername();
                }

                if (!currentUsername) {
                    const promptVal = prompt('Veuillez renseigner votre pseudo Wiki-Masters pour ce compte :');
                    if (promptVal && promptVal.trim()) {
                        currentUsername = promptVal.trim();
                        localStorage.setItem('wmMyUsername', currentUsername);
                        if (hubUserInput) hubUserInput.value = currentUsername;
                    } else {
                        if (hubStatus) hubStatus.textContent = '❌ Scan annulé : aucun pseudo spécifié.';
                        return;
                    }
                }

                const state = sync.getSyncState ? sync.getSyncState() : {};
                if (state.isPaused) {
                    sync.resumeCollectionSync();
                    hubStartBtn.style.display = 'none';
                    hubPauseBtn.style.display = 'inline-flex';
                    hubPauseBtn.textContent = '⏸️ Pause';
                    return;
                }

                hubStartBtn.style.display = 'none';
                hubPauseBtn.style.display = 'inline-flex';
                hubPauseBtn.textContent = '⏸️ Pause';
                hubStopBtn.style.display = 'inline-flex';
                if (hubStatus) hubStatus.textContent = `🚀 Initialisation du scan pour ${currentUsername}...`;

                const res = await sync.scanAndSyncCollection((prog) => {
                    if (!hubStatus) return;
                    if (prog.status === 'running') {
                        hubStatus.textContent = `⏳ Page ${prog.page} en cours... (${prog.count} cartes envoyées)`;
                    } else if (prog.status === 'paused') {
                        hubStatus.textContent = `⏸️ En pause à la page ${prog.page} (${prog.count} cartes)`;
                    } else if (prog.status === 'rate_limited') {
                        hubStatus.textContent = `⏳ Rate limit 429 détecté, attente 5s...`;
                    } else if (prog.status === 'done') {
                        hubStatus.textContent = `✅ Scan & Synchronisation terminés (${prog.count} cartes) !`;
                    } else if (prog.status === 'stopped') {
                        hubStatus.textContent = `⏹️ Scan interrompu (${prog.count} cartes synchronisées).`;
                    } else if (prog.status === 'error') {
                        hubStatus.textContent = `❌ Erreur : ${prog.error}`;
                    }
                });

                hubStartBtn.style.display = 'inline-flex';
                hubStartBtn.textContent = '🚀 Re-scanner & Envoyer';
                hubPauseBtn.style.display = 'none';
                hubStopBtn.style.display = 'none';

                if (res && res.success) {
                    await refreshHubSynergiesUI();
                }
            });
        }

        if (hubPauseBtn) {
            hubPauseBtn.addEventListener('click', () => {
                const sync = getSyncModule();
                if (!sync) return;
                const state = sync.getSyncState();
                if (state.isPaused) {
                    sync.resumeCollectionSync();
                    hubPauseBtn.textContent = '⏸️ Pause';
                    if (hubStatus) hubStatus.textContent = '▶️ Reprise du scan...';
                } else {
                    sync.pauseCollectionSync();
                    hubPauseBtn.textContent = '▶️ Reprendre';
                    if (hubStatus) hubStatus.textContent = '⏸️ Scan mis en pause.';
                }
            });
        }

        if (hubStopBtn) {
            hubStopBtn.addEventListener('click', () => {
                const sync = getSyncModule();
                if (sync?.stopCollectionSync) {
                    sync.stopCollectionSync();
                    if (hubStatus) hubStatus.textContent = '⏳ Arrêt demandé...';
                }
            });
        }

        if (hubPullBtn) {
            hubPullBtn.addEventListener('click', async () => {
                const sync = getSyncModule();
                if (!sync) return;
                hubPullBtn.disabled = true;
                if (hubStatus) hubStatus.textContent = '⏳ Récupération de tous les comptes...';
                if (typeof sync.pullAllCollections === 'function') {
                    await sync.pullAllCollections();
                }
                hubPullBtn.disabled = false;
                if (hubStatus) hubStatus.textContent = '✅ Collections multi-comptes à jour !';
                await refreshHubSynergiesUI();
            });
        }

        ['wm-pref-browser', 'wm-pref-toast', 'wm-pref-sound', 'wm-pref-trigger', 'wm-pref-refresh'].forEach(id => {
            document.getElementById(id).addEventListener('change', savePrefsFromUI);
        });

        const autoPricesToggle = document.getElementById('wm-pref-auto-pack-prices');
        if (autoPricesToggle) {
            autoPricesToggle.addEventListener('change', () => {
                localStorage.setItem('wmAutoPackPricesEnabled', autoPricesToggle.checked ? 'true' : 'false');
                window.logToPanel(autoPricesToggle.checked ? '💰 Prix auto à l\'ouverture activés' : '💰 Prix auto à l\'ouverture désactivés');
                const boToggle = document.getElementById('wm-bo-toggle-prices');
                if (boToggle) boToggle.checked = autoPricesToggle.checked;
            });
        }

        const multiToggle = document.getElementById('wm-pref-multi-enabled');
        if (multiToggle) {
            multiToggle.addEventListener('change', () => {
                localStorage.setItem('wmMultiSearchEnabled', multiToggle.checked ? 'true' : 'false');
                window.logToPanel(multiToggle.checked ? '👥 Recherche multi-comptes activée' : '👤 Recherche multi-comptes désactivée');
                const colToggle = document.getElementById('wm-col-multi-toggle');
                if (colToggle) colToggle.checked = multiToggle.checked;
            });
        }

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
                window.logToPanel(`🏓 Ping Serveur : ${diff} ms`);
            } catch(e) {
                valDisplay.innerText = "Erreur"; valDisplay.style.color = "#ef4444";
            }
        });

        document.getElementById('wm-bulk-clear-btn').addEventListener('click', () => {
            window.saveBulkList([]); window.updateBulkUI(); window.logToPanel("🗑️ Panier Bulk vidé.");
            document.querySelectorAll('.wm-btn-bulk').forEach(btn => {
                btn.classList.remove('wm-btn-bulk-active');
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
            });
        });

        const bulkPageBtn = document.getElementById('wm-bulk-page-btn');
        if (bulkPageBtn) {
            bulkPageBtn.addEventListener('click', async () => {
                const btn = document.getElementById('wm-bulk-page-btn');
                if (!btn || btn.disabled) return;

                const cardsEl = document.querySelectorAll('.w-72, div.rounded-2xl.overflow-hidden.relative');
                if (cardsEl.length === 0) return;

                const bulkList = window.getBulkList();
                const bulkMap = new Map();
                bulkList.forEach(item => {
                    if (typeof item === 'object' && (item.user_card_id || item.userCardId) && item.title) {
                        const t = item.title.replace(/\s+/g, ' ').trim();
                        if (!bulkMap.has(t)) bulkMap.set(t, []);
                        bulkMap.get(t).push(item.user_card_id || item.userCardId);
                    }
                });

                const pageUserCardIds = [];
                cardsEl.forEach(card => {
                    const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
                    if (titleEl) {
                        const title = titleEl.textContent.replace(/\s+/g, ' ').trim();
                        const availableIds = bulkMap.get(title);
                        if (availableIds && availableIds.length > 0) pageUserCardIds.push(availableIds.shift());
                    }
                });

                if (pageUserCardIds.length === 0) {
                    window.logToPanel(`❌ Erreur: Impossible de faire correspondre les cartes à l'écran avec le cache Bulk.`);
                    return;
                }

                if (!confirm(`🔥 SÉCURITÉ : Défausser définitivement ces ${pageUserCardIds.length} cartes visibles ?`)) return;

                window.logToPanel(`🚀 Bulk Delete (Page) : ${pageUserCardIds.length} cartes...`);
                btn.disabled = true;
                btn.textContent = "⏳ Exécution...";

                const result = await window.executeBulkDiscard(pageUserCardIds);

                if (result && result.success !== false) {
                    const failedIds = new Set((result.failed || []).map(f => f.card_id || f.id));

                    if (failedIds.size > 0) {
                        window.logToPanel(`⚠️ Partiel : ${result.count} défaussées, ${failedIds.size} erreurs.`);
                        window.showWMToast(`${result.count} défaussées, ${failedIds.size} erreurs !`, false);
                    } else {
                        window.logToPanel(`✅ Succès : ${result.count} défaussées (solde : ${result.balance ?? '?'} WB)`);
                        window.showWMToast(`Page défaussée ! +${result.count} WB`, true);
                    }

                    const newBulkList = bulkList.filter(item => {
                        const uId = typeof item === 'object' ? (item.user_card_id || item.userCardId) : null;
                        if (uId) {
                            const wasInBatch = pageUserCardIds.includes(uId);
                            const hasFailed = failedIds.has(uId);
                            if (wasInBatch && !hasFailed) return false;
                        }
                        return true;
                    });

                    window.saveBulkList(newBulkList);
                    if (typeof result.balance === 'number') window.recordBalance(result.balance, 'bulk_discard');

                    const searchInput = document.querySelector('input[placeholder*="titre"]');
                    if (searchInput) searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    window.logToPanel(`❌ Échec API lors de la défausse de la page.`);
                    window.showWMToast("Erreur API lors de la défausse.", false);
                }

                if (typeof window.updateBulkUI === 'function') window.updateBulkUI();
                if (typeof window.updateAllBulkButtonsUI === 'function') window.updateAllBulkButtonsUI();

                setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = "🔥 Défausser la page"; } }, 500);
            });
        }

        const bulkCleanBtn = document.getElementById('wm-bulk-clean-btn');
        if (bulkCleanBtn) {
            bulkCleanBtn.addEventListener('click', async () => {
                bulkCleanBtn.disabled = true;
                bulkCleanBtn.textContent = '⏳ Scan...';
                try {
                    if (typeof window.wmCleanBulkList === 'function') {
                        await window.wmCleanBulkList();
                    }
                } finally {
                    bulkCleanBtn.disabled = false;
                    bulkCleanBtn.textContent = '🧹 Nettoyer';
                }
            });
        }

        const bulkExecBtn = document.getElementById('wm-bulk-exec-btn');
        bulkExecBtn.addEventListener('click', async () => {
            // Si une défausse est déjà en cours, sert de bouton Arrêter
            if (window._wmBulkDiscardRunning) {
                window._wmCancelBulkDiscard = true;
                bulkExecBtn.textContent = "⏳ Arrêt...";
                bulkExecBtn.disabled = true;
                window.logToPanel("⏹️ Demande d'arrêt de la défausse...");
                return;
            }

            const list = window.getBulkList();
            if (list.length === 0) return;

            // SÉCURITÉ DE CONFIRMATION
            if (!confirm(`🔥 SÉCURITÉ : Défausser définitivement TOUT le bulk (${list.length} cartes) ?\n\n⚠️ Cette action est irréversible et supprimera toutes ces cartes de votre compte.`)) {
                return;
            }

            window._wmBulkDiscardRunning = true;
            window._wmCancelBulkDiscard = false;
            bulkExecBtn.textContent = "⏹️ Arrêter";
            bulkExecBtn.classList.remove('danger');
            bulkExecBtn.style.background = "#e11d48";
            bulkExecBtn.style.color = "#ffffff";

            window.logToPanel(`🚀 Lancement Bulk Delete (${list.length} cartes)...`);

            const readyToDelete = [];
            const remainingList = [];
            let resolvedFromIndex = 0;
            let resolvedFromApi = 0;

            try {
                // ---- Phase 1 : résolution des user_card_id ----
                for (const item of list) {
                    if (window._wmCancelBulkDiscard) break;

                    const title = typeof item === 'string' ? item : item.title;
                    const cardId = typeof item === 'object' ? item.id : null;
                    let userCardId = typeof item === 'object' ? (item.user_card_id || item.userCardId) : null;

                    // Si déjà résolu (ajouté avec succès via toggleBulkForCard ou pack)
                    if (userCardId) {
                        readyToDelete.push({ title, userCardId, cardId });
                        resolvedFromIndex++;
                        continue;
                    }

                    // Sinon, tente la résolution
                    userCardId = await window.wmResolveUserCardId(cardId, title);

                    if (userCardId) {
                        readyToDelete.push({ title, userCardId, cardId });
                        resolvedFromApi++;
                    } else {
                        window.logToPanel(`⚠️ "${title}" — impossible de résoudre user_card_id`);
                        remainingList.push({ title, id: cardId, userCardId: null });
                    }
                }

                window.logToPanel(`🔎 Résolution : ${resolvedFromIndex} depuis l'index, ${resolvedFromApi} via API, ${remainingList.length} échecs`);

                // ---- Phase 2 : appel bulk delete ----
                if (readyToDelete.length > 0 && !window._wmCancelBulkDiscard) {
                    window.logToPanel(`[API] ⚡ Exécution globale (${readyToDelete.length} cartes)...`);
                    const userCardIds = readyToDelete.map(item => item.userCardId);
                    const result = await window.executeBulkDiscard(userCardIds);

                    if (result && result.success) {
                        window.logToPanel(`✅ Succès : ${result.count} défaussées (solde : ${result.balance ?? '?'} WB)`);
                        window.showWMToast(`Suppression terminée ! +${result.count} WB`, true);

                        for (const item of readyToDelete) {
                            window.markCardAsProcessedByTitle(item.title);
                            if (typeof window.userCardIdCache !== 'undefined') window.userCardIdCache.delete(item.title);
                            if (window.wmInventoryMap) delete window.wmInventoryMap[item.title];
                        }

                        // Met à jour le solde si dispo
                        if (typeof result.balance === 'number') {
                            window.recordBalance(result.balance, 'bulk_discard');
                        }
                    } else {
                        window.logToPanel(`[API] ❌ Échec de la requête (status ${result?.status || 'inconnu'})`);
                        window.showWMToast("Erreur API lors de la défausse groupée.", false);
                    }
                } else if (!window._wmCancelBulkDiscard) {
                    window.logToPanel(`❌ Aucune carte valide prête à être défaussée.`);
                }
            } finally {
                window._wmBulkDiscardRunning = false;
                window._wmCancelBulkDiscard = false;
                bulkExecBtn.textContent = "Tout Défausser";
                bulkExecBtn.classList.add('danger');
                bulkExecBtn.style.background = "";
                bulkExecBtn.style.color = "";
                bulkExecBtn.disabled = false;

                // ---- Phase 3 : rafraîchissement ----
                if (typeof window.updateBulkUI === 'function') window.updateBulkUI();
                if (typeof window.updateAllBulkButtonsUI === 'function') window.updateAllBulkButtonsUI();
                const curLeft = window.getBulkList();
                window.logToPanel(`🏁 Bulk terminé. ${curLeft.length} restante(s).`);

                const searchInput = document.querySelector('input[placeholder*="titre"], input[placeholder*="echerche"], input[type="search"]');
                if (searchInput && searchInput.value.includes('[WM-BULK]')) {
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
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
        if (scanBtn) scanBtn.addEventListener('click', () => window.runPriceScan());
        if (scanCancelBtn) scanCancelBtn.addEventListener('click', () => {
            if (window.wmScanState.running) {
                window.wmScanState.cancelled = true;
                window.logToPanel('⏹️ Demande d\'annulation envoyée...');
            }
        });

        // Rendu des Patch Notes
        function renderPatchNotes() {
            const container = document.getElementById('wm-patch-notes-list');
            if (!container) return;

            // Le tableau est parcouru dans l'ordre (le plus récent en premier si tu les ajoutes en haut du tableau WM_PATCH_NOTES)
            container.innerHTML = window.WM_PATCH_NOTES.map(pn => `
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
        window.renderPatchNotes = renderPatchNotes;
        window.WikiM.renderPatchNotes = renderPatchNotes;

        // Initialisation des sous-modules
        if (typeof window.initSmartTradesUI === 'function') window.initSmartTradesUI();
        if (typeof window.initTagGroupsUI === 'function') window.initTagGroupsUI();


        //ControlPanel fin
        if (typeof window.renderSmartTradesList === 'function') window.renderSmartTradesList();
        renderPatchNotes();
        window.initTagsTab();
        window.updateBulkUI();
        window.renderTrackedAuctions();
        window.updateTrackBadge();
        window.renderBalanceUI();
        window.logToPanel("V2.0.0 Démarrée.");
    }


    // --- Cross-module exports ---
    window.setActiveTab = WikiM.setActiveTab = setActiveTab;
    window.createControlPanel = WikiM.createControlPanel = createControlPanel;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
