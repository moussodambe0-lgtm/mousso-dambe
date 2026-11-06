-- La preuve des accords donnés : une table où l'on ajoute, et rien d'autre.
--
-- POURQUOI ELLE EXISTE.
--
-- L'article 26 de la loi n°037-2026/ALP ne demande pas un consentement, il
-- INTERDIT : « Il est interdit de collecter ou de traiter, sans le
-- consentement exprès de la personne concernée, les données qui révèlent la
-- vie sexuelle, la santé, les mœurs. » Et l'article 5 range la consultation
-- parmi les traitements. Ouvrir le fil d'une femme sans son accord est donc
-- exactement l'acte que la loi interdit. L'accord n'est pas une précaution,
-- c'est ce qui lève l'interdiction.
--
-- Et l'article 17 met la charge de la preuve sur le responsable du traitement,
-- c'est-à-dire sur Mousso Dambé. Un accord qui ne se prouve pas ne sert à
-- rien : la case cochée dont il ne reste aucune trace ne prouve rien du tout.
--
-- CE QU'ON GARDE, et pourquoi chaque colonne est là (Juriste, 5 novembre 2026,
-- § 4.3) :
--
--   objet      ce à quoi elle a dit oui, un par ligne. Jamais un accord global
--              dont on ne saurait plus dire ce qu'il couvrait.
--   accorde    vrai pour un accord, faux pour un retrait. LE RETRAIT EST UNE
--              LIGNE DE PLUS, jamais une ligne corrigée : sans lui on ne
--              saurait pas à partir de quel jour on n'avait plus le droit.
--   version    le numéro du texte affiché. Le texte changera ; il faut pouvoir
--              dire à quoi elle a dit oui, pas à quoi elle dirait oui aujourd'hui.
--   empreinte  l'empreinte SHA-256 du texte exact. C'est elle qui rend la
--              falsification visible.
--   texte      le texte intégral. L'empreinte prouve qu'il n'a pas bougé, le
--              texte dit ce qu'il disait. Les deux, ou aucun des deux.
--   le         la date et l'heure en temps universel.
--
-- POURQUOI ON NE PEUT NI MODIFIER NI EFFACER. L'article 34 de la loi
-- n°045-2009/AN donne à un écrit électronique la même force qu'au papier à
-- deux conditions : que la personne soit dûment identifiée, et que
-- l'intégrité de sa conservation soit garantie. Une table qu'on peut corriger
-- ne garantit rien. Les droits sont donc retirés ET un déclencheur refuse,
-- parce qu'un droit se redonne par mégarde et qu'un déclencheur, non.
--
-- CE QUE ÇA NE DONNE PAS. Mousso Dambé n'est accréditée ni pour l'horodatage
-- ni pour l'archivage électronique (articles 20 à 23 et 29 à 30 de la même
-- loi). Elle ne bénéficie d'aucune présomption et devra convaincre « par tous
-- moyens », article 33. Ce dispositif rend la preuve possible, il ne la rend
-- pas automatique.

create table if not exists public.consentements (
  id          bigint generated always as identity primary key,
  profil      uuid not null references public.profils(id) on delete cascade,
  objet       text not null check (objet in ('assistante', 'cgu', 'cgv', 'age', 'cycle')),
  accorde     boolean not null,
  version     text not null,
  empreinte   text not null,
  texte       text not null,
  le          timestamptz not null default now()
);

-- On lit toujours « le dernier état de cet objet pour ce profil » : l'index
-- suit cette question, du plus récent au plus ancien.
create index if not exists consentements_profil_objet_idx
  on public.consentements (profil, objet, le desc);

comment on table public.consentements is
  'Les accords donnés et retirés. On ajoute des lignes, on n''en corrige aucune (art. 34 loi n°045-2009/AN).';

-- --- L'interdiction de corriger, posée deux fois -----------------------------

create or replace function public.consentements_sans_retouche()
returns trigger language plpgsql as $$
begin
  raise exception
    'Un consentement ne se modifie ni ne s''efface : ajoute une ligne de retrait (art. 34 loi n°045-2009/AN).';
end $$;

drop trigger if exists consentements_sans_retouche on public.consentements;
create trigger consentements_sans_retouche
  before update or delete on public.consentements
  for each row execute function public.consentements_sans_retouche();

alter table public.consentements enable row level security;

-- Elle lit les siens, et rien d'autre. Personne n'écrit directement : tout
-- passe par les deux fonctions plus bas, qui calculent l'empreinte elles-mêmes.
-- Une cliente qui pourrait insérer sa propre ligne pourrait écrire l'empreinte
-- de son choix, et la preuve ne vaudrait plus rien.
drop policy if exists consentements_les_siens on public.consentements;
create policy consentements_les_siens on public.consentements
  for select to authenticated using (profil = auth.uid());

revoke insert, update, delete on public.consentements from anon, authenticated;

-- --- Donner ou retirer son accord --------------------------------------------

/*
 * Enregistrer un accord, ou son retrait.
 *
 * Le texte est passé en entier par l'application : c'est lui qu'on garde, et
 * c'est de lui qu'on calcule l'empreinte ici, côté base. Si l'application
 * calculait l'empreinte, elle pourrait en envoyer une qui ne correspond pas au
 * texte, et la preuve se contredirait elle-même.
 *
 * Donner deux fois le même accord ajoute deux lignes, et c'est voulu : on veut
 * savoir qu'elle a revu le texte, pas seulement qu'elle avait dit oui un jour.
 */
create or replace function public.consentement_noter(
  p_objet   text,
  p_accorde boolean,
  p_version text,
  p_texte   text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
begin
  if v_moi is null then
    return jsonb_build_object('ok', false, 'erreur', 'pas-de-session');
  end if;
  if p_objet is null or p_version is null or coalesce(trim(p_texte), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'texte-manquant');
  end if;

  insert into public.consentements (profil, objet, accorde, version, empreinte, texte)
  values (
    v_moi,
    p_objet,
    p_accorde,
    p_version,
    encode(sha256(convert_to(p_texte, 'UTF8')), 'hex'),
    p_texte
  );

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erreur', 'objet-inconnu');
end $$;

grant execute on function public.consentement_noter(text, boolean, text, text) to authenticated;

/*
 * L'état actuel d'un accord : la dernière ligne gagne.
 *
 * Rend aussi la version acceptée, pour que l'application puisse redemander
 * l'accord quand le texte a changé plutôt que de faire comme si de rien n'était.
 */
create or replace function public.consentement_etat(p_objet text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_moi uuid := auth.uid();
  v_ligne public.consentements%rowtype;
begin
  if v_moi is null then
    return jsonb_build_object('ok', false, 'erreur', 'pas-de-session');
  end if;

  select * into v_ligne
  from public.consentements
  where profil = v_moi and objet = p_objet
  order by le desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'accorde', false, 'version', null, 'le', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'accorde', v_ligne.accorde,
    'version', v_ligne.version,
    'le', v_ligne.le
  );
end $$;

grant execute on function public.consentement_etat(text) to authenticated;
