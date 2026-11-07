/**
 * Retrouver la cle publiable Supabase en la lisant sur le site en ligne.
 *
 *   node outils/cle-publiable-du-site.mjs              cherche et verifie
 *   node outils/cle-publiable-du-site.mjs --appliquer  met a jour la ligne du coffre
 *
 * POURQUOI C'EST LEGITIME, ET POURQUOI CE N'EST PAS UNE EXTRACTION DE SECRET
 *
 * `PUBLIC_SUPABASE_ANON_KEY` est declaree `context: 'client', access: 'public'`
 * dans astro.config.mjs. Astro l'ecrit donc en clair dans le code envoye au
 * navigateur : chaque visiteuse du site la recoit deja. Ce n'est pas un secret,
 * c'est un identifiant public, et toute la protection repose ailleurs, sur les
 * regles d'acces de la base et sur `appel_du_site()`.
 *
 * On va donc la chercher la ou elle est publique, plutot que de demander a
 * Arthur d'aller la recopier dans un tableau de bord.
 *
 * POURQUOI ON EN A BESOIN
 *
 * La ligne du coffre porte la cle de l'ANCIEN projet Supabase, celui qui a
 * disparu le 6 novembre : l'API du projet de production lui repond 401. Le
 * second projet Vercel ne peut donc pas demarrer avec elle, et le premier
 * tourne avec la bonne, rangee dans une variable `sensitive` que Vercel ne rend
 * jamais.
 *
 * CE QUI EST AFFICHE : rien de la valeur, seulement sa longueur, sa famille et
 * le verdict de l'API. Une cle publique reste une valeur qu'on n'ecrit pas dans
 * un terminal sans raison.
 */
import fs from 'node:fs';
import { COFFRE, valeurUnique } from './coffre.mjs';

const APPLIQUER = process.argv.includes('--appliquer');

const REF = 'svdmqncixccdfhhghyth';
const SITE = 'https://moussodambe.com';
const NOM_LIGNE = 'SUPABASE ANON KEY MOUSSO DAMBE';

/** Les deux formes qu'une cle publiable Supabase peut prendre aujourd'hui. */
const FORMES = [
  /sb_publishable_[A-Za-z0-9_-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

async function texte(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'jarvis-mousso-dambe' } });
    return r.ok ? await r.text() : '';
  } catch {
    return '';
  }
}

console.log(`Site : ${SITE}`);
const accueil = await texte(SITE);
if (!accueil) {
  console.error('Le site ne repond pas. Rien n\'a ete change.');
  process.exit(1);
}

// La page, puis les scripts qu'elle charge : la cle peut etre dans l'un ou
// l'autre selon le decoupage qu'Astro a choisi au moment de la compilation.
const sources = [accueil];
const liens = [...accueil.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
console.log(`Scripts charges par la page : ${liens.length}`);
for (const lien of liens) {
  sources.push(await texte(lien.startsWith('http') ? lien : new URL(lien, SITE).href));
}

const candidates = new Set();
for (const s of sources) {
  for (const forme of FORMES) for (const m of s.matchAll(forme)) candidates.add(m[0]);
}
console.log(`Candidates trouvees : ${candidates.size}`);

if (!candidates.size) {
  console.error(`
Aucune cle dans le code envoye au navigateur. C'est possible : si aucun script
cote navigateur n'utilise la cle, Astro n'a aucune raison de l'y ecrire.

Il faut alors la recopier a la main, depuis
https://supabase.com/dashboard/project/${REF}/settings/api-keys
la cle « anon » / « publishable », dans la ligne du coffre :

  ${NOM_LIGNE}=...`);
  process.exit(1);
}

// La verification : c'est l'API du projet de production qui tranche, pas la
// forme de la chaine.
let bonne = null;
for (const c of candidates) {
  const r = await fetch(`https://${REF}.supabase.co/rest/v1/`, {
    headers: { apikey: c, authorization: `Bearer ${c}` },
  });
  const famille = c.startsWith('sb_publishable_') ? 'sb_publishable_' : 'eyJ (JWT)';
  console.log(`  ${famille.padEnd(16)} ${String(c.length).padStart(4)} car.  ->  API repond ${r.status}`);
  if (r.status !== 401 && r.status !== 403) bonne = c;
}

if (!bonne) {
  console.error('\nAucune candidate n\'est acceptee par la base. Rien n\'a ete change.');
  process.exit(1);
}
console.log(`\nUne cle est acceptee par le projet ${REF}.`);

// Est-ce deja celle du coffre ?
const actuelle = valeurUnique(/supabase.*anon.*mousso/i, { quoi: 'la cle publiable' });
if (actuelle.valeur && actuelle.valeur.trim() === bonne) {
  console.log('Le coffre porte deja cette cle. Rien a faire.');
  process.exit(0);
}
console.log(`La ligne du coffre « ${actuelle.nom ?? NOM_LIGNE} » porte une AUTRE valeur.`);

if (!APPLIQUER) {
  console.log('\n(rien n\'a ete ecrit. Relancer avec --appliquer)');
  process.exit(0);
}

const nom = actuelle.nom ?? NOM_LIGNE;
const brut = fs.readFileSync(COFFRE, 'utf8');
const finDeLigne = brut.includes('\r\n') ? '\r\n' : '\n';
const lignes = brut.split(/\r?\n/);
const index = lignes.findIndex((l) => {
  const t = l.trim();
  return t && !t.startsWith('#') && t.includes('=') && t.slice(0, t.indexOf('=')).trim() === nom;
});
if (index < 0) {
  console.error(`Ligne « ${nom} » introuvable dans ${COFFRE}. Rien n'a ete ecrit.`);
  process.exit(1);
}

// L'ancienne valeur est gardee en commentaire juste au-dessus, datee : c'est la
// convention du coffre, et elle a deja servi a comprendre d'ou venait une cle.
fs.writeFileSync(`${COFFRE}.avant-cle-publiable`, brut, 'utf8');
lignes.splice(index, 1, `# ${nom} (ancien projet, remplacee le 7 novembre 2026)`, `${nom}=${bonne}`);
fs.writeFileSync(COFFRE, lignes.join(finDeLigne), 'utf8');

console.log(`\nLigne ${index + 1} remplacee. L'ancienne est commentee juste au-dessus.`);
console.log(`Sauvegarde : ${COFFRE}.avant-cle-publiable`);
