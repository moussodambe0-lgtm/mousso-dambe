-- Le fil du médecin n'est pas encore ouvert.
--
-- Arthur, le 26 octobre 2026 : « côté message, pour le médecin on va mettre
-- bientôt disponible. Après on va créer un lien qui donnera accès à cette page
-- pour que le médecin réponde aux questions. »
--
-- POURQUOI FERMER EN BASE AUSSI, ET PAS SEULEMENT À L'ÉCRAN
--
-- La carte du médecin ne s'ouvre plus dans l'application (src/lib/medecin.ts).
-- Mais une page bien élevée ne protège rien : `ecrire_a('medecin', …)` reste
-- appelable directement par l'API avec une session ordinaire. C'est exactement
-- la leçon de l'audit du 14 octobre sur l'autre application, où une
-- vérification faite dans la page laissait tout passer par l'API.
--
-- Sans ce garde-fou, une femme pourrait écrire une question intime à un médecin
-- qui n'existe pas encore, et attendre une réponse qui ne viendrait jamais. Sur
-- une question qu'elle n'ose peut-être poser à personne d'autre, c'est pire que
-- de ne rien proposer.
--
-- POUR OUVRIR LE FIL, LE JOUR OÙ UN MÉDECIN RÉPOND, DEUX GESTES :
--   1. en base :  update public.reglages set valeur = 'oui' where cle = 'medecin_actif';
--   2. dans le code : MEDECIN_DISPONIBLE = true dans src/lib/medecin.ts
-- Les deux sont nécessaires, et c'est voulu : un oubli d'un côté ne doit pas
-- laisser partir un message dans le vide.
--
-- CE QUI N'EST PAS TOUCHÉ : l'orientation d'urgence. Les mots qui disent un
-- danger déclenchent toujours le message vers un centre de santé, tout de
-- suite, sans attendre une réponse humaine (décision d'Arthur du 12 octobre).
-- Elle ne dépend pas de ce réglage, et les messages déjà écrits restent
-- lisibles dans l'administration.

insert into public.reglages (cle, valeur) values ('medecin_actif', 'non')
  on conflict (cle) do nothing;

create or replace function public.ecrire_a(p_sujet text, p_texte text, p_produit_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_sujet text;
  v_texte text;
  v_slug text;
  v_fil uuid;
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

  v_sujet := case when p_sujet = 'medecin' then 'medecin' else 'boutique' end;

  -- Le fil du médecin reste fermé tant qu'aucun médecin ne répond. La boutique,
  -- elle, est toujours ouverte : c'est Arthur qui répond lui-même.
  if v_sujet = 'medecin'
     and coalesce((select valeur from public.reglages where cle = 'medecin_actif'), 'non') <> 'oui'
  then
    return jsonb_build_object('ok', false, 'erreur', 'medecin_bientot');
  end if;

  v_texte := btrim(regexp_replace(coalesce(p_texte, ''), '[[:space:]]+', ' ', 'g'));
  if length(v_texte) < 1 then
    return jsonb_build_object('ok', false, 'erreur', 'message_vide');
  end if;
  v_texte := left(v_texte, 2000);

  -- Un produit ne s'attache qu'à un message pour la boutique : une carte
  -- produit dans une conversation médicale n'aurait aucun sens.
  if v_sujet = 'boutique' then
    select slug into v_slug from public.produits
     where slug = p_produit_slug and publie = true;
  end if;

  insert into public.fils (profil_id, sujet) values (v_id, v_sujet)
  on conflict (profil_id, sujet) do nothing;

  select id into v_fil from public.fils where profil_id = v_id and sujet = v_sujet;

  insert into public.messages (fil_id, de, texte, produit_slug)
  values (v_fil, 'elle', v_texte, v_slug);

  update public.fils
     set dernier_le = now(),
         apercu = left(v_texte, 120),
         apercu_de = 'elle',
         non_lus_admin = non_lus_admin + 1
   where id = v_fil;

  -- Le retour garde 'fil' et 'sujet' : la page s'en sert pour savoir où
  -- rediriger. Les avoir perdus en recopiant cette fonction aurait cassé
  -- l'envoi d'un message sans qu'aucun type ne le signale.
  return jsonb_build_object('ok', true, 'fil', v_fil, 'sujet', v_sujet);
end;
$$;

revoke all on function public.ecrire_a(text, text, text) from public, anon, authenticated;
grant execute on function public.ecrire_a(text, text, text) to authenticated;
