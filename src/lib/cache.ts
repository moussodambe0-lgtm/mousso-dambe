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
