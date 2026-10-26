-- Les cinquante portraits de plus, et un ordre qui ne se repete pas.
--
-- Arthur, le 26 octobre 2026 : « crée 50 portraits de plus, en majorité des
-- filles de moins de 35 ans ». Motion les a produits (environ 175 images
-- générées pour 50 gardées), en WebP 400 x 400 sur fond pastel uni, dans la
-- suite des douze du matin. Le portrait source de chacun est noté dans
-- Projets/videos/avatars-mousso/PROVENANCE.txt.
--
-- La galerie en compte donc 62 : 41 jeunes femmes de 22 à 34 ans,
-- 12 femmes de 35 à 60 ans, 9 hommes. La mascotte n'y est pas,
-- décision du 13 octobre.
--
-- DEUX CHOSES QUE CETTE MIGRATION FAIT, et la seconde compte autant :
--
-- 1. elle déclare les cinquante nouveaux fichiers ;
--
-- 2. elle REFAIT L'ORDRE DE TOUS, y compris des douze premiers. Deux raisons.
--    D'abord la règle vérifiée par les tests, les femmes avant les hommes :
--    les quatre hommes du matin occupaient les rangs 90 à 120, donc ajouter
--    des femmes à la suite les aurait fait passer après eux. Ensuite la
--    variété : par ordre alphabétique, les six afros se suivent et les sept
--    tresses aussi, et dans un rond de 88 px on ne les distingue plus. L'ordre
--    posé ici prend une famille de coiffure à tour de rôle, pour que deux
--    voisines ne se ressemblent pas.
--
-- Rien ici ne touche à ce qu'une femme a déjà choisi : `avatar_fichier` garde
-- sa valeur, seul le rang d'affichage change.

-- Tout l'ordre est reposé d'un coup, les anciens comme les nouveaux.
insert into public.avatars_disponibles (fichier, genre, ordre) values
  ('femme-tresses-01.webp', 'femme', 10),
  ('femme-foulard-01.webp', 'femme', 20),
  ('femme-tresses-02.webp', 'femme', 30),
  ('femme-afro-01.webp', 'femme', 40),
  ('femme-tresses-03.webp', 'femme', 50),
  ('femme-foulard-02.webp', 'femme', 60),
  ('femme-afro-02.webp', 'femme', 70),
  ('femme-tresses-04.webp', 'femme', 80),
  ('femme-nattes-01.webp', 'femme', 90),
  ('femme-foulard-03.webp', 'femme', 100),
  ('femme-cheveux-courts-01.webp', 'femme', 110),
  ('femme-afro-03.webp', 'femme', 120),
  ('femme-twists-01.webp', 'femme', 130),
  ('femme-tresses-05.webp', 'femme', 140),
  ('femme-nattes-02.webp', 'femme', 150),
  ('femme-locks-01.webp', 'femme', 160),
  ('femme-foulard-04.webp', 'femme', 170),
  ('femme-chignon-01.webp', 'femme', 180),
  ('femme-cheveux-courts-02.webp', 'femme', 190),
  ('femme-afro-04.webp', 'femme', 200),
  ('femme-twists-02.webp', 'femme', 210),
  ('femme-tresses-06.webp', 'femme', 220),
  ('femme-nattes-03.webp', 'femme', 230),
  ('femme-locks-02.webp', 'femme', 240),
  ('femme-foulard-05.webp', 'femme', 250),
  ('femme-chignon-02.webp', 'femme', 260),
  ('femme-cheveux-courts-03.webp', 'femme', 270),
  ('femme-afro-05.webp', 'femme', 280),
  ('femme-twists-03.webp', 'femme', 290),
  ('femme-tresses-07.webp', 'femme', 300),
  ('femme-queue-de-cheval-01.webp', 'femme', 310),
  ('femme-noeuds-bantu-01.webp', 'femme', 320),
  ('femme-nattes-04.webp', 'femme', 330),
  ('femme-locks-03.webp', 'femme', 340),
  ('femme-foulard-06.webp', 'femme', 350),
  ('femme-chignon-03.webp', 'femme', 360),
  ('femme-cheveux-lisses-01.webp', 'femme', 370),
  ('femme-cheveux-courts-04.webp', 'femme', 380),
  ('femme-carre-01.webp', 'femme', 390),
  ('femme-boucles-01.webp', 'femme', 400),
  ('femme-afro-06.webp', 'femme', 410),
  ('femme-mure-foulard-01.webp', 'femme', 420),
  ('femme-mure-tresses-01.webp', 'femme', 430),
  ('femme-mure-nattes-01.webp', 'femme', 440),
  ('femme-mure-lunettes-01.webp', 'femme', 450),
  ('femme-mure-locks-01.webp', 'femme', 460),
  ('femme-mure-foulard-02.webp', 'femme', 470),
  ('femme-mure-courts-01.webp', 'femme', 480),
  ('femme-mure-chignon-01.webp', 'femme', 490),
  ('femme-mure-carre-01.webp', 'femme', 500),
  ('femme-mure-afro-01.webp', 'femme', 510),
  ('femme-agee-foulard-01.webp', 'femme', 520),
  ('femme-agee-01.webp', 'femme', 530),
  ('homme-mur-01.webp', 'homme', 540),
  ('homme-jeune-01.webp', 'homme', 550),
  ('homme-mur-02.webp', 'homme', 560),
  ('homme-jeune-02.webp', 'homme', 570),
  ('homme-mur-03.webp', 'homme', 580),
  ('homme-jeune-03.webp', 'homme', 590),
  ('homme-mur-04.webp', 'homme', 600),
  ('homme-jeune-04.webp', 'homme', 610),
  ('homme-age-01.webp', 'homme', 620)
on conflict (fichier) do update set genre = excluded.genre, ordre = excluded.ordre;
