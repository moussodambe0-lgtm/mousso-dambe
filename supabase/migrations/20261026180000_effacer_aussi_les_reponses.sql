-- « Effacer mes données » efface aussi ce qu'elle avait répondu, et son adresse.
--
-- Audit de Cyber du 26 octobre 2026, complété le même jour par la décision
-- d'Arthur : « tout effacer, commandes comprises ».
--
-- CE QUE LA PAGE PROMET, mot pour mot : « Ton journal, tes cycles, tes
-- questions à Dambé et ta conversation avec le médecin, vocaux compris, seront
-- effacés définitivement. Il n'y a pas de corbeille, rien ne pourra être
-- récupéré. »
--
-- Rejoué sur le banc : le journal part, les cycles partent, le fil de Dambé
-- part, le fil du médecin part, les voix partent, les favoris partent. La
-- promesse est tenue sur tout ce qu'elle nomme. Ce n'est donc PAS une promesse
-- trompée, et c'est important de le dire : Cyber avait d'abord cru le
-- contraire.
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
-- L'ADRESSE ET LA POSITION GPS, la décision d'Arthur
--
-- Son nom de livraison, son téléphone, son quartier, son repère et sa position
-- GPS restaient dans son profil, et une copie complète restait dans chaque
-- commande passée, y compris livrée il y a trois mois. La page ne le promettait
-- pas, donc ce n'était pas un mensonge, mais dans une application où le danger
-- est le téléphone qu'on se passe à la maison, le point GPS du domicile d'une
-- femme gardé pour toujours est la donnée la plus dangereuse du lot, et
-- « Effacer mes données » est le bouton de panique.
--
-- Arthur a tranché le 26 octobre 2026 : tout part, les commandes comprises.
--
-- LA SEULE RÉSERVE, et elle est pratique, pas juridique : une commande encore
-- en route garde son adresse jusqu'à la livraison, sinon le livreur n'a plus
-- où aller et elle perd ce qu'elle a commandé. Elles sont donc comptées et
-- renvoyées dans `livraisons_en_cours`, pour que la page puisse le lui dire au
-- lieu de le taire. Dès qu'une commande passe à « livree » ou « annulee », un
-- nouvel appel au bouton la vide à son tour.

create or replace function public.effacer_mes_donnees()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_en_cours int;
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
  -- Le questionnaire et l'adresse, en une seule écriture. Les valeurs du
  -- questionnaire sont exactement celles par défaut de la table, pour qu'un
  -- profil effacé soit indistinguable d'un profil neuf.
  update public.profils
     set cycle_moyen = 28,
         duree_regles = 5,
         questionnaire_fini = false,
         regularite = 'inconnue',
         ressentis = '{}'::text[],
         objectif = 'suivre',
         protection = 'jetables',
         nom_livraison = null,
         telephone = null,
         quartier = null,
         repere = null,
         position_lat = null,
         position_lng = null
   where id = v_id;
  -- La copie de l'adresse dans les commandes terminées. `nom`, `telephone` et
  -- `quartier` sont déclarées « not null » : elles se vident, elles ne peuvent
  -- pas passer à null.
  update public.commandes
     set nom = '',
         telephone = '',
         quartier = '',
         repere = '',
         position_lat = null,
         position_lng = null
   where profil_id = v_id and etat in ('livree', 'annulee');
  -- Ce qui reste, et pourquoi, pour que la page le dise.
  select count(*) into v_en_cours
    from public.commandes
   where profil_id = v_id and etat in ('nouvelle', 'preparee', 'envoyee');
  return jsonb_build_object('ok', true, 'livraisons_en_cours', v_en_cours);
end;
$$;
revoke all on function public.effacer_mes_donnees() from public, anon, authenticated;
grant execute on function public.effacer_mes_donnees() to authenticated;
