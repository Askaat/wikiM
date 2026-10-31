// ============================================================
// WikiM - Module: Network, Interceptors & Supabase Request
// ============================================================
(function(W, WikiM) {
    'use strict';

    // ============================================================
    // CAPTURE TOKEN + APIKEY (dynamique)
    // ============================================================
    const SUPABASE_REF = 'cyrxjeppjqsxxjayfrur';
    const SUPABASE_APIKEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg';

    const WM_AUTH_STORAGE_KEY = 'wmPersistedAuth';

    function cleanJwtToken(rawToken) {
        if (!rawToken || typeof rawToken !== 'string') return null;
        return rawToken.replace(/^Bearer\s+/i, '').trim();
    }

    function decodeJwt(token) {
        try {
            const clean = cleanJwtToken(token);
            if (!clean) return null;
            const payload = clean.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        } catch { return null; }
    }

    function savePersistedAuth(authData) {
        try {
            if (!authData || !authData.token) return;
            const cleanToken = cleanJwtToken(authData.token);
            if (!cleanToken) return;
            const payload = {
                apikey: authData.apikey || SUPABASE_APIKEY_FALLBACK,
                token: cleanToken,
                userId: authData.userId || null,
                username: authData.username || W.wmUsername || window.wmUsername || null,
                ref: SUPABASE_REF,
                savedAt: Date.now()
            };
            localStorage.setItem(WM_AUTH_STORAGE_KEY, JSON.stringify(payload));
        } catch(e) {}
    }

    function loadPersistedAuth() {
        try {
            const raw = localStorage.getItem(WM_AUTH_STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || !data.token) return null;

            data.token = cleanJwtToken(data.token);
            if (!data.token) return null;

            // Vérification de l'expiration du token JWT
            const claims = decodeJwt(data.token);
            if (claims && claims.exp) {
                const nowSec = Math.floor(Date.now() / 1000);
                // Si le token expire dans moins de 60 secondes, on le considère expiré
                if (claims.exp <= nowSec + 60) {
                    console.log('[WM] Token en cache expiré ou proche de l\'expiration.');
                    return null;
                }
            }

            // Auto-guérison : si la clé API a été polluée par un autre projet Supabase (ex: Hub), restaurer la clé officielle
            if (data.apikey && (data.apikey.startsWith('sb_') || !data.apikey.includes(SUPABASE_REF))) {
                console.warn('[WM] 🛡️ Clé API Supabase polluée détectée dans le cache, restauration immédiate de la clé officielle Wiki-Masters.');
                data.apikey = SUPABASE_APIKEY_FALLBACK;
                try { localStorage.setItem(WM_AUTH_STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
            }

            return data;
        } catch(e) {
            return null;
        }
    }

    // Initialisation immédiate depuis le stockage persistant ou les fallbacks
    const persisted = loadPersistedAuth();
    let currentApiKey = persisted?.apikey || SUPABASE_APIKEY_FALLBACK;
    if (currentApiKey.startsWith('sb_') || !currentApiKey.includes(SUPABASE_REF)) {
        currentApiKey = SUPABASE_APIKEY_FALLBACK;
    }
    W.wmAuth = window.wmAuth = {
        apikey: currentApiKey,
        token: cleanJwtToken(persisted?.token) || null,
        userId: persisted?.userId || null,
        username: persisted?.username || null,
        ref: SUPABASE_REF
    };
    if (W.wmAuth.userId) {
        W.wmUserId = window.wmUserId = W.wmAuth.userId;
        console.log('[WM] ⚡ Authentification restaurée instantanément depuis le stockage local (userId:', W.wmUserId, ')');
    }
    if (W.wmAuth.username) {
        W.wmUsername = window.wmUsername = W.wmAuth.username;
        try { localStorage.setItem('wmMyUsername', W.wmAuth.username); } catch(e) {}
    }

    if (!W._wmNativeFetch) {
        W._wmNativeFetch = W.fetch || window.fetch;
    }
    const _origFetchForAuth = W.fetch;
    W.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const opts = args[1] || {};
        // Ne capturer l'auth Supabase QUE pour le Supabase officiel du jeu (SUPABASE_REF)
        if (url.includes(SUPABASE_REF) && opts.headers) {
            const h = opts.headers;
            const apikey = h.apikey || h.Apikey || h['X-Api-Key'];
            const auth = h.Authorization || h.authorization;

            if (apikey && typeof apikey === 'string' && apikey.length > 100 && apikey !== W.wmAuth.apikey) {
                W.wmAuth.apikey = apikey;
                savePersistedAuth(W.wmAuth);
                console.log('[WM] Apikey mise à jour depuis le trafic');
            }
            if (auth && auth.startsWith('Bearer ')) {
                const candidate = auth.slice(7);
                if (candidate.length >= 500) {
                    const claims = decodeJwt(candidate);
                    if (claims && claims.sub && W.wmAuth.token !== candidate) {
                        W.wmAuth.token = candidate;
                        W.wmAuth.userId = claims.sub;
                        W.wmUserId = window.wmUserId = claims.sub;
                        const uName = claims.user_metadata?.username || claims.username;
                        if (uName) {
                            W.wmAuth.username = uName;
                            W.wmUsername = window.wmUsername = uName;
                            try { localStorage.setItem('wmMyUsername', uName); } catch(e) {}
                        }
                        savePersistedAuth(W.wmAuth);
                        console.log('[WM] Token utilisateur capturé & persisté, userId:', claims.sub, 'username:', uName);
                    }
                }
            }
        }
        return _origFetchForAuth.apply(this, args);
    };

    function extractTokenFromCookies() {
        const cookies = document.cookie.split(';').map(c => c.trim());
        const parts = {};
        cookies.forEach(c => {
            const [name, ...rest] = c.split('=');
            if (name.startsWith('sb-') && name.includes('auth-token')) {
                parts[name] = decodeURIComponent(rest.join('='));
            }
        });
        const keys = Object.keys(parts).sort();
        if (keys.length === 0) return false;
        let combined = keys.map(k => parts[k]).join('');
        if (combined.startsWith('base64-')) combined = combined.slice(7);
        try {
            const session = JSON.parse(atob(combined));
            if (session?.access_token && session.access_token.length >= 500) {
                const claims = decodeJwt(session.access_token);
                const newToken = session.access_token;
                const newUserId = claims?.sub || session.user?.id || null;

                // Si les données ont changé ou étaient absentes
                const cookieUsername = claims?.user_metadata?.username || session.user?.user_metadata?.username || claims?.username || null;
                if (W.wmAuth.token !== newToken || W.wmAuth.userId !== newUserId || (cookieUsername && W.wmAuth.username !== cookieUsername)) {
                    W.wmAuth.token = newToken;
                    W.wmAuth.userId = newUserId;
                    W.wmUserId = window.wmUserId = W.wmAuth.userId;
                    if (cookieUsername) {
                        W.wmAuth.username = cookieUsername;
                        W.wmUsername = window.wmUsername = cookieUsername;
                        try { localStorage.setItem('wmMyUsername', cookieUsername); } catch(e) {}
                    }
                    savePersistedAuth(W.wmAuth);
                    console.log('[WM] Token extrait des cookies & persisté, userId:', W.wmUserId, 'username:', cookieUsername);
                }
                return true;
            }
        } catch (e) {
            console.warn('[WM] Échec extraction token cookies:', e);
        }
        return false;
    }

    // Extraction synchrone immédiate des cookies (au cas où ils sont déjà disponibles)
    extractTokenFromCookies();
    // Sécurité légère si les cookies arrivent de façon asynchrone lors du premier boot
    if (!W.wmAuth.token) {
        setTimeout(extractTokenFromCookies, 1000);
    }

    W.wmDebug = {
        getAuth: () => W.wmAuth || null,
        getUserId: () => W.wmUserId || null,
        refreshFromCookies: () => extractTokenFromCookies(),
        clearPersistedAuth: () => { localStorage.removeItem(WM_AUTH_STORAGE_KEY); console.log('[WM] Auth persistée vidée.'); }
    };

    // ============================================================
    // INTERCEPTEUR Response.prototype.json (Packs & Balance)
    // ============================================================
    const originalResponseJson = Response.prototype.json;
    Response.prototype.json = function(...args) {
        return originalResponseJson.apply(this, args).then(data => {
            try {
                // Détection de l'ouverture d'un pack
                if (data && typeof data === 'object' && Array.isArray(data.cards) && data.cards.length > 0
                    && 'packs_remaining' in data && data.cards[0] && (data.cards[0].wikipedia_title || data.cards[0].title)) {

                    console.log(`[WM-Pack] 🎴 Pack ouvert : ${data.cards.length} cartes — lancement des routines...`);
                    window.logToPanel(`🎴 Pack ouvert : ${data.cards.length} cartes`);

                    // NOUVEAU : Capture des IDs physiques depuis owned_copies !
                    if (Array.isArray(data.owned_copies)) {
                        data.owned_copies.forEach(copy => {
                            if (copy.card_id && copy.id) {
                                window.wmCardIdToUserCardId.set(copy.card_id, copy.id);
                                console.log(`[WM-Bulk] 🔗 Lien mémorisé : Global ${copy.card_id} -> Physique ${copy.id}`);
                            }
                        });
                    }

                    const isBulkActive = !!(window._wmBulkOpeningActive || (window.WikiM && window.WikiM.isBulkOpening));
                    const isAutoPackPricesEnabled = localStorage.getItem('wmAutoPackPricesEnabled') !== 'false';

                    // 1. Lancement du scan des prix (désactivé si Bulk Opener en cours, ou si option désactivée)
                    if (!isBulkActive && isAutoPackPricesEnabled) {
                        data.cards.forEach((card, i) => {
                            const uuid = card.id;
                            const title = card.wikipedia_title || card.title;
                            // Délai sécurisé de 1.1s par carte au lieu de 120ms pour éviter le 429 même en manuel
                            if (uuid && title) setTimeout(() => window.fetchPricesBackground(uuid, title), i * 2200);
                        });
                    }

                    // 2. Lancement de l'Auto-Tag intelligent (désactivé si Bulk Opener en cours)
                    if (!isBulkActive && (typeof processAutoTags === 'function' || typeof window.processAutoTags === 'function')) {
                        const autoTagFn = window.processAutoTags || processAutoTags;
                        setTimeout(() => autoTagFn(data.cards, data.owned_copies), 1200);
                    }

                    // 3. Synchronisation Cloud en direct vers Supabase Hub
                    const syncMod = window.wmSync || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.wmSync : null);
                    if (syncMod && typeof syncMod.syncOpenedPackCards === 'function') {
                        syncMod.syncOpenedPackCards(data.cards);
                    }
                }

                // Détection de la mise à jour du solde
                if (data && typeof data === 'object' && typeof data.wikibidous_balance === 'number' && data.username) {
                    window.recordBalance(data.wikibidous_balance, 'passive');
                }
            } catch(e) {}
            return data;
        });
    };

    // ============================================================
    // INTERCEPTEUR FETCH CLASSIQUE
    // ============================================================

    window.wmAltCardOwners = {};
    window.wmMultiSearchCache = null;
    let currentMultiSearchController = null;
    let currentSearchSequence = 0;

    function abortMultiSearch() {
        if (currentMultiSearchController) {
            try { currentMultiSearchController.abort(); } catch(e) {}
            currentMultiSearchController = null;
        }
        currentSearchSequence++;
        if (typeof window.updateMultiSearchProgress === 'function') {
            window.updateMultiSearchProgress('');
        }
    }
    window.abortMultiSearch = WikiM.abortMultiSearch = abortMultiSearch;

    // Capture du vrai fetch natif non encapsulé
    const originalFetch = W._wmNativeFetch || W.fetch || window.fetch;
    if (!W._wmNativeFetch) W._wmNativeFetch = originalFetch;

    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const options = args[1] || {};

        // Sécurité anti-PGRST100 : PostgREST rejette tout paramètre custom comme wm_bypass=1
        if (typeof url === 'string' && url.includes('supabase.co') && url.includes('wm_bypass=')) {
            const cleanUrl = url.replace('?wm_bypass=1', '?').replace('&wm_bypass=1', '').replace('?&', '?').replace(/\?$/, '');
            args[0] = cleanUrl;
            return originalFetch.apply(this, args);
        }

        // Contournement immédiat pour les sous-requêtes internes du script (ex: multi-comptes)
        if (typeof url === 'string' && (url.includes('wm_bypass=1') || url.includes('wm_internal=1'))) {
            return originalFetch.apply(this, args);
        }

        const reqUrlStr = typeof url === 'string' ? url : (url?.url || '');
        // Ne capturer l'auth que pour les requêtes visant expressément le Supabase officiel du jeu Wiki-Masters
        if (options.headers && reqUrlStr.includes(SUPABASE_REF)) {
            const headers = new Headers(options.headers);
            const candidateKey = headers.get('apikey');
            if (candidateKey && candidateKey.includes(SUPABASE_REF)) {
                window.wmAuth.apikey = candidateKey;
            }
            if (headers.has('authorization')) {
                const rawAuth = headers.get('authorization');
                const cleanToken = cleanJwtToken(rawAuth);
                if (cleanToken && cleanToken.length >= 500) {
                    const claims = decodeJwt(cleanToken);
                    if (claims && claims.sub) {
                        window.wmAuth.token = cleanToken;
                        window.wmAuth.userId = claims.sub;
                        window.wmUserId = claims.sub;
                        const uName = claims.user_metadata?.username || claims.username;
                        if (uName) {
                            window.wmAuth.username = uName;
                            window.wmUsername = uName;
                            if (W) { W.wmUsername = uName; if (W.wmAuth) W.wmAuth.username = uName; }
                            try { localStorage.setItem('wmMyUsername', uName); } catch(e) {}
                        }
                        savePersistedAuth(window.wmAuth);
                    }
                }
            }
        }

        // --- PARSING SÉCURISÉ ---
        let pathname = '';
        let query = null;
        let page = 0;
        try {
            const requestUrl = typeof url === 'string' ? url : (url?.url || '');
            const urlStr = requestUrl.startsWith('http') ? requestUrl : window.location.origin + '/' + requestUrl.replace(/^\/?/, '');
            pathname = urlStr.split('?')[0].replace(/^https?:\/\/[^\/]+/, '');

            const qMatch = urlStr.match(/[?&]q=([^&]*)/);
            if (qMatch) query = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));

            const pMatch = urlStr.match(/[?&]page=(\d+)/);
            if (pMatch) page = parseInt(pMatch[1], 10);
        } catch(e) {}

        const isMyCollection = pathname === '/api/my-collection';
        const isMyStats = pathname === '/api/my-collection/stats';

        // ---> ARCHITECTURE BULK (Supabase in. operator) <---
        if (query && query.includes('[WM-BULK]') && (isMyCollection || isMyStats)) {
            const rawBulkList = JSON.parse(localStorage.getItem('wmBulkList') || '[]');
            const validBulk = rawBulkList.filter(item => typeof item === 'object' && (item.user_card_id || item.userCardId));

            // Filtre supplémentaire : mot-clé tapé après [WM-BULK] (ex: "[WM-BULK] Sam" ou "[WM-BULK] sam crouser")
            const subSearch = query.replace(/\[WM-BULK\]/gi, '').trim().toLowerCase();
            const filteredBulk = subSearch
                ? validBulk.filter(item => (item.title || '').toLowerCase().includes(subSearch))
                : validBulk;

            console.log(`[WM-Bulk] 🔍 Requête interceptée: query="${query}", sous-filtre="${subSearch}", total valid=${validBulk.length}, matchés=${filteredBulk.length}, page=${page}`);

            const ResponseConstructor = window.Response || W.Response || Response;

            if (isMyStats) {
                console.log(`[WM-Bulk] 📊 Réponse stats: total=${filteredBulk.length}`);
                return new ResponseConstructor(JSON.stringify({
                    total: filteredBulk.length, rarityCounts: {}, tagOptions: []
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }

            if (isMyCollection) {
                const start = page * 50;
                const chunk = filteredBulk.slice(start, start + 50);
                const ids = chunk.map(c => c.user_card_id || c.userCardId);

                console.log(`[WM-Bulk] 📦 Récupération Supabase chunk page ${page} : ${ids.length} IDs`);

                if (ids.length === 0) {
                    console.log(`[WM-Bulk] ℹ️ Aucun ID à récupérer pour cette page.`);
                    return new ResponseConstructor(JSON.stringify({ collection: [], total: null, rarityCounts: {}, tagOptions: [], pendingTradeCardIds: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }

                try {
                    const authObj = W.wmAuth || window.wmAuth;
                    if (!authObj || !authObj.token) {
                        console.error("[WM-Bulk] ❌ Token d'authentification introuvable dans wmAuth:", authObj);
                        throw new Error("Token d'authentification introuvable");
                    }

                    const token = authObj.token.startsWith('Bearer') ? authObj.token : `Bearer ${authObj.token}`;
                    const targetSupabaseUrl = `https://${SUPABASE_REF}.supabase.co/rest/v1/user_cards?select=id,is_shiny,obtained_at,card:card_id(*)&id=in.(${ids.join(',')})`;

                    console.log(`[WM-Bulk] 🌐 Fetch Supabase vers ${targetSupabaseUrl.slice(0, 80)}...`);
                    const res = await originalFetch(targetSupabaseUrl, {
                        method: 'GET',
                        headers: {
                            'apikey': authObj.apikey,
                            'authorization': token,
                            'accept': 'application/json',
                            'content-profile': 'public'
                        },
                        credentials: 'omit'
                    });

                    if (res.ok) {
                        const sbData = await res.json();
                        console.log(`[WM-Bulk] ✅ Supabase retourné ${sbData.length} cartes brutes`);

                        // Nettoyage automatique des cartes fantômes de ce chunk si Supabase n'en a renvoyé qu'une partie
                        if (Array.isArray(sbData)) {
                            const returnedIds = new Set(sbData.map(c => c.id));
                            const missingIds = ids.filter(id => !returnedIds.has(id));
                            if (missingIds.length > 0) {
                                console.log(`[WM-Bulk] 🧹 Purge automatique de ${missingIds.length} cartes fantômes du lot`);
                                const missingSet = new Set(missingIds);
                                const updatedBulk = rawBulkList.filter(item => {
                                    const uId = typeof item === 'object' ? (item.user_card_id || item.userCardId) : null;
                                    return !uId || !missingSet.has(uId);
                                });
                                localStorage.setItem('wmBulkList', JSON.stringify(updatedBulk));
                                if (typeof window.updateBulkUI === 'function') window.updateBulkUI();
                            }
                        }

                        // Détection cas critique : page 0 complètement vide alors qu'il y a des cartes dans le bulk
                        if (page === 0 && sbData.length === 0 && filteredBulk.length > 0) {
                            console.warn('[WM-Bulk] ⚠️ Page 0 vide mais cartes présentes dans le bulk : grand nettoyage automatique...');
                            if (typeof window.wmCleanBulkList === 'function') {
                                setTimeout(() => window.wmCleanBulkList(), 100);
                            }
                        }

                        const formattedCollection = sbData.map(item => ({
                            id: item.id,
                            card_id: item.card?.id,
                            user_id: W.wmUserId || window.wmUserId,
                            is_shiny: item.is_shiny,
                            obtained_at: item.obtained_at,
                            card: item.card
                        }));

                        return new ResponseConstructor(JSON.stringify({
                            collection: formattedCollection, total: null, rarityCounts: {}, tagOptions: [], pendingTradeCardIds: []
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    } else {
                        console.error(`[WM-Bulk] ❌ Supabase a retourné HTTP ${res.status}:`, await res.text().catch(() => ''));
                    }
                } catch (e) {
                    console.error("[WM-Bulk] ❌ Erreur fetch Supabase:", e);
                }

                return new ResponseConstructor(JSON.stringify({ collection: [], total: null, rarityCounts: {}, tagOptions: [], pendingTradeCardIds: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // ---> INSPECTION INDIVIDUELLE D'UN UTILISATEUR OU MULTI-COMPTES <---
        const inspectTarget = (localStorage.getItem('wmInspectUser') || '').trim();

        // 0. Stats lors de l'inspection d'un profil
        if (isMyStats && inspectTarget) {
            const ResponseConstructor = window.Response || W.Response || Response;
            return new ResponseConstructor(JSON.stringify({
                total: null,
                rarityCounts: {},
                tagOptions: []
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 1. Mode Inspection d'un utilisateur spécifique (remplace notre collection avec pagination complète)
        if (isMyCollection && inspectTarget) {
            const ResponseConstructor = window.Response || W.Response || Response;
            try {
                const parsedUrl = new URL(urlStr, window.location.origin);
                parsedUrl.searchParams.delete('stats');
                parsedUrl.searchParams.set('wm_bypass', '1');
                const finalUrl = `/api/profile/${encodeURIComponent(inspectTarget)}/collection?${parsedUrl.searchParams.toString()}`;

                console.log(`[WM-Inspect] 🔍 Chargement collection de "${inspectTarget}" via ${finalUrl}...`);
                const res = await originalFetch(finalUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        ...(options.headers || {})
                    },
                    credentials: "include"
                });

                if (res && res.ok) {
                    const data = await res.json().catch(() => null);
                    if (data && Array.isArray(data.collection)) {
                        console.log(`[WM-Inspect] ✅ ${data.collection.length} cartes reçues pour "${inspectTarget}".`);
                        window.logToPanel(`✅ Collection de "${inspectTarget}" chargée (${data.collection.length} cartes sur cette page).`);

                        // On marque les cartes comme appartenant à l'utilisateur inspecté
                        data.collection.forEach(c => {
                            if (c.id) window.wmAltCardOwners[c.id] = inspectTarget;
                            if (c.card_id) window.wmAltCardOwners[c.card_id] = inspectTarget;
                            if (c.card && c.card.id) window.wmAltCardOwners[c.card.id] = inspectTarget;
                            const title = c.card?.wikipedia_title || c.wikipedia_title || c.title;
                            if (title) {
                                const normTitle = title.replace(/\s+/g, ' ').trim();
                                window.wmAltCardOwners[normTitle] = inspectTarget;
                                window.wmAltCardOwners[`title:${normTitle}`] = inspectTarget;
                            }
                        });

                        return new ResponseConstructor(JSON.stringify({
                            collection: data.collection,
                            total: data.total ?? (data.collection.length === 50 ? (page + 2) * 50 : (page * 50 + data.collection.length)),
                            rarityCounts: data.rarityCounts || {},
                            tagOptions: data.tagOptions || [],
                            pendingTradeCardIds: []
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                    }
                } else {
                    const status = res ? res.status : 'ERR';
                    console.error(`[WM-Inspect] ❌ Échec HTTP ${status} pour "${inspectTarget}"`);
                    window.logToPanel(`⚠️ Joueur "${inspectTarget}" introuvable ou erreur profil (HTTP ${status}).`);
                }
            } catch (err) {
                console.error("[WM-Inspect] Erreur lors du chargement de la collection de", inspectTarget, err);
                window.logToPanel(`❌ Erreur réseau lors de l'inspection de "${inspectTarget}".`);
            }
            return new ResponseConstructor(JSON.stringify({ collection: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // 2. Annulation automatique si la requête collection est sans filtre ou multi-comptes inactif
        if (isMyCollection) {
            const isMultiEnabled = localStorage.getItem('wmMultiSearchEnabled') === 'true';
            if (!query || query.trim() === '' || !isMultiEnabled) {
                abortMultiSearch();
            }
        }

        // 3. Mode Recherche Multi-Comptes Classique (Synchrone avec annulation instantanée)
        if (isMyCollection && query && query.trim() !== '') {
            const isMultiEnabled = localStorage.getItem('wmMultiSearchEnabled') === 'true';
            const rawAltAccounts = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');
            const selectedAlts = JSON.parse(localStorage.getItem('wmMultiSelectedAccounts') || 'null');
            // Si une sélection fine existe, on ne garde que les comptes cochés, sinon tous les comptes
            const altAccounts = Array.isArray(selectedAlts) 
                ? rawAltAccounts.filter(a => selectedAlts.includes(a)) 
                : rawAltAccounts;

            if (isMultiEnabled && altAccounts.length > 0) {
                const ResponseConstructor = window.Response || W.Response || Response;

                const reportProgress = (msg, isDone = false) => {
                    if (typeof window.updateMultiSearchProgress === 'function') {
                        window.updateMultiSearchProgress(msg, isDone);
                    }
                };

                // Si la recherche a changé, on annule la précédente et on reconstruit le cache
                if (!window.wmMultiSearchCache || window.wmMultiSearchCache.query !== query) {
                    abortMultiSearch();
                    const controller = new AbortController();
                    currentMultiSearchController = controller;
                    const searchSeq = ++currentSearchSequence;

                    window.logToPanel(`🔍 Recherche Multi-Comptes pour "${query}"...`);
                    const newCache = { query: query, cards: [] };
                    window.wmMultiSearchCache = newCache;

                    // Fonction interne pour pomper toutes les pages d'une route avec annulation instantanée
                    const fetchAllPages = async (baseUrl, accountName) => {
                        let p = 0;
                        let allCards = [];
                        while (true) {
                            if (controller.signal.aborted || searchSeq !== currentSearchSequence) return null;

                            reportProgress(`⏳ [${accountName}] page ${p + 1}... (${allCards.length} cartes)`);

                            let attempts = 0;
                            let data = null;
                            const bypassChar = baseUrl.includes('?') ? '&' : '?';
                            const finalFetchUrl = `${baseUrl}&page=${p}&stats=0${bypassChar}wm_bypass=1`;

                            while (attempts < 3) {
                                if (controller.signal.aborted || searchSeq !== currentSearchSequence) return null;
                                attempts++;
                                try {
                                    const res = await originalFetch(finalFetchUrl, {
                                        credentials: "include",
                                        signal: controller.signal
                                    });
                                    if (res && res.ok) {
                                        data = await res.json().catch(() => null);
                                        if (data) break;
                                    }
                                } catch(err) {
                                    if (controller.signal.aborted) return null;
                                }
                                if (attempts < 3 && !controller.signal.aborted) {
                                    try {
                                        await new Promise((resolve, reject) => {
                                            const timer = setTimeout(resolve, attempts * 200);
                                            controller.signal.addEventListener('abort', () => {
                                                clearTimeout(timer);
                                                reject(new DOMException('Aborted', 'AbortError'));
                                            }, { once: true });
                                        });
                                    } catch(e) {
                                        return null;
                                    }
                                }
                            }

                            if (!data) break;
                            const items = data.collection || [];
                            if (items.length === 0) break;
                            allCards = allCards.concat(items);
                            if (items.length < 20) break; // Fin des résultats pour cette recherche
                            p++;

                            // Délai anti-spam interruptible
                            try {
                                await new Promise((resolve, reject) => {
                                    const timer = setTimeout(resolve, 150);
                                    controller.signal.addEventListener('abort', () => {
                                        clearTimeout(timer);
                                        reject(new DOMException('Aborted', 'AbortError'));
                                    }, { once: true });
                                });
                            } catch(abortErr) {
                                return null;
                            }
                        }
                        return allCards;
                    };

                    try {
                        const totalAccounts = 1 + altAccounts.length;

                        // 1. Mon compte
                        reportProgress(`⏳ (1/${totalAccounts}) Mon compte...`);
                        const myCards = await fetchAllPages(`/api/my-collection?q=${encodeURIComponent(query)}`, 'Moi');
                        if (controller.signal.aborted || searchSeq !== currentSearchSequence) {
                            return new ResponseConstructor(JSON.stringify({ collection: [] }), {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            });
                        }
                        if (myCards) newCache.cards.push(...myCards);

                        // 2. Comptes alternatifs sélectionnés
                        for (let aIdx = 0; aIdx < altAccounts.length; aIdx++) {
                            const alt = altAccounts[aIdx];
                            if (controller.signal.aborted || searchSeq !== currentSearchSequence) break;

                            reportProgress(`⏳ (${aIdx + 2}/${totalAccounts}) ${alt}...`);
                            const altCards = await fetchAllPages(`/api/profile/${encodeURIComponent(alt)}/collection?q=${encodeURIComponent(query)}`, alt);
                            if (controller.signal.aborted || searchSeq !== currentSearchSequence) break;

                            if (altCards) {
                                altCards.forEach(c => {
                                    if (c.id) window.wmAltCardOwners[c.id] = alt;
                                    if (c.card_id) window.wmAltCardOwners[c.card_id] = alt;
                                    if (c.card && c.card.id) window.wmAltCardOwners[c.card.id] = alt;
                                    const title = c.card?.wikipedia_title || c.wikipedia_title || c.title;
                                    if (title) {
                                        const normTitle = title.replace(/\s+/g, ' ').trim();
                                        window.wmAltCardOwners[normTitle] = alt;
                                        window.wmAltCardOwners[`title:${normTitle}`] = alt;
                                    }
                                });
                                newCache.cards.push(...altCards);
                            }
                        }

                        if (!controller.signal.aborted && searchSeq === currentSearchSequence) {
                            const totalFound = newCache.cards.length;
                            reportProgress(`✅ ${totalFound} carte(s) trouvée(s)`, true);
                            window.logToPanel(`✅ Recherche terminée : ${totalFound} cartes trouvées au total.`);
                        }
                    } catch (e) {
                        if (e.name !== 'AbortError') {
                            console.error("[WM-Multi] Erreur de recherche :", e);
                            reportProgress('❌ Erreur');
                        }
                    }
                }

                // ---> PAGINATION VIRTUELLE <---
                const PAGE_SIZE = 50;
                const start = page * PAGE_SIZE;
                const end = start + PAGE_SIZE;
                const paginatedCards = (window.wmMultiSearchCache?.cards || []).slice(start, end);

                return new ResponseConstructor(JSON.stringify({ collection: paginatedCards }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        const isCollectionReq = Boolean(url && url.includes('/api/my-collection'));
        if (isCollectionReq) window.wmCollectionLoading = true;

        let response;
        try {
            response = await originalFetch.apply(this, args);
        } finally {
            if (isCollectionReq) {
                window.wmCollectionLoading = false;
                window.wmCollectionLastLoaded = Date.now();
            }
        }

        try {
            // Interception passive de la collection (alimentation automatique du cache et de l'index)
            if (pathname === '/api/my-collection' && !inspectTarget && (!query || !query.includes('[WM-BULK]'))) {
                window._wmLastCollectionUrl = typeof url === 'string' ? url : (url?.url || '');
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && Array.isArray(data.collection) && data.collection.length > 0) {
                        if (typeof window.ingestCollectionData === 'function') {
                            window.ingestCollectionData(data.collection);
                        } else {
                            window._wmPendingCollectionData = data.collection;
                        }
                    }
                }).catch(() => {});
            }

            // Interception des prix du marché
            if (url && url.includes('sales?scope=summary')) {
                const uuidMatch = url.match(/\/cards\/([^\/]+)\/sales/);
                const interceptedUuid = uuidMatch ? uuidMatch[1] : null;
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && (data.summary || data.wikipedia_title)) {
                        const title = data.wikipedia_title;
                        const summary = data.summary || {};
                        if (typeof window.wmSavePriceToCache === 'function') {
                            window.wmSavePriceToCache(title, summary, interceptedUuid);
                        } else {
                            if (title) window.wmPrices[title] = summary;
                            if (interceptedUuid) window.wmPrices[interceptedUuid] = summary;
                        }
                        if (typeof window.renderPricesOnAllCards === 'function') {
                            window.renderPricesOnAllCards();
                        }
                    }
                }).catch(() => {});
            }

            // Interception de tes tags existants
            if (url && url.includes('/rest/v1/tags?select=')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (Array.isArray(data)) {
                        data.forEach(tag => {
                            window.wmTags[tag.name] = { id: tag.id, color: tag.color || '#a78bfa' };
                        });
                    }
                }).catch(() => {});
            }
        } catch (e) {}

        return response;
    };
    if (W && W !== window) {
        W.fetch = window.fetch;
    }

    // ============================================================
    // MODULE TAGS (Supabase)
    // ============================================================
    const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;

    window.wmTagsCache = [];
    window.wmUserCardTagsCache = new Map(); // userCardId -> Set(tagId)

    /**
 * Helper générique pour requêtes Supabase via GM_xmlhttpRequest (contourne CORS).
 */
    function supabaseRequest(method, path, body = null, extraHeaders = {}) {
        return new Promise((resolve, reject) => {
            const token = cleanJwtToken(W.wmAuth.token);
            if (!token || !W.wmAuth.apikey) {
                // Tentative ultime d'extraction depuis les cookies
                if (extractTokenFromCookies() && W.wmAuth.token) {
                    // Réussi, on continue
                } else {
                    reject(new Error('Auth non disponible'));
                    return;
                }
            }

            const activeToken = cleanJwtToken(W.wmAuth.token);
            const headers = {
                'apikey': W.wmAuth.apikey,
                'Authorization': `Bearer ${activeToken}`,
                'Content-Type': 'application/json',
                'Content-Profile': 'public',
                'Prefer': 'return=representation',
                ...extraHeaders
            };

            GM_xmlhttpRequest({
                method,
                url: `${SUPABASE_URL}${path}`,
                headers,
                data: body ? JSON.stringify(body) : undefined,
                onload: res => {
                    if (res.status === 204) {
                        resolve(null);
                    } else if (res.status >= 200 && res.status < 300) {
                        try { resolve(res.responseText ? JSON.parse(res.responseText) : null); }
                        catch { resolve(null); }
                    } else if (res.status === 401 && (res.responseText?.includes('PGRST301') || res.responseText?.includes('JWT'))) {
                        // Token corrompu ou expiré : tentative immédiate de rafraîchissement depuis les cookies
                        console.warn('[WM-Supabase] ⚠️ Erreur 401 JWT détectée, rafraîchissement depuis les cookies...');
                        extractTokenFromCookies();
                        reject(new Error(`HTTP 401: ${res.responseText}`));
                    } else {
                        reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
                    }
                },
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Timeout'))
            });
        });
    }

    /**
     * Version de supabaseRequest avec retry automatique.
     */
    function supabaseRequestWithRetry(method, path, body = null, opts = {}, extraHeaders = {}) {
        return window.withRetry(
            () => supabaseRequest(method, path, body, extraHeaders),
            {
                label: `Supabase ${method} ${path.split('?')[0]}`,
                retries: 4,
                baseDelay: 1500,
                maxDelay: 12000,
                ...opts,
                shouldRetry: (err) => {
                    const msg = String(err.message || '');
                    // 401 JWT -> Retry autorisé (les cookies ont été relus)
                    if (/HTTP 401/.test(msg) && (msg.includes('JWT') || msg.includes('PGRST301'))) return true;
                    // Autres 4xx → pas de retry (sauf 429)
                    if (/HTTP 4\d\d/.test(msg) && !/HTTP 429/.test(msg)) return false;
                    // 409 duplicate → pas de retry
                    if (/409/.test(msg)) return false;
                    // Tout le reste (5xx, timeouts, SSL) → retry
                    return true;
                }
            }
        );
    }

    window.SUPABASE_REF = SUPABASE_REF;
    window.SUPABASE_URL = SUPABASE_URL;

    // --- Cross-module exports ---
    window.decodeJwt = WikiM.decodeJwt = decodeJwt;
    window.extractTokenFromCookies = WikiM.extractTokenFromCookies = extractTokenFromCookies;
    window.supabaseRequest = WikiM.supabaseRequest = supabaseRequest;
    window.supabaseRequestWithRetry = WikiM.supabaseRequestWithRetry = supabaseRequestWithRetry;
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
