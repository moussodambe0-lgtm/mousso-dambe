// L'espace vendeur : devenir administratrice, et tenir le catalogue.
//
// Ce qu'il faut prouver, dans l'ordre de gravité :
//   1. Personne ne devient administratrice sans l'adresse exacte posée dans
//      les réglages, et une adresse vérifiée.
//   2. Une utilisatrice ordinaire ne touche pas au catalogue, ni par les
//      fonctions, ni par la table.
//   3. Retirer un produit ne l'efface pas : les commandes passées le citent.
//
// Lancer : node supabase/tests/espace-vendeur.test.mjs
import { nouvelleBase, nouveauCompte, commeApi, commeServeur, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();

// La base arrive avec le catalogue de depart. On note ce qu'il y a AVANT pour
// compter nos ajouts, au lieu de supposer une base vide : sinon le jour ou un
// produit est ajoute au depart, ce fichier se met a echouer sans raison.
const { rows: [{ n: produitsAvant }] } = await commeServeur(
  db,
  `select count(*)::int as n from public.produits`
);
const { rows: [{ n: publiesAvant }] } = await commeServeur(
  db,
  `select count(*)::int as n from public.produits where publie`
);
const { rows: [{ n: stockBasAvant }] } = await commeServeur(
  db,
  `select count(*)::int as n from public.produits where publie and stock > 0 and stock <= 3`
);

const arthur = await nouveauCompte(db, 'arthur', 'Arthur');
const awa = await nouveauCompte(db, 'awa', 'Awa');
const qui = (sub) => ({ role: 'authenticated', sub });

titre('Devenir administratrice');

// Rien n'est posé dans les réglages : la porte doit rester fermée.
let r = await commeApi(db, qui(arthur), `select public.reclamer_admin() as j`);
verifier(
  'sans adresse posée, personne ne réclame la place',
  r.rows[0].j.ok === false && r.rows[0].j.erreur === 'acces_refuse',
  JSON.stringify(r.rows[0].j)
);

await commeServeur(
  db,
  `insert into public.reglages (cle, valeur) values ('email_admin', 'arthur@essai.bf')
     on conflict (cle) do update set valeur = excluded.valeur`
);

// L'adresse est posée, mais celle d'Arthur n'est pas encore confirmée.
r = await commeApi(db, qui(arthur), `select public.reclamer_admin() as j`);
verifier(
  'une adresse non confirmée ne suffit pas',
  r.rows[0].j.ok === false,
  JSON.stringify(r.rows[0].j)
);

await commeServeur(db, `update auth.users set email_confirmed_at = now() where id = '${arthur}'`);

r = await commeApi(db, qui(awa), `select public.reclamer_admin() as j`);
verifier(
  'une autre adresse est refusée',
  r.rows[0].j.ok === false && r.rows[0].j.erreur === 'acces_refuse',
  JSON.stringify(r.rows[0].j)
);
r = await commeApi(db, qui(awa), `select public.est_admin() as a`);
verifier('et elle n’est toujours pas administratrice', r.rows[0].a === false);

r = await commeApi(db, qui(arthur), `select public.reclamer_admin() as j`);
verifier('la bonne adresse, confirmée, obtient la place', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
r = await commeApi(db, qui(arthur), `select public.est_admin() as a`);
verifier('il est administrateur', r.rows[0].a === true);

r = await commeApi(db, qui(arthur), `select public.reclamer_admin() as j`);
verifier('réclamer deux fois ne casse rien', r.rows[0].j.ok === true);
r = await commeServeur(db, `select count(*)::int as n from public.administrateurs`);
verifier('et ne crée pas une deuxième ligne', r.rows[0].n === 1);

// Un appel qui ne vient pas du site.
r = await commeApi(db, { role: 'authenticated', sub: arthur, entetes: null }, `select public.reclamer_admin() as j`);
verifier('un appel direct à l’API est refusé', r.rows[0].j.ok === false && r.rows[0].j.erreur === 'acces_refuse');

titre('Ajouter, modifier, retirer un produit');

r = await commeApi(
  db,
  qui(arthur),
  `select public.enregistrer_produit('', 'Serviette lavable nuit', 'lavables', 1500, 10) as j`
);
const slug = r.rows[0].j.slug;
verifier('un produit s’ajoute sans donner de slug', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
verifier('le slug est fabriqué depuis le nom', slug === 'serviette-lavable-nuit', `${slug}`);

r = await commeApi(
  db,
  qui(arthur),
  `select public.enregistrer_produit('', 'Culotte menstruelle légère', 'culottes', 9000, 4) as j`
);
verifier('les accents ne cassent pas le slug', r.rows[0].j.slug === 'culotte-menstruelle-legere', `${r.rows[0].j.slug}`);

r = await commeApi(
  db,
  qui(arthur),
  `select public.enregistrer_produit('${slug}', 'Serviette lavable nuit', 'lavables', 1800, 25) as j`
);
verifier('le même slug met à jour au lieu de doubler', r.rows[0].j.ok === true);
r = await commeServeur(db, `select prix_cfa, stock from public.produits where slug = '${slug}'`);
verifier('le prix et le stock ont changé', r.rows[0].prix_cfa === 1800 && r.rows[0].stock === 25, JSON.stringify(r.rows[0]));
r = await commeServeur(db, `select count(*)::int as n from public.produits`);
verifier(
  'il y a bien deux produits de plus, pas trois',
  r.rows[0].n === produitsAvant + 2,
  `${r.rows[0].n} au lieu de ${produitsAvant + 2}`
);

titre('Ce que la base refuse');

r = await commeApi(db, qui(arthur), `select public.enregistrer_produit('', '', 'lavables', 1500, 3) as j`);
verifier('un produit sans nom est refusé', r.rows[0].j.erreur === 'nom_requis');
r = await commeApi(db, qui(arthur), `select public.enregistrer_produit('', 'X', 'lavables', 0, 3) as j`);
verifier('un prix à zéro est refusé', r.rows[0].j.erreur === 'prix_invalide');
r = await commeApi(db, qui(arthur), `select public.enregistrer_produit('', 'X', 'lavables', 1500, -2) as j`);
verifier('un stock négatif est refusé', r.rows[0].j.erreur === 'stock_invalide');
r = await commeApi(db, qui(arthur), `select public.enregistrer_produit('', 'X', 'chaussures', 1500, 3) as j`);
verifier('un rayon qui n’existe pas est refusé', r.rows[0].j.erreur === 'rayon_invalide');

titre('Le catalogue est fermé aux autres');

r = await commeApi(db, qui(awa), `select public.enregistrer_produit('', 'Faux produit', 'lavables', 100, 1) as j`);
verifier('une cliente ne peut pas ajouter un produit', r.rows[0].j.erreur === 'acces_refuse');
r = await commeApi(db, qui(awa), `select public.retirer_produit('${slug}') as j`);
verifier('ni en retirer un', r.rows[0].j.erreur === 'acces_refuse');
r = await commeApi(db, qui(awa), `select public.produits_admin() as j`);
verifier('ni voir la liste complète', r.rows[0].j.erreur === 'acces_refuse');

let erreurEcriture = '';
try {
  await commeApi(db, qui(awa), `update public.produits set prix_cfa = 1 where slug = '${slug}'`);
} catch (e) {
  erreurEcriture = String(e.message);
}
r = await commeServeur(db, `select prix_cfa from public.produits where slug = '${slug}'`);
verifier(
  'et elle n’écrit pas non plus directement dans la table',
  r.rows[0].prix_cfa === 1800,
  `prix devenu ${r.rows[0].prix_cfa} ${erreurEcriture}`
);

titre('Retirer, c’est dépublier');

r = await commeApi(db, qui(arthur), `select public.retirer_produit('${slug}') as j`);
verifier('le produit se retire', r.rows[0].j.ok === true);
r = await commeServeur(db, `select publie from public.produits where slug = '${slug}'`);
verifier('il est dépublié, pas effacé', r.rows[0].publie === false);
r = await commeApi(db, qui(awa), `select count(*)::int as n from public.produits where slug = '${slug}'`);
verifier('une cliente ne le voit plus dans la boutique', r.rows[0].n === 0);
r = await commeApi(db, qui(arthur), `select public.produits_admin() as j`);
verifier(
  'mais l’espace vendeur le voit encore',
  (r.rows[0].j.produits ?? []).length === produitsAvant + 2,
  `${(r.rows[0].j.produits ?? []).length} au lieu de ${produitsAvant + 2}`
);

r = await commeApi(db, qui(arthur), `select public.retirer_produit('${slug}', true) as j`);
verifier('et il se remet en vente', r.rows[0].j.ok === true);
r = await commeApi(db, qui(awa), `select count(*)::int as n from public.produits where slug = '${slug}'`);
verifier('la cliente le revoit', r.rows[0].n === 1);

r = await commeApi(db, qui(arthur), `select public.retirer_produit('rien-du-tout') as j`);
verifier('retirer un produit qui n’existe pas est refusé proprement', r.rows[0].j.erreur === 'produit_inconnu');

titre('Le tableau de bord');

r = await commeApi(db, qui(awa), `select public.tableau_vendeur() as j`);
verifier('une cliente ne voit pas les chiffres', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, qui(arthur), `select public.tableau_vendeur() as j`);
const t = r.rows[0].j;
verifier('l’administrateur les voit', t.ok === true, JSON.stringify(t));
verifier(
  'il compte les produits publiés',
  t.produits_publies === publiesAvant + 2,
  `${t.produits_publies} au lieu de ${publiesAvant + 2}`
);
// La culotte ajoutee plus haut a 4 en stock, la serviette 25 : le seul ajout
// qui compte comme « stock bas » viendra du retrait de stock par la commande.
verifier(
  'et repère le stock bas',
  t.stock_bas === stockBasAvant,
  `stock_bas = ${t.stock_bas} au lieu de ${stockBasAvant}`
);
verifier('rien à préparer au départ', t.a_preparer === 0 && t.ventes_jour === 0, JSON.stringify(t));

// Une vraie commande, pour que les chiffres aient quelque chose à compter.
await commeApi(db, qui(awa), `select public.passer_commande(
  '[{"slug":"${slug}","quantite":2}]'::jsonb, 'Awa', '70112233', 'Zogona', 'Vers le marché') as j`);

r = await commeApi(db, qui(arthur), `select public.tableau_vendeur() as j`);
const t2 = r.rows[0].j;
verifier('une commande passe en « à préparer »', t2.a_preparer === 1, `${t2.a_preparer}`);
verifier('et compte dans les ventes du jour', t2.ventes_jour > 0, `${t2.ventes_jour}`);
verifier('et dans celles du mois', t2.commandes_mois === 1, `${t2.commandes_mois}`);

bilan('Espace vendeur');
