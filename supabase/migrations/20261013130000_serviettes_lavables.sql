-- Les serviettes de nuit et de jour deviennent des LAVABLES.
--
-- Décision d'Arthur du 13 octobre 2026, après que je lui ai montré la
-- contradiction : il m'a demandé de mettre ses photos de serviettes lavables
-- sur « Serviettes nuit » et « Serviettes jour », alors que le texte de ces
-- deux produits décrivait des JETABLES (« bande adhésive qui ne glisse pas »)
-- et que la base les marquait non réutilisables.
--
-- Une photo de pressions sur une fiche qui promet de l'adhésif, c'est la
-- fiche qui ment, pas la photo. Je lui ai posé la question : il vend des
-- lavables, et seulement des lavables. On convertit donc les produits, pas
-- seulement les images.
--
-- CE QUI CHANGE, ET POURQUOI CHAQUE CHOSE :
--
--   1. `reutilisable` passe à vrai. La fiche produit affiche alors le bloc
--      « Réutilisable deux ans si tu la laves à la main », qui était caché.
--
--   2. Le texte est réécrit : pressions au lieu d'adhésif, rinçage et lavage,
--      durée de vie. Une femme qui paie à la livraison doit savoir qu'elle
--      recevra du tissu à laver, pas un paquet à jeter.
--
--   3. « 10 pièces » DISPARAÎT DU NOM. C'est le point le plus important de
--      cette migration : 1500 FCFA pour dix serviettes lavables est
--      impossible, c'est un prix de jetables. Garder « 10 pièces » à ce prix
--      ferait attendre dix pièces à qui en recevrait une. Les noms passent au
--      singulier, et les prix ne bougent pas : ils restent à valider par
--      Arthur, comme tout le catalogue, qui est un exemple que j'ai écrit.
--
--   4. Les photos sont les siennes, dans des cadrages qui laissent hors champ
--      l'étiquette d'un autre fabricant, visible sur le produit lui-même.
--      C'est son choix du 13 octobre : « je garde les cadrages qui l'évitent ».
--
-- CE QUI RESTE À RÉGLER AVEC LUI, et qui n'est pas de mon ressort :
--   - les prix (1500, 1000, 6500 sont des exemples) ;
--   - « Serviettes lavables, 3 pièces » à 6500 coûte plus cher que trois
--     serviettes seules à 1500 et 1000 : un lot doit faire économiser, sinon
--     personne ne le prend ;
--   - le rayon « Lavables » n'a plus de sens maintenant que TOUTES les
--     serviettes le sont. Je ne touche pas aux rayons sans sa décision :
--     ça change les filtres de la boutique.

update public.produits
   set nom = 'Serviette lavable nuit',
       resume = 'Longue, pour dormir tranquille, et elle se relave',
       description = 'Une serviette lavable longue, qui se ferme sous la culotte par deux pressions. '
                     || 'Plus longue à l''arrière, elle tient quand tu bouges en dormant. '
                     || 'Tu la rinces à l''eau froide, tu la laves au savon, elle sèche en une nuit. '
                     || 'Bien lavée à la main, elle dure deux ans : c''est autant de paquets que tu n''achètes plus.',
       reutilisable = true,
       image = '/produits/serviettes-nuit-600.webp'
 where slug = 'serviettes-nuit-10';

update public.produits
   set nom = 'Serviette lavable jour',
       resume = 'Fine, discrète sous le pagne comme sous le jean',
       description = 'Une serviette lavable fine pour la journée, qui se ferme par une pression. '
                     || 'Elle ne fait pas d''épaisseur et ne s''entend pas quand tu marches. '
                     || 'Tu la rinces à l''eau froide, tu la laves au savon, elle sèche en une nuit.',
       reutilisable = true,
       image = '/produits/serviettes-jour-600.webp'
 where slug = 'serviettes-jour-10';

update public.produits
   set image = '/produits/serviettes-lavables-lot-600.webp'
 where slug = 'serviettes-lavables-3';
