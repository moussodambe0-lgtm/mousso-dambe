-- Sans accord, on ne lit pas : l'écran des conversations ne montre que les
-- fils des femmes qui ont dit oui.
--
-- POURQUOI CETTE MIGRATION EXISTE, ET POURQUOI ELLE N'EST PAS UN DÉTAIL.
--
-- Le 5 novembre 2026, `conversations_ia()` et `fil_ia()` ont ouvert à Arthur
-- les discussions des clientes avec Dambé. Le 6 novembre, l'accord exprès a
-- été posé dans l'application. Entre les deux il manquait la seule chose qui
-- relie l'un à l'autre : que l'accord serve réellement de serrure.
--
-- L'article 26 de la loi n°037-2026/ALP : « Il est interdit de collecter ou de
-- traiter, sans le consentement exprès de la personne concernée, les données
-- qui révèlent la vie sexuelle, la santé, les mœurs. » L'article 5 range LA
-- CONSULTATION parmi les traitements. Ouvrir le fil d'une femme qui n'a pas
-- dit oui n'est donc pas une imprudence : c'est l'acte que la loi interdit.
--
-- Un formulaire d'accord qui n'empêche rien n'est pas un accord, c'est un
-- décor. La serrure est ici, dans la base, et pas dans l'écran : un écran se
-- contourne, une fonction qui ne rend pas la ligne, non.
--
-- CE QUE ÇA CHANGE POUR ARTHUR, ET IL FAUT LE DIRE FRANCHEMENT. Les
-- discussions qui existaient avant le 6 novembre 2026 ont eu lieu sans accord.
-- Elles disparaissent de l'écran, et c'est le résultat correct : on n'avait
-- pas le droit de les lire. Elles ne sont pas effacées, elles ne sont plus
-- consultables. Elles réapparaîtront une à une, à mesure que chaque femme
-- ouvrira Dambé et donnera son accord avant sa question suivante.
--
-- Un accord retiré referme le fil le jour même, sans rien effacer : la table
-- des consentements garde le oui, le non, et leurs dates (art. 17).
--
-- CE QUI NE CHANGE PAS, ET C'EST VOULU. Les deux fonctions gardent EXACTEMENT
-- la forme qu'elles avaient : mêmes clés, mêmes noms de champs, même mot
-- d'erreur `acces_refuse`. Les écrans qui les lisent n'ont rien à apprendre.
-- On n'ajoute qu'une condition, et un seul champ nouveau.

create or replace function public.a_accepte_dambe(p_profil uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from (
      select distinct on (c.profil) c.accorde
        from public.consentements c
       where c.objet = 'assistante' and c.profil = p_profil
       order by c.profil, c.le desc
    ) dernier
    where dernier.accorde
  )
$$;

comment on function public.a_accepte_dambe(uuid) is
  'A-t-elle accepté que ses échanges avec Dambé soient relus, sans être revenue dessus ? (art. 26 loi n°037-2026/ALP)';

grant execute on function public.a_accepte_dambe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La liste : une ligne par fille qui a parlé à Dambé ET qui a donné son accord
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
           -- LA SERRURE, et c'est la seule ligne ajoutée à la requête.
           where public.a_accepte_dambe(m.profil_id)
             and (v_q is null
              or p.prenom ilike '%' || v_q || '%'
              or m.question ilike '%' || v_q || '%')
           group by m.profil_id, p.prenom, p.avatar_fichier
           limit 200
        ) f
    ), '[]'::jsonb),
    -- Les chiffres de l'en-tête, comptés sur TOUT, pas sur la recherche.
    'total_fils', (
      select count(distinct profil_id) from public.assistante_messages
       where public.a_accepte_dambe(profil_id)
    ),
    'total_messages', (
      select count(*) from public.assistante_messages
       where ouvert_par = 'elle' and public.a_accepte_dambe(profil_id)
    ),
    -- LE SEUL CHAMP NOUVEAU. Combien de fils existent et ne sont pas lisibles,
    -- faute d'accord. Un nombre, jamais un prénom ni un identifiant : Arthur
    -- doit pouvoir constater que la serrure travaille, sans que ce constat
    -- lui apprenne quoi que ce soit sur celles qu'elle protège.
    'fermes_faute_accord', (
      select count(distinct profil_id) from public.assistante_messages
       where not public.a_accepte_dambe(profil_id)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Un échange complet, et seulement s'il est ouvert par un accord
-- ---------------------------------------------------------------------------
create or replace function public.fil_ia(p_profil uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tete jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  -- Le refus est nommé plutôt que muet, et il passe AVANT toute lecture :
  -- Arthur doit savoir qu'un fil existe et qu'il n'a pas le droit de l'ouvrir,
  -- pas croire à un défaut de l'écran. Et rien n'est lu entre-temps.
  if not public.a_accepte_dambe(p_profil) then
    return jsonb_build_object('ok', false, 'erreur', 'sans_accord');
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
