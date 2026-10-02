// ==UserScript==
// @name         Wiki-Masters - GITHUB
// @namespace    http://tampermonkey.net/
// @version      11.1
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
// @connect      127.0.0.1
// ==/UserScript==

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION DU CHARGEUR
    // ============================================================
    // Passer IS_LOCAL_DEV à true pour charger les fichiers depuis votre PC
    // (nécessite d'exécuter start-dev.bat dans le dossier du projet)
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
            const cacheBuster = Date.now() + '_' + Math.floor(Math.random() * 10000);
            const url = `${BASE_URL}${modPath}?t=${cacheBuster}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                nocache: true,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                onload: function(res) {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error(`HTTP ${res.status} ${res.statusText} sur ${modPath}`));
                    }
                },
                onerror: function(err) {
                    reject(new Error(`Erreur réseau sur ${modPath}`));
                },
                ontimeout: function() {
                    reject(new Error(`Timeout sur ${modPath}`));
                }
            });
        });
    }

    async function loadAllModules() {
        for (const mod of MODULES) {
            try {
                console.log(`[WikiM Loader] ⏳ Chargement de ${mod}...`);
                const code = await fetchModule(mod);
                const fn = new Function('GM_xmlhttpRequest', 'GM_addStyle', 'unsafeWindow', code);
                fn(
                    typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : null,
                    typeof GM_addStyle !== 'undefined' ? GM_addStyle : null,
                    typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
                );
                console.log(`[WikiM Loader] ✓ ${mod}`);
            } catch (err) {
                console.error(`[WikiM Loader] ❌ Erreur sur ${mod}:`, err);
                return;
            }
        }
        console.log('[WikiM Loader] ✅ Tous les 13 modules ont été chargés avec succès !');
    }

    loadAllModules();
})();