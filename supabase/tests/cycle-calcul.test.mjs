// Le calculateur du cycle, vérifié fonction par fonction.
//
// Ces tests ne touchent ni la base ni le réseau : ce sont des fonctions pures,
// et c'est exactement pour ça qu'on peut les vérifier aussi finement. Ils
// tournent en quelques millisecondes, contrairement aux suites PGlite.
import {
  jourOvulation,
  fenetreFertile,
  cycleDeLaDate,
  infoDuJour,
  prochainesRegles,
  prochaineOvulation,
  moyenneCycles,
  segmentsAnneau,
  alertesSante,
  plusDeJours,
  ecartEnJours,
} from '../../src/lib/cycle-calcul.ts';
import { verifier, bilan, titre } from './banc.mjs';

const REGLAGES = { debuts: ['2026-10-05'], dureeRegles: 5, dureeCycle: 28 };

titre('Les dates, sans piège de fuseau');
{
  verifier('ajouter un jour', plusDeJours('2026-10-05', 1) === '2026-10-06');
  verifier('changer de mois', plusDeJours('2026-10-31', 1) === '2026-11-01');
  verifier("passer l'année", plusDeJours('2026-12-31', 1) === '2027-01-01');
  verifier('reculer', plusDeJours('2026-03-01', -1) === '2026-02-28');
  verifier('année bissextile', plusDeJours('2028-02-28', 1) === '2028-02-29');
  verifier('écart simple', ecartEnJours('2026-10-15', '2026-10-05') === 10);
  verifier('écart négatif', ecartEnJours('2026-10-01', '2026-10-05') === -4);
}

titre("L'ovulation se compte depuis les règles qui viennent");
{
  // C'est la correction apportée par le code de référence d'Arthur : pour un
  // cycle de 28 jours, les prochaines règles tombent au jour 29, donc
  // l'ovulation au jour 15.
  verifier('cycle de 28 jours : ovulation au jour 15', jourOvulation(28) === 15, `${jourOvulation(28)}`);
  verifier('cycle de 21 jours : ovulation au jour 8', jourOvulation(21) === 8, `${jourOvulation(21)}`);
  verifier('cycle de 35 jours : ovulation au jour 22', jourOvulation(35) === 22, `${jourOvulation(35)}`);
  verifier('cycle de 40 jours : ovulation au jour 27', jourOvulation(40) === 27, `${jourOvulation(40)}`);
  verifier('un cycle très court ne sort pas du calendrier', jourOvulation(10) === 1);
}

titre('La fenêtre fertile');
{
  const f = fenetreFertile(28);
  verifier('elle ouvre cinq jours avant', f.debut === 10, `${f.debut}`);
  verifier("elle ferme le lendemain de l'ovulation", f.fin === 16, `${f.fin}`);
  verifier('elle dure sept jours', f.fin - f.debut + 1 === 7);
  const court = fenetreFertile(21);
  verifier('sur un cycle court elle reste dans le cycle', court.debut >= 1 && court.fin <= 21);
}

titre('Le cycle auquel appartient une date');
{
  verifier('le premier jour des règles est le jour 1', cycleDeLaDate('2026-10-05', REGLAGES).jour === 1);
  verifier('le lendemain est le jour 2', cycleDeLaDate('2026-10-06', REGLAGES).jour === 2);
  verifier('le dernier jour du cycle', cycleDeLaDate('2026-11-01', REGLAGES).jour === 28, `${cycleDeLaDate('2026-11-01', REGLAGES).jour}`);
  verifier('le cycle suivant repart à 1', cycleDeLaDate('2026-11-02', REGLAGES).jour === 1);
  verifier('et il déclare le bon début', cycleDeLaDate('2026-11-02', REGLAGES).debut === '2026-11-02');
  // Un mois antérieur à tout ce qu'on connaît : on projette en arrière.
  // Le cycle précédent commence 28 jours avant le 5 octobre, soit le 7
  // septembre : le 20 septembre en est donc le quatorzième jour.
  verifier('une date antérieure se projette en arrière', cycleDeLaDate('2026-09-20', REGLAGES).jour === 14, `${cycleDeLaDate('2026-09-20', REGLAGES).jour}`);
  verifier('et elle désigne le bon début', cycleDeLaDate('2026-09-20', REGLAGES).debut === '2026-09-07', cycleDeLaDate('2026-09-20', REGLAGES).debut);
}

titre('Les règles déclarées priment sur la projection');
{
  const r = { debuts: ['2026-10-05', '2026-09-02'], dureeRegles: 5, dureeCycle: 28 };
  verifier('le cycle de septembre est celui déclaré', cycleDeLaDate('2026-09-10', r).debut === '2026-09-02');
  verifier('et le rang suit ce début', cycleDeLaDate('2026-09-10', r).jour === 9);
  // L'écart réel est de 33 jours : les cinq derniers jours ne sont pas inventés.
  verifier('un cycle réel plus long ne décale pas le suivant', cycleDeLaDate('2026-10-05', r).jour === 1);
}

titre('La phase de chaque jour');
{
  const p = (iso) => infoDuJour(iso, REGLAGES, new Set(), '2026-10-12').type;
  verifier('jour 1 : règles', p('2026-10-05') === 'regles');
  verifier('jour 5 : règles', p('2026-10-09') === 'regles');
  verifier('jour 6 : risque faible', p('2026-10-10') === 'faible');
  verifier('jour 10 : fertile', p('2026-10-14') === 'fertile');
  verifier('jour 15 : ovulation', p('2026-10-19') === 'ovulation', p('2026-10-19'));
  verifier('jour 16 : fertile', p('2026-10-20') === 'fertile');
  verifier('jour 17 : risque faible', p('2026-10-21') === 'faible');
}

titre('Prévu ou vécu');
{
  const hui = '2026-10-12';
  const futur = infoDuJour('2026-11-02', REGLAGES, new Set(), hui);
  verifier('des règles à venir sont prévues', futur.type === 'regles' && futur.prevu === true);

  const passe = infoDuJour('2026-10-06', REGLAGES, new Set(), hui);
  verifier('des règles passées ne sont pas prévues', passe.prevu === false);

  const confirme = infoDuJour('2026-11-02', REGLAGES, new Set(['2026-11-02']), hui);
  verifier('un jour déclaré par elle n’est jamais « prévu »', confirme.prevu === false);

  const horsCycle = infoDuJour('2026-10-25', REGLAGES, new Set(['2026-10-25']), hui);
  verifier('un jour déclaré devient un jour de règles', horsCycle.type === 'regles');
}

titre('Le risque de grossesse');
{
  const r = (iso) => infoDuJour(iso, REGLAGES, new Set(), '2026-10-12').risque;
  verifier("l'ovulation est au risque le plus élevé", r('2026-10-19') === 'tres-eleve');
  verifier('la fenêtre fertile est élevée', r('2026-10-14') === 'eleve');
  verifier('les règles sont à risque faible', r('2026-10-05') === 'faible');
  verifier('un jour ordinaire est à risque faible', r('2026-10-25') === 'faible');
}

titre('Les prochaines dates');
{
  verifier('prochaines règles', prochainesRegles(REGLAGES, '2026-10-12') === '2026-11-02', prochainesRegles(REGLAGES, '2026-10-12'));
  verifier('prochaine ovulation', prochaineOvulation(REGLAGES, '2026-10-12') === '2026-10-19', prochaineOvulation(REGLAGES, '2026-10-12'));
  // Après l'ovulation de ce cycle, c'est celle du cycle suivant qui est annoncée.
  verifier(
    "passé l'ovulation, on annonce la suivante",
    prochaineOvulation(REGLAGES, '2026-10-22') === '2026-11-16',
    prochaineOvulation(REGLAGES, '2026-10-22')
  );
  verifier(
    'le jour même, on annonce ce jour',
    prochaineOvulation(REGLAGES, '2026-10-19') === '2026-10-19'
  );
}

titre('La moyenne des cycles réels');
{
  verifier('trois cycles de 28 jours', moyenneCycles(['2026-10-05', '2026-09-07', '2026-08-10']) === 28);
  verifier('une moyenne arrondie', moyenneCycles(['2026-10-05', '2026-09-06', '2026-08-10']) === 28);
  verifier('un seul début ne donne aucune moyenne', moyenneCycles(['2026-10-05']) === null);
  verifier('aucun début ne donne aucune moyenne', moyenneCycles([]) === null);
  // Un oubli de trois mois ne doit pas faire croire à un cycle de 90 jours.
  verifier(
    'un écart impossible est écarté',
    moyenneCycles(['2026-10-05', '2026-07-05', '2026-06-07']) === 28,
    `${moyenneCycles(['2026-10-05', '2026-07-05', '2026-06-07'])}`
  );
  verifier('un ordre mélangé donne le même résultat', moyenneCycles(['2026-08-10', '2026-10-05', '2026-09-07']) === 28);
}

titre("Les segments de l'anneau");
{
  const s = segmentsAnneau(5, 28);
  verifier('un segment par jour', s.length === 28);
  verifier('les cinq premiers sont des règles', s.slice(0, 5).every((x) => x.type === 'regles'));
  verifier('le jour 15 est l’ovulation', s[14].type === 'ovulation');
  verifier('le jour 10 est fertile', s[9].type === 'fertile');
  verifier('le jour 28 est à risque faible', s[27].type === 'faible');
  const nbFertiles = s.filter((x) => x.type === 'fertile' || x.type === 'ovulation').length;
  verifier('sept jours fertiles en tout', nbFertiles === 7, `${nbFertiles}`);
}

titre('Les alertes de santé');
{
  const rien = alertesSante({ dureesRegles: [5, 5], ecartsCycles: [28, 29], retard: 0, douleursFortes: 0, fluxAbondants: 0 });
  verifier('un cycle ordinaire ne déclenche rien', rien.length === 0, `${rien.length} alertes`);

  const longues = alertesSante({ dureesRegles: [9], ecartsCycles: [28], retard: 0, douleursFortes: 0, fluxAbondants: 0 });
  verifier('des règles de 9 jours alertent', longues.length === 1 && longues[0].titre.includes('durent longtemps'));

  const courts = alertesSante({ dureesRegles: [5], ecartsCycles: [19], retard: 0, douleursFortes: 0, fluxAbondants: 0 });
  verifier('un cycle de 19 jours alerte', courts.some((a) => a.titre.includes('courts')));

  const longs = alertesSante({ dureesRegles: [5], ecartsCycles: [38], retard: 0, douleursFortes: 0, fluxAbondants: 0 });
  verifier('un cycle de 38 jours alerte', longs.some((a) => a.titre.includes('longs')));

  const retard = alertesSante({ dureesRegles: [5], ecartsCycles: [28], retard: 10, douleursFortes: 0, fluxAbondants: 0 });
  verifier('un retard de 10 jours alerte', retard.some((a) => a.titre.includes('10 jours de retard')));
  verifier('le texte du retard parle du test de grossesse', retard.some((a) => a.texte.includes('test de grossesse')));

  const petitRetard = alertesSante({ dureesRegles: [5], ecartsCycles: [28], retard: 3, douleursFortes: 0, fluxAbondants: 0 });
  verifier('un retard de 3 jours n’alerte pas', petitRetard.length === 0);

  const douleurs = alertesSante({ dureesRegles: [5], ecartsCycles: [28], retard: 0, douleursFortes: 4, fluxAbondants: 0 });
  verifier('quatre douleurs fortes alertent', douleurs.some((a) => a.titre.includes('douleurs fortes')));

  const flux = alertesSante({ dureesRegles: [5], ecartsCycles: [28], retard: 0, douleursFortes: 0, fluxAbondants: 6 });
  verifier('six jours abondants alertent', flux.some((a) => a.titre.includes('abondants')));

  const toutes = alertesSante({ dureesRegles: [9], ecartsCycles: [19, 38], retard: 12, douleursFortes: 5, fluxAbondants: 7 });
  verifier('tout peut alerter en même temps', toutes.length === 6, `${toutes.length} alertes`);
  verifier(
    'chaque alerte dit quoi faire',
    toutes.every((a) => /sage-femme|centre de santé|test de grossesse|consultation/i.test(a.texte))
  );
  verifier(
    'aucune alerte ne nomme une maladie comme cause',
    toutes.every((a) => !/cancer|infection|tumeur|kyste|fibrome/i.test(a.texte))
  );
}

bilan('Calculateur du cycle');
