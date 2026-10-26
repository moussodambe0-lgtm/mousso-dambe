/**
 * Appliquer les migrations sur la vraie base, en ligne.
 *
 * Jusqu'au 26 octobre 2026, tout avait ete construit et verifie sur le banc
 * local (PGlite, en memoire). Ce projet n'avait aucun moyen de parler a un
 * Supabase en ligne. C'est ce que fait cet outil.
 *
 *   node outils/migrer.mjs            dit ce qui serait applique, sans rien faire
 *   node outils/migrer.mjs --appliquer applique vraiment
 *   node outils/migrer.mjs --etat      montre ce qui est deja en base
 *
 * Ce qui est applique est note dans `supabase_migrations.schema_migrations`,
 * la table que le CLI de Supabase utilise lui-meme : l'outil est donc
 * rejouable sans tout refaire, et un futur passage au CLI ne repartira pas de
 * zero.
 *
 * Le jeton et l'identifiant du projet sont lus dans le coffre, hors du depot.
 * Rien n'est jamais affiche d'eux.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valeurUnique, motifMousso } from './coffre.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');

const APPLIQUER = process.argv.includes('--appliquer');
const ETAT_SEUL = process.argv.includes('--etat');

// Quelle base ? Le defaut est la base d'essai : on ne touche la vraie que
// lorsqu'on le dit, et en l'ecrivant en entier. Un `--prod` de trois lettres
// se tape par accident avec une fleche vers le haut dans un terminal ; pas
// `--vraiment-la-production`.
const TEST = !process.argv.includes('--vraiment-la-production');
const CIBLE = TEST ? "la base d'essai" : 'LA BASE DE PRODUCTION';

// --- Ce dont on a besoin, ou on s'arrete -----------------------------------
const jeton = valeurUnique(motifMousso('jeton.*supabase', { test: TEST }), {
  quoi: `le jeton Supabase de ${CIBLE}`,
});
if (!jeton.valeur) {
  console.error(jeton.erreur);
  process.exit(1);
}

const refBrut = valeurUnique(motifMousso('(identifiant.*projet|ref)', { test: TEST }), {
  quoi: `l'identifiant du projet de ${CIBLE}`,
});
if (!refBrut.valeur) {
  console.error(refBrut.erreur);
  process.exit(1);
}
// Accepte un identifiant seul ou une URL collee entiere.
const REF = (/([a-z0-9]{20})/i.exec(refBrut.valeur) ?? [null, refBrut.valeur.trim()])[1];

const ENTETES = {
  authorization: `Bearer ${jeton.valeur}`,
  'content-type': 'application/json',
  accept: 'application/json',
};

/** Execute du SQL sur le projet. Rend { ok, lignes } ou { ok: false, erreur }. */
async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: ENTETES,
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) {
    let message = texte;
    try {
      const j = JSON.parse(texte);
      message = j.message ?? j.error?.message ?? texte;
    } catch {
      /* la reponse n'etait pas du JSON */
    }
    return { ok: false, erreur: `${r.status} ${String(message).slice(0, 500)}` };
  }
  try {
    return { ok: true, lignes: JSON.parse(texte) };
  } catch {
    return { ok: true, lignes: [] };
  }
}

/** La table de suivi, celle que le CLI de Supabase utilise. */
async function preparerLeSuivi() {
  return sql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text,
      inserted_at timestamptz default now()
    );
  `);
}

async function dejaAppliquees() {
  const r = await sql('select version from supabase_migrations.schema_migrations order by version');
  if (!r.ok) return { ok: false, erreur: r.erreur };
  return { ok: true, versions: new Set((r.lignes ?? []).map((l) => l.version)) };
}

// --- Les fichiers, dans l'ordre -------------------------------------------
const fichiers = fs
  .readdirSync(MIGRATIONS)
  .filter((n) => n.endsWith('.sql'))
  .sort();

/** « 20261012090000_fondations.sql » -> version et nom. */
function decouper(nom) {
  const m = /^(\d+)_(.+)\.sql$/.exec(nom);
  return m ? { version: m[1], nom: m[2] } : { version: nom.replace(/\.sql$/, ''), nom };
}

// --- Marche ----------------------------------------------------------------
console.log(`cible  : ${CIBLE}`);
console.log(`projet : ${REF}`);
console.log(`migrations sur le disque : ${fichiers.length}`);

const prepare = await preparerLeSuivi();
if (!prepare.ok) {
  console.error(`\nImpossible de preparer le suivi : ${prepare.erreur}`);
  process.exit(1);
}

const deja = await dejaAppliquees();
if (!deja.ok) {
  console.error(`\nImpossible de lire le suivi : ${deja.erreur}`);
  process.exit(1);
}

const aFaire = fichiers.filter((f) => !deja.versions.has(decouper(f).version));

console.log(`deja en base : ${deja.versions.size}`);
console.log(`a appliquer  : ${aFaire.length}`);

if (ETAT_SEUL) {
  const t = await sql(
    "select count(*)::int as tables, (select count(*)::int from information_schema.routines where routine_schema='public') as fonctions from information_schema.tables where table_schema='public'"
  );
  if (t.ok) console.log(`\nen base : ${JSON.stringify(t.lignes?.[0] ?? {})}`);
  process.exit(0);
}

if (aFaire.length === 0) {
  console.log('\nRien a faire, tout est deja en base.');
  process.exit(0);
}

if (!APPLIQUER) {
  console.log('\nSeraient appliquees, dans cet ordre :');
  for (const f of aFaire) console.log(`  ${f}`);
  console.log('\nRien n a ete fait. Relancer avec --appliquer.');
  process.exit(0);
}

console.log('');
let faites = 0;
for (const f of aFaire) {
  const { version, nom } = decouper(f);
  const contenu = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
  process.stdout.write(`${f} ... `);

  // Chaque migration dans une transaction : si elle casse au milieu, la base
  // ne garde pas la moitie du travail. On note la version dans la meme
  // transaction, pour qu'un succes partiel soit impossible.
  // Guillemets SIMPLES pour du texte : en SQL, les guillemets doubles
  // designent un nom de colonne, et « values ('...', "fondations") » cherchait
  // donc une colonne appelee fondations.
  const nomEchappe = nom.replace(/'/g, "''");
  const enrobee = `begin;\n${contenu}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${nomEchappe}') on conflict (version) do nothing;\ncommit;`;

  const r = await sql(enrobee);
  if (!r.ok) {
    console.log('ECHEC');
    console.error(`\n${r.erreur}\n`);
    console.error(`Arret a ${f}. ${faites} migration(s) appliquee(s) avant celle-ci.`);
    console.error('La base ne garde rien de celle qui a echoue : la transaction a ete annulee.');
    process.exit(1);
  }
  console.log('ok');
  faites += 1;
}

console.log(`\n${faites} migration(s) appliquee(s).`);

const t = await sql(
  "select (select count(*)::int from information_schema.tables where table_schema='public') as tables, (select count(*)::int from information_schema.routines where routine_schema='public') as fonctions"
);
if (t.ok) console.log(`en base maintenant : ${JSON.stringify(t.lignes?.[0] ?? {})}`);
