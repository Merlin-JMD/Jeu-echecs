import { defineConfig } from 'vite';

// GitHub Pages héberge ce projet sous https://merlin-jmd.github.io/Jeu-echecs/
// (pas à la racine du domaine), donc Vite doit préfixer tous les chemins
// générés (JS, CSS, etc.) avec /Jeu-echecs/ pour que le site fonctionne une
// fois déployé. En local (npm run dev), Vite ignore ce préfixe et sert
// toujours depuis la racine — aucun changement pour le développement.
export default defineConfig({
  base: '/Jeu-echecs/',
});