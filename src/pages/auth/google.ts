/**
 * Se connecter avec Google.
 *
 * Demande d'Arthur du 12 octobre 2026. Deux raisons de le vouloir ici :
 * c'est deux touches au lieu d'un mot de passe à retenir, et surtout
 * **l'adresse est vérifiée par Google**. Il voulait « le vrai email » : c'est
 * le seul chemin qui le garantit sans obliger chaque fille à ouvrir sa boîte
 * au milieu de son inscription.
 *
 * La route ne fait qu'une chose : demander à Supabase l'adresse de Google et
 * y renvoyer. Le retour est traité par /auth/retour.
 *
 * En POST seulement : une connexion déclenchée par une image posée sur un
 * autre site n'a aucune raison d'exister.
 *
 * LES DEUX BOUTS NE PARLAIENT PAS LA MÊME LANGUE (Cyber, 26 octobre 2026)
 *
 * Cette route partait en mode « implicite », qui ne tire aucun secret, pendant
 * que `/auth/retour` réclamait un secret PKCE. Le retour refusait donc en 4
 * millisecondes, avant même d'appeler le réseau : AUCUNE connexion Google ne
 * pouvait aboutir, et la femme lisait « Réessaie, ou connecte-toi avec ton mot
 * de passe » alors qu'elle n'en a pas.
 *
 * Les deux bouts sont désormais en PKCE, et le secret voyage dans un cookie
 * `httpOnly` limité à `/auth`. Ce n'est pas qu'une réparation : c'est ce qui
 * attache le code d'autorisation AU navigateur qui a commencé. Sans lui,
 * quelqu'un pouvait obtenir un code pour son propre compte Google et faire
 * ouvrir `/auth/retour?code=…` au téléphone d'une autre, qui se retrouvait
 * connectée à son compte et lui écrivait son cycle et son journal. Voir
 * src/lib/oauth.ts.
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { baseConfiguree } from '../../lib/supabase';
import { COOKIE_OAUTH, optionsCookieOAuth, stockageDansObjet, porteUnVerificateur } from '../../lib/oauth';

export const POST: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/connexion?erreur=pas-de-base', 303);

  // Le sac que supabase-js va remplir, et que nous pourrons relire. Son
  // stockage à lui est privé : on ne récupérerait rien.
  const sac: Record<string, string> = {};
  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      // `persistSession: true` est OBLIGATOIRE pour que notre stockage soit
      // pris en compte : a false, supabase-js le jette et garde le sien,
      // prive, et le secret reste introuvable au retour. Voir src/lib/oauth.ts.
      persistSession: true,
      autoRefreshToken: false,
      flowType: 'pkce',
      storage: stockageDansObjet(sac),
    },
  });

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: new URL('/auth/retour', contexte.url.origin).href,
      // Le code revient dans l'adresse, que le serveur peut lire. Sans ce
      // choix, Supabase renvoie le jeton dans l'ancre (#), que le serveur ne
      // voit jamais, et il faudrait du JavaScript pour le rattraper.
      queryParams: { access_type: 'offline', prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return contexte.redirect('/connexion?erreur=google', 303);
  }

  // Pas de secret dans le sac : le retour échouerait de toute façon. Autant
  // le dire ici que renvoyer la visiteuse chez Google pour rien.
  if (!porteUnVerificateur(sac)) {
    return contexte.redirect('/connexion?erreur=google', 303);
  }

  contexte.cookies.set(COOKIE_OAUTH, JSON.stringify(sac), optionsCookieOAuth(import.meta.env.PROD));
  return contexte.redirect(data.url, 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/connexion', 303);
