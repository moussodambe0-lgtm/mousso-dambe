// Banc d'essai SQL : imite Supabase dans PGlite (Postgres en WebAssembly) et
// rejoue TOUTES les migrations, puis exécute les requêtes comme le ferait
// l'API : rôle anon ou authenticated, claims JWT dans request.jwt.claims,
// en-têtes du site dans request.headers.
//
// Pourquoi : on vérifie la sécurité (RLS, verrous, fonctions) sans jamais
// toucher la base de production, et sans installer Docker ni Postgres.
// Lancer : npm run test:sql
//
// Limite connue : session_user vaut toujours postgres ici, alors qu'en
// production l'API se connecte en authenticator. Aucun verrou ne doit donc
// dépendre de session_user ni de current_user.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Clé serveur du banc : le site signe ses appels avec l'en-tête x-md-cle. */
export const CLE_SERVEUR_TEST = 'cle-serveur-du-banc-mousso';

const STUB_SUPABASE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  -- Supabase pose cette date quand l'adresse est verifiee (Google le fait de
  -- lui-meme). Elle manquait ici, et le banc laissait donc passer un compte
  -- dont l'adresse n'a jamais ete prouvee : ajoutee le 14 octobre 2026.
  email_confirmed_at timestamptz,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function nouvelleBase({ cleServeur = true } = {}) {
  const db = new PGlite();
  await db.exec(STUB_SUPABASE);
  const fichiers = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of fichiers) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${f} : ${e.message}`);
    }
  }
  if (cleServeur) {
    await db.query(
      `update public.reglages set valeur = encode(sha256(convert_to($1, 'UTF8')), 'hex') where cle = 'cle_serveur_sha256'`,
      [CLE_SERVEUR_TEST]
    );
  }
  return db;
}

/** UUID stable dérivé d'un nom, pour garder des clés lisibles dans les tests. */
export function uuidDe(nom) {
  const h = createHash('sha256').update(String(nom)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Crée un compte et renvoie son identifiant (le profil naît par trigger). */
export async function nouveauCompte(db, nom, prenom = '') {
  const id = uuidDe(nom);
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${nom}@essai.bf`, JSON.stringify({ prenom })]
  );
  return id;
}

const ipAuHasard = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/**
 * Exécute une requête comme le ferait l'API : rôle, claims JWT, et en-têtes
 * HTTP posés par le serveur du site. Par défaut chaque appel vient d'une IP
 * différente, pour que les quotas ne gênent pas les tests qui ne les visent
 * pas. `entetes: null` simule un appel direct à l'API, sans passer par le site.
 */
export async function commeApi(db, { role = 'anon', sub = null, ip, entetes } = {}, sql, params = []) {
  const claims = JSON.stringify({ role, sub });
  const headers =
    entetes === null ? '{}' : JSON.stringify(entetes ?? { 'x-md-cle': CLE_SERVEUR_TEST, 'x-md-ip': ip ?? ipAuHasard() });
  await db.exec('reset role;');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.query(`select set_config('request.headers', $1, false)`, [headers]);
  await db.exec(`set role ${role};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
    await db.query(`select set_config('request.headers', '', false)`);
  }
}

export async function commeServeur(db, sql, params = []) {
  await db.exec('reset role;');
  await db.query(`select set_config('request.jwt.claims', '', false)`);
  return db.query(sql, params);
}

// --- petit cadre de test, sans dépendance ---------------------------------
let total = 0;
let rates = 0;

export function verifier(titre, condition, detail = '') {
  total += 1;
  if (condition) {
    console.log(`  ok   ${titre}`);
  } else {
    rates += 1;
    console.log(`  RATÉ ${titre}${detail ? ` — ${detail}` : ''}`);
  }
}

export async function echoue(titre, promesse, motif) {
  total += 1;
  try {
    await promesse();
    rates += 1;
    console.log(`  RATÉ ${titre} — l'appel a réussi alors qu'il devait échouer`);
  } catch (e) {
    if (motif && !String(e.message).includes(motif)) {
      rates += 1;
      console.log(`  RATÉ ${titre} — erreur inattendue : ${e.message}`);
    } else {
      console.log(`  ok   ${titre}`);
    }
  }
}

export function bilan(nom) {
  console.log(`\n${nom} : ${total - rates} sur ${total} vérifications passées.`);
  if (rates > 0) process.exitCode = 1;
  total = 0;
  rates = 0;
}

export function titre(nom) {
  console.log(`\n${nom}`);
}
