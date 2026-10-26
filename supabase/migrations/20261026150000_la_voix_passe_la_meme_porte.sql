-- La voix passe par la même porte que le texte.
--
-- TROUVÉ PAR CYBER LE 26 OCTOBRE 2026, QUELQUES HEURES APRÈS LA FERMETURE
--
-- La migration 20261026130000 a fermé le fil du médecin : `ecrire_a('medecin',
-- …)` refuse tant que le réglage `medecin_actif` n'est pas à « oui ». Elle
-- disait, à juste titre : « une page bien élevée ne protège rien, la fonction
-- reste appelable directement par l'API ».
--
-- Elle a fermé UNE des deux portes. `envoyer_vocal` ouvre un fil « medecin » et
-- range la voix en base sans jamais regarder ce réglage, et son sujet par
-- défaut est justement « medecin ». Rejoué sur le banc : trois vocaux acceptés,
-- un fil médecin créé, trois enregistrements rangés, pendant que le texte était
-- refusé. La route `/vocal` du site met d'ailleurs « medecin » par défaut elle
-- aussi, et `/discussions/medecin` affiche encore l'écran complet avec le
-- bouton d'enregistrement : seul le LIEN vers cette page est caché.
--
-- Pourquoi ça compte plus que pour le texte, et pas moins : une femme
-- enregistre quatre-vingt-dix secondes sur une question qu'elle n'ose poser à
-- personne, avec sa voix, et attend une réponse qui ne viendra jamais. C'est
-- exactement ce que la fermeture voulait éviter.
--
-- La boutique, elle, reste ouverte à la voix : c'est Arthur qui répond.
--
-- POUR OUVRIR LE FIL LE JOUR OÙ UN MÉDECIN RÉPOND, rien ne change : le réglage
-- `medecin_actif` à « oui » ouvre maintenant le texte ET la voix d'un seul
-- geste, et `MEDECIN_DISPONIBLE` dans src/lib/medecin.ts ouvre l'écran.

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

  -- Le même plafond que les messages écrits : un vocal est un message.
  if not public.quota_ok('message', public.reglage_entier('quota_message_heure', 20), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'quota');
  end if;

  -- LA PORTE, la même que celle de `ecrire_a`. Le code d'erreur est le même,
  -- pour que la page affiche le même message : « bientôt disponible ».
  if v_sujet = 'medecin'
     and coalesce((select valeur from public.reglages where cle = 'medecin_actif'), 'non') <> 'oui'
  then
    return jsonb_build_object('ok', false, 'erreur', 'medecin_bientot');
  end if;

  if p_type is null or p_type not in ('audio/webm', 'audio/mp4', 'audio/ogg') then
    return jsonb_build_object('ok', false, 'erreur', 'format_refuse');
  end if;

  v_duree := coalesce(p_secondes, 0);
  if v_duree < 1 or v_duree > 90 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_refusee');
  end if;

  -- `decode` lève une exception sur un base64 abîmé : on l'attrape, parce
  -- qu'un enregistrement coupé par une connexion qui tombe ne doit pas
  -- renvoyer une erreur de base de données à l'écran.
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

  -- L'aperçu de la liste des discussions. On n'écrit pas un bout de ce qui
  -- est dit, puisqu'on ne le sait pas : on dit qu'il y a un vocal et combien
  -- il dure. C'est aussi plus discret sur un écran qu'on regarde par-dessus
  -- l'épaule.
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
