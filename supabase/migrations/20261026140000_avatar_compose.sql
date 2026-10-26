-- Elle compose son avatar elle-même.
--
-- Arthur, le 26 octobre 2026 : « les clientes doivent pouvoir personnaliser les
-- avatars, les habiller et tout, donc quand on clique sur la photo de profil on
-- doit pouvoir avoir accès à tout ça. »
--
-- CE QUI CHANGE PAR RAPPORT AU 13 OCTOBRE
--
-- Ce jour-là, le générateur de dessins a été débranché : « je ne veux pas des
-- dessins bizarres comme ce qui est ici, je veux des vrais avatars comme ma
-- mascotte », et « la personne n'aura pas automatiquement une image ». Deux
-- choses étaient reprochées, et une seule l'est encore :
--
--   - l'avatar IMPOSÉ au hasard : cela ne revient pas. Sans choix de sa part,
--     elle garde un rond neutre, jamais un visage inventé.
--   - les dessins eux-mêmes : le générateur a justement été refait le même jour
--     en portrait façon film d'animation (volume du visage, reflets dans les
--     cheveux, iris dégradés). C'est la seule mécanique capable d'habiller un
--     avatar : des images toutes faites ne se superposent pas, les cheveux de
--     l'une ne s'alignent pas sur le crâne de l'autre.
--
-- Les douze portraits 3D produits par Motion le 26 octobre RESTENT dans la
-- galerie : une femme qui préfère prendre un visage tout fait le peut toujours.
-- Les deux chemins coexistent, et `avatar_fichier` l'emporte quand il est posé.
--
-- CE QU'ON STOCKE : six numéros, pas un dessin. Le dessin est refait à chaque
-- affichage par `src/lib/avatar.ts`. Rien n'est téléversé, aucune image ne part
-- sur le réseau, et changer le dessin plus tard ne demande pas de migrer les
-- comptes existants.

alter table public.profils
  add column if not exists avatar_choix jsonb;

comment on column public.profils.avatar_choix is
  'Les traits que la personne a choisis pour son avatar dessine : six numeros
   (teint, cheveux, coiffure, haut, couleurHaut, fond). Vide = elle n''a rien
   compose. `avatar_fichier` (un portrait de la galerie) passe devant.';

-- ---------------------------------------------------------------------------
-- Composer son avatar
-- ---------------------------------------------------------------------------
-- Les six traits sont passés un par un, et non en JSON libre : une fonction qui
-- recopie un objet fourni par l'appelant accepte n'importe quoi, et c'est
-- exactement la faille trouvée le 14 octobre sur l'autre application. Ici la
-- base construit elle-même l'objet, et refuse les numéros hors bornes.
--
-- Les bornes viennent des listes de src/lib/avatar.ts au 26 octobre 2026 :
-- 8 teints, 5 couleurs de cheveux, 10 coiffures, 8 hauts, 11 couleurs de haut,
-- 8 fonds. Elles sont volontairement généreuses (0 à 49) : le jour où une
-- coiffure est ajoutée au dessin, aucune migration n'est nécessaire, et le
-- générateur ramène de toute façon un numéro trop grand dans sa liste.
create or replace function public.composer_avatar(
  p_teint int,
  p_cheveux int,
  p_coiffure int,
  p_haut int,
  p_couleur_haut int,
  p_fond int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_choix jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if p_teint is null or p_cheveux is null or p_coiffure is null
     or p_haut is null or p_couleur_haut is null or p_fond is null then
    return jsonb_build_object('ok', false, 'erreur', 'choix_incomplet');
  end if;

  if least(p_teint, p_cheveux, p_coiffure, p_haut, p_couleur_haut, p_fond) < 0
     or greatest(p_teint, p_cheveux, p_coiffure, p_haut, p_couleur_haut, p_fond) > 49 then
    return jsonb_build_object('ok', false, 'erreur', 'choix_hors_bornes');
  end if;

  v_choix := jsonb_build_object(
    'teint', p_teint,
    'cheveux', p_cheveux,
    'coiffure', p_coiffure,
    'haut', p_haut,
    'couleurHaut', p_couleur_haut,
    'fond', p_fond
  );

  -- Composer son avatar remplace un portrait de la galerie : on ne garde pas
  -- les deux, sinon l'un cacherait l'autre sans qu'elle comprenne pourquoi.
  update public.profils
     set avatar_choix = v_choix,
         avatar_fichier = null
   where id = v_id;

  return jsonb_build_object('ok', true, 'choix', v_choix);
end;
$$;

revoke all on function public.composer_avatar(int, int, int, int, int, int) from public, anon, authenticated;
grant execute on function public.composer_avatar(int, int, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Ne plus rien avoir
-- ---------------------------------------------------------------------------
-- « La personne n'aura pas automatiquement une image » (13 octobre) : il faut
-- donc pouvoir revenir au rond neutre, et effacer les deux chemins d'un coup.
create or replace function public.retirer_mon_avatar()
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

  update public.profils
     set avatar_choix = null,
         avatar_fichier = null
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.retirer_mon_avatar() from public, anon, authenticated;
grant execute on function public.retirer_mon_avatar() to authenticated;

-- ---------------------------------------------------------------------------
-- Choisir un portrait de la galerie efface la composition
-- ---------------------------------------------------------------------------
-- L'inverse du cas ci-dessus, pour la même raison : un seul avatar à la fois.
create or replace function public.choisir_avatar(p_fichier text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_fichier text := nullif(btrim(coalesce(p_fichier, '')), '');
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if v_fichier is not null and not exists (
    select 1 from public.avatars_disponibles where fichier = v_fichier
  ) then
    return jsonb_build_object('ok', false, 'erreur', 'avatar_inconnu');
  end if;

  update public.profils
     set avatar_fichier = v_fichier,
         avatar_choix = null
   where id = v_id;

  -- Le retour garde 'avatar_fichier' : l'originale le renvoyait, et une page
  -- peut s'en servir. L'avoir perdu en recopiant cette fonction n'aurait
  -- déclenché aucune erreur de types, seulement un écran qui ne se met plus à
  -- jour. Rattrapé par une comparaison ligne à ligne avec la version du
  -- 13 octobre, comme pour `ecrire_a` le même jour.
  return jsonb_build_object('ok', true, 'avatar_fichier', v_fichier);
end;
$$;

revoke all on function public.choisir_avatar(text) from public, anon, authenticated;
grant execute on function public.choisir_avatar(text) to authenticated;
