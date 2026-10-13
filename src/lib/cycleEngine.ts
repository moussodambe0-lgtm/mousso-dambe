/**
 * cycleEngine.ts — Moteur de calcul du cycle menstruel
 * ------------------------------------------------------
 * Module pur : aucune dépendance, aucune UI, aucun accès réseau.
 * Le cercle du tableau de bord ET le calendrier doivent tous les deux
 * passer par ces fonctions (une seule source de vérité).
 *
 * Conventions de calcul (J1 = 1er jour des dernières règles, L = durée du cycle,
 * D = durée des règles) :
 *   - Règles            : jours 1 à D
 *   - Ovulation         : jour (L − 14)
 *   - Fenêtre fertile   : jours (L − 19) à (L − 13)
 *   - Prochaines règles : J1 + L jours
 *   - Priorité d'affichage : règles > ovulation > fertile > faible fertilité
 *
 * Toutes les dates sont manipulées comme des jours calendaires SANS heure
 * (format 'AAAA-MM-JJ'), ce qui évite les bugs de fuseau horaire.
 *
 * Ces résultats sont des estimations : ils ne remplacent pas un avis médical
 * et ne constituent pas une méthode de contraception fiable.
 *
 * Ce fichier est celui fourni par Arthur le 13 octobre 2026 (code 1 de son
 * prompt « calcul du cycle »). Deux ajouts seulement, signalés par « AJOUT » :
 * deux petites fonctions qui exposent les jours de repère, pour que le reste de
 * l'application ne recopie jamais la formule.
 */

// ───────────────────────────── Types ─────────────────────────────

/** Date calendaire : chaîne 'AAAA-MM-JJ' ou objet Date (lu en heure locale). */
export type DateInput = string | Date;

export type DayStatus =
  | 'period' // règles
  | 'ovulation' // jour d'ovulation estimé
  | 'fertile' // fenêtre fertile
  | 'low' // faible fertilité
  | 'none'; // pas de prédiction (date avant J1 ou profil incomplet)

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface CycleProfile {
  /** 1er jour des dernières règles. */
  lastPeriodStart: DateInput;
  /** Durée du cycle en jours (21 à 45). Défaut : 28. */
  cycleLength?: number;
  /** Durée des règles en jours (2 à 10). Défaut : 5. */
  periodLength?: number;
}

export interface DayInfo {
  date: string; // 'AAAA-MM-JJ'
  status: DayStatus;
  /** Jour du cycle (1 = 1er jour des règles). null si pas de prédiction. */
  cycleDay: number | null;
  /** 0 = cycle en cours à partir de J1, 1 = cycle suivant, etc. */
  cycleIndex: number | null;
  phase: CyclePhase | null;
}

export interface CyclePrediction {
  cycleIndex: number;
  periodStart: string;
  periodEnd: string;
  fertileStart: string;
  fertileEnd: string;
  ovulation: string;
  /** 1er jour des règles suivantes (= début du cycle d'après). */
  nextPeriodStart: string;
}

export interface CycleSummary {
  today: string;
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  status: DayStatus;
  phase: CyclePhase;
  /** Date des prochaines règles (strictement après aujourd'hui). */
  nextPeriodStart: string;
  daysUntilNextPeriod: number;
  /** Prochaine ovulation (aujourd'hui inclus). */
  nextOvulation: string;
  daysUntilNextOvulation: number;
  /** Prochaine fenêtre fertile (ou celle en cours). */
  nextFertileStart: string;
  nextFertileEnd: string;
  isInFertileWindow: boolean;
}

// ─────────────────────────── Constantes ───────────────────────────

export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
export const MIN_CYCLE_LENGTH = 21;
export const MAX_CYCLE_LENGTH = 45;
export const MIN_PERIOD_LENGTH = 2;
export const MAX_PERIOD_LENGTH = 10;

/** Nombre de jours entre l'ovulation et les règles suivantes (phase lutéale). */
const LUTEAL_DAYS = 14;
/** Jours fertiles avant l'ovulation. */
const FERTILE_DAYS_BEFORE = 5;
/** Jours fertiles après l'ovulation. */
const FERTILE_DAYS_AFTER = 1;

const MS_PER_DAY = 86_400_000;

// ─────────────────────── Utilitaires de dates ───────────────────────
// On convertit chaque date en "numéro de jour" (entier) basé sur l'UTC.
// L'UTC n'a pas de changement d'heure : les soustractions sont donc exactes.

function toDayNumber(input: DateInput): number {
  let y: number;
  let m: number;
  let d: number;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error('Date invalide');
    // On lit l'année/mois/jour LOCAUX : c'est le jour que voit l'utilisatrice.
    y = input.getFullYear();
    m = input.getMonth() + 1;
    d = input.getDate();
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (!match) throw new Error(`Format de date invalide : "${input}" (attendu AAAA-MM-JJ)`);
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  }

  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Date inexistante : ${y}-${m}-${d}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

function fromDayNumber(n: number): string {
  const dt = new Date(n * MS_PER_DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convertit n'importe quelle entrée en 'AAAA-MM-JJ'. */
export function toDateString(input: DateInput): string {
  return fromDayNumber(toDayNumber(input));
}

/** Convertit 'AAAA-MM-JJ' en objet Date local (minuit), pour les composants UI. */
export function toLocalDate(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Ajoute (ou retire) des jours à une date. */
export function addDays(input: DateInput, days: number): string {
  return fromDayNumber(toDayNumber(input) + days);
}

/** Nombre de jours calendaires de from à to (négatif si to est avant). */
export function diffInDays(from: DateInput, to: DateInput): number {
  return toDayNumber(to) - toDayNumber(from);
}

// ─────────────────────────── Validation ───────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Vérifie les informations saisies par l'utilisatrice.
 * today sert à refuser une date de dernières règles dans le futur.
 */
export function validateProfile(
  profile: Partial<CycleProfile> | null | undefined,
  today: DateInput = new Date(),
): ValidationResult {
  const errors: string[] = [];

  if (!profile || profile.lastPeriodStart == null || profile.lastPeriodStart === '') {
    errors.push('La date des dernières règles est obligatoire.');
  } else {
    try {
      if (toDayNumber(profile.lastPeriodStart) > toDayNumber(today)) {
        errors.push('La date des dernières règles ne peut pas être dans le futur.');
      }
    } catch {
      errors.push('La date des dernières règles est invalide.');
    }
  }

  const L = profile?.cycleLength ?? DEFAULT_CYCLE_LENGTH;
  if (!Number.isInteger(L) || L < MIN_CYCLE_LENGTH || L > MAX_CYCLE_LENGTH) {
    errors.push(
      `La durée du cycle doit être comprise entre ${MIN_CYCLE_LENGTH} et ${MAX_CYCLE_LENGTH} jours.`,
    );
  }

  const D = profile?.periodLength ?? DEFAULT_PERIOD_LENGTH;
  if (!Number.isInteger(D) || D < MIN_PERIOD_LENGTH || D > MAX_PERIOD_LENGTH) {
    errors.push(
      `La durée des règles doit être comprise entre ${MIN_PERIOD_LENGTH} et ${MAX_PERIOD_LENGTH} jours.`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ───────────────────────── Calculs internes ─────────────────────────

interface Resolved {
  start: number; // numéro de jour de J1
  L: number;
  D: number;
  ovulationDay: number; // jour du cycle
  fertileStartDay: number; // jour du cycle
  fertileEndDay: number; // jour du cycle
}

function resolve(profile: CycleProfile): Resolved {
  const L = profile.cycleLength ?? DEFAULT_CYCLE_LENGTH;
  const D = profile.periodLength ?? DEFAULT_PERIOD_LENGTH;

  if (!Number.isInteger(L) || L < MIN_CYCLE_LENGTH || L > MAX_CYCLE_LENGTH) {
    throw new Error(`cycleLength hors limites (${MIN_CYCLE_LENGTH}–${MAX_CYCLE_LENGTH}) : ${L}`);
  }
  if (!Number.isInteger(D) || D < MIN_PERIOD_LENGTH || D > MAX_PERIOD_LENGTH) {
    throw new Error(`periodLength hors limites (${MIN_PERIOD_LENGTH}–${MAX_PERIOD_LENGTH}) : ${D}`);
  }

  const ovulationDay = L - LUTEAL_DAYS;
  return {
    start: toDayNumber(profile.lastPeriodStart),
    L,
    D,
    ovulationDay,
    fertileStartDay: ovulationDay - FERTILE_DAYS_BEFORE,
    fertileEndDay: ovulationDay + FERTILE_DAYS_AFTER,
  };
}

function statusForCycleDay(cycleDay: number, r: Resolved): DayStatus {
  // Ordre = priorité : règles > ovulation > fertile > faible fertilité
  if (cycleDay <= r.D) return 'period';
  if (cycleDay === r.ovulationDay) return 'ovulation';
  if (cycleDay >= r.fertileStartDay && cycleDay <= r.fertileEndDay) return 'fertile';
  return 'low';
}

function phaseForCycleDay(cycleDay: number, r: Resolved): CyclePhase {
  if (cycleDay <= r.D) return 'menstrual';
  if (cycleDay < r.ovulationDay) return 'follicular';
  if (cycleDay === r.ovulationDay) return 'ovulation';
  return 'luteal';
}

function buildPrediction(cycleIndex: number, r: Resolved): CyclePrediction {
  const cycleStart = r.start + cycleIndex * r.L;
  return {
    cycleIndex,
    periodStart: fromDayNumber(cycleStart),
    periodEnd: fromDayNumber(cycleStart + r.D - 1),
    fertileStart: fromDayNumber(cycleStart + r.fertileStartDay - 1),
    fertileEnd: fromDayNumber(cycleStart + r.fertileEndDay - 1),
    ovulation: fromDayNumber(cycleStart + r.ovulationDay - 1),
    nextPeriodStart: fromDayNumber(cycleStart + r.L),
  };
}

// ─────────────────────────── API publique ───────────────────────────

/**
 * AJOUT — Le jour du cycle où tombe l'ovulation, pour une durée de cycle L.
 * Existe pour que personne ne recopie « L − 14 » ailleurs.
 */
export function ovulationCycleDay(cycleLength: number): number {
  return cycleLength - LUTEAL_DAYS;
}

/**
 * AJOUT — Les jours du cycle (début et fin) de la fenêtre fertile, pour L.
 */
export function fertileCycleDays(cycleLength: number): { start: number; end: number } {
  const o = cycleLength - LUTEAL_DAYS;
  return { start: o - FERTILE_DAYS_BEFORE, end: o + FERTILE_DAYS_AFTER };
}

/**
 * Statut d'un jour précis pour une utilisatrice.
 * À appeler pour CHAQUE jour affiché dans le cercle et dans le calendrier.
 * Les cycles se répètent à l'infini dans le futur.
 * Pour une date antérieure à J1 : statut 'none' (pas de prédiction).
 */
export function getDayStatus(date: DateInput, profile: CycleProfile): DayInfo {
  const r = resolve(profile);
  const day = toDayNumber(date);
  const diff = day - r.start;

  if (diff < 0) {
    return {
      date: fromDayNumber(day),
      status: 'none',
      cycleDay: null,
      cycleIndex: null,
      phase: null,
    };
  }

  const cycleIndex = Math.floor(diff / r.L);
  const cycleDay = (diff % r.L) + 1;

  return {
    date: fromDayNumber(day),
    status: statusForCycleDay(cycleDay, r),
    cycleDay,
    cycleIndex,
    phase: phaseForCycleDay(cycleDay, r),
  };
}

/**
 * Statuts de tous les jours d'un mois (pour le calendrier et le cercle 1→31).
 * month va de 1 (janvier) à 12 (décembre).
 */
export function getMonthStatuses(year: number, month: number, profile: CycleProfile): DayInfo[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = Math.round(Date.UTC(year, month - 1, 1) / MS_PER_DAY);
  const result: DayInfo[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    result.push(getDayStatus(fromDayNumber(first + i), profile));
  }
  return result;
}

/**
 * Liste des cycles à venir, à partir du cycle qui commence à J1.
 * Exemple : getPredictions(profil, 12) → 12 cycles avec toutes leurs dates.
 */
export function getPredictions(profile: CycleProfile, cycleCount = 12): CyclePrediction[] {
  const r = resolve(profile);
  const list: CyclePrediction[] = [];
  for (let i = 0; i < cycleCount; i++) list.push(buildPrediction(i, r));
  return list;
}

/**
 * Résumé pour le tableau de bord : jour du cycle, prochaines règles,
 * prochaine ovulation, prochaine fenêtre fertile.
 * Retourne null si today est avant J1.
 */
export function getCycleSummary(
  profile: CycleProfile,
  today: DateInput = new Date(),
): CycleSummary | null {
  const r = resolve(profile);
  const t = toDayNumber(today);
  const diff = t - r.start;
  if (diff < 0) return null;

  const cycleIndex = Math.floor(diff / r.L);
  const cycleDay = (diff % r.L) + 1;
  const current = buildPrediction(cycleIndex, r);
  const next = buildPrediction(cycleIndex + 1, r);

  const ovulationPassed = toDayNumber(current.ovulation) < t;
  const fertilePassed = toDayNumber(current.fertileEnd) < t;

  const nextOvulation = ovulationPassed ? next.ovulation : current.ovulation;
  const fertile = fertilePassed ? next : current;

  return {
    today: fromDayNumber(t),
    cycleDay,
    cycleLength: r.L,
    periodLength: r.D,
    status: statusForCycleDay(cycleDay, r),
    phase: phaseForCycleDay(cycleDay, r),
    nextPeriodStart: current.nextPeriodStart,
    daysUntilNextPeriod: toDayNumber(current.nextPeriodStart) - t,
    nextOvulation,
    daysUntilNextOvulation: toDayNumber(nextOvulation) - t,
    nextFertileStart: fertile.fertileStart,
    nextFertileEnd: fertile.fertileEnd,
    isInFertileWindow: cycleDay >= r.fertileStartDay && cycleDay <= r.fertileEndDay,
  };
}

/**
 * Durée moyenne du cycle à partir de l'historique des débuts de règles
 * (bouton « Mes règles ont commencé »).
 * Utilise les 6 derniers cycles valides ; retourne null s'il y en a moins de 3.
 */
export function averageCycleLength(periodStarts: DateInput[]): number | null {
  const days = Array.from(new Set(periodStarts.map(toDayNumber))).sort((a, b) => a - b);
  const lengths: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const len = days[i] - days[i - 1];
    // On ignore les écarts aberrants (oubli de saisie, double saisie…)
    if (len >= MIN_CYCLE_LENGTH && len <= MAX_CYCLE_LENGTH) lengths.push(len);
  }
  const recent = lengths.slice(-6);
  if (recent.length < 3) return null;
  return Math.round(recent.reduce((sum, n) => sum + n, 0) / recent.length);
}

/** Libellés français prêts à afficher (légende, infobulles). */
export const STATUS_LABELS: Record<DayStatus, string> = {
  period: 'Règles',
  ovulation: 'Ovulation',
  fertile: 'Période fertile',
  low: 'Faible fertilité',
  none: '',
};

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Phase menstruelle',
  follicular: 'Phase folliculaire',
  ovulation: 'Ovulation',
  luteal: 'Phase lutéale',
};
