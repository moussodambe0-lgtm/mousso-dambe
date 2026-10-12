/**
 * Se déconnecter.
 *
 * En POST seulement : une déconnexion en GET se déclencherait depuis une image
 * posée sur un autre site, et sortirait la visiteuse de son compte sans qu'elle
 * ait rien demandé.
 */
import type { APIRoute } from 'astro';
import { retirerSession, COOKIE_SESSION } from '../lib/supabase';
import { COOKIE_PANIER } from '../lib/session';

export const POST: APIRoute = (contexte) => {
  retirerSession(contexte as never);
  contexte.cookies.delete(COOKIE_PANIER, { path: '/' });
  contexte.cookies.delete(COOKIE_SESSION, { path: '/' });
  return contexte.redirect('/', 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/compte', 303);
