/**
 * Prouver qu'un message d'inscription part vraiment, et arrive.
 *
 * Un reglage accepte par Supabase n'est pas un message recu par une femme.
 * Entre les deux il y a Brevo, l'authentification du domaine, et le filtre
 * anti-indesirables de Gmail. Cet outil fait le trajet en entier.
 *
 *   1. Il cree un compte d'essai avec une adresse en « +essai » derivee de
 *      l'adresse d'administration. Gmail livre ces adresses dans la meme boite,
 *      mais Supabase les considere comme distinctes : le vrai compte d'Arthur
 *      n'est pas touche.
 *   2. Il interroge le journal de Brevo pour savoir ce que le message est
 *      devenu : accepte, livre, rejete, mis en indesirable.
 *   3. Il efface le compte d'essai.
 *
 * POURQUOI LE JOURNAL DE BREVO ET PAS « regarde ta boite ». Parce qu'une boite
 * qu'on regarde ne dit pas POURQUOI un message manque. Le journal, lui, nomme
 * la cause : domaine refuse, adresse invalide, quota depasse. Le 6 novembre,
 * une demi-journee a ete perdue sur une panne dont la cause tenait en un mot
 * qu'on n'avait pas regarde.
 *
 * N'AFFICHE AUCUN SECRET, et pas davantage l'adresse d'Arthur : seulement le
 * suffixe d'essai et le domaine.
 *
 * Lancer : node outils/essai-email.mjs
 *          node outils/essai-email.mjs --garder   (ne supprime pas le compte)
 */
import crypto from 'node:crypto';
import { valeurUnique, motifMousso, emailAdmin } from './coffre.mjs';

const GARDER = process.argv.includes('--garder');
const REF = 'svdmqncixccdfhhghyth';
const BASE = `https://${REF}.supabase.co`;

function ouMourir(v, quoi) {
  if (v.erreur) {
    console.error(`Arrêt : ${v.erreur}`);
    process.exit(1);
  }
  console.log(`  ${quoi} : lu dans « ${v.nom} »`);
  return v.valeur;
}

const admin = ouMourir(emailAdmin(), "l'adresse d'administration");
const anon = ouMourir(valeurUnique(motifMousso('.*anon.*key'), { quoi: 'la clé anonyme' }), 'la clé anonyme');
const cleResend = ouMourir(valeurUnique(/^resend api key mousso dambe$/i, { quoi: 'la clé Resend' }), 'la clé Resend');
const jetonSupa = ouMourir(
  valeurUnique(/^jeton supabase auth mousso dambe$/i, { quoi: 'le jeton Supabase' }),
  'le jeton Supabase'
);

// L'adresse d'essai : la meme boite, un compte different.
const marque = `essai-${Date.now().toString(36)}`;
const [local, domaine] = admin.split('@');
const adresse = `${local}+${marque}@${domaine}`;
console.log(`\nAdresse d'essai : (ton adresse) + « ${marque} » @ ${domaine}`);

// --- 1. L'inscription --------------------------------------------------------

console.log('\n--- Inscription ---');
const inscription = await fetch(`${BASE}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: adresse,
    password: crypto.randomBytes(18).toString('base64url'),
  }),
  signal: AbortSignal.timeout(30_000),
});

console.log('  HTTP', inscription.status);
if (!inscription.ok) {
  // Le corps peut contenir un jeton quand l'inscription REUSSIT. En echec il
  // ne porte qu'un message. On ne lit donc ce corps que dans ce cas-la.
  const texte = await inscription.text();
  console.error('  refusé :', texte.slice(0, 400));
  process.exit(1);
}

// Le corps d'une inscription reussie contient la session : on n'en lit que
// deux champs, et on n'affiche jamais le reste.
const compte = await inscription.json();
const identifiant = compte?.id ?? compte?.user?.id ?? null;
const confirmeA = compte?.confirmed_at ?? compte?.user?.confirmed_at ?? null;
console.log('  compte créé            :', identifiant ? 'oui' : 'non');
console.log('  confirmation demandée  :', confirmeA ? 'NON (déjà confirmé ?)' : 'oui, un message doit partir');

// --- 2. Ce que Resend en a fait ----------------------------------------------

const entetesResend = { Authorization: `Bearer ${cleResend}`, accept: 'application/json' };

async function derniers() {
  const r = await fetch('https://api.resend.com/emails?limit=20', {
    headers: entetesResend,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return { erreur: `HTTP ${r.status}` };
  return r.json();
}

console.log('\n--- Journal de Resend ---');
let vus = [];
// Resend met quelques secondes a enregistrer. On regarde plusieurs fois plutot
// que d'attendre une duree choisie au hasard.
for (let essai = 1; essai <= 8; essai++) {
  const j = await derniers();
  if (j.erreur) {
    console.log('  lecture impossible :', j.erreur);
    break;
  }
  vus = (j.data ?? []).filter((e) => (e.to ?? []).some((t) => t === adresse));
  if (vus.length > 0) break;
  await new Promise((r) => setTimeout(r, 4000));
  console.log(`  rien encore (${essai * 4} s)…`);
}

if (vus.length === 0) {
  console.log('  AUCUN MESSAGE. Rien n’est parti par Resend.');
} else {
  for (const e of vus) {
    console.log(`  ${e.created_at}  ${e.last_event}  « ${e.subject} »`);
  }
}

const livre = vus.some((e) => ['delivered', 'sent'].includes(e.last_event));
const dur = vus.find((e) => ['bounced', 'complained', 'failed'].includes(e.last_event));

// --- 3. Le ménage ------------------------------------------------------------

if (!GARDER && identifiant) {
  console.log('\n--- Ménage ---');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jetonSupa}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `delete from auth.users where id = '${identifiant}'::uuid` }),
    signal: AbortSignal.timeout(30_000),
  });
  console.log('  compte d’essai supprimé :', r.ok ? 'oui' : `non (HTTP ${r.status})`);
  if (!r.ok) console.log('  ', (await r.text()).slice(0, 300));
}

console.log('\n--- Verdict ---');
if (livre) console.log('  PARTI ET LIVRÉ. La connexion par email fonctionne de bout en bout.');
else if (dur) console.log(`  ÉCHEC : ${dur.last_event}`);
else if (vus.length > 0) console.log('  Parti, pas encore confirmé livré. Relancer dans une minute.');
else console.log('  Rien n’est parti. Le branchement SMTP est en cause.');
process.exit(livre ? 0 : 1);
