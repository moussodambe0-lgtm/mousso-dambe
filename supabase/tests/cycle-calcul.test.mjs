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
  joursDuCycle,
  MAX_JOURS_EPISODE,
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

titre("L'ovulation est au jour L − 14");
{
  // La formule du prompt d'Arthur (13 octobre 2026), écrite dans ses cinq cas
  // de test : pour un cycle de 28 jours, l'ovulation est le jour 14. Avant,
  // elle était comptée à 14 jours avant le PREMIER jour des règles suivantes,
  // soit le jour 15 : tout a reculé d'un jour.
  verifier('cycle de 28 jours : ovulation au jour 14', jourOvulation(28) === 14, `${jourOvulation(28)}`);
  verifier('cycle de 21 jours : ovulation au jour 7', jourOvulation(21) === 7, `${jourOvulation(21)}`);
  verifier('cycle de 35 jours : ovulation au jour 21', jourOvulation(35) === 21, `${jourOvulation(35)}`);
  verifier('cycle de 45 jours : ovulation au jour 31', jourOvulation(45) === 31, `${jourOvulation(45)}`);
  // Un cycle de 10 jours n'existe pas : il est lu comme un cycle de 21.
  verifier('un cycle impossible est ramené à 21 jours', jourOvulation(10) === 7, `${jourOvulation(10)}`);
}

titre('La fenêtre fertile');
{
  const f = fenetreFertile(28);
  verifier('elle ouvre cinq jours avant (jour L − 19)', f.debut === 9, `${f.debut}`);
  verifier("elle ferme le lendemain de l'ovulation (jour L − 13)", f.fin === 15, `${f.fin}`);
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
  // Avant le premier début de règles connu, il n'y a PAS de prédiction (prompt
  // d'Arthur, 13 octobre 2026 : « si diff < 0 : pas de prédiction »). Avant,
  // le calcul projetait vers l'arrière et montrait des fenêtres fertiles sur
  // des mois où rien n'avait été noté.
  verifier('une date antérieure n a aucun jour de cycle', cycleDeLaDate('2026-09-20', REGLAGES).jour === 0, `${cycleDeLaDate('2026-09-20', REGLAGES).jour}`);
  verifier('et elle est un jour ordinaire, sans couleur', infoDuJour('2026-09-20', REGLAGES).type === 'faible');
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
  verifier('jour 9 : fertile (la fenêtre s ouvre)', p('2026-10-13') === 'fertile');
  verifier('jour 10 : fertile', p('2026-10-14') === 'fertile');
  verifier('jour 14 : ovulation', p('2026-10-18') === 'ovulation', p('2026-10-18'));
  verifier('jour 15 : fertile (le lendemain)', p('2026-10-19') === 'fertile');
  verifier('jour 16 : faible fertilité', p('2026-10-20') === 'faible');
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
  verifier("l'ovulation est au risque le plus élevé", r('2026-10-18') === 'tres-eleve');
  verifier('la fenêtre fertile est élevée', r('2026-10-14') === 'eleve');
  verifier('les règles sont à risque faible', r('2026-10-05') === 'faible');
  verifier('un jour ordinaire est à risque faible', r('2026-10-25') === 'faible');
}

titre('Les prochaines dates');
{
  verifier('prochaines règles', prochainesRegles(REGLAGES, '2026-10-12') === '2026-11-02', prochainesRegles(REGLAGES, '2026-10-12'));
  verifier('prochaine ovulation', prochaineOvulation(REGLAGES, '2026-10-12') === '2026-10-18', prochaineOvulation(REGLAGES, '2026-10-12'));
  // Après l'ovulation de ce cycle, c'est celle du cycle suivant qui est annoncée.
  verifier(
    "passé l'ovulation, on annonce la suivante",
    prochaineOvulation(REGLAGES, '2026-10-22') === '2026-11-15',
    prochaineOvulation(REGLAGES, '2026-10-22')
  );
  verifier(
    'le jour même, on annonce ce jour',
    prochaineOvulation(REGLAGES, '2026-10-18') === '2026-10-18'
  );
}

titre('La moyenne des cycles réels');
{
  // Elle exige AU MOINS TROIS cycles complets (quatre débuts), comme le
  // prompt d'Arthur : moins, ce n'est pas une moyenne, c'est un hasard.
  verifier(
    'quatre débuts, trois cycles de 28 jours',
    moyenneCycles(['2026-10-05', '2026-09-07', '2026-08-10', '2026-07-13']) === 28
  );
  verifier(
    'une moyenne arrondie (28, 29, 30 donne 29)',
    moyenneCycles(['2026-04-02', '2026-03-03', '2026-02-02', '2026-01-05']) === 29
  );
  verifier('deux cycles ne suffisent pas', moyenneCycles(['2026-10-05', '2026-09-07', '2026-08-10']) === null);
  verifier('un seul début ne donne aucune moyenne', moyenneCycles(['2026-10-05']) === null);
  verifier('aucun début ne donne aucune moyenne', moyenneCycles([]) === null);
  // Un oubli de deux mois ne doit pas faire croire à un cycle de 60 jours.
  verifier(
    'un écart impossible est écarté',
    moyenneCycles(['2026-10-05', '2026-08-05', '2026-07-08', '2026-06-10', '2026-05-13']) === 28,
    `${moyenneCycles(['2026-10-05', '2026-08-05', '2026-07-08', '2026-06-10', '2026-05-13'])}`
  );
  verifier(
    'un ordre mélangé donne le même résultat',
    moyenneCycles(['2026-08-10', '2026-10-05', '2026-07-13', '2026-09-07']) === 28
  );
}

titre("Les segments de l'anneau");
{
  const s = segmentsAnneau(5, 28);
  verifier('un segment par jour', s.length === 28);
  verifier('les cinq premiers sont des règles', s.slice(0, 5).every((x) => x.type === 'regles'));
  verifier('le jour 14 est l’ovulation', s[13].type === 'ovulation');
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

titre("Dérouler un épisode de règles sans jamais partir en boucle");
{
  // Ce que ces vérifications protègent. L'accueil déroulait l'intervalle
  // début → fin à la main, sans borne. Une seule ligne de la base portant une
  // date de fin aberrante faisait tourner la page des millions de fois, et
  // Vercel la tuait à 15 secondes : « 504 FUNCTION_INVOCATION_TIMEOUT ». Le
  // défaut ne se voyait que chez une femme connectée ayant des cycles, donc
  // chez personne pendant les essais.
  verifier(
    'un épisode normal donne tous ses jours',
    JSON.stringify(joursDuCycle('2026-10-05', '2026-10-09')) ===
      JSON.stringify(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'])
  );
  verifier(
    'un épisode d\'un seul jour donne ce jour',
    JSON.stringify(joursDuCycle('2026-10-05', '2026-10-05')) === JSON.stringify(['2026-10-05'])
  );
  verifier(
    'une fin absente donne le seul jour de début',
    JSON.stringify(joursDuCycle('2026-10-05', null)) === JSON.stringify(['2026-10-05'])
  );
  verifier(
    'une fin avant le début ne déroule rien',
    JSON.stringify(joursDuCycle('2026-10-05', '2026-09-30')) === JSON.stringify(['2026-10-05'])
  );

  // LE CAS QUI TUAIT LA PAGE.
  const debut = Date.now();
  const absurde = joursDuCycle('2026-10-05', '9999-12-31');
  const duree = Date.now() - debut;
  verifier(
    'une date de fin aberrante ne déroule pas des millions de jours',
    absurde.length === 1,
    `${absurde.length} jours rendus`
  );
  verifier(`et elle répond tout de suite (${duree} ms)`, duree < 100, `${duree} ms`);

  verifier(
    'un épisode juste à la limite passe encore',
    joursDuCycle('2026-01-01', plusDeJours('2026-01-01', MAX_JOURS_EPISODE)).length ===
      MAX_JOURS_EPISODE + 1
  );
  verifier(
    'un jour de plus que la limite est refusé',
    joursDuCycle('2026-01-01', plusDeJours('2026-01-01', MAX_JOURS_EPISODE + 1)).length === 1
  );
  verifier('une date illisible ne fait pas tomber la page', joursDuCycle('n/importe/quoi', null).length <= 1);
  verifier(
    'une fin illisible rend quand même le début',
    JSON.stringify(joursDuCycle('2026-10-05', 'pas une date')) === JSON.stringify(['2026-10-05'])
  );
  verifier(
    "une fin horodatée est lue comme une date",
    joursDuCycle('2026-10-05', '2026-10-07T00:00:00+00:00').length === 3
  );
}

bilan('Calculateur du cycle');
