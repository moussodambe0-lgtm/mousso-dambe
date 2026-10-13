-- Mes informations : le prénom et le numéro, modifiables depuis Paramètres.
--
-- Demande d'Arthur du 13 octobre 2026, par message vocal : « Paramètres, mon
-- compte, mes informations [nom, téléphone, email, mot de passe] ». Le
-- prénom et le téléphone n'avaient encore aucune fonction pour les changer
-- hors d'une commande (`passer_commande`) ou de l'adresse (`enregistrer_adresse`,
-- fichier précédent) ; en voici une directe, sans passer par l'un ou l'autre.
--
-- L'email et le mot de passe restent gérés par Supabase Auth directement
-- (`updateUser`) depuis la page : rien à ajouter ici, la base ne connaît
-- que le profil, pas les identifiants.
create or replace function public.enregistrer_informations(
  p_prenom text,
  p_telephone text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_telephone text := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if coalesce(trim(p_prenom), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'prenom_requis');
  end if;
  -- Le téléphone reste facultatif ici (contrairement à une commande) : elle
  -- peut vouloir juste corriger son prénom sans en redonner un.
  if v_telephone <> '' and v_telephone !~ '^[567][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  update public.profils
     set prenom = left(trim(p_prenom), 40),
         telephone = nullif(v_telephone, '')
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.enregistrer_informations(text, text) from public, anon, authenticated;
grant execute on function public.enregistrer_informations(text, text) to authenticated;
