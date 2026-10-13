/**
 * Les en-têtes de sécurité, sur toutes les réponses.
 *
 * La politique de sécurité du contenu est générée par Astro avec l'empreinte
 * de chaque script (voir astro.config.mjs). Ici on ajoute ce qu'Astro ne pose
 * pas, et on garde la règle la plus importante de cette application : aucune
 * page personnelle ne doit jamais être mise en cache par un intermédiaire, ni
 * par le téléphone.
 *
 * La liste des chemins publics vit dans src/lib/cache.ts, pour être testable.
 * L'accueil « / » n'en fait pas partie : connectée, il affiche son cycle.
 */
import { defineMiddleware } from 'astro:middleware';
import { cheminPublic } from './lib/cache';
import { defautDeConfiguration } from './lib/configuration';
import { PUBLIC_SUPABASE_URL } from 'astro:env/client';
import { MD_CLE_SERVEUR } from 'astro:env/server';

// Vérifié une seule fois au démarrage du serveur : si la mise en ligne est mal
// configurée, aucune page ne doit s'ouvrir. Mieux vaut un site qui dit « pas
// encore prêt » qu'un site qui travaille sans protection.
const DEFAUT = defautDeConfiguration({
  urlSupabase: PUBLIC_SUPABASE_URL,
  cleServeur: MD_CLE_SERVEUR,
  production: import.meta.env.PROD,
});

export const onRequest = defineMiddleware(async (contexte, suite) => {
  if (DEFAUT) {
    return new Response(
      `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Mousso Dambé</title></head><body><h1>L'application n'est pas prête</h1>
<p>${DEFAUT}</p></body></html>`,
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
    );
  }

  const reponse = await suite();
  const chemin = contexte.url.pathname;

  // Dit aux vieux navigateurs ce que frame-ancestors dit aux récents :
  // personne n'affiche cette application dans un cadre. Sans cela, un site
  // pirate superpose un bouton invisible sur « Effacer mes données ».
  reponse.headers.set('X-Frame-Options', 'DENY');
  reponse.headers.set('X-Content-Type-Options', 'nosniff');
  // L'adresse d'une page de cycle ne doit pas partir vers un site extérieur.
  reponse.headers.set('Referrer-Policy', 'same-origin');
  // Le micro ET la position sont autorisés POUR CE SITE SEULEMENT, `(self)`.
  // Les deux ont été fermés pour tout le monde au départ, et les deux ont
  // cassé une fonction au moment précis où on l'a ajoutée : `microphone=()`
  // aurait fait dire « micro refusé » à la dictée et au vocal au médecin, et
  // `geolocation=()` faisait répondre « position refusée » au bouton
  // « Partager ma position » alors qu'elle venait de l'autoriser (défaut
  // signalé par Arthur le 13 octobre 2026 : « le partage de position quand on
  // veut commander ne marche pas »). Un en-tête qui ferme la porte passe
  // AVANT la permission du navigateur : elle a beau dire oui, la page n'a
  // même pas le droit de demander. Un cadre venu d'ailleurs n'y a pas droit,
  // et `frame-ancestors 'none'` empêche déjà qu'on en pose un.
  reponse.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(self), payment=(), usb=()'
  );
  // Un an d'HTTPS obligatoire, posé seulement en production : en local, le
  // site tourne en http et l'en-tête bloquerait le développement.
  if (import.meta.env.PROD) {
    reponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (!cheminPublic(chemin) && !reponse.headers.has('Cache-Control')) {
    // Tout le reste parle d'une personne : rien ne se garde, nulle part.
    reponse.headers.set('Cache-Control', 'private, no-store');
  }

  return reponse;
});
