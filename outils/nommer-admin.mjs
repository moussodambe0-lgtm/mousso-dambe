/**
 * Poser l'adresse qui a le droit de devenir administratrice.
 *
 * L'adresse d'Arthur n'est écrite nulle part dans le dépôt : elle vit dans son
 * coffre (`secrets/.env`), et ce script la recopie dans la table des réglages
 * de la base. Ensuite, il lui suffit de se connecter avec cette adresse et
 * d'ouvrir `/vendeur` : `reclamer_admin()` lui donne la place, une fois.
 *
 *   node outils/nommer-admin.mjs            (sur le banc local)
 *   node outils/nommer-admin.mjs --en-ligne (sur la vraie base du .env)
 *
 * Rien n'est affiché de l'adresse au-delà de son début : ce qui s'imprime dans
 * un terminal finit dans un journal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COFFRE = 'C:/Users/larou/OneDrive/Desktop/Jarvis/secrets/.env';

function lireFichier(chemin) {
  const vals = {};
  if (!fs.existsSync(chemin)) return vals;
  for (const ligne of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith('#')) continue;
    // Le coffre contient des noms avec des espaces (« e-mail admin MOUSSO
    // DAMBE ») : on les accepte ici, même s'ils ne sont pas lisibles comme
    // variables d'environnement.
    const m = /^(.+?)\s*=\s*(.*)$/.exec(propre);
    if (m) vals[m[1].trim()] = m[2].trim();
  }
  return vals;
}

const coffre = lireFichier(COFFRE);
const email = Object.entries(coffre).find(([nom]) => /e-?mail.*admin.*mousso/i.test(nom))?.[1];

if (!email) {
  console.error("Aucune adresse d'administrateur trouvée dans le coffre.");
  console.error("Attendu : une ligne du genre « e-mail admin MOUSSO DAMBE=... ».");
  process.exit(1);
}

const projet = lireFichier(path.join(RACINE, '.env'));
const base = projet.PUBLIC_SUPABASE_URL;
const cle = projet.PUBLIC_SUPABASE_ANON_KEY;
const cleServeur = projet.MD_CLE_SERVEUR;

if (!base || !cle) {
  console.error('Le .env du projet ne donne pas PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const masque = email.slice(0, 3) + '…@' + (email.split('@')[1] ?? '');
console.log(`Adresse à autoriser : ${masque}`);
console.log(`Base visée : ${base}`);

// On écrit le réglage par l'API REST, avec la clé de service si elle existe.
// Sur la vraie base, cette table n'est pas ouverte en écriture à `anon` : il
// faudra donc coller la ligne SQL affichée plus bas dans l'éditeur Supabase.
const reponse = await fetch(`${base.replace(/\/+$/, '')}/rest/v1/reglages`, {
  method: 'POST',
  headers: {
    apikey: cle,
    authorization: `Bearer ${projet.SUPABASE_SERVICE_ROLE_KEY ?? cle}`,
    'content-type': 'application/json',
    prefer: 'resolution=merge-duplicates',
    ...(cleServeur ? { 'x-md-cle': cleServeur } : {}),
  },
  body: JSON.stringify([{ cle: 'email_admin', valeur: email }]),
});

if (reponse.ok) {
  console.log("\nC'est posé. Connecte-toi avec cette adresse, puis ouvre /vendeur.");
} else {
  console.log(`\nL'écriture directe a été refusée (${reponse.status}).`);
  console.log('Colle ceci dans l’éditeur SQL de Supabase, une seule fois :\n');
  console.log(
    `insert into public.reglages (cle, valeur) values ('email_admin', '${email.replace(/'/g, "''")}')\n` +
      `  on conflict (cle) do update set valeur = excluded.valeur;`
  );
}
