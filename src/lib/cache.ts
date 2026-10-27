/**
 * Ce qui peut être gardé, et ce qui ne doit l'être nulle part.
 *
 * Module volontairement pur (aucun import d'Astro) : c'est la règle la plus
 * importante de l'application et elle doit pouvoir être testée directement,
 * sans lancer un serveur. Voir supabase/tests/cache.test.mjs.
 *
 * Le danger, ici, n'est pas un pirate à l'autre bout du monde : c'est le
 * téléphone qu'on se passe à la maison. Une copie de l'écran du cycle gardée
 * par le navigateur se rouvre hors connexion, après la déconnexion, pour
 * n'importe qui tient l'appareil. Une seule page oubliée dans la liste des
 * pages publiques suffit à rendre fausse la phrase « personne de ton entourage
 * ne peut le voir ».
 */

/**
 * Les chemins qui ne contiennent QUE du catalogue, donc rien de personnel.
 *
 * L'accueil « / » n'en fait PAS partie : connectée, il affiche son jour de
 * cycle, sa phase et la date de ses prochaines règles. Il était dans cette
 * liste jusqu'au 12 octobre 2026, et c'était la faille la plus grave de
 * l'audit de Cyber.
 */
export const CHEMINS_PUBLICS = [
  '/boutique',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/fonts',
  '/icone',
  // Les photos jointes aux avis : publiques comme l'avis qu'elles
  // accompagnent, et immuables, donc faites pour etre gardees.
  '/photo-avis',
];

/** Un chemin qui ne parle de personne, et qu'un cache partagé peut garder. */
export function cheminPublic(chemin: string): boolean {
  return CHEMINS_PUBLICS.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/**
 * Le téléphone a-t-il le droit de garder cette réponse en réserve ?
 *
 * Seule une page qui se déclare explicitement cacheable par le réseau de
 * diffusion (`s-maxage`) est gardée. Ne JAMAIS se contenter de chercher le mot
 * « public » : un hébergeur qui ne trouve aucun en-tête en pose un lui-même, et
 * celui de Vercel est « public, max-age=0, must-revalidate ». Avec cette règle
 * trop large, toute page sans en-tête, l'accueil personnalisé compris, devenait
 * gardable.
 *
 * La même règle est recopiée dans public/sw.js, qui ne peut rien importer
 * (c'est un script de service worker, pas un module). Le test vérifie que les
 * deux disent la même chose.
 */
export function gardableParLeTelephone(cacheControl: string | null | undefined): boolean {
  const c = (cacheControl ?? '').toLowerCase();
  if (!c) return false;
  if (c.includes('no-store') || c.includes('private') || c.includes('no-cache')) return false;
  return c.includes('s-maxage');
}

/**
 * Cette page du catalogue peut-elle être gardée par le réseau de diffusion ?
 *
 * TROUVÉ PAR CYBER LE 26 OCTOBRE 2026, et rejoué sur le site local : les deux
 * pages de la boutique sortaient avec `public, s-maxage=120` dès qu'il n'y
 * avait pas de cookie de SESSION. Mais le compteur du panier est écrit dans ces
 * pages (« Mon panier, 3 articles », et la pastille du chiffre), et il vient
 * d'un AUTRE cookie, `md_panier`, que personne ne regardait. Vercel garde donc
 * la page sous la seule adresse `/boutique`, sans `Vary` : la visiteuse
 * suivante, qui n'a rien mis dans son panier, voyait le compteur de la
 * précédente, et celle qui venait d'ajouter un article voyait zéro et croyait
 * avoir perdu son panier.
 *
 * Ce n'est pas une donnée intime qui fuit, c'est un nombre. Mais le commentaire
 * de la page affirmait « elles ne contiennent donc rien de personnel, jamais »,
 * et cette phrase était devenue fausse. Et sur une 3G comptée, un panier qui
 * semble vide est une vente perdue.
 *
 * La règle tient en une phrase : on ne garde une page du catalogue que
 * lorsqu'elle ne parle de PERSONNE, ni par la session, ni par le panier.
 *
 * `avaitUnCookie` est relevé AVANT de lire la session : si le cookie était
 * périmé, la page demande au navigateur de l'effacer, et une réponse qui pose
 * un cookie ne doit jamais être gardée par un cache partagé.
 */
export function catalogueGardable(etat: {
  connectee: boolean;
  avaitUnCookie: boolean;
  articlesAuPanier: number;
}): boolean {
  if (etat.connectee || etat.avaitUnCookie) return false;
  return (etat.articlesAuPanier ?? 0) === 0;
}

/** L'en-tête à poser sur une page du catalogue, selon ce qu'elle montre. */
export function enteteCatalogue(etat: {
  connectee: boolean;
  avaitUnCookie: boolean;
  articlesAuPanier: number;
}): string {
  return catalogueGardable(etat)
    ? 'public, s-maxage=120, stale-while-revalidate=600'
    : 'private, no-store';
}
