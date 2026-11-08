/**
 * Les colonnes d'une ou plusieurs tables, sur la base en ligne.
 *
 *   node outils/colonnes.mjs commande_lignes produits
 *
 * Lecture seule. Ecrit parce que passer du SQL en ligne de commande sous
 * PowerShell casse sur les apostrophes, et qu'un fichier ne casse pas.
 */
import { lignesDuCoffre, COFFRE } from './coffre.mjs';

const REF = 'svdmqncixccdfhhghyth';
const NOM_DU_JETON = 'jarvis mousso dambe supabase';
const tables = process.argv.slice(2);

if (!tables.length) {
  console.error('Usage : node outils/colonnes.mjs <table> [table...]');
  process.exit(1);
}

const jeton = lignesDuCoffre().find((l) => l.nom === NOM_DU_JETON)?.valeur;
if (!jeton) {
  console.error(`Le coffre (${COFFRE}) n'a pas de ligne « ${NOM_DU_JETON} ».`);
  process.exit(1);
}

const liste = tables.map((t) => `'${t.replace(/'/g, "''")}'`).join(', ');
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `select table_name, column_name, data_type, is_nullable
              from information_schema.columns
             where table_schema = 'public' and table_name in (${liste})
             order by table_name, ordinal_position`,
  }),
});
if (!r.ok) {
  console.error(`SQL refuse (${r.status}) : ${(await r.text()).slice(0, 400)}`);
  process.exit(1);
}

let courante = '';
for (const c of await r.json()) {
  if (c.table_name !== courante) {
    courante = c.table_name;
    console.log(`\n=== public.${courante} ===`);
  }
  console.log(`  ${c.column_name.padEnd(24)} ${c.data_type}${c.is_nullable === 'YES' ? '' : '  (obligatoire)'}`);
}
