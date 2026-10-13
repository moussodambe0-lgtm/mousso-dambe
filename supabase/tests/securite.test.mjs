// Sécurité : ce qu'une attaquante ne doit jamais pouvoir faire.
//
// Le cycle, le journal et le fil de l'assistante sont les données les plus
// intimes de l'application. Ces tests valent la promesse écrite à l'écran
// « personne de ton entourage ne peut les voir » : s'ils passent au rouge, la
// promesse est fausse.
import { nouvelleBase, nouveauCompte, commeApi, commeServeur, echoue, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const fati = await nouveauCompte(db, 'fati', 'Fatimata');
const sAwa = { role: 'authenticated', sub: awa };
const sFati = { role: 'authenticated', sub: fati };
const anon = { role: 'anon' };
const rpc = async (sql, params = [], session = sAwa) => (await commeApi(db, session, sql, params)).rows[0];

// Awa remplit son dossier : cycle, journal, assistante, commande.
await rpc(`select public.enregistrer_questionnaire('Awa', 29, 5, current_date - 3) as x`);
await rpc(`select public.noter_journee(current_date, 'abondant', 3, array['ventre'], 'Très mal, je suis restée couchée') as x`);
await rpc(`select public.assistante_poser('Est-ce que je peux tomber enceinte pendant mes règles ?') as x`);
await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Dassasgho', 'Chez le tailleur') as x`,
  [JSON.stringify([{ slug: 'serviettes-nuit-10', quantite: 1 }])]);

titre('Une autre utilisatrice ne voit rien du dossier intime');
{
  const j = await rpc(`select count(*)::int as n from public.journal`, [], sFati);
  verifier('Fatimata ne voit aucune ligne de journal', j.n === 0, `${j.n} lignes visibles`);
  const c = await rpc(`select count(*)::int as n from public.cycles`, [], sFati);
  verifier('elle ne voit aucun cycle', c.n === 0, `${c.n} cycles visibles`);
  const p = await rpc(`select count(*)::int as n from public.profils`, [], sFati);
  verifier('elle ne voit que son propre profil', p.n === 1, `${p.n} profils visibles`);
  const a = await rpc(`select count(*)::int as n from public.assistante_messages`, [], sFati);
  verifier("elle ne voit aucune question posée à l'assistante", a.n === 0, `${a.n} messages visibles`);
  const co = await rpc(`select count(*)::int as n from public.commandes`, [], sFati);
  verifier('elle ne voit aucune commande', co.n === 0, `${co.n} commandes visibles`);
  const l = await rpc(`select count(*)::int as n from public.commande_lignes`, [], sFati);
  verifier('elle ne voit aucune ligne de commande', l.n === 0);
  const cy = await rpc(`select public.mon_cycle() as c`, [], sFati);
  verifier('son propre cycle est vide, pas celui d\'Awa', cy.c.a_des_donnees === false);
}

titre('Un visiteur sans compte ne lit que le catalogue');
{
  // Ce qui est vérifié ici, c'est qu'un visiteur SANS COMPTE lit bien le
  // catalogue, pas combien de produits il contient : ce nombre change dès
  // qu'Arthur en ajoute ou en retire un.
  const pr = await rpc(`select count(*)::int as n from public.produits`, [], anon);
  verifier('il voit les produits', pr.n >= 5, `${pr.n} produits`);
  await echoue('il ne lit pas les profils', () => rpc(`select * from public.profils`, [], anon), 'permission');
  await echoue('il ne lit pas le journal', () => rpc(`select * from public.journal`, [], anon), 'permission');
  await echoue('il ne lit pas les cycles', () => rpc(`select * from public.cycles`, [], anon), 'permission');
  await echoue('il ne lit pas les commandes', () => rpc(`select * from public.commandes`, [], anon), 'permission');
  await echoue("il ne lit pas le fil de l'assistante",
    () => rpc(`select * from public.assistante_messages`, [], anon), 'permission');
  await echoue('il ne lit pas les réglages', () => rpc(`select * from public.reglages`, [], anon), 'permission');
}

titre("L'empreinte de la clé serveur n'est lisible par personne");
{
  await echoue('la table des réglages est fermée',
    () => rpc(`select valeur from public.reglages where cle = 'cle_serveur_sha256'`), 'permission');
  await echoue('la fonction de lecture des réglages est fermée',
    () => rpc(`select public.reglage('cle_serveur_sha256')`), 'permission');
}

titre('Aucune écriture directe depuis le navigateur');
{
  await echoue('on ne modifie pas son cycle à la main',
    () => rpc(`update public.profils set cycle_moyen = 20 where id = auth.uid()`), 'permission');
  await echoue('on ne modifie pas le prix d\'un produit',
    () => rpc(`update public.produits set prix_cfa = 1 where slug = 'culotte-flux-abondant'`), 'permission');
  await echoue("on n'écrit pas une commande à la main",
    () => rpc(`insert into public.commandes (numero, profil_id, nom, telephone, quartier, articles_cfa, livraison_cfa, total_cfa)
               values ('MD-FAUX', auth.uid(), 'Awa', '70000000', 'Zogona', 0, 0, 0)`), 'permission');
  await echoue("on ne change pas l'état de sa commande",
    () => rpc(`update public.commandes set etat = 'livree' where profil_id = auth.uid()`), 'permission');
  await echoue("on n'écrit pas dans le journal à la main",
    () => rpc(`insert into public.journal (profil_id, jour) values (auth.uid(), current_date - 30)`), 'permission');
  await echoue("on n'écrit pas une réponse d'assistante à la main",
    () => rpc(`update public.assistante_messages set reponse = 'coucou'`), 'permission');
  await echoue('on ne touche pas aux réglages',
    () => rpc(`update public.reglages set valeur = '0' where cle = 'livraison_cfa'`), 'permission');
  await echoue('on ne vide pas la table des quotas',
    () => rpc(`delete from public.quotas`), 'permission');
}

titre('Les fonctions internes ne sont pas appelables depuis dehors');
{
  await echoue('la vérification de la clé serveur est interne',
    () => rpc(`select public.appel_du_site()`), 'permission');
  await echoue('le compteur de quotas est interne',
    () => rpc(`select public.quota_ok('triche', 999, interval '1 hour')`), 'permission');
  await echoue('le calcul de phase est interne',
    () => rpc(`select public.phase_du_cycle(1, 5, 28)`), 'permission');
  await echoue("le ménage des quotas est interne",
    () => rpc(`select public.menage_quotas()`), 'permission');
}

titre("Un appel direct à l'API, sans passer par le site, n'écrit rien");
{
  const sansEntete = { role: 'authenticated', sub: awa, entetes: null };
  const q = await rpc(`select public.enregistrer_questionnaire('Pirate', 20, 1, null) as x`, [], sansEntete);
  verifier('le questionnaire est refusé', q.x.ok === false && q.x.erreur === 'acces_refuse');
  const n = await rpc(`select public.noter_journee(current_date, 'rien', 0, '{}', '') as x`, [], sansEntete);
  verifier('la note du journal est refusée', n.x.ok === false && n.x.erreur === 'acces_refuse');
  const c = await rpc(`select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Zogona', '') as x`,
    [JSON.stringify([{ slug: 'serviettes-nuit-10', quantite: 1 }])], sansEntete);
  verifier('la commande est refusée', c.x.ok === false && c.x.erreur === 'acces_refuse');
  const a = await rpc(`select public.assistante_poser('Bonjour') as x`, [], sansEntete);
  verifier("la question à l'assistante est refusée", a.x.ok === false && a.x.erreur === 'acces_refuse');
  const e = await rpc(`select public.effacer_mes_donnees() as x`, [], sansEntete);
  verifier("l'effacement est refusé", e.x.ok === false && e.x.erreur === 'acces_refuse');

  const mauvaise = { role: 'authenticated', sub: awa, entetes: { 'x-md-cle': 'ce-n-est-pas-la-bonne-cle' } };
  const m = await rpc(`select public.noter_journee(current_date, 'rien', 0, '{}', '') as x`, [], mauvaise);
  verifier('une fausse clé est refusée', m.x.ok === false && m.x.erreur === 'acces_refuse');
}

titre("Sans connexion, aucune fonction d'écriture ne marche");
{
  await echoue('poser une question est réservé aux comptes',
    () => rpc(`select public.assistante_poser('Bonjour')`, [], anon), 'permission');
  await echoue('noter sa journée est réservé aux comptes',
    () => rpc(`select public.noter_journee(current_date, 'rien', 0, '{}', '')`, [], anon), 'permission');
  await echoue('commander est réservé aux comptes',
    () => rpc(`select public.passer_commande('[]'::jsonb, 'X', '70000000', 'Y', '')`, [], anon), 'permission');
  await echoue('lire son cycle est réservé aux comptes',
    () => rpc(`select public.mon_cycle()`, [], anon), 'permission');
}

titre("On n'écrit pas dans le fil d'une autre, même avec l'identifiant du message");
{
  const id = (await rpc(`select id from public.assistante_messages where profil_id = auth.uid() limit 1`)).id;
  const r = await rpc(`select public.assistante_repondre($1, 'Réponse injectée par une autre', null, 0, 0) as x`, [id], sFati);
  verifier('Fatimata ne peut pas répondre dans le fil d\'Awa', r.x.ok === false && r.x.erreur === 'message_inconnu');
  const toujours = await rpc(`select reponse from public.assistante_messages where id = $1`, [id]);
  verifier('la question d\'Awa reste sans réponse', toujours.reponse === null);
}

titre("On n'annule pas la commande d'une autre");
{
  const numero = (await rpc(`select numero from public.commandes where profil_id = auth.uid() limit 1`)).numero;
  const r = await rpc(`select public.annuler_ma_commande($1) as x`, [numero], sFati);
  verifier('la commande d\'Awa est introuvable pour Fatimata', r.x.ok === false && r.x.erreur === 'commande_inconnue');
  const etat = await rpc(`select etat::text from public.commandes where numero = $1`, [numero]);
  verifier('la commande est intacte', etat.etat === 'nouvelle');
}

titre("Effacer ses données n'efface que les siennes");
{
  await rpc(`select public.noter_journee(current_date, 'leger', 1, '{}', 'À moi') as x`, [], sFati);
  await rpc(`select public.effacer_mes_donnees() as x`, [], sFati);
  const awaEncore = await rpc(`select count(*)::int as n from public.journal`);
  verifier("le journal d'Awa est intact", awaEncore.n === 1, `${awaEncore.n} lignes`);
  const fatiVide = await rpc(`select count(*)::int as n from public.journal`, [], sFati);
  verifier('celui de Fatimata est vide', fatiVide.n === 0);
}

titre('Les quotas tiennent, et ne se contournent pas en changeant d\'adresse');
{
  const mimi = await nouveauCompte(db, 'mimi', 'Mariam');
  const s = { role: 'authenticated', sub: mimi, ip: '41.78.1.1' };
  const panier = JSON.stringify([{ slug: 'serviettes-jour-10', quantite: 1 }]);
  let refusee = 0;
  for (let i = 0; i < 7; i += 1) {
    const r = await rpc(`select public.passer_commande($1::jsonb, 'Mariam', '76000000', 'Tanghin', '') as x`, [panier], s);
    if (r.x.ok === false && r.x.erreur === 'trop_de_commandes') refusee += 1;
  }
  verifier('au-delà de 5 commandes par heure, on refuse', refusee === 2, `${refusee} refus`);

  // L'attaque prouvée par Cyber le 12 octobre 2026 : les quotas comptaient par
  // adresse IP, et l'adresse arrive dans un en-tête que la visiteuse écrit
  // elle-même. En changeant d'adresse à chaque requête, douze commandes sur
  // douze passaient et le stock des serviettes tombait de 80 à 20. Depuis la
  // migration 20261012110000, le compteur est posé sur le compte connecté.
  const stockAvant = (await rpc(`select stock from public.produits where slug = 'serviettes-jour-10'`)).stock;
  let passees = 0;
  for (let i = 0; i < 12; i += 1) {
    const autre = { role: 'authenticated', sub: mimi, ip: `41.78.9.${i}` };
    const r = await rpc(`select public.passer_commande($1::jsonb, 'Mariam', '76000000', 'Tanghin', '') as x`, [panier], autre);
    if (r.x.ok === true) passees += 1;
  }
  verifier("changer d'adresse ne rouvre pas le droit de commander", passees === 0, `${passees} commandes passées`);
  const stockApres = (await rpc(`select stock from public.produits where slug = 'serviettes-jour-10'`)).stock;
  verifier('le stock est intact après les douze tentatives', stockApres === stockAvant, `${stockAvant} puis ${stockApres}`);

  // Et une autre femme, sur la même adresse, n'est pas punie pour autant : au
  // Burkina une seule adresse est partagée par des milliers d'abonnés.
  const salma = await nouveauCompte(db, 'salma', 'Salma');
  const voisine = { role: 'authenticated', sub: salma, ip: '41.78.1.1' };
  const r2 = await rpc(`select public.passer_commande($1::jsonb, 'Salma', '76000001', 'Tanghin', '') as x`, [panier], voisine);
  verifier("une voisine sur la même adresse peut commander", r2.x.ok === true, JSON.stringify(r2.x));
}

titre('Le numéro de commande ne donne aucun droit');
{
  // Les numéros sont une suite : MD-2610-00001, 00002… Ils sont devinables, et
  // c'est voulu. Ils n'authentifient jamais.
  const r = await rpc(`select count(*)::int as n from public.commandes where numero like 'MD-%'`, [], sFati);
  verifier('deviner un numéro ne montre rien', r.n === 0);
  await echoue(
    'la suite des numéros ne se fait pas avancer de dehors',
    () => rpc(`select nextval('public.numero_commande_seq')`),
    'permission'
  );
}

bilan('Sécurité');
await db.close();

// ---------------------------------------------------------------------------
// Une base dont l'empreinte de clé serveur n'est pas déposée
// ---------------------------------------------------------------------------
// L'attaque prouvée par Cyber le 12 octobre 2026 : appel_du_site() renvoyait
// « vrai » dès que l'empreinte était vide, pour que l'installation soit
// possible. Un appel direct à l'API, sans aucun en-tête du site, enregistrait
// alors un questionnaire, passait une commande et faisait travailler
// l'assistante aux frais d'Arthur.
const nue = await nouvelleBase({ cleServeur: false });
const zara = await nouveauCompte(nue, 'zara', 'Zara');
const direct = { role: 'authenticated', sub: zara, entetes: null };
const avecEntetes = { role: 'authenticated', sub: zara };
const rpcNue = async (sql, params = [], session = direct) => (await commeApi(nue, session, sql, params)).rows[0];

titre("Sans empreinte déposée, l'API n'écrit plus rien");
{
  const q = await rpcNue(`select public.enregistrer_questionnaire('Pirate', 25, 4, current_date - 2) as x`);
  verifier('le questionnaire est refusé', q.x.ok === false && q.x.erreur === 'acces_refuse', JSON.stringify(q.x));
  const c = await rpcNue(`select public.passer_commande($1::jsonb, 'Pirate', '70000000', 'Zogona', '') as x`,
    [JSON.stringify([{ slug: 'serviettes-nuit-10', quantite: 3 }])]);
  verifier('la commande est refusée', c.x.ok === false && c.x.erreur === 'acces_refuse', JSON.stringify(c.x));
  const a = await rpcNue(`select public.assistante_poser('question gratuite') as x`);
  verifier("la question à l'assistante est refusée", a.x.ok === false && a.x.erreur === 'acces_refuse', JSON.stringify(a.x));
  const n = await rpcNue(`select public.noter_journee(current_date, 'leger', 1, '{}', '') as x`);
  verifier('la note du journal est refusée', n.x.ok === false && n.x.erreur === 'acces_refuse');

  // Même avec les en-têtes du site : sans empreinte en base, rien ne prouve
  // rien, donc on refuse aussi.
  const e = await rpcNue(`select public.noter_journee(current_date, 'leger', 1, '{}', '') as x`, [], avecEntetes);
  verifier("les en-têtes du site ne suffisent pas sans empreinte", e.x.ok === false && e.x.erreur === 'acces_refuse');

  // En revanche, l'installation à la main doit rester possible : dans
  // l'éditeur SQL du tableau de bord, il n'y a aucun en-tête de requête.
  await commeServeur(nue, `select set_config('request.headers', '', false)`);
  const installation = (await commeServeur(nue, `select public.appel_du_site() as v`)).rows[0];
  verifier("sans aucun en-tête, l'installation reste possible", installation.v === true, JSON.stringify(installation));

  // Mais dès qu'il y a des en-têtes, c'est un appel de l'API : refusé.
  await commeServeur(nue, `select set_config('request.headers', '{"x-md-cle":"une-cle-inventee"}', false)`);
  const parLApi = (await commeServeur(nue, `select public.appel_du_site() as v`)).rows[0];
  verifier("un appel de l'API sans empreinte est refusé", parLApi.v === false, JSON.stringify(parLApi));
  await commeServeur(nue, `select set_config('request.headers', '', false)`);

  const stock = (await commeServeur(nue, `select stock from public.produits where slug = 'serviettes-nuit-10'`)).rows[0];
  verifier('aucun stock n’a bougé', stock.stock === 60, `stock ${stock.stock}`);
}

bilan('Clé du serveur non déposée');
await nue.close();
