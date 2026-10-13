-- Les messages vocaux, dans la conversation avec le médecin.
--
-- Décision d'Arthur du 13 octobre 2026. Il voulait un micro dans la discussion
-- avec IA Dambé ; Dambé lit du texte et n'entend rien, alors le micro de
-- Dambé écrit ses mots dans la case (c'est `src/scripts/dictee.ts`). Le VRAI
-- vocal, celui qu'on enregistre et qu'on envoie, est ici, chez le médecin.
--
-- POURQUOI CHEZ LE MÉDECIN ET PAS CHEZ DAMBÉ. Trois raisons, dans l'ordre
-- d'importance :
--
--   1. Un humain écoute. Donc le moré et le dioula passent. C'est l'argument
--      décisif : à Ouagadougou, celles qui écrivent mal le français sont
--      exactement celles qui ont le plus besoin de parler. La dictée, elle,
--      ne connaît que le français et les laisse dehors.
--
--   2. Aucun son ne sort vers un service extérieur. Faire transcrire un vocal
--      par une société étrangère pour que l'IA le comprenne, ce serait
--      envoyer la VOIX d'une femme qui parle de son corps à une entreprise
--      qu'elle ne connaît pas. Une voix identifie quelqu'un. On ne le fait
--      pas.
--
--   3. Chez Dambé, un vocal n'aurait servi à rien : il serait parti sans être
--      compris, et elle aurait attendu une réponse qui ne vient pas.
--
-- POURQUOI LE SON EST DANS LA BASE ET PAS DANS UN SEAU DE FICHIERS. Supabase
-- propose un stockage de fichiers, et c'est l'endroit habituel. On ne s'en
-- sert pas ici, volontairement :
--
--   - Toute cette application tient sur une seule règle : RLS sur chaque
--     table, et aucune écriture hors des fonctions `security definer`. Un seau
--     de fichiers est un SECOND système de permissions, avec ses propres
--     politiques, sa propre notion de public, et sa propre façon de se
--     tromper. Pour des enregistrements intimes, un seul système à surveiller
--     vaut mieux que deux.
--   - Un fichier déposé dans un seau porte une adresse. Une adresse se
--     partage, se devine, se retrouve dans un journal de serveur. Une ligne de
--     table ne sort que par une fonction qui vérifie qui appelle.
--   - À l'échelle de Mousso Dambé, le volume est petit : 90 secondes pèsent
--     environ 270 Ko en Opus. Mille vocaux font 270 Mo.
--
-- Si un jour le volume devient gênant, c'est la sauvegarde de la base qui le
-- dira, et ce sera le moment de déplacer. Pas avant.
--
-- CE QUE CE FICHIER NE FAIT PAS : il ne transcrit rien, il n'envoie rien
-- dehors, et il ne met le vocal nulle part dans le cycle. Un vocal au médecin
-- reste un message, pas un dossier médical.

-- ---------------------------------------------------------------------------
-- Le son
-- ---------------------------------------------------------------------------
create table if not exists public.vocaux (
  -- Un vocal appartient à un message, et à un seul. Le message porte la
  -- durée (pour dessiner la bulle sans charger le son) ; ici il n'y a que les
  -- octets. `on delete cascade` : effacer la conversation efface les sons.
  message_id uuid primary key references public.messages(id) on delete cascade,
  octets bytea not null,
  -- Ce que le navigateur a su enregistrer. Chrome sur Android donne du webm,
  -- Safari du mp4. La liste est fermée : un type inventé ne doit pas devenir
  -- un en-tête que le navigateur de quelqu'un d'autre ira exécuter.
  type_mime text not null check (type_mime in ('audio/webm', 'audio/mp4', 'audio/ogg')),
  cree_le timestamptz not null default now()
);

alter table public.vocaux enable row level security;
revoke all on table public.vocaux from public, anon, authenticated;

-- AUCUNE POLITIQUE DE LECTURE, ET C'EST VOULU. Personne ne lit cette table
-- directement, pas même elle, pas même l'administratrice. Le seul chemin est
-- `lire_vocal()` plus bas, qui vérifie qui appelle. Une table sans politique
-- est une table fermée : c'est la position la plus sûre pour des voix.
comment on table public.vocaux is
  'Les messages vocaux. Fermee a tout le monde : on ne lit que par lire_vocal().
   Aucun son ne sort vers un service exterieur, jamais, et rien n''est transcrit.';

-- ---------------------------------------------------------------------------
-- Le message qui le porte
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists vocal_secondes int
    check (vocal_secondes is null or vocal_secondes between 1 and 90);

comment on column public.messages.vocal_secondes is
  'Duree du vocal, en secondes, ou NULL si le message est ecrit. Recopiee ici
   pour dessiner la bulle sans charger le son.';

-- Le texte devient facultatif QUAND il y a un vocal, et seulement là. On
-- remplace la contrainte au lieu de l'assouplir pour tout le monde : un
-- message écrit vide reste refusé.
do $$
declare
  v_nom text;
begin
  select c.conname into v_nom
    from pg_constraint c
   where c.conrelid = 'public.messages'::regclass
     and c.contype = 'c'
     and pg_get_constraintdef(c.oid) ilike '%length(texte)%';
  if v_nom is not null then
    execute format('alter table public.messages drop constraint %I', v_nom);
  end if;
end;
$$;

alter table public.messages
  add constraint messages_texte_ou_vocal check (
    length(texte) <= 2000
    and (length(texte) >= 1 or vocal_secondes is not null)
  );

-- ---------------------------------------------------------------------------
-- Envoyer un vocal
-- ---------------------------------------------------------------------------
/**
 * Elle envoie un vocal au médecin.
 *
 * Le son arrive en base64, parce que c'est ce qu'un corps JSON sait porter.
 * Il est décodé ici et stocké en octets : on ne garde jamais la forme base64,
 * qui pèse un tiers de plus.
 *
 * Les bornes sont posées ICI, dans la base, et pas seulement dans la page :
 * une page se contourne, une fonction `security definer` ne se contourne pas.
 *   - 90 secondes. Au-delà, ce n'est plus une question, c'est un monologue
 *     que personne n'écoutera jusqu'au bout.
 *   - 1,2 Mo. De quoi tenir 90 secondes largement, même en qualité haute.
 *   - Le médecin seulement. Pas la boutique : Arthur n'a demandé le vocal que
 *     pour le médecin, et ouvrir une porte qu'il n'a pas demandée dans une
 *     messagerie commerciale n'est pas à nous de le décider.
 */
create or replace function public.envoyer_vocal(
  p_base64 text,
  p_type text,
  p_secondes int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_octets bytea;
  v_fil uuid;
  v_message uuid;
  v_duree int;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Le même plafond que les messages écrits : un vocal est un message.
  if not public.quota_ok('message', public.reglage_entier('quota_message_heure', 20), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'quota');
  end if;

  if p_type is null or p_type not in ('audio/webm', 'audio/mp4', 'audio/ogg') then
    return jsonb_build_object('ok', false, 'erreur', 'format_refuse');
  end if;

  v_duree := coalesce(p_secondes, 0);
  if v_duree < 1 or v_duree > 90 then
    return jsonb_build_object('ok', false, 'erreur', 'duree_refusee');
  end if;

  -- `decode` lève une exception sur un base64 abîmé : on l'attrape, parce
  -- qu'un enregistrement coupé par une connexion qui tombe ne doit pas
  -- renvoyer une erreur de base de données à l'écran.
  begin
    v_octets := decode(coalesce(p_base64, ''), 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_abime');
  end;

  if octet_length(v_octets) < 500 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_vide');
  end if;
  if octet_length(v_octets) > 1200000 then
    return jsonb_build_object('ok', false, 'erreur', 'vocal_trop_long');
  end if;

  insert into public.fils (profil_id, sujet) values (v_id, 'medecin')
  on conflict (profil_id, sujet) do nothing;

  select id into v_fil from public.fils where profil_id = v_id and sujet = 'medecin';

  insert into public.messages (fil_id, de, texte, vocal_secondes)
  values (v_fil, 'elle', '', v_duree)
  returning id into v_message;

  insert into public.vocaux (message_id, octets, type_mime)
  values (v_message, v_octets, p_type);

  -- L'aperçu de la liste des discussions. On n'écrit pas un bout de ce qui
  -- est dit, puisqu'on ne le sait pas : on dit qu'il y a un vocal et combien
  -- il dure. C'est aussi plus discret sur un écran qu'on regarde par-dessus
  -- l'épaule.
  update public.fils
     set dernier_le = now(),
         apercu = 'Message vocal · ' || v_duree || ' s',
         apercu_de = 'elle',
         non_lus_admin = non_lus_admin + 1
   where id = v_fil;

  return jsonb_build_object('ok', true, 'message', v_message, 'secondes', v_duree);
end;
$$;

revoke all on function public.envoyer_vocal(text, text, int) from public, anon, authenticated;
grant execute on function public.envoyer_vocal(text, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Écouter un vocal
-- ---------------------------------------------------------------------------
/**
 * Le son d'un message, pour celle qui l'a envoyé ou pour l'administratrice.
 *
 * Deux vérifications, pas une : que le message porte bien un vocal, et que
 * celle qui appelle a le droit de l'entendre. Le droit se lit sur le FIL, pas
 * sur le message : c'est la même règle que pour lire la conversation, donc il
 * n'y a pas deux vérités à tenir à jour.
 *
 * Le son revient en base64. C'est le prix d'un passage par JSON ; la page le
 * redécode et le sert en octets au navigateur.
 */
create or replace function public.lire_vocal(p_message uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_admin boolean;
  v_type text;
  v_octets bytea;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  v_admin := public.est_admin();

  select v.type_mime, v.octets
    into v_type, v_octets
    from public.vocaux v
    join public.messages m on m.id = v.message_id
    join public.fils f on f.id = m.fil_id
   where v.message_id = p_message
     and (v_admin or f.profil_id = v_id);

  if v_type is null then
    -- Le même message qu'un vocal qui n'existe pas. On ne dit pas « il existe
    -- mais il n'est pas à toi » : ce serait confirmer qu'une autre femme a
    -- envoyé un vocal, ce qui ne regarde personne.
    return jsonb_build_object('ok', false, 'erreur', 'vocal_inconnu');
  end if;

  return jsonb_build_object(
    'ok', true,
    'type', v_type,
    -- Postgres coupe son base64 toutes les 76 colonnes avec des retours à la
    -- ligne (norme MIME). Ils sont inoffensifs pour un décodeur indulgent mais
    -- changent le texte, donc on les retire : ce qui sort est exactement la
    -- forme qui est entrée.
    'base64', replace(encode(v_octets, 'base64'), chr(10), '')
  );
end;
$$;

revoke all on function public.lire_vocal(uuid) from public, anon, authenticated;
grant execute on function public.lire_vocal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Les deux lectures de fil disent maintenant la durée du vocal
-- ---------------------------------------------------------------------------
/**
 * Sa conversation à elle, avec la durée des vocaux.
 *
 * Seule la DURÉE sort ici, jamais les octets : la liste des messages est lue
 * à chaque ouverture de la conversation, et y faire passer tous les sons
 * ferait payer des mégaoctets à quelqu'un qui n'écoutera qu'un vocal.
 */
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
             'vocal_secondes', m.vocal_secondes,
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

/**
 * La conversation entière, côté administratrice, avec la durée des vocaux.
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
           'sujet', f.sujet,
           'prenom', coalesce(nullif(p.prenom, ''), 'Sans prénom'),
           'telephone', coalesce(p.telephone, ''),
           'avatar_graine', p.avatar_graine,
           -- Dans une conversation médicale, le nombre de commandes n'a rien
           -- à faire sous les yeux de qui répond. Règle posée le 12 octobre.
           'commandes', case when f.sujet = 'medecin' then null else
             (select count(*) from public.commandes c where c.profil_id = p.id) end
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
             'vocal_secondes', m.vocal_secondes,
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

-- ---------------------------------------------------------------------------
-- « Effacer mes données » efface aussi ce qu'elle a dit au médecin
-- ---------------------------------------------------------------------------
/**
 * La fonction d'effacement date d'avant la messagerie : elle supprimait le
 * journal, les cycles et les questions à Dambé, et RIEN d'autre. Une femme
 * qui touchait « Effacer mes données » gardait donc, sans le savoir, ses
 * messages au médecin. Avec les vocaux, c'est devenu sérieux : sa VOIX
 * serait restée.
 *
 * On ajoute la conversation avec le médecin, et seulement elle :
 *   - c'est de la donnée de santé, de la même famille que le journal ;
 *   - la supprimer supprime ses messages et ses vocaux (cascade).
 *
 * La conversation avec la BOUTIQUE reste, comme les commandes : c'est une
 * trace commerciale (adresses, délais, litiges), pas une donnée de santé.
 * Le texte de la page le dit en toutes lettres. Si Arthur préfère tout
 * effacer, c'est une ligne ici : `and sujet = 'medecin'` à retirer.
 */
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
  delete from public.fils where profil_id = v_id and sujet = 'medecin';
  update public.profils
     set cycle_moyen = 28, duree_regles = 5, questionnaire_fini = false
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
