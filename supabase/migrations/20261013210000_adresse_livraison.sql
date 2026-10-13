-- L'adresse de livraison : à voir, à garder, à partager par position.
--
-- Message vocal d'Arthur du 13 octobre 2026. Ce qu'il décrit :
--   - un endroit dans le compte pour voir et changer son adresse de livraison,
--     même sans commander ;
--   - sur cette adresse, un bouton « partager ma position » : si elle
--     l'utilise, elle n'a plus besoin de donner son quartier à la main ;
--   - « garder cette adresse dans mon compte » pour ne plus la redonner à la
--     prochaine commande.
--
-- CE QUI EXISTAIT DÉJÀ ET QUE PERSONNE NE VOYAIT : `passer_commande`
-- enregistre déjà le nom, le téléphone, le quartier et le repère sur le
-- profil après CHAQUE commande (voir `20261012110000_fermer_les_portes.sql`).
-- Le mécanisme de « garder l'adresse » existe depuis le premier jour ; il
-- n'avait simplement aucun écran pour la voir, la changer, ou la donner par
-- position plutôt que par quartier. C'est ce que ce fichier ajoute.

alter table public.profils
  add column if not exists nom_livraison text,
  add column if not exists position_lat double precision,
  add column if not exists position_lng double precision;

comment on column public.profils.nom_livraison is
  'Le nom donné au livreur (peut etre un nom complet, different du prenom '
  'utilise dans l''application). Rempli apres une commande ou depuis '
  '« Mes adresses ».';

comment on column public.profils.position_lat is
  'Partagee depuis le bouton « Partager ma position », au lieu du quartier et '
  'du repere. Jamais devinee : seulement si elle appuie elle-meme sur le '
  'bouton, et son navigateur le lui demande avant de la donner.';

alter table public.commandes
  add column if not exists position_lat double precision,
  add column if not exists position_lng double precision;

-- ---------------------------------------------------------------------------
-- Passer commande, avec la position en plus du quartier
-- ---------------------------------------------------------------------------
-- La position complète le quartier (elle ne le remplace qu'à l'écran) : le
-- livreur garde CE QUI EST DONNÉ, qu'il n'y ait qu'un des deux ou les deux.
-- Seule l'adresse manuelle (ni quartier, ni position) reste refusée.
drop function if exists public.passer_commande(jsonb, text, text, text, text);

create or replace function public.passer_commande(
  p_panier jsonb,
  p_nom text,
  p_telephone text,
  p_quartier text,
  p_repere text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_garder boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
  v_numero text;
  v_article jsonb;
  v_produit public.produits;
  v_quantite int;
  v_taille text;
  v_articles int := 0;
  v_livraison int;
  v_lignes int := 0;
  v_a_position boolean := p_lat is not null and p_lng is not null;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.quota_ok('commande', public.reglage_entier('quota_commande_heure', 5), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'trop_de_commandes');
  end if;
  if p_panier is null or jsonb_typeof(p_panier) <> 'array' or jsonb_array_length(p_panier) = 0 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;
  if jsonb_array_length(p_panier) > 20 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;
  -- L'adresse est incomplète seulement si elle n'a NI quartier NI position :
  -- partager sa position suffit, comme le quartier suffisait avant.
  if coalesce(trim(p_nom), '') = '' or (coalesce(trim(p_quartier), '') = '' and not v_a_position) then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;
  if regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g') !~ '^[567][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;
  -- Des coordonnées hors du Burkina ne veulent rien dire pour un livreur à
  -- Ouaga : plutôt les ignorer que tromper qui prépare la course.
  if v_a_position and (p_lat < 9 or p_lat > 15 or p_lng < -6 or p_lng > 3) then
    v_a_position := false;
    p_lat := null;
    p_lng := null;
  end if;

  v_livraison := public.reglage_entier('livraison_cfa', 1000);
  v_numero := 'MD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.numero_commande_seq')::text, 5, '0');

  insert into public.commandes (numero, profil_id, nom, telephone, quartier, repere,
                                position_lat, position_lng, articles_cfa, livraison_cfa, total_cfa)
  values (v_numero, v_id, left(trim(p_nom), 60),
          regexp_replace(p_telephone, '[^0-9]', '', 'g'),
          left(coalesce(trim(p_quartier), ''), 60), left(coalesce(trim(p_repere), ''), 120),
          p_lat, p_lng,
          0, v_livraison, 0)
  returning id into v_commande;

  for v_article in select * from jsonb_array_elements(p_panier) loop
    select * into v_produit from public.produits
     where slug = (v_article ->> 'slug') and publie
     for update;
    if v_produit.id is null then
      raise exception 'produit_inconnu';
    end if;

    v_quantite := least(greatest(coalesce((v_article ->> 'quantite')::int, 1), 1), 20);
    if v_produit.stock < v_quantite then
      raise exception 'stock_insuffisant:%', v_produit.nom;
    end if;

    v_taille := nullif(trim(coalesce(v_article ->> 'taille', '')), '');
    if array_length(v_produit.tailles, 1) is not null then
      if v_taille is null or not (v_taille = any (v_produit.tailles)) then
        raise exception 'taille_invalide:%', v_produit.nom;
      end if;
    else
      v_taille := null;
    end if;

    insert into public.commande_lignes (commande_id, produit_id, nom, taille, prix_cfa, quantite, total_ligne_cfa)
    values (v_commande, v_produit.id, v_produit.nom, v_taille, v_produit.prix_cfa,
            v_quantite, v_produit.prix_cfa * v_quantite);

    update public.produits set stock = stock - v_quantite where id = v_produit.id;
    v_articles := v_articles + v_produit.prix_cfa * v_quantite;
    v_lignes := v_lignes + 1;
  end loop;

  if v_lignes = 0 then
    raise exception 'panier_vide';
  end if;

  update public.commandes
     set articles_cfa = v_articles, total_cfa = v_articles + v_livraison
   where id = v_commande;

  -- « Garder cette adresse dans mon compte » : coché par défaut, comme le
  -- comportement d'avant ce fichier. Décochée, la commande part quand même,
  -- mais rien n'est gardé pour la suivante.
  if p_garder then
    update public.profils
       set telephone = regexp_replace(p_telephone, '[^0-9]', '', 'g'),
           quartier = left(coalesce(trim(p_quartier), ''), 60),
           repere = left(coalesce(trim(p_repere), ''), 120),
           nom_livraison = left(trim(p_nom), 60),
           position_lat = p_lat,
           position_lng = p_lng,
           prenom = case when prenom = '' then public.premier_mot(p_nom) else prenom end
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'numero', v_numero, 'total', v_articles + v_livraison);
exception
  when others then
    return jsonb_build_object('ok', false, 'erreur', sqlerrm);
end;
$$;

revoke all on function public.passer_commande(jsonb, text, text, text, text, double precision, double precision, boolean)
  from public, anon, authenticated;
grant execute on function public.passer_commande(jsonb, text, text, text, text, double precision, double precision, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Changer son adresse SANS commander, depuis « Mes adresses »
-- ---------------------------------------------------------------------------
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
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if coalesce(trim(p_nom), '') = '' or (coalesce(trim(p_quartier), '') = '' and not v_a_position) then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;
  if regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g') !~ '^[567][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;
  if v_a_position and (p_lat < 9 or p_lat > 15 or p_lng < -6 or p_lng > 3) then
    v_a_position := false;
    p_lat := null;
    p_lng := null;
  end if;

  update public.profils
     set nom_livraison = left(trim(p_nom), 60),
         telephone = regexp_replace(p_telephone, '[^0-9]', '', 'g'),
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

-- ---------------------------------------------------------------------------
-- Les coordonnées, visibles à l'administratrice sur une commande
-- ---------------------------------------------------------------------------
create or replace function public.commandes_admin(p_etat text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lignes jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select coalesce(jsonb_agg(l order by l_quand desc), '[]'::jsonb)
    into v_lignes
    from (
      select jsonb_build_object(
               'id', c.id,
               'numero', c.numero,
               'etat', c.etat,
               'nom', c.nom,
               'telephone', c.telephone,
               'quartier', c.quartier,
               'repere', c.repere,
               'position_lat', c.position_lat,
               'position_lng', c.position_lng,
               'total_cfa', c.total_cfa,
               'livraison_cfa', c.livraison_cfa,
               'quand', c.cree_le,
               'articles', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'nom', cl.nom, 'taille', cl.taille,
                          'quantite', cl.quantite, 'prix_cfa', cl.prix_cfa
                        ) order by cl.nom), '[]'::jsonb)
                   from public.commande_lignes cl where cl.commande_id = c.id
               )
             ) as l,
             c.cree_le as l_quand
        from public.commandes c
       where p_etat is null or p_etat = '' or c.etat::text = p_etat
       order by c.cree_le desc
       limit 100
    ) s;

  return jsonb_build_object(
    'ok', true,
    'commandes', v_lignes,
    'compte', jsonb_build_object(
      'nouvelle', (select count(*) from public.commandes where etat = 'nouvelle'),
      'preparee', (select count(*) from public.commandes where etat = 'preparee'),
      'envoyee', (select count(*) from public.commandes where etat = 'envoyee'),
      'livree', (select count(*) from public.commandes where etat = 'livree'),
      'annulee', (select count(*) from public.commandes where etat = 'annulee')
    )
  );
end;
$$;

revoke all on function public.commandes_admin(text) from public, anon, authenticated;
grant execute on function public.commandes_admin(text) to authenticated;
