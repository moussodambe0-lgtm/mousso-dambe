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
 */
import type { APIRoute } from 'astro';
import { clientPublic, baseConfiguree } from '../../lib/supabase';

export const POST: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/connexion?erreur=pas-de-base', 303);

  const client = clientPublic(contexte as never);
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
  return contexte.redirect(data.url, 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/connexion', 303);
