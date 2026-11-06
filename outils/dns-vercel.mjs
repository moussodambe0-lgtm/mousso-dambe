/**
 * Ajouter des enregistrements DNS chez Vercel, et rien d'autre.
 *
 * POURQUOI CET OUTIL EXISTE, ET POURQUOI IL EST SI ETROIT.
 *
 * Le 6 novembre 2026, brancher l'envoi d'emails (Brevo) a demande quatre
 * enregistrements DNS. Le mode auto de Claude Code les a refuses, a juste
 * titre : un changement DNS mal fait rend un site injoignable, detourne les
 * emails d'un domaine, ou laisse quelqu'un d'autre prouver qu'il le possede.
 * Arthur a du les poser a la main, champ par champ, sur son telephone.
 *
 * Pour qu'il n'ait plus a le faire, il a fallu autoriser UN outil, a un chemin
 * fixe, dans .claude/settings.local.json. Cet outil est donc la surface
 * exacte de ce qui a ete autorise, et il est ecrit pour meriter cette
 * confiance : il AJOUTE des enregistrements, et c'est tout.
 *
 * CE QU'IL NE SAIT PAS FAIRE, et ce n'est pas un manque, c'est la garantie :
 *   - supprimer un enregistrement, quel qu'il soit ;
 *   - modifier un enregistrement existant ;
 *   - toucher aux serveurs de noms, qui decident de tout le reste ;
 *   - toucher aux enregistrements A, AAAA et CNAME de la racine ou de www,
 *     qui sont ce qui fait repondre le site ;
 *   - transferer le domaine, ou en ajouter un.
 *
 * Un enregistrement deja present a l'identique est laisse tranquille. Un
 * enregistrement present avec une AUTRE valeur fait echouer l'outil plutot
 * que d'ajouter un doublon : deux valeurs contradictoires sur le meme nom,
 * c'est la panne silencieuse par excellence.
 *
 * N'AFFICHE AUCUNE VALEUR DU COFFRE. Les enregistrements DNS, eux, sont
 * publics par nature : ils s'affichent.
 *
 * MODE D'EMPLOI
 *   node outils/dns-vercel.mjs <domaine> <fichier.json>          essai a blanc
 *   node outils/dns-vercel.mjs <domaine> <fichier.json> --vrai   ajoute
 *
 * Le fichier JSON est une liste :
 *   [{ "type": "TXT", "nom": "_dmarc", "valeur": "v=DMARC1; ..." }]
 * « nom » vide ou "@" designe la racine du domaine.
 */
import fs from 'node:fs';

const [, , DOMAINE, FICHIER] = process.argv;
const VRAI = process.argv.includes('--vrai');

if (!DOMAINE || !FICHIER) {
  console.log('Usage : node outils/dns-vercel.mjs <domaine> <fichier.json> [--vrai]');
  process.exit(1);
}

/** Les types qu'on accepte de poser. Pas de NS, pas de SOA, pas de CAA. */
const TYPES_PERMIS = new Set(['TXT', 'CNAME', 'MX']);

/**
 * Les noms qu'on ne touche jamais, parce que ce sont eux qui font repondre le
 * site et l'administration. Une erreur ici met Mousso Dambe hors ligne.
 */
const NOMS_INTOUCHABLES = new Set(['', '@', 'www', 'admin']);

const COFFRE = 'C:/Users/USER/Desktop/Jarvis/secrets/.env';
let JETON = null;
for (const l of fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/)) {
  const s = l.trim();
  if (!s || s.startsWith('#')) continue;
  const i = s.indexOf('=');
  if (i < 0) continue;
  const nom = s.slice(0, i).trim();
  const val = s.slice(i + 1).trim();
  if (/vercel/i.test(nom) && /mousso/i.test(nom) && val) JETON = val;
}
if (!JETON) { console.log('Pas de jeton Vercel dans le coffre.'); process.exit(1); }

const vercel = async (chemin, options = {}) => {
  const r = await fetch(`https://api.vercel.com${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const t = await r.text();
  return { ok: r.ok, statut: r.status, corps: (() => { try { return JSON.parse(t); } catch { return null; } })(), texte: t };
};

const demandes = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
if (!Array.isArray(demandes)) { console.log('Le fichier doit contenir une liste.'); process.exit(1); }

// --- Refuser avant de regarder quoi que ce soit --------------------------------

for (const d of demandes) {
  const type = String(d.type ?? '').toUpperCase();
  const nom = String(d.nom ?? '').trim().toLowerCase();
  if (!TYPES_PERMIS.has(type)) {
    console.log(`REFUSE : type ${type || '(vide)'}. Cet outil ne pose que ${[...TYPES_PERMIS].join(', ')}.`);
    process.exit(1);
  }
  // Un TXT a la racine est legitime (preuve de propriete, SPF) et ne peut pas
  // casser le site : il n'entre pas en conflit avec les adresses A. Les autres
  // types sur un nom intouchable, si.
  if (NOMS_INTOUCHABLES.has(nom) && type !== 'TXT') {
    console.log(`REFUSE : ${type} sur « ${nom || '@'} ». C'est ce qui fait repondre le site.`);
    process.exit(1);
  }
  if (!String(d.valeur ?? '').trim()) {
    console.log('REFUSE : un enregistrement sans valeur.');
    process.exit(1);
  }
}

// --- Ce qui existe deja ----------------------------------------------------------

const avant = await vercel(`/v4/domains/${DOMAINE}/records?limit=200`);
if (!avant.ok) { console.log(`Lecture refusee : ${avant.statut} ${avant.texte.slice(0, 200)}`); process.exit(1); }
const existants = avant.corps?.records ?? [];
console.log(`${DOMAINE} : ${existants.length} enregistrements en place. Aucun ne sera supprime ni modifie.\n`);

const aPoser = [];
for (const d of demandes) {
  const type = String(d.type).toUpperCase();
  const nom = String(d.nom ?? '').trim().replace(/^@$/, '');
  const valeur = String(d.valeur).trim();

  const memeNom = existants.filter((r) => r.type === type && (r.name ?? '') === nom);
  const identique = memeNom.find((r) => String(r.value ?? '').trim() === valeur);
  if (identique) { console.log(`  ${type.padEnd(5)} ${(nom || '@').padEnd(22)} deja pose, a l'identique`); continue; }

  // Un TXT peut legitimement exister en plusieurs exemplaires (SPF, preuves de
  // propriete de plusieurs services). Un CNAME, non : deux valeurs sur le meme
  // nom, et la resolution devient imprevisible.
  if (memeNom.length && type !== 'TXT') {
    console.log(`  ${type.padEnd(5)} ${(nom || '@').padEnd(22)} CONFLIT : un ${type} existe deja avec une autre valeur.`);
    console.log('     Cet outil ne remplace rien. A regler a la main dans Vercel.');
    process.exit(1);
  }
  aPoser.push({ type, nom, valeur });
}

if (!aPoser.length) { console.log('\nRien a ajouter : tout est deja en place.'); process.exit(0); }

console.log(`\n${aPoser.length} a ajouter :`);
for (const e of aPoser) console.log(`  ${e.type.padEnd(5)} ${(e.nom || '@').padEnd(22)} ${e.valeur.slice(0, 70)}`);

if (!VRAI) { console.log('\n(essai a blanc : rien envoye. Relancer avec --vrai)'); process.exit(0); }

console.log('');
for (const e of aPoser) {
  const r = await vercel(`/v2/domains/${DOMAINE}/records`, {
    method: 'POST',
    body: JSON.stringify({ type: e.type, name: e.nom, value: e.valeur, ttl: 3600 }),
  });
  console.log(`  ${e.type.padEnd(5)} ${(e.nom || '@').padEnd(22)} ${r.ok ? 'POSE' : `ECHEC ${r.statut} ${r.texte.slice(0, 160)}`}`);
}

const apres = await vercel(`/v4/domains/${DOMAINE}/records?limit=200`);
console.log(`\n${(apres.corps?.records ?? []).length} enregistrements en place (contre ${existants.length} avant).`);
