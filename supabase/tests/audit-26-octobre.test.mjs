/**
 * Les attaques de l'audit du 26 octobre 2026, rejouées.
 *
 * Chaque vérification de ce fichier a d'abord ÉCHOUÉ sur la base d'avant les
 * migrations 20261026150000 à 20261026180000. C'est tout l'intérêt : si l'une
 * d'elles redevient rouge un jour, c'est qu'un correctif a été défait.
 *
 *   1. la voix passait par une porte que le texte n'avait plus ;
 *   2. deux fois le même geste faisaient deux commandes et deux fois le stock ;
 *   3. une position hors du Burkina faisait passer une commande sans adresse ;
 *   4. un numéro avec l'indicatif du pays était refusé ;
 *   5. « Effacer mes données » gardait les réponses du questionnaire ;
 *   5 bis. et gardait l'adresse, le numéro et la position GPS, dans le
 *      profil comme dans chaque commande déjà livrée ;
 *   6. le message d'erreur de Postgres sortait de la fonction.
 */
import { nouvelleBase, commeApi, commeServeur, nouveauCompte, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const zara = await nouveauCompte(db, 'zara', 'Zara');
const lea = await nouveauCompte(db, 'lea', 'Lea');
await commeServeur(db, `update auth.users set email_confirmed_at = now()`);
const api = (sub) => (sql, p = []) => commeApi(db, { role: 'authenticated', sub }, sql, p);
const Z = api(zara);
const L = api(lea);
const j = (v) => JSON.stringify(v);

/** Les lignes d'un fichier qui contiennent un mot, pour expliquer un echec. */
const lignesAvec = (texte, mot) =>
  texte.split(String.fromCharCode(10)).filter((x) => x.includes(mot)).join(' | ').slice(0, 120);

const SANS_TAILLE = 'serviettes-jour-10';
const panier = (q = 1, slug = SANS_TAILLE, taille = null) =>
  JSON.stringify([taille ? { slug, quantite: q, taille } : { slug, quantite: q }]);
const son = Buffer.alloc(900, 7).toString('base64');
const stock = async () =>
  Number((await commeServeur(db, `select stock from public.produits where slug=$1`, [SANS_TAILLE])).rows[0].stock);
const combien = async (quoi, qui = zara) =>
  Number((await commeServeur(db, `select count(*)::int n from public.${quoi} where profil_id=$1`, [qui])).rows[0].n);
const commander = (appel, p, nom = 'Zara', tel = '70000000', lat = null, lng = null) =>
  appel(`select public.passer_commande($1::jsonb, $2, $3, 'Dassasgho', 'pres du marche', $4, $5, true) r`,
    [p, nom, tel, lat, lng]);

// ---------------------------------------------------------------------------
titre('1. La voix passe par la même porte que le texte');
// ---------------------------------------------------------------------------
{
  const reglage = (await commeServeur(db, `select valeur from public.reglages where cle='medecin_actif'`)).rows[0];
  verifier('le fil du médecin est fermé au départ', reglage.valeur === 'non', j(reglage));

  const txt = await Z(`select public.ecrire_a('medecin','Docteur, une question intime') r`);
  verifier('le texte au médecin est refusé', j(txt.rows[0].r).includes('medecin_bientot'), j(txt.rows[0].r));

  // Les trois façons d'atteindre le médecin par la voix : nommé, par défaut,
  // et par un sujet inconnu qui retombe sur « medecin ».
  for (const [args, nom] of [
    [`$1,'audio/webm',12,'medecin'`, 'sujet nommé'],
    [`$1,'audio/webm',12`, 'sujet omis (le défaut est « medecin »)'],
    [`$1,'audio/webm',12,'nimportequoi'`, 'sujet inconnu'],
  ]) {
    const r = await Z(`select public.envoyer_vocal(${args}) r`, [son]);
    verifier(`vocal refusé : ${nom}`, j(r.rows[0].r).includes('medecin_bientot'), j(r.rows[0].r).slice(0, 110));
  }

  const filsMedecin = Number(
    (await commeServeur(db, `select count(*)::int n from public.fils where sujet='medecin'`)).rows[0].n
  );
  verifier('aucun fil médecin ouvert', filsMedecin === 0, `n=${filsMedecin}`);
  const voix = Number((await commeServeur(db, `select count(*)::int n from public.vocaux`)).rows[0].n);
  verifier('aucune voix rangée en base', voix === 0, `n=${voix}`);

  const bq = await Z(`select public.envoyer_vocal($1,'audio/webm',12,'boutique') r`, [son]);
  verifier('la boutique reste ouverte à la voix', bq.rows[0].r?.ok === true, j(bq.rows[0].r).slice(0, 110));

  // Et le jour où un médecin répond, les deux s'ouvrent du même geste.
  await commeServeur(db, `update public.reglages set valeur='oui' where cle='medecin_actif'`);
  const vOui = await Z(`select public.envoyer_vocal($1,'audio/webm',12,'medecin') r`, [son]);
  const tOui = await Z(`select public.ecrire_a('medecin','bonjour docteur') r`);
  verifier('réglage à oui : la voix passe', vOui.rows[0].r?.ok === true, j(vOui.rows[0].r).slice(0, 90));
  verifier('réglage à oui : le texte passe', tOui.rows[0].r?.ok === true, j(tOui.rows[0].r).slice(0, 90));
  await commeServeur(db, `update public.reglages set valeur='non' where cle='medecin_actif'`);
  await commeServeur(db, `delete from public.fils where sujet='medecin'`);

  // Le format reste une liste blanche : pas moyen de servir une page web.
  for (const t of ['text/html', 'image/svg+xml', 'application/javascript', 'AUDIO/WEBM']) {
    const r = await Z(`select public.envoyer_vocal($1,$2,12,'boutique') r`, [son, t]);
    verifier(`type ${JSON.stringify(t)} refusé`, !r.rows[0].r?.ok, j(r.rows[0].r).slice(0, 80));
  }
}

// ---------------------------------------------------------------------------
titre('2. Deux fois le même geste ne font qu une commande');
// ---------------------------------------------------------------------------
{
  await commeServeur(db, `delete from public.quotas`);
  await commeServeur(db, `update public.produits set stock = 80 where slug=$1`, [SANS_TAILLE]);
  const avant = await combien('commandes');
  const stockAvant = await stock();

  const a = await commander(Z, panier(2));
  const b = await commander(Z, panier(2));
  verifier('le premier envoi passe', a.rows[0].r?.ok === true, j(a.rows[0].r).slice(0, 90));
  verifier('le second rend le MÊME numéro', a.rows[0].r?.numero === b.rows[0].r?.numero,
    `${a.rows[0].r?.numero} / ${b.rows[0].r?.numero}`);
  verifier('le second se dit rejoué', b.rows[0].r?.rejouee === true, j(b.rows[0].r));
  verifier('une seule commande en base', (await combien('commandes')) - avant === 1,
    `+${(await combien('commandes')) - avant}`);
  verifier('le stock retiré une seule fois', stockAvant - (await stock()) === 2,
    `${stockAvant} -> ${await stock()}`);

  // Dix appuis affolés : toujours une seule commande.
  for (let i = 0; i < 10; i++) await commander(Z, panier(2));
  verifier('dix envois identiques : toujours une seule commande',
    (await combien('commandes')) - avant === 1, `+${(await combien('commandes')) - avant}`);

  // L'ordre des lignes ne doit pas tromper l'empreinte.
  const deuxLignes = (ordre) =>
    JSON.stringify(ordre === 1
      ? [{ slug: SANS_TAILLE, quantite: 1 }, { slug: 'culotte-flux-abondant', quantite: 1, taille: 'M' }]
      : [{ slug: 'culotte-flux-abondant', quantite: 1, taille: 'M' }, { slug: SANS_TAILLE, quantite: 1 }]);
  await commeServeur(db, `delete from public.quotas`);
  const n1 = await commander(Z, deuxLignes(1));
  const n2 = await commander(Z, deuxLignes(2));
  verifier('le même panier dans un autre ordre est reconnu',
    n1.rows[0].r?.numero === n2.rows[0].r?.numero && n2.rows[0].r?.rejouee === true,
    `${j(n1.rows[0].r).slice(0, 60)} / ${j(n2.rows[0].r).slice(0, 70)}`);

  // Un panier VRAIMENT différent passe : on n'a pas bloqué la boutique.
  await commeServeur(db, `delete from public.quotas`);
  const autre = await commander(Z, panier(5));
  verifier('un panier différent crée bien une commande',
    autre.rows[0].r?.ok === true && !autre.rows[0].r?.rejouee, j(autre.rows[0].r).slice(0, 90));

  // Une autre femme n'est jamais gênée par le panier de la première.
  await commeServeur(db, `delete from public.quotas`);
  const chezLea = await commander(L, panier(2), 'Lea', '71000000');
  verifier('le panier identique de Léa crée SA commande',
    chezLea.rows[0].r?.ok === true && !chezLea.rows[0].r?.rejouee, j(chezLea.rows[0].r).slice(0, 90));

  // Le second envoi ne doit pas consommer le plafond horaire.
  await commeServeur(db, `delete from public.quotas`);
  await commeServeur(db, `delete from public.commandes where profil_id=$1`, [zara]);
  let acceptees = 0;
  for (let i = 1; i <= 5; i++) {
    const r = await commander(Z, panier(i));
    if (r.rows[0].r?.ok) acceptees += 1;
    await commander(Z, panier(i)); // le double appui, à chaque fois
  }
  verifier('cinq paniers différents passent malgré cinq doubles appuis', acceptees === 5, `acceptees=${acceptees}`);
  verifier('et cinq commandes seulement', (await combien('commandes')) === 5, `n=${await combien('commandes')}`);
}

// ---------------------------------------------------------------------------
titre('3. Une position hors du Burkina ne fait pas passer une commande sans adresse');
// ---------------------------------------------------------------------------
{
  await commeServeur(db, `delete from public.quotas`);
  // Sans quartier, avec un point à Paris : refus, et non une commande vide.
  const paris = await Z(
    `select public.passer_commande($1::jsonb,'Zara','70000000','','',48.85,2.35,true) r`, [panier(1)]
  );
  verifier('commande refusée faute d adresse', j(paris.rows[0].r).includes('adresse_incomplete'), j(paris.rows[0].r));

  // Avec un quartier, le point hors bornes est simplement ignoré.
  await commeServeur(db, `delete from public.quotas`);
  const avecQuartier = await commander(Z, panier(7), 'Zara', '70000000', 48.85, 2.35);
  const posee = avecQuartier.rows[0].r?.numero
    ? (await commeServeur(db, `select position_lat, quartier from public.commandes where numero=$1`,
        [avecQuartier.rows[0].r.numero])).rows[0]
    : null;
  verifier('la commande passe avec le quartier', avecQuartier.rows[0].r?.ok === true, j(avecQuartier.rows[0].r).slice(0, 90));
  verifier('et la position fausse est jetée', posee && posee.position_lat === null && posee.quartier !== '', j(posee));

  // Un point à Ouagadougou est gardé.
  await commeServeur(db, `delete from public.quotas`);
  const ouaga = await commander(Z, panier(8), 'Zara', '70000000', 12.36, -1.52);
  const gardee = (await commeServeur(db, `select position_lat from public.commandes where numero=$1`,
    [ouaga.rows[0].r?.numero])).rows[0];
  verifier('un point à Ouaga est gardé', Number(gardee?.position_lat) === 12.36, j(gardee));

  // Et la même règle dans « Mes adresses ».
  const adresseVide = await Z(`select public.enregistrer_adresse('Zara','70000000','','',48.85,2.35) r`);
  verifier('mes adresses : refus faute d adresse', j(adresseVide.rows[0].r).includes('adresse_incomplete'), j(adresseVide.rows[0].r));
}

// ---------------------------------------------------------------------------
titre('4. Un numéro avec l indicatif du pays est accepté');
// ---------------------------------------------------------------------------
{
  const CAS = [
    ['70000000', '70000000'],
    ['70 00 00 00', '70000000'],
    ['+226 70 00 00 00', '70000000'],
    ['0022670000000', '70000000'],
    ['00226 70000000', '70000000'],
    ['60123456', '60123456'],
    ['51234567', '51234567'],
    ['12345678', null],
    ['7000000', null],
    ['700000000', null],
    ['226', null],
    ['', null],
    [null, null],
  ];
  for (const [saisi, attendu] of CAS) {
    const r = await commeServeur(db, `select public.telephone_burkina($1) t`, [saisi]);
    verifier(`${JSON.stringify(saisi)} -> ${JSON.stringify(attendu)}`, r.rows[0].t === attendu, `obtenu ${j(r.rows[0].t)}`);
  }
  // Bout en bout : une commande avec l'indicatif, et le numéro rangé propre.
  await commeServeur(db, `delete from public.quotas`);
  const avecIndicatif = await commander(Z, panier(9), 'Zara', '+226 70 11 22 33');
  const rangee = (await commeServeur(db, `select telephone from public.commandes where numero=$1`,
    [avecIndicatif.rows[0].r?.numero])).rows[0];
  verifier('commande acceptée avec « +226 »', avecIndicatif.rows[0].r?.ok === true, j(avecIndicatif.rows[0].r).slice(0, 90));
  verifier('et les huit chiffres rangés en base', rangee?.telephone === '70112233', j(rangee));
  // La fonction interne reste fermée à tout le monde.
  let refus = null;
  try { await Z(`select public.telephone_burkina('70000000') t`); } catch (e) { refus = e.message; }
  verifier('telephone_burkina n est appelable par personne', /permission|denied/i.test(refus ?? ''), String(refus).slice(0, 80));
  let refus2 = null;
  try { await Z(`select public.empreinte_du_panier('[]'::jsonb) e`); } catch (e) { refus2 = e.message; }
  verifier('empreinte_du_panier non plus', /permission|denied/i.test(refus2 ?? ''), String(refus2).slice(0, 80));
}

// ---------------------------------------------------------------------------
titre('5. « Effacer mes données » tient toute la promesse de la page');
// ---------------------------------------------------------------------------
{
  await commeServeur(db, `delete from public.quotas`);
  await Z(`select public.enregistrer_questionnaire('Zara', 30, 6, current_date - 3, 'non', $1::text[], 'bebe', 'lavables') r`,
    [['ventre', 'fatigue']]);
  await Z(`select public.noter_journee(current_date, 'abondant', 5, null, 'ma note la plus intime') r`);
  await Z(`select public.declarer_regles(current_date) r`);
  await Z(`select public.assistante_poser('est-ce normal ?') r`);
  await Z(`select public.dambe_ouvre_si_besoin() r`);
  await Z(`select public.basculer_favori($1) r`, [SANS_TAILLE]);
  await Z(`select public.envoyer_vocal($1,'audio/webm',9,'boutique') r`, [son]);
  await commeServeur(db, `update public.reglages set valeur='oui' where cle='medecin_actif'`);
  await Z(`select public.envoyer_vocal($1,'audio/webm',9,'medecin') r`, [son]);
  await Z(`select public.ecrire_a('medecin','ma question au docteur') r`);
  await commeServeur(db, `update public.reglages set valeur='non' where cle='medecin_actif'`);

  const avant = (await commeServeur(db, `
    select (select count(*) from public.journal where profil_id=$1) journal,
           (select count(*) from public.cycles where profil_id=$1) cycles,
           (select count(*) from public.assistante_messages where profil_id=$1) dambe,
           (select count(*) from public.favoris where profil_id=$1) favoris,
           (select count(*) from public.fils where profil_id=$1 and sujet='medecin') medecin,
           (select count(*) from public.vocaux v join public.messages m on m.id=v.message_id
              join public.fils f on f.id=m.fil_id where f.profil_id=$1) voix,
           (select regularite from public.profils where id=$1) regularite`, [zara])).rows[0];
  verifier('il y a bien quelque chose à effacer',
    Number(avant.journal) > 0 && Number(avant.cycles) > 0 && Number(avant.dambe) > 0 &&
    Number(avant.favoris) > 0 && Number(avant.medecin) > 0 && Number(avant.voix) > 0, j(avant));
  verifier('et le questionnaire est bien rempli', avant.regularite === 'non', j(avant.regularite));

  const ef = await Z(`select public.effacer_mes_donnees() r`);
  verifier('l effacement répond oui', ef.rows[0].r?.ok === true, j(ef.rows[0].r));

  const apres = (await commeServeur(db, `
    select (select count(*) from public.journal where profil_id=$1) journal,
           (select count(*) from public.cycles where profil_id=$1) cycles,
           (select count(*) from public.assistante_messages where profil_id=$1) dambe,
           (select count(*) from public.favoris where profil_id=$1) favoris,
           (select count(*) from public.fils where profil_id=$1 and sujet='medecin') medecin,
           (select count(*) from public.vocaux v join public.messages m on m.id=v.message_id
              join public.fils f on f.id=m.fil_id where f.profil_id=$1) voix,
           (select regularite from public.profils where id=$1) regularite,
           (select array_length(ressentis,1) from public.profils where id=$1) ressentis,
           (select objectif from public.profils where id=$1) objectif,
           (select protection from public.profils where id=$1) protection,
           (select cycle_moyen from public.profils where id=$1) cycle,
           (select duree_regles from public.profils where id=$1) duree,
           (select questionnaire_fini from public.profils where id=$1) fini`, [zara])).rows[0];
  for (const [quoi, valeur] of [
    ['le journal', apres.journal], ['les cycles', apres.cycles], ['le fil de Dambé', apres.dambe],
    ['les favoris', apres.favoris], ['le fil du médecin', apres.medecin], ['les voix', apres.voix],
  ]) {
    verifier(`${quoi} : plus rien`, Number(valeur) === 0, `n=${valeur}`);
  }
  verifier('la régularité est oubliée', apres.regularite === 'inconnue', j(apres.regularite));
  verifier('les ressentis sont oubliés', apres.ressentis === null, j(apres.ressentis));
  verifier('l objectif est oublié', apres.objectif === 'suivre', j(apres.objectif));
  verifier('la protection est oubliée', apres.protection === 'jetables', j(apres.protection));
  verifier('le cycle revient au défaut', Number(apres.cycle) === 28 && Number(apres.duree) === 5, j(apres));
  verifier('le questionnaire est à refaire', apres.fini === false, j(apres.fini));

  // Un profil effacé est indistinguable d'un profil neuf, sur ces colonnes.
  const neuf = await nouveauCompte(db, 'neuve', 'Neuve');
  const egal = (await commeServeur(db, `
    select (select row(regularite, ressentis, objectif, protection, cycle_moyen, duree_regles, questionnaire_fini)
              from public.profils where id=$1)
         = (select row(regularite, ressentis, objectif, protection, cycle_moyen, duree_regles, questionnaire_fini)
              from public.profils where id=$2) as pareil`, [zara, neuf])).rows[0];
  verifier('un profil effacé ressemble à un profil neuf', egal.pareil === true, j(egal));

  // Et rien n'a été touché chez Léa.
  verifier('Léa garde ses commandes', (await combien('commandes', lea)) > 0, `n=${await combien('commandes', lea)}`);
}

// ---------------------------------------------------------------------------
titre('5 bis. L adresse et la position partent aussi, commandes comprises');
// ---------------------------------------------------------------------------
// Décision d'Arthur du 26 octobre 2026 : « tout effacer, commandes comprises ».
// Cyber avait laissé les deux chemins ouverts dans la migration 180000 ; c'est
// le premier qui a été retenu. La seule chose qui reste est l'adresse d'une
// commande ENCORE EN ROUTE, sans quoi le livreur n'aurait plus où aller : elle
// est comptée et renvoyée, pour que l'écran le dise au lieu de le taire.
{
  await commeServeur(db, `delete from public.quotas`);
  const sira = await nouveauCompte(db, 'sira', 'Sira');
  const S = api(sira);

  const adr = await S(`select public.enregistrer_adresse('Sira K','70112233','Dassasgho','derriere la pharmacie',12.37,-1.52) r`);
  verifier('l adresse est enregistrée', adr.rows[0].r?.ok === true, j(adr.rows[0].r));

  await commeServeur(db, `delete from public.quotas`);
  const c1 = await commander(S, panier(1), 'Sira K', '70112233', 12.37, -1.52);
  verifier('une première commande passe', c1.rows[0].r?.ok === true, j(c1.rows[0].r));
  await commeServeur(db, `delete from public.quotas`);
  const c2 = await commander(S, panier(2), 'Sira K', '70112233', 12.37, -1.52);
  verifier('une deuxième commande passe', c2.rows[0].r?.ok === true, j(c2.rows[0].r));

  // La première est livrée, la seconde est encore en route.
  const nums = (await commeServeur(db,
    `select numero from public.commandes where profil_id=$1 order by cree_le`, [sira])).rows;
  verifier('les deux commandes sont en base', nums.length === 2, j(nums.length));
  await commeServeur(db, `update public.commandes set etat='livree', livree_le=now() where numero=$1`, [nums[0].numero]);
  await commeServeur(db, `update public.commandes set etat='envoyee' where numero=$1`, [nums[1].numero]);

  const avant = (await commeServeur(db, `
    select (select telephone from public.profils where id=$1) tel,
           (select quartier from public.profils where id=$1) quartier,
           (select position_lat from public.profils where id=$1) lat,
           (select telephone from public.commandes where numero=$2) tel_livree,
           (select position_lat from public.commandes where numero=$2) lat_livree`,
    [sira, nums[0].numero])).rows[0];
  verifier('le profil porte bien son numéro, son quartier et sa position',
    avant.tel === '70112233' && avant.quartier === 'Dassasgho' && avant.lat !== null, j(avant));
  verifier('et la commande livrée en garde une copie',
    avant.tel_livree === '70112233' && avant.lat_livree !== null, j(avant));

  const ef = await S(`select public.effacer_mes_donnees() r`);
  verifier('l effacement répond oui', ef.rows[0].r?.ok === true, j(ef.rows[0].r));
  verifier('et il compte la commande encore en route',
    Number(ef.rows[0].r?.livraisons_en_cours) === 1, j(ef.rows[0].r));

  const apres = (await commeServeur(db, `
    select (select nom_livraison from public.profils where id=$1) nom,
           (select telephone from public.profils where id=$1) tel,
           (select quartier from public.profils where id=$1) quartier,
           (select repere from public.profils where id=$1) repere,
           (select position_lat from public.profils where id=$1) lat,
           (select position_lng from public.profils where id=$1) lng,
           (select nom from public.commandes where numero=$2) nom_livree,
           (select telephone from public.commandes where numero=$2) tel_livree,
           (select quartier from public.commandes where numero=$2) quartier_livree,
           (select repere from public.commandes where numero=$2) repere_livree,
           (select position_lat from public.commandes where numero=$2) lat_livree,
           (select telephone from public.commandes where numero=$3) tel_en_route,
           (select quartier from public.commandes where numero=$3) quartier_en_route,
           (select position_lat from public.commandes where numero=$3) lat_en_route`,
    [sira, nums[0].numero, nums[1].numero])).rows[0];

  for (const [quoi, valeur] of [
    ['le nom de livraison', apres.nom], ['le numéro', apres.tel], ['le quartier', apres.quartier],
    ['le repère', apres.repere], ['la latitude', apres.lat], ['la longitude', apres.lng],
  ]) {
    verifier(`${quoi} du profil : plus rien`, valeur === null, j(valeur));
  }
  verifier('la commande livrée ne garde plus le nom', apres.nom_livree === '', j(apres.nom_livree));
  verifier('ni le numéro', apres.tel_livree === '', j(apres.tel_livree));
  verifier('ni le quartier', apres.quartier_livree === '', j(apres.quartier_livree));
  verifier('ni le repère', apres.repere_livree === '', j(apres.repere_livree));
  verifier('ni la position', apres.lat_livree === null, j(apres.lat_livree));

  // Ce qui reste, et c'est voulu : la commande encore en route.
  verifier('la commande en route garde son numéro', apres.tel_en_route === '70112233', j(apres.tel_en_route));
  verifier('et son quartier', apres.quartier_en_route === 'Dassasgho', j(apres.quartier_en_route));
  verifier('et sa position', apres.lat_en_route !== null, j(apres.lat_en_route));

  // Une fois livrée, un nouvel appel la vide à son tour : rien n'est oublié
  // pour toujours, c'est seulement différé jusqu'à ce que le colis arrive.
  await commeServeur(db, `update public.commandes set etat='livree', livree_le=now() where numero=$1`, [nums[1].numero]);
  const ef2 = await S(`select public.effacer_mes_donnees() r`);
  verifier('le deuxième appel ne compte plus de livraison en cours',
    Number(ef2.rows[0].r?.livraisons_en_cours) === 0, j(ef2.rows[0].r));
  const fin = (await commeServeur(db,
    `select telephone, quartier, position_lat from public.commandes where numero=$1`, [nums[1].numero])).rows[0];
  verifier('et l ancienne commande en route est vidée à son tour',
    fin.telephone === '' && fin.quartier === '' && fin.position_lat === null, j(fin));

  // Et rien n'a bougé chez les autres.
  const lea_ok = (await commeServeur(db,
    `select count(*)::int n from public.commandes where profil_id=$1 and telephone <> ''`, [lea])).rows[0];
  verifier('Léa garde l adresse de ses commandes', Number(lea_ok.n) > 0, j(lea_ok));
}

// ---------------------------------------------------------------------------
titre('6. Le message d erreur de Postgres ne sort plus de la fonction');
// ---------------------------------------------------------------------------
{
  await commeServeur(db, `delete from public.quotas`);
  const decimale = await commander(Z, JSON.stringify([{ slug: SANS_TAILLE, quantite: 1.9 }]));
  const code = decimale.rows[0].r?.erreur ?? '';
  verifier('une quantité « 1.9 » rend un code à nous', code === 'erreur_interne', j(decimale.rows[0].r));
  verifier('et ne laisse rien filtrer de Postgres',
    !/invalid input syntax|integer|column|relation/i.test(code), j(code));

  // Les codes que la fonction lève elle-même passent toujours : la page en a
  // besoin pour nommer le produit en rupture.
  await commeServeur(db, `delete from public.quotas`);
  await commeServeur(db, `update public.produits set stock = 1 where slug=$1`, [SANS_TAILLE]);
  const rupture = await commander(Z, panier(11));
  verifier('« stock insuffisant » passe, avec le nom du produit',
    String(rupture.rows[0].r?.erreur).startsWith('stock_insuffisant:'), j(rupture.rows[0].r));
  await commeServeur(db, `delete from public.quotas`);
  const sansTaille = await commander(Z, JSON.stringify([{ slug: 'culotte-flux-abondant', quantite: 1 }]));
  verifier('« taille invalide » passe aussi',
    String(sansTaille.rows[0].r?.erreur).startsWith('taille_invalide:'), j(sansTaille.rows[0].r));
  await commeServeur(db, `delete from public.quotas`);
  const invente = await commander(Z, panier(1, 'produit-qui-nexiste-pas'));
  verifier('« produit inconnu » passe aussi',
    sansTaille && String(invente.rows[0].r?.erreur) === 'produit_inconnu', j(invente.rows[0].r));
}

// ---------------------------------------------------------------------------
titre('7. Le créateur d avatars est bien révoqué, et la galerie n est plus vide');
// ---------------------------------------------------------------------------
{
  // `src/pages/compte/avatar.astro` affirmait en commentaire que
  // `composer_avatar()` était révoquée « voir la migration 20261026150000 ».
  // Cette migration n'existait pas : la fonction était ouverte à tout compte
  // connecté. Et la galerie était vide depuis le 13 octobre, alors que les
  // douze portraits étaient sur le disque.
  let refus = null;
  try { await Z(`select public.composer_avatar(1,1,1,1,1,1) r`); } catch (e) { refus = e.message; }
  verifier('composer_avatar n est plus appelable', /permission|denied/i.test(refus ?? ''), String(refus).slice(0, 90));

  // Le compte attendu n'est plus écrit en dur : il se lit sur le disque. Les
  // cinquante portraits de Motion du 26 octobre au soir sont arrivés après ce
  // test, et un nombre en dur aurait fait passer la galerie au rouge pour la
  // seule raison qu'elle avait grandi. Ce qui compte est l'égalité des deux
  // côtés : tout fichier déclaré existe, tout fichier présent est déclaré.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const racine = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
  const surDisque = fs.readdirSync(path.join(racine, 'public', 'avatars'));
  // La mascotte est sur le disque mais n'entre pas dans la galerie : c'est le
  // visage de Dambé, pas une photo de profil à prendre (décision du 13 octobre).
  //
  // Quatre portraits sont eux aussi sur le disque sans être proposés, et c'est
  // voulu : Motion les signale comme juvéniles, et sur une application de santé
  // féminine le doute ne vaut pas le risque (migration du 27 octobre). Ils sont
  // nommés ici pour que personne ne les réintroduise par inadvertance, et pour
  // que ces tests continuent d'attraper un vrai oubli.
  const ECARTES = ['femme-foulard-09.webp', 'femme-locks-06.webp', 'femme-tresses-11.webp', 'femme-twists-06.webp'];
  const portraits = surDisque.filter((f) => f.endsWith('.webp') && f !== 'infirmiere-visage.webp' && !ECARTES.includes(f));
  verifier('il y a des portraits sur le disque', portraits.length > 50, `n=${portraits.length}`);

  const n = Number((await commeServeur(db, `select count(*)::int n from public.avatars_disponibles`)).rows[0].n);
  verifier('la galerie déclare tous les portraits du disque', n === portraits.length, `base=${n} disque=${portraits.length}`);
  const g = await Z(`select public.galerie_avatars() r`);
  const galerie = g.rows[0].r ?? [];
  verifier('et galerie_avatars les rend bien',
    Array.isArray(galerie) && galerie.length === portraits.length, `rendus=${galerie.length}`);
  verifier('la mascotte n y est pas (décision du 13 octobre)',
    !j(galerie).includes('infirmiere'), j(galerie).slice(0, 90));
  // Pas seulement « la première est une femme et la dernière un homme » : aucun
  // homme ne doit passer devant une femme, où que ce soit dans la liste.
  const genres = galerie.map((a) => a.genre);
  const premierHomme = genres.indexOf('homme');
  verifier('les femmes passent avant les hommes',
    premierHomme > 0 && !genres.slice(premierHomme).includes('femme'),
    `premier homme au rang ${premierHomme} sur ${genres.length}`);
  // Arthur, le 26 octobre 2026 : « en majorité des filles de moins de 35 ans ».
  const nbFemmes = genres.filter((x) => x === 'femme').length;
  verifier('les femmes sont largement majoritaires', nbFemmes > genres.length * 0.75,
    `${nbFemmes} femmes sur ${genres.length}`);
  // Deux portraits ne doivent pas se suivre dans la même famille de coiffure :
  // dans un rond de 88 px, six afros d'affilée ne se distinguent plus.
  const famille = (f) => String(f).replace(/-\d+\.webp$/, '');
  const voisinsPareils = galerie.filter((a, i) => i > 0 && famille(a.fichier) === famille(galerie[i - 1].fichier));
  verifier('deux voisins ne sont jamais de la même coiffure', voisinsPareils.length === 0,
    voisinsPareils.map((a) => a.fichier).join(' '));

  const manquants = galerie.map((a) => a.fichier).filter((f) => !surDisque.includes(f));
  verifier('chaque portrait déclaré existe sur le disque', manquants.length === 0, manquants.join(' '));
  const oublies = portraits.filter((f) => !galerie.some((a) => a.fichier === f));
  verifier('et chaque portrait du disque est déclaré', oublies.length === 0, oublies.join(' '));
  const revenus = ECARTES.filter((f) => galerie.some((a) => a.fichier === f));
  verifier('les quatre portraits juvéniles restent hors de la galerie', revenus.length === 0, revenus.join(' '));
  const perdus = ECARTES.filter((f) => !surDisque.includes(f));
  verifier('mais leurs fichiers sont gardés, au cas où', perdus.length === 0, perdus.join(' '));

  // On peut choisir un portrait, et revenir au rond neutre.
  const choix = await Z(`select public.choisir_avatar($1) r`, ['femme-afro-01.webp']);
  verifier('choisir un portrait marche', choix.rows[0].r?.ok === true, j(choix.rows[0].r));
  const retire = await Z(`select public.retirer_mon_avatar() r`);
  verifier('et « Aucune » reste possible', retire.rows[0].r?.ok === true, j(retire.rows[0].r));
  const vide = (await commeServeur(db, `select avatar_fichier, avatar_choix from public.profils where id=$1`, [zara])).rows[0];
  verifier('les deux chemins sont vides après « Aucune »',
    vide.avatar_fichier === null && vide.avatar_choix === null, j(vide));
  // Un fichier inventé reste refusé.
  const faux = await Z(`select public.choisir_avatar('../../secrets/.env') r`);
  verifier('un chemin inventé est refusé', j(faux.rows[0].r).includes('avatar_inconnu'), j(faux.rows[0].r));
}

// ---------------------------------------------------------------------------
titre('8. Les pages ne proposent plus ce que la base refuse');
// ---------------------------------------------------------------------------
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');
  const racine = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
  const lire = (...p) => fs.readFileSync(path.join(racine, ...p), 'utf8');

  // Le fil du médecin : l'écran ne doit plus s'ouvrir tant que personne ne
  // répond, sinon elle enregistre sa voix avant d'apprendre que c'est fermé.
  const fil = lire('src', 'pages', 'discussions', '[sujet].astro');
  verifier('la page du fil regarde MEDECIN_DISPONIBLE', fil.includes('MEDECIN_DISPONIBLE'), 'la page ne consulte pas le réglage');
  // Le renvoi a la liste, pose ici le 26 octobre au matin, a ete RETIRE le soir
  // sur demande d'Arthur : « on doit pouvoir entrer dans la discussion medecin,
  // et dans la discussion medecin on ne pourra pas ecrire ». Renvoyer a la
  // liste avait un effet que je n'avais pas vu : on atterrissait sur l'ecran ou
  // Dambe est en haut avec son visage, et on croyait que le medecin etait
  // Dambe. Ce qui est verifie n'est donc plus le renvoi, mais que la page
  // s'ouvre SANS un seul moyen d'ecrire.
  verifier('la page ne renvoie plus a la liste',
    !/estMedecin\s*&&\s*!MEDECIN_DISPONIBLE[\s\S]{0,40}redirect/.test(fil), 'elle renvoie encore');
  verifier('elle calcule plutot un etat « ferme »', /const ferme = estMedecin && !MEDECIN_DISPONIBLE/.test(fil),
    lignesAvec(fil, 'const ferme'));
  verifier('le formulaire d ecriture est remplace quand c est ferme',
    /ferme \?[\s\S]{0,400}class="attente"/.test(fil), lignesAvec(fil, 'class="attente"'));
  verifier('ni champ ni micro ni bouton dans l attente',
    /ferme \? \([\s\S]{0,1600}?\) : \(/.test(fil) &&
      !/class="attente"[\s\S]{0,1600}?(textarea|VocalSaisie|class="envoyer")/.test(fil),
    'un moyen d ecrire subsiste dans le panneau d attente');
  verifier('et un POST n est plus traite quand c est ferme',
    /method === 'POST' && !ferme/.test(fil), lignesAvec(fil, "method === 'POST'"));
  // Un visage humain, pas un coeur ni la mascotte : c'est un humain qui repond.
  verifier('l en-tete du fil montre une photo de medecin',
    /estMedecin \?[\s\S]{0,200}PHOTOS_MEDECIN\[0\]/.test(fil), lignesAvec(fil, 'PHOTOS_MEDECIN[0]'));
  verifier('et les trois illustrations sont dans l attente',
    /PHOTOS_MEDECIN\.map/.test(fil), lignesAvec(fil, 'PHOTOS_MEDECIN.map'));
  // Les fichiers existent vraiment, sinon l'ecran montre des carres casses.
  const photosMedecin = lire('src', 'lib', 'photos-medecin.ts');
  const poses = [...photosMedecin.matchAll(/'(medecin-[a-z0-9-]+)'/g)].map((x) => x[1]);
  verifier('trois poses sont declarees', poses.length >= 3, poses.join(' '));
  const accueil = fs.readdirSync(path.join(racine, 'public', 'accueil'));
  const trouvees = poses.filter((n) => accueil.includes(`${n}-600.webp`));
  verifier('au moins trois photos existent sur le disque', trouvees.length >= 3, trouvees.join(' '));
  // Et la ligne de la liste redevient un lien, meme fermee.
  const listeDisc = lire('src', 'pages', 'discussions', 'index.astro');
  verifier('la ligne du medecin est un lien meme fermee',
    /<a class="causerie causerie-bientot" href="\/discussions\/medecin">/.test(listeDisc),
    lignesAvec(listeDisc, 'causerie-bientot'));

  // L'accueil ne se déclare plus indexable : connectée, il montre son cycle.
  const base = lire('src', 'layouts', 'Base.astro');
  verifier("l accueil n est plus declare indexable",
    !/pathname === '\/' \? 'index,follow'/.test(base) && !/=== '\/'[\s\S]{0,40}index,follow/.test(base),
    'l accueil se declare encore indexable');
  verifier('la boutique reste indexable', base.includes("startsWith('/boutique')"), 'la boutique n est plus indexable');

  // Et robots.txt existe enfin : il rendait la page introuvable.
  const robots = lire('public', 'robots.txt');
  verifier('robots.txt existe', robots.length > 20, `${robots.length} octets`);
  verifier('il interdit tout par defaut', /^\s*Disallow:\s*\/\s*$/m.test(robots), robots.slice(-80));
  verifier('et laisse passer la boutique', /^\s*Allow:\s*\/boutique\s*$/m.test(robots), robots.slice(-80));

  // La galerie des portraits pèse 1 Mo à elle seule depuis les cinquante de
  // Motion. Sur un forfait compté en 3G, les charger tous à l'ouverture de la
  // page serait indéfendable : le navigateur doit pouvoir s'arrêter à ce qui
  // est visible. Lu dans le code, parce qu'un rendu ne prouve pas l'attribut.
  const galeriePage = fs.readFileSync(path.join(racine, 'src', 'pages', 'compte', 'avatar.astro'), 'utf8');
  verifier('la galerie demande le chargement différé', /differe\s*(\/>|=)/.test(galeriePage),
    lignesAvec(galeriePage, '<Avatar'));
  const composant = fs.readFileSync(path.join(racine, 'src', 'components', 'Avatar.astro'), 'utf8');
  verifier('et le composant sait le faire', /loading=\{differe \? 'lazy' : 'eager'\}/.test(composant),
    lignesAvec(composant, 'loading'));
  verifier('mais pas pour l en-tête, qui reste immédiat', /differe = false/.test(composant),
    lignesAvec(composant, 'differe ='));

  // ---------------------------------------------------------------------------
  // La boucle du 26 octobre 2026 : deux comptes crees a la meme seconde
  // ---------------------------------------------------------------------------
  // Arthur, sur son telephone : « je finis de remplir mes informations, au lieu
  // que ca m'envoie sur l'application, ca me renvoie pour que je renseigne
  // encore mes informations ». La base de production en gardait la trace : deux
  // comptes anonymes a 21:21:55, l'un avec son questionnaire rempli, l'autre
  // vide. Il avait appuye deux fois sur « Commencer », et son navigateur a garde
  // le cookie du compte vide.
  const ouverture = fs.readFileSync(path.join(racine, 'src', 'pages', 'ouverture.astro'), 'utf8');
  verifier('le formulaire d entrée est marqué « une fois »', /action="\/commencer"[^>]*data-une-fois/.test(ouverture),
    lignesAvec(ouverture, 'action="/commencer"'));
  verifier('et la page charge le script qui l arrête', /scripts\/une-fois/.test(ouverture),
    lignesAvec(ouverture, 'une-fois'));
  const uneFois = fs.readFileSync(path.join(racine, 'src', 'scripts', 'une-fois.ts'), 'utf8');
  verifier('le script refuse le deuxième envoi', /if \(parti\)[\s\S]{0,80}preventDefault/.test(uneFois),
    lignesAvec(uneFois, 'preventDefault'));
  // Desactiver le bouton AVANT que la requete soit partie l'annulerait.
  verifier('il attend que la requête soit partie pour désactiver', /setTimeout\([\s\S]{0,400}?disabled = true/.test(uneFois),
    lignesAvec(uneFois, 'setTimeout'));
  // Le libelle ne change pas sous le doigt.
  verifier('le libellé du bouton ne change pas', !/textContent|innerText|innerHTML/.test(uneFois),
    lignesAvec(uneFois, 'textContent'));

  // Et le silence qui transformait une lecture ratee en questionnaire a refaire.
  const session = fs.readFileSync(path.join(racine, 'src', 'lib', 'session.ts'), 'utf8');
  verifier('une lecture de profil ratée est lue, pas jetée', /error: erreurProfil/.test(session),
    lignesAvec(session, 'erreurProfil'));
  verifier('et ne renvoie plus au questionnaire', /questionnaireFini: illisible \? true/.test(session),
    lignesAvec(session, 'questionnaireFini:'));
  verifier('les pages peuvent le dire', /profilIllisible: illisible/.test(session),
    lignesAvec(session, 'profilIllisible:'));

  // Le bouton d'effacement porte le nom qu'Arthur a demande le 26 octobre au
  // soir, et le texte reste franc sur le fait que c'est definitif.
  const conf = fs.readFileSync(path.join(racine, 'src', 'pages', 'confidentialite.astro'), 'utf8');
  verifier('le bouton s appelle « Réinitialiser mon compte »', /Réinitialiser mon compte/.test(conf),
    lignesAvec(conf, 'Réinitialiser'));
  verifier('et plus « Effacer mes données » à l écran',
    !/<h2>Effacer mes données<\/h2>/.test(conf), lignesAvec(conf, '<h2>'));
  verifier('le caractère définitif est toujours écrit', /rien ne pourra être récupéré/.test(conf),
    lignesAvec(conf, 'récupéré'));
  verifier('et le non-dit de « réinitialiser » est levé', /Ton compte reste, tout ce qu'il contient s'en va/.test(conf),
    lignesAvec(conf, 'Ton compte reste'));
}

bilan('Les attaques de l audit du 26 octobre');
await db.close();
