/**
 * Se déconnecter.
 *
 * En POST seulement : une déconnexion en GET se déclencherait depuis une image
 * posée sur un autre site, et sortirait la visiteuse de son compte sans qu'elle
 * ait rien demandé.
 *
 * ON RÉVOQUE LA SESSION AUPRÈS DE SUPABASE AVANT DE SUPPRIMER LES COOKIES.
 * Supprimer le cookie seul ne ferme rien : le jeton de rafraîchissement reste
 * valable des semaines, donc une copie de l'ancien cookie rouvre le compte. Sur
 * un téléphone partagé, « je me déconnecte » doit vouloir dire « c'est fermé ».
 * Audit du 12 octobre 2026.
 *
 * CETTE PHRASE ÉTAIT FAUSSE JUSQU'AU 8 NOVEMBRE 2026, et c'est l'audit de Cyber
 * de ce jour-là qui l'a vu. La révocation passait par
 * `client.auth.signOut({ scope: 'local' })`. Or `clientSession()` ne pose le
 * jeton que dans un EN-TÊTE : la partie « auth » de supabase-js n'avait aucune
 * session à fermer, elle vidait un stockage vide et rendait la main sans avoir
 * parlé à Supabase. Le jeton de rafraîchissement survivait à la déconnexion.
 *
 * C'est le genre de défaut le plus coûteux : un commentaire décrivait une
 * protection absente, donc personne ne la revérifiait. La leçon est déjà dans
 * la mémoire de Cyber depuis le 26 octobre ; elle vient de se répéter.
 *
 * La révocation passe maintenant par `deconnexionSupabase` (src/lib/rafraichir.ts),
 * une requête HTTP écrite à la main et bornée dans le temps, comme tout ce qui
 * touche `auth` côté serveur dans ce projet.
 */
import type { APIRoute } from 'astro';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { retirerSession, COOKIE_SESSION, jetonDeSession } from '../lib/supabase';
import { COOKIE_PANIER } from '../lib/session';
import { deconnexionSupabase } from '../lib/rafraichir';

export const POST: APIRoute = async (contexte) => {
  const jeton = jetonDeSession(contexte as never);
  if (jeton?.access_token) {
    // Ne lève jamais, et ne dépasse jamais cinq secondes. Son résultat n'est
    // pas lu : quoi qu'il arrive, les cookies partent juste en dessous. Jamais
    // laisser quelqu'une sur une page connectée parce que la révocation a raté.
    await deconnexionSupabase(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, jeton.access_token);
  }

  retirerSession(contexte as never);
  contexte.cookies.delete(COOKIE_PANIER, { path: '/' });
  contexte.cookies.delete(COOKIE_SESSION, { path: '/' });
  return contexte.redirect('/', 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/compte', 303);
