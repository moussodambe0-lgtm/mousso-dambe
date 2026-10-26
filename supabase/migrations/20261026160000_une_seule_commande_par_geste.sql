-- Une seule commande par geste, et trois cas limites refermés.
--
-- Audit de Cyber du 26 octobre 2026. Quatre choses dans ce fichier, toutes dans
-- `passer_commande`, et dans cet ordre de gravité.
--
-- 1. DEUX FOIS LE MÊME GESTE, DEUX COMMANDES (point 8 de l'audit du 12 octobre,
--    resté ouvert depuis). Rejoué sur le banc : deux appels identiques à la
--    suite créent deux commandes et retirent le stock DEUX FOIS. Le vecteur
--    n'est pas une attaquante, c'est une 3G de Ouagadougou qui hésite, un
--    double appui sur un bouton, un formulaire que le navigateur réémet. La
--    cliente reçoit deux colis, Arthur en prépare deux, et le stock affiché
--    devient faux.
--
--    La parade : une empreinte du panier ET de l'adresse, un verrou par
--    compte, et un coup d'oeil en arrière. Deux minutes, c'est assez pour couvrir un réseau qui
--    bégaie et trop peu pour gêner une femme qui veut vraiment recommander.
--    Le verrou `pg_advisory_xact_lock` sérialise les commandes d'UN compte :
--    sans lui, deux requêtes parties en même temps passeraient toutes les deux
--    devant le coup d'oeil. Il ne gêne personne d'autre : la clé est
--    l'identifiant du compte.
--
--    La réponse est la MÊME que celle de la première commande (même numéro,
--    même total), avec en plus `rejouee: true`. La page affiche donc la
--    confirmation attendue, et celle qui a appuyé deux fois ne voit rien
--    d'anormal. C'est le but : elle n'a pas à comprendre ce qui s'est passé.
--
-- 2. UNE POSITION HORS DU BURKINA FAISAIT PASSER UNE COMMANDE SANS ADRESSE.
--    Les bornes géographiques étaient vérifiées APRÈS le contrôle « as-tu une
--    adresse ? ». Une femme sans quartier mais avec un point GPS à Paris
--    passait le contrôle (le point comptait), puis le point était jeté : la
--    commande partait avec un quartier vide, aucun repère, aucune position.
--    Rejoué sur le banc : commande acceptée, livreur sans rien. Les bornes
--    passent donc AVANT.
--
-- 3. UN NUMÉRO ÉCRIT AVEC L'INDICATIF DU PAYS ÉTAIT REFUSÉ. « 0022670000000 »
--    et « +22670000000 » sont la façon normale d'écrire son numéro quand on l'a
--    copié depuis WhatsApp. Ils étaient refusés avec « numéro invalide », sans
--    rien expliquer. L'indicatif 226 est maintenant retiré avant le contrôle,
--    et c'est le numéro à huit chiffres qui est rangé en base, comme avant.
--
-- 4. LE MESSAGE D'ERREUR DE POSTGRES NE SORT PLUS DE LA FONCTION. Le
--    rattrapage final renvoyait `sqlerrm` tel quel : une quantité « 1.9 »
--    faisait répondre « invalid input syntax for type integer: "1.9" ».
--    Aujourd'hui `messageErreur` traduit tout code inconnu en « Quelque chose
--    n'a pas marché », donc rien ne fuit à l'écran : ce n'est pas une faille,
--    c'est un piège posé pour plus tard. Seuls les codes que la fonction lève
--    elle-même passent désormais ; le reste devient `erreur_interne`.

-- ---------------------------------------------------------------------------
-- L'empreinte du panier, rangée avec la commande
-- ---------------------------------------------------------------------------
alter table public.commandes
  add column if not exists empreinte_panier text;

comment on column public.commandes.empreinte_panier is
  'Empreinte du panier (produits, tailles, quantites) ET de l''adresse de
   livraison, pour reconnaitre un second envoi du MEME geste et ne pas creer
   une deuxieme commande. Posee par passer_commande, jamais lue par le site.';

create index if not exists commandes_empreinte_idx
  on public.commandes (profil_id, empreinte_panier, cree_le desc);

-- ---------------------------------------------------------------------------
-- L'empreinte elle-même : la base la calcule, l'appelante ne la fournit pas
-- ---------------------------------------------------------------------------
-- Les lignes sont normalisées puis TRIÉES : le même panier envoyé dans un ordre
-- différent donne la même empreinte, parce que c'est le même geste.
--
-- La quantité entre TELLE QU'ELLE EST ÉCRITE, sans être ramenée entre 1 et 20.
-- Essayé dans l'autre sens d'abord, et le test l'a attrapé : en la ramenant,
-- « quantité 1.9 » et « quantité 1 » donnaient la même empreinte, et un panier
-- abîmé se faisait passer pour la commande valide d'avant. Deux envois d'un
-- même panier portent de toute façon exactement le même texte : c'est le même
-- cookie qui part deux fois.
create or replace function public.empreinte_du_panier(p_panier jsonb)
returns text language sql immutable set search_path = public as $$
  select md5(coalesce(string_agg(ligne, '|' order by ligne), ''))
    from (
      select lower(btrim(coalesce(a ->> 'slug', ''))) || ':'
             || lower(coalesce(nullif(btrim(coalesce(a ->> 'taille', '')), ''), '-')) || ':'
             || coalesce(a ->> 'quantite', '-') as ligne
        from jsonb_array_elements(coalesce(p_panier, '[]'::jsonb)) a
    ) d
$$;

revoke all on function public.empreinte_du_panier(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Un numéro du Burkina, écrit comme elle veut
-- ---------------------------------------------------------------------------
-- Rend les huit chiffres, ou NULL si ce n'est pas un numéro d'ici. Un seul
-- endroit pour cette règle : elle était recopiée dans trois fonctions, et
-- trois copies finissent toujours par diverger.
--
-- Ce qui est accepté : « 70 00 00 00 », « 70000000 », « +226 70000000 »,
-- « 0022670000000 ». Ce qui est refusé : huit chiffres qui ne commencent pas
-- par 5, 6 ou 7, et tout ce qui n'a pas la bonne longueur.
create or replace function public.telephone_burkina(p_telephone text)
returns text language sql immutable set search_path = public as $$
  select case
    when regexp_replace(regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g'), '^(00)?226', '')
         ~ '^[567][0-9]{7}$'
    then regexp_replace(regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g'), '^(00)?226', '')
    else null
  end
$$;

revoke all on function public.telephone_burkina(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Passer commande
-- ---------------------------------------------------------------------------
create or replace function public.passer_commande(
  p_panier jsonb,
  p_nom text,
  p_telephone text,
  p_quartier text,
  p_repere text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_garder boolean default true
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
  v_a_position boolean := p_lat is not null and p_lng is not null;
  v_empreinte text;
  v_deja public.commandes;
  v_telephone text;
begin
  if v_id is null then
    return jsonb_build_object('ok', false, 'erreur', 'connexion_requise');
  end if;
  if not public.appel_du_site() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;
  if p_panier is null or jsonb_typeof(p_panier) <> 'array' or jsonb_array_length(p_panier) = 0 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;
  if jsonb_array_length(p_panier) > 20 then
    return jsonb_build_object('ok', false, 'erreur', 'panier_vide');
  end if;

  -- Des coordonnées hors du Burkina ne veulent rien dire pour un livreur à
  -- Ouaga : plutôt les ignorer que tromper qui prépare la course. AVANT le
  -- contrôle de l'adresse, sinon une position fausse fait passer une commande
  -- qui n'a plus ni quartier ni point (Cyber, 26 octobre 2026).
  if v_a_position and (p_lat < 9 or p_lat > 15 or p_lng < -6 or p_lng > 3) then
    v_a_position := false;
    p_lat := null;
    p_lng := null;
  end if;

  -- L'adresse est incomplète seulement si elle n'a NI quartier NI position :
  -- partager sa position suffit, comme le quartier suffisait avant.
  if coalesce(trim(p_nom), '') = '' or (coalesce(trim(p_quartier), '') = '' and not v_a_position) then
    return jsonb_build_object('ok', false, 'erreur', 'adresse_incomplete');
  end if;

  -- Le numéro, écrit comme elle veut : avec des espaces, avec « +226 », avec
  -- « 00226 ». On garde les huit chiffres du Burkina.
  v_telephone := public.telephone_burkina(p_telephone);
  if v_telephone is null then
    return jsonb_build_object('ok', false, 'erreur', 'telephone_invalide');
  end if;

  -- LE VERROU, puis LE COUP D'OEIL EN ARRIÈRE.
  --
  -- Ici, et pas plus haut : le test a montré qu'un coup d'oeil posé avant la
  -- validation rendait la commande d'avant à un second envoi dont l'adresse
  -- était DIFFÉRENTE, voire invalide. Une femme qui corrige son quartier et
  -- renvoie le même panier aurait reçu « c'est déjà commandé », avec l'ancienne
  -- adresse, sans rien comprendre.
  --
  -- L'empreinte comprend donc le panier ET l'adresse de livraison : deux envois
  -- se confondent seulement s'ils demandent exactement la même chose, au même
  -- endroit. Le numéro de téléphone y entre sous sa forme normalisée, sinon
  -- « 70000000 » et « +226 70000000 » compteraient pour deux gestes.
  --
  -- Avant le quota : un second envoi du même geste ne doit pas consommer une
  -- commande du plafond horaire, sinon cinq doubles appuis fermeraient la
  -- boutique à une cliente pour une heure.
  --
  -- Le verrou `pg_advisory_xact_lock` sérialise les commandes d'UN compte :
  -- sans lui, deux requêtes parties en même temps passeraient toutes les deux
  -- devant le coup d'oeil. Il ne gêne personne d'autre, la clé est le compte.
  v_empreinte := md5(
    public.empreinte_du_panier(p_panier) || '|'
    || left(trim(p_nom), 60) || '|' || v_telephone || '|'
    || left(coalesce(trim(p_quartier), ''), 60) || '|'
    || left(coalesce(trim(p_repere), ''), 120) || '|'
    || coalesce(p_lat::text, '-') || '|' || coalesce(p_lng::text, '-')
  );

  perform pg_advisory_xact_lock(hashtextextended(v_id::text, 0));

  select * into v_deja from public.commandes
   where profil_id = v_id
     and empreinte_panier = v_empreinte
     and etat = 'nouvelle'
     and cree_le > now() - interval '2 minutes'
   order by cree_le desc
   limit 1;

  if v_deja.id is not null then
    -- Le même geste, deux fois. On rend la première commande, pas une
    -- deuxième. Rien n'est écrit, rien n'est retiré du stock.
    return jsonb_build_object(
      'ok', true, 'numero', v_deja.numero, 'total', v_deja.total_cfa, 'rejouee', true
    );
  end if;

  if not public.quota_ok('commande', public.reglage_entier('quota_commande_heure', 5), interval '1 hour') then
    return jsonb_build_object('ok', false, 'erreur', 'trop_de_commandes');
  end if;

  v_livraison := public.reglage_entier('livraison_cfa', 1000);
  v_numero := 'MD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.numero_commande_seq')::text, 5, '0');

  insert into public.commandes (numero, profil_id, nom, telephone, quartier, repere,
                                position_lat, position_lng, articles_cfa, livraison_cfa, total_cfa,
                                empreinte_panier)
  values (v_numero, v_id, left(trim(p_nom), 60),
          v_telephone,
          left(coalesce(trim(p_quartier), ''), 60), left(coalesce(trim(p_repere), ''), 120),
          p_lat, p_lng,
          0, v_livraison, 0, v_empreinte)
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

  -- « Garder cette adresse dans mon compte » : coché par défaut, comme le
  -- comportement d'avant ce fichier. Décochée, la commande part quand même,
  -- mais rien n'est gardé pour la suivante.
  if p_garder then
    update public.profils
       set telephone = v_telephone,
           quartier = left(coalesce(trim(p_quartier), ''), 60),
           repere = left(coalesce(trim(p_repere), ''), 120),
           nom_livraison = left(trim(p_nom), 60),
           position_lat = p_lat,
           position_lng = p_lng,
           prenom = case when prenom = '' then public.premier_mot(p_nom) else prenom end
     where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'numero', v_numero, 'total', v_articles + v_livraison);
exception
  -- Seuls les codes que cette fonction lève elle-même sortent d'ici. Tout le
  -- reste devient « erreur_interne » : un message de Postgres n'a rien à faire
  -- dans une réponse qu'une page pourrait un jour afficher telle quelle.
  when others then
    if sqlerrm ~ '^(produit_inconnu|panier_vide|stock_insuffisant:|taille_invalide:)' then
      return jsonb_build_object('ok', false, 'erreur', sqlerrm);
    end if;
    return jsonb_build_object('ok', false, 'erreur', 'erreur_interne');
end;
$$;

revoke all on function public.passer_commande(jsonb, text, text, text, text, double precision, double precision, boolean)
  from public, anon, authenticated;
grant execute on function public.passer_commande(jsonb, text, text, text, text, double precision, double precision, boolean)
  to authenticated;
