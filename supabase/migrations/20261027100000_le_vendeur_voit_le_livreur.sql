-- Le vendeur voit le livreur, et peut retrouver le lien.
--
-- La migration du 26 octobre au soir fait naître le lien du livreur au moment
-- de l'expédition, et `changer_etat_commande` le rend une fois, dans sa
-- réponse. Une fois ne suffit pas : la page du vendeur redirige après l'envoi
-- du formulaire (motif POST-redirect-GET, pour qu'un rechargement ne renvoie
-- pas la commande une seconde fois), et le lien serait perdu avec la réponse.
-- Un lien qu'on ne peut montrer qu'une seule fois est un lien qu'on perd : le
-- vendeur ferme l'onglet, le livreur dit qu'il n'a rien reçu, et il n'y a plus
-- aucun moyen de le lui renvoyer sans refaire tout le circuit.
--
-- `commandes_admin` rend donc maintenant le livreur avec la commande. Le
-- jeton n'est rendu QUE pour une commande en route : livrée ou annulée, il a
-- été effacé de la table, et il n'a plus de raison de traverser le réseau.
--
-- Qui voit cette fonction : les administratrices seulement, et c'est déjà
-- vérifié en tête. Elles ont par ailleurs le nom, le numéro et l'adresse de
-- la cliente sous les yeux : le nom du livreur n'ouvre rien de plus.

create or replace function public.commandes_admin(p_etat text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lignes jsonb;
begin
  if not public.est_admin() then
    return jsonb_build_object('ok', false, 'erreur', 'acces_refuse');
  end if;

  select coalesce(jsonb_agg(l order by l_quand desc), '[]'::jsonb)
    into v_lignes
    from (
      select jsonb_build_object(
               'id', c.id,
               'numero', c.numero,
               'etat', c.etat,
               'nom', c.nom,
               'telephone', c.telephone,
               'quartier', c.quartier,
               'repere', c.repere,
               'position_lat', c.position_lat,
               'position_lng', c.position_lng,
               'total_cfa', c.total_cfa,
               'livraison_cfa', c.livraison_cfa,
               'quand', c.cree_le,
               'livreur_nom', c.livreur_nom,
               'livreur_telephone', c.livreur_telephone,
               -- Seulement tant que la course dure.
               'livreur_jeton', case when c.etat = 'envoyee' then c.livreur_jeton else null end,
               'livreur_vu_le', c.livreur_vu_le,
               'articles', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'nom', cl.nom, 'taille', cl.taille,
                          'quantite', cl.quantite, 'prix_cfa', cl.prix_cfa
                        ) order by cl.nom), '[]'::jsonb)
                   from public.commande_lignes cl where cl.commande_id = c.id
               )
             ) as l,
             c.cree_le as l_quand
        from public.commandes c
       where p_etat is null or p_etat = '' or c.etat::text = p_etat
       order by c.cree_le desc
       limit 100
    ) s;

  return jsonb_build_object(
    'ok', true,
    'commandes', v_lignes,
    'compte', jsonb_build_object(
      'nouvelle', (select count(*) from public.commandes where etat = 'nouvelle'),
      'preparee', (select count(*) from public.commandes where etat = 'preparee'),
      'envoyee', (select count(*) from public.commandes where etat = 'envoyee'),
      'livree', (select count(*) from public.commandes where etat = 'livree'),
      'annulee', (select count(*) from public.commandes where etat = 'annulee')
    )
  );
end;
$$;

revoke all on function public.commandes_admin(text) from public, anon, authenticated;
grant execute on function public.commandes_admin(text) to authenticated;
