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

/** Une vraie adresse, et pas le mot « inconnue » que `ipVisiteuse` rend à défaut. */
function ressembleAUneAdresse(valeur: string): boolean {
  // Large exprès : on ne valide pas une adresse, on écarte « inconnue » et les
  // bizarreries. Une valeur que Supabase ne comprend pas, il l'ignore (mesuré
  // le 8 novembre 2026), donc le pire cas est l'état d'avant.
  return /^[0-9a-fA-F.:]{3,45}$/.test(valeur);
}

function entetes(astro?: ContexteAstro): Record<string, string> {
  const e: Record<string, string> = {};
  if (MD_CLE_SERVEUR) e['x-md-cle'] = MD_CLE_SERVEUR;
  if (astro) {
    const ip = ipVisiteuse(astro);
    e['x-md-ip'] = ip;

    /*
     * ON DIT AUSSI SON ADRESSE À SUPABASE (audit de Cyber, 8 novembre 2026).
     *
     * LE DÉFAUT. Supabase freine les créations de comptes anonymes par adresse
     * IP. Mais le site lui parle depuis SON SERVEUR : Supabase voyait donc une
     * seule adresse, celle de Vercel, pour toutes les clientes du pays. Son
     * frein ne protégeait de rien, et pire, il se retournait contre nous :
     * qui épuisait ce quota fermait « Commencer » et « Se connecter » À TOUT
     * LE MONDE, avec une boucle de trois lignes et sans compte.
     *
     * CE QUE CETTE LIGNE CHANGE. Le frein de Supabase redevient un frein par
     * personne. C'est strictement meilleur dans les deux sens : si Supabase
     * s'en sert, le quota cesse d'être commun ; s'il l'ignore, rien ne change.
     *
     * CE QUI A ÉTÉ MESURÉ AVANT DE LA POSER, parce que cette fonction est
     * traversée par TOUS les appels à la base et qu'une passerelle qui
     * refuserait l'en-tête ferait tomber l'application entière : trois appels à
     * /auth/v1/settings sur la vraie base, sans en-tête, avec une adresse, puis
     * avec une valeur absurde. Les trois répondent 200 avec le même corps. La
     * passerelle l'accepte, et ce qu'elle ne comprend pas, elle l'ignore.
     *
     * CE QUI N'EST PAS PROUVÉ, et qu'il faut dire : qu'elle s'en SERVE pour son
     * frein. Le vérifier demanderait d'épuiser le quota pour de vrai, donc de
     * fermer la porte d'entrée aux vraies clientes. On ne fait pas ça.
     *
     * L'adresse vient de `ipVisiteuse`, qui demande d'abord à l'hébergeur et ne
     * lit l'en-tête qu'à défaut, en prenant son dernier maillon : une visiteuse
     * ne peut donc pas choisir l'adresse qu'on transmet ici.
     */
    if (ressembleAUneAdresse(ip)) e['X-Forwarded-For'] = ip;
  }
  return e;
}

/**
 * L'adresse de la visiteuse.
 *
 * Deux choses à savoir, et elles ont toutes les deux coûté une faille.
 *
 * 1. `x-forwarded-for` est écrit par la visiteuse elle-même. Prendre son
 *    premier maillon, c'est prendre une valeur qu'elle a choisie : il suffisait
 *    d'en changer à chaque requête pour n'être jamais freinée. On demande donc
 *    d'abord l'adresse à l'hébergeur (`clientAddress`), et on ne regarde
 *    l'en-tête qu'à défaut, en prenant son DERNIER maillon, celui qu'un
 *    intermédiaire de confiance a ajouté.
 * 2. Au Burkina, une même adresse est partagée par des milliers d'abonnés. Un
 *    quota serré par adresse couperait tout un quartier. Depuis la migration
 *    20261012110000, les quotas comptent par compte connecté ; cette adresse ne
 *    sert plus qu'au journal et aux actions ouvertes sans compte.
 */
export function ipVisiteuse(astro: ContexteAstro): string {
  try {
    if (astro.clientAddress) return astro.clientAddress;
  } catch {
    // Certains hébergements ne donnent pas l'adresse : on passe à l'en-tête.
  }
  const entete = astro.request.headers.get('x-forwarded-for');
  if (entete) {
    const maillons = entete.split(',').map((m) => m.trim()).filter(Boolean);
    if (maillons.length > 0) return maillons[maillons.length - 1];
  }
  return 'inconnue';
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
