-- Le livreur, et le lien qui lui montre où aller.
--
-- Arthur, le 26 octobre 2026 : « au niveau de l'espace administrateur, avant de
-- marquer expédier, il faut mettre le nom du livreur et le numéro du livreur,
-- de sorte que lorsque la personne va taper marquer expédier, ça va générer un
-- lien. Et on envoie le lien au livreur. Et lorsque le livreur clique sur le
-- lien, il peut suivre directement la localisation de la personne. »
--
-- CE QUE CE LIEN DONNE, ET CE QU'IL NE DONNE PAS
--
-- Il donne accès à l'adresse et au point GPS du domicile d'une femme, à qui
-- l'a entre les mains. Dans n'importe quelle application ce serait déjà
-- sérieux ; dans celle-ci, où la même base contient son journal intime et ses
-- questions de santé, c'est la décision la plus lourde de la journée. Le lien
-- est donc taillé au plus juste :
--
--   - il ne montre QUE ce qu'il faut pour livrer : le nom donné au livreur, le
--     numéro, le quartier, le point de repère, le point GPS, les articles et la
--     somme à encaisser. Jamais le prénom de l'application, jamais le cycle,
--     jamais le journal, jamais les conversations, jamais les autres commandes.
--     `suivi_livreur()` ne lit que deux tables, et elle les nomme ;
--   - il ne répond QUE tant que la commande est « envoyee ». Livrée ou annulée,
--     le lien devient muet dans la seconde, sans que personne ait à y penser ;
--   - il meurt aussi tout seul au bout de 48 heures, parce qu'un colis qui
--     traîne ne doit pas laisser une adresse accessible indéfiniment ;
--   - le jeton fait 48 caractères tirés au hasard par la base : il ne se
--     devine pas, et il n'est dérivé ni du numéro de commande ni de rien
--     d'autre qui se calcule ;
--   - il est jeté quand la commande est livrée, pour ne pas garder une clé
--     dormante vers une adresse.
--
-- Ce qui reste vrai et qu'il faut dire sans l'enjoliver : qui reçoit le lien
-- peut le faire suivre. C'est le cas de tout lien partagé. Les trois garde-fous
-- ci-dessus limitent la fenêtre et le contenu, ils ne suppriment pas ce risque.
-- La page du livreur le dit à la femme sur son écran de suivi : elle voit le
-- nom et le numéro de qui a reçu son adresse.

-- ---------------------------------------------------------------------------
-- 1. Les colonnes du livreur
-- ---------------------------------------------------------------------------
alter table public.commandes
  add column if not exists livreur_nom text,
  add column if not exists livreur_telephone text,
  add column if not exists livreur_jeton text,
  add column if not exists livreur_jeton_le timestamptz,
  -- La première fois que le lien a été ouvert. Sert à répondre à « est-ce que
  -- le livreur a seulement regardé ? », une question que la boutique se pose.
  add column if not exists livreur_vu_le timestamptz;

create unique index if not exists commandes_livreur_jeton_idx
  on public.commandes (livreur_jeton) where livreur_jeton is not null;

-- ---------------------------------------------------------------------------
-- 2. Marquer « expédié » exige un livreur, et fabrique le lien
-- ---------------------------------------------------------------------------
-- DEUX SIGNATURES, ET C'EST VOULU. Ajouter des paramètres à une fonction en
-- crée une deuxième à côté de la première : Postgres garde les deux. Le
-- réflexe serait de supprimer l'ancienne, et ce serait une panne.
--
-- Une migration et un déploiement ne sont jamais simultanés. Supprimer
-- l'ancienne signature casserait l'espace vendeur en ligne entre les deux :
-- le code déjà déployé appelle encore la version à deux arguments, et elle
-- n'existerait plus. Dans l'autre ordre, le nouveau code appellerait une
-- fonction à quatre arguments pas encore créée. Il n'y a pas d'ordre sûr : il
-- faut que les deux formes répondent pendant la bascule.
--
-- L'ancienne devient donc un raccourci vers la nouvelle, exactement comme
-- `enregistrer_questionnaire` depuis le 12 octobre. Et elle n'ouvre aucune
-- porte dérobée : appelée avec deux arguments pour expédier, elle passe `null`
-- comme livreur, et la nouvelle refuse. On ne peut toujours pas confier un
-- colis sans dire à qui.

-- PAS DE « default null » SUR CES DEUX PARAMÈTRES, et c'est le test qui l'a
-- appris : avec des valeurs par défaut, un appel à deux arguments peut aller
-- vers l'une OU l'autre des deux fonctions, et Postgres refuse de choisir
-- (« could not choose a best candidate function »). L'espace vendeur serait
-- tombé en production, à la bascule, sur une erreur que rien n'annonce.
-- Quatre arguments exigés ici, deux dans le raccourci : aucune ambiguïté.
create or replace function public.changer_etat_commande(
  p_id uuid,
  p_etat text,
  p_livreur_nom text,
  p_livreur_telephone text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_avant public.etat_commande;
  v_apres public.etat_commande;
  v_nom text;
  v_tel text;
  v_jeton text;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  if p_etat is null or p_etat not in ('nouvelle', 'preparee', 'envoyee', 'livree', 'annulee') then
    return jsonb_build_object('ok', false, 'erreur', 'etat_inconnu');
  end if;
  v_apres := p_etat::public.etat_commande;

  select etat into v_avant from public.commandes where id = p_id for update;
  if v_avant is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;
  if v_avant = v_apres then
    return jsonb_build_object('ok', true, 'etat', v_apres);
  end if;

  -- CONFIER LE COLIS, C'EST NOMMER QUELQU'UN. Passer à « envoyee » sans dire à
  -- qui laisserait une femme attendre une personne dont elle ignore le nom, et
  -- ouvrirait son adresse à un lien que personne n'assume. Les deux champs sont
  -- donc exigés, et le numéro est validé comme celui d'une cliente.
  if v_apres = 'envoyee' then
    v_nom := nullif(btrim(coalesce(p_livreur_nom, '')), '');
    if v_nom is null then
      return jsonb_build_object('ok', false, 'erreur', 'livreur_nom_manquant');
    end if;
    v_nom := left(v_nom, 80);

    v_tel := public.telephone_burkina(p_livreur_telephone);
    if v_tel is null then
      return jsonb_build_object('ok', false, 'erreur', 'livreur_telephone_invalide');
    end if;

    -- Deux UUID tires au hasard par la base, colles et debarrasses de leurs
    -- tirets, dont on garde 48 caracteres : 192 bits, et aucune extension a
    -- installer. `gen_random_bytes` aurait ete plus direct, mais il vient de
    -- pgcrypto, que le banc local (PGlite) n'a pas : une protection qu'on ne
    -- peut pas rejouer sur le banc est une protection qu'on ne verifie jamais.
    v_jeton := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
  end if;

  -- On rend le stock en annulant, on le reprend si on dé-annule.
  if v_apres = 'annulee' and v_avant <> 'annulee' then
    update public.produits p
       set stock = p.stock + cl.quantite
      from public.commande_lignes cl
     where cl.commande_id = p_id and cl.produit_id = p.id;
  elsif v_avant = 'annulee' and v_apres <> 'annulee' then
    update public.produits p
       set stock = greatest(0, p.stock - cl.quantite)
      from public.commande_lignes cl
     where cl.commande_id = p_id and cl.produit_id = p.id;
  end if;

  update public.commandes
     set etat = v_apres,
         livree_le = case when v_apres = 'livree' then now() else livree_le end,
         livreur_nom = case when v_apres = 'envoyee' then v_nom else livreur_nom end,
         livreur_telephone = case when v_apres = 'envoyee' then v_tel else livreur_telephone end,
         -- Le jeton naît à l'expédition et meurt à l'arrivée : une clé qui ne
         -- sert plus ne doit pas rester dans un tiroir.
         livreur_jeton = case
                           when v_apres = 'envoyee' then v_jeton
                           when v_apres in ('livree', 'annulee') then null
                           else livreur_jeton
                         end,
         livreur_jeton_le = case when v_apres = 'envoyee' then now() else livreur_jeton_le end,
         livreur_vu_le = case when v_apres = 'envoyee' then null else livreur_vu_le end
   where id = p_id;

  return jsonb_build_object('ok', true, 'etat', v_apres, 'jeton', v_jeton);
end;
$$;
revoke all on function public.changer_etat_commande(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.changer_etat_commande(uuid, text, text, text) to authenticated;

-- Le raccourci à deux arguments, pour le code déjà déployé. Il disparaîtra
-- quand plus rien ne l'appellera ; en attendant, il ne décide de rien.
create or replace function public.changer_etat_commande(p_id uuid, p_etat text)
returns jsonb language sql security definer set search_path = public as $$
  select public.changer_etat_commande(p_id, p_etat, null, null)
$$;
revoke all on function public.changer_etat_commande(uuid, text) from public, anon, authenticated;
grant execute on function public.changer_etat_commande(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ce que le livreur voit, et rien d'autre
-- ---------------------------------------------------------------------------
-- Ouverte à `anon` : le livreur n'a pas de compte, et lui en demander un le
-- jour d'une course serait le meilleur moyen qu'il n'ouvre jamais le lien. Le
-- jeton EST l'autorisation, c'est pourquoi il est taillé comme ci-dessus.
create or replace function public.suivi_livreur(p_jeton text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_articles jsonb;
begin
  if p_jeton is null or length(p_jeton) <> 48 then
    return jsonb_build_object('ok', false, 'erreur', 'lien_invalide');
  end if;

  select c.id, c.numero, c.etat, c.nom, c.telephone, c.quartier, c.repere,
         c.position_lat, c.position_lng, c.total_cfa, c.cree_le, c.livreur_nom
    into v_c
    from public.commandes c
   where c.livreur_jeton = p_jeton;

  if v_c.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'lien_invalide');
  end if;
  -- Livrée ou annulée : le lien ne répond plus. Le jeton est d'ailleurs effacé
  -- par `changer_etat_commande`, ce contrôle est la deuxième serrure.
  if v_c.etat <> 'envoyee' then
    return jsonb_build_object('ok', false, 'erreur', 'course_terminee');
  end if;
  -- Et il ne vit pas plus de deux jours, même si personne ne touche à rien.
  if exists (
    select 1 from public.commandes
     where id = v_c.id and livreur_jeton_le < now() - interval '48 hours'
  ) then
    return jsonb_build_object('ok', false, 'erreur', 'lien_expire');
  end if;

  update public.commandes
     set livreur_vu_le = coalesce(livreur_vu_le, now())
   where id = v_c.id;

  -- Ce que le livreur doit porter, sans les prix unitaires : il encaisse un
  -- total, il n'a pas à connaître la marge de la boutique.
  select coalesce(jsonb_agg(jsonb_build_object('nom', cl.nom, 'quantite', cl.quantite) order by cl.nom), '[]'::jsonb)
    into v_articles
    from public.commande_lignes cl
   where cl.commande_id = v_c.id;

  return jsonb_build_object(
    'ok', true,
    'numero', v_c.numero,
    'nom', v_c.nom,
    'telephone', v_c.telephone,
    'quartier', v_c.quartier,
    'repere', v_c.repere,
    'lat', v_c.position_lat,
    'lng', v_c.position_lng,
    'total_cfa', v_c.total_cfa,
    'articles', v_articles,
    'livreur_nom', v_c.livreur_nom
  );
end;
$$;
revoke all on function public.suivi_livreur(text) from public, anon, authenticated;
grant execute on function public.suivi_livreur(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Elle peut (re)donner son point, même après avoir commandé
-- ---------------------------------------------------------------------------
-- Arthur : « la personne peut toujours envoyer sa localisation ». Le cas est
-- réel : elle commande depuis le marché, et c'est chez elle qu'il faut livrer.
-- Le point va dans LA COMMANDE en cours, et dans son profil pour la prochaine
-- fois. Seules les commandes encore en route sont touchées : une commande déjà
-- livrée est une archive, elle ne se réécrit pas.
create or replace function public.preciser_ma_position(
  p_numero text,
  p_lat double precision,
  p_lng double precision
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  -- Les bornes du Burkina Faso, comme dans `passer_commande` : un point au
  -- milieu de l'Atlantique n'est pas une adresse, c'est une erreur de capteur.
  if p_lat is null or p_lng is null
     or p_lat not between 9.0 and 15.5 or p_lng not between -6.0 and 2.5 then
    return jsonb_build_object('ok', false, 'erreur', 'position_hors_zone');
  end if;

  select id into v_commande
    from public.commandes
   where numero = p_numero and profil_id = v_id and etat in ('nouvelle', 'preparee', 'envoyee');
  if v_commande is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;

  update public.commandes
     set position_lat = p_lat, position_lng = p_lng
   where id = v_commande;

  update public.profils
     set position_lat = p_lat, position_lng = p_lng
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.preciser_ma_position(text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.preciser_ma_position(text, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sa liste de commandes dit maintenant qui porte son colis
-- ---------------------------------------------------------------------------
-- Elle doit voir le nom et le numéro de la personne qui a son adresse : c'est
-- ce qui transforme « quelqu'un va venir » en « Issa va venir, et voici son
-- numéro ». C'est aussi la contrepartie honnête du lien : elle sait à qui son
-- adresse a été confiée, et elle peut appeler.
create or replace function public.mes_commandes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(ligne order by cree_le desc), '[]'::jsonb) from (
    select c.cree_le,
           jsonb_build_object(
             'numero', c.numero, 'etat', c.etat, 'total', c.total_cfa,
             'cree_le', c.cree_le, 'quartier', c.quartier,
             'repere', c.repere, 'livree_le', c.livree_le,
             'lat', c.position_lat, 'lng', c.position_lng,
             'livreur_nom', c.livreur_nom,
             'livreur_telephone', c.livreur_telephone,
             -- JAMAIS le jeton : il n'a rien à faire dans la page de la
             -- cliente, qui n'en a aucun usage. Un secret ne se promène pas
             -- dans un écran qui n'en a pas besoin.
             'articles', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'nom', l.nom, 'taille', l.taille,
                        'quantite', l.quantite, 'total', l.total_ligne_cfa)), '[]'::jsonb)
                 from public.commande_lignes l where l.commande_id = c.id
             )
           ) as ligne
      from public.commandes c
     where c.profil_id = auth.uid()
     order by c.cree_le desc
     limit 20
  ) t
$$;
revoke all on function public.mes_commandes() from public, anon, authenticated;
grant execute on function public.mes_commandes() to authenticated;
