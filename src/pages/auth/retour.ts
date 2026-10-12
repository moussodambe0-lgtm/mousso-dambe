/**
 * Le retour de Google.
 *
 * Google renvoie ici avec un code dans l'adresse. On l'échange contre une
 * session, on pose le cookie, et on envoie la visiteuse au bon endroit : le
 * questionnaire si elle arrive pour la première fois, l'accueil sinon.
 *
 * Deux refus, volontaires :
 *   - une adresse de retour qui ne serait pas la nôtre n'est jamais suivie ;
 *   - un échec d'échange ne dit pas pourquoi à l'écran. « Google a refusé »
 *     suffit : détailler renseignerait un attaquant sur l'état d'un compte.
 */
import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { poserSession, baseConfiguree, clientSession } from '../../lib/supabase';

export const GET: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/connexion?erreur=pas-de-base', 303);

  const code = contexte.url.searchParams.get('code');
  if (!code) return contexte.redirect('/connexion?erreur=google', 303);

  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' },
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
