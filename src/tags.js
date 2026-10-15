// ============================================================
// WikiM - Module: Tags Engine, Rules & Tag Groups (Advanced Builder + Preview Modal + Gist Subscriptions)
// ============================================================
(function(W, WikiM) {
    'use strict';

    // Couleurs officielles des raretés pour les badges miniatures
    const RARITY_COLORS = {
        'C':  { bg: '#94a3b8', text: '#0f172a' },
        'PC': { bg: '#22c55e', text: '#052e16' },
        'R':  { bg: '#3b82f6', text: '#0f172a' },
        'SR': { bg: '#a855f7', text: '#0f172a' },
        'UR': { bg: '#f59e0b', text: '#0f172a' },
        'L':  { bg: '#ef4444', text: '#ffffff' }
    };

    // ============================================================
    // INJECTION DU CSS DE LA MODALE AVANCÉE, DES CHIPS, DE LA PREVIEW & DU GIST
    // ============================================================
    function ensureRuleBuilderStyles() {
        if (document.getElementById('wm-rule-builder-styles')) return;
        const style = document.createElement('style');
        style.id = 'wm-rule-builder-styles';
        style.textContent = `
            #wm-rule-builder-overlay, #wm-tag-preview-overlay, #wm-gist-map-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 23, 0.84);
                backdrop-filter: blur(8px);
                z-index: 100005;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                animation: wmFadeIn 0.15s ease-out;
            }
            @keyframes wmFadeIn {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }
            .wm-rb-modal {
                background: #0f172a;
                border: 1px solid rgba(99, 102, 241, 0.45);
                border-radius: 16px;
                width: 92vw;
                max-width: 960px;
                max-height: 88vh;
                display: flex;
                flex-direction: column;
                color: #f8fafc;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 30px rgba(99, 102, 241, 0.15);
                overflow: hidden;
            }
            .wm-preview-modal {
                max-width: 1000px;
                height: 85vh;
                max-height: 85vh;
            }
            .wm-rb-header {
                padding: 18px 24px;
                background: rgba(15, 23, 42, 0.95);
                border-bottom: 1px solid rgba(148, 163, 184, 0.15);
                display: flex;
                flex-wrap: wrap;
                justify-content: space-between;
                align-items: center;
                gap: 14px;
            }
            .wm-rb-preview-bar {
                padding: 12px 24px;
                background: rgba(2, 6, 23, 0.65);
                border-bottom: 1px solid rgba(148, 163, 184, 0.12);
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
                color: #e2e8f0;
            }
            .wm-rb-body {
                padding: 20px 24px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .wm-rb-group {
                background: rgba(30, 41, 59, 0.45);
                border-radius: 12px;
                padding: 14px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-left: 4px solid #6366f1;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transition: border-color 0.2s, background 0.2s;
            }
            .wm-rb-group.logic-or {
                border-left-color: #f59e0b;
                background: rgba(30, 41, 59, 0.35);
            }
            .wm-rb-group-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
            }
            .wm-rb-logic-toggle {
                display: inline-flex;
                background: rgba(15, 23, 42, 0.9);
                border: 1px solid rgba(148, 163, 184, 0.25);
                border-radius: 8px;
                padding: 2px;
                gap: 2px;
            }
            .wm-rb-logic-btn {
                border: none;
                background: transparent;
                color: #94a3b8;
                font-size: 11px;
                font-weight: 700;
                padding: 5px 12px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s;
            }
            .wm-rb-logic-btn.active-and {
                background: #4f46e5;
                color: #ffffff;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
            }
            .wm-rb-logic-btn.active-or {
                background: #d97706;
                color: #ffffff;
                box-shadow: 0 2px 8px rgba(217, 119, 6, 0.4);
            }
            .wm-rb-cond-row {
                background: rgba(15, 23, 42, 0.75);
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 10px;
                padding: 10px 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .wm-rb-cond-main {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                flex-wrap: wrap;
            }
            .wm-rb-select, .wm-rb-input {
                background: rgba(30, 41, 59, 0.9);
                border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 8px;
                padding: 8px 10px;
                color: #f8fafc;
                font-size: 12px;
                outline: none;
                transition: border-color 0.15s;
            }
            .wm-rb-select:focus, .wm-rb-input:focus {
                border-color: #6366f1;
            }
            .wm-rb-chips-box {
                flex: 1;
                min-width: 260px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .wm-rb-chips-interactive {
                background: rgba(30, 41, 59, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.28);
                border-radius: 8px;
                padding: 6px 8px;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                align-items: center;
                min-height: 38px;
            }
            .wm-rb-chips-interactive:focus-within {
                border-color: #6366f1;
                box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
            }
            .wm-rb-chip {
                background: rgba(99, 102, 241, 0.22);
                border: 1px solid rgba(99, 102, 241, 0.5);
                color: #e0e7ff;
                border-radius: 6px;
                padding: 3px 8px;
                font-size: 11px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
            .wm-rb-chip-del {
                background: none;
                border: none;
                color: #a5b4fc;
                cursor: pointer;
                padding: 0;
                font-size: 12px;
                line-height: 1;
            }
            .wm-rb-chip-del:hover {
                color: #ef4444;
            }
            .wm-rb-chip-input {
                background: transparent;
                border: none;
                color: #f8fafc;
                font-size: 12px;
                outline: none;
                flex: 1;
                min-width: 130px;
                padding: 2px 4px;
            }
            .wm-rb-raw-input-wrap {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 10px;
                color: #94a3b8;
            }
            .wm-rb-raw-input {
                flex: 1;
                background: rgba(15, 23, 42, 0.6);
                border: 1px dashed rgba(148, 163, 184, 0.25);
                border-radius: 6px;
                padding: 4px 8px;
                color: #cbd5e1;
                font-family: monospace;
                font-size: 11px;
                outline: none;
            }
            .wm-rb-raw-input:focus {
                border-color: #38bdf8;
                border-style: solid;
            }
            .wm-rb-divider-badge {
                align-self: center;
                font-size: 10px;
                font-weight: 800;
                padding: 2px 10px;
                border-radius: 999px;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .wm-rb-divider-and {
                background: rgba(79, 70, 229, 0.2);
                color: #a5b4fc;
                border: 1px solid rgba(99, 102, 241, 0.35);
            }
            .wm-rb-divider-or {
                background: rgba(217, 119, 6, 0.2);
                color: #fcd34d;
                border: 1px solid rgba(245, 158, 11, 0.35);
            }

            /* --- STYLES DE LA MODALE DE PRÉVISUALISATION DES TAGS --- */
            .wm-pv-toolbar {
                padding: 12px 24px;
                background: rgba(2, 6, 23, 0.65);
                border-bottom: 1px solid rgba(148, 163, 184, 0.14);
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
                justify-content: space-between;
            }
            .wm-pv-counter-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 700;
                font-family: 'JetBrains Mono', monospace;
            }
            .wm-pv-counter-add {
                background: rgba(16, 185, 129, 0.15);
                color: #34d399;
                border: 1px solid rgba(16, 185, 129, 0.35);
            }
            .wm-pv-counter-rem {
                background: rgba(239, 68, 68, 0.15);
                color: #f87171;
                border: 1px solid rgba(239, 68, 68, 0.35);
            }
            .wm-pv-list {
                padding: 16px 24px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .wm-pv-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 12px 16px;
                background: rgba(30, 41, 59, 0.55);
                border: 1px solid rgba(148, 163, 184, 0.16);
                border-radius: 12px;
                transition: all 0.15s ease;
            }
            .wm-pv-row:hover {
                border-color: rgba(99, 102, 241, 0.4);
                background: rgba(30, 41, 59, 0.8);
            }
            .wm-pv-row.is-disabled {
                opacity: 0.48;
                background: rgba(15, 23, 42, 0.4);
                border-color: rgba(148, 163, 184, 0.08);
            }
            .wm-pv-row.is-disabled .wm-pv-card-title {
                text-decoration: line-through;
                color: #64748b;
            }
            .wm-pv-card-info {
                display: flex;
                align-items: center;
                gap: 12px;
                min-width: 0;
                flex: 1;
            }
            .wm-pv-thumb {
                width: 42px;
                height: 56px;
                border-radius: 6px;
                background: rgba(15, 23, 42, 0.9);
                border: 1px solid rgba(148, 163, 184, 0.25);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
                position: relative;
            }
            .wm-pv-thumb img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            .wm-pv-rarity {
                padding: 2px 6px;
                border-radius: 5px;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.4px;
                flex-shrink: 0;
            }
            .wm-pv-card-title {
                font-weight: 700;
                font-size: 13px;
                color: #f1f5f9;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .wm-pv-card-meta {
                font-size: 11px;
                color: #94a3b8;
                display: flex;
                gap: 8px;
                align-items: center;
                margin-top: 2px;
            }
            .wm-pv-action-zone {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
                flex-wrap: wrap;
                justify-content: flex-end;
                max-width: 55%;
            }
            .wm-pv-tag-badge {
                position: relative;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 5px 12px 5px 10px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 800;
                color: #090d16;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
                user-select: none;
            }
            .wm-pv-tag-badge.is-remove {
                outline: 2px dashed #ef4444;
                opacity: 0.9;
            }
            .wm-pv-tag-prefix {
                font-family: 'JetBrains Mono', monospace;
                font-weight: 900;
                font-size: 11px;
                padding: 0 4px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.35);
                color: #000;
            }
            .wm-pv-tag-del {
                position: absolute;
                top: -6px;
                right: -6px;
                width: 17px;
                height: 17px;
                border-radius: 50%;
                background: #ef4444;
                color: #ffffff;
                border: 2px solid #0f172a;
                font-size: 10px;
                font-weight: 900;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                transition: transform 0.12s ease, background 0.12s ease;
            }
            .wm-pv-tag-del:hover {
                transform: scale(1.18);
                background: #dc2626;
            }
            .wm-pv-add-wrap {
                position: relative;
                display: inline-flex;
            }
            .wm-pv-add-btn {
                background: rgba(16, 185, 129, 0.16);
                color: #34d399;
                border: 1px dashed rgba(16, 185, 129, 0.55);
                border-radius: 8px;
                padding: 5px 10px;
                font-size: 11px;
                font-weight: 800;
                font-family: 'JetBrains Mono', monospace;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .wm-pv-add-btn:hover {
                background: rgba(16, 185, 129, 0.28);
                border-style: solid;
                color: #6ee7b7;
            }
            .wm-pv-add-menu {
                position: absolute;
                top: calc(100% + 6px);
                right: 0;
                background: #1e293b;
                border: 1px solid rgba(99, 102, 241, 0.5);
                border-radius: 10px;
                padding: 6px;
                min-width: 175px;
                max-height: 220px;
                overflow-y: auto;
                z-index: 100020;
                box-shadow: 0 12px 28px rgba(0, 0, 0, 0.75);
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .wm-pv-add-menu-item {
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
            .wm-pv-add-menu-item:hover {
                background: rgba(99, 102, 241, 0.25);
            }
            .wm-pv-footer {
                padding: 14px 24px;
                background: rgba(15, 23, 42, 0.95);
                border-top: 1px solid rgba(148, 163, 184, 0.15);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }

            /* --- STYLES ONGLETS IMPORT/EXPORT & ABONNEMENTS GIST --- */
            .wm-ie-tabs {
                display: flex;
                gap: 6px;
                background: rgba(2, 6, 23, 0.65);
                padding: 4px;
                border-radius: 10px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                margin-bottom: 14px;
            }
            .wm-ie-tab-btn {
                flex: 1;
                padding: 8px 12px;
                border: none;
                border-radius: 7px;
                background: transparent;
                color: #94a3b8;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s;
            }
            .wm-ie-tab-btn.active {
                background: #4f46e5;
                color: #ffffff;
                box-shadow: 0 2px 10px rgba(79, 70, 229, 0.35);
            }
            .wm-gist-group-card {
                background: rgba(30, 41, 59, 0.65);
                border: 1px solid rgba(148, 163, 184, 0.22);
                border-radius: 10px;
                padding: 12px 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .wm-gist-slot-row {
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.22);
                border-radius: 10px;
                padding: 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
            }
            .wm-sub-badge {
                background: rgba(14, 165, 233, 0.18);
                color: #38bdf8;
                border: 1px solid rgba(56, 189, 248, 0.4);
                font-size: 9px;
                font-weight: 800;
                padding: 2px 6px;
                border-radius: 999px;
                letter-spacing: 0.3px;
                text-transform: uppercase;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // MOTEUR D'AUTO-TAGGING SUPABASE (Intelligent & Anti-CORS)
    // ============================================================
    async function processAutoTags(pulledCards, ownedCopies = null) {
        const isAutoTagEnabled = localStorage.getItem('wmAutoTagEnabled') === 'true';
        if (!isAutoTagEnabled || !pulledCards || pulledCards.length === 0) return;

        try {
            console.log("[WM-Tags] 🏷️ Démarrage de l'Auto-Tagging intelligent...");

            const userId = (typeof W !== 'undefined' && W.wmUserId) ? W.wmUserId : window.wmUserId;
            if (!userId) throw new Error("ID utilisateur introuvable.");

            let physicalCards = null;
            if (Array.isArray(ownedCopies) && ownedCopies.length > 0) {
                console.log(`[WM-Tags] ⚡ Utilisation directe de ${ownedCopies.length} copies physiques fournies par le pack !`);
                physicalCards = ownedCopies;
            } else {
                physicalCards = await window.supabaseRequestWithRetry(
                    'GET',
                    `/rest/v1/user_cards?select=id,card_id&user_id=eq.${userId}&order=obtained_at.desc&limit=${pulledCards.length}`
                );
            }

            if (!physicalCards || !Array.isArray(physicalCards)) throw new Error("Impossible de récupérer les cartes physiques.");

            const activeRules = getFlatRules();
            if (activeRules.length === 0) return;

            const titlesNeedingPrice = pulledCards
                .map(pc => pc.wikipedia_title || pc.title)
                .filter(t => t && (!window.wmPrices[t] || window.wmPrices[t] === "LOADING"));

            if (titlesNeedingPrice.length > 0) {
                let waitTime = 0;
                while (waitTime < 30) {
                    const anyLoading = titlesNeedingPrice.some(t => !window.wmPrices[t] || window.wmPrices[t] === "LOADING");
                    if (!anyLoading) break;
                    await new Promise(r => setTimeout(r, 100));
                    waitTime++;
                }
            }

            const batchPairs = [];

            for (const pc of pulledCards) {
                const physical = physicalCards.find(p => p.card_id === pc.id);
                if (!physical) continue;

                const title = pc.wikipedia_title || pc.title;

                const cardForEval = {
                    id: pc.id,
                    userCardId: physical.id,
                    title: title,
                    rarity: pc.rarity,
                    category: pc.category,
                    summary: pc.summary || pc.extract || pc.description || ''
                };

                const desiredTagIds = window.evaluateAllRules(cardForEval, activeRules, window.wmPrices);

                for (const tagId of desiredTagIds) {
                    batchPairs.push({
                        user_card_id: physical.id,
                        tag_id: tagId,
                        title: title
                    });
                }
            }

            if (batchPairs.length > 0) {
                window.logToPanel(`🏷️ Auto-Tag : application groupée de ${batchPairs.length} étiquette(s)...`);
                await wmApplyTagsBatch(batchPairs);

                for (const item of batchPairs) {
                    const tagObj = window.wmTagsCache.find(t => t.id === item.tag_id);
                    const tagName = tagObj ? tagObj.name : 'Tag';
                    const tagColor = tagObj ? tagObj.color : '#a78bfa';

                    console.log(`[WM-Tags] ✅ Étiquette "${tagName}" appliquée sur ${item.title}`);

                    if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                    if (!window.wmVisualTagsCache[item.title]) window.wmVisualTagsCache[item.title] = [];
                    if (!window.wmVisualTagsCache[item.title].some(t => t.id === item.tag_id)) {
                        window.wmVisualTagsCache[item.title].push({ id: item.tag_id, name: tagName, color: tagColor });
                    }
                }

                if (typeof window.renderTagsOnAllCards === 'function') {
                    window.renderTagsOnAllCards();
                }
            }
        } catch (e) {
            console.error("[WM-Tags] ❌ Erreur d'Auto-Tagging :", e);
        }
    }

    async function wmFetchTags() {
        const tags = await window.supabaseRequestWithRetry('GET', '/rest/v1/tags?select=*');
        window.wmTagsCache = tags || [];
        return window.wmTagsCache;
    }

    async function wmCreateTag(name, color) {
        const userId = W.wmAuth.userId;
        if (!userId) throw new Error('user_id manquant');
        const result = await window.supabaseRequestWithRetry('POST', '/rest/v1/tags', {
            user_id: userId, name, color
        });
        const newTag = Array.isArray(result) ? result[0] : result;
        if (newTag) window.wmTagsCache.push(newTag);
        return newTag;
    }

    async function wmDeleteTag(tagId) {
        await window.supabaseRequestWithRetry('DELETE', `/rest/v1/tags?id=eq.${tagId}`);
        window.wmTagsCache = window.wmTagsCache.filter(t => t.id !== tagId);
    }

    async function wmFetchUserCardTags(userCardId) {
        if (window.wmUserCardTagsCache.has(userCardId)) {
            return window.wmUserCardTagsCache.get(userCardId);
        }
        const rows = await window.supabaseRequestWithRetry('GET',
            `/rest/v1/user_card_tags?select=*&user_card_id=eq.${userCardId}`);
        const tagIds = new Set((rows || []).map(r => r.tag_id));
        window.wmUserCardTagsCache.set(userCardId, tagIds);
        return tagIds;
    }

    async function wmApplyTagsBatch(pairs) {
        if (!Array.isArray(pairs) || pairs.length === 0) return { ok: true, count: 0 };

        const normalizedPairs = pairs.map(p => ({
            user_card_id: p.user_card_id || p.userCardId,
            tag_id: p.tag_id || p.tagId
        })).filter(p => p.user_card_id && p.tag_id);

        if (normalizedPairs.length === 0) return { ok: true, count: 0 };

        const BATCH_SIZE = 100;
        const totalBatches = Math.ceil(normalizedPairs.length / BATCH_SIZE);
        let successCount = 0;

        const path = '/rest/v1/user_card_tags?on_conflict=user_card_id%2Ctag_id&columns=%22user_card_id%22%2C%22tag_id%22';
        const extraHeaders = {
            'Prefer': 'resolution=ignore-duplicates, count=exact'
        };

        for (let i = 0; i < totalBatches; i++) {
            const batch = normalizedPairs.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
            try {
                await window.supabaseRequestWithRetry('POST', path, batch, {
                    label: `batch-tags lot ${i + 1}/${totalBatches}`
                }, extraHeaders);

                successCount += batch.length;

                for (const { user_card_id, tag_id } of batch) {
                    if (window.wmUserCardTagsCache) {
                        if (!window.wmUserCardTagsCache.has(user_card_id)) {
                            window.wmUserCardTagsCache.set(user_card_id, new Set());
                        }
                        window.wmUserCardTagsCache.get(user_card_id).add(tag_id);
                    }
                }
            } catch (e) {
                console.error(`[WM-Tags] ❌ Erreur lot ${i + 1} application tags :`, e);
                throw e;
            }

            if (i < totalBatches - 1) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return { ok: true, count: successCount };
    }

    async function wmRemoveTagsBatch(pairs) {
        if (!Array.isArray(pairs) || pairs.length === 0) return { ok: true, count: 0 };

        const byTag = new Map();
        for (const p of pairs) {
            const uId = p.user_card_id || p.userCardId;
            const tId = p.tag_id || p.tagId;
            if (!uId || !tId) continue;
            if (!byTag.has(tId)) byTag.set(tId, []);
            byTag.get(tId).push(uId);
        }

        let removedCount = 0;
        const BATCH_SIZE = 100;

        for (const [tagId, uIds] of byTag.entries()) {
            for (let i = 0; i < uIds.length; i += BATCH_SIZE) {
                const chunk = uIds.slice(i, i + BATCH_SIZE);
                const path = `/rest/v1/user_card_tags?user_card_id=in.(${chunk.join(',')})&tag_id=eq.${tagId}`;
                try {
                    await window.supabaseRequestWithRetry('DELETE', path);
                    removedCount += chunk.length;

                    for (const uId of chunk) {
                        if (window.wmUserCardTagsCache && window.wmUserCardTagsCache.has(uId)) {
                            window.wmUserCardTagsCache.get(uId).delete(tagId);
                        }
                    }
                } catch (e) {
                    console.error(`[WM-Tags] ❌ Erreur suppression tag ${tagId} :`, e);
                    throw e;
                }
                if (i + BATCH_SIZE < uIds.length) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        return { ok: true, count: removedCount };
    }

    async function wmApplyTag(userCardId, tagId) {
        try {
            await wmApplyTagsBatch([{ user_card_id: userCardId, tag_id: tagId }]);
            return { ok: true, skipped: false };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    async function wmRemoveTag(userCardId, tagId) {
        try {
            await wmRemoveTagsBatch([{ user_card_id: userCardId, tag_id: tagId }]);
            return { ok: true, skipped: false };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ============================================================
    // MOTEUR DE RÈGLES D'AUTO-TAGGING (GROUPES, NORMALISATION & GIST)
    // ============================================================
    const WM_TAG_GROUPS_KEY = 'wmTagGroups';
    const WM_SHARED_GIST_ID_KEY = 'wmSharedGistId';
    let cachedGistCatalog = null;

    function normalizeRuleStructure(rule) {
        if (!rule || typeof rule !== 'object') {
            return {
                id: 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                name: '',
                tagId: '',
                enabled: true,
                rootGroup: {
                    logic: 'AND',
                    children: [{ type: 'condition', field: 'title', operator: 'contains', value: '' }]
                }
            };
        }

        const cloned = JSON.parse(JSON.stringify(rule));
        if (!cloned.id) cloned.id = 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        if (cloned.enabled === undefined) cloned.enabled = true;
        if (typeof cloned.name !== 'string') cloned.name = '';

        if (cloned.rootGroup && Array.isArray(cloned.rootGroup.children)) {
            cloned.rootGroup = normalizeGroupNode(cloned.rootGroup);
            return cloned;
        }

        if (Array.isArray(cloned.conditions) && cloned.conditions.length > 0) {
            cloned.rootGroup = {
                logic: 'AND',
                children: cloned.conditions.map(c => ({
                    type: 'condition',
                    field: c.field || 'title',
                    operator: c.operator || 'contains',
                    value: c.value !== undefined ? c.value : ''
                }))
            };
        } else {
            cloned.rootGroup = {
                logic: 'AND',
                children: [{ type: 'condition', field: 'avgPrice', operator: '>', value: 100 }]
            };
        }

        return cloned;
    }

    function normalizeGroupNode(node) {
        if (!node || typeof node !== 'object') {
            return { logic: 'AND', children: [{ type: 'condition', field: 'title', operator: 'contains', value: '' }] };
        }
        const logic = (node.logic || node.operator || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
        const rawChildren = Array.isArray(node.children) ? node.children : [];
        const children = rawChildren.map(child => {
            if (child && (child.type === 'group' || Array.isArray(child.children))) {
                return {
                    type: 'group',
                    ...normalizeGroupNode(child)
                };
            }
            return {
                type: 'condition',
                field: child?.field || 'title',
                operator: child?.operator || 'contains',
                value: child?.value !== undefined ? child.value : ''
            };
        });

        if (children.length === 0) {
            children.push({ type: 'condition', field: 'title', operator: 'contains', value: '' });
        }

        return { type: 'group', logic, children };
    }

    function getTagGroups() {
        try {
            let groups = JSON.parse(localStorage.getItem(WM_TAG_GROUPS_KEY));
            if (!groups || !Array.isArray(groups)) {
                const oldRules = JSON.parse(localStorage.getItem('wmTagRules') || '[]');
                if (oldRules.length > 0) {
                    groups = [{
                        id: 'g_' + Date.now(),
                        name: 'Mes Anciennes Règles',
                        isOpen: true,
                        rules: oldRules.map(normalizeRuleStructure)
                    }];
                    saveTagGroups(groups);
                } else {
                    groups = [];
                }
            }
            return groups;
        } catch {
            return [];
        }
    }

    function saveTagGroups(groups) {
        localStorage.setItem(WM_TAG_GROUPS_KEY, JSON.stringify(groups));
    }

    function getFlatRules() {
        return getTagGroups()
            .flatMap(g => g.rules || [])
            .filter(r => r.enabled !== false && r.tagId && r.tagId !== '');
    }

    const WM_RULE_FIELDS = {
        'avgPrice': {
            label: 'Prix moyen',
            type: 'number',
            getter: (card, prices) => {
                return window.wmGetPriceFor(card.title, card.rarity);
            }
        },
        'rarity': {
            label: 'Rareté',
            type: 'enum',
            values: ['C', 'PC', 'R', 'SR', 'UR', 'L'],
            getter: (card) => card.rarity
        },
        'title': { label: 'Titre', type: 'string', getter: (card) => card.title || '' },
        'category': { label: 'Catégorie', type: 'string', getter: (card) => card.category || '' },
        'description': { label: 'Description', type: 'string', getter: (card) => card.summary || '' }
    };

    const WM_RULE_OPERATORS = {
        '>':  (a, b) => Number(a) > Number(b),
        '>=': (a, b) => Number(a) >= Number(b),
        '<':  (a, b) => Number(a) < Number(b),
        '<=': (a, b) => Number(a) <= Number(b),
        '=':  (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
        '!=': (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
        'contains': (a, b) => {
            const valA = String(a).toLowerCase();
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return false;
            return terms.some(term => valA.includes(term));
        },
        'not_contains': (a, b) => {
            const valA = String(a).toLowerCase();
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return true;
            return terms.every(term => !valA.includes(term));
        }
    };

    const WM_OPERATOR_LABELS = {
        'contains': 'contient',
        'not_contains': 'ne contient pas',
        '=': 'est égal à',
        '!=': 'est différent de',
        '>': '>',
        '>=': '≥',
        '<': '<',
        '<=': '≤'
    };

    function formatConditionNatural(cond, isHtml = false) {
        const fieldObj = WM_RULE_FIELDS[cond.field] || { label: cond.field };
        const opLabel = WM_OPERATOR_LABELS[cond.operator] || cond.operator;
        const rawVal = String(cond.value ?? '').trim();

        let valFormatted = '';
        if ((cond.operator === 'contains' || cond.operator === 'not_contains') && rawVal.includes(';')) {
            const terms = rawVal.split(';').map(t => t.trim()).filter(Boolean);
            const joinWord = cond.operator === 'not_contains' ? ' ni ' : ' ou ';
            if (isHtml) {
                valFormatted = terms.map(t => `<span style="color:#38bdf8;font-weight:700;">"${escapeHtml(t)}"</span>`).join(`<span style="color:#94a3b8;">${joinWord}</span>`);
            } else {
                valFormatted = terms.map(t => `"${t}"`).join(joinWord);
            }
        } else {
            const displayVal = rawVal === '' ? '?' : rawVal;
            if (isHtml) {
                valFormatted = `<span style="color:#38bdf8;font-weight:700;">"${escapeHtml(displayVal)}"</span>`;
            } else {
                valFormatted = `"${displayVal}"`;
            }
        }

        if (isHtml) {
            return `<span style="color:#cbd5e1;">${escapeHtml(fieldObj.label)}</span> <span style="color:#94a3b8;font-style:italic;">${escapeHtml(opLabel)}</span> ${valFormatted}`;
        }
        return `${fieldObj.label} ${opLabel} ${valFormatted}`;
    }

    function formatGroupNatural(groupNode, isRoot = true, isHtml = false) {
        if (!groupNode || !Array.isArray(groupNode.children) || groupNode.children.length === 0) {
            return isHtml ? '<span style="color:#64748b;">(Aucune condition)</span>' : '(Aucune condition)';
        }

        const logic = (groupNode.logic || 'AND').toUpperCase();
        const joiner = logic === 'OR'
            ? (isHtml ? ' <strong style="color:#fbbf24;">OU</strong> ' : ' OU ')
            : (isHtml ? ' <strong style="color:#818cf8;">ET</strong> ' : ' ET ');

        const parts = groupNode.children.map(child => {
            if (child.type === 'group' || Array.isArray(child.children)) {
                return formatGroupNatural(child, false, isHtml);
            }
            return formatConditionNatural(child, isHtml);
        });

        const joined = parts.join(joiner);
        if (!isRoot && parts.length > 1) {
            return isHtml
                ? `<span style="color:#fbbf24;">(</span>${joined}<span style="color:#fbbf24;">)</span>`
                : `(${joined})`;
        }
        return joined;
    }

    function getRuleNaturalSummary(rule, isHtml = false) {
        const norm = normalizeRuleStructure(rule);
        const formula = formatGroupNatural(norm.rootGroup, true, isHtml);
        const tagObj = (window.wmTagsCache || []).find(t => t.id === norm.tagId);
        const tagName = tagObj ? tagObj.name : 'Non assigné';
        const tagColor = tagObj ? (tagObj.color || '#6366f1') : '#ef4444';

        if (isHtml) {
            return `<strong style="color:#10b981;">SI</strong> ${formula} <strong style="color:#10b981;">ALORS</strong> Tag → <span style="background:${tagColor};color:#000;padding:1px 7px;border-radius:5px;font-weight:800;font-size:11px;">${escapeHtml(tagName)}</span>`;
        }
        return `SI ${formula} ALORS Tag → "${tagName}"`;
    }

    function initTagGroupsUI() {
        ensureRuleBuilderStyles();
    }
    window.initTagGroupsUI = initTagGroupsUI;
    window.WikiM.initTagGroupsUI = initTagGroupsUI;

    // ============================================================
    // GESTION DES ABONNEMENTS GIST & MAPPING D'IDS SUPABASE
    // ============================================================
    function extractGistIdFromInput(rawInput) {
        const trimmed = String(rawInput || '').trim();
        if (!trimmed) return '';
        // Supporte une URL complète https://gist.github.com/user/gist_id ou juste l'ID
        const match = trimmed.match(/([a-f0-9]{20,})/i);
        return match ? match[1] : trimmed;
    }

    async function fetchSharedGistCatalog(rawGistInput) {
        const gistId = extractGistIdFromInput(rawGistInput);
        if (!gistId) throw new Error('Veuillez saisir un Gist ID valide.');

        localStorage.setItem(WM_SHARED_GIST_ID_KEY, gistId);

        const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
            headers: { 'Accept': 'application/vnd.github+json' }
        });
        if (!res.ok) throw new Error(`Gist introuvable ou inaccessible (HTTP ${res.status})`);
        const gistData = await res.json();

        const files = Object.values(gistData.files || {});
        const jsonFile = files.find(f => f.filename === 'wikim_shared_tags.json') || files.find(f => f.filename.endsWith('.json')) || files[0];
        if (!jsonFile || !jsonFile.content) throw new Error('Aucun fichier JSON trouvé dans ce Gist.');

        const parsed = JSON.parse(jsonFile.content);
        if (!parsed || !Array.isArray(parsed.groups)) {
            throw new Error('Le fichier Gist ne contient pas de tableau "groups".');
        }

        cachedGistCatalog = {
            gistId,
            updatedAt: parsed.updatedAt || gistData.updated_at || new Date().toISOString(),
            groups: parsed.groups
        };
        return cachedGistCatalog;
    }

    function buildSubscribedLocalGroup(sharedGroup, gistId, updatedAt, tagMapping, existingGroup = null) {
        // Préserve l'état activé/désactivé (enabled) des règles si l'utilisateur met à jour un abonnement existant
        const previousEnabledMap = new Map();
        if (existingGroup && Array.isArray(existingGroup.rules)) {
            existingGroup.rules.forEach(r => {
                const key = r.sharedRuleId || r.name;
                if (key) previousEnabledMap.set(key, r.enabled !== false);
            });
        }

        const mappedRules = (sharedGroup.rules || []).map((sr, idx) => {
            const ruleKey = sr.id || sr.name || `sr_${idx}`;
            const localTagId = tagMapping[sr.tagSlotId] || '';
            const norm = normalizeRuleStructure({
                id: `subrule_${sharedGroup.id}_${idx}`,
                sharedRuleId: ruleKey,
                name: sr.name || `Règle partagée #${idx + 1}`,
                tagSlotId: sr.tagSlotId || '',
                tagId: localTagId,
                enabled: previousEnabledMap.has(ruleKey) ? previousEnabledMap.get(ruleKey) : true,
                isReadOnly: true,
                rootGroup: sr.rootGroup
            });
            norm.sharedRuleId = ruleKey;
            norm.tagSlotId = sr.tagSlotId || '';
            norm.isReadOnly = true;
            return norm;
        });

        return {
            id: existingGroup?.id || ('sub_' + sharedGroup.id + '_' + Date.now()),
            name: sharedGroup.name || 'Groupe Partagé',
            emoji: sharedGroup.emoji || '🌐',
            isOpen: existingGroup ? existingGroup.isOpen : true,
            isSubscribed: true,
            sharedGroupId: sharedGroup.id,
            gistId: gistId,
            syncedAt: updatedAt,
            requiredTags: Array.isArray(sharedGroup.requiredTags) ? sharedGroup.requiredTags : [],
            tagMapping: { ...tagMapping },
            rules: mappedRules
        };
    }

    function openSharedGroupMappingModal(sharedGroup, gistId, updatedAt) {
        ensureRuleBuilderStyles();

        const existingOverlay = document.getElementById('wm-gist-map-overlay');
        if (existingOverlay) existingOverlay.remove();

        const localGroups = getTagGroups();
        const existingSub = localGroups.find(g => g.isSubscribed && g.sharedGroupId === sharedGroup.id);
        const currentMapping = { ...(existingSub?.tagMapping || {}) };

        const requiredTags = Array.isArray(sharedGroup.requiredTags) ? sharedGroup.requiredTags : [];

        // Auto-détection intelligente par nom si pas encore mappé
        requiredTags.forEach(slot => {
            if (!currentMapping[slot.slotId]) {
                const byName = (window.wmTagsCache || []).find(t =>
                    t.name.trim().toLowerCase() === (slot.label || '').trim().toLowerCase()
                );
                if (byName) currentMapping[slot.slotId] = byName.id;
            }
        });

        const overlay = document.createElement('div');
        overlay.id = 'wm-gist-map-overlay';

        const renderModalContent = () => {
            overlay.innerHTML = `
                <div class="wm-rb-modal" style="max-width:620px;" role="dialog" aria-modal="true">
                    <div class="wm-rb-header">
                        <div>
                            <h3 style="margin:0;font-size:16px;font-weight:800;color:#f8fafc;">
                                🔗 Liaison des étiquettes — ${escapeHtml(sharedGroup.emoji || '🌐')} ${escapeHtml(sharedGroup.name)}
                            </h3>
                            <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
                                Associez chaque étiquette générique du groupe partagé à l'une de vos étiquettes locales.
                            </div>
                        </div>
                    </div>

                    <div class="wm-rb-body" style="gap:10px;">
                        ${requiredTags.length === 0 ? `
                            <div style="padding:16px;color:#94a3b8;text-align:center;">
                                Ce groupe ne définit aucun slot générique requis.
                            </div>
                        ` : requiredTags.map(slot => {
                            const selectedId = currentMapping[slot.slotId] || '';
                            const color = slot.suggestedColor || '#6366f1';
                            return `
                                <div class="wm-gist-slot-row" data-slot-row="${escapeHtml(slot.slotId)}">
                                    <div style="display:flex;align-items:center;gap:10px;min-width:200px;flex:1;">
                                        <span style="width:14px;height:14px;border-radius:4px;background:${escapeHtml(color)};flex-shrink:0;"></span>
                                        <div>
                                            <div style="font-weight:700;font-size:13px;color:#f1f5f9;">${escapeHtml(slot.label || slot.slotId)}</div>
                                            <div style="font-family:monospace;font-size:10px;color:#64748b;">Slot: ${escapeHtml(slot.slotId)}</div>
                                        </div>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <select class="wm-rb-select" data-map-select="${escapeHtml(slot.slotId)}" style="min-width:185px;font-weight:700;">
                                            <option value="">⚠️ Sélectionner mon tag...</option>
                                            ${(window.wmTagsCache || []).map(t => `
                                                <option value="${escapeHtml(t.id)}" ${selectedId === t.id ? 'selected' : ''}>
                                                    🏷️ ${escapeHtml(t.name)}
                                                </option>
                                            `).join('')}
                                        </select>
                                        <button type="button" class="wm-panel-btn ghost" data-quick-create="${escapeHtml(slot.slotId)}" style="padding:7px 10px;font-size:11px;border-color:rgba(16,185,129,0.45);color:#34d399;" title="Créer automatiquement cette étiquette sur ce compte et la lier">
                                            ✨ Créer & Lier
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div class="wm-pv-footer">
                        <span style="font-size:11px;color:#94a3b8;">
                            🔒 Les règles abonnées seront ajoutées en lecture seule.
                        </span>
                        <div style="display:flex;gap:10px;">
                            <button type="button" id="wm-gist-map-cancel" class="wm-panel-btn ghost">Annuler</button>
                            <button type="button" id="wm-gist-map-confirm" class="wm-panel-btn" style="background:linear-gradient(135deg,#4f46e5,#6366f1);font-weight:700;">
                                ✅ Enregistrer l'abonnement
                            </button>
                        </div>
                    </div>
                </div>
            `;

            overlay.querySelectorAll('[data-map-select]').forEach(sel => {
                sel.addEventListener('change', () => {
                    currentMapping[sel.dataset.mapSelect] = sel.value;
                });
            });

            overlay.querySelectorAll('[data-quick-create]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const slotId = btn.dataset.quickCreate;
                    const slot = requiredTags.find(s => s.slotId === slotId);
                    if (!slot) return;

                    const tagName = prompt('Nom de la nouvelle étiquette à créer sur votre compte :', slot.label || slot.slotId);
                    if (!tagName || !tagName.trim()) return;

                    btn.disabled = true;
                    btn.textContent = '⏳...';
                    try {
                        const created = await wmCreateTag(tagName.trim(), slot.suggestedColor || '#6366f1');
                        if (created && created.id) {
                            currentMapping[slotId] = created.id;
                            renderTagsList();
                            renderModalContent();
                            window.logToPanel(`🏷️ Étiquette "${created.name}" créée et liée à ${slotId}`);
                        }
                    } catch (e) {
                        alert(`Erreur lors de la création de l'étiquette : ${e.message}`);
                        btn.disabled = false;
                        btn.textContent = '✨ Créer & Lier';
                    }
                });
            });

            overlay.querySelector('#wm-gist-map-cancel').addEventListener('click', () => overlay.remove());

            overlay.querySelector('#wm-gist-map-confirm').addEventListener('click', () => {
                const groups = getTagGroups();
                const existingIdx = groups.findIndex(g => g.isSubscribed && g.sharedGroupId === sharedGroup.id);
                const builtGroup = buildSubscribedLocalGroup(
                    sharedGroup,
                    gistId,
                    updatedAt,
                    currentMapping,
                    existingIdx !== -1 ? groups[existingIdx] : null
                );

                if (existingIdx !== -1) {
                    groups[existingIdx] = builtGroup;
                } else {
                    groups.push(builtGroup);
                }

                saveTagGroups(groups);
                renderRulesList();
                overlay.remove();

                // Rafraîchit aussi la liste dans la modale Import/Export si elle est ouverte
                if (typeof window._wmRefreshGistCatalogUI === 'function') {
                    window._wmRefreshGistCatalogUI();
                }

                window.logToPanel(`🌐 Abonnement actif sur "${builtGroup.name}" (${builtGroup.rules.length} règles liées).`);
                if (typeof window.showWMToast === 'function') {
                    window.showWMToast(`Abonné à "${builtGroup.name}" !`, true);
                }
            });
        };

        document.body.appendChild(overlay);
        renderModalContent();
    }

    async function syncSubscribedGroup(gIdx) {
        const groups = getTagGroups();
        const group = groups[gIdx];
        if (!group || !group.isSubscribed) return;

        const gistId = group.gistId || localStorage.getItem(WM_SHARED_GIST_ID_KEY);
        if (!gistId) {
            window.logToPanel('❌ Aucun Gist ID associé à ce groupe.');
            return;
        }

        try {
            window.logToPanel(`🔄 Synchronisation de "${group.name}" depuis le Gist...`);
            const catalog = await fetchSharedGistCatalog(gistId);
            const remoteGroup = catalog.groups.find(rg => rg.id === group.sharedGroupId);
            if (!remoteGroup) {
                throw new Error(`Le groupe "${group.sharedGroupId}" n'existe plus sur ce Gist.`);
            }

            // Vérifie si de nouveaux slots requis ont été ajoutés sur le Gist et ne sont pas encore mappés
            const unmappedSlots = (remoteGroup.requiredTags || []).filter(
                slot => !group.tagMapping || !group.tagMapping[slot.slotId]
            );

            if (unmappedSlots.length > 0) {
                window.logToPanel(`⚠️ Nouveaux tags génériques détectés pour "${group.name}", ouverture du mapping...`);
                openSharedGroupMappingModal(remoteGroup, catalog.gistId, catalog.updatedAt);
                return;
            }

            groups[gIdx] = buildSubscribedLocalGroup(
                remoteGroup,
                catalog.gistId,
                catalog.updatedAt,
                group.tagMapping || {},
                group
            );
            saveTagGroups(groups);
            renderRulesList();
            window.logToPanel(`✅ "${group.name}" synchronisé avec succès !`);
            if (typeof window.showWMToast === 'function') {
                window.showWMToast(`"${group.name}" mis à jour !`, true);
            }
        } catch (e) {
            window.logToPanel(`❌ Erreur sync Gist : ${e.message}`);
        }
    }

    // ============================================================
    // UI ONGLET TAGS
    // ============================================================
    async function initTagsTab() {
        ensureRuleBuilderStyles();

        if (window.wmTagsCache.length === 0) {
            try { await wmFetchTags(); } catch(e) { console.warn('[WM-Tags] fetch échoué:', e); }
        }

        const autoTagCheckbox = document.getElementById('wm-toggle-autotag');
        if (autoTagCheckbox) {
            autoTagCheckbox.checked = localStorage.getItem('wmAutoTagEnabled') === 'true';
            if (!autoTagCheckbox._wmBound) {
                autoTagCheckbox._wmBound = true;
                autoTagCheckbox.addEventListener('change', (e) => {
                    localStorage.setItem('wmAutoTagEnabled', e.target.checked);
                });
            }
        }

        function bindCacheFillBtn() {
            const fillBtn = document.getElementById('wm-cache-fill-btn');
            if (fillBtn && !fillBtn._wmBound) {
                fillBtn._wmBound = true;
                fillBtn.addEventListener('click', async () => {
                    fillBtn.disabled = true;
                    fillBtn.textContent = '⏳...';
                    try {
                        const before = window.wmCollectionCache.cards.length;
                        await window.getVisibleCollectionCards(txt => window.logToPanel(txt));
                        const after = window.wmCollectionCache.cards.length;
                        window.logToPanel(`📥 ${after - before} cartes ajoutées au cache (total: ${after})`);
                    } catch (e) {
                        window.logToPanel(`❌ ${e.message}`);
                    } finally {
                        fillBtn.disabled = false;
                        fillBtn.textContent = '📥 Remplir la page';
                    }
                });
            }
        }
        window.bindCacheFillBtn = bindCacheFillBtn;
        bindCacheFillBtn();

        const oldAddRuleBtn = document.getElementById('wm-add-rule-btn');
        if (oldAddRuleBtn) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; gap:6px; margin-bottom:8px;";
            wrapper.innerHTML = `
                <button id="wm-btn-add-group" class="wm-panel-btn" style="flex:1;">📁 Nouveau Groupe</button>
                <button id="wm-btn-ie-modal" class="wm-panel-btn ghost" style="flex:1;">🌐 Gist / Import</button>
            `;
            oldAddRuleBtn.replaceWith(wrapper);

            document.getElementById('wm-btn-add-group').addEventListener('click', () => {
                const name = prompt("Nom du nouveau dossier :");
                if (name) {
                    const groups = getTagGroups();
                    groups.push({ id: 'g_' + Date.now(), name, isOpen: true, rules: [] });
                    saveTagGroups(groups);
                    renderRulesList();
                }
            });

            document.getElementById('wm-btn-ie-modal').addEventListener('click', () => {
                document.getElementById('wm-ie-overlay').style.display = 'flex';
            });
        }

        if (!document.getElementById('wm-ie-overlay')) {
            const savedGistId = localStorage.getItem(WM_SHARED_GIST_ID_KEY) || '';
            const modal = document.createElement('div');
            modal.id = "wm-ie-overlay";
            modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:100001;align-items:center;justify-content:center;backdrop-filter:blur(5px);padding:16px;";
            modal.innerHTML = `
                <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:14px;padding:20px;width:95%;max-width:620px;color:white;box-shadow:0 24px 48px rgba(0,0,0,0.75);display:flex;flex-direction:column;max-height:86vh;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-size:16px;">🌐 Règles Partagées & Import / Export</h3>
                        <button id="wm-btn-ie-close" class="wm-panel-btn ghost" style="padding:4px 10px;">✕</button>
                    </div>

                    <!-- Barre d'onglets -->
                    <div class="wm-ie-tabs">
                        <button type="button" class="wm-ie-tab-btn active" data-ie-tab="gist">🌐 Gist Commun / Abonnements</button>
                        <button type="button" class="wm-ie-tab-btn" data-ie-tab="local">📁 Import / Export JSON Local</button>
                    </div>

                    <!-- ONGLET 1 : GIST COMMUN / ABONNEMENTS -->
                    <div id="wm-ie-pane-gist" style="display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;">
                        <div style="font-size:11px;color:#94a3b8;line-height:1.4;">
                            Entrez l'ID ou l'URL du GitHub Gist contenant vos groupes de règles partagées, puis associez les tags génériques aux étiquettes de ce compte.
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <input type="text" id="wm-gist-id-input" class="wm-rb-input" style="flex:1;min-width:200px;font-family:monospace;" placeholder="ID ou URL du Gist (ex: a1b2c3d4e5f6...)" value="${escapeHtml(savedGistId)}">
                            <button type="button" id="wm-btn-gist-fetch" class="wm-panel-btn">🔄 Charger le Gist</button>
                            <button type="button" id="wm-btn-gist-sync-all" class="wm-panel-btn ghost" title="Mettre à jour tous les groupes abonnés">⚡ Tout Sync</button>
                        </div>
                        <div id="wm-gist-catalog-list" style="display:flex;flex-direction:column;gap:8px;min-height:120px;max-height:340px;overflow-y:auto;padding-right:2px;">
                            <div style="color:#64748b;font-size:12px;text-align:center;padding:30px 10px;">
                                Cliquez sur "🔄 Charger le Gist" pour afficher les groupes partagés disponibles.
                            </div>
                        </div>
                    </div>

                    <!-- ONGLET 2 : IMPORT / EXPORT MANUEL -->
                    <div id="wm-ie-pane-local" style="display:none;flex-direction:column;gap:10px;">
                        <p style="font-size:11px;color:#94a3b8;margin:0;">
                            Générez votre code d'export (à coller dans <code>dashboard_tags.html</code> ou un autre compte), ou collez un JSON pour importer des dossiers locaux.
                        </p>
                        <textarea id="wm-ie-textarea" style="width:100%;height:170px;background:rgba(30,41,59,0.8);color:#fbbf24;border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:10px;font-family:monospace;font-size:11px;outline:none;resize:vertical;" placeholder="Collez un code d'import ici..."></textarea>
                        <div style="display:flex;gap:10px;justify-content:flex-end;">
                            <button id="wm-btn-ie-export" class="wm-panel-btn ghost">📤 Exporter mes groupes</button>
                            <button id="wm-btn-ie-import" class="wm-panel-btn">📥 Importer en local</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Switch entre les 2 onglets
            modal.querySelectorAll('[data-ie-tab]').forEach(tabBtn => {
                tabBtn.addEventListener('click', () => {
                    modal.querySelectorAll('[data-ie-tab]').forEach(b => b.classList.remove('active'));
                    tabBtn.classList.add('active');
                    const isGist = tabBtn.dataset.ieTab === 'gist';
                    document.getElementById('wm-ie-pane-gist').style.display = isGist ? 'flex' : 'none';
                    document.getElementById('wm-ie-pane-local').style.display = isGist ? 'none' : 'flex';
                });
            });

            document.getElementById('wm-btn-ie-close').addEventListener('click', () => modal.style.display = 'none');
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

            // Rendu du catalogue Gist
            const renderCatalogUI = () => {
                const listEl = document.getElementById('wm-gist-catalog-list');
                if (!cachedGistCatalog || !Array.isArray(cachedGistCatalog.groups)) return;

                const localGroups = getTagGroups();
                if (cachedGistCatalog.groups.length === 0) {
                    listEl.innerHTML = `<div style="color:#94a3b8;text-align:center;padding:20px;">Aucun groupe trouvé dans ce Gist.</div>`;
                    return;
                }

                listEl.innerHTML = cachedGistCatalog.groups.map((sg, idx) => {
                    const sub = localGroups.find(g => g.isSubscribed && g.sharedGroupId === sg.id);
                    const rulesCount = (sg.rules || []).length;
                    const slotsCount = (sg.requiredTags || []).length;

                    return `
                        <div class="wm-gist-group-card">
                            <div style="min-width:0;flex:1;">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <span style="font-size:15px;">${escapeHtml(sg.emoji || '🌐')}</span>
                                    <span style="font-weight:800;font-size:13px;color:#f8fafc;">${escapeHtml(sg.name || 'Groupe sans nom')}</span>
                                    ${sub ? `<span class="wm-sub-badge">✅ Abonné</span>` : ''}
                                </div>
                                <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
                                    ⚙️ ${rulesCount} règle(s) • 🏷️ ${slotsCount} tag(s) requis :
                                    ${(sg.requiredTags || []).map(t => `<span style="color:#cbd5e1;font-weight:600;">${escapeHtml(t.label)}</span>`).join(', ') || 'Aucun'}
                                </div>
                            </div>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <button type="button" class="wm-panel-btn ${sub ? 'ghost' : ''}" data-gist-sub="${idx}" style="padding:6px 12px;font-size:11px;">
                                    ${sub ? '🔗 Remapper / Mettre à jour' : '➕ S\'abonner'}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');

                listEl.querySelectorAll('[data-gist-sub]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const idx = Number(btn.dataset.gistSub);
                        const sg = cachedGistCatalog.groups[idx];
                        if (sg) {
                            openSharedGroupMappingModal(sg, cachedGistCatalog.gistId, cachedGistCatalog.updatedAt);
                        }
                    });
                });
            };
            window._wmRefreshGistCatalogUI = renderCatalogUI;

            document.getElementById('wm-btn-gist-fetch').addEventListener('click', async () => {
                const inp = document.getElementById('wm-gist-id-input');
                const btn = document.getElementById('wm-btn-gist-fetch');
                const listEl = document.getElementById('wm-gist-catalog-list');
                btn.disabled = true;
                btn.textContent = '⏳...';
                listEl.innerHTML = `<div style="color:#fbbf24;text-align:center;padding:24px;">Chargement du Gist en cours...</div>`;
                try {
                    await fetchSharedGistCatalog(inp.value);
                    renderCatalogUI();
                    window.logToPanel(`🌐 Catalogue Gist chargé (${cachedGistCatalog.groups.length} groupes).`);
                } catch (e) {
                    listEl.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px;">❌ ${escapeHtml(e.message)}</div>`;
                } finally {
                    btn.disabled = false;
                    btn.textContent = '🔄 Charger le Gist';
                }
            });

            document.getElementById('wm-btn-gist-sync-all').addEventListener('click', async () => {
                const groups = getTagGroups();
                const subIndexes = groups.map((g, i) => g.isSubscribed ? i : -1).filter(i => i !== -1);
                if (subIndexes.length === 0) {
                    alert("Vous n'avez encore aucun groupe abonné à synchroniser.");
                    return;
                }
                for (const idx of subIndexes) {
                    await syncSubscribedGroup(idx);
                }
                renderCatalogUI();
            });

            document.getElementById('wm-btn-ie-export').addEventListener('click', () => {
                const groups = getTagGroups();
                const exportData = groups.map(g => ({
                    ...g,
                    rules: (g.rules || []).map(r => ({ ...normalizeRuleStructure(r), tagId: '' }))
                }));
                const ta = document.getElementById('wm-ie-textarea');
                ta.value = JSON.stringify(exportData, null, 2);
                ta.select();
                navigator.clipboard?.writeText(ta.value);
                window.logToPanel("📤 Export copié dans le presse-papier !");
            });

            document.getElementById('wm-btn-ie-import').addEventListener('click', () => {
                try {
                    const ta = document.getElementById('wm-ie-textarea');
                    const imported = JSON.parse(ta.value);
                    if (!Array.isArray(imported)) throw new Error("Format invalide");

                    const groups = getTagGroups();
                    imported.forEach(ig => {
                        groups.push({
                            id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                            name: (ig.name || 'Dossier') + " (Importé)",
                            emoji: ig.emoji || '📁',
                            isOpen: true,
                            rules: Array.isArray(ig.rules) ? ig.rules.map(normalizeRuleStructure) : []
                        });
                    });
                    saveTagGroups(groups);
                    renderRulesList();
                    modal.style.display = 'none';
                    ta.value = '';
                    window.logToPanel("📥 Groupes importés avec succès ! Pensez à réassigner vos étiquettes.");
                } catch (e) {
                    alert("Erreur d'importation : Le code fourni est invalide.");
                }
            });
        }

        renderTagsList();
        renderRulesList();
        bindTagButtons();
        restoreScanUI();
    }

    function bindTagButtons() {
        const addTagBtn = document.getElementById('wm-add-tag-btn');
        if (addTagBtn && !addTagBtn._wmBound) {
            addTagBtn._wmBound = true;
            addTagBtn.addEventListener('click', async () => {
                const nameEl = document.getElementById('wm-new-tag-name');
                const colorEl = document.getElementById('wm-new-tag-color');
                const name = nameEl.value.trim();
                const color = colorEl.value;
                if (!name) return;
                try {
                    await wmCreateTag(name, color);
                    nameEl.value = '';
                    renderTagsList();
                    renderRulesList();
                    window.logToPanel(`🏷️ Étiquette "${name}" créée`);
                } catch(e) {
                    window.logToPanel(`❌ Erreur création tag: ${e.message}`);
                }
            });
        }

        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');

        let detailsBtn = document.getElementById('wm-tag-details-btn');
        if (!detailsBtn && previewBtn && applyBtn && previewBtn.parentElement) {
            detailsBtn = document.createElement('button');
            detailsBtn.id = 'wm-tag-details-btn';
            detailsBtn.className = 'wm-panel-btn ghost';
            detailsBtn.style.cssText = 'flex:1;display:none;border-color:#6366f1;color:#a5b4fc;';
            detailsBtn.textContent = '👁️ Détails (0)';
            previewBtn.parentElement.insertBefore(detailsBtn, applyBtn);
        }

        if (previewBtn && !previewBtn._wmBound) {
            previewBtn._wmBound = true;
            previewBtn.addEventListener('click', runTagPreview);
        }

        if (detailsBtn && !detailsBtn._wmBound) {
            detailsBtn._wmBound = true;
            detailsBtn.addEventListener('click', openTagPreviewModal);
        }

        if (applyBtn && !applyBtn._wmBound) {
            applyBtn._wmBound = true;
            applyBtn.addEventListener('click', runTagApply);
        }

        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        if (cancelBtn && !cancelBtn._wmBound) {
            cancelBtn._wmBound = true;
            cancelBtn.addEventListener('click', () => {
                const st = window.wmTagScanState;
                if (st.running) {
                    st.cancelled = true;
                    window.logToPanel('⏹️ Annulation demandée...');
                }
            });
        }

        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        if (pauseBtn && !pauseBtn._wmBound) {
            pauseBtn._wmBound = true;
            pauseBtn.addEventListener('click', () => {
                const st = window.wmTagScanState;
                if (!st.running) return;
                st.paused = !st.paused;
                pauseBtn.textContent = st.paused ? '▶️ Reprendre' : '⏸️ Pause';
                renderScanProgress();
                window.logToPanel(st.paused ? '⏸️ Scan mis en pause' : '▶️ Scan repris');
            });
        }

        const modePage = document.getElementById('wm-tag-mode-page');
        const modeHint = document.getElementById('wm-tag-mode-hint');
        if (modePage && !modePage._wmBound) {
            modePage._wmBound = true;
            const saved = localStorage.getItem('wmTagModePage') === '1';
            modePage.checked = saved;
            updateModeHint();
            modePage.addEventListener('change', () => {
                localStorage.setItem('wmTagModePage', modePage.checked ? '1' : '0');
                updateModeHint();
            });
        }
        function updateModeHint() {
            if (!modeHint || !modePage) return;
            if (modePage.checked) {
                modeHint.innerHTML = '⚡ Mode page : traite uniquement les cartes affichées dans le DOM.<br>Rapide, mais ne touche pas au reste.';
            } else {
                modeHint.innerHTML = 'Mode complet : parcourt toute la collection (long).<br>Mode page : traite uniquement les cartes affichées.';
            }
        }
        window.updateModeHint = updateModeHint;
        window.WikiM.updateModeHint = updateModeHint;
    }

    // ============================================================
    // SYNCHRONISATION DU STATE DE PRÉVISUALISATION (GROUPÉ PAR CARTE)
    // ============================================================
    function ensurePreviewAllItems(preview) {
        if (!preview) return;
        if (!Array.isArray(preview.cardEntries)) {
            const byCard = new Map();
            const getKey = (c) => c?.userCardId || c?.id || c?.title || Math.random().toString(36);

            (preview.toAdd || []).forEach(item => {
                const key = getKey(item.card);
                if (!byCard.has(key)) {
                    byCard.set(key, { key, card: item.card, actions: [] });
                }
                const entry = byCard.get(key);
                if (!entry.actions.some(a => a.tagId === item.tagId && a.type === 'add')) {
                    entry.actions.push({ type: 'add', tagId: item.tagId, enabled: true });
                }
            });

            (preview.toRemove || []).forEach(item => {
                const key = getKey(item.card);
                if (!byCard.has(key)) {
                    byCard.set(key, { key, card: item.card, actions: [] });
                }
                const entry = byCard.get(key);
                if (!entry.actions.some(a => a.tagId === item.tagId && a.type === 'remove')) {
                    entry.actions.push({ type: 'remove', tagId: item.tagId, enabled: true });
                }
            });

            preview.cardEntries = Array.from(byCard.values());
        }
        syncPreviewFilteredLists(preview);
    }

    function syncPreviewFilteredLists(preview) {
        if (!preview || !Array.isArray(preview.cardEntries)) return;
        const toAdd = [];
        const toRemove = [];

        for (const entry of preview.cardEntries) {
            for (const act of entry.actions) {
                if (!act.enabled || !act.tagId) continue;
                if (act.type === 'add') {
                    toAdd.push({ card: entry.card, tagId: act.tagId });
                } else if (act.type === 'remove') {
                    toRemove.push({ card: entry.card, tagId: act.tagId });
                }
            }
        }
        preview.toAdd = toAdd;
        preview.toRemove = toRemove;
    }

    function restoreScanUI() {
        const st = window.wmTagScanState;
        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const detailsBtn = document.getElementById('wm-tag-details-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        if (!summary) return;

        if (st.running) {
            previewBtn.disabled = true;
            applyBtn.disabled = true;
            if (detailsBtn) detailsBtn.style.display = 'none';
            pauseBtn.style.display = 'block';
            cancelBtn.style.display = 'block';
            pauseBtn.textContent = st.paused ? '▶️ Reprendre' : '⏸️ Pause';
            renderScanProgress();
        } else if (st.preview) {
            ensurePreviewAllItems(st.preview);
            const totalActive = st.preview.toAdd.length + st.preview.toRemove.length;
            const totalCards = st.preview.cardEntries ? st.preview.cardEntries.length : 0;

            previewBtn.disabled = false;
            applyBtn.disabled = totalActive === 0;
            applyBtn.textContent = totalActive > 0 ? `🚀 Appliquer (${totalActive})` : '🚀 Appliquer';

            if (detailsBtn) {
                detailsBtn.style.display = totalCards > 0 ? 'inline-block' : 'none';
                detailsBtn.textContent = `👁️ Détails (${totalActive})`;
            }

            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            renderPreviewResult(st.preview);
        } else {
            previewBtn.disabled = false;
            applyBtn.disabled = true;
            applyBtn.textContent = '🚀 Appliquer';
            if (detailsBtn) detailsBtn.style.display = 'none';
            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }
    }

    function renderScanProgress() {
        const st = window.wmTagScanState;
        const summary = document.getElementById('wm-tag-run-summary');
        if (!summary) return;
        const phaseLabels = {
            'loading-collection': '📥 Chargement collection',
            'computing': '🧮 Calcul des correspondances',
            'checking': '🔎 Vérification des tags',
            'applying': '🚀 Application'
        };
        const label = phaseLabels[st.phase] || '⏳ En cours';
        const { current, total, text } = st.progress;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const paused = st.paused ? '<div style="color:#fbbf24;font-weight:700;">⏸️ EN PAUSE</div>' : '';
        summary.innerHTML = `
            ${paused}
            <div>${label} ${total > 0 ? `— ${current} / ${total}` : ''}</div>
            ${text ? `<div style="color:#94a3b8;">${escapeHtml(text)}</div>` : ''}
            ${total > 0 ? `<div style="background:rgba(99,102,241,0.2);border-radius:4px;height:4px;margin-top:4px;"><div style="background:#6366f1;height:100%;width:${pct}%;border-radius:4px;transition:width 0.2s;"></div></div>` : ''}
        `;
    }

    function renderPreviewResult(preview) {
        const summary = document.getElementById('wm-tag-run-summary');
        if (!summary || !preview) return;
        ensurePreviewAllItems(preview);

        const { toAdd, toRemove } = preview;
        const perTag = new Map();
        for (const { tagId } of toAdd) perTag.set(tagId, (perTag.get(tagId) || 0) + 1);

        const lines = [];
        lines.push(`✅ ${toAdd.length} tags à poser`);
        if (toRemove.length > 0) lines.push(`🗑️ ${toRemove.length} tags à retirer`);
        lines.push('---');
        for (const [tagId, count] of perTag.entries()) {
            const tag = window.wmTagsCache.find(t => t.id === tagId);
            lines.push(`${tag?.name || tagId.slice(0,8)} : +${count}`);
        }
        summary.innerHTML = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
    }

    // ============================================================
    // GRANDE MODALE POP-UP DE RÉVISION DES MODIFICATIONS DE TAGS
    // ============================================================
    function resolveCardThumbnail(card) {
        if (!card) return null;
        if (card.image_url || card.image || card.thumbnail || card.img) {
            return card.image_url || card.image || card.thumbnail || card.img;
        }
        if (card.title) {
            try {
                const imgs = document.querySelectorAll('img[alt]');
                for (const img of imgs) {
                    if (img.getAttribute('alt')?.trim() === card.title.trim() && img.src && !img.src.includes('/rarity/')) {
                        return img.src;
                    }
                }
            } catch (e) {}
        }
        return null;
    }

    function openTagPreviewModal() {
        ensureRuleBuilderStyles();

        const st = window.wmTagScanState;
        if (!st || !st.preview) return;
        ensurePreviewAllItems(st.preview);

        const cardEntries = st.preview.cardEntries || [];
        if (cardEntries.length === 0) {
            window.logToPanel('ℹ️ Aucune modification à afficher.');
            return;
        }

        const existingOverlay = document.getElementById('wm-tag-preview-overlay');
        if (existingOverlay) existingOverlay.remove();

        const getDistinctTagIds = () => {
            const s = new Set();
            cardEntries.forEach(entry => entry.actions.forEach(a => { if (a.tagId) s.add(a.tagId); }));
            return Array.from(s);
        };
        const distinctTagIds = getDistinctTagIds();

        const overlay = document.createElement('div');
        overlay.id = 'wm-tag-preview-overlay';
        overlay.innerHTML = `
            <div class="wm-rb-modal wm-preview-modal" role="dialog" aria-modal="true">
                <div class="wm-rb-header">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <h3 style="margin:0;font-size:16px;font-weight:800;color:#f8fafc;">🔎 Détails des modifications de tags</h3>
                        <span id="wm-pv-count-add" class="wm-pv-counter-pill wm-pv-counter-add">+0 à poser</span>
                        <span id="wm-pv-count-rem" class="wm-pv-counter-pill wm-pv-counter-rem">-0 à retirer</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button type="button" id="wm-pv-close-top" class="wm-panel-btn ghost" style="padding:7px 14px;">Fermer</button>
                        <button type="button" id="wm-pv-apply-top" class="wm-panel-btn danger" style="padding:7px 16px;font-weight:700;">🚀 Appliquer la sélection</button>
                    </div>
                </div>

                <div class="wm-pv-toolbar">
                    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1;min-width:260px;">
                        <input type="text" id="wm-pv-search" class="wm-rb-input" placeholder="🔍 Filtrer par titre de carte..." style="flex:1;min-width:180px;">
                        <select id="wm-pv-filter-type" class="wm-rb-select">
                            <option value="all">Toutes les actions</option>
                            <option value="add">Ajouts uniquement (+)</option>
                            <option value="remove">Retraits uniquement (-)</option>
                        </select>
                        <select id="wm-pv-filter-tag" class="wm-rb-select">
                            <option value="all">Tous les tags (${distinctTagIds.length})</option>
                            ${distinctTagIds.map(tid => {
                                const t = window.wmTagsCache.find(x => x.id === tid);
                                return `<option value="${escapeHtml(tid)}">🏷️ ${escapeHtml(t ? t.name : tid.slice(0, 8))}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button type="button" id="wm-pv-check-all" class="wm-panel-btn ghost" style="padding:6px 10px;font-size:11px;">☑️ Tout activer</button>
                        <button type="button" id="wm-pv-uncheck-all" class="wm-panel-btn ghost" style="padding:6px 10px;font-size:11px;">⬜ Tout vider</button>
                    </div>
                </div>

                <div class="wm-pv-list" id="wm-pv-list-container"></div>

                <div class="wm-pv-footer">
                    <span id="wm-pv-visible-info" style="font-size:11px;color:#94a3b8;font-family:monospace;">0 cartes affichées</span>
                    <div style="display:flex;gap:10px;">
                        <button type="button" id="wm-pv-close-bottom" class="wm-panel-btn ghost" style="padding:8px 16px;">Fermer</button>
                        <button type="button" id="wm-pv-apply-bottom" class="wm-panel-btn danger" style="padding:8px 18px;font-weight:700;">🚀 Appliquer la sélection</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const searchInput = overlay.querySelector('#wm-pv-search');
        const typeSelect = overlay.querySelector('#wm-pv-filter-type');
        const tagSelect = overlay.querySelector('#wm-pv-filter-tag');
        const listContainer = overlay.querySelector('#wm-pv-list-container');
        const countAddEl = overlay.querySelector('#wm-pv-count-add');
        const countRemEl = overlay.querySelector('#wm-pv-count-rem');
        const visibleInfoEl = overlay.querySelector('#wm-pv-visible-info');
        const applyTopBtn = overlay.querySelector('#wm-pv-apply-top');
        const applyBottomBtn = overlay.querySelector('#wm-pv-apply-bottom');

        const closeAllAddMenus = () => {
            overlay.querySelectorAll('.wm-pv-add-menu').forEach(m => m.remove());
        };
        overlay.addEventListener('click', () => closeAllAddMenus());

        function getFilteredEntries() {
            const q = searchInput.value.trim().toLowerCase();
            const typeFilter = typeSelect.value;
            const tagFilter = tagSelect.value;

            return cardEntries.filter(entry => {
                if (q) {
                    const title = (entry.card?.title || '').toLowerCase();
                    const cat = (entry.card?.category || '').toLowerCase();
                    if (!title.includes(q) && !cat.includes(q)) return false;
                }
                if (typeFilter !== 'all') {
                    if (!entry.actions.some(a => a.type === typeFilter && a.enabled)) return false;
                }
                if (tagFilter !== 'all') {
                    if (!entry.actions.some(a => a.tagId === tagFilter && a.enabled)) return false;
                }
                return true;
            });
        }

        function refreshCountersAndSync() {
            syncPreviewFilteredLists(st.preview);
            const addCount = st.preview.toAdd.length;
            const remCount = st.preview.toRemove.length;
            const totalActive = addCount + remCount;

            countAddEl.textContent = `+${addCount} à poser`;
            countRemEl.textContent = `-${remCount} à retirer`;

            const btnLabel = totalActive > 0
                ? `🚀 Appliquer la sélection (${totalActive})`
                : '🚀 Aucune action sélectionnée';

            applyTopBtn.textContent = btnLabel;
            applyBottomBtn.textContent = btnLabel;
            applyTopBtn.disabled = totalActive === 0;
            applyBottomBtn.disabled = totalActive === 0;

            restoreScanUI();
        }

        function renderRows() {
            const filtered = getFilteredEntries();
            visibleInfoEl.textContent = `${filtered.length} carte(s) affichée(s) sur ${cardEntries.length}`;

            if (filtered.length === 0) {
                listContainer.innerHTML = `<div class="wm-tracked-empty" style="padding:40px 0;text-align:center;">Aucune carte ne correspond aux filtres actuels.</div>`;
                return;
            }

            listContainer.innerHTML = '';
            const fragment = document.createDocumentFragment();

            filtered.forEach(entry => {
                const card = entry.card || {};
                const rarity = (card.rarity || 'C').toUpperCase();
                const rStyle = RARITY_COLORS[rarity] || RARITY_COLORS['C'];
                const thumbUrl = resolveCardThumbnail(card);
                const price = typeof window.wmGetPriceFor === 'function' ? window.wmGetPriceFor(card.title, card.rarity) : null;

                const activeActions = entry.actions.filter(a => a.enabled);
                const hasActive = activeActions.length > 0;

                const row = document.createElement('div');
                row.className = `wm-pv-row ${hasActive ? '' : 'is-disabled'}`;

                row.innerHTML = `
                    <div class="wm-pv-card-info">
                        <div class="wm-pv-thumb">
                            ${thumbUrl
                                ? `<img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(card.title || '')}" loading="lazy">`
                                : `<span style="font-size:16px;">🃏</span>`
                            }
                        </div>
                        <span class="wm-pv-rarity" style="background:${rStyle.bg};color:${rStyle.text};">${escapeHtml(rarity)}</span>
                        <div style="min-width:0;flex:1;">
                            <div class="wm-pv-card-title" title="${escapeHtml(card.title || 'Sans titre')}">${escapeHtml(card.title || 'Sans titre')}</div>
                            <div class="wm-pv-card-meta">
                                ${card.category ? `<span>📂 ${escapeHtml(card.category)}</span>` : ''}
                                ${price !== null && price !== undefined && !isNaN(price) ? `<span style="color:#fbbf24;font-weight:600;">💰 ${Math.round(price)} WB</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="wm-pv-action-zone">
                        <div class="wm-pv-tags-holder" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;"></div>
                        <div class="wm-pv-add-wrap">
                            <button type="button" class="wm-pv-add-btn" title="Ajouter un tag sur cette carte">+ Ajout</button>
                        </div>
                    </div>
                `;

                const tagsHolder = row.querySelector('.wm-pv-tags-holder');
                const addWrap = row.querySelector('.wm-pv-add-wrap');
                const addBtn = row.querySelector('.wm-pv-add-btn');

                activeActions.forEach(act => {
                    const tagObj = window.wmTagsCache.find(t => t.id === act.tagId);
                    const tagName = tagObj ? tagObj.name : (act.tagId || 'Inconnu');
                    const tagColor = tagObj ? (tagObj.color || '#6366f1') : '#64748b';

                    const badge = document.createElement('span');
                    badge.className = `wm-pv-tag-badge ${act.type === 'remove' ? 'is-remove' : ''}`;
                    badge.style.background = tagColor;
                    badge.title = act.type === 'add' ? `Ajout prévu : ${tagName}` : `Retrait prévu : ${tagName}`;

                    badge.innerHTML = `
                        <span class="wm-pv-tag-prefix">${act.type === 'add' ? '+' : '-'}</span>
                        <span>${escapeHtml(tagName)}</span>
                        <button type="button" class="wm-pv-tag-del" title="Retirer cette action">✕</button>
                    `;

                    badge.querySelector('.wm-pv-tag-del').addEventListener('click', (e) => {
                        e.stopPropagation();
                        act.enabled = false;
                        refreshCountersAndSync();
                        renderRows();
                    });

                    tagsHolder.appendChild(badge);
                });

                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const existingMenu = addWrap.querySelector('.wm-pv-add-menu');
                    closeAllAddMenus();
                    if (existingMenu) return;

                    const menu = document.createElement('div');
                    menu.className = 'wm-pv-add-menu';

                    const availableTags = (window.wmTagsCache || []).filter(t =>
                        !entry.actions.some(a => a.enabled && a.type === 'add' && a.tagId === t.id)
                    );

                    if (availableTags.length === 0) {
                        menu.innerHTML = `<div style="padding:6px 8px;font-size:11px;color:#94a3b8;text-align:center;">Tous vos tags sont déjà ajoutés</div>`;
                    } else {
                        availableTags.forEach(t => {
                            const itemBtn = document.createElement('button');
                            itemBtn.type = 'button';
                            itemBtn.className = 'wm-pv-add-menu-item';
                            itemBtn.innerHTML = `
                                <span style="width:12px;height:12px;border-radius:3px;background:${escapeHtml(t.color || '#6366f1')};flex-shrink:0;"></span>
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.name)}</span>
                            `;
                            itemBtn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                let existingAct = entry.actions.find(a => a.tagId === t.id && a.type === 'add');
                                if (existingAct) {
                                    existingAct.enabled = true;
                                } else {
                                    entry.actions.push({ type: 'add', tagId: t.id, enabled: true });
                                }
                                const conflictRem = entry.actions.find(a => a.tagId === t.id && a.type === 'remove');
                                if (conflictRem) conflictRem.enabled = false;

                                closeAllAddMenus();
                                refreshCountersAndSync();
                                renderRows();
                            });
                            menu.appendChild(itemBtn);
                        });
                    }

                    addWrap.appendChild(menu);
                });

                fragment.appendChild(row);
            });

            listContainer.appendChild(fragment);
        }

        searchInput.addEventListener('input', renderRows);
        typeSelect.addEventListener('change', renderRows);
        tagSelect.addEventListener('change', renderRows);

        overlay.querySelector('#wm-pv-check-all').addEventListener('click', () => {
            getFilteredEntries().forEach(entry => entry.actions.forEach(a => { a.enabled = true; }));
            refreshCountersAndSync();
            renderRows();
        });

        overlay.querySelector('#wm-pv-uncheck-all').addEventListener('click', () => {
            getFilteredEntries().forEach(entry => entry.actions.forEach(a => { a.enabled = false; }));
            refreshCountersAndSync();
            renderRows();
        });

        const closeModal = () => {
            refreshCountersAndSync();
            overlay.remove();
        };

        const triggerApplyFromModal = () => {
            refreshCountersAndSync();
            overlay.remove();
            runTagApply();
        };

        overlay.querySelector('#wm-pv-close-top').addEventListener('click', closeModal);
        overlay.querySelector('#wm-pv-close-bottom').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        applyTopBtn.addEventListener('click', triggerApplyFromModal);
        applyBottomBtn.addEventListener('click', triggerApplyFromModal);

        refreshCountersAndSync();
        renderRows();
    }

    async function waitIfPaused() {
        const st = window.wmTagScanState;
        while (st.paused && !st.cancelled) {
            await new Promise(r => setTimeout(r, 300));
        }
        return !st.cancelled;
    }

    function renderTagsList() {
        const container = document.getElementById('wm-tags-list');
        if (!container) return;
        if (window.wmTagsCache.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucune étiquette.</div>';
            return;
        }
        container.innerHTML = window.wmTagsCache.map(tag => `
            <div class="wm-bulk-item" style="padding:6px 0;">
                <span style="display:flex;align-items:center;gap:8px;">
                    <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${tag.color || '#6366f1'};"></span>
                    <span style="font-weight:600;">${escapeHtml(tag.name)}</span>
                </span>
                <button class="wm-tracked-btn danger" data-tag-delete="${tag.id}" style="padding:3px 8px;font-size:10px;">🗑️</button>
            </div>
        `).join('');

        container.querySelectorAll('[data-tag-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tagId = btn.dataset.tagDelete;
                const tag = window.wmTagsCache.find(t => t.id === tagId);
                if (!confirm(`Supprimer l'étiquette "${tag?.name}" ?`)) return;
                try {
                    await wmDeleteTag(tagId);
                    renderTagsList();
                    renderRulesList();
                    window.logToPanel(`🗑️ Étiquette supprimée`);
                } catch(e) {
                    window.logToPanel(`❌ Erreur suppression: ${e.message}`);
                }
            });
        });
    }

    // ============================================================
    // RENDU DE LA LISTE DES GROUPES ET RÈGLES (AVEC SUPPORT ABONNÉ / LECTURE SEULE)
    // ============================================================
    function renderRulesList() {
        const container = document.getElementById('wm-rules-list');
        if (!container) return;
        const groups = getTagGroups();

        if (groups.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucun groupe. Cliquez sur "📁 Nouveau Groupe" ou "🌐 Gist / Import".</div>';
            return;
        }

        container.innerHTML = groups.map((g, gIdx) => {
            const isSub = Boolean(g.isSubscribed);
            const emoji = g.emoji || (isSub ? '🌐' : '📁');
            const borderCol = isSub ? 'rgba(56, 189, 248, 0.35)' : 'rgba(148,163,184,0.2)';

            return `
            <div style="background:rgba(30,41,59,0.6);border:1px solid ${borderCol};border-radius:8px;overflow:hidden;margin-bottom:8px;">
                <div data-group-toggle="${gIdx}" style="padding:10px 12px;background:rgba(15,23,42,0.65);display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:${g.isOpen ? '1px solid rgba(255,255,255,0.05)' : 'none'};">
                    <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;pointer-events:none;">
                        <span style="font-size:13px;font-weight:bold;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escapeHtml(emoji)} ${escapeHtml(g.name)} (${(g.rules||[]).length})
                        </span>
                        ${isSub ? `<span class="wm-sub-badge" title="Groupe synchronisé depuis un Gist (Lecture seule)">🌐 Abonné</span>` : ''}
                    </div>
                    <div style="display:flex; gap:5px; align-items:center; flex-shrink:0;">
                        ${isSub ? `
                            <button data-group-sync="${gIdx}" style="background:rgba(14,165,233,0.25);border:1px solid rgba(56,189,248,0.4);border-radius:6px;color:#7dd3fc;padding:3px 7px;cursor:pointer;font-size:10px;font-weight:700;" title="Synchroniser avec le Gist">🔄</button>
                            <button data-group-remap="${gIdx}" style="background:rgba(79,70,229,0.3);border:1px solid rgba(99,102,241,0.5);border-radius:6px;color:#c7d2fe;padding:3px 7px;cursor:pointer;font-size:10px;font-weight:700;" title="Remapper les étiquettes locales">🔗 Tags</button>
                            <button data-group-detach="${gIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:#cbd5e1;padding:3px 7px;cursor:pointer;font-size:10px;" title="Détacher du Gist (convertir en groupe local modifiable)">🔓</button>
                        ` : `
                            <button data-group-edit="${gIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:white;padding:3px 7px;cursor:pointer;font-size:11px;" title="Modifier le dossier">⚙️</button>
                        `}
                        <button data-group-remove="${gIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:3px 7px;cursor:pointer;font-size:11px;" title="Supprimer le dossier">🗑️</button>
                        <span style="color:#94a3b8;font-size:12px;pointer-events:none;margin-left:2px;">${g.isOpen ? '▲' : '▼'}</span>
                    </div>
                </div>
                <div style="display:${g.isOpen ? 'flex' : 'none'};flex-direction:column;gap:8px;padding:10px;">
                    ${(g.rules || []).map((rawRule, rIdx) => {
                        const rule = normalizeRuleStructure(rawRule);
                        const tagObj = window.wmTagsCache.find(t => t.id === rule.tagId);
                        const tagBorder = tagObj ? 'rgba(148,163,184,0.2)' : '#ef4444';
                        const ruleTitle = rule.name?.trim() ? rule.name : `Règle #${rIdx + 1}`;
                        const summaryHtml = formatGroupNatural(rule.rootGroup, true, true);

                        return `
                        <div class="${isSub ? '' : 'wm-rule-card-draggable'}" ${isSub ? '' : `data-drag-rule="${gIdx}-${rIdx}"`} style="background:rgba(15,23,42,0.65);border:1px solid ${tagBorder};border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;transition:opacity 0.2s;">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                                <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#f1f5f9;cursor:pointer;min-width:0;flex:1;">
                                    <input type="checkbox" data-rule-toggle="${gIdx}-${rIdx}" ${rule.enabled !== false ? 'checked' : ''} style="accent-color:#6366f1;cursor:pointer;flex-shrink:0;">
                                    <span style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(ruleTitle)}">${escapeHtml(ruleTitle)}</span>
                                </label>
                                <div style="display:flex; gap:4px; align-items:center; flex-shrink:0;">
                                    ${tagObj
                                        ? `<span style="background:${tagObj.color || '#6366f1'};color:#000;padding:2px 6px;border-radius:5px;font-size:10px;font-weight:800;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(tagObj.name)}</span>`
                                        : `<span style="background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid #ef4444;padding:1px 6px;border-radius:5px;font-size:9px;font-weight:700;">⚠️ Non lié</span>`
                                    }
                                    ${!isSub ? `<span class="wm-drag-handle" style="cursor:grab;color:#64748b;font-size:14px;padding:0 3px;user-select:none;" title="Glisser pour réorganiser">☰</span>` : `<span style="font-size:11px;color:#38bdf8;" title="Règle synchronisée (Lecture seule)">🔒</span>`}
                                </div>
                            </div>

                            <div ${isSub ? '' : `data-rule-edit="${gIdx}-${rIdx}"`} title="${isSub ? 'Règle gérée par le Gist partagé (Lecture seule)' : 'Cliquer pour ouvrir l\'éditeur logique avancé'}" style="background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.12);border-radius:6px;padding:6px 8px;font-size:11px;line-height:1.4;cursor:${isSub ? 'default' : 'pointer'};word-break:break-word;">
                                ${summaryHtml}
                            </div>

                            ${!isSub ? `
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                                    <button data-rule-edit="${gIdx}-${rIdx}" class="wm-panel-btn" style="flex:1;padding:5px 8px;font-size:11px;background:rgba(79,70,229,0.85);">
                                        ✏️ Éditer la logique
                                    </button>
                                    <button data-rule-dup="${gIdx}-${rIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:#cbd5e1;padding:5px 8px;cursor:pointer;font-size:11px;" title="Dupliquer cette règle">📄</button>
                                    <button data-rule-remove="${gIdx}-${rIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:5px 8px;cursor:pointer;font-size:11px;" title="Supprimer cette règle">🗑️</button>
                                </div>
                            ` : ''}
                        </div>
                        `;
                    }).join('')}
                    ${!isSub ? `
                        <button data-rule-add="${gIdx}" class="wm-panel-btn ghost" style="width:100%;font-size:11px;padding:7px;">➕ Nouvelle règle avancée</button>
                    ` : `
                        <div style="font-size:10px;color:#64748b;text-align:center;padding:2px 0;">
                            🔒 Groupe synchronisé en lecture seule • Utilisez 🔗 Tags pour modifier vos étiquettes ou 🔓 pour détacher.
                        </div>
                    `}
                </div>
            </div>
            `;
        }).join('');
        bindRuleListeners();
    }

    function bindRuleListeners() {
        const container = document.getElementById('wm-rules-list');
        if (!container || container._wmBound) return;
        container._wmBound = true;

        let draggedRule = null;
        let dragSourceEl = null;

        container.addEventListener('mousedown', (e) => {
            if (e.target.matches('.wm-drag-handle')) {
                const card = e.target.closest('.wm-rule-card-draggable');
                if (card) card.setAttribute('draggable', 'true');
            }
        });

        document.addEventListener('mouseup', () => {
            if (container) {
                container.querySelectorAll('.wm-rule-card-draggable').forEach(c => c.removeAttribute('draggable'));
            }
        });

        container.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card) {
                const [g, r] = card.dataset.dragRule.split('-').map(Number);
                draggedRule = { g, r };
                dragSourceEl = card;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => card.style.opacity = '0.4', 0);
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card && draggedRule && card !== dragSourceEl) {
                const [gTarget] = card.dataset.dragRule.split('-').map(Number);
                if (gTarget === draggedRule.g) {
                    e.dataTransfer.dropEffect = 'move';
                    const rect = card.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    if (e.clientY < mid) {
                        card.style.borderTop = '2px solid #6366f1';
                        card.style.borderBottom = '';
                    } else {
                        card.style.borderBottom = '2px solid #6366f1';
                        card.style.borderTop = '';
                    }
                }
            }
        });

        container.addEventListener('dragleave', (e) => {
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card) {
                card.style.borderTop = '';
                card.style.borderBottom = '';
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const card = e.target.closest('.wm-rule-card-draggable');
            if (card && draggedRule && card !== dragSourceEl) {
                card.style.borderTop = '';
                card.style.borderBottom = '';
                const [gTarget, rTarget] = card.dataset.dragRule.split('-').map(Number);

                if (gTarget === draggedRule.g) {
                    const groups = getTagGroups();
                    const group = groups[gTarget];

                    const rect = card.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    let insertIndex = rTarget;
                    if (e.clientY >= mid) insertIndex++;

                    const [movedRule] = group.rules.splice(draggedRule.r, 1);
                    if (draggedRule.r < insertIndex) insertIndex--;
                    group.rules.splice(insertIndex, 0, movedRule);

                    saveTagGroups(groups);
                    renderRulesList();
                }
            }
        });

        container.addEventListener('dragend', () => {
            if (dragSourceEl) dragSourceEl.style.opacity = '1';
            container.querySelectorAll('.wm-rule-card-draggable').forEach(c => {
                c.style.borderTop = '';
                c.style.borderBottom = '';
                c.removeAttribute('draggable');
            });
            draggedRule = null;
            dragSourceEl = null;
        });

        container.addEventListener('change', (e) => {
            const target = e.target;
            if (target.matches('[data-rule-toggle]')) {
                const groups = getTagGroups();
                const [g, r] = target.dataset.ruleToggle.split('-').map(Number);
                groups[g].rules[r].enabled = target.checked;
                saveTagGroups(groups);
            }
        });

        container.addEventListener('click', (e) => {
            const groups = getTagGroups();

            const editTrigger = e.target.closest('[data-rule-edit]');
            if (editTrigger) {
                const [gIdx, rIdx] = editTrigger.dataset.ruleEdit.split('-').map(Number);
                if (groups[gIdx]?.isSubscribed) return;
                openRuleBuilderModal(gIdx, rIdx);
                return;
            }

            const btn = e.target.closest('button');
            if (btn) {
                if (btn.matches('[data-group-sync]')) {
                    syncSubscribedGroup(Number(btn.dataset.groupSync));
                    return;
                }
                if (btn.matches('[data-group-remap]')) {
                    const gIdx = Number(btn.dataset.groupRemap);
                    const g = groups[gIdx];
                    if (g && g.isSubscribed) {
                        openSharedGroupMappingModal({
                            id: g.sharedGroupId,
                            name: g.name,
                            emoji: g.emoji,
                            requiredTags: g.requiredTags || [],
                            rules: g.rules || []
                        }, g.gistId, g.syncedAt);
                    }
                    return;
                }
                if (btn.matches('[data-group-detach]')) {
                    const gIdx = Number(btn.dataset.groupDetach);
                    const g = groups[gIdx];
                    if (g && confirm(`Détacher "${g.name}" du Gist ?\nIl deviendra un groupe local modifiable, mais ne recevra plus les mises à jour automatiques.`)) {
                        delete g.isSubscribed;
                        delete g.sharedGroupId;
                        delete g.gistId;
                        (g.rules || []).forEach(r => { delete r.isReadOnly; });
                        saveTagGroups(groups);
                        renderRulesList();
                        window.logToPanel(`🔓 Groupe "${g.name}" converti en dossier local.`);
                    }
                    return;
                }
                if (btn.matches('[data-group-edit]')) {
                    openGroupEditModal(Number(btn.dataset.groupEdit));
                    return;
                }
                if (btn.matches('[data-group-remove]')) {
                    const gIdx = Number(btn.dataset.groupRemove);
                    if (confirm("Supprimer ce dossier et toutes ses règles ?")) {
                        groups.splice(gIdx, 1);
                        saveTagGroups(groups);
                        renderRulesList();
                    }
                    return;
                }
                if (btn.matches('[data-rule-add]')) {
                    const gIdx = Number(btn.dataset.ruleAdd);
                    openRuleBuilderModal(gIdx, null);
                    return;
                }
                if (btn.matches('[data-rule-dup]')) {
                    const [gIdx, rIdx] = btn.dataset.ruleDup.split('-').map(Number);
                    const orig = normalizeRuleStructure(groups[gIdx].rules[rIdx]);
                    const copy = JSON.parse(JSON.stringify(orig));
                    copy.id = 'rule_' + Date.now();
                    copy.name = (orig.name ? orig.name : `Règle #${rIdx + 1}`) + ' (Copie)';
                    groups[gIdx].rules.splice(rIdx + 1, 0, copy);
                    saveTagGroups(groups);
                    renderRulesList();
                    return;
                }
                if (btn.matches('[data-rule-remove]')) {
                    const [gIdx, rIdx] = btn.dataset.ruleRemove.split('-').map(Number);
                    if (confirm("Supprimer cette règle ?")) {
                        groups[gIdx].rules.splice(rIdx, 1);
                        saveTagGroups(groups);
                        renderRulesList();
                    }
                    return;
                }
            }

            const toggleDiv = e.target.closest('[data-group-toggle]');
            if (toggleDiv) {
                const gIdx = Number(toggleDiv.dataset.groupToggle);
                groups[gIdx].isOpen = !groups[gIdx].isOpen;
                saveTagGroups(groups);
                renderRulesList();
            }
        });
    }

    // ============================================================
    // GRANDE MODALE D'ÉDITION LOGIQUE AVANCÉE (POP-UP)
    // ============================================================
    function openRuleBuilderModal(gIdx, rIdx = null) {
        ensureRuleBuilderStyles();

        const groups = getTagGroups();
        const group = groups[gIdx];
        if (!group || group.isSubscribed) return;

        const isNew = (rIdx === null || rIdx === undefined || !group.rules[rIdx]);
        const initialRule = isNew
            ? normalizeRuleStructure({
                id: 'rule_' + Date.now(),
                name: `Règle #${(group.rules?.length || 0) + 1}`,
                tagId: window.wmTagsCache[0]?.id || '',
                enabled: true,
                rootGroup: {
                    logic: 'AND',
                    children: [{ type: 'condition', field: 'title', operator: 'contains', value: '' }]
                }
            })
            : normalizeRuleStructure(group.rules[rIdx]);

        const draftRule = JSON.parse(JSON.stringify(initialRule));

        const existingOverlay = document.getElementById('wm-rule-builder-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'wm-rule-builder-overlay';

        overlay.innerHTML = `
            <div class="wm-rb-modal" role="dialog" aria-modal="true">
                <div class="wm-rb-header">
                    <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:260px;flex-wrap:wrap;">
                        <span style="font-size:18px;">🛠️</span>
                        <input type="text" id="wm-rb-rule-name" class="wm-rb-input" value="${escapeHtml(draftRule.name || '')}" placeholder="Nom ou descriptif de la règle (ex: Faune & Animaux)..." style="flex:1;min-width:200px;font-weight:700;font-size:13px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:11px;font-weight:700;color:#94a3b8;">TAG CIBLE →</span>
                            <select id="wm-rb-tag-select" class="wm-rb-select" style="font-weight:700;min-width:160px;">
                                <option value="">⚠️ Choisir un Tag...</option>
                                ${window.wmTagsCache.map(t => `<option value="${t.id}" ${draftRule.tagId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
                            </select>
                            <span id="wm-rb-tag-badge" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;color:#000;display:inline-block;"></span>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <button type="button" id="wm-rb-cancel-btn" class="wm-panel-btn ghost" style="padding:8px 14px;">Annuler</button>
                        <button type="button" id="wm-rb-save-btn" class="wm-panel-btn" style="padding:8px 18px;background:linear-gradient(135deg,#4f46e5,#6366f1);font-weight:700;">💾 Sauvegarder la règle</button>
                    </div>
                </div>
                <div class="wm-rb-preview-bar" id="wm-rb-natural-preview"></div>
                <div class="wm-rb-body" id="wm-rb-tree-container"></div>
            </div>
        `;

        document.body.appendChild(overlay);

        const nameInput = overlay.querySelector('#wm-rb-rule-name');
        const tagSelect = overlay.querySelector('#wm-rb-tag-select');
        const tagBadge = overlay.querySelector('#wm-rb-tag-badge');
        const previewBar = overlay.querySelector('#wm-rb-natural-preview');
        const treeContainer = overlay.querySelector('#wm-rb-tree-container');

        function updateHeaderAndPreview() {
            const tagObj = window.wmTagsCache.find(t => t.id === draftRule.tagId);
            if (tagObj) {
                tagBadge.style.display = 'inline-block';
                tagBadge.style.backgroundColor = tagObj.color || '#6366f1';
                tagBadge.textContent = tagObj.name;
            } else {
                tagBadge.style.display = 'none';
            }
            previewBar.innerHTML = getRuleNaturalSummary(draftRule, true);
        }

        nameInput.addEventListener('input', () => {
            draftRule.name = nameInput.value;
        });

        tagSelect.addEventListener('change', () => {
            draftRule.tagId = tagSelect.value;
            updateHeaderAndPreview();
        });

        function createGroupDom(groupNode, parentGroup = null, indexInParent = null) {
            const groupEl = document.createElement('div');
            const isOr = (groupNode.logic || 'AND').toUpperCase() === 'OR';
            groupEl.className = `wm-rb-group ${isOr ? 'logic-or' : 'logic-and'}`;

            const topBar = document.createElement('div');
            topBar.className = 'wm-rb-group-bar';

            const leftControls = document.createElement('div');
            leftControls.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

            const toggleWrap = document.createElement('div');
            toggleWrap.className = 'wm-rb-logic-toggle';

            const btnAnd = document.createElement('button');
            btnAnd.type = 'button';
            btnAnd.className = `wm-rb-logic-btn ${!isOr ? 'active-and' : ''}`;
            btnAnd.textContent = 'ET (Toutes vraies)';
            btnAnd.addEventListener('click', () => {
                groupNode.logic = 'AND';
                renderTree();
            });

            const btnOr = document.createElement('button');
            btnOr.type = 'button';
            btnOr.className = `wm-rb-logic-btn ${isOr ? 'active-or' : ''}`;
            btnOr.textContent = 'OU (Au moins une)';
            btnOr.addEventListener('click', () => {
                groupNode.logic = 'OR';
                renderTree();
            });

            toggleWrap.appendChild(btnAnd);
            toggleWrap.appendChild(btnOr);
            leftControls.appendChild(toggleWrap);

            const groupHint = document.createElement('span');
            groupHint.style.cssText = 'font-size:11px;color:#94a3b8;';
            groupHint.textContent = parentGroup === null
                ? 'Groupe principal'
                : 'Sous-groupe entre parenthèses ( ... )';
            leftControls.appendChild(groupHint);

            const rightControls = document.createElement('div');
            rightControls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

            const addCondBtn = document.createElement('button');
            addCondBtn.type = 'button';
            addCondBtn.className = 'wm-panel-btn ghost';
            addCondBtn.style.cssText = 'padding:5px 10px;font-size:11px;';
            addCondBtn.textContent = '+ Condition';
            addCondBtn.addEventListener('click', () => {
                groupNode.children.push({
                    type: 'condition',
                    field: 'title',
                    operator: 'contains',
                    value: ''
                });
                renderTree();
            });

            const addSubGroupBtn = document.createElement('button');
            addSubGroupBtn.type = 'button';
            addSubGroupBtn.className = 'wm-panel-btn ghost';
            addSubGroupBtn.style.cssText = 'padding:5px 10px;font-size:11px;border-color:rgba(245,158,11,0.4);color:#fcd34d;';
            addSubGroupBtn.textContent = '+ Sous-groupe (ET/OU)';
            addSubGroupBtn.addEventListener('click', () => {
                groupNode.children.push({
                    type: 'group',
                    logic: groupNode.logic === 'AND' ? 'OR' : 'AND',
                    children: [
                        { type: 'condition', field: 'title', operator: 'contains', value: '' },
                        { type: 'condition', field: 'category', operator: 'contains', value: '' }
                    ]
                });
                renderTree();
            });

            rightControls.appendChild(addCondBtn);
            rightControls.appendChild(addSubGroupBtn);

            if (parentGroup !== null) {
                const delGroupBtn = document.createElement('button');
                delGroupBtn.type = 'button';
                delGroupBtn.style.cssText = 'background:rgba(127,29,29,0.75);border:none;border-radius:6px;color:#fecaca;padding:5px 9px;cursor:pointer;font-size:11px;font-weight:700;';
                delGroupBtn.title = 'Supprimer ce sous-groupe';
                delGroupBtn.textContent = '🗑️ Sous-groupe';
                delGroupBtn.addEventListener('click', () => {
                    parentGroup.children.splice(indexInParent, 1);
                    if (parentGroup.children.length === 0) {
                        parentGroup.children.push({ type: 'condition', field: 'title', operator: 'contains', value: '' });
                    }
                    renderTree();
                });
                rightControls.appendChild(delGroupBtn);
            }

            topBar.appendChild(leftControls);
            topBar.appendChild(rightControls);
            groupEl.appendChild(topBar);

            const childrenWrap = document.createElement('div');
            childrenWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:4px;';

            groupNode.children.forEach((child, cIdx) => {
                if (cIdx > 0) {
                    const badge = document.createElement('div');
                    badge.className = `wm-rb-divider-badge ${isOr ? 'wm-rb-divider-or' : 'wm-rb-divider-and'}`;
                    badge.textContent = isOr ? 'OU' : 'ET';
                    childrenWrap.appendChild(badge);
                }

                if (child.type === 'group' || Array.isArray(child.children)) {
                    childrenWrap.appendChild(createGroupDom(child, groupNode, cIdx));
                } else {
                    childrenWrap.appendChild(createConditionDom(child, groupNode, cIdx));
                }
            });

            groupEl.appendChild(childrenWrap);
            return groupEl;
        }

        function createConditionDom(cond, parentGroup, indexInParent) {
            const row = document.createElement('div');
            row.className = 'wm-rb-cond-row';

            const mainLine = document.createElement('div');
            mainLine.className = 'wm-rb-cond-main';

            const fieldSelect = document.createElement('select');
            fieldSelect.className = 'wm-rb-select';
            fieldSelect.style.minWidth = '145px';
            Object.entries(WM_RULE_FIELDS).forEach(([k, f]) => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = f.label;
                if (cond.field === k) opt.selected = true;
                fieldSelect.appendChild(opt);
            });

            fieldSelect.addEventListener('change', () => {
                const newField = fieldSelect.value;
                cond.field = newField;
                const fType = WM_RULE_FIELDS[newField]?.type;
                cond.operator = fType === 'string' ? 'contains' : (fType === 'enum' ? '=' : '>');
                cond.value = fType === 'enum' ? (WM_RULE_FIELDS[newField]?.values?.[0] || 'C') : (fType === 'number' ? 100 : '');
                renderTree();
            });

            const fieldMeta = WM_RULE_FIELDS[cond.field] || { type: 'string' };
            let opList = ['>', '>=', '<', '<=', '=', '!='];
            if (fieldMeta.type === 'string') opList = ['contains', 'not_contains', '=', '!='];
            if (fieldMeta.type === 'enum') opList = ['=', '!='];

            const opSelect = document.createElement('select');
            opSelect.className = 'wm-rb-select';
            opSelect.style.minWidth = '155px';
            opList.forEach(op => {
                const opt = document.createElement('option');
                opt.value = op;
                opt.textContent = `${WM_OPERATOR_LABELS[op] || op} (${op})`;
                if (cond.operator === op) opt.selected = true;
                opSelect.appendChild(opt);
            });

            opSelect.addEventListener('change', () => {
                cond.operator = opSelect.value;
                renderTree();
            });

            mainLine.appendChild(fieldSelect);
            mainLine.appendChild(opSelect);

            const usesChips = fieldMeta.type === 'string' && (cond.operator === 'contains' || cond.operator === 'not_contains');

            if (fieldMeta.type === 'enum') {
                const valSelect = document.createElement('select');
                valSelect.className = 'wm-rb-select';
                valSelect.style.flex = '1';
                (fieldMeta.values || []).forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    if (String(cond.value) === v) opt.selected = true;
                    valSelect.appendChild(opt);
                });
                valSelect.addEventListener('change', () => {
                    cond.value = valSelect.value;
                    updateHeaderAndPreview();
                });
                mainLine.appendChild(valSelect);
            } else if (usesChips) {
                const chipsBox = document.createElement('div');
                chipsBox.className = 'wm-rb-chips-box';

                const interactiveArea = document.createElement('div');
                interactiveArea.className = 'wm-rb-chips-interactive';

                const rawWrap = document.createElement('div');
                rawWrap.className = 'wm-rb-raw-input-wrap';
                rawWrap.innerHTML = `<span>Liste brute (;) :</span>`;
                const rawInput = document.createElement('input');
                rawInput.type = 'text';
                rawInput.className = 'wm-rb-raw-input';
                rawInput.placeholder = 'mot1; mot2; mot3...';
                rawInput.value = String(cond.value ?? '');
                rawWrap.appendChild(rawInput);

                const parseTerms = (str) => String(str || '').split(';').map(s => s.trim()).filter(Boolean);

                const syncChipsUI = (updateRawInput = true) => {
                    const terms = parseTerms(cond.value);
                    if (updateRawInput) {
                        rawInput.value = terms.join('; ');
                    }

                    interactiveArea.innerHTML = '';
                    terms.forEach((term, tIdx) => {
                        const chip = document.createElement('span');
                        chip.className = 'wm-rb-chip';
                        chip.innerHTML = `<span>${escapeHtml(term)}</span>`;
                        const delBtn = document.createElement('button');
                        delBtn.type = 'button';
                        delBtn.className = 'wm-rb-chip-del';
                        delBtn.textContent = '✕';
                        delBtn.title = 'Retirer ce terme';
                        delBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const currentTerms = parseTerms(cond.value);
                            currentTerms.splice(tIdx, 1);
                            cond.value = currentTerms.join('; ');
                            syncChipsUI(true);
                            updateHeaderAndPreview();
                        });
                        chip.appendChild(delBtn);
                        interactiveArea.appendChild(chip);
                    });

                    const chipInput = document.createElement('input');
                    chipInput.type = 'text';
                    chipInput.className = 'wm-rb-chip-input';
                    chipInput.placeholder = terms.length === 0 ? 'Tapez un mot-clé puis ";" ou Entrée...' : 'Ajouter un terme (; ou Entrée)...';

                    const commitInputTokens = () => {
                        const val = chipInput.value.trim();
                        if (!val) return;
                        const newTokens = parseTerms(val);
                        if (newTokens.length > 0) {
                            const existing = parseTerms(cond.value);
                            newTokens.forEach(tok => {
                                if (!existing.some(e => e.toLowerCase() === tok.toLowerCase())) {
                                    existing.push(tok);
                                }
                            });
                            cond.value = existing.join('; ');
                            chipInput.value = '';
                            syncChipsUI(true);
                            updateHeaderAndPreview();
                            const newInput = interactiveArea.querySelector('.wm-rb-chip-input');
                            if (newInput) newInput.focus();
                        }
                    };

                    chipInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ';') {
                            e.preventDefault();
                            commitInputTokens();
                        } else if (e.key === 'Backspace' && chipInput.value === '') {
                            const existing = parseTerms(cond.value);
                            if (existing.length > 0) {
                                existing.pop();
                                cond.value = existing.join('; ');
                                syncChipsUI(true);
                                updateHeaderAndPreview();
                                const newInput = interactiveArea.querySelector('.wm-rb-chip-input');
                                if (newInput) newInput.focus();
                            }
                        }
                    });

                    chipInput.addEventListener('input', () => {
                        if (chipInput.value.includes(';')) {
                            commitInputTokens();
                        }
                    });

                    chipInput.addEventListener('blur', () => {
                        if (chipInput.value.trim()) {
                            commitInputTokens();
                        }
                    });

                    interactiveArea.appendChild(chipInput);
                };

                rawInput.addEventListener('input', () => {
                    cond.value = rawInput.value;
                    syncChipsUI(false);
                    updateHeaderAndPreview();
                });

                interactiveArea.addEventListener('click', (e) => {
                    if (e.target === interactiveArea) {
                        const inp = interactiveArea.querySelector('.wm-rb-chip-input');
                        if (inp) inp.focus();
                    }
                });

                syncChipsUI(true);
                chipsBox.appendChild(interactiveArea);
                chipsBox.appendChild(rawWrap);
                mainLine.appendChild(chipsBox);
            } else {
                const stdInput = document.createElement('input');
                stdInput.type = fieldMeta.type === 'number' ? 'number' : 'text';
                stdInput.className = 'wm-rb-input';
                stdInput.style.flex = '1';
                stdInput.placeholder = fieldMeta.type === 'number' ? 'Valeur numérique (ex: 100)...' : 'Valeur exacte...';
                stdInput.value = String(cond.value ?? '');
                stdInput.addEventListener('input', () => {
                    cond.value = fieldMeta.type === 'number' ? Number(stdInput.value) : stdInput.value;
                    updateHeaderAndPreview();
                });
                mainLine.appendChild(stdInput);
            }

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.style.cssText = 'background:rgba(127,29,29,0.75);border:none;border-radius:8px;color:#fecaca;width:34px;height:36px;cursor:pointer;font-size:13px;flex-shrink:0;';
            delBtn.title = 'Supprimer cette condition';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', () => {
                parentGroup.children.splice(indexInParent, 1);
                if (parentGroup.children.length === 0) {
                    parentGroup.children.push({ type: 'condition', field: 'title', operator: 'contains', value: '' });
                }
                renderTree();
            });

            mainLine.appendChild(delBtn);
            row.appendChild(mainLine);
            return row;
        }

        function renderTree() {
            treeContainer.innerHTML = '';
            treeContainer.appendChild(createGroupDom(draftRule.rootGroup, null, null));
            updateHeaderAndPreview();
        }

        renderTree();

        const closeModal = () => overlay.remove();

        overlay.querySelector('#wm-rb-cancel-btn').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        overlay.querySelector('#wm-rb-save-btn').addEventListener('click', () => {
            draftRule.name = nameInput.value.trim() || `Règle #${isNew ? (group.rules?.length || 0) + 1 : rIdx + 1}`;
            draftRule.tagId = tagSelect.value;
            draftRule.conditions = (draftRule.rootGroup.children || []).filter(c => c.type === 'condition');

            const freshGroups = getTagGroups();
            if (!freshGroups[gIdx]) return;
            if (!Array.isArray(freshGroups[gIdx].rules)) freshGroups[gIdx].rules = [];

            if (isNew) {
                freshGroups[gIdx].rules.push(draftRule);
            } else {
                freshGroups[gIdx].rules[rIdx] = draftRule;
            }

            saveTagGroups(freshGroups);
            renderRulesList();
            closeModal();
            window.logToPanel(`💾 Règle "${draftRule.name}" enregistrée.`);
        });
    }

    function openGroupEditModal(gIdx) {
        const groups = getTagGroups();
        const g = groups[gIdx];
        const currentEmoji = g.emoji || '📁';
        const currentName = g.name || '';

        const existing = document.getElementById('wm-group-edit-overlay');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'wm-group-edit-overlay';
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
        modal.innerHTML = `
            <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:12px;padding:20px;width:90%;max-width:400px;color:white;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                <h3 style="margin-top:0;font-size:16px;">⚙️ Paramètres du dossier</h3>

                <div style="display:flex; gap:10px; margin-bottom:16px;">
                    <div style="flex:0 0 60px;">
                        <label style="font-size:11px;color:#cbd5e1;font-weight:bold;">Émoji</label>
                        <input type="text" id="wm-edit-g-emoji" value="${escapeHtml(currentEmoji)}" maxlength="2" style="width:100%;margin-top:6px;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:8px;color:white;text-align:center;font-size:14px;outline:none;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:11px;color:#cbd5e1;font-weight:bold;">Nom du dossier</label>
                        <input type="text" id="wm-edit-g-name" value="${escapeHtml(currentName)}" style="width:100%;margin-top:6px;background:rgba(30,41,59,0.8);border:1px solid rgba(148,163,184,0.3);border-radius:6px;padding:8px;color:white;font-size:13px;outline:none;">
                    </div>
                </div>

                <div style="margin-bottom:16px; padding:12px; background:rgba(30,41,59,0.5); border:1px solid rgba(148,163,184,0.2); border-radius:8px;">
                    <span style="font-size:11px;color:#94a3b8;display:block;margin-bottom:8px;">Export spécifique (partage inter-comptes) :</span>
                    <button id="wm-btn-export-single" class="wm-panel-btn ghost" style="width:100%;">📤 Exporter uniquement ce dossier</button>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="wm-btn-edit-g-close" class="wm-panel-btn ghost">Annuler</button>
                    <button id="wm-btn-edit-g-save" class="wm-panel-btn">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('wm-btn-edit-g-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });

        document.getElementById('wm-btn-export-single').addEventListener('click', () => {
            const exportData = [{
                ...g,
                rules: (g.rules || []).map(r => ({ ...normalizeRuleStructure(r), tagId: '' }))
            }];
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
                window.logToPanel("📤 Dossier copié dans le presse-papier !");
                const btn = document.getElementById('wm-btn-export-single');
                btn.textContent = "✅ Copié !";
                setTimeout(() => btn.textContent = "📤 Exporter uniquement ce dossier", 2000);
            });
        });

        document.getElementById('wm-btn-edit-g-save').addEventListener('click', () => {
            const newEmoji = document.getElementById('wm-edit-g-emoji').value.trim() || '📁';
            const newName = document.getElementById('wm-edit-g-name').value.trim() || 'Sans nom';

            const currentGroups = getTagGroups();
            if (currentGroups[gIdx]) {
                currentGroups[gIdx].emoji = newEmoji;
                currentGroups[gIdx].name = newName;
                saveTagGroups(currentGroups);
                renderRulesList();
            }
            modal.remove();
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ----- Prévisualisation -----
    async function runTagPreview() {
        const st = window.wmTagScanState;
        if (st.running) return;

        const rules = getFlatRules();
        if (rules.length === 0) {
            window.logToPanel('❌ Aucune règle active.');
            return;
        }

        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const detailsBtn = document.getElementById('wm-tag-details-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        const modePage = document.getElementById('wm-tag-mode-page');

        const mode = modePage?.checked ? 'page' : 'full';

        st.running = true;
        st.paused = false;
        st.cancelled = false;
        st.phase = 'idle';
        st.mode = mode;
        st.progress = { current: 0, total: 0, text: '' };
        st.preview = null;
        st.startedAt = Date.now();

        previewBtn.disabled = true;
        applyBtn.disabled = true;
        if (detailsBtn) detailsBtn.style.display = 'none';
        pauseBtn.style.display = 'block';
        cancelBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';

        window.logToPanel(`🔍 Prévisualisation (mode ${mode === 'page' ? 'page actuelle' : 'complet'})...`);

        try {
            st.phase = 'loading-collection';
            renderScanProgress();

            let cards;
            if (mode === 'page') {
                st.progress.text = 'Lecture du DOM...';
                renderScanProgress();
                cards = await window.getVisibleCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (cards.length === 0) {
                    window.logToPanel('❌ Aucune carte visible sur la page.');
                    st.running = false;
                    restoreScanUI();
                    return;
                }
                window.logToPanel(`📄 ${cards.length} cartes visibles`);
            } else {
                window.wmScanState.cancelled = false;
                cards = await window.fetchAllCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (st.cancelled) throw new Error('cancelled');
                window.logToPanel(`📦 ${cards.length} cartes récupérées`);
            }

            if (!(await waitIfPaused())) throw new Error('cancelled');

            st.phase = 'computing';
            st.progress = { current: 0, total: cards.length, text: 'Évaluation des règles...' };
            renderScanProgress();

            const managedTagIds = new Set(rules.map(r => r.tagId));
            const desiredTagsByCard = new Map();
            const cardsWithDesired = [];

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const desired = window.evaluateAllRules(card, rules, window.wmPrices);
                desiredTagsByCard.set(card.userCardId || card.id || card.title, desired);
                if (desired.size > 0) cardsWithDesired.push(card);

                if (i % 20 === 0) {
                    st.progress.current = i;
                    st.progress.text = `"${card.title.slice(0, 30)}"`;
                    renderScanProgress();
                    if (!(await waitIfPaused())) throw new Error('cancelled');
                }
            }

            st.progress.current = cards.length;
            renderScanProgress();

            st.phase = 'checking';
            st.progress = { current: 0, total: cardsWithDesired.length, text: '' };
            renderScanProgress();

            const toAdd = [];
            const toRemove = [];
            let fetchErrors = 0;
            let skippedNoUserCard = 0;

            for (let i = 0; i < cardsWithDesired.length; i++) {
                if (!(await waitIfPaused())) throw new Error('cancelled');

                const card = cardsWithDesired[i];
                st.progress.current = i + 1;
                st.progress.text = `"${card.title.slice(0, 30)}"`;
                if (i % 3 === 0 || i === cardsWithDesired.length - 1) renderScanProgress();

                if (!card.userCardId) {
                    skippedNoUserCard++;
                    continue;
                }

                let existingTags;
                if (card.existingTags instanceof Set) {
                    existingTags = card.existingTags;
                } else if (window.wmUserCardTagsCache && window.wmUserCardTagsCache.has(card.userCardId)) {
                    existingTags = window.wmUserCardTagsCache.get(card.userCardId);
                } else {
                    try {
                        existingTags = await window.withRetry(
                            () => wmFetchUserCardTags(card.userCardId),
                            { label: `tags "${card.title.slice(0, 20)}"`, retries: 2, baseDelay: 1200, maxDelay: 4000 }
                        );
                    } catch (e) {
                        fetchErrors++;
                        continue;
                    }
                }

                const desiredTags = desiredTagsByCard.get(card.userCardId) || new Set();
                for (const tagId of desiredTags) {
                    if (!existingTags.has(tagId)) toAdd.push({ card, tagId });
                }
                for (const existingTagId of existingTags) {
                    if (managedTagIds.has(existingTagId) && !desiredTags.has(existingTagId)) {
                        toRemove.push({ card, tagId: existingTagId });
                    }
                }
            }

            st.preview = { toAdd, toRemove };
            ensurePreviewAllItems(st.preview);
            st.running = false;
            st.phase = 'idle';

            renderPreviewResult(st.preview);
            if (fetchErrors > 0) window.logToPanel(`⚠️ ${fetchErrors} erreurs réseau`);
            if (skippedNoUserCard > 0) window.logToPanel(`⏭️ ${skippedNoUserCard} cartes ignorées (userCardId manquant)`);

            window.logToPanel(`✅ Prévisualisation : +${toAdd.length} / -${toRemove.length}`);

        } catch (e) {
            st.running = false;
            st.phase = 'idle';
            if (e.message === 'cancelled') {
                summary.textContent = '⏹️ Annulé.';
                window.logToPanel('⏹️ Prévisualisation annulée');
            } else {
                summary.textContent = '❌ Erreur : ' + e.message;
                window.logToPanel(`❌ Erreur : ${e.message}`);
            }
        } finally {
            st.running = false;
            st.paused = false;
            restoreScanUI();
        }
    }

    // ----- Application -----
    async function runTagApply() {
        const st = window.wmTagScanState;
        if (st.running || !st.preview) return;
        ensurePreviewAllItems(st.preview);

        const { toAdd, toRemove } = st.preview;
        if (toAdd.length === 0 && toRemove.length === 0) return;

        st.running = true;
        st.paused = false;
        st.cancelled = false;
        st.phase = 'applying';
        st.progress = { current: 0, total: toAdd.length + toRemove.length, text: '' };

        const summary = document.getElementById('wm-tag-run-summary');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const detailsBtn = document.getElementById('wm-tag-details-btn');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');

        applyBtn.disabled = true;
        previewBtn.disabled = true;
        if (detailsBtn) detailsBtn.style.display = 'none';
        pauseBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';
        cancelBtn.style.display = 'block';

        window.logToPanel(`🚀 Application : +${toAdd.length} / -${toRemove.length}`);

        let done = 0, failed = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10;

        const updateProgress = () => {
            st.progress.current = done + failed;
            st.progress.text = `✅ ${done} ok, ❌ ${failed} erreurs`;
            renderScanProgress();
        };

        const BATCH_CHUNK_SIZE = 100;

        try {
            for (let i = 0; i < toAdd.length; i += BATCH_CHUNK_SIZE) {
                if (st.cancelled) break;
                if (!(await waitIfPaused())) break;

                const chunk = toAdd.slice(i, i + BATCH_CHUNK_SIZE);
                const pairs = chunk.map(item => ({ user_card_id: item.card.userCardId, tag_id: item.tagId }));

                let r;
                try {
                    r = await window.withRetry(() => wmApplyTagsBatch(pairs), {
                        label: `apply lot ${Math.floor(i / BATCH_CHUNK_SIZE) + 1}/${Math.ceil(toAdd.length / BATCH_CHUNK_SIZE)}`,
                        retries: 3,
                        baseDelay: 1000,
                        maxDelay: 6000
                    });
                } catch (e) {
                    r = { ok: false, error: e.message };
                }

                if (r && r.ok) {
                    done += chunk.length;
                    consecutiveErrors = 0;
                } else {
                    failed += chunk.length;
                    consecutiveErrors++;
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        window.logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs consécutives de lot, arrêt`);
                        break;
                    }
                }
                updateProgress();
                if (i + BATCH_CHUNK_SIZE < toAdd.length) {
                    await new Promise(res => setTimeout(res, 100));
                }
            }

            if (!st.cancelled && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
                consecutiveErrors = 0;
                for (let i = 0; i < toRemove.length; i += BATCH_CHUNK_SIZE) {
                    if (st.cancelled) break;
                    if (!(await waitIfPaused())) break;

                    const chunk = toRemove.slice(i, i + BATCH_CHUNK_SIZE);
                    const pairs = chunk.map(item => ({ user_card_id: item.card.userCardId, tag_id: item.tagId }));

                    let r;
                    try {
                        r = await window.withRetry(() => wmRemoveTagsBatch(pairs), {
                            label: `remove lot ${Math.floor(i / BATCH_CHUNK_SIZE) + 1}/${Math.ceil(toRemove.length / BATCH_CHUNK_SIZE)}`,
                            retries: 3,
                            baseDelay: 1000,
                            maxDelay: 6000
                        });
                    } catch (e) {
                        r = { ok: false, error: e.message };
                    }

                    if (r && r.ok) {
                        done += chunk.length;
                        consecutiveErrors = 0;
                    } else {
                        failed += chunk.length;
                        consecutiveErrors++;
                        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                            window.logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs de lot, arrêt`);
                            break;
                        }
                    }
                    updateProgress();
                    if (i + BATCH_CHUNK_SIZE < toRemove.length) {
                        await new Promise(res => setTimeout(res, 100));
                    }
                }
            }

            const msg = `✅ Terminé : ${done} opérations, ${failed} erreurs`;
            summary.innerHTML = `<div>${msg}</div>`;
            window.logToPanel(msg);
            window.showWMToast(msg, failed === 0);

            if (typeof window.renderTagsOnAllCards === 'function') {
                window.renderTagsOnAllCards();
            }

        } finally {
            st.running = false;
            st.paused = false;
            st.phase = 'idle';
            st.preview = null;
            applyBtn.disabled = true;
            previewBtn.disabled = false;
            restoreScanUI();
        }
    }

    window.WM_TAG_GROUPS_KEY = WM_TAG_GROUPS_KEY;
    window.WM_RULE_FIELDS = WM_RULE_FIELDS;
    window.WM_RULE_OPERATORS = WM_RULE_OPERATORS;

    // --- Cross-module exports ---
    window.processAutoTags = WikiM.processAutoTags = processAutoTags;
    window.wmFetchTags = WikiM.wmFetchTags = wmFetchTags;
    window.wmCreateTag = WikiM.wmCreateTag = wmCreateTag;
    window.wmDeleteTag = WikiM.wmDeleteTag = wmDeleteTag;
    window.wmFetchUserCardTags = WikiM.wmFetchUserCardTags = wmFetchUserCardTags;
    window.wmApplyTag = WikiM.wmApplyTag = wmApplyTag;
    window.wmRemoveTag = WikiM.wmRemoveTag = wmRemoveTag;
    window.wmApplyTagsBatch = WikiM.wmApplyTagsBatch = wmApplyTagsBatch;
    window.wmRemoveTagsBatch = WikiM.wmRemoveTagsBatch = wmRemoveTagsBatch;
    window.getTagGroups = WikiM.getTagGroups = getTagGroups;
    window.saveTagGroups = WikiM.saveTagGroups = saveTagGroups;
    window.getFlatRules = WikiM.getFlatRules = getFlatRules;
    window.initTagGroupsUI = WikiM.initTagGroupsUI = initTagGroupsUI;
    window.initTagsTab = WikiM.initTagsTab = initTagsTab;
    window.bindTagButtons = WikiM.bindTagButtons = bindTagButtons;
    window.restoreScanUI = WikiM.restoreScanUI = restoreScanUI;
    window.renderScanProgress = WikiM.renderScanProgress = renderScanProgress;
    window.renderPreviewResult = WikiM.renderPreviewResult = renderPreviewResult;
    window.openTagPreviewModal = WikiM.openTagPreviewModal = openTagPreviewModal;
    window.waitIfPaused = WikiM.waitIfPaused = waitIfPaused;
    window.renderTagsList = WikiM.renderTagsList = renderTagsList;
    window.renderRulesList = WikiM.renderRulesList = renderRulesList;
    window.bindRuleListeners = WikiM.bindRuleListeners = bindRuleListeners;
    window.openGroupEditModal = WikiM.openGroupEditModal = openGroupEditModal;
    window.openRuleBuilderModal = WikiM.openRuleBuilderModal = openRuleBuilderModal;
    window.normalizeRuleStructure = WikiM.normalizeRuleStructure = normalizeRuleStructure;
    window.escapeHtml = WikiM.escapeHtml = escapeHtml;
    window.runTagPreview = WikiM.runTagPreview = runTagPreview;
    window.runTagApply = WikiM.runTagApply = runTagApply;
    window.fetchSharedGistCatalog = WikiM.fetchSharedGistCatalog = fetchSharedGistCatalog;
    window.openSharedGroupMappingModal = WikiM.openSharedGroupMappingModal = openSharedGroupMappingModal;
    window.syncSubscribedGroup = WikiM.syncSubscribedGroup = syncSubscribedGroup;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});