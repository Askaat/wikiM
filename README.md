# WikiM (Wiki-Masters Tools)

Extension / Userscript modulaire pour améliorer l'expérience sur **Wiki-Masters** (enchères, sniper, prix du marché, tags automatiques, routines de trade, solde, raccourcis).

---

## 📁 Architecture du projet

Le script est organisé en modules clairs situés dans le dossier `src/` :

| Module | Description |
|---|---|
| [`src/state.js`](src/state.js) | État global, constantes de version, patch notes, variables partagées. |
| [`src/styles.js`](src/styles.js) | Styles CSS du panneau latéral, modales, badges et toasts. |
| [`src/utils.js`](src/utils.js) | Fonctions utilitaires, toasts, sons, logs, wrapper de retry réseau. |
| [`src/network.js`](src/network.js) | Intercepteurs réseau (`fetch`, `Response.prototype.json`), capture du token Supabase, requêtes API. |
| [`src/prices.js`](src/prices.js) | Cache des prix, récupération des cours du marché, scanner de prix complet. |
| [`src/balance.js`](src/balance.js) | Suivi du solde Wikibidous, historique, calculs de rentabilité. |
| [`src/sniper.js`](src/sniper.js) | Moteur d'enchères automatiques (Sniper), alertes et rappels de fin d'enchère. |
| [`src/collection.js`](src/collection.js) | Cache de la collection, défausse rapide (bulk discard), navigation dans la modale de carte. |
| [`src/trades.js`](src/trades.js) | Routines d'échange automatiques (Smart Trades), helper d'équilibrage des échanges. |
| [`src/tags.js`](src/tags.js) | Gestionnaire d'étiquettes Supabase, moteur de règles de tag auto, scanner par lot. |
| [`src/shortcuts.js`](src/shortcuts.js) | Raccourcis clavier (`I`, `O`, `Espace`, flèches de navigation). |
| [`src/ui.js`](src/ui.js) | Panneau de contrôle latéral avec tous les onglets (Suivi, Solde, Bulk, Outils, Tags, Trade, Préfs, Patch Notes). |
| [`src/main.js`](src/main.js) | Point d'entrée de l'application, observation du DOM (`MutationObserver`), cycle de vie, initialisation. |

---

## 🚀 Installation dans Tampermonkey

1. Installez l'extension [Tampermonkey](https://www.tampermonkey.net/) sur votre navigateur.
2. Créez un nouveau script dans Tampermonkey.
3. Copiez-collez l'intégralité du contenu du fichier [`Tamper.user.js`](Tamper.user.js).
4. Enregistrez (`Ctrl+S`).
5. Rendez-vous sur [Wiki-Masters](https://www.wiki-masters.com) : le script téléchargera automatiquement les modules à jour depuis GitHub.
