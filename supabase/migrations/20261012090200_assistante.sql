-- Mousso Dambé, l'assistante « Dambé ».
--
-- Ce que l'assistante sait d'elle : son prénom, son jour de cycle, sa phase, et
-- le catalogue. Rien d'autre. Ni son numéro, ni son quartier, ni ses
-- commandes : un service d'IA extérieur n'a pas besoin de savoir où elle
-- habite pour conseiller une bouillotte.
--
-- Ce que l'assistante ne fait jamais : poser un diagnostic, nommer une
-- maladie, conseiller un médicament. Les consignes sont dans le code
-- (src/lib/assistante.ts) ; la base, elle, borne les longueurs, compte les
-- questions et garde chaque fil au nom de sa seule propriétaire.

create table public.assistante_messages (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils(id) on delete cascade,
  question text not null check (length(question) between 2 and 500),
  reponse text check (length(reponse) <= 4000),
  produit_slug text,
  jetons_entree int not null default 0,
  jetons_sortie int not null default 0,
  cree_le timestamptz not null default now(),
  repondu_le timestamptz
);
alter table public.assistante_messages enable row level security;
create index assistante_par_profil on public.assistante_messages (profil_id, cree_le desc);

create policy "chacune lit son fil" on public.assistante_messages
  for select to authenticated using (profil_id = auth.uid());

revoke all on table public.assistante_messages from public, anon, authenticated;
grant select on table public.assistante_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Poser une question
-- ---------------------------------------------------------------------------
create or replace function public.assistante_poser(p_question text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_message uuid;
  v_aujourdhui int;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  -- Sans cet en-tête, un appel direct à l'API pourrait épuiser la formule
  -- Ollama d'Arthur en une nuit, sans jamais passer par une page du site.
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if public.reglage('assistante_active') <> 'oui' then
    return jsonb_build_object('ok', false, 'erreur', 'assistante_eteinte');
  end if;
  if length(coalesce(trim(p_question), '')) < 2 then
    return jsonb_build_object('ok', false, 'erreur', 'question_vide');
  end if;
  if not public.quota_ok('assistante_minute', public.reglage_entier('assistante_quota_minute', 6), interval '1 minute') then
    return jsonb_build_object('ok', false, 'erreur', 'trop_vite');
  end if;

  select count(*) into v_aujourdhui from public.assistante_messages
   where profil_id = v_id and cree_le > now() - interval '1 day';
  if v_aujourdhui >= public.reglage_entier('assistante_quota_jour', 40) then
    return jsonb_build_object('ok', false, 'erreur', 'quota_jour');
  end if;

  insert into public.assistante_messages (profil_id, question)
  values (v_id, left(trim(p_question), 500))
  returning id into v_message;

  return jsonb_build_object('ok', true, 'id', v_message);
end;
$$;

-- Le serveur du site enregistre la réponse. La fonction est liée à auth.uid()
-- et au message : même avec un identifiant volé, personne n'écrit dans le fil
-- d'une autre.
create or replace function public.assistante_repondre(
  p_id uuid, p_reponse text, p_produit text, p_entree int, p_sortie int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_slug text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Le produit proposé est relu dans le catalogue : si le modèle invente un
  -- produit, rien ne s'affiche, et aucun prix faux n'arrive à l'écran.
  select slug into v_slug from public.produits where slug = p_produit and publie;

  update public.assistante_messages
     set reponse = left(coalesce(p_reponse, ''), 4000),
         produit_slug = v_slug,
         jetons_entree = greatest(coalesce(p_entree, 0), 0),
         jetons_sortie = greatest(coalesce(p_sortie, 0), 0),
         repondu_le = now()
   where id = p_id and profil_id = v_id and reponse is null;

  if not found then
    return jsonb_build_object('ok', false, 'erreur', 'message_inconnu');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Le contexte envoyé au modèle, préparé par la base
-- ---------------------------------------------------------------------------
-- Le site ne décide pas de ce qui part : la base le fait. Ainsi une page mal
-- écrite ne peut pas, par erreur, envoyer un numéro de téléphone à Ollama.
create or replace function public.assistante_contexte()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_cycle jsonb;
begin
  if v_id is null then
    return jsonb_build_object('connue', false);
  end if;
  v_cycle := public.mon_cycle();
  return jsonb_build_object(
    'prenom', v_cycle ->> 'prenom',
    'jour_du_cycle', v_cycle -> 'jour_du_cycle',
    'phase', v_cycle ->> 'phase',
    'cycle_moyen', v_cycle -> 'cycle_moyen',
    'duree_regles', v_cycle -> 'duree_regles',
    'jours_restants', v_cycle -> 'jours_restants',
    'catalogue', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'slug', slug, 'nom', nom, 'prix', prix_cfa,
               'resume', resume, 'rayon', rayon, 'reutilisable', reutilisable)
             order by ordre), '[]'::jsonb)
        from public.produits where publie and stock > 0
    ),
    -- Les trois derniers échanges, pour qu'elle n'ait pas à se répéter. Pas
    -- plus : tout ce qui part vers un service extérieur doit se justifier.
    'echanges', (
      select coalesce(jsonb_agg(jsonb_build_object('question', question, 'reponse', reponse)
             order by cree_le), '[]'::jsonb)
        from (
          select question, reponse, cree_le from public.assistante_messages
           where profil_id = v_id and reponse is not null
           order by cree_le desc limit 3
        ) d
    )
  );
end;
$$;

create or replace function public.mon_fil_assistante()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'question', question, 'reponse', reponse,
           'produit', produit_slug, 'cree_le', cree_le)
         order by cree_le), '[]'::jsonb)
    from (
      select id, question, reponse, produit_slug, cree_le
        from public.assistante_messages
       where profil_id = auth.uid()
       order by cree_le desc limit 20
    ) d
$$;

create or replace function public.effacer_mon_fil()
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
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.assistante_poser(text) from public, anon, authenticated;
revoke all on function public.assistante_repondre(uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function public.assistante_contexte() from public, anon, authenticated;
revoke all on function public.mon_fil_assistante() from public, anon, authenticated;
revoke all on function public.effacer_mon_fil() from public, anon, authenticated;

grant execute on function public.assistante_poser(text) to authenticated;
grant execute on function public.assistante_repondre(uuid, text, text, int, int) to authenticated;
grant execute on function public.assistante_contexte() to authenticated;
grant execute on function public.mon_fil_assistante() to authenticated;
grant execute on function public.effacer_mon_fil() to authenticated;

-- « Effacer mes données » doit aussi effacer le fil de l'assistante : une
-- promesse d'effacement qui laisse les questions en base est un mensonge.
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
  update public.profils
     set cycle_moyen = 28, duree_regles = 5, questionnaire_fini = false
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;
-- « create or replace » remet les droits par défaut : il faut refermer.
revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
