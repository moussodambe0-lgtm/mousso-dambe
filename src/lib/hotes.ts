/**
 * Qui répond sur quelle adresse.
 *
 * Décision d'Arthur du 21 octobre 2026 : l'administration est séparée de la
 * plateforme principale, sur son propre sous-domaine, avec le même code et un
 * seul déploiement. Deux adresses, donc deux sessions : le cookie posé sur
 * `admin.moussodambe.bf` n'est pas envoyé à `moussodambe.bf`, et l'inverse non
 * plus, parce qu'un cookie sans `Domain` n'appartient qu'à l'hôte exact qui l'a
 * posé. Se connecter à la boutique ne connecte donc pas à l'administration.
 *
 * Module volontairement pur (aucun import d'Astro), comme `cache.ts` : c'est
 * une règle d'accès, elle doit se tester sans lancer un serveur. Voir
 * supabase/tests/hotes.test.mjs.
 *
 * La barrière réelle reste la base : `est_admin()` et les règles d'accès
 * refusent de répondre à quelqu'un d'autre, quelle que soit l'adresse utilisée.
 * Ce module ajoute une séparation d'adresses par-dessus, il ne la remplace pas.
 * Une page d'administration servie par erreur sur le domaine public afficherait
 * de toute façon « Cet espace n'est pas pour toi ».
 */

/** Les sections réservées à Arthur. Elles ne répondent que sur l'hôte d'admin. */
export const CHEMINS_ADMIN = ['/admin', '/vendeur'];

/**
 * Ce qui doit répondre sur les deux hôtes.
 *
 * Sans `/connexion` et `/auth`, personne ne pourrait entrer dans
 * l'administration : la session de l'hôte d'admin se crée sur l'hôte d'admin.
 * `/vocal` y est parce que l'écran d'un fil fait écouter les notes vocales
 * reçues, et `/deconnexion` pour pouvoir sortir.
 */
export const CHEMINS_PARTAGES = [
  '/connexion',
  '/auth',
  '/deconnexion',
  '/vocal',
  '/404',
  // Le raccourci de développement qui entre dans l'administration sans rien
  // taper (Arthur, le 26 octobre 2026 : « fais que si je clique sur le lien
  // j'ai accès sans mettre mon email [...] c'est en local »). La route
  // elle-même répond 404 en production : il n'y a donc rien à retirer d'ici
  // avant un déploiement, et rien à oublier. Voir src/pages/dev/admin.ts.
  '/dev',
  '/_astro',
  '/_image',
  '/_server-islands',
  '/fonts',
  '/icone',
  '/favicon.svg',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
  '/robots.txt',
];

function dansLaListe(chemin: string, liste: string[]): boolean {
  return liste.some((p) => chemin === p || chemin.startsWith(`${p}/`));
}

/** Un chemin de l'espace d'Arthur (administration ou boutique). */
export function cheminAdmin(chemin: string): boolean {
  return dansLaListe(chemin, CHEMINS_ADMIN);
}

/** Un chemin qui répond sur les deux hôtes. */
export function cheminPartage(chemin: string): boolean {
  return dansLaListe(chemin, CHEMINS_PARTAGES);
}

/**
 * Le nom d'hôte réellement demandé.
 *
 * Derrière Vercel, la requête arrive au serveur avec l'hôte interne : c'est
 * `x-forwarded-host` qui porte le domaine que la personne a tapé. Le prendre en
 * premier, sinon `host`, sinon ce qu'Astro a reconstruit. Le port est retiré,
 * et `admin.localhost:4322` donne donc `admin.localhost`.
 *
 * Un en-tête est fourni par le client : il peut mentir. Ici ce n'est pas grave,
 * parce qu'un hôte forgé ne donne aucun droit (la base décide), il ne change
 * que les pages affichées.
 */
export function hoteDemande(
  entetes: { get(nom: string): string | null },
  replis?: string | null
): string {
  const brut = entetes.get('x-forwarded-host') ?? entetes.get('host') ?? replis ?? '';
  // Un `x-forwarded-host` traversant plusieurs relais peut contenir une liste.
  const premier = brut.split(',')[0]!.trim().toLowerCase();
  // Retirer le port, en laissant les crochets d'une adresse IPv6 tranquilles.
  if (premier.startsWith('[')) return premier.slice(0, premier.indexOf(']') + 1) || premier;
  const sansPort = premier.split(':')[0]!;
  return sansPort;
}

/**
 * Cet hôte est-il celui de l'administration ?
 *
 * Deux façons de l'être, pour que rien ne dépende d'un domaine pas encore
 * acheté : le nom exact posé dans `ADMIN_HOST`, ou le préfixe `admin.`, qui
 * marche aussi bien pour `admin.moussodambe.bf` que pour `admin.localhost` en
 * développement (les navigateurs résolvent tout `*.localhost` vers la machine).
 */
export function estHoteAdmin(hote: string, hoteConfigure?: string | null): boolean {
  const h = (hote ?? '').toLowerCase();
  if (!h) return false;
  const configure = (hoteConfigure ?? '').trim().toLowerCase();
  if (configure && h === configure.split(':')[0]) return true;
  return h === 'admin' || h.startsWith('admin.');
}

/**
 * L'adresse complète de l'administration, construite depuis celle du site.
 *
 * Sert au seul lien qui traverse la frontière : celui de la page « Mon compte »,
 * affiché à Arthur et à personne d'autre (`est_admin()` a déjà répondu non aux
 * autres). Comme les deux adresses ont des sessions séparées, ce lien mène à un
 * écran de connexion : c'est le prix de la séparation, et l'écran le dit.
 *
 * Le protocole et le port sont conservés, pour que cela marche aussi en
 * développement : `http://localhost:4322` donne `http://admin.localhost:4322`.
 * Un éventuel `www.` est retiré, sinon on obtiendrait `admin.www.…`.
 */
export function urlAdmin(origine: string, hoteConfigure?: string | null): string {
  let u: URL;
  try {
    u = new URL(origine);
  } catch {
    return '/vendeur';
  }

  const configure = (hoteConfigure ?? '').trim().toLowerCase();
  if (configure) {
    // Un nom configuré peut déjà porter son port (« admin.localhost:4322 »).
    return `${u.protocol}//${configure}`;
  }

  const hote = u.hostname.toLowerCase();
  if (estHoteAdmin(hote)) return u.origin;
  const sansWww = hote.startsWith('www.') ? hote.slice(4) : hote;
  const port = u.port ? `:${u.port}` : '';
  return `${u.protocol}//admin.${sansWww}${port}`;
}

export type Verdict =
  | { quoi: 'laisser' }
  | { quoi: 'cacher' }
  | { quoi: 'rediriger'; vers: string };

/**
 * Ce qu'il faut faire d'une requête, selon l'hôte et le chemin.
 *
 * - Sur le domaine public, l'administration n'existe pas : `cacher`, donc une
 *   page introuvable. Jamais une redirection vers le sous-domaine, qui
 *   annoncerait son adresse à qui l'ignore.
 * - Sur le sous-domaine d'admin, la plateforme des clientes n'existe pas non
 *   plus : on ne veut pas que le cycle, le journal ou la boutique se promènent
 *   sur une deuxième adresse. Seule exception, la racine, qui mène au tableau
 *   de bord : taper l'adresse courte doit marcher.
 */
export function verdict(
  chemin: string,
  surHoteAdmin: boolean,
  separationActive = true
): Verdict {
  if (!separationActive) return { quoi: 'laisser' };

  if (surHoteAdmin) {
    if (chemin === '/') return { quoi: 'rediriger', vers: '/vendeur' };
    if (cheminAdmin(chemin) || cheminPartage(chemin)) return { quoi: 'laisser' };
    return { quoi: 'cacher' };
  }

  if (cheminAdmin(chemin)) return { quoi: 'cacher' };
  return { quoi: 'laisser' };
}
