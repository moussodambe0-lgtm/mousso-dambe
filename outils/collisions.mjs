/**
 * Les noms de classe qui existent déjà ailleurs.
 *
 *   node outils/collisions.mjs
 *
 * Pourquoi cet outil existe : le 12 octobre 2026, une liste de discussions a
 * été écrite avec une classe `.fil`, qui servait déjà au fil de l'assistante
 * dans `composants.css`. Les styles d'une page Astro sont bien portés par un
 * attribut propre à la page, mais ils ne RETIRENT pas les règles globales du
 * même nom : la règle globale `flex-direction: column` restait, et la ligne
 * s'empilait au lieu de s'aligner. Rien dans le code ne le disait, et
 * `astro check` ne voit pas les styles. Seule la capture d'écran l'a montré.
 *
 * Il sort la liste des noms de classe déclarés à la fois dans une feuille
 * globale (`src/styles/*.css`) et dans le bloc `<style>` d'une page ou d'un
 * composant. Un nom partagé n'est pas forcément un défaut : il l'est quand la
 * règle globale pose une propriété que la locale ne repose pas. L'outil le
 * dit, il ne tranche pas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RACINE, 'src');

/** Les noms de classe qu'une feuille déclare (en tête d'un sélecteur). */
function classesDeclarees(css) {
  const trouvees = new Map();
  // On ne garde que les sélecteurs, pas les valeurs : on coupe à l'accolade.
  for (const m of css.matchAll(/(^|\})([^{}]+)\{/g)) {
    const selecteur = m[2];
    if (selecteur.includes('@') || selecteur.trim().startsWith('from') || selecteur.trim().startsWith('to')) continue;
    for (const c of selecteur.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
      trouvees.set(c[1], (trouvees.get(c[1]) ?? 0) + 1);
    }
  }
  return trouvees;
}

function fichiers(dossier, extension, trouves = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) fichiers(chemin, extension, trouves);
    else if (e.name.endsWith(extension)) trouves.push(chemin);
  }
  return trouves;
}

// 1. Les feuilles globales.
const globales = new Map();
for (const f of fichiers(path.join(SRC, 'styles'), '.css')) {
  for (const [c] of classesDeclarees(fs.readFileSync(f, 'utf8'))) {
    if (!globales.has(c)) globales.set(c, []);
    globales.get(c).push(path.relative(RACINE, f));
  }
}

// 2. Les blocs <style> des pages et des composants.
let total = 0;
for (const f of [...fichiers(path.join(SRC, 'pages'), '.astro'), ...fichiers(path.join(SRC, 'components'), '.astro')]) {
  const source = fs.readFileSync(f, 'utf8');
  const blocs = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  if (!blocs.trim()) continue;

  const partagees = [...classesDeclarees(blocs).keys()].filter((c) => globales.has(c)).sort();
  if (partagees.length === 0) continue;

  total += partagees.length;
  console.log(`\n${path.relative(RACINE, f)}`);
  for (const c of partagees) {
    console.log(`  .${c}  — déjà déclarée dans ${globales.get(c).join(', ')}`);
  }
}

console.log(
  total === 0
    ? '\nAucun nom de classe partagé entre une feuille globale et un bloc <style>.'
    : `\n${total} nom(s) partagé(s). Vérifier que la règle globale ne pose pas une propriété que la locale ne repose pas.`
);
