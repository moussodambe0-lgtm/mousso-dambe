-- La carte du suivi, et ce qu'il faut en base pour qu'elle ne mente pas.
--
-- Arthur, le 8 novembre 2026, captures de Jia à l'appui : « AU NIVEAU DE SUIVRE
-- MA COMMANDE JE VEUX QUE SA SOIT COMME SA. AVEC UNE VRAI MAPS », puis « les
-- icônes avec en livraison, en préparation, et j'en passe. Si quelqu'un appuie
-- sur ça, ça doit s'afficher comme ça. »
--
-- CECI ANNULE UNE DÉCISION DU 27 OCTOBRE 2026, et c'est lui qui l'annule. Ce
-- jour-là, entre trois propositions, il avait choisi « garder ce qui est fait,
-- le bouton qui ouvre sa carte ». Le commentaire de la page disait : « ne pas
-- la rouvrir sans qu'il la rouvre ». Il l'a rouverte, en montrant à quoi elle
-- doit ressembler.
--
-- LE VRAI TRAVAIL N'EST PAS LA CARTE, C'EST CE QU'ELLE MONTRE. Une carte se
-- dessine en une heure. Mais la position du livreur n'existait nulle part :
-- `suivi_livreur` et `preciser_ma_position` vont toutes les deux dans le même
-- sens, elles donnent la position de la CLIENTE au livreur. L'inverse, le
-- livreur qui partage la sienne pour qu'elle le voie approcher, n'avait ni
-- colonne, ni fonction, ni bouton. Une carte posée sans cela aurait affiché un
-- fond de plan avec un seul point fixe, en promettant un suivi qui n'existe
-- pas. Une carte qui ment est pire que pas de carte.
--
-- MÊME CHOSE POUR LES ÉTAPES. L'écran de Jia écrit « Colis remis au livreur ·
-- 22h06 » et « Commande passée · 10h12 ». Ici, seuls `cree_le` et `livree_le`
-- étaient enregistrés : les deux étapes du milieu n'avaient aucune heure. On
-- les enregistre maintenant, au moment où elles arrivent.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS : elle ne touche pas à `mes_commandes()`.
-- Une autre session travaille dessus le même jour (migration 20261108000000,
-- qui lui ajoute la photo et le slug). Deux redéfinitions de la même fonction,
-- la dernière posée gagne et efface l'autre EN SILENCE. La page de suivi reçoit
-- donc sa propre fonction de lecture, `suivi_de_ma_commande`, et les deux
-- travaux ne se croisent jamais.
--
-- Au passage, cette fonction neuve corrige un gaspillage : la page de suivi
-- appelait `mes_commandes()` et cherchait la bonne avec un `.find()` côté site.
-- Elle chargeait donc les vingt dernières commandes, avec toutes leurs lignes,
-- pour en afficher une seule.

-- ---------------------------------------------------------------------------
-- 1. Les colonnes qui manquaient
-- ---------------------------------------------------------------------------
alter table public.commandes
  -- L'heure des deux étapes du milieu. `cree_le` et `livree_le` existaient
  -- déjà : avec celles-ci, les quatre étapes de l'écran ont toutes une heure.
  add column if not exists preparee_le timestamptz,
  add column if not exists envoyee_le timestamptz,

  -- OÙ EN EST LE LIVREUR. Ces trois colonnes sont les plus sensibles de la
  -- table après l'adresse : elles disent où se trouve une personne réelle.
  -- Trois règles, tenues plus bas par le code et pas par la bonne volonté :
  --   - le livreur les remplit lui-même, en appuyant sur un bouton. Rien ne se
  --     relève dans son dos, et il peut livrer sans jamais appuyer ;
  --   - elles ne sont lisibles que par la cliente de CETTE commande, et
  --     seulement tant que le colis roule ;
  --   - elles sont effacées à l'arrivée, comme le jeton. La course finie, plus
  --     personne n'a à savoir où il était.
  add column if not exists livreur_lat double precision,
  add column if not exists livreur_lng double precision,
  add column if not exists livreur_position_le timestamptz,

  -- LA RÉCEPTION, CONFIRMÉE PAR ELLE. Jusqu'ici, seule la boutique pouvait
  -- marquer une commande livrée. L'écran de Jia donne le geste à la cliente :
  -- « Confirmez avoir reçu votre commande pour la clôturer. »
  add column if not exists recue_confirmee_le timestamptz,
  -- Et l'autre cas, celui qu'on n'aime pas prévoir : « Je n'ai pas reçu ma
  -- commande ». Sans cette porte, elle n'a que le silence ou le téléphone.
  add column if not exists probleme_signale_le timestamptz;

-- RATTRAPAGE POUR LES COMMANDES DÉJÀ PARTIES. Le jeton du livreur naît très
-- exactement au passage à « envoyee » (voir changer_etat_commande) : son heure
-- EST l'heure de l'expédition. On la recopie plutôt que de laisser ces
-- commandes-là sans heure à l'écran.
update public.commandes
   set envoyee_le = livreur_jeton_le
 where envoyee_le is null and livreur_jeton_le is not null;

-- Et pour celles qui sont déjà livrées, l'expédition est forcément antérieure.
-- On ne l'invente pas : on laisse vide. L'écran sait afficher une étape sans
-- heure, il n'affichera pas une heure fausse.

-- ---------------------------------------------------------------------------
-- 2. Chaque changement d'état laisse son heure, et efface ce qui ne sert plus
-- ---------------------------------------------------------------------------
-- Redéfinition de la forme à quatre arguments, celle du 26 octobre 2026. Le
-- raccourci à deux arguments n'est PAS touché : il appelle celle-ci, donc il
-- hérite du changement. Y toucher rouvrirait l'ambiguïté de signature qui avait
-- fait tomber l'espace vendeur ce jour-là.
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

  -- CONFIER LE COLIS, C'EST NOMMER QUELQU'UN. Inchangé depuis le 26 octobre.
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

    v_jeton := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
  end if;

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
         -- Les deux heures neuves. `coalesce` plutôt qu'une écriture sèche :
         -- si la boutique revient en arrière puis repart en avant, on garde la
         -- PREMIÈRE fois, qui est celle que la cliente a vue à l'écran.
         preparee_le = case when v_apres = 'preparee' then coalesce(preparee_le, now()) else preparee_le end,
         envoyee_le = case when v_apres = 'envoyee' then coalesce(envoyee_le, now()) else envoyee_le end,
         livreur_nom = case when v_apres = 'envoyee' then v_nom else livreur_nom end,
         livreur_telephone = case when v_apres = 'envoyee' then v_tel else livreur_telephone end,
         livreur_jeton = case
                           when v_apres = 'envoyee' then v_jeton
                           when v_apres in ('livree', 'annulee') then null
                           else livreur_jeton
                         end,
         livreur_jeton_le = case when v_apres = 'envoyee' then now() else livreur_jeton_le end,
         livreur_vu_le = case when v_apres = 'envoyee' then null else livreur_vu_le end,
         -- LA POSITION DU LIVREUR S'EFFACE À L'ARRIVÉE, exactement comme le
         -- jeton. Une course finie ne doit pas laisser dans la base la trace du
         -- dernier endroit où quelqu'un se trouvait. Elle s'efface aussi au
         -- départ d'une nouvelle course, pour ne pas montrer à la cliente
         -- suivante un point vieux de trois jours.
         livreur_lat = case when v_apres in ('livree', 'annulee', 'envoyee') then null else livreur_lat end,
         livreur_lng = case when v_apres in ('livree', 'annulee', 'envoyee') then null else livreur_lng end,
         livreur_position_le = case when v_apres in ('livree', 'annulee', 'envoyee') then null else livreur_position_le end
   where id = p_id;

  return jsonb_build_object('ok', true, 'etat', v_apres, 'jeton', v_jeton);
end;
$$;
revoke all on function public.changer_etat_commande(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.changer_etat_commande(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le livreur partage sa position, s'il le veut
-- ---------------------------------------------------------------------------
-- Ouverte à `anon`, comme `suivi_livreur`, et pour la même raison : le livreur
-- n'a pas de compte. Le jeton de 48 caractères est l'autorisation.
--
-- CE QUI EMPÊCHE N'IMPORTE QUI D'ÉCRIRE N'IMPORTE OÙ :
--   - il faut le jeton, qui ne se devine pas et qui meurt à l'arrivée ;
--   - il faut passer par le site (`appel_du_site`), donc porter la clé du
--     serveur : un script qui aurait le jeton ne peut pas écrire directement
--     dans la base ;
--   - le point doit tomber dans les bornes du Burkina Faso, comme partout
--     ailleurs ici. Un point au milieu de l'Atlantique n'est pas une position,
--     c'est un capteur qui s'est trompé ;
--   - et la commande doit encore être en route.
create or replace function public.livreur_partage_sa_position(
  p_jeton text,
  p_lat double precision,
  p_lng double precision
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_jeton is null or length(p_jeton) <> 48 then
    return jsonb_build_object('ok', false, 'erreur', 'lien_invalide');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between 9.0 and 15.5 or p_lng not between -6.0 and 2.5 then
    return jsonb_build_object('ok', false, 'erreur', 'position_hors_zone');
  end if;

  select id into v_id
    from public.commandes
   where livreur_jeton = p_jeton
     and etat = 'envoyee'
     and livreur_jeton_le >= now() - interval '48 hours';

  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'lien_invalide');
  end if;

  update public.commandes
     set livreur_lat = p_lat,
         livreur_lng = p_lng,
         livreur_position_le = now()
   where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.livreur_partage_sa_position(text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.livreur_partage_sa_position(text, double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Elle confirme avoir reçu son colis
-- ---------------------------------------------------------------------------
-- « Confirmez avoir reçu votre commande pour la clôturer. Vous pourrez ensuite
-- noter votre achat. »
--
-- CE GESTE CLÔT LA COMMANDE, et il faut mesurer ce que ça veut dire ici : on
-- paie à la livraison, donc confirmer la réception revient à dire « j'ai le
-- colis et j'ai payé ». Elle ne peut le faire que si le colis est parti, et
-- jamais deux fois.
create or replace function public.confirmer_reception(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
  v_etat public.etat_commande;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select id, etat into v_commande, v_etat
    from public.commandes
   where numero = p_numero and profil_id = v_id
   for update;

  if v_commande is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;
  if v_etat = 'livree' then
    -- Déjà clôturée, par elle ou par la boutique. On répond « c'est fait »
    -- plutôt qu'une erreur : appuyer deux fois sur un bouton n'est pas une
    -- faute, et un message d'erreur ferait croire à un problème.
    return jsonb_build_object('ok', true, 'etat', 'livree');
  end if;
  if v_etat <> 'envoyee' then
    return jsonb_build_object('ok', false, 'erreur', 'colis_pas_parti');
  end if;

  update public.commandes
     set etat = 'livree',
         livree_le = coalesce(livree_le, now()),
         recue_confirmee_le = now(),
         probleme_signale_le = null,
         -- La course est finie : le lien du livreur et sa position s'éteignent
         -- dans la seconde, comme ils le feraient si la boutique marquait la
         -- commande livrée elle-même.
         livreur_jeton = null,
         livreur_lat = null,
         livreur_lng = null,
         livreur_position_le = null
   where id = v_commande;

  return jsonb_build_object('ok', true, 'etat', 'livree');
end;
$$;
revoke all on function public.confirmer_reception(text) from public, anon, authenticated;
grant execute on function public.confirmer_reception(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Elle signale qu'elle n'a rien reçu
-- ---------------------------------------------------------------------------
-- L'ÉTAT NE CHANGE PAS, et c'est délibéré. Signaler n'est pas annuler : le
-- colis est peut-être chez la voisine, ou le livreur en bas de l'immeuble. On
-- enregistre l'alerte, on ouvre la discussion avec la boutique, et c'est un
-- humain qui tranche. Une fonction qui annulerait toute seule sur un appui
-- donnerait à n'importe qui le moyen de vider la journée d'Arthur.
create or replace function public.signaler_non_reception(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_commande uuid;
  v_etat public.etat_commande;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select id, etat into v_commande, v_etat
    from public.commandes
   where numero = p_numero and profil_id = v_id
   for update;

  if v_commande is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;
  if v_etat not in ('envoyee', 'livree') then
    return jsonb_build_object('ok', false, 'erreur', 'colis_pas_parti');
  end if;

  update public.commandes
     set probleme_signale_le = now()
   where id = v_commande;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.signaler_non_reception(text) from public, anon, authenticated;
grant execute on function public.signaler_non_reception(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tout ce que la page de suivi doit afficher, en une seule lecture
-- ---------------------------------------------------------------------------
-- UNE COMMANDE, PAS VINGT. La page chargeait les vingt dernières avec toutes
-- leurs lignes pour en afficher une.
--
-- CE QUI N'EST JAMAIS RENDU : le jeton du livreur. Il n'a rien à faire dans
-- l'écran de la cliente, qui n'en a aucun usage. Un secret ne se promène pas
-- dans une page qui n'en a pas besoin.
--
-- CE QUI N'EST RENDU QUE TANT QUE LE COLIS ROULE : la position du livreur. Une
-- fois le colis arrivé, elle est effacée de la base, mais on ferme aussi la
-- porte ici, pour que l'oubli de l'une ne suffise pas à ouvrir l'autre.
create or replace function public.suivi_de_ma_commande(p_numero text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := auth.uid();
  v_c record;
  v_articles jsonb;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;

  select c.id, c.numero, c.etat, c.nom, c.telephone, c.quartier, c.repere,
         c.articles_cfa, c.livraison_cfa, c.total_cfa,
         c.cree_le, c.preparee_le, c.envoyee_le, c.livree_le,
         c.position_lat, c.position_lng,
         c.livreur_nom, c.livreur_telephone,
         c.livreur_lat, c.livreur_lng, c.livreur_position_le,
         c.recue_confirmee_le, c.probleme_signale_le
    into v_c
    from public.commandes c
   where c.numero = p_numero and c.profil_id = v_id;

  -- Un numéro qui n'est pas le sien et un numéro qui n'existe pas donnent la
  -- même réponse : répondre « cette commande n'existe pas » renseignerait
  -- quelqu'un qui essaie des numéros au hasard.
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'commande_inconnue');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nom', cl.nom, 'taille', cl.taille, 'quantite', cl.quantite,
           'total', cl.total_ligne_cfa,
           'image', p.image, 'slug', p.slug) order by cl.nom), '[]'::jsonb)
    into v_articles
    from public.commande_lignes cl
    left join public.produits p on p.id = cl.produit_id
   where cl.commande_id = v_c.id;

  return jsonb_build_object(
    'ok', true,
    'numero', v_c.numero,
    'etat', v_c.etat,
    'nom', v_c.nom,
    'telephone', v_c.telephone,
    'quartier', v_c.quartier,
    'repere', v_c.repere,
    'articles_cfa', v_c.articles_cfa,
    'livraison_cfa', v_c.livraison_cfa,
    'total', v_c.total_cfa,
    'cree_le', v_c.cree_le,
    'preparee_le', v_c.preparee_le,
    'envoyee_le', v_c.envoyee_le,
    'livree_le', v_c.livree_le,
    'lat', v_c.position_lat,
    'lng', v_c.position_lng,
    'livreur_nom', v_c.livreur_nom,
    'livreur_telephone', v_c.livreur_telephone,
    'livreur_lat', case when v_c.etat = 'envoyee' then v_c.livreur_lat else null end,
    'livreur_lng', case when v_c.etat = 'envoyee' then v_c.livreur_lng else null end,
    'livreur_position_le', case when v_c.etat = 'envoyee' then v_c.livreur_position_le else null end,
    'recue_confirmee_le', v_c.recue_confirmee_le,
    'probleme_signale_le', v_c.probleme_signale_le,
    'articles', v_articles
  );
end;
$$;
revoke all on function public.suivi_de_ma_commande(text) from public, anon, authenticated;
grant execute on function public.suivi_de_ma_commande(text) to authenticated;
