/**
 * Poser en base les deux reglages sans lesquels l'application ne tourne pas.
 *
 *   node outils/poser-reglages.mjs             montre l'etat, ne change rien
 *   node outils/poser-reglages.mjs --appliquer pose ce qui manque
 *
 * 1. L'EMPREINTE DE LA CLE SERVEUR. L'application signe ses appels vers la
 *    base avec une cle partagee ; la base n'en garde que l'empreinte SHA-256.
 *    Sans elle, toute ecriture est refusee (garde-fou voulu depuis l'audit du
 *    12 octobre 2026 : panne bruyante plutot que porte ouverte). La cle elle
 *    meme est tiree au hasard ici, rangee dans le coffre, et devra etre copiee
 *    dans Vercel sous MD_CLE_SERVEUR.
 *
 * 2. L'ADRESSE DE L'ADMINISTRATEUR, lue dans le coffre. C'est la seule adresse
 *    que `reclamer_admin()` acceptera. Sans ce reglage, la fonction refuse tout
 *    le monde, ce qui est le bon defaut mais empeche Arthur d'entrer.
 *
 * Rien n'est affiche des valeurs : ni la cle, ni l'adresse en entier.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { valeurUnique, emailAdmin, masquer, COFFRE } from './coffre.mjs';

const APPLIQUER = process.argv.includes('--appliquer');

const jeton = valeurUnique(/jeton.*supabase.*mousso/i, { quoi: 'le jeton Supabase' });
const refBrut = valeurUnique(/supabase.*identifiant.*projet|ref.*supabase.*mousso/i, {
  quoi: "l'identifiant du projet",
});
for (const r of [jeton, refBrut]) {
  if (!r.valeur) {
    console.error(r.erreur);
    process.exit(1);
  }
}
const REF = (/([a-z0-9]{20})/i.exec(refBrut.valeur) ?? [null, refBrut.valeur.trim()])[1];

async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jeton.valeur}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) {
    let m = texte;
    try {
      m = JSON.parse(texte).message ?? texte;
    } catch {
      /* pas du JSON */
    }
    return { ok: false, erreur: `${r.status} ${String(m).slice(0, 400)}` };
  }
  try {
    return { ok: true, lignes: JSON.parse(texte) };
  } catch {
    return { ok: true, lignes: [] };
  }
}

const NOM_CLE = 'MD_CLE_SERVEUR mousso dambe';

/** La cle serveur du coffre, tiree au hasard si elle n'y est pas encore. */
function cleServeur() {
  const trouvee = valeurUnique(/md.*cle.*serveur.*mousso|cle.*serveur.*mousso/i, {
    quoi: 'la cle serveur',
  });
  if (trouvee.valeur) return { valeur: trouvee.valeur, nouvelle: false, nom: trouvee.nom };
  if (trouvee.erreur.startsWith('Le coffre donne')) {
    console.error(trouvee.erreur);
    process.exit(1);
  }
  // 48 octets au hasard : personne ne la devine, et elle ne ressemble a rien.
  const neuve = crypto.randomBytes(48).toString('base64url');
  if (APPLIQUER) {
    const brut = fs.readFileSync(COFFRE, 'utf8');
    const fin = brut.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(COFFRE, `${fin}\n#${NOM_CLE}\n${NOM_CLE}=${neuve}\n`, 'utf8');
  }
  return { valeur: neuve, nouvelle: true, nom: NOM_CLE };
}

// --- Etat actuel -----------------------------------------------------------
const etat = await sql(
  "select cle, case when cle = 'email_admin' then valeur else '(pose)' end as apercu from public.reglages where cle in ('cle_serveur_sha256', 'email_admin') order by cle"
);
if (!etat.ok) {
  console.error(`Lecture des reglages impossible : ${etat.erreur}`);
  process.exit(1);
}
const posees = new Map((etat.lignes ?? []).map((l) => [l.cle, l.apercu]));

console.log(`projet : ${REF}`);
console.log(`empreinte de la cle serveur : ${posees.has('cle_serveur_sha256') ? 'deja posee' : 'ABSENTE'}`);
console.log(
  `adresse de l'administrateur : ${
    posees.has('email_admin') ? `deja posee (${masquer(posees.get('email_admin'))})` : 'ABSENTE'
  }`
);

const adresse = emailAdmin();
if (!adresse.valeur) {
  console.error(`\n${adresse.erreur}`);
  process.exit(1);
}
console.log(`adresse dans le coffre : ${masquer(adresse.valeur)} (ligne « ${adresse.nom} »)`);

if (!APPLIQUER) {
  console.log('\nRien n a ete fait. Relancer avec --appliquer.');
  process.exit(0);
}

// --- On pose ---------------------------------------------------------------
const cle = cleServeur();
const empreinte = crypto.createHash('sha256').update(cle.valeur).digest('hex');

console.log('');
if (cle.nouvelle) console.log(`cle serveur tiree au hasard et rangee dans le coffre, ligne « ${cle.nom} »`);
else console.log(`cle serveur deja dans le coffre, ligne « ${cle.nom} »`);

const pose = await sql(`
  insert into public.reglages (cle, valeur) values
    ('cle_serveur_sha256', '${empreinte}'),
    ('email_admin', '${adresse.valeur.replace(/'/g, "''")}')
  on conflict (cle) do update set valeur = excluded.valeur;
`);
if (!pose.ok) {
  console.error(`\nEcriture refusee : ${pose.erreur}`);
  process.exit(1);
}

const apres = await sql(
  "select cle from public.reglages where cle in ('cle_serveur_sha256','email_admin') order by cle"
);
console.log(`reglages en base : ${(apres.lignes ?? []).map((l) => l.cle).join(', ')}`);
console.log(`empreinte posee : ${empreinte.slice(0, 12)}…`);
console.log('\nA copier dans Vercel : MD_CLE_SERVEUR = la valeur de la ligne du coffre ci-dessus.');
