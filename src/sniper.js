// ============================================================
// WikiM - Module: Sniper & Auction Reminders
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // TIMER ANTI-BRIDAGE ARRIÈRE-PLAN (Web Worker)
    // ============================================================
    /**
     * Crée un intervalle piloté par un Web Worker pour éviter que le navigateur
     * ne ralentisse la boucle du sniper quand l'onglet est en arrière-plan.
     */
    function createUnthrottledInterval(callback, ms) {
        try {
            const blob = new Blob([
                `setInterval(() => postMessage('tick'), ${ms});`
            ], { type: 'application/javascript' });
            const worker = new Worker(URL.createObjectURL(blob));
            worker.onmessage = () => callback();
            return worker;
        } catch (e) {
            // Fallback classique si les Blob Workers sont bloqués par la CSP
            return setInterval(callback, ms);
        }
    }

    // ============================================================
    // SNIPER — CONFIGURATION (par enchère)
    // ============================================================
    const SNIPER_PER_AUCTION_KEY = 'wmSniperPerAuction';

    /**
     * Structure : { [auctionId]: { maxBid, trigger, step, enabled, endAt, bidCount, lastBidAt } }
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
        return {
            maxBid: 100,
            trigger: 20,
            step: 3,
            enabled: false,
            bidCount: 0,
            lastBidAt: 0,
            ...(all[auctionId] || {})
        };
    }
    function setSniperConfigFor(auctionId, patch) {
        if (!auctionId) return;
        const all = getAllSniperConfigs();
        const current = getSniperConfigFor(auctionId);
        all[auctionId] = { ...current, ...patch };
        saveAllSniperConfigs(all);
    }

    // État runtime par enchère (Sniper)
    const sniperRuntime = {};
    function getSniperRuntime(auctionId) {
        if (!sniperRuntime[auctionId]) {
            const cfg = getSniperConfigFor(auctionId);
            sniperRuntime[auctionId] = {
                lastBidAt: cfg ? (cfg.lastBidAt || 0) : 0,
                lastCheckAt: 0,
                inFlight: false,
                lastStatus: cfg && cfg.enabled ? 'waiting' : 'idle',
                bidCount: cfg ? (cfg.bidCount || 0) : 0,
                confirmedEnded: false
            };
        }
        return sniperRuntime[auctionId];
    }

    // État runtime pour le Last-Second Check des enchères suivies
    const trackedCheckRuntime = {};
    function getTrackedCheckState(auctionId) {
        if (!trackedCheckRuntime[auctionId]) {
            trackedCheckRuntime[auctionId] = {
                lastCheckAt: 0,
                inFlight: false,
                confirmedEnded: false
            };
        }
        return trackedCheckRuntime[auctionId];
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

        const old = document.getElementById('wm-sniper-panel');
        if (old) old.remove();

        const cfg = getSniperConfigFor(auctionId);

        const h2Hist = Array.from(document.querySelectorAll('h2')).find(h =>
            /historique\s+des\s+mises/i.test(h.textContent || '')
        );

        if (!h2Hist) {
            console.warn('[WM-Sniper] Impossible de trouver "Historique des mises"');
            return;
        }

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
                        <input type="number" id="wm-sniper-max" min="1" step="1" value="${cfg.maxBid}">
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-trigger">Trigger (s)</label>
                        <input type="number" id="wm-sniper-trigger" min="1" max="600" step="1" value="${cfg.trigger}">
                    </div>
                    <div class="wm-sniper-field">
                        <label for="wm-sniper-step">Pas (s)</label>
                        <input type="number" id="wm-sniper-step" min="1" max="60" step="1" value="${cfg.step}">
                    </div>
                </div>
                <div class="wm-sniper-status" id="wm-sniper-status">
                    <span class="wm-sniper-status-dot" id="wm-sniper-dot"></span>
                    <span id="wm-sniper-status-text">Inactif</span>
                </div>
                <div class="wm-sniper-meta" id="wm-sniper-meta"></div>
            </div>
        `;

        contentContainer.insertBefore(panel, historiqueBlock.nextSibling);

        document.getElementById('wm-sniper-enabled').addEventListener('change', async e => {
            const rt = getSniperRuntime(auctionId);
            rt.confirmedEnded = false;
            rt.lastCheckAt = 0;

            if (e.target.checked) {
                const auction = await fetchAuctionDetails(auctionId);
                if (auction) {
                    setSniperConfigFor(auctionId, { enabled: true, endAt: auction.end_at });
                } else {
                    setSniperConfigFor(auctionId, { enabled: true });
                }
                rt.lastStatus = 'waiting';
            } else {
                setSniperConfigFor(auctionId, { enabled: false });
                rt.lastStatus = 'idle';
            }

            updateSniperStatusUI();
            window.logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${auctionId.slice(0, 8)}`);
            renderTrackedAuctions();
        });

        const bindField = (inputId, propKey, minVal, maxVal, logLabel, unit) => {
            const el = document.getElementById(inputId);
            if (!el) return;

            const parseVal = (raw) => {
                let v = parseInt(raw, 10);
                if (isNaN(v) || v < minVal) v = minVal;
                if (maxVal && v > maxVal) v = maxVal;
                return v;
            };

            el.addEventListener('input', e => {
                const raw = parseInt(e.target.value, 10);
                if (!isNaN(raw) && raw >= minVal) {
                    const v = maxVal ? Math.min(maxVal, raw) : raw;
                    setSniperConfigFor(auctionId, { [propKey]: v });
                    updateSniperStatusUI();
                    renderTrackedAuctions();
                }
            });

            el.addEventListener('change', e => {
                const v = parseVal(e.target.value);
                e.target.value = v;
                setSniperConfigFor(auctionId, { [propKey]: v });
                const rt = getSniperRuntime(auctionId);
                rt.lastCheckAt = 0;
                rt.confirmedEnded = false;
                updateSniperStatusUI();
                window.logToPanel(`🎯 ${logLabel} : ${v}${unit}`);
                renderTrackedAuctions();
            });
        };

        bindField('wm-sniper-max', 'maxBid', 1, null, 'Mise max', ' WB');
        bindField('wm-sniper-trigger', 'trigger', 1, 600, 'Trigger', 's');
        bindField('wm-sniper-step', 'step', 1, 60, 'Pas', 's');

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
        if (maxEl && document.activeElement !== maxEl && parseInt(maxEl.value, 10) !== cfg.maxBid) maxEl.value = cfg.maxBid;
        if (trigEl && document.activeElement !== trigEl && parseInt(trigEl.value, 10) !== cfg.trigger) trigEl.value = cfg.trigger;
        if (stepEl && document.activeElement !== stepEl && parseInt(stepEl.value, 10) !== cfg.step) stepEl.value = cfg.step;

        updateSniperStatusUI();
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
                case 'ended':
                    label = 'Enchère terminée';
                    color = '#6b7280';
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

        const count = cfg.bidCount || rt.bidCount || 0;
        const lastAt = cfg.lastBidAt || rt.lastBidAt || 0;
        if (meta) {
            meta.textContent = `Mises effectuées : ${count}${lastAt ? ' • dernière ' + new Date(lastAt).toLocaleTimeString('fr-FR') : ''}`;
        }
    }

    // ============================================================
    // SNIPER — MOTEUR D'EXÉCUTION PAR ENCHÈRE
    // ============================================================
    async function tickSniperForAuction(auctionId) {
        let cfg = getSniperConfigFor(auctionId);
        if (!cfg || !cfg.enabled) return;

        const rt = getSniperRuntime(auctionId);
        if (rt.inFlight || rt.confirmedEnded) return;

        const now = Date.now();
        const isCurrentPage = getAuctionIdFromUrl() === auctionId;

        // 1. Si endAt est manquant en config, on va le chercher sur l'API
        if (!cfg.endAt) {
            if (now - rt.lastCheckAt < 3000) return;
            rt.lastCheckAt = now;
            const initAuction = await fetchAuctionDetails(auctionId);
            if (!initAuction || initAuction.status !== 'active') {
                rt.confirmedEnded = true;
                rt.lastStatus = 'ended';
                setSniperConfigFor(auctionId, { enabled: false, status: initAuction?.status || 'ended' });
                if (isCurrentPage) updateSniperStatusUI();
                return;
            }
            setSniperConfigFor(auctionId, { endAt: initAuction.end_at });
            cfg = getSniperConfigFor(auctionId);
        }

        const endMs = new Date(cfg.endAt).getTime();
        const secondsLeft = Math.floor((endMs - now) / 1000);

        // Si l'enchère est terminée depuis plus de 60s selon la date enregistrée
        if (cfg.endAt && !isNaN(endMs) && secondsLeft < -60) {
            rt.confirmedEnded = true;
            rt.lastStatus = 'ended';
            setSniperConfigFor(auctionId, { enabled: false, status: 'ended' });
            if (isCurrentPage) updateSniperStatusUI();
            return;
        }

        // 2. AVANT LE TRIGGER → aucune requête, on attend
        if (secondsLeft > cfg.trigger) {
            if (rt.lastStatus !== 'waiting') {
                rt.lastStatus = 'waiting';
                if (isCurrentPage) updateSniperStatusUI();
            }
            return;
        }

        // 3. CADENCE DYNAMIQUE : dans les 12 dernières secondes (ou si <= 0s non confirmé),
        // on force la vérification toutes les 1s pour ne jamais rater un snipe adverse.
        const effectiveStepMs = (secondsLeft <= 12 ? 1 : cfg.step) * 1000;
        if (now - rt.lastCheckAt < effectiveStepMs) return;
        rt.lastCheckAt = now;

        // 4. VÉRIFICATION SERVEUR
        const auction = await fetchAuctionDetails(auctionId);
        if (!auction) return;

        if (auction.status !== 'active') {
            rt.confirmedEnded = true;
            rt.lastStatus = 'ended';
            setSniperConfigFor(auctionId, { enabled: false, status: auction.status });
            if (isCurrentPage) updateSniperStatusUI();
            return;
        }

        // Si l'enchère a été prolongée par une mise récente, on synchronise tout
        if (auction.end_at && auction.end_at !== cfg.endAt) {
            setSniperConfigFor(auctionId, { endAt: auction.end_at });
            cfg = getSniperConfigFor(auctionId);
            const reminders = getReminders();
            if (reminders[auctionId]) {
                reminders[auctionId].endAt = auction.end_at;
                reminders[auctionId].fired = false;
                reminders[auctionId].confirmedEnded = false;
                saveReminders(reminders);
                renderTrackedAuctions();
            }
            window.logToPanel(`⏱️ Sniper : prolongation détectée jusqu'à ${new Date(auction.end_at).toLocaleTimeString('fr-FR')}`);
        }

        const realSecondsLeft = Math.floor((new Date(auction.end_at).getTime() - Date.now()) / 1000);
        if (realSecondsLeft > cfg.trigger) {
            rt.lastStatus = 'waiting';
            if (isCurrentPage) updateSniperStatusUI();
            return;
        }

        const myUserId = W.wmAuth && W.wmAuth.userId;
        if (!myUserId) {
            rt.lastStatus = 'error';
            if (isCurrentPage) updateSniperStatusUI();
            return;
        }

        // 5. Sommes-nous déjà meneur ?
        if (auction.current_bidder_id === myUserId) {
            rt.lastStatus = 'leader';
            if (isCurrentPage) updateSniperStatusUI();
            return;
        }

        // 6. Calcul de la mise minimale requise
        const minBid = getMinBid(auction);
        if (minBid > cfg.maxBid) {
            if (rt.lastStatus !== 'max_reached') {
                rt.lastStatus = 'max_reached';
                if (isCurrentPage) updateSniperStatusUI();
                window.logToPanel(`🎯 Sniper STOP : mise min ${minBid} > max ${cfg.maxBid}`);
            }
            return;
        }

        if (Date.now() - rt.lastBidAt < 1200) return;

        // 7. TIR DU SNIPER avec latence humaine (200ms à 350ms)
        rt.inFlight = true;
        rt.lastStatus = 'bidding';
        if (isCurrentPage) updateSniperStatusUI();

        try {
            const humanDelay = 200 + Math.floor(Math.random() * 150);
            await new Promise(resolve => setTimeout(resolve, humanDelay));

            window.logToPanel(`🎯 SNIPE à ${realSecondsLeft}s : mise ${minBid} WB (délai ${humanDelay}ms)`);
            const result = await placeBid(auctionId, minBid);

            if (result.ok) {
                const bidTime = Date.now();
                rt.lastBidAt = bidTime;
                rt.bidCount = (cfg.bidCount || rt.bidCount || 0) + 1;

                // Sauvegarde dans localStorage pour persister après un F5
                const newEndAt = (result.data && result.data.auction && result.data.auction.end_at)
                    ? result.data.auction.end_at
                    : cfg.endAt;
                setSniperConfigFor(auctionId, {
                    bidCount: rt.bidCount,
                    lastBidAt: bidTime,
                    endAt: newEndAt
                });

                window.logToPanel(`✅ Mise acceptée : ${minBid} WB (total: ${rt.bidCount})`);
                if (result.data && typeof result.data.bidder_balance === 'number') {
                    window.recordBalance(result.data.bidder_balance, 'bid');
                }
                rt.lastStatus = 'leader';

                // Re-vérification rapide de l'heure de fin après notre propre mise
                const updatedAuction = await fetchAuctionDetails(auctionId);
                if (updatedAuction && updatedAuction.end_at) {
                    setSniperConfigFor(auctionId, { endAt: updatedAuction.end_at });
                }
            } else {
                window.logToPanel(`❌ Mise refusée : ${result.error}`);
                rt.lastStatus = 'error';
            }
        } finally {
            rt.inFlight = false;
            if (isCurrentPage) updateSniperStatusUI();
        }
    }

    // Boucle principale pilotée par Web Worker (non bridée en arrière-plan)
    createUnthrottledInterval(() => {
        const allCfgs = getAllSniperConfigs();
        const currentUrlId = getAuctionIdFromUrl();

        // Exécute le sniper sur l'enchère de la page courante + toutes les enchères actives suivies
        const activeIds = new Set(
            Object.keys(allCfgs).filter(id => allCfgs[id] && allCfgs[id].enabled)
        );
        if (currentUrlId && allCfgs[currentUrlId]?.enabled) {
            activeIds.add(currentUrlId);
        }

        activeIds.forEach(id => {
            tickSniperForAuction(id);
        });
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
    // RAPPELS ENCHÈRES & ANTI-TIMER FANTÔME
    // ============================================================
    function addReminder({ auctionId, cardTitle, endAt, triggerBefore, channels }) {
        const reminders = getReminders();
        reminders[auctionId] = {
            auctionId,
            cardTitle,
            endAt,
            triggerBefore,
            channels,
            createdAt: Date.now(),
            fired: false,
            confirmedEnded: false
        };
        saveReminders(reminders);
        if (trackedCheckRuntime[auctionId]) {
            delete trackedCheckRuntime[auctionId];
        }
        window.logToPanel(`🔔 Rappel ajouté : "${cardTitle}" à ${triggerBefore}s de la fin.`);
        renderTrackedAuctions();
        updateTrackBadge();
    }

    function removeReminder(auctionId) {
        const reminders = getReminders();
        delete reminders[auctionId];
        saveReminders(reminders);
        if (trackedCheckRuntime[auctionId]) {
            delete trackedCheckRuntime[auctionId];
        }
        const toast = document.getElementById('wm-toast-' + auctionId);
        if (toast) toast.remove();

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

    /**
     * Vérification ciblée ("Last-Second Check") quand une enchère suivie arrive à < 15s ou 0s.
     */
    async function verifyTrackedAuctionEnd(auctionId) {
        const state = getTrackedCheckState(auctionId);
        const now = Date.now();
        if (state.inFlight || state.confirmedEnded) return;
        if (now - state.lastCheckAt < 5000) return;

        state.inFlight = true;
        state.lastCheckAt = now;

        try {
            const freshAuction = await fetchAuctionDetails(auctionId);
            if (!freshAuction) return;

            const reminders = getReminders();
            const rem = reminders[auctionId];
            if (!rem) return;

            const freshEndMs = new Date(freshAuction.end_at).getTime();
            const isStillActive = freshAuction.status === 'active' && freshEndMs > Date.now();

            if (isStillActive && freshAuction.end_at !== rem.endAt) {
                rem.endAt = freshAuction.end_at;
                rem.fired = false;
                rem.confirmedEnded = false;
                if (freshAuction.current_bid !== undefined) {
                    rem.lastBid = freshAuction.current_bid;
                }
                saveReminders(reminders);

                setSniperConfigFor(auctionId, { endAt: freshAuction.end_at });
                const rt = getSniperRuntime(auctionId);
                rt.confirmedEnded = false;

                const timerEl = document.querySelector(`.wm-tracked-timer[data-id="${auctionId}"]`);
                if (timerEl) {
                    timerEl.dataset.end = freshAuction.end_at;
                    const newSecLeft = Math.max(0, Math.floor((freshEndMs - Date.now()) / 1000));
                    timerEl.textContent = window.formatSec(newSecLeft);
                    timerEl.classList.toggle('urgent', newSecLeft > 0 && newSecLeft <= rem.triggerBefore);
                }

                const timeStr = new Date(freshAuction.end_at).toLocaleTimeString('fr-FR');
                window.logToPanel(`⏱️ Enchère prolongée jusqu'à ${timeStr} (${rem.cardTitle})`);
                renderTrackedAuctions();
            } else if (freshAuction.status !== 'active' || freshEndMs <= Date.now()) {
                state.confirmedEnded = true;
                rem.confirmedEnded = true;
                saveReminders(reminders);
                setSniperConfigFor(auctionId, { enabled: false, status: freshAuction.status });

                const timerEl = document.querySelector(`.wm-tracked-timer[data-id="${auctionId}"]`);
                if (timerEl) {
                    timerEl.textContent = 'Terminée';
                    timerEl.classList.remove('urgent');
                }
            }
        } finally {
            state.inFlight = false;
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

    window.lastTrackBtnAuctionId = window.lastTrackBtnAuctionId ?? null;
    function ensureTrackButton() {
        const auctionId = getAuctionIdFromUrl();
        const existingBtn = document.getElementById('wm-track-btn');

        if (!auctionId) {
            if (existingBtn) existingBtn.remove();
            window.lastTrackBtnAuctionId = null;
            return;
        }

        if (existingBtn && window.lastTrackBtnAuctionId === auctionId) return;

        if (existingBtn) existingBtn.remove();
        window.lastTrackBtnAuctionId = auctionId;

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
                const auction = await fetchAuctionDetails(auctionId);
                if (!auction) {
                    window.logToPanel('❌ Impossible de récupérer les détails de l\'enchère');
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
            const state = getTrackedCheckState(rem.auctionId);
            const isConfirmedEnded = rem.confirmedEnded || state.confirmedEnded;
            const cfg = getSniperConfigFor(rem.auctionId);

            let timerLabel = window.formatSec(secondsLeft);
            if (expired) {
                timerLabel = isConfirmedEnded ? 'Terminée' : 'Vérif...';
            }

            return `
                <div class="wm-tracked-item" data-id="${rem.auctionId}">
                    <div class="wm-tracked-header">
                        <span class="wm-tracked-title" title="${rem.cardTitle}">${rem.cardTitle}</span>
                        <span class="wm-tracked-timer ${urgent ? 'urgent' : ''}" data-end="${rem.endAt}" data-id="${rem.auctionId}">
                            ${timerLabel}
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

        container.querySelectorAll('[data-action]').forEach(el => {
            if (el.tagName === 'INPUT') {
                el.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const rt = getSniperRuntime(id);
                    rt.confirmedEnded = false;
                    rt.lastCheckAt = 0;

                    if (e.target.checked) {
                        const auction = await fetchAuctionDetails(id);
                        if (auction) {
                            setSniperConfigFor(id, { enabled: true, endAt: auction.end_at });
                        } else {
                            setSniperConfigFor(id, { enabled: true });
                        }
                        rt.lastStatus = 'waiting';
                    } else {
                        setSniperConfigFor(id, { enabled: false });
                        rt.lastStatus = 'idle';
                    }

                    window.logToPanel(`🎯 Sniper ${e.target.checked ? 'activé' : 'désactivé'} sur ${id.slice(0, 8)}`);
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
            window.logToPanel(`🎯 Config sniper mise à jour : max ${maxBid} WB, trigger ${trigger}s, pas ${step}s`);
            const rt = getSniperRuntime(auctionId);
            rt.lastCheckAt = 0;
            rt.confirmedEnded = false;
            const currentAuctionId = getAuctionIdFromUrl();
            if (currentAuctionId === auctionId) syncSniperPanelFromConfig();
            close();
            renderTrackedAuctions();
        });
    }

    // Ticker 1s piloté par Web Worker : timers + Last-Second Check (< 15s ou <= 0s)
    createUnthrottledInterval(() => {
        document.querySelectorAll('.wm-tracked-timer').forEach(el => {
            const endAt = el.dataset.end;
            const id = el.dataset.id;
            if (!endAt) return;

            const s = Math.floor((new Date(endAt).getTime() - Date.now()) / 1000);
            const state = id ? getTrackedCheckState(id) : null;

            if (s > 0) {
                el.textContent = window.formatSec(s);
                if (s <= 15 && id) {
                    verifyTrackedAuctionEnd(id);
                }
            } else {
                if (id && state && !state.confirmedEnded) {
                    el.textContent = 'Vérif...';
                    verifyTrackedAuctionEnd(id);
                } else {
                    el.textContent = 'Terminée';
                }
            }
        });
    }, 1000);

    // Boucle 5s pilotée par Web Worker : rappels et nettoyage
    createUnthrottledInterval(async () => {
        const reminders = getReminders();
        const now = Date.now();
        let changed = false;

        for (const id of Object.keys(reminders)) {
            const rem = reminders[id];
            const endMs = new Date(rem.endAt).getTime();
            const secondsLeft = Math.floor((endMs - now) / 1000);
            const state = getTrackedCheckState(id);

            if (secondsLeft <= 15 && secondsLeft >= -60 && !rem.confirmedEnded && !state.confirmedEnded) {
                await verifyTrackedAuctionEnd(id);
                const freshReminders = getReminders();
                if (freshReminders[id]) {
                    Object.assign(rem, freshReminders[id]);
                }
            }

            const updatedSecondsLeft = Math.floor((new Date(rem.endAt).getTime() - Date.now()) / 1000);

            if (!rem.fired && updatedSecondsLeft <= rem.triggerBefore && updatedSecondsLeft > 0) {
                const prefs = getPrefs();
                const ch = rem.channels || { browser: prefs.browser, toast: prefs.toast, sound: prefs.sound };
                const title = `Fin imminente — ${rem.cardTitle}`;
                const body = `Se termine dans ${window.formatSec(updatedSecondsLeft)}`;
                if (ch.browser && Notification.permission === 'granted') {
                    try {
                        const n = new Notification(title, { body, icon: 'https://www.wiki-masters.com/icon-192.png', tag: 'wm-auction-' + id });
                        n.onclick = () => { window.focus(); window.location.href = `/marketplace/${id}`; n.close(); };
                    } catch(e) {}
                }
                if (ch.toast) window.showToast({ title: 'Fin imminente', body: `"${rem.cardTitle}" arrive à échéance.`, auctionId: id, urgent: updatedSecondsLeft < 30, secondsLeft: updatedSecondsLeft });
                if (ch.sound) window.playBeep();
                rem.fired = true;
                changed = true;
                window.logToPanel(`🔔 Rappel déclenché : ${rem.cardTitle} (${updatedSecondsLeft}s)`);
            }

            if (updatedSecondsLeft < -300 && (rem.confirmedEnded || state.confirmedEnded)) {
                delete reminders[id];
                delete trackedCheckRuntime[id];
                changed = true;
                const toast = document.getElementById('wm-toast-' + id);
                if (toast) toast.remove();
            }
        }
        if (changed) saveReminders(reminders);
        renderTrackedAuctions();
        updateTrackBadge();
    }, 5000);

    // --- Cross-module exports ---
        /**
     * Nettoie définitivement les enchères terminées (settled_sold, cancelled, etc.)
     * ou expirées depuis plus de 2 minutes pour éviter de continuer à les interroger en arrière-plan.
     */
    function pruneExpiredSniperAuctions() {
        try {
            const all = getAllSniperConfigs();
            const now = Date.now();
            let changed = false;
            for (const id of Object.keys(all)) {
                const item = all[id];
                if (!item) continue;
                const isStatusEnded = item.status && item.status !== 'active';
                const endMs = item.endAt ? new Date(item.endAt).getTime() : NaN;
                const isTimeExpired = !isNaN(endMs) && (now - endMs) > 120000;
                if (isStatusEnded || isTimeExpired) {
                    if (item.enabled) {
                        item.enabled = false;
                        item.status = item.status || 'ended';
                        changed = true;
                    }
                }
            }
            if (changed) saveAllSniperConfigs(all);

            const rems = getReminders();
            let remChanged = false;
            for (const id of Object.keys(rems)) {
                const r = rems[id];
                if (!r) continue;
                const endMs = r.endAt ? new Date(r.endAt).getTime() : NaN;
                if (!isNaN(endMs) && (now - endMs) > 120000) {
                    delete rems[id];
                    remChanged = true;
                }
            }
            if (remChanged) saveReminders(rems);
        } catch (e) {
            console.warn('[WM-Sniper] Erreur nettoyage enchères expirées:', e);
        }
    }
    pruneExpiredSniperAuctions();

    window.getAllSniperConfigs = WikiM.getAllSniperConfigs = getAllSniperConfigs;
    window.saveAllSniperConfigs = WikiM.saveAllSniperConfigs = saveAllSniperConfigs;
    window.getSniperConfigFor = WikiM.getSniperConfigFor = getSniperConfigFor;
    window.setSniperConfigFor = WikiM.setSniperConfigFor = setSniperConfigFor;
    window.getSniperRuntime = WikiM.getSniperRuntime = getSniperRuntime;
    window.getMinBid = WikiM.getMinBid = getMinBid;
    window.placeBid = WikiM.placeBid = placeBid;
    window.injectSniperPanel = WikiM.injectSniperPanel = injectSniperPanel;
    window.syncSniperPanelFromConfig = WikiM.syncSniperPanelFromConfig = syncSniperPanelFromConfig;
    window.updateSniperStatusUI = WikiM.updateSniperStatusUI = updateSniperStatusUI;
    window.getPrefs = WikiM.getPrefs = getPrefs;
    window.savePrefs = WikiM.savePrefs = savePrefs;
    window.getReminders = WikiM.getReminders = getReminders;
    window.saveReminders = WikiM.saveReminders = saveReminders;
    window.getBulkList = WikiM.getBulkList = getBulkList;
    window.saveBulkList = WikiM.saveBulkList = saveBulkList;
    window.getMenuPosition = WikiM.getMenuPosition = getMenuPosition;
    window.saveMenuPosition = WikiM.saveMenuPosition = saveMenuPosition;
    window.addReminder = WikiM.addReminder = addReminder;
    window.removeReminder = WikiM.removeReminder = removeReminder;
    window.updateTrackBadge = WikiM.updateTrackBadge = updateTrackBadge;
    window.verifyTrackedAuctionEnd = WikiM.verifyTrackedAuctionEnd = verifyTrackedAuctionEnd;
    window.getAuctionIdFromUrl = WikiM.getAuctionIdFromUrl = getAuctionIdFromUrl;
    window.fetchAuctionDetails = WikiM.fetchAuctionDetails = fetchAuctionDetails;
    window.ensureTrackButton = WikiM.ensureTrackButton = ensureTrackButton;
    window.openTrackModal = WikiM.openTrackModal = openTrackModal;
    window.renderTrackedAuctions = WikiM.renderTrackedAuctions = renderTrackedAuctions;
    window.openSniperEditModal = WikiM.openSniperEditModal = openSniperEditModal;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});