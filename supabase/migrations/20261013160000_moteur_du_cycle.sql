-- Le moteur du cycle : mêmes bornes et même règle partout.
--
-- Prompt d'Arthur du 13 octobre 2026 (« calcul du cycle »). Trois choses
-- changent côté base, et chacune est dite ici avec sa raison.
--
--   1. LES BORNES. Le cycle va de 21 à 45 jours, les règles de 2 à 10. La base
--      acceptait 20 à 45 et 1 à 10 : une valeur de 20 jours donnait au moteur
--      un cycle qu'il refuse. Les valeurs déjà enregistrées hors bornes sont
--      ramenées à la borne la plus proche, sans rien perdre d'autre.
--
--   2. LA MOYENNE N'EST PLUS IMPOSÉE. `mon_cycle()` remplaçait en silence la
--      durée du cycle du profil par la moyenne observée. Le prompt veut une
--      PROPOSITION : la durée du profil sert au calcul, et la moyenne observée
--      (au moins trois cycles complets) est renvoyée à part, sous
--      `moyenne_proposee`, pour que l'application la propose.
--
--   3. L'OVULATION. `jour_ovulation()` valait déjà L − 14, comme le moteur : la
--      base et le code TypeScript étaient d'accord sur le papier, mais le code
--      TypeScript comptait L − 13 (jour 15 d'un cycle de 28). Cette
--      incohérence est corrigée du côté TypeScript (src/lib/cycleEngine.ts) ;
--      ici, rien à changer, et c'est dit pour que personne ne le cherche.

-- ---------------------------------------------------------------------------
-- 1. Les bornes
-- ---------------------------------------------------------------------------
update public.profils set cycle_moyen = 21 where cycle_moyen < 21;
update public.profils set duree_regles = 2 where duree_regles < 2;

do $$
declare
  v_nom text;
begin
  for v_nom in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.profils'::regclass
       and c.contype = 'c'
       and (pg_get_constraintdef(c.oid) ilike '%cycle_moyen%'
            or pg_get_constraintdef(c.oid) ilike '%duree_regles%')
  loop
    execute format('alter table public.profils drop constraint %I', v_nom);
  end loop;
end;
$$;

alter table public.profils
  add constraint profils_cycle_moyen_check check (cycle_moyen between 21 and 45),
  add constraint profils_duree_regles_check check (duree_regles between 2 and 10);

-- ---------------------------------------------------------------------------
-- 2. Ce que renvoie « mon_cycle » : la durée du profil, et une proposition
-- ---------------------------------------------------------------------------
create or replace function public.mon_cycle()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profil public.profils;
  v_dernier date;
  v_cycle int;
  v_duree int;
  v_jour int;
  v_observe int;
  v_nb int;
  v_propose int;
begin
  select * into v_profil from public.profils where id = auth.uid();
  if v_profil.id is null then
    return jsonb_build_object('connue', false);
  end if;

  select debut into v_dernier from public.cycles
   where profil_id = v_profil.id and debut <= current_date
   order by debut desc limit 1;

  -- La moyenne observée sur les 6 derniers cycles complets. Elle n'est plus
  -- IMPOSÉE : elle est proposée, à partir de trois cycles.
  select round(avg(ecart))::int, count(*) into v_observe, v_nb from (
    select (debut - lag(debut) over (order by debut)) as ecart
      from (select debut from public.cycles where profil_id = v_profil.id order by debut desc limit 7) d
  ) e where ecart between 21 and 45;

  v_propose := case when coalesce(v_nb, 0) >= 3 and v_observe <> v_profil.cycle_moyen then v_observe else null end;

  -- La durée du cycle est CELLE DU PROFIL : celle qu'elle a donnée, ou
  -- acceptée en réponse à la proposition.
  v_cycle := v_profil.cycle_moyen;
  v_duree := v_profil.duree_regles;

  if v_dernier is null then
    return jsonb_build_object(
      'connue', true, 'a_des_donnees', false,
      'cycle_moyen', v_cycle, 'duree_regles', v_duree,
      'prenom', v_profil.prenom, 'cycles_mesures', coalesce(v_nb, 0),
      'moyenne_proposee', v_propose
    );
  end if;

  v_jour := (current_date - v_dernier) + 1;
  -- Au-delà d'un cycle entier sans déclaration, on ne prétend plus savoir où
  -- elle en est : annoncer « jour 41 » serait faux et inquiétant pour rien.
  return jsonb_build_object(
    'connue', true,
    'a_des_donnees', true,
    'prenom', v_profil.prenom,
    'debut_dernieres_regles', v_dernier,
    'jour_du_cycle', v_jour,
    'cycle_moyen', v_cycle,
    'duree_regles', v_duree,
    'cycles_mesures', coalesce(v_nb, 0),
    'moyenne_proposee', v_propose,
    'depasse', v_jour > v_cycle + 7,
    'phase', public.phase_du_cycle(least(v_jour, v_cycle), v_duree, v_cycle),
    'prochaines_regles', v_dernier + v_cycle,
    'jours_restants', (v_dernier + v_cycle) - current_date,
    'ovulation', v_dernier + public.jour_ovulation(v_cycle) - 1,
    'fertile_debut', v_dernier + public.jour_ovulation(v_cycle) - 6,
    'fertile_fin', v_dernier + public.jour_ovulation(v_cycle)
  );
end;
$$;

revoke all on function public.mon_cycle() from public, anon, authenticated;
grant execute on function public.mon_cycle() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Les écritures refusent ce que le moteur refuse
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_reglages(
  p_rappel boolean, p_discretes boolean, p_code boolean,
  p_cycle int default null, p_duree int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_cycle is not null and (p_cycle < 21 or p_cycle > 45) then
    return jsonb_build_object('ok', false, 'erreur', 'cycle_invalide');
  end if;
  if p_duree is not null and (p_duree < 2 or p_duree > 10) then
    return jsonb_build_object('ok', false, 'erreur', 'duree_invalide');
  end if;

  update public.profils
     set rappel_regles = coalesce(p_rappel, rappel_regles),
         notifications_discretes = coalesce(p_discretes, notifications_discretes),
         code_ouverture = coalesce(p_code, code_ouverture),
         cycle_moyen = coalesce(p_cycle, cycle_moyen),
         duree_regles = coalesce(p_duree, duree_regles)
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.enregistrer_reglages(boolean, boolean, boolean, int, int) from public, anon, authenticated;
grant execute on function public.enregistrer_reglages(boolean, boolean, boolean, int, int) to authenticated;

create or replace function public.enregistrer_questionnaire(
  p_prenom text,
  p_cycle int,
  p_duree int,
  p_dernieres_regles date,
  p_regularite text,
  p_ressentis text[],
  p_objectif text,
  p_protection text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_ressentis text[];
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_cycle is null or p_cycle < 21 or p_cycle > 45 then
    return jsonb_build_object('ok', false, 'erreur', 'cycle_invalide');
  end if;
  if p_duree is null or p_duree < 2 or p_duree > 10 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_invalide');
  end if;
  if p_dernieres_regles is not null
     and (p_dernieres_regles > current_date or p_dernieres_regles < current_date - 120) then
    return jsonb_build_object('ok', false, 'erreur', 'date_invalide');
  end if;

  -- Seuls les ressentis connus entrent, au plus dix : une liste libre venue
  -- de l'extérieur finirait affichée quelque part.
  select coalesce(array_agg(distinct r), '{}')
    into v_ressentis
    from unnest(coalesce(p_ressentis, '{}')) as r
   where r in ('ventre', 'fatigue', 'tete', 'humeur', 'abondant', 'rien');

  update public.profils
     set prenom = left(coalesce(nullif(trim(p_prenom), ''), prenom), 40),
         cycle_moyen = p_cycle,
         duree_regles = p_duree,
         regularite = case when p_regularite in ('oui', 'parfois', 'non', 'inconnue')
                           then p_regularite else 'inconnue' end,
         ressentis = v_ressentis[1:10],
         objectif = case when p_objectif in ('suivre', 'eviter', 'bebe', 'comprendre')
                         then p_objectif else 'suivre' end,
         protection = case when p_protection in ('jetables', 'lavables', 'tampons', 'coupe', 'tissu', 'autre')
                           then p_protection else 'jetables' end,
         questionnaire_fini = true
   where id = v_id;

  if p_dernieres_regles is not null then
    insert into public.cycles (profil_id, debut, fin)
    values (v_id, p_dernieres_regles, p_dernieres_regles + p_duree - 1)
    on conflict (profil_id, debut) do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.enregistrer_questionnaire(text, int, int, date, text, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.enregistrer_questionnaire(text, int, int, date, text, text[], text, text)
  to authenticated;
