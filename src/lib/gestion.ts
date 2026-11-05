/**
 * La porte de la gestion : espace vendeur et administration.
 *
 * Équivalent de `exigerVendeur()` de Jia, et volontairement avec la même forme
 * d'appel, pour que les pages copiées de Jia restent copiées :
 *
 *     const acces = await exigerGestion(Astro);
 *     if (acces instanceof Response) return acces;
 *     const { sb, vitrine } = acces;
 *
 * Chez Jia, cette fonction choisit AUSSI de quelle boutique on parle, parce
 * qu'un vendeur en a une et qu'un administrateur peut regarder celle d'un
 * autre. Ici il n'y a qu'une boutique, la maison : il n'y a rien à choisir, et
 * la fonction rend simplement sa vitrine.
 *
 * TROIS SORTIES, et une seule laisse entrer :
 *   - pas de session  → on l'envoie se connecter ;
 *   - session, mais pas administratrice → une page de refus, en 403. Pas une
 *     redirection : une redirection vers l'accueil la ferait tourner en rond
 *     sur l'adresse de la gestion, dont l'accueil mène justement ici ;
 *   - administratrice → le client Supabase et la vitrine.
 *
 * Le refus est une page écrite à la main plutôt qu'un composant : une fonction
 * de bibliothèque ne peut pas rendre un gabarit Astro, et faire porter ce
 * refus par chaque page revenait à recopier vingt lignes de balisage dans
 * chacune, donc à les voir diverger.
 */
import type { APIContext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSession, baseConfiguree } from './supabase';
import { visiteuse } from './session';
import { manquantsVitrine, type PointManquant, type Vitrine } from './vitrine';

export interface AccesGestion {
  sb: SupabaseClient;
  /** La vitrine de la boutique, telle que `boutique_vitrine()` la rend. */
  vitrine: Vitrine;
  /** Ce qui manque à la vitrine, pour les bandeaux et la pastille. */
  manquants: PointManquant[];
}

const PAGE_REFUS = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Accès refusé — Mousso Dambé</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#F4F5F3; color:#0B1220; text-align:center; padding:24px;
         font-family:system-ui,-apple-system,sans-serif; }
  h1 { font-size:21px; margin:0 0 8px; }
  p { color:#7A8290; margin:0 0 20px; font-size:15px; line-height:1.5; }
  a { display:inline-block; background:#E0561A; color:#fff; text-decoration:none;
      font-weight:700; padding:12px 20px; border-radius:30px; }
</style>
</head><body><div>
<h1>Cet espace n'est pas pour toi</h1>
<p>Seule la gestion de Mousso Dambé entre ici.</p>
<a href="/connexion">Se connecter avec un autre compte</a>
</div></body></html>`;

export async function exigerGestion(contexte: APIContext): Promise<AccesGestion | Response> {
  if (!baseConfiguree()) return contexte.redirect('/', 302);

  const moi = await visiteuse(contexte as never);
  if (!moi) return contexte.redirect('/connexion', 302);

  const sb = clientSession(contexte as never)!;

  // `est_admin()` est la seule autorité. On ne se fie pas à l'adresse de la
  // page ni à un rôle recopié dans le jeton : la base refuse de toute façon de
  // répondre aux autres, même en SQL direct, et c'est elle qui a raison.
  const { data: admin } = await sb.rpc('est_admin');
  if (admin !== true) {
    return new Response(PAGE_REFUS, {
      status: 403,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }

  const { data } = await sb.rpc('boutique_vitrine');
  const vitrine = (data ?? {}) as Vitrine;

  return { sb, vitrine, manquants: manquantsVitrine(vitrine) };
}
