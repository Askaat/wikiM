// ============================================================
// WikiM - Module: State & Constants
// ============================================================
(function() {
    'use strict';
    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    window.WikiM = window.WikiM || {};

    // Expose les APIs GM pour le debug depuis la console
    W.wmGmXhr = GM_xmlhttpRequest;

    // ============================================================
    // ÉTAT GLOBAL
    // ============================================================
    const WM_PATCH_NOTES = [
        {
            version: "2.1.7",
            date: "01/10/2026 - 23:21",
            changes: [
                "Ajout du raccourci 'O' lors de l'ouverture d'un pack (Inverse de 'I', ça retourne en arrière et coche la case bulk)\nFix du bouton espace dans un tirage qui appuyait sur continuer qd on était en plein milieu du pack\nAjout des tags ajoutés automatiquement sur les cartes (ça met du temps à load)"
            ]
        },
        {
            version: "2.1.6",
            date: "30/09/2026 - 12:30",
            changes: [
                "Ajout de groupes de règles et une fonction d'export/import"
            ]
        },
        {
            version: "2.1.5",
            date: "29/09/2026 - 15:30",
            changes: [
                "Fix des routines de trade + Ajout du tag auto lors des tirages + Fix de montant fantôme lors des tirages"
            ]
        },
        {
            version: "2.1.0",
            date: "29/09/2026 - 09:50",
            changes: [
                "Ajout des routines de trade !"
            ]
        },
        {
            version: "2.0.0",
            date: "29/09/2026 - 08:45",
            changes: [
                "Ajout de l'onglet Patch Notes avec historique.",
                "Ajout des MàJ automatique via github",
                "Ajout du changement de pages avec les flèches dans la collection (des fois ça déconne un peu)",
                "Raccourci CTRL+I transformé juste en I"
            ]
        }
    ]

    window.wmAuth = window.wmAuth || { apikey: "", token: "" };
    window.wmPrices = {};
    window.wmFetching = new Set();
    window.wmProcessedCards = new Set();
    window.wmPendingCardTitle = null;
    window.wmInventoryMap = {};
    window.wmUserId = null;
    window._wmMutating = false;

    window.wmTagScanState = {
        running: false,
        paused: false,
        cancelled: false,
        phase: 'idle',      // 'idle' | 'loading-collection' | 'computing' | 'checking' | 'applying'
        mode: 'full',       // 'full' | 'page'
        progress: { current: 0, total: 0, text: '' },
        preview: null,      // { toAdd, toRemove }
        startedAt: 0
    };

    window.WM_PATCH_NOTES = WM_PATCH_NOTES;
    window.WikiM.WM_PATCH_NOTES = WM_PATCH_NOTES;
})();
