/**
 * La porte de l'espace vendeur, pour Arthur et pour lui seul.
 *
 * Il se connecte avec son adresse, ouvre cette route une fois, et la base lui
 * donne la place si — et seulement si — son adresse est exactement celle
 * posée dans les réglages, et qu'elle est vérifiée. Tout le reste est refusé
 * par `reclamer_admin()`, pas par cette page.
 *
 * En POST seulement : une route qui donne des droits ne doit pas pouvoir être
 * déclenchée par une image posée sur un autre site, ni par un robot qui suit
 * un lien.
 */
import type { APIRoute } from 'astro';
import { clientSession, baseConfiguree } from '../../lib/supabase';

export const POST: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/', 303);

  const origine = contexte.request.headers.get('origin');
  if (origine && origine !== contexte.url.origin) return contexte.redirect('/compte', 303);

  const client = clientSession(contexte as never);
  if (!client) return contexte.redirect('/connexion', 303);

  const { data } = await client.rpc('reclamer_admin');
  if (data?.ok) return contexte.redirect('/vendeur', 303);
  return contexte.redirect('/compte?ok=pas-admin', 303);
};

// En GET, on ne donne rien : on renvoie simplement au compte.
export const GET: APIRoute = (contexte) => contexte.redirect('/compte', 303);
