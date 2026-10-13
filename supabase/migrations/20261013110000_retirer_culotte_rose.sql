-- « Culotte menstruelle rose » quitte la boutique.
--
-- Décision d'Arthur du 13 octobre 2026, après que je lui ai montré que la
-- photo était impossible : sur la seule image où il y a une culotte rose,
-- elle est la couche du MILIEU d'une pile de trois. Aucun cadrage ne la
-- montre entière sans les deux autres, et une fiche « culotte rose » qui
-- montre une orange et une noire ferait croire qu'on en livre trois.
--
-- Il restait donc trois possibilités : attendre une vraie photo, garder un
-- dessin au milieu de photos, ou retirer le produit. Arthur a choisi de le
-- retirer. Il le remettra quand il aura la photo.
--
-- ON NE SUPPRIME PAS LA LIGNE, ON LA DÉPUBLIE. Trois raisons :
--
--   1. Une commande déjà passée pointe vers ce produit. `commande_lignes`
--      l'empêche d'ailleurs de disparaître (`on delete restrict`), et c'est
--      voulu : une commande d'octobre doit rester lisible en janvier.
--   2. Le jour où Arthur a sa photo, remettre le produit en vente est un
--      `update`, pas un `insert` : le prix, le texte et le stock sont encore
--      là, tels qu'il les a validés.
--   3. Le catalogue lit déjà `publie = true` partout. Il n'y a donc rien
--      d'autre à changer : le produit disparaît de la boutique, de la
--      recherche et de l'accueil d'un coup.
--
-- Pour le remettre, le jour venu :
--   update public.produits set publie = true where slug = 'culotte-rose';

update public.produits
   set publie = false
 where slug = 'culotte-rose';
