/**
 * Effacer toute la discussion avec Dambé.
 *
 * En POST seulement : un effacement en GET partirait au premier robot qui suit
 * les liens de la page.
 */
import type { APIRoute } from 'astro';
import { clientSession } from '../../lib/supabase';

export const POST: APIRoute = async (contexte) => {
  const client = clientSession(contexte as never);
  if (!client) return contexte.redirect('/connexion', 303);
  await client.rpc('effacer_mon_fil');
  return contexte.redirect('/dambe', 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/dambe', 303);
