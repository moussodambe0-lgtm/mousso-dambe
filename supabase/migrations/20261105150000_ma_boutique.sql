-- « Ma boutique » : la vitrine de Mousso Dambé.
--
-- Arthur, le 5 novembre 2026 : « tu as ma boutique [...] je veux la même
-- structure ». Chez Jia, chaque vendeur a une ligne dans `shops` avec son nom,
-- son accroche, sa description, son logo, son WhatsApp et son quartier, et
-- l'espace vendeur montre en rouge ce qui manque.
--
-- POURQUOI PAS DE TABLE `boutiques` ICI. Jia en a besoin : il y a des
-- centaines de vendeurs, chacun avec sa ligne. Mousso Dambé est une seule
-- boutique, la sienne. Une table d'une ligne serait une table qu'il faut
-- protéger, sauvegarder et migrer pour toujours contenir exactement une ligne,
-- avec le risque permanent qu'elle en contienne zéro ou deux. La table
-- `reglages` existe déjà, elle est faite pour ça, et elle est déjà protégée.
--
-- CE QUI N'EST PAS REPRIS DE JIA, et pourquoi :
--   - le statut de vérification (en attente, vérifiée, suspendue) : c'est Jia
--     qui vérifie ses vendeurs ; personne ne vérifie Mousso Dambé, c'est la
--     maison ;
--   - le taux de commission : il n'y a pas d'intermédiaire à payer ;
--   - la position sur la carte : les commandes sont livrées, jamais retirées
--     sur place. Le jour où un retrait en boutique existera, ce sera un champ
--     de plus ici, et une ligne de plus dans `manquantsVitrine`.
--   - le RCCM et l'IFU : gardés, parce qu'ils serviront le jour où la boutique
--     facturera, et qu'ils ne coûtent rien tant qu'ils sont vides.

-- Les clés de la vitrine, créées vides pour qu'elles existent dès maintenant :
-- une clé absente et une clé vide se lisent pareil côté application, mais une
-- clé présente se voit dans la table et se documente.
insert into public.reglages (cle, valeur) values
  ('boutique_nom', 'Mousso Dambé'),
  ('boutique_accroche', ''),
  ('boutique_description', ''),
  ('boutique_logo', ''),
  ('boutique_whatsapp', ''),
  ('boutique_quartier', ''),
  ('boutique_raison_sociale', ''),
  ('boutique_rccm', ''),
  ('boutique_ifu', '')
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Lire la vitrine
-- ---------------------------------------------------------------------------
-- Lisible par tout le monde, y compris sans compte : ces informations sont
-- celles qui s'affichent sur la boutique publique. Rien ici n'est secret, et
-- la fonction ne rend que ces neuf clés, jamais le reste de `reglages` (qui
-- contient des quotas et une empreinte de clé serveur).
create or replace function public.boutique_vitrine()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(
           replace(cle, 'boutique_', ''), valeur
         ), '{}'::jsonb)
    from public.reglages
   where cle in (
     'boutique_nom', 'boutique_accroche', 'boutique_description', 'boutique_logo',
     'boutique_whatsapp', 'boutique_quartier',
     'boutique_raison_sociale', 'boutique_rccm', 'boutique_ifu'
   );
$$;

-- ---------------------------------------------------------------------------
-- Enregistrer la vitrine
-- ---------------------------------------------------------------------------
-- Réservée à l'administration. Les longueurs sont vérifiées ICI et pas
-- seulement dans le formulaire : un formulaire se contourne, une fonction non.
create or replace function public.enregistrer_vitrine(
  p_nom text,
  p_accroche text,
  p_description text,
  p_whatsapp text,
  p_quartier text,
  p_raison_sociale text default '',
  p_rccm text default '',
  p_ifu text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nom text := btrim(coalesce(p_nom, ''));
  v_accroche text := btrim(coalesce(p_accroche, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_whatsapp text := btrim(coalesce(p_whatsapp, ''));
  v_quartier text := btrim(coalesce(p_quartier, ''));
  v_tel text;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if length(v_nom) < 2 or length(v_nom) > 60 then
    return jsonb_build_object('ok', false, 'erreur', 'Le nom doit faire entre 2 et 60 caractères.');
  end if;
  if length(v_accroche) > 120 then
    return jsonb_build_object('ok', false, 'erreur', 'L’accroche est limitée à 120 caractères.');
  end if;
  if length(v_description) > 1500 then
    return jsonb_build_object('ok', false, 'erreur', 'La présentation est limitée à 1 500 caractères.');
  end if;
  -- Le numéro est facultatif, mais s'il est là il doit être un vrai numéro
  -- burkinabè : un numéro faux sur la vitrine est pire que pas de numéro, la
  -- cliente appelle dans le vide et croit la boutique fermée.
  --
  -- `telephone_burkina` rend les huit chiffres, ou NULL si ce n'est pas un
  -- numéro d'ici. On enregistre la forme qu'elle rend, pas celle qui a été
  -- tapée : « +226 70 00 00 00 » et « 70000000 » doivent finir identiques en
  -- base, sinon deux écrans qui comparent des numéros ne tombent jamais
  -- d'accord.
  if v_whatsapp <> '' then
    v_tel := public.telephone_burkina(v_whatsapp);
    if v_tel is null then
      return jsonb_build_object('ok', false, 'erreur', 'Numéro WhatsApp invalide.');
    end if;
    v_whatsapp := v_tel;
  end if;

  insert into public.reglages (cle, valeur) values
    ('boutique_nom', v_nom),
    ('boutique_accroche', v_accroche),
    ('boutique_description', v_description),
    ('boutique_whatsapp', v_whatsapp),
    ('boutique_quartier', v_quartier),
    ('boutique_raison_sociale', btrim(coalesce(p_raison_sociale, ''))),
    ('boutique_rccm', btrim(coalesce(p_rccm, ''))),
    ('boutique_ifu', btrim(coalesce(p_ifu, '')))
  on conflict (cle) do update set valeur = excluded.valeur;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.boutique_vitrine() from public;
revoke all on function public.enregistrer_vitrine(text, text, text, text, text, text, text, text) from public;
grant execute on function public.boutique_vitrine() to anon, authenticated;
grant execute on function public.enregistrer_vitrine(text, text, text, text, text, text, text, text) to authenticated;

comment on function public.boutique_vitrine() is
  'La vitrine de Mousso Dambé : nom, accroche, description, logo, WhatsApp, quartier. Publique, rien de secret.';
comment on function public.enregistrer_vitrine(text, text, text, text, text, text, text, text) is
  'Administration : enregistrer la vitrine. Vérifie les longueurs et le numéro côté base.';
