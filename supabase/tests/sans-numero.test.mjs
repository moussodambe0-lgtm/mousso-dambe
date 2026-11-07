// Le numero de commande ne se montre nulle part, sauf chez Arthur.
//
// Arthur, le 7 novembre 2026 : « JE VEUX PAS DE NUMERO DE COMMANDE ».
//
// POURQUOI. Le numero s'ecrivait « MD-2611-00200 ». Les quatre chiffres du
// milieu sont le mois et l'annee : ils annoncent a qui sait lire que la
// boutique vient d'ouvrir. La fin, le compteur, dit combien de commandes ont
// precede. Sur un marche ou l'on paie a la livraison, a quelqu'un qu'on ne
// connait pas, ces deux informations font hesiter et n'apportent rien a
// celle qui achete.
//
// CE QUI RESTE, ET POURQUOI. La colonne `commandes.numero` existe toujours :
// c'est la cle des adresses (/commandes/suivre/<numero>, /avis/<numero>/...)
// et l'argument de quatre fonctions SQL. La retirer voudrait dire reecrire
// ces fonctions, ces routes et leurs tests, pour un gain nul : ce qui compte
// est qu'on ne l'AFFICHE pas. Il reste aussi visible dans l'espace vendeur,
// qui est l'outil d'Arthur et que personne d'autre n'ouvre : sans aucune
// reference, relier un message WhatsApp a une commande devient impossible
// des qu'il y en a plusieurs par jour.
//
// Ces verifications lisent les fichiers : elles tombent le jour ou quelqu'un
// remet le numero sous les yeux d'une cliente ou d'un livreur.
//
// Lancer : node supabase/tests/sans-numero.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

const livreur = lire('src/pages/livreur/[jeton].astro');
const vendeur = lire('src/pages/vendeur/commandes.astro');
const confirmee = lire('src/pages/commande-confirmee.astro');
const liste = lire('src/pages/commandes/[etat].astro');
const suivre = lire('src/pages/commandes/suivre/[numero].astro');

/**
 * Le numero est-il AFFICHE dans ce gabarit ?
 *
 * On cherche `{quelquechose.numero}` posé dans le corps du gabarit, c'est-a-dire
 * une interpolation qui finit sous les yeux de quelqu'un. On ne cherche PAS le
 * mot « numero » tout court, parce qu'il a trois usages parfaitement legitimes
 * et invisibles, qu'on retire donc avant de regarder :
 *
 *   - les commentaires, qui parlent du numero sans le montrer ;
 *   - les attributs `href={...}`, ou il sert de cle d'adresse ;
 *   - les attributs `value={...}`, ou il voyage dans un champ cache.
 *
 * C'est une heuristique de test, pas un analyseur de syntaxe : un attribut
 * dont la valeur contiendrait une accolade fermante lui echapperait. Elle
 * suffit ici, et elle se trompe du bon cote, en signalant plutot qu'en
 * laissant passer.
 */
function afficheLeNumero(source) {
  const nu = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\b(?:href|value|action|data-\w+)=\{[^}]*\}/g, '');
  return /\{\s*\w+(?:\?)?\.numero\s*\}/.test(nu);
}

titre('La cliente ne voit aucun numero');
{
  verifier("l'ecran de confirmation ne l'affiche pas", !afficheLeNumero(confirmee));
  verifier('la liste de ses commandes ne l affiche pas', !afficheLeNumero(liste));
  verifier('la page de suivi ne l affiche pas', !afficheLeNumero(suivre));
}

titre('Le livreur ne voit aucun numero');
{
  verifier('sa page ne l affiche pas', !afficheLeNumero(livreur));
  verifier(
    "le titre de l'onglet ne le porte plus",
    !/titre = course \? `Commande \$\{course\.numero\}`/.test(livreur),
    "le titre contient encore le numero"
  );
  verifier(
    'le quartier a pris sa place',
    /ou-grand/.test(livreur) && /course\.quartier/.test(livreur)
  );
}

titre('Les messages WhatsApp ne le portent pas non plus');
{
  // Ces deux messages partent sur le telephone de la cliente et sur celui du
  // livreur : ils suivent donc la meme regle que les ecrans.
  const versCliente = vendeur.match(/au sujet de ta commande[^`]*/)?.[0] ?? '';
  verifier(
    'le message a la cliente ne cite pas le numero',
    versCliente !== '' && !/\$\{c\.numero\}/.test(versCliente),
    versCliente
  );
  verifier('il donne la date a la place', /au sujet de ta commande du \$\{dateCourte/.test(vendeur));

  const versLivreur = vendeur.match(/Livraison Mousso Dambé[^`]*/)?.[0] ?? '';
  verifier(
    'le message au livreur ne cite pas le numero',
    versLivreur !== '' && !/\$\{c\.numero\}/.test(versLivreur),
    versLivreur
  );
  verifier('il donne le quartier a la place', /\$\{c\.quartier \|\|/.test(versLivreur), versLivreur);
}

titre('Mais Arthur le garde dans son espace a lui');
{
  verifier(
    "la carte de l'espace vendeur l'affiche encore",
    afficheLeNumero(vendeur),
    "le numero a disparu de l'espace vendeur : Arthur ne peut plus relier un message a une commande"
  );
}

titre('Et la base le garde, parce que les adresses en dependent');
{
  const fondations = lire('supabase/migrations/20261012090100_boutique.sql');
  verifier('la colonne existe toujours', /numero\s+text not null unique/.test(fondations));
  verifier(
    'les adresses de suivi s en servent',
    fs.existsSync(path.join(RACINE, 'src/pages/commandes/suivre/[numero].astro'))
  );
}

bilan('Aucun numero de commande sous les yeux des clientes');
