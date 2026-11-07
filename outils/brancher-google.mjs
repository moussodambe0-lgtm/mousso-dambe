/**
 * Allumer la connexion Google sur la base de Mousso Dambé.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * POURQUOI CET OUTIL EXISTE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Le code de la connexion Google est écrit depuis le 12 octobre 2026, réparé
 * le 26 par Cyber (les deux bouts ne parlaient pas la même langue : l'aller
 * partait en mode implicite et le retour réclamait un secret PKCE, donc
 * AUCUNE connexion ne pouvait aboutir), et complété le 27 pour qu'une femme
 * entrée par « Commencer » rattache Google sans perdre son cycle.
 *
 * Ce qui manquait n'était pas du code. La base de Mousso Dambé a été remontée
 * de zéro le 6 novembre, l'ancienne ayant disparu : le code est revenu intact
 * de GitHub, mais LES RÉGLAGES ne vivent pas dans le code. Le fournisseur
 * Google était éteint, et rien dans le dépôt ne pouvait le rallumer.
 *
 * Arthur a créé le client OAuth dans la console Google Cloud le 7 novembre
 * 2026, au prix d'une heure de bataille contre la validation en deux étapes
 * que Google impose depuis le 22 octobre. Cet outil fait le reste.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CE QU'IL POSE, ET POURQUOI LE SECOND RÉGLAGE COMPTE AUTANT QUE LE PREMIER
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. LE FOURNISSEUR GOOGLE, avec l'identifiant et le secret du coffre.
 *
 * 2. LE RATTACHEMENT MANUEL (`security_manual_linking_enabled`). Sans lui,
 *    `linkIdentity` est refusé par Supabase, et src/pages/auth/google.ts le
 *    sait : il refuse alors de se replier en silence sur un compte neuf.
 *
 *    La raison est la seule qui compte ici. On entre dans Mousso Dambé par
 *    « Commencer », sans compte : une femme qui touche « Se connecter avec
 *    Google » a souvent DÉJÀ trois mois de règles notées. Sans ce réglage,
 *    Google l'emmènerait sur un compte neuf et vide, et son cycle, son
 *    journal et ses commandes deviendraient inaccessibles au moment précis où
 *    elle essaie de les mettre à l'abri.
 *
 * N'AFFICHE AUCUN SECRET : ni l'identifiant, ni le code secret, ni le jeton.
 * Seulement des longueurs et des oui/non.
 *
 * Lancer : node outils/brancher-google.mjs
 *          node outils/brancher-google.mjs --lire   (ne modifie rien)
 */
import { valeurUnique } from './coffre.mjs';

const LIRE_SEULEMENT = process.argv.includes('--lire');
const REF = 'svdmqncixccdfhhghyth';
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

function ouMourir(motif, quoi) {
  const v = valeurUnique(motif, { quoi });
  if (v.erreur) {
    console.error(`Arrêt : ${v.erreur}`);
    process.exit(1);
  }
  console.log(`  ${quoi} : lu dans « ${v.nom} », ${v.valeur.length} caractères`);
  return v.valeur;
}

const jeton = ouMourir(/^jeton supabase auth mousso dambe$/i, 'le jeton Supabase');
const identifiant = ouMourir(/^google client id mousso dambe$/i, "l'identifiant client Google");
const secret = ouMourir(/^google client secret mousso dambe$/i, 'le code secret Google');

// Une vérification de forme, pour attraper une recopie incomplète avant de
// poser un réglage qui ne marcherait pas.
if (!identifiant.endsWith('.apps.googleusercontent.com')) {
  console.error(
    "\nArrêt : l'identifiant client ne se termine pas par « .apps.googleusercontent.com ».\n"
    + "C'est la forme de tous les identifiants Google. Vérifie la recopie."
  );
  process.exit(1);
}

const entetes = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };

async function lire() {
  const r = await fetch(API, { headers: entetes, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`lecture des réglages : HTTP ${r.status}`);
  return r.json();
}

const oui = (v) => (v ? 'OUI' : 'non');

console.log('\n--- Avant ---');
const avant = await lire();
console.log('  Google actif       :', oui(avant.external_google_enabled));
console.log('  rattachement manuel:', oui(avant.security_manual_linking_enabled));

if (LIRE_SEULEMENT) {
  console.log('\n(--lire : rien n’a été modifié)');
  process.exit(0);
}

console.log('\n--- Envoi ---');
const envoi = await fetch(API, {
  method: 'PATCH',
  headers: entetes,
  body: JSON.stringify({
    external_google_enabled: true,
    external_google_client_id: identifiant,
    external_google_secret: secret,
    security_manual_linking_enabled: true,
  }),
  signal: AbortSignal.timeout(30_000),
});

if (!envoi.ok) {
  // Le corps d'une erreur de l'API nomme le champ refusé et ne contient
  // aucun secret : on l'affiche, sinon on cherche à l'aveugle.
  console.error(`  REFUSÉ : HTTP ${envoi.status}`);
  console.error('  ', (await envoi.text()).slice(0, 600));
  process.exit(1);
}
console.log('  accepté.');

// Un PATCH accepté n'est pas un PATCH appliqué : on relit.
console.log('\n--- Après, relu depuis Supabase ---');
const apres = await lire();

const verifications = [
  ['Google actif', apres.external_google_enabled === true],
  ['rattachement manuel', apres.security_manual_linking_enabled === true],
  ['identifiant posé', String(apres.external_google_client_id ?? '') === identifiant],
  ['secret posé', Boolean(apres.external_google_secret)],
];

let faux = 0;
for (const [nom, bon] of verifications) {
  if (!bon) faux++;
  console.log(`  ${bon ? 'OK  ' : 'NON '} ${nom}`);
}

// Ce que le NAVIGATEUR voit : c'est cette liste que lit src/lib/google.ts,
// et c'est elle qui décide de l'affichage du bouton.
const cle = valeurUnique(/^supabase anon key mousso dambe$/i, {}).valeur;
const vu = await fetch(`https://${REF}.supabase.co/auth/v1/settings`, {
  headers: { apikey: cle },
  signal: AbortSignal.timeout(30_000),
});
const reglages = vu.ok ? await vu.json() : null;
const visible = reglages?.external?.google === true;
console.log(`  ${visible ? 'OK  ' : 'NON '} annoncé aux navigateurs`);
if (!visible) faux++;

console.log(
  faux === 0
    ? '\nGoogle est allumé. Le bouton peut aboutir.'
    : `\n${faux} réglage(s) n’ont pas pris. Voir ci-dessus.`
);
process.exit(faux === 0 ? 0 : 1);
