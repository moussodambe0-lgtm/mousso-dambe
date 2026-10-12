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
    // On ne laisse pas la visiteuse devant une page blanche : l'accueil sait
    // dire que la base n'est pas joignable.
    return astro.redirect('/?entree=impossible', 303);
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
