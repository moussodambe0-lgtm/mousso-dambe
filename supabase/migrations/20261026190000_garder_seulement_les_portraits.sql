-- Garder seulement les portraits : la migration que le code annonçait déjà.
--
-- TROUVÉ PAR CYBER LE 26 OCTOBRE 2026, et c'est la trouvaille la plus simple
-- de la journée : `src/pages/compte/avatar.astro` affirme, en commentaire,
-- « En base, `composer_avatar()` est révoquée et `avatar_choix` est vidée
-- (voir la migration 20261026150000) ». Cette migration N'EXISTAIT PAS, et le
-- numéro cité est celui d'un autre fichier. Vérifié sur le banc :
-- `composer_avatar` est toujours ouverte à tout compte connecté.
--
-- Ce n'était pas une faille, c'était pire pour la suite : un commentaire qui
-- décrit une protection absente. Le prochain qui lit ce fichier croit la porte
-- fermée et ne la vérifie plus.
--
-- DEUX DÉCISIONS D'ARTHUR, APPLIQUÉES ICI
--
-- 1. « Au niveau des avatars garde seulement les portraits » (26 octobre). Le
--    créateur de dessins est donc révoqué, et les compositions déjà faites
--    sont effacées. `src/lib/avatar.ts` reste dans le dépôt avec ses tests :
--    c'est du code qui marche, et on ne supprime pas pour supprimer. Mais plus
--    personne ne peut l'atteindre, ni par l'écran ni par l'API.
--
-- 2. « La personne n'aura pas automatiquement une image » (13 octobre). Rien
--    n'est posé à personne : la galerie est proposée, pas appliquée.
--
-- ET LA GALERIE ÉTAIT VIDE. Le 13 octobre, la mascotte a été retirée de la
-- galerie, qui était alors sa seule entrée : depuis, `galerie_avatars()` rend
-- `[]` et « Ma photo de profil » ne propose que « Aucune ». Les douze portraits
-- produits par Motion le 26 octobre sont bien sur le disque
-- (`public/avatars/`) et partent bien dans la mise en ligne, mais aucune ligne
-- ne les déclare. Ils sont ajoutés ici, dans l'ordre : les huit femmes
-- d'abord, parce que l'application est faite pour elles.
--
-- La soignante (`infirmiere-visage.webp`) n'y revient pas : c'est le visage de
-- l'application, et la décision du 13 octobre était qu'il ne devienne pas
-- celui d'une utilisatrice.

-- ---------------------------------------------------------------------------
-- 1. Le créateur de dessins ne s'atteint plus
-- ---------------------------------------------------------------------------
revoke all on function public.composer_avatar(int, int, int, int, int, int)
  from public, anon, authenticated;

-- Les compositions déjà faites sont effacées. Celles qui avaient AUSSI un
-- portrait n'en ont pas : `composer_avatar` effaçait `avatar_fichier` en
-- posant `avatar_choix`. Elles retrouvent donc le rond neutre, et la galerie
-- est là pour choisir un visage.
update public.profils set avatar_choix = null where avatar_choix is not null;

comment on column public.profils.avatar_choix is
  'HORS SERVICE depuis le 26 octobre 2026 (Arthur : « garde seulement les
   portraits »). La colonne reste pour ne pas perdre la forme des donnees, mais
   composer_avatar() est revoquee et personne ne peut plus la remplir. Le seul
   avatar est avatar_fichier, choisi dans avatars_disponibles.';

-- `retirer_mon_avatar()` RESTE ouverte : revenir au rond neutre est le droit de
-- chacune, et c'est ce que fait le bouton « Aucune » de l'écran.

-- ---------------------------------------------------------------------------
-- 2. Les douze portraits entrent dans la galerie
-- ---------------------------------------------------------------------------
insert into public.avatars_disponibles (fichier, genre, ordre) values
  ('femme-afro-01.webp',            'femme', 10),
  ('femme-tresses-01.webp',         'femme', 20),
  ('femme-nattes-01.webp',          'femme', 30),
  ('femme-chignon-01.webp',         'femme', 40),
  ('femme-foulard-01.webp',         'femme', 50),
  ('femme-cheveux-courts-01.webp',  'femme', 60),
  ('femme-agee-01.webp',            'femme', 70),
  ('femme-agee-foulard-01.webp',    'femme', 80),
  ('homme-jeune-01.webp',           'homme', 90),
  ('homme-jeune-02.webp',           'homme', 100),
  ('homme-mur-01.webp',             'homme', 110),
  ('homme-mur-02.webp',             'homme', 120)
on conflict (fichier) do nothing;
