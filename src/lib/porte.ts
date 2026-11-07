/**
 * Ce qu'on fait quand une page demande un compte et qu'elle n'en a pas.
 *
 * Arthur, le 7 novembre 2026, après avoir touché « Discussions » :
 *
 *   « Quand je tape là-bas, ça me renvoie sur une page "se connecter", et les
 *     menus qui étaient en bas, que ce soit compte, accueil, tout ça
 *     disparaît. Pour quitter la page je suis obligé d'appuyer sur un truc en
 *     haut. C'est comme si c'était un truc différent. Ce n'est pas normal. On
 *     ne doit pas me forcer comme ça à me connecter : on doit mettre les deux
 *     options, se connecter, s'inscrire, avec la mascotte en haut. »
 *
 * CE QUI SE PASSAIT. Chaque page fermée faisait `redirect('/connexion')`.
 * Trois conséquences, et les trois sont mauvaises :
 *
 *   1. L'ADRESSE CHANGEAIT. Elle n'était plus sur /discussions mais sur
 *      /connexion, donc la barre du bas n'avait plus d'onglet à allumer et
 *      disparaissait. L'écran devenait « un truc différent », exactement comme
 *      il le dit.
 *   2. ON LUI DEMANDAIT DE SE CONNECTER SANS LUI PROPOSER DE S'INSCRIRE.
 *      Celle qui n'a jamais eu de compte n'avait aucune porte : elle cherchait
 *      « s'inscrire » et ne voyait que « se connecter ».
 *   3. LE BOUTON « PRÉCÉDENT » LA RENVOYAIT ICI. Elle revenait sur
 *      /discussions, qui la rejetait sur /connexion : une boucle dont on ne
 *      sort qu'en fermant l'application.
 *
 * CE QU'ON FAIT À LA PLACE. `Astro.rewrite` affiche l'accueil du compte SANS
 * CHANGER L'ADRESSE. Elle reste sur /discussions : la barre du bas garde son
 * onglet allumé, « précédent » la ramène d'où elle vient, et l'écran montre
 * la mascotte avec les deux boutons. C'est la mécanique de Jia, et c'est ce
 * qu'Arthur a demandé.
 *
 * POURQUOI UNE FONCTION PLUTÔT QUE LA MÊME LIGNE RECOPIÉE DOUZE FOIS. Parce
 * qu'une ligne recopiée douze fois finit par diverger : il en resterait une
 * qui redirige, et personne ne saurait laquelle avant qu'une femme tombe
 * dessus. La liste des pages concernées est vérifiée par
 * supabase/tests/porte.test.mjs.
 */
import type { AstroGlobal } from 'astro';

/** L'écran d'accueil du compte, affiché à la place de la page demandée. */
export const ACCUEIL_VISITEUSE = '/compte/visiteur';

/**
 * Rend la réponse à renvoyer quand la page demande un compte.
 *
 * On ne rend PAS une redirection : l'adresse doit rester celle de la page
 * demandée, sinon la barre du bas s'éteint et le bouton « précédent » boucle.
 */
export function sansCompte(astro: AstroGlobal): Promise<Response> {
  // `rewrite` rend une promesse : Astro l'attend lui-même quand la page la
  // renvoie, il n'y a donc rien à attendre ici.
  return astro.rewrite(ACCUEIL_VISITEUSE);
}
