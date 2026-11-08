/**
 * Lire la definition reelle d'une fonction, sur la base en ligne.
 *
 *   node outils/lire-une-fonction.mjs mes_commandes
 *
 * POURQUOI PAS LE FICHIER DE MIGRATION. Une fonction peut avoir ete redefinie
 * par une migration posterieure, ou par une autre session. Le fichier qui l'a
 * creee ne dit donc pas ce qui tourne aujourd'hui. Avant de redefinir une
 * fonction dont d'autres pages dependent, on lit ce qu'elle rend VRAIMENT.
 *
 * Lecture seule. Aucun secret affiche.
 */
import { lignesDuCoffre, COFFRE } from './coffre.mjs';

const REF = 'svdmqncixccdfhhghyth';
const NOM_DU_JETON = 'jarvis mousso dambe supabase';
const nom = process.argv[2];

if (!nom) {
  console.error('Usage : node outils/lire-une-fonction.mjs <nom>');
  process.exit(1);
}

const jeton = lignesDuCoffre().find((l) => l.nom === NOM_DU_JETON)?.valeur;
if (!jeton) {
  console.error(`Le coffre (${COFFRE}) n'a pas de ligne « ${NOM_DU_JETON} ».`);
  process.exit(1);
}

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    query: `select pg_get_functiondef(p.oid) as code
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = '${nom.replace(/'/g, "''")}'`,
  }),
});
if (!r.ok) {
  console.error(`SQL refuse (${r.status}) : ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
const lignes = await r.json();
if (!lignes.length) {
  console.error(`Aucune fonction public.${nom} sur la base ${REF}.`);
  process.exit(1);
}
for (const l of lignes) console.log(l.code + '\n');
