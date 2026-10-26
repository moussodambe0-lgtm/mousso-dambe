-- Le numéro avec son indicatif, et l'adresse vérifiée dans le bon ordre.
--
-- Audit de Cyber du 26 octobre 2026, suite de 20261026160000. Les mêmes deux
-- défauts que dans `passer_commande` vivaient à l'identique dans les deux
-- fonctions de « Mes adresses » et « Mes informations », parce que la règle du
-- téléphone y était RECOPIÉE. Trois copies d'une règle finissent toujours par
-- diverger : elles appellent désormais `public.telephone_burkina()`, posée par
-- la migration précédente.
--
-- 1. « +226 70 00 00 00 » et « 0022670000000 » étaient refusés. C'est la forme
--    qu'on obtient en copiant son numéro depuis WhatsApp, et c'est la plus
--    naturelle à écrire. L'indicatif est maintenant retiré, et ce sont toujours
--    les huit chiffres qui sont rangés en base.
--
-- 2. Les bornes géographiques étaient vérifiées APRÈS le contrôle « as-tu une
--    adresse ? ». Une femme sans quartier mais avec un point GPS hors du
--    Burkina passait le contrôle, puis son point était jeté : son adresse était
--    enregistrée VIDE, et l'écran disait que c'était fait. Les bornes passent
--    donc avant, comme dans `passer_commande`.
--
-- Rien d'autre ne change : mêmes paramètres, mêmes codes d'erreur, mêmes
-- longueurs coupées.

create or replace function public.enregistrer_adresse(
  p_nom text,
  p_telephone text,
  p_quartier text,
  p_repere text,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_a_position boolean := p_lat is not null and p_lng is not null;
  v_telephone text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Les bornes AVANT le contrôle de l'adresse : une position hors du Burkina
  -- ne doit pas faire passer une adresse qui n'a ni quartier ni point.
  if v_a_position and (p_lat < 9 or p_lat > 15 or p_lng < -6 or p_lng > 3) then
    v_a_position := false;
    p_lat := null;
    p_lng := null;
  end if;

  if coalesce(trim(p_nom), '') = '' or (coalesce(trim(p_quartier), '') = '' and not v_a_position) then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;

  v_telephone := public.telephone_burkina(p_telephone);
  if v_telephone is null then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  update public.profils
     set nom_livraison = left(trim(p_nom), 60),
         telephone = v_telephone,
         quartier = left(coalesce(trim(p_quartier), ''), 60),
         repere = left(coalesce(trim(p_repere), ''), 120),
         position_lat = p_lat,
         position_lng = p_lng
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.enregistrer_adresse(text, text, text, text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.enregistrer_adresse(text, text, text, text, double precision, double precision)
  to authenticated;

create or replace function public.enregistrer_informations(
  p_prenom text,
  p_telephone text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_brut text := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  v_telephone text := public.telephone_burkina(p_telephone);
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
  -- peut vouloir juste corriger son prénom sans en redonner un. Un champ vide
  -- efface le numéro ; un champ rempli mais faux est refusé.
  if v_brut <> '' and v_telephone is null then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  update public.profils
     set prenom = left(trim(p_prenom), 40),
         telephone = v_telephone
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.enregistrer_informations(text, text) from public, anon, authenticated;
grant execute on function public.enregistrer_informations(text, text) to authenticated;
