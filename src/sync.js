/**
 * WikiM - Module de Synchronisation Cloud & Synergie Multi-Comptes (src/sync.js)
 * Permet de synchroniser les collections entre plusieurs comptes/navigateurs
 * via Supabase et d'analyser les doublons pour le succès "5x cartes".
 */
(function(window, WikiM) {
    'use strict';
    console.log('[WM-Sync] 🚀 Module Sync v12.0 actif (requêtes Supabase nettoyées)');

    // Clés de configuration pour le hub Supabase
    const SUPABASE_HUB_URL = 'https://mlofooobbcxrmovcvmss.supabase.co/rest/v1';
    const SUPABASE_HUB_KEY = 'sb_publishable_FEF71b8c2vcH3ZT6HqVvfQ_BKfGx4ru';

    function getHubHeaders() {
        return {
            'apikey': SUPABASE_HUB_KEY,
            'Authorization': `Bearer ${SUPABASE_HUB_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        };
    }

    function nativeHubFetch(url, opts = {}) {
        const fetchFn = (typeof unsafeWindow !== 'undefined' && unsafeWindow._wmNativeFetch)
            || window._wmNativeFetch
            || fetch;
        return fetchFn(url, opts);
    }

    // Clés de persistance inter-pages pour le scan en arrière-plan
    const SCAN_SESSION_KEY = 'wm_sync_scan_session';
    const TAB_INSTANCE_ID = Math.random().toString(36).slice(2, 9);
    const progressListeners = new Set();

    function addProgressListener(cb) {
        if (typeof cb === 'function') {
            progressListeners.add(cb);
            return () => progressListeners.delete(cb);
        }
        return () => {};
    }

    function broadcastProgress(prog) {
        for (const cb of progressListeners) {
            try { cb(prog); } catch(e) {}
        }
    }

    function getStoredSession() {
        try {
            const raw = localStorage.getItem(SCAN_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch(e) {
            return null;
        }
    }

    function saveScanSession(data) {
        try {
            if (!data) {
                localStorage.removeItem(SCAN_SESSION_KEY);
            } else {
                localStorage.setItem(SCAN_SESSION_KEY, JSON.stringify({
                    ...data,
                    tabId: TAB_INSTANCE_ID,
                    updatedAt: Date.now()
                }));
            }
        } catch(e) {}
    }

    // Contrôleur en mémoire pour le scan page par page
    let syncScanController = {
        isRunning: false,
        isPaused: false,
        stopRequested: false,
        currentPage: 0,
        totalCards: 0
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Scanne la collection de wiki-masters.com page par page (50 cartes/page)
     * avec 2 secondes de délai de sécurité entre chaque page,
     * et supporte Pause / Resume / Arrêt.
     */
    /**
     * Détecte ou résout automatiquement le pseudo du compte courant
     */
    async function detectMyUsername() {
        // 1. Déjà stocké par l'utilisateur
        let saved = localStorage.getItem('wmMyUsername');
        if (saved && saved.trim()) return saved.trim();

        // 2. Variable globale window ou unsafeWindow
        const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const glob = targetWin.wmUsername || window.wmUsername || targetWin.W?.wmUsername || window.W?.wmUsername || targetWin.W?.wmAuth?.username || window.wmAuth?.username;
        if (glob && typeof glob === 'string' && glob.trim()) {
            localStorage.setItem('wmMyUsername', glob.trim());
            return glob.trim();
        }

        // 3. Décodage du token JWT de session du jeu (source la plus fiable)
        try {
            const auth = targetWin.W?.wmAuth || window.wmAuth || targetWin.wmAuth || {};
            const token = auth.token;
            if (token && typeof window.decodeJwt === 'function') {
                const claims = window.decodeJwt(token);
                const u = claims?.user_metadata?.username || claims?.username;
                if (u && typeof u === 'string' && u.trim()) {
                    localStorage.setItem('wmMyUsername', u.trim());
                    console.log(`[WM-Sync] 👤 Pseudo détecté via le token JWT : ${u.trim()}`);
                    return u.trim();
                }
            }
        } catch(e) {}

        // 4. Inspection du DOM pour les liens de profil
        try {
            const profileLinks = document.querySelectorAll('a[href*="/profile/"]');
            for (const a of profileLinks) {
                const href = a.getAttribute('href') || '';
                const m = href.match(/\/profile\/([^/?#]+)/);
                if (m && m[1]) {
                    const candidate = decodeURIComponent(m[1]).trim();
                    if (candidate && !['my-collection', 'friends', 'settings', 'null', 'undefined', 'undefined'].includes(candidate.toLowerCase())) {
                        localStorage.setItem('wmMyUsername', candidate);
                        console.log(`[WM-Sync] 👤 Pseudo détecté via le DOM : ${candidate}`);
                        return candidate;
                    }
                }
            }
        } catch(e) {}

        // 5. Fallback sur /api/friends
        try {
            const res = await fetch('/api/friends', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                const friendships = data.friendships || [];
                if (friendships.length > 0) {
                    const counts = {};
                    friendships.forEach(f => {
                        if (f.requester?.username) counts[f.requester.username] = (counts[f.requester.username] || 0) + 1;
                        if (f.addressee?.username) counts[f.addressee.username] = (counts[f.addressee.username] || 0) + 1;
                    });
                    const top = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null);
                    if (top) {
                        localStorage.setItem('wmMyUsername', top);
                        console.log(`[WM-Sync] 👤 Pseudo détecté via /api/friends : ${top}`);
                        return top;
                    }
                }
            }
        } catch(e) {}

        return null;
    }

    async function scanAndSyncCollection(onProgress = null) {
        if (onProgress) addProgressListener(onProgress);

        if (syncScanController.isRunning && !syncScanController.isPaused) {
            return { success: true, running: true };
        }

        // Si on était en pause et qu'on reprend
        if (syncScanController.isRunning && syncScanController.isPaused) {
            syncScanController.isPaused = false;
            const sess = getStoredSession();
            if (sess) saveScanSession({ ...sess, isPaused: false });
            broadcastProgress({ status: 'running', page: syncScanController.currentPage, count: syncScanController.totalCards });
            return { success: true, resumed: true };
        }

        // Vérification d'une session existante pour reprise automatique
        const existingSession = getStoredSession();
        let startPage = 0;
        let initialCards = 0;

        if (existingSession && existingSession.active && !existingSession.stopped && (Date.now() - (existingSession.updatedAt || 0) < 60000)) {
            startPage = Number(existingSession.page || 0);
            initialCards = Number(existingSession.totalCards || 0);
            console.log(`[WM-Sync] 🔄 Reprise transparente du scan en arrière-plan à la page ${startPage + 1} (${initialCards} cartes déjà synchronisées)...`);
        }

        syncScanController.isRunning = true;
        syncScanController.isPaused = false;
        syncScanController.stopRequested = false;
        syncScanController.currentPage = startPage;
        syncScanController.totalCards = initialCards;

        let myName = existingSession?.username || await detectMyUsername();
        if (!myName) {
            console.error('[WM-Sync] ❌ Impossible de démarrer le scan : nom d\'utilisateur inconnu.');
            broadcastProgress({ status: 'error', error: 'Nom d\'utilisateur introuvable. Veuillez renseigner votre pseudo dans l\'onglet Hub.', count: 0 });
            syncScanController.isRunning = false;
            saveScanSession(null);
            return { success: false, error: 'username_unknown' };
        }

        // Persistance immédiate de la session
        saveScanSession({
            active: true,
            page: startPage,
            totalCards: initialCards,
            username: myName,
            isPaused: false
        });

        console.log(`[WM-Sync] 🚀 Démarrage du scan de collection pour ${myName} (page départ: ${startPage + 1})...`);

        try {
            // Enregistrement du compte sur Supabase
            await nativeHubFetch(`${SUPABASE_HUB_URL}/accounts`, {
                method: 'POST',
                headers: {
                    ...getHubHeaders(),
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                    username: myName,
                    updated_at: new Date().toISOString()
                })
            }).catch(() => {});

            const PAGE_SIZE = 50;
            const MAX_PAGES = 500;
            let page = startPage;
            const allIngestedCards = [];

            while (page < MAX_PAGES) {
                if (syncScanController.stopRequested) {
                    console.log('[WM-Sync] ⏹️ Scan arrêté par l\'utilisateur.');
                    saveScanSession(null);
                    break;
                }

                // Gestion de la pause
                while (syncScanController.isPaused && !syncScanController.stopRequested) {
                    broadcastProgress({ status: 'paused', page, count: syncScanController.totalCards });
                    await sleep(300);
                }
                if (syncScanController.stopRequested) {
                    saveScanSession(null);
                    break;
                }

                syncScanController.currentPage = page;
                broadcastProgress({ status: 'running', page: page + 1, count: syncScanController.totalCards, detail: `Récupération page ${page + 1}...` });

                // Récupération de la page depuis Wiki-Masters
                let data = null;
                try {
                    const resp = await fetch(`/api/my-collection?sort=rarity&page=${page}&stats=0`, {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json' }
                    });

                    if (resp.status === 429) {
                        console.warn('[WM-Sync] ⏳ Rate-limit 429 détecté, pause forcée de 5s...');
                        broadcastProgress({ status: 'rate_limited', page: page + 1, count: syncScanController.totalCards });
                        await sleep(5000);
                        continue;
                    }

                    if (!resp.ok) {
                        throw new Error(`HTTP ${resp.status}`);
                    }

                    data = await resp.json();
                } catch (fetchErr) {
                    console.warn(`[WM-Sync] Erreur sur page ${page}:`, fetchErr.message);
                    await sleep(3000);
                    continue;
                }

                const items = Array.isArray(data?.collection) ? data.collection : [];
                if (items.length === 0) {
                    console.log(`[WM-Sync] 🏁 Fin de collection atteinte à la page ${page}.`);
                    break;
                }

                // Formater pour IndexedDB et Supabase
                const formattedBatch = [];
                items.forEach(it => {
                    const cid = it.card?.id || it.card_id;
                    const title = it.card?.wikipedia_title || it.wikipedia_title || it.title;
                    const rarity = it.card?.rarity || it.rarity || 'C';
                    const is_shiny = Boolean(it.is_shiny || it.card?.is_shiny);
                    const category = it.card?.category || it.category || '';
                    const image_url = it.card?.image_url || it.image_url || '';
                    const copies_count = Number(it.copies || it.count || it.quantity || it.copies_count || 1);

                    if (cid && title) {
                        formattedBatch.push({
                            account_username: myName,
                            card_id: String(cid),
                            title: String(title),
                            rarity: String(rarity),
                            copies_count: copies_count,
                            is_shiny: is_shiny,
                            category: category,
                            image_url: image_url,
                            updated_at: new Date().toISOString()
                        });
                        allIngestedCards.push(it);
                    }
                });

                syncScanController.totalCards += formattedBatch.length;

                // Envoi direct du lot vers Supabase Hub
                try {
                    await nativeHubFetch(`${SUPABASE_HUB_URL}/user_collections?on_conflict=account_username,card_id,rarity,is_shiny`, {
                        method: 'POST',
                        headers: {
                            ...getHubHeaders(),
                            'Prefer': 'resolution=merge-duplicates'
                        },
                        body: JSON.stringify(formattedBatch)
                    });
                } catch (sbErr) {
                    console.warn('[WM-Sync] Erreur push lot Supabase:', sbErr.message);
                }

                // Sauvegarde de l'avancement dans le localStorage pour survivre aux changements de page
                saveScanSession({
                    active: true,
                    page: page + 1,
                    totalCards: syncScanController.totalCards,
                    username: myName,
                    isPaused: false
                });

                broadcastProgress({ status: 'running', page: page + 1, count: syncScanController.totalCards });

                // Fin de la collection si la page a moins d'éléments que la taille max
                if (items.length < PAGE_SIZE) break;

                page++;

                // Délai sécurisé de 2 secondes entre chaque page
                await sleep(2000);
            }

            // Ingestion finale dans le cache local et IndexedDB
            if (typeof window.ingestCollectionData === 'function' && allIngestedCards.length > 0) {
                window.ingestCollectionData(allIngestedCards);
            }

            const isDone = !syncScanController.stopRequested;
            saveScanSession(null); // Fin normale ou arrêtée -> nettoyage de la session

            console.log(`[WM-Sync] ✅ Fin de synchronisation (${syncScanController.totalCards} cartes au total).`);
            broadcastProgress({ status: isDone ? 'done' : 'stopped', page, count: syncScanController.totalCards });

            if (isDone) {
                if (typeof window.logToPanel === 'function') {
                    window.logToPanel(`☁️ [Hub] Synchronisation terminée : ${syncScanController.totalCards} cartes envoyées !`);
                }
                if (typeof window.showToast === 'function') {
                    window.showToast({ title: '☁️ Hub Supabase', body: `Collection synchronisée (${syncScanController.totalCards} cartes) !` });
                }
            }

            return { success: true, count: syncScanController.totalCards, stopped: syncScanController.stopRequested };
        } catch (err) {
            console.error('[WM-Sync] ❌ Échec global du scan de collection:', err);
            broadcastProgress({ status: 'error', error: err.message, count: syncScanController.totalCards });
            saveScanSession(null);
            return { success: false, error: err.message };
        } finally {
            syncScanController.isRunning = false;
            syncScanController.isPaused = false;
        }
    }

    function pauseCollectionSync() {
        if (syncScanController.isRunning) {
            syncScanController.isPaused = true;
            const sess = getStoredSession();
            if (sess) saveScanSession({ ...sess, isPaused: true });
            broadcastProgress({ status: 'paused', page: syncScanController.currentPage, count: syncScanController.totalCards });
        }
    }

    function resumeCollectionSync() {
        if (syncScanController.isRunning && syncScanController.isPaused) {
            syncScanController.isPaused = false;
            const sess = getStoredSession();
            if (sess) saveScanSession({ ...sess, isPaused: false });
            broadcastProgress({ status: 'running', page: syncScanController.currentPage, count: syncScanController.totalCards });
        }
    }

    function stopCollectionSync() {
        syncScanController.stopRequested = true;
        syncScanController.isPaused = false;
        saveScanSession(null);
        broadcastProgress({ status: 'stopped', page: syncScanController.currentPage, count: syncScanController.totalCards });
    }

    function getSyncState() {
        return { ...syncScanController };
    }

    /**
     * Télécharge la collection de tous les autres comptes depuis Supabase
     * et l'enregistre dans IndexedDB (alts_collections)
     */
    /**
     * Synchronise immédiatement les cartes tirées d'un pack vers Supabase (Live Sync)
     */
    async function syncOpenedPackCards(cards) {
        if (!Array.isArray(cards) || cards.length === 0) return;
        const myName = await detectMyUsername();
        if (!myName) return;

        const formattedBatch = [];
        cards.forEach(card => {
            const cid = card.id || card.card_id;
            const title = card.wikipedia_title || card.title;
            const rarity = card.rarity || 'C';
            const is_shiny = Boolean(card.is_shiny);
            const category = card.category || '';
            const image_url = card.image_url || '';

            if (cid && title) {
                formattedBatch.push({
                    account_username: myName,
                    card_id: String(cid),
                    title: String(title),
                    rarity: String(rarity),
                    copies_count: 1,
                    is_shiny: is_shiny,
                    category: category,
                    image_url: image_url,
                    updated_at: new Date().toISOString()
                });
            }
        });

        if (formattedBatch.length === 0) return;

        try {
            await nativeHubFetch(`${SUPABASE_HUB_URL}/user_collections?on_conflict=account_username,card_id,rarity,is_shiny`, {
                method: 'POST',
                headers: {
                    ...getHubHeaders(),
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(formattedBatch)
            });
            console.log(`[WM-Sync] 🎴 ${formattedBatch.length} carte(s) du pack synchronisée(s) en direct vers Supabase.`);
        } catch(err) {
            console.warn('[WM-Sync] Échec envoi live pack Supabase:', err);
        }
    }

    /**
     * Interroge Supabase pour compter exactement combien de cartes sont enregistrées pour ce compte
     */
    async function checkAccountSyncStatus(username = null) {
        let user = (username || '').trim();
        if (!user) {
            user = (typeof document !== 'undefined' && document.getElementById('wm-hub-username-input')?.value || '').trim()
                || localStorage.getItem('wmMyUsername')
                || await detectMyUsername();
        }
        if (!user) return { success: false, error: 'no_username' };

        try {
            const headers = {
                'apikey': SUPABASE_HUB_KEY,
                'Authorization': `Bearer ${SUPABASE_HUB_KEY}`,
                'Prefer': 'count=exact'
            };

            // 1. Requête insensible à la casse (ilike)
            const res = await nativeHubFetch(
                `${SUPABASE_HUB_URL}/user_collections?account_username=ilike.${encodeURIComponent(user)}&select=account_username&limit=1`,
                { method: 'GET', headers }
            );

            let range = res.headers.get('Content-Range') || '';
            let match = range.match(/\/(\d+)/);
            let count = match ? parseInt(match[1], 10) : 0;
            let matchedUser = user;

            if (count > 0) {
                try {
                    const data = await res.json();
                    if (Array.isArray(data) && data[0]?.account_username) {
                        matchedUser = data[0].account_username;
                    }
                } catch(e) {}
            } else {
                // 2. Si 0 résultat, tentative avec recherche wildcard (ex: 'Askaat' -> '420askaat')
                const resWildcard = await nativeHubFetch(
                    `${SUPABASE_HUB_URL}/user_collections?account_username=ilike.*${encodeURIComponent(user)}*&select=account_username&limit=1`,
                    { method: 'GET', headers }
                );
                const wRange = resWildcard.headers.get('Content-Range') || '';
                const wMatch = wRange.match(/\/(\d+)/);
                const wCount = wMatch ? parseInt(wMatch[1], 10) : 0;

                if (wCount > 0) {
                    try {
                        const wData = await resWildcard.json();
                        if (Array.isArray(wData) && wData[0]?.account_username) {
                            matchedUser = wData[0].account_username;
                            count = wCount;
                        }
                    } catch(e) {}
                }
            }

            // Si un compte a été résolu avec succès, synchroniser automatiquement le nom canonique
            if (matchedUser && count > 0) {
                localStorage.setItem('wmMyUsername', matchedUser);
                const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                targetWin.wmUsername = matchedUser;
                const inputEl = typeof document !== 'undefined' ? document.getElementById('wm-hub-username-input') : null;
                if (inputEl) inputEl.value = matchedUser;
            }

            return { success: true, username: matchedUser, count };
        } catch(e) {
            return { success: false, error: e.message };
        }
    }

    async function pullAllCollectionsFromHub() {
        console.log('[WM-Sync] 📥 Récupération des collections multi-comptes depuis Supabase Hub...');
        try {
            const PAGE_SIZE = 1000;
            let offset = 0;
            let allData = [];
            let hasMore = true;

            while (hasMore) {
                const res = await fetch(
                    `${SUPABASE_HUB_URL}/user_collections?select=*&limit=${PAGE_SIZE}&offset=${offset}`,
                    {
                        method: 'GET',
                        headers: {
                            'apikey': SUPABASE_HUB_KEY,
                            'Authorization': `Bearer ${SUPABASE_HUB_KEY}`,
                            'Accept': 'application/json',
                            'Prefer': 'count=exact'
                        }
                    }
                );

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const page = await res.json();

                if (!Array.isArray(page) || page.length === 0) {
                    hasMore = false;
                } else {
                    allData = allData.concat(page);
                    hasMore = page.length === PAGE_SIZE;
                    offset += PAGE_SIZE;
                    if (hasMore) await sleep(1000); // délai entre pages
                }
            }

            if (allData.length > 0 && window.wmIDB) {
                const items = allData.map(item => ({
                    uid: `${item.account_username}_${item.card_id}_${item.rarity}_${item.is_shiny ? 'shiny' : 'reg'}`,
                    ...item
                }));

                await window.wmIDB.clear(window.wmIDB.stores.ALTS_COLLECTIONS);
                await window.wmIDB.bulkPut(window.wmIDB.stores.ALTS_COLLECTIONS, items);
                console.log(`[WM-Sync] ✅ ${items.length} cartes multi-comptes stockées en IndexedDB locale.`);
            }

            return allData;
        } catch (err) {
            console.error('[WM-Sync] ❌ Erreur lors du pull Supabase:', err);
            return [];
        }
    }

    /**
     * Calcule la synergie multi-comptes et détecte les cartes pouvant atteindre 5 exemplaires
     * pour débloquer le succès du jeu !
     */
    async function calculateMultiAccountSynergies() {
        let allCards = [];
        if (window.wmIDB) {
            allCards = await window.wmIDB.getAll(window.wmIDB.stores.ALTS_COLLECTIONS);
        }
        if (allCards.length === 0) {
            allCards = await pullAllCollectionsFromHub();
        }

        const mapByCardId = new Map();

        allCards.forEach(row => {
            const cid = row.card_id;
            if (!mapByCardId.has(cid)) {
                mapByCardId.set(cid, {
                    card_id: cid,
                    title: row.title,
                    rarity: row.rarity,
                    totalCopies: 0,
                    byAccount: {}
                });
            }

            const entry = mapByCardId.get(cid);
            entry.totalCopies += (row.copies_count || 1);
            entry.byAccount[row.account_username] = (entry.byAccount[row.account_username] || 0) + (row.copies_count || 1);
        });

        const achievable5x = [];
        const near5x = [];

        mapByCardId.forEach(val => {
            if (val.totalCopies >= 5) {
                achievable5x.push(val);
            } else if (val.totalCopies >= 3) {
                near5x.push(val);
            }
        });

        achievable5x.sort((a, b) => b.totalCopies - a.totalCopies);
        near5x.sort((a, b) => b.totalCopies - a.totalCopies);

        return {
            achievable5x,
            near5x,
            totalUniqueCardsTracked: mapByCardId.size
        };
    }

    // Détection et reprise automatique du scan en arrière-plan inter-pages
    function checkAutoResumeBackgroundScan() {
        const session = getStoredSession();
        if (session && session.active && !session.isPaused && !session.stopped) {
            const elapsed = Date.now() - (session.updatedAt || 0);
            if (elapsed < 45000) {
                console.log(`[WM-Sync] 🚀 Navigation détectée : reprise automatique du scan en arrière-plan (page ${session.page + 1}, ${session.totalCards} cartes)...`);
                setTimeout(() => {
                    if (!syncScanController.isRunning) {
                        scanAndSyncCollection();
                    }
                }, 1200);
            } else {
                saveScanSession(null);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAutoResumeBackgroundScan);
    } else {
        checkAutoResumeBackgroundScan();
    }

    // Exports robustes (contexte sandbox + contexte page unsafeWindow)
    const syncObj = {
        detectMyUsername,
        scanAndSyncCollection,
        pauseCollectionSync,
        resumeCollectionSync,
        stopCollectionSync,
        getSyncState,
        getStoredSession,
        addProgressListener,
        syncOpenedPackCards,
        checkAccountSyncStatus,
        pullAllCollections: pullAllCollectionsFromHub,
        calculateSynergies: calculateMultiAccountSynergies
    };
    window.wmSync = syncObj;
    WikiM.Sync = syncObj;
    if (typeof unsafeWindow !== 'undefined') unsafeWindow.wmSync = syncObj;

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
