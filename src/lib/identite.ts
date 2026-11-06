/**
 * ATTACHER UNE IDENTITÉ À UN COMPTE DÉJÀ COMMENCÉ.
 *
 * Arthur, le 27 octobre 2026 : « la personne qui appuie sur commencer va
 * remplir ses informations et tout, la personne accède à la plateforme, mais
 * pour accéder à la messagerie et au niveau de compte, la personne va devoir
 * se connecter ».
 *
 * CE QUI SE SERAIT PASSÉ SANS CE FICHIER, ET POURQUOI IL EXISTE
 *
 * `/commencer` crée une identité anonyme : un vrai compte, un vrai jeton, mais
 * sans email. Son cycle, son journal, ses commandes et ses discussions sont
 * déjà rattachés à CET identifiant.
 *
 * Or `signInWithOAuth` ne lie rien : il ouvre une session sur un AUTRE compte,
 * celui de Google. Une femme qui aurait noté trois mois de règles, puis cliqué
 * sur « Me connecter avec Google » pour pouvoir écrire à Dambé, serait arrivée
 * sur un compte vide. Son cycle n'aurait pas été effacé, il serait devenu
 * inaccessible, ce qui est la même chose pour elle, en plus cruel : elle ne
 * saurait même pas qu'il est encore là.
 *
 * Donc, depuis un compte anonyme, on ne se connecte pas : on AJOUTE. Google
 * vient se poser sur le compte qu'elle a déjà (`linkIdentity`), et le mot de
 * passe aussi (`updateUser`). Même identifiant avant et après : il n'y a rien
 * à déplacer, donc rien à perdre.
 *
 * CE QU'IL FAUT AVOIR ACTIVÉ DANS SUPABASE
 *
 * `linkIdentity` exige « Manual linking » (Authentication → Providers →
 * « Allow manual linking »). Sans ce réglage, l'appel échoue, et le site se
 * replie sur la connexion ordinaire en le disant honnêtement : mieux vaut
 * qu'elle arrive sur un compte neuf en ayant lu pourquoi, que de la laisser
 * devant un écran qui refuse sans rien expliquer.
 *
 * TOUT EST SUR LE SERVEUR. `supabase-js` ne part jamais au navigateur, et
 * `setSession` est nécessaire parce que `clientSession` ne pose son jeton que
 * dans un en-tête : la partie « auth » de la bibliothèque, elle, ne lit que sa
 * propre session. Sans ce `setSession`, `linkIdentity` et `updateUser`
 * répondent « Auth session missing » alors que le cookie est bien là.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { jetonDeSession, type ContexteAstro } from './supabase';
import { stockageDansObjet } from './oauth';
import { sansDepasser, DELAI_RAFRAICHISSEMENT_MS } from './rafraichir';

/**
 * Un client dont la partie « auth » connaît vraiment la visiteuse.
 *
 * Le sac est fourni par l'appelant, qui en a besoin après coup : c'est là que
 * supabase-js range le secret PKCE qu'il faudra faire voyager jusqu'au retour.
 *
 * Rend `null` s'il n'y a pas de session, ou si la session est refusée par la
 * base (jeton expiré, compte supprimé).
 */
export async function clientAuthentifie(
  astro: ContexteAstro,
  sac: Record<string, string>
): Promise<SupabaseClient | null> {
  const jeton = jetonDeSession(astro);
  if (!jeton) return null;

  const client = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      // Voir src/lib/oauth.ts : à false, notre stockage est jeté et le secret
      // PKCE devient introuvable au retour.
      persistSession: true,
      autoRefreshToken: false,
      flowType: 'pkce',
      storage: stockageDansObjet(sac),
    },
  });

  // Borné : `setSession` rafraîchit le jeton de lui-même quand il le trouve
  // expiré, et se suspend alors comme le faisait `refreshSession` (panne du
  // 6 novembre 2026, voir lib/rafraichir.ts). Au-delà du délai, on répond
  // « pas de session », ce qui mène à l'écran de connexion au lieu d'un 504.
  const { data, error } = await sansDepasser(
    client.auth.setSession({
      access_token: jeton.access_token,
      refresh_token: jeton.refresh_token,
    }),
    DELAI_RAFRAICHISSEMENT_MS,
    { data: null, error: null } as never
  );
  if (error || !data?.session) return null;

  return client;
}

/** Les causes d'échec que l'écran sait traduire en français. */
export type EchecIdentite =
  | 'pas-de-session'
  | 'deja-pris'
  | 'liaison-refusee'
  | 'mot-de-passe-faible'
  | 'inconnu';

/**
 * Traduire une erreur de Supabase en cause que l'écran saura dire.
 *
 * On ne renvoie jamais le texte brut de la bibliothèque : il est en anglais,
 * et il en dit parfois plus qu'il ne faut sur l'existence d'un compte.
 */
export function causeDeLEchec(message: string | undefined): EchecIdentite {
  const m = String(message ?? '').toLowerCase();
  if (m.includes('already') && (m.includes('registered') || m.includes('exists') || m.includes('linked'))) {
    return 'deja-pris';
  }
  if (m.includes('manual linking') || m.includes('not enabled') || m.includes('disabled')) {
    return 'liaison-refusee';
  }
  if (m.includes('password') && (m.includes('short') || m.includes('weak') || m.includes('least'))) {
    return 'mot-de-passe-faible';
  }
  if (m.includes('session')) return 'pas-de-session';
  return 'inconnu';
}
