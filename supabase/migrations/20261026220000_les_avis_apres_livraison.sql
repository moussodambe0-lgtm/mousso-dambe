-- Les avis, et seulement après avoir reçu le colis.
--
-- Arthur, le 26 octobre 2026 : « sur la fiche produit, je veux qu'on puisse
-- mettre livraison 1000 francs et puis mettre aussi des avis. À la fin, si
-- quelqu'un a reçu son colis, qu'il puisse mettre des avis, avec peut-être des
-- images même du produit. »
--
-- UN AVIS SE MÉRITE. On ne peut en déposer un que sur un produit d'une commande
-- À SOI et LIVRÉE. Ce n'est pas une politesse, c'est ce qui donne sa valeur à
-- la note : une boutique dont n'importe qui peut noter les produits a des notes
-- qui ne veulent rien dire, dans les deux sens. Un avis par produit et par
-- commande, donc deux achats permettent deux avis, et vingt clics n'en
-- permettent aucun.
--
-- LES AVIS SONT ANONYMES, ET C'EST UNE DÉCISION, PAS UN OUBLI
--
-- Les boutiques affichent d'habitude « FLORIAN D., Karpala, achat vérifié ».
-- Ici, non, et il faut dire pourquoi sans détour : le catalogue est fait de
-- serviettes, de culottes menstruelles et de kits de premières règles. Un avis
-- signé d'un prénom et d'un quartier dirait publiquement que cette personne-là
-- a ses règles, quel flux elle a, et ce qu'elle utilise. Dans un quartier où
-- tout le monde se connaît, un prénom et un quartier suffisent à reconnaître
-- quelqu'un. Ce serait, en droit comme en fait, publier une donnée de santé.
--
-- Ne sont donc affichés que la note, le texte, la date, et « Achat vérifié »,
-- qui est vrai par construction : aucun avis ne peut exister sans une commande
-- livrée derrière. Rien ne relie publiquement un avis à une personne.
--
-- Si Arthur veut rendre la signature possible, il faudra qu'elle soit un choix
-- explicite, décoché par défaut, avec une phrase qui dit ce que ça révèle.

-- ---------------------------------------------------------------------------
-- 1. Les tables
-- ---------------------------------------------------------------------------
create table if not exists public.avis (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references public.produits(id) on delete cascade,
  profil_id uuid not null references public.profils(id) on delete cascade,
  commande_id uuid not null references public.commandes(id) on delete cascade,
  note int not null check (note between 1 and 5),
  -- Facultatif : une note seule est déjà un avis, et obliger à écrire ferait
  -- surtout produire des « bien » qui n'apprennent rien.
  texte text check (texte is null or length(texte) <= 1000),
  cree_le timestamptz not null default now(),
  -- Un avis par produit et par commande.
  unique (commande_id, produit_id)
);

create index if not exists avis_produit_idx on public.avis (produit_id, cree_le desc);
create index if not exists avis_profil_idx on public.avis (profil_id);

create table if not exists public.avis_photos (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid not null references public.avis(id) on delete cascade,
  -- Les octets dans la base, comme pour les vocaux : ce projet n'a pas de
  -- stockage de fichiers, et en ajouter un pour trois photos par avis serait
  -- un service de plus à surveiller.
  octets bytea not null,
  -- Liste fermée : un type inventé ne doit pas devenir un en-tête que le
  -- navigateur de quelqu'un d'autre ira exécuter.
  type_mime text not null check (type_mime in ('image/jpeg', 'image/png', 'image/webp')),
  ordre int not null default 0,
  cree_le timestamptz not null default now()
);

create index if not exists avis_photos_avis_idx on public.avis_photos (avis_id, ordre);

alter table public.avis enable row level security;
alter table public.avis_photos enable row level security;

-- Aucune règle d'accès ne laisse passer quoi que ce soit : tout se lit et
-- s'écrit par les fonctions ci-dessous, qui choisissent ce qui sort. C'est la
-- règle du projet pour toute table qui touche à une personne.

-- ---------------------------------------------------------------------------
-- 2. Déposer un avis
-- ---------------------------------------------------------------------------
create or replace function public.deposer_avis(
  p_numero text,
  p_slug text,
  p_note int,
  p_texte text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
  v_produit uuid;
  v_avis uuid;
  v_texte text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_note is null or p_note not between 1 and 5 then
    return jsonb_build_object('ok', false, 'erreur', 'note_invalide');
  end if;

  -- SA commande, et LIVRÉE. Les deux conditions sont dans la même requête :
  -- séparées, elles finissent toujours par diverger.
  select id into v_commande
    from public.commandes
   where numero = p_numero and profil_id = v_id and etat = 'livree';
  if v_commande is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_non_livree');
  end if;

  -- Et le produit doit être dans CETTE commande : on ne note pas un produit
  -- qu'on n'a pas reçu, même en ayant reçu autre chose.
  select p.id into v_produit
    from public.produits p
    join public.commande_lignes cl on cl.produit_id = p.id
   where p.slug = p_slug and cl.commande_id = v_commande
   limit 1;
  if v_produit is null then
    return jsonb_build_object('ok', false, 'erreur', 'produit_hors_commande');
  end if;

  v_texte := nullif(btrim(coalesce(p_texte, '')), '');
  if v_texte is not null then v_texte := left(v_texte, 1000); end if;

  insert into public.avis (produit_id, profil_id, commande_id, note, texte)
       values (v_produit, v_id, v_commande, p_note, v_texte)
  on conflict (commande_id, produit_id)
    -- Elle peut corriger son avis : une note donnée dans l'agacement du
    -- premier jour n'a pas à la suivre pour toujours.
    do update set note = excluded.note, texte = excluded.texte, cree_le = now()
  returning id into v_avis;

  return jsonb_build_object('ok', true, 'avis', v_avis);
end;
$$;
revoke all on function public.deposer_avis(text, text, int, text) from public, anon, authenticated;
grant execute on function public.deposer_avis(text, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Une photo sur son propre avis
-- ---------------------------------------------------------------------------
create or replace function public.ajouter_photo_avis(
  p_avis uuid,
  p_base64 text,
  p_type text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_octets bytea;
  v_combien int;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_type is null or p_type not in ('image/jpeg', 'image/png', 'image/webp') then
    return jsonb_build_object('ok', false, 'erreur', 'type_refuse');
  end if;
  if not exists (select 1 from public.avis where id = p_avis and profil_id = v_id) then
    return jsonb_build_object('ok', false, 'erreur', 'avis_inconnu');
  end if;

  select count(*) into v_combien from public.avis_photos where avis_id = p_avis;
  if v_combien >= 3 then
    return jsonb_build_object('ok', false, 'erreur', 'trop_de_photos');
  end if;

  begin
    v_octets := decode(coalesce(p_base64, ''), 'base64');
  exception when others then
    -- Le message de Postgres ne sort pas : il raconte la requête.
    return jsonb_build_object('ok', false, 'erreur', 'image_illisible');
  end;

  if v_octets is null or length(v_octets) < 100 then
    return jsonb_build_object('ok', false, 'erreur', 'image_illisible');
  end if;
  -- 400 Ko par photo : au-delà, c'est le forfait de celle qui REGARDE la fiche
  -- qu'on dépense, pas celui de celle qui a pris la photo.
  if length(v_octets) > 400000 then
    return jsonb_build_object('ok', false, 'erreur', 'image_trop_lourde');
  end if;

  insert into public.avis_photos (avis_id, octets, type_mime, ordre)
       values (p_avis, v_octets, p_type, v_combien);

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.ajouter_photo_avis(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ajouter_photo_avis(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les avis d'un produit, tels qu'ils s'affichent
-- ---------------------------------------------------------------------------
-- Ouverte à `anon` : la boutique se visite sans compte, et une fiche produit
-- sans ses avis n'est pas la même fiche. Rien de ce qui sort ne nomme personne.
create or replace function public.avis_du_produit(p_slug text, p_combien int default 10)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select id from public.produits where slug = p_slug and publie),
  tous as (select a.* from public.avis a join p on a.produit_id = p.id)
  select jsonb_build_object(
    'nombre', (select count(*) from tous),
    -- Arrondie au dixième, comme « 3,0 » : deux décimales donneraient une
    -- fausse précision sur quatre avis.
    'moyenne', (select round(avg(note)::numeric, 1) from tous),
    'repartition', (
      select coalesce(jsonb_object_agg(note::text, n), '{}'::jsonb)
        from (select note, count(*)::int n from tous group by note) r
    ),
    'liste', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'note', t.note, 'texte', t.texte, 'cree_le', t.cree_le,
               'photos', (
                 select coalesce(jsonb_agg(ph.id order by ph.ordre), '[]'::jsonb)
                   from public.avis_photos ph where ph.avis_id = t.id
               )
             ) order by t.cree_le desc), '[]'::jsonb)
        from (select * from tous order by cree_le desc limit greatest(1, least(coalesce(p_combien, 10), 50))) t
    )
  )
$$;
revoke all on function public.avis_du_produit(text, int) from public, anon, authenticated;
grant execute on function public.avis_du_produit(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Ce qu'elle peut encore noter
-- ---------------------------------------------------------------------------
-- Pour la pastille « À évaluer » de son compte : les produits reçus sur
-- lesquels elle n'a pas encore donné son avis.
create or replace function public.mes_avis_a_donner()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', c.numero, 'slug', p.slug, 'nom', cl.nom,
           'image', p.image, 'livree_le', c.livree_le
         ) order by c.livree_le desc nulls last), '[]'::jsonb)
    from public.commandes c
    join public.commande_lignes cl on cl.commande_id = c.id
    join public.produits p on p.id = cl.produit_id
   where c.profil_id = auth.uid()
     and c.etat = 'livree'
     and not exists (
       select 1 from public.avis a
        where a.commande_id = c.id and a.produit_id = p.id
     )
$$;
revoke all on function public.mes_avis_a_donner() from public, anon, authenticated;
grant execute on function public.mes_avis_a_donner() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Une photo d'avis, servie par son identifiant
-- ---------------------------------------------------------------------------
-- Les photos sont publiques, comme l'avis qu'elles accompagnent, et c'est
-- pourquoi l'écran de dépôt doit prévenir : une photo prise chez soi montre
-- aussi chez soi.
create or replace function public.photo_avis(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'type', ph.type_mime,
           'base64', encode(ph.octets, 'base64')
         )
    from public.avis_photos ph
   where ph.id = p_id
$$;
revoke all on function public.photo_avis(uuid) from public, anon, authenticated;
grant execute on function public.photo_avis(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Le prix de la livraison, dit sur la fiche
-- ---------------------------------------------------------------------------
-- Arthur : « si on clique sur un produit, je veux qu'on puisse mettre
-- livraison 1000 francs ». Le montant existe déjà dans `src/lib/livraison.ts`,
-- qui calcule ce que paie une commande. On ne le recopie donc pas ici : la
-- fiche lira la même source que le panier. Deux endroits qui annoncent deux
-- prix de livraison, c'est une promesse non tenue au moment de payer.

