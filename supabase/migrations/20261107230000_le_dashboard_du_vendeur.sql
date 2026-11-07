-- ---------------------------------------------------------------------------
-- Le Dashboard de l'espace vendeur
-- ---------------------------------------------------------------------------
--
-- Arthur, le 7 novembre 2026, captures à l'appui : « tout sera la même chose,
-- tout sera identique à l'exception des couleurs ». L'écran montre, pour une
-- période choisie : les ventes totales, le nombre de commandes, le taux de
-- conversion, le nombre de visiteurs, et une courbe comparée à la période
-- précédente.
--
-- CE QUE LA PAGE NE SAVAIT PAS AFFICHER AVANT, et pourquoi il a fallu du SQL
-- plutôt que du dessin : `tableau_de_bord_vendeur()` rend un total par JOUR sur
-- sept jours, et rien d'autre. Trois des cinq chiffres de la capture n'existent
-- nulle part : les visiteurs, la conversion, et la courbe heure par heure avec
-- sa comparaison à la veille.
--
-- LE CHOIX DE LA PÉRIODE EST ICI, PAS DANS LA PAGE. Calculer « hier à la même
-- heure » dans du JavaScript obligerait à redescendre toutes les commandes dans
-- le navigateur, et à y refaire les fuseaux horaires. La base sait le faire en
-- une requête, et elle est la seule à pouvoir le faire sans tout envoyer.
--
-- TROIS PÉRIODES, ET PAS UNE DE PLUS : aujourd'hui, 7 jours, 30 jours. Ce sont
-- celles de la capture. Toute autre valeur est ramenée à « aujourd'hui »,
-- plutôt que de laisser l'appelant choisir un intervalle arbitraire.

create or replace function public.dashboard_vendeur(p_periode text default 'aujourdhui')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_periode text := case when p_periode in ('aujourdhui', '7j', '30j') then p_periode else 'aujourdhui' end;
  -- Le pas de la courbe, et sa longueur. Une heure sur un jour, un jour sinon.
  v_pas interval := case v_periode when 'aujourdhui' then interval '1 hour' else interval '1 day' end;
  v_points int := case v_periode when 'aujourdhui' then 24 when '7j' then 7 else 30 end;
  v_debut timestamptz;
  v_fin timestamptz;
  v_duree interval;
  v_ventes bigint;
  v_commandes int;
  v_visiteurs bigint;
  v_courbe jsonb;
begin
  -- `est_admin()` est la seule autorité, comme partout ailleurs dans la gestion.
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if v_periode = 'aujourdhui' then
    v_debut := date_trunc('day', now());
    v_fin := v_debut + interval '1 day';
  else
    v_debut := date_trunc('day', now()) - (v_points - 1) * interval '1 day';
    v_fin := date_trunc('day', now()) + interval '1 day';
  end if;
  v_duree := v_fin - v_debut;

  -- ---- Les trois chiffres du haut ----------------------------------------
  --
  -- UNE COMMANDE ANNULÉE N'EST PAS UNE VENTE, et elle ne compte pas non plus
  -- comme commande : sinon le taux de conversion monterait à chaque annulation,
  -- ce qui ferait exactement mentir le chiffre qu'on regarde pour savoir si la
  -- boutique convertit.
  select coalesce(sum(articles_cfa), 0)::bigint, count(*)
    into v_ventes, v_commandes
    from public.commandes
   where etat <> 'annulee'
     and cree_le >= v_debut
     and cree_le < v_fin;

  -- ---- Les visiteurs ------------------------------------------------------
  --
  -- `visites_jour.visiteuses` compte les navigateurs pas encore vus ce jour-là
  -- (migration 20261105190000). C'est ce qui ressemble le plus à « combien de
  -- personnes sont venues », en sachant qu'un même téléphone deux jours de
  -- suite compte deux fois. Le compte est par JOUR : sur « aujourd'hui », il
  -- vaut donc pour la journée entière et non pour l'heure en cours. Mieux vaut
  -- ce chiffre-là, honnête et expliqué, qu'une précision inventée.
  select coalesce(sum(visiteuses), 0)::bigint
    into v_visiteurs
    from public.visites_jour
   where jour >= v_debut::date
     and jour <= (v_fin - interval '1 day')::date;

  -- ---- La courbe, et celle d'avant ---------------------------------------
  --
  -- Les deux séries sont bâties sur la MÊME série de points, décalée d'une
  -- durée de période. C'est ce qui fait que « 14 h » se compare bien à « 14 h
  -- hier », et non au quatorzième point d'une liste qui aurait pu être plus
  -- courte faute de ventes. Un `generate_series` donne tous les pas, y compris
  -- ceux sans aucune vente : une heure creuse doit dessiner un plat, pas un
  -- trou.
  select coalesce(jsonb_agg(jsonb_build_object(
           't', to_char(p.pas, case when v_pas = interval '1 hour' then 'HH24:MI' else 'YYYY-MM-DD' end),
           'valeur', coalesce(a.somme, 0),
           'avant', coalesce(b.somme, 0)
         ) order by p.pas), '[]'::jsonb)
    into v_courbe
    from generate_series(v_debut, v_fin - v_pas, v_pas) as p(pas)
    left join (
      select date_bin(v_pas, cree_le, v_debut) as pas, sum(articles_cfa)::bigint as somme
        from public.commandes
       where etat <> 'annulee' and cree_le >= v_debut and cree_le < v_fin
       group by 1
    ) a on a.pas = p.pas
    left join (
      select date_bin(v_pas, cree_le + v_duree, v_debut) as pas, sum(articles_cfa)::bigint as somme
        from public.commandes
       where etat <> 'annulee' and cree_le >= v_debut - v_duree and cree_le < v_debut
       group by 1
    ) b on b.pas = p.pas;

  return jsonb_build_object(
    'ok', true,
    'periode', v_periode,
    'ventes_cfa', v_ventes,
    'commandes', v_commandes,
    'visiteurs', v_visiteurs,
    -- Le taux de conversion : des commandes pour cent visiteurs. Sans visiteur,
    -- il vaut zéro et non « infini » ou « 100 % » : zéro commande sur zéro
    -- visiteur ne dit rien, et un grand nombre affiché ferait croire le
    -- contraire.
    'conversion', case when v_visiteurs > 0
                       then round((v_commandes::numeric / v_visiteurs) * 100, 2)
                       else 0 end,
    'a_traiter', (select count(*) from public.commandes where etat in ('nouvelle', 'preparee')),
    'courbe', v_courbe
  );
end;
$$;

comment on function public.dashboard_vendeur(text) is
  'Les chiffres du Dashboard vendeur pour une période : ventes, commandes, visiteurs, conversion, et la courbe comparée à la période précédente.';

-- La gestion appelle cette fonction avec la session d'Arthur, et `est_admin()`
-- tranche à l'intérieur. Personne d'autre ne doit pouvoir l'appeler : révoquer
-- d'abord pour tout le monde, puis rendre à `authenticated` seulement.
revoke all on function public.dashboard_vendeur(text) from public, anon, authenticated;
grant execute on function public.dashboard_vendeur(text) to authenticated;
