// Prépare les fichiers du moteur Stockfish dans public/engine/, pour que le
// Web Worker (src/ai-worker.js) les charge via importScripts('/engine/...').
//
// Pourquoi ce script plutôt que de laisser le paquet npm "stockfish" faire
// son propre travail ? Ce paquet a un script "postinstall" (qui prépare/
// assemble ses fichiers), et certaines politiques de sécurité npm
// (fonctionnalité "allow-scripts") bloquent par défaut les scripts
// d'installation des DÉPENDANCES — volontairement, par sécurité. Ce script-ci
// est celui du PROJET lui-même (déclaré dans notre propre package.json), donc
// il s'exécute normalement, sans rien à approuver manuellement.
//
// Stratégie, dans l'ordre :
//   1. "stockfish" est une dépendance normale du projet : npm l'a donc déjà
//      téléchargé dans node_modules/stockfish/, avec le paquet complet
//      (~250 Mo toutes variantes confondues), même si SON postinstall n'a
//      pas tourné. On cherche donc directement dedans, récursivement,
//      plutôt que de supposer un chemin fixe (bin/ vs src/, qui a changé
//      selon les versions du paquet).
//   2. Si le moteur est livré en plusieurs morceaux ("...-part-0.wasm",
//      "...-part-1.wasm", etc. — cas des très gros fichiers), on les
//      réassemble dans l'ordre.
//   3. En dernier recours seulement (si rien n'est trouvé dans
//      node_modules), on tente un téléchargement direct depuis le dépôt
//      GitHub du projet, à la version exacte installée.

import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const STOCKFISH_DIR = path.join(root, 'node_modules', 'stockfish');
const DEST_DIR = path.join(root, 'public', 'engine');

const DEST_BASENAME = 'stockfish-18-lite-single';
// On cherche des fichiers dont le nom contient "lite" ET "single" (variante
// mono-thread légère, ~7 Mo, sans en-têtes CORS particuliers) — plutôt que
// de figer un nom de fichier exact, qui a changé d'une version à l'autre.
const NAME_PATTERN = /lite.*single/i;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

function findInNodeModules() {
  if (!existsSync(STOCKFISH_DIR)) return null;

  const allFiles = [];
  walk(STOCKFISH_DIR, allFiles);

  const jsFile = allFiles.find((f) => NAME_PATTERN.test(path.basename(f)) && f.endsWith('.js'));
  const wasmFile = allFiles.find(
    (f) => NAME_PATTERN.test(path.basename(f)) && f.endsWith('.wasm') && !/-part-\d+\.wasm$/i.test(f)
  );
  const wasmParts = allFiles
    .filter((f) => NAME_PATTERN.test(path.basename(f)) && /-part-\d+\.wasm$/i.test(f))
    .sort();

  if (jsFile && (wasmFile || wasmParts.length)) {
    return { jsFile, wasmFile, wasmParts };
  }
  return null;
}

async function fetchFallback() {
  let version = '18.0.8';
  const pkgPath = path.join(STOCKFISH_DIR, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      version = JSON.parse(readFileSync(pkgPath, 'utf8')).version || version;
    } catch {
      // tant pis, on garde la valeur par défaut
    }
  }

  const candidates = [
    `https://raw.githubusercontent.com/nmrugg/stockfish.js/v${version}/src/${DEST_BASENAME}.js`,
    `https://raw.githubusercontent.com/nmrugg/stockfish.js/v${version}/bin/${DEST_BASENAME}.js`
  ];

  console.warn('[fetch-engine] Rien trouvé dans node_modules/stockfish — tentative de repli en ligne…');
  console.warn('[fetch-engine] Ce repli est best-effort ; s\'il échoue, une installation manuelle sera nécessaire.');

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[fetch-engine] Trouvé via ${url} — mais le .wasm associé doit être récupéré manuellement.`);
        console.log('[fetch-engine] Voir le README, section "À vérifier au premier lancement".');
        return;
      }
    } catch {
      // on essaie le candidat suivant
    }
  }

  console.error('[fetch-engine] ÉCHEC : impossible de localiser les fichiers du moteur automatiquement.');
  console.error('[fetch-engine] Solution manuelle : va sur https://github.com/nmrugg/stockfish.js/releases');
  console.error(`[fetch-engine] télécharge la release correspondant à la version ${version} du paquet "stockfish",`);
  console.error(`[fetch-engine] et place les fichiers "*lite-single*" (.js et .wasm) dans :`);
  console.error(`[fetch-engine]   ${path.join('public', 'engine')}`);
  console.error(`[fetch-engine] en les renommant "${DEST_BASENAME}.js" et "${DEST_BASENAME}.wasm".`);
}

async function main() {
  if (!existsSync(DEST_DIR)) mkdirSync(DEST_DIR, { recursive: true });

  const destJs = path.join(DEST_DIR, `${DEST_BASENAME}.js`);
  const destWasm = path.join(DEST_DIR, `${DEST_BASENAME}.wasm`);

  if (existsSync(destJs) && existsSync(destWasm)) {
    console.log('[fetch-engine] Fichiers du moteur déjà présents dans public/engine/, rien à faire.');
    return;
  }

  const found = findInNodeModules();

  if (!found) {
    console.warn(
      `[fetch-engine] Aucun fichier "*lite-single*" trouvé dans ${path.relative(root, STOCKFISH_DIR)}. ` +
      'Le paquet "stockfish" a-t-il bien été installé (voir "added N packages" au-dessus) ?'
    );
    await fetchFallback();
    return;
  }

  copyFileSync(found.jsFile, destJs);
  console.log(`[fetch-engine] Copié : ${path.relative(root, found.jsFile)} -> public/engine/${DEST_BASENAME}.js`);

  if (found.wasmFile) {
    copyFileSync(found.wasmFile, destWasm);
    console.log(`[fetch-engine] Copié : ${path.relative(root, found.wasmFile)} -> public/engine/${DEST_BASENAME}.wasm`);
  } else if (found.wasmParts.length) {
    const buffers = found.wasmParts.map((p) => readFileSync(p));
    writeFileSync(destWasm, Buffer.concat(buffers));
    console.log(
      `[fetch-engine] Réassemblé ${found.wasmParts.length} fragment(s) -> public/engine/${DEST_BASENAME}.wasm`
    );
  }

  console.log('[fetch-engine] Terminé.');
}

main();
