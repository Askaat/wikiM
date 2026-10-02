// ============================================================
// WikiM - Module: Utilities, Logger & Toasts
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

    // ============================================================
    // WRAPPER DE RETRY GÉNÉRIQUE
    // ============================================================
    /**
 * Exécute une fonction async avec retry automatique.
 * @param {Function} fn - fonction async à exécuter (retourne une promesse)
 * @param {Object} opts
 *   - retries   : nombre max de tentatives (défaut 4)
 *   - baseDelay : délai initial en ms (défaut 800)
 *   - maxDelay  : plafond du délai (défaut 10000)
 *   - factor    : multiplicateur exponentiel (défaut 2)
 *   - label     : texte pour les logs
 *   - shouldRetry : (error, attempt) => bool  (par défaut : tout sauf erreurs 4xx "client")
 * @returns la valeur retournée par fn
 */
    async function withRetry(fn, opts = {}) {
        const retries = opts.retries ?? 4;
        const baseDelay = opts.baseDelay ?? 800;
        const maxDelay = opts.maxDelay ?? 10000;
        const factor = opts.factor ?? 2;
        const label = opts.label || 'requête';
        const shouldRetry = opts.shouldRetry || ((err, attempt) => {
            // Par défaut : on retry sur erreurs réseau, 5xx, 429, timeouts
            const msg = String(err?.message || err);
            // Erreurs 4xx (sauf 429) → pas de retry
            if (/\b(400|401|403|404|409|422)\b/.test(msg)) return false;
            return true;
        });

        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                lastError = err;
                if (attempt === retries || !shouldRetry(err, attempt)) {
                    throw err;
                }
                const delay = Math.min(maxDelay, baseDelay * Math.pow(factor, attempt));
                const jitter = Math.random() * 0.3 * delay; // jitter pour éviter les pics synchronisés
                const wait = Math.round(delay + jitter);
                console.warn(`[WM-Retry] ${label} — échec (${err.message}), retry ${attempt + 1}/${retries} dans ${wait}ms`);
                await new Promise(r => setTimeout(r, wait));
            }
        }
        throw lastError;
    }

    // ============================================================
    // LOG / UTILITAIRES UI
    // ============================================================
    function logToPanel(msg) {
        const logBox = document.getElementById('wm-log-box');
        if (!logBox) return;
        const div = document.createElement('div');
        div.className = 'wm-log-item';
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logBox.appendChild(div);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function isTitleInBulkList(title) {
        return getBulkList().some(item => (typeof item === 'string' ? item : item.title) === title);
    }

    function updateAllBulkButtonsUI() {
        document.querySelectorAll('.wm-btn-bulk').forEach(btn => {
            const c = btn.closest('.w-72');
            if (!c) return;
            const t = c.querySelector('h3')?.textContent?.trim();
            if (!t) return;
            const isIn = isTitleInBulkList(t);
            btn.classList.toggle('wm-btn-bulk-active', isIn);
            btn.innerHTML = isIn
                ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        });
    }

    function updateBulkUI() {
        const container = document.getElementById('wm-bulk-list-container');
        if (!container) return;
        const list = getBulkList();
        if (list.length === 0) {
            container.innerHTML = '<div class="wm-bulk-empty">Panier vide.</div>';
        } else {
            container.innerHTML = list.map(item => {
                const title = typeof item === 'string' ? item : item.title;
                const hasUserCardId = typeof item === 'object' && (
                    item.userCardId || (item.id && window.wmCardIdToUserCardId.has(item.id))
                );
                const hasCardId = typeof item === 'object' && item.id;
                const icon = hasUserCardId ? '✅' : (hasCardId ? '⏳' : '❓');
                const tip = hasUserCardId ? 'Prêt (user_card_id connu)' : (hasCardId ? 'user_card_id à résoudre' : 'Aucun ID');
                return `<div class="wm-bulk-item"><span title="${tip}">${icon} ${title}</span></div>`;
            }).join('');
        }
    }

    // ============================================================
    // SYSTÈME DE NOTIFICATION (TOAST)
    // ============================================================
    function showWMToast(message, isSuccess = true) {
        const toast = document.createElement('div');
        // Styles Tailwind intégrés pour matcher avec l'interface du jeu (Next.js)
        toast.className = `fixed bottom-5 right-5 z-[9999] flex items-center p-4 mb-4 text-sm rounded-lg shadow-xl transition-all duration-500 transform translate-y-4 opacity-0 border ${isSuccess ? 'text-green-400 bg-gray-900 border-green-800' : 'text-red-400 bg-gray-900 border-red-800'}`;
        toast.innerHTML = `<span class="font-semibold flex items-center gap-2">${isSuccess ? '✅' : '❌'} ${message}</span>`;

        document.body.appendChild(toast);

        // Animation d'entrée
        requestAnimationFrame(() => {
            toast.classList.replace('translate-y-4', 'translate-y-0');
            toast.classList.replace('opacity-0', 'opacity-100');
        });

        // Disparition automatique après 3.5 secondes
        setTimeout(() => {
            toast.classList.replace('translate-y-0', 'translate-y-4');
            toast.classList.replace('opacity-100', 'opacity-0');
            setTimeout(() => toast.remove(), 500); // Nettoyage du DOM
        }, 3500);
    }

    // ============================================================
    // SON
    // ============================================================
    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.2, 0.4].forEach(offset => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 800;
                const t = ctx.currentTime + offset;
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.start(t); osc.stop(t + 0.15);
            });
        } catch(e) {}
    }

    // ============================================================
    // TOASTS
    // ============================================================
    function getToastContainer() {
        let c = document.getElementById('wm-toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'wm-toast-container'; document.body.appendChild(c); }
        return c;
    }

    function showToast({ title, body, auctionId, urgent, secondsLeft }) {
        const container = getToastContainer();
        const id = 'wm-toast-' + auctionId;
        const old = document.getElementById(id);
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = id;
        toast.className = 'wm-toast' + (urgent ? ' urgent' : '');
        toast.innerHTML = `
            <div class="wm-toast-title">
                <span>🔔 ${title}</span>
                <button class="wm-toast-close" aria-label="Fermer">✕</button>
            </div>
            <div class="wm-toast-body">
                ${body}
                ${secondsLeft !== undefined ? `<div style="margin-top:6px;">Fin dans <span class="wm-toast-timer" data-auction="${auctionId}">${formatSec(secondsLeft)}</span></div>` : ''}
            </div>
            <div class="wm-toast-actions">
                <button class="wm-toast-btn view">Voir</button>
                <button class="wm-toast-btn dismiss">Fermer</button>
            </div>
        `;
        container.appendChild(toast);
        toast.querySelector('.wm-toast-close').addEventListener('click', () => toast.remove());
        toast.querySelector('.dismiss').addEventListener('click', () => toast.remove());
        toast.querySelector('.view').addEventListener('click', () => { window.location.href = `/marketplace/${auctionId}`; });

        if (secondsLeft !== undefined) {
            const timerEl = toast.querySelector('.wm-toast-timer');
            const interval = setInterval(() => {
                if (!document.body.contains(timerEl)) { clearInterval(interval); return; }
                const rem = getReminders()[auctionId];
                if (!rem) { clearInterval(interval); return; }
                const s = Math.floor((new Date(rem.endAt).getTime() - Date.now()) / 1000);
                timerEl.textContent = s > 0 ? formatSec(s) : 'Terminée';
                if (s <= 0) { toast.classList.add('expired'); clearInterval(interval); }
            }, 1000);
        }
    }

    function formatSec(s) {
        if (s <= 0) return '0s';
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
        const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
        return `${h}h ${m}m`;
    }

    // ============================================================
    // UTILITAIRES
    // ============================================================
    window.applyPersistentFilters = function() {
        const cards = document.querySelectorAll('.w-72');
        cards.forEach(card => {
            const titleEl = card.querySelector('h3') || card.closest('.flex-col, .flex-row')?.querySelector('h2, h3');
            if (titleEl) {
                const title = titleEl.textContent.trim();
                if (window.wmProcessedCards.has(title)) {
                    card.classList.add('wm-processed-card');
                    card.querySelectorAll('.wm-action-btn').forEach(b => b.disabled = true);
                }
            }
        });
    };

    function markCardAsProcessedByTitle(title) {
        if (!title) return;
        window.wmProcessedCards.add(title);
        window.applyPersistentFilters();
    }


    // --- Cross-module exports ---
    if (typeof withRetry !== 'undefined') { window.withRetry = withRetry; window.WikiM.withRetry = withRetry; }
    if (typeof logToPanel !== 'undefined') { window.logToPanel = logToPanel; window.WikiM.logToPanel = logToPanel; }
    if (typeof isTitleInBulkList !== 'undefined') { window.isTitleInBulkList = isTitleInBulkList; window.WikiM.isTitleInBulkList = isTitleInBulkList; }
    if (typeof updateAllBulkButtonsUI !== 'undefined') { window.updateAllBulkButtonsUI = updateAllBulkButtonsUI; window.WikiM.updateAllBulkButtonsUI = updateAllBulkButtonsUI; }
    if (typeof updateBulkUI !== 'undefined') { window.updateBulkUI = updateBulkUI; window.WikiM.updateBulkUI = updateBulkUI; }
    if (typeof showWMToast !== 'undefined') { window.showWMToast = showWMToast; window.WikiM.showWMToast = showWMToast; }
    if (typeof playBeep !== 'undefined') { window.playBeep = playBeep; window.WikiM.playBeep = playBeep; }
    if (typeof getToastContainer !== 'undefined') { window.getToastContainer = getToastContainer; window.WikiM.getToastContainer = getToastContainer; }
    if (typeof showToast !== 'undefined') { window.showToast = showToast; window.WikiM.showToast = showToast; }
    if (typeof formatSec !== 'undefined') { window.formatSec = formatSec; window.WikiM.formatSec = formatSec; }
    if (typeof markCardAsProcessedByTitle !== 'undefined') { window.markCardAsProcessedByTitle = markCardAsProcessedByTitle; window.WikiM.markCardAsProcessedByTitle = markCardAsProcessedByTitle; }
})();
