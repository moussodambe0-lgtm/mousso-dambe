-- Les photos de profil : choisies, pas devinées.
--
-- Décision d'Arthur du 13 octobre 2026, par message vocal : « je ne veux pas
-- des dessins bizarres comme ce qui est ici, je veux des vrais avatars comme
-- ma mascotte. [...] Maintenant, pour les photos de profil, la personne
-- n'aura pas automatiquement une image. Si la personne veut une photo de
-- profil, quand elle clique sur la photo de profil, on lui propose des
-- avatars. »
--
-- CE QUI CHANGE :
--   1. Plus d'avatar automatique. Le générateur de dessins SVG (`avatar_graine`,
--      `src/lib/avatar.ts`) ne tourne plus pour personne. La colonne reste en
--      base (elle ne gêne rien, et une commande déjà écrite la lit encore),
--      mais rien ne l'affiche plus : tant qu'elle n'a rien choisi, sa photo
--      de profil est un rond neutre.
--   2. Elle CHOISIT, dans une petite galerie, parmi de vraies images (le
--      style de la mascotte, pas des dessins). `avatar_fichier` pointe vers
--      un fichier public (`public/avatars/<fichier>`), ou reste vide.
--
-- La galerie elle-même (`avatars_disponibles`) est une TABLE, pas une liste
-- écrite dans le code : Arthur ou Motion y ajoutent une ligne quand une
-- nouvelle photo est prête, sans toucher à une seule fonction. C'est aussi ce
-- qui empêche de choisir n'importe quel nom de fichier : la clé étrangère sur
-- `avatar_fichier` refuse tout ce qui n'est pas dans cette table.

create table if not exists public.avatars_disponibles (
  fichier text primary key,
  -- 'femme', 'homme', ou 'mascotte' (la soignante, qui n'est d'aucun genre
  -- précis) : pour trier la galerie, pas pour filtrer qui peut la choisir.
  genre text not null check (genre in ('femme', 'homme', 'mascotte')),
  ordre int not null default 0,
  ajoute_le timestamptz not null default now()
);

alter table public.avatars_disponibles enable row level security;
revoke all on table public.avatars_disponibles from public, anon, authenticated;
grant select on table public.avatars_disponibles to authenticated;

-- Tout le monde connecté peut VOIR la galerie (c'est un catalogue, pas une
-- donnée personnelle). Personne n'y écrit directement : une ligne de plus
-- s'ajoute à la main depuis l'éditeur SQL, par Arthur.
create policy avatars_disponibles_lecture on public.avatars_disponibles
  for select to authenticated
  using (true);

comment on table public.avatars_disponibles is
  'La galerie de photos de profil proposees au choix. Remplie a la main par '
  'Arthur quand une nouvelle photo est prete (voir atelier-motion/images/avatars). '
  'Une ligne ici, et le fichier correspondant dans public/avatars/, suffisent '
  'a l''ajouter a la galerie : aucun code a changer.';

-- Ce qu'on a aujourd'hui : la seule vraie image existante dans ce style, le
-- visage de la mascotte. Arthur veut aussi « quelques mascottes hommes » et
-- « des femmes de la vingtaine » : ce sont des photos qui restent à produire
-- (bloqué le 13 octobre 2026 par le crédit épuisé de l'outil de génération
-- d'images). Cette ligne n'est donc qu'un début, pas la galerie promise.
insert into public.avatars_disponibles (fichier, genre, ordre) values
  ('infirmiere-visage.webp', 'mascotte', 10)
on conflict (fichier) do nothing;

-- ---------------------------------------------------------------------------
-- La colonne : vide par défaut, et seulement un fichier qui existe vraiment.
-- ---------------------------------------------------------------------------
alter table public.profils
  add column if not exists avatar_fichier text references public.avatars_disponibles(fichier);

comment on column public.profils.avatar_fichier is
  'Le fichier choisi dans avatars_disponibles, ou NULL tant qu''elle n''a rien '
  'choisi (13 octobre 2026 : plus d''avatar automatique). Le rond reste neutre '
  'jusqu''a son choix.';

-- ---------------------------------------------------------------------------
-- Choisir, ou ne plus avoir de photo
-- ---------------------------------------------------------------------------
/**
 * Elle choisit une photo de la galerie, ou retire la sienne (p_fichier null).
 *
 * La clé étrangère fait le gros du travail : un nom de fichier qui n'est pas
 * dans `avatars_disponibles` fait échouer l'écriture, qu'on traduit ici en
 * une erreur normale plutôt qu'une panne de base.
 */
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

  update public.profils set avatar_fichier = v_fichier where id = v_id;
  return jsonb_build_object('ok', true, 'avatar_fichier', v_fichier);
end;
$$;

revoke all on function public.choisir_avatar(text) from public, anon, authenticated;
grant execute on function public.choisir_avatar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- La galerie, à proposer dans le choix
-- ---------------------------------------------------------------------------
create or replace function public.galerie_avatars()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object('fichier', fichier, 'genre', genre) order by ordre, fichier
         ), '[]'::jsonb)
    from public.avatars_disponibles
$$;

revoke all on function public.galerie_avatars() from public, anon, authenticated;
grant execute on function public.galerie_avatars() to authenticated;

-- ---------------------------------------------------------------------------
-- L'administratrice voit la photo CHOISIE, jamais un dessin généré
-- ---------------------------------------------------------------------------
create or replace function public.boite_de_reception(
  p_recherche text default null,
  p_depuis int default 0,
  p_sujet text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cherche text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_sujet text := case when p_sujet in ('boutique', 'medecin') then p_sujet else null end;
  v_lignes jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select coalesce(jsonb_agg(l order by l_dernier desc), '[]'::jsonb)
    into v_lignes
    from (
      select jsonb_build_object(
               'fil', f.id,
               'sujet', f.sujet,
               'prenom', coalesce(nullif(p.prenom, ''), 'Sans prénom'),
               'telephone', coalesce(p.telephone, ''),
               'avatar_fichier', p.avatar_fichier,
               'apercu', f.apercu,
               'apercu_de', f.apercu_de,
               'quand', f.dernier_le,
               'non_lus', f.non_lus_admin
             ) as l,
             f.dernier_le as l_dernier
        from public.fils f
        join public.profils p on p.id = f.profil_id
       where (v_sujet is null or f.sujet = v_sujet)
         and (v_cherche is null
              or p.prenom ilike '%' || v_cherche || '%'
              or coalesce(p.telephone, '') like '%' || v_cherche || '%')
       order by f.dernier_le desc
       limit 50 offset greatest(0, coalesce(p_depuis, 0))
    ) s;

  return jsonb_build_object(
    'ok', true,
    'fils', v_lignes,
    'non_lus', (select coalesce(sum(non_lus_admin), 0) from public.fils),
    'non_lus_boutique', (select coalesce(sum(non_lus_admin), 0) from public.fils where sujet = 'boutique'),
    'non_lus_medecin', (select coalesce(sum(non_lus_admin), 0) from public.fils where sujet = 'medecin'),
    'commandes_nouvelles', (select count(*) from public.commandes where etat = 'nouvelle')
  );
end;
$$;

revoke all on function public.boite_de_reception(text, int, text) from public, anon, authenticated;
grant execute on function public.boite_de_reception(text, int, text) to authenticated;

create or replace function public.fil_complet(p_fil uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tete jsonb;
  v_messages jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select jsonb_build_object(
           'fil', f.id,
           'sujet', f.sujet,
           'prenom', coalesce(nullif(p.prenom, ''), 'Sans prénom'),
           'telephone', coalesce(p.telephone, ''),
           'avatar_fichier', p.avatar_fichier,
           -- Dans une conversation médicale, le nombre de commandes n'a rien
           -- à faire sous les yeux de qui répond. Règle posée le 12 octobre.
           'commandes', case when f.sujet = 'medecin' then null else
             (select count(*) from public.commandes c where c.profil_id = p.id) end
         )
    into v_tete
    from public.fils f
    join public.profils p on p.id = f.profil_id
   where f.id = p_fil;

  if v_tete is null then
    return jsonb_build_object('ok', false, 'erreur', 'fil_inconnu');
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', m.id,
             'de', m.de,
             'texte', m.texte,
             'quand', m.cree_le,
             'lu', m.lu_le is not null,
             'vocal_secondes', m.vocal_secondes,
             'produit', case when pr.slug is null then null else jsonb_build_object(
               'slug', pr.slug, 'nom', pr.nom, 'prix_cfa', pr.prix_cfa, 'image', pr.image
             ) end
           ) order by m.cree_le
         ), '[]'::jsonb)
    into v_messages
    from public.messages m
    left join public.produits pr on pr.slug = m.produit_slug
   where m.fil_id = p_fil;

  return jsonb_build_object('ok', true, 'tete', v_tete, 'messages', v_messages);
end;
$$;

revoke all on function public.fil_complet(uuid) from public, anon, authenticated;
grant execute on function public.fil_complet(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Les favoris, avec de quoi les afficher sur le compte
-- ---------------------------------------------------------------------------
/**
 * Ses favoris, avec le produit complet : la fiche « Mon compte » les montre
 * (demande d'Arthur, 13 octobre 2026 : « un endroit où on peut voir les
 * favoris »). Seuls les produits encore en vente sortent : un favori sur un
 * produit retiré ne doit pas afficher une case vide.
 */
create or replace function public.mes_favoris()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  return jsonb_build_object(
    'ok', true,
    'favoris', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'slug', pr.slug, 'nom', pr.nom, 'prix_cfa', pr.prix_cfa,
                 'image', pr.image, 'rayon', pr.rayon, 'etiquette', pr.etiquette,
                 'stock', pr.stock
               ) order by fav.cree_le desc
             ), '[]'::jsonb)
        from public.favoris fav
        join public.produits pr on pr.slug = fav.produit_slug and pr.publie = true
       where fav.profil_id = v_id
    )
  );
end;
$$;

revoke all on function public.mes_favoris() from public, anon, authenticated;
grant execute on function public.mes_favoris() to authenticated;
