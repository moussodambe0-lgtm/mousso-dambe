-- Le questionnaire passe de quatre questions à huit.
--
-- Section 3 du cahier d'Arthur du 12 octobre 2026. Les quatre nouvelles :
-- la régularité, ce qu'elle ressent pendant ses règles, ce qu'elle vient
-- chercher ici, et la protection qu'elle utilise.
--
-- À quoi chacune sert, parce qu'une question qu'on pose sans s'en servir est
-- une question de trop sur un sujet pareil :
--   - la régularité change le ton des prévisions : on ne promet pas une date
--     à qui a des cycles irréguliers ;
--   - les ressentis remplissent sa première journée de journal, et orientent
--     les conseils de la phase ;
--   - ce qu'elle cherche décide de ce que l'écran met en avant : celle qui
--     veut éviter une grossesse voit la fenêtre fertile en premier, celle qui
--     veut un bébé voit l'ovulation ;
--   - la protection oriente la boutique, et rien d'autre.
--
-- Rien de tout cela ne part vers le service d'IA. Le contexte envoyé au
-- modèle reste le prénom, le jour du cycle et le catalogue, et c'est vérifié
-- par supabase/tests/assistante.test.mjs.

alter table public.profils
  add column if not exists regularite text not null default 'inconnue'
    check (regularite in ('oui', 'parfois', 'non', 'inconnue')),
  add column if not exists ressentis text[] not null default '{}',
  add column if not exists objectif text not null default 'suivre'
    check (objectif in ('suivre', 'eviter', 'bebe', 'comprendre')),
  add column if not exists protection text not null default 'jetables'
    check (protection in ('jetables', 'lavables', 'tampons', 'coupe', 'tissu', 'autre'));

comment on column public.profils.regularite is
  'Ses cycles sont-ils reguliers. Change le ton des previsions, rien d''autre.';
comment on column public.profils.ressentis is
  'Ce qu''elle ressent souvent pendant ses regles. Jamais envoye a l''IA.';
comment on column public.profils.objectif is
  'Ce qu''elle vient chercher. Decide de ce que l''ecran met en avant.';
comment on column public.profils.protection is
  'La protection qu''elle utilise. Oriente la boutique, et rien d''autre.';

/**
 * Enregistrer le questionnaire, version à huit questions.
 *
 * L'ancienne signature est GARDÉE (elle appelle la nouvelle avec les
 * défauts) : une page encore en cache dans un téléphone continue de marcher
 * le jour de la mise à jour, au lieu de renvoyer une erreur au milieu d'un
 * questionnaire déjà rempli.
 *
 * Les listes de choix sont bornées ici et non côté site : le site peut être
 * contourné, la base non.
 */
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
  if p_cycle is null or p_cycle < 20 or p_cycle > 45 then
    return jsonb_build_object('ok', false, 'erreur', 'cycle_invalide');
  end if;
  if p_duree is null or p_duree < 1 or p_duree > 10 then
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

-- L'ancienne signature, qui délègue à la nouvelle.
create or replace function public.enregistrer_questionnaire(
  p_prenom text, p_cycle int, p_duree int, p_dernieres_regles date
) returns jsonb language sql security definer set search_path = public as $$
  select public.enregistrer_questionnaire(
    p_prenom, p_cycle, p_duree, p_dernieres_regles, 'inconnue', '{}'::text[], 'suivre', 'jetables'
  )
$$;

revoke all on function public.enregistrer_questionnaire(text, int, int, date) from public, anon, authenticated;
grant execute on function public.enregistrer_questionnaire(text, int, int, date) to authenticated;
