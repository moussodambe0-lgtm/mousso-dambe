-- Monde : qui vient sur Mousso Dambé.
--
-- Arthur, le 5 novembre 2026, en comparant avec l'administration de Jia :
-- « je ne vois pas Monde [...] Jia admin a tellement de points, ça devait
-- ressortir ici ». Chez Jia, l'écran « Monde » répond à une demande du
-- 23 octobre : « je veux voir tout ce qui devienne vendeur, tout ce qui
-- s'inscrive ou se connecte, et tout ce qui vienne sans compte ».
--
-- CE QU'ON PEUT HONNÊTEMENT MONTRER ICI, et ce qu'on ne montre pas.
--
-- Jia compte aussi les visiteuses sans compte, parce qu'il tient une table de
-- passages. Mousso Dambé n'en a pas, et on n'en fabrique pas une au passage :
-- suivre les pas de quelqu'un qui n'a rien demandé, sur une application qui
-- traite des règles et des douleurs, mérite mieux qu'une décision prise en
-- chemin. Cet écran s'en tient donc aux comptes créés et aux commandes, qui
-- sont des gestes volontaires. Le jour où Arthur voudra compter les visites,
-- ce sera une décision à part, avec ce qu'il faut dire aux visiteuses.
--
-- CE QUE CETTE FONCTION NE LIT JAMAIS, par construction : aucun cycle, aucune
-- note de journal, aucune question posée à Dambé. Elle ne touche ni
-- `cycles`, ni `journal`, ni `assistante_messages`. Un écran d'administration
-- qui lirait le journal intime de quelqu'un n'a pas sa place ici, et c'est une
-- règle posée dès le 12 octobre 2026.
--
-- Aucun prénom, aucun numéro : des nombres. Savoir que douze femmes se sont
-- inscrites cette semaine suffit à piloter ; savoir lesquelles n'apporte rien
-- de plus et coûte leur intimité.

create or replace function public.monde()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jours jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Les trente derniers jours, un point par jour, y compris les jours vides :
  -- un trou dans une courbe se lit, une date absente ne se voit pas.
  select coalesce(jsonb_agg(jsonb_build_object(
           'jour', j.jour,
           'inscriptions', coalesce(i.n, 0),
           'commandes', coalesce(c.n, 0)
         ) order by j.jour), '[]'::jsonb)
    into v_jours
    from generate_series((current_date - interval '29 days')::date, current_date, interval '1 day') as j(jour)
    left join (
      select cree_le::date as jour, count(*) as n
        from public.profils
       where cree_le >= current_date - interval '29 days'
       group by 1
    ) i on i.jour = j.jour
    left join (
      select cree_le::date as jour, count(*) as n
        from public.commandes
       where cree_le >= current_date - interval '29 days'
       group by 1
    ) c on c.jour = j.jour;

  return jsonb_build_object(
    'ok', true,
    'comptes', (select count(*) from public.profils),
    'comptes_7j', (select count(*) from public.profils where cree_le >= now() - interval '7 days'),
    'comptes_30j', (select count(*) from public.profils where cree_le >= now() - interval '30 days'),
    -- Celles qui ont commandé au moins une fois. Le rapport entre ce nombre et
    -- le nombre de comptes dit si l'application sert à acheter ou seulement à
    -- suivre son cycle : deux métiers, et la réponse change la stratégie.
    'ont_commande', (select count(distinct profil_id) from public.commandes),
    'ont_recommande', (
      select count(*) from (
        select profil_id from public.commandes group by profil_id having count(*) > 1
      ) s
    ),
    'questionnaire_fait', (select count(*) from public.profils where questionnaire_fini),
    'jours', v_jours
  );
end;
$$;

revoke all on function public.monde() from public;
grant execute on function public.monde() to authenticated;

comment on function public.monde() is
  'Administration : nombres de comptes et de commandes, sans aucune donnée personnelle, sans jamais lire un cycle ni un journal.';
