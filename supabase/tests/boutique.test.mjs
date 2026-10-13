// La boutique : les prix sont relus en base, le stock tient, la commande est
// honnête. Ces tests rejouent les attaques qui comptent sur un site qui vend.
import { nouvelleBase, nouveauCompte, commeApi, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const auth = { role: 'authenticated', sub: awa };
const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

// Depuis la migration 20261012110000, le quota des commandes compte par compte
// connecté et non plus par adresse IP (une adresse s'invente, un compte non).
// Ce fichier passe une dizaine de commandes avec le même compte pour éprouver
// les prix, le stock et les tailles : on relève le plafond. Le quota lui-même
// est éprouvé dans securite.test.mjs.
await db.query(`update public.reglages set valeur = '500' where cle = 'quota_commande_heure'`);

const PANIER = JSON.stringify([
  { slug: 'culotte-flux-abondant', taille: 'M', quantite: 1 },
  { slug: 'serviettes-nuit-10', quantite: 1 },
]);

titre('Le catalogue est lisible sans compte');
{
  // Ce qui compte n'est pas le NOMBRE de lignes, c'est qu'un produit dépublié
  // ne se voie nulle part. Compter les lignes faisait échouer l'essai chaque
  // fois qu'un produit entrait ou sortait du catalogue, pour une raison qui
  // n'était pas un défaut.
  const r = await rpc(`select count(*)::int as n from public.produits where publie = true`, [], { role: 'anon' });
  verifier('un visiteur voit le catalogue', r.n >= 5, `${r.n} produits publiés`);

  const cachee = await rpc(
    `select count(*)::int as n from public.produits where publie = true and slug = 'culotte-rose'`,
    [],
    { role: 'anon' }
  );
  verifier(
    'un produit dépublié ne s’affiche plus',
    cachee.n === 0,
    'la culotte rose, retirée le 13 octobre 2026, est encore en vente'
  );
  const p = await rpc(`select nom, prix_cfa, tailles from public.produits where slug = 'culotte-flux-abondant'`, [], { role: 'anon' });
  verifier('le prix est un entier en FCFA', p.prix_cfa === 9000);
  verifier('les quatre tailles sont là', p.tailles.length === 4);
}

titre('Une commande passe, et les prix sont ceux de la base');
{
  const r = await rpc(
    `select public.passer_commande($1::jsonb, 'Awa Ouédraogo', '70123456', 'Dassasgho', 'Près de la pharmacie') as x`,
    [PANIER]
  );
  verifier('la commande passe', r.x.ok === true, JSON.stringify(r.x));
  verifier('le total vaut 9000 + 1500 + 1000 de livraison', r.x.total === 11500, `total ${r.x.total}`);
  verifier('le numéro suit le format MD-AAMM-00001', /^MD-\d{4}-00001$/.test(r.x.numero), r.x.numero);

  const c = await rpc(`select articles_cfa, livraison_cfa, total_cfa, etat::text, telephone, quartier
                         from public.commandes where numero = $1`, [r.x.numero]);
  verifier('les articles font 10 500', c.articles_cfa === 10500);
  verifier('la livraison est celle du réglage', c.livraison_cfa === 1000);
  verifier("l'état est « nouvelle »", c.etat === 'nouvelle');
  verifier('le numéro est nettoyé', c.telephone === '70123456');

  const l = await rpc(`select count(*)::int as n, sum(total_ligne_cfa)::int as s from public.commande_lignes
                         where commande_id = (select id from public.commandes where numero = $1)`, [r.x.numero]);
  verifier('deux lignes', l.n === 2);
  verifier('la somme des lignes égale les articles', l.s === 10500);
}

titre('Le prix envoyé par le navigateur est ignoré');
{
  // L'attaque classique : on glisse un prix dans le panier.
  const panier = JSON.stringify([{ slug: 'culotte-flux-abondant', taille: 'M', quantite: 1, prix_cfa: 1, prix: 1, total: 1 }]);
  const r = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  verifier('la commande passe quand même', r.x.ok === true, JSON.stringify(r.x));
  verifier('mais le total reste 9000 + 1000', r.x.total === 10000, `total ${r.x.total}`);
}

titre('Le stock est respecté');
{
  const avant = await rpc(`select stock from public.produits where slug = 'serviettes-lavables-3'`);
  const trop = JSON.stringify([{ slug: 'serviettes-lavables-3', quantite: 20 }]);
  await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [trop]);
  const r = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [trop]);
  verifier('on ne commande pas plus que le stock', r.x.ok === false && r.x.erreur.includes('stock_insuffisant'), JSON.stringify(r.x));
  const apres = await rpc(`select stock from public.produits where slug = 'serviettes-lavables-3'`);
  verifier('le stock a baissé une seule fois', apres.stock === avant.stock - 20, `stock ${apres.stock}`);
}

titre('Une quantité absurde est bornée');
{
  const panier = JSON.stringify([{ slug: 'serviettes-jour-10', quantite: 9999 }]);
  const r = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  verifier('la quantité est ramenée à 20', r.x.ok === true && r.x.total === 20 * 1000 + 1000, JSON.stringify(r.x));
}

titre('Une taille inventée est refusée');
{
  const panier = JSON.stringify([{ slug: 'culotte-flux-abondant', taille: 'XXXL', quantite: 1 }]);
  const r = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  verifier('la taille hors liste est refusée', r.x.ok === false && r.x.erreur.includes('taille_invalide'), JSON.stringify(r.x));

  const sans = JSON.stringify([{ slug: 'culotte-flux-abondant', quantite: 1 }]);
  const r2 = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [sans]);
  verifier('une culotte sans taille est refusée', r2.x.ok === false && r2.x.erreur.includes('taille_invalide'));
}

titre('Une adresse ou un numéro impossible est refusé');
{
  const r1 = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '12345678', 'Dassasgho', '') as x`, [PANIER]);
  verifier('un numéro qui ne commence pas par 5, 6 ou 7 est refusé', r1.x.erreur === 'telephone_invalide');
  const r2 = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123', 'Dassasgho', '') as x`, [PANIER]);
  verifier('un numéro trop court est refusé', r2.x.erreur === 'telephone_invalide');
  const r3 = await rpc(`select public.passer_commande($1::jsonb, '', '70123456', 'Dassasgho', '') as x`, [PANIER]);
  verifier('un nom vide est refusé', r3.x.erreur === 'adresse_incomplete');
  const r4 = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', '  ', '') as x`, [PANIER]);
  verifier('un quartier vide est refusé', r4.x.erreur === 'adresse_incomplete');
  const r5 = await rpc(`select public.passer_commande('[]'::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`);
  verifier('un panier vide est refusé', r5.x.erreur === 'panier_vide');
  const r6 = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`,
    [JSON.stringify([{ slug: 'produit-qui-nexiste-pas', quantite: 1 }])]);
  verifier('un produit inconnu est refusé', r6.x.erreur === 'produit_inconnu');
}

titre("Une commande refusée ne laisse rien derrière elle");
{
  const avant = await rpc(`select count(*)::int as n from public.commandes`);
  const panier = JSON.stringify([
    { slug: 'serviettes-jour-10', quantite: 1 },
    { slug: 'culotte-flux-abondant', taille: 'XXL', quantite: 1 },
  ]);
  const r = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  verifier('la commande est refusée', r.x.ok === false);
  const apres = await rpc(`select count(*)::int as n from public.commandes`);
  verifier('aucune commande à moitié écrite ne reste', apres.n === avant.n, `${apres.n} commandes`);
}

titre('Annuler rend le stock');
{
  const avant = await rpc(`select stock from public.produits where slug = 'serviettes-lavables-3'`);
  const panier = JSON.stringify([{ slug: 'serviettes-lavables-3', quantite: 2 }]);
  const c = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  const pendant = await rpc(`select stock from public.produits where slug = 'serviettes-lavables-3'`);
  verifier('le stock a baissé de 2', pendant.stock === avant.stock - 2);

  const a = await rpc(`select public.annuler_ma_commande($1) as x`, [c.x.numero]);
  verifier("l'annulation passe", a.x.ok === true, JSON.stringify(a.x));
  const apres = await rpc(`select stock from public.produits where slug = 'serviettes-lavables-3'`);
  verifier('le stock est rendu', apres.stock === avant.stock);

  const encore = await rpc(`select public.annuler_ma_commande($1) as x`, [c.x.numero]);
  verifier('on ne la rend pas deux fois', encore.x.ok === false && encore.x.erreur === 'deja_preparee');
}

titre('Une commande déjà préparée ne se décommande plus');
{
  const panier = JSON.stringify([{ slug: 'serviettes-jour-10', quantite: 1 }]);
  const c = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', '') as x`, [panier]);
  await db.query(`update public.commandes set etat = 'envoyee' where numero = $1`, [c.x.numero]);
  const a = await rpc(`select public.annuler_ma_commande($1) as x`, [c.x.numero]);
  verifier('le colis parti ne s\'annule pas dans l\'application', a.x.ok === false && a.x.erreur === 'deja_preparee');
}

titre('Mes commandes ne montrent que les miennes');
{
  const fati = await nouveauCompte(db, 'fati', 'Fatimata');
  const s = { role: 'authenticated', sub: fati };
  const panier = JSON.stringify([{ slug: 'serviettes-nuit-10', quantite: 1 }]);
  await rpc(`select public.passer_commande($1::jsonb, 'Fatimata', '76543210', 'Tanghin', '') as x`, [panier], s);

  const miennes = await rpc(`select jsonb_array_length(public.mes_commandes()) as n`, [], s);
  verifier('Fatimata voit sa seule commande', miennes.n === 1, `${miennes.n} commandes`);
  const autres = await rpc(`select count(*)::int as n from public.commandes where profil_id <> auth.uid()`, [], s);
  verifier("elle ne voit aucune commande d'une autre", autres.n === 0, `${autres.n} visibles`);
  const lignes = await rpc(`select count(*)::int as n from public.commande_lignes`, [], s);
  verifier('elle ne voit que les lignes de sa commande', lignes.n === 1, `${lignes.n} lignes`);
}

bilan('Boutique et commandes');
await db.close();
