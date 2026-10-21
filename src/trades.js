// ============================================================
// WikiM - Module: Smart Trades 2.2 (Direct Tag-ID API Search, 50/Page Calc, 500ms Rate-Limit & Balanced 100-Card Splitter)
// ============================================================
(function(W, WikiM) {
    'use strict';

    const WM_SMART_TRADES_KEY = 'wmSmartTradeRoutines';
    const MAX_CARDS_PER_TRADE = 100;
    const CARDS_PER_TAG_PAGE = 50;      // Pagination standard par tag (/50)
    const SCAN_REQUEST_DELAY_MS = 500;  // Pause de 0.5s entre chaque requête de scan pour protéger le serveur
    const TRADE_BATCH_DELAY_MS = 850;   // Pause entre l'envoi de deux offres d'échange

    const RARITY_ORDER = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
    const RARITY_COLORS = {
        'C':  { bg: '#94a3b8', text: '#0f172a' },
        'PC': { bg: '#22c55e', text: '#052e16' },
        'R':  { bg: '#3b82f6', text: '#0f172a' },
        'SR': { bg: '#a855f7', text: '#0f172a' },
        'UR': { bg: '#f59e0b', text: '#0f172a' },
        'L':  { bg: '#ef4444', text: '#ffffff' }
    };

    const stState = {
        friends: [],
        myTagOptionsCache: null,    // Array<{id, name, color, cardCount}> depuis /api/my-collection/stats
        friendTagsCache: new Map(), // Map<usernameLower, Array<{id, name, color, cardCount}>>
        editingRoutineId: null,
        selectedTagsMe: new Set(),
        selectedTagsThem: new Set(),
        logicModeMe: 'OR',
        logicModeThem: 'OR',
        activeExecution: null
    };

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ============================================================
    // 1. INJECTION DES STYLES MODERNES DE LA MODALE SMART TRADES
    // ============================================================
    function ensureSmartTradesStyles() {
        if (document.getElementById('wm-smart-trades-v2-styles')) return;
        const style = document.createElement('style');
        style.id = 'wm-smart-trades-v2-styles';
        style.textContent = `
            #wm-smart-trade-overlay {
                position: fixed;
                inset: 0;
                background: rgba(2, 6, 23, 0.85);
                backdrop-filter: blur(8px);
                z-index: 100004;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
            }
            .wm-st-modal {
                background: #0f172a;
                border: 1px solid rgba(99, 102, 241, 0.45);
                border-radius: 16px;
                width: 95vw;
                max-width: 960px;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                color: #f8fafc;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85), 0 0 35px rgba(99, 102, 241, 0.15);
                overflow: hidden;
            }
            .wm-st-header {
                padding: 16px 24px;
                background: rgba(15, 23, 42, 0.96);
                border-bottom: 1px solid rgba(148, 163, 184, 0.16);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
            }
            .wm-st-body {
                padding: 20px 24px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .wm-st-grid-2 {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }
            @media (max-width: 760px) {
                .wm-st-grid-2 { grid-template-columns: 1fr; }
            }
            .wm-st-side-box {
                background: rgba(30, 41, 59, 0.5);
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 12px;
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .wm-st-side-box.side-me {
                border-top: 3px solid #a855f7;
            }
            .wm-st-side-box.side-them {
                border-top: 3px solid #38bdf8;
            }
            .wm-st-input, .wm-st-select {
                background: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(148, 163, 184, 0.3);
                border-radius: 8px;
                padding: 8px 12px;
                color: #f8fafc;
                font-size: 12px;
                outline: none;
                width: 100%;
                box-sizing: border-box;
                transition: border-color 0.15s;
            }
            .wm-st-input:focus, .wm-st-select:focus {
                border-color: #6366f1;
            }
            .wm-st-tag-selector {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                max-height: 145px;
                overflow-y: auto;
                padding: 8px;
                background: rgba(2, 6, 23, 0.55);
                border: 1px solid rgba(148, 163, 184, 0.16);
                border-radius: 8px;
                min-height: 44px;
                align-content: flex-start;
            }
            .wm-st-tag-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
                user-select: none;
                border: 1px solid rgba(148, 163, 184, 0.25);
                background: rgba(30, 41, 59, 0.8);
                color: #cbd5e1;
                transition: all 0.15s ease;
            }
            .wm-st-tag-pill:hover {
                border-color: rgba(255, 255, 255, 0.45);
                transform: translateY(-1px);
            }
            .wm-st-tag-pill.active {
                color: #090d16;
                font-weight: 800;
                border-color: #ffffff;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
            }
            .wm-st-tag-dot {
                width: 9px;
                height: 9px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .wm-st-tag-count {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                opacity: 0.85;
                padding: 0 4px;
                border-radius: 4px;
                background: rgba(0, 0, 0, 0.22);
            }
            .wm-st-routine-card {
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 12px;
                padding: 12px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-bottom: 8px;
                transition: border-color 0.15s, background 0.15s;
            }
            .wm-st-routine-card:hover {
                border-color: rgba(99, 102, 241, 0.45);
                background: rgba(30, 41, 59, 0.8);
            }
            .wm-st-mini-tag {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 7px;
                border-radius: 6px;
                font-size: 10px;
                font-weight: 800;
                color: #090d16;
            }
            .wm-st-exec-column {
                background: rgba(30, 41, 59, 0.45);
                border: 1px solid rgba(148, 163, 184, 0.2);
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                height: 440px;
                overflow: hidden;
            }
            .wm-st-exec-col-header {
                padding: 12px 14px;
                background: rgba(15, 23, 42, 0.9);
                border-bottom: 1px solid rgba(148, 163, 184, 0.15);
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .wm-st-exec-list {
                padding: 10px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .wm-st-card-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                background: rgba(15, 23, 42, 0.75);
                border: 1px solid rgba(148, 163, 184, 0.16);
                border-radius: 9px;
                cursor: pointer;
                transition: all 0.12s ease;
                user-select: none;
            }
            .wm-st-card-row:hover {
                border-color: rgba(99, 102, 241, 0.45);
                background: rgba(30, 41, 59, 0.85);
            }
            .wm-st-card-row.is-selected {
                border-color: rgba(99, 102, 241, 0.65);
                background: rgba(79, 70, 229, 0.16);
            }
            .wm-st-card-row.is-unselected {
                opacity: 0.48;
            }
            .wm-st-rarity-badge {
                padding: 2px 6px;
                border-radius: 5px;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.4px;
                flex-shrink: 0;
            }
            .wm-st-rarity-filter-bar {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
            }
            .wm-st-rarity-chip {
                border: 1px solid rgba(148, 163, 184, 0.25);
                background: rgba(15, 23, 42, 0.8);
                color: #94a3b8;
                border-radius: 6px;
                padding: 2px 7px;
                font-size: 10px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.12s;
            }
            .wm-st-rarity-chip.active {
                background: #4f46e5;
                color: #ffffff;
                border-color: #818cf8;
            }
            .wm-st-split-banner {
                padding: 12px 16px;
                border-radius: 10px;
                background: rgba(245, 158, 11, 0.14);
                border: 1px solid rgba(245, 158, 11, 0.45);
                color: #fde68a;
                font-size: 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
            }
            .wm-st-split-banner.is-ok {
                background: rgba(16, 185, 129, 0.12);
                border-color: rgba(16, 185, 129, 0.4);
                color: #a7f3d0;
            }
            .wm-st-footer {
                padding: 14px 24px;
                background: rgba(15, 23, 42, 0.96);
                border-top: 1px solid rgba(148, 163, 184, 0.16);
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .wm-st-progress-wrap {
                width: 100%;
                background: rgba(15, 23, 42, 0.9);
                border: 1px solid rgba(99, 102, 241, 0.35);
                border-radius: 8px;
                padding: 10px 14px;
                display: none;
                flex-direction: column;
                gap: 6px;
            }
            .wm-st-progress-bar-bg {
                width: 100%;
                height: 6px;
                background: rgba(99, 102, 241, 0.2);
                border-radius: 999px;
                overflow: hidden;
            }
            .wm-st-progress-bar-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #4f46e5, #38bdf8);
                transition: width 0.25s ease;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // 2. GESTION DU STOCKAGE DES ROUTINES SMART TRADES
    // ============================================================
    function normalizeRoutine(r) {
        return {
            id: r.id || ('st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            name: (r.name || 'Routine sans nom').trim(),
            friend: (r.friend || r.friendUsername || '').trim(),
            friendId: r.friendId || '',
            tagsMe: Array.isArray(r.tagsMe) ? r.tagsMe : [],
            tagsThem: Array.isArray(r.tagsThem) ? r.tagsThem : [],
            tagsThemMeta: Array.isArray(r.tagsThemMeta) ? r.tagsThemMeta : [],
            keywordsMe: typeof r.keywordsMe === 'string' ? r.keywordsMe : '',
            keywordsThem: typeof r.keywordsThem === 'string' ? r.keywordsThem : '',
            logicMe: r.logicMe === 'AND' ? 'AND' : 'OR',
            logicThem: r.logicThem === 'AND' ? 'AND' : 'OR',
            onlyDuplicatesMe: Boolean(r.onlyDuplicatesMe),
            onlyDuplicatesThem: Boolean(r.onlyDuplicatesThem)
        };
    }

    function getSmartTradeRoutines() {
        try {
            const raw = JSON.parse(localStorage.getItem(WM_SMART_TRADES_KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            return raw.map(normalizeRoutine);
        } catch {
            return [];
        }
    }

    function saveSmartTradeRoutines(routines) {
        localStorage.setItem(WM_SMART_TRADES_KEY, JSON.stringify((routines || []).map(normalizeRoutine)));
    }

    // ============================================================
    // 3. HELPERS AUTH, PRIX, FRIENDS & TAG STATS (/stats?sort=rarity)
    // ============================================================
    async function getAuthHeaders(includeJson = false) {
        if (typeof window.ensureIdentity === 'function') {
            try { await window.ensureIdentity(); } catch (e) {}
        }
        const headers = {};
        if (includeJson) headers['Content-Type'] = 'application/json';

        const auth = W.wmAuth || window.wmAuth || {};
        if (auth.apiKey) headers['apikey'] = auth.apiKey;
        if (auth.token) {
            headers['Authorization'] = auth.token.startsWith('Bearer ')
                ? auth.token
                : `Bearer ${auth.token}`;
        }
        return headers;
    }

    function getCardEstimatedPrice(title, rarity) {
        if (typeof window.wmGetPriceFor === 'function') {
            const p = window.wmGetPriceFor(title, rarity);
            if (p !== null && p !== undefined && !isNaN(p)) return Number(p);
        }
        if (window.wmPrices && title && window.wmPrices[title] && typeof window.wmPrices[title] === 'object') {
            const avg = window.wmPrices[title].avg ?? window.wmPrices[title].price;
            if (!isNaN(avg)) return Number(avg);
        }
        return 0;
    }

    async function fetchFriendsList() {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/friends', { headers, credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const rawList = Array.isArray(data.friendships)
                ? data.friendships
                : (Array.isArray(data) ? data : (data.friends || data.accepted || []));

            let myId = W.wmUserId || window.wmUserId || W.wmAuth?.userId || window.wmAuth?.userId || null;
            let myUsername = (W.wmUsername || window.wmUsername || W.wmAuth?.username || '').toLowerCase();

            if (!myId && rawList.length > 0 && rawList[0].requester && rawList[0].addressee) {
                const freq = new Map();
                for (const rel of rawList) {
                    const rId = rel.requester_id || rel.requester?.id;
                    const aId = rel.addressee_id || rel.addressee?.id;
                    if (rId) freq.set(rId, (freq.get(rId) || 0) + 1);
                    if (aId) freq.set(aId, (freq.get(aId) || 0) + 1);
                }
                let bestId = null;
                let bestCount = 0;
                for (const [id, count] of freq.entries()) {
                    if (count > bestCount) {
                        bestCount = count;
                        bestId = id;
                    }
                }
                if (bestId) myId = bestId;
            }

            const friendsMap = new Map();

            for (const rel of rawList) {
                if (rel.status && rel.status !== 'accepted') continue;

                let friendObj = null;
                if (rel.requester && rel.addressee) {
                    const reqId = rel.requester_id || rel.requester.id;
                    const addId = rel.addressee_id || rel.addressee.id;
                    const reqName = (rel.requester.username || '').toLowerCase();
                    const addName = (rel.addressee.username || '').toLowerCase();

                    if (myId && reqId === myId) friendObj = rel.addressee;
                    else if (myId && addId === myId) friendObj = rel.requester;
                    else if (myUsername && reqName === myUsername) friendObj = rel.addressee;
                    else if (myUsername && addName === myUsername) friendObj = rel.requester;
                    else friendObj = rel.addressee || rel.requester;
                } else {
                    const uname = rel.username || rel.friend_username || rel.profile?.username || rel.user?.username || rel.name;
                    const uid = rel.friend_id || rel.user_id || rel.profile?.id || rel.id;
                    if (uname) friendObj = { username: uname, id: uid };
                }

                if (friendObj && friendObj.username) {
                    const cleanName = String(friendObj.username).trim();
                    if (cleanName.startsWith('compte_supprime_')) continue;

                    const key = cleanName.toLowerCase();
                    if (!friendsMap.has(key)) {
                        friendsMap.set(key, {
                            username: cleanName,
                            id: friendObj.id || '',
                            avatar_url: friendObj.avatar_url || null
                        });
                    }
                }
            }

            stState.friends = Array.from(friendsMap.values()).sort((a, b) =>
                a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' })
            );
        } catch (e) {
            console.warn('[WM-SmartTrades] Erreur lors du chargement de /api/friends :', e);
        }

        const routines = getSmartTradeRoutines();
        routines.forEach(r => {
            if (r.friend && !stState.friends.some(f => f.username.toLowerCase() === r.friend.toLowerCase())) {
                stState.friends.push({ username: r.friend, id: r.friendId || '' });
            }
        });

        return stState.friends;
    }

    /**
     * Récupère nos propres tags AVEC leur `cardCount` exact via `/api/my-collection/stats?sort=rarity`
     * (et synchronise avec `window.wmTagsCache`).
     */
    async function ensureMyTagsLoaded(forceRefresh = false) {
        if (!forceRefresh && Array.isArray(stState.myTagOptionsCache) && stState.myTagOptionsCache.length > 0) {
            return stState.myTagOptionsCache;
        }

        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/my-collection/stats?sort=rarity', { headers, credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.tagOptions) && data.tagOptions.length > 0) {
                    stState.myTagOptionsCache = data.tagOptions;
                    if (!Array.isArray(window.wmTagsCache) || window.wmTagsCache.length === 0) {
                        window.wmTagsCache = data.tagOptions;
                    }
                    return stState.myTagOptionsCache;
                }
            }
        } catch (e) {
            console.warn('[WM-SmartTrades] /api/my-collection/stats indisponible, fallback sur wmFetchTags :', e);
        }

        if ((!Array.isArray(window.wmTagsCache) || window.wmTagsCache.length === 0) && typeof window.wmFetchTags === 'function') {
            try { await window.wmFetchTags(); } catch (e) {}
        }
        stState.myTagOptionsCache = window.wmTagsCache || [];
        return stState.myTagOptionsCache;
    }

    /**
     * Récupère les `tagOptions` (et leurs `cardCount`) de l'ami :
     * Essaie d'abord `/api/profile/{friend}/collection/stats?sort=rarity` (léger),
     * sinon fallback sur `/api/profile/{friend}/collection?page=0&stats=1`.
     */
    async function fetchFriendTagOptions(friendUsername, forceRefresh = false) {
        const cleanName = String(friendUsername || '').trim();
        if (!cleanName) return [];

        const cacheKey = cleanName.toLowerCase();
        if (!forceRefresh && stState.friendTagsCache.has(cacheKey)) {
            return stState.friendTagsCache.get(cacheKey);
        }

        const headers = await getAuthHeaders();
        let data = null;

        try {
            const statsUrl = `/api/profile/${encodeURIComponent(cleanName)}/collection/stats?sort=rarity`;
            const statsRes = await fetch(statsUrl, { headers, credentials: 'include' });
            if (statsRes.ok) {
                const parsed = await statsRes.json();
                if (Array.isArray(parsed.tagOptions)) {
                    data = parsed;
                }
            }
        } catch (e) {}

        if (!data) {
            const fallbackUrl = `/api/profile/${encodeURIComponent(cleanName)}/collection?sort=rarity&page=0&stats=1`;
            const res = await fetch(fallbackUrl, { headers, credentials: 'include' });
            if (!res.ok) {
                throw new Error(`Impossible de lire la collection de ${cleanName} (HTTP ${res.status})`);
            }
            data = await res.json();
        }

        const tagOptions = Array.isArray(data.tagOptions) ? data.tagOptions : [];
        stState.friendTagsCache.set(cacheKey, tagOptions);

        if (data.profileId) {
            const fObj = stState.friends.find(f => f.username.toLowerCase() === cacheKey);
            if (fObj) fObj.id = data.profileId;
        }

        return tagOptions;
    }

    // ============================================================
    // 4. MOTEUR D'AUTO-SCAN OPTIMISÉ PAR TAG_ID (/50 PAGES + 500MS DELAY)
    // ============================================================
    function extractTagObjectsFromItem(item, knownTagsList = []) {
        const rawTags = item.tags || item.card?.tags || [];
        const result = [];

        if (Array.isArray(rawTags)) {
            for (const t of rawTags) {
                if (t && typeof t === 'object' && t.id) {
                    result.push({
                        id: String(t.id),
                        name: t.name || 'Tag',
                        color: t.color || '#6366f1'
                    });
                } else if (typeof t === 'string' || typeof t === 'number') {
                    const strId = String(t);
                    const found = knownTagsList.find(kt => String(kt.id) === strId);
                    result.push({
                        id: strId,
                        name: found ? found.name : strId.slice(0, 6),
                        color: found ? (found.color || '#6366f1') : '#6366f1'
                    });
                }
            }
        }

        return result;
    }

    function parseKeywordsList(rawKeywords) {
        return String(rawKeywords || '')
            .split(/[;,]/)
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
    }

    function doesCardMatchCriteria(normalizedCard, selectedTagIds, keywordsList, logicMode = 'OR', onlyDuplicates = false) {
        if (onlyDuplicates && (normalizedCard.count || 1) <= 1) {
            return false;
        }

        const hasTagCriteria = Array.isArray(selectedTagIds) && selectedTagIds.length > 0;
        const hasKeywordCriteria = Array.isArray(keywordsList) && keywordsList.length > 0;

        if (!hasTagCriteria && !hasKeywordCriteria) return false;

        let tagMatch = false;
        if (hasTagCriteria) {
            const cardTagIds = new Set(normalizedCard.tags.map(t => String(t.id)));
            tagMatch = selectedTagIds.some(tid => cardTagIds.has(String(tid)));
        }

        let keywordMatch = false;
        if (hasKeywordCriteria) {
            const haystack = `${normalizedCard.title} ${normalizedCard.category}`.toLowerCase();
            keywordMatch = keywordsList.some(kw => haystack.includes(kw));
        }

        if (hasTagCriteria && hasKeywordCriteria) {
            return logicMode === 'AND' ? (tagMatch && keywordMatch) : (tagMatch || keywordMatch);
        }
        return hasTagCriteria ? tagMatch : keywordMatch;
    }

    function buildNormalizedCardFromApiItem(item, knownTags) {
        const uCardId = item.id || item.user_card_id || item.userCardId;
        const cardInner = item.card || item;
        const title = cardInner.wikipedia_title || cardInner.title || item.title || 'Sans titre';
        const rarity = (cardInner.rarity || item.rarity || 'C').toUpperCase();
        const cardTags = extractTagObjectsFromItem(item, knownTags);

        return {
            user_card_id: uCardId,
            card_id: item.card_id || cardInner.id,
            user_id: item.user_id || '', // <-- UUID du propriétaire (offered_by)
            title: title,
            category: cardInner.category || item.category || '',
            rarity: rarity,
            is_shiny: Boolean(item.is_shiny || cardInner.is_shiny),
            count: Number(item.count || 1),
            image_url: cardInner.image_url || item.image_url || null,
            tags: cardTags,
            price: getCardEstimatedPrice(title, rarity)
        };
    }

    /**
     * Scanne les cartes d'un côté (Moi ou Ami) :
     * 1. Si des tags sont sélectionnés (et qu'on n'est pas en mode OR avec des mots-clés additionnels nécessitant un scan global),
     *    utilise directement la recherche API par `tag_id` :
     *    `/api/my-collection?sort=rarity&tag_id={ID}&page={P}&stats=0`
     *    en calculant le nombre exact de pages via `Math.ceil(cardCount / 50)` et en attendant `500ms` entre chaque requête !
     * 2. Si des mots-clés seuls sont utilisés (ou en mode OR en plus des tags), effectue le scan des pages restantes avec le même délai de 500ms.
     */
    async function scanCollectionByTagsAndKeywords({
        isFriend,
        friendUsername,
        selectedTagIds,
        keywordsRaw,
        logicMode = 'OR',
        onlyDuplicates = false,
        onProgress
    }) {
        const keywordsList = parseKeywordsList(keywordsRaw);
        const hasTags = Array.isArray(selectedTagIds) && selectedTagIds.length > 0;
        const hasKeywords = keywordsList.length > 0;

        if (!hasTags && !hasKeywords) {
            return { cards: [], profileId: null };
        }

        const headers = await getAuthHeaders();
        const matchedCards = [];
        const seenUserCardIds = new Set();
        const pendingTradeIds = new Set();
        let resolvedProfileId = null;

        const baseUrl = isFriend
            ? `/api/profile/${encodeURIComponent(friendUsername)}/collection`
            : `/api/my-collection`;
        const ownerLabel = isFriend ? friendUsername : 'Ma collection';

        // 1. S'assure d'avoir les tagOptions (et leurs cardCount) pour calculer le nombre de pages (/50)
        let knownTags = isFriend
            ? await fetchFriendTagOptions(friendUsername, false)
            : await ensureMyTagsLoaded(false);

        let requestCount = 0;

        // Helper interne qui respecte le délai de 500ms entre chaque requête serveur
        const fetchWithDelay = async (url) => {
            if (requestCount > 0) {
                await sleep(SCAN_REQUEST_DELAY_MS);
            }
            requestCount++;
            const res = await fetch(url, { headers, credentials: 'include' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        };

        // --- CAS A : RECHERCHE RAPIDE CIBLÉE PAR TAG_ID ---
        if (hasTags) {
            for (let tIdx = 0; tIdx < selectedTagIds.length; tIdx++) {
                const tagId = String(selectedTagIds[tIdx]);
                const tagMeta = knownTags.find(t => String(t.id) === tagId);
                const tagName = tagMeta ? tagMeta.name : `Tag #${tIdx + 1}`;
                let expectedCardCount = (tagMeta && typeof tagMeta.cardCount === 'number') ? tagMeta.cardCount : null;

                // Si on ne connaît pas encore le cardCount de ce tag, on interroge /stats?sort=rarity&tag_id=...
                if (expectedCardCount === null) {
                    try {
                        const statsData = await fetchWithDelay(`${baseUrl}/stats?sort=rarity&tag_id=${encodeURIComponent(tagId)}`);
                        if (typeof statsData.total === 'number') {
                            expectedCardCount = statsData.total;
                        } else if (Array.isArray(statsData.tagOptions)) {
                            const foundOpt = statsData.tagOptions.find(o => String(o.id) === tagId);
                            if (foundOpt && typeof foundOpt.cardCount === 'number') {
                                expectedCardCount = foundOpt.cardCount;
                            }
                        }
                    } catch (e) {}
                }

                // Si le tag contient 0 carte, on passe directement au tag suivant sans faire de requête inutile
                if (expectedCardCount === 0) continue;

                const totalPages = expectedCardCount !== null
                    ? Math.max(1, Math.ceil(expectedCardCount / CARDS_PER_TAG_PAGE))
                    : 100; // Plafond de sécurité si cardCount inconnu

                for (let page = 0; page < totalPages; page++) {
                    if (typeof onProgress === 'function') {
                        const pageLabel = expectedCardCount !== null ? `${page + 1}/${totalPages}` : `${page + 1}`;
                        onProgress(`${ownerLabel} • Tag "${tagName}" (page ${pageLabel}) — ${matchedCards.length} carte(s)`);
                    }

                    const pageUrl = `${baseUrl}?sort=rarity&tag_id=${encodeURIComponent(tagId)}&page=${page}&stats=0`;
                    const data = await fetchWithDelay(pageUrl);

                    if (data.profileId) resolvedProfileId = data.profileId;
                    if (Array.isArray(data.pendingTradeCardIds)) {
                        data.pendingTradeCardIds.forEach(id => pendingTradeIds.add(String(id)));
                    }

                    const items = Array.isArray(data.collection) ? data.collection : (Array.isArray(data.cards) ? data.cards : []);
                    if (items.length === 0) break;

                    for (const item of items) {
                        const uCardId = item.id || item.user_card_id || item.userCardId;
                        if (!uCardId || seenUserCardIds.has(uCardId)) continue;
                        if (pendingTradeIds.has(String(uCardId))) continue;
                        if (item.starred) continue;

                        const normCard = buildNormalizedCardFromApiItem(item, knownTags);
                        // S'assure que le tag filtré est bien présent dans normCard.tags
                        if (!normCard.tags.some(t => String(t.id) === tagId)) {
                            normCard.tags.push({
                                id: tagId,
                                name: tagName,
                                color: tagMeta?.color || '#6366f1'
                            });
                        }

                        if (doesCardMatchCriteria(normCard, selectedTagIds, keywordsList, logicMode, onlyDuplicates)) {
                            seenUserCardIds.add(uCardId);
                            matchedCards.push(normCard);
                        }
                    }

                    // Si la page retourne moins de cartes que la taille d'une page complète (et qu'on n'avait pas expectedCardCount), c'est la dernière page
                    if (expectedCardCount === null && items.length < 25) break;
                }
            }
        }

        // --- CAS B : MOTS-CLÉS SEULS (OU MODE "OR" AVEC MOTS-CLÉS ADDITIONNELS) ---
        if (hasKeywords && (!hasTags || logicMode === 'OR')) {
            let page = 0;
            let totalPagesGlobal = null;
            const MAX_GLOBAL_PAGES = 200;

            while (page < (totalPagesGlobal ?? MAX_GLOBAL_PAGES)) {
                if (typeof onProgress === 'function') {
                    const pInfo = totalPagesGlobal ? `${page + 1}/${totalPagesGlobal}` : `${page + 1}`;
                    onProgress(`${ownerLabel} • Recherche mots-clés (page ${pInfo}) — ${matchedCards.length} carte(s)`);
                }

                const pageUrl = `${baseUrl}?sort=rarity&page=${page}&stats=${page === 0 ? '1' : '0'}`;
                const data = await fetchWithDelay(pageUrl);

                if (page === 0 && typeof data.total === 'number') {
                    totalPagesGlobal = Math.max(1, Math.ceil(data.total / CARDS_PER_TAG_PAGE));
                }
                if (data.profileId) resolvedProfileId = data.profileId;
                if (Array.isArray(data.pendingTradeCardIds)) {
                    data.pendingTradeCardIds.forEach(id => pendingTradeIds.add(String(id)));
                }

                const items = Array.isArray(data.collection) ? data.collection : (Array.isArray(data.cards) ? data.cards : []);
                if (items.length === 0) break;

                for (const item of items) {
                    const uCardId = item.id || item.user_card_id || item.userCardId;
                    if (!uCardId || seenUserCardIds.has(uCardId)) continue;
                    if (pendingTradeIds.has(String(uCardId))) continue;
                    if (item.starred) continue;

                    const normCard = buildNormalizedCardFromApiItem(item, knownTags);
                    if (doesCardMatchCriteria(normCard, selectedTagIds, keywordsList, logicMode, onlyDuplicates)) {
                        seenUserCardIds.add(uCardId);
                        matchedCards.push(normCard);
                    }
                }

                if (items.length < 25) break;
                page++;
            }
        }

        // Tri final par rareté (L -> UR -> SR -> R -> PC -> C) puis par prix décroissant
        matchedCards.sort((a, b) => {
            const rDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
            if (rDiff !== 0) return rDiff;
            return (b.price || 0) - (a.price || 0);
        });

        return { cards: matchedCards, profileId: resolvedProfileId };
    }

    // ============================================================
    // 5. ALGORITHME DE DÉCOUPAGE ÉQUILIBRÉ (RÈGLE DES 100 CARTES MAX)
    // ============================================================
    function computeBalancedTradeBatches(cardsMe, cardsThem) {
        const totalMe = cardsMe.length;
        const totalThem = cardsThem.length;
        const grandTotal = totalMe + totalThem;

        if (grandTotal === 0) return [];
        if (grandTotal <= MAX_CARDS_PER_TRADE) {
            return [{
                batchIndex: 1,
                totalBatches: 1,
                me: cardsMe.slice(),
                them: cardsThem.slice(),
                totalCards: grandTotal
            }];
        }

        let numBatches = Math.ceil(grandTotal / MAX_CARDS_PER_TRADE);
        while (Math.ceil(totalMe / numBatches) + Math.ceil(totalThem / numBatches) > MAX_CARDS_PER_TRADE) {
            numBatches++;
        }

        const batches = [];
        let cursorMe = 0;
        let cursorThem = 0;

        for (let b = 0; b < numBatches; b++) {
            const remainingBatches = numBatches - b;
            const remainingMe = totalMe - cursorMe;
            const remainingThem = totalThem - cursorThem;

            let countMe = Math.ceil(remainingMe / remainingBatches);
            let countThem = Math.ceil(remainingThem / remainingBatches);

            if (countMe + countThem > MAX_CARDS_PER_TRADE) {
                if (countMe > 50 && countThem > 50) {
                    countMe = 50;
                    countThem = 50;
                } else if (countMe > countThem) {
                    countMe = MAX_CARDS_PER_TRADE - countThem;
                } else {
                    countThem = MAX_CARDS_PER_TRADE - countMe;
                }
            }

            const sliceMe = cardsMe.slice(cursorMe, cursorMe + countMe);
            const sliceThem = cardsThem.slice(cursorThem, cursorThem + countThem);

            cursorMe += sliceMe.length;
            cursorThem += sliceThem.length;

            if (sliceMe.length > 0 || sliceThem.length > 0) {
                batches.push({
                    batchIndex: b + 1,
                    totalBatches: numBatches,
                    me: sliceMe,
                    them: sliceThem,
                    totalCards: sliceMe.length + sliceThem.length
                });
            }
        }

        batches.forEach((b, idx) => {
            b.batchIndex = idx + 1;
            b.totalBatches = batches.length;
        });

        return batches;
    }

    // ============================================================
    // 6. CONSTRUCTION & GESTION DE LA MODALE UI (MOI À GAUCHE / AMI À DROITE)
    // ============================================================
    function ensureSmartTradeModalDOM() {
        ensureSmartTradesStyles();

        let overlay = document.getElementById('wm-smart-trade-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wm-smart-trade-overlay';
            document.body.appendChild(overlay);
        }

        if (overlay.dataset.wmUpgraded === 'v2.2') return overlay;
        overlay.dataset.wmUpgraded = 'v2.2';

        overlay.innerHTML = `
            <div class="wm-st-modal" role="dialog" aria-modal="true">
                <div class="wm-st-header">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:20px;">🤝</span>
                        <div>
                            <h3 id="wm-st-modal-title" style="margin:0;font-size:16px;font-weight:800;color:#f8fafc;">
                                Nouvelle Routine Smart Trade
                            </h3>
                            <div id="wm-st-modal-subtitle" style="font-size:11px;color:#94a3b8;margin-top:2px;">
                                Recherche rapide par tag_id (pagination /50 avec délai anti-spam de 0.5s).
                            </div>
                        </div>
                    </div>
                    <button type="button" id="wm-st-close-btn" class="wm-panel-btn ghost" style="padding:6px 12px;">✕ Fermer</button>
                </div>

                <!-- VUE 1 : CRÉATION / ÉDITION DE ROUTINE -->
                <div id="wm-st-view-editor" class="wm-st-body">
                    <div class="wm-st-grid-2">
                        <div>
                            <label style="font-size:11px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:6px;">
                                📝 Nom de la routine
                            </label>
                            <input type="text" id="wm-st-input-name" class="wm-st-input" placeholder="Ex: Échange EV + Villes...">
                        </div>
                        <div>
                            <label style="font-size:11px;font-weight:700;color:#cbd5e1;display:block;margin-bottom:6px;">
                                👤 Ami partenaire
                            </label>
                            <div style="display:flex;gap:8px;">
                                <select id="wm-st-input-friend" class="wm-st-select" style="flex:1;">
                                    <option value="">-- Sélectionner un ami --</option>
                                </select>
                                <button type="button" id="wm-st-refresh-friend-tags" class="wm-panel-btn ghost" style="padding:6px 12px;" title="Rafraîchir la liste d'amis et les tags">🔄</button>
                            </div>
                        </div>
                    </div>

                    <div class="wm-st-grid-2">
                        <!-- COLONNE GAUCHE : MOI (CE QUE JE DONNE) -->
                        <div class="wm-st-side-box side-me">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="font-size:13px;font-weight:800;color:#c084fc;">📤 Ce que je donne (Ma collection)</span>
                                <label style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;cursor:pointer;">
                                    <input type="checkbox" id="wm-st-only-dup-me" style="accent-color:#a855f7;">
                                    Doublons uniquement (x2+)
                                </label>
                            </div>

                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                    <span style="font-size:11px;font-weight:700;color:#cbd5e1;">🏷️ Mes Tags locaux (<span id="wm-st-count-tags-me">0</span> sélectionné)</span>
                                    <span style="font-size:10px;color:#94a3b8;">Compte connecté</span>
                                </div>
                                <div id="wm-st-tags-me-container" class="wm-st-tag-selector"></div>
                            </div>

                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                    <span style="font-size:11px;font-weight:700;color:#cbd5e1;">🔍 Mots-clés optionnels (séparés par ;)</span>
                                    <select id="wm-st-logic-me" class="wm-st-select" style="width:auto;padding:2px 8px;font-size:10px;font-weight:700;">
                                        <option value="OR">Combiner : TAG OU MOT-CLÉ</option>
                                        <option value="AND">Combiner : TAG ET MOT-CLÉ</option>
                                    </select>
                                </div>
                                <input type="text" id="wm-st-input-kw-me" class="wm-st-input" placeholder="Ex: sport; musique; >100 (optionnel)...">
                            </div>
                        </div>

                        <!-- COLONNE DROITE : L'AMI (CE QUE JE DEMANDE) -->
                        <div class="wm-st-side-box side-them">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span style="font-size:13px;font-weight:800;color:#38bdf8;">📥 Ce que je demande (Chez l'ami)</span>
                                <label style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:5px;cursor:pointer;">
                                    <input type="checkbox" id="wm-st-only-dup-them" style="accent-color:#38bdf8;">
                                    Doublons uniquement (x2+)
                                </label>
                            </div>

                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                    <span style="font-size:11px;font-weight:700;color:#cbd5e1;">🏷️ Tags de l'ami (<span id="wm-st-count-tags-them">0</span> sélectionné)</span>
                                    <span id="wm-st-friend-tags-status" style="font-size:10px;color:#94a3b8;">Sélectionnez un ami</span>
                                </div>
                                <div id="wm-st-tags-them-container" class="wm-st-tag-selector">
                                    <div style="font-size:11px;color:#64748b;padding:8px;">Sélectionnez un ami dans la liste déroulante pour charger ses tags...</div>
                                </div>
                            </div>

                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                    <span style="font-size:11px;font-weight:700;color:#cbd5e1;">🔍 Mots-clés optionnels (séparés par ;)</span>
                                    <select id="wm-st-logic-them" class="wm-st-select" style="width:auto;padding:2px 8px;font-size:10px;font-weight:700;">
                                        <option value="OR">Combiner : TAG OU MOT-CLÉ</option>
                                        <option value="AND">Combiner : TAG ET MOT-CLÉ</option>
                                    </select>
                                </div>
                                <input type="text" id="wm-st-input-kw-them" class="wm-st-input" placeholder="Ex: commune; château; alcool (optionnel)...">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VUE 2 : EXÉCUTION DU SCAN & PRÉPARATION DE L'ENVOI (MOI À GAUCHE / AMI À DROITE) -->
                <div id="wm-st-view-exec" class="wm-st-body" style="display:none;">
                    <div id="wm-st-batch-banner" class="wm-st-split-banner is-ok">
                        <span id="wm-st-batch-banner-text">⏳ Analyse de la sélection...</span>
                        <span id="wm-st-batch-banner-sub" style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;"></span>
                    </div>

                    <div id="wm-st-send-progress" class="wm-st-progress-wrap">
                        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;">
                            <span id="wm-st-send-status-txt">Envoi en cours...</span>
                            <span id="wm-st-send-pct-txt" style="font-family:monospace;color:#38bdf8;">0%</span>
                        </div>
                        <div class="wm-st-progress-bar-bg">
                            <div id="wm-st-send-bar" class="wm-st-progress-bar-fill"></div>
                        </div>
                    </div>

                    <div class="wm-st-grid-2">
                        <!-- COLONNE GAUCHE : MES CARTES À DONNER -->
                        <div class="wm-st-exec-column">
                            <div class="wm-st-exec-col-header">
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <span style="font-size:13px;font-weight:800;color:#c084fc;">📤 Mes cartes à donner</span>
                                    <span id="wm-st-exec-stats-me" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#e2e8f0;background:rgba(168,85,247,0.15);padding:3px 8px;border-radius:6px;border:1px solid rgba(168,85,247,0.3);">
                                        0 cartes • ≈ 0 WB
                                    </span>
                                </div>
                                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                                    <input type="text" id="wm-st-exec-search-me" class="wm-st-input" placeholder="🔍 Filtrer titre..." style="flex:1;padding:5px 8px;font-size:11px;">
                                    <button type="button" id="wm-st-exec-all-me" class="wm-panel-btn ghost" style="padding:4px 8px;font-size:10px;">☑️ Tout</button>
                                    <button type="button" id="wm-st-exec-none-me" class="wm-panel-btn ghost" style="padding:4px 8px;font-size:10px;">⬜ Vider</button>
                                </div>
                                <div id="wm-st-exec-rarity-me" class="wm-st-rarity-filter-bar"></div>
                            </div>
                            <div id="wm-st-exec-list-me" class="wm-st-exec-list"></div>
                        </div>

                        <!-- COLONNE DROITE : CARTES DE L'AMI -->
                        <div class="wm-st-exec-column">
                            <div class="wm-st-exec-col-header">
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <span style="font-size:13px;font-weight:800;color:#38bdf8;" id="wm-st-exec-title-them">📥 Chez l'ami</span>
                                    <span id="wm-st-exec-stats-them" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#e2e8f0;background:rgba(56,189,248,0.15);padding:3px 8px;border-radius:6px;border:1px solid rgba(56,189,248,0.3);">
                                        0 cartes • ≈ 0 WB
                                    </span>
                                </div>
                                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                                    <input type="text" id="wm-st-exec-search-them" class="wm-st-input" placeholder="🔍 Filtrer titre..." style="flex:1;padding:5px 8px;font-size:11px;">
                                    <button type="button" id="wm-st-exec-all-them" class="wm-panel-btn ghost" style="padding:4px 8px;font-size:10px;">☑️ Tout</button>
                                    <button type="button" id="wm-st-exec-none-them" class="wm-panel-btn ghost" style="padding:4px 8px;font-size:10px;">⬜ Vider</button>
                                </div>
                                <div id="wm-st-exec-rarity-them" class="wm-st-rarity-filter-bar"></div>
                            </div>
                            <div id="wm-st-exec-list-them" class="wm-st-exec-list"></div>
                        </div>
                    </div>
                </div>

                <!-- FOOTER D'ACTIONS -->
                <div class="wm-st-footer">
                    <div id="wm-st-footer-left" style="font-size:11px;color:#94a3b8;">
                        💡 Le nombre entre parenthèses indique le nombre de cartes associées à chaque tag.
                    </div>
                    <div id="wm-st-footer-actions-editor" style="display:flex;gap:10px;">
                        <button type="button" id="wm-st-btn-cancel" class="wm-panel-btn ghost">Annuler</button>
                        <button type="button" id="wm-st-btn-save-and-run" class="wm-panel-btn ghost" style="border-color:#38bdf8;color:#38bdf8;">⚡ Sauver & Scanner</button>
                        <button type="button" id="wm-st-btn-save" class="wm-panel-btn" style="background:linear-gradient(135deg,#4f46e5,#6366f1);font-weight:700;">💾 Enregistrer la routine</button>
                    </div>
                    <div id="wm-st-footer-actions-exec" style="display:none;gap:10px;">
                        <button type="button" id="wm-st-btn-back-edit" class="wm-panel-btn ghost">✏️ Modifier la routine</button>
                        <button type="button" id="wm-st-btn-rescan" class="wm-panel-btn ghost">🔄 Relancer le scan</button>
                        <button type="button" id="wm-st-btn-send-trades" class="wm-panel-btn" style="background:linear-gradient(135deg,#10b981,#059669);font-weight:800;padding:8px 18px;">
                            🚀 Envoyer l'échange
                        </button>
                    </div>
                </div>
            </div>
        `;

        bindModalEvents(overlay);
        return overlay;
    }

    // ============================================================
    // 7. ÉVÉNEMENTS DE LA MODALE (SÉLECTION D'AMI, TAGS, FILTRES)
    // ============================================================
    function getSelectedFriendUsername() {
        return document.getElementById('wm-st-input-friend')?.value.trim() || '';
    }

    function renderFriendTagSelector(tagOptions = [], isLoading = false, errorMsg = '') {
        const container = document.getElementById('wm-st-tags-them-container');
        const statusEl = document.getElementById('wm-st-friend-tags-status');
        const countEl = document.getElementById('wm-st-count-tags-them');
        if (!container) return;

        if (countEl) countEl.textContent = String(stState.selectedTagsThem.size);

        if (isLoading) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#fbbf24;">⏳ Chargement des tags...</span>`;
            container.innerHTML = `<div style="font-size:11px;color:#fbbf24;padding:8px;">Récupération des tags et compteurs de l'ami...</div>`;
            return;
        }

        if (errorMsg) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">❌ Erreur</span>`;
            container.innerHTML = `<div style="font-size:11px;color:#fca5a5;padding:8px;">${escapeHtml(errorMsg)}</div>`;
            return;
        }

        if (!tagOptions || tagOptions.length === 0) {
            if (statusEl) statusEl.textContent = '0 tag trouvé';
            container.innerHTML = `<div style="font-size:11px;color:#64748b;padding:8px;">Cet ami n'a aucun tag configuré ou sélectionnez un ami.</div>`;
            return;
        }

        if (statusEl) statusEl.textContent = `${tagOptions.length} tags disponibles`;
        container.innerHTML = '';

        tagOptions.forEach(tag => {
            const isSelected = stState.selectedTagsThem.has(String(tag.id));
            const color = tag.color || '#38bdf8';
            const pill = document.createElement('div');
            pill.className = `wm-st-tag-pill ${isSelected ? 'active' : ''}`;
            if (isSelected) {
                pill.style.backgroundColor = color;
            }

            pill.innerHTML = `
                <span class="wm-st-tag-dot" style="background:${isSelected ? '#090d16' : escapeHtml(color)};"></span>
                <span>${escapeHtml(tag.name)}</span>
                ${tag.cardCount !== undefined ? `<span class="wm-st-tag-count">${tag.cardCount}</span>` : ''}
            `;

            pill.addEventListener('click', () => {
                const tid = String(tag.id);
                if (stState.selectedTagsThem.has(tid)) {
                    stState.selectedTagsThem.delete(tid);
                } else {
                    stState.selectedTagsThem.add(tid);
                }
                renderFriendTagSelector(tagOptions, false, '');
            });

            container.appendChild(pill);
        });
    }

    function renderMyTagSelector() {
        const container = document.getElementById('wm-st-tags-me-container');
        const countEl = document.getElementById('wm-st-count-tags-me');
        if (!container) return;

        const myTags = stState.myTagOptionsCache || window.wmTagsCache || [];
        if (countEl) countEl.textContent = String(stState.selectedTagsMe.size);

        if (myTags.length === 0) {
            container.innerHTML = `<div style="font-size:11px;color:#64748b;padding:8px;">Aucune étiquette locale trouvée sur votre compte.</div>`;
            return;
        }

        container.innerHTML = '';
        myTags.forEach(tag => {
            const isSelected = stState.selectedTagsMe.has(String(tag.id));
            const color = tag.color || '#a855f7';
            const pill = document.createElement('div');
            pill.className = `wm-st-tag-pill ${isSelected ? 'active' : ''}`;
            if (isSelected) {
                pill.style.backgroundColor = color;
            }

            pill.innerHTML = `
                <span class="wm-st-tag-dot" style="background:${isSelected ? '#090d16' : escapeHtml(color)};"></span>
                <span>${escapeHtml(tag.name)}</span>
                ${tag.cardCount !== undefined ? `<span class="wm-st-tag-count">${tag.cardCount}</span>` : ''}
            `;

            pill.addEventListener('click', () => {
                const tid = String(tag.id);
                if (stState.selectedTagsMe.has(tid)) {
                    stState.selectedTagsMe.delete(tid);
                } else {
                    stState.selectedTagsMe.add(tid);
                }
                renderMyTagSelector();
            });

            container.appendChild(pill);
        });
    }

    async function handleFriendSelectionChange(forceRefresh = false) {
        const username = getSelectedFriendUsername();
        if (!username) {
            renderFriendTagSelector([], false, '');
            return;
        }

        renderFriendTagSelector([], true, '');
        try {
            const tagOptions = await fetchFriendTagOptions(username, forceRefresh);
            renderFriendTagSelector(tagOptions, false, '');
        } catch (e) {
            renderFriendTagSelector([], false, e.message);
        }
    }

    function bindModalEvents(overlay) {
        const closeModal = () => {
            if (stState.activeExecution?.sending) return;
            overlay.style.display = 'none';
        };

        overlay.querySelector('#wm-st-close-btn').addEventListener('click', closeModal);
        overlay.querySelector('#wm-st-btn-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const friendSelect = overlay.querySelector('#wm-st-input-friend');
        const refreshFriendBtn = overlay.querySelector('#wm-st-refresh-friend-tags');

        friendSelect.addEventListener('change', () => {
            stState.selectedTagsThem.clear();
            handleFriendSelectionChange(false);
        });

        refreshFriendBtn.addEventListener('click', async () => {
            const currentVal = friendSelect.value;
            await Promise.all([fetchFriendsList(), ensureMyTagsLoaded(true)]);
            friendSelect.innerHTML = `<option value="">-- Sélectionner un ami (${stState.friends.length}) --</option>` +
                stState.friends.map(f => `<option value="${escapeHtml(f.username)}" ${f.username === currentVal ? 'selected' : ''}>${escapeHtml(f.username)}</option>`).join('');
            renderMyTagSelector();
            await handleFriendSelectionChange(true);
        });

        overlay.querySelector('#wm-st-btn-save').addEventListener('click', () => {
            const saved = saveRoutineFromEditor();
            if (saved) {
                overlay.style.display = 'none';
            }
        });

        overlay.querySelector('#wm-st-btn-save-and-run').addEventListener('click', async () => {
            const saved = saveRoutineFromEditor();
            if (saved) {
                await executeSmartTradeRoutine(saved.id);
            }
        });

        overlay.querySelector('#wm-st-btn-back-edit').addEventListener('click', () => {
            if (stState.activeExecution?.routine) {
                openSmartTradeEditorModal(stState.activeExecution.routine.id);
            }
        });

        overlay.querySelector('#wm-st-btn-rescan').addEventListener('click', async () => {
            if (stState.activeExecution?.routine) {
                await executeSmartTradeRoutine(stState.activeExecution.routine.id);
            }
        });

        overlay.querySelector('#wm-st-btn-send-trades').addEventListener('click', () => {
            sendSmartTradeBatches();
        });

        overlay.querySelector('#wm-st-exec-search-me').addEventListener('input', (e) => {
            if (!stState.activeExecution) return;
            stState.activeExecution.searchMe = e.target.value;
            renderExecutionLists();
        });
        overlay.querySelector('#wm-st-exec-search-them').addEventListener('input', (e) => {
            if (!stState.activeExecution) return;
            stState.activeExecution.searchThem = e.target.value;
            renderExecutionLists();
        });

        overlay.querySelector('#wm-st-exec-all-me').addEventListener('click', () => {
            if (!stState.activeExecution) return;
            getFilteredExecCards('me').forEach(c => stState.activeExecution.selectedIdsMe.add(c.user_card_id));
            renderExecutionLists();
        });
        overlay.querySelector('#wm-st-exec-none-me').addEventListener('click', () => {
            if (!stState.activeExecution) return;
            getFilteredExecCards('me').forEach(c => stState.activeExecution.selectedIdsMe.delete(c.user_card_id));
            renderExecutionLists();
        });

        overlay.querySelector('#wm-st-exec-all-them').addEventListener('click', () => {
            if (!stState.activeExecution) return;
            getFilteredExecCards('them').forEach(c => stState.activeExecution.selectedIdsThem.add(c.user_card_id));
            renderExecutionLists();
        });
        overlay.querySelector('#wm-st-exec-none-them').addEventListener('click', () => {
            if (!stState.activeExecution) return;
            getFilteredExecCards('them').forEach(c => stState.activeExecution.selectedIdsThem.delete(c.user_card_id));
            renderExecutionLists();
        });
    }

    // ============================================================
    // 8. OUVERTURE ÉDITEUR & SAUVEGARDE DE ROUTINE
    // ============================================================
    async function openSmartTradeEditorModal(routineId = null) {
        const overlay = ensureSmartTradeModalDOM();
        overlay.style.display = 'flex';

        document.getElementById('wm-st-view-editor').style.display = 'flex';
        document.getElementById('wm-st-view-exec').style.display = 'none';
        document.getElementById('wm-st-footer-actions-editor').style.display = 'flex';
        document.getElementById('wm-st-footer-actions-exec').style.display = 'none';

        await Promise.all([fetchFriendsList(), ensureMyTagsLoaded(false)]);

        const routines = getSmartTradeRoutines();
        const existing = routineId ? routines.find(r => r.id === routineId) : null;
        stState.editingRoutineId = existing ? existing.id : null;

        document.getElementById('wm-st-modal-title').textContent = existing
            ? `✏️ Modifier : ${existing.name}`
            : '🤝 Nouvelle Routine Smart Trade';

        const friendSelect = document.getElementById('wm-st-input-friend');
        friendSelect.innerHTML = `<option value="">-- Sélectionner un ami (${stState.friends.length}) --</option>` +
            stState.friends.map(f => `<option value="${escapeHtml(f.username)}">${escapeHtml(f.username)}</option>`).join('');

        if (existing) {
            document.getElementById('wm-st-input-name').value = existing.name;
            const match = stState.friends.find(f => f.username.toLowerCase() === existing.friend.toLowerCase());
            if (match) {
                friendSelect.value = match.username;
            }

            stState.selectedTagsMe = new Set((existing.tagsMe || []).map(String));
            stState.selectedTagsThem = new Set((existing.tagsThem || []).map(String));

            document.getElementById('wm-st-input-kw-me').value = existing.keywordsMe || '';
            document.getElementById('wm-st-input-kw-them').value = existing.keywordsThem || '';
            document.getElementById('wm-st-logic-me').value = existing.logicMe || 'OR';
            document.getElementById('wm-st-logic-them').value = existing.logicThem || 'OR';
            document.getElementById('wm-st-only-dup-me').checked = Boolean(existing.onlyDuplicatesMe);
            document.getElementById('wm-st-only-dup-them').checked = Boolean(existing.onlyDuplicatesThem);
        } else {
            document.getElementById('wm-st-input-name').value = '';
            friendSelect.value = '';
            stState.selectedTagsMe = new Set();
            stState.selectedTagsThem = new Set();
            document.getElementById('wm-st-input-kw-me').value = '';
            document.getElementById('wm-st-input-kw-them').value = '';
            document.getElementById('wm-st-logic-me').value = 'OR';
            document.getElementById('wm-st-logic-them').value = 'OR';
            document.getElementById('wm-st-only-dup-me').checked = false;
            document.getElementById('wm-st-only-dup-them').checked = false;
        }

        renderMyTagSelector();
        await handleFriendSelectionChange(false);
    }

    function saveRoutineFromEditor() {
        const name = document.getElementById('wm-st-input-name').value.trim();
        const friend = getSelectedFriendUsername();
        const kwMe = document.getElementById('wm-st-input-kw-me').value.trim();
        const kwThem = document.getElementById('wm-st-input-kw-them').value.trim();
        const logicMe = document.getElementById('wm-st-logic-me').value;
        const logicThem = document.getElementById('wm-st-logic-them').value;
        const onlyDuplicatesMe = document.getElementById('wm-st-only-dup-me').checked;
        const onlyDuplicatesThem = document.getElementById('wm-st-only-dup-them').checked;

        if (!friend) {
            alert('Veuillez sélectionner un ami dans la liste déroulante.');
            return null;
        }

        const tagsMe = Array.from(stState.selectedTagsMe);
        const tagsThem = Array.from(stState.selectedTagsThem);

        if (tagsMe.length === 0 && !kwMe && tagsThem.length === 0 && !kwThem) {
            alert('Veuillez sélectionner au moins un Tag ou saisir un mot-clé (pour vous ou votre ami).');
            return null;
        }

        const friendTagOpts = stState.friendTagsCache.get(friend.toLowerCase()) || [];
        const tagsThemMeta = tagsThem.map(tid => {
            const found = friendTagOpts.find(t => String(t.id) === String(tid));
            return found
                ? { id: String(found.id), name: found.name, color: found.color || '#38bdf8' }
                : { id: String(tid), name: 'Tag ami', color: '#38bdf8' };
        });

        const friendObj = stState.friends.find(f => f.username.toLowerCase() === friend.toLowerCase());

        const routines = getSmartTradeRoutines();
        const routineObj = normalizeRoutine({
            id: stState.editingRoutineId || ('st_' + Date.now()),
            name: name || `Échange avec ${friend}`,
            friend,
            friendId: friendObj?.id || '',
            tagsMe,
            tagsThem,
            tagsThemMeta,
            keywordsMe: kwMe,
            keywordsThem: kwThem,
            logicMe,
            logicThem,
            onlyDuplicatesMe,
            onlyDuplicatesThem
        });

        const existingIdx = routines.findIndex(r => r.id === routineObj.id);
        if (existingIdx !== -1) {
            routines[existingIdx] = routineObj;
        } else {
            routines.push(routineObj);
        }

        saveSmartTradeRoutines(routines);
        renderSmartTradesPanelList();

        if (typeof window.logToPanel === 'function') {
            window.logToPanel(`💾 Routine Smart Trade "${routineObj.name}" enregistrée.`);
        }
        return routineObj;
    }

    // ============================================================
    // 9. EXÉCUTION D'UNE ROUTINE : SCAN SÉQUENTIEL ANTI-SPAM & VUE INTERACTIVE
    // ============================================================
    async function executeSmartTradeRoutine(routineId) {
        const routines = getSmartTradeRoutines();
        const routine = routines.find(r => r.id === routineId);
        if (!routine) return;

        const overlay = ensureSmartTradeModalDOM();
        overlay.style.display = 'flex';

        document.getElementById('wm-st-view-editor').style.display = 'none';
        document.getElementById('wm-st-view-exec').style.display = 'flex';
        document.getElementById('wm-st-footer-actions-editor').style.display = 'none';
        document.getElementById('wm-st-footer-actions-exec').style.display = 'flex';
        document.getElementById('wm-st-send-progress').style.display = 'none';

        document.getElementById('wm-st-modal-title').textContent = `⚡ ${routine.name} (avec ${routine.friend})`;
        document.getElementById('wm-st-exec-title-them').textContent = `📥 Chez ${routine.friend}`;

        const bannerEl = document.getElementById('wm-st-batch-banner');
        const bannerTxt = document.getElementById('wm-st-batch-banner-text');
        const bannerSub = document.getElementById('wm-st-batch-banner-sub');
        const sendBtn = document.getElementById('wm-st-btn-send-trades');

        sendBtn.disabled = true;
        bannerEl.className = 'wm-st-split-banner';
        bannerTxt.textContent = `🔍 Scan par tag_id en cours (délai de sécurité 0.5s entre chaque page)...`;
        bannerSub.textContent = '';

        document.getElementById('wm-st-exec-list-me').innerHTML = `<div style="padding:30px;text-align:center;color:#94a3b8;">⏳ Scan de vos tags sélectionnés...</div>`;
        document.getElementById('wm-st-exec-list-them').innerHTML = `<div style="padding:30px;text-align:center;color:#94a3b8;">⏳ En attente du scan de ${escapeHtml(routine.friend)}...</div>`;

        try {
            // Exécution séquentielle (Moi puis Ami) avec pause de 500ms pour ne jamais envoyer de requêtes simultanées au serveur
            const resMe = await scanCollectionByTagsAndKeywords({
                isFriend: false,
                friendUsername: null,
                selectedTagIds: routine.tagsMe,
                keywordsRaw: routine.keywordsMe,
                logicMode: routine.logicMe,
                onlyDuplicates: routine.onlyDuplicatesMe,
                onProgress: (txt) => { bannerTxt.textContent = `⏳ ${txt}`; }
            });

            document.getElementById('wm-st-exec-list-me').innerHTML = `<div style="padding:30px;text-align:center;color:#10b981;">✅ ${resMe.cards.length} carte(s) trouvée(s) dans votre collection.</div>`;

            if ((routine.tagsMe?.length || routine.keywordsMe) && (routine.tagsThem?.length || routine.keywordsThem)) {
                await sleep(SCAN_REQUEST_DELAY_MS);
            }

            const resThem = await scanCollectionByTagsAndKeywords({
                isFriend: true,
                friendUsername: routine.friend,
                selectedTagIds: routine.tagsThem,
                keywordsRaw: routine.keywordsThem,
                logicMode: routine.logicThem,
                onlyDuplicates: routine.onlyDuplicatesThem,
                onProgress: (txt) => { bannerTxt.textContent = `⏳ ${txt}`; }
            });

            if (resThem.profileId && !routine.friendId) {
                routine.friendId = resThem.profileId;
                saveSmartTradeRoutines(routines);
            }

            stState.activeExecution = {
                routine,
                cardsMe: resMe.cards,
                cardsThem: resThem.cards,
                selectedIdsMe: new Set(resMe.cards.map(c => c.user_card_id)),
                selectedIdsThem: new Set(resThem.cards.map(c => c.user_card_id)),
                filterRarityMe: 'ALL',
                filterRarityThem: 'ALL',
                searchMe: '',
                searchThem: '',
                sending: false
            };

            document.getElementById('wm-st-exec-search-me').value = '';
            document.getElementById('wm-st-exec-search-them').value = '';

            renderRarityFilterBars();
            renderExecutionLists();
        } catch (e) {
            bannerTxt.textContent = `❌ Erreur lors du scan : ${e.message}`;
            if (typeof window.logToPanel === 'function') {
                window.logToPanel(`❌ Smart Trade scan échoué : ${e.message}`);
            }
        }
    }

    function getFilteredExecCards(side) {
        const exec = stState.activeExecution;
        if (!exec) return [];
        const rawList = side === 'me' ? exec.cardsMe : exec.cardsThem;
        const rarityFilter = side === 'me' ? exec.filterRarityMe : exec.filterRarityThem;
        const searchQ = (side === 'me' ? exec.searchMe : exec.searchThem || '').trim().toLowerCase();

        return rawList.filter(c => {
            if (rarityFilter !== 'ALL' && c.rarity !== rarityFilter) return false;
            if (searchQ && !c.title.toLowerCase().includes(searchQ) && !(c.category || '').toLowerCase().includes(searchQ)) {
                return false;
            }
            return true;
        });
    }

    function renderRarityFilterBars() {
        const exec = stState.activeExecution;
        if (!exec) return;

        ['me', 'them'].forEach(side => {
            const bar = document.getElementById(side === 'me' ? 'wm-st-exec-rarity-me' : 'wm-st-exec-rarity-them');
            const cards = side === 'me' ? exec.cardsMe : exec.cardsThem;
            const activeRarity = side === 'me' ? exec.filterRarityMe : exec.filterRarityThem;
            if (!bar) return;

            const counts = { ALL: cards.length };
            RARITY_ORDER.forEach(r => { counts[r] = 0; });
            cards.forEach(c => { counts[c.rarity] = (counts[c.rarity] || 0) + 1; });

            const options = ['ALL', ...RARITY_ORDER.filter(r => counts[r] > 0)];
            bar.innerHTML = options.map(r => `
                <button type="button" class="wm-st-rarity-chip ${activeRarity === r ? 'active' : ''}" data-r-chip="${r}">
                    ${r === 'ALL' ? 'Toutes' : r} (${counts[r] || 0})
                </button>
            `).join('');

            bar.querySelectorAll('[data-r-chip]').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (side === 'me') exec.filterRarityMe = btn.dataset.rChip;
                    else exec.filterRarityThem = btn.dataset.rChip;
                    renderRarityFilterBars();
                    renderExecutionLists();
                });
            });
        });
    }

    function renderExecutionLists() {
        const exec = stState.activeExecution;
        if (!exec) return;

        ['me', 'them'].forEach(side => {
            const listEl = document.getElementById(side === 'me' ? 'wm-st-exec-list-me' : 'wm-st-exec-list-them');
            const statsEl = document.getElementById(side === 'me' ? 'wm-st-exec-stats-me' : 'wm-st-exec-stats-them');
            const allCards = side === 'me' ? exec.cardsMe : exec.cardsThem;
            const selectedSet = side === 'me' ? exec.selectedIdsMe : exec.selectedIdsThem;
            const filtered = getFilteredExecCards(side);

            const selectedCards = allCards.filter(c => selectedSet.has(c.user_card_id));
            const totalValue = Math.round(selectedCards.reduce((sum, c) => sum + (c.price || 0), 0));

            if (statsEl) {
                statsEl.textContent = `${selectedCards.length} / ${allCards.length} cartes • Total ≈ ${totalValue} WB`;
            }

            if (!listEl) return;
            if (filtered.length === 0) {
                listEl.innerHTML = `<div style="padding:30px 10px;text-align:center;color:#64748b;font-size:12px;">Aucune carte trouvée pour ces critères.</div>`;
                return;
            }

            listEl.innerHTML = '';
            const frag = document.createDocumentFragment();

            filtered.forEach(card => {
                const isSel = selectedSet.has(card.user_card_id);
                const rStyle = RARITY_COLORS[card.rarity] || RARITY_COLORS['C'];

                const row = document.createElement('div');
                row.className = `wm-st-card-row ${isSel ? 'is-selected' : 'is-unselected'}`;

                const tagsHtml = (card.tags || []).slice(0, 3).map(t => `
                    <span class="wm-st-mini-tag" style="background:${escapeHtml(t.color || '#6366f1')};">
                        ${escapeHtml(t.name)}
                    </span>
                `).join('');

                row.innerHTML = `
                    <input type="checkbox" ${isSel ? 'checked' : ''} style="accent-color:#6366f1;pointer-events:none;flex-shrink:0;">
                    <span class="wm-st-rarity-badge" style="background:${rStyle.bg};color:${rStyle.text};">${escapeHtml(card.rarity)}</span>
                    <div style="min-width:0;flex:1;">
                        <div style="font-size:12px;font-weight:700;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(card.title)}">
                            ${card.is_shiny ? '✨ ' : ''}${escapeHtml(card.title)}
                            ${card.count > 1 ? `<span style="color:#94a3b8;font-size:10px;font-weight:600;">(x${card.count})</span>` : ''}
                        </div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;align-items:center;">
                            ${tagsHtml}
                            ${card.price > 0 ? `<span style="font-size:10px;color:#fbbf24;font-weight:700;margin-left:auto;">💰 ${Math.round(card.price)} WB</span>` : ''}
                        </div>
                    </div>
                `;

                row.addEventListener('click', () => {
                    if (selectedSet.has(card.user_card_id)) {
                        selectedSet.delete(card.user_card_id);
                    } else {
                        selectedSet.add(card.user_card_id);
                    }
                    renderExecutionLists();
                });

                frag.appendChild(row);
            });

            listEl.appendChild(frag);
        });

        updateBatchSplitSummary();
    }

    function updateBatchSplitSummary() {
        const exec = stState.activeExecution;
        if (!exec) return;

        const bannerEl = document.getElementById('wm-st-batch-banner');
        const bannerTxt = document.getElementById('wm-st-batch-banner-text');
        const bannerSub = document.getElementById('wm-st-batch-banner-sub');
        const sendBtn = document.getElementById('wm-st-btn-send-trades');

        const selectedMe = exec.cardsMe.filter(c => exec.selectedIdsMe.has(c.user_card_id));
        const selectedThem = exec.cardsThem.filter(c => exec.selectedIdsThem.has(c.user_card_id));
        const totalSelected = selectedMe.length + selectedThem.length;

        const batches = computeBalancedTradeBatches(selectedMe, selectedThem);
        exec.computedBatches = batches;

        if (totalSelected === 0) {
            bannerEl.className = 'wm-st-split-banner';
            bannerTxt.textContent = '⚠️ Sélectionnez au moins une carte à donner ou à demander pour créer un échange.';
            bannerSub.textContent = '0 / 100 cartes';
            sendBtn.disabled = true;
            sendBtn.textContent = '🚀 Aucune carte sélectionnée';
            return;
        }

        sendBtn.disabled = false;

        if (batches.length === 1) {
            bannerEl.className = 'wm-st-split-banner is-ok';
            bannerTxt.innerHTML = `✅ <strong>${totalSelected} carte(s) sélectionnée(s)</strong> (${selectedMe.length} 📤 données / ${selectedThem.length} 📥 demandées) : envoi en <strong>1 seul échange</strong>.`;
            bannerSub.textContent = `${totalSelected} / 100 max`;
            sendBtn.textContent = `🚀 Envoyer l'échange (${totalSelected} cartes)`;
        } else {
            bannerEl.className = 'wm-st-split-banner';
            const sizesDesc = batches.map(b => `${b.totalCards} (${b.me.length}📤/${b.them.length}📥)`).join(' + ');
            bannerTxt.innerHTML = `📦 <strong>${totalSelected} cartes sélectionnées</strong> : cette routine va envoyer <strong>${batches.length} échanges successifs équilibrés</strong> [${sizesDesc}] (aucun risque de dépassement de la limite de 100).`;
            bannerSub.textContent = `${batches.length} lots équilibrés`;
            sendBtn.textContent = `🚀 Envoyer les ${batches.length} échanges (${totalSelected} cartes)`;
        }
    }

    // ============================================================
    // 10. ENVOI SÉQUENTIEL DES LOTS D'ÉCHANGES (/api/trades)
    // ============================================================
    async function sendSingleTradeOffer(routine, batchMe, batchThem) {
        const headers = await getAuthHeaders(true);
        headers['x-wiki-calendar-tz'] = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

        // 1. Résolution de l'UUID de l'ami (recipient_id)
        const friendObj = stState.friends.find(f => f.username.toLowerCase() === routine.friend.toLowerCase());
        const recipientId = routine.friendId
            || friendObj?.id
            || batchThem[0]?.user_id
            || '';

        // 2. Résolution de mon propre UUID (initiator / offered_by pour mes cartes)
        const myUserId = batchMe[0]?.user_id
            || W.wmUserId
            || window.wmUserId
            || W.wmAuth?.userId
            || window.wmAuth?.userId
            || stState.myTagOptionsCache?.[0]?.user_id
            || window.wmTagsCache?.[0]?.user_id
            || '';

        if (!recipientId) {
            throw new Error(`Impossible de résoudre le recipient_id pour l'ami "${routine.friend}".`);
        }
        if (!myUserId && batchMe.length > 0) {
            throw new Error(`Impossible de résoudre votre user_id pour offered_by.`);
        }

        // 3. Construction exacte du tableau items attendu par POST /api/trades
        const items = [
            ...batchMe.map(c => ({
                user_card_id: c.user_card_id,
                card_id: c.card_id,
                offered_by: c.user_id || myUserId
            })),
            ...batchThem.map(c => ({
                user_card_id: c.user_card_id,
                card_id: c.card_id,
                offered_by: c.user_id || recipientId
            }))
        ];

        const payload = {
            recipient_id: recipientId,
            items: items,
            initiator_wikibidous: 0,
            recipient_wikibidous: 0
        };

        const res = await fetch('/api/trades', {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            let errDetail = `HTTP ${res.status}`;
            try {
                const errJson = await res.json();
                errDetail = errJson.error || errJson.message || errDetail;
            } catch {}
            throw new Error(errDetail);
        }

        return await res.json().catch(() => ({ ok: true }));
    }

    async function sendSmartTradeBatches() {
        const exec = stState.activeExecution;
        if (!exec || exec.sending) return;

        const batches = exec.computedBatches || [];
        if (batches.length === 0) return;

        exec.sending = true;
        const sendBtn = document.getElementById('wm-st-btn-send-trades');
        const backBtn = document.getElementById('wm-st-btn-back-edit');
        const rescanBtn = document.getElementById('wm-st-btn-rescan');
        const progWrap = document.getElementById('wm-st-send-progress');
        const statusTxt = document.getElementById('wm-st-send-status-txt');
        const pctTxt = document.getElementById('wm-st-send-pct-txt');
        const barFill = document.getElementById('wm-st-send-bar');

        sendBtn.disabled = true;
        backBtn.disabled = true;
        rescanBtn.disabled = true;
        progWrap.style.display = 'flex';

        let successCount = 0;

        try {
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const stepPct = Math.round((i / batches.length) * 100);
                statusTxt.textContent = `⏳ Envoi du trade ${i + 1}/${batches.length} (${batch.me.length} 📤 contre ${batch.them.length} 📥)...`;
                pctTxt.textContent = `${stepPct}%`;
                barFill.style.width = `${stepPct}%`;

                if (typeof window.logToPanel === 'function') {
                    window.logToPanel(`📤 Smart Trade [${exec.routine.name}] : Envoi du lot ${i + 1}/${batches.length} (${batch.totalCards} cartes)...`);
                }

                await sendSingleTradeOffer(exec.routine, batch.me, batch.them);
                successCount++;

                batch.me.forEach(c => exec.selectedIdsMe.delete(c.user_card_id));
                batch.them.forEach(c => exec.selectedIdsThem.delete(c.user_card_id));

                const donePct = Math.round(((i + 1) / batches.length) * 100);
                pctTxt.textContent = `${donePct}%`;
                barFill.style.width = `${donePct}%`;

                if (i < batches.length - 1) {
                    await sleep(TRADE_BATCH_DELAY_MS);
                }
            }

            const finalMsg = `🎉 Tous les échanges ont été envoyés (${successCount}/${batches.length}) à ${exec.routine.friend} !`;
            statusTxt.textContent = finalMsg;
            if (typeof window.logToPanel === 'function') window.logToPanel(finalMsg);
            if (typeof window.showWMToast === 'function') window.showWMToast(finalMsg, true);

            renderExecutionLists();
        } catch (e) {
            const errMsg = `❌ Erreur lors de l'envoi du trade ${successCount + 1}/${batches.length} : ${e.message}`;
            statusTxt.textContent = errMsg;
            if (typeof window.logToPanel === 'function') window.logToPanel(errMsg);
            if (typeof window.showWMToast === 'function') window.showWMToast(errMsg, false);
        } finally {
            exec.sending = false;
            backBtn.disabled = false;
            rescanBtn.disabled = false;
        }
    }

    // ============================================================
    // 11. RENDU DE LA LISTE DES ROUTINES DANS LE PANNEAU LATÉRAL
    // ============================================================
    function renderSmartTradesPanelList() {
        const container = document.getElementById('wm-st-routines-list') || document.getElementById('wm-smart-trades-list');
        if (!container) return;

        const routines = getSmartTradeRoutines();
        if (routines.length === 0) {
            container.innerHTML = `<div class="wm-tracked-empty">Aucune routine d'échange. Cliquez sur "+ Créer une routine d'échange" pour commencer.</div>`;
            return;
        }

        const myTags = stState.myTagOptionsCache || window.wmTagsCache || [];

        container.innerHTML = routines.map(r => {
            const meBadges = (r.tagsMe || []).map(tid => {
                const found = myTags.find(t => String(t.id) === String(tid));
                const name = found ? found.name : 'Tag';
                const color = found ? (found.color || '#a855f7') : '#a855f7';
                return `<span class="wm-st-mini-tag" style="background:${escapeHtml(color)};">${escapeHtml(name)}</span>`;
            }).join(' ');

            const themBadges = (r.tagsThem || []).map(tid => {
                const cached = (r.tagsThemMeta || []).find(m => String(m.id) === String(tid));
                const name = cached ? cached.name : 'Tag';
                const color = cached ? cached.color : '#38bdf8';
                return `<span class="wm-st-mini-tag" style="background:${escapeHtml(color)};">${escapeHtml(name)}</span>`;
            }).join(' ');

            return `
                <div class="wm-st-routine-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <div style="min-width:0;flex:1;">
                            <div style="font-weight:800;font-size:12px;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                🤝 ${escapeHtml(r.name)}
                            </div>
                            <div style="font-size:11px;color:#38bdf8;font-weight:600;">
                                👤 Ami : ${escapeHtml(r.friend)}
                            </div>
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0;">
                            <button type="button" class="wm-panel-btn" data-st-run="${escapeHtml(r.id)}" style="padding:4px 10px;font-size:11px;background:linear-gradient(135deg,#10b981,#059669);" title="Scanner et préparer l'échange">
                                ⚡ Lancer
                            </button>
                            <button type="button" class="wm-panel-btn ghost" data-st-edit="${escapeHtml(r.id)}" style="padding:4px 8px;font-size:11px;" title="Modifier cette routine">
                                ✏️
                            </button>
                            <button type="button" class="wm-panel-btn danger" data-st-del="${escapeHtml(r.id)}" style="padding:4px 8px;font-size:11px;" title="Supprimer">
                                🗑️
                            </button>
                        </div>
                    </div>

                    <div style="font-size:10px;color:#cbd5e1;display:flex;flex-direction:column;gap:4px;background:rgba(15,23,42,0.55);padding:6px 8px;border-radius:8px;">
                        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                            <strong style="color:#c084fc;">📤 Donne :</strong>
                            ${meBadges || ''}
                            ${r.keywordsMe ? `<span style="color:#94a3b8;font-family:monospace;">"${escapeHtml(r.keywordsMe)}"</span>` : ''}
                            ${!meBadges && !r.keywordsMe ? '<span style="color:#64748b;">Aucun filtre</span>' : ''}
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                            <strong style="color:#38bdf8;">📥 Demande :</strong>
                            ${themBadges || ''}
                            ${r.keywordsThem ? `<span style="color:#94a3b8;font-family:monospace;">"${escapeHtml(r.keywordsThem)}"</span>` : ''}
                            ${!themBadges && !r.keywordsThem ? '<span style="color:#64748b;">Aucun filtre</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-st-run]').forEach(btn => {
            btn.addEventListener('click', () => executeSmartTradeRoutine(btn.dataset.stRun));
        });
        container.querySelectorAll('[data-st-edit]').forEach(btn => {
            btn.addEventListener('click', () => openSmartTradeEditorModal(btn.dataset.stEdit));
        });
        container.querySelectorAll('[data-st-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.stDel;
                const routinesList = getSmartTradeRoutines();
                const target = routinesList.find(x => x.id === id);
                if (!confirm(`Supprimer la routine "${target?.name || ''}" ?`)) return;
                saveSmartTradeRoutines(routinesList.filter(x => x.id !== id));
                renderSmartTradesPanelList();
            });
        });
    }

    function initSmartTradesUI() {
        ensureSmartTradesStyles();
        ensureSmartTradeModalDOM();
        renderSmartTradesPanelList();

        const openBtnIds = [
            'wm-st-btn-new',
            'wm-btn-new-smart-trade',
            'wm-add-smart-trade-btn',
            'wm-st-open-modal-btn'
        ];
        openBtnIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn && !btn._wmStBound) {
                btn._wmStBound = true;
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    openSmartTradeEditorModal(null);
                });
            }
        });
    }

    // --- Exports globaux & inter-modules ---
    window.initSmartTradesUI = WikiM.initSmartTradesUI = initSmartTradesUI;
    window.initTradesTab = WikiM.initTradesTab = initSmartTradesUI;
    window.openSmartTradeModal = WikiM.openSmartTradeModal = openSmartTradeEditorModal;
    window.openSmartTradeEditorModal = WikiM.openSmartTradeEditorModal = openSmartTradeEditorModal;
    window.executeSmartTradeRoutine = WikiM.executeSmartTradeRoutine = executeSmartTradeRoutine;
    window.runSmartTradeRoutine = WikiM.runSmartTradeRoutine = executeSmartTradeRoutine;
    window.sendSmartTrade = WikiM.sendSmartTrade = sendSmartTradeBatches;
    window.computeBalancedTradeBatches = WikiM.computeBalancedTradeBatches = computeBalancedTradeBatches;
    window.renderSmartTradesPanelList = WikiM.renderSmartTradesPanelList = renderSmartTradesPanelList;
    window.renderSmartTradesList = WikiM.renderSmartTradesList = renderSmartTradesPanelList;
    window.getSmartTradeRoutines = WikiM.getSmartTradeRoutines = getSmartTradeRoutines;
    window.saveSmartTradeRoutines = WikiM.saveSmartTradeRoutines = saveSmartTradeRoutines;

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});