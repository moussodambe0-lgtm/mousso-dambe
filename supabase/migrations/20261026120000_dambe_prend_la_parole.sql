-- Dambé parle la première quand les règles arrivent.
--
-- Arthur, le 26 octobre 2026, après avoir regardé le journal : « je ne sais pas
-- si les gens vont aller là-bas pour dire ce qu'ils ont choisi, parce qu'ils
-- vont pas voir vraiment l'intérêt. C'est mieux en discutant directement.
-- Dambé peut les envoyer quand leur règle arrive, Dambé sait que leur règle est
-- arrivée et leur envoie des messages pour demander c'est comment, elle espère
-- que ça va, et à ce moment elle apprend des renseignements qu'elle met dans
-- l'historique [...] pour que l'application la connaisse mieux et arrive à
-- déduire quelles peuvent être les conséquences des règles qui vont venir. »
--
-- Il a raison sur le fond : un formulaire à remplir chaque jour, personne ne le
-- tient. Une question posée au bon moment, on y répond. Le journal reste, il
-- cesse seulement d'être le seul chemin.
--
-- CE QUE FAIT CETTE MIGRATION, ET CE QU'ELLE NE FAIT PAS
--
-- Elle ouvre le fil de l'assistante aux messages que Dambé écrit d'elle-même,
-- et elle pose la règle du MOMENT : au premier ou au deuxième jour des règles,
-- une fois par cycle, jamais deux fois.
--
-- Elle ne touche pas à l'historique : retenir ce qu'elle répond viendra après,
-- et avec confirmation (décision d'Arthur le même jour : Dambé propose, elle
-- confirme). Ici, Dambé ouvre la conversation, rien de plus.
--
-- LE TEXTE EST CHOISI PAR LA BASE, JAMAIS PAR L'APPELANT. C'est la leçon de
-- l'audit du 14 octobre sur l'autre application : une fonction qui recopiait un
-- contenu fourni par l'appelant laissait écrire n'importe quoi par un appel
-- direct à l'API, même si la page, elle, se comportait bien. Ici, le serveur
-- demande seulement « est-ce le moment ? » et la base répond avec ses propres
-- mots.
--
-- PAS DE NOTIFICATION. Le message ATTEND dans l'application. Une notification
-- « c'est comment tes règles ? » sur l'écran verrouillé d'un téléphone partagé
-- révélerait ce que cette application existe pour protéger.

-- ---------------------------------------------------------------------------
-- 1. Le fil accepte les messages venus de Dambé
-- ---------------------------------------------------------------------------
-- Jusqu'ici une ligne était forcément « sa question, puis la réponse ». Quand
-- Dambé ouvre, il n'y a pas de question : seulement ce qu'elle dit.
alter table public.assistante_messages
  add column if not exists ouvert_par text not null default 'elle',
  add column if not exists vu_le timestamptz;

alter table public.assistante_messages
  drop constraint if exists assistante_messages_ouvert_par_check;
alter table public.assistante_messages
  add constraint assistante_messages_ouvert_par_check
  check (ouvert_par in ('elle', 'dambe'));

-- La question devient facultative, mais seulement pour les messages de Dambé.
alter table public.assistante_messages alter column question drop not null;

alter table public.assistante_messages
  drop constraint if exists assistante_messages_coherence_check;
alter table public.assistante_messages
  add constraint assistante_messages_coherence_check
  check (
    (ouvert_par = 'elle' and question is not null)
    or (ouvert_par = 'dambe' and question is null and reponse is not null)
  );

comment on column public.assistante_messages.ouvert_par is
  'Qui a ouvert cet echange : « elle » (sa question), ou « dambe » (Dambe parle
   la premiere quand les regles arrivent).';
comment on column public.assistante_messages.vu_le is
  'Quand elle a ouvert le fil apres ce message. Sert au point sur l''onglet,
   jamais a dire a quiconque d''autre qu''elle l''a lu.';

-- ---------------------------------------------------------------------------
-- 2. Les mots de Dambé, choisis par la base
-- ---------------------------------------------------------------------------
-- Volontairement courts, sans question médicale, sans vocabulaire de maladie.
-- Elle demande comment ça va, elle n'interroge pas une patiente. Et jamais
-- « ma soeur » ni « mon frere » : Arthur l'a demandé le 26 octobre, Dambé
-- appelle les gens par leur nom.
create or replace function public.dambe_mots_douverture(p_prenom text, p_jour int)
returns text language sql immutable set search_path = public as $$
  select case
    when p_jour <= 1 then
      coalesce(p_prenom || ', ', '') || 'je crois que tes règles ont commencé. '
      || 'C''est comment aujourd''hui ? Raconte-moi comme tu veux, j''écoute.'
    else
      coalesce(p_prenom || ', ', '') || 'deuxième jour. '
      || 'Ça va, ou tu as mal ? Dis-moi juste comment tu te sens.'
  end
$$;

revoke all on function public.dambe_mots_douverture(text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Est-ce le moment ? Si oui, Dambé ouvre.
-- ---------------------------------------------------------------------------
-- Appelée par le site quand elle ouvre l'application. Rend le message en
-- attente s'il y en a un, qu'il vienne d'être créé ou qu'il attendait déjà.
--
-- Les garde-fous, dans l'ordre où ils comptent :
--   - un appel qui ne vient pas du site est refusé ;
--   - un seul message de Dambé par cycle, jamais deux ;
--   - seulement au 1er ou 2e jour des règles, pas trois semaines après ;
--   - rien si elle n'a aucun cycle enregistré : Dambé ne devine pas.
create or replace function public.dambe_ouvre_si_besoin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_debut date;
  v_jour int;
  v_prenom text;
  v_message uuid;
  v_texte text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Le début du cycle en cours, c'est-à-dire ses dernières règles déclarées.
  select debut into v_debut
    from public.cycles
   where profil_id = v_id
   order by debut desc
   limit 1;

  if v_debut is null then
    return jsonb_build_object('ok', true, 'message', null);
  end if;

  -- Un message de Dambé existe-t-il déjà pour ce cycle ? S'il est là, on le
  -- rend tel quel : c'est peut-être celui d'hier, qu'elle n'a pas encore vu.
  select id into v_message
    from public.assistante_messages
   where profil_id = v_id
     and ouvert_par = 'dambe'
     and cree_le::date >= v_debut
   order by cree_le desc
   limit 1;

  if v_message is not null then
    return (
      select jsonb_build_object(
        'ok', true,
        'message', jsonb_build_object(
          'id', id, 'texte', reponse, 'cree_le', cree_le, 'vu', vu_le is not null
        )
      )
      from public.assistante_messages where id = v_message
    );
  end if;

  -- Pas encore de message : est-ce le moment ? Jour 1 ou 2 des règles.
  v_jour := (current_date - v_debut);
  if v_jour < 0 or v_jour > 1 then
    return jsonb_build_object('ok', true, 'message', null);
  end if;

  select prenom into v_prenom from public.profils where id = v_id;
  v_texte := public.dambe_mots_douverture(nullif(trim(coalesce(v_prenom, '')), ''), v_jour);

  insert into public.assistante_messages (profil_id, question, reponse, ouvert_par, repondu_le)
  values (v_id, null, v_texte, 'dambe', now())
  returning id into v_message;

  return jsonb_build_object(
    'ok', true,
    'message', jsonb_build_object('id', v_message, 'texte', v_texte, 'cree_le', now(), 'vu', false)
  );
end;
$$;

revoke all on function public.dambe_ouvre_si_besoin() from public, anon, authenticated;
grant execute on function public.dambe_ouvre_si_besoin() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Marquer comme vu, quand elle a ouvert le fil
-- ---------------------------------------------------------------------------
create or replace function public.dambe_message_vu()
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

  update public.assistante_messages
     set vu_le = now()
   where profil_id = v_id
     and ouvert_par = 'dambe'
     and vu_le is null;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dambe_message_vu() from public, anon, authenticated;
grant execute on function public.dambe_message_vu() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le fil rend aussi qui a ouvert chaque échange
-- ---------------------------------------------------------------------------
create or replace function public.mon_fil_assistante()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'question', question, 'reponse', reponse,
           'produit', produit_slug, 'cree_le', cree_le,
           'ouvert_par', ouvert_par)
         order by cree_le), '[]'::jsonb)
    from (
      select id, question, reponse, produit_slug, cree_le, ouvert_par
        from public.assistante_messages
       where profil_id = auth.uid()
       order by cree_le desc limit 20
    ) d
$$;

revoke all on function public.mon_fil_assistante() from public, anon, authenticated;
grant execute on function public.mon_fil_assistante() to authenticated;
