-- Les échanges avec IA Dambé, lisibles par l'administration.
--
-- CECI REVIENT SUR UNE RÈGLE POSÉE LE 12 OCTOBRE 2026, et il faut que ce soit
-- écrit noir sur blanc plutôt que découvert un jour dans le code. Jusqu'ici,
-- aucun écran de gestion ne pouvait lire ce qu'une fille demandait à
-- l'assistante : les migrations précédentes le disent, et `monde()` le
-- rappelle dans son en-tête. Arthur a décidé l'inverse le 5 novembre 2026 :
-- « au niveau de conversation, je veux voir seulement les conversations que
-- les gens ont avec l'IA ». L'onglet Conversations de l'administration ne
-- montre plus que ça.
--
-- CE QUE ÇA VEUT DIRE EN CLAIR, et ce n'est pas un détail de mise en page :
-- ces messages sont des questions sur des douleurs, des retards, des premières
-- règles, des saignements. Une fille qui écrit à Dambé croit parler à une
-- machine. Elle ne sait pas qu'un humain la relit, et elle n'a rien signé qui
-- le dise. Trois conséquences, qui ne sont pas facultatives :
--
--   1. La politique de confidentialité de Mousso Dambé doit le dire, en
--      français simple, avant la mise en ligne. C'est un sujet pour Juriste,
--      pas un paragraphe à écrire ici.
--   2. Il faut le dire aussi DANS l'application, à l'endroit où elle écrit à
--      Dambé, et pas seulement dans un document que personne n'ouvre.
--   3. Le cycle et le journal, eux, restent fermés. Cette migration ne touche
--      ni `cycles` ni `journal`, et la décision du 12 octobre tient pour eux.
--
-- Tant que les points 1 et 2 ne sont pas faits, cet écran ne doit servir qu'en
-- local, sur des données d'essai.

-- ---------------------------------------------------------------------------
-- La liste : une ligne par fille qui a parlé à Dambé
-- ---------------------------------------------------------------------------
create or replace function public.conversations_ia(p_recherche text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_q text := nullif(btrim(coalesce(p_recherche, '')), '');
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  return jsonb_build_object(
    'ok', true,
    'fils', coalesce((
      select jsonb_agg(jsonb_build_object(
               'profil', f.profil_id,
               'prenom', f.prenom,
               'avatar_fichier', f.avatar_fichier,
               'messages', f.messages,
               -- Ce qu'elle a demandé en dernier. Quand c'est Dambé qui a
               -- ouvert, il n'y a pas de question : on le dit plutôt que de
               -- laisser une ligne vide qu'on prendrait pour un défaut.
               'apercu', coalesce(f.derniere_question, 'Dambé a ouvert la conversation'),
               'quand', f.quand,
               'sans_reponse', f.sans_reponse
             ) order by f.quand desc)
        from (
          select m.profil_id,
                 p.prenom,
                 p.avatar_fichier,
                 count(*) as messages,
                 max(m.cree_le) as quand,
                 count(*) filter (where m.ouvert_par = 'elle' and m.reponse is null) as sans_reponse,
                 (array_remove(array_agg(m.question order by m.cree_le desc), null))[1] as derniere_question
            from public.assistante_messages m
            join public.profils p on p.id = m.profil_id
           where v_q is null
              or p.prenom ilike '%' || v_q || '%'
              or m.question ilike '%' || v_q || '%'
           group by m.profil_id, p.prenom, p.avatar_fichier
           limit 200
        ) f
    ), '[]'::jsonb),
    -- Les chiffres de l'en-tête, comptés sur TOUT, pas sur la recherche.
    'total_fils', (select count(distinct profil_id) from public.assistante_messages),
    'total_messages', (select count(*) from public.assistante_messages where ouvert_par = 'elle')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Un fil : tout ce qu'une fille a demandé, et ce que Dambé a répondu
-- ---------------------------------------------------------------------------
create or replace function public.fil_ia(p_profil uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tete jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select jsonb_build_object(
           'profil', p.id, 'prenom', p.prenom, 'avatar_fichier', p.avatar_fichier,
           'messages', (select count(*) from public.assistante_messages m where m.profil_id = p.id)
         )
    into v_tete
    from public.profils p
   where p.id = p_profil;

  if v_tete is null then
    return jsonb_build_object('ok', false, 'erreur', 'introuvable');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tete', v_tete,
    -- Du plus ancien au plus récent : une conversation se lit dans l'ordre où
    -- elle a eu lieu, pas à l'envers.
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'question', m.question,
               'reponse', m.reponse,
               'produit', m.produit_slug,
               'ouvert_par', m.ouvert_par,
               'cree_le', m.cree_le,
               'repondu_le', m.repondu_le
             ) order by m.cree_le)
        from public.assistante_messages m
       where m.profil_id = p_profil
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.conversations_ia(text) from public, anon, authenticated;
revoke all on function public.fil_ia(uuid) from public, anon, authenticated;
grant execute on function public.conversations_ia(text) to authenticated;
grant execute on function public.fil_ia(uuid) to authenticated;

comment on function public.conversations_ia(text) is
  'Administration : la liste des filles qui ont parlé à IA Dambé. Ne lit ni les cycles ni le journal.';
comment on function public.fil_ia(uuid) is
  'Administration : un échange complet avec IA Dambé. Ne lit ni les cycles ni le journal.';
