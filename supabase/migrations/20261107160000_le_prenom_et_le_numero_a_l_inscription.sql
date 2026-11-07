-- ============================================================================
-- LE PRÉNOM ET LE NUMÉRO ARRIVENT DÈS L'INSCRIPTION
--
-- Arthur, le 7 novembre 2026, en demandant les pages de compte de Jia :
-- « la même manière dont c'est fait ». Chez Jia, le formulaire d'inscription
-- demande le nom et le téléphone en même temps que l'email.
--
-- CE QUI SE PASSAIT AVANT. `profil_a_la_creation` ne recopiait que le prénom
-- depuis les données du compte. Le téléphone n'était demandé qu'au moment de
-- commander, et recopié dans le profil à ce moment-là seulement. Une femme
-- inscrite depuis trois semaines mais qui n'avait pas encore commandé n'avait
-- donc aucun numéro : personne ne pouvait la joindre, et elle devait le
-- retaper à sa première commande.
--
-- POURQUOI LE NUMÉRO COMPTE ICI PLUS QU'AILLEURS. C'est la seule coordonnée
-- que TOUTES les clientes ont. On entre dans l'application par « Commencer »,
-- sans compte ni adresse email, et WhatsApp est le canal de repli de toute la
-- plateforme. Un profil sans numéro est un profil qu'on ne peut pas rattraper.
--
-- LE NUMÉRO EST VÉRIFIÉ, pas seulement recopié. `telephone_burkina` le
-- normalise (retire l'indicatif, les espaces) et refuse ce qui n'est pas un
-- numéro du Burkina. Un numéro faux enregistré en silence, c'est une
-- livraison perdue et un colis payé pour rien : on préfère ne rien écrire.
--
-- `coalesce` et `on conflict do nothing` sont conservés : ce déclencheur
-- s'exécute aussi pour les comptes anonymes, qui n'ont ni l'un ni l'autre, et
-- il ne doit jamais faire échouer la création d'un compte.
-- ============================================================================

create or replace function public.profil_a_la_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, prenom, telephone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    -- `telephone_burkina` REND NULL sur un numéro invalide, elle ne lève pas :
    -- pas besoin d'entourer l'appel. La colonne reste donc simplement vide, ce
    -- qui vaut mieux qu'un numéro auquel personne ne répond.
    public.telephone_burkina(new.raw_user_meta_data ->> 'telephone')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.profil_a_la_creation() from public, anon, authenticated;

comment on function public.profil_a_la_creation() is
  'Crée le profil en même temps que le compte. Depuis le 7 novembre 2026, '
  'recopie aussi le téléphone donné à l''inscription, après vérification par '
  'telephone_burkina. Un numéro invalide laisse la colonne vide plutôt que '
  'd''enregistrer un numéro auquel personne ne répond.';
