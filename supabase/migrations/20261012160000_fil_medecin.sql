-- Un deuxième fil : le médecin.
--
-- Demande d'Arthur du 12 octobre 2026 : la bannière de l'accueil doit montrer
-- qu'on peut contacter directement un médecin pour avoir un conseil. Il n'y a
-- qu'UN SEUL médecin, comme il n'y a qu'un seul vendeur.
--
-- Le mécanisme est celui de la boutique, avec un interlocuteur de plus. Trois
-- choses à savoir avant de lire la suite :
--
--   1. Un fil est maintenant identifié par (profil_id, sujet). Une femme a
--      donc au plus deux fils : un avec la boutique, un avec le médecin. Ils
--      ne se mélangent jamais, ni à l'écran ni dans la base.
--
--   2. L'administration voit les deux, et peut filtrer. Qui répond au médecin
--      est une décision d'Arthur, pas une affaire de code : c'est une ligne
--      dans `administrateurs`, comme pour la boutique.
--
--   3. Ce qu'elle écrit au médecin reste un message, pas un dossier médical :
--      il n'entre nulle part dans son cycle, il ne part jamais vers l'IA, et
--      il ne devient pas une donnée de santé consultable ailleurs.
--
-- Ce que ce fichier NE FAIT PAS, volontairement : il ne promet pas de délai
-- de réponse, et il n'écrit aucun nom de médecin. Tant qu'Arthur n'a pas son
-- médecin, l'écran dit ce qui est vrai et rien de plus.

-- ---------------------------------------------------------------------------
-- Le sujet d'un fil
-- ---------------------------------------------------------------------------
alter table public.fils
  add column if not exists sujet text not null default 'boutique'
    check (sujet in ('boutique', 'medecin'));

comment on column public.fils.sujet is
  'A qui elle ecrit : la boutique, ou le medecin. Un fil par sujet et par personne.';

-- L'unicité passe de « un fil par personne » à « un fil par personne et par
-- sujet ». On retire l'ancienne contrainte par son nom calculé, parce qu'elle
-- a été créée par `unique` en ligne et n'a pas de nom choisi.
do $$
declare
  v_nom text;
begin
  select c.conname into v_nom
    from pg_constraint c
   where c.conrelid = 'public.fils'::regclass
     and c.contype = 'u'
     and (select count(*) from unnest(c.conkey) k) = 1
     and (select attname from pg_attribute
           where attrelid = c.conrelid and attnum = c.conkey[1]) = 'profil_id';
  if v_nom is not null then
    execute format('alter table public.fils drop constraint %I', v_nom);
  end if;
end;
$$;

create unique index if not exists fils_un_par_sujet on public.fils (profil_id, sujet);

-- ---------------------------------------------------------------------------
-- Écrire, à l'un ou à l'autre
-- ---------------------------------------------------------------------------
/**
 * Elle écrit, à la boutique ou au médecin.
 *
 * Même porte, même plafond, même nettoyage. Seul le destinataire change, et
 * il est borné ici : un sujet inventé devient « boutique », jamais une
 * troisième file qui n'existerait nulle part à l'écran.
 */
create or replace function public.ecrire_a(p_sujet text, p_texte text, p_produit_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_sujet text;
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

  if not public.quota_ok('message', public.reglage_entier('quota_message_heure', 20), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'quota');
  end if;

  v_sujet := case when p_sujet = 'medecin' then 'medecin' else 'boutique' end;

  v_texte := btrim(regexp_replace(coalesce(p_texte, ''), '[[:space:]]+', ' ', 'g'));
  if length(v_texte) < 1 then
    return jsonb_build_object('ok', false, 'erreur', 'message_vide');
  end if;
  v_texte := left(v_texte, 2000);

  -- Un produit ne s'attache qu'à un message pour la boutique : une carte
  -- produit dans une conversation médicale n'aurait aucun sens.
  if v_sujet = 'boutique' then
    select slug into v_slug from public.produits
     where slug = p_produit_slug and publie = true;
  end if;

  insert into public.fils (profil_id, sujet) values (v_id, v_sujet)
  on conflict (profil_id, sujet) do nothing;

  select id into v_fil from public.fils where profil_id = v_id and sujet = v_sujet;

  insert into public.messages (fil_id, de, texte, produit_slug)
  values (v_fil, 'elle', v_texte, v_slug);

  update public.fils
     set dernier_le = now(),
         apercu = left(v_texte, 120),
         apercu_de = 'elle',
         non_lus_admin = non_lus_admin + 1
   where id = v_fil;

  return jsonb_build_object('ok', true, 'fil', v_fil, 'sujet', v_sujet);
end;
$$;

revoke all on function public.ecrire_a(text, text, text) from public, anon, authenticated;
grant execute on function public.ecrire_a(text, text, text) to authenticated;

-- L'ancienne fonction continue de marcher, et écrit à la boutique.
create or replace function public.ecrire_a_la_boutique(p_texte text, p_produit_slug text default null)
returns jsonb language sql security definer set search_path = public as $$
  select public.ecrire_a('boutique', p_texte, p_produit_slug)
$$;

revoke all on function public.ecrire_a_la_boutique(text, text) from public, anon, authenticated;
grant execute on function public.ecrire_a_la_boutique(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lire son fil, à l'un ou à l'autre
-- ---------------------------------------------------------------------------
create or replace function public.mon_fil_de(p_sujet text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_sujet text := case when p_sujet = 'medecin' then 'medecin' else 'boutique' end;
  v_fil uuid;
  v_messages jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  select id into v_fil from public.fils where profil_id = v_id and sujet = v_sujet;
  if v_fil is null then
    return jsonb_build_object('ok', true, 'fil', null, 'sujet', v_sujet, 'messages', '[]'::jsonb);
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

  return jsonb_build_object('ok', true, 'fil', v_fil, 'sujet', v_sujet, 'messages', v_messages);
end;
$$;

revoke all on function public.mon_fil_de(text) from public, anon, authenticated;
grant execute on function public.mon_fil_de(text) to authenticated;

create or replace function public.mon_fil()
returns jsonb language sql security definer set search_path = public as $$
  select public.mon_fil_de('boutique')
$$;

revoke all on function public.mon_fil() from public, anon, authenticated;
grant execute on function public.mon_fil() to authenticated;

-- ---------------------------------------------------------------------------
-- La liste des discussions : trois lignes maintenant
-- ---------------------------------------------------------------------------
create or replace function public.mes_discussions()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_ia jsonb;
  v_boutique jsonb;
  v_medecin jsonb;
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
           'fil', f.id, 'apercu', f.apercu, 'apercu_de', f.apercu_de,
           'quand', f.dernier_le, 'non_lus', f.non_lus_elle
         )
    into v_boutique
    from public.fils f
   where f.profil_id = v_id and f.sujet = 'boutique';

  select jsonb_build_object(
           'fil', f.id, 'apercu', f.apercu, 'apercu_de', f.apercu_de,
           'quand', f.dernier_le, 'non_lus', f.non_lus_elle
         )
    into v_medecin
    from public.fils f
   where f.profil_id = v_id and f.sujet = 'medecin';

  return jsonb_build_object(
    'ok', true,
    'ia', v_ia,
    'boutique', v_boutique,
    'medecin', v_medecin,
    'non_lus', coalesce((select sum(non_lus_elle) from public.fils where profil_id = v_id), 0)
  );
end;
$$;

revoke all on function public.mes_discussions() from public, anon, authenticated;
grant execute on function public.mes_discussions() to authenticated;

-- ---------------------------------------------------------------------------
-- La boîte de réception : le sujet s'affiche et se filtre
-- ---------------------------------------------------------------------------
-- L'ancienne signature à deux arguments doit PARTIR, elle ne peut pas
-- cohabiter : avec deux fonctions du même nom dont tous les arguments ont une
-- valeur par défaut, un appel sans argument devient ambigu et Postgres refuse
-- (« Could not choose a best candidate function »). PostgREST aurait echoué
-- de la même façon en production.
drop function if exists public.boite_de_reception(text, int);

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
               'avatar_graine', p.avatar_graine,
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

-- ---------------------------------------------------------------------------
-- Une conversation entière : on dit à qui elle parle
-- ---------------------------------------------------------------------------
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
           'avatar_graine', p.avatar_graine,
           -- Le nombre de commandes aide à répondre à la boutique. Il n'a rien
           -- à faire dans une conversation médicale, et n'y est pas renvoyé.
           'commandes', case when f.sujet = 'boutique'
             then (select count(*) from public.commandes c where c.profil_id = p.id)
             else null end
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
