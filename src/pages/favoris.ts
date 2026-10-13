/**
 * Mettre un produit en favori, ou le retirer : un cœur sur la fiche produit.
 *
 * Une seule route, un seul geste qui bascule. La base décide de tout (le
 * produit existe-t-il, est-il en vente, y en a-t-il déjà trop) ; ici on vérifie
 * seulement d'où vient la requête et que c'est bien un nom de produit.
 */
import type { APIRoute } from 'astro';
import { clientSession } from '../lib/supabase';

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });

export const POST: APIRoute = async (contexte) => {
  // `checkOrigin` d'Astro ne couvre que les formulaires : on vérifie nous-mêmes
  // qu'un corps JSON vient bien de ce site.
  const origine = contexte.request.headers.get('origin');
  if (origine && origine !== contexte.url.origin) return json({ ok: false, erreur: 'acces_refuse' }, 403);

  const client = clientSession(contexte as never);
  if (!client) return json({ ok: false, erreur: 'connexion_requise' }, 401);

  let corps: { slug?: unknown };
  try {
    corps = await contexte.request.json();
  } catch {
    return json({ ok: false, erreur: 'erreur' }, 400);
  }

  // Un nom de produit : des lettres, des chiffres, des tirets. Rien d'autre.
  const slug = typeof corps.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(corps.slug) ? corps.slug : '';
  if (!slug) return json({ ok: false, erreur: 'produit_inconnu' }, 400);

  const { data, error } = await client.rpc('basculer_favori', { p_slug: slug });
  if (error || !data?.ok) return json({ ok: false, erreur: data?.erreur ?? 'erreur' }, 400);
  return json({ ok: true, favori: !!data.favori });
};

// Une bascule en GET partirait au premier robot qui suit un lien.
export const GET: APIRoute = (contexte) => contexte.redirect('/boutique', 303);
