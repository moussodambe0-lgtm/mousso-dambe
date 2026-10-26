// Les messages vocaux, dans la conversation avec le médecin.
//
// Ce que ce fichier cherche à prouver, dans l'ordre de gravité :
//   1. Le son d'Awa ne s'entend PAS chez Bintou : ni par la table, ni par la
//      fonction d'écoute, ni en devinant un identifiant. Une voix identifie
//      quelqu'un, c'est la donnée la plus intime de l'application.
//   2. Les bornes sont tenues PAR LA BASE (durée, poids, format, médecin
//      seulement), parce qu'une page se contourne et pas une fonction.
//   3. Un vocal reste un message : il n'entre ni dans le journal, ni dans le
//      cycle, ni dans ce qui part vers l'assistante.
//   4. Effacer la conversation efface les sons.
//
// Lancer : node supabase/tests/vocaux.test.mjs
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

// Le fil du médecin est fermé par défaut depuis le 26 octobre 2026, et ce
// fichier l'emprunte à sept endroits pour vérifier les messages vocaux. On
// l'ouvre donc, comme le fera une ligne de SQL quand un médecin répondra. Sans
// cela, le refus « medecin_bientot » arrive AVANT les contrôles testés ici et
// les masque tous : c'est ainsi qu'un contrôle du message vide s'est retrouvé
// en échec sans que le message vide y soit pour quoi que ce soit.
await commeServeur(db, `update public.reglages set valeur = 'oui' where cle = 'medecin_actif'`);

const elle = (sub) => ({ role: 'authenticated', sub });

// Un « enregistrement » : 800 octets reconnaissables, pour vérifier à
// l'arrivée que ce qui sort est exactement ce qui est entré.
const SON = Buffer.alloc(800, 7);
const SON_64 = SON.toString('base64');

// ---------------------------------------------------------------------------
titre('Envoyer un vocal au médecin');

let r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 12]);
verifier('Awa envoie un vocal', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
const idVocal = r.rows[0].j.message;
verifier('on lui rend l_identifiant du message', typeof idVocal === 'string' && idVocal.length > 10);

r = await commeServeur(
  db,
  `select f.sujet, f.apercu, f.apercu_de, f.non_lus_admin, m.texte, m.vocal_secondes
     from public.fils f join public.messages m on m.fil_id = f.id
    where f.profil_id = $1`,
  [awa]
);
verifier('le vocal tombe dans le fil du médecin, pas dans celui de la boutique', r.rows[0].sujet === 'medecin');
verifier('le message porte sa durée et pas de texte', r.rows[0].vocal_secondes === 12 && r.rows[0].texte === '');
verifier(
  "l_aperçu dit qu'il y a un vocal sans rien en citer",
  r.rows[0].apercu === 'Message vocal · 12 s' && r.rows[0].apercu_de === 'elle'
);
verifier("l_administratrice a un message non lu de plus", r.rows[0].non_lus_admin === 1);

r = await commeServeur(db, `select count(*)::int as n from public.fils where profil_id = $1 and sujet = 'boutique'`, [awa]);
verifier("aucun fil de boutique n_est ouvert par un vocal", r.rows[0].n === 0);

// ---------------------------------------------------------------------------
titre('Qui peut écouter');

r = await commeApi(db, elle(awa), `select public.lire_vocal($1) as j`, [idVocal]);
verifier('Awa réécoute son propre vocal', r.rows[0].j.ok === true);
verifier('et le son qui sort est exactement celui qui est entré', r.rows[0].j.base64 === SON_64);
verifier('avec son type', r.rows[0].j.type === 'audio/webm');

r = await commeApi(db, elle(bintou), `select public.lire_vocal($1) as j`, [idVocal]);
verifier("Bintou n_entend pas le vocal d_Awa", r.rows[0].j.ok === false);
verifier(
  "et la réponse est la même que pour un vocal qui n_existe pas",
  r.rows[0].j.erreur === 'vocal_inconnu'
);

r = await commeApi(db, elle(bintou), `select public.lire_vocal($1) as j`, ['00000000-0000-0000-0000-000000000000']);
verifier("un identifiant inventé donne exactement la même réponse", r.rows[0].j.erreur === 'vocal_inconnu');

r = await commeApi(db, { role: 'anon' }, `select public.lire_vocal($1) as j`, [idVocal]).catch((e) => ({
  rows: [{ j: { ok: false, erreur: e.message } }],
}));
verifier('une visiteuse non connectée n_entend rien', r.rows[0].j.ok === false);

r = await commeApi(db, elle(patronne), `select public.lire_vocal($1) as j`, [idVocal]);
verifier("l_administratrice écoute, c'est pour ça qu'il existe", r.rows[0].j.ok === true);

// La table elle-même est fermée à tout le monde, y compris à celle qui a
// envoyé le vocal : le seul chemin est la fonction.
let refus = false;
try {
  const t = await commeApi(db, elle(awa), `select count(*)::int as n from public.vocaux`);
  refus = t.rows[0].n === 0;
} catch {
  refus = true;
}
verifier("la table des sons est fermée, même à celle qui l_a envoyé", refus);

refus = false;
try {
  const t = await commeApi(db, elle(patronne), `select count(*)::int as n from public.vocaux`);
  refus = t.rows[0].n === 0;
} catch {
  refus = true;
}
verifier("elle l_est aussi à l_administratrice : on n_écoute que par la fonction", refus);

// ---------------------------------------------------------------------------
titre('Les bornes, tenues par la base');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/x-malin', 10]);
verifier('un format hors liste est refusé', r.rows[0].j.erreur === 'format_refuse');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'text/html', 10]);
verifier("un type de page web ne passe pas pour du son", r.rows[0].j.erreur === 'format_refuse');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 0]);
verifier('zéro seconde est refusé', r.rows[0].j.erreur === 'duree_refusee');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 91]);
verifier('91 secondes sont refusées', r.rows[0].j.erreur === 'duree_refusee');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 90]);
verifier('90 secondes passent, pile', r.rows[0].j.ok === true);

const TROP_GROS = Buffer.alloc(1_200_001, 1).toString('base64');
r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [TROP_GROS, 'audio/webm', 30]);
verifier('un son de plus de 1,2 Mo est refusé', r.rows[0].j.erreur === 'vocal_trop_long');

const PILE = Buffer.alloc(1_200_000, 1).toString('base64');
r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [PILE, 'audio/webm', 30]);
verifier('et 1,2 Mo pile passent', r.rows[0].j.ok === true);

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [
  Buffer.alloc(40, 1).toString('base64'),
  'audio/webm',
  5,
]);
verifier('un enregistrement vide est refusé', r.rows[0].j.erreur === 'vocal_vide');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, ['ceci n_est pas du son !!', 'audio/webm', 5]);
verifier("un base64 abîmé donne une erreur propre, pas une panne de base", r.rows[0].j.erreur === 'vocal_abime');

r = await commeApi(db, elle(awa), `select public.envoyer_vocal($1, $2, $3) as j`, [null, 'audio/webm', 5]);
verifier("un son absent est refusé sans planter", r.rows[0].j.ok === false);

r = await commeApi(db, { role: 'authenticated', sub: awa, entetes: null }, `select public.envoyer_vocal($1, $2, $3) as j`, [
  SON_64,
  'audio/webm',
  10,
]);
verifier("un appel qui ne vient pas du site est refusé", r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, { role: 'anon' }, `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 10]).catch(
  (e) => ({ rows: [{ j: { erreur: e.message } }] })
);
verifier(
  'une visiteuse non connectée ne peut pas envoyer de vocal',
  r.rows[0].j.erreur === 'connexion_requise' || String(r.rows[0].j.erreur).includes('permission')
);

// Les refus ne laissent rien derrière eux.
r = await commeServeur(
  db,
  `select count(*)::int as n from public.messages m join public.fils f on f.id = m.fil_id
    where f.profil_id = $1 and m.vocal_secondes is not null`,
  [awa]
);
verifier('seuls les trois vocaux valides ont laissé une trace', r.rows[0].n === 3, `trouvé ${r.rows[0].n}`);

r = await commeServeur(
  db,
  `select count(*)::int as n from public.messages m
    where m.vocal_secondes is not null
      and not exists (select 1 from public.vocaux v where v.message_id = m.id)`
);
verifier("aucun message ne se retrouve avec une durée mais sans son", r.rows[0].n === 0);

// ---------------------------------------------------------------------------
titre('Un message écrit reste un message écrit');

r = await commeApi(db, elle(awa), `select public.ecrire_a('medecin', $1) as j`, ['   ']);
verifier("un message écrit vide est toujours refusé", r.rows[0].j.erreur === 'message_vide');

let casse = false;
try {
  await commeServeur(
    db,
    `insert into public.messages (fil_id, de, texte)
     select id, 'elle', '' from public.fils where profil_id = $1 and sujet = 'medecin'`,
    [awa]
  );
} catch {
  casse = true;
}
verifier("même en direct, un texte vide sans vocal est refusé par la contrainte", casse);

// ---------------------------------------------------------------------------
titre('Ce qui sort dans la conversation');

r = await commeApi(db, elle(awa), `select public.mon_fil_de('medecin') as j`);
const fil = r.rows[0].j;
verifier('la conversation dit la durée du vocal', fil.messages.some((m) => m.vocal_secondes === 12));
verifier(
  "mais jamais le son : ouvrir la conversation ne doit pas faire payer des mégaoctets",
  !JSON.stringify(fil).includes(SON_64.slice(0, 40)) && !JSON.stringify(fil).includes('base64')
);

r = await commeServeur(db, `select id from public.fils where profil_id = $1 and sujet = 'medecin'`, [awa]);
const filId = r.rows[0].id;
r = await commeApi(db, elle(patronne), `select public.fil_complet($1) as j`, [filId]);
verifier(
  "l_administratrice voit la durée, pas le son",
  r.rows[0].j.messages.some((m) => m.vocal_secondes === 12) && !JSON.stringify(r.rows[0].j).includes('base64')
);
verifier("et le nombre de commandes n_apparaît pas dans une conversation médicale", r.rows[0].j.tete.commandes === null);

// ---------------------------------------------------------------------------
titre('Rien ne part ailleurs');

r = await commeServeur(db, `select count(*)::int as n from public.journal where profil_id = $1`, [awa]);
verifier("un vocal n_écrit rien dans le journal", r.rows[0].n === 0);

r = await commeServeur(db, `select count(*)::int as n from public.assistante_messages where profil_id = $1`, [awa]);
verifier("un vocal n_arrive pas chez l_assistante", r.rows[0].n === 0);

r = await commeApi(db, elle(awa), `select public.assistante_contexte() as j`);
verifier(
  "et l_assistante ne reçoit rien du vocal",
  !JSON.stringify(r.rows[0].j).includes('Message vocal') && !JSON.stringify(r.rows[0].j).includes(SON_64.slice(0, 40))
);

// ---------------------------------------------------------------------------
titre('« Effacer mes données » efface sa voix, et seulement la sienne');

// Bintou aussi a laissé un vocal, et une conversation avec la boutique.
r = await commeApi(db, elle(bintou), `select public.envoyer_vocal($1, $2, $3) as j`, [SON_64, 'audio/webm', 8]);
const idBintou = r.rows[0].j.message;
await commeApi(db, elle(awa), `select public.ecrire_a_la_boutique($1) as j`, ['Vous livrez à Tanghin ?']);

r = await commeApi(db, elle(awa), `select public.effacer_mes_donnees() as j`);
verifier("l'effacement passe", r.rows[0].j.ok === true);

r = await commeServeur(
  db,
  `select count(*)::int as n from public.vocaux v
     join public.messages m on m.id = v.message_id
     join public.fils f on f.id = m.fil_id
    where f.profil_id = $1`,
  [awa]
);
verifier("plus un seul vocal d'Awa ne reste", r.rows[0].n === 0, `restent ${r.rows[0].n}`);

r = await commeServeur(db, `select count(*)::int as n from public.fils where profil_id = $1 and sujet = 'medecin'`, [awa]);
verifier('et sa conversation avec le médecin a disparu', r.rows[0].n === 0);

r = await commeApi(db, elle(awa), `select public.lire_vocal($1) as j`, [idVocal]);
verifier('un vocal effacé ne s_écoute plus', r.rows[0].j.erreur === 'vocal_inconnu');

r = await commeServeur(db, `select count(*)::int as n from public.fils where profil_id = $1 and sujet = 'boutique'`, [awa]);
verifier("sa conversation avec la boutique reste, comme ses commandes", r.rows[0].n === 1);

r = await commeApi(db, elle(bintou), `select public.lire_vocal($1) as j`, [idBintou]);
verifier("le vocal de Bintou est intact : on n_efface que le sien", r.rows[0].j.ok === true && r.rows[0].j.base64 === SON_64);

r = await commeServeur(db, `select count(*)::int as n from public.vocaux`);
verifier('il reste exactement un son dans toute la base', r.rows[0].n === 1, `restent ${r.rows[0].n}`);

// ---------------------------------------------------------------------------
titre('Les vocaux avec la boutique, dans les deux sens');

const cleo = await nouveauCompte(db, 'cleo', 'Cléo');
const SON_B = Buffer.alloc(900, 3).toString('base64');

r = await commeApi(db, elle(cleo), `select public.envoyer_vocal($1, $2, $3, 'boutique') as j`, [SON_B, 'audio/webm', 7]);
verifier('Cléo envoie un vocal à la boutique', r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
verifier('il est dans le fil de la boutique', r.rows[0].j.sujet === 'boutique');
const idCleo = r.rows[0].j.message;

r = await commeServeur(db, `select count(*)::int as n from public.fils where profil_id = $1 and sujet = 'medecin'`, [cleo]);
verifier("et n'ouvre aucun fil chez le médecin", r.rows[0].n === 0);

r = await commeServeur(db, `select id from public.fils where profil_id = $1 and sujet = 'boutique'`, [cleo]);
const filCleo = r.rows[0].id;

// L'administratrice répond par un vocal
const REPONSE = Buffer.alloc(900, 9).toString('base64');
r = await commeApi(db, elle(patronne), `select public.repondre_vocal($1, $2, $3, $4) as j`, [filCleo, REPONSE, 'audio/webm', 5]);
verifier("l'administratrice répond par un vocal", r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));
const idReponse = r.rows[0].j.message;

r = await commeServeur(
  db,
  `select m.de, m.vocal_secondes, f.apercu, f.apercu_de, f.non_lus_elle
     from public.messages m join public.fils f on f.id = m.fil_id where m.id = $1`,
  [idReponse]
);
verifier('le message vient de la boutique', r.rows[0].de === 'boutique' && r.rows[0].vocal_secondes === 5);
verifier("l'aperçu le dit, et elle a un message non lu", r.rows[0].apercu === 'Message vocal · 5 s' && r.rows[0].apercu_de === 'boutique' && r.rows[0].non_lus_elle === 1);

r = await commeApi(db, elle(cleo), `select public.lire_vocal($1) as j`, [idReponse]);
verifier('Cléo écoute la réponse de la boutique', r.rows[0].j.ok === true && r.rows[0].j.base64 === REPONSE);

r = await commeApi(db, elle(bintou), `select public.lire_vocal($1) as j`, [idReponse]);
verifier("Bintou n'entend pas la réponse faite à Cléo", r.rows[0].j.erreur === 'vocal_inconnu');

r = await commeApi(db, elle(cleo), `select public.repondre_vocal($1, $2, $3, $4) as j`, [filCleo, REPONSE, 'audio/webm', 5]);
verifier("une utilisatrice ordinaire ne peut pas répondre à la place de la boutique", r.rows[0].j.erreur === 'acces_refuse');

r = await commeApi(db, elle(patronne), `select public.repondre_vocal($1, $2, $3, $4) as j`, [filCleo, REPONSE, 'audio/x-evil', 5]);
verifier('la réponse a les mêmes bornes de format', r.rows[0].j.erreur === 'format_refuse');
r = await commeApi(db, elle(patronne), `select public.repondre_vocal($1, $2, $3, $4) as j`, [filCleo, REPONSE, 'audio/webm', 91]);
verifier('et les mêmes bornes de durée', r.rows[0].j.erreur === 'duree_refusee');
r = await commeApi(db, elle(patronne), `select public.repondre_vocal($1, $2, $3, $4) as j`, ['00000000-0000-0000-0000-000000000000', REPONSE, 'audio/webm', 5]);
verifier('un fil inconnu est refusé', r.rows[0].j.erreur === 'fil_inconnu');

// Un message écrit de Cléo à la boutique, puis « effacer mes données »
await commeApi(db, elle(cleo), `select public.ecrire_a_la_boutique($1) as j`, ['Bonjour, une question.']);
r = await commeApi(db, elle(cleo), `select public.effacer_mes_donnees() as j`);
verifier("l'effacement passe", r.rows[0].j.ok === true);

r = await commeServeur(
  db,
  `select count(*)::int as n from public.messages m join public.fils f on f.id = m.fil_id
    where f.profil_id = $1 and m.vocal_secondes is not null`,
  [cleo]
);
verifier("toutes ses voix sont effacées, aussi celles de la boutique", r.rows[0].n === 0, `restent ${r.rows[0].n}`);

r = await commeApi(db, elle(cleo), `select public.lire_vocal($1) as j`, [idCleo]);
verifier('un vocal effacé ne s_écoute plus', r.rows[0].j.erreur === 'vocal_inconnu');

r = await commeServeur(db, `select count(*)::int as n from public.messages m join public.fils f on f.id = m.fil_id where f.profil_id = $1 and m.texte <> ''`, [cleo]);
verifier('ses messages écrits à la boutique restent', r.rows[0].n === 1, `${r.rows[0].n}`);

bilan('Messages vocaux');
await db.close();
