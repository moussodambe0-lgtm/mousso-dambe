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
