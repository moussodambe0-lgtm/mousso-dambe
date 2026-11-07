/**
 * « Où aller après », et pourquoi on ne fait jamais confiance à l'adresse.
 *
 * Les pages de compte se passent une destination dans l'adresse :
 * `/connexion?suite=/compte`. Une fois connectée, la page l'y envoie. C'est
 * commode, et c'est exactement le mécanisme qui sert à voler des comptes.
 *
 * LA FAILLE QUE CETTE FONCTION FERME. Sans vérification, n'importe qui peut
 * envoyer sur WhatsApp un lien qui ressemble au vrai :
 *
 *     https://www.moussodambe.com/connexion?suite=https://moussodambe.co/vol
 *
 * Le début est authentique, le domaine est le bon, le cadenas est là. Elle se
 * connecte pour de vrai sur notre site, puis se retrouve projetée sur une
 * copie qui lui redemande son mot de passe « parce que ça n'a pas marché ».
 * Elle le retape, convaincue d'être chez nous : elle vient de traverser la
 * porte d'entrée de Mousso Dambé pour arriver ailleurs. Cela s'appelle une
 * redirection ouverte, et c'est la faille la plus facile à exploiter sur un
 * écran de connexion.
 *
 * Ici, cette attaque vise des femmes dont le compte contient leur cycle et
 * leur journal, et dont le danger n'est pas un escroc lointain mais parfois
 * quelqu'un de proche, qui connaît leur numéro et sait quoi leur écrire.
 *
 * CE QU'ON ACCEPTE : un chemin de CE site, et rien d'autre. Il doit commencer
 * par une seule barre oblique.
 *
 * CE QU'ON REFUSE, et chaque refus correspond à une tentative connue :
 *   - `https://ailleurs.bf/…`   un autre site, en clair ;
 *   - `//ailleurs.bf/…`         un autre site, sans écrire le protocole : le
 *                               navigateur comprend « https://ailleurs.bf » ;
 *   - `/\ailleurs.bf`           la même chose avec une barre inversée, que
 *                               plusieurs navigateurs traitent comme « // » ;
 *   - `javascript:…`            du code, exécuté dans sa page ;
 *   - `/connexion`, `/inscription` : la renvoyer d'où elle vient la ferait
 *                               tourner en rond, parfois sans fin.
 *
 * Tout ce qui est refusé rend la destination par défaut. On ne signale rien :
 * une adresse bricolée vient d'un lien reçu, pas d'elle.
 */

/** Les pages où l'on ne renvoie jamais : elle y tournerait en boucle. */
const BOUCLES = ['/connexion', '/inscription', '/ouverture'];

export function suiteSure(brut: string | null | undefined, defaut = '/compte'): string {
  const voulu = String(brut ?? '').trim();
  if (!voulu) return defaut;

  // Une seule barre au début, et rien qui ressemble à un début de domaine.
  // On regarde le deuxième caractère nous-mêmes au lieu d'écrire une
  // expression rationnelle plus courte mais illisible : c'est ce caractère,
  // et lui seul, qui fait la différence entre « chez nous » et « ailleurs ».
  if (voulu[0] !== '/') return defaut;
  if (voulu[1] === '/' || voulu[1] === '\\') return defaut;

  // Un caractère de contrôle (retour à la ligne, tabulation) peut couper
  // l'en-tête de redirection en deux et faire écrire ce qu'on veut au
  // navigateur. Aucune adresse légitime n'en contient.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(voulu)) return defaut;

  const chemin = voulu.split('?')[0]!.split('#')[0]!;
  if (BOUCLES.includes(chemin)) return defaut;

  return voulu;
}
