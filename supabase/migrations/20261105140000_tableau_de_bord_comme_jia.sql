-- Le tableau de bord du vendeur, dans la forme exacte de celui de Jia.
--
-- Arthur, le 5 novembre 2026 : « quand tu rentres dans espace vendeur de Jia,
-- tu as d'abord le dashboard, tu as un tableau qui te montre tes ventes, tu as
-- l'historique de tes ventes, tu as tout [...] je veux la même chose, la même
-- chose, même les couleurs tu copies ».
--
-- POURQUOI DEUX FONCTIONS ET PAS UNE. Jia en a deux, `seller_dashboard` et
-- `tableau_bord_stock`, et sa page les appelle toutes les deux en parallèle.
-- On garde le même découpage et les mêmes noms de champs : la page copiée de
-- Jia lit `t.a_expedier`, `st.ruptures`, `ventes.panier_moyen_cfa`. Changer un
-- seul nom ici obligerait à retoucher la page, donc à ne plus copier.
--
-- CE QUI N'EXISTE PAS CHEZ MOUSSO DAMBÉ, et ce qu'on en fait. Jia est une
-- place de marché : commission, versements aux vendeurs, note de boutique,
-- litiges. Mousso Dambé vend ses propres produits et se fait payer à la
-- livraison. Les champs correspondants existent quand même, et valent zéro ou
-- null : la page les affiche alors d'elle-même comme vides, au lieu de casser.
-- Le jour où un de ces métiers arrive, la forme est déjà là.
--
-- AUCUNE DONNÉE PERSONNELLE NE SORT D'ICI : des sommes, des comptes, des noms
-- de produits. Pas un prénom, pas un numéro. Les écrans qui ont besoin du nom
-- d'une cliente pour livrer passent par `commandes_admin`, qui est fait pour
-- ça et qui le dit.

-- ---------------------------------------------------------------------------
-- 1. Le tableau de bord : ce qu'il faut faire, et les ventes de la semaine
-- ---------------------------------------------------------------------------
create or replace function public.tableau_de_bord_vendeur()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jours jsonb;
  v_precedent bigint;
  v_tranchees bigint;
  v_annulees bigint;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Sept jours pleins, trous compris. Jia dessine un histogramme de sept
  -- barres : un jour sans vente doit donner une barre plate, pas une barre en
  -- moins, sinon la semaine se lit de travers.
  select coalesce(jsonb_agg(jsonb_build_object(
           'jour', j.jour,
           'total_cfa', coalesce(v.somme, 0)
         ) order by j.jour), '[]'::jsonb)
    into v_jours
    from generate_series((current_date - interval '6 days')::date, current_date, interval '1 day') as j(jour)
    left join (
      select cree_le::date as jour, sum(articles_cfa)::bigint as somme
        from public.commandes
       where etat <> 'annulee'
         and cree_le >= current_date - interval '6 days'
       group by 1
    ) v on v.jour = j.jour;

  -- La semaine d'avant, pour l'évolution en pourcentage.
  select coalesce(sum(articles_cfa), 0)::bigint into v_precedent
    from public.commandes
   where etat <> 'annulee'
     and cree_le >= current_date - interval '13 days'
     and cree_le <  current_date - interval '6 days';

  -- Le taux d'annulation se calcule sur les commandes dont le sort est tranché
  -- (livrée ou annulée). Le calculer sur toutes écraserait le chiffre tant que
  -- des commandes sont encore en route.
  select count(*) filter (where etat in ('livree', 'annulee')),
         count(*) filter (where etat = 'annulee')
    into v_tranchees, v_annulees
    from public.commandes
   where cree_le >= now() - interval '30 days';

  return jsonb_build_object(
    'ok', true,
    'ventes_7j', v_jours,
    'ventes_7j_precedents', v_precedent,
    -- Tout ce qui n'est pas encore parti chez la cliente.
    'a_expedier', (select count(*) from public.commandes where etat in ('nouvelle', 'preparee')),
    'plus_ancienne', (
      select min(cree_le) from public.commandes where etat in ('nouvelle', 'preparee')
    ),
    -- Pas de litiges chez Mousso Dambé : personne à arbitrer, une seule
    -- boutique. Le champ reste pour que la page de Jia tienne telle quelle.
    'remboursements', 0,
    'commandes_mois', (
      select count(*) from public.commandes
       where etat <> 'annulee' and cree_le >= date_trunc('month', now())
    ),
    'produits_en_ligne', (select count(*) from public.produits where publie),
    'taux_annulation', case when v_tranchees > 0
      then round((v_annulees::numeric / v_tranchees) * 100)::int else 0 end,
    -- « shop » chez Jia : la note de la boutique. Ici c'est la note moyenne de
    -- tous les avis déposés, puisque la boutique et le catalogue ne font qu'un.
    'shop', (
      select jsonb_build_object(
        'rating_avg', coalesce(round(avg(note)::numeric, 1), 0),
        'rating_count', count(*)
      ) from public.avis
    ),
    -- Paiement à la livraison seulement : rien n'est encaissé par un tiers,
    -- donc rien n'est en attente de versement. La page masque ce bloc quand
    -- les deux montants sont à zéro, c'est son comportement d'origine.
    'en_ligne', jsonb_build_object('a_recevoir_cfa', 0, 'versable_cfa', 0, 'verse_cfa', 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Le stock : ce qui fait perdre de l'argent tous les jours
-- ---------------------------------------------------------------------------
create or replace function public.tableau_de_bord_stock()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  return jsonb_build_object(
    'ok', true,

    -- En rupture : publié, stock à zéro. Avec ce qu'il se vendait, parce que
    -- réapprovisionner un produit qui ne partait pas n'a pas d'urgence.
    'ruptures', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.slug, 'titre', p.nom, 'vendus_30j', coalesce(v.qte, 0)
             ) order by coalesce(v.qte, 0) desc, p.nom), '[]'::jsonb)
        from public.produits p
        left join (
          select l.produit_id, sum(l.quantite)::int as qte
            from public.commande_lignes l
            join public.commandes c on c.id = l.commande_id
           where c.etat <> 'annulee' and c.cree_le >= now() - interval '30 days'
           group by l.produit_id
        ) v on v.produit_id = p.id
       where p.publie and p.stock = 0
    ),

    -- Bientôt épuisés. Cinq, c'est le seuil de Jia.
    'stock_bas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', slug, 'titre', nom, 'stock', stock
             ) order by stock, nom), '[]'::jsonb)
        from public.produits where publie and stock between 1 and 5
    ),

    'brouillons', (
      select coalesce(jsonb_agg(jsonb_build_object('id', slug, 'titre', nom) order by nom), '[]'::jsonb)
        from public.produits where not publie
    ),

    -- Ceux qui dorment : en ligne depuis plus d'un mois, pas une seule vente,
    -- et du stock immobilisé. C'est de l'argent qui ne travaille pas.
    'dorment', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.slug, 'titre', p.nom, 'stock', p.stock
             ) order by p.stock desc, p.nom), '[]'::jsonb)
        from public.produits p
       where p.publie
         and p.stock > 0
         and p.cree_le < now() - interval '30 days'
         and not exists (
           select 1 from public.commande_lignes l
             join public.commandes c on c.id = l.commande_id
            where l.produit_id = p.id and c.etat <> 'annulee'
         )
    ),

    'meilleurs', (
      select coalesce(jsonb_agg(x order by x->>'rang'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'rang', lpad(row_number() over (order by sum(l.quantite) desc)::text, 3, '0'),
                 'id', p.slug,
                 'titre', p.nom,
                 'qte', sum(l.quantite)::int,
                 'chiffre_cfa', sum(l.total_ligne_cfa)::bigint
               ) as x
          from public.commande_lignes l
          join public.commandes c on c.id = l.commande_id
          join public.produits p on p.id = l.produit_id
         where c.etat <> 'annulee' and c.cree_le >= now() - interval '30 days'
         group by p.id, p.slug, p.nom
         order by sum(l.quantite) desc
         limit 5
      ) s
    ),

    'valeur_stock_cfa', (select coalesce(sum(stock::bigint * prix_cfa), 0) from public.produits),
    'articles_en_stock', (select coalesce(sum(stock), 0) from public.produits),

    'ventes', jsonb_build_object(
      'aujourdhui_cfa', (
        select coalesce(sum(articles_cfa), 0)::bigint from public.commandes
         where etat <> 'annulee' and cree_le::date = current_date
      ),
      'mois_cfa', (
        select coalesce(sum(articles_cfa), 0)::bigint from public.commandes
         where etat <> 'annulee' and cree_le >= date_trunc('month', now())
      ),
      -- Le panier moyen se calcule sur les articles, livraison exclue : la
      -- course du livreur n'est pas un achat, et la compter gonflerait le
      -- panier des quartiers éloignés sans qu'on ait vendu davantage.
      'panier_moyen_cfa', (
        select coalesce(round(avg(articles_cfa))::bigint, 0) from public.commandes
         where etat <> 'annulee' and cree_le >= date_trunc('month', now())
      ),
      'commandes_mois', (
        select count(*) from public.commandes
         where etat <> 'annulee' and cree_le >= date_trunc('month', now())
      )
    )
  );
end;
$$;

revoke all on function public.tableau_de_bord_vendeur() from public;
revoke all on function public.tableau_de_bord_stock() from public;
grant execute on function public.tableau_de_bord_vendeur() to authenticated;
grant execute on function public.tableau_de_bord_stock() to authenticated;

comment on function public.tableau_de_bord_vendeur() is
  'Espace vendeur : ventes de la semaine, ce qui attend, chiffres du mois. Même forme que seller_dashboard chez Jia.';
comment on function public.tableau_de_bord_stock() is
  'Espace vendeur : ruptures, stock bas, dormants, meilleures ventes. Même forme que tableau_bord_stock chez Jia.';
