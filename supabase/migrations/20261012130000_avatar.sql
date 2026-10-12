-- L'avatar de chaque utilisatrice.
--
-- Demande d'Arthur du 12 octobre 2026, avec un générateur fourni dans son code
-- de référence : une graine de texte donne toujours le même visage. On ne garde
-- donc QUE la graine, jamais une image.
--
-- Pourquoi c'est le bon choix ici, et pas seulement le plus simple :
--   - aucune photo à téléverser, donc rien à héberger, rien à modérer, et
--     aucun visage réel dans une base de données de santé ;
--   - une fille qui ne veut pas se montrer sur une application de règles a
--     quand même un visage à elle ;
--   - huit caractères pèsent moins qu'une image, ce qui compte sur une 3G.

alter table public.profils
  add column if not exists avatar_graine text not null default '';

comment on column public.profils.avatar_graine is
  'Graine du générateur d''avatar. Jamais une image, jamais une photo.';

/**
 * Changer d'avatar.
 *
 * La graine est bornée et nettoyée : elle finit dans un identifiant SVG, et
 * un texte libre y ferait entrer n'importe quoi dans la page.
 */
create or replace function public.changer_avatar(p_graine text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_propre text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Lettres, chiffres et tirets seulement, 24 caractères au plus.
  v_propre := left(regexp_replace(coalesce(p_graine, ''), '[^a-zA-Z0-9-]', '', 'g'), 24);
  if length(v_propre) < 3 then
    return jsonb_build_object('ok', false, 'erreur', 'graine_invalide');
  end if;

  update public.profils set avatar_graine = v_propre where id = v_id;
  return jsonb_build_object('ok', true, 'graine', v_propre);
end;
$$;

revoke all on function public.changer_avatar(text) from public, anon, authenticated;
grant execute on function public.changer_avatar(text) to authenticated;
