/**
 * Les deux gestes qui restent apres avoir remonte la base.
 *
 * `remonter-la-base.mjs` cree le projet et rejoue les migrations, mais une
 * base fraiche n'est pas encore une base qui marche :
 *
 *   1. LA CLE DU SERVEUR. `reglages.cle_serveur_sha256` nait vide, et
 *      `appel_du_site()` refuse alors tout appel portant des en-tetes,
 *      c'est-a-dire tous ceux du site. C'est voulu : une base neuve ne doit
 *      pas s'ouvrir a n'importe qui. Il faut y deposer l'empreinte de la cle
 *      que le site envoie, sinon rien ne s'ecrit et la boutique reste muette
 *      sans dire pourquoi.
 *
 *   2. L'ADMINISTRATRICE. La table `administrateurs` est vide. Arthur ne
 *      pourra ouvrir ni l'espace vendeur ni l'administration tant qu'il n'y
 *      est pas. Mais il faut d'abord qu'il ait un compte : on ne peut
 *      designer que quelqu'un qui existe. Ce script le fait si son compte est
 *      la, et dit quoi faire sinon.
 *
 * N'AFFICHE AUCUNE VALEUR DU COFFRE.
 *
 *   node outils/finir-l-installation.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const COFFRE = 'C:/Users/USER/Desktop/Jarvis/secrets/.env';

const C = new Map();
for (const l of fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/)) {
  const s = l.trim();
  if (!s || s.startsWith('#')) continue;
  const i = s.indexOf('=');
  if (i < 0) continue;
  C.set(s.slice(0, i).trim(), s.slice(i + 1).trim());
}

/** Le jeton de compte : celui qui voit les organisations. */
let jeton = null;
for (const [, val] of C) {
  if (!val.startsWith('sbp_')) continue;
  const r = await fetch('https://api.supabase.com/v1/organizations', { headers: { Authorization: `Bearer ${val}` } });
  if (r.ok && (JSON.parse(await r.text()) ?? []).length) { jeton = val; break; }
}
if (!jeton) { console.log('Pas de jeton de compte Supabase utilisable.'); process.exit(1); }

const api = async (c, o = {}) => {
  const r = await fetch(`https://api.supabase.com${c}`, {
    ...o,
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', ...(o.headers ?? {}) },
  });
  const t = await r.text();
  return { ok: r.ok, statut: r.status, corps: (() => { try { return JSON.parse(t); } catch { return null; } })(), texte: t };
};

const { corps: projets } = await api('/v1/projects');
const projet = (projets ?? []).find((p) => p.name === 'mousso-dambe');
if (!projet) { console.log('Projet « mousso-dambe » introuvable.'); process.exit(1); }
console.log(`Projet « ${projet.name} », ${projet.status}, ${projet.region}\n`);

const sql = async (requete) => {
  const r = await api(`/v1/projects/${projet.id}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: requete }),
  });
  if (!r.ok) throw new Error(`${r.statut} ${r.texte.slice(0, 300)}`);
  return r.corps;
};

// --- 1. La cle du serveur ------------------------------------------------------

// Le site envoie cette cle en clair dans l'en-tete `x-md-cle` ; la base n'en
// garde que l'empreinte. On depose donc l'empreinte, jamais la cle.
const cle = C.get('MD_CLE_SERVEUR mousso dambe');
if (!cle) {
  console.log("LA CLE DU SERVEUR est absente du coffre sous « MD_CLE_SERVEUR mousso dambe ».");
  process.exit(1);
}
const empreinte = crypto.createHash('sha256').update(cle, 'utf8').digest('hex');

const avant = await sql(`select valeur from public.reglages where cle = 'cle_serveur_sha256'`);
const deja = avant?.[0]?.valeur ?? '';
if (deja === empreinte) {
  console.log('LA CLE DU SERVEUR : deja deposee, et elle correspond.');
} else {
  await sql(
    `update public.reglages set valeur = '${empreinte}' where cle = 'cle_serveur_sha256'`
  );
  const apres = await sql(`select valeur from public.reglages where cle = 'cle_serveur_sha256'`);
  console.log(
    `LA CLE DU SERVEUR : ${apres?.[0]?.valeur === empreinte ? 'deposee, la base accepte maintenant les appels du site' : 'ECHEC'}`
  );
}

// --- 2. L'administratrice --------------------------------------------------------

const email = C.get('email admin mousso dambe');
console.log('');
const comptes = await sql(`select count(*)::int as n from auth.users`);
console.log(`COMPTES DANS LA BASE : ${comptes?.[0]?.n ?? 0}`);

if (email) {
  const trouve = await sql(
    `select u.id::text as id from auth.users u where lower(u.email) = lower('${email.replace(/'/g, "''")}') limit 1`
  );
  if (trouve?.length) {
    await sql(
      `insert into public.administrateurs (profil_id) values ('${trouve[0].id}') on conflict do nothing`
    );
    const n = await sql(`select count(*)::int as n from public.administrateurs`);
    console.log(`ADMINISTRATEURS : ${n?.[0]?.n ?? 0}. Le compte d'Arthur est designe.`);
  } else {
    console.log(`ADMINISTRATEURS : 0.

Le compte d'Arthur n'existe pas encore dans cette base neuve. C'est normal :
on ne peut designer que quelqu'un qui existe.

A FAIRE, dans cet ordre :
  1. va sur https://admin.moussodambe.com/connexion
  2. connecte-toi avec ton adresse habituelle
  3. relance ce script : il te designera administrateur
`);
  }
} else {
  console.log("ADMINISTRATEURS : l'adresse d'Arthur n'est pas dans le coffre sous « email admin mousso dambe ».");
}

// --- 3. Ce que la base contient ---------------------------------------------------

const etat = await sql(`select
  (select count(*) from public.produits) as produits,
  (select count(*) from public.produits where publie) as publies,
  (select count(*) from public.profils) as profils,
  (select count(*) from public.commandes) as commandes`);
const e = etat?.[0] ?? {};
console.log(`\nLA BASE CONTIENT`);
console.log(`  produits   : ${e.produits} (dont ${e.publies} en vente)`);
console.log(`  profils    : ${e.profils}`);
console.log(`  commandes  : ${e.commandes}`);
