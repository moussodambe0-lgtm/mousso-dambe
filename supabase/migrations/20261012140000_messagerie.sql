-- La messagerie avec la boutique, et l'espace de l'administratrice.
--
-- Demandes d'Arthur du 12 octobre 2026, sections 7, 8 et 9 de son cahier :
-- un onglet « Discussions » où IA Dambé est épinglée au-dessus de la
-- conversation avec la boutique, un bouton « Écrire au vendeur » sur une
-- fiche produit, et une boîte de réception pour lui.
--
-- Trois décisions de conception qui méritent d'être dites :
--
--   1. UN SEUL FIL par utilisatrice avec la boutique. Il n'y a qu'un vendeur,
--      nous. Ouvrir un fil par produit donnerait dix conversations avec la
--      même personne, et Arthur répondrait dix fois à la même cliente sans le
--      savoir. Le produit s'attache au MESSAGE, pas au fil.
--
--   2. L'administratrice est une LIGNE DANS UNE TABLE, pas un mot de passe
--      dans le code. Arthur s'ajoute lui-même depuis l'éditeur SQL de
--      Supabase (la ligne est donnée plus bas). Aucun secret ne traîne dans
--      l'application, et retirer un accès est un « delete ».
--
--   3. L'administratrice voit les fils, les messages, les commandes et les
--      coordonnées de livraison. Elle ne voit RIEN du cycle : ni « cycles »,
--      ni « journal », ni les questions posées à l'assistante. C'est écrit
--      dans les règles d'accès plus bas, et c'est la promesse de
--      l'application. Si un jour une fonction d'administration lit
--      « journal », c'est un bug grave, pas une amélioration.

-- ---------------------------------------------------------------------------
-- Qui est administratrice
-- ---------------------------------------------------------------------------
create table if not exists public.administrateurs (
  profil_id uuid primary key references public.profils(id) on delete cascade,
  ajoute_le timestamptz not null default now()
);

alter table public.administrateurs enable row level security;
revoke all on table public.administrateurs from public, anon, authenticated;

comment on table public.administrateurs is
  'Qui a acces a la boite de reception et aux commandes. Se remplit a la main
   dans l''editeur SQL de Supabase. Aucune application ne peut ecrire ici.';

/**
 * Est-ce que celle qui appelle est administratrice ?
 *
 * `stable` et non `immutable` : le résultat dépend de la session. Lue en
 * SECURITY DEFINER parce que la table est fermée à tout le monde, y compris
 * à l'administratrice elle-même : elle n'a pas besoin de lire la liste pour
 * en faire partie.
 */
create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administrateurs where profil_id = auth.uid())
$$;

revoke all on function public.est_admin() from public, anon, authenticated;
grant execute on function public.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Les fils et les messages
-- ---------------------------------------------------------------------------
create table if not exists public.fils (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null unique references public.profils(id) on delete cascade,
  cree_le timestamptz not null default now(),
  dernier_le timestamptz not null default now(),
  -- Recopie du dernier message, pour afficher la liste sans lire tous les
  -- messages de tous les fils. 120 caractères suffisent à un aperçu.
  apercu text not null default '',
  apercu_de text not null default 'elle' check (apercu_de in ('elle', 'boutique')),
  non_lus_elle int not null default 0 check (non_lus_elle >= 0),
  non_lus_admin int not null default 0 check (non_lus_admin >= 0)
);

create index if not exists fils_dernier_idx on public.fils (dernier_le desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  fil_id uuid not null references public.fils(id) on delete cascade,
  de text not null check (de in ('elle', 'boutique')),
  texte text not null check (length(texte) between 1 and 2000),
  -- Le produit dont on parle, attaché au message d'ouverture. On garde le
  -- slug et non l'identifiant : si le produit est dépublié, la conversation
  -- reste lisible au lieu d'afficher un trou.
  produit_slug text,
  cree_le timestamptz not null default now(),
  lu_le timestamptz
);

create index if not exists messages_fil_idx on public.messages (fil_id, cree_le);

alter table public.fils enable row level security;
alter table public.messages enable row level security;

revoke all on table public.fils from public, anon, authenticated;
revoke all on table public.messages from public, anon, authenticated;
grant select on table public.fils to authenticated;
grant select on table public.messages to authenticated;

-- Elle lit son fil. L'administratrice lit tous les fils. Personne n'écrit
-- directement : toutes les écritures passent par les fonctions plus bas.
create policy fils_lecture on public.fils
  for select to authenticated
  using (profil_id = auth.uid() or public.est_admin());

create policy messages_lecture on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.fils f
      where f.id = messages.fil_id
        and (f.profil_id = auth.uid() or public.est_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Écrire à la boutique
-- ---------------------------------------------------------------------------
/**
 * Elle envoie un message à la boutique.
 *
 * Le fil s'ouvre au premier message, personne n'a à le créer avant. Le
 * produit n'est attaché que s'il existe et qu'il est publié : un slug inventé
 * ne doit pas faire apparaître une carte produit vide dans la conversation
 * d'Arthur.
 */
create or replace function public.ecrire_a_la_boutique(p_texte text, p_produit_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
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

  -- Vingt messages par heure : de quoi tenir une vraie conversation, pas de
  -- quoi noyer la boîte de réception.
  if not public.quota_ok('message', public.reglage_entier('quota_message_heure', 20), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'quota');
  end if;

  v_texte := btrim(regexp_replace(coalesce(p_texte, ''), '[[:space:]]+', ' ', 'g'));
  if length(v_texte) < 1 then
    return jsonb_build_object('ok', false, 'erreur', 'message_vide');
  end if;
  v_texte := left(v_texte, 2000);

  select slug into v_slug from public.produits
   where slug = p_produit_slug and publie = true;

  insert into public.fils (profil_id) values (v_id)
  on conflict (profil_id) do nothing;

  select id into v_fil from public.fils where profil_id = v_id;

  insert into public.messages (fil_id, de, texte, produit_slug)
  values (v_fil, 'elle', v_texte, v_slug);

  update public.fils
     set dernier_le = now(),
         apercu = left(v_texte, 120),
         apercu_de = 'elle',
         non_lus_admin = non_lus_admin + 1
   where id = v_fil;

  return jsonb_build_object('ok', true, 'fil', v_fil);
end;
$$;

revoke all on function public.ecrire_a_la_boutique(text, text) from public, anon, authenticated;
grant execute on function public.ecrire_a_la_boutique(text, text) to authenticated;

/**
 * La boutique répond. Administratrice seulement.
 */
create or replace function public.repondre_a(p_fil uuid, p_texte text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_texte text;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  v_texte := left(btrim(regexp_replace(coalesce(p_texte, ''), '[[:space:]]+', ' ', 'g')), 2000);
  if length(v_texte) < 1 then
    return jsonb_build_object('ok', false, 'erreur', 'message_vide');
  end if;
  if not exists (select 1 from public.fils where id = p_fil) then
    return jsonb_build_object('ok', false, 'erreur', 'fil_inconnu');
  end if;

  insert into public.messages (fil_id, de, texte) values (p_fil, 'boutique', v_texte);

  update public.fils
     set dernier_le = now(),
         apercu = left(v_texte, 120),
         apercu_de = 'boutique',
         non_lus_elle = non_lus_elle + 1
   where id = p_fil;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.repondre_a(uuid, text) from public, anon, authenticated;
grant execute on function public.repondre_a(uuid, text) to authenticated;

/**
 * Marquer comme lu.
 *
 * Chacune marque les messages de l'autre : elle efface son compteur en
 * ouvrant la conversation, l'administratrice efface le sien. Une utilisatrice
 * ne peut pas marquer lus les messages d'un fil qui n'est pas le sien, parce
 * que la condition porte sur « profil_id ».
 */
create or replace function public.marquer_lu(p_fil uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_admin boolean := public.est_admin();
  v_cible uuid;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  if v_admin then
    select id into v_cible from public.fils where id = p_fil;
  else
    select id into v_cible from public.fils where id = p_fil and profil_id = v_id;
  end if;

  if v_cible is null then
    return jsonb_build_object('ok', false, 'erreur', 'fil_inconnu');
  end if;

  if v_admin then
    update public.messages set lu_le = now()
     where fil_id = v_cible and de = 'elle' and lu_le is null;
    update public.fils set non_lus_admin = 0 where id = v_cible;
  else
    update public.messages set lu_le = now()
     where fil_id = v_cible and de = 'boutique' and lu_le is null;
    update public.fils set non_lus_elle = 0 where id = v_cible;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marquer_lu(uuid) from public, anon, authenticated;
grant execute on function public.marquer_lu(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La liste des discussions, côté utilisatrice
-- ---------------------------------------------------------------------------
/**
 * Ce que montre l'onglet « Discussions ».
 *
 * Deux lignes : IA Dambé, toujours épinglée en haut, et la boutique. On
 * renvoie l'aperçu de la dernière question posée à l'assistante, jamais sa
 * réponse entière : la liste n'a pas besoin de déballer une conversation
 * intime sur un écran qu'on regarde par-dessus l'épaule.
 */
create or replace function public.mes_discussions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_ia jsonb;
  v_boutique jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  select jsonb_build_object(
           'apercu', left(coalesce(m.question, ''), 90),
           'quand', m.cree_le,
           'combien', (select count(*) from public.assistante_messages where profil_id = v_id)
         )
    into v_ia
    from public.assistante_messages m
   where m.profil_id = v_id
   order by m.cree_le desc
   limit 1;

  select jsonb_build_object(
           'fil', f.id,
           'apercu', f.apercu,
           'apercu_de', f.apercu_de,
           'quand', f.dernier_le,
           'non_lus', f.non_lus_elle
         )
    into v_boutique
    from public.fils f
   where f.profil_id = v_id;

  return jsonb_build_object('ok', true, 'ia', v_ia, 'boutique', v_boutique);
end;
$$;

revoke all on function public.mes_discussions() from public, anon, authenticated;
grant execute on function public.mes_discussions() to authenticated;

-- ---------------------------------------------------------------------------
-- La boîte de réception, côté administratrice
-- ---------------------------------------------------------------------------
/**
 * Les fils, les plus récents d'abord, avec de quoi reconnaître la personne.
 *
 * « p_recherche » cherche dans le prénom et dans le téléphone, comme demandé.
 * Le prénom et le téléphone sont les SEULES données de profil renvoyées : pas
 * de quartier (il est dans la commande, pas dans la conversation), et jamais
 * rien du cycle.
 */
create or replace function public.boite_de_reception(p_recherche text default null, p_depuis int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cherche text := nullif(btrim(coalesce(p_recherche, '')), '');
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
               'prenom', coalesce(nullif(p.prenom, ''), 'Sans prénom'),
               'telephone', coalesce(p.telephone, ''),
               'avatar_graine', p.avatar_graine,
               'apercu', f.apercu,
               'apercu_de', f.apercu_de,
               'quand', f.dernier_le,
               'non_lus', f.non_lus_admin
             ) as l,
             f.dernier_le as l_dernier
        from public.fils f
        join public.profils p on p.id = f.profil_id
       where v_cherche is null
          or p.prenom ilike '%' || v_cherche || '%'
          or coalesce(p.telephone, '') like '%' || v_cherche || '%'
       order by f.dernier_le desc
       limit 50 offset greatest(0, coalesce(p_depuis, 0))
    ) s;

  return jsonb_build_object(
    'ok', true,
    'fils', v_lignes,
    'non_lus', (select coalesce(sum(non_lus_admin), 0) from public.fils),
    'commandes_nouvelles', (select count(*) from public.commandes where etat = 'nouvelle')
  );
end;
$$;

revoke all on function public.boite_de_reception(text, int) from public, anon, authenticated;
grant execute on function public.boite_de_reception(text, int) to authenticated;

/**
 * Une conversation entière, côté administratrice, avec les cartes produits
 * des messages qui en portent une.
 */
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
           'prenom', coalesce(nullif(p.prenom, ''), 'Sans prénom'),
           'telephone', coalesce(p.telephone, ''),
           'avatar_graine', p.avatar_graine,
           'commandes', (select count(*) from public.commandes c where c.profil_id = p.id)
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

/**
 * Sa conversation à elle, avec les mêmes cartes produits.
 *
 * Deux fonctions plutôt qu'une avec un « if », parce que celle-ci ne prend
 * aucun identifiant de fil : elle ne peut donc pas être détournée pour lire
 * le fil d'une autre, même par une erreur de code côté site.
 */
create or replace function public.mon_fil()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_fil uuid;
  v_messages jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  select id into v_fil from public.fils where profil_id = v_id;
  if v_fil is null then
    return jsonb_build_object('ok', true, 'fil', null, 'messages', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', m.id,
             'de', m.de,
             'texte', m.texte,
             'quand', m.cree_le,
             'lu', m.lu_le is not null,
             'produit', case when pr.slug is null then null else jsonb_build_object(
               'slug', pr.slug, 'nom', pr.nom, 'prix_cfa', pr.prix_cfa, 'image', pr.image
             ) end
           ) order by m.cree_le
         ), '[]'::jsonb)
    into v_messages
    from public.messages m
    left join public.produits pr on pr.slug = m.produit_slug
   where m.fil_id = v_fil;

  return jsonb_build_object('ok', true, 'fil', v_fil, 'messages', v_messages);
end;
$$;

revoke all on function public.mon_fil() from public, anon, authenticated;
grant execute on function public.mon_fil() to authenticated;

-- ---------------------------------------------------------------------------
-- Les commandes, côté administratrice
-- ---------------------------------------------------------------------------
/**
 * La liste des commandes, filtrable par état.
 */
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

/**
 * Changer l'état d'une commande.
 *
 * Les états sont ceux de l'énumération, donc un état inventé est refusé avant
 * toute écriture. Une commande annulée rend son stock : sans ça, le stock
 * fond à chaque annulation et Arthur refuse des ventes qu'il pourrait servir.
 */
create or replace function public.changer_etat_commande(p_id uuid, p_etat text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_avant public.etat_commande;
  v_apres public.etat_commande;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if p_etat is null or p_etat not in ('nouvelle', 'preparee', 'envoyee', 'livree', 'annulee') then
    return jsonb_build_object('ok', false, 'erreur', 'etat_inconnu');
  end if;
  v_apres := p_etat::public.etat_commande;

  select etat into v_avant from public.commandes where id = p_id for update;
  if v_avant is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;
  if v_avant = v_apres then
    return jsonb_build_object('ok', true, 'etat', v_apres);
  end if;

  -- On rend le stock en annulant, on le reprend si on dé-annule.
  if v_apres = 'annulee' and v_avant <> 'annulee' then
    update public.produits p
       set stock = p.stock + cl.quantite
      from public.commande_lignes cl
     where cl.commande_id = p_id and cl.produit_id = p.id;
  elsif v_avant = 'annulee' and v_apres <> 'annulee' then
    update public.produits p
       set stock = greatest(0, p.stock - cl.quantite)
      from public.commande_lignes cl
     where cl.commande_id = p_id and cl.produit_id = p.id;
  end if;

  update public.commandes
     set etat = v_apres,
         livree_le = case when v_apres = 'livree' then now() else livree_le end
   where id = p_id;

  return jsonb_build_object('ok', true, 'etat', v_apres);
end;
$$;

revoke all on function public.changer_etat_commande(uuid, text) from public, anon, authenticated;
grant execute on function public.changer_etat_commande(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Le plafond de messages, réglable sans toucher au code
-- ---------------------------------------------------------------------------
insert into public.reglages (cle, valeur) values ('quota_message_heure', '20')
on conflict (cle) do nothing;

-- ---------------------------------------------------------------------------
-- Le numéro, demandé une seule fois dans la conversation
-- ---------------------------------------------------------------------------
/**
 * Enregistrer son numéro depuis la conversation avec la boutique.
 *
 * Section 8 du cahier : « si le numéro n'est pas encore connu, le demander
 * une seule fois (facultatif mais recommandé pour que la boutique puisse
 * rappeler) ». Le numéro est nettoyé de tout ce qui n'est pas un chiffre ou
 * un plus, et il ne REMPLACE jamais un numéro déjà là : une erreur de frappe
 * dans une conversation ne doit pas effacer celui qui sert aux livraisons.
 */
create or replace function public.changer_telephone(p_telephone text)
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

  v_propre := left(regexp_replace(coalesce(p_telephone, ''), '[^0-9+]', '', 'g'), 20);
  if length(v_propre) < 8 then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  update public.profils
     set telephone = v_propre
   where id = v_id and (telephone is null or telephone = '');

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.changer_telephone(text) from public, anon, authenticated;
grant execute on function public.changer_telephone(text) to authenticated;
