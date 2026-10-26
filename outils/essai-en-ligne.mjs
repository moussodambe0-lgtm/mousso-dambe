/**
 * Lancer l'application sur la base d'essai en ligne.
 *
 *   npm run dev:essai
 *
 * Trois façons d'essayer Mousso Dambé, de la plus fausse à la plus vraie :
 *
 *   npm run demo       le banc local (PGlite, en mémoire). Rapide, hors ligne,
 *                      mais c'est une imitation de Supabase.
 *   npm run dev:essai  CECI : le vrai Supabase, mais la base d'essai. Vraie
 *                      authentification, vraies règles d'accès, vraies
 *                      fonctions, et aucune donnée d'utilisatrice en jeu.
 *   la production      jamais pour essayer.
 *
 * Les clés sont lues dans le coffre, hors du dépôt, et ne sont jamais
 * affichées. La clé serveur de l'essai est tirée au hasard et posée en base au
 * premier lancement, comme en production : sans son empreinte, la base refuse
 * toute écriture.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { valeurUnique, motifMousso, masquer, COFFRE } from './coffre.mjs';
import { baseAttendue } from './projets.mjs';

const PORT = 4323;

function duCoffre(sujet, quoi, { test = true } = {}) {
  const r = valeurUnique(motifMousso(sujet, { test }), { quoi });
  if (!r.valeur) {
    console.error(r.erreur);
    process.exit(1);
  }
  return r;
}

const jeton = duCoffre('jeton.*supabase', "le jeton de la base d'essai");
const idBrut = duCoffre('(identifiant.*projet|ref)', "l'identifiant du projet d'essai");
const cleAnon = duCoffre('(cle.*publiable|anon)', "la clé publiable de l'essai");

const REF = (/([a-z0-9]{20})/i.exec(idBrut.valeur) ?? [null, idBrut.valeur.trim()])[1];
// Cet outil ne doit JAMAIS tomber sur la production : il pose des reglages et
// sert a essayer. On exige donc la base d'essai, nommement.
try {
  baseAttendue(REF, 'essai');
} catch (e) {
  console.error(`
${e.message}
`);
  process.exit(1);
}

const URL_BASE = `https://${REF}.supabase.co`;

async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jeton.valeur}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) return { ok: false, erreur: `${r.status} ${texte.slice(0, 200)}` };
  try {
    return { ok: true, lignes: JSON.parse(texte) };
  } catch {
    return { ok: true, lignes: [] };
  }
}

const NOM_CLE = "MD_CLE_SERVEUR TEST mousso dambe";

/** La clé serveur de l'essai, tirée au hasard la première fois. */
function cleServeur() {
  const trouvee = valeurUnique(motifMousso('(md.*)?cle.*serveur', { test: true }), {
    quoi: "la clé serveur de l'essai",
  });
  if (trouvee.valeur) return trouvee.valeur;
  const neuve = crypto.randomBytes(48).toString('base64url');
  const brut = fs.readFileSync(COFFRE, 'utf8');
  fs.appendFileSync(COFFRE, `${brut.endsWith('\n') ? '' : '\n'}\n#${NOM_CLE}\n${NOM_CLE}=${neuve}\n`, 'utf8');
  console.log(`clé serveur de l'essai tirée au hasard, rangée dans le coffre (« ${NOM_CLE} »)`);
  return neuve;
}

// --- Préparer la base d'essai ---------------------------------------------
const tables = await sql(
  "select count(*)::int as n from information_schema.tables where table_schema='public'"
);
if (!tables.ok) {
  console.error(`La base d'essai ne répond pas : ${tables.erreur}`);
  process.exit(1);
}
const nb = tables.lignes?.[0]?.n ?? 0;
if (nb === 0) {
  console.error("La base d'essai est vide. Lancer d'abord : node outils/migrer.mjs --appliquer");
  process.exit(1);
}

const cle = cleServeur();
const empreinte = crypto.createHash('sha256').update(cle).digest('hex');

const adresse = valeurUnique(/e-?mail.*admin.*mousso/i, { quoi: "l'adresse de l'administrateur" });
const reglages = [`('cle_serveur_sha256', '${empreinte}')`];
if (adresse.valeur) reglages.push(`('email_admin', '${adresse.valeur.replace(/'/g, "''")}')`);

const pose = await sql(`
  insert into public.reglages (cle, valeur) values ${reglages.join(', ')}
  on conflict (cle) do update set valeur = excluded.valeur;
`);
if (!pose.ok) {
  console.error(`Réglages impossibles : ${pose.erreur}`);
  process.exit(1);
}

console.log(`\nbase d'essai : ${URL_BASE}`);
console.log(`${nb} tables, empreinte de la clé serveur posée`);
if (adresse.valeur) console.log(`administrateur : ${masquer(adresse.valeur)}`);
console.log(`\nle site  : http://localhost:${PORT}`);
console.log(`la gestion : http://admin.localhost:${PORT}`);
console.log(`\nAucune donnée de production n'est touchée. Ctrl+C pour arrêter.\n`);

// --- Lancer le site --------------------------------------------------------
spawn('npx', ['astro', 'dev', '--port', String(PORT)], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PUBLIC_SUPABASE_URL: URL_BASE,
    PUBLIC_SUPABASE_ANON_KEY: cleAnon.valeur,
    MD_CLE_SERVEUR: cle,
  },
});
