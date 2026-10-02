// ==UserScript==
// @name         Wiki-Masters - GITHUB
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  WikiM Tools modulaire - Chargeur dynamique
// @author       Nono / Askaat
// @match        *://*.wiki-masters.com/*
// @match        *://wiki-masters.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/Askaat/wikiM/main/Tamper.user.js
// @downloadURL  https://raw.githubusercontent.com/Askaat/wikiM/main/Tamper.user.js
// @connect      raw.githubusercontent.com
// @connect      supabase.co
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION DU CHARGEUR
    // ============================================================
    // Passer IS_LOCAL_DEV à true pour charger les fichiers depuis votre PC
    // (nécessite de lancer un mini serveur local dans le dossier du projet)
    const IS_LOCAL_DEV = false;
    const LOCAL_BASE_URL = 'http://localhost:8080/';
    const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/Askaat/wikiM/main/';

    const BASE_URL = IS_LOCAL_DEV ? LOCAL_BASE_URL : GITHUB_BASE_URL;

    const MODULES = [
        'src/state.js',
        'src/styles.js',
        'src/utils.js',
        'src/network.js',
        'src/prices.js',
        'src/balance.js',
        'src/sniper.js',
        'src/collection.js',
        'src/trades.js',
        'src/tags.js',
        'src/shortcuts.js',
        'src/ui.js',
        'src/main.js'
    ];

    console.log(`[WikiM Loader] Initialisation (Mode: ${IS_LOCAL_DEV ? 'LOCAL DEV' : 'GITHUB'})...`);

    function fetchModule(modPath) {
        return new Promise((resolve, reject) => {
            const url = `${BASE_URL}${modPath}?t=${Date.now()}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                nocache: true,
                onload: function(res) {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error(`HTTP ${res.status} sur ${modPath}`));
                    }
                },
                onerror: function(err) {
                    reject(err);
                },
                ontimeout: function() {
                    reject(new Error(`Timeout sur ${modPath}`));
                }
            });
        });
    }

    async function loadAllModules() {
        try {
            for (const mod of MODULES) {
                const code = await fetchModule(mod);
                // Exécute le code dans le contexte de la page / userscript
                // avec accès à GM_xmlhttpRequest et unsafeWindow
                (0, eval)(code);
                console.log(`[WikiM Loader] ✓ ${mod}`);
            }
            console.log('[WikiM Loader] ✅ Tous les modules ont été chargés avec succès !');
        } catch (err) {
            console.error('[WikiM Loader] ❌ Erreur chargement module:', err);
        }
    }

    loadAllModules();
})();