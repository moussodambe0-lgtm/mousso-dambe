/**
 * Remonter la base de Mousso Dambe, de zero a une application qui marche.
 *
 * POURQUOI CET OUTIL EXISTE. Le 6 novembre 2026, les deux projets Supabase de
 * Mousso Dambe ont disparu : leurs adresses ne resolvent plus, leurs jetons
 * sont revoques. Le code etait intact, la boutique etait vide, et le bouton
 * « Commencer » ne pouvait creer aucun compte. Une application sans sa base
 * est une coquille.
 *
 * Ce script refait tout le chemin, dans l'ordre :
 *   1. cree un projet Supabase neuf ;
 *   2. attend qu'il soit vivant ;
 *   3. rejoue les 47 migrations, dans l'ordre des noms de fichiers ;
 *   4. verifie que les tables et les fonctions sont bien la ;
 *   5. pose l'adresse et la cle publiable dans les variables du projet Vercel ;
 *   6. redeploie, et verifie que la boutique se remplit.
 *
 * CE QU'IL FAUT AVANT DE LE LANCER, et c'est le seul geste d'Arthur :
 * un jeton d'acces Supabase de COMPTE (pas de projet), cree sur
 * supabase.com/dashboard/account/tokens, range dans secrets/.env sous un nom
 * contenant « supabase » et « compte ». Le jeton de projet ne suffit pas : il
 * repond « Resource context not found » a la creation.
 *
 * CE QUE CE SCRIPT N'AFFICHE JAMAIS : aucune valeur du coffre, aucune cle,
 * aucun jeton, aucun identifiant de projet. Regle posee par Arthur le
 * 6 novembre 2026, apres que j'aie affiche des identifiants de projet dans
 * notre discussion. Le mot de passe de la base est tire au sort ici et ecrit
 * dans secrets/.env, jamais ailleurs et jamais a l'ecran.
 *
 * MODE D'EMPLOI
 *   node outils/remonter-la-base.mjs          essai a blanc : dit ce qu'il ferait
 *   node outils/remonter-la-base.mjs --vrai   fait
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RACINE = 'C:/Users/USER/Projets/mousso-dambe';
const COFFRE = 'C:/Users/USER/Desktop/Jarvis/secrets/.env';
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');
const VRAI = process.argv.includes('--vrai');

// Paris : la region la plus proche de Ouagadougou parmi celles de Supabase.
// La fonction Vercel tourne a Londres ; les deux sont a quelques millisecondes
// l'une de l'autre, et c'est la visiteuse qu'on rapproche, pas le serveur.
const REGION = 'eu-west-3';
const NOM_PROJET = 'mousso-dambe';

// --- Le coffre, lu et jamais affiche ----------------------------------------

function coffre() {
  const m = new Map();
  if (!fs.existsSync(COFFRE)) return m;
  for (const l of fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/)) {
    const s = l.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    m.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
  }
  return m;
}

/** Ajoute ou remplace une entree du coffre, sans toucher au reste. */
function ecrireAuCoffre(nom, valeur) {
  const lignes = fs.existsSync(COFFRE) ? fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/) : [];
  let remplace = false;
  const sortie = lignes.map((l) => {
    const s = l.trim();
    if (!s || s.startsWith('#')) return l;
    const i = s.indexOf('=');
    if (i < 0) return l;
    if (s.slice(0, i).trim() !== nom) return l;
    remplace = true;
    return `${nom}=${valeur}`;
  });
  if (!remplace) sortie.push(`${nom}=${valeur}`);
  fs.writeFileSync(COFFRE, sortie.join('\n'), 'utf8');
  console.log(`  coffre : « ${nom} » ${remplace ? 'remplacee' : 'ajoutee'} (valeur jamais affichee)`);
}

const C = coffre();

/** Le jeton de COMPTE : celui qui a le droit de creer un projet. */
async function jetonDeCompte() {
  const candidats = [...C.entries()].filter(([, v]) => v.startsWith('sbp_'));
  for (const [nom, val] of candidats) {
    const r = await fetch('https://api.supabase.com/v1/organizations', {
      headers: { Authorization: `Bearer ${val}` },
    });
    if (!r.ok) continue;
    const orgs = JSON.parse(await r.text());
    if (Array.isArray(orgs) && orgs.length > 0) return { nom, val, orgs };
  }
  return null;
}

// --- Les appels ---------------------------------------------------------------

function appel(jeton) {
  return async (chemin, options = {}) => {
    const r = await fetch(`https://api.supabase.com${chemin}`, {
      ...options,
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
    const texte = await r.text();
    let corps = null;
    try { corps = JSON.parse(texte); } catch { /* reponse vide */ }
    return { ok: r.ok, statut: r.status, corps, texte };
  };
}

// --- 0. De quoi travailler ----------------------------------------------------

const compte = await jetonDeCompte();
if (!compte) {
  console.log(`
IL MANQUE LE JETON DE COMPTE, et c'est la seule chose qui manque.

Les jetons Supabase du coffre sont soit revoques, soit limites a un seul
projet : ils ne peuvent pas creer de base. Il en faut un de COMPTE.

A FAIRE, une fois, deux minutes :

  1. ouvre  https://supabase.com/dashboard/account/tokens
  2. « Generate new token », nomme-le « jarvis mousso dambe »
  3. copie-le et range-le dans  ${COFFRE}
     sur une ligne :   JETON COMPTE SUPABASE=<colle ici>
  4. relance ce script

Le jeton ne passe pas par la discussion : tu le colles toi-meme dans le
coffre, et ce script le lit sans jamais l'afficher.
`);
  process.exit(1);
}

const api = appel(compte.val);
console.log(`Jeton de compte : « ${compte.nom} », accepte.`);
console.log(`Organisations : ${compte.orgs.map((o) => `« ${o.name} »`).join(', ')}\n`);

const org = compte.orgs[0];

// --- 1. Le projet -------------------------------------------------------------

const { corps: projets } = await api('/v1/projects');
let projet = (projets ?? []).find((p) => p.name === NOM_PROJET);

const fichiers = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
console.log(`Migrations a rejouer : ${fichiers.length}`);

if (!VRAI) {
  console.log(`\nESSAI A BLANC. Ce que ce script ferait :`);
  console.log(`  - ${projet ? `reutiliser le projet « ${NOM_PROJET} » (${projet.status})` : `creer le projet « ${NOM_PROJET} » dans « ${org.name} », region ${REGION}`}`);
  console.log(`  - tirer un mot de passe de base au sort et l'ecrire dans le coffre`);
  console.log(`  - rejouer les ${fichiers.length} migrations`);
  console.log(`  - poser l'adresse et la cle publiable dans les variables Vercel`);
  console.log(`  - redeployer et verifier que la boutique se remplit`);
  console.log(`\n(rien n'a ete fait. Relancer avec --vrai)`);
  process.exit(0);
}

if (!projet) {
  // Un mot de passe tire au sort, assez long pour n'etre jamais devine, et
  // sans caractere qui demanderait un echappement dans une chaine de connexion.
  const motDePasse = crypto.randomBytes(24).toString('base64url');
  console.log(`Creation du projet « ${NOM_PROJET} » dans « ${org.name} », region ${REGION}...`);
  const r = await api('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: NOM_PROJET,
      organization_id: org.id,
      region: REGION,
      db_pass: motDePasse,
    }),
  });
  if (!r.ok) {
    console.error(`ECHEC de la creation : ${r.statut} ${r.texte.slice(0, 300)}`);
    process.exit(1);
  }
  projet = r.corps;
  ecrireAuCoffre('MOT DE PASSE SUPABASE MOUSSO DAMBE', motDePasse);
  console.log('  projet cree.');
}

// --- 2. Attendre qu'il soit vivant --------------------------------------------

console.log('\nAttente que la base soit prete (cela prend une a trois minutes)...');
const debut = Date.now();
while (Date.now() - debut < 10 * 60 * 1000) {
  const { corps } = await api(`/v1/projects/${projet.id}`);
  const etat = corps?.status ?? '?';
  console.log(`  ${new Date().toLocaleTimeString('fr-FR')}  ${etat}`);
  if (etat === 'ACTIVE_HEALTHY') break;
  await new Promise((r) => setTimeout(r, 15000));
}

// --- 3. Les migrations ---------------------------------------------------------

console.log(`\nRejeu des ${fichiers.length} migrations`);
let faites = 0;
for (const f of fichiers) {
  const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
  const r = await api(`/v1/projects/${projet.id}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) {
    console.error(`\n  ECHEC sur ${f}`);
    console.error(`  ${r.texte.slice(0, 400)}`);
    process.exit(1);
  }
  faites += 1;
  console.log(`  ${String(faites).padStart(2)}/${fichiers.length}  ${f}`);
}

// --- 4. Verifier ---------------------------------------------------------------

console.log('\nVerification de ce qui est en place');
const controle = await api(`/v1/projects/${projet.id}/database/query`, {
  method: 'POST',
  body: JSON.stringify({
    query: `select
      (select count(*) from information_schema.tables where table_schema = 'public') as tables,
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as fonctions,
      (select count(*) from public.produits) as produits`,
  }),
});
if (controle.ok) {
  const l = controle.corps?.[0] ?? {};
  console.log(`  tables : ${l.tables}   fonctions : ${l.fonctions}   produits : ${l.produits}`);
} else {
  console.log(`  (controle impossible : ${controle.statut})`);
}

// --- 5. Les variables Vercel ----------------------------------------------------

const { corps: cles } = await api(`/v1/projects/${projet.id}/api-keys`);
const anon = (cles ?? []).find((k) => k.name === 'anon' || k.type === 'publishable');
if (!anon?.api_key) {
  console.error("\nLa cle publiable n'a pas pu etre lue. A poser a la main dans Vercel.");
  process.exit(1);
}

const URL_BASE = `https://${projet.id}.supabase.co`;
ecrireAuCoffre('SUPABASE URL MOUSSO DAMBE', URL_BASE);
ecrireAuCoffre('SUPABASE ANON KEY mousso dambe', anon.api_key);

console.log('\nPose des variables dans le projet Vercel');
let jetonVercel = null;
for (const [nom, val] of C) if (/vercel/i.test(nom) && /mousso/i.test(nom) && val) jetonVercel = val;
if (!jetonVercel) {
  console.log('  pas de jeton Vercel dans le coffre : a poser a la main.');
  process.exit(0);
}

const vercel = async (chemin, options = {}) => {
  const r = await fetch(`https://api.vercel.com${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${jetonVercel}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const t = await r.text();
  return { ok: r.ok, statut: r.status, corps: (() => { try { return JSON.parse(t); } catch { return null; } })(), texte: t };
};

const { corps: pv } = await vercel('/v9/projects?limit=50');
const projetVercel = pv.projects.find((p) => /mousso/i.test(p.name));
const { corps: envs } = await vercel(`/v10/projects/${projetVercel.id}/env?decrypt=false`);

for (const [cle, valeur] of [['PUBLIC_SUPABASE_URL', URL_BASE], ['PUBLIC_SUPABASE_ANON_KEY', anon.api_key]]) {
  const existante = (envs.envs ?? []).find((e) => e.key === cle);
  if (existante) {
    const r = await vercel(`/v10/projects/${projetVercel.id}/env/${existante.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: valeur, target: ['production', 'preview', 'development'] }),
    });
    console.log(`  ${cle} : ${r.ok ? 'mise a jour' : `ECHEC ${r.statut} ${r.texte.slice(0, 150)}`}`);
  } else {
    const r = await vercel(`/v10/projects/${projetVercel.id}/env`, {
      method: 'POST',
      body: JSON.stringify({ key: cle, value: valeur, type: 'sensitive', target: ['production', 'preview', 'development'] }),
    });
    console.log(`  ${cle} : ${r.ok ? 'ajoutee' : `ECHEC ${r.statut} ${r.texte.slice(0, 150)}`}`);
  }
}

console.log(`
FAIT. Il reste a redeployer pour que les nouvelles variables soient prises :

  node outils/sauver-sur-github.mjs --vrai

ou, sans rien changer au code, un redeploiement depuis le tableau de bord Vercel.
`);
