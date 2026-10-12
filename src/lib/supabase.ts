/**
 * Les clients Supabase du site.
 *
 * Règle non négociable : `supabase-js` ne part JAMAIS au navigateur. Toutes
 * les données sont lues et écrites dans le frontmatter des pages, côté
 * serveur. Envoyer 80 Ko de bibliothèque à une fille qui regarde un prix sur
 * un forfait compté est une régression, pas une commodité.
 *
 * Deux clients :
 *   - `clientPublic` : le catalogue, sans personne derrière.
 *   - `clientSession` : avec le jeton de la visiteuse, pour tout ce qui la
 *     concerne. C'est la base, par ses règles d'accès, qui décide ce qu'elle
 *     voit, jamais ce fichier.
 *
 * Les deux posent deux en-têtes que la base vérifie : la clé du serveur
 * (preuve que l'appel vient bien du site) et l'adresse de la visiteuse (pour
 * les quotas). Il faut donc TOUJOURS passer `Astro`, sinon l'adresse manque et
 * les quotas ne s'appliquent plus.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { MD_CLE_SERVEUR } from 'astro:env/server';

export interface ContexteAstro {
  request: Request;
  cookies: {
    get(nom: string): { value: string } | undefined;
    set(nom: string, valeur: string, options?: Record<string, unknown>): void;
    delete(nom: string, options?: Record<string, unknown>): void;
  };
  clientAddress?: string;
}

export const COOKIE_SESSION = 'md_session';

export function baseConfiguree(): boolean {
  return !!PUBLIC_SUPABASE_URL && !!PUBLIC_SUPABASE_ANON_KEY;
}

function entetes(astro?: ContexteAstro): Record<string, string> {
  const e: Record<string, string> = {};
  if (MD_CLE_SERVEUR) e['x-md-cle'] = MD_CLE_SERVEUR;
  if (astro) e['x-md-ip'] = ipVisiteuse(astro);
  return e;
}

/**
 * L'adresse de la visiteuse. Au Burkina, une même adresse est partagée par
 * beaucoup d'abonnés (le fournisseur traduit les adresses) : ne jamais serrer
 * un quota par adresse sans y penser, on couperait tout un quartier.
 */
export function ipVisiteuse(astro: ContexteAstro): string {
  const entete = astro.request.headers.get('x-forwarded-for');
  if (entete) return entete.split(',')[0].trim();
  return astro.clientAddress ?? 'inconnue';
}

export function clientPublic(astro?: ContexteAstro): SupabaseClient {
  return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: entetes(astro) },
  });
}

/**
 * Client au nom de la visiteuse. Renvoie null si elle n'est pas connectée :
 * l'appelant doit alors proposer la connexion, jamais faire semblant.
 */
export function clientSession(astro: ContexteAstro): SupabaseClient | null {
  const jeton = jetonDeSession(astro);
  if (!jeton) return null;
  return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        ...entetes(astro),
        // « Authorization » avec un A majuscule, exactement comme l'écrit
        // supabase-js : avec une autre casse, les deux clés coexistent dans
        // l'objet, le navigateur les colle en une seule valeur « Bearer a,
        // Bearer b », et plus personne n'est reconnu. Défaut constaté et
        // corrigé le 12 octobre 2026.
        Authorization: `Bearer ${jeton.access_token}`,
      },
    },
  });
}

export interface JetonSession {
  access_token: string;
  refresh_token: string;
}

export function jetonDeSession(astro: ContexteAstro): JetonSession | null {
  const brut = astro.cookies.get(COOKIE_SESSION)?.value;
  if (!brut) return null;
  try {
    const lu = JSON.parse(brut) as JetonSession;
    if (!lu.access_token) return null;
    return lu;
  } catch {
    return null;
  }
}

export function poserSession(astro: ContexteAstro, jeton: JetonSession): void {
  // HttpOnly : le jeton ne doit jamais être lisible par un script de la page.
  // SameSite Lax : il ne part pas avec une requête venue d'un autre site.
  astro.cookies.set(COOKIE_SESSION, JSON.stringify(jeton), {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function retirerSession(astro: ContexteAstro): void {
  astro.cookies.delete(COOKIE_SESSION, { path: '/' });
}
