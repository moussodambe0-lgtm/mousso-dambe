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
import { verdict } from './lib/hotes';
import { defautDeConfiguration } from './lib/configuration';
import { estPageComptable, jourCourant, compterPassage, COOKIE_JOUR } from './lib/visites';
import { clientPublic, clientSession, baseConfiguree } from './lib/supabase';
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

  const chemin = contexte.url.pathname;

  // ICI, CE DÉPÔT N'EST QUE LA PLATEFORME DES CLIENTES (7 novembre 2026).
  //
  // L'administration a quitté ce dépôt pour le sien, `mousso-dambe-admin`,
  // comme Jia et jia-admin. Décision d'Arthur : « de la même manière que Jia
  // est séparé de jia-admin, je veux la même chose pour mousso dambe ».
  //
  // La question « est-on sur l'hôte admin » n'a donc plus de sens à poser : la
  // réponse est non par construction, et les pages d'administration n'existent
  // plus dans ce dépôt. `verdict` est gardé tel quel, avec ses essais
  // (supabase/tests/hotes.test.mjs), et continue de répondre « introuvable »
  // à /admin et /vendeur : une deuxième serrure derrière une porte murée ne
  // coûte rien, et protège le jour où quelqu'un recréerait une de ces pages
  // ici par mégarde.
  const surHoteAdmin = false;
  const quoiFaire = verdict(chemin, surHoteAdmin);

  let reponse: Response;
  if (quoiFaire.quoi === 'rediriger') {
    reponse = contexte.redirect(quoiFaire.vers, 302);
  } else if (quoiFaire.quoi === 'cacher') {
    // Introuvable, et non « interdit » : sur le domaine public, répondre 403 à
    // /admin reviendrait à confirmer que cet espace existe. La vraie page 404
    // est servie pour que l'écran reste celui de l'application.
    const rendue = await contexte.rewrite('/404');
    reponse = new Response(rendue.body, { status: 404, headers: rendue.headers });
  } else {
    reponse = await suite();

    // ---- COMPTER LA VISITE -------------------------------------------------
    //
    // Arthur, le 5 novembre 2026 : « je dois pouvoir voir le nombre de
    // personnes qui sont venues sur la plateforme ».
    //
    // QUATRE CONDITIONS, et chacune évite un chiffre faux :
    //   - sur l'adresse des clientes seulement : les allées et venues d'Arthur
    //     dans sa propre gestion ne sont pas de la fréquentation ;
    //   - sur une vraie page, jamais sur une police, une photo ou une note
    //     vocale (voir lib/visites.ts) ;
    //   - sur une réponse qui s'est bien passée : une page introuvable n'est
    //     pas une visite ;
    //   - avec une base branchée, sinon l'appel échouerait à chaque page.
    //
    // Le cookie `md_jour` ne contient qu'une date. Il ne sert qu'à savoir si ce
    // navigateur a déjà été compté aujourd'hui, et il ne permet de reconnaître
    // personne, ni d'un jour à l'autre, ni dans la journée.
    //
    // LE COMPTAGE NE PEUT PLUS RETARDER LA PAGE. Il passe par
    // `compterPassage`, qui abandonne au bout d'un demi-seconde et ne lève
    // jamais rien. Le 6 novembre 2026, l'appel direct qui se trouvait ici a
    // fait rendre « 504 FUNCTION_INVOCATION_TIMEOUT » au site : le `try/catch`
    // attrapait les erreurs mais pas la lenteur, et la page attendait la base
    // jusqu'à ce que Vercel tue la fonction. Le détail est en tête de
    // lib/visites.ts, avec la règle qui en découle.
    if (
      !surHoteAdmin &&
      baseConfiguree() &&
      estPageComptable(chemin) &&
      reponse.status >= 200 &&
      reponse.status < 400
    ) {
      const aujourdhui = jourCourant();
      const dejaVue = contexte.cookies.get(COOKIE_JOUR)?.value === aujourdhui;

      // Le cookie est posé AVANT le comptage, et sans dépendre de lui. Une
      // base lente ne doit pas faire recompter ce navigateur à chaque page :
      // c'est ce qui transformait une base poussive en base matraquée.
      if (!dejaVue) {
        contexte.cookies.set(COOKIE_JOUR, aujourdhui, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: import.meta.env.PROD,
          // Deux jours : assez pour couvrir un changement de date pendant
          // qu'une page est ouverte, trop court pour servir à autre chose.
          maxAge: 60 * 60 * 48,
        });
      }

      // Le client de la session quand elle existe : c'est lui qui porte
      // l'identité, et la fonction en a besoin pour marquer la présence du
      // compte. Sans session, le client public suffit à compter la page.
      const client = clientSession(contexte as never) ?? clientPublic(contexte as never);
      await compterPassage(client as never, !dejaVue);
    }
  }

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
