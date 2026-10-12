-- Mousso Dambé, la boutique : produits, panier, commandes.
--
-- Les prix sont des entiers en FCFA. Le franc CFA n'a pas de sous-unité :
-- jamais de numeric, jamais de float, un prix en virgule flottante finit
-- toujours par produire un total faux.
--
-- Le navigateur n'envoie JAMAIS un prix. Il envoie des identifiants et des
-- quantités ; la base relit les prix et recalcule tout. Sinon n'importe qui
-- commande à 0 FCFA, et aucune règle d'accès ne sait vérifier une addition.

create type public.rayon as enum ('serviettes', 'culottes', 'lavables', 'kits');
create type public.etat_commande as enum ('nouvelle', 'preparee', 'envoyee', 'livree', 'annulee');

-- ---------------------------------------------------------------------------
-- Les produits
-- ---------------------------------------------------------------------------
create table public.produits (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nom text not null,
  resume text not null default '',
  description text not null default '',
  rayon public.rayon not null,
  prix_cfa int not null check (prix_cfa > 0 and prix_cfa < 1000000),
  stock int not null default 0 check (stock >= 0),
  tailles text[] not null default '{}',
  image text,
  etiquette text,
  reutilisable boolean not null default false,
  publie boolean not null default true,
  ordre int not null default 100,
  cree_le timestamptz not null default now()
);
alter table public.produits enable row level security;
create index produits_par_rayon on public.produits (rayon, ordre) where publie;

-- Le catalogue est le seul contenu public : une fille doit pouvoir regarder
-- les prix avant de créer un compte, et un lien partagé doit s'ouvrir.
create policy "le catalogue est public" on public.produits
  for select to anon, authenticated using (publie);

revoke all on table public.produits from public, anon, authenticated;
grant select on table public.produits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les commandes
-- ---------------------------------------------------------------------------
create sequence public.numero_commande_seq;

create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  profil_id uuid not null references public.profils(id) on delete restrict,
  etat public.etat_commande not null default 'nouvelle',
  -- Recopie de l'adresse au moment de la commande : si elle déménage, la
  -- commande déjà partie ne doit pas changer d'adresse dans le dos du livreur.
  nom text not null,
  telephone text not null,
  quartier text not null,
  repere text not null default '',
  articles_cfa int not null check (articles_cfa >= 0),
  livraison_cfa int not null check (livraison_cfa >= 0),
  total_cfa int not null check (total_cfa >= 0),
  paiement text not null default 'livraison' check (paiement in ('livraison')),
  cree_le timestamptz not null default now(),
  livree_le timestamptz
);
alter table public.commandes enable row level security;
create index commandes_par_profil on public.commandes (profil_id, cree_le desc);

create policy "chacune lit ses commandes" on public.commandes
  for select to authenticated using (profil_id = auth.uid());

revoke all on table public.commandes from public, anon, authenticated;
grant select on table public.commandes to authenticated;

create table public.commande_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes(id) on delete cascade,
  produit_id uuid not null references public.produits(id) on delete restrict,
  -- Instantané : le nom et le prix du jour de la commande. Un produit renommé
  -- ou dont le prix change ne réécrit pas une commande passée.
  nom text not null,
  taille text,
  prix_cfa int not null check (prix_cfa > 0),
  quantite int not null check (quantite between 1 and 20),
  total_ligne_cfa int not null check (total_ligne_cfa > 0)
);
alter table public.commande_lignes enable row level security;
create index lignes_par_commande on public.commande_lignes (commande_id);

create policy "chacune lit les lignes de ses commandes" on public.commande_lignes
  for select to authenticated using (
    exists (select 1 from public.commandes c where c.id = commande_id and c.profil_id = auth.uid())
  );

revoke all on table public.commande_lignes from public, anon, authenticated;
grant select on table public.commande_lignes to authenticated;

-- ---------------------------------------------------------------------------
-- Passer commande
-- ---------------------------------------------------------------------------
-- p_panier : [{"slug": "...", "taille": "M", "quantite": 2}, …]
create or replace function public.passer_commande(
  p_panier jsonb, p_nom text, p_telephone text, p_quartier text, p_repere text
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
  if coalesce(trim(p_nom), '') = '' or coalesce(trim(p_quartier), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;
  -- Un numéro burkinabè a 8 chiffres et commence par 5, 6 ou 7. Le livreur
  -- appelle pour de vrai : un numéro inventé est une livraison perdue.
  if regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g') !~ '^[567][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  v_livraison := public.reglage_entier('livraison_cfa', 1000);
  v_numero := 'MD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.numero_commande_seq')::text, 5, '0');

  insert into public.commandes (numero, profil_id, nom, telephone, quartier, repere,
                                articles_cfa, livraison_cfa, total_cfa)
  values (v_numero, v_id, left(trim(p_nom), 60),
          regexp_replace(p_telephone, '[^0-9]', '', 'g'),
          left(trim(p_quartier), 60), left(coalesce(trim(p_repere), ''), 120),
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
    -- Une taille qui n'existe pas pour ce produit est refusée : un colis en
    -- XL alors qu'elle a demandé S, c'est un retour et une cliente perdue.
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

  update public.profils
     set telephone = regexp_replace(p_telephone, '[^0-9]', '', 'g'),
         quartier = left(trim(p_quartier), 60),
         repere = left(coalesce(trim(p_repere), ''), 120),
         prenom = case when prenom = '' then left(trim(p_nom), 40) else prenom end
   where id = v_id;

  return jsonb_build_object('ok', true, 'numero', v_numero, 'total', v_articles + v_livraison);
exception
  when others then
    return jsonb_build_object('ok', false, 'erreur', sqlerrm);
end;
$$;

create or replace function public.annuler_ma_commande(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande public.commandes;
  v_ligne public.commande_lignes;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  select * into v_commande from public.commandes
   where numero = p_numero and profil_id = v_id for update;
  if v_commande.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;
  -- Une fois le colis parti, ce n'est plus une annulation : elle refuse à la
  -- remise, et c'est au livreur de le rapporter.
  if v_commande.etat <> 'nouvelle' then
    return jsonb_build_object('ok', false, 'erreur', 'deja_preparee');
  end if;

  for v_ligne in select * from public.commande_lignes where commande_id = v_commande.id loop
    update public.produits set stock = stock + v_ligne.quantite where id = v_ligne.produit_id;
  end loop;

  update public.commandes set etat = 'annulee' where id = v_commande.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mes_commandes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(ligne order by cree_le desc), '[]'::jsonb) from (
    select c.cree_le,
           jsonb_build_object(
             'numero', c.numero, 'etat', c.etat, 'total', c.total_cfa,
             'cree_le', c.cree_le, 'quartier', c.quartier,
             'articles', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'nom', l.nom, 'taille', l.taille,
                        'quantite', l.quantite, 'total', l.total_ligne_cfa)), '[]'::jsonb)
                 from public.commande_lignes l where l.commande_id = c.id
             )
           ) as ligne
      from public.commandes c
     where c.profil_id = auth.uid()
     order by c.cree_le desc
     limit 20
  ) t
$$;

-- Commander exige un compte : on retire le droit donné par défaut à tout le
-- monde avant de le rendre aux seules connectées.
revoke all on function public.passer_commande(jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.annuler_ma_commande(text) from public, anon, authenticated;
revoke all on function public.mes_commandes() from public, anon, authenticated;

grant execute on function public.passer_commande(jsonb, text, text, text, text) to authenticated;
grant execute on function public.annuler_ma_commande(text) to authenticated;
grant execute on function public.mes_commandes() to authenticated;

-- ---------------------------------------------------------------------------
-- Le catalogue de départ
-- ---------------------------------------------------------------------------
-- Prix d'exemple, à valider par Arthur avant la mise en ligne.
insert into public.produits (slug, nom, resume, description, rayon, prix_cfa, stock, tailles, etiquette, reutilisable, ordre) values
  ('serviettes-nuit-10', 'Serviettes nuit, 10 pièces',
   'Longues, avec ailettes, pour dormir tranquille',
   'Dix serviettes de nuit à ailettes. Plus longues à l''arrière, elles tiennent quand tu bouges en dormant. Coton doux contre la peau, bande adhésive qui ne glisse pas.',
   'serviettes', 1500, 60, '{}', 'Le plus pris', false, 10),
  ('serviettes-jour-10', 'Serviettes jour, 10 pièces',
   'Fines, discrètes sous le pagne comme sous le jean',
   'Dix serviettes fines pour la journée, avec ailettes. Elles ne font pas d''épaisseur et ne s''entendent pas quand tu marches.',
   'serviettes', 1000, 80, '{}', null, false, 20),
  ('culotte-flux-abondant', 'Culotte menstruelle, flux abondant',
   'Douze heures sans serviette, lavable et réutilisable',
   'Trois couches : coton contre la peau, absorbant au milieu, imperméable dessous. Elle remplace les serviettes pendant douze heures. Tu la rinces à l''eau froide, tu la laves au savon, elle sèche en une nuit.',
   'culottes', 9000, 25, '{S,M,L,XL}', null, true, 30),
  ('lot-3-culottes', 'Lot de 3 culottes menstruelles',
   'De quoi couvrir des règles entières sans racheter',
   'Trois culottes menstruelles : une sur toi, une qui sèche, une d''avance. C''est le lot qui permet de passer des règles complètes sans acheter une seule serviette.',
   'culottes', 24000, 15, '{S,M,L,XL}', 'Économie', true, 40),
  ('serviettes-lavables-3', 'Serviettes lavables, 3 pièces',
   'Elles se lavent et durent deux ans',
   'Trois serviettes en tissu, avec pression sous la culotte. Elles se rincent, se lavent au savon et sèchent au soleil. Deux ans d''usage pour le prix de quatre paquets jetables.',
   'lavables', 6500, 30, '{}', null, true, 50),
  ('kit-premieres-regles', 'Kit premières règles',
   'Pour une première fois sans panique',
   'Une trousse discrète, cinq serviettes jour, une culotte menstruelle taille S, et une petite fiche qui explique simplement ce qui se passe dans le corps. À offrir à une fille qui commence.',
   'kits', 5000, 20, '{}', null, false, 60);
