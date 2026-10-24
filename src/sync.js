/**
 * WikiM - Module de Synchronisation Cloud & Synergie Multi-Comptes (src/sync.js)
 * Permet de synchroniser les collections entre plusieurs comptes/navigateurs
 * via Supabase et d'analyser les doublons pour le succès "5x cartes".
 */
(function(window, WikiM) {
    'use strict';

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

    // Contrôleur pour le scan page par page avec pause / resume / arrêt
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
    async function scanAndSyncCollection(onProgress = null) {
        if (syncScanController.isRunning && !syncScanController.isPaused) {
            return;
        }

        // Si on était en pause et qu'on reprend
        if (syncScanController.isRunning && syncScanController.isPaused) {
            syncScanController.isPaused = false;
            if (onProgress) onProgress({ status: 'running', page: syncScanController.currentPage, count: syncScanController.totalCards });
            return;
        }

        syncScanController.isRunning = true;
        syncScanController.isPaused = false;
        syncScanController.stopRequested = false;
        syncScanController.currentPage = 0;
        syncScanController.totalCards = 0;

        const myName = (window.W && window.W.wmUsername) || localStorage.getItem('wmMyUsername');
        if (!myName) {
            console.error('[WM-Sync] ❌ Impossible de démarrer le scan : nom d\'utilisateur inconnu. Connectez-vous d\'abord.');
            if (onProgress) onProgress({ status: 'error', error: 'Nom d\'utilisateur inconnu', count: 0 });
            syncScanController.isRunning = false;
            return { success: false, error: 'username_unknown' };
        }
        console.log(`[WM-Sync] 🚀 Démarrage du scan de collection pour ${myName}...`);

        try {
            // 1. Enregistre le compte sur Supabase
            await fetch(`${SUPABASE_HUB_URL}/accounts`, {
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
            let page = 0;
            const allIngestedCards = [];

            while (page < MAX_PAGES) {
                if (syncScanController.stopRequested) {
                    console.log('[WM-Sync] ⏹️ Scan arrêté par l\'utilisateur.');
                    break;
                }

                // Gestion de la mise en pause
                while (syncScanController.isPaused && !syncScanController.stopRequested) {
                    if (onProgress) onProgress({ status: 'paused', page, count: syncScanController.totalCards });
                    await sleep(300);
                }
                if (syncScanController.stopRequested) break;

                syncScanController.currentPage = page;
                if (onProgress) onProgress({ status: 'running', page, count: syncScanController.totalCards, detail: `Récupération page ${page + 1}...` });

                // Récupération de la page depuis Wiki-Masters
                let data = null;
                try {
                    const resp = await fetch(`/api/my-collection?sort=rarity&page=${page}&stats=0`, {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json' }
                    });

                    if (resp.status === 429) {
                        console.warn('[WM-Sync] ⏳ Rate-limit 429 détecté, pause forcée de 5s...');
                        if (onProgress) onProgress({ status: 'rate_limited', page, count: syncScanController.totalCards });
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
                    // Fin de la collection atteinte
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

                // 2. Envoi direct du lot vers Supabase Hub
                try {
                    await fetch(`${SUPABASE_HUB_URL}/user_collections?on_conflict=account_username,card_id,rarity,is_shiny`, {
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

                if (onProgress) onProgress({ status: 'running', page: page + 1, count: syncScanController.totalCards });

                // Si la page contenait moins de 50 cartes, on est à la toute fin
                if (items.length < PAGE_SIZE) break;

                page++;

                // ⏱️ DÉLAI STRICT DE 2 SECONDES ENTRE CHAQUE REQUÊTE demandé par l'utilisateur
                await sleep(2000);
            }

            // Ingestion finale dans le cache local et IndexedDB
            if (typeof window.ingestCollectionData === 'function' && allIngestedCards.length > 0) {
                window.ingestCollectionData(allIngestedCards);
            }

            const isDone = !syncScanController.stopRequested;
            console.log(`[WM-Sync] ✅ Fin de synchronisation (${syncScanController.totalCards} cartes au total).`);
            if (onProgress) onProgress({ status: isDone ? 'done' : 'stopped', page, count: syncScanController.totalCards });

            return { success: true, count: syncScanController.totalCards, stopped: syncScanController.stopRequested };
        } catch (err) {
            console.error('[WM-Sync] ❌ Échec global du scan de collection:', err);
            if (onProgress) onProgress({ status: 'error', error: err.message, count: syncScanController.totalCards });
            return { success: false, error: err.message };
        } finally {
            syncScanController.isRunning = false;
            syncScanController.isPaused = false;
        }
    }

    function pauseCollectionSync() {
        if (syncScanController.isRunning) {
            syncScanController.isPaused = true;
        }
    }

    function resumeCollectionSync() {
        if (syncScanController.isRunning && syncScanController.isPaused) {
            syncScanController.isPaused = false;
        }
    }

    function stopCollectionSync() {
        if (syncScanController.isRunning) {
            syncScanController.stopRequested = true;
            syncScanController.isPaused = false;
        }
    }

    function getSyncState() {
        return { ...syncScanController };
    }

    /**
     * Télécharge la collection de tous les autres comptes depuis Supabase
     * et l'enregistre dans IndexedDB (alts_collections)
     */
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

    // Exports
    window.wmSync = WikiM.Sync = {
        scanAndSyncCollection,
        pauseCollectionSync,
        resumeCollectionSync,
        stopCollectionSync,
        getSyncState,
        pullAllCollections: pullAllCollectionsFromHub,
        calculateSynergies: calculateMultiAccountSynergies
    };

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
