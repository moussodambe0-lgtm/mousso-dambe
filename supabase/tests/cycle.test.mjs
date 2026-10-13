// Le cycle : calcul des phases, des prévisions, et le journal.
import { nouvelleBase, nouveauCompte, commeApi, commeServeur, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const auth = { role: 'authenticated', sub: awa };

const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

titre('Le profil naît avec le compte');
{
  const r = await rpc(`select prenom, cycle_moyen, duree_regles, notifications_discretes, questionnaire_fini
                         from public.profils where id = auth.uid()`);
  verifier('le profil existe', !!r, 'aucun profil créé par le trigger');
  verifier('le prénom vient de la création du compte', r.prenom === 'Awa');
  verifier('cycle par défaut de 28 jours', r.cycle_moyen === 28);
  verifier('règles par défaut de 5 jours', r.duree_regles === 5);
  verifier('les notifications sont discrètes par défaut', r.notifications_discretes === true);
  verifier("le questionnaire n'est pas fini", r.questionnaire_fini === false);
}

titre("Le questionnaire enregistre le cycle et les dernières règles");
{
  const r = await rpc(`select public.enregistrer_questionnaire('Awa', 29, 5, current_date - 7) as x`);
  verifier('le questionnaire passe', r.x.ok === true, JSON.stringify(r.x));
  const p = await rpc(`select cycle_moyen, duree_regles, questionnaire_fini from public.profils where id = auth.uid()`);
  verifier('le cycle est enregistré', p.cycle_moyen === 29);
  verifier('le questionnaire est marqué fini', p.questionnaire_fini === true);
  const c = await rpc(`select count(*)::int as n from public.cycles where profil_id = auth.uid()`);
  verifier('un cycle est créé', c.n === 1);
}

titre('Un cycle hors limites est refusé');
{
  const trop = await rpc(`select public.enregistrer_questionnaire('Awa', 90, 5, null) as x`);
  verifier('un cycle de 90 jours est refusé', trop.x.ok === false && trop.x.erreur === 'cycle_invalide');
  const duree = await rpc(`select public.enregistrer_questionnaire('Awa', 29, 40, null) as x`);
  verifier('des règles de 40 jours sont refusées', duree.x.ok === false && duree.x.erreur === 'duree_invalide');
  const futur = await rpc(`select public.enregistrer_questionnaire('Awa', 29, 5, current_date + 10) as x`);
  verifier('une date dans le futur est refusée', futur.x.ok === false && futur.x.erreur === 'date_invalide');
}

titre('Le calcul du cycle');
{
  const r = await rpc(`select public.mon_cycle() as c`);
  const c = r.c;
  verifier('on est au jour 8', c.jour_du_cycle === 8, `jour ${c.jour_du_cycle}`);
  verifier('la phase est « elan »', c.phase === 'elan', `phase ${c.phase}`);
  // Cycle de 29 jours : les règles suivantes tombent 29 jours après le début
  // des précédentes, donc 22 jours après un jour 8. Ce n'est pas 29 moins 8.
  verifier('il reste 22 jours', c.jours_restants === 22, `${c.jours_restants} jours`);
  verifier('la fenêtre fertile est annoncée', !!c.fertile_debut && !!c.fertile_fin);
  verifier("rien n'est marqué dépassé", c.depasse === false);
}

titre('Les phases, une par une');
{
  const r = await commeServeur(db, `select
      public.phase_du_cycle(1, 5, 29) as j1,
      public.phase_du_cycle(5, 5, 29) as j5,
      public.phase_du_cycle(8, 5, 29) as j8,
      public.phase_du_cycle(10, 5, 29) as j10,
      public.phase_du_cycle(15, 5, 29) as j15,
      public.phase_du_cycle(16, 5, 29) as j16,
      public.phase_du_cycle(20, 5, 29) as j20,
      public.jour_ovulation(29) as ovu29,
      public.jour_ovulation(32) as ovu32`);
  const p = r.rows[0];
  verifier('le jour 1 est en règles', p.j1 === 'regles');
  verifier('le dernier jour de règles est en règles', p.j5 === 'regles');
  verifier("le jour 8 est en reprise d'élan", p.j8 === 'elan');
  verifier('le jour 10 ouvre la période fertile', p.j10 === 'fertile');
  verifier("le jour de l'ovulation est fertile", p.j15 === 'fertile');
  verifier('le lendemain est encore fertile', p.j16 === 'fertile');
  verifier('le jour 20 est en phase lune', p.j20 === 'lune');
  verifier("l'ovulation d'un cycle de 29 jours tombe au jour 15", p.ovu29 === 15);
  verifier("l'ovulation d'un cycle de 32 jours tombe au jour 18, pas au jour 14", p.ovu32 === 18);
}

titre('La moyenne observée est PROPOSÉE, jamais imposée');
{
  // Prompt d'Arthur du 13 octobre 2026 : « quand il y a au moins 3 cycles dans
  // l'historique, propose de mettre à jour cycleLength avec la moyenne ». Avant,
  // la base remplaçait en silence la durée du profil par la moyenne observée.
  const fati = await nouveauCompte(db, 'fati', 'Fatimata');
  const s = { role: 'authenticated', sub: fati };
  await rpc(`select public.enregistrer_questionnaire('Fatimata', 28, 4, null) as x`, [], s);
  // Trois cycles réels de 31 jours, alors qu'elle a déclaré 28.
  for (const jours of [93, 62, 31, 0]) {
    await rpc(`select public.declarer_regles(current_date - ${jours}) as x`, [], s);
  }
  const c = (await rpc(`select public.mon_cycle() as c`, [], s)).c;
  verifier('la durée du cycle reste celle du profil', c.cycle_moyen === 28, `${c.cycle_moyen}`);
  verifier('trois écarts ont été mesurés', c.cycles_mesures === 3, `${c.cycles_mesures} écarts`);
  verifier('la moyenne observée est proposée', c.moyenne_proposee === 31, `${c.moyenne_proposee}`);
  verifier('la prévision suit le PROFIL, pas la mesure', c.jours_restants === 28, `${c.jours_restants}`);

  // Elle accepte la proposition : la durée du profil devient la moyenne.
  await rpc(`select public.enregistrer_reglages(null, null, null, 31, null) as x`, [], s);
  const apres = (await rpc(`select public.mon_cycle() as c`, [], s)).c;
  verifier('une fois acceptée, la durée du profil est 31', apres.cycle_moyen === 31, `${apres.cycle_moyen}`);
  verifier('et plus rien n est proposé', apres.moyenne_proposee === null, `${apres.moyenne_proposee}`);
  verifier('la prévision suit maintenant 31 jours', apres.jours_restants === 31, `${apres.jours_restants}`);
}

titre('Deux cycles ne suffisent pas pour proposer une moyenne');
{
  const awi = await nouveauCompte(db, 'awi', 'Awi');
  const s = { role: 'authenticated', sub: awi };
  await rpc(`select public.enregistrer_questionnaire('Awi', 28, 4, null) as x`, [], s);
  for (const jours of [62, 31, 0]) {
    await rpc(`select public.declarer_regles(current_date - ${jours}) as x`, [], s);
  }
  const c = (await rpc(`select public.mon_cycle() as c`, [], s)).c;
  verifier('deux écarts : aucune proposition', c.moyenne_proposee === null, `${c.moyenne_proposee}`);
}

titre('Les bornes du moteur : cycle 21 à 45, règles 2 à 10');
{
  const ba = await nouveauCompte(db, 'ba', 'Ba');
  const s = { role: 'authenticated', sub: ba };
  const q = (cycle, duree) =>
    rpc(`select public.enregistrer_questionnaire('Ba', ${cycle}, ${duree}, null) as x`, [], s);
  verifier('un cycle de 20 jours est refusé', (await q(20, 5)).x.erreur === 'cycle_invalide');
  verifier('un cycle de 21 jours passe', (await q(21, 5)).x.ok === true);
  verifier('un cycle de 45 jours passe', (await q(45, 5)).x.ok === true);
  verifier('un cycle de 46 jours est refusé', (await q(46, 5)).x.erreur === 'cycle_invalide');
  verifier('des règles de 1 jour sont refusées', (await q(28, 1)).x.erreur === 'duree_invalide');
  verifier('des règles de 2 jours passent', (await q(28, 2)).x.ok === true);
  verifier('des règles de 10 jours passent', (await q(28, 10)).x.ok === true);
  verifier('des règles de 11 jours sont refusées', (await q(28, 11)).x.erreur === 'duree_invalide');
  const r = await rpc(`select public.declarer_regles(current_date + 1) as x`, [], s);
  verifier('des règles dans le futur sont refusées', r.x.erreur === 'date_invalide');
}

titre('Un retard long ne fabrique pas un faux jour de cycle');
{
  const mimi = await nouveauCompte(db, 'mimi', 'Mariam');
  const s = { role: 'authenticated', sub: mimi };
  await rpc(`select public.enregistrer_questionnaire('Mariam', 28, 5, current_date - 70) as x`, [], s);
  const c = (await rpc(`select public.mon_cycle() as c`, [], s)).c;
  verifier('le retard est signalé', c.depasse === true);
  verifier('la phase reste bornée au cycle', c.phase === 'lune', `phase ${c.phase}`);
}

titre('Le journal');
{
  const r = await rpc(`select public.noter_journee(current_date, 'moyen', 2, array['ventre','fatigue'], 'Journée dure') as x`);
  verifier('la journée est notée', r.x.ok === true, JSON.stringify(r.x));
  const j = await rpc(`select flux::text, douleur, signes, note from public.journal
                         where profil_id = auth.uid() and jour = current_date`);
  verifier('le flux est enregistré', j.flux === 'moyen');
  verifier('la douleur est enregistrée', j.douleur === 2);
  verifier('les deux signes sont gardés', j.signes.length === 2);

  const encore = await rpc(`select public.noter_journee(current_date, 'leger', 1, array['dos'], '') as x`);
  verifier('on peut corriger sa journée', encore.x.ok === true);
  const j2 = await rpc(`select flux::text, count(*) over () as n from public.journal
                          where profil_id = auth.uid() and jour = current_date`);
  verifier('la correction remplace, elle ne double pas', j2.flux === 'leger');
}

titre('Le journal filtre ce qui vient de dehors');
{
  const r = await rpc(`select public.noter_journee(current_date - 1, 'leger', 99,
                         array['ventre','<script>alert(1)</script>','n''importe quoi'], repeat('x', 900)) as x`);
  verifier("l'appel passe", r.x.ok === true);
  const j = await rpc(`select douleur, signes, length(note) as l from public.journal
                         where profil_id = auth.uid() and jour = current_date - 1`);
  verifier('une douleur de 99 est ramenée à 3', j.douleur === 3);
  verifier('seul le signe de la liste est gardé', j.signes.length === 1 && j.signes[0] === 'ventre');
  verifier('la note est coupée à 500 caractères', j.l === 500);
}

titre('Une date dans le futur est refusée');
{
  const r = await rpc(`select public.noter_journee(current_date + 3, 'moyen', 1, '{}', '') as x`);
  verifier('le futur est refusé', r.x.ok === false && r.x.erreur === 'date_invalide');
}

titre('Noter du sang déclare les règles toute seule');
{
  const lea = await nouveauCompte(db, 'lea', 'Léa');
  const s = { role: 'authenticated', sub: lea };
  await rpc(`select public.enregistrer_questionnaire('Léa', 28, 5, null) as x`, [], s);
  const avant = await rpc(`select count(*)::int as n from public.cycles where profil_id = auth.uid()`, [], s);
  await rpc(`select public.noter_journee(current_date, 'abondant', 2, '{}', '') as x`, [], s);
  const apres = await rpc(`select count(*)::int as n from public.cycles where profil_id = auth.uid()`, [], s);
  verifier('un cycle est né de la note', apres.n === avant.n + 1);

  // Elle note la veille aussi : ses règles avaient commencé plus tôt. On
  // recule le début, on n'ouvre pas un deuxième cycle.
  await rpc(`select public.noter_journee(current_date - 1, 'moyen', 1, '{}', '') as x`, [], s);
  const encore = await rpc(`select count(*)::int as n from public.cycles where profil_id = auth.uid()`, [], s);
  verifier('le jour noté avant ne crée pas un deuxième cycle', encore.n === apres.n, `${encore.n} cycles`);
  const d = await rpc(`select (debut = current_date - 1) as recule from public.cycles
                         where profil_id = auth.uid() order by debut desc limit 1`, [], s);
  verifier('le début des règles a reculé à la veille', d.recule === true);

  // Le surlendemain, toujours les mêmes règles : pas de nouveau cycle non plus.
  await rpc(`select public.noter_journee(current_date + 0, 'leger', 0, '{}', '') as x`, [], s);
  const toujours = await rpc(`select count(*)::int as n from public.cycles where profil_id = auth.uid()`, [], s);
  verifier('un jour déjà couvert ne crée rien', toujours.n === apres.n, `${toujours.n} cycles`);
}

titre('Effacer ses données efface vraiment');
{
  const r = await rpc(`select public.effacer_mes_donnees() as x`);
  verifier("l'effacement passe", r.x.ok === true);
  const n = await rpc(`select
      (select count(*)::int from public.journal where profil_id = auth.uid()) as j,
      (select count(*)::int from public.cycles where profil_id = auth.uid()) as c`);
  verifier('le journal est vide', n.j === 0);
  verifier('les cycles sont effacés', n.c === 0);
}

bilan('Cycle et journal');
await db.close();
