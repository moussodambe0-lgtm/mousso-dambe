/**
 * Ce que la base attend du site, et ce qu'elle laisse passer sans rien exiger.
 *
 *   node outils/etat-des-reglages.mjs
 *
 * LECTURE SEULE. Rien n'est ecrit, rien n'est affiche d'un secret : les
 * empreintes sont resumees par « posee » ou « VIDE », jamais recopiees.
 *
 * POURQUOI
 *
 * `appel_du_site()` prouve qu'un appel vient bien du serveur du site : elle
 * compare le SHA-256 de l'en-tete `x-md-cle` a l'empreinte rangee dans
 * `reglages.cle_serveur_sha256`. Mais elle commence par ceci (migration
 * 20261012090000_fondations.sql, lignes 63-65) :
 *
 *     if attendu is null or attendu = '' then
 *       return true;
 *     end if;
 *
 * C'est volontaire, pour qu'une installation neuve fonctionne avant le reglage.
 * La consequence l'est moins : TANT QUE L'EMPREINTE N'EST PAS POSEE, la base
 * accepte n'importe quel appel comme venant du site. Avec la cle anon, qui est
 * publique puisqu'elle part dans le navigateur, n'importe qui peut alors faire
 * ce que le site fait.
 *
 * Le 7 novembre 2026, `reglages.email_admin` s'est revele absent de la base du
 * 6 novembre, ce qui refusait l'administration a tout le monde. Les reglages de
 * cette base n'ont donc jamais ete poses : il faut regarder, pas supposer.
 */
import { lignesDuCoffre, COFFRE } from './coffre.mjs';

const REF = 'svdmqncixccdfhhghyth';
const NOM_DU_JETON = 'jarvis mousso dambe supabase';

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
  if (!r.ok) throw new Error(`SQL refuse (${r.status}) : ${texte.slice(0, 400)}`);
  return texte ? JSON.parse(texte) : [];
}

console.log(`Base : ${REF} (projet du 6 novembre 2026)\n`);

// Les reglages, sans jamais montrer une valeur : seulement si elle est la.
const reglages = await sql(`
  select cle,
         coalesce(trim(valeur), '') <> '' as posee,
         length(coalesce(valeur, '')) as taille
  from public.reglages
  order by cle`);

console.log(`public.reglages (${reglages.length} lignes) :`);
for (const r of reglages) {
  console.log(`  ${r.cle.padEnd(28)} ${r.posee ? 'posee' : 'VIDE '}  (${r.taille} car.)`);
}
if (!reglages.length) console.log('  (aucune ligne)');

// Le verdict qui compte : la porte est-elle fermee ?
const [{ empreinte_posee }] = await sql(`
  select coalesce(trim((select valeur from public.reglages where cle = 'cle_serveur_sha256')), '') <> ''
    as empreinte_posee`);

console.log(`\n--- la porte du site ---`);
if (empreinte_posee) {
  console.log(`cle_serveur_sha256 est posee : la base EXIGE l'en-tete x-md-cle.`);
  console.log(`Un appel direct a l'API avec la cle anon ne passe pas.`);
  console.log(`\nConsequence pour le second projet Vercel : il doit envoyer EXACTEMENT la`);
  console.log(`meme cle que le site des clientes. Cette valeur n'existe qu'en clair dans`);
  console.log(`la variable MD_CLE_SERVEUR du projet des clientes, que Vercel ne rend plus`);
  console.log(`(elle est chiffree). Seul Arthur peut la retrouver, ou en choisir une`);
  console.log(`nouvelle a poser des deux cotes en meme temps.`);
} else {
  console.log(`cle_serveur_sha256 est VIDE : appel_du_site() repond true a tout le monde.`);
  console.log(`\nLA PORTE EST OUVERTE. La cle anon part dans le navigateur de chaque`);
  console.log(`visiteuse, donc elle est publique : aujourd'hui, n'importe qui peut`);
  console.log(`appeler l'API en se faisant passer pour le site.`);
  console.log(`\nDeux consequences :`);
  console.log(`  - la valeur de MD_CLE_SERVEUR n'a aucune importance pour l'instant,`);
  console.log(`    donc le second projet peut demarrer avec la sienne sans rien casser ;`);
  console.log(`  - il faut poser cette empreinte, et la meme cle dans les DEUX projets.`);
}

// Et le compte d'administration, pour memoire.
const [{ administrateurs }] = await sql(`select count(*)::int as administrateurs from public.administrateurs`);
console.log(`\nadministrateurs inscrits : ${administrateurs}`);
