// ==UserScript==
// @name         WikiM - Loader Dynamique
// @namespace    https://github.com/Askaat/wikiM
// @version      2.2.0
// @description  Chargeur modulaire et dynamique pour WikiM (Wiki-Masters Tools)
// @author       Askaat
// @match        *://*.wiki-masters.com/*
// @match        *://wiki-masters.com/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Askaat/wikiM/main/';
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

    console.log('[WikiM Loader] Initialisation du chargement des modules...');

    function fetchModule(path) {
        return new Promise((resolve, reject) => {
            const url = `${GITHUB_RAW_BASE}${path}?_t=${Date.now()}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                nocache: true,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error(`HTTP ${res.status} sur ${path}`));
                    }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error(`Timeout sur ${path}`))
            });
        });
    }

    async function loadAllModules() {
        try {
            for (const mod of MODULES) {
                const code = await fetchModule(mod);
                // Exécution dans le contexte du userscript (accès GM_xmlhttpRequest & unsafeWindow)
                (0, eval)(code);
                console.log(`[WikiM Loader] ✓ ${mod}`);
            }
            console.log('[WikiM Loader] ✅ Tous les modules ont été chargés avec succès !');
        } catch (err) {
            console.error('[WikiM Loader] ❌ Erreur lors du chargement des modules:', err);
        }
    }

    loadAllModules();
})();
