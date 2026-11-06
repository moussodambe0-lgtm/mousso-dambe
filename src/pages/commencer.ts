/**
 * ENTRER DANS L'APPLICATION, SANS COMPTE.
 *
 * Section 2 du cahier d'Arthur du 12 octobre 2026 : plus d'inscription, plus
 * de mot de passe, plus de bouton Google à l'entrée. On demande le prénom, et
 * rien d'autre.
 *
 * Ce qui se passe ici, et pourquoi c'est fait sur le SERVEUR :
 *   - Supabase crée une identité anonyme. C'est un vrai compte, avec un vrai
 *     jeton signé, mais sans email ni mot de passe.
 *   - Le jeton est posé dans le cookie de session, comme pour n'importe quelle
 *     connexion. Toutes les règles d'accès de la base continuent donc de
 *     marcher sans qu'une seule ligne change : son cycle reste à elle.
 *
 * La décision d'Arthur était « anonyme, mais récupérable » : ses données
 * vivent côté serveur et non dans le téléphone, et elle pourra plus tard
 * attacher un email à cette identité depuis la page Compte, sans rien perdre.
 * Un identifiant gardé seulement dans le téléphone aurait voulu dire : écran
 * cassé, téléphone volé, navigateur nettoyé, tout est perdu.
 *
 * Si elle a déjà une session, on ne lui en crée pas une deuxième : on la
 * renvoie là où elle en était.
 */
import type { APIRoute } from 'astro';
import { clientPublic, poserSession, baseConfiguree } from '../lib/supabase';
import { visiteuse } from '../lib/session';

export const prerender = false;

export const POST: APIRoute = async (astro) => {
  if (!baseConfiguree()) return astro.redirect('/', 303);

  const deja = await visiteuse(astro);
  if (deja) {
    return astro.redirect(deja.questionnaireFini ? '/' : '/bienvenue', 303);
  }

  const { data, error } = await clientPublic(astro).auth.signInAnonymously();

  if (error || !data?.session) {
    // UN ÉCHEC QUI NE DIT RIEN EST UN ÉCHEC QU'ON NE RÉPARE PAS.
    //
    // Arthur, le 6 novembre 2026 : « quand j'appuie Commencer, ça ne marche
    // pas, ça ne m'envoie pas à la page suivante. » Cette ligne renvoyait
    // vers /?entree=impossible sans conserver la moindre trace de la cause,
    // et il a fallu rejouer l'appel à la main contre la base de production
    // pour seulement savoir où chercher. Le motif de Supabase est maintenant
    // écrit dans le journal du serveur.
    //
    // Il est aussi recopié dans l'adresse, et c'est volontaire : les journaux
    // d'exécution de Vercel ne sont pas lisibles par l'API sur ce plan, donc
    // sans cela on ne peut toujours rien diagnostiquer à distance. Ce qui part
    // est un CODE, jamais un message : « anonymous_provider_disabled » dit à
    // qui sait lire qu'un réglage est fermé, et rien sur personne.
    console.error(
      'commencer: signInAnonymously a échoué',
      JSON.stringify({ statut: error?.status ?? null, code: error?.code ?? null, message: error?.message ?? null })
    );
    const code = (error?.code ?? (error?.status ? `http_${error.status}` : 'sans_session'))
      .toString()
      .replace(/[^a-z0-9_]/gi, '')
      .slice(0, 40);
    return astro.redirect(`/?entree=impossible&motif=${code}`, 303);
  }

  poserSession(astro, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  return astro.redirect('/bienvenue', 303);
};

// Une arrivée par un simple lien (ou un lien partagé) ne doit pas créer un
// compte sans qu'on ait rien touché : on renvoie à l'accueil, où le bouton
// « Commencer » poste pour de vrai.
export const GET: APIRoute = ({ redirect }) => redirect('/', 303);
