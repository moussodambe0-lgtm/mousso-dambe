-- La mascotte n'est plus proposée comme photo de profil.
--
-- Arthur, le 13 octobre 2026 : « au niveau de la photo de profil, la mascotte
-- de Mousso Dambé ne doit pas être disponible pour qu'on l'utilise comme photo
-- de profil ». Elle reste le visage de l'application (écran d'ouverture,
-- assistante, confirmation de commande) : c'est justement pour ça qu'elle ne
-- doit pas devenir le visage d'une utilisatrice.
--
-- CE QUE ÇA VEUT DIRE AUJOURD'HUI, ET IL FAUT LE SAVOIR : c'était la SEULE
-- image de la galerie. En la retirant, la galerie devient VIDE, et
-- « Ma photo de profil » ne propose plus que « Aucune ». La page continue de
-- marcher et se remplira toute seule le jour où de vraies photos (femmes de la
-- vingtaine, quelques hommes) seront produites : il suffira d'ajouter les
-- fichiers dans `public/avatars/` et une ligne par photo dans cette table,
-- sans toucher au code.

-- D'abord les profils qui l'avaient choisie : la clé étrangère refuserait la
-- suppression, et surtout personne ne doit se retrouver avec une photo cassée.
update public.profils
   set avatar_fichier = null
 where avatar_fichier = 'infirmiere-visage.webp';

delete from public.avatars_disponibles
 where fichier = 'infirmiere-visage.webp';
