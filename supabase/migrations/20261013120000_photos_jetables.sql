-- Les serviettes jetables ont enfin une photo.
--
-- Ce sont les deux produits les moins chers de la boutique, donc
-- probablement ceux qui font le volume, et ils étaient les derniers à montrer
-- un dessin.
--
-- CE QU'ARTHUR SAIT ET A ACCEPTÉ (décision du 13 octobre 2026) : ce ne sont
-- PAS des photos de son paquet. Ce sont deux photos libres (licence Pexels,
-- usage commercial, aucune mention obligatoire), trouvées par Motion, qui
-- montrent le PRODUIT et pas une marque : une serviette dépliée, vue de
-- dessus, sans logo, sans texte d'emballage, sans personne.
--
-- C'est le compromis qu'il a choisi en connaissance de cause, et il tient
-- parce qu'aucune marque n'est montrée : une femme qui reçoit son colis ne
-- découvre pas un autre paquet que celui qu'on lui a vendu, elle découvre
-- simplement l'emballage d'Arthur. Le jour où il photographie son stock, ces
-- deux lignes suffisent à changer les images.
--
-- UNE LIMITE À CONNAÎTRE, dite par Motion et vérifiée : rien sur les photos
-- ne distingue une serviette de nuit d'une serviette de jour. Les deux ont le
-- même gabarit à ailettes, et aucune photo libre d'une serviette nettement
-- plus longue n'était vérifiable. Ce sont donc le NOM et le texte du produit
-- qui portent la différence, pas l'image. Les deux fonds (rose et beige)
-- servent au moins à ne pas confondre les deux cartes dans la grille.
--
-- Provenance et licence : `atelier-motion/images/produits-photos/
-- LICENCE-SERVIETTES.md`. Les fichiers se refabriquent avec
-- `node outils/photos-produits.mjs`.

update public.produits
   set image = '/produits/serviettes-nuit-600.webp'
 where slug = 'serviettes-nuit-10';

update public.produits
   set image = '/produits/serviettes-jour-600.webp'
 where slug = 'serviettes-jour-10';
