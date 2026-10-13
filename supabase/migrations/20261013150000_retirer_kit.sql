-- « Kit premières règles » quitte la boutique.
--
-- Demande d'Arthur du 13 octobre 2026 : « je vois ça dans la boutique,
-- supprime-le ».
--
-- ON NE SUPPRIME PAS LA LIGNE, ON LA DÉPUBLIE, pour les mêmes raisons que
-- pour la culotte rose (voir 20261013110000_retirer_culotte_rose.sql) : une
-- commande déjà passée peut pointer vers lui (`commande_lignes` l'empêche de
-- disparaître, c'est voulu), et le jour où Arthur le veut de nouveau, c'est
-- un `update`, avec son prix, son texte et son stock tels qu'il les avait
-- validés.
--
-- Le catalogue lit déjà `publie = true` partout : le produit disparaît d'un
-- coup de la boutique, de la recherche, de l'accueil et du catalogue donné à
-- l'assistante.
--
-- Pour le remettre :
--   update public.produits set publie = true where slug = 'kit-premieres-regles';

update public.produits
   set publie = false
 where slug = 'kit-premieres-regles';
