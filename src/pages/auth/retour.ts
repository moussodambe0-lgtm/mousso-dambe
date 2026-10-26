/**
 * Le retour de Google.
 *
 * Google renvoie ici avec un code dans l'adresse. On l'échange contre une
 * session, on pose le cookie, et on envoie la visiteuse au bon endroit : le
 * questionnaire si elle arrive pour la première fois, l'accueil sinon.
 *
 * Trois refus, volontaires :
 *   - une adresse de retour qui ne serait pas la nôtre n'est jamais suivie ;
 *   - un retour qui n'est pas précédé d'un départ est refusé (voir plus bas) ;
 *   - un échec d'échange ne dit pas pourquoi à l'écran. « Google a refusé »
 *     suffit : détailler renseignerait un attaquant sur l'état d'un compte.
 *
 * LE SECOND REFUS, AJOUTÉ PAR CYBER LE 26 OCTOBRE 2026
 *
 * Le secret PKCE tiré par `/auth/google` arrive ici dans un cookie `httpOnly`
 * limité à `/auth`. On exige ce cookie, on l'efface AVANT d'échanger quoi que
 * ce soit (un code ne se rejoue pas), et on le redonne à supabase-js comme
 * stockage.
 *
 * Ce que ça répare : rien ne marchait. Les deux bouts ne parlaient pas la même
 * langue, le secret n'existait pas, et la bibliothèque refusait en 4 ms.
 *
 * Ce que ça protège : un code d'autorisation sans secret n'est attaché à aucun
 * navigateur. Quelqu'un pouvait obtenir un code pour SON compte Google, puis
 * envoyer `…/auth/retour?code=…` sur WhatsApp. Le téléphone qui l'ouvrait se
 * retrouvait connecté au compte de l'envoyeur, et tout ce qui s'écrivait
 * ensuite (le cycle, le journal, les questions à Dambé) allait chez lui.
 * Maintenant, un navigateur qui n'a pas commencé la connexion ne peut pas la
 * terminer.
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { poserSession, baseConfiguree, clientSession } from '../../lib/supabase';
import {
  COOKIE_OAUTH,
  optionsCookieOAuth,
  stockageDansObjet,
  lireStockage,
  porteUnVerificateur,
} from '../../lib/oauth';

export const GET: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/connexion?erreur=pas-de-base', 303);

  // Lu puis effacé tout de suite, quoi qu'il arrive ensuite : un secret de
  // connexion ne sert qu'une fois, et un échec ne doit pas en laisser traîner.
  const brut = contexte.cookies.get(COOKIE_OAUTH)?.value;
  contexte.cookies.delete(COOKIE_OAUTH, { path: optionsCookieOAuth(import.meta.env.PROD).path });

  const code = contexte.url.searchParams.get('code');
  if (!code) return contexte.redirect('/connexion?erreur=google', 303);

  const sac = lireStockage(brut);
  if (!porteUnVerificateur(sac)) {
    // Pas de départ, pas d'arrivée. C'est ici que meurt le lien envoyé à
    // quelqu'un d'autre.
    return contexte.redirect('/connexion?erreur=google', 303);
  }

  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      // Voir src/lib/oauth.ts : a false, notre stockage serait ignore.
      persistSession: true,
      autoRefreshToken: false,
      flowType: 'pkce',
      storage: stockageDansObjet(sac!),
    },
  });

  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data?.session) {
    return contexte.redirect('/connexion?erreur=google', 303);
  }

  poserSession(contexte as never, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  // Première visite : on l'emmène au questionnaire plutôt que sur un accueil
  // qui n'a rien à lui dire.
  const session = clientSession(contexte as never);
  const { data: profil } = session
    ? await session.from('profils').select('questionnaire_fini').eq('id', data.session.user.id).maybeSingle()
    : { data: null };

  return contexte.redirect(profil?.questionnaire_fini ? '/' : '/bienvenue', 303);
};
