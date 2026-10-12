/**
 * Les en-têtes de sécurité, sur toutes les réponses.
 *
 * La politique de sécurité du contenu est générée par Astro avec l'empreinte
 * de chaque script (voir astro.config.mjs). Ici on ajoute ce qu'Astro ne pose
 * pas, et on garde la règle la plus importante de cette application : aucune
 * page personnelle ne doit jamais être mise en cache par un intermédiaire.
 */
import { defineMiddleware } from 'astro:middleware';

/** Les chemins qui ne contiennent QUE du catalogue, donc rien de personnel. */
const PUBLICS = ['/boutique', '/favicon.svg', '/manifest.webmanifest', '/fonts', '/icone'];

export const onRequest = defineMiddleware(async (contexte, suite) => {
  const reponse = await suite();
  const chemin = contexte.url.pathname;

  // Dit aux vieux navigateurs ce que frame-ancestors dit aux récents :
  // personne n'affiche cette application dans un cadre. Sans cela, un site
  // pirate superpose un bouton invisible sur « Effacer mes données ».
  reponse.headers.set('X-Frame-Options', 'DENY');
  reponse.headers.set('X-Content-Type-Options', 'nosniff');
  // L'adresse d'une page de cycle ne doit pas partir vers un site extérieur.
  reponse.headers.set('Referrer-Policy', 'same-origin');
  reponse.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  // Un an d'HTTPS obligatoire, posé seulement en production : en local, le
  // site tourne en http et l'en-tête bloquerait le développement.
  if (import.meta.env.PROD) {
    reponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const estPublic = PUBLICS.some((p) => chemin === p || chemin.startsWith(`${p}/`)) || chemin === '/';
  if (!estPublic && !reponse.headers.has('Cache-Control')) {
    // Tout le reste parle d'une personne : rien ne se garde, nulle part.
    reponse.headers.set('Cache-Control', 'private, no-store');
  }

  return reponse;
});
