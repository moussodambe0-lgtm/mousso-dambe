-- « Effacer mes données » efface aussi ce qu'elle avait répondu.
--
-- Audit de Cyber du 26 octobre 2026.
--
-- CE QUE LA PAGE PROMET, mot pour mot : « Ton journal, tes cycles, tes
-- questions à Dambé et ta conversation avec le médecin, vocaux compris, seront
-- effacés définitivement. Il n'y a pas de corbeille, rien ne pourra être
-- récupéré. »
--
-- Rejoué sur le banc : le journal part, les cycles partent, le fil de Dambé
-- part, le fil du médecin part, les voix partent, les favoris partent. La
-- promesse est tenue sur tout ce qu'elle nomme. Ce n'est donc PAS une promesse
-- trompée, et c'est important de le dire : j'avais d'abord cru le contraire.
--
-- CE QUI RESTAIT QUAND MÊME, et qui n'a rien à faire là : les réponses du
-- questionnaire, dans la ligne du profil. `questionnaire_fini` repassait bien à
-- faux, mais `regularite`, `ressentis`, `objectif` et `protection` gardaient
-- leurs valeurs. Autrement dit : l'application oubliait qu'elle avait répondu,
-- mais se souvenait de ce qu'elle avait répondu, et le questionnaire se
-- rouvrait pré-rempli avec ses règles irrégulières, ses douleurs et sa
-- protection. C'est intime, ça fait partie de « tes cycles », et « rien ne
-- pourra être récupéré » doit vouloir dire rien.
--
-- CE QUE JE N'AI PAS TOUCHÉ, ET POURQUOI C'EST À ARTHUR DE TRANCHER
--
-- Son nom de livraison, son téléphone, son quartier, son repère et SA POSITION
-- GPS restent dans son profil, et une copie complète de tout cela reste dans
-- chaque commande passée, y compris livrée il y a trois mois. La page ne
-- promet pas de les effacer, donc ce n'est pas un mensonge. Mais dans une
-- application où le danger est le téléphone qu'on se passe à la maison, le
-- point GPS du domicile d'une femme gardé pour toujours est la donnée la plus
-- dangereuse du lot, et « Effacer mes données » est le bouton de panique.
--
-- Deux chemins possibles, et les deux changent ce qu'Arthur voit dans sa
-- gestion, donc je ne les applique pas de moi-même :
--
--   a) effacer l'adresse du profil, et vider nom / téléphone / quartier /
--      repère / position des commandes LIVRÉES ou ANNULÉES seulement (celles
--      en cours en ont besoin pour être livrées) ;
--   b) ne rien changer, et dire sur la page ce qui est gardé et pourquoi.
--
-- Le (a) s'écrit ainsi, le jour où il dit oui :
--
--   update public.profils set telephone = null, quartier = null, repere = null,
--          nom_livraison = null, position_lat = null, position_lng = null
--    where id = v_id;
--   update public.commandes set telephone = '', quartier = '', repere = '',
--          position_lat = null, position_lng = null
--    where profil_id = v_id and etat in ('livree', 'annulee');

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
  delete from public.favoris where profil_id = v_id;
  -- La conversation avec le médecin, en entier (messages et voix).
  delete from public.fils where profil_id = v_id and sujet = 'medecin';
  -- Les VOIX de la conversation avec la boutique, dans les deux sens. Les
  -- messages écrits, eux, restent, comme les commandes.
  delete from public.messages m
   using public.fils f
   where m.fil_id = f.id and f.profil_id = v_id and m.vocal_secondes is not null;
  -- Le questionnaire : l'oubli ET les réponses. Les valeurs posées ici sont
  -- exactement celles par défaut de la table, pour qu'un profil effacé soit
  -- indistinguable d'un profil neuf.
  update public.profils
     set cycle_moyen = 28,
         duree_regles = 5,
         questionnaire_fini = false,
         regularite = 'inconnue',
         ressentis = '{}'::text[],
         objectif = 'suivre',
         protection = 'jetables'
   where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
