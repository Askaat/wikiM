// ============================================================
// WikiM - Module: Sniper & Auction Reminders
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // SNIPER — CONFIGURATION (par enchère)
    // ============================================================
    const SNIPER_PER_AUCTION_KEY = 'wmSniperPerAuction';

    /**
     * Structure : { [auctionId]: { maxBid, trigger, step, enabled } }
     *   maxBid  : plafond de dépense (WB)
     *   trigger : secondes restantes pour commencer à surveiller (ex: 20)
     *   step    : intervalle de re-vérification en secondes (ex: 3)
     *   enabled : sniper actif sur cette enchère
     */
    function getAllSniperConfigs() {
        try { return JSON.parse(localStorage.getItem(SNIPER_PER_AUCTION_KEY) || '{}'); }
        catch { return {}; }
    }
    function saveAllSniperConfigs(cfgs) {
        localStorage.setItem(SNIPER_PER_AUCTION_KEY, JSON.stringify(cfgs));
    }
    function getSniperConfigFor(auctionId) {
        if (!auctionId) return null;
        const all = getAllSniperConfigs();
        return all[auctionId] || { maxBid: 100, trigger: 20, step: 3, enabled: false };
    }
    function setSniperConfigFor(auctionId, patch) {
        if (!auctionId) return;
        const all = getAllSniperConfigs();
        const current = all[auctionId] || { maxBid: 100, trigger: 20, step: 3, enabled: false };
        all[auctionId] = { ...current, ...patch };
        saveAllSniperConfigs(all);
    }

    // État runtime par enchère
    const sniperRuntime = {};
    function getSniperRuntime(auctionId) {
        if (!sniperRuntime[auctionId]) {
            sniperRuntime[auctionId] = {
                lastBidAt: 0,
                lastCheckAt: 0,
                inFlight: false,
                lastStatus: 'idle',
                bidCount: 0
            };
        }
        return sniperRuntime[auctionId];
    }

    /** Formule officielle du site : max(ceil(1.1 * current_bid), current_bid + 1) */
    function getMinBid(auction) {
        if (auction.current_bid === null || auction.current_bid === undefined) {
            return auction.base_amount;
        }
        return Math.max(Math.ceil(1.1 * auction.current_bid), auction.current_bid + 1);
    }

    /** POST direct sur la route de mise. */
    async function placeBid(auctionId, amount) {
        try {
            const r = await fetch(`/api/marketplace/${auctionId}/bid`, {
                method: 'POST',
                headers: {
                    'Accept': '*/*',
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ amount })
            });
            let data = null;
            try { data = await r.json(); } catch {}
            if (!r.ok) {
                return { ok: false, data: null, error: (data && data.error) || `HTTP ${r.status}` };
            }
            return { ok: true, data, error: null };
        } catch (e) {
            return { ok: false, data: null, error: e.message || 'network error' };
        }
    }

    // ============================================================
    // SNIPER — UI IN-PAGE
    // ============================================================

    function injectSniperPanel() {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        // Retire l'ancien panneau (au cas où on change d'enchère sans recharger)
        const old = document.getElementById('wm-sniper-panel');
        if (old) old.remove();

        const cfg = getSniperConfigFor(auctionId);

                // Trouve le <h2> "Historique des mises"
        const h2Hist = Array.from(document.querySelectorAll('h2')).find(h =>
            /historique\s+des\s+mises/i.test(h.textContent || '')
        );

        // Si on ne trouve pas le h2, on abandonne (ne devrait pas arriver sur cette page)
        if (!h2Hist) {
            console.warn('[WM-Sniper] Impossible de trouver "Historique des mises"');
            return;
        }

        // Le parent du h2 contient h2 + ul (le bloc "Historique")
        // Le grand-parent (avec max-w-4xl) contient tout le contenu de la page d'enchère
        // On veut insérer le panneau APRÈS le bloc Historique, dans le grand-parent
        const historiqueBlock = h2Hist.parentElement;
        const contentContainer = historiqueBlock.parentElement;

        if (!contentContainer) {
            console.warn('[WM-Sniper] Parent introuvable');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'wm-sniper-panel';
        panel.className = 'wm-sniper-panel';
        panel.dataset.auctionId = auctionId;
        panel.innerHTML = `
            <div class="wm-sniper-header">
                <span class="wm-sniper-title">🎯 Sniper d'enchère</span>
                <label class="wm-sniper-toggle">
                    <input type="checkbox" id="wm-sniper-enabled" ${cfg.enabled ? 'checked' : ''}>
                    <span>Activer</span>
                </label>
            </div>
            <div class="wm-sniper-body">
                <div class="wm-sniper-row">
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-max">Mise max (WB)</label>
                        <input type="number" id="wm-sniper-max" min="1" step="1" value="${cfg.maxBid}" disabled>
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-trigger">Trigger (s)</label>
                        <input type="number" id="wm-sniper-trigger" min="1" max="600" step="1" value="${cfg.trigger}" disabled>
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-step">Pas (s)</label>
                        <input type="number" id="wm-sniper-step" min="1" max="60" step="1" value="${cfg.step}" disabled>
                    </div>
                </div>
                <div class="wm-sniper-status" id="wm-sniper-status">
                    <span class="wm-sniper-status-dot" id="wm-sniper-dot"></span>
                    <span id="wm-sniper-status-text">Inactif</span>
                </div>
                <div class="wm-sniper-meta" id="wm-sniper-meta"></div>
            </div>
        `;

        // Insertion APRÈS le bloc Historique, dans le conteneur max-w-4xl
        contentContainer.insertBefore(panel, historiqueBlock.nextSibling);

        document.getElementById('wm-sniper-enabled').addEventListener('change', async e => {
            if (e.target.checked) {
                const auction = await fetchAuctionDetails(auctionId);
                if (auction) {
                    setSniperConfigFor(auctionId, { enabled: true, endAt: auction.end_at });
                } else {
                    setSniperConfigFor(auctionId, { enabled: true });
                }
            } else {
                setSniperConfigFor(auctionId, { enabled: false });
            }

            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            rt.lastStatus = e.target.checked ? 'waiting' : 'idle';
            updateSniperStatusUI();
            logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${auctionId.slice(0, 8)}`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-max').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { maxBid: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Mise max : ${v} WB`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-trigger').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { trigger: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Trigger : ${v}s`);
            renderTrackedAuctions();
        });
        document.getElementById('wm-sniper-step').addEventListener('change', e => {
            const v = Math.max(1, parseInt(e.target.value, 10) || 1);
            e.target.value = v;
            setSniperConfigFor(auctionId, { step: v });
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            logToPanel(`🎯 Pas : ${v}s`);
            renderTrackedAuctions();
        });

        updateSniperStatusUI();
    }

    /** Synchronise les inputs du panneau in-page avec la config en localStorage. */
    function syncSniperPanelFromConfig() {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        const panel = document.getElementById('wm-sniper-panel');
        if (!panel) return;
        const cfg = getSniperConfigFor(auctionId);

        const enabledEl = document.getElementById('wm-sniper-enabled');
        const maxEl = document.getElementById('wm-sniper-max');
        const trigEl = document.getElementById('wm-sniper-trigger');
        const stepEl = document.getElementById('wm-sniper-step');
        if (enabledEl && enabledEl.checked !== cfg.enabled) enabledEl.checked = cfg.enabled;
        if (maxEl && parseInt(maxEl.value, 10) !== cfg.maxBid) maxEl.value = cfg.maxBid;
        if (trigEl && parseInt(trigEl.value, 10) !== cfg.trigger) trigEl.value = cfg.trigger;
        if (stepEl && parseInt(stepEl.value, 10) !== cfg.step) stepEl.value = cfg.step;
    }

    function updateSniperStatusUI() {
        const statusText = document.getElementById('wm-sniper-status-text');
        const dot = document.getElementById('wm-sniper-dot');
        const meta = document.getElementById('wm-sniper-meta');
        if (!statusText || !dot) return;

        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;
        const cfg = getSniperConfigFor(auctionId);
        const rt = getSniperRuntime(auctionId);

        let label = 'Inactif';
        let color = '#6b7280';

        if (cfg.enabled) {
            switch (rt.lastStatus) {
                case 'waiting':
                    label = `En attente (déclenche à ${cfg.trigger}s)`;
                    color = '#fbbf24';
                    break;
                case 'watching':
                    label = 'Surveillance active';
                    color = '#10b981';
                    break;
                case 'leader':
                    label = 'Tu es meneur ✓';
                    color = '#10b981';
                    break;
                case 'bidding':
                    label = 'Mise en cours...';
                    color = '#3b82f6';
                    break;
                case 'max_reached':
                    label = `Mise max atteinte (${cfg.maxBid} WB)`;
                    color = '#ef4444';
                    break;
                case 'error':
                    label = 'Erreur';
                    color = '#ef4444';
                    break;
                default:
                    label = 'Actif';
                    color = '#10b981';
            }
        }

        statusText.textContent = label;
        dot.style.background = color;

        if (meta) {
            meta.textContent = `Mises effectuées : ${rt.bidCount}${rt.lastBidAt ? ' • dernière ' + new Date(rt.lastBidAt).toLocaleTimeString('fr-FR') : ''}`;
        }
    }

    // ============================================================
    // SNIPER — BOUCLE PRINCIPALE
    // ============================================================
    setInterval(async () => {
        const auctionId = getAuctionIdFromUrl();
        if (!auctionId) return;

        const cfg = getSniperConfigFor(auctionId);
        if (!cfg || !cfg.enabled || !cfg.endAt) return;

        const rt = getSniperRuntime(auctionId);
        if (rt.inFlight) return;

        const endMs = new Date(cfg.endAt).getTime();
        const secondsLeft = Math.floor((endMs - Date.now()) / 1000);

        // AVANT LE TRIGGER → aucune requête, on attend
        if (secondsLeft > cfg.trigger) {
            if (rt.lastStatus !== 'waiting') {
                rt.lastStatus = 'waiting';
                updateSniperStatusUI();
            }
            return;
        }

        if (secondsLeft <= 0) {
            if (rt.lastStatus !== 'idle') {
                rt.lastStatus = 'idle';
                updateSniperStatusUI();
            }
            return;
        }

        // DANS LA FENÊTRE DE TIR → on fetch + on agit
        const now = Date.now();
        if (now - rt.lastCheckAt < cfg.step * 1000) return;
        rt.lastCheckAt = now;

        const auction = await fetchAuctionDetails(auctionId);
        if (!auction || auction.status !== 'active') {
             const fresh = await fetchAuctionDetails(auctionId);
             if (fresh && fresh.end_at) {
                 setSniperConfigFor(auctionId, { endAt: fresh.end_at });
             }
             return;
        }

        if (auction.end_at !== cfg.endAt) {
            setSniperConfigFor(auctionId, { endAt: auction.end_at });
        }

        const myUserId = W.wmAuth.userId;
        if (!myUserId) {
            rt.lastStatus = 'error';
            updateSniperStatusUI();
            return;
        }

        const isLeader = auction.current_bidder_id === myUserId;
        if (isLeader) {
            rt.lastStatus = 'leader';
            updateSniperStatusUI();
            return;
        }

        const minBid = getMinBid(auction);
        if (minBid > cfg.maxBid) {
            rt.lastStatus = 'max_reached';
            updateSniperStatusUI();
            logToPanel(`🎯 Sniper STOP : mise min ${minBid} > max ${cfg.maxBid}`);
            return;
        }

        if (now - rt.lastBidAt < 2000) return;

        rt.inFlight = true;
        rt.lastStatus = 'bidding';
        updateSniperStatusUI();
        logToPanel(`🎯 SNIPE à ${secondsLeft}s : mise ${minBid} WB`);

        const result = await placeBid(auctionId, minBid);
        rt.inFlight = false;

        if (result.ok) {
            rt.lastBidAt = Date.now();
            rt.bidCount++;
            logToPanel(`✅ Mise acceptée : ${minBid} WB (total: ${rt.bidCount})`);
            if (result.data && typeof result.data.bidder_balance === 'number') {
                recordBalance(result.data.bidder_balance, 'bid');
            }
            rt.lastStatus = 'watching';

            setTimeout(async () => {
                const updatedAuction = await fetchAuctionDetails(auctionId);
                if (updatedAuction && updatedAuction.end_at !== cfg.endAt) {
                    setSniperConfigFor(auctionId, { endAt: updatedAuction.end_at });
                }
            }, 500);

        } else {
            logToPanel(`❌ Mise refusée : ${result.error}`);
            rt.lastStatus = 'error';
        }
        updateSniperStatusUI();
    }, 1000);

    // ============================================================
    // PRÉFÉRENCES ET RAPPELS
    // ============================================================
    const DEFAULT_PREFS = {
        browser: true, toast: true, sound: false, siteNotifs: true,
        refreshInterval: 30, defaultTriggerBefore: 60
    };
    function getPrefs() {
        try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('wmNotifPrefs') || '{}') }; }
        catch { return { ...DEFAULT_PREFS }; }
    }
    function savePrefs(p) { localStorage.setItem('wmNotifPrefs', JSON.stringify(p)); }
    function getReminders() {
        try { return JSON.parse(localStorage.getItem('wmAuctionReminders') || '{}'); } catch { return {}; }
    }
    function saveReminders(r) { localStorage.setItem('wmAuctionReminders', JSON.stringify(r)); }
    function getBulkList() {
        try { return JSON.parse(localStorage.getItem('wmBulkList') || '[]'); } catch(e) { return []; }
    }
    function saveBulkList(list) { localStorage.setItem('wmBulkList', JSON.stringify(list)); }

    function getMenuPosition() {
        try { return JSON.parse(localStorage.getItem('wmMenuPosition') || 'null'); }
        catch { return null; }
    }
    function saveMenuPosition(pos) {
        localStorage.setItem('wmMenuPosition', JSON.stringify(pos));
    }

    // ============================================================
    // RAPPELS ENCHÈRES
    // ============================================================
    function addReminder({ auctionId, cardTitle, endAt, triggerBefore, channels }) {
        const reminders = getReminders();
        reminders[auctionId] = { auctionId, cardTitle, endAt, triggerBefore, channels, createdAt: Date.now(), fired: false };
        saveReminders(reminders);
        logToPanel(`🔔 Rappel ajouté : "${cardTitle}" à ${triggerBefore}s de la fin.`);
        renderTrackedAuctions();
        updateTrackBadge();
    }

    function removeReminder(auctionId) {
        const reminders = getReminders();
        delete reminders[auctionId];
        saveReminders(reminders);
        const toast = document.getElementById('wm-toast-' + auctionId);
        if (toast) toast.remove();
        // Nettoie aussi la config sniper associée
        const all = getAllSniperConfigs();
        if (all[auctionId]) {
            delete all[auctionId];
            saveAllSniperConfigs(all);
        }
        renderTrackedAuctions();
        updateTrackBadge();
    }

    function updateTrackBadge() {
        const reminders = getReminders();
        const count = Object.keys(reminders).length;
        const badge = document.querySelector('#wm-floating-toggle .wm-badge');
        if (badge) {
            if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.classList.add('show'); }
            else badge.classList.remove('show');
        }
        const tabBadge = document.querySelector('.wm-tab[data-tab="tracked"] .wm-tab-badge');
        if (tabBadge) {
            if (count > 0) { tabBadge.textContent = count > 99 ? '99+' : count; tabBadge.classList.add('show'); }
            else tabBadge.classList.remove('show');
        }
    }

    // ============================================================
    // BOUTON SUIVRE (page enchère)
    // ============================================================
    function getAuctionIdFromUrl() {
        const m = window.location.pathname.match(/\/marketplace\/([a-f0-9-]+)/i);
        return m ? m[1] : null;
    }

    async function fetchAuctionDetails(auctionId) {
        try {
            const r = await fetch(`/api/marketplace/${auctionId}`, { credentials: 'include' });
            if (!r.ok) return null;
            const data = await r.json();
            return data.auction || null;
        } catch(e) { return null; }
    }

    let lastTrackBtnAuctionId = null;
    function ensureTrackButton() {
        const auctionId = getAuctionIdFromUrl();
        const existingBtn = document.getElementById('wm-track-btn');

        if (!auctionId) {
            if (existingBtn) existingBtn.remove();
            lastTrackBtnAuctionId = null;
            return;
        }

        if (existingBtn && lastTrackBtnAuctionId === auctionId) return;

        if (existingBtn) existingBtn.remove();
        lastTrackBtnAuctionId = auctionId;

        const reminders = getReminders();
        const isTracked = !!reminders[auctionId];

        const btn = document.createElement('button');
        btn.id = 'wm-track-btn';
        if (isTracked) btn.classList.add('tracked');
        btn.innerHTML = isTracked ? '<span>🔕</span> Ne plus suivre' : '<span>🔔</span> Suivre cette enchère';
        btn.title = isTracked ? 'Retirer le rappel' : 'Ajouter un rappel';

        btn.addEventListener('click', async () => {
            const rems = getReminders();
            if (rems[auctionId]) {
                removeReminder(auctionId);
                btn.classList.remove('tracked');
                btn.innerHTML = '<span>🔔</span> Suivre cette enchère';
            } else {
                // Fetch uniquement au moment de l'action
                const auction = await fetchAuctionDetails(auctionId);
                if (!auction) {
                    logToPanel('❌ Impossible de récupérer les détails de l\'enchère');
                    return;
                }
                openTrackModal(auction);
            }
        });

        document.body.appendChild(btn);
    }

    function openTrackModal(auction) {
        const prefs = getPrefs();
        const existing = document.getElementById('wm-track-modal-overlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'wm-track-modal-overlay';
        overlay.innerHTML = `
            <div id="wm-track-modal">
                <h3>🔔 Suivre cette enchère</h3>
                <div class="wm-subtitle">"${auction.card?.wikipedia_title || auction.card_id}"</div>
                <label class="wm-modal-label">Préviens-moi X secondes avant la fin</label>
                <input type="number" id="wm-trigger-input" value="${prefs.defaultTriggerBefore}" min="5" max="3600" step="5">
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-browser" ${prefs.browser ? 'checked' : ''}><label for="wm-opt-browser">Notification navigateur</label></div>
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-toast" ${prefs.toast ? 'checked' : ''}><label for="wm-opt-toast">Toast in-page</label></div>
                <div class="wm-checkbox-row"><input type="checkbox" id="wm-opt-sound" ${prefs.sound ? 'checked' : ''}><label for="wm-opt-sound">Son</label></div>
                <div class="wm-modal-actions">
                    <button class="wm-modal-btn cancel">Annuler</button>
                    <button class="wm-modal-btn confirm">Suivre</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const closeModal = () => overlay.remove();
        overlay.querySelector('.cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        overlay.querySelector('.confirm').addEventListener('click', () => {
            const triggerBefore = parseInt(overlay.querySelector('#wm-trigger-input').value, 10) || prefs.defaultTriggerBefore;
            const channels = {
                browser: overlay.querySelector('#wm-opt-browser').checked,
                toast: overlay.querySelector('#wm-opt-toast').checked,
                sound: overlay.querySelector('#wm-opt-sound').checked
            };
            addReminder({
                auctionId: auction.id,
                cardTitle: auction.card?.wikipedia_title || auction.card_id,
                endAt: auction.end_at,
                triggerBefore, channels
            });
            closeModal();
            const btn = document.getElementById('wm-track-btn');
            if (btn) { btn.classList.add('tracked'); btn.innerHTML = '<span>🔕</span> Ne plus suivre'; }
        });
    }

    // ============================================================
    // PANNEAU ENCHÈRES SUIVIES
    // ============================================================
    function renderTrackedAuctions() {
        const container = document.getElementById('wm-tracked-list');
        if (!container) return;
        const reminders = getReminders();
        const entries = Object.values(reminders).sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());
        if (entries.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucune enchère suivie.<br>Va sur une enchère et clique sur "🔔 Suivre"</div>';
            return;
        }
        container.innerHTML = entries.map(rem => {
            const secondsLeft = Math.floor((new Date(rem.endAt).getTime() - Date.now()) / 1000);
            const urgent = secondsLeft > 0 && secondsLeft <= rem.triggerBefore;
            const expired = secondsLeft <= 0;
            const cfg = getSniperConfigFor(rem.auctionId);
            return `
                <div class="wm-tracked-item" data-id="${rem.auctionId}">
                    <div class="wm-tracked-header">
                        <span class="wm-tracked-title" title="${rem.cardTitle}">${rem.cardTitle}</span>
                        <span class="wm-tracked-timer ${urgent ? 'urgent' : ''}" data-end="${rem.endAt}" data-id="${rem.auctionId}">
                            ${expired ? 'Terminée' : formatSec(secondsLeft)}
                        </span>
                    </div>
                    <div class="wm-tracked-info">
                        <span>🔔 ${rem.triggerBefore}s avant</span>
                    </div>
                    <div class="wm-tracked-actions">
                        <button class="wm-tracked-btn" data-action="view" data-id="${rem.auctionId}">Voir</button>
                        <button class="wm-tracked-btn danger" data-action="remove" data-id="${rem.auctionId}">Annuler</button>
                    </div>
                    <div class="wm-tracked-sniper">
                        <label class="wm-sniper-mini-toggle" title="Activer le sniper sur cette enchère">
                            <input type="checkbox" data-action="sniper-toggle" data-id="${rem.auctionId}" ${cfg.enabled ? 'checked' : ''}>
                            <span>Sniper</span>
                        </label>
                        <span class="wm-sniper-mini-info">Max ${cfg.maxBid} WB • ${cfg.trigger}s / ${cfg.step}s</span>
                        <button class="wm-tracked-btn wm-sniper-mini-edit" data-action="sniper-edit" data-id="${rem.auctionId}" title="Modifier les paramètres">⚙️</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind listeners
        container.querySelectorAll('[data-action]').forEach(el => {
            if (el.tagName === 'INPUT') {
                el.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    if (e.target.checked) {
                         const auction = await fetchAuctionDetails(id);
                         if (auction) {
                             setSniperConfigFor(id, { enabled: true, endAt: auction.end_at });
                         } else {
                             setSniperConfigFor(id, { enabled: true });
                         }
                    } else {
                         setSniperConfigFor(id, { enabled: false });
                    }

                    logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${id.slice(0, 8)}`);
                    const currentAuctionId = getAuctionIdFromUrl();
                    if (currentAuctionId === id) syncSniperPanelFromConfig();
                });
            } else {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.dataset.id;
                    const action = el.dataset.action;
                    if (action === 'view') window.location.href = `/marketplace/${id}`;
                    else if (action === 'remove') removeReminder(id);
                    else if (action === 'sniper-edit') openSniperEditModal(id);
                });
            }
        });
    }

    /** Ouvre une popup pour modifier la config sniper d'une enchère depuis l'onglet Suivi. */
    function openSniperEditModal(auctionId) {
        const cfg = getSniperConfigFor(auctionId);
        const existing = document.getElementById('wm-sniper-edit-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wm-sniper-edit-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border:1px solid rgba(99,102,241,0.3);border-radius:14px;padding:22px;max-width:420px;width:90%;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                <h3 style="margin:0 0 6px 0;font-size:17px;font-weight:700;">⚙️ Paramètres du sniper</h3>
                <div style="color:#94a3b8;font-size:12px;margin-bottom:18px;">Enchère ${auctionId.slice(0, 8)}…</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Mise max (WB)</label>
                        <input type="number" id="wm-sniper-edit-max" min="1" step="1" value="${cfg.maxBid}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <div style="flex:1;">
                            <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Trigger (s)</label>
                            <input type="number" id="wm-sniper-edit-trigger" min="1" step="1" value="${cfg.trigger}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                        </div>
                        <div style="flex:1;">
                            <label style="display:block;font-size:11px;font-weight:600;color:#cbd5e1;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Pas (s)</label>
                            <input type="number" id="wm-sniper-edit-step" min="1" step="1" value="${cfg.step}" style="width:100%;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.2);border-radius:8px;padding:10px;color:white;font-size:15px;outline:none;">
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">
                    <button id="wm-sniper-edit-cancel" style="padding:10px 18px;border-radius:8px;border:none;background:rgba(51,65,85,0.7);color:#cbd5e1;font-size:13px;font-weight:700;cursor:pointer;">Annuler</button>
                    <button id="wm-sniper-edit-save" style="padding:10px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;font-size:13px;font-weight:700;cursor:pointer;">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        document.getElementById('wm-sniper-edit-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        document.getElementById('wm-sniper-edit-save').addEventListener('click', () => {
            const maxBid = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-max').value, 10) || 1);
            const trigger = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-trigger').value, 10) || 1);
            const step = Math.max(1, parseInt(document.getElementById('wm-sniper-edit-step').value, 10) || 1);
            setSniperConfigFor(auctionId, { maxBid, trigger, step });
            logToPanel(`🎯 Config sniper mise à jour : max ${maxBid} WB, trigger ${trigger}s, pas ${step}s`);
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            const currentAuctionId = getAuctionIdFromUrl();
            if (currentAuctionId === auctionId) syncSniperPanelFromConfig();
            close();
            renderTrackedAuctions();
        });
    }

    setInterval(() => {
        document.querySelectorAll('.wm-tracked-timer').forEach(el => {
            const endAt = el.dataset.end;
            if (!endAt) return;
            const s = Math.floor((new Date(endAt).getTime() - Date.now()) / 1000);
            el.textContent = s > 0 ? formatSec(s) : 'Terminée';
        });
    }, 1000);

    setInterval(() => {
        const reminders = getReminders();
        const now = Date.now();
        let changed = false;
        for (const id of Object.keys(reminders)) {
            const rem = reminders[id];
            const endMs = new Date(rem.endAt).getTime();
            const secondsLeft = Math.floor((endMs - now) / 1000);
            if (!rem.fired && secondsLeft <= rem.triggerBefore && secondsLeft > 0) {
                const prefs = getPrefs();
                const ch = rem.channels || { browser: prefs.browser, toast: prefs.toast, sound: prefs.sound };
                const title = `Fin imminente — ${rem.cardTitle}`;
                const body = `Se termine dans ${formatSec(secondsLeft)}`;
                if (ch.browser && Notification.permission === 'granted') {
                    try {
                        const n = new Notification(title, { body, icon: 'https://www.wiki-masters.com/icon-192.png', tag: 'wm-auction-' + id });
                        n.onclick = () => { window.focus(); window.location.href = `/marketplace/${id}`; n.close(); };
                    } catch(e) {}
                }
                if (ch.toast) showToast({ title: 'Fin imminente', body: `"${rem.cardTitle}" arrive à échéance.`, auctionId: id, urgent: secondsLeft < 30, secondsLeft });
                if (ch.sound) playBeep();
                rem.fired = true; changed = true;
                logToPanel(`🔔 Rappel déclenché : ${rem.cardTitle} (${secondsLeft}s)`);
            }
            if (secondsLeft < -300) {
                delete reminders[id]; changed = true;
                const toast = document.getElementById('wm-toast-' + id);
                if (toast) toast.remove();
            }
        }
        if (changed) saveReminders(reminders);
        renderTrackedAuctions();
        updateTrackBadge();
    }, 5000);



    // --- Cross-module exports ---
    if (typeof getAllSniperConfigs !== 'undefined') { window.getAllSniperConfigs = getAllSniperConfigs; window.WikiM.getAllSniperConfigs = getAllSniperConfigs; }
    if (typeof saveAllSniperConfigs !== 'undefined') { window.saveAllSniperConfigs = saveAllSniperConfigs; window.WikiM.saveAllSniperConfigs = saveAllSniperConfigs; }
    if (typeof getSniperConfigFor !== 'undefined') { window.getSniperConfigFor = getSniperConfigFor; window.WikiM.getSniperConfigFor = getSniperConfigFor; }
    if (typeof setSniperConfigFor !== 'undefined') { window.setSniperConfigFor = setSniperConfigFor; window.WikiM.setSniperConfigFor = setSniperConfigFor; }
    if (typeof getSniperRuntime !== 'undefined') { window.getSniperRuntime = getSniperRuntime; window.WikiM.getSniperRuntime = getSniperRuntime; }
    if (typeof getMinBid !== 'undefined') { window.getMinBid = getMinBid; window.WikiM.getMinBid = getMinBid; }
    if (typeof placeBid !== 'undefined') { window.placeBid = placeBid; window.WikiM.placeBid = placeBid; }
    if (typeof injectSniperPanel !== 'undefined') { window.injectSniperPanel = injectSniperPanel; window.WikiM.injectSniperPanel = injectSniperPanel; }
    if (typeof syncSniperPanelFromConfig !== 'undefined') { window.syncSniperPanelFromConfig = syncSniperPanelFromConfig; window.WikiM.syncSniperPanelFromConfig = syncSniperPanelFromConfig; }
    if (typeof updateSniperStatusUI !== 'undefined') { window.updateSniperStatusUI = updateSniperStatusUI; window.WikiM.updateSniperStatusUI = updateSniperStatusUI; }
    if (typeof getPrefs !== 'undefined') { window.getPrefs = getPrefs; window.WikiM.getPrefs = getPrefs; }
    if (typeof savePrefs !== 'undefined') { window.savePrefs = savePrefs; window.WikiM.savePrefs = savePrefs; }
    if (typeof getReminders !== 'undefined') { window.getReminders = getReminders; window.WikiM.getReminders = getReminders; }
    if (typeof saveReminders !== 'undefined') { window.saveReminders = saveReminders; window.WikiM.saveReminders = saveReminders; }
    if (typeof getBulkList !== 'undefined') { window.getBulkList = getBulkList; window.WikiM.getBulkList = getBulkList; }
    if (typeof saveBulkList !== 'undefined') { window.saveBulkList = saveBulkList; window.WikiM.saveBulkList = saveBulkList; }
    if (typeof getMenuPosition !== 'undefined') { window.getMenuPosition = getMenuPosition; window.WikiM.getMenuPosition = getMenuPosition; }
    if (typeof saveMenuPosition !== 'undefined') { window.saveMenuPosition = saveMenuPosition; window.WikiM.saveMenuPosition = saveMenuPosition; }
    if (typeof addReminder !== 'undefined') { window.addReminder = addReminder; window.WikiM.addReminder = addReminder; }
    if (typeof removeReminder !== 'undefined') { window.removeReminder = removeReminder; window.WikiM.removeReminder = removeReminder; }
    if (typeof updateTrackBadge !== 'undefined') { window.updateTrackBadge = updateTrackBadge; window.WikiM.updateTrackBadge = updateTrackBadge; }
    if (typeof getAuctionIdFromUrl !== 'undefined') { window.getAuctionIdFromUrl = getAuctionIdFromUrl; window.WikiM.getAuctionIdFromUrl = getAuctionIdFromUrl; }
    if (typeof fetchAuctionDetails !== 'undefined') { window.fetchAuctionDetails = fetchAuctionDetails; window.WikiM.fetchAuctionDetails = fetchAuctionDetails; }
    if (typeof ensureTrackButton !== 'undefined') { window.ensureTrackButton = ensureTrackButton; window.WikiM.ensureTrackButton = ensureTrackButton; }
    if (typeof openTrackModal !== 'undefined') { window.openTrackModal = openTrackModal; window.WikiM.openTrackModal = openTrackModal; }
    if (typeof renderTrackedAuctions !== 'undefined') { window.renderTrackedAuctions = renderTrackedAuctions; window.WikiM.renderTrackedAuctions = renderTrackedAuctions; }
    if (typeof openSniperEditModal !== 'undefined') { window.openSniperEditModal = openSniperEditModal; window.WikiM.openSniperEditModal = openSniperEditModal; }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
