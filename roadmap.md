# Roadmap & Suivi des Modifications WikiM

## Règles et Méthodologie de Validation

### Classification des statuts
- **[Vérifié auto]** : Validé par script automatisé (PowerShell / regex / analyse statique locale).
- **[Analyse de code]** : Validé par lecture structurelle et logique du code (scope, fermetures, flux).
- **[À tester navigateur]** : Nécessite une exécution réelle dans Tampermonkey sur wiki-masters.com.
- **[Non vérifié]** : Non audité ou en attente d'implémentation.

*Note d'environnement : Node.js n'étant pas installé sur le poste hôte, l'automatisation locale repose sur des scripts PowerShell pour l'analyse statique des fichiers JS.*

---

## 1. Checklist des Tâches par Priorité

### P0 — Crashs et Bugs Bloquants

| ID | Fichier(s) | Problème & Cause | Modification prévue | Dépend de | Type de validation | Statut actuel |
| **T01** | `main.js:75` | `observer.observe(document.body)` exécuté à `@run-at document-start` où `document.body` est `null` (crash fatal). | Attendre `DOMContentLoaded` ou polling `waitForBody()` avant `observe()`. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 2A)** |
| **T02** | `trades.js:230-753` | 10 fonctions internes enfermées dans `initSmartTradesUI()` : exportées trop tard/hors de portée lexicale. | Déplacer les exports à l'intérieur de `initSmartTradesUI()` ou remonter les fonctions au niveau module. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 3A)** |
| **T03** | `ui.js:495` | `window.renderSmartTradesList()` appelé mais non exporté (conséquence de T02). | Sécuriser avec un guard `typeof` et export depuis `trades.js`. | T02 | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 3A)** |
| **T04** | `ui.js:233, 471` | `repositionPanel` et `renderPatchNotes` définis dans `createControlPanel()` : exports en fin de fichier inopérants. | Déplacer les exports `window.* = ...` à l'intérieur de `createControlPanel()`. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 3B)** |
| **T05** | `tags.js:243, 558` | `renderTagGroups` et `updateModeHint` définis dans des sous-fonctions : exports en fin de module inopérants. | Déplacer les exports dans les fonctions parentes respectives. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 3C)** |
| **T06** | `state.js` | `window.wmTags` non initialisé comme objet (`{}`) ; provoque des `TypeError` lors du fetch/mapping tags. | Ajouter `window.wmTags = {};` dans `state.js`. | — | [Vérifié auto] | **Implémenté (Lot 2B)** |
| **T07** | `collection.js:724-725`, `shortcuts.js:86-99` | `wmCurrentCardIndex` et `wmCurrentCardTitle` déclarés avec `let` local, non exposés sur `window`. Flèches clavier inopérantes. | Remplacer par `window.wmCurrentCardIndex` et `window.wmCurrentCardTitle`. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 2C)** |
| **T08** | `sniper.js:475`, `main.js:86` | `lastTrackBtnAuctionId` est un `let` local dans `sniper.js`, `main.js` écrit sur `window.lastTrackBtnAuctionId` (désynchronisation). | Harmoniser sur `window.lastTrackBtnAuctionId` dans `sniper.js`. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 2C)** |

---

### P1 — Bugs Fonctionnels et Architecture

| ID | Fichier(s) | Problème & Cause | Modification prévue | Dépend de | Type de validation | Statut actuel |
|---|---|---|---|---|---|---|
| **T09** | `network.js:13-18`, `trades.js:733-734` | Double stockage auth : `W.wmAuth` (unsafeWindow) vs `window.wmAuth` (sandbox). Trades envoie des requêtes potentiellement non authentifiées. | Aligner `trades.js` et `network.js` sur `window.wmAuth` (ou synchroniser `W.wmAuth = window.wmAuth`). | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 4C)** |
| **T10** | `network.js:88`, `main.js:123` | `W.wmDebug` initialisé dans `network.js` (`getAuth`, `getUserId`) puis écrasé brutalement dans `main.js:123`. | Fusionner avec `Object.assign(W.wmDebug, { ... })` ou spread operator. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 4B)** |
| **T11** | `prices.js:104` | `typeof originalFetch !== 'undefined' ? originalFetch : fetch` : `originalFetch` est un `const` non exporté de `network.js`. | Utiliser directement `fetch` ou exporter `originalFetch` sur `window`. | — | [Vérifié auto] | **Implémenté (Lot 5A)** |
| **T12** | `main.js:25-51` | Bloc `card.dataset.wmUuid` et `fetchPricesBackground` dupliqué dans la boucle MutationObserver. | Supprimer le bloc dupliqué et simplifier la condition multi-comptes. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 4A)** |
| **T13** | `balance.js:168`, `tags.js:380` | `renderBalanceUI()` écrase l'élément `#wm-cache-fill-btn` via `innerHTML`, détruisant l'event listener attaché par `tags.js`. | Réattacher le listener après re-render ou utiliser la délégation d'événements sur le conteneur parent. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (Lot 5B)** |
| **T14** | `tags.js:391` | `if (typeof renderCacheInfo === 'function') renderCacheInfo()` : fonction inexistante dans tous les fichiers. | Supprimer l'instruction (code mort). | — | [Vérifié auto] | **Implémenté (Lot 5A)** |
| **T15** | `collection.js:452` | Suspicion d'appel nu à `getTagGroups()`. | Vérifié par script : n'existe pas dans `collection.js`. | — | [Vérifié auto] | **Résolu / Non applicable** |
| **T16** | `collection.js:755, 835, 838` | Suspicion de références nues à `extractTokenFromCookies`, `recordBalance`, `showWMToast`. | Vérifié par script : n'existent pas dans `collection.js`. | — | [Vérifié auto] | **Résolu / Non applicable** |

---

### P2 — Robustesse, Performance, Maintenabilité

| ID | Fichier(s) | Problème & Cause | Modification prévue | Dépend de | Type de validation | Statut actuel |
|---|---|---|---|---|---|---|
| **T17** | `styles.js:11` | Fallback `(document.head \|\| document.documentElement)` exécuté à `document-start` : risque d'élément racine non prêt. | Ajouter un guard / écoute `DOMContentLoaded` pour le fallback DOM. | — | [Vérifié auto] | **Implémenté (Lot 5C)** |
| **T18** | Tous `src/*.js` | Exports conditionnels `if (typeof x !== 'undefined')` verbeux et masquant les erreurs de portée. | Simplifier en assignations directes `window.x = window.WikiM.x = x;` une fois les scopes corrigés. | T02, T04, T05 | [Vérifié auto] | **Implémenté (Lot 6)** |
| **T19** | `utils.js`, `sniper.js` | Dépendance d'ordre : `utils.js` appelle `getBulkList` (défini plus tard dans `sniper.js`). Fonctionne car différé. | Conserver l'appel lazy `window.getBulkList()` et documenter la dépendance. | — | [Analyse de code] | Documenté |
| **T20** | `main.js:81-103` | Polling SPA toutes les 500ms via `setInterval` sur `location.pathname`. | Maintenir le polling fonctionnel, documenter l'absence de hook History natif. | — | [Analyse de code] | Documenté |
| **T21** | `Tamper.user.js` | Absence de versionnage / risque de cache CDN asynchrone des modules. | Intégrer un paramètre de version/build unifié dans la requête de module. | — | [À tester navigateur] | Optionnel |
| **T22** | `ui.js:19-500` | Fonction monolithique `createControlPanel()` (> 450 lignes). | Découper en sous-modules de rendu par onglet (après sécurisation P0/P1). | P0, P1 | [À tester navigateur] | Reporté |
| **T27** | `network.js`, `collection.js`, `utils.js`, `ui.js`, `state.js` | Bulk Delete : capture automatique des IDs physiques `user_card_id` depuis `owned_copies` à l'ouverture des packs et affichage dans la liste. | Enregistrer dans `window.wmCardIdToUserCardId`, formater les items du bulk en `{ title, user_card_id }` et mettre à jour le patch notes (v2.2.1). | — | [Vérifié auto] + [À tester navigateur] | **Implémenté (v2.2.1)** |
| **T28** | `shortcuts.js` | Raccourcis `I` et `O` : clic Bulk manqué si le bouton/carte n'a pas fini de charger. | Introduire un polling d'attente actif (`clickBulkWithRetry`) jusqu'à 1500ms avec déclenchement direct de l'injection si absent. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté** |
| **T29** | `shortcuts.js`, `collection.js` | Modal de carte : absence de fermeture sur la touche Échap. | Gérer la touche Escape dans `shortcuts.js` et étendre `closeCardModal` avec recherche du bouton `[aria-label="Fermer"]`. | — | [Vérifié auto] + [À tester navigateur] | **Implémenté** |

---

### P3 — Évolution, UX et Nouvelles Fonctionnalités

| ID | Fichier(s) | Problème & Objectif | Modification prévue | Dépend de | Type de validation | Statut actuel |
|---|---|---|---|---|---|---|
| **T30** | `collection.js`, `ui.js`, `main.js` | Bouton "Afficher mon Bulk" (`injectBulkButtonInCollection`) et défausse page (`wm-bulk-page-btn`) présents dans le monolithe mais absents des modules `src/`. | Porter `injectBulkButtonInCollection`, le bouton dans l'onglet Bulk et la logique de défausse page avec cycle SPA. | — | [Vérifié auto] + [À tester navigateur] | **En cours (Lot A)** |
| **T31** | `state.js`, `main.js` | Absence de versioning du stockage `localStorage` risquant des désynchronisations de structure. | Déclarer `WM_STORAGE_SCHEMA_VERSION`, vérifier et migrer/valider les schémas au démarrage. | — | [Vérifié auto] | **En cours (Lot A)** |
| **T32** | `ui.js`, `collection.js` | Absence de feedback visuel (progression/compteur) lors des opérations longues (scan prix, bulk delete global). | Intégrer un indicateur de statut textuel / barre de progression dynamique. | T30 | [À tester navigateur] | À faire (Lot B) |
| **T33** | `ui.js`, `utils.js` | Liste Bulk brute sans tri ni comptage par rareté. | Ajouter tri par nom/rareté et compteur agrégé dans l'en-tête de l'onglet Bulk. | — | [Vérifié auto] + [À tester navigateur] | À faire (Lot B) |
| **T34** | `main.js` | Observer DOM et polling SPA déclenchant des vérifications répétitives sans filtre sur mutations. | Ajouter un debounce et filtrer selon le chemin actif (`pathname`). | — | [Vérifié auto] + [À tester navigateur] | À faire (Lot C) |
| **T35** | `sniper.js`, `ui.js` | Saisie d'une carte dans le sniper sans aperçu immédiat de la cote marché en cache. | Afficher le prix issu de `wmPrices` avec son horodatage si disponible. | — | [Vérifié auto] + [À tester navigateur] | À faire (Lot C) |
| **T36** | `prices.js` | Balayage séquentiel de l'historique de prix (`runPriceScan`) lent sur grandes collections. | Introduire un pool de promesses concurrentes limité (concurrency: 3) avec pause anti-rate-limit. | — | [À tester navigateur] | À faire (Lot D) |
| **T37** | `ui.js`, `sniper.js`, `tags.js` | Pas de sauvegarde unifiée des réglages, tags, routines et listes pour export/import. | Ajouter bouton Export/Import JSON dans l'onglet Préférences avec validation de schéma. | T31 | [À tester navigateur] | À faire (Lot E) |

---

### P4 — Nettoyage et Documentation

| ID | Fichier(s) | Problème | Modification prévue | Statut actuel |
|---|---|---|---|---|
| **T23** | Tous | Commentaires hétérogènes (anglais/français). | Harmoniser en français technique. | **Complété** |
| **T24** | Tous | Conventions de nommage hétérogènes (`WM_*`, `wm*`, `camelCase`). | Formaliser les conventions dans la documentation. | **Complété (README.md)** |
| **T25** | `README.md` | Absence de documentation des dépendances et de l'ordre d'injection. | Ajouter le graphe des modules et l'ordre d'exécution. | **Complété (README.md)** |
| **T26** | `main.js`, `ui.js` | Manque de JSDoc sur les APIs publiques (`window.wmDebug`, etc.). | Ajouter les annotations de types et de signatures. | **Complété (main.js)** |

---

## 2. Cahier de Recette : Tests Manuels Regroupés par Fonctionnalité

*À réaliser dans le navigateur sur wiki-masters.com lors de la validation des lots correspondants.*

### Groupe A : Démarrage & Initialisation globale (T01, T06, T10, T17, T31)
- **Action** : Charger la page d'accueil ou `/pulls` avec la console DevTools ouverte.
- **Résultat attendu** :
  1. `[WikiM Loader] ✅ Tous les 13 modules ont été chargés avec succès !`
  2. Aucun `TypeError: Cannot read properties of null (reading 'observe')`.
  3. `window.wmTags` est un objet `{}`.
  4. `W.wmDebug.getAuth()` et `W.wmDebug.prices` sont tous deux définis et appelables en console.
  5. Le schéma de stockage local est vérifié avec `wmStorageVersion`.
- **Régression à surveiller** : Blocage du chargement de la page hôte ou styles non appliqués au rendu initial.

### Groupe B : Interface & Panneau de Contrôle (T04, T13, T22, T32, T33)
- **Action** : Cliquer sur l'engrenage flottant WikiM en bas à gauche, naviguer dans les onglets, puis déplacer le panneau (drag-and-drop).
- **Résultat attendu** :
  1. Le panneau s'ouvre sans erreur console.
  2. L'onglet Patch Notes affiche l'historique des versions.
  3. Le panneau mémorise son nouvel emplacement après relâchement.
  4. Le bouton « Remplir la page » (cache) reste cliquable même après actualisation du solde WB.
- **Régression à surveiller** : Perte de position du panneau lors d'un resize ou blocage du drag.

### Groupe C : Collection & Navigation de Cartes (T07, T12, T30)
- **Action** : Se rendre sur la page Collection (`/collection`), vérifier le bouton « 🗑️ Afficher mon Bulk », ouvrir une carte en vue modale, puis appuyer sur les touches Flèche Gauche, Flèche Droite et Échap.
- **Résultat attendu** :
  1. Le bouton « 🗑️ Afficher mon Bulk » s'injecte à côté de « Sélectionner » et commute la vue `[WM-BULK]`.
  2. La modale passe immédiatement à la carte précédente/suivante sans `ReferenceError`.
  3. La modale se ferme sur Échap.
  4. Les badges multi-comptes et prix s'affichent sans double requête réseau visible dans DevTools (Network).
- **Régression à surveiller** : Conflit avec la saisie dans un champ texte (input/textarea) ou défilement de page non désiré.

### Groupe D : Tags & Règles Automatiques (T05, T14)
- **Action** : Ouvrir l'onglet Tags du panneau de contrôle, visualiser les groupes de règles et tester le bouton d'export/création.
- **Résultat attendu** :
  1. Les groupes de tags s'affichent correctement.
  2. L'indication de mode (page actuelle / complet) se met à jour sans erreur.
- **Régression à surveiller** : Erreurs lors de la sauvegarde dans le `localStorage`.

### Groupe E : Sniper & Marketplace (T08, T11, T35)
- **Action** : Consulter une enchère sur `/marketplace/[id]`, cliquer sur "Suivre", puis naviguer vers une autre enchère.
- **Résultat attendu** :
  1. Le bouton "Suivre" s'adapte à l'enchère courante sans conserver l'état de la précédente.
  2. Le panneau sniper spécifique à l'enchère est injecté avec les données à jour.
- **Régression à surveiller** : Fuite de timers de compte à rebours après navigation.

### Groupe F : Smart Trades (T02, T03, T09)
- **Action** : Ouvrir l'onglet Smart Trades dans le panneau de contrôle.
- **Résultat attendu** :
  1. La liste des routines s'affiche (`renderSmartTradesList` fonctionne).
  2. Les requêtes partent avec les en-têtes d'authentification valides (`apikey` + `Authorization`).
- **Régression à surveiller** : Erreur HTTP 401 / 403 lors des appels API.

---

## 3. Découpage d'Exécution par Lots Courts

```
[x] [Lot 2A] T01       (main.js - guard document.body) [Vérifié auto]
[x] [Lot 2B] T06       (state.js - init window.wmTags) [Vérifié auto]
[x] [Lot 2C] T07 + T08 (collection.js, sniper.js - variables d'état globales) [Vérifié auto]
[x] [Lot 3A] T02 + T03 (trades.js, ui.js - exports smart trades) [Vérifié auto]
[x] [Lot 3B] T04       (ui.js - exports repositionPanel & patchNotes) [Vérifié auto]
[x] [Lot 3C] T05       (tags.js - exports renderTagGroups & updateModeHint) [Vérifié auto]
[x] [Lot 4A] T12       (main.js - déduplication observer) [Vérifié auto]
[x] [Lot 4B] T10       (main.js - préservation wmDebug) [Vérifié auto]
[x] [Lot 4C] T09       (trades.js / network.js - alignement auth) [Vérifié auto]
[x] [Lot 5A] T11 + T14 (prices.js, tags.js - suppression code mort confirmé) [Vérifié auto]
[x] [Lot 5B] T13       (balance.js, tags.js - gestion du listener cache fill) [Vérifié auto]
[x] [Lot 5C] T17       (styles.js - guard fallback DOM) [Vérifié auto]
[x] [Lot 6]  T18       (Tous - rationalisation des exports direct window) [Vérifié auto]
[x] [Lot 7]  T23 à T26 (Documentation, README et JSDoc) [Complété]
[x] [v2.2.1] T27, T28, T29 (Capture user_card_id, raccourcis I/O robustes, fermeture Escape) [Vérifié auto]

--- NOUVELLE PHASE : ÉVOLUTION ET OPTIMISATION ---
[x] [Lot A]  T30 + T31 (Port injectBulkButtonInCollection + Versioning cache) [Vérifié auto]
[x] [Lot AT] T38       (AutoTag instantané : interception collection, React Fiber, cache tags 0-fetch, pack direct) [Vérifié auto]
[x] [Lot ST] T39       (Monitoring LocalStorage : calcul d'occupation, alerte persistante à 80% fermable manuellement) [Vérifié auto]
[ ] [Lot B]  T32 + T33 (Feedback visuel opérations + Tri & compteurs bulk) [En cours]
[ ] [Lot C]  T34 + T35 (Debounce SPA/Observer + Suggestion prix sniper)
[ ] [Lot D]  T36       (Parallélisation contrôlée scan de prix)
[ ] [Lot E]  T37       (Export / Import global configuration)
```
