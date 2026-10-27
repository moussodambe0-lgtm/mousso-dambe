/**
 * Se connecter avec Google, ou l'attacher au compte déjà commencé.
 *
 * Demande d'Arthur du 12 octobre 2026. Deux raisons de le vouloir ici :
 * c'est deux touches au lieu d'un mot de passe à retenir, et surtout
 * **l'adresse est vérifiée par Google**. Il voulait « le vrai email » : c'est
 * le seul chemin qui le garantit sans obliger chaque fille à ouvrir sa boîte
 * au milieu de son inscription.
 *
 * DEUX CHEMINS, ET LE BON SE CHOISIT ICI (27 octobre 2026)
 *
 *   - Personne derrière : connexion ordinaire (`signInWithOAuth`).
 *   - Une visiteuse entrée par « Commencer », donc sans email : on AJOUTE
 *     Google à son compte (`linkIdentity`). Son identifiant ne change pas,
 *     donc son cycle, son journal et ses commandes restent les siens.
 *
 * Sans cette distinction, « Me connecter avec Google » l'emmenait sur un
 * compte neuf et vide, et trois mois de règles notées devenaient
 * inaccessibles. Voir src/lib/identite.ts.
 *
 * ON NE SE REPLIE PAS EN SILENCE. Si la liaison est refusée (le réglage
 * « Manual linking » n'est pas activé dans Supabase, ou cette adresse Google
 * appartient déjà à un autre compte), on ne la connecte PAS d'office sur un
 * compte neuf : elle y perdrait tout sans l'avoir su. On revient à l'écran de
 * connexion, qui explique, et qui lui laisse demander ce basculement
 * elle-même. C'est alors le champ `basculer` qui le dit.
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
import { visiteuse } from '../../lib/session';
import { clientAuthentifie, causeDeLEchec } from '../../lib/identite';
import {
  COOKIE_OAUTH,
  optionsCookieOAuth,
  stockageDansObjet,
  porteUnVerificateur,
  seulementLeVerificateur,
} from '../../lib/oauth';

/** Ce que Google doit nous renvoyer, et comment. */
function options(origine: string) {
  return {
    redirectTo: new URL('/auth/retour', origine).href,
    // Le code revient dans l'adresse, que le serveur peut lire. Sans ce
    // choix, Supabase renvoie le jeton dans l'ancre (#), que le serveur ne
    // voit jamais, et il faudrait du JavaScript pour le rattraper.
    queryParams: { access_type: 'offline', prompt: 'select_account' },
    skipBrowserRedirect: true,
  };
}

export const POST: APIRoute = async (contexte) => {
  if (!baseConfiguree()) return contexte.redirect('/connexion?erreur=pas-de-base', 303);

  const formulaire = await contexte.request.formData().catch(() => null);
  const basculerExprès = String(formulaire?.get('basculer') ?? '') === '1';

  const moi = await visiteuse(contexte as never);
  // Déjà un vrai compte : rien à lier, rien à refaire.
  if (moi?.compteReel) return contexte.redirect('/', 303);

  // Le sac que supabase-js va remplir, et que nous pourrons relire. Son
  // stockage à lui est privé : on ne récupérerait rien.
  const sac: Record<string, string> = {};
  let adresse = '';

  if (moi && !basculerExprès) {
    // ELLE A DÉJÀ UN COMPTE COMMENCÉ : on y ajoute Google.
    const client = await clientAuthentifie(contexte as never, sac);
    if (!client) return contexte.redirect('/connexion?erreur=google', 303);

    const { data, error } = await client.auth.linkIdentity({
      provider: 'google',
      options: options(contexte.url.origin),
    });

    if (error || !data?.url) {
      // Pas de repli muet : voir l'en-tête de ce fichier.
      const cause = causeDeLEchec(error?.message);
      return contexte.redirect(
        `/connexion?erreur=${cause === 'deja-pris' ? 'google-deja-pris' : 'liaison'}`,
        303
      );
    }
    adresse = data.url;
  } else {
    // Personne derrière, ou elle a demandé expressément un autre compte.
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
      options: options(contexte.url.origin),
    });

    if (error || !data?.url) return contexte.redirect('/connexion?erreur=google', 303);
    adresse = data.url;
  }

  // Pas de secret dans le sac : le retour échouerait de toute façon. Autant
  // le dire ici que renvoyer la visiteuse chez Google pour rien.
  if (!porteUnVerificateur(sac)) {
    return contexte.redirect('/connexion?erreur=google', 303);
  }

  // Seul le secret voyage. La session, elle, a déjà son cookie : la recopier
  // ici en ferait une deuxième copie à surveiller. Voir seulementLeVerificateur.
  contexte.cookies.set(
    COOKIE_OAUTH,
    JSON.stringify(seulementLeVerificateur(sac)),
    optionsCookieOAuth(import.meta.env.PROD)
  );
  return contexte.redirect(adresse, 303);
};

export const GET: APIRoute = (contexte) => contexte.redirect('/connexion', 303);
