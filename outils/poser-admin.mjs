/**
 * Faire d'Arthur l'administrateur, sur la base en ligne, sans passer par
 * l'interface.
 *
 *   node outils/poser-admin.mjs             montre l'etat, ne change rien
 *   node outils/poser-admin.mjs --appliquer pose le reglage et la ligne
 *
 * POURQUOI CET OUTIL EXISTE
 *
 * `reclamer_admin()` est la voie prevue, mais la route qui l'appelle,
 * `/vendeur/entrer`, est en POST seulement et AUCUN bouton de l'application ne
 * l'appelle : elle est inatteignable depuis l'interface. Constate le
 * 7 novembre 2026. Cet outil fait exactement ce que la fonction aurait fait,
 * ni plus ni moins : poser l'adresse autorisee dans les reglages, puis
 * inscrire le compte correspondant dans `administrateurs`.
 *
 * Il ne cree aucun compte et n'accorde rien a une adresse qui n'est pas celle
 * du coffre. Il est rejouable sans effet de bord.
 *
 * POURQUOI PAR L'API DE GESTION
 *
 * La cle serveur du projet du 6 novembre n'est pas dans le coffre (celle qui y
 * est appartient a l'ancien projet), et l'extraire a ete refuse, a juste titre.
 * Le jeton de gestion, lui, peut executer du SQL sur le projet.
 *
 * Aucune valeur du coffre n'est affichee : ni le jeton, ni l'adresse.
 */
import fs from 'node:fs';
import { lignesDuCoffre, emailAdmin, masquer, COFFRE } from './coffre.mjs';

const APPLIQUER = process.argv.includes('--appliquer');

/**
 * Le projet Supabase de production de Mousso Dambe.
 *
 * Ecrit ici et non lu dans le coffre : trois lignes du coffre nomment un
 * « jeton supabase mousso », et `valeurUnique` refuse a juste titre de choisir.
 * La ligne retenue est nommee exactement, pour qu'une erreur soit visible
 * plutot que devinee.
 */
const REF = 'svdmqncixccdfhhghyth';
const NOM_DU_JETON = 'jarvis mousso dambe supabase';

const jeton = lignesDuCoffre().find((l) => l.nom === NOM_DU_JETON)?.valeur;
if (!jeton) {
  console.error(`Le coffre (${COFFRE}) n'a pas de ligne « ${NOM_DU_JETON} ».`);
  process.exit(1);
}

const adresse = emailAdmin();
if (!adresse.valeur) {
  console.error(adresse.erreur);
  process.exit(1);
}
const EMAIL = adresse.valeur.trim();
console.log(`Adresse administratrice du coffre : ${masquer(EMAIL)}`);

async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`SQL refuse (${r.status}) : ${texte.slice(0, 400)}`);
  try {
    return texte ? JSON.parse(texte) : [];
  } catch {
    return [];
  }
}
const guill = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------
// L'etat, avant de toucher a quoi que ce soit
// ---------------------------------------------------------------------------
const avant = await sql(`
  select
    (select valeur from public.reglages where cle = 'email_admin') is not null as reglage_pose,
    coalesce((select valeur from public.reglages where cle = 'email_admin'), '') = ${guill(EMAIL)}
      as reglage_concorde,
    (select count(*) from auth.users where lower(email) = lower(${guill(EMAIL)})) as compte,
    (select count(*) from auth.users
       where lower(email) = lower(${guill(EMAIL)}) and email_confirmed_at is not null) as compte_confirme,
    (select count(*) from public.administrateurs) as administrateurs`);

const e = avant[0];
console.log(`\n--- etat ---`);
console.log(`  reglage email_admin pose        : ${e.reglage_pose}`);
console.log(`  et il vaut bien cette adresse   : ${e.reglage_concorde}`);
console.log(`  compte portant cette adresse    : ${e.compte}`);
console.log(`  dont l'adresse est confirmee    : ${e.compte_confirme}`);
console.log(`  administrateurs inscrits        : ${e.administrateurs}`);

if (Number(e.compte_confirme) === 0) {
  console.error(`
Aucun compte confirme ne porte cette adresse. Rien n'est pose : accorder
l'administration a une adresse sans compte confirme serait ouvrir une porte a
qui creerait ce compte ensuite. Cree d'abord le compte (tableau de bord
Supabase, Authentication > Users > Add user, avec « Auto Confirm User »).`);
  process.exit(1);
}

if (!APPLIQUER) {
  console.log(`\nRien n'a ete change. Relance avec --appliquer pour poser.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Poser
// ---------------------------------------------------------------------------
await sql(`
  insert into public.reglages (cle, valeur)
  values ('email_admin', ${guill(EMAIL)})
  on conflict (cle) do update set valeur = excluded.valeur`);
console.log(`\n1. reglage email_admin : pose`);

// Exactement ce que fait `reclamer_admin()` : le compte, et seulement si son
// adresse est celle des reglages et qu'elle est confirmee.
await sql(`
  insert into public.administrateurs (profil_id)
  select u.id
  from auth.users u
  where lower(trim(u.email)) = lower(trim((select valeur from public.reglages where cle = 'email_admin')))
    and u.email_confirmed_at is not null
    and exists (select 1 from public.profils p where p.id = u.id)
  on conflict (profil_id) do nothing`);
console.log(`2. ligne dans administrateurs : posee`);

// ---------------------------------------------------------------------------
// Verifier sur la base, pas sur mes intentions
// ---------------------------------------------------------------------------
const apres = await sql(`
  select
    u.email_confirmed_at is not null as adresse_confirmee,
    exists (select 1 from public.administrateurs a where a.profil_id = u.id) as est_administrateur,
    exists (select 1 from public.profils p where p.id = u.id) as a_un_profil,
    (select count(*) from public.administrateurs) as total_administrateurs
  from auth.users u
  where lower(u.email) = lower(${guill(EMAIL)})`);

const a = apres[0];
console.log(`\n--- verifications ---`);
console.log(`  adresse confirmee        : ${a.adresse_confirmee}`);
console.log(`  profil present           : ${a.a_un_profil}`);
console.log(`  EST ADMINISTRATEUR       : ${a.est_administrateur}`);
console.log(`  administrateurs au total : ${a.total_administrateurs}`);

if (!a.est_administrateur) {
  console.error(`\nLa ligne n'est pas la. Quelque chose a echoue en silence.`);
  process.exit(1);
}
if (Number(a.total_administrateurs) !== 1) {
  console.warn(`\nATTENTION : il y a ${a.total_administrateurs} administrateurs, pas un seul.`);
}
console.log(`\nC'est fait. Recharge https://admin.moussodambe.com/admin`);
