/**
 * La porte d'entrée ne dit jamais si un compte existe.
 *
 * Né de l'audit de Cyber du 26 octobre 2026. L'en-tête de connexion.astro
 * promet : « Le message d'erreur est le même que l'adresse existe ou non : dire
 * "cette adresse n'a pas de compte" révélerait à un mari curieux si sa femme
 * utilise l'application. Ce n'est pas une précaution théorique ici. »
 *
 * La promesse était fausse pour un cas : une adresse enregistrée mais non
 * confirmée recevait « Ton adresse n'est pas encore confirmée », c'est-à-dire
 * l'aveu qu'un compte existe à cette adresse. Il suffisait d'essayer l'adresse
 * de quelqu'un avec n'importe quel mot de passe.
 *
 * Ce fichier relit le code plutôt que de lancer un serveur : ce qu'on veut
 * garantir, c'est qu'il n'y a QU'UN seul texte d'échec, et qu'aucun ne se
 * décide d'après le message renvoyé par Supabase. Un garde-fou statique, comme
 * celui de la liste PRIVE : il tombera le jour où un second texte réapparaît.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(RACINE, 'src', 'pages', 'connexion.astro'), 'utf8');
// Seulement le frontmatter, COMMENTAIRES RETIRÉS. Les deux comptent : le reste
// de la page est du balisage, et les commentaires du frontmatter parlent
// justement du défaut corrigé. Sans les retirer, ce fichier tombait sur sa
// propre explication, ce qui est le piège classique d'un garde-fou statique
// (déjà rencontré sur l'autre application avec le mot « réussite »).
const code = (source.split('---')[1] ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

verifier('le code de la page se relit bien', code.length > 200, `${code.length} octets`);

titre("Aucune erreur de connexion ne se decide d'apres la reponse de Supabase");
{
  // Le defaut exact qui a ete trouve.
  verifier(
    "le message « not confirmed » de Supabase n'est plus interroge",
    !/not confirmed/i.test(code),
    'un test sur le texte de Supabase est revenu dans la page'
  );
  verifier(
    "« pas encore confirmée » n'est plus un message a part",
    !/pas encore confirm/i.test(code),
    'le message qui avouait l existence du compte est revenu'
  );
  // Et la forme generale : aucune branche ne doit lire error.message pour
  // choisir quoi afficher. C'est la famille entiere du defaut, pas seulement
  // le cas rencontre.
  verifier(
    "le texte de l'erreur de Supabase n'est jamais lu pour choisir un message",
    !/error\?\.message\s*\)?\s*\)?\s*\?|test\(error\?\.message/.test(code),
    'une branche lit error.message'
  );
}

titre('Il n y a qu un seul texte d echec de connexion');
{
  // Les messages affiches a l'ecran, dans le code de la page.
  const affectations = [...code.matchAll(/erreur\s*=\s*([\s\S]*?);/g)].map((m) => m[1].trim());
  verifier('des messages sont bien affectes', affectations.length >= 2, `${affectations.length} affectations`);

  // Ceux qui parlent de l'echec d'une tentative (et non d'un champ vide, d'une
  // base absente ou d'un retour de Google).
  // Les echecs d'une TENTATIVE avec mot de passe. Le retour rate de Google
  // ("La connexion avec Google n'a pas abouti") n'en est pas un : il ne dit
  // rien de l'existence d'un compte, et il parle d'un autre chemin.
  const echecs = affectations.filter((a) => /incorrect/i.test(a));
  verifier(
    "un seul message pour tous les echecs de tentative",
    echecs.length === 1,
    echecs.join(' // ')
  );
  verifier(
    "et il ne distingue pas les causes",
    echecs.length === 1 && !/\?/.test(echecs[0]),
    echecs[0] ?? '(aucun)'
  );
  verifier(
    "il dit quand meme quoi faire si le compte vient d etre cree",
    /confirmation/i.test(echecs[0] ?? ''),
    echecs[0] ?? '(aucun)'
  );
}

titre('Ce qui doit rester vrai par ailleurs');
{
  verifier(
    'un retour de Google rate ne dit pas pourquoi',
    /erreur=google/.test(fs.readFileSync(path.join(RACINE, 'src', 'pages', 'auth', 'retour.ts'), 'utf8')),
    'le retour de Google ne renvoie plus un code neutre'
  );
  verifier(
    "l'adresse saisie est ramenee en minuscules",
    /toLowerCase\(\)/.test(code),
    'la casse de l adresse n est plus normalisee'
  );
  verifier(
    'les deux champs vides sont refuses avant tout appel',
    /Remplis les deux champs/.test(code),
    'le controle des champs vides a disparu'
  );
  verifier(
    "la page ne se met jamais en reserve (c'est le middleware qui le pose)",
    !/s-maxage/.test(source),
    'la page de connexion annonce un cache partage'
  );
}

bilan('La porte d entree');
