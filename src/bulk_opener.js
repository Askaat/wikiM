// ============================================================
// WikiM - Module: Bulk Pack Opener, Anti-Bot Turnstile & Summary Modal
// ============================================================
(function(W, WikiM) {
    'use strict';

    // Configuration des couleurs de rareté (selon la charte demandée)
    const RARITY_CONFIG = {
        'L':  { order: 5, label: 'L',  name: 'Légendaire',   bg: '#ef4444', text: '#ffffff', border: 'rgba(239, 68, 68, 0.5)' },
        'UR': { order: 4, label: 'UR', name: 'Ultra Rare',   bg: '#f59e0b', text: '#0f172a', border: 'rgba(245, 158, 11, 0.5)' },
        'SR': { order: 3, label: 'SR', name: 'Super Rare',   bg: '#a855f7', text: '#ffffff', border: 'rgba(168, 85, 247, 0.5)' },
        'R':  { order: 2, label: 'R',  name: 'Rare',         bg: '#3b82f6', text: '#ffffff', border: 'rgba(59, 130, 246, 0.5)' },
        'PC': { order: 1, label: 'PC', name: 'Peu Commune',  bg: '#38bdf8', text: '#0f172a', border: 'rgba(56, 189, 248, 0.5)' },
        'C':  { order: 0, label: 'C',  name: 'Commune',      bg: '#94a3b8', text: '#0f172a', border: 'rgba(148, 163, 184, 0.5)' }
    };

    // État global de l'ouverture en masse
    const openerState = {
        isRunning: false,
        isPausedForBot: false,
        stopRequested: false,
        targetCount: 0,
        openedCount: 0,
        availablePacks: 0,
        pulledCards: [],      // Liste structurée des cartes tirées pour la modale
        humanCheckResolvers: []
    };

    // ============================================================
    // 1. STYLES CSS (Design System Slate / Indigo WikiM)
    // ============================================================
    function ensureBulkOpenerStyles() {
        if (document.getElementById('wm-bulk-opener-styles')) return;
        const style = document.createElement('style');
        style.id = 'wm-bulk-opener-styles';
        style.textContent = `
            #wm-bulk-opener-bar {
                background: rgba(15, 23, 42, 0.92);
                border: 1px solid rgba(99, 102, 241, 0.4);
                border-radius: 14px;
                padding: 12px 18px;
                margin: 12px auto;
                max-width: 580px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.7), 0 0 20px rgba(99, 102, 241, 0.12);
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                color: #f8fafc;
                backdrop-filter: blur(8px);
                transition: all 0.2s ease;
            }
            .wm-bo-controls {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
            }
            .wm-bo-qty-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(30, 41, 59, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 10px;
                padding: 6px 10px;
            }
            .wm-bo-qty-input {
                width: 48px;
                background: rgba(15, 23, 42, 0.9);
                border: 1px solid rgba(99, 102, 241, 0.4);
                border-radius: 6px;
                color: #f8fafc;
                font-weight: 800;
                font-size: 13px;
                text-align: center;
                padding: 4px;
                outline: none;
            }
            .wm-bo-btn-main {
                flex: 1;
                background: linear-gradient(135deg, #4f46e5, #6366f1);
                color: #ffffff;
                border: none;
                border-radius: 10px;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 800;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            .wm-bo-btn-main:hover:not(:disabled) {
                filter: brightness(1.12);
                transform: translateY(-1px);
            }
            .wm-bo-btn-main:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            .wm-bo-btn-stop {
                background: linear-gradient(135deg, #dc2626, #ef4444);
                color: #ffffff;
                border: none;
                border-radius: 10px;
                padding: 10px 16px;
                font-size: 13px;
                font-weight: 800;
                cursor: pointer;
                display: none;
                align-items: center;
                gap: 6px;
                box-shadow: 0 4px 15px rgba(220, 38, 38, 0.4);
                transition: all 0.15s ease;
            }
            .wm-bo-btn-stop:hover:not(:disabled) {
                filter: brightness(1.12);
            }
            .wm-bo-status-banner {
                display: none;
                flex-direction: column;
                gap: 6px;
                background: rgba(2, 6, 23, 0.65);
                border: 1px solid rgba(148, 163, 184, 0.15);
                border-radius: 8px;
                padding: 8px 12px;
                font-size: 12px;
            }
            .wm-bo-status-banner.is-antibot {
                border-color: #f59e0b;
                background: rgba(245, 158, 11, 0.12);
                color: #fcd34d;
                animation: wmPulseBorder 1.5s infinite;
            }
            @keyframes wmPulseBorder {
                0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.3); }
                50% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
            }
            .wm-bo-progress-track {
                width: 100%;
                height: 5px;
                background: rgba(30, 41, 59, 0.9);
                border-radius: 999px;
                overflow: hidden;
            }
            .wm-bo-progress-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #6366f1, #38bdf8);
                border-radius: 999px;
                transition: width 0.25s ease;
            }

            /* --- MODALE RÉCAPITULATIVE DE FIN DE TIRAGE --- */
            #wm-bo-summary-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 23, 0.86);
                backdrop-filter: blur(10px);
                z-index: 100010;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                animation: wmBoFadeIn 0.18s ease-out;
            }
            @keyframes wmBoFadeIn {
                from { opacity: 0; transform: scale(0.97); }
                to { opacity: 1; transform: scale(1); }
            }
            .wm-bo-modal {
                background: #0f172a;
                border: 1px solid rgba(99, 102, 241, 0.45);
                border-radius: 16px;
                width: 95vw;
                max-width: 1120px;
                height: 88vh;
                max-height: 88vh;
                display: flex;
                flex-direction: column;
                color: #f8fafc;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(99, 102, 241, 0.18);
                overflow: hidden;
            }
            .wm-bo-modal-header {
                padding: 16px 24px;
                background: rgba(15, 23, 42, 0.98);
                border-bottom: 1px solid rgba(148, 163, 184, 0.15);
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                align-items: center;
                gap: 14px;
            }
            .wm-bo-rarity-pills {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }
            .wm-bo-rarity-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 11px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 800;
                cursor: pointer;
                user-select: none;
                border: 2px solid transparent;
                transition: all 0.15s ease;
                opacity: 0.85;
            }
            .wm-bo-rarity-pill:hover {
                opacity: 1;
                transform: translateY(-1px);
            }
            .wm-bo-rarity-pill.is-active {
                opacity: 1;
                border-color: #ffffff;
                box-shadow: 0 0 12px rgba(255, 255, 255, 0.35);
                transform: scale(1.05);
            }
            .wm-bo-rarity-pill.is-zero {
                opacity: 0.35;
            }
            .wm-bo-toolbar {
                padding: 12px 24px;
                background: rgba(2, 6, 23, 0.65);
                border-bottom: 1px solid rgba(148, 163, 184, 0.14);
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                justify-content: space-between;
            }
            .wm-bo-input, .wm-bo-select {
                background: rgba(30, 41, 59, 0.9);
                border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 8px;
                padding: 8px 12px;
                color: #f8fafc;
                font-size: 12px;
                outline: none;
                transition: border-color 0.15s;
            }
            .wm-bo-input:focus, .wm-bo-select:focus {
                border-color: #6366f1;
            }
            .wm-bo-apply-tags-btn {
                background: linear-gradient(135deg, #10b981, #059669);
                color: #ffffff;
                border: none;
                border-radius: 9px;
                padding: 9px 16px;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
                transition: all 0.15s ease;
            }
            .wm-bo-apply-tags-btn:hover:not(:disabled) {
                filter: brightness(1.1);
                transform: translateY(-1px);
            }
            .wm-bo-apply-tags-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            .wm-bo-bulk-delete-btn {
                background: linear-gradient(135deg, #dc2626, #b91c1c);
                color: #ffffff;
                border: none;
                border-radius: 9px;
                padding: 9px 16px;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);
                transition: all 0.15s ease;
            }
            .wm-bo-bulk-delete-btn:hover:not(:disabled) {
                filter: brightness(1.12);
                transform: translateY(-1px);
            }
            .wm-bo-bulk-delete-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            .wm-bo-trash-btn {
                background: rgba(30, 41, 59, 0.8);
                border: 1px solid rgba(239, 68, 68, 0.35);
                color: #ef4444;
                border-radius: 7px;
                width: 26px;
                height: 26px;
                font-size: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.15s ease;
                flex-shrink: 0;
            }
            .wm-bo-trash-btn:hover:not(:disabled) {
                background: rgba(239, 68, 68, 0.22);
                border-color: #ef4444;
                transform: scale(1.1);
            }
            .wm-bo-trash-btn.is-active {
                background: #ef4444;
                border-color: #f87171;
                color: #ffffff;
                box-shadow: 0 0 10px rgba(239, 68, 68, 0.65);
                transform: scale(1.05);
            }
            .wm-bo-trash-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }
            .wm-bo-card-row.is-marked-delete {
                border-color: rgba(239, 68, 68, 0.55);
                background: rgba(69, 10, 10, 0.3);
            }
            .wm-bo-card-row.is-card-deleted {
                opacity: 0.45;
                filter: grayscale(0.8);
                pointer-events: none;
            }
            .wm-bo-tag-search-input {
                width: 100%;
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(99, 102, 241, 0.45);
                border-radius: 6px;
                padding: 6px 10px;
                color: #f8fafc;
                font-size: 12px;
                outline: none;
                box-sizing: border-box;
            }
            .wm-bo-tag-search-input:focus {
                border-color: #6366f1;
                box-shadow: 0 0 8px rgba(99, 102, 241, 0.35);
            }
            .wm-bo-cards-list {
                padding: 16px 24px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .wm-bo-card-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 10px 16px;
                background: rgba(30, 41, 59, 0.55);
                border: 1px solid rgba(148, 163, 184, 0.16);
                border-radius: 12px;
                transition: all 0.15s ease;
            }
            .wm-bo-card-row:hover {
                border-color: rgba(99, 102, 241, 0.45);
                background: rgba(30, 41, 59, 0.85);
            }
            .wm-bo-card-left {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
                flex: 1;
            }
            .wm-bo-thumb {
                width: 44px;
                height: 60px;
                border-radius: 7px;
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(148, 163, 184, 0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
            }
            .wm-bo-thumb img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .wm-bo-rarity-badge {
                padding: 3px 7px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.4px;
                flex-shrink: 0;
                min-width: 28px;
                text-align: center;
            }
            .wm-bo-card-title-link {
                font-weight: 700;
                font-size: 13.5px;
                color: #f1f5f9;
                text-decoration: none;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: inline-block;
                max-width: 100%;
                transition: color 0.15s;
            }
            .wm-bo-card-title-link:hover {
                color: #38bdf8;
                text-decoration: underline;
            }
            .wm-bo-card-meta {
                font-size: 11px;
                color: #94a3b8;
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                margin-top: 3px;
            }
            .wm-bo-price-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 7px;
                border-radius: 5px;
                font-weight: 700;
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                background: rgba(245, 158, 11, 0.14);
                color: #fbbf24;
                border: 1px solid rgba(245, 158, 11, 0.3);
            }
            .wm-bo-price-badge.is-loading {
                background: rgba(56, 189, 248, 0.12);
                color: #7dd3fc;
                border-color: rgba(56, 189, 248, 0.25);
            }
            .wm-bo-price-badge.is-empty {
                background: rgba(148, 163, 184, 0.1);
                color: #64748b;
                border-color: rgba(148, 163, 184, 0.2);
            }
            .wm-bo-tags-zone {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                justify-content: flex-end;
                max-width: 52%;
            }
            .wm-bo-tag-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 7px;
                font-size: 11px;
                font-weight: 800;
                color: #090d16;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
                user-select: none;
                transition: transform 0.12s ease;
            }
            .wm-bo-tag-chip.is-applied {
                outline: 2px solid #10b981;
            }
            .wm-bo-tag-remove {
                background: rgba(0, 0, 0, 0.22);
                border: none;
                color: #ffffff;
                border-radius: 50%;
                width: 15px;
                height: 15px;
                font-size: 9px;
                font-weight: 900;
                line-height: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                transition: background 0.12s, transform 0.12s;
            }
            .wm-bo-tag-remove:hover {
                background: #ef4444;
                transform: scale(1.15);
            }
            .wm-bo-tag-add-wrap {
                position: relative;
                display: inline-flex;
            }
            .wm-bo-tag-add-btn {
                background: rgba(99, 102, 241, 0.16);
                color: #a5b4fc;
                border: 1px dashed rgba(99, 102, 241, 0.55);
                border-radius: 7px;
                width: 26px;
                height: 26px;
                font-size: 14px;
                font-weight: 800;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .wm-bo-tag-add-btn:hover {
                background: rgba(99, 102, 241, 0.32);
                border-style: solid;
                color: #ffffff;
            }
            .wm-bo-tag-dropdown {
                position: absolute;
                top: calc(100% + 6px);
                right: 0;
                background: #1e293b;
                border: 1px solid rgba(99, 102, 241, 0.5);
                border-radius: 10px;
                padding: 8px;
                width: 240px;
                max-height: 280px;
                z-index: 100030;
                box-shadow: 0 14px 32px rgba(0, 0, 0, 0.85);
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .wm-bo-tag-dropdown-list {
                display: flex;
                flex-direction: column;
                gap: 3px;
                max-height: 190px;
                overflow-y: auto;
            }
            .wm-bo-tag-dropdown-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                border-radius: 6px;
                background: transparent;
                border: none;
                color: #f1f5f9;
                font-size: 12px;
                font-weight: 600;
                text-align: left;
                cursor: pointer;
                transition: background 0.12s;
            }
            .wm-bo-tag-dropdown-item:hover {
                background: rgba(99, 102, 241, 0.28);
            }
            .wm-bo-modal-footer {
                padding: 14px 24px;
                background: rgba(15, 23, 42, 0.98);
                border-top: 1px solid rgba(148, 163, 184, 0.15);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
        `;
        document.head.appendChild(style);
    }

    function escapeHtml(s) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
        return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ============================================================
    // 2. INTERCEPTEUR GLOBAL ANTI-BOT (POST /api/human-check)
    // ============================================================
    function installHumanCheckInterceptor() {
        if (window._wmHumanCheckHooked) return;
        window._wmHumanCheckHooked = true;

        const notifyHumanCheckSuccess = () => {
            console.log('[WM-BulkOpener] ✅ Validation anti-bot (POST /api/human-check -> ok:true) interceptée !');
            if (typeof window.logToPanel === 'function') {
                window.logToPanel('🛡️ Vérification anti-bot validée ! Reprise dans 1s...');
            }
            window.dispatchEvent(new CustomEvent('wm-turnstile-success'));
            const strayModal = document.getElementById('wm-turnstile-modal-overlay');
            if (strayModal) {
                const sub = strayModal.querySelector('#wm-turnstile-subtext');
                if (sub) {
                    sub.textContent = '✅ Vérification validée avec succès !';
                    sub.style.color = '#34d399';
                }
                setTimeout(() => strayModal.remove(), 400);
            }
            const resolvers = openerState.humanCheckResolvers.splice(0);
            resolvers.forEach(resolve => {
                try { resolve(true); } catch (e) {}
            });
        };

        // 1. Hook sur window.fetch — on cible explicitement unsafeWindow (contexte de la page)
        //    pour s'assurer d'intercepter les requêtes fetch du site, quel que soit le mode de grant.
        const targetWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        const origFetch = targetWin.fetch;
        if (typeof origFetch === 'function') {
            targetWin.fetch = async function(...args) {
                const res = await origFetch.apply(this, args);
                try {
                    const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
                    if (reqUrl.includes('/api/human-check')) {
                        const clone = res.clone();
                        clone.json().then(data => {
                            if (data && data.ok === true) {
                                notifyHumanCheckSuccess();
                            }
                        }).catch(() => {});
                    }
                } catch (e) {}
                return res;
            };
        }

        // 2. Hook sur XMLHttpRequest (au cas où Turnstile/le site utilise XHR)
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._wmUrl = typeof url === 'string' ? url : String(url || '');
            return origOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            if (this._wmUrl && this._wmUrl.includes('/api/human-check')) {
                this.addEventListener('load', function() {
                    try {
                        const data = JSON.parse(this.responseText);
                        if (data && data.ok === true) {
                            notifyHumanCheckSuccess();
                        }
                    } catch (e) {}
                });
            }
            return origSend.apply(this, args);
        };
    }

    // ============================================================
    // GESTION AUTONOME CLOUDFLARE TURNSTILE (SANS CLIC NATIF)
    // ============================================================
    function ensureTurnstileScriptLoaded() {
        return new Promise((resolve, reject) => {
            const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            if (targetWin.turnstile && typeof targetWin.turnstile.render === 'function') {
                return resolve(targetWin.turnstile);
            }

            let existingScript = document.querySelector('script[src*="turnstile"]');
            if (!existingScript) {
                existingScript = document.createElement('script');
                existingScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
                existingScript.async = true;
                existingScript.defer = true;
                (document.head || document.documentElement).appendChild(existingScript);
            }

            let checks = 0;
            const interval = setInterval(() => {
                checks++;
                const t = (typeof unsafeWindow !== 'undefined' && unsafeWindow.turnstile) || window.turnstile;
                if (t && typeof t.render === 'function') {
                    clearInterval(interval);
                    return resolve(t);
                }
                if (checks > 80) { // 8s max
                    clearInterval(interval);
                    reject(new Error("Timeout lors du chargement de l'API Cloudflare Turnstile"));
                }
            }, 100);
        });
    }

    function getTurnstileSiteKey() {
        const elWithKey = document.querySelector('[data-sitekey]');
        if (elWithKey) {
            const key = elWithKey.getAttribute('data-sitekey');
            if (key && key.startsWith('0x4')) return key;
        }
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow._wmTurnstileSiteKey) {
            return unsafeWindow._wmTurnstileSiteKey;
        }
        // Clé publique Turnstile officielle statique de wiki-masters.com
        return '0x4AAAAAAEW_2IAWonrk_N5i';
    }

    function triggerAutonomousTurnstile() {
        return new Promise(async (resolve) => {
            let overlay = null;
            let widgetId = null;
            let resolved = false;

            const cleanup = () => {
                window.removeEventListener('wm-turnstile-success', onTurnstileSuccess);
                if (widgetId !== null) {
                    try {
                        const t = (typeof unsafeWindow !== 'undefined' && unsafeWindow.turnstile) || window.turnstile;
                        if (t && typeof t.remove === 'function') t.remove(widgetId);
                    } catch (e) {}
                    widgetId = null;
                }
                if (overlay) {
                    overlay.remove();
                    overlay = null;
                }
            };

            const onFinish = (success) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(success);
            };

            const onTurnstileSuccess = () => {
                if (subtext) {
                    subtext.textContent = '✅ Vérification validée avec succès !';
                    subtext.style.color = '#34d399';
                }
                setTimeout(() => onFinish(true), 400);
            };
            window.addEventListener('wm-turnstile-success', onTurnstileSuccess, { once: true });

            try {
                updateStatusBanner('🛡️ Initialisation anti-bot...', 'En attente Cloudflare', true);
                const turnstile = await ensureTurnstileScriptLoaded();
                const siteKey = getTurnstileSiteKey();

                overlay = document.createElement('div');
                overlay.id = 'wm-turnstile-modal-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0; left: 0; width: 100vw; height: 100vh;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(6px);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                `;

                overlay.innerHTML = `
                    <div style="
                        background: #1e293b;
                        border: 1px solid rgba(148, 163, 184, 0.25);
                        border-radius: 14px;
                        padding: 24px;
                        max-width: 380px;
                        width: 100%;
                        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                        text-align: center;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 16px;
                        font-family: inherit;
                        color: #f8fafc;
                    ">
                        <div style="font-size: 32px; line-height: 1;">🛡️</div>
                        <div>
                            <div style="font-size: 16px; font-weight: 800; color: #f8fafc; margin-bottom: 4px;">
                                Vérification Anti-Bot requise
                            </div>
                            <div id="wm-turnstile-subtext" style="font-size: 12px; color: #94a3b8;">
                                Résolution Cloudflare Turnstile en cours...
                            </div>
                        </div>

                        <div id="wm-turnstile-widget-slot" style="min-height: 65px; display: flex; align-items: center; justify-content: center;"></div>

                        <div style="display: flex; gap: 8px; width: 100%;">
                            <button type="button" id="wm-turnstile-cancel-btn" style="
                                flex: 1;
                                background: rgba(51, 65, 85, 0.8);
                                border: 1px solid rgba(148, 163, 184, 0.2);
                                color: #cbd5e1;
                                padding: 8px 12px;
                                border-radius: 8px;
                                font-size: 12px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                Annuler l'ouverture
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(overlay);

                const widgetSlot = overlay.querySelector('#wm-turnstile-widget-slot');
                const subtext = overlay.querySelector('#wm-turnstile-subtext');
                const cancelBtn = overlay.querySelector('#wm-turnstile-cancel-btn');

                cancelBtn.addEventListener('click', () => {
                    openerState.stopRequested = true;
                    onFinish(false);
                });

                widgetId = turnstile.render(widgetSlot, {
                    sitekey: siteKey,
                    theme: 'dark',
                    callback: async function(token) {
                        if (subtext) {
                            subtext.textContent = 'Validation auprès du serveur...';
                            subtext.style.color = '#38bdf8';
                        }
                        console.log('[WM-BulkOpener] 🛡️ Turnstile token obtenu, envoi à /api/human-check...');

                        try {
                            const resp = await fetch('https://www.wiki-masters.com/api/human-check', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ token: token })
                            });

                            let isOk = false;
                            try {
                                const text = await resp.text();
                                const data = JSON.parse(text);
                                isOk = (resp.ok && data && data.ok === true);
                            } catch (e) {
                                isOk = resp.ok;
                            }

                            if (isOk) {
                                console.log('[WM-BulkOpener] ✅ Défi anti-bot validé avec succès !');
                                if (subtext) {
                                    subtext.textContent = '✅ Vérification validée avec succès !';
                                    subtext.style.color = '#34d399';
                                }
                                notifyHumanCheckSuccess();
                                setTimeout(() => onFinish(true), 400);
                                return;
                            }
                        } catch (e) {
                            console.error('[WM-BulkOpener] Erreur validation human-check:', e);
                        }

                        if (!resolved) {
                            if (subtext) {
                                subtext.textContent = 'Échec de validation, nouvelle tentative...';
                                subtext.style.color = '#f87171';
                            }
                            setTimeout(() => {
                                try {
                                    const t = (typeof unsafeWindow !== 'undefined' && unsafeWindow.turnstile) || window.turnstile;
                                    if (t && widgetId !== null) t.reset(widgetId);
                                } catch (e) {}
                            }, 1200);
                        }
                    },
                    'error-callback': function() {
                        console.warn('[WM-BulkOpener] Turnstile error-callback déclenché (Cloudflare retente)');
                        if (!resolved && subtext) {
                            subtext.textContent = '⏳ Connexion à Cloudflare en cours...';
                            subtext.style.color = '#94a3b8';
                        }
                    },
                    'expired-callback': function() {
                        console.warn('[WM-BulkOpener] Turnstile token expiré');
                        if (subtext) subtext.textContent = 'Token expiré, renouvellement...';
                        try {
                            const t = (typeof unsafeWindow !== 'undefined' && unsafeWindow.turnstile) || window.turnstile;
                            if (t && widgetId !== null) t.reset(widgetId);
                        } catch (e) {}
                    }
                });

                const checkStopTimer = setInterval(() => {
                    if (openerState.stopRequested && !resolved) {
                        clearInterval(checkStopTimer);
                        onFinish(false);
                    }
                }, 300);

            } catch (err) {
                console.error('[WM-BulkOpener] Impossible de lancer Turnstile de manière autonome:', err);
                onFinish(false);
            }
        });
    }

    function waitForHumanCheckSuccess() {
        return new Promise(resolve => {
            openerState.humanCheckResolvers.push(resolve);
        });
    }



    // ============================================================
    // 3. DÉTECTION DU COMPTEUR DE PACKS & INJECTION DE L'UI SUR /pulls
    // ============================================================
    function findPackCounterContainer() {
        const candidates = Array.from(document.querySelectorAll('div.card-frame, div'));
        for (const el of candidates) {
            if (el.id === 'wm-bulk-opener-bar' || el.closest('#wm-bulk-opener-bar')) continue;
            const text = el.textContent || '';
            if (/paquets?\s+disponibles?/i.test(text) && /\d+\s*\/\s*\d+/.test(text)) {
                // On cible le conteneur direct (ex: div.card-frame)
                const frame = el.closest('div.card-frame') || el;
                return frame;
            }
        }
        return null;
    }

    function readAvailablePacksFromDOM() {
        const container = findPackCounterContainer();
        if (!container) return null;

        const text = container.textContent || '';
        const match = text.match(/(\d+)\s*\/\s*(\d+)\s*paquets?\s+disponibles?/i) || text.match(/(\d+)\s*\/\s*(\d+)/);
        if (match) {
            return {
                count: parseInt(match[1], 10),
                max: parseInt(match[2], 10),
                container
            };
        }
        return null;
    }

    function updateNativePackCounterInDOM(newRemaining) {
        if (typeof newRemaining !== 'number' || isNaN(newRemaining)) return;
        const info = readAvailablePacksFromDOM();
        if (!info || !info.container) return;

        // Cherche le span contenant le chiffre avant " / 10"
        const spans = Array.from(info.container.querySelectorAll('span'));
        const slashSpan = spans.find(s => /\s*\/\s*\d+/.test(s.textContent));
        if (slashSpan && slashSpan.previousElementSibling) {
            slashSpan.previousElementSibling.textContent = String(newRemaining);
        }
    }

    function syncBulkOpenerBarWithDOM() {
        if (!window.location.pathname.startsWith('/pulls')) return;

        const packInfo = readAvailablePacksFromDOM();
        if (!packInfo) return;

        ensureBulkOpenerStyles();
        installHumanCheckInterceptor();

        let bar = document.getElementById('wm-bulk-opener-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'wm-bulk-opener-bar';
            bar.innerHTML = `
                <div class="wm-bo-controls">
                    <div class="wm-bo-qty-wrap" title="Nombre de paquets à ouvrir">
                        <span style="font-size:12px;font-weight:700;color:#cbd5e1;">Quantité :</span>
                        <input type="number" id="wm-bo-qty-input" class="wm-bo-qty-input" min="1" max="10" value="1">
                        <button type="button" id="wm-bo-qty-max-btn" style="background:rgba(99,102,241,0.25);border:1px solid rgba(99,102,241,0.5);color:#c7d2fe;border-radius:5px;font-size:10px;font-weight:800;padding:3px 6px;cursor:pointer;">MAX</button>
                    </div>

                    <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8;cursor:pointer;user-select:none;" title="Activer/désactiver la récupération des prix à l'ouverture manuelle (désactivée automatiquement en bulk)">
                        <input type="checkbox" id="wm-bo-toggle-prices" ${localStorage.getItem('wmAutoPackPricesEnabled') !== 'false' ? 'checked' : ''} style="cursor:pointer;accent-color:#6366f1;">
                        💰 Prix auto
                    </label>

                    <button type="button" id="wm-bo-start-btn" class="wm-bo-btn-main">
                        ⚡ Ouvrir tous les paquets (0)
                    </button>

                    <button type="button" id="wm-bo-stop-btn" class="wm-bo-btn-stop">
                        ⏹️ Arrêter
                    </button>
                </div>

                <div id="wm-bo-status-banner" class="wm-bo-status-banner">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span id="wm-bo-status-text" style="font-weight:700;">Prêt</span>
                        <span id="wm-bo-status-counter" style="font-family:monospace;color:#94a3b8;font-size:11px;">0 / 0</span>
                    </div>
                    <div class="wm-bo-progress-track">
                        <div id="wm-bo-progress-fill" class="wm-bo-progress-fill"></div>
                    </div>
                </div>
            `;

            // Insertion ergonomique juste après le bloc du compteur de paquets
            const targetContainer = packInfo.container;
            if (targetContainer.parentElement) {
                targetContainer.insertAdjacentElement('afterend', bar);
            } else {
                document.body.appendChild(bar);
            }

            const qtyInput = bar.querySelector('#wm-bo-qty-input');
            const maxBtn = bar.querySelector('#wm-bo-qty-max-btn');
            const startBtn = bar.querySelector('#wm-bo-start-btn');
            const stopBtn = bar.querySelector('#wm-bo-stop-btn');

            qtyInput.addEventListener('input', () => {
                let val = parseInt(qtyInput.value, 10);
                const maxAllowed = Math.max(1, openerState.availablePacks);
                if (isNaN(val) || val < 1) val = 1;
                if (val > maxAllowed) val = maxAllowed;
                if (!openerState.isRunning) {
                    startBtn.textContent = `⚡ Ouvrir ${val === openerState.availablePacks ? 'tous les paquets' : 'les paquets'} (${val})`;
                }
            });

            maxBtn.addEventListener('click', () => {
                if (openerState.isRunning) return;
                qtyInput.value = String(Math.max(1, openerState.availablePacks));
                qtyInput.dispatchEvent(new Event('input'));
            });

            const boPricesToggle = bar.querySelector('#wm-bo-toggle-prices');
            if (boPricesToggle) {
                boPricesToggle.addEventListener('change', (e) => {
                    localStorage.setItem('wmAutoPackPricesEnabled', e.target.checked ? 'true' : 'false');
                    const prefToggle = document.getElementById('wm-pref-auto-pack-prices');
                    if (prefToggle) prefToggle.checked = e.target.checked;
                    if (typeof window.logToPanel === 'function') {
                        window.logToPanel(e.target.checked ? '💰 Prix auto à l\'ouverture activés' : '💰 Prix auto à l\'ouverture désactivés');
                    }
                });
            }

            startBtn.addEventListener('click', () => {
                if (openerState.isRunning) return;
                const qty = parseInt(qtyInput.value, 10) || openerState.availablePacks;
                startBulkPackOpening(qty);
            });

            stopBtn.addEventListener('click', () => {
                if (!openerState.isRunning) return;
                openerState.stopRequested = true;
                stopBtn.disabled = true;
                stopBtn.textContent = '⏳ Arrêt en cours...';
                updateStatusBanner('⏹️ Arrêt demandé par l\'utilisateur...', `${openerState.openedCount} / ${openerState.targetCount}`, false);
                // Débloque aussi l'attente anti-bot si l'utilisateur clique sur Arrêter pendant un Turnstile
                const resolvers = openerState.humanCheckResolvers.splice(0);
                resolvers.forEach(r => { try { r(false); } catch (e) {} });
            });
        }

        // Mise à jour dynamique si la boucle ne tourne pas
        if (!openerState.isRunning) {
            const prevAvailable = openerState.availablePacks;
            openerState.availablePacks = packInfo.count;

            const qtyInput = bar.querySelector('#wm-bo-qty-input');
            const startBtn = bar.querySelector('#wm-bo-start-btn');

            if (qtyInput && startBtn) {
                qtyInput.max = String(Math.max(1, packInfo.count));
                if (prevAvailable !== packInfo.count || !qtyInput.dataset.initialized) {
                    qtyInput.value = String(Math.max(1, packInfo.count));
                    qtyInput.dataset.initialized = 'true';
                }
                const selectedQty = Math.min(packInfo.count, Math.max(1, parseInt(qtyInput.value, 10) || packInfo.count));
                startBtn.disabled = packInfo.count <= 0;
                startBtn.textContent = packInfo.count > 0
                    ? `⚡ Ouvrir ${selectedQty === packInfo.count ? 'tous les paquets' : 'les paquets'} (${selectedQty})`
                    : `⚡ Aucun paquet disponible (0)`;
            }
        }
    }

    function updateStatusBanner(text, counterText, isAntiBot = false, progressPct = null) {
        const banner = document.getElementById('wm-bo-status-banner');
        const textEl = document.getElementById('wm-bo-status-text');
        const counterEl = document.getElementById('wm-bo-status-counter');
        const fillEl = document.getElementById('wm-bo-progress-fill');

        if (!banner) return;
        banner.style.display = 'flex';
        banner.classList.toggle('is-antibot', Boolean(isAntiBot));

        if (textEl && text !== null) textEl.textContent = text;
        if (counterEl && counterText !== null) counterEl.textContent = counterText;
        if (fillEl && progressPct !== null) {
            fillEl.style.width = `${Math.min(100, Math.max(0, progressPct))}%`;
        }
    }

    // ============================================================
    // 4. SÉQUENCE D'OUVERTURE SÉQUENTIELLE & GESTION TURNSTILE
    // ============================================================
    function getRandomPackDelayMs() {
        // Délai de sécurité entre 2100ms et 2600ms + gigue aléatoire pour respecter le rythme serveur
        const base = 2100 + Math.random() * 500;
        const jitter = (Math.random() * 400) - 200;
        return Math.max(1800, Math.round(base + jitter));
    }

    async function sleepInterruptible(ms) {
        const step = 100;
        let elapsed = 0;
        while (elapsed < ms) {
            if (openerState.stopRequested) return;
            await new Promise(r => setTimeout(r, Math.min(step, ms - elapsed)));
            elapsed += step;
        }
    }

    function normalizePulledCardEntry(rawCard, ownedCopies, obtainIndex) {
        const cardId = rawCard.id;
        const matchedCopy = Array.isArray(ownedCopies)
            ? ownedCopies.find(c => c.card_id === cardId || c.id === rawCard.user_card_id)
            : null;
        const userCardId = rawCard.user_card_id || matchedCopy?.id || null;
        const title = rawCard.wikipedia_title || rawCard.title || 'Sans titre';
        const rarity = (rawCard.rarity || 'C').toUpperCase();
        const desc = rawCard.summary || rawCard.description || rawCard.extract || '';
        const category = rawCard.category || desc;

        // Mise à jour immédiate de l'index global de collection WikiM
        if (cardId && userCardId && window.wmCardIdToUserCardId instanceof Map) {
            window.wmCardIdToUserCardId.set(cardId, userCardId);
        }

        // Objet carte normalisé pour evaluateAllRules(card, rules, prices)
        const evalCardObj = {
            id: cardId,
            userCardId: userCardId,
            title: title,
            rarity: rarity,
            category: category,
            summary: desc,
            description: desc
        };

        // Évaluation initiale des règles d'auto-tag
        const rules = typeof window.getTagGroups === 'function'
            ? window.getTagGroups().flatMap(g => g.rules || []).filter(r => r.enabled !== false && r.tagId)
            : [];

        const suggestedSet = typeof window.evaluateAllRules === 'function'
            ? window.evaluateAllRules(evalCardObj, rules, window.wmPrices || {})
            : new Set();

        return {
            uid: `pull_${obtainIndex}_${userCardId || cardId}`,
            obtainIndex,
            cardId,
            userCardId,
            title,
            wikipedia_url: rawCard.wikipedia_url || `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
            image_url: rawCard.image_url || null,
            rarity,
            category: rawCard.category || null,
            summary: desc,
            atk: rawCard.atk,
            def: rawCard.def,
            is_shiny: Boolean(matchedCopy?.is_shiny || rawCard.is_shiny),
            evalCardObj,
            suggestedTags: new Set(suggestedSet), // Tags actifs (modifiables par l'utilisateur)
            removedAutoTags: new Set(),           // Tags retirés manuellement par l'utilisateur (pour ne pas les ré-ajouter quand le prix charge)
            appliedTags: new Set(),               // Tags déjà envoyés à l'API depuis la modale
            isMarkedForDelete: false,             // Carte cochée pour défausse groupée
            isDeleted: false                      // Carte déjà défaussée via l'API
        };
    }

    async function startBulkPackOpening(requestedCount) {
        if (openerState.isRunning) return;

        // S'assurer que les tags de l'utilisateur sont chargés pour l'auto-tagging
        if ((!Array.isArray(window.wmTagsCache) || window.wmTagsCache.length === 0) && typeof window.wmFetchTags === 'function') {
            try { await window.wmFetchTags(); } catch (e) {}
        }

        const totalToOpen = Math.max(1, Number(requestedCount) || 1);
        openerState.isRunning = true;
        openerState.isPausedForBot = false;
        openerState.stopRequested = false;
        openerState.targetCount = totalToOpen;
        openerState.openedCount = 0;
        openerState.pulledCards = [];
        window._wmBulkOpeningActive = true;
        if (window.WikiM) window.WikiM.isBulkOpening = true;

        const startBtn = document.getElementById('wm-bo-start-btn');
        const stopBtn = document.getElementById('wm-bo-stop-btn');
        const qtyInput = document.getElementById('wm-bo-qty-input');

        if (startBtn) startBtn.disabled = true;
        if (qtyInput) qtyInput.disabled = true;
        if (stopBtn) {
            stopBtn.style.display = 'inline-flex';
            stopBtn.disabled = false;
            stopBtn.textContent = '⏹️ Arrêter';
        }

        if (typeof window.logToPanel === 'function') {
            window.logToPanel(`⚡ Démarrage du Bulk Pack Opener (${totalToOpen} paquet(s))...`);
        }

        let currentPackIndex = 1;
        let networkRetryCount = 0; // Cap anti-boucle infinie sur erreur réseau (max 3 tentatives consécutives)

        while (currentPackIndex <= totalToOpen && !openerState.stopRequested) {
            const pctBefore = Math.round(((currentPackIndex - 1) / totalToOpen) * 100);
            updateStatusBanner(
                `📦 Ouverture du paquet ${currentPackIndex} / ${totalToOpen}...`,
                `${openerState.openedCount} / ${totalToOpen} (${openerState.pulledCards.length} cartes)`,
                false,
                pctBefore
            );

            let response = null;
            let data = null;

            try {
                response = await fetch("https://www.wiki-masters.com/api/packs/open", {
                    method: "POST",
                    mode: "cors",
                    credentials: "include",
                    referrer: "https://www.wiki-masters.com/pulls",
                    headers: {
                        "accept": "*/*",
                        "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
                    },
                    body: null
                });

                try {
                    data = await response.json();
                } catch (jsonErr) {
                    data = null;
                }
            } catch (networkErr) {
                console.error('[WM-BulkOpener] ⚠️ Erreur réseau sur /api/packs/open :', networkErr);
                networkRetryCount++;
                if (networkRetryCount >= 3) {
                    const errMsg = `⛔ Erreur réseau persistante (3 tentatives) — ouverture interrompue.`;
                    console.error('[WM-BulkOpener]', errMsg);
                    updateStatusBanner(errMsg, `${openerState.openedCount} / ${totalToOpen}`, false);
                    if (typeof window.logToPanel === 'function') window.logToPanel(errMsg);
                    break; // Arrêt propre après 3 échecs consécutifs
                }
                updateStatusBanner(
                    `⚠️ Erreur réseau (tentative ${networkRetryCount}/3), reprise dans 2s...`,
                    `${openerState.openedCount} / ${totalToOpen}`,
                    false
                );
                await sleepInterruptible(2000);
                continue;
            }

            // --- CAS 1 : BLOCAGE ANTI-BOT (CLOUDFLARE TURNSTILE AUTONOME) ---
            if (data && (data.human_verification_required === true || data.code === 'human_verification_required')) {
                console.warn('[WM-BulkOpener] 🛡️ Vérification anti-bot requise ! Déclenchement de Turnstile autonome...');
                openerState.isPausedForBot = true;

                updateStatusBanner(
                    '⏳ Vérification anti-bot requise...',
                    `Paquet ${currentPackIndex} suspendu`,
                    true
                );

                if (typeof window.logToPanel === 'function') {
                    window.logToPanel('⏳ Vérification anti-bot requise : affichage du challenge Cloudflare Turnstile...');
                }

                // Déclenchement autonome du widget Turnstile (ou attente via intercepteur si résolu en parallèle)
                const checkConfirmed = await Promise.race([
                    triggerAutonomousTurnstile(),
                    waitForHumanCheckSuccess()
                ]);
                openerState.isPausedForBot = false;

                const leftoverModal = document.getElementById('wm-turnstile-modal-overlay');
                if (leftoverModal) leftoverModal.remove();

                if (!checkConfirmed || openerState.stopRequested) {
                    break;
                }

                updateStatusBanner(
                    '✅ Vérification validée ! Reprise dans 1s...',
                    `${openerState.openedCount} / ${totalToOpen}`,
                    false
                );

                // Délai de stabilisation de 1 seconde demandé avant de ré-exécuter le paquet suspendu
                await sleepInterruptible(1000);
                continue; // Ré-exécute le MÊME currentPackIndex
            }

            // --- CAS 1.5 : RATE LIMIT HTTP 429 (Trop de requêtes) ---
            if (response && response.status === 429) {
                console.warn('[WM-BulkOpener] ⏳ Rate limit (429) détecté sur /api/packs/open. Pause de 3.5s...');
                updateStatusBanner(
                    `⏳ Rate-limit serveur (trop rapide), pause de 3.5s...`,
                    `${openerState.openedCount} / ${totalToOpen}`,
                    false
                );
                if (typeof window.logToPanel === 'function') {
                    window.logToPanel('⏳ Rate-limit serveur (429), pause temporisée de 3.5s...');
                }
                await sleepInterruptible(3500);
                continue; // Ré-exécute le même paquet sans abandonner !
            }

            // --- CAS 2 : AUTRE ERREUR API (Plus de paquets, etc.) ---
            if (!response.ok || !data || !Array.isArray(data.cards)) {
                const errMsg = data?.error || `Erreur HTTP ${response?.status || '?'}`;
                console.warn('[WM-BulkOpener] 🛑 Arrêt sur réponse non valide :', errMsg);
                updateStatusBanner(`⚠️ ${errMsg}`, `${openerState.openedCount} / ${totalToOpen}`, false);
                if (typeof window.logToPanel === 'function') {
                    window.logToPanel(`⚠️ Fin anticipée de l'ouverture : ${errMsg}`);
                }
                break;
            }

            // --- CAS 3 : SUCCÈS D'OUVERTURE DU PAQUET ---
            openerState.openedCount++;
            const cards = data.cards || [];
            const ownedCopies = data.owned_copies || [];

            for (const rawCard of cards) {
                const obtainIdx = openerState.pulledCards.length + 1;
                const entry = normalizePulledCardEntry(rawCard, ownedCopies, obtainIdx);
                openerState.pulledCards.push(entry);
            }

            // Mise à jour du nombre de paquets restants
            if (typeof data.packs_remaining === 'number') {
                openerState.availablePacks = data.packs_remaining;
                updateNativePackCounterInDOM(data.packs_remaining);
            }

            const pctAfter = Math.round((openerState.openedCount / totalToOpen) * 100);
            updateStatusBanner(
                `✅ Paquet ${currentPackIndex} ouvert (+${cards.length} cartes)`,
                `${openerState.openedCount} / ${totalToOpen} (${openerState.pulledCards.length} cartes)`,
                false,
                pctAfter
            );

            if (typeof data.packs_remaining === 'number' && data.packs_remaining <= 0 && currentPackIndex < totalToOpen) {
                if (typeof window.logToPanel === 'function') {
                    window.logToPanel('ℹ️ Tous vos paquets disponibles ont été ouverts.');
                }
                break;
            }

            currentPackIndex++;
            networkRetryCount = 0; // Réinitialise le compteur de tentatives réseau après chaque succès

            // Temporisation de sécurité (1.3s à 1.8s ± 200ms) avant le paquet suivant
            if (currentPackIndex <= totalToOpen && !openerState.stopRequested) {
                const delay = getRandomPackDelayMs();
                await sleepInterruptible(delay);
            }
        }

        // --- FIN DE LA BOUCLE ---
        openerState.isRunning = false;
        openerState.isPausedForBot = false;
        window._wmBulkOpeningActive = false;
        if (window.WikiM) window.WikiM.isBulkOpening = false;

        if (stopBtn) stopBtn.style.display = 'none';
        if (qtyInput) qtyInput.disabled = false;
        syncBulkOpenerBarWithDOM();

        const finalMsg = openerState.stopRequested
            ? `⏹️ Ouverture interrompue (${openerState.openedCount} paquet(s) ouvert(s), ${openerState.pulledCards.length} cartes)`
            : `🎉 Tirage terminé : ${openerState.openedCount} paquet(s) ouvert(s) (${openerState.pulledCards.length} cartes obtenues)`;

        updateStatusBanner(finalMsg, `${openerState.pulledCards.length} cartes`, false, 100);
        if (typeof window.logToPanel === 'function') {
            window.logToPanel(finalMsg);
        }

        if (openerState.pulledCards.length > 0) {
            openBulkPullSummaryModal(openerState.pulledCards);
        }
    }

    // ============================================================
    // 5. MODALE DE FIN DE TIRAGE (RÉCAPITULATIF, FILTRES, PRIX & AUTO-TAGGING)
    // ============================================================
    function getCardResolvedPrice(entry) {
        if (typeof window.wmGetPriceFor !== 'function') return null;
        const byUuid = window.wmGetPriceFor(entry.cardId, entry.rarity);
        if (byUuid !== null && byUuid !== undefined && !isNaN(byUuid)) return Number(byUuid);
        const byTitle = window.wmGetPriceFor(entry.title, entry.rarity);
        if (byTitle !== null && byTitle !== undefined && !isNaN(byTitle)) return Number(byTitle);
        return null;
    }

    function getCardPriceStatus(entry) {
        const val = getCardResolvedPrice(entry);
        if (val !== null) return { state: 'READY', value: val };
        const rawCache = (window.wmPrices && (window.wmPrices[entry.cardId] || window.wmPrices[entry.title])) || null;
        if (rawCache === 'LOADING' || (window.wmFetching && window.wmFetching.has(entry.cardId))) {
            return { state: 'LOADING', value: null };
        }
        if (rawCache === 'EMPTY') return { state: 'EMPTY', value: null };
        if (rawCache === 'ERROR') return { state: 'ERROR', value: null };
        return { state: 'UNKNOWN', value: null };
    }

    /**
     * Réévalue les règles d'auto-tag sur toutes les cartes tirées (notamment quand les prix en tâche de fond arrivent)
     * tout en respectant les tags retirés ou ajoutés manuellement par l'utilisateur.
     */
    function reevaluateRulesForPulledCards(pulledEntries) {
        const rules = typeof window.getTagGroups === 'function'
            ? window.getTagGroups().flatMap(g => g.rules || []).filter(r => r.enabled !== false && r.tagId)
            : [];

        if (!rules.length || typeof window.evaluateAllRules !== 'function') return false;

        let anyChanged = false;
        for (const entry of pulledEntries) {
            const matchedTagIds = window.evaluateAllRules(entry.evalCardObj, rules, window.wmPrices || {});
            for (const tagId of matchedTagIds) {
                // N'ajoute pas un tag que l'utilisateur a explicitement retiré avec la croix ✕
                if (!entry.removedAutoTags.has(tagId) && !entry.suggestedTags.has(tagId)) {
                    entry.suggestedTags.add(tagId);
                    anyChanged = true;
                }
            }
        }
        return anyChanged;
    }

    function openBulkPullSummaryModal(pulledEntries) {
        ensureBulkOpenerStyles();

        const existingModal = document.getElementById('wm-bo-summary-overlay');
        if (existingModal) existingModal.remove();

        // État local de la modale
        let activeRarityFilter = 'ALL'; // 'ALL' | 'L' | 'UR' | 'SR' | 'R' | 'PC' | 'C'
        let currentSortMode = 'rarity_desc';
        let searchQuery = '';
        let isApplyingBatch = false;

        // Récupération progressive et ultra-sécurisée des prix manquants (1s+ de délai strict entre chaque requête)
        const uniqueMissingList = [];
        const seenUuids = new Set();
        pulledEntries.forEach(entry => {
            if (entry.cardId && getCardResolvedPrice(entry) === null && !seenUuids.has(entry.cardId)) {
                seenUuids.add(entry.cardId);
                uniqueMissingList.push({ uuid: entry.cardId, title: entry.title });
            }
        });

        let priceQueueAborted = false;

        async function processMissingPricesSlowly() {
            if (uniqueMissingList.length === 0) return;

            for (let i = 0; i < uniqueMissingList.length; i++) {
                if (priceQueueAborted || !document.getElementById('wm-bo-summary-overlay')) break;

                const { uuid, title } = uniqueMissingList[i];

                // Si le prix a déjà été résolu entre-temps par le cache
                const resolved = (typeof window.wmGetPriceFor === 'function')
                    ? (window.wmGetPriceFor(uuid, 'C') ?? window.wmGetPriceFor(title, 'C'))
                    : null;

                if (resolved === null) {
                    try {
                        const res = await fetch(`https://www.wiki-masters.com/api/marketplace/cards/${uuid}/sales?scope=summary`, {
                            credentials: "include",
                            method: "GET",
                            headers: { "Accept": "application/json" }
                        });

                        if (res.status === 429) {
                            console.warn(`[WM-BulkOpener] ⏳ 429 sur prix pour "${title}", pause de sécurité de 3.5s...`);
                            await new Promise(r => setTimeout(r, 3500));
                        } else if (res.ok) {
                            const data = await res.json();
                            if (typeof window.wmSavePriceToCache === 'function') {
                                window.wmSavePriceToCache(title, data, uuid);
                            }
                        }
                    } catch (e) {
                        console.warn(`[WM-BulkOpener] Échec prix pour "${title}":`, e.message);
                    }
                }

                // Met à jour la modale
                handleBackgroundPriceUpdate();

                // Délai STRICT d'au moins 1.1s à 1.3s entre chaque appel de prix pour ne jamais surcharger l'API
                await new Promise(r => setTimeout(r, 2200 + Math.random() * 400));
            }
        }

        // Démarrage doux de la file de prix une fois la modale rendue
        setTimeout(processMissingPricesSlowly, 500);

        // Comptage par rareté
        const rarityCounts = { L: 0, UR: 0, SR: 0, R: 0, PC: 0, C: 0 };
        pulledEntries.forEach(e => {
            if (rarityCounts[e.rarity] !== undefined) rarityCounts[e.rarity]++;
            else rarityCounts.C++;
        });

        const overlay = document.createElement('div');
        overlay.id = 'wm-bo-summary-overlay';
        overlay.innerHTML = `
            <div class="wm-bo-modal" role="dialog" aria-modal="true">
                <!-- EN-TÊTE & STATISTIQUES PAR RARETÉ -->
                <div class="wm-bo-modal-header">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="font-size:20px;">🎉</span>
                            <h3 style="margin:0;font-size:17px;font-weight:800;color:#f8fafc;">
                                Récapitulatif du Tirage — <span style="color:#818cf8;">${pulledEntries.length} carte(s) obtenue(s)</span>
                            </h3>
                        </div>
                        <span style="font-size:11px;color:#94a3b8;">
                            Cliquez sur une pastille de rareté pour filtrer • Ajustez vos étiquettes avant de les appliquer en lot.
                        </span>
                    </div>

                    <div class="wm-bo-rarity-pills" id="wm-bo-rarity-pills">
                        <div class="wm-bo-rarity-pill is-active" data-rarity-filter="ALL" style="background:#334155;color:#f8fafc;">
                            <span>Toutes</span>
                            <span style="opacity:0.8;">(${pulledEntries.length})</span>
                        </div>
                        ${['L', 'UR', 'SR', 'R', 'PC', 'C'].map(rKey => {
                            const cfg = RARITY_CONFIG[rKey];
                            const count = rarityCounts[rKey] || 0;
                            return `
                                <div class="wm-bo-rarity-pill ${count === 0 ? 'is-zero' : ''}" data-rarity-filter="${rKey}" style="background:${cfg.bg};color:${cfg.text};" title="Filtrer : ${cfg.name}">
                                    <span>${cfg.label}</span>
                                    <span>${count}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <!-- BARRE D'OUTILS, RECHERCHE, TRI & BOUTON AUTO-TAG -->
                <div class="wm-bo-toolbar">
                    <div style="display:flex;gap:10px;flex-wrap:wrap;flex:1;min-width:260px;align-items:center;">
                        <input type="text" id="wm-bo-search-input" class="wm-bo-input" placeholder="🔍 Rechercher une carte par nom..." style="flex:1;min-width:190px;">

                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-size:11px;font-weight:700;color:#94a3b8;">Trier par :</span>
                            <select id="wm-bo-sort-select" class="wm-bo-select">
                                <option value="rarity_desc">💎 Rareté (L → C)</option>
                                <option value="price_desc">💰 Prix moyen WB (Décroissant)</option>
                                <option value="price_asc">🪙 Prix moyen WB (Croissant)</option>
                                <option value="tags_desc">🏷️ Nombre de tags à appliquer</option>
                                <option value="obtain_asc">⏱️ Ordre d'obtention</option>
                                <option value="title_asc">🔤 Titre alphabétique (A → Z)</option>
                            </select>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                        <button type="button" id="wm-bo-bulk-delete-btn" class="wm-bo-bulk-delete-btn" disabled>
                            🗑️ Défausser la sélection (0)
                        </button>
                        <button type="button" id="wm-bo-apply-tags-btn" class="wm-bo-apply-tags-btn">
                            🏷️ Appliquer les tags suggérés (0 tags)
                        </button>
                    </div>
                </div>

                <!-- LISTE DES CARTES OBTENUES -->
                <div class="wm-bo-cards-list" id="wm-bo-cards-list"></div>

                <!-- PIED DE MODALE -->
                <div class="wm-bo-modal-footer">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span id="wm-bo-footer-stats" style="font-size:12px;color:#94a3b8;font-family:monospace;"></span>
                        <span id="wm-bo-price-sync-indicator" style="font-size:11px;color:#38bdf8;"></span>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button type="button" id="wm-bo-close-btn" class="wm-bo-btn-main" style="background:#334155;box-shadow:none;padding:8px 20px;">
                            Fermer le récapitulatif
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const listContainer = overlay.querySelector('#wm-bo-cards-list');
        const searchInput = overlay.querySelector('#wm-bo-search-input');
        const sortSelect = overlay.querySelector('#wm-bo-sort-select');
        const applyTagsBtn = overlay.querySelector('#wm-bo-apply-tags-btn');
        const bulkDeleteBtn = overlay.querySelector('#wm-bo-bulk-delete-btn');
        let isDeletingBatch = false;
        const footerStats = overlay.querySelector('#wm-bo-footer-stats');
        const priceSyncIndicator = overlay.querySelector('#wm-bo-price-sync-indicator');
        const rarityPills = overlay.querySelectorAll('[data-rarity-filter]');

        const closeAllDropdowns = () => {
            overlay.querySelectorAll('.wm-bo-tag-dropdown').forEach(d => d.remove());
        };
        overlay.addEventListener('click', closeAllDropdowns);

        // Compte le nombre total de paires (user_card_id, tag_id) non encore appliquées
        function getPendingTagPairs() {
            const pairs = [];
            for (const entry of pulledEntries) {
                if (!entry.userCardId) continue;
                for (const tagId of entry.suggestedTags) {
                    if (!entry.appliedTags.has(tagId)) {
                        pairs.push({
                            user_card_id: entry.userCardId,
                            tag_id: tagId,
                            entry
                        });
                    }
                }
            }
            return pairs;
        }

        function updateApplyButtonAndFooter() {
            const pendingPairs = getPendingTagPairs();
            const count = pendingPairs.length;

            if (!isApplyingBatch) {
                applyTagsBtn.disabled = count === 0;
                applyTagsBtn.textContent = count > 0
                    ? `🏷️ Appliquer les tags suggérés (${count} tag${count > 1 ? 's' : ''})`
                    : `✅ Aucun tag en attente (0 tag)`;
            }

            if (!isDeletingBatch && bulkDeleteBtn) {
                const markedCount = pulledEntries.filter(e => e.isMarkedForDelete && !e.isDeleted).length;
                bulkDeleteBtn.disabled = markedCount === 0;
                bulkDeleteBtn.textContent = markedCount > 0
                    ? `🗑️ Défausser la sélection (${markedCount})`
                    : `🗑️ Défausser la sélection (0)`;
            }

            // Calcul de la valeur totale estimée WB
            let totalWbValue = 0;
            let pricedCount = 0;
            let loadingCount = 0;

            for (const entry of pulledEntries) {
                const status = getCardPriceStatus(entry);
                if (status.state === 'READY' && typeof status.value === 'number') {
                    totalWbValue += status.value;
                    pricedCount++;
                } else if (status.state === 'LOADING') {
                    loadingCount++;
                }
            }

            footerStats.textContent = `💰 Valeur cumulée estimée : ${Math.round(totalWbValue).toLocaleString('fr-FR')} WB (${pricedCount}/${pulledEntries.length} cartes évaluées)`;
            priceSyncIndicator.textContent = loadingCount > 0
                ? `⏳ Récupération des prix en cours (${loadingCount} restant(s))...`
                : '';
        }

        function getFilteredAndSortedEntries() {
            const q = searchQuery.trim().toLowerCase();

            const filtered = pulledEntries.filter(entry => {
                if (activeRarityFilter !== 'ALL' && entry.rarity !== activeRarityFilter) {
                    return false;
                }
                if (q && !entry.title.toLowerCase().includes(q) && !(entry.category || '').toLowerCase().includes(q)) {
                    return false;
                }
                return true;
            });

            filtered.sort((a, b) => {
                switch (currentSortMode) {
                    case 'rarity_desc': {
                        const rDiff = (RARITY_CONFIG[b.rarity]?.order ?? 0) - (RARITY_CONFIG[a.rarity]?.order ?? 0);
                        if (rDiff !== 0) return rDiff;
                        const pA = getCardResolvedPrice(a) ?? -1;
                        const pB = getCardResolvedPrice(b) ?? -1;
                        return pB - pA;
                    }
                    case 'price_desc': {
                        const pA = getCardResolvedPrice(a) ?? -1;
                        const pB = getCardResolvedPrice(b) ?? -1;
                        if (pB !== pA) return pB - pA;
                        return (RARITY_CONFIG[b.rarity]?.order ?? 0) - (RARITY_CONFIG[a.rarity]?.order ?? 0);
                    }
                    case 'price_asc': {
                        const pA = getCardResolvedPrice(a) ?? Number.MAX_SAFE_INTEGER;
                        const pB = getCardResolvedPrice(b) ?? Number.MAX_SAFE_INTEGER;
                        if (pA !== pB) return pA - pB;
                        return (RARITY_CONFIG[b.rarity]?.order ?? 0) - (RARITY_CONFIG[a.rarity]?.order ?? 0);
                    }
                    case 'tags_desc': {
                        const tDiff = b.suggestedTags.size - a.suggestedTags.size;
                        if (tDiff !== 0) return tDiff;
                        return (RARITY_CONFIG[b.rarity]?.order ?? 0) - (RARITY_CONFIG[a.rarity]?.order ?? 0);
                    }
                    case 'title_asc':
                        return a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' });
                    case 'obtain_asc':
                    default:
                        return a.obtainIndex - b.obtainIndex;
                }
            });

            return filtered;
        }

        function renderCardPriceBadgeHtml(entry) {
            const status = getCardPriceStatus(entry);
            if (status.state === 'READY') {
                return `<span class="wm-bo-price-badge" data-price-uid="${entry.uid}">💰 ${Math.round(status.value).toLocaleString('fr-FR')} WB</span>`;
            }
            if (status.state === 'LOADING') {
                return `<span class="wm-bo-price-badge is-loading" data-price-uid="${entry.uid}">⏳ Chargement...</span>`;
            }
            if (status.state === 'EMPTY') {
                return `<span class="wm-bo-price-badge is-empty" data-price-uid="${entry.uid}">Aucune vente</span>`;
            }
            if (status.state === 'ERROR') {
                return `<span class="wm-bo-price-badge is-empty" style="color:#f87171;" data-price-uid="${entry.uid}">Erreur prix</span>`;
            }
            return `<span class="wm-bo-price-badge is-loading" data-price-uid="${entry.uid}">⏳ En file...</span>`;
        }

        function renderTagsZoneForEntry(entry, tagsZoneEl) {
            tagsZoneEl.innerHTML = '';

            // Affichage de chaque tag suggéré / sélectionné avec bouton croix ✕
            entry.suggestedTags.forEach(tagId => {
                const tagObj = (window.wmTagsCache || []).find(t => t.id === tagId);
                const tagName = tagObj ? tagObj.name : 'Tag';
                const tagColor = tagObj ? (tagObj.color || '#6366f1') : '#6366f1';
                const isApplied = entry.appliedTags.has(tagId);

                const chip = document.createElement('span');
                chip.className = `wm-bo-tag-chip ${isApplied ? 'is-applied' : ''}`;
                chip.style.backgroundColor = tagColor;
                chip.title = isApplied ? `Tag "${tagName}" déjà appliqué` : `Tag suggéré : "${tagName}"`;
                chip.innerHTML = `
                    <span>${isApplied ? '✓ ' : ''}${escapeHtml(tagName)}</span>
                    <button type="button" class="wm-bo-tag-remove" title="Retirer ce tag">✕</button>
                `;

                chip.querySelector('.wm-bo-tag-remove').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    // Si le tag avait déjà été appliqué via l'API dans cette session, on le retire aussi côté serveur
                    if (isApplied && entry.userCardId && typeof window.wmRemoveTagsBatch === 'function') {
                        try {
                            await window.wmRemoveTagsBatch([{ user_card_id: entry.userCardId, tag_id: tagId }]);
                        } catch (err) {}
                        entry.appliedTags.delete(tagId);
                    }
                    entry.suggestedTags.delete(tagId);
                    entry.removedAutoTags.add(tagId);
                    renderTagsZoneForEntry(entry, tagsZoneEl);
                    updateApplyButtonAndFooter();
                });

                tagsZoneEl.appendChild(chip);
            });

            // Bouton '+' avec menu rapide recherchable (identique au raccourci 'K')
            const addWrap = document.createElement('div');
            addWrap.className = 'wm-bo-tag-add-wrap';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'wm-bo-tag-add-btn';
            addBtn.title = 'Ajouter une étiquette (recherche rapide)';
            addBtn.textContent = '+';

            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const alreadyOpen = addWrap.querySelector('.wm-bo-tag-dropdown');
                closeAllDropdowns();
                if (alreadyOpen) return;

                const dropdown = document.createElement('div');
                dropdown.className = 'wm-bo-tag-dropdown';
                dropdown.addEventListener('click', ev => ev.stopPropagation());

                const allAvailable = (window.wmTagsCache || []).filter(t => !entry.suggestedTags.has(t.id));
                allAvailable.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

                const searchInp = document.createElement('input');
                searchInp.type = 'text';
                searchInp.className = 'wm-bo-tag-search-input';
                searchInp.placeholder = '🔍 Filtrer un tag (ex: film)...';
                searchInp.autocomplete = 'off';

                const listEl = document.createElement('div');
                listEl.className = 'wm-bo-tag-dropdown-list';

                let selectedIdx = 0;
                let currentFiltered = [...allAvailable];

                const renderTagItems = () => {
                    listEl.innerHTML = '';
                    if (currentFiltered.length === 0) {
                        listEl.innerHTML = `<div style="padding:10px;font-size:11px;color:#94a3b8;text-align:center;">Aucun tag trouvé</div>`;
                        return;
                    }

                    currentFiltered.forEach((t, idx) => {
                        const item = document.createElement('button');
                        item.type = 'button';
                        item.className = `wm-bo-tag-dropdown-item ${idx === selectedIdx ? 'is-selected' : ''}`;
                        if (idx === selectedIdx) item.style.background = 'rgba(99, 102, 241, 0.28)';
                        item.innerHTML = `
                            <span style="width:12px;height:12px;border-radius:3px;background:${escapeHtml(t.color || '#6366f1')};flex-shrink:0;"></span>
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(t.name)}</span>
                        `;
                        item.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            entry.removedAutoTags.delete(t.id);
                            entry.suggestedTags.add(t.id);
                            closeAllDropdowns();
                            renderTagsZoneForEntry(entry, tagsZoneEl);
                            updateApplyButtonAndFooter();
                        });
                        listEl.appendChild(item);
                    });
                };

                searchInp.addEventListener('input', () => {
                    const q = searchInp.value.trim().toLowerCase();
                    currentFiltered = allAvailable.filter(t => t.name.toLowerCase().includes(q));
                    selectedIdx = 0;
                    renderTagItems();
                });

                searchInp.addEventListener('keydown', (ev) => {
                    if (ev.key === 'ArrowDown') {
                        ev.preventDefault();
                        if (currentFiltered.length > 0) {
                            selectedIdx = (selectedIdx + 1) % currentFiltered.length;
                            renderTagItems();
                        }
                    } else if (ev.key === 'ArrowUp') {
                        ev.preventDefault();
                        if (currentFiltered.length > 0) {
                            selectedIdx = (selectedIdx - 1 + currentFiltered.length) % currentFiltered.length;
                            renderTagItems();
                        }
                    } else if (ev.key === 'Enter') {
                        ev.preventDefault();
                        if (currentFiltered[selectedIdx]) {
                            const chosen = currentFiltered[selectedIdx];
                            entry.removedAutoTags.delete(chosen.id);
                            entry.suggestedTags.add(chosen.id);
                            closeAllDropdowns();
                            renderTagsZoneForEntry(entry, tagsZoneEl);
                            updateApplyButtonAndFooter();
                        }
                    } else if (ev.key === 'Escape') {
                        ev.preventDefault();
                        closeAllDropdowns();
                    }
                });

                dropdown.appendChild(searchInp);
                dropdown.appendChild(listEl);
                renderTagItems();

                addWrap.appendChild(dropdown);
                setTimeout(() => searchInp.focus(), 20);
            });

            addWrap.appendChild(addBtn);
            tagsZoneEl.appendChild(addWrap);

            // Bouton poubelle placé à droite du bouton + pour marquer la carte pour défausse groupée
            const trashBtn = document.createElement('button');
            trashBtn.type = 'button';
            trashBtn.className = `wm-bo-trash-btn ${entry.isMarkedForDelete ? 'is-active' : ''}`;
            trashBtn.title = entry.isMarkedForDelete ? 'Ne plus défausser' : 'Marquer cette carte pour défausse groupée';
            trashBtn.disabled = entry.isDeleted;
            trashBtn.textContent = '🗑️';

            trashBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                entry.isMarkedForDelete = !entry.isMarkedForDelete;
                trashBtn.classList.toggle('is-active', entry.isMarkedForDelete);
                trashBtn.title = entry.isMarkedForDelete ? 'Ne plus défausser' : 'Marquer cette carte pour défausse groupée';
                const row = tagsZoneEl.closest('.wm-bo-card-row');
                if (row) row.classList.toggle('is-marked-delete', entry.isMarkedForDelete);
                updateApplyButtonAndFooter();
            });

            tagsZoneEl.appendChild(trashBtn);
        }

        function renderCardsList() {
            const entries = getFilteredAndSortedEntries();
            listContainer.innerHTML = '';

            if (entries.length === 0) {
                listContainer.innerHTML = `
                    <div style="padding:48px 20px;text-align:center;color:#64748b;font-size:13px;">
                        Aucune carte ne correspond aux filtres sélectionnés.
                    </div>
                `;
                updateApplyButtonAndFooter();
                return;
            }

            const fragment = document.createDocumentFragment();

            entries.forEach(entry => {
                const rCfg = RARITY_CONFIG[entry.rarity] || RARITY_CONFIG.C;
                const row = document.createElement('div');
                row.className = `wm-bo-card-row ${entry.isMarkedForDelete ? 'is-marked-delete' : ''} ${entry.isDeleted ? 'is-card-deleted' : ''}`;
                row.dataset.entryUid = entry.uid;

                row.innerHTML = `
                    <div class="wm-bo-card-left">
                        <div class="wm-bo-thumb">
                            ${entry.image_url
                                ? `<img src="${escapeHtml(entry.image_url)}" alt="${escapeHtml(entry.title)}" loading="lazy">`
                                : `<span style="font-size:18px;">🃏</span>`
                            }
                        </div>

                        <span class="wm-bo-rarity-badge" style="background:${rCfg.bg};color:${rCfg.text};" title="${escapeHtml(rCfg.name)}">
                            ${escapeHtml(rCfg.label)}
                        </span>

                        <div style="min-width:0;flex:1;">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <a href="${escapeHtml(entry.wikipedia_url)}" target="_blank" rel="noopener noreferrer" class="wm-bo-card-title-link" title="Ouvrir l'article Wikipédia : ${escapeHtml(entry.title)}">
                                    ${escapeHtml(entry.title)}
                                </a>
                                ${entry.is_shiny ? `<span style="background:linear-gradient(135deg,#fde047,#f59e0b);color:#000;font-size:9px;font-weight:900;padding:1px 6px;border-radius:4px;">✨ SHINY</span>` : ''}
                                ${entry.isDeleted ? `<span style="background:rgba(239,68,68,0.2);color:#fca5a5;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;border:1px solid rgba(239,68,68,0.4);">🗑️ Défaussée (+1 WB)</span>` : ''}
                            </div>
                            <div class="wm-bo-card-meta">
                                <span class="wm-bo-price-slot">${renderCardPriceBadgeHtml(entry)}</span>
                                ${entry.category ? `<span>📂 ${escapeHtml(entry.category)}</span>` : ''}
                                ${entry.atk !== undefined ? `<span>⚔️ ${entry.atk} / 🛡️ ${entry.def}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="wm-bo-tags-zone"></div>
                `;



                const tagsZone = row.querySelector('.wm-bo-tags-zone');
                renderTagsZoneForEntry(entry, tagsZone);

                fragment.appendChild(row);
            });

            listContainer.appendChild(fragment);
            updateApplyButtonAndFooter();
        }

        /**
         * Mise à jour granulaire en temps réel lorsque `prices.js` termine un fetch en tâche de fond,
         * sans reconstruire le DOM ni fermer les menus déroulants ouverts.
         */
        function handleBackgroundPriceUpdate() {
            const tagsChanged = reevaluateRulesForPulledCards(pulledEntries);

            // Si l'utilisateur trie actuellement par prix ou par nombre de tags (et qu'un tag a changé), on rafraîchit l'ordre
            if (currentSortMode === 'price_desc' || currentSortMode === 'price_asc' || (tagsChanged && currentSortMode === 'tags_desc')) {
                renderCardsList();
                return;
            }

            // Sinon, mise à jour chirurgicale des badges de prix et des zones de tags dans le DOM
            pulledEntries.forEach(entry => {
                const row = listContainer.querySelector(`[data-entry-uid="${entry.uid}"]`);
                if (!row) return;
                const priceSlot = row.querySelector('.wm-bo-price-slot');
                if (priceSlot) {
                    const newHtml = renderCardPriceBadgeHtml(entry);
                    if (priceSlot.innerHTML !== newHtml) {
                        priceSlot.innerHTML = newHtml;
                    }
                }
                if (tagsChanged) {
                    const tagsZone = row.querySelector('.wm-bo-tags-zone');
                    if (tagsZone && !tagsZone.querySelector('.wm-bo-tag-dropdown')) {
                        renderTagsZoneForEntry(entry, tagsZone);
                    }
                }
            });

            updateApplyButtonAndFooter();
        }

        // Hook propre sur window.renderPricesOnAllCards appelé par prices.js à chaque réception de prix
        const origRenderPrices = window.renderPricesOnAllCards;
        const hookedRenderPrices = function(...args) {
            if (typeof origRenderPrices === 'function') {
                try { origRenderPrices.apply(this, args); } catch (e) {}
            }
            handleBackgroundPriceUpdate();
        };
        window.renderPricesOnAllCards = hookedRenderPrices;
        if (window.WikiM) window.WikiM.renderPricesOnAllCards = hookedRenderPrices;

        // Filet de sécurité périodique (toutes les 1500ms) au cas où un prix est mis en cache sans déclencher renderPricesOnAllCards
        const priceRefreshTimer = setInterval(handleBackgroundPriceUpdate, 1500);

        // --- ÉCOUTEURS D'ÉVÉNEMENTS DE LA MODALE ---
        rarityPills.forEach(pill => {
            pill.addEventListener('click', () => {
                const clickedRarity = pill.dataset.rarityFilter;
                if (activeRarityFilter === clickedRarity && clickedRarity !== 'ALL') {
                    activeRarityFilter = 'ALL';
                } else {
                    activeRarityFilter = clickedRarity;
                }
                rarityPills.forEach(p => p.classList.toggle('is-active', p.dataset.rarityFilter === activeRarityFilter));
                renderCardsList();
            });
        });

        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value;
            renderCardsList();
        });

        sortSelect.addEventListener('change', () => {
            currentSortMode = sortSelect.value;
            renderCardsList();
        });

        // Écouteur pour la défausse groupée des cartes sélectionnées
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', async () => {
                if (isDeletingBatch) return;

                const markedEntries = pulledEntries.filter(e => e.isMarkedForDelete && !e.isDeleted);
                if (markedEntries.length === 0) return;

                const idsToDelete = markedEntries.map(e => e.userCardId).filter(Boolean);
                if (idsToDelete.length === 0) {
                    alert("Aucun identifiant utilisateur valide (user_card_id) trouvé pour défausser ces cartes.");
                    return;
                }

                if (!confirm(`🔥 SÉCURITÉ : Confirmer la défausse définitive de ces ${idsToDelete.length} carte(s) sélectionnée(s) ?\nElles seront supprimées de votre compte et converties en WB (+${idsToDelete.length} WB).`)) {
                    return;
                }

                isDeletingBatch = true;
                bulkDeleteBtn.disabled = true;
                bulkDeleteBtn.textContent = `⏳ Défausse de ${idsToDelete.length} carte(s)...`;

                try {
                    let res = null;
                    if (typeof window.executeBulkDiscard === 'function') {
                        res = await window.executeBulkDiscard(idsToDelete);
                    } else {
                        // Repli direct sur l'API si window.executeBulkDiscard n'est pas encore disponible
                        const resp = await fetch("https://www.wiki-masters.com/api/user-cards/bulk-discard", {
                            method: "POST",
                            credentials: "include",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ card_ids: idsToDelete })
                        });
                        const data = await resp.json();
                        res = { success: resp.ok, count: data?.discarded_count ?? idsToDelete.length, balance: data?.balance };
                    }

                    if (res && res.success) {
                        markedEntries.forEach(entry => {
                            entry.isDeleted = true;
                            entry.isMarkedForDelete = false;
                            entry.suggestedTags.clear(); // Les cartes défaussées ne reçoivent plus de tags
                        });

                        const successMsg = `🗑️ ${res.count} carte(s) défaussée(s) avec succès (+${res.count} WB) !`;
                        if (typeof window.logToPanel === 'function') window.logToPanel(successMsg);
                        if (typeof window.showWMToast === 'function') window.showWMToast(successMsg, true);
                        if (typeof res.balance === 'number' && typeof window.recordBalance === 'function') {
                            window.recordBalance(res.balance, 'bulk_discard');
                        }

                        renderCardsList();
                    } else {
                        throw new Error("L'API a renvoyé un statut d'échec.");
                    }
                } catch (err) {
                    console.error('[WM-BulkOpener] ❌ Erreur défausse groupée :', err);
                    alert(`Erreur lors de la défausse : ${err.message}`);
                } finally {
                    isDeletingBatch = false;
                    updateApplyButtonAndFooter();
                }
            });
        }

        applyTagsBtn.addEventListener('click', async () => {
            if (isApplyingBatch) return;
            const pendingPairs = getPendingTagPairs();
            if (pendingPairs.length === 0) return;

            const distinctCardsCount = new Set(pendingPairs.map(p => p.user_card_id)).size;
            if (!confirm(`Confirmer l'application de ${pendingPairs.length} étiquette(s) sur ${distinctCardsCount} carte(s) ?`)) {
                return;
            }

            isApplyingBatch = true;
            applyTagsBtn.disabled = true;
            applyTagsBtn.textContent = `⏳ Application de ${pendingPairs.length} tag(s)...`;

            try {
                const apiPayload = pendingPairs.map(p => ({
                    user_card_id: p.user_card_id,
                    tag_id: p.tag_id
                }));

                const res = await window.wmApplyTagsBatch(apiPayload);
                if (res && res.ok) {
                    // Marquer tous ces tags comme appliqués et mettre à jour le cache visuel WikiM
                    pendingPairs.forEach(({ entry, tag_id }) => {
                        entry.appliedTags.add(tag_id);
                        const tagObj = (window.wmTagsCache || []).find(t => t.id === tag_id);
                        if (tagObj && entry.title) {
                            if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                            if (!window.wmVisualTagsCache[entry.title]) window.wmVisualTagsCache[entry.title] = [];
                            if (!window.wmVisualTagsCache[entry.title].some(x => x.id === tag_id)) {
                                window.wmVisualTagsCache[entry.title].push({
                                    id: tag_id,
                                    name: tagObj.name,
                                    color: tagObj.color || '#a78bfa'
                                });
                            }
                        }
                    });

                    const successMsg = `✅ ${pendingPairs.length} étiquette(s) appliquée(s) avec succès !`;
                    if (typeof window.logToPanel === 'function') window.logToPanel(successMsg);
                    if (typeof window.showWMToast === 'function') window.showWMToast(successMsg, true);
                    if (typeof window.renderTagsOnAllCards === 'function') window.renderTagsOnAllCards();

                    renderCardsList();
                }
            } catch (err) {
                console.error('[WM-BulkOpener] ❌ Erreur lors de l\'application des tags :', err);
                const errMsg = `❌ Erreur lors de l'application des tags : ${err.message}`;
                if (typeof window.logToPanel === 'function') window.logToPanel(errMsg);
                if (typeof window.showWMToast === 'function') window.showWMToast(errMsg, false);
            } finally {
                isApplyingBatch = false;
                updateApplyButtonAndFooter();
            }
        });

        // Nettoyage complet à la fermeture de la modale
        const cleanupAndCloseModal = () => {
            priceQueueAborted = true; // Arrête immédiatement la file de récupération des prix
            clearInterval(priceRefreshTimer);
            if (window.renderPricesOnAllCards === hookedRenderPrices) {
                window.renderPricesOnAllCards = origRenderPrices;
                if (window.WikiM) window.WikiM.renderPricesOnAllCards = origRenderPrices;
            }
            document.removeEventListener('keydown', onEscKey);
            overlay.remove();
        };

        const onEscKey = (e) => {
            if (e.key === 'Escape') cleanupAndCloseModal();
        };
        document.addEventListener('keydown', onEscKey);

        overlay.querySelector('#wm-bo-close-btn').addEventListener('click', cleanupAndCloseModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanupAndCloseModal();
        });

        // Premier rendu
        renderCardsList();
    }

    // ============================================================
    // 6. OBSERVATEUR DOM & INITIALISATION AUTOMATIQUE SUR /pulls
    // ============================================================
    let domObserver = null;

    function initBulkPackOpener() {
        installHumanCheckInterceptor();

        // Vérification périodique légère & MutationObserver pour gérer la navigation SPA Next.js/React
        const checkRouteAndInject = () => {
            if (window.location.pathname.startsWith('/pulls')) {
                syncBulkOpenerBarWithDOM();
            } else {
                const existingBar = document.getElementById('wm-bulk-opener-bar');
                if (existingBar && !openerState.isRunning) {
                    existingBar.remove();
                }
            }
        };

        checkRouteAndInject();
        // Stocker la référence du timer pour permettre un nettoyage si nécessaire
        const routeCheckInterval = setInterval(checkRouteAndInject, 1200);
        window._wmBulkRouteCheckInterval = routeCheckInterval;

        if (!domObserver && document.body) {
            domObserver = new MutationObserver(() => {
                if (window.location.pathname.startsWith('/pulls') && !document.getElementById('wm-bulk-opener-bar')) {
                    syncBulkOpenerBarWithDOM();
                }
            });
            domObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBulkPackOpener);
    } else {
        initBulkPackOpener();
    }

    // --- Cross-module exports ---
    window.initBulkPackOpener = WikiM.initBulkPackOpener = initBulkPackOpener;
    window.startBulkPackOpening = WikiM.startBulkPackOpening = startBulkPackOpening;
    window.openBulkPullSummaryModal = WikiM.openBulkPullSummaryModal = openBulkPullSummaryModal;

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});