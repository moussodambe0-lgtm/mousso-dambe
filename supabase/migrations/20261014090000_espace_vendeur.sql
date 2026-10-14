-- L'espace vendeur : devenir administratrice, et tenir le catalogue.
--
-- Arthur, le 14 octobre 2026 : « le compte admin doit avoir un espace admin où
-- il recevra les messages de service client ; il doit avoir aussi un espace
-- vendeur où il aura un dashboard, les messages de ceux qui écrivent à la
-- boutique, les commandes, un endroit pour ajouter ou retirer les produits ».
-- Il cite l'espace vendeur de Jia comme modèle.
--
-- Deux choses manquaient en base, et elles sont ici :
--   1. aucun moyen de devenir administratrice sans ouvrir l'éditeur SQL de
--      Supabase à la main (la table le disait elle-même dans son commentaire) ;
--   2. aucun moyen d'ajouter, de modifier ou de retirer un produit : le
--      catalogue n'était accessible qu'en lecture, même à elle.

-- ---------------------------------------------------------------------------
-- 1. Qui a le droit de devenir administratrice
-- ---------------------------------------------------------------------------
-- L'adresse autorisée n'est PAS écrite ici : ce fichier part dans le dépôt, et
-- l'adresse d'Arthur n'a rien à y faire. Elle vit dans la table des réglages,
-- posée par `outils/nommer-admin.mjs`, qui la lit dans le .env (lui-même hors
-- du dépôt). Tant qu'aucune adresse n'est posée, personne ne peut réclamer
-- quoi que ce soit : la fonction refuse plutôt que d'ouvrir à tout le monde.
create or replace function public.reclamer_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_email text;
  v_autorisee text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select valeur into v_autorisee from public.reglages where cle = 'email_admin';
  -- Pas d'adresse posée : la porte reste fermée. Un réglage vide ne doit
  -- jamais vouloir dire « tout le monde entre ».
  if coalesce(trim(v_autorisee), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select email into v_email from auth.users where id = v_id;
  -- Une adresse non vérifiée ne prouve rien : seul un compte dont l'adresse a
  -- été confirmée (Google le fait par construction) peut réclamer la place.
  if v_email is null
     or lower(trim(v_email)) <> lower(trim(v_autorisee))
     or not exists (select 1 from auth.users where id = v_id and email_confirmed_at is not null)
  then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  insert into public.administrateurs (profil_id)
  values (v_id)
  on conflict (profil_id) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reclamer_admin() from public, anon, authenticated;
grant execute on function public.reclamer_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le catalogue, tenu depuis l'espace vendeur
-- ---------------------------------------------------------------------------
-- Tout passe par ces fonctions, jamais par un accès direct à la table : la
-- politique de lecture publique ne montre que les produits publiés, et aucune
-- politique d'écriture n'existe. C'est `security definer` + `est_admin()` qui
-- décide, à un seul endroit.

/** La liste complète, publiés ET retirés, pour l'écran des produits. */
create or replace function public.produits_admin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lignes jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.ordre, p.nom), '[]'::jsonb)
    into v_lignes
    from public.produits p;

  return jsonb_build_object('ok', true, 'produits', v_lignes);
end;
$$;

/**
 * Ajouter un produit, ou en modifier un.
 *
 * Le slug sert de clé : donné vide, on en fabrique un à partir du nom. Un slug
 * déjà pris met à jour la fiche au lieu d'échouer, pour que l'écran puisse
 * servir aux deux gestes avec un seul bouton.
 */
create or replace function public.enregistrer_produit(
  p_slug text,
  p_nom text,
  p_rayon text,
  p_prix int,
  p_stock int,
  p_resume text default '',
  p_description text default '',
  p_image text default null,
  p_etiquette text default null,
  p_tailles text[] default '{}',
  p_publie boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if coalesce(trim(p_nom), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'nom_requis');
  end if;
  if p_prix is null or p_prix <= 0 or p_prix >= 1000000 then
    return jsonb_build_object('ok', false, 'erreur', 'prix_invalide');
  end if;
  if p_stock is null or p_stock < 0 then
    return jsonb_build_object('ok', false, 'erreur', 'stock_invalide');
  end if;
  -- Le rayon doit exister : le type `rayon` le garantirait en levant une
  -- exception, mais une erreur lisible vaut mieux qu'une panne de base.
  if not exists (select 1 from unnest(enum_range(null::public.rayon)) r where r::text = p_rayon) then
    return jsonb_build_object('ok', false, 'erreur', 'rayon_invalide');
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    -- Un nom devient une adresse : accents enlevés, espaces en tirets, et
    -- rien d'autre que des lettres, des chiffres et des tirets. `translate`
    -- plutôt que `unaccent` : l'extension n'est pas installée sur ce projet,
    -- et le banc local ne l'a pas non plus.
    v_slug := trim(both '-' from
      regexp_replace(
        lower(translate(trim(p_nom),
          'àâäáãåçéèêëíìîïñóòôöõúùûüýÿÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
          'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
        '[^a-z0-9]+', '-', 'g'
      )
    );
    v_slug := left(coalesce(nullif(v_slug, ''), 'produit'), 60);
    -- Un slug déjà pris par un AUTRE produit : on en fabrique un libre plutôt
    -- que d'écraser la fiche d'à côté.
    if exists (select 1 from public.produits where slug = v_slug) then
      v_slug := left(v_slug, 50) || '-' || substr(gen_random_uuid()::text, 1, 6);
    end if;
  end if;

  insert into public.produits (slug, nom, resume, description, rayon, prix_cfa, stock,
                               tailles, image, etiquette, publie)
  values (v_slug, left(trim(p_nom), 80), left(coalesce(p_resume, ''), 300),
          left(coalesce(p_description, ''), 2000), p_rayon::public.rayon, p_prix, p_stock,
          coalesce(p_tailles, '{}'), nullif(trim(coalesce(p_image, '')), ''),
          nullif(trim(coalesce(p_etiquette, '')), ''), coalesce(p_publie, true))
  on conflict (slug) do update
    set nom = excluded.nom,
        resume = excluded.resume,
        description = excluded.description,
        rayon = excluded.rayon,
        prix_cfa = excluded.prix_cfa,
        stock = excluded.stock,
        tailles = excluded.tailles,
        image = excluded.image,
        etiquette = excluded.etiquette,
        publie = excluded.publie;

  return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$$;

/**
 * Retirer un produit de la vente.
 *
 * On ne SUPPRIME pas la ligne : des commandes déjà passées la citent, et leur
 * historique doit rester lisible. On la dépublie, elle disparaît de la
 * boutique et reste dans l'espace vendeur, rallumable d'un geste.
 */
create or replace function public.retirer_produit(p_slug text, p_remettre boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not exists (select 1 from public.produits where slug = p_slug) then
    return jsonb_build_object('ok', false, 'erreur', 'produit_inconnu');
  end if;

  update public.produits set publie = coalesce(p_remettre, false) where slug = p_slug;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.produits_admin() from public, anon, authenticated;
grant execute on function public.produits_admin() to authenticated;
revoke all on function public.enregistrer_produit(text, text, text, int, int, text, text, text, text, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.enregistrer_produit(text, text, text, int, int, text, text, text, text, text[], boolean)
  to authenticated;
revoke all on function public.retirer_produit(text, boolean) from public, anon, authenticated;
grant execute on function public.retirer_produit(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Les chiffres du tableau de bord
-- ---------------------------------------------------------------------------
-- Un seul appel pour tout l'écran d'accueil du vendeur : une page qui fait dix
-- allers-retours est lente là où la connexion est chère.
create or replace function public.tableau_vendeur()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jour date := (now() at time zone 'UTC')::date;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  return jsonb_build_object(
    'ok', true,
    -- À traiter aujourd'hui
    'a_preparer', (select count(*) from public.commandes where etat = 'nouvelle'),
    'a_envoyer', (select count(*) from public.commandes where etat = 'preparee'),
    'en_route', (select count(*) from public.commandes where etat = 'envoyee'),
    -- Les chiffres
    'ventes_jour', (select coalesce(sum(total_cfa), 0) from public.commandes
                     where etat <> 'annulee' and (cree_le at time zone 'UTC')::date = v_jour),
    'ventes_mois', (select coalesce(sum(total_cfa), 0) from public.commandes
                     where etat <> 'annulee'
                       and date_trunc('month', cree_le at time zone 'UTC')
                           = date_trunc('month', now() at time zone 'UTC')),
    'commandes_mois', (select count(*) from public.commandes
                        where etat <> 'annulee'
                          and date_trunc('month', cree_le at time zone 'UTC')
                              = date_trunc('month', now() at time zone 'UTC')),
    -- Le stock qui va manquer
    'en_rupture', (select count(*) from public.produits where publie and stock = 0),
    'stock_bas', (select count(*) from public.produits where publie and stock > 0 and stock <= 3),
    'produits_publies', (select count(*) from public.produits where publie),
    -- Ce qui attend une réponse, côté boutique seulement : le médecin a son
    -- propre espace.
    'messages_boutique', (
      select count(*) from public.messages m
        join public.fils f on f.id = m.fil_id
       where f.sujet = 'boutique' and m.de = 'elle' and m.lu_le is null
    )
  );
end;
$$;

revoke all on function public.tableau_vendeur() from public, anon, authenticated;
grant execute on function public.tableau_vendeur() to authenticated;
