# Échecs — contre Stockfish

Application d'échecs jouable dans le navigateur, avec Stockfish comme adversaire
(WASM, exécuté dans un Web Worker via le protocole UCI), 4 niveaux de difficulté,
et l'identité visuelle du prototype d'origine (`echecs.html`).

## Lancer le projet

```bash
npm install
npm run dev
```

Puis ouvrir l'URL indiquée par Vite (en général `http://localhost:5173`).

`npm install` télécharge normalement le paquet `stockfish` (npm sait faire
ça très bien, même si le *postinstall propre à ce paquet* est bloqué par ta
politique de sécurité npm — voir plus bas). Ensuite, notre propre script
`scripts/fetch-engine.mjs` (hook `postinstall` du *projet*, pas du paquet) va
chercher, **récursivement dans `node_modules/stockfish/`**, les fichiers de
la variante mono-thread légère (`*lite-single*`, ~7 Mo), et les copie dans
`public/engine/`. Cette recherche récursive évite de dépendre d'un chemin de
fichier exact, qui a changé selon les versions du paquet.

Si tu vois une erreur de chargement du moteur dans l'interface, relance ce
script à la main :

```bash
npm run fetch-engine
```

> Pourquoi pas laisser le paquet npm `stockfish` s'installer normalement,
> postinstall compris ? Certaines politiques de sécurité npm (fonctionnalité
> `allow-scripts`) bloquent par défaut les scripts d'installation des
> *dépendances* — c'est volontaire et sain. `fetch-engine.mjs` est le script
> du projet lui-même (pas d'une dépendance), donc il s'exécute normalement,
> sans rien à approuver manuellement — et comme les fichiers du moteur sont
> déjà livrés avec le paquet téléchargé (npm les a bien récupérés), il n'y a
> en fait rien besoin de "postinstaller" : il suffit de les trouver et de les
> copier au bon endroit, ce que fait ce script.

## Structure

```
echecs-app/
├── index.html            # squelette de page, panneaux (niveaux, couleur, statut, historique)
├── package.json
├── scripts/
│   └── fetch-engine.mjs  # localise et copie les binaires Stockfish depuis node_modules vers public/engine/
├── public/
│   └── engine/           # généré automatiquement, non versionné (.wasm ~7 Mo)
└── src/
    ├── main.js           # orchestration : état de la partie, UI, communication avec le moteur
    ├── board.js           # rendu de l'échiquier (DOM), indépendant de la logique de jeu
    ├── engine.js           # dialogue UCI avec le Worker Stockfish (uci/isready/go/bestmove)
    └── styles.css         # identité visuelle reprise du prototype (bois/vert, or, Fraunces+Inter)
```

## Choix techniques

- **chess.js** (règles complètes : roque, prise en passant, promotion, échec,
  mat, pat, nulle par répétition) — API v1 (camelCase : `isGameOver()`,
  `isCheckmate()`, `inCheck()`, etc.)
- **Stockfish**, variante `lite-single` (paquet npm `stockfish`, par nmrugg —
  la même base que Chess.com) : mono-thread, ~7 Mo, ne nécessite **aucun
  en-tête CORS/COOP/COEP** particulier. C'est le fallback simple mentionné
  dans le brief plutôt que la version multi-thread (qui exige
  `SharedArrayBuffer` et donc `Cross-Origin-Embedder-Policy: require-corp` /
  `Cross-Origin-Opener-Policy: same-origin` sur le serveur — voir
  `scripts/fetch-engine.mjs` si tu veux basculer dessus en ajustant
  `NAME_PATTERN`).
- **Niveaux** mappés sur `UCI_LimitStrength` + `UCI_Elo` (800 / 1300 / 1800 Elo)
  et `Skill Level` (0 / 5 / 12 / 20) en complément, pour mieux dégrader le jeu
  aux niveaux faibles où Stockfish reste souvent trop fort même avec un Elo
  bas. Le niveau "Expert" désactive `UCI_LimitStrength` (force maximale).
- Le worker parle UCI en texte brut (`position fen ...`, `go movetime ...`,
  parsing de `bestmove ...`) — pas de dépendance JS supplémentaire pour ça.

## Ce qui est implémenté

- Plateau interactif au clic, avec surbrillance des coups légaux
- Roque, prise en passant, promotion (auto-dame — pas de sélecteur de pièce,
  simplification assumée), échec/mat/pat/nulle par répétition
- Stockfish dans un Web Worker, 4 niveaux réglables
- Choix de la couleur (blancs ou noirs — l'échiquier s'oriente en conséquence)
- Indicateurs de tour, d'échec, de fin de partie
- Historique des coups en notation algébrique
- Annuler (undo) — annule votre dernier coup (et la réponse de Stockfish le
  cas échéant)
- Nouvelle partie

## Non implémenté (pistes pour la suite, cf. "nice-to-have" du brief)

- Horloge/minuteur
- Sauvegarde de partie (localStorage / export PGN)
- Affichage de l'évaluation Stockfish après coup
- Sélecteur de pièce à la promotion (actuellement : dame automatique)
- Drag-and-drop (le clic seul est implémenté — le brief acceptait l'un ou l'autre)
- Son sur les coups/captures/échec

## ⚠️ Historique de mise au point (utile si un souci réapparaît)

Ce projet a d'abord été écrit sans que je puisse le tester (pas d'accès
réseau dans l'environnement où je l'ai généré). Plusieurs ajustements ont
été nécessaires après des essais réels :

1. Le fichier moteur n'est pas où on pourrait s'y attendre : dans la version
   du paquet npm `stockfish` installée, les fichiers `*lite-single*` se
   trouvent dans `node_modules/stockfish/bin/`. `scripts/fetch-engine.mjs`
   les cherche donc **récursivement** dans tout `node_modules/stockfish/`
   plutôt que de figer un chemin — si jamais ça change encore un jour, le
   script continuera à les trouver.
2. Le fichier moteur n'expose **pas** de fonction globale `Stockfish()`
   façon "usine" (contrairement à ce que documente le README du paquet npm
   pour d'autres cas d'usage) : il utilise le format historique de
   Stockfish.js, où le fichier moteur sert **directement de script de
   Worker** et où on lui parle en UCI texte brut
   (`new Worker('stockfish.js'); worker.postMessage('uci')`). C'est ce que
   fait `src/engine.js`.
3. Si un souci apparaît encore, la console du navigateur (F12) et le
   panneau "Partie" affichent des messages `[stockfish] ...` assez précis
   pour savoir où ça bloque. Montre-les-moi et je corrige directement.
