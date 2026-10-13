-- Les vocaux avec la boutique, dans les deux sens.
--
-- Demande d'Arthur du 13 octobre 2026 : « je veux aussi la possibilité
-- d'envoyer des audio à Mousso Dambé, et Mousso Dambé aussi doit pouvoir en
-- envoyer ». Jusqu'ici le vocal n'existait que chez le médecin, et seulement
-- dans le sens femme vers médecin.
--
-- CE QUI CHANGE.
--
--   1. Elle peut envoyer un vocal à la boutique ET au médecin : `envoyer_vocal`
--      prend maintenant un sujet. Le même plafond de messages, les mêmes
--      bornes (90 secondes, 1,2 Mo, trois formats connus).
--
--   2. L'administratrice peut répondre par un vocal : `repondre_vocal`, qui
--      est à `repondre_a` ce que `envoyer_vocal` est à `ecrire_a`. Elle répond
--      dans le fil qu'elle ouvre, boutique ou médecin.
--
--   3. « Effacer mes données » efface TOUS ses vocaux, pas seulement ceux du
--      médecin. La conversation avec la boutique reste (comme ses commandes),
--      mais une voix est ce qu'il y a de plus personnel : elle ne reste jamais
--      après un effacement. Les messages écrits de cette conversation, eux,
--      restent.
--
-- CE QUI NE CHANGE PAS : le son reste dans la table `vocaux`, fermée à tout le
-- monde, lue seulement par `lire_vocal`, et qui vérifie qui écoute. Rien ne
-- part vers un service extérieur, rien n'est transcrit.

-- ---------------------------------------------------------------------------
-- 1. Envoyer un vocal : à la boutique ou au médecin
-- ---------------------------------------------------------------------------
-- On retire l'ancienne signature : deux fonctions du même nom dont tous les
-- arguments sont facultatifs se disputeraient chaque appel (« Could not
-- choose a best candidate function »).
drop function if exists public.envoyer_vocal(text, text, int);

create or replace function public.envoyer_vocal(
  p_base64 text,
  p_type text,
  p_secondes int,
  p_sujet text default 'medecin'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_sujet text := case when p_sujet = 'boutique' then 'boutique' else 'medecin' end;
  v_octets bytea;
  v_fil uuid;
  v_message uuid;
  v_duree int;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if not public.quota_ok('message', public.reglage_entier('quota_message_heure', 20), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'quota');
  end if;

  if p_type is null or p_type not in ('audio/webm', 'audio/mp4', 'audio/ogg') then
    return jsonb_build_object('ok', false, 'erreur', 'format_refuse');
  end if;

  v_duree := coalesce(p_secondes, 0);
  if v_duree < 1 or v_duree > 90 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_refusee');
  end if;

  begin
    v_octets := decode(coalesce(p_base64, ''), 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_abime');
  end;

  if octet_length(v_octets) < 500 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_vide');
  end if;
  if octet_length(v_octets) > 1200000 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_trop_long');
  end if;

  insert into public.fils (profil_id, sujet) values (v_id, v_sujet)
  on conflict (profil_id, sujet) do nothing;

  select id into v_fil from public.fils where profil_id = v_id and sujet = v_sujet;

  insert into public.messages (fil_id, de, texte, vocal_secondes)
  values (v_fil, 'elle', '', v_duree)
  returning id into v_message;

  insert into public.vocaux (message_id, octets, type_mime)
  values (v_message, v_octets, p_type);

  update public.fils
     set dernier_le = now(),
         apercu = 'Message vocal · ' || v_duree || ' s',
         apercu_de = 'elle',
         non_lus_admin = non_lus_admin + 1
   where id = v_fil;

  return jsonb_build_object('ok', true, 'message', v_message, 'secondes', v_duree, 'sujet', v_sujet);
end;
$$;

revoke all on function public.envoyer_vocal(text, text, int, text) from public, anon, authenticated;
grant execute on function public.envoyer_vocal(text, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Répondre par un vocal : administratrice seulement
-- ---------------------------------------------------------------------------
create or replace function public.repondre_vocal(
  p_fil uuid,
  p_base64 text,
  p_type text,
  p_secondes int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_octets bytea;
  v_message uuid;
  v_duree int;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if p_type is null or p_type not in ('audio/webm', 'audio/mp4', 'audio/ogg') then
    return jsonb_build_object('ok', false, 'erreur', 'format_refuse');
  end if;

  v_duree := coalesce(p_secondes, 0);
  if v_duree < 1 or v_duree > 90 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_refusee');
  end if;

  begin
    v_octets := decode(coalesce(p_base64, ''), 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_abime');
  end;

  if octet_length(v_octets) < 500 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_vide');
  end if;
  if octet_length(v_octets) > 1200000 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_trop_long');
  end if;

  if not exists (select 1 from public.fils where id = p_fil) then
    return jsonb_build_object('ok', false, 'erreur', 'fil_inconnu');
  end if;

  insert into public.messages (fil_id, de, texte, vocal_secondes)
  values (p_fil, 'boutique', '', v_duree)
  returning id into v_message;

  insert into public.vocaux (message_id, octets, type_mime)
  values (v_message, v_octets, p_type);

  update public.fils
     set dernier_le = now(),
         apercu = 'Message vocal · ' || v_duree || ' s',
         apercu_de = 'boutique',
         non_lus_elle = non_lus_elle + 1
   where id = p_fil;

  return jsonb_build_object('ok', true, 'message', v_message, 'secondes', v_duree);
end;
$$;

revoke all on function public.repondre_vocal(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.repondre_vocal(uuid, text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. « Effacer mes données » efface toutes ses voix
-- ---------------------------------------------------------------------------
create or replace function public.effacer_mes_donnees()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  delete from public.assistante_messages where profil_id = v_id;
  delete from public.journal where profil_id = v_id;
  delete from public.cycles where profil_id = v_id;
  -- La conversation avec le médecin, en entier (messages et voix).
  delete from public.fils where profil_id = v_id and sujet = 'medecin';
  -- Les VOIX de la conversation avec la boutique, dans les deux sens. Les
  -- messages écrits, eux, restent, comme les commandes.
  delete from public.messages m
   using public.fils f
   where m.fil_id = f.id and f.profil_id = v_id and m.vocal_secondes is not null;
  update public.profils
     set cycle_moyen = 28, duree_regles = 5, questionnaire_fini = false
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
