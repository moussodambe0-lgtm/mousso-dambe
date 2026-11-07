-- ============================================================================
-- LE COMPTEUR DES COMMANDES NE PART PAS DE UN
--
-- Arthur, le 7 novembre 2026 : « je veux pas de numéro 1, et au niveau de la
-- commande là, on va dire commande numéro 200. »
--
-- POURQUOI CE N'EST PAS DE LA COQUETTERIE
--
-- Le numéro s'écrit « MD-AAMM-NNNNN » (voir passer_commande, migration
-- 20261026160000, ligne 226). La partie NNNNN vient de numero_commande_seq,
-- qui démarrait à 1. La toute première cliente recevait donc « MD-2611-00001 »,
-- la deuxième « MD-2611-00002 ».
--
-- Un numéro de commande est lu par la cliente, par le livreur, et par
-- quiconque regarde son téléphone. « 00001 » annonce qu'elle est la première,
-- et « 00002 » que la boutique en a vendu une seule avant elle. Sur un marché
-- où l'on paie à la livraison, à quelqu'un qu'on ne connaît pas, cette
-- information fait hésiter, et elle n'apporte rien à personne.
--
-- CE QU'ON NE FAIT PAS : mentir sur un chiffre d'affaires, inventer des avis,
-- ou gonfler un compteur de ventes affiché. Un numéro de commande n'est pas
-- une statistique publiée, c'est une référence de suivi : son seul rôle est
-- d'être unique et de se recopier sans erreur au téléphone. Le décaler ne
-- trompe personne sur la qualité de ce qui est vendu.
--
-- POURQUOI « greatest » ET PAS UN SIMPLE setval
--
-- Si des commandes existent déjà et que le compteur a dépassé 199, le ramener
-- à 199 ferait réattribuer des numéros déjà donnés. Deux commandes du même
-- mois porteraient le même numéro : la contrainte d'unicité ferait échouer la
-- seconde, et la cliente verrait une erreur au pire moment, juste après avoir
-- confirmé son panier. On ne recule donc jamais, et cette migration peut être
-- rejouée sans danger.
-- ============================================================================

select setval(
  'public.numero_commande_seq',
  greatest((select last_value from public.numero_commande_seq), 199),
  true
);

comment on sequence public.numero_commande_seq is
  'Le compteur du numéro de commande. Démarré à 200 le 7 novembre 2026 '
  '(demande d''Arthur) : « 00001 » apprend à la cliente qu''elle est la '
  'première, ce qui fait hésiter sans rien apporter. Ne jamais le reculer, '
  'des numéros déjà donnés seraient réattribués.';
