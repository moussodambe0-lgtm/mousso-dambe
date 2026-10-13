/**
 * Tests du moteur de calcul (src/lib/cycleEngine.ts).
 *
 * Fichier fourni par Arthur le 13 octobre 2026 (code 2 de son prompt « calcul
 * du cycle »). Seuls changements : le chemin d'import, et les guillemets
 * inversés des gabarits de texte, que le copier-coller avait perdus.
 *
 * Lancer : node --test supabase/tests/cycleEngine.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  averageCycleLength,
  diffInDays,
  getCycleSummary,
  getDayStatus,
  getMonthStatuses,
  getPredictions,
  validateProfile,
  type CycleProfile,
  type DayStatus,
} from '../../src/lib/cycleEngine.ts';

/** Vérifie le statut de chaque jour d'une plage (bornes incluses). */
function expectRange(profile: CycleProfile, from: string, to: string, status: DayStatus) {
  for (let d = from; diffInDays(d, to) >= 0; d = addDays(d, 1)) {
    assert.equal(getDayStatus(d, profile).status, status, `${d} devrait être "${status}"`);
  }
}

test('Cas 1 — 05/01/2026, cycle 28 j, règles 5 j', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05', cycleLength: 28, periodLength: 5 };
  const [c0, c1] = getPredictions(p, 2);

  assert.equal(c0.periodStart, '2026-01-05');
  assert.equal(c0.periodEnd, '2026-01-09');
  assert.equal(c0.fertileStart, '2026-01-13');
  assert.equal(c0.fertileEnd, '2026-01-19');
  assert.equal(c0.ovulation, '2026-01-18');
  assert.equal(c0.nextPeriodStart, '2026-02-02');
  assert.equal(c1.periodStart, '2026-02-02');
  assert.equal(c1.ovulation, '2026-02-15');

  expectRange(p, '2026-01-05', '2026-01-09', 'period');
  expectRange(p, '2026-01-10', '2026-01-12', 'low');
  expectRange(p, '2026-01-13', '2026-01-17', 'fertile');
  expectRange(p, '2026-01-18', '2026-01-18', 'ovulation');
  expectRange(p, '2026-01-19', '2026-01-19', 'fertile');
  expectRange(p, '2026-01-20', '2026-02-01', 'low');
  expectRange(p, '2026-02-02', '2026-02-06', 'period');
});

test('Cas 2 — 03/03/2026, cycle 30 j, règles 4 j', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-03-03', cycleLength: 30, periodLength: 4 };
  const [c0] = getPredictions(p, 1);
  assert.equal(c0.periodEnd, '2026-03-06');
  assert.equal(c0.fertileStart, '2026-03-13');
  assert.equal(c0.fertileEnd, '2026-03-19');
  assert.equal(c0.ovulation, '2026-03-18');
  assert.equal(c0.nextPeriodStart, '2026-04-02');
});

test('Cas 3 — cycle court 24 j, chevauchement règles / fenêtre fertile, février', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-02-20', cycleLength: 24, periodLength: 6 };
  const [c0] = getPredictions(p, 1);
  assert.equal(c0.periodEnd, '2026-02-25');
  assert.equal(c0.ovulation, '2026-03-01');
  assert.equal(c0.fertileStart, '2026-02-24');
  assert.equal(c0.fertileEnd, '2026-03-02');
  assert.equal(c0.nextPeriodStart, '2026-03-16');
  // Priorité : les règles l'emportent sur la fenêtre fertile
  expectRange(p, '2026-02-24', '2026-02-25', 'period');
  expectRange(p, '2026-02-26', '2026-02-28', 'fertile');
  expectRange(p, '2026-03-01', '2026-03-01', 'ovulation');
  expectRange(p, '2026-03-02', '2026-03-02', 'fertile');
});

test('Cas 4 — cycle minimum 21 j', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-06-10', cycleLength: 21, periodLength: 5 };
  const [c0] = getPredictions(p, 1);
  assert.equal(c0.periodEnd, '2026-06-14');
  assert.equal(c0.ovulation, '2026-06-16');
  assert.equal(c0.fertileStart, '2026-06-11');
  assert.equal(c0.fertileEnd, '2026-06-17');
  assert.equal(c0.nextPeriodStart, '2026-07-01');
  expectRange(p, '2026-06-11', '2026-06-14', 'period');
  expectRange(p, '2026-06-15', '2026-06-15', 'fertile');
  expectRange(p, '2026-06-16', '2026-06-16', 'ovulation');
});

test("Cas 5 — passage d'une année à l'autre", () => {
  const p: CycleProfile = { lastPeriodStart: '2026-12-20', cycleLength: 28, periodLength: 5 };
  const [c0] = getPredictions(p, 1);
  assert.equal(c0.ovulation, '2027-01-02');
  assert.equal(c0.fertileStart, '2026-12-28');
  assert.equal(c0.fertileEnd, '2027-01-03');
  assert.equal(c0.nextPeriodStart, '2027-01-17');
});

test('Année bissextile — février 2028', () => {
  const p: CycleProfile = { lastPeriodStart: '2028-02-20', cycleLength: 28, periodLength: 5 };
  const [c0] = getPredictions(p, 1);
  assert.equal(c0.ovulation, '2028-03-04');
  assert.equal(c0.nextPeriodStart, '2028-03-19');
});

test('Les cycles se répètent loin dans le futur', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05', cycleLength: 28, periodLength: 5 };
  // 7e cycle : 05/01 + 6 × 28 = 22/06/2026
  const info = getDayStatus('2026-06-22', p);
  assert.equal(info.cycleDay, 1);
  assert.equal(info.cycleIndex, 6);
  assert.equal(info.status, 'period');
  assert.equal(getDayStatus('2026-07-05', p).status, 'ovulation');
  assert.equal(getPredictions(p, 12)[11].periodStart, addDays('2026-01-05', 11 * 28));
});

test('Date avant les dernières règles → pas de prédiction', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05' };
  const info = getDayStatus('2026-01-04', p);
  assert.equal(info.status, 'none');
  assert.equal(info.cycleDay, null);
  assert.equal(getCycleSummary(p, '2026-01-04'), null);
});

test('Valeurs par défaut : cycle 28 j, règles 5 j', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05' };
  assert.equal(getPredictions(p, 1)[0].ovulation, '2026-01-18');
  assert.equal(getPredictions(p, 1)[0].periodEnd, '2026-01-09');
});

test('Valeurs limites : L = 45, D = 2, D = 10', () => {
  const long: CycleProfile = { lastPeriodStart: '2026-01-01', cycleLength: 45, periodLength: 2 };
  const [c] = getPredictions(long, 1);
  assert.equal(c.periodEnd, '2026-01-02');
  assert.equal(c.ovulation, '2026-01-31'); // jour 31
  assert.equal(c.fertileStart, '2026-01-26');
  assert.equal(c.fertileEnd, '2026-02-01');
  assert.equal(c.nextPeriodStart, '2026-02-15');

  // Règles de 10 j sur un cycle de 21 j : les règles recouvrent toute la fenêtre fertile
  const extreme: CycleProfile = { lastPeriodStart: '2026-01-01', cycleLength: 21, periodLength: 10 };
  expectRange(extreme, '2026-01-01', '2026-01-10', 'period');
  expectRange(extreme, '2026-01-11', '2026-01-21', 'low');
});

test('Chaque jour a exactement un statut, sur 400 jours et toutes les durées', () => {
  for (let L = 21; L <= 45; L++) {
    for (let D = 2; D <= 10; D++) {
      const p: CycleProfile = { lastPeriodStart: '2026-01-01', cycleLength: L, periodLength: D };
      let ovulations = 0;
      for (let i = 0; i < L; i++) {
        const info = getDayStatus(addDays('2026-01-01', i), p);
        assert.equal(info.cycleDay, i + 1);
        assert.notEqual(info.status, 'none');
        if (info.status === 'ovulation') ovulations++;
      }
      assert.ok(ovulations <= 1);
      // Le cycle suivant est identique, décalé de L jours
      for (let i = 0; i < 400; i++) {
        const a = getDayStatus(addDays('2026-01-01', i), p).status;
        const b = getDayStatus(addDays('2026-01-01', i + L), p).status;
        assert.equal(a, b);
      }
    }
  }
});

test('Résumé du tableau de bord', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05', cycleLength: 28, periodLength: 5 };

  const s1 = getCycleSummary(p, '2026-01-10')!;
  assert.equal(s1.cycleDay, 6);
  assert.equal(s1.phase, 'follicular');
  assert.equal(s1.nextPeriodStart, '2026-02-02');
  assert.equal(s1.daysUntilNextPeriod, 23);
  assert.equal(s1.nextOvulation, '2026-01-18');
  assert.equal(s1.daysUntilNextOvulation, 8);
  assert.equal(s1.nextFertileStart, '2026-01-13');
  assert.equal(s1.isInFertileWindow, false);

  // Le jour de l'ovulation
  const s2 = getCycleSummary(p, '2026-01-18')!;
  assert.equal(s2.status, 'ovulation');
  assert.equal(s2.daysUntilNextOvulation, 0);
  assert.equal(s2.isInFertileWindow, true);

  // Après la fenêtre fertile → on annonce celle du cycle suivant
  const s3 = getCycleSummary(p, '2026-01-25')!;
  assert.equal(s3.phase, 'luteal');
  assert.equal(s3.nextOvulation, '2026-02-15');
  assert.equal(s3.nextFertileStart, '2026-02-10');
  assert.equal(s3.nextFertileEnd, '2026-02-16');
  assert.equal(s3.daysUntilNextPeriod, 8);

  // Le 1er jour des règles suivantes → les "prochaines" sont celles d'après
  const s4 = getCycleSummary(p, '2026-02-02')!;
  assert.equal(s4.cycleDay, 1);
  assert.equal(s4.nextPeriodStart, '2026-03-02');
  assert.equal(s4.daysUntilNextPeriod, 28);
});

test('Mois complet pour le cercle et le calendrier', () => {
  const p: CycleProfile = { lastPeriodStart: '2026-01-05', cycleLength: 28, periodLength: 5 };
  const jan = getMonthStatuses(2026, 1, p);
  assert.equal(jan.length, 31);
  assert.equal(jan[0].status, 'none'); // 1er janvier : avant J1
  assert.equal(jan[4].status, 'period'); // 5 janvier
  assert.equal(jan[17].status, 'ovulation'); // 18 janvier
  assert.equal(getMonthStatuses(2026, 2, p).length, 28);
  assert.equal(getMonthStatuses(2028, 2, p).length, 29);
});

test('Objets Date : aucun décalage de fuseau horaire', () => {
  const p: CycleProfile = { lastPeriodStart: new Date(2026, 0, 5, 23, 30), cycleLength: 28 };
  assert.equal(getDayStatus(new Date(2026, 0, 5, 0, 5), p).cycleDay, 1);
  assert.equal(getDayStatus(new Date(2026, 0, 18, 12, 0), p).status, 'ovulation');
  // Changement d'heure (fin mars en Europe) : toujours 1 jour = 1 jour
  assert.equal(diffInDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
});

test('Validation du profil', () => {
  const today = '2026-10-13';
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03', cycleLength: 28, periodLength: 5 }, today).valid, true);
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03' }, today).valid, true);
  assert.equal(validateProfile({}, today).valid, false);
  assert.equal(validateProfile(null, today).valid, false);
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-14' }, today).valid, false); // futur
  assert.equal(validateProfile({ lastPeriodStart: '2026-02-30' }, today).valid, false); // date inexistante
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03', cycleLength: 20 }, today).valid, false);
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03', cycleLength: 46 }, today).valid, false);
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03', periodLength: 1 }, today).valid, false);
  assert.equal(validateProfile({ lastPeriodStart: '2026-10-03', periodLength: 11 }, today).valid, false);
  assert.throws(() => getDayStatus('2026-10-13', { lastPeriodStart: '2026-10-03', cycleLength: 10 }));
});

test("Moyenne du cycle à partir de l'historique", () => {
  assert.equal(averageCycleLength(['2026-01-05', '2026-02-02']), null); // 1 seul cycle
  assert.equal(averageCycleLength(['2026-01-05', '2026-02-02', '2026-03-03']), null); // 2 cycles
  // 28, 29, 30 → 29
  assert.equal(averageCycleLength(['2026-01-05', '2026-02-02', '2026-03-03', '2026-04-02']), 29);
  // Ordre quelconque + doublon + écart aberrant (60 j) ignoré
  assert.equal(
    averageCycleLength(['2026-04-02', '2026-01-05', '2026-03-03', '2026-02-02', '2026-02-02', '2026-06-01']),
    29,
  );
});
