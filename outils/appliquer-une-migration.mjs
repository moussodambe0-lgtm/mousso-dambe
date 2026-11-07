/**
 * Poser une migration sur la base en ligne, et verifier qu'elle a pris.
 *
 *   node outils/appliquer-une-migration.mjs <nom du fichier>            montre
 *   node outils/appliquer-une-migration.mjs <nom du fichier> --appliquer
 *
 * `supabase db push` ne marche pas depuis ce reseau. L'API de gestion, elle,
 * execute du SQL. Le fichier reste la source de verite : cet outil l'envoie
 * tel quel, sans le reecrire ni en extraire des morceaux.
 *
 * Aucun secret n'est affiche.
 */
import fs from 'node:fs';
import path from 'node:path';
import { lignesDuCoffre, COFFRE } from './coffre.mjs';

const REF = 'svdmqncixccdfhhghyth';
const NOM_DU_JETON = 'jarvis mousso dambe supabase';
const APPLIQUER = process.argv.includes('--appliquer');
const nom = process.argv[2];

if (!nom || nom.startsWith('--')) {
  console.error('Usage : node outils/appliquer-une-migration.mjs <fichier.sql> [--appliquer]');
  process.exit(1);
}
const chemin = path.join('supabase', 'migrations', path.basename(nom));
if (!fs.existsSync(chemin)) {
  console.error(`Introuvable : ${chemin}`);
  process.exit(1);
}
const sqlDuFichier = fs.readFileSync(chemin, 'utf8');

const jeton = lignesDuCoffre().find((l) => l.nom === NOM_DU_JETON)?.valeur;
if (!jeton) {
  console.error(`Le coffre (${COFFRE}) n'a pas de ligne « ${NOM_DU_JETON} ».`);
  process.exit(1);
}

async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`SQL refuse (${r.status}) : ${texte.slice(0, 600)}`);
  try {
    return texte ? JSON.parse(texte) : [];
  } catch {
    return [];
  }
}

console.log(`Fichier : ${chemin}  (${sqlDuFichier.length} caracteres)`);
console.log(`Base    : ${REF}`);

if (!APPLIQUER) {
  console.log('\n(rien n\'a ete envoye. Relancer avec --appliquer)');
  process.exit(0);
}

await sql(sqlDuFichier);
console.log('\nPosee.');

// Verifier sur la base, pas sur mes intentions : la fonction existe-t-elle, et
// qui a le droit de l'appeler ?
const fonctions = await sql(`
  select p.proname as nom,
         pg_get_function_identity_arguments(p.oid) as arguments,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated_peut,
         has_function_privilege('anon', p.oid, 'execute') as anon_peut
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'dashboard_vendeur'`);

console.log('\n--- verifications ---');
if (!fonctions.length) {
  console.error('La fonction n\'est pas la. Quelque chose a echoue en silence.');
  process.exit(1);
}
for (const f of fonctions) {
  console.log(`  public.${f.nom}(${f.arguments})`);
  console.log(`    authenticated peut l'appeler : ${f.authenticated_peut}`);
  console.log(`    anon peut l'appeler          : ${f.anon_peut}${f.anon_peut ? '   <<< A CORRIGER' : ''}`);
}
