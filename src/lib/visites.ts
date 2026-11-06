/**
 * Ce qui compte comme une visite, et ce qui n'en est pas une.
 *
 * Arthur, le 5 novembre 2026 : « je dois pouvoir voir le nombre de personnes
 * qui sont venues sur la plateforme, qui ont visité la plateforme ».
 *
 * Module volontairement pur, sans aucun import d'Astro, pour la même raison que
 * `cache.ts` : cette règle décide de ce qu'on enregistre, et elle doit pouvoir
 * être lue et vérifiée sans lancer un serveur.
 *
 * LE PIÈGE QU'IL FAUT ÉVITER. Le middleware voit passer TOUT : les pages, mais
 * aussi les feuilles de style, les polices, les photos de produits, les notes
 * vocales, les icônes. Compter tout cela ferait dire « 4 000 visites » un jour
 * où quarante personnes sont venues. Et compter les photos reviendrait à
 * enregistrer qu'un vocal a été écouté, ce qui est une information sur une
 * personne, pas sur la fréquentation.
 *
 * On ne compte donc QUE les pages qu'une femme ouvre en naviguant.
 */

/**
 * Les préfixes qui ne sont pas des pages : fichiers, images, sons, routes de
 * service. Tout ce qui est servi à la demande d'une page déjà comptée.
 */
const PAS_UNE_PAGE = [
  '/_astro',
  '/_image',
  '/_server-islands',
  '/api',
  '/fonts',
  '/avatars',
  '/produits',
  '/photo-avis',
  '/vocal',
  '/icone',
  '/dev',
  '/favicon',
  '/manifest',
  '/sw.js',
  '/robots.txt',
];

/** Cette adresse est-elle une page ouverte par quelqu'un ? */
export function estPageComptable(chemin: string): boolean {
  if (PAS_UNE_PAGE.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return false;
  // Un chemin avec une extension est un fichier, quelle qu'elle soit : on ne
  // liste pas les extensions une par une, elles finiraient par diverger.
  const dernier = chemin.slice(chemin.lastIndexOf('/') + 1);
  if (dernier.includes('.')) return false;
  return true;
}

/**
 * Le temps maximum qu'un comptage a le droit de coûter à une visiteuse.
 *
 * POURQUOI CETTE LIMITE EXISTE, et pourquoi il ne faut pas la retirer.
 *
 * Le 6 novembre 2026, le site a rendu « 504 FUNCTION_INVOCATION_TIMEOUT » sur
 * le téléphone d'Arthur. La cause était ce comptage, ajouté la veille : il
 * partait sur CHAQUE page, en attente bloquante, et il était entouré d'un
 * `try/catch`. Or un `try/catch` attrape une erreur, il n'attrape pas une
 * lenteur. Quand la base tardait, la page attendait sans limite, jusqu'à ce
 * que Vercel tue la fonction au bout de ses 15 secondes (`maxDuration` dans
 * astro.config.mjs). Une visiteuse voyait une page d'erreur, et la suivante
 * voyait le site marcher : c'est ce qui l'a rendu si difficile à trouver.
 *
 * La règle qui en sort, et qui vaut au-delà de ce fichier : UN COMPTEUR NE
 * DOIT JAMAIS POUVOIR RETARDER UNE PAGE. Savoir combien de femmes sont venues
 * est utile ; le leur faire payer en attente ne l'est pas. Perdre un passage
 * dans la statistique ne coûte rien, perdre une visiteuse coûte tout.
 *
 * 500 ms est large : la base répond d'ordinaire bien en dessous. Cette limite
 * ne se déclenche donc que dans le cas pathologique, celui qui cassait la page.
 */
export const DELAI_COMPTAGE_MS = 500;

/**
 * Compter un passage sans jamais faire attendre la visiteuse.
 *
 * Deux protections, et elles sont différentes :
 *   - le signal d'abandon coupe la requête HTTP elle-même vers la base, pour
 *     ne pas laisser une connexion ouverte derrière soi ;
 *   - la course contre la montre garantit que cette fonction rend la main,
 *     même si la bibliothèque ignorait le signal.
 *
 * Elle ne lève jamais d'exception et ne rend rien : l'appelant n'a rien à
 * décider. Le booléen rendu dit seulement si le comptage a abouti, et ne sert
 * qu'aux tests.
 */
export async function compterPassage(
  client: { rpc: (nom: string, args: Record<string, unknown>) => PromesseAbandonnable },
  nouvelle: boolean,
  delaiMs: number = DELAI_COMPTAGE_MS
): Promise<boolean> {
  try {
    const appel = client.rpc('enregistrer_passage', { p_nouvelle: nouvelle });
    // `abortSignal` n'existe que sur le constructeur de requêtes de
    // supabase-js. On ne s'y fie pas : s'il manque, la course suffit.
    const lance =
      typeof appel.abortSignal === 'function'
        ? appel.abortSignal(AbortSignal.timeout(delaiMs))
        : appel;

    // Pas de `unref()` sur ce minuteur : il doit tenir la boucle d'évènements
    // le temps de la course, sinon Node peut rendre la main avant que la
    // course ait tranché, et la promesse ne se résout jamais. Un demi-seconde
    // retenue est sans conséquence ; une promesse qui ne se résout pas, non.
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const trancher = new Promise<false>((resoudre) => {
      minuteur = setTimeout(() => resoudre(false), delaiMs);
    });

    try {
      return await Promise.race([Promise.resolve(lance).then(() => true), trancher]);
    } finally {
      // La base a répondu à temps : on n'attend pas la fin du minuteur pour
      // autant, sinon chaque page garderait un minuteur vivant pour rien.
      if (minuteur) clearTimeout(minuteur);
    }
  } catch {
    // Base absente, fonction pas encore posée, réseau coupé, requête annulée :
    // aucun de ces cas ne regarde la visiteuse.
    return false;
  }
}

/** Ce que `rpc()` rend : une promesse qui sait parfois s'abandonner. */
type PromesseAbandonnable = PromiseLike<unknown> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<unknown>;
};

/** Le cookie qui dit si ce navigateur a déjà été compté aujourd'hui. */
export const COOKIE_JOUR = 'md_jour';

/**
 * La date du jour, telle qu'elle est rangée dans le cookie : AAAA-MM-JJ.
 *
 * Calculée sur l'heure LOCALE et non en UTC. Ouagadougou est à UTC+0, donc les
 * deux coïncident aujourd'hui ; le jour où un serveur tournera ailleurs, c'est
 * le jour de la visiteuse qui doit compter, pas celui de la machine.
 */
export function jourCourant(maintenant: Date = new Date()): string {
  const a = maintenant.getFullYear();
  const m = String(maintenant.getMonth() + 1).padStart(2, '0');
  const j = String(maintenant.getDate()).padStart(2, '0');
  return `${a}-${m}-${j}`;
}
