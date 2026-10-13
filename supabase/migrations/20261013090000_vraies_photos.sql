-- Les premières VRAIES photos de produits.
--
-- Arthur a livré quatre photos le 13 octobre 2026. Jusqu'ici, la boutique
-- montrait des dessins : une femme qui hésite à acheter une culotte
-- menstruelle veut voir le tissu, la coupe et la doublure, pas une icône.
--
-- CE QUI EST BRANCHÉ ICI, ET SEULEMENT ÇA :
--
--   culotte-flux-abondant  trois culottes à doublure visible, la doublure
--                          grise bien lisible : c'est exactement ce que le
--                          nom du produit annonce.
--   lot-3-culottes         trois culottes menstruelles, noire, bleue et
--                          rouge. Le produit dit « lot de 3 », la photo en
--                          montre trois : ça tombe juste.
--
-- CE QUI N'EST PAS BRANCHÉ, ET POURQUOI. C'est le cœur de ce fichier :
--
--   1. « Culotte menstruelle rose » garde son dessin. Sur la photo des
--      culottes à doublure, la rose est au MILIEU d'une pile : la découper
--      donne une image où l'on voit encore les deux autres. Mettre cette
--      image sur une fiche « culotte rose » ferait croire qu'on en livre
--      trois. Il faut une photo de la rose seule.
--
--   2. Les deux autres photos (quatre culottes en coton texturé, cinq
--      culottes pastel à petit nuage) montrent des culottes ORDINAIRES :
--      pas de doublure, pas d'entrejambe renforcé. Les poser sur une fiche
--      « culotte menstruelle » serait vendre autre chose que ce qu'on
--      montre. Les fichiers sont prêts dans `public/produits/`
--      (`culottes-coton`, `culottes-pastel`) : le jour où Arthur ouvre un
--      rayon de culottes ordinaires, ils sont là.
--
--   3. Les trois produits de serviettes gardent leurs dessins : aucune des
--      quatre photos ne montre une serviette hygiénique. Une photo de
--      culotte sur une fiche « serviettes nuit, 10 pièces » tromperait
--      quelqu'un qui paie à la livraison et découvre le colis devant le
--      livreur.
--
-- Le badge « LeakProof » du fournisseur a été recadré hors de l'image : ce
-- n'est pas notre marque, et une promesse écrite par quelqu'un d'autre n'a
-- rien à faire sur notre fiche. Les fichiers se refabriquent avec
-- `node outils/photos-produits.mjs`.

update public.produits
   set image = '/produits/culotte-flux-abondant-600.webp'
 where slug = 'culotte-flux-abondant';

update public.produits
   set image = '/produits/lot-3-culottes-600.webp'
 where slug = 'lot-3-culottes';
