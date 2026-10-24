/**
 * WikiM - Module IndexedDB & Migration Locale (src/db.js)
 * Base de données locale asynchrone pour remplacer le localStorage (5Mo)
 * et stocker de manière illimitée prix, collections locales et multi-comptes.
 */
(function(window, WikiM) {
    'use strict';

    const DB_NAME = 'WikiM_Database';
    const DB_VERSION = 1;

    // Noms des Object Stores
    const STORES = {
        PRICES: 'prices',                     // key: card_id ou title, value: { id, title, summary, timestamp }
        COLLECTION: 'my_collection',          // key: user_card_id, value: cardObject
        ALTS_COLLECTIONS: 'alts_collections', // key: account_username + '_' + card_id, value: { account, card_id, title, rarity, ... }
        BALANCE_HISTORY: 'balance_history',   // key: id auto, value: { amount, timestamp, reason }
        KEY_VAL: 'key_val'                    // stockage générique pour gros objets (règles, etc.)
    };

    let dbInstance = null;
    let dbInitPromise = null;

    /**
     * Ouvre et initialise la base IndexedDB WikiM
     */
    function openWikiMDatabase() {
        if (dbInstance) return Promise.resolve(dbInstance);
        if (dbInitPromise) return dbInitPromise;

        dbInitPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                console.log(`[WM-IDB] 🛠️ Initialisation ou montée de version de ${DB_NAME} (v${DB_VERSION})...`);

                // Store 1 : Prix du marché (indexé par id et titre)
                if (!db.objectStoreNames.contains(STORES.PRICES)) {
                    const priceStore = db.createObjectStore(STORES.PRICES, { keyPath: 'key' });
                    priceStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Store 2 : Collection locale du compte courant
                if (!db.objectStoreNames.contains(STORES.COLLECTION)) {
                    const colStore = db.createObjectStore(STORES.COLLECTION, { keyPath: 'id' });
                    colStore.createIndex('card_id', 'card_id', { unique: false });
                    colStore.createIndex('title', 'title', { unique: false });
                    colStore.createIndex('rarity', 'rarity', { unique: false });
                }

                // Store 3 : Collections synchronisées des alts / amis
                if (!db.objectStoreNames.contains(STORES.ALTS_COLLECTIONS)) {
                    const altStore = db.createObjectStore(STORES.ALTS_COLLECTIONS, { keyPath: 'uid' });
                    altStore.createIndex('account', 'account_username', { unique: false });
                    altStore.createIndex('card_id', 'card_id', { unique: false });
                    altStore.createIndex('title', 'title', { unique: false });
                }

                // Store 4 : Historique du solde WB
                if (!db.objectStoreNames.contains(STORES.BALANCE_HISTORY)) {
                    const balStore = db.createObjectStore(STORES.BALANCE_HISTORY, { keyPath: 'id', autoIncrement: true });
                    balStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // Store 5 : Key-Value Store de repli
                if (!db.objectStoreNames.contains(STORES.KEY_VAL)) {
                    db.createObjectStore(STORES.KEY_VAL, { keyPath: 'key' });
                }
            };

            req.onsuccess = (e) => {
                dbInstance = e.target.result;
                console.log(`[WM-IDB] ✅ Base IndexedDB connectée avec succès.`);
                resolve(dbInstance);
            };

            req.onerror = (e) => {
                console.error(`[WM-IDB] ❌ Erreur ouverture IndexedDB:`, e.target.error);
                reject(e.target.error);
            };
        });

        return dbInitPromise;
    }

    /**
     * Helpers génériques IndexedDB
     */
    async function idbGet(storeName, key) {
        const db = await openWikiMDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value ?? req.result : null);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbPut(storeName, item) {
        const db = await openWikiMDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(item);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbGetAll(storeName) {
        const db = await openWikiMDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbClear(storeName) {
        const db = await openWikiMDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbBulkPut(storeName, items) {
        if (!items || items.length === 0) return 0;
        const db = await openWikiMDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            let count = 0;
            for (const item of items) {
                store.put(item);
                count++;
            }
            tx.oncomplete = () => resolve(count);
            tx.onabort = () => {
            console.warn('[WM-IDB] idbBulkPut transaction aborted:', tx.error);
            reject(tx.error);
        };
        tx.onerror = () => {
            console.warn('[WM-IDB] idbBulkPut transaction error:', tx.error);
            reject(tx.error);
        };
        });
    }

    // ============================================================
    // MIGRATION AUTOMATIQUE DU LOCALSTORAGE VERS INDEXEDDB
    // ============================================================
    async function migrateLocalStorageToIndexedDB() {
        const MIGRATION_DONE_KEY = 'wm_idb_migration_done_v1';
        if (localStorage.getItem(MIGRATION_DONE_KEY) === 'true') {
            return;
        }

        console.log('[WM-IDB] 🚚 Début de la migration automatique du localStorage vers IndexedDB...');

        try {
            await openWikiMDatabase();

            // 1. Migration des Prix (wmPriceData et wmPriceTs)
            const rawPrices = localStorage.getItem('wmPriceData');
            const rawTs = localStorage.getItem('wmPriceTs');
            if (rawPrices) {
                try {
                    const priceObj = JSON.parse(rawPrices);
                    const tsObj = rawTs ? JSON.parse(rawTs) : {};
                    const priceItems = [];
                    for (const [key, val] of Object.entries(priceObj)) {
                        priceItems.push({
                            key: key,
                            value: val,
                            timestamp: tsObj[key] || Date.now()
                        });
                    }
                    if (priceItems.length > 0) {
                        const count = await idbBulkPut(STORES.PRICES, priceItems);
                        console.log(`[WM-IDB] 💰 ${count} prix migrés vers IndexedDB.`);
                    }
                } catch (e) {
                    console.warn('[WM-IDB] Erreur migration prix:', e);
                }
            }

            // 2. Migration de la Collection locale (wmCollectionCache)
            const rawCol = localStorage.getItem('wmCollectionCache');
            if (rawCol) {
                try {
                    const colObj = JSON.parse(rawCol);
                    if (Array.isArray(colObj.cards) && colObj.cards.length > 0) {
                        const colItems = colObj.cards.map(c => {
                            const [id, card_id, title, rarity, category, atk, def, is_shiny, obtainIndex] = c;
                            return {
                                id: String(id || card_id),
                                card_id: String(card_id),
                                title: String(title),
                                rarity: String(rarity || 'C'),
                                category: category || '',
                                atk: atk ?? null,
                                def: def ?? null,
                                is_shiny: Boolean(is_shiny),
                                obtainIndex: obtainIndex ?? 0,
                                raw: c
                            };
                        });
                        const count = await idbBulkPut(STORES.COLLECTION, colItems);
                        console.log(`[WM-IDB] 🎴 ${count} cartes de collection migrées vers IndexedDB.`);
                    }
                } catch (e) {
                    console.warn('[WM-IDB] Erreur migration collection:', e);
                }
            }

            // 3. Migration de l'historique du solde WB (wmBalanceHistory)
            const rawBal = localStorage.getItem('wmBalanceHistory');
            if (rawBal) {
                try {
                    const balArr = JSON.parse(rawBal);
                    if (Array.isArray(balArr) && balArr.length > 0) {
                        await idbBulkPut(STORES.BALANCE_HISTORY, balArr);
                        console.log(`[WM-IDB] 🪙 ${balArr.length} entrées d'historique solde migrées.`);
                    }
                } catch (e) {}
            }

            // Marquer la migration comme terminée
            localStorage.setItem(MIGRATION_DONE_KEY, 'true');
            console.log('[WM-IDB] ✅ Migration localStorage -> IndexedDB terminée avec succès !');
        } catch (err) {
            console.error('[WM-IDB] ❌ Échec de la migration :', err);
        }
    }

    // Lancer la migration dès le chargement
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', migrateLocalStorageToIndexedDB);
    } else {
        migrateLocalStorageToIndexedDB();
    }

    // Exports robustes (contexte sandbox + contexte page unsafeWindow)
    const dbObj = {
        open: openWikiMDatabase,
        get: idbGet,
        put: idbPut,
        getAll: idbGetAll,
        bulkPut: idbBulkPut,
        clear: idbClear,
        stores: STORES,
        migrate: migrateLocalStorageToIndexedDB
    };
    window.wmIDB = dbObj;
    WikiM.IDB = dbObj;
    if (typeof unsafeWindow !== 'undefined') unsafeWindow.wmIDB = dbObj;

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window, window.WikiM = window.WikiM || {});
