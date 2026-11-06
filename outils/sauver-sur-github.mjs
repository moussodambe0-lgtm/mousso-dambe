/**
 * Sauver Mousso Dambé sur GitHub sans passer par le transport Git.
 *
 * Sur ce réseau, `git push` se fige : `git ls-remote` ne répond pas, et
 * `info/refs?service=git-upload-pack` renvoie 401 en trois secondes. L'API
 * REST de GitHub, elle, répond normalement. On fabrique donc le commit à la
 * main avec l'API Git Data : un blob par fichier modifié, un arbre posé sur
 * celui du dernier commit, un commit, puis la référence qu'on avance.
 *
 * Le résultat est un vrai commit, avec un vrai parent : ce n'est pas un dépôt
 * de fichiers à côté de l'historique, c'est l'historique.
 *
 * MODE D'EMPLOI
 *
 *   node outils/sauver-sur-github.mjs           essai à blanc : compte et liste
 *   node outils/sauver-sur-github.mjs --vrai    envoie pour de bon
 *
 * Toujours regarder l'essai à blanc avant d'envoyer : il dit exactement quels
 * fichiers partent, lesquels sont nouveaux, et lesquels seront retirés du
 * dépôt distant.
 *
 * LE JETON N'EST PAS DANS CE FICHIER, et ne doit jamais y être. Il est lu dans
 * `secrets/.env`, hors du dépôt, sous une clé dont le nom contient « git » et
 * « mousso ». Si un jeton se retrouve écrit dans `.git/config` (c'est ce que
 * fait un `git remote add` avec l'adresse complète), il faut le considérer
 * comme perdu et en créer un nouveau : ce fichier-là se lit, se copie et
 * remonte dans les sorties de commande sans qu'on y pense.
 *
 * Ce que ce script ne sait PAS faire, et qu'il ne faut pas lui demander :
 * fusionner. Il pose un commit sur le dernier commit distant. Si quelqu'un a
 * poussé entre-temps, GitHub refuse d'avancer la référence, et c'est voulu :
 * mieux vaut un refus qu'un travail écrasé.
 *
 * La liste des exclusions plus bas recopie celle du `.gitignore`. Les deux
 * doivent rester d'accord : si une entrée est ajoutée là-bas, elle est à
 * ajouter ici, sinon un fichier ignoré par Git partirait quand même.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RACINE = 'C:/Users/USER/Projets/mousso-dambe';
const PROPRIETAIRE = 'moussodambe0-lgtm';
const DEPOT = 'mousso-dambe';
const BRANCHE = 'master';
const VRAI = process.argv.includes('--vrai');

// --- Le jeton, lu dans le coffre et jamais écrit ailleurs --------------------
const COFFRES = [
  'C:/Users/larou/OneDrive/Desktop/Jarvis/secrets/.env',
  'C:/Users/larou/Desktop/Jarvis/secrets/.env',
  'C:/Users/USER/Desktop/Jarvis/secrets/.env',
];
function jetonDuCoffre() {
  const f = COFFRES.find((c) => fs.existsSync(c));
  if (!f) throw new Error('Coffre introuvable.');
  let trouve = null;
  for (const ligne of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = ligne.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const nom = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (/git/i.test(nom) && /mousso/i.test(nom) && val) trouve = val;
  }
  if (!trouve) throw new Error('Pas de jeton Mousso Dambé dans le coffre.');
  return trouve;
}
const JETON = jetonDuCoffre();

const ENTETES = {
  Authorization: 'token ' + JETON,
  'User-Agent': 'jarvis-mousso-dambe',
  Accept: 'application/vnd.github+json',
};

async function api(chemin, options = {}) {
  const r = await fetch(`https://api.github.com/repos/${PROPRIETAIRE}/${DEPOT}${chemin}`, {
    ...options,
    headers: { ...ENTETES, ...(options.headers ?? {}) },
  });
  if (!r.ok) {
    const texte = await r.text();
    throw new Error(`${options.method ?? 'GET'} ${chemin} -> ${r.status} ${texte.slice(0, 300)}`);
  }
  return r.json();
}

// --- Ce qui ne part jamais ---------------------------------------------------
// Même liste que le .gitignore du dépôt, plus .git lui-même. Un secret n'a
// aucune raison de traverser : .env est exclu, .env.example passe.
const DOSSIERS_EXCLUS = new Set([
  '.git', 'node_modules', 'dist', '.vercel', '.astro',
  'atelier-motion', 'captures',
]);
function exclu(relatif, nom, estDossier) {
  if (estDossier) return DOSSIERS_EXCLUS.has(nom);
  if (nom === 'disc_tmp.html' || nom === 'Thumbs.db' || nom === '.DS_Store') return true;
  if (nom.endsWith('.log')) return true;
  if (nom === '.env.example') return false;
  if (nom === '.env' || nom.startsWith('.env.')) return true;
  return false;
}

function parcourir(dossier, prefixe = '') {
  const sortie = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const relatif = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (exclu(relatif, e.name, e.isDirectory())) continue;
    if (e.isDirectory()) sortie.push(...parcourir(path.join(dossier, e.name), relatif));
    else if (e.isFile()) sortie.push(relatif);
  }
  return sortie;
}

/** L'empreinte que Git donnerait à ce fichier : sha1("blob <taille>\0" + octets). */
function empreinteBlob(octets) {
  const h = crypto.createHash('sha1');
  h.update(Buffer.from(`blob ${octets.length}\0`, 'utf8'));
  h.update(octets);
  return h.digest('hex');
}

// --- Là où on en est côté GitHub --------------------------------------------
const ref = await api(`/git/ref/heads/${BRANCHE}`);
const commitParent = ref.object.sha;
const commit = await api(`/git/commits/${commitParent}`);
const arbreDistant = await api(`/git/trees/${commit.tree.sha}?recursive=1`);
if (arbreDistant.truncated) throw new Error('Arbre distant tronqué : trop de fichiers pour un seul appel.');

const distant = new Map();
for (const e of arbreDistant.tree) if (e.type === 'blob') distant.set(e.path, e.sha);

// --- Là où on en est ici -----------------------------------------------------
const fichiers = parcourir(RACINE);
const aEnvoyer = [];
let identiques = 0;
for (const relatif of fichiers) {
  const octets = fs.readFileSync(path.join(RACINE, relatif));
  const sha = empreinteBlob(octets);
  if (distant.get(relatif) === sha) { identiques += 1; continue; }
  aEnvoyer.push({ relatif, octets, neuf: !distant.has(relatif) });
}
const supprimes = [...distant.keys()].filter((p) => !fichiers.includes(p));

console.log(`Dernier commit distant : ${commitParent.slice(0, 7)}`);
console.log(`Fichiers ici : ${fichiers.length} | identiques au distant : ${identiques}`);
console.log(`À envoyer : ${aEnvoyer.length} (dont ${aEnvoyer.filter((f) => f.neuf).length} nouveaux)`);
console.log(`Supprimés depuis : ${supprimes.length}`);
for (const f of aEnvoyer) console.log(`   ${f.neuf ? '+' : 'M'} ${f.relatif}`);
for (const p of supprimes) console.log(`   - ${p}`);

const poids = aEnvoyer.reduce((s, f) => s + f.octets.length, 0);
console.log(`Poids total à envoyer : ${(poids / 1024 / 1024).toFixed(2)} Mo`);

if (!VRAI) {
  console.log('\n(essai à blanc : rien n\'a été envoyé. Relancer avec --vrai)');
  process.exit(0);
}
if (aEnvoyer.length === 0 && supprimes.length === 0) {
  console.log('\nRien à sauver : le distant est déjà à jour.');
  process.exit(0);
}

// --- L'envoi -----------------------------------------------------------------
const elements = [];
let fait = 0;
for (const f of aEnvoyer) {
  const blob = await api('/git/blobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: f.octets.toString('base64'), encoding: 'base64' }),
  });
  elements.push({ path: f.relatif, mode: '100644', type: 'blob', sha: blob.sha });
  fait += 1;
  if (fait % 10 === 0 || fait === aEnvoyer.length) console.log(`   blobs : ${fait}/${aEnvoyer.length}`);
}
// Un fichier retiré se dit à l'arbre par un sha nul : sans ça, `base_tree` le
// garderait, et le dépôt distant contiendrait des fichiers qui n'existent plus.
for (const p of supprimes) elements.push({ path: p, mode: '100644', type: 'blob', sha: null });

const arbre = await api('/git/trees', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base_tree: commit.tree.sha, tree: elements }),
});
console.log(`Arbre : ${arbre.sha.slice(0, 7)}`);

// Le message du commit. A changer AVANT chaque envoi : ce script ne le
// demande pas, et un message laisse de la fois d'avant raconte le mauvais
// travail. (A outiller le jour ou cela gene : le lire dans un fichier ou sur
// la ligne de commande.)
const MESSAGE = `Un compteur ne doit jamais pouvoir retarder une page

Le site rendait « 504 FUNCTION_INVOCATION_TIMEOUT » par intermittence : une
visiteuse voyait une page d'erreur, la suivante voyait le site marcher.
Arthur l'a photographie ce matin sur son telephone, sur moussodambe.com.

La cause etait le comptage des visites ajoute la veille dans le middleware.
Il partait sur CHAQUE page, en attente bloquante, entoure d'un try/catch. Or
un try/catch attrape une erreur, il n'attrape pas une lenteur : quand la base
tardait, la page attendait sans limite, jusqu'a ce que Vercel tue la fonction
au bout de ses 15 secondes (maxDuration dans astro.config.mjs).

Ce qui change :

  - le comptage passe par compterPassage(), qui abandonne au bout de 500 ms
    et ne leve jamais rien. Deux protections, differentes : un signal qui
    coupe la requete vers la base, et une course contre la montre qui garantit
    que la fonction rend la main meme si le signal etait ignore ;
  - le cookie md_jour est pose AVANT le comptage et sans dependre de lui. Une
    base lente ne doit pas faire recompter le meme navigateur a chaque page,
    c'est ce qui transformait une base poussive en base matraquee ;
  - supabase/tests/visites.test.mjs tient la regle a notre place : une base
    muette, une base qui refuse et un client casse doivent tous rendre la main
    tout de suite. 23 verifications.

La regle, ecrite en tete de lib/visites.ts : savoir combien de femmes sont
venues est utile, le leur faire payer en attente ne l'est pas. Perdre un
passage dans la statistique ne coute rien, perdre une visiteuse coute tout.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`;

const nouveau = await api('/git/commits', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: MESSAGE, tree: arbre.sha, parents: [commitParent] }),
});
console.log(`Commit : ${nouveau.sha.slice(0, 7)}`);

await api(`/git/refs/heads/${BRANCHE}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sha: nouveau.sha, force: false }),
});

console.log(`\nSauve. https://github.com/${PROPRIETAIRE}/${DEPOT}/commit/${nouveau.sha}`);
