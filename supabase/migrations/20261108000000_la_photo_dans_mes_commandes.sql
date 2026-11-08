-- ---------------------------------------------------------------------------
-- La photo du produit dans « Mes commandes »
-- ---------------------------------------------------------------------------
--
-- Arthur, le 7 novembre 2026, capture à l'appui : sur l'écran de ses commandes,
-- chaque commande se présente par la PHOTO de l'article, son nom, la boutique,
-- la date et le prix. Aujourd'hui la page ne peut afficher que du texte : la
-- photo n'est pas dans ce que la base lui rend.
--
-- `commandes_admin()` la rend déjà, depuis la migration 20261105170000. Celle
-- des clientes était restée en arrière.
--
-- DEUX CHAMPS AJOUTÉS, ET RIEN D'ENLEVÉ : `image` et `slug` sur chaque ligne
-- d'article. Tous les autres champs sont repris à l'identique, parce que trois
-- pages les lisent déjà (/commandes/<état>, /commandes/suivre/<numéro> et
-- /compte). Une fonction redéfinie en oubliant un champ casse une page qui ne
-- parle pas d'elle, et le défaut n'apparaît qu'à l'écran de quelqu'un d'autre.
--
-- LE SLUG SERT À OUVRIR LA FICHE DU PRODUIT depuis la commande, ce que la
-- capture montre en rendant la carte cliquable. Sans lui, il faudrait chercher
-- le produit par son nom, qui n'est ni unique ni stable.
--
-- POURQUOI LA PHOTO D'AUJOURD'HUI ET NON CELLE DU JOUR DE L'ACHAT. On prend
-- `produits.image`, donc la photo actuelle de la fiche. Si Arthur la remplace,
-- l'ancienne commande montrera la nouvelle. C'est le même choix que celui fait
-- pour l'administration le 5 novembre, et il est volontaire : le nom et le prix
-- payés, eux, sont figés dans `commande_lignes` et ne bougent pas. La photo
-- n'est là que pour reconnaître l'article d'un coup d'œil.
--
-- Le produit peut avoir été retiré depuis : la jointure est donc un `left
-- join`, et `image` vaut alors null. La page doit prévoir ce cas, et c'est
-- mieux qu'une commande qui disparaîtrait de la liste parce que sa fiche n'est
-- plus en ligne.

create or replace function public.mes_commandes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(ligne order by cree_le desc), '[]'::jsonb) from (
    select c.cree_le,
           jsonb_build_object(
             'numero', c.numero, 'etat', c.etat, 'total', c.total_cfa,
             'cree_le', c.cree_le, 'quartier', c.quartier,
             'repere', c.repere, 'livree_le', c.livree_le,
             'lat', c.position_lat, 'lng', c.position_lng,
             'livreur_nom', c.livreur_nom,
             'livreur_telephone', c.livreur_telephone,
             -- JAMAIS le jeton : il n'a rien à faire dans la page de la
             -- cliente, qui n'en a aucun usage. Un secret ne se promène pas
             -- dans un écran qui n'en a pas besoin.
             'articles', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'nom', l.nom, 'taille', l.taille,
                        'quantite', l.quantite, 'total', l.total_ligne_cfa,
                        -- Les deux nouveautés du 8 novembre 2026.
                        'image', p.image, 'slug', p.slug)), '[]'::jsonb)
                 from public.commande_lignes l
                 left join public.produits p on p.id = l.produit_id
                where l.commande_id = c.id
             )
           ) as ligne
      from public.commandes c
     where c.profil_id = auth.uid()
     order by c.cree_le desc
     limit 20
  ) t
$$;

comment on function public.mes_commandes() is
  'Les vingt dernières commandes de la visiteuse, avec la photo et le slug de chaque article. Jamais le jeton du livreur.';
