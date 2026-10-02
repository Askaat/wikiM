// ============================================================
// WikiM - Module: Tags Engine, Rules & Tag Groups
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // MOTEUR D'AUTO-TAGGING SUPABASE (Intelligent & Anti-CORS)
    // ============================================================
    async function processAutoTags(pulledCards) {
        const isAutoTagEnabled = localStorage.getItem('wmAutoTagEnabled') === 'true';
        if (!isAutoTagEnabled || !pulledCards || pulledCards.length === 0) return;

        try {
            console.log("[WM-Tags] 🏷️ Démarrage de l'Auto-Tagging intelligent...");

            // Récupération de l'ID utilisateur
            const userId = (typeof W !== 'undefined' && W.wmUserId) ? W.wmUserId : window.wmUserId;
            if (!userId) throw new Error("ID utilisateur introuvable.");

            // 1. Récupération des user_card_id physiques
            const physicalCards = await supabaseRequestWithRetry(
                'GET',
                `/rest/v1/user_cards?select=id,card_id&user_id=eq.${userId}&order=obtained_at.desc&limit=${pulledCards.length}`
            );

            if (!physicalCards || !Array.isArray(physicalCards)) throw new Error("Impossible de récupérer les cartes physiques.");

            // 2. Chargement de TES règles avancées
            const activeRules = getFlatRules();

            // 3. Croisement des données et envoi des requêtes
            // 3. Croisement des données et envoi des requêtes
            for (const pc of pulledCards) {
                const physical = physicalCards.find(p => p.card_id === pc.id);
                if (!physical) continue;

                const title = pc.wikipedia_title || pc.title;

                let waitTime = 0;
                while ((!window.wmPrices[title] || window.wmPrices[title] === "LOADING") && waitTime < 80) {
                    await new Promise(r => setTimeout(r, 100));
                    waitTime++;
                }

                // Formatage de la carte avec la Description !
                const cardForEval = {
                    id: pc.id,
                    userCardId: physical.id,
                    title: title,
                    rarity: pc.rarity,
                    category: pc.category,
                    summary: pc.summary || pc.extract || pc.description || ''
                };

                const desiredTagIds = evaluateAllRules(cardForEval, activeRules, window.wmPrices);

                for (const tagId of desiredTagIds) {
                    await supabaseRequestWithRetry('POST', '/rest/v1/user_card_tags', {
                        user_card_id: physical.id,
                        tag_id: tagId
                    });

                    // Récupération des infos du tag
                    const tagObj = window.wmTagsCache.find(t => t.id === tagId);
                    const tagName = tagObj ? tagObj.name : 'Tag';
                    const tagColor = tagObj ? tagObj.color : '#a78bfa';

                    console.log(`[WM-Tags] ✅ Étiquette "${tagName}" appliquée sur ${title}`);

                    // Sauvegarde dans le cache visuel global
                    if (!window.wmVisualTagsCache) window.wmVisualTagsCache = {};
                    if (!window.wmVisualTagsCache[title]) window.wmVisualTagsCache[title] = [];

                    // On évite les doublons visuels
                    if (!window.wmVisualTagsCache[title].some(t => t.id === tagId)) {
                        window.wmVisualTagsCache[title].push({ id: tagId, name: tagName, color: tagColor });
                    }

                    // On force le rafraîchissement immédiat de l'UI
                    if (typeof renderTagsOnAllCards === 'function') renderTagsOnAllCards();

                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
        } catch (e) {
            console.error("[WM-Tags] ❌ Erreur d'Auto-Tagging :", e);
        }
    }


    async function wmFetchTags() {
        const tags = await supabaseRequestWithRetry('GET', '/rest/v1/tags?select=*');
        window.wmTagsCache = tags || [];
        return window.wmTagsCache;
    }

    async function wmCreateTag(name, color) {
        const userId = W.wmAuth.userId;
        if (!userId) throw new Error('user_id manquant');
        const result = await supabaseRequestWithRetry('POST', '/rest/v1/tags', {
            user_id: userId, name, color
        });
        const newTag = Array.isArray(result) ? result[0] : result;
        if (newTag) window.wmTagsCache.push(newTag);
        return newTag;
    }

    async function wmDeleteTag(tagId) {
        await supabaseRequestWithRetry('DELETE', `/rest/v1/tags?id=eq.${tagId}`);
        window.wmTagsCache = window.wmTagsCache.filter(t => t.id !== tagId);
    }

    async function wmFetchUserCardTags(userCardId) {
        if (window.wmUserCardTagsCache.has(userCardId)) {
            return window.wmUserCardTagsCache.get(userCardId);
        }
        const rows = await supabaseRequestWithRetry('GET',
                                           `/rest/v1/user_card_tags?select=*&user_card_id=eq.${userCardId}`);
        const tagIds = new Set((rows || []).map(r => r.tag_id));
        window.wmUserCardTagsCache.set(userCardId, tagIds);
        return tagIds;
    }

    async function wmApplyTag(userCardId, tagId) {
        const existing = await wmFetchUserCardTags(userCardId);
        if (existing.has(tagId)) return { ok: true, skipped: true };
        try {
            await supabaseRequestWithRetry('POST', '/rest/v1/user_card_tags', {
                user_card_id: userCardId,
                tag_id: tagId
            });
            existing.add(tagId);
            return { ok: true, skipped: false };
        } catch (e) {
            if (String(e.message).includes('409') || String(e.message).includes('duplicate')) {
                existing.add(tagId);
                return { ok: true, skipped: true };
            }
            return { ok: false, error: e.message };
        }
    }

    async function wmRemoveTag(userCardId, tagId) {
        const existing = await wmFetchUserCardTags(userCardId);
        if (!existing.has(tagId)) return { ok: true, skipped: true };
        try {
            await supabaseRequestWithRetry('DELETE',
                                  `/rest/v1/user_card_tags?user_card_id=eq.${userCardId}&tag_id=eq.${tagId}`);
            existing.delete(tagId);
            return { ok: true, skipped: false };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    // ============================================================
    // MOTEUR DE RÈGLES D'AUTO-TAGGING (GROUPES & IMPORT/EXPORT)
    // ============================================================
    const WM_TAG_GROUPS_KEY = 'wmTagGroups';

    function getTagGroups() {
        try {
            let groups = JSON.parse(localStorage.getItem(WM_TAG_GROUPS_KEY));
            if (!groups || !Array.isArray(groups)) {
                // Migration automatique : on récupère tes anciennes règles
                const oldRules = JSON.parse(localStorage.getItem('wmTagRules') || '[]');
                if (oldRules.length > 0) {
                    groups = [{ id: 'g_' + Date.now(), name: 'Mes Anciennes Règles', isOpen: true, rules: oldRules }];
                    saveTagGroups(groups);
                } else {
                    groups = [];
                }
            }
            return groups;
        } catch { return []; }
    }

    function saveTagGroups(groups) {
        localStorage.setItem(WM_TAG_GROUPS_KEY, JSON.stringify(groups));
    }

    function getFlatRules() {
        // Aplatit tous les dossiers pour obtenir une liste simple, et ignore les règles sans étiquette
        return getTagGroups()
            .flatMap(g => g.rules || [])
            .filter(r => r.enabled !== false && r.tagId && r.tagId !== '');
    }

    const WM_RULE_FIELDS = {
        'avgPrice': {
            label: 'Prix moyen',
            type: 'number',
            getter: (card, prices) => {
                return wmGetPriceFor(card.title, card.rarity);
            }
        },
        'rarity': { label: 'Rareté', type: 'enum', values: ['C','PC','R','SR','UR','L'],
                   getter: (card) => card.rarity },
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
            // Découpe les termes séparés par ";" et retire les espaces vides
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return true;
            // Retourne vrai si AU MOINS UN terme est présent (Logique OU)
            return terms.some(term => valA.includes(term));
        },
        'not_contains': (a, b) => {
            const valA = String(a).toLowerCase();
            const terms = String(b).toLowerCase().split(';').map(t => t.trim()).filter(t => t);
            if (terms.length === 0) return true;
            // Retourne vrai si AUCUN des termes n'est présent (Logique ET)
            return terms.every(term => !valA.includes(term));
        }
    };


    // Tag Groups UI & Listeners initialization
    function initTagGroupsUI() {
        // ============================================================
        // LOGIQUE GESTIONNAIRE DE TAGS (Groupes)
        // ============================================================

        function getTagGroups() {
            return JSON.parse(localStorage.getItem('wmTagGroups') || '[]');
        }
        function saveTagGroups(groups) {
            localStorage.setItem('wmTagGroups', JSON.stringify(groups));
        }

        function renderTagGroups() {
            const container = document.getElementById('wm-tags-groups-list');
            if (!container) return;
            const groups = getTagGroups();

            const autoTagCheckbox = document.getElementById('wm-toggle-autotag');
            if (autoTagCheckbox) {
                autoTagCheckbox.checked = localStorage.getItem('wmAutoTagEnabled') === 'true';
            }

            if (groups.length === 0) {
                container.innerHTML = '<div class="wm-tracked-empty" style="margin-top:10px;">Aucun groupe configuré.</div>';
                return;
            }

            container.innerHTML = groups.map((g, gIdx) => `
        <div class="wm-tag-group">
            <div class="wm-tag-group-header" data-idx="${gIdx}">
                <span class="wm-tag-group-title">📁 ${g.name} (${g.rules ? g.rules.length : 0})</span>
                <span style="color:#ef4444; font-size:12px;" class="wm-del-group-btn" data-idx="${gIdx}">✕</span>
            </div>
            <div class="wm-tag-group-content">
                ${(g.rules || []).map((r, rIdx) => `
                    <div class="wm-tag-rule-row">
                        <span style="font-size:11px; color:#cbd5e1;">Contient : <b>"${r.keyword}"</b></span>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="wm-tag-badge" style="background-color:${r.tagColor || '#a78bfa'};">${r.tagName || 'Tag'}</span>
                            <button class="wm-del-rule-btn" data-gidx="${gIdx}" data-ridx="${rIdx}" style="background:none; border:none; color:#ef4444; cursor:pointer;">✕</button>
                        </div>
                    </div>
                `).join('')}
                <div style="display:flex; gap:6px; margin-top:4px;">
                    <input type="text" id="wm-rule-kw-${gIdx}" class="wm-panel-input" placeholder="Mot clé..." style="flex:1; font-size:10px; padding:4px;">
                    <select id="wm-rule-tag-${gIdx}" class="wm-panel-input" style="flex:1; font-size:10px; padding:4px;">
                        ${Object.keys(window.wmTags).map(tagName =>
                                                         `<option value="${window.wmTags[tagName].id}|${tagName}|${window.wmTags[tagName].color}">${tagName}</option>`
                                                        ).join('')}
                    </select>
                    <button class="wm-panel-btn wm-add-rule-btn" data-idx="${gIdx}" style="padding:4px 8px; font-size:10px;">+</button>
                </div>
            </div>
        </div>
    `).join('');
        }

        // Écouteurs globaux pour l'onglet Tags
        document.addEventListener('click', (e) => {
            // Créer un groupe
            if (e.target.id === 'wm-btn-add-group') {
                const input = document.getElementById('wm-new-group-name');
                if (!input.value.trim()) return;
                const groups = getTagGroups();
                groups.push({ name: input.value.trim(), rules: [] });
                saveTagGroups(groups);
                input.value = '';
                renderTagGroups();
            }
            // Ouvrir/Fermer un groupe (Accordéon)
            else if (e.target.closest('.wm-tag-group-header') && !e.target.classList.contains('wm-del-group-btn')) {
                const header = e.target.closest('.wm-tag-group-header');
                header.parentElement.classList.toggle('open');
            }
            // Supprimer un groupe
            else if (e.target.classList.contains('wm-del-group-btn')) {
                const groups = getTagGroups();
                groups.splice(e.target.dataset.idx, 1);
                saveTagGroups(groups);
                renderTagGroups();
            }
            // Ajouter une règle
            else if (e.target.classList.contains('wm-add-rule-btn')) {
                const gIdx = e.target.dataset.idx;
                const kw = document.getElementById(`wm-rule-kw-${gIdx}`).value.trim();
                const tagData = document.getElementById(`wm-rule-tag-${gIdx}`).value.split('|');

                if (!kw || tagData.length !== 3) return;

                const groups = getTagGroups();
                groups[gIdx].rules.push({ keyword: kw, tagId: tagData[0], tagName: tagData[1], tagColor: tagData[2] });
                saveTagGroups(groups);
                renderTagGroups();

                // Garder l'accordéon ouvert
                setTimeout(() => {
                    const header = document.querySelector(`.wm-tag-group-header[data-idx="${gIdx}"]`);
                    if(header) header.parentElement.classList.add('open');
                }, 10);
            }
            // Supprimer une règle
            else if (e.target.classList.contains('wm-del-rule-btn')) {
                const gIdx = e.target.dataset.gidx;
                const rIdx = e.target.dataset.ridx;
                const groups = getTagGroups();
                groups[gIdx].rules.splice(rIdx, 1);
                saveTagGroups(groups);
                renderTagGroups();

                // Garder l'accordéon ouvert
                setTimeout(() => {
                    const header = document.querySelector(`.wm-tag-group-header[data-idx="${gIdx}"]`);
                    if(header) header.parentElement.classList.add('open');
                }, 10);
            }
        });

        // Écouteur pour la checkbox Auto-Tag
        document.addEventListener('change', (e) => {
            if (e.target.id === 'wm-toggle-autotag') {
                localStorage.setItem('wmAutoTagEnabled', e.target.checked);
            }
        });

        // Actualiser l'affichage de l'onglet si on clique dessus
        document.addEventListener('click', (e) => {
            if (e.target.closest('.wm-menu-item') && e.target.closest('.wm-menu-item').dataset.tab === 'tags') {
                renderTagGroups();
            }
        });

    }
    window.initTagGroupsUI = initTagGroupsUI;
    window.WikiM.initTagGroupsUI = initTagGroupsUI;
    // ============================================================
    // UI ONGLET TAGS
    // ============================================================

    async function initTagsTab() {
        if (window.wmTagsCache.length === 0) {
            try { await wmFetchTags(); } catch(e) { console.warn('[WM-Tags] fetch échoué:', e); }
        }

        // ---> FIX: Restauration de l'état de la checkbox Auto-Tag au démarrage <---
        const autoTagCheckbox = document.getElementById('wm-toggle-autotag');
        if (autoTagCheckbox) {
            autoTagCheckbox.checked = localStorage.getItem('wmAutoTagEnabled') === 'true';
        }

        const fillBtn = document.getElementById('wm-cache-fill-btn');
        if (fillBtn && !fillBtn._wmBound) {
            fillBtn._wmBound = true;
            fillBtn.addEventListener('click', async () => {
                fillBtn.disabled = true;
                fillBtn.textContent = '⏳...';
                try {
                    const before = window.wmCollectionCache.cards.length;
                    await getVisibleCollectionCards(txt => logToPanel(txt));
                    const after = window.wmCollectionCache.cards.length;
                    logToPanel(`📥 ${after - before} cartes ajoutées au cache (total: ${after})`);
                    if (typeof renderCacheInfo === 'function') renderCacheInfo();
                } catch (e) {
                    logToPanel(`❌ ${e.message}`);
                } finally {
                    fillBtn.disabled = false;
                    fillBtn.textContent = '📥 Remplir la page';
                }
            });
        }
        // ---> INJECTION DES BOUTONS GROUPES ET MODALE IMPORT/EXPORT <---
        const oldAddRuleBtn = document.getElementById('wm-add-rule-btn');
        if (oldAddRuleBtn) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex; gap:6px; margin-bottom:8px;";
            wrapper.innerHTML = `
                <button id="wm-btn-add-group" class="wm-panel-btn" style="flex:1;">📁 Nouveau Groupe</button>
                <button id="wm-btn-ie-modal" class="wm-panel-btn ghost" style="flex:1;">⚙️ Import / Export</button>
            `;
            oldAddRuleBtn.replaceWith(wrapper);

            document.getElementById('wm-btn-add-group').addEventListener('click', () => {
                const name = prompt("Nom du nouveau dossier :");
                if (name) {
                    const groups = getTagGroups();
                    groups.push({ id: 'g_'+Date.now(), name, isOpen: true, rules: [] });
                    saveTagGroups(groups);
                    renderRulesList();
                }
            });

            document.getElementById('wm-btn-ie-modal').addEventListener('click', () => document.getElementById('wm-ie-overlay').style.display = 'flex');
        }

        if (!document.getElementById('wm-ie-overlay')) {
            const modal = document.createElement('div');
            modal.id = "wm-ie-overlay";
            modal.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:100001;align-items:center;justify-content:center;backdrop-filter:blur(4px);";
            modal.innerHTML = `
                <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:12px;padding:20px;width:90%;max-width:500px;color:white;box-shadow:0 24px 48px rgba(0,0,0,0.7);">
                    <h3 style="margin-top:0;font-size:16px;">⚙️ Import / Export des Règles</h3>
                    <p style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Générez votre code d'export (les IDs locaux des étiquettes sont supprimés pour le partage), ou collez un code pour importer des dossiers.</p>
                    <textarea id="wm-ie-textarea" style="width:100%;height:150px;background:rgba(30,41,59,0.8);color:#fbbf24;border:1px solid rgba(148,163,184,0.3);border-radius:8px;padding:10px;font-family:monospace;font-size:11px;outline:none;resize:vertical;" placeholder="Collez un code d'import ici..."></textarea>
                    <div style="display:flex;gap:10px;margin-top:16px;justify-content:space-between;">
                        <button id="wm-btn-ie-close" class="wm-panel-btn ghost">Fermer</button>
                        <div style="display:flex;gap:10px;">
                            <button id="wm-btn-ie-export" class="wm-panel-btn ghost">📤 Exporter</button>
                            <button id="wm-btn-ie-import" class="wm-panel-btn">📥 Importer</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('wm-btn-ie-close').addEventListener('click', () => modal.style.display = 'none');

            document.getElementById('wm-btn-ie-export').addEventListener('click', () => {
                const groups = getTagGroups();
                // On efface le tagId à l'export pour que le code soit universel
                const exportData = groups.map(g => ({ ...g, rules: g.rules.map(r => ({ ...r, tagId: '' })) }));
                const ta = document.getElementById('wm-ie-textarea');
                ta.value = JSON.stringify(exportData, null, 2);
                ta.select();
                document.execCommand('copy');
                logToPanel("📤 Export copié dans le presse-papier !");
            });

            document.getElementById('wm-btn-ie-import').addEventListener('click', () => {
                try {
                    const ta = document.getElementById('wm-ie-textarea');
                    const imported = JSON.parse(ta.value);
                    if (!Array.isArray(imported)) throw new Error("Format invalide");

                    const groups = getTagGroups();
                    imported.forEach(ig => {
                        groups.push({
                            id: 'g_' + Date.now() + Math.random(),
                            name: ig.name + " (Importé)",
                            isOpen: true,
                            rules: Array.isArray(ig.rules) ? ig.rules : []
                        });
                    });
                    saveTagGroups(groups);
                    renderRulesList();
                    modal.style.display = 'none';
                    ta.value = '';
                    logToPanel("📥 Groupes importés avec succès ! Pensez à réassigner vos étiquettes.");
                } catch(e) { alert("Erreur d'importation : Le code fourni est invalide."); }
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
                    renderRulesList(); // pour rafraîchir les dropdowns
                    logToPanel(`🏷️ Étiquette "${name}" créée`);
                } catch(e) {
                    logToPanel(`❌ Erreur création tag: ${e.message}`);
                }
            });
        }

        const previewBtn = document.getElementById('wm-tag-preview-btn');
        if (previewBtn && !previewBtn._wmBound) {
            previewBtn._wmBound = true;
            previewBtn.addEventListener('click', runTagPreview);
        }

        const applyBtn = document.getElementById('wm-tag-apply-btn');
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
                    logToPanel('⏹️ Annulation demandée...');
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
                logToPanel(st.paused ? '⏸️ Scan mis en pause' : '▶️ Scan repris');
            });
        }

        const modePage = document.getElementById('wm-tag-mode-page');
        const modeHint = document.getElementById('wm-tag-mode-hint');
        if (modePage && !modePage._wmBound) {
            modePage._wmBound = true;
            // Restaure le dernier choix
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
    }

    function restoreScanUI() {
        const st = window.wmTagScanState;
        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        if (!summary) return;

        if (st.running) {
            previewBtn.disabled = true;
            applyBtn.disabled = true;
            pauseBtn.style.display = 'block';
            cancelBtn.style.display = 'block';
            pauseBtn.textContent = st.paused ? '▶️ Reprendre' : '⏸️ Pause';
            renderScanProgress();
        } else if (st.preview) {
            previewBtn.disabled = false;
            applyBtn.disabled = (st.preview.toAdd.length + st.preview.toRemove.length) === 0;
            pauseBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            renderPreviewResult(st.preview);
        } else {
            previewBtn.disabled = false;
            applyBtn.disabled = true;
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
        if (!summary) return;
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

    // Helper de pause avec attente active
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
                    logToPanel(`🗑️ Étiquette supprimée`);
                } catch(e) {
                    logToPanel(`❌ Erreur suppression: ${e.message}`);
                }
            });
        });
    }

    function renderRulesList() {
        const container = document.getElementById('wm-rules-list');
        if (!container) return;
        const groups = getTagGroups();

        if (groups.length === 0) {
            container.innerHTML = '<div class="wm-tracked-empty">Aucun groupe. Cliquez sur "📁 Nouveau Groupe".</div>';
            return;
        }

        container.innerHTML = groups.map((g, gIdx) => {
            const emoji = g.emoji || '📁';
            return `
            <div style="background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.2);border-radius:8px;overflow:hidden;margin-bottom:8px;">
                <div data-group-toggle="${gIdx}" style="padding:10px 12px;background:rgba(15,23,42,0.6);display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:${g.isOpen ? '1px solid rgba(255,255,255,0.05)' : 'none'};">
                    <span style="font-size:13px;font-weight:bold;color:#e5e7eb;pointer-events:none;">${escapeHtml(emoji)} ${escapeHtml(g.name)} (${(g.rules||[]).length})</span>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button data-group-edit="${gIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;" title="Modifier le dossier">⚙️</button>
                        <button data-group-remove="${gIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;" title="Supprimer le dossier">🗑️</button>
                        <span style="color:#94a3b8;font-size:12px;pointer-events:none;margin-left:4px;">${g.isOpen ? '▲' : '▼'}</span>
                    </div>
                </div>
                <div style="display:${g.isOpen ? 'flex' : 'none'};flex-direction:column;gap:8px;padding:12px;">
                    ${(g.rules || []).map((rule, rIdx) => {
                        const tagBorder = rule.tagId ? 'rgba(148,163,184,0.15)' : '#ef4444';
                        const conditionsHtml = rule.conditions.map((cond, cIdx) => {
                            const field = WM_RULE_FIELDS[cond.field] || {};
                            const isEnum = field.type === 'enum';
                            const isString = field.type === 'string';
                            let opOptions = ['>', '>=', '<', '<=', '=', '!='];
                            if (isString) opOptions = ['contains', 'not_contains', '=', '!='];
                            if (isEnum) opOptions = ['=', '!='];

                            let valueInput = '';
                            if (isEnum) {
                                const opts = (field.values || []).map(v => `<option value="${v}" ${cond.value === v ? 'selected' : ''}>${v}</option>`).join('');
                                valueInput = `<select data-cond-value="${gIdx}-${rIdx}-${cIdx}" style="flex:1;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">${opts}</select>`;
                            } else {
                                const inputType = field.type === 'number' ? 'number' : 'text';
                                valueInput = `<input type="${inputType}" data-cond-value="${gIdx}-${rIdx}-${cIdx}" value="${escapeHtml(String(cond.value))}" style="flex:1;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;outline:none;">`;
                            }

                            return `
                            <div style="display:flex;gap:4px;align-items:center;width:100%;">
                                <select data-cond-field="${gIdx}-${rIdx}-${cIdx}" style="flex:1.2;min-width:0;text-overflow:ellipsis;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    ${Object.entries(WM_RULE_FIELDS).map(([k, f]) => `<option value="${k}" ${cond.field === k ? 'selected' : ''}>${f.label}</option>`).join('')}
                                </select>
                                <select data-cond-op="${gIdx}-${rIdx}-${cIdx}" style="flex:0.6;min-width:0;background:rgba(30,41,59,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    ${opOptions.map(op => `<option value="${op}" ${cond.operator === op ? 'selected' : ''}>${op}</option>`).join('')}
                                </select>
                                ${valueInput}
                                <button data-cond-remove="${gIdx}-${rIdx}-${cIdx}" style="flex-shrink:0;background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;width:24px;height:24px;cursor:pointer;font-size:12px;">✕</button>
                            </div>
                            `;
                        }).join('');

                        return `
                        <div class="wm-rule-card-draggable" data-drag-rule="${gIdx}-${rIdx}" style="background:rgba(15,23,42,0.5);border:1px solid ${tagBorder};border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:6px;transition:opacity 0.2s;">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cbd5e1;cursor:pointer;">
                                    <input type="checkbox" data-rule-toggle="${gIdx}-${rIdx}" ${rule.enabled !== false ? 'checked' : ''} style="accent-color:#6366f1;cursor:pointer;">
                                    <span style="font-weight:700;">Règle #${rIdx + 1}</span>
                                </label>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <span class="wm-drag-handle" style="cursor:grab;color:#64748b;font-size:16px;padding:0 4px;user-select:none;" title="Glisser pour réorganiser">☰</span>
                                    <button data-rule-remove="${gIdx}-${rIdx}" style="background:rgba(127,29,29,0.7);border:none;border-radius:6px;color:white;padding:3px 8px;cursor:pointer;font-size:11px;">🗑️</button>
                                </div>
                            </div>
                            <div style="display:flex;gap:6px;align-items:center;">
                                <span style="font-size:10px;color:#94a3b8;font-weight:700;">TAG →</span>
                                <select data-rule-tag="${gIdx}-${rIdx}" style="flex:1;background:rgba(30,41,59,0.6);border:1px solid ${tagBorder};border-radius:6px;padding:6px;color:white;font-size:11px;">
                                    <option value="">⚠️ Sélectionner une étiquette...</option>
                                    ${window.wmTagsCache.map(t => `<option value="${t.id}" ${rule.tagId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;">${conditionsHtml}</div>
                            <button data-cond-add="${gIdx}-${rIdx}" style="background:rgba(51,65,85,0.7);border:none;border-radius:6px;color:#cbd5e1;padding:4px 8px;cursor:pointer;font-size:10px;font-weight:600;align-self:flex-start;">+ Condition (ET)</button>
                        </div>
                        `;
                    }).join('')}
                    <button data-rule-add="${gIdx}" class="wm-panel-btn ghost" style="width:100%;font-size:11px;padding:6px;">➕ Ajouter une règle ici</button>
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

        // ==========================================
        // GESTION DU DRAG & DROP
        // ==========================================
        let draggedRule = null;
        let dragSourceEl = null;

        // Active le drag uniquement si on clique sur l'icône ☰
        container.addEventListener('mousedown', (e) => {
            if (e.target.matches('.wm-drag-handle')) {
                const card = e.target.closest('.wm-rule-card-draggable');
                if (card) card.setAttribute('draggable', 'true');
            }
        });

        // Sécurité : désactive le drag quand on lâche le clic
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
                setTimeout(() => card.style.opacity = '0.4', 0); // Effet fantôme transparent
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.wm-rule-card-draggable');
            // On s'assure qu'on reste dans le même groupe (dossier)
            if (card && draggedRule && card !== dragSourceEl) {
                const [gTarget] = card.dataset.dragRule.split('-').map(Number);
                if (gTarget === draggedRule.g) {
                    e.dataTransfer.dropEffect = 'move';
                    const rect = card.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    // Ligne d'indication visuelle (dessus ou dessous)
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
                    if (e.clientY >= mid) insertIndex++; // Insertion en dessous

                    // Modification du tableau pour appliquer le nouvel ordre
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

        // ==========================================
        // GESTION DES SELECT ET INPUTS
        // ==========================================
        container.addEventListener('change', (e) => {
            const target = e.target;
            const groups = getTagGroups();

            if (target.matches('[data-rule-toggle]')) {
                const [g, r] = target.dataset.ruleToggle.split('-').map(Number);
                groups[g].rules[r].enabled = target.checked;
                saveTagGroups(groups); return;
            }
            if (target.matches('[data-rule-tag]')) {
                const [g, r] = target.dataset.ruleTag.split('-').map(Number);
                groups[g].rules[r].tagId = target.value;
                saveTagGroups(groups); renderRulesList(); return;
            }
            if (target.matches('[data-cond-field]')) {
                const [g, r, c] = target.dataset.condField.split('-').map(Number);
                const newField = target.value;
                groups[g].rules[r].conditions[c].field = newField;
                const fieldType = WM_RULE_FIELDS[newField]?.type;
                groups[g].rules[r].conditions[c].operator = fieldType === 'string' ? 'contains' : fieldType === 'enum' ? '=' : '>';
                groups[g].rules[r].conditions[c].value = fieldType === 'enum' ? (WM_RULE_FIELDS[newField]?.values?.[0] || '') : (fieldType === 'number' ? 0 : '');
                saveTagGroups(groups); renderRulesList(); return;
            }
            if (target.matches('[data-cond-op]')) {
                const [g, r, c] = target.dataset.condOp.split('-').map(Number);
                groups[g].rules[r].conditions[c].operator = target.value;
                saveTagGroups(groups); return;
            }
            if (target.matches('[data-cond-value]')) {
                const [g, r, c] = target.dataset.condValue.split('-').map(Number);
                const fieldType = WM_RULE_FIELDS[groups[g].rules[r].conditions[c].field]?.type;
                groups[g].rules[r].conditions[c].value = fieldType === 'number' ? Number(target.value) : target.value;
                saveTagGroups(groups); return;
            }
        });

        // ==========================================
        // GESTION DES BOUTONS D'ACTION
        // ==========================================
        container.addEventListener('click', (e) => {
            const groups = getTagGroups();
            const btn = e.target.closest('button');

            if (btn) {
                if (btn.matches('[data-group-edit]')) {
                    const gIdx = Number(btn.dataset.groupEdit);
                    openGroupEditModal(gIdx); return;
                }
                if (btn.matches('[data-group-remove]')) {
                    const gIdx = Number(btn.dataset.groupRemove);
                    if(confirm("Supprimer ce dossier et toutes ses règles ?")) {
                        groups.splice(gIdx, 1);
                        saveTagGroups(groups); renderRulesList();
                    } return;
                }
                if (btn.matches('[data-rule-add]')) {
                    const gIdx = Number(btn.dataset.ruleAdd);
                    if (!groups[gIdx].rules) groups[gIdx].rules = [];
                    groups[gIdx].rules.push({
                        id: 'rule_' + Date.now(),
                        tagId: '',
                        enabled: true,
                        conditions: [{ field: 'avgPrice', operator: '>', value: 100 }]
                    });
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-rule-remove]')) {
                    const [g, r] = btn.dataset.ruleRemove.split('-').map(Number);
                    groups[g].rules.splice(r, 1);
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-cond-remove]')) {
                    const [g, r, c] = btn.dataset.condRemove.split('-').map(Number);
                    groups[g].rules[r].conditions.splice(c, 1);
                    if (groups[g].rules[r].conditions.length === 0) {
                        groups[g].rules[r].conditions.push({ field: 'avgPrice', operator: '>', value: 100 });
                    }
                    saveTagGroups(groups); renderRulesList(); return;
                }
                if (btn.matches('[data-cond-add]')) {
                    const [g, r] = btn.dataset.condAdd.split('-').map(Number);
                    groups[g].rules[r].conditions.push({ field: 'avgPrice', operator: '>', value: 100 });
                    saveTagGroups(groups); renderRulesList(); return;
                }
            }

            const toggleDiv = e.target.closest('[data-group-toggle]');
            if (toggleDiv) {
                const gIdx = Number(toggleDiv.dataset.groupToggle);
                groups[gIdx].isOpen = !groups[gIdx].isOpen;
                saveTagGroups(groups); renderRulesList(); return;
            }
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
            // Clone du groupe en nettoyant les tagIds
            const exportData = [{
                ...g,
                rules: (g.rules || []).map(r => ({ ...r, tagId: '' }))
            }];
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
                logToPanel("📤 Dossier copié dans le presse-papier !");
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
            logToPanel('❌ Aucune règle active.');
            return;
        }

        const summary = document.getElementById('wm-tag-run-summary');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');
        const modePage = document.getElementById('wm-tag-mode-page');

        const mode = modePage?.checked ? 'page' : 'full';

        // Reset state
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
        pauseBtn.style.display = 'block';
        cancelBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';

        logToPanel(`🔍 Prévisualisation (mode ${mode === 'page' ? 'page actuelle' : 'complet'})...`);

        try {
            // ============ PHASE 1 : récupération des cartes ============
            st.phase = 'loading-collection';
            renderScanProgress();

            let cards;
            if (mode === 'page') {
                st.phase = 'loading-collection';
                st.progress.text = 'Lecture du DOM...';
                renderScanProgress();
                cards = await getVisibleCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (cards.length === 0) {
                    logToPanel('❌ Aucune carte visible sur la page.');
                    st.running = false;
                    restoreScanUI();
                    return;
                }
                logToPanel(`📄 ${cards.length} cartes visibles`);
            } else {
                wmScanState.cancelled = false;
                cards = await fetchAllCollectionCards(txt => {
                    st.progress.text = txt;
                    renderScanProgress();
                });
                if (st.cancelled) throw new Error('cancelled');
                logToPanel(`📦 ${cards.length} cartes récupérées`);
            }

            if (!(await waitIfPaused())) throw new Error('cancelled');

            // ============ PHASE 2 : calcul des tags voulus ============
            st.phase = 'computing';
            st.progress = { current: 0, total: cards.length, text: 'Évaluation des règles...' };
            renderScanProgress();

            const managedTagIds = new Set(rules.map(r => r.tagId));
            const desiredTagsByCard = new Map();
            const cardsWithDesired = [];

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];
                const desired = evaluateAllRules(card, rules, window.wmPrices);
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

            // ============ PHASE 3 : vérif des tags existants ============
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

                // Skip si pas de userCardId (rare en mode page si cache incomplet)
                if (!card.userCardId) {
                    skippedNoUserCard++;
                    continue;
                }

                let existingTags;
                try {
                    existingTags = await withRetry(
                        () => wmFetchUserCardTags(card.userCardId),
                        { label: `tags "${card.title.slice(0, 20)}"`, retries: 2, baseDelay: 1200, maxDelay: 4000 }
                    );
                } catch (e) {
                    fetchErrors++;
                    continue;
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

            // ============ Résumé final ============
            st.preview = { toAdd, toRemove };
            st.running = false;
            st.phase = 'idle';

            renderPreviewResult({ toAdd, toRemove });
            if (fetchErrors > 0) logToPanel(`⚠️ ${fetchErrors} erreurs réseau`);
            if (skippedNoUserCard > 0) logToPanel(`⏭️ ${skippedNoUserCard} cartes ignorées (userCardId manquant)`);

            applyBtn.disabled = (toAdd.length + toRemove.length) === 0;
            logToPanel(`✅ Prévisualisation : +${toAdd.length} / -${toRemove.length}`);

        } catch (e) {
            st.running = false;
            st.phase = 'idle';
            if (e.message === 'cancelled') {
                summary.textContent = '⏹️ Annulé.';
                logToPanel('⏹️ Prévisualisation annulée');
            } else {
                summary.textContent = '❌ Erreur : ' + e.message;
                logToPanel(`❌ Erreur : ${e.message}`);
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
        const { toAdd, toRemove } = st.preview;
        if (toAdd.length === 0 && toRemove.length === 0) return;

        st.running = true;
        st.paused = false;
        st.cancelled = false;
        st.phase = 'applying';
        st.progress = { current: 0, total: toAdd.length + toRemove.length, text: '' };

        const summary = document.getElementById('wm-tag-run-summary');
        const applyBtn = document.getElementById('wm-tag-apply-btn');
        const previewBtn = document.getElementById('wm-tag-preview-btn');
        const pauseBtn = document.getElementById('wm-tag-pause-btn');
        const cancelBtn = document.getElementById('wm-tag-cancel-btn');

        applyBtn.disabled = true;
        previewBtn.disabled = true;
        pauseBtn.style.display = 'block';
        pauseBtn.textContent = '⏸️ Pause';
        cancelBtn.style.display = 'block';

        logToPanel(`🚀 Application : +${toAdd.length} / -${toRemove.length}`);

        let done = 0, failed = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 10;
        const DELAY_MS = 200;

        const updateProgress = () => {
            st.progress.current = done + failed;
            st.progress.text = `✅ ${done} ok, ❌ ${failed} erreurs`;
            renderScanProgress();
        };

        try {
            // Ajouts
            for (const { card, tagId } of toAdd) {
                if (st.cancelled) break;
                if (!(await waitIfPaused())) break;

                let r;
                try {
                    r = await withRetry(() => wmApplyTag(card.userCardId, tagId), {
                        label: `apply "${card.title.slice(0,20)}"`, retries: 3, baseDelay: 1000, maxDelay: 6000
                    });
                } catch (e) { r = { ok: false, error: e.message }; }

                if (r.ok) { done++; consecutiveErrors = 0; }
                else {
                    failed++; consecutiveErrors++;
                    console.warn('[WM-Tags] apply fail:', card.title, r.error);
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs consécutives, arrêt`);
                        break;
                    }
                }
                updateProgress();
                await new Promise(res => setTimeout(res, DELAY_MS));
            }

            // Retraits
            if (!st.cancelled && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
                consecutiveErrors = 0;
                for (const { card, tagId } of toRemove) {
                    if (st.cancelled) break;
                    if (!(await waitIfPaused())) break;

                    let r;
                    try {
                        r = await withRetry(() => wmRemoveTag(card.userCardId, tagId), {
                            label: `remove "${card.title.slice(0,20)}"`, retries: 3, baseDelay: 1000, maxDelay: 6000
                        });
                    } catch (e) { r = { ok: false, error: e.message }; }

                    if (r.ok) { done++; consecutiveErrors = 0; }
                    else {
                        failed++; consecutiveErrors++;
                        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                            logToPanel(`⛔ ${MAX_CONSECUTIVE_ERRORS} erreurs, arrêt`);
                            break;
                        }
                    }
                    updateProgress();
                    await new Promise(res => setTimeout(res, DELAY_MS));
                }
            }

            const msg = `✅ Terminé : ${done} opérations, ${failed} erreurs`;
            summary.innerHTML = `<div>${msg}</div>`;
            logToPanel(msg);
            showWMToast(msg, failed === 0);

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
    if (typeof processAutoTags !== 'undefined') { window.processAutoTags = processAutoTags; window.WikiM.processAutoTags = processAutoTags; }
    if (typeof wmFetchTags !== 'undefined') { window.wmFetchTags = wmFetchTags; window.WikiM.wmFetchTags = wmFetchTags; }
    if (typeof wmCreateTag !== 'undefined') { window.wmCreateTag = wmCreateTag; window.WikiM.wmCreateTag = wmCreateTag; }
    if (typeof wmDeleteTag !== 'undefined') { window.wmDeleteTag = wmDeleteTag; window.WikiM.wmDeleteTag = wmDeleteTag; }
    if (typeof wmFetchUserCardTags !== 'undefined') { window.wmFetchUserCardTags = wmFetchUserCardTags; window.WikiM.wmFetchUserCardTags = wmFetchUserCardTags; }
    if (typeof wmApplyTag !== 'undefined') { window.wmApplyTag = wmApplyTag; window.WikiM.wmApplyTag = wmApplyTag; }
    if (typeof wmRemoveTag !== 'undefined') { window.wmRemoveTag = wmRemoveTag; window.WikiM.wmRemoveTag = wmRemoveTag; }
    if (typeof getTagGroups !== 'undefined') { window.getTagGroups = getTagGroups; window.WikiM.getTagGroups = getTagGroups; }
    if (typeof saveTagGroups !== 'undefined') { window.saveTagGroups = saveTagGroups; window.WikiM.saveTagGroups = saveTagGroups; }
    if (typeof getFlatRules !== 'undefined') { window.getFlatRules = getFlatRules; window.WikiM.getFlatRules = getFlatRules; }
    if (typeof initTagGroupsUI !== 'undefined') { window.initTagGroupsUI = initTagGroupsUI; window.WikiM.initTagGroupsUI = initTagGroupsUI; }
    if (typeof renderTagGroups !== 'undefined') { window.renderTagGroups = renderTagGroups; window.WikiM.renderTagGroups = renderTagGroups; }
    if (typeof initTagsTab !== 'undefined') { window.initTagsTab = initTagsTab; window.WikiM.initTagsTab = initTagsTab; }
    if (typeof bindTagButtons !== 'undefined') { window.bindTagButtons = bindTagButtons; window.WikiM.bindTagButtons = bindTagButtons; }
    if (typeof updateModeHint !== 'undefined') { window.updateModeHint = updateModeHint; window.WikiM.updateModeHint = updateModeHint; }
    if (typeof restoreScanUI !== 'undefined') { window.restoreScanUI = restoreScanUI; window.WikiM.restoreScanUI = restoreScanUI; }
    if (typeof renderScanProgress !== 'undefined') { window.renderScanProgress = renderScanProgress; window.WikiM.renderScanProgress = renderScanProgress; }
    if (typeof renderPreviewResult !== 'undefined') { window.renderPreviewResult = renderPreviewResult; window.WikiM.renderPreviewResult = renderPreviewResult; }
    if (typeof waitIfPaused !== 'undefined') { window.waitIfPaused = waitIfPaused; window.WikiM.waitIfPaused = waitIfPaused; }
    if (typeof renderTagsList !== 'undefined') { window.renderTagsList = renderTagsList; window.WikiM.renderTagsList = renderTagsList; }
    if (typeof renderRulesList !== 'undefined') { window.renderRulesList = renderRulesList; window.WikiM.renderRulesList = renderRulesList; }
    if (typeof bindRuleListeners !== 'undefined') { window.bindRuleListeners = bindRuleListeners; window.WikiM.bindRuleListeners = bindRuleListeners; }
    if (typeof openGroupEditModal !== 'undefined') { window.openGroupEditModal = openGroupEditModal; window.WikiM.openGroupEditModal = openGroupEditModal; }
    if (typeof escapeHtml !== 'undefined') { window.escapeHtml = escapeHtml; window.WikiM.escapeHtml = escapeHtml; }
    if (typeof runTagPreview !== 'undefined') { window.runTagPreview = runTagPreview; window.WikiM.runTagPreview = runTagPreview; }
    if (typeof runTagApply !== 'undefined') { window.runTagApply = runTagApply; window.WikiM.runTagApply = runTagApply; }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
