/**
 * Le va-et-vient de la connexion Google, et le secret qui doit le traverser.
 *
 * LE PROBLÈME, TROUVÉ PAR CYBER LE 26 OCTOBRE 2026
 *
 * `signInWithOAuth` en mode PKCE tire un secret au hasard (le « vérificateur »),
 * en garde une empreinte chez Google, et range le secret dans le stockage du
 * client supabase-js. Au retour, `exchangeCodeForSession` a besoin de ce même
 * secret pour prouver que c'est bien le navigateur qui a commencé qui termine.
 *
 * Or le site est rendu sur le serveur : il n'y a pas de stockage de navigateur.
 * supabase-js se replie alors sur un objet EN MÉMOIRE, créé par client et pour
 * lui seul. `/auth/google` crée un client, `/auth/retour` en crée un autre :
 * le secret du premier n'existe plus pour le second. Essayé hors ligne, la
 * bibliothèque refuse en 4 millisecondes, avant même d'appeler le réseau :
 * « PKCE code verifier not found in storage ». Autrement dit, AUCUNE connexion
 * Google ne pouvait aboutir, et la femme tombait sur « Réessaie, ou
 * connecte-toi avec ton mot de passe » alors qu'elle n'en a pas.
 *
 * CE QUE FAIT CE MODULE
 *
 * Il fait voyager ce stockage dans un cookie, entre l'aller et le retour. Le
 * cookie est `httpOnly` (aucun script de la page ne le lit), limité au chemin
 * `/auth` (il ne part avec aucune autre page), vit dix minutes, et s'efface au
 * premier usage.
 *
 * UN PIÈGE QUI A COÛTÉ UNE DEMI-HEURE, ET QUI DOIT RESTER ÉCRIT
 *
 * Donner `storage` à supabase-js ne suffit PAS : avec `persistSession: false`,
 * la bibliothèque jette le stockage fourni et se rabat sur le sien, privé
 * (GoTrueClient.js, la branche `else` de `if (this.persistSession)`). Vérifié
 * en comparant les deux objets : `client.auth.storage === le mien` répondait
 * faux, et le sac restait vide alors que l'adresse d'autorisation portait bien
 * un `code_challenge`. Il faut donc `persistSession: true` ET notre stockage,
 * exactement comme le fait le paquet officiel `@supabase/ssr` avec des cookies.
 * C'est sans danger ici : le sac ne vit que le temps d'une requête, et la
 * session, elle, est posée par `poserSession` dans son propre cookie.
 *
 * ET POURQUOI C'EST AUSSI UNE PROTECTION, PAS SEULEMENT UNE RÉPARATION
 *
 * Sans secret à vérifier, un code d'autorisation n'est attaché à aucun
 * navigateur. Quelqu'un pourrait commencer une connexion avec SON compte
 * Google, récupérer le code, et faire ouvrir `/auth/retour?code=…` au
 * navigateur de quelqu'un d'autre : celle-ci se retrouverait connectée au
 * compte de l'autre, et tout ce qu'elle écrirait ensuite (son cycle, son
 * journal, ses questions) irait chez lui. Dans cette application, où le danger
 * est le téléphone qu'on se passe à la maison et le lien reçu sur WhatsApp,
 * ce n'est pas une hypothèse d'école.
 *
 * Avec ce module, le retour exige le cookie : un navigateur qui n'a pas
 * commencé la connexion ne peut pas la terminer, et le secret rend le code
 * inutilisable ailleurs.
 */

/** Le cookie qui porte le stockage de supabase-js entre l'aller et le retour. */
export const COOKIE_OAUTH = 'md_oauth';

/**
 * Le cookie ne part que vers `/auth`.
 *
 * `sameSite: 'lax'` est nécessaire et suffisant : Google nous renvoie par une
 * navigation GET de premier niveau, le seul cas où un cookie « lax » part avec
 * une requête venue d'ailleurs. En `strict`, le cookie ne reviendrait pas et la
 * connexion échouerait à tous les coups.
 */
export function optionsCookieOAuth(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 600,
  } as const;
}

/** Le stockage que supabase-js attend : trois méthodes sur un objet simple. */
export interface StockageSimple {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

/**
 * Un stockage qui écrit dans l'objet qu'on lui donne, pour qu'on puisse le
 * relire ensuite et le ranger dans le cookie.
 *
 * supabase-js fournit déjà un stockage en mémoire, mais il le garde pour lui :
 * on ne peut pas récupérer ce qu'il y a mis. D'où ces quinze lignes.
 */
export function stockageDansObjet(sac: Record<string, string>): StockageSimple {
  return {
    getItem: (cle) => (Object.prototype.hasOwnProperty.call(sac, cle) ? sac[cle]! : null),
    setItem: (cle, valeur) => {
      sac[cle] = String(valeur);
    },
    removeItem: (cle) => {
      delete sac[cle];
    },
  };
}

/**
 * Le contenu du cookie, relu sans jamais faire confiance à ce qu'il contient.
 *
 * Rend `null` si ce n'est pas un objet de chaînes, si c'est vide, ou si c'est
 * démesuré : un cookie se bricole, et ce qui en sort va dans une bibliothèque.
 */
export function lireStockage(brut: string | undefined | null): Record<string, string> | null {
  if (!brut || brut.length > 4000) return null;
  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return null;
  const propre: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(lu as Record<string, unknown>)) {
    if (typeof cle !== 'string' || cle.length > 200) return null;
    if (typeof valeur !== 'string' || valeur.length > 2000) return null;
    propre[cle] = valeur;
  }
  return Object.keys(propre).length > 0 ? propre : null;
}

/**
 * Ce stockage contient-il bien un secret de connexion en cours ?
 *
 * On ne se contente pas d'un cookie présent : on veut la trace d'un vrai départ
 * de connexion. supabase-js nomme cette clé avec le suffixe `code-verifier`.
 * Si la bibliothèque changeait ce nom un jour, cette fonction répondrait non et
 * le retour serait refusé : un refus visible vaut mieux qu'une protection qui
 * s'évapore en silence.
 */
export function porteUnVerificateur(stockage: Record<string, string> | null): boolean {
  if (!stockage) return false;
  return Object.entries(stockage).some(
    ([cle, valeur]) => /code-verifier/i.test(cle) && typeof valeur === 'string' && valeur.length >= 20
  );
}
