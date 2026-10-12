/**
 * Se déconnecter.
 *
 * En POST seulement : une déconnexion en GET se déclencherait depuis une image
 * posée sur un autre site, et sortirait la visiteuse de son compte sans qu'elle
 * ait rien demandé.
 *
 * On révoque la session auprès de Supabase AVANT de supprimer les cookies.
 * Supprimer le cookie seul ne fermait rien : le jeton de rafraîchissement
 * restait valable des semaines, donc une copie de l'ancien cookie rouvrait le
 * compte. Sur un téléphone partagé, « je me déconnecte » doit vouloir dire
 * « c'est fermé ». Audit du 12 octobre 2026.
 */
import type { APIRoute } from 'astro';
import { retirerSession, COOKIE_SESSION, clientSession } from '../lib/supabase';
import { COOKIE_PANIER } from '../lib/session';

export const POST: APIRoute = async (contexte) => {
  const client = clientSession(contexte as never);
  if (client) {
    try {
      // « local » ne ferme que cette session : elle a peut-être l'application
      // sur un deuxième téléphone, et on ne la déconnecte pas de partout sans
      // qu'elle l'ait demandé.
      await client.auth.signOut({ scope: 'local' });
    } catch {
      // Réseau coupé, service indisponible : on supprime les cookies quand
      // même. Jamais laisser quelqu'une sur une page connectée parce que la
      // révocation a raté.
    }
  }
  retirerSession(contexte as never);
  contexte.cookies.delete(COOKIE_PANIER, { path: '/' });
  contexte.cookies.delete(COOKIE_SESSION, { path: '/' });
  return contexte.redirect('/', 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/compte', 303);
