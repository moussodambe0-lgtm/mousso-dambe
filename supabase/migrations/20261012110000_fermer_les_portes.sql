-- Correctifs de l'audit de sécurité du 12 octobre 2026 (Cyber).
--
-- Quatre portes refermées, de la plus grave à la moins grave :
--
--   1. appel_du_site() acceptait TOUT tant que l'empreinte de la clé serveur
--      n'était pas déposée. Prouvé sur le banc : un appel direct à l'API, sans
--      aucun en-tête du site, enregistrait un questionnaire, passait une
--      commande et faisait travailler l'assistante.
--
--   2. Les quotas comptaient par adresse IP, et l'adresse est fournie par la
--      visiteuse elle-même (en-tête x-forwarded-for, recopié en x-md-ip).
--      Prouvé : 12 commandes depuis 12 adresses inventées toutes acceptées
--      alors que le plafond est 5 par heure, stock 80 -> 20. Même défaut pour
--      l'assistante : 20 questions là où le plafond est 6 par minute.
--
--   3. Le nom de famille partait vers le service d'IA. passer_commande recopie
--      le nom de livraison dans le prénom du profil quand celui-ci est vide, et
--      le prénom part vers le modèle. Prouvé : « Awa Ouedraogo Sawadogo » dans
--      le contexte envoyé à Ollama.
--
--   4. La séquence des numéros de commande n'avait pas de revoke.
--
-- Aucune base en ligne n'existe : cette migration est écrite et jouée sur le
-- banc PGlite (npm run test:sql), pas appliquée en production.

-- ---------------------------------------------------------------------------
-- 1. La clé du serveur ne se contourne plus par l'oubli
-- ---------------------------------------------------------------------------
-- Le repli est gardé, parce que l'installation doit rester possible : quand
-- Arthur joue du SQL dans l'éditeur du tableau de bord, il n'y a aucun en-tête
-- de requête, et il faut bien pouvoir créer les premières données.
--
-- Mais dès qu'un appel arrive par l'API (PostgREST pose toujours
-- request.headers), empreinte vide veut maintenant dire REFUS. Conséquence à
-- connaître : le jour de la mise en ligne, si l'empreinte n'est pas déposée,
-- l'application refusera d'écrire, avec le message « Cette action n'a pas pu
-- être vérifiée ». Une panne bruyante et réparable en une ligne vaut mieux
-- qu'une base ouverte que personne ne remarque. La ligne à jouer :
--
--   update public.reglages
--      set valeur = encode(sha256(convert_to('LA_VRAIE_CLE', 'UTF8')), 'hex')
--    where cle = 'cle_serveur_sha256';
create or replace function public.appel_du_site()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  attendu text := public.reglage('cle_serveur_sha256');
  entetes text := nullif(current_setting('request.headers', true), '');
  donnee text;
begin
  if attendu is null or attendu = '' then
    -- Pas d'en-têtes du tout : l'appel ne vient pas de l'API, il vient de
    -- l'éditeur SQL ou d'un script d'installation. On accepte.
    -- Des en-têtes, mais pas d'empreinte déposée : on refuse, et ça se voit.
    return entetes is null;
  end if;
  donnee := entetes::jsonb ->> 'x-md-cle';
  if donnee is null then
    return false;
  end if;
  return encode(sha256(convert_to(donnee, 'UTF8')), 'hex') = attendu;
end;
$$;
revoke all on function public.appel_du_site() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Les quotas comptent sur ce que personne ne peut inventer
-- ---------------------------------------------------------------------------
-- quota_ok comptait sur l'adresse IP. Deux défauts, inverses l'un de l'autre :
-- une attaquante changeait d'adresse à chaque requête et n'était jamais
-- freinée ; et au Burkina, où un opérateur fait partager une seule adresse à
-- des milliers d'abonnés, cinq commandes par heure et par adresse bloquaient
-- tout un quartier à la sixième cliente.
--
-- Les deux actions qui coûtent de l'argent exigent déjà un compte connecté :
-- on compte donc sur l'identifiant du compte. Il vient du jeton signé par
-- Supabase, personne ne le choisit. L'ancienne version par adresse reste
-- disponible pour une future action ouverte aux visiteuses sans compte.
create or replace function public.quota_ok_cle(p_cle text, p_action text, p_plafond int, p_duree interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_fenetre timestamptz := date_trunc('minute', now()) - (extract(epoch from date_trunc('minute', now()))::bigint % greatest(1, extract(epoch from p_duree)::bigint)) * interval '1 second';
  v_compteur int;
begin
  insert into public.quotas (cle, action, fenetre, compteur)
  values (coalesce(nullif(p_cle, ''), 'inconnue'), p_action, v_fenetre, 1)
  on conflict (cle, action, fenetre) do update set compteur = public.quotas.compteur + 1
  returning compteur into v_compteur;
  return v_compteur <= p_plafond;
end;
$$;
revoke all on function public.quota_ok_cle(text, text, int, interval) from public, anon, authenticated;

create or replace function public.quota_ok(p_action text, p_plafond int, p_duree interval)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- Par compte quand il y en a un, par adresse sinon. Une attaquante peut
  -- inventer son adresse, jamais l'identifiant que Supabase a signé.
  return public.quota_ok_cle(
    coalesce(auth.uid()::text, public.ip_appelante()),
    p_action, p_plafond, p_duree
  );
end;
$$;
revoke all on function public.quota_ok(text, int, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seul le premier mot du prénom part vers le service d'IA
-- ---------------------------------------------------------------------------
-- Deux verrous, parce qu'un seul se contourne par le prochain chemin
-- d'inscription (le code annonce déjà une connexion par WhatsApp) :
--   a) passer_commande ne recopie plus que le premier mot du nom de livraison ;
--   b) assistante_contexte n'envoie plus que le premier mot du prénom, quoi
--      qu'il y ait dans le profil.
create or replace function public.premier_mot(p_texte text)
returns text language sql immutable as $$
  select left(split_part(regexp_replace(coalesce(p_texte, ''), '[[:space:]]+', ' ', 'g'), ' ', 1), 40)
$$;
revoke all on function public.premier_mot(text) from public, anon, authenticated;

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
    -- Le premier mot seulement : un profil peut contenir un nom complet (compte
    -- créé à la main, commande passée avant le questionnaire), et un
    -- prestataire d'IA n'a aucun besoin de l'identité civile d'une femme pour
    -- conseiller une bouillotte.
    'prenom', public.premier_mot(v_cycle ->> 'prenom'),
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
-- « create or replace » remet les droits par défaut : il faut refermer.
revoke all on function public.assistante_contexte() from public, anon, authenticated;
grant execute on function public.assistante_contexte() to authenticated;

create or replace function public.passer_commande(
  p_panier jsonb, p_nom text, p_telephone text, p_quartier text, p_repere text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
  v_numero text;
  v_article jsonb;
  v_produit public.produits;
  v_quantite int;
  v_taille text;
  v_articles int := 0;
  v_livraison int;
  v_lignes int := 0;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.quota_ok('commande', public.reglage_entier('quota_commande_heure', 5), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'trop_de_commandes');
  end if;
  if p_panier is null or jsonb_typeof(p_panier) <> 'array' or jsonb_array_length(p_panier) = 0 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;
  -- Un panier ne dépasse jamais vingt lignes à l'écran : on le vérifie aussi
  -- ici, pour qu'un appel direct ne fasse pas tourner la base pour rien.
  if jsonb_array_length(p_panier) > 20 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;
  if coalesce(trim(p_nom), '') = '' or coalesce(trim(p_quartier), '') = '' then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;
  -- Un numéro burkinabè a 8 chiffres et commence par 5, 6 ou 7. Le livreur
  -- appelle pour de vrai : un numéro inventé est une livraison perdue.
  if regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g') !~ '^[567][0-9]{7}$' then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  v_livraison := public.reglage_entier('livraison_cfa', 1000);
  v_numero := 'MD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.numero_commande_seq')::text, 5, '0');

  insert into public.commandes (numero, profil_id, nom, telephone, quartier, repere,
                                articles_cfa, livraison_cfa, total_cfa)
  values (v_numero, v_id, left(trim(p_nom), 60),
          regexp_replace(p_telephone, '[^0-9]', '', 'g'),
          left(trim(p_quartier), 60), left(coalesce(trim(p_repere), ''), 120),
          0, v_livraison, 0)
  returning id into v_commande;

  for v_article in select * from jsonb_array_elements(p_panier) loop
    select * into v_produit from public.produits
     where slug = (v_article ->> 'slug') and publie
     for update;
    if v_produit.id is null then
      raise exception 'produit_inconnu';
    end if;

    v_quantite := least(greatest(coalesce((v_article ->> 'quantite')::int, 1), 1), 20);
    if v_produit.stock < v_quantite then
      raise exception 'stock_insuffisant:%', v_produit.nom;
    end if;

    v_taille := nullif(trim(coalesce(v_article ->> 'taille', '')), '');
    -- Une taille qui n'existe pas pour ce produit est refusée : un colis en
    -- XL alors qu'elle a demandé S, c'est un retour et une cliente perdue.
    if array_length(v_produit.tailles, 1) is not null then
      if v_taille is null or not (v_taille = any (v_produit.tailles)) then
        raise exception 'taille_invalide:%', v_produit.nom;
      end if;
    else
      v_taille := null;
    end if;

    insert into public.commande_lignes (commande_id, produit_id, nom, taille, prix_cfa, quantite, total_ligne_cfa)
    values (v_commande, v_produit.id, v_produit.nom, v_taille, v_produit.prix_cfa,
            v_quantite, v_produit.prix_cfa * v_quantite);

    update public.produits set stock = stock - v_quantite where id = v_produit.id;
    v_articles := v_articles + v_produit.prix_cfa * v_quantite;
    v_lignes := v_lignes + 1;
  end loop;

  if v_lignes = 0 then
    raise exception 'panier_vide';
  end if;

  update public.commandes
     set articles_cfa = v_articles, total_cfa = v_articles + v_livraison
   where id = v_commande;

  update public.profils
     set telephone = regexp_replace(p_telephone, '[^0-9]', '', 'g'),
         quartier = left(trim(p_quartier), 60),
         repere = left(coalesce(trim(p_repere), ''), 120),
         -- Le premier mot seulement : le nom donné au livreur est souvent le
         -- nom complet, et ce champ-là part vers le service d'IA.
         prenom = case when prenom = '' then public.premier_mot(p_nom) else prenom end
   where id = v_id;

  return jsonb_build_object('ok', true, 'numero', v_numero, 'total', v_articles + v_livraison);
exception
  when others then
    return jsonb_build_object('ok', false, 'erreur', sqlerrm);
end;
$$;
revoke all on function public.passer_commande(jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.passer_commande(jsonb, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. La séquence des numéros de commande n'est à personne
-- ---------------------------------------------------------------------------
-- Non joignable à travers l'API de Supabase, qui n'expose pas les fonctions
-- internes de Postgres : le risque réel était nul. Refermé pour la règle, parce
-- que « revoke from public » ne suffit jamais dans le schéma public.
revoke all on sequence public.numero_commande_seq from public, anon, authenticated;
