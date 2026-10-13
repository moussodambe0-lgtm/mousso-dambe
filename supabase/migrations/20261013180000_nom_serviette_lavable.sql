-- « Serviette lavable nuit » devient « Serviette lavable ».
--
-- Demande d'Arthur du 13 octobre 2026 : « Serviette lavable nuit : non, écris
-- juste Serviette lavable ».
--
-- Seul le NOM change. Le slug, le prix, la photo, le texte et le stock sont
-- ceux d'avant : une commande déjà passée garde son lien, et la ligne de
-- commande a recopié le nom d'alors, donc l'historique reste lisible.
--
-- « Serviette lavable jour » garde son nom : Arthur n'a parlé que de celle de
-- nuit. Les deux n'ont donc plus de noms symétriques ; s'il veut aussi
-- raccourcir l'autre, c'est une ligne de plus.

update public.produits
   set nom = 'Serviette lavable'
 where slug = 'serviettes-nuit-10';
