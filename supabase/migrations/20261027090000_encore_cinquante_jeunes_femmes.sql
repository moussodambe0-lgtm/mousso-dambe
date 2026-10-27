-- Encore cinquante portraits, et cette fois que des jeunes femmes.
--
-- Arthur, le 26 octobre 2026 au soir : « dis lui de faire encore 50 autres
-- portraits qu'on pourra utiliser comme photo de profil, je veux que des
-- jeunes femmes, pas de vieille, pas d'homme, que des femmes ».
--
-- Motion a produit les cinquante, en WebP 400 x 400 sur fond pastel uni, de 23
-- a 34 ans, dans dix-sept familles de coiffure dont cinq nouvelles (frange,
-- vagues, bandeau, couronne, demi-queue). La provenance de chaque fichier est
-- notee dans Projets/videos/avatars-mousso/PROVENANCE.txt.
--
-- QUATRE NE SONT PAS DECLARES ICI, ET C'EST VOULU. Motion signale que
-- femme-tresses-11, femme-twists-06, femme-locks-06 et femme-foulard-09 ont
-- l'air plus jeunes que les autres, sans avoir l'air d'enfants. Sur une
-- application de sante feminine ou la question des mineures est deja ouverte
-- (voir le travail de Juriste), un portrait qui laisse le moindre doute ne vaut
-- pas le risque, surtout quand il en reste quarante-six. Les fichiers restent
-- sur le disque : les declarer plus tard ne demande qu'une ligne.
--
-- La galerie en compte donc 108 : 87 jeunes femmes, 12 femmes de 35 a 60 ans,
-- 9 hommes. La mascotte n'y est toujours pas, decision du 13 octobre.
--
-- Comme la fois precedente, TOUT L'ORDRE EST REPOSE, les anciens compris : les
-- femmes doivent rester avant les hommes (regle verifiee par les tests), et
-- l'ordre prend une famille de coiffure a tour de role pour que deux voisines
-- ne se ressemblent pas dans un rond de 88 px. Verifie : zero voisine de la
-- meme famille sur les 87 jeunes femmes.
--
-- Rien ici ne touche a ce qu'une femme a deja choisi : `avatar_fichier` garde
-- sa valeur, seul le rang d'affichage change.

insert into public.avatars_disponibles (fichier, genre, ordre) values
  ('femme-tresses-01.webp', 'femme', 10),
  ('femme-foulard-01.webp', 'femme', 20),
  ('femme-tresses-02.webp', 'femme', 30),
  ('femme-afro-01.webp', 'femme', 40),
  ('femme-foulard-02.webp', 'femme', 50),
  ('femme-tresses-03.webp', 'femme', 60),
  ('femme-afro-02.webp', 'femme', 70),
  ('femme-foulard-03.webp', 'femme', 80),
  ('femme-tresses-04.webp', 'femme', 90),
  ('femme-afro-03.webp', 'femme', 100),
  ('femme-cheveux-courts-01.webp', 'femme', 110),
  ('femme-chignon-01.webp', 'femme', 120),
  ('femme-foulard-04.webp', 'femme', 130),
  ('femme-nattes-01.webp', 'femme', 140),
  ('femme-tresses-05.webp', 'femme', 150),
  ('femme-afro-04.webp', 'femme', 160),
  ('femme-cheveux-courts-02.webp', 'femme', 170),
  ('femme-chignon-02.webp', 'femme', 180),
  ('femme-foulard-05.webp', 'femme', 190),
  ('femme-nattes-02.webp', 'femme', 200),
  ('femme-tresses-06.webp', 'femme', 210),
  ('femme-afro-05.webp', 'femme', 220),
  ('femme-cheveux-courts-03.webp', 'femme', 230),
  ('femme-chignon-03.webp', 'femme', 240),
  ('femme-foulard-06.webp', 'femme', 250),
  ('femme-locks-01.webp', 'femme', 260),
  ('femme-nattes-03.webp', 'femme', 270),
  ('femme-tresses-07.webp', 'femme', 280),
  ('femme-twists-01.webp', 'femme', 290),
  ('femme-afro-06.webp', 'femme', 300),
  ('femme-boucles-01.webp', 'femme', 310),
  ('femme-carre-01.webp', 'femme', 320),
  ('femme-cheveux-courts-04.webp', 'femme', 330),
  ('femme-cheveux-lisses-01.webp', 'femme', 340),
  ('femme-chignon-04.webp', 'femme', 350),
  ('femme-foulard-07.webp', 'femme', 360),
  ('femme-locks-02.webp', 'femme', 370),
  ('femme-nattes-04.webp', 'femme', 380),
  ('femme-queue-de-cheval-01.webp', 'femme', 390),
  ('femme-tresses-08.webp', 'femme', 400),
  ('femme-twists-02.webp', 'femme', 410),
  ('femme-afro-07.webp', 'femme', 420),
  ('femme-boucles-02.webp', 'femme', 430),
  ('femme-carre-02.webp', 'femme', 440),
  ('femme-cheveux-courts-05.webp', 'femme', 450),
  ('femme-cheveux-lisses-02.webp', 'femme', 460),
  ('femme-chignon-05.webp', 'femme', 470),
  ('femme-foulard-08.webp', 'femme', 480),
  ('femme-locks-03.webp', 'femme', 490),
  ('femme-nattes-05.webp', 'femme', 500),
  ('femme-queue-de-cheval-02.webp', 'femme', 510),
  ('femme-tresses-09.webp', 'femme', 520),
  ('femme-twists-03.webp', 'femme', 530),
  ('femme-afro-08.webp', 'femme', 540),
  ('femme-bandeau-01.webp', 'femme', 550),
  ('femme-boucles-03.webp', 'femme', 560),
  ('femme-carre-03.webp', 'femme', 570),
  ('femme-cheveux-courts-06.webp', 'femme', 580),
  ('femme-cheveux-lisses-03.webp', 'femme', 590),
  ('femme-chignon-06.webp', 'femme', 600),
  ('femme-demi-queue-01.webp', 'femme', 610),
  ('femme-foulard-10.webp', 'femme', 620),
  ('femme-frange-01.webp', 'femme', 630),
  ('femme-locks-04.webp', 'femme', 640),
  ('femme-nattes-06.webp', 'femme', 650),
  ('femme-queue-de-cheval-03.webp', 'femme', 660),
  ('femme-tresses-10.webp', 'femme', 670),
  ('femme-twists-04.webp', 'femme', 680),
  ('femme-vagues-01.webp', 'femme', 690),
  ('femme-afro-09.webp', 'femme', 700),
  ('femme-bandeau-02.webp', 'femme', 710),
  ('femme-boucles-04.webp', 'femme', 720),
  ('femme-carre-04.webp', 'femme', 730),
  ('femme-cheveux-courts-07.webp', 'femme', 740),
  ('femme-cheveux-lisses-04.webp', 'femme', 750),
  ('femme-chignon-07.webp', 'femme', 760),
  ('femme-couronne-01.webp', 'femme', 770),
  ('femme-demi-queue-02.webp', 'femme', 780),
  ('femme-foulard-11.webp', 'femme', 790),
  ('femme-frange-02.webp', 'femme', 800),
  ('femme-locks-05.webp', 'femme', 810),
  ('femme-nattes-07.webp', 'femme', 820),
  ('femme-noeuds-bantu-01.webp', 'femme', 830),
  ('femme-queue-de-cheval-04.webp', 'femme', 840),
  ('femme-tresses-12.webp', 'femme', 850),
  ('femme-twists-05.webp', 'femme', 860),
  ('femme-vagues-02.webp', 'femme', 870),
  ('femme-mure-foulard-01.webp', 'femme', 880),
  ('femme-agee-01.webp', 'femme', 890),
  ('femme-agee-foulard-01.webp', 'femme', 900),
  ('femme-mure-afro-01.webp', 'femme', 910),
  ('femme-mure-carre-01.webp', 'femme', 920),
  ('femme-mure-chignon-01.webp', 'femme', 930),
  ('femme-mure-courts-01.webp', 'femme', 940),
  ('femme-mure-foulard-02.webp', 'femme', 950),
  ('femme-mure-locks-01.webp', 'femme', 960),
  ('femme-mure-lunettes-01.webp', 'femme', 970),
  ('femme-mure-nattes-01.webp', 'femme', 980),
  ('femme-mure-tresses-01.webp', 'femme', 990),
  ('homme-jeune-01.webp', 'homme', 1000),
  ('homme-mur-01.webp', 'homme', 1010),
  ('homme-jeune-02.webp', 'homme', 1020),
  ('homme-mur-02.webp', 'homme', 1030),
  ('homme-jeune-03.webp', 'homme', 1040),
  ('homme-mur-03.webp', 'homme', 1050),
  ('homme-age-01.webp', 'homme', 1060),
  ('homme-jeune-04.webp', 'homme', 1070),
  ('homme-mur-04.webp', 'homme', 1080)
on conflict (fichier) do update set genre = excluded.genre, ordre = excluded.ordre;
