-- Mousso Dambé, fondations : réglages, quotas, comptes, cycle, journal.
--
-- Règles qui tiennent tout le fichier :
--   1. RLS active sur 100 % des tables. La clé anon est publique par
--      conception : la RLS est la sécurité, il n'y en a pas d'autre.
--   2. Aucune écriture directe depuis le navigateur. Toute mutation passe par
--      une fonction SECURITY DEFINER qui relit et recalcule.
--   3. Les données de cycle sont les données les plus intimes de
--      l'application. Chaque personne ne voit QUE ses lignes, et il n'exist
--      aucun rôle qui lit celles des autres : pas d'administratrice qui
--      consulte un journal, pas d'export. Ce n'est pas un oubli, c'est la
--      promesse faite à l'écran.

-- Aucune extension n'est nécessaire : gen_random_uuid() et sha256() sont dans
-- Postgres depuis les versions 13 et 11. Exiger pgcrypto ferait échouer le
-- banc d'essai local sans rien apporter.

-- ---------------------------------------------------------------------------
-- Réglages de l'application, modifiables sans migration
-- ---------------------------------------------------------------------------
create table public.reglages (
  cle text primary key,
  valeur text not null
);
alter table public.reglages enable row level security;

insert into public.reglages (cle, valeur) values
  ('livraison_cfa', '1000'),
  ('assistante_active', 'oui'),
  ('assistante_quota_jour', '40'),
  ('assistante_quota_minute', '6'),
  ('quota_commande_heure', '5'),
  ('cle_serveur_sha256', '');

create or replace function public.reglage(p_cle text)
returns text language sql stable security definer set search_path = public as $$
  select valeur from public.reglages where cle = p_cle
$$;

create or replace function public.reglage_entier(p_cle text, p_defaut int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(nullif(public.reglage(p_cle), '')::int, p_defaut)
$$;

-- Personne ne lit la table en direct : l'empreinte de la clé serveur y vit.
revoke all on table public.reglages from public, anon, authenticated;
revoke all on function public.reglage(text) from public, anon, authenticated;
revoke all on function public.reglage_entier(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- La clé du serveur : ce qui prouve qu'un appel vient bien du site
-- ---------------------------------------------------------------------------
-- Un appel direct à l'API avec la clé anon ne crée rien : la base exige
-- l'en-tête x-md-cle, posé par le serveur du site, dont seule l'empreinte est
-- stockée. Tant que l'empreinte n'est pas renseignée (installation, premier
-- essai en local), on accepte : sinon rien ne fonctionnerait avant le réglage.
create or replace function public.appel_du_site()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  attendu text := public.reglage('cle_serveur_sha256');
  donnee text;
begin
  if attendu is null or attendu = '' then
    return true;
  end if;
  donnee := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-md-cle';
  if donnee is null then
    return false;
  end if;
  return encode(sha256(convert_to(donnee, 'UTF8')), 'hex') = attendu;
end;
$$;
revoke all on function public.appel_du_site() from public, anon, authenticated;

create or replace function public.ip_appelante()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-md-ip', 'inconnue')
$$;
revoke all on function public.ip_appelante() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quotas : un robot ne doit pas pouvoir épuiser l'assistante ni inonder les
-- commandes. Comptage par IP et par heure, dans une table qui se vide.
-- ---------------------------------------------------------------------------
create table public.quotas (
  cle text not null,
  action text not null,
  fenetre timestamptz not null,
  compteur int not null default 0,
  primary key (cle, action, fenetre)
);
alter table public.quotas enable row level security;
revoke all on table public.quotas from public, anon, authenticated;

create or replace function public.quota_ok(p_action text, p_plafond int, p_duree interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_fenetre timestamptz := date_trunc('minute', now()) - (extract(epoch from date_trunc('minute', now()))::bigint % greatest(1, extract(epoch from p_duree)::bigint)) * interval '1 second';
  v_compteur int;
begin
  insert into public.quotas (cle, action, fenetre, compteur)
  values (public.ip_appelante(), p_action, v_fenetre, 1)
  on conflict (cle, action, fenetre) do update set compteur = public.quotas.compteur + 1
  returning compteur into v_compteur;
  return v_compteur <= p_plafond;
end;
$$;
revoke all on function public.quota_ok(text, int, interval) from public, anon, authenticated;

create or replace function public.menage_quotas()
returns void language sql security definer set search_path = public as $$
  delete from public.quotas where fenetre < now() - interval '2 days'
$$;
revoke all on function public.menage_quotas() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les profils
-- ---------------------------------------------------------------------------
create table public.profils (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null default '',
  telephone text,
  quartier text,
  repere text,
  -- Réglages du cycle. 28 jours et 5 jours sont les valeurs les plus
  -- fréquentes : ce sont des défauts, pas une vérité, et le questionnaire les
  -- remplace dès la première minute.
  cycle_moyen int not null default 28 check (cycle_moyen between 20 and 45),
  duree_regles int not null default 5 check (duree_regles between 1 and 10),
  -- Ce que l'application a le droit de faire voir. Par défaut, le moins
  -- possible : les notifications sans détail sont allumées d'emblée, parce
  -- qu'un téléphone se partage et qu'un écran se lit par-dessus l'épaule.
  rappel_regles boolean not null default true,
  notifications_discretes boolean not null default true,
  code_ouverture boolean not null default false,
  questionnaire_fini boolean not null default false,
  cree_le timestamptz not null default now()
);
alter table public.profils enable row level security;

create policy "chacune lit son profil" on public.profils
  for select to authenticated using (id = auth.uid());

revoke all on table public.profils from public, anon, authenticated;
grant select on table public.profils to authenticated;

-- Le profil naît avec le compte : sans cela, une page du site devrait écrire
-- dans la table, donc le navigateur aussi.
create or replace function public.profil_a_la_creation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id, prenom)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'prenom', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.profil_a_la_creation() from public, anon, authenticated;

create trigger profils_a_la_creation
  after insert on auth.users
  for each row execute function public.profil_a_la_creation();

-- ---------------------------------------------------------------------------
-- Les cycles : une ligne par épisode de règles déclaré
-- ---------------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils(id) on delete cascade,
  debut date not null,
  fin date,
  cree_le timestamptz not null default now(),
  unique (profil_id, debut),
  check (fin is null or fin >= debut)
);
alter table public.cycles enable row level security;
create index cycles_par_profil on public.cycles (profil_id, debut desc);

create policy "chacune lit ses cycles" on public.cycles
  for select to authenticated using (profil_id = auth.uid());

revoke all on table public.cycles from public, anon, authenticated;
grant select on table public.cycles to authenticated;

-- ---------------------------------------------------------------------------
-- Le journal : une ligne par jour noté
-- ---------------------------------------------------------------------------
create type public.flux as enum ('rien', 'leger', 'moyen', 'abondant');

create table public.journal (
  profil_id uuid not null references public.profils(id) on delete cascade,
  jour date not null,
  flux public.flux not null default 'rien',
  douleur int not null default 0 check (douleur between 0 and 3),
  signes text[] not null default '{}',
  note text not null default '' check (length(note) <= 500),
  maj_le timestamptz not null default now(),
  primary key (profil_id, jour),
  -- Un journal ne se note pas dans le futur : une date d'avenir viendrait
  -- d'une erreur d'horloge ou d'un robot, et fausserait les prévisions.
  check (jour <= current_date + 1)
);
alter table public.journal enable row level security;

create policy "chacune lit son journal" on public.journal
  for select to authenticated using (profil_id = auth.uid());

revoke all on table public.journal from public, anon, authenticated;
grant select on table public.journal to authenticated;

-- ---------------------------------------------------------------------------
-- Le calcul du cycle
-- ---------------------------------------------------------------------------
-- L'ovulation tombe environ 14 jours AVANT les règles suivantes, pas 14 jours
-- après les précédentes : c'est la deuxième moitié du cycle qui est stable.
-- Un cycle de 32 jours ovule donc au jour 18, pas au jour 14.
create or replace function public.jour_ovulation(p_cycle int)
returns int language sql immutable as $$
  select greatest(1, p_cycle - 14)
$$;

create or replace function public.phase_du_cycle(p_jour int, p_duree_regles int, p_cycle int)
returns text language sql immutable as $$
  select case
    when p_jour <= p_duree_regles then 'regles'
    when p_jour between public.jour_ovulation(p_cycle) - 5 and public.jour_ovulation(p_cycle) + 1 then 'fertile'
    when p_jour < public.jour_ovulation(p_cycle) - 5 then 'elan'
    else 'lune'
  end
$$;

-- Tout ce dont l'écran d'accueil a besoin, en un seul appel : sur 3G, dix
-- allers-retours coûtent plus cher que le calcul lui-même.
create or replace function public.mon_cycle()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profil public.profils;
  v_dernier date;
  v_cycle int;
  v_duree int;
  v_jour int;
  v_observe int;
  v_nb int;
begin
  select * into v_profil from public.profils where id = auth.uid();
  if v_profil.id is null then
    return jsonb_build_object('connue', false);
  end if;

  select debut into v_dernier from public.cycles
   where profil_id = v_profil.id and debut <= current_date
   order by debut desc limit 1;

  -- La moyenne observée sur les 6 derniers cycles l'emporte sur la valeur
  -- déclarée au questionnaire : le corps a raison contre le souvenir.
  select round(avg(ecart))::int, count(*) into v_observe, v_nb from (
    select (debut - lag(debut) over (order by debut)) as ecart
      from (select debut from public.cycles where profil_id = v_profil.id order by debut desc limit 7) d
  ) e where ecart between 20 and 45;

  v_cycle := coalesce(nullif(v_observe, 0), v_profil.cycle_moyen);
  v_duree := v_profil.duree_regles;

  if v_dernier is null then
    return jsonb_build_object(
      'connue', true, 'a_des_donnees', false,
      'cycle_moyen', v_cycle, 'duree_regles', v_duree,
      'prenom', v_profil.prenom, 'cycles_mesures', coalesce(v_nb, 0)
    );
  end if;

  v_jour := (current_date - v_dernier) + 1;
  -- Au-delà d'un cycle entier sans déclaration, on ne prétend plus savoir où
  -- elle en est : annoncer « jour 41 » serait faux et inquiétant pour rien.
  return jsonb_build_object(
    'connue', true,
    'a_des_donnees', true,
    'prenom', v_profil.prenom,
    'debut_dernieres_regles', v_dernier,
    'jour_du_cycle', v_jour,
    'cycle_moyen', v_cycle,
    'duree_regles', v_duree,
    'cycles_mesures', coalesce(v_nb, 0),
    'depasse', v_jour > v_cycle + 7,
    'phase', public.phase_du_cycle(least(v_jour, v_cycle), v_duree, v_cycle),
    'prochaines_regles', v_dernier + v_cycle,
    'jours_restants', (v_dernier + v_cycle) - current_date,
    'ovulation', v_dernier + public.jour_ovulation(v_cycle) - 1,
    'fertile_debut', v_dernier + public.jour_ovulation(v_cycle) - 6,
    'fertile_fin', v_dernier + public.jour_ovulation(v_cycle)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Les écritures : une fonction par geste, jamais d'UPDATE depuis le navigateur
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_questionnaire(
  p_prenom text, p_cycle int, p_duree int, p_dernieres_regles date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_cycle is null or p_cycle < 20 or p_cycle > 45 then
    return jsonb_build_object('ok', false, 'erreur', 'cycle_invalide');
  end if;
  if p_duree is null or p_duree < 1 or p_duree > 10 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_invalide');
  end if;
  if p_dernieres_regles is not null
     and (p_dernieres_regles > current_date or p_dernieres_regles < current_date - 120) then
    return jsonb_build_object('ok', false, 'erreur', 'date_invalide');
  end if;

  update public.profils
     set prenom = left(coalesce(nullif(trim(p_prenom), ''), prenom), 40),
         cycle_moyen = p_cycle,
         duree_regles = p_duree,
         questionnaire_fini = true
   where id = v_id;

  if p_dernieres_regles is not null then
    insert into public.cycles (profil_id, debut, fin)
    values (v_id, p_dernieres_regles, p_dernieres_regles + p_duree - 1)
    on conflict (profil_id, debut) do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.enregistrer_reglages(
  p_rappel boolean, p_discretes boolean, p_code boolean,
  p_cycle int default null, p_duree int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_cycle is not null and (p_cycle < 20 or p_cycle > 45) then
    return jsonb_build_object('ok', false, 'erreur', 'cycle_invalide');
  end if;
  if p_duree is not null and (p_duree < 1 or p_duree > 10) then
    return jsonb_build_object('ok', false, 'erreur', 'duree_invalide');
  end if;

  update public.profils
     set rappel_regles = coalesce(p_rappel, rappel_regles),
         notifications_discretes = coalesce(p_discretes, notifications_discretes),
         code_ouverture = coalesce(p_code, code_ouverture),
         cycle_moyen = coalesce(p_cycle, cycle_moyen),
         duree_regles = coalesce(p_duree, duree_regles)
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.noter_journee(
  p_jour date, p_flux text, p_douleur int, p_signes text[], p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_flux public.flux;
  v_signes text[];
  v_duree int;
  v_cycle public.cycles;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_jour is null or p_jour > current_date or p_jour < current_date - 365 then
    return jsonb_build_object('ok', false, 'erreur', 'date_invalide');
  end if;
  begin
    v_flux := coalesce(p_flux, 'rien')::public.flux;
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'flux_invalide');
  end;

  -- Les signes viennent d'une liste fermée à l'écran. On les y ramène ici
  -- aussi : sans cela, un appel direct écrirait n'importe quel texte, et la
  -- liste deviendrait illisible pour elle comme pour les statistiques.
  select array_agg(s) into v_signes from unnest(coalesce(p_signes, '{}')) s
   where s in ('ventre', 'dos', 'fatigue', 'tete', 'nausees', 'humeur', 'boutons', 'sucre', 'seins', 'sommeil');

  insert into public.journal (profil_id, jour, flux, douleur, signes, note, maj_le)
  values (v_id, p_jour, v_flux, least(greatest(coalesce(p_douleur, 0), 0), 3),
          coalesce(v_signes, '{}'), left(coalesce(p_note, ''), 500), now())
  on conflict (profil_id, jour) do update
    set flux = excluded.flux, douleur = excluded.douleur, signes = excluded.signes,
        note = excluded.note, maj_le = now();

  -- Noter du sang un jour où aucun cycle ne court, c'est déclarer des règles :
  -- elle ne devrait pas avoir à le dire deux fois.
  if v_flux <> 'rien' then
    select duree_regles into v_duree from public.profils where id = v_id;
    select * into v_cycle from public.cycles
     where profil_id = v_id
       and p_jour between debut - greatest(v_duree, 7) and debut + greatest(v_duree, 7)
     order by abs(p_jour - debut) limit 1;

    if v_cycle.id is null then
      insert into public.cycles (profil_id, debut, fin)
      values (v_id, p_jour, p_jour + v_duree - 1)
      on conflict (profil_id, debut) do nothing;
    elsif p_jour < v_cycle.debut then
      -- Elle note un saignement la veille d'un début déjà enregistré : ses
      -- règles ont commencé plus tôt qu'on ne le croyait. On recule le début
      -- au lieu d'ouvrir un deuxième cycle, qui écraserait la moyenne.
      update public.cycles
         set debut = p_jour,
             fin = greatest(coalesce(fin, p_jour), p_jour + v_duree - 1)
       where id = v_cycle.id;
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.declarer_regles(p_debut date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_duree int;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_debut is null or p_debut > current_date or p_debut < current_date - 365 then
    return jsonb_build_object('ok', false, 'erreur', 'date_invalide');
  end if;
  select duree_regles into v_duree from public.profils where id = v_id;
  insert into public.cycles (profil_id, debut, fin)
  values (v_id, p_debut, p_debut + coalesce(v_duree, 5) - 1)
  on conflict (profil_id, debut) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.retirer_regles(p_debut date)
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
  delete from public.cycles where profil_id = v_id and debut = p_debut;
  return jsonb_build_object('ok', true);
end;
$$;

-- Tout effacer, pour de vrai. Promis à l'écran « Ce que l'application sait de
-- moi » : ce qui est promis doit exister en base, pas seulement dans le texte.
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
  delete from public.journal where profil_id = v_id;
  delete from public.cycles where profil_id = v_id;
  update public.profils
     set cycle_moyen = 28, duree_regles = 5, questionnaire_fini = false
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Les fonctions internes ne sont appelables par personne depuis l'API.
-- « revoke from public » ne suffit jamais : anon et authenticated reçoivent
-- EXECUTE par défaut sur tout ce qui est créé dans public.
revoke all on function public.phase_du_cycle(int, int, int) from public, anon, authenticated;
revoke all on function public.jour_ovulation(int) from public, anon, authenticated;
revoke all on function public.profil_a_la_creation() from public, anon, authenticated;

-- Les fonctions du dossier intime sont réservées aux comptes connectés. On
-- retire d'abord le droit donné par défaut à tout le monde dans « public »,
-- sinon la clé anon, qui est publique, les appellerait aussi : elles
-- répondraient « connexion requise », mais elles seraient quand même un point
-- d'entrée ouvert, et compteraient dans les quotas de quelqu'un d'autre.
revoke all on function public.mon_cycle() from public, anon, authenticated;
revoke all on function public.enregistrer_questionnaire(text, int, int, date) from public, anon, authenticated;
revoke all on function public.enregistrer_reglages(boolean, boolean, boolean, int, int) from public, anon, authenticated;
revoke all on function public.noter_journee(date, text, int, text[], text) from public, anon, authenticated;
revoke all on function public.declarer_regles(date) from public, anon, authenticated;
revoke all on function public.retirer_regles(date) from public, anon, authenticated;
revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;

grant execute on function public.mon_cycle() to authenticated;
grant execute on function public.enregistrer_questionnaire(text, int, int, date) to authenticated;
grant execute on function public.enregistrer_reglages(boolean, boolean, boolean, int, int) to authenticated;
grant execute on function public.noter_journee(date, text, int, text[], text) to authenticated;
grant execute on function public.declarer_regles(date) to authenticated;
grant execute on function public.retirer_regles(date) to authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
