-- Une vraie photo pour les serviettes lavables.
--
-- Arthur a livré deux photos de serviettes le 13 octobre 2026. Les deux
-- montrent des serviettes LAVABLES : aucune ne montre une serviette jetable.
--
-- CE QUI EST BRANCHÉ :
--
--   serviettes-lavables-3   une serviette posée à plat, où l'on voit le
--                           tissu, la doublure sombre et la pression. Elle ne
--                           montre qu'une pièce, et c'est voulu : le produit
--                           en vend trois, et une photo qui en montre quatre
--                           ferait une promesse que le colis ne tient pas.
--                           Le nom du produit dit le compte, la photo dit la
--                           matière. C'est la règle partout dans la boutique.
--
-- CE QUI NE L'EST PAS, ET POURQUOI :
--
--   1. Les deux produits de serviettes JETABLES (jour et nuit) gardent leurs
--      dessins. Aucune des deux photos ne montre une serviette jetable, et
--      poser une serviette lavable sur une fiche « jetables, 10 pièces »
--      tromperait quelqu'un qui paie à la livraison : il ouvrirait un colis
--      de tissu en attendant un paquet de jetables.
--
--   2. La photo des douze serviettes colorées est prête dans
--      `public/produits/serviettes-lavables-lot-*.webp`, mais elle n'est
--      branchée nulle part : notre produit en vend trois, et celle-ci en
--      montre visiblement plus. Elle attend un produit qui dise la vérité,
--      par exemple un lot de douze.
--
-- Deux retouches faites sur ces photos, et leur raison :
--   - le badge « 12 PCS » du fournisseur est recadré hors de l'image ;
--   - l'étiquette de marque d'un autre fabricant est laissée hors cadre.
-- Un chiffre ou un nom écrits par quelqu'un d'autre n'ont rien à faire sur
-- notre fiche. Les fichiers se refabriquent avec
-- `node outils/photos-produits.mjs`.

update public.produits
   set image = '/produits/serviettes-lavables-600.webp'
 where slug = 'serviettes-lavables-3';
