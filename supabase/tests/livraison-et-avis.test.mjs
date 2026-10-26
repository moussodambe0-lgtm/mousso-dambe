/**
 * Le livreur, son lien, et les avis d'après livraison.
 *
 * Deux chantiers demandés par Arthur le 26 octobre 2026 au soir, et deux
 * endroits où se tromper coûte cher :
 *
 *   1. le lien du livreur donne accès à l'ADRESSE et au POINT GPS du domicile
 *      d'une femme. Ce fichier vérifie qu'il ne donne que ça, qu'il ne répond
 *      qu'au bon moment, et qu'il se tait dès que la course est finie ;
 *   2. un avis ne peut exister que derrière une commande livrée, sinon la note
 *      d'un produit ne veut plus rien dire, dans les deux sens.
 */
import { nouvelleBase, commeApi, commeServeur, nouveauCompte, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const lea = await nouveauCompte(db, 'lea', 'Lea');
await commeServeur(db, `update auth.users set email_confirmed_at = now()`);
const api = (sub) => (sql, p = []) => commeApi(db, { role: 'authenticated', sub }, sql, p);
const anonyme = (sql, p = []) => commeApi(db, { role: 'anon' }, sql, p);
const A = api(awa);
const L = api(lea);
const j = (v) => JSON.stringify(v);

const SLUG = 'serviettes-jour-10';
const AUTRE = 'serviettes-nuit-10';
const panier = (slug = SLUG, q = 1) => JSON.stringify([{ slug, quantite: q }]);

/** Passer une commande au nom de quelqu'un, et rendre son numéro. */
async function commander(appel, qui, slug = SLUG) {
  await commeServeur(db, `delete from public.quotas`);
  const r = await appel(
    `select public.passer_commande($1::jsonb, 'Awa K', '70112233', 'Dassasgho', 'pres du marche', 12.37, -1.52, true) r`,
    [panier(slug)]
  );
  if (!r.rows[0].r?.ok) throw new Error('commande refusee : ' + j(r.rows[0].r));
  return (
    await commeServeur(db, `select numero from public.commandes where profil_id=$1 order by cree_le desc limit 1`, [qui])
  ).rows[0].numero;
}

const idDe = async (numero) =>
  (await commeServeur(db, `select id from public.commandes where numero=$1`, [numero])).rows[0].id;

// Arthur est administrateur, Awa et Lea ne le sont pas.
const arthur = await nouveauCompte(db, 'arthur', 'Arthur');
await commeServeur(db, `insert into public.administrateurs (profil_id) values ($1) on conflict do nothing`, [arthur]);
const AD = api(arthur);

// ---------------------------------------------------------------------------
titre('1. On ne confie pas un colis sans dire a qui');
// ---------------------------------------------------------------------------
let numero1;
{
  numero1 = await commander(A, awa);
  const id = await idDe(numero1);

  const sansRien = await AD(`select public.changer_etat_commande($1, 'envoyee') r`, [id]);
  verifier('expedier sans livreur est refuse',
    sansRien.rows[0].r?.erreur === 'livreur_nom_manquant', j(sansRien.rows[0].r));

  const sansTel = await AD(`select public.changer_etat_commande($1, 'envoyee', 'Issa', null) r`, [id]);
  verifier('et sans son numero aussi',
    sansTel.rows[0].r?.erreur === 'livreur_telephone_invalide', j(sansTel.rows[0].r));

  const telFaux = await AD(`select public.changer_etat_commande($1, 'envoyee', 'Issa', '12') r`, [id]);
  verifier('un numero qui n en est pas un est refuse',
    telFaux.rows[0].r?.erreur === 'livreur_telephone_invalide', j(telFaux.rows[0].r));

  const etat = (await commeServeur(db, `select etat from public.commandes where id=$1`, [id])).rows[0].etat;
  verifier('et la commande n a pas bouge', etat === 'nouvelle', etat);

  // Le raccourci a deux arguments existe pour que le code deja deploye
  // continue de repondre pendant la bascule. Il ne doit ouvrir aucune porte :
  // expedier par lui, c'est expedier sans livreur, donc c'est refuse.
  const parLeRaccourci = await AD(`select public.changer_etat_commande($1, 'envoyee') r`, [id]);
  verifier('le raccourci a deux arguments n ouvre pas de porte derobee',
    parLeRaccourci.rows[0].r?.erreur === 'livreur_nom_manquant', j(parLeRaccourci.rows[0].r));
  // Mais il marche pour tout le reste, sinon il ne servirait a rien.
  const prepare = await AD(`select public.changer_etat_commande($1, 'preparee') r`, [id]);
  verifier('et il marche pour les autres etats', prepare.rows[0].r?.ok === true, j(prepare.rows[0].r));

  const ok = await AD(`select public.changer_etat_commande($1, 'envoyee', '  Issa Ouedraogo  ', '+226 70 11 22 33') r`, [id]);
  verifier('avec un nom et un numero, ca passe', ok.rows[0].r?.ok === true, j(ok.rows[0].r));
  verifier('et un jeton est rendu', typeof ok.rows[0].r?.jeton === 'string' && ok.rows[0].r.jeton.length === 48,
    String(ok.rows[0].r?.jeton).length + ' caracteres');

  const c = (await commeServeur(db,
    `select livreur_nom, livreur_telephone, livreur_jeton, livreur_jeton_le, livreur_vu_le, etat
       from public.commandes where id=$1`, [id])).rows[0];
  verifier('le nom est range sans ses espaces', c.livreur_nom === 'Issa Ouedraogo', j(c.livreur_nom));
  verifier('l indicatif du pays est retire du numero', c.livreur_telephone === '70112233', j(c.livreur_telephone));
  verifier('la commande est bien expediee', c.etat === 'envoyee', c.etat);
  verifier('le jeton est date', c.livreur_jeton_le !== null, j(c.livreur_jeton_le));
  verifier('et personne n a encore ouvert le lien', c.livreur_vu_le === null, j(c.livreur_vu_le));
}

// ---------------------------------------------------------------------------
titre('2. Personne d autre ne peut expedier');
// ---------------------------------------------------------------------------
{
  const numero = await commander(L, lea);
  const id = await idDe(numero);
  const elle = await L(`select public.changer_etat_commande($1, 'envoyee', 'Issa', '70112233') r`, [id]);
  verifier('une cliente ne peut pas expedier sa propre commande',
    elle.rows[0].r?.erreur === 'acces_refuse', j(elle.rows[0].r));
  let refus = null;
  try { await anonyme(`select public.changer_etat_commande($1, 'envoyee', 'Issa', '70112233') r`, [id]); }
  catch (e) { refus = e.message; }
  verifier('et un visiteur sans compte n y a meme pas acces',
    /permission|denied/i.test(refus ?? ''), String(refus).slice(0, 80));
}

// ---------------------------------------------------------------------------
titre('3. Le lien du livreur montre ce qu il faut, et rien de plus');
// ---------------------------------------------------------------------------
let jeton1;
{
  const id = await idDe(numero1);
  jeton1 = (await commeServeur(db, `select livreur_jeton from public.commandes where id=$1`, [id])).rows[0].livreur_jeton;

  const r = await anonyme(`select public.suivi_livreur($1) r`, [jeton1]);
  const vu = r.rows[0].r;
  verifier('le lien repond sans aucun compte', vu?.ok === true, j(vu).slice(0, 90));
  verifier('il donne le nom de livraison', vu?.nom === 'Awa K', j(vu?.nom));
  verifier('le numero a appeler', vu?.telephone === '70112233', j(vu?.telephone));
  verifier('le quartier et le repere', vu?.quartier === 'Dassasgho' && vu?.repere === 'pres du marche', j(vu?.quartier));
  verifier('le point GPS', Number(vu?.lat) === 12.37 && Number(vu?.lng) === -1.52, j([vu?.lat, vu?.lng]));
  verifier('la somme a encaisser', Number(vu?.total_cfa) > 0, j(vu?.total_cfa));
  verifier('et ce qu il porte', Array.isArray(vu?.articles) && vu.articles.length === 1, j(vu?.articles));
  verifier('sans le prix unitaire des articles', !j(vu?.articles).includes('prix'), j(vu?.articles));

  // CE QU IL NE DOIT JAMAIS VOIR. La meme base contient son journal, ses
  // cycles et ses questions de sante : le lien d une course n ouvre rien de
  // tout cela, et ce test le dit par ecrit.
  const texte = j(vu);
  for (const interdit of ['journal', 'cycle', 'regles', 'assistante', 'prenom', 'email', 'profil_id', 'jeton'])
    verifier(`le mot « ${interdit} » n apparait pas`, !texte.includes(interdit), texte.slice(0, 80));

  // Et il ne peut pas se servir ailleurs avec son jeton. La table elle-meme
  // lui est fermee : ce n'est pas « il voit zero ligne », c'est « il n'a pas
  // le droit de regarder », ce qui est mieux.
  let refus = null;
  try { await anonyme(`select * from public.commandes limit 1`); } catch (e) { refus = e.message; }
  verifier('la table des commandes lui est fermee', /permission denied/i.test(refus ?? ''),
    String(refus).slice(0, 70));
  let refus2 = null;
  try { await anonyme(`select count(*) from public.profils`); } catch (e) { refus2 = e.message; }
  verifier('celle des profils aussi', /permission denied/i.test(refus2 ?? ''), String(refus2).slice(0, 70));

  const encore = await anonyme(`select public.suivi_livreur($1) r`, [jeton1]);
  verifier('le lien se rouvre autant de fois qu il veut', encore.rows[0].r?.ok === true, j(encore.rows[0].r?.ok));
  const vuLe = (await commeServeur(db, `select livreur_vu_le from public.commandes where id=$1`, [id])).rows[0];
  verifier('et la premiere ouverture est datee', vuLe.livreur_vu_le !== null, j(vuLe.livreur_vu_le));
}

// ---------------------------------------------------------------------------
titre('4. Un lien invente ou perime ne donne rien');
// ---------------------------------------------------------------------------
{
  for (const [quoi, valeur] of [
    ['vide', ''],
    ['trop court', 'abc'],
    ['de la bonne longueur mais invente', 'a'.repeat(48)],
    ['un numero de commande', numero1],
  ]) {
    const r = await anonyme(`select public.suivi_livreur($1) r`, [valeur]);
    verifier(`un jeton ${quoi} est refuse`, r.rows[0].r?.ok !== true, j(r.rows[0].r));
  }

  // Deux jours plus tard, le lien se tait tout seul.
  const id = await idDe(numero1);
  await commeServeur(db, `update public.commandes set livreur_jeton_le = now() - interval '49 hours' where id=$1`, [id]);
  const vieux = await anonyme(`select public.suivi_livreur($1) r`, [jeton1]);
  verifier('un lien de plus de 48 heures est perime',
    vieux.rows[0].r?.erreur === 'lien_expire', j(vieux.rows[0].r));
  await commeServeur(db, `update public.commandes set livreur_jeton_le = now() where id=$1`, [id]);
}

// ---------------------------------------------------------------------------
titre('5. Livree, le lien meurt dans la seconde');
// ---------------------------------------------------------------------------
{
  const id = await idDe(numero1);
  const r = await AD(`select public.changer_etat_commande($1, 'livree') r`, [id]);
  verifier('la commande passe a livree', r.rows[0].r?.ok === true, j(r.rows[0].r));

  const mort = await anonyme(`select public.suivi_livreur($1) r`, [jeton1]);
  verifier('et le lien ne repond plus', mort.rows[0].r?.ok !== true, j(mort.rows[0].r));

  const c = (await commeServeur(db, `select livreur_jeton, livreur_nom from public.commandes where id=$1`, [id])).rows[0];
  verifier('le jeton est efface de la base', c.livreur_jeton === null, j(c.livreur_jeton));
  verifier('mais elle sait toujours qui a livre', c.livreur_nom === 'Issa Ouedraogo', j(c.livreur_nom));
}

// ---------------------------------------------------------------------------
titre('6. Elle voit qui porte son colis, jamais le jeton');
// ---------------------------------------------------------------------------
{
  const mes = await A(`select public.mes_commandes() r`);
  const texte = j(mes.rows[0].r);
  verifier('sa liste nomme le livreur', texte.includes('Issa Ouedraogo'), texte.slice(0, 100));
  verifier('et donne son numero', texte.includes('70112233'), 'numero absent');
  verifier('le jeton n y est jamais', !texte.includes('livreur_jeton') && !texte.includes(jeton1),
    'un jeton se promene dans la page de la cliente');
  verifier('et elle ne voit que ses commandes',
    (await L(`select public.mes_commandes() r`)).rows[0].r.every((c) => c.numero !== numero1), 'fuite entre clientes');
}

// ---------------------------------------------------------------------------
titre('7. Elle peut preciser sa position tant que le colis roule');
// ---------------------------------------------------------------------------
{
  const numero = await commander(A, awa, AUTRE);
  const id = await idDe(numero);

  const hors = await A(`select public.preciser_ma_position($1, 48.85, 2.35) r`, [numero]);
  verifier('un point hors du Burkina est refuse',
    hors.rows[0].r?.erreur === 'position_hors_zone', j(hors.rows[0].r));

  const ok = await A(`select public.preciser_ma_position($1, 12.40, -1.49) r`, [numero]);
  verifier('un point du Burkina est accepte', ok.rows[0].r?.ok === true, j(ok.rows[0].r));
  const c = (await commeServeur(db, `select position_lat from public.commandes where id=$1`, [id])).rows[0];
  verifier('la commande porte le nouveau point', Number(c.position_lat) === 12.4, j(c.position_lat));
  const p = (await commeServeur(db, `select position_lat from public.profils where id=$1`, [awa])).rows[0];
  verifier('et son profil aussi, pour la prochaine fois', Number(p.position_lat) === 12.4, j(p.position_lat));

  const chezLautre = await L(`select public.preciser_ma_position($1, 12.41, -1.48) r`, [numero]);
  verifier('une autre ne peut pas deplacer sa commande',
    chezLautre.rows[0].r?.erreur === 'commande_inconnue', j(chezLautre.rows[0].r));

  await commeServeur(db, `update public.commandes set etat='livree', livree_le=now() where id=$1`, [id]);
  const apres = await A(`select public.preciser_ma_position($1, 12.42, -1.47) r`, [numero]);
  verifier('et une commande deja livree ne se deplace plus',
    apres.rows[0].r?.erreur === 'commande_inconnue', j(apres.rows[0].r));
}

// ---------------------------------------------------------------------------
titre('8. Un avis se merite : une commande a soi, et livree');
// ---------------------------------------------------------------------------
let numeroLivre;
{
  // Une commande encore en preparation : pas d'avis.
  const enCours = await commander(A, awa);
  const refusEnCours = await A(`select public.deposer_avis($1, $2, 5, 'tres bien') r`, [enCours, SLUG]);
  verifier('on ne note pas une commande qu on n a pas recue',
    refusEnCours.rows[0].r?.erreur === 'commande_non_livree', j(refusEnCours.rows[0].r));

  await commeServeur(db, `update public.commandes set etat='livree', livree_le=now() where numero=$1`, [enCours]);
  numeroLivre = enCours;

  const pasAMoi = await L(`select public.deposer_avis($1, $2, 5, 'bien') r`, [numeroLivre, SLUG]);
  verifier('on ne note pas la commande de quelqu un d autre',
    pasAMoi.rows[0].r?.erreur === 'commande_non_livree', j(pasAMoi.rows[0].r));

  const horsCommande = await A(`select public.deposer_avis($1, $2, 5, 'bien') r`, [numeroLivre, 'kit-premieres-regles']);
  verifier('ni un produit qui n etait pas dans le colis',
    horsCommande.rows[0].r?.erreur === 'produit_hors_commande', j(horsCommande.rows[0].r));

  for (const note of [0, 6, null]) {
    const r = await A(`select public.deposer_avis($1, $2, $3::int, null) r`, [numeroLivre, SLUG, note]);
    verifier(`une note de ${j(note)} est refusee`, r.rows[0].r?.erreur === 'note_invalide', j(r.rows[0].r));
  }

  const bon = await A(`select public.deposer_avis($1, $2, 4, '   Bonne tenue la nuit.   ') r`, [numeroLivre, SLUG]);
  verifier('un avis sur son propre colis livre passe', bon.rows[0].r?.ok === true, j(bon.rows[0].r));
  const a = (await commeServeur(db, `select note, texte from public.avis where commande_id=(select id from public.commandes where numero=$1)`, [numeroLivre])).rows[0];
  verifier('la note est rangee', Number(a.note) === 4, j(a.note));
  verifier('et le texte sans ses espaces', a.texte === 'Bonne tenue la nuit.', j(a.texte));

  // Elle peut se corriger, mais pas en empiler dix.
  const encore = await A(`select public.deposer_avis($1, $2, 2, 'finalement non') r`, [numeroLivre, SLUG]);
  verifier('un deuxieme avis corrige le premier', encore.rows[0].r?.ok === true, j(encore.rows[0].r));
  const combien = (await commeServeur(db, `select count(*)::int n from public.avis`)).rows[0];
  verifier('et il n y en a toujours qu un', Number(combien.n) === 1, j(combien));
  const corrige = (await commeServeur(db, `select note, texte from public.avis limit 1`)).rows[0];
  verifier('avec la nouvelle note', Number(corrige.note) === 2 && corrige.texte === 'finalement non', j(corrige));
}

// ---------------------------------------------------------------------------
titre('9. Les avis s affichent sans nommer personne');
// ---------------------------------------------------------------------------
{
  const r = await anonyme(`select public.avis_du_produit($1) r`, [SLUG]);
  const v = r.rows[0].r;
  verifier('la fiche produit montre ses avis sans compte', Number(v?.nombre) === 1, j(v?.nombre));
  verifier('avec la moyenne', Number(v?.moyenne) === 2, j(v?.moyenne));
  verifier('et la repartition des notes', j(v?.repartition) === '{"2":1}', j(v?.repartition));

  // LE POINT LE PLUS IMPORTANT DE CE FICHIER. Le catalogue est fait de
  // serviettes et de culottes menstruelles : un avis signe d un prenom et d un
  // quartier dirait publiquement que cette personne a ses regles et ce qu elle
  // utilise. Rien ne doit relier un avis a quelqu un.
  const texte = j(v);
  for (const interdit of ['Awa', 'profil', 'Dassasgho', 'telephone', 'commande', 'numero'])
    verifier(`« ${interdit} » n apparait pas dans les avis publics`, !texte.includes(interdit), texte.slice(0, 110));

  const vide = await anonyme(`select public.avis_du_produit('kit-premieres-regles') r`);
  verifier('un produit sans avis rend zero, pas une erreur',
    Number(vide.rows[0].r?.nombre) === 0, j(vide.rows[0].r?.nombre));
  verifier('et aucune moyenne inventee', vide.rows[0].r?.moyenne === null, j(vide.rows[0].r?.moyenne));
}

// ---------------------------------------------------------------------------
titre('10. Les photos d un avis');
// ---------------------------------------------------------------------------
{
  const avis = (await commeServeur(db, `select id from public.avis limit 1`)).rows[0].id;
  const image = Buffer.alloc(900, 3).toString('base64');

  const chezLautre = await L(`select public.ajouter_photo_avis($1, $2, 'image/jpeg') r`, [avis, image]);
  verifier('on n ajoute pas une photo a l avis d une autre',
    chezLautre.rows[0].r?.erreur === 'avis_inconnu', j(chezLautre.rows[0].r));

  const typeFaux = await A(`select public.ajouter_photo_avis($1, $2, 'text/html') r`, [avis, image]);
  verifier('un type de fichier invente est refuse',
    typeFaux.rows[0].r?.erreur === 'type_refuse', j(typeFaux.rows[0].r));

  const trop = Buffer.alloc(400001, 1).toString('base64');
  const lourde = await A(`select public.ajouter_photo_avis($1, $2, 'image/jpeg') r`, [avis, trop]);
  verifier('une photo de plus de 400 Ko est refusee',
    lourde.rows[0].r?.erreur === 'image_trop_lourde', j(lourde.rows[0].r));

  for (let i = 1; i <= 3; i++) {
    const r = await A(`select public.ajouter_photo_avis($1, $2, 'image/jpeg') r`, [avis, image]);
    verifier(`la photo ${i} passe`, r.rows[0].r?.ok === true, j(r.rows[0].r));
  }
  const quatre = await A(`select public.ajouter_photo_avis($1, $2, 'image/jpeg') r`, [avis, image]);
  verifier('la quatrieme est refusee', quatre.rows[0].r?.erreur === 'trop_de_photos', j(quatre.rows[0].r));

  const liste = await anonyme(`select public.avis_du_produit($1) r`, [SLUG]);
  verifier('les photos sont annoncees avec l avis',
    (liste.rows[0].r?.liste?.[0]?.photos ?? []).length === 3, j(liste.rows[0].r?.liste?.[0]?.photos));

  const id = liste.rows[0].r.liste[0].photos[0];
  const ph = await anonyme(`select public.photo_avis($1) r`, [id]);
  verifier('et chacune se sert par son identifiant', ph.rows[0].r?.type === 'image/jpeg', j(ph.rows[0].r?.type));
  verifier('avec ses octets', typeof ph.rows[0].r?.base64 === 'string' && ph.rows[0].r.base64.length > 100,
    String(ph.rows[0].r?.base64).length + ' caracteres');
}

// ---------------------------------------------------------------------------
titre('11. Ce qu il lui reste a noter');
// ---------------------------------------------------------------------------
{
  const r = await A(`select public.mes_avis_a_donner() r`);
  const liste = r.rows[0].r ?? [];
  verifier('le produit deja note n y est plus',
    !liste.some((x) => x.numero === numeroLivre && x.slug === SLUG), j(liste).slice(0, 120));
  verifier('mais les autres colis recus y sont', liste.length > 0, j(liste.length));
  const chezLea = (await L(`select public.mes_avis_a_donner() r`)).rows[0].r ?? [];
  verifier('et chacune ne voit que les siens',
    !chezLea.some((x) => x.numero === numeroLivre), j(chezLea).slice(0, 80));
}

bilan('Le livreur, son lien, et les avis');
