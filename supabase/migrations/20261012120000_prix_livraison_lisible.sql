-- Le prix de la livraison, lisible par le site.
--
-- Relevé par l'audit du 12 octobre 2026 (point 15) : trois pages écrivaient
-- `const LIVRAISON = 1000` en dur, alors que la base relit le réglage
-- `livraison_cfa` au moment de la commande. Le jour où Arthur change ce prix
-- dans la base, l'écran annonce un total et la base en calcule un autre. Le
-- paiement étant à la livraison, personne n'est volé : la cliente découvre un
-- autre prix à la remise du colis, et refuse. C'est une vente perdue.
--
-- On ouvre donc UNE valeur, et une seule. La table des réglages reste fermée
-- (elle contient l'empreinte de la clé du serveur), et cette fonction ne sait
-- rien dire d'autre que le prix de la livraison.

create or replace function public.prix_livraison()
returns int language sql stable security definer set search_path = public as $$
  select public.reglage_entier('livraison_cfa', 1000)
$$;

revoke all on function public.prix_livraison() from public, anon, authenticated;
grant execute on function public.prix_livraison() to anon, authenticated;

comment on function public.prix_livraison() is
  'Le prix de la livraison, affiché par le site. Seule valeur des réglages ouverte en lecture.';
