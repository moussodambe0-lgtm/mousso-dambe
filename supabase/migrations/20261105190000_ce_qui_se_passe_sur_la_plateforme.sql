-- Ce qui se passe sur la plateforme : les visites, et qui se connecte.
--
-- Arthur, le 5 novembre 2026 : « au niveau de Monde, il faudra mettre le nombre
-- de personnes qui se sont connectées. Je dois pouvoir voir les comptes qui
-- sont connectés, le nombre de personnes qui sont venues sur la plateforme,
-- qui ont visité la plateforme. Toutes les informations possibles. »
--
-- C'est une décision qu'il n'avait pas encore prise. Le 5 novembre au matin,
-- l'écran Monde ne comptait que les gestes volontaires (créer un compte,
-- commander), et la migration de cet écran disait pourquoi : « suivre les pas
-- de quelqu'un qui n'a rien demandé, sur une application qui traite des règles
-- et des douleurs, mérite mieux qu'une décision prise en chemin ». La décision
-- est prise, elle est de lui, et la voici.
--
-- COMMENT ON COMPTE SANS SUIVRE PERSONNE, et ce n'est pas une nuance.
--
-- Il y a deux façons de compter des visites. La première garde une ligne par
-- visiteuse, avec son adresse réseau, ses pages, ses heures : on peut alors
-- rejouer le parcours d'une personne. Sur une application où l'on vient lire
-- des pages sur les saignements abondants, c'est un dossier médical déguisé,
-- et il serait réclamable par quiconque met la main sur la base.
--
-- La seconde ne garde que des COMPTEURS PAR JOUR : trois nombres par date,
-- additionnés au passage. Il n'existe alors aucune ligne qui désigne qui que
-- ce soit, et rien à relier. C'est celle-ci. Arthur aura les nombres qu'il a
-- demandés, et personne ne sera suivi, parce qu'il n'y a rien dans cette table
-- qui permette de l'être.
--
-- Ce qui distingue deux passages d'une même journée est un COOKIE qui ne
-- contient qu'une date (voir src/middleware.ts). Pas d'identifiant, pas
-- d'empreinte de navigateur. Le serveur ne sait pas que deux pages viennent du
-- même téléphone, il sait seulement que ce téléphone n'avait pas encore été
-- compté aujourd'hui.
--
-- CE QUE CELA NE DIRA JAMAIS, parce que ce n'est pas enregistré : quelle page
-- une personne a ouverte, dans quel ordre, combien de temps, d'où elle venait.

-- ---------------------------------------------------------------------------
-- 1. Les visites, trois nombres par jour
-- ---------------------------------------------------------------------------
create table if not exists public.visites_jour (
  jour date primary key,
  -- Pages ouvertes dans la journée, toutes visiteuses confondues.
  pages bigint not null default 0,
  -- Navigateurs qui n'avaient pas encore été comptés aujourd'hui. C'est le
  -- nombre le plus proche de « combien de personnes sont venues », en sachant
  -- qu'un même téléphone deux jours de suite compte deux fois, et qu'une femme
  -- qui ouvre sur son téléphone puis sur celui d'une amie compte deux fois.
  visiteuses bigint not null default 0,
  -- Parmi ces pages, celles ouvertes par quelqu'un qui a une session.
  pages_connectees bigint not null default 0
);

alter table public.visites_jour enable row level security;
-- Aucune politique : personne ne lit cette table directement, pas même une
-- administratrice. Elle passe par `monde()`, qui vérifie `est_admin()`.
revoke all on table public.visites_jour from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. La dernière fois qu'un compte s'est montré
-- ---------------------------------------------------------------------------
-- Une seule colonne, écrasée à chaque passage : on garde QUAND, jamais
-- l'historique des passages. « Connectée aujourd'hui » se répond avec ça, et
-- une suite de dates ne servirait qu'à reconstituer des habitudes.
alter table public.profils
  add column if not exists derniere_visite timestamptz;

create index if not exists profils_derniere_visite on public.profils (derniere_visite desc);

-- ---------------------------------------------------------------------------
-- 3. Le passage : appelé par le middleware, à chaque page ouverte
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_passage(p_nouvelle boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
begin
  insert into public.visites_jour (jour, pages, visiteuses, pages_connectees)
  values (
    current_date,
    1,
    case when p_nouvelle then 1 else 0 end,
    case when v_moi is null then 0 else 1 end
  )
  on conflict (jour) do update set
    pages = public.visites_jour.pages + 1,
    visiteuses = public.visites_jour.visiteuses + case when p_nouvelle then 1 else 0 end,
    pages_connectees = public.visites_jour.pages_connectees + case when v_moi is null then 0 else 1 end;

  -- La présence du compte, au plus une écriture toutes les dix minutes. Sans
  -- ce garde-fou, chaque page tournée réécrirait la ligne du profil, ce qui
  -- coûte cher pour une information dont la minute exacte n'intéresse
  -- personne.
  if v_moi is not null then
    update public.profils
       set derniere_visite = now()
     where id = v_moi
       and (derniere_visite is null or derniere_visite < now() - interval '10 minutes');
  end if;
end;
$$;

revoke all on function public.enregistrer_passage(boolean) from public;
-- `anon` aussi : une visiteuse sans compte est précisément celle qu'Arthur veut
-- compter. La fonction n'écrit que des compteurs, elle ne lit rien et ne rend
-- rien : même appelée en boucle, elle ne fait que gonfler un nombre.
grant execute on function public.enregistrer_passage(boolean) to anon, authenticated;

comment on function public.enregistrer_passage(boolean) is
  'Compte une page ouverte, et marque la présence du compte connecté. Aucune donnée personnelle.';

-- ---------------------------------------------------------------------------
-- 4. Monde, enrichi
-- ---------------------------------------------------------------------------
-- Reprend tout ce que la version du 5 novembre au matin rendait, et y ajoute
-- les visites et les connexions. Les noms des champs d'origine ne bougent pas :
-- la page les lit déjà.
create or replace function public.monde()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_jours jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Les trente derniers jours, un point par jour, y compris les jours vides :
  -- un trou dans une courbe se lit, une date absente ne se voit pas.
  select coalesce(jsonb_agg(jsonb_build_object(
           'jour', j.jour,
           'inscriptions', coalesce(i.n, 0),
           'commandes', coalesce(c.n, 0),
           'visites', coalesce(v.visiteuses, 0),
           'pages', coalesce(v.pages, 0)
         ) order by j.jour), '[]'::jsonb)
    into v_jours
    from generate_series((current_date - interval '29 days')::date, current_date, interval '1 day') as j(jour)
    left join (
      select cree_le::date as jour, count(*) as n
        from public.profils
       where cree_le >= current_date - interval '29 days'
       group by 1
    ) i on i.jour = j.jour
    left join (
      select cree_le::date as jour, count(*) as n
        from public.commandes
       where cree_le >= current_date - interval '29 days'
       group by 1
    ) c on c.jour = j.jour
    left join public.visites_jour v on v.jour = j.jour;

  return jsonb_build_object(
    'ok', true,
    'comptes', (select count(*) from public.profils),
    'comptes_7j', (select count(*) from public.profils where cree_le >= now() - interval '7 days'),
    'comptes_30j', (select count(*) from public.profils where cree_le >= now() - interval '30 days'),
    -- Celles qui ont commandé au moins une fois. Le rapport entre ce nombre et
    -- le nombre de comptes dit si l'application sert à acheter ou seulement à
    -- suivre son cycle : deux métiers, et la réponse change la stratégie.
    'ont_commande', (select count(distinct profil_id) from public.commandes),
    'ont_recommande', (
      select count(*) from (
        select profil_id from public.commandes group by profil_id having count(*) > 1
      ) s
    ),
    'questionnaire_fait', (select count(*) from public.profils where questionnaire_fini),

    -- --- Qui est là, et quand ---
    -- « En ce moment » : une page ouverte dans le dernier quart d'heure. Plus
    -- court serait faux (la présence ne s'écrit qu'une fois par dix minutes),
    -- plus long ne voudrait plus dire « en ce moment ».
    'connectees_maintenant', (
      select count(*) from public.profils where derniere_visite >= now() - interval '15 minutes'
    ),
    'connectees_jour', (
      select count(*) from public.profils where derniere_visite::date = current_date
    ),
    'connectees_7j', (
      select count(*) from public.profils where derniere_visite >= now() - interval '7 days'
    ),
    'connectees_30j', (
      select count(*) from public.profils where derniere_visite >= now() - interval '30 days'
    ),
    -- Un compte créé qui n'est jamais revenu : le chiffre qui dit si
    -- l'application sert une fois ou tous les mois.
    'jamais_revenues', (
      select count(*) from public.profils
       where derniere_visite is null or derniere_visite < cree_le + interval '1 day'
    ),

    -- --- Les visites ---
    'visites', jsonb_build_object(
      'jour', (select coalesce(visiteuses, 0) from public.visites_jour where jour = current_date),
      'pages_jour', (select coalesce(pages, 0) from public.visites_jour where jour = current_date),
      'semaine', (
        select coalesce(sum(visiteuses), 0) from public.visites_jour
         where jour >= current_date - 6
      ),
      'pages_semaine', (
        select coalesce(sum(pages), 0) from public.visites_jour where jour >= current_date - 6
      ),
      'mois', (
        select coalesce(sum(visiteuses), 0) from public.visites_jour
         where jour >= current_date - 29
      ),
      'pages_mois', (
        select coalesce(sum(pages), 0) from public.visites_jour where jour >= current_date - 29
      ),
      -- Part des pages ouvertes par quelqu'un qui a une session. Le reste, ce
      -- sont des visiteuses qui regardent sans compte : c'est à elles que
      -- s'adresse la page d'accueil.
      'part_connectee', (
        select case when sum(pages) > 0
                 then round((sum(pages_connectees)::numeric / sum(pages)) * 100)::int
                 else null end
          from public.visites_jour where jour >= current_date - 29
      ),
      -- Le jour le plus fréquenté du mois, et combien.
      'record', (
        select jsonb_build_object('jour', jour, 'visiteuses', visiteuses)
          from public.visites_jour
         where jour >= current_date - 29
         order by visiteuses desc, jour desc
         limit 1
      )
    ),

    -- --- Ce qui se vend, pour que Monde dise aussi l'activité ---
    'commandes_jour', (
      select count(*) from public.commandes
       where etat <> 'annulee' and cree_le::date = current_date
    ),
    'commandes_7j', (
      select count(*) from public.commandes
       where etat <> 'annulee' and cree_le >= now() - interval '7 days'
    ),
    'jours', v_jours
  );
end;
$$;

revoke all on function public.monde() from public;
grant execute on function public.monde() to authenticated;

comment on function public.monde() is
  'Administration : visites, connexions, comptes et commandes. Que des nombres, jamais un prénom, et ne lit ni les cycles ni le journal.';
