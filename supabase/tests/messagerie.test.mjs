// La messagerie avec la boutique, et l'espace de l'administratrice.
//
// Ce que ce fichier cherche à prouver, dans l'ordre de gravité :
//   1. Awa ne peut PAS lire le fil de Bintou, ni par la table, ni par une
//      fonction, ni en marquant ses messages comme lus.
//   2. Une utilisatrice ordinaire ne peut PAS ouvrir la boîte de réception,
//      lire une conversation, lister les commandes ou changer un état.
//   3. L'administratrice, elle, voit tout ce qu'il lui faut pour travailler,
//      et RIEN du cycle de personne.
//   4. Les compteurs de messages non lus disent la vérité.
//
// Lancer : node supabase/tests/messagerie.test.mjs
import {
  nouvelleBase,
  nouveauCompte,
  commeApi,
  commeServeur,
  verifier,
  bilan,
  titre,
} from './banc.mjs';

const db = await nouvelleBase();

const awa = await nouveauCompte(db, 'awa', 'Awa');
const bintou = await nouveauCompte(db, 'bintou', 'Bintou');
const patronne = await nouveauCompte(db, 'patronne', 'Arthur');

await commeServeur(db, `insert into public.administrateurs (profil_id) values ($1)`, [patronne]);
await commeServeur(db, `update public.profils set telephone = '70112233' where id = $1`, [awa]);

// Un produit publié et un produit retiré de la vente.
await commeServeur(
  db,
  `insert into public.produits (slug, nom, rayon, prix_cfa, stock, publie)
   values ('serviettes-nuit', 'Serviettes nuit', 'serviettes', 2500, 40, true),
          ('culotte-secrete', 'Culotte retirée', 'culottes', 7000, 5, false)`
);

const elle = (sub) => ({ role: 'authenticated', sub });

// ---------------------------------------------------------------------------
titre('Écrire à la boutique');

let r = await commeApi(db, elle(awa), `select public.ecrire_a_la_boutique($1, $2) as j`, [
  "Bonjour, je suis intéressée par ce produit.",
  'serviettes-nuit',
]);
verifier('Awa envoie son premier message', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
const filAwa = r.rows[0].j.fil;

r = await commeApi(db, elle(awa), `select public.ecrire_a_la_boutique($1) as j`, ['Vous livrez à Tanghin ?']);
verifier('le deuxième message reste dans le même fil', r.rows[0].j.fil === filAwa);

r = await commeServeur(db, `select count(*)::int as n from public.fils where profil_id = $1`, [awa]);
verifier('un seul fil par personne, pas un par produit', r.rows[0].n === 1);

r = await commeApi(db, elle(awa), `select public.ecrire_a_la_boutique($1, $2) as j`, [
  'Et celle-ci ?',
  'culotte-secrete',
]);
verifier('un produit dépublié ne s_attache pas au message', r.rows[0].j.ok === true);
r = await commeServeur(db, `select count(*)::int as n from public.messages where produit_slug = 'culotte-secrete'`);
verifier('aucun message ne porte le produit dépublié', r.rows[0].n === 0);

r = await commeApi(db, elle(awa), `select public.ecrire_a_la_boutique($1) as j`, ['   ']);
verifier('un message vide est refusé', r.rows[0].j.erreur === 'message_vide');

r = await commeApi(db, { role: 'anon' }, `select public.ecrire_a_la_boutique($1) as j`, ['coucou']).catch(
  (e) => ({ rows: [{ j: { erreur: e.message } }] })
);
verifier(
  'une visiteuse non connectée ne peut pas écrire',
  r.rows[0].j.erreur === 'connexion_requise' || String(r.rows[0].j.erreur).includes('permission')
);

// Appel direct à l'API, sans les en-têtes du site : refusé.
r = await commeApi(db, { role: 'authenticated', sub: awa, entetes: null }, `select public.ecrire_a_la_boutique($1) as j`, [
  'appel direct',
]);
verifier("un appel qui ne vient pas du site est refusé", r.rows[0].j.erreur === 'acces_refuse');

// ---------------------------------------------------------------------------
titre('Le fil d_une autre reste fermé');

await commeApi(db, elle(bintou), `select public.ecrire_a_la_boutique($1) as j`, ['Bonjour, le prix du kit ?']);
r = await commeServeur(db, `select id from public.fils where profil_id = $1`, [bintou]);
const filBintou = r.rows[0].id;

r = await commeApi(db, elle(awa), `select count(*)::int as n from public.fils`);
verifier('Awa ne voit que son propre fil dans la table', r.rows[0].n === 1);

r = await commeApi(db, elle(awa), `select count(*)::int as n from public.messages where fil_id = $1`, [filBintou]);
verifier('Awa ne lit aucun message du fil de Bintou', r.rows[0].n === 0);

r = await commeApi(db, elle(awa), `select public.marquer_lu($1) as j`, [filBintou]);
verifier('Awa ne peut pas marquer lu le fil de Bintou', r.rows[0].j.erreur === 'fil_inconnu');

r = await commeApi(db, elle(awa), `select public.fil_complet($1) as j`, [filBintou]);
verifier('fil_complet refuse une utilisatrice ordinaire', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(awa), `select public.boite_de_reception() as j`);
verifier('la boîte de réception refuse une utilisatrice ordinaire', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(awa), `select public.commandes_admin() as j`);
verifier('la liste des commandes refuse une utilisatrice ordinaire', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(awa), `select public.repondre_a($1, $2) as j`, [filAwa, 'Je me réponds à moi-même']);
verifier('personne ne peut répondre à la place de la boutique', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(awa), `select count(*)::int as n from public.administrateurs`).catch(() => ({
  rows: [{ n: -1 }],
}));
verifier('la liste des administratrices est fermée', r.rows[0].n <= 0);

r = await commeApi(db, elle(awa), `select public.mon_fil() as j`);
verifier('mon_fil renvoie son fil à elle', r.rows[0].j.fil === filAwa);
verifier('mon_fil renvoie ses messages', r.rows[0].j.messages.length === 3, JSON.stringify(r.rows[0].j.messages.length));
verifier(
  'la carte produit est attachée au premier message',
  r.rows[0].j.messages[0].produit?.slug === 'serviettes-nuit'
);

// ---------------------------------------------------------------------------
titre('La boîte de réception');

r = await commeApi(db, elle(patronne), `select public.boite_de_reception() as j`);
const boite = r.rows[0].j;
verifier('la patronne voit les deux fils', boite.fils.length === 2, JSON.stringify(boite.fils.length));
verifier('elle voit le prénom', boite.fils.some((f) => f.prenom === 'Awa'));
verifier('elle voit le téléphone', boite.fils.some((f) => f.telephone === '70112233'));
verifier('les non lus sont comptés', boite.non_lus === 4, `non_lus=${boite.non_lus}`);

r = await commeApi(db, elle(patronne), `select public.boite_de_reception('Bintou') as j`);
verifier('la recherche par prénom filtre', r.rows[0].j.fils.length === 1);

r = await commeApi(db, elle(patronne), `select public.boite_de_reception('70112233') as j`);
verifier('la recherche par téléphone filtre', r.rows[0].j.fils.length === 1);

r = await commeApi(db, elle(patronne), `select public.fil_complet($1) as j`, [filAwa]);
verifier('la patronne lit la conversation entière', r.rows[0].j.messages.length === 3);
verifier('avec la carte du produit', r.rows[0].j.messages[0].produit?.nom === 'Serviettes nuit');

r = await commeApi(db, elle(patronne), `select public.repondre_a($1, $2) as j`, [
  filAwa,
  'Bonjour Awa, oui nous livrons à Tanghin, 1000 F.',
]);
verifier('la patronne répond', r.rows[0].j.ok === true);

r = await commeApi(db, elle(awa), `select public.mes_discussions() as j`);
verifier('Awa a un message non lu', r.rows[0].j.boutique.non_lus === 1);
verifier("l_aperçu vient de la boutique", r.rows[0].j.boutique.apercu_de === 'boutique');

r = await commeApi(db, elle(awa), `select public.marquer_lu($1) as j`, [filAwa]);
verifier('Awa marque lu', r.rows[0].j.ok === true);
r = await commeApi(db, elle(awa), `select public.mes_discussions() as j`);
verifier('son compteur retombe à zéro', r.rows[0].j.boutique.non_lus === 0);

r = await commeApi(db, elle(patronne), `select public.marquer_lu($1) as j`, [filAwa]);
r = await commeApi(db, elle(patronne), `select public.boite_de_reception() as j`);
verifier(
  'le compteur de la patronne ne garde que le fil de Bintou',
  r.rows[0].j.non_lus === 1,
  `non_lus=${r.rows[0].j.non_lus}`
);

// ---------------------------------------------------------------------------
titre('Rien du cycle ne passe par l_administration');

await commeServeur(db, `insert into public.cycles (profil_id, debut) values ($1, current_date - 3)`, [awa]);
await commeServeur(
  db,
  `insert into public.journal (profil_id, jour, flux, note)
   values ($1, current_date, 'abondant', 'très mal au ventre')`,
  [awa]
);
await commeServeur(
  db,
  `insert into public.assistante_messages (profil_id, question, reponse)
   values ($1, 'Est-ce que je peux être enceinte ?', 'Voici ce qu il faut savoir')`,
  [awa]
);

const texteBoite = JSON.stringify(
  (await commeApi(db, elle(patronne), `select public.boite_de_reception() as j`)).rows[0].j
);
const texteFil = JSON.stringify(
  (await commeApi(db, elle(patronne), `select public.fil_complet($1) as j`, [filAwa])).rows[0].j
);
const texteCommandes = JSON.stringify(
  (await commeApi(db, elle(patronne), `select public.commandes_admin() as j`)).rows[0].j
);

for (const [nom, texte] of [
  ['la boîte de réception', texteBoite],
  ['une conversation', texteFil],
  ['la liste des commandes', texteCommandes],
]) {
  verifier(`${nom} ne contient pas la note du journal`, !texte.includes('très mal au ventre'));
  verifier(`${nom} ne contient pas la question posée à l_IA`, !texte.includes('je peux être enceinte'));
  verifier(`${nom} ne contient pas le flux`, !texte.includes('abondant'));
}

r = await commeApi(db, elle(patronne), `select count(*)::int as n from public.journal`);
verifier('la patronne ne lit aucune ligne de journal, même en SQL direct', r.rows[0].n === 0);
r = await commeApi(db, elle(patronne), `select count(*)::int as n from public.cycles`);
verifier('ni aucun cycle', r.rows[0].n === 0);
r = await commeApi(db, elle(patronne), `select count(*)::int as n from public.assistante_messages`);
verifier("ni aucune question posée à l_assistante", r.rows[0].n === 0);

// ---------------------------------------------------------------------------
titre('Les commandes, côté administration');

r = await commeApi(
  db,
  elle(awa),
  `select public.passer_commande($1::jsonb, 'Awa', '70112233', 'Tanghin', 'derrière le marché') as j`,
  [JSON.stringify([{ slug: 'serviettes-nuit', quantite: 2 }])]
);
verifier('Awa passe une commande', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));

r = await commeServeur(db, `select stock from public.produits where slug = 'serviettes-nuit'`);
const stockApres = r.rows[0].stock;
verifier('le stock a baissé', stockApres === 38, `stock=${stockApres}`);

r = await commeApi(db, elle(patronne), `select public.commandes_admin() as j`);
const cmd = r.rows[0].j.commandes[0];
verifier('la patronne voit la commande', r.rows[0].j.commandes.length === 1);
verifier('avec le téléphone et le quartier', cmd.telephone === '70112233' && cmd.quartier === 'Tanghin');
verifier('et les articles', cmd.articles[0].quantite === 2);
verifier('les états sont comptés', r.rows[0].j.compte.nouvelle === 1);

r = await commeApi(db, elle(awa), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'livree']);
verifier('Awa ne peut pas se livrer elle-même', r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(patronne), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'volee']);
verifier('un état inventé est refusé', r.rows[0].j.erreur === 'etat_inconnu');

r = await commeApi(db, elle(patronne), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'envoyee']);
verifier('la patronne met la commande en livraison', r.rows[0].j.etat === 'envoyee');

r = await commeApi(db, elle(patronne), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'annulee']);
verifier('elle annule', r.rows[0].j.etat === 'annulee');
r = await commeServeur(db, `select stock from public.produits where slug = 'serviettes-nuit'`);
verifier('le stock est rendu à l_annulation', r.rows[0].stock === 40, `stock=${r.rows[0].stock}`);

r = await commeApi(db, elle(patronne), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'nouvelle']);
r = await commeServeur(db, `select stock from public.produits where slug = 'serviettes-nuit'`);
verifier('et reprit si on dé-annule', r.rows[0].stock === 38, `stock=${r.rows[0].stock}`);

r = await commeApi(db, elle(patronne), `select public.changer_etat_commande($1, $2) as j`, [cmd.id, 'livree']);
r = await commeServeur(db, `select livree_le from public.commandes where id = $1`, [cmd.id]);
verifier('la date de livraison est posée', r.rows[0].livree_le !== null);

// ---------------------------------------------------------------------------
titre('Le plafond de messages');

await commeServeur(db, `update public.reglages set valeur = '3' where cle = 'quota_message_heure'`);
let refus = 0;
for (let i = 0; i < 6; i += 1) {
  const rep = await commeApi(db, { role: 'authenticated', sub: bintou, ip: '10.0.0.9' }, `select public.ecrire_a_la_boutique($1) as j`, [
    `message ${i}`,
  ]);
  if (rep.rows[0].j.erreur === 'quota') refus += 1;
}
verifier('le plafond arrête le flot', refus >= 2, `refus=${refus}`);

bilan('Messagerie et administration');
await db.close();
