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

    W.wmAuth = {
        apikey: SUPABASE_APIKEY_FALLBACK,
        token: null,
        userId: null,
        ref: SUPABASE_REF
    };

    function decodeJwt(token) {
        try {
            const payload = token.split('.')[1];
            return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        } catch { return null; }
    }

    const _origFetchForAuth = W.fetch;
    W.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        const opts = args[1] || {};
        if (url.includes('supabase.co') && opts.headers) {
            const h = opts.headers;
            const apikey = h.apikey || h.Apikey || h['X-Api-Key'];
            const auth = h.Authorization || h.authorization;

            if (apikey && typeof apikey === 'string' && apikey.length > 100 && apikey !== W.wmAuth.apikey) {
                W.wmAuth.apikey = apikey;
                console.log('[WM] Apikey mise à jour depuis le trafic');
            }
            if (auth && auth.startsWith('Bearer ')) {
                const candidate = auth.slice(7);
                if (candidate.length >= 500) {
                    const claims = decodeJwt(candidate);
                    if (claims && claims.sub && W.wmAuth.token !== candidate) {
                        W.wmAuth.token = candidate;
                        W.wmAuth.userId = claims.sub;
                        W.wmUserId = claims.sub;
                        console.log('[WM] Token utilisateur capturé, userId:', claims.sub);
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
                W.wmAuth.token = session.access_token;
                W.wmAuth.userId = claims?.sub || session.user?.id || null;
                W.wmUserId = W.wmAuth.userId;
                console.log('[WM] Token extrait des cookies, userId:', W.wmUserId);
                return true;
            }
        } catch (e) {
            console.warn('[WM] Échec extraction token cookies:', e);
        }
        return false;
    }

    extractTokenFromCookies();
    setTimeout(() => { if (!W.wmAuth.token) extractTokenFromCookies(); }, 1500);

    W.wmDebug = {
        getAuth: () => W.wmAuth || null,
        getUserId: () => W.wmUserId || null,
        refreshFromCookies: () => extractTokenFromCookies()
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
                    logToPanel(`🎴 Pack ouvert : ${data.cards.length} cartes`);

                    // 1. Lancement du scan des prix
                    data.cards.forEach((card, i) => {
                        const uuid = card.id;
                        const title = card.wikipedia_title || card.title;
                        if (uuid && title) setTimeout(() => fetchPricesBackground(uuid, title), i * 120);
                    });

                    // 2. Lancement de l'Auto-Tag intelligent (1.5s après, le temps que la DB s'actualise)
                    if (typeof processAutoTags === 'function') {
                        setTimeout(() => processAutoTags(data.cards), 1500);
                    }
                }

                // Détection de la mise à jour du solde
                if (data && typeof data === 'object' && typeof data.wikibidous_balance === 'number' && data.username) {
                    recordBalance(data.wikibidous_balance, 'passive');
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

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const options = args[1] || {};

        if (options.headers) {
            const headers = new Headers(options.headers);
            if (headers.has('apikey')) window.wmAuth.apikey = headers.get('apikey');
            if (headers.has('authorization')) {
                const token = headers.get('authorization');
                window.wmAuth.token = token;
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    if (payload && payload.sub) window.wmUserId = payload.sub;
                } catch(e) {}
            }
        }

        // ---> FUSION DES RECHERCHES MULTI-COMPTES <---
        if (url && url.includes('/api/my-collection') && url.includes('q=')) {
            const urlObj = new URL(url.startsWith('http') ? url : window.location.origin + url);
            const query = urlObj.searchParams.get('q');
            const page = parseInt(urlObj.searchParams.get('page') || '0', 10);
            const altAccounts = JSON.parse(localStorage.getItem('wmAltAccounts') || '[]');

            // On ne déclenche la lourde logique QUE si on fait une vraie recherche avec des comptes alternatifs
            if (query && query.trim() !== '' && altAccounts.length > 0) {

                // Si la recherche a changé, on reconstruit le Méga-Tableau
                if (!window.wmMultiSearchCache || window.wmMultiSearchCache.query !== query) {
                    logToPanel(`🔍 Recherche Multi-Comptes pour "${query}"...`);
                    window.wmMultiSearchCache = { query: query, cards: [] };

                    // Fonction interne pour pomper toutes les pages d'une route spécifique
                    const fetchAllPages = async (baseUrl) => {
                        let p = 0;
                        let allCards = [];
                        while (true) {
                            const res = await originalFetch(`${baseUrl}&page=${p}&stats=0`, { credentials: "include" });
                            if (!res.ok) break;
                            const data = await res.json();
                            const items = data.collection || [];
                            if (items.length === 0) break;
                            allCards = allCards.concat(items);
                            if (items.length < 20) break; // Fin des résultats
                            p++;
                            await new Promise(r => setTimeout(r, 200)); // Délai anti-spam
                        }
                        return allCards;
                    };

                    try {
                        // 1. Ton compte principal
                        const myCards = await fetchAllPages(`/api/my-collection?q=${encodeURIComponent(query)}`);
                        window.wmMultiSearchCache.cards.push(...myCards);

                        // 2. Les comptes alternatifs
                        for (const alt of altAccounts) {
                            const altCards = await fetchAllPages(`/api/profile/${alt}/collection?q=${encodeURIComponent(query)}`);
                            altCards.forEach(c => window.wmAltCardOwners[c.id] = alt); // On marque le propriétaire
                            window.wmMultiSearchCache.cards.push(...altCards);
                        }
                        logToPanel(`✅ Recherche terminée : ${window.wmMultiSearchCache.cards.length} cartes trouvées au total.`);
                    } catch (e) {
                        console.error("[WM-Multi] Erreur de recherche :", e);
                    }
                }

                // ---> PAGINATION VIRTUELLE <---
                const PAGE_SIZE = 50; // Format attendu par l'UI du jeu
                const start = page * PAGE_SIZE;
                const end = start + PAGE_SIZE;
                const paginatedCards = window.wmMultiSearchCache.cards.slice(start, end);

                // On renvoie une fausse réponse formatée exactement comme le serveur
                return new Response(JSON.stringify({ collection: paginatedCards }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        const response = await originalFetch.apply(this, args);

        try {
            // Interception des prix du marché
            if (url && url.includes('sales?scope=summary')) {
                const clone = response.clone();
                clone.json().then(data => {
                    if (data && data.wikipedia_title) {
                        window.wmPrices[data.wikipedia_title] = data.summary || {};
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

    // ============================================================
    // MODULE TAGS (Supabase)
    // ============================================================
    const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;

    window.wmTagsCache = [];
    window.wmUserCardTagsCache = new Map(); // userCardId -> Set(tagId)

    /**
 * Helper générique pour requêtes Supabase via GM_xmlhttpRequest (contourne CORS).
 */
    function supabaseRequest(method, path, body = null) {
        return new Promise((resolve, reject) => {
            if (!W.wmAuth.token || !W.wmAuth.apikey) {
                reject(new Error('Auth non disponible'));
                return;
            }
            GM_xmlhttpRequest({
                method,
                url: `${SUPABASE_URL}${path}`,
                headers: {
                    'apikey': W.wmAuth.apikey,
                    'Authorization': `Bearer ${W.wmAuth.token}`,
                    'Content-Type': 'application/json',
                    'Content-Profile': 'public',
                    'Prefer': 'return=representation'
                },
                data: body ? JSON.stringify(body) : undefined,
                onload: res => {
                    if (res.status === 204) {
                        resolve(null);
                    } else if (res.status >= 200 && res.status < 300) {
                        try { resolve(res.responseText ? JSON.parse(res.responseText) : null); }
                        catch { resolve(null); }
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
    function supabaseRequestWithRetry(method, path, body = null, opts = {}) {
        return withRetry(
            () => supabaseRequest(method, path, body),
            {
                label: `Supabase ${method} ${path.split('?')[0]}`,
                retries: 4,
                baseDelay: 1500,
                maxDelay: 12000,
                ...opts,
                shouldRetry: (err) => {
                    const msg = String(err.message || '');
                    // 4xx → pas de retry (sauf 429)
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
    if (typeof decodeJwt !== 'undefined') { window.decodeJwt = decodeJwt; window.WikiM.decodeJwt = decodeJwt; }
    if (typeof extractTokenFromCookies !== 'undefined') { window.extractTokenFromCookies = extractTokenFromCookies; window.WikiM.extractTokenFromCookies = extractTokenFromCookies; }
    if (typeof supabaseRequest !== 'undefined') { window.supabaseRequest = supabaseRequest; window.WikiM.supabaseRequest = supabaseRequest; }
    if (typeof supabaseRequestWithRetry !== 'undefined') { window.supabaseRequestWithRetry = supabaseRequestWithRetry; window.WikiM.supabaseRequestWithRetry = supabaseRequestWithRetry; }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
