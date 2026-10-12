-- Les visuels du catalogue, dessinés par Motion le 12 octobre 2026.
--
-- Ce sont des ILLUSTRATIONS, pas des photographies des produits réellement
-- vendus. Elles tiennent le temps du lancement ; les vraies photos devront les
-- remplacer, parce qu'une photo vend mieux qu'un dessin. La colonne garde le
-- chemin de la variante 600 ; la 1200 s'en déduit en remplaçant le nombre.

update public.produits set image = '/produits/serviettes-jetables-600.webp' where slug = 'serviettes-nuit-10';
update public.produits set image = '/produits/serviettes-jetables-600.webp' where slug = 'serviettes-jour-10';
update public.produits set image = '/produits/culotte-noire-600.webp' where slug = 'culotte-flux-abondant';
update public.produits set image = '/produits/lot-3-culottes-600.webp' where slug = 'lot-3-culottes';
update public.produits set image = '/produits/serviettes-lavables-600.webp' where slug = 'serviettes-lavables-3';
update public.produits set image = '/produits/kit-premieres-regles-600.webp' where slug = 'kit-premieres-regles';

-- Motion a aussi dessiné une culotte rose : elle devient un vrai article, le
-- même produit dans l'autre couleur. À valider par Arthur avec les prix.
insert into public.produits (slug, nom, resume, description, rayon, prix_cfa, stock, tailles, image, reutilisable, ordre)
values (
  'culotte-rose',
  'Culotte menstruelle rose',
  'La même, dans une couleur qui ne fait pas sous-vêtement de nuit',
  'Même culotte à trois couches que la noire, en rose poudré. Douze heures de protection, lavable à la main, elle sèche en une nuit. Le rose se tache moins visiblement qu''on ne le croit : la couche intérieure est sombre.',
  'culottes', 9000, 20, '{S,M,L,XL}', '/produits/culotte-rose-600.webp', true, 35
)
on conflict (slug) do nothing;
