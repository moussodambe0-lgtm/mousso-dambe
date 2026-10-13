-- Les favoris : un cœur sur la fiche d'un produit.
--
-- Demande d'Arthur du 13 octobre 2026 : un petit carré avec un cœur, sur la
-- fiche produit, pour mettre en favoris ; touché, il devient rouge.
--
-- Pourquoi dans la base et pas dans le téléphone : un favori qui disparaît
-- quand elle change de téléphone, ou quand elle vide le navigateur, ne vaut pas
-- mieux qu'un faux cœur. Et ici le compte est « anonyme mais récupérable » :
-- ce qu'elle garde la suit.
--
-- C'est une préférence d'achat, pas une donnée de santé. Elle est tout de
-- même privée (personne d'autre ne la lit) et elle part avec « Effacer mes
-- données ».

create table if not exists public.favoris (
  profil_id uuid not null references public.profils(id) on delete cascade,
  produit_slug text not null,
  cree_le timestamptz not null default now(),
  primary key (profil_id, produit_slug)
);

alter table public.favoris enable row level security;
revoke all on table public.favoris from public, anon, authenticated;
grant select on table public.favoris to authenticated;

-- Elle lit les siens, et seulement les siens. Aucune écriture directe : tout
-- passe par `basculer_favori`.
create policy favoris_lecture on public.favoris
  for select to authenticated
  using (profil_id = auth.uid());

/**
 * Mettre ou retirer un produit des favoris : un seul geste, qui bascule.
 *
 * Le produit doit exister ET être en vente : un slug inventé ne doit pas
 * remplir la table. Elle ne peut pas en garder plus de 200 (le catalogue n'en
 * a pas le dixième ; c'est une limite de sécurité, pas de confort).
 */
create or replace function public.basculer_favori(p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_existe boolean;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_slug is null or not exists (select 1 from public.produits where slug = p_slug and publie = true) then
    return jsonb_build_object('ok', false, 'erreur', 'produit_inconnu');
  end if;

  select exists (select 1 from public.favoris where profil_id = v_id and produit_slug = p_slug)
    into v_existe;

  if v_existe then
    delete from public.favoris where profil_id = v_id and produit_slug = p_slug;
    return jsonb_build_object('ok', true, 'favori', false);
  end if;

  if (select count(*) from public.favoris where profil_id = v_id) >= 200 then
    return jsonb_build_object('ok', false, 'erreur', 'trop_de_favoris');
  end if;

  insert into public.favoris (profil_id, produit_slug) values (v_id, p_slug);
  return jsonb_build_object('ok', true, 'favori', true);
end;
$$;

revoke all on function public.basculer_favori(text) from public, anon, authenticated;
grant execute on function public.basculer_favori(text) to authenticated;

-- ---------------------------------------------------------------------------
-- « Effacer mes données » efface aussi ses favoris
-- ---------------------------------------------------------------------------
create or replace function public.effacer_mes_donnees()
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
  delete from public.assistante_messages where profil_id = v_id;
  delete from public.journal where profil_id = v_id;
  delete from public.cycles where profil_id = v_id;
  delete from public.favoris where profil_id = v_id;
  -- La conversation avec le médecin, en entier (messages et voix).
  delete from public.fils where profil_id = v_id and sujet = 'medecin';
  -- Les VOIX de la conversation avec la boutique, dans les deux sens. Les
  -- messages écrits, eux, restent, comme les commandes.
  delete from public.messages m
   using public.fils f
   where m.fil_id = f.id and f.profil_id = v_id and m.vocal_secondes is not null;
  update public.profils
     set cycle_moyen = 28, duree_regles = 5, questionnaire_fini = false
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
