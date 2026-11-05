-- La photo du produit, dans la commande.
--
-- En copiant l'espace vendeur de Jia, le 5 novembre 2026, une seule différence
-- visuelle sautait aux yeux sur la page des commandes : chez Jia chaque article
-- porte sa vignette, ici c'était le carré rayé du repli, sur toutes les lignes
-- de toutes les commandes. `commandes_admin` ne rendait pas d'image, et la page
-- n'avait donc rien à montrer.
--
-- POURQUOI LA PHOTO VIENT DE `produits` ET NON DE LA LIGNE DE COMMANDE.
-- `commande_lignes` garde un instantané du nom, de la taille et du prix du jour
-- de la commande, exprès : un produit renommé ou dont le prix change ne doit
-- pas réécrire une commande passée. On pourrait croire qu'il faut faire pareil
-- pour la photo. Non, et c'est l'inverse : la vignette sert ici à RECONNAÎTRE
-- l'objet à mettre dans le carton, maintenant, en préparant le colis. Si la
-- photo de la fiche a changé, c'est la nouvelle qui ressemble à ce qu'il y a
-- dans le magasin, et c'est elle qu'il faut voir. Un instantané montrerait
-- l'ancien emballage, et ferait préparer le mauvais article.
--
-- `produit_id` est une référence `on delete restrict` : un produit commandé ne
-- peut pas disparaître, la jointure ne peut donc pas se vider. La colonne
-- `image` peut être nulle (une fiche sans photo), et la page retombe alors sur
-- le carré rayé, comme chez Jia.
--
-- Le reste de la fonction est repris mot pour mot de la version du 27 octobre
-- 2026 : seules deux lignes changent, la jointure et le champ `image`.

create or replace function public.commandes_admin(p_etat text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lignes jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select coalesce(jsonb_agg(l order by l_quand desc), '[]'::jsonb)
    into v_lignes
    from (
      select jsonb_build_object(
               'id', c.id,
               'numero', c.numero,
               'etat', c.etat,
               'nom', c.nom,
               'telephone', c.telephone,
               'quartier', c.quartier,
               'repere', c.repere,
               'position_lat', c.position_lat,
               'position_lng', c.position_lng,
               'total_cfa', c.total_cfa,
               'livraison_cfa', c.livraison_cfa,
               'quand', c.cree_le,
               'livreur_nom', c.livreur_nom,
               'livreur_telephone', c.livreur_telephone,
               -- Seulement tant que la course dure.
               'livreur_jeton', case when c.etat = 'envoyee' then c.livreur_jeton else null end,
               'livreur_vu_le', c.livreur_vu_le,
               'articles', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'nom', cl.nom, 'taille', cl.taille,
                          'quantite', cl.quantite, 'prix_cfa', cl.prix_cfa,
                          -- La photo d'aujourd'hui, et le slug pour ouvrir la
                          -- fiche depuis la commande.
                          'image', p.image,
                          'slug', p.slug
                        ) order by cl.nom), '[]'::jsonb)
                   from public.commande_lignes cl
                   join public.produits p on p.id = cl.produit_id
                  where cl.commande_id = c.id
               )
             ) as l,
             c.cree_le as l_quand
        from public.commandes c
       where p_etat is null or p_etat = '' or c.etat::text = p_etat
       order by c.cree_le desc
       limit 100
    ) s;

  return jsonb_build_object(
    'ok', true,
    'commandes', v_lignes,
    'compte', jsonb_build_object(
      'nouvelle', (select count(*) from public.commandes where etat = 'nouvelle'),
      'preparee', (select count(*) from public.commandes where etat = 'preparee'),
      'envoyee', (select count(*) from public.commandes where etat = 'envoyee'),
      'livree', (select count(*) from public.commandes where etat = 'livree'),
      'annulee', (select count(*) from public.commandes where etat = 'annulee')
    )
  );
end;
$$;

revoke all on function public.commandes_admin(text) from public, anon, authenticated;
grant execute on function public.commandes_admin(text) to authenticated;

comment on function public.commandes_admin(text) is
  'Administration : les 100 dernières commandes et le compte par état, avec le livreur et la photo de chaque article.';
