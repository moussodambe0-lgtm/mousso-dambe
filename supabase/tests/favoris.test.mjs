// Les favoris : le cœur de la fiche produit.
//
// Ce qu'il faut prouver, dans l'ordre de gravité :
//   1. Les favoris d'Awa ne se lisent pas chez Bintou.
//   2. On ne met en favori que ce qui existe ET qui est en vente.
//   3. Le geste bascule, et « Effacer mes données » les efface.
//
// Lancer : node supabase/tests/favoris.test.mjs
import { nouvelleBase, nouveauCompte, commeApi, commeServeur, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();

const awa = await nouveauCompte(db, 'awa', 'Awa');
const bintou = await nouveauCompte(db, 'bintou', 'Bintou');
const elle = (sub) => ({ role: 'authenticated', sub });

await commeServeur(
  db,
  `insert into public.produits (slug, nom, rayon, prix_cfa, stock, publie)
   values ('lavable-a', 'Serviette lavable', 'lavables', 1500, 40, true),
          ('retire-b', 'Produit retiré', 'lavables', 900, 5, false)`
);

titre('Mettre en favori, et le retirer');
let r = await commeApi(db, elle(awa), `select public.basculer_favori('lavable-a') as j`);
verifier('un premier toucher met en favori', r.rows[0].j.ok === true && r.rows[0].j.favori === true, JSON.stringify(r.rows[0].j));

r = await commeApi(db, elle(awa), `select count(*)::int as n from public.favoris`);
verifier('elle le retrouve dans ses favoris', r.rows[0].n === 1);

r = await commeApi(db, elle(awa), `select public.basculer_favori('lavable-a') as j`);
verifier('un deuxième toucher le retire', r.rows[0].j.ok === true && r.rows[0].j.favori === false);

r = await commeApi(db, elle(awa), `select count(*)::int as n from public.favoris`);
verifier('et la liste est vide', r.rows[0].n === 0);

titre('Ce qui peut être mis en favori');
r = await commeApi(db, elle(awa), `select public.basculer_favori('inventé') as j`);
verifier("un produit inventé est refusé", r.rows[0].j.erreur === 'produit_inconnu');
r = await commeApi(db, elle(awa), `select public.basculer_favori('retire-b') as j`);
verifier("un produit retiré de la vente est refusé", r.rows[0].j.erreur === 'produit_inconnu');
r = await commeApi(db, elle(awa), `select public.basculer_favori(null) as j`);
verifier('un nom absent est refusé sans planter', r.rows[0].j.erreur === 'produit_inconnu');

titre("Les favoris d'une autre restent fermés");
await commeApi(db, elle(awa), `select public.basculer_favori('lavable-a') as j`);
r = await commeApi(db, elle(bintou), `select count(*)::int as n from public.favoris`);
verifier('Bintou ne voit aucun favori', r.rows[0].n === 0);

let refus = false;
try {
  const t = await commeApi(db, elle(bintou), `insert into public.favoris (profil_id, produit_slug) values ($1, 'lavable-a')`, [awa]);
  refus = t.rowCount === 0;
} catch {
  refus = true;
}
verifier("elle ne peut pas écrire dans les favoris d'une autre", refus);

refus = false;
try {
  await commeApi(db, elle(awa), `insert into public.favoris (profil_id, produit_slug) values ($1, 'lavable-a')`, [awa]);
} catch {
  refus = true;
}
verifier("et personne n'écrit directement dans la table : tout passe par la fonction", refus);

r = await commeApi(db, { role: 'anon' }, `select public.basculer_favori('lavable-a') as j`).catch((e) => ({
  rows: [{ j: { ok: false, erreur: e.message } }],
}));
verifier('une visiteuse non connectée ne peut pas mettre en favori', r.rows[0].j.ok === false);

r = await commeApi(db, { role: 'authenticated', sub: awa, entetes: null }, `select public.basculer_favori('lavable-a') as j`);
verifier('un appel qui ne vient pas du site est refusé', r.rows[0].j.erreur === 'acces_refuse');

titre('Effacer mes données efface les favoris');
await commeApi(db, elle(bintou), `select public.basculer_favori('lavable-a') as j`);
r = await commeApi(db, elle(awa), `select public.effacer_mes_donnees() as j`);
verifier("l'effacement passe", r.rows[0].j.ok === true);
r = await commeServeur(db, `select count(*)::int as n from public.favoris where profil_id = $1`, [awa]);
verifier("les favoris d'Awa sont effacés", r.rows[0].n === 0);
r = await commeServeur(db, `select count(*)::int as n from public.favoris where profil_id = $1`, [bintou]);
verifier('ceux de Bintou restent', r.rows[0].n === 1);

bilan('Favoris');
await db.close();
