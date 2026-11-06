/**
 * LE CALCULATEUR DU CYCLE.
 *
 * Toute la logique du cycle vit ici, et nulle part ailleurs : c'est ce que
 * demandait Arthur le 12 octobre 2026 (« centralise toute cette logique dans
 * un seul module bien testé »). Les pages ne font que l'afficher.
 *
 * Les fonctions sont pures : elles prennent des dates en texte (AAAA-MM-JJ),
 * rendent des dates en texte, et ne lisent ni l'heure du système ni la base.
 * C'est ce qui les rend testables, et ce qui évite le piège du fuseau horaire :
 * une date de règles n'a pas d'heure.
 *
 * LES FORMULES NE SONT PLUS ICI. Elles sont dans `cycleEngine.ts`, le moteur
 * fourni par Arthur le 13 octobre 2026 (son prompt « calcul du cycle ») : une
 * seule source de vérité, que le cercle, le calendrier et ce module appellent.
 * Ce fichier garde ce que le moteur ne sait pas : plusieurs débuts de règles
 * connus (l'historique), les jours que la femme a elle-même déclarés, les
 * alertes de santé, et la forme des données que les pages attendent.
 *
 *   règles            : jours 1 à D
 *   ovulation         : jour L − 14
 *   fenêtre fertile   : jours L − 19 à L − 13
 *   prochaines règles : premier jour des règles + L
 *
 * CHANGEMENT DE FORMULE (13 octobre 2026). Avant, l'ovulation était comptée
 * à 14 jours avant le PREMIER JOUR des règles suivantes, soit le jour L − 13
 * (jour 15 d'un cycle de 28). Le prompt d'Arthur la place au jour L − 14
 * (jour 14 d'un cycle de 28) : toutes les dates d'ovulation et de fenêtre
 * fertile ont donc reculé d'un jour. C'est sa décision, écrite dans ses cinq
 * cas de test.
 *
 * Avant le premier début de règles connu, il n'y a PAS de prédiction : le jour
 * est neutre. L'ancienne version projetait vers l'arrière, et montrait des
 * fenêtres fertiles sur des mois où rien n'avait été noté.
 */

import {
  MIN_CYCLE_LENGTH,
  MAX_CYCLE_LENGTH,
  MIN_PERIOD_LENGTH,
  MAX_PERIOD_LENGTH,
  averageCycleLength,
  fertileCycleDays,
  getCycleSummary,
  getDayStatus,
  ovulationCycleDay,
  type CycleProfile,
} from './cycleEngine.ts';

const JOUR_MS = 86_400_000;

export type TypeJour = 'regles' | 'fertile' | 'ovulation' | 'faible';
export type Risque = 'faible' | 'eleve' | 'tres-eleve';

export interface ReglagesCycle {
  /** Les premiers jours de règles connus, dans n'importe quel ordre. */
  debuts: string[];
  dureeRegles: number;
  dureeCycle: number;
}

export interface InfoJour {
  type: TypeJour;
  /** Règles projetées par le calcul, ni vécues ni déclarées. */
  prevu: boolean;
  /** 1 = premier jour des règles. */
  jourDuCycle: number;
  risque: Risque;
}

/* --- Les dates, sans heure et sans fuseau -------------------------------- */

export function enDate(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, (m ?? 1) - 1, j ?? 1));
}

export function enIso(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const j = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${j}`;
}

export function plusDeJours(iso: string, n: number): string {
  return enIso(new Date(enDate(iso).getTime() + n * JOUR_MS));
}

/**
 * Le plus long épisode de règles qu'on accepte de dérouler jour par jour.
 *
 * Des règles de plus de deux mois n'existent pas : au-delà, ce n'est pas un
 * cycle, c'est une donnée fausse. 60 est donc large à dessein, pour ne jamais
 * amputer un cas réel tout en bornant le cas absurde.
 */
export const MAX_JOURS_EPISODE = 60;

/**
 * Les jours couverts par un épisode de règles, du début à la fin incluse.
 *
 * POURQUOI CETTE FONCTION EXISTE PLUTÔT QU'UNE BOUCLE DANS LA PAGE.
 *
 * L'accueil déroulait cet intervalle à la main :
 *
 *     for (let d = c.debut; d <= fin; d = plusDeJours(d, 1)) confirmes.add(d);
 *
 * Cette boucle n'a pas de borne. Elle avance d'un jour à chaque tour et
 * s'arrête quand elle dépasse `fin`, une valeur qui vient de la base. Une
 * seule ligne portant une date de fin aberrante (une année à quatre chiffres
 * tapée de travers, une valeur sentinelle comme 9999-12-31) la fait tourner
 * des millions de fois et remplir un ensemble de millions de chaînes. La page
 * ne rend jamais la main, et Vercel la tue au bout de ses 15 secondes :
 * « 504 FUNCTION_INVOCATION_TIMEOUT ».
 *
 * Le défaut ne se voit ni en local, ni déconnecté, ni sur un compte neuf : il
 * faut une session, des cycles enregistrés, ET une ligne abîmée. C'est
 * exactement le genre de chose qui ne casse que chez une personne.
 *
 * La règle qu'on en tire : AUCUNE BOUCLE DE RENDU NE DOIT DÉPENDRE D'UNE
 * DONNÉE NON BORNÉE. Une page se construit en un nombre d'étapes qu'on peut
 * annoncer d'avance.
 *
 * Une fin absente, antérieure au début, illisible ou trop lointaine rend le
 * seul jour de début : on préfère afficher un jour de règles au lieu de
 * plusieurs plutôt que de ne rien afficher du tout.
 */
export function joursDuCycle(debut: string, fin: string | null | undefined): string[] {
  const depart = enDate(debut);
  if (Number.isNaN(depart.getTime())) return [];

  const arrivee = fin ? enDate(fin) : depart;
  if (Number.isNaN(arrivee.getTime())) return [debut.slice(0, 10)];

  const jours = Math.round((arrivee.getTime() - depart.getTime()) / JOUR_MS);
  // Une fin avant le début, ou un épisode plus long que tout épisode réel :
  // la donnée est fausse, on ne déroule rien.
  if (jours < 0 || jours > MAX_JOURS_EPISODE) return [enIso(depart)];

  const sortie: string[] = [];
  for (let i = 0; i <= jours; i += 1) sortie.push(enIso(new Date(depart.getTime() + i * JOUR_MS)));
  return sortie;
}

export function ecartEnJours(a: string, b: string): number {
  return Math.round((enDate(a).getTime() - enDate(b).getTime()) / JOUR_MS);
}

/* --- Les repères du cycle ------------------------------------------------ */

const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

/**
 * Le profil que le moteur attend, à partir de nos réglages.
 *
 * Les durées sont ramenées dans les bornes du moteur (cycle 21 à 45, règles 2
 * à 10) : une ancienne valeur de 20 jours, acceptée avant le 13 octobre, ne
 * doit pas faire planter une page, elle est lue comme 21.
 */
function profilDe(reglages: ReglagesCycle, debut: string): CycleProfile {
  return {
    lastPeriodStart: debut,
    cycleLength: borne(reglages.dureeCycle, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH),
    periodLength: borne(reglages.dureeRegles, MIN_PERIOD_LENGTH, MAX_PERIOD_LENGTH),
  };
}

/** Le dernier début de règles connu qui ne soit pas après la date. */
function debutPrecedent(iso: string, debuts: string[]): string | null {
  let meilleur: string | null = null;
  for (const d of debuts) {
    const jour = d.slice(0, 10);
    if (jour <= iso && (meilleur === null || jour > meilleur)) meilleur = jour;
  }
  return meilleur;
}

/** Le jour d'ovulation, en jours de cycle (1 = premier jour de règles). */
export function jourOvulation(dureeCycle: number): number {
  return Math.max(1, ovulationCycleDay(borne(dureeCycle, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH)));
}

/**
 * La fenêtre fertile, en jours de cycle : cinq jours avant l'ovulation,
 * l'ovulation, et le lendemain.
 */
export function fenetreFertile(dureeCycle: number): { debut: number; fin: number } {
  const L = borne(dureeCycle, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH);
  const f = fertileCycleDays(L);
  return { debut: Math.max(1, f.start), fin: Math.min(L, f.end) };
}

/**
 * Le cycle auquel appartient une date : son premier jour, et le rang du jour.
 *
 * On part du dernier début de règles connu qui précède la date, et le moteur
 * répète le cycle à partir de là. Avant le premier début connu, il n'y a pas
 * de cycle : `jour` vaut 0.
 */
export function cycleDeLaDate(iso: string, reglages: ReglagesCycle): { debut: string; jour: number } {
  const debut = debutPrecedent(iso, reglages.debuts);
  if (!debut) return { debut: iso, jour: 0 };
  const info = getDayStatus(iso, profilDe(reglages, debut));
  const L = profilDe(reglages, debut).cycleLength ?? 28;
  const tours = info.cycleIndex ?? 0;
  return { debut: plusDeJours(debut, tours * L), jour: info.cycleDay ?? 0 };
}

const TYPE_DU_STATUT = {
  period: 'regles',
  ovulation: 'ovulation',
  fertile: 'fertile',
  low: 'faible',
  none: 'faible',
} as const;

/**
 * Ce qu'il faut savoir d'un jour : sa phase, son risque, son rang.
 *
 * `confirmes` contient les jours où elle a elle-même déclaré du sang. Un jour
 * confirmé n'est jamais « prévu » : ce qu'elle a vécu prime sur le calcul.
 */
export function infoDuJour(
  iso: string,
  reglages: ReglagesCycle,
  confirmes: ReadonlySet<string> = new Set(),
  aujourdhui = ''
): InfoJour {
  const debut = debutPrecedent(iso, reglages.debuts);
  let type: TypeJour = 'faible';
  let jour = 0;
  if (debut) {
    const info = getDayStatus(iso, profilDe(reglages, debut));
    type = TYPE_DU_STATUT[info.status];
    jour = info.cycleDay ?? 0;
  }

  const declare = confirmes.has(iso);
  if (declare) type = 'regles';

  const prevu = type === 'regles' && !declare && (aujourdhui === '' || iso > aujourdhui);
  const risque: Risque = type === 'ovulation' ? 'tres-eleve' : type === 'fertile' ? 'eleve' : 'faible';

  return { type, prevu, jourDuCycle: jour, risque };
}

/** Le premier jour des prochaines règles, à partir d'aujourd'hui. */
export function prochainesRegles(reglages: ReglagesCycle, aujourdhui: string): string {
  const debut = debutPrecedent(aujourdhui, reglages.debuts);
  const profil = profilDe(reglages, debut ?? aujourdhui);
  if (!debut) return plusDeJours(aujourdhui, profil.cycleLength ?? 28);
  return getCycleSummary(profil, aujourdhui)?.nextPeriodStart ?? plusDeJours(debut, profil.cycleLength ?? 28);
}

/** Le prochain jour d'ovulation, à partir d'aujourd'hui. */
export function prochaineOvulation(reglages: ReglagesCycle, aujourdhui: string): string {
  const debut = debutPrecedent(aujourdhui, reglages.debuts);
  const profil = profilDe(reglages, debut ?? aujourdhui);
  const L = profil.cycleLength ?? 28;
  if (debut) {
    const resume = getCycleSummary(profil, aujourdhui);
    if (resume) return resume.nextOvulation;
  }
  return plusDeJours(debut ?? aujourdhui, jourOvulation(L) - 1);
}

/**
 * La durée moyenne des derniers cycles, mesurée sur les écarts réels : au
 * moins trois cycles valides, sinon `null`.
 *
 * Elle ne REMPLACE plus la durée du profil : elle est PROPOSÉE (voir la carte
 * de Mon cycle). Avant le 13 octobre 2026 elle prenait le dessus sans rien
 * dire, ce que le prompt d'Arthur ne veut pas.
 */
export function moyenneCycles(debuts: string[]): number | null {
  return averageCycleLength(debuts.map((d) => d.slice(0, 10)));
}

/** Les segments de l'anneau : un par jour du cycle. */
export function segmentsAnneau(dureeRegles: number, dureeCycle: number): { jour: number; type: TypeJour }[] {
  const reglages: ReglagesCycle = { debuts: ['2026-01-01'], dureeRegles, dureeCycle };
  const L = borne(dureeCycle, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH);
  const segments: { jour: number; type: TypeJour }[] = [];
  for (let jour = 1; jour <= L; jour += 1) {
    const iso = plusDeJours('2026-01-01', jour - 1);
    segments.push({ jour, type: infoDuJour(iso, reglages).type });
  }
  return segments;
}

/* --- Les alertes de santé ------------------------------------------------ */

export interface Alerte {
  titre: string;
  texte: string;
}

export interface ObservationsSante {
  /** Durées, en jours, des derniers épisodes de règles déclarés. */
  dureesRegles: number[];
  /** Écarts réels entre deux débuts de règles. */
  ecartsCycles: number[];
  /** Jours de retard sur les règles attendues. Zéro ou négatif si pas de retard. */
  retard: number;
  /** Jours notés « très forte » douleur sur les trois derniers mois. */
  douleursFortes: number;
  /** Jours notés « abondant » sur les trois derniers mois. */
  fluxAbondants: number;
}

/**
 * Ce qui mérite d'aller voir quelqu'un.
 *
 * Le ton compte autant que le contenu : on décrit ce qu'on a vu, on dit quoi
 * faire, et on ne pose aucun diagnostic. Une application de santé qui effraie
 * est une application qu'on désinstalle, et qui cesse donc de protéger.
 */
export function alertesSante(o: ObservationsSante): Alerte[] {
  const alertes: Alerte[] = [];

  if (o.dureesRegles.some((d) => d > 7)) {
    alertes.push({
      titre: 'Tes règles durent longtemps',
      texte:
        "Tu as noté des règles de plus de sept jours. C'est fréquent et souvent sans gravité, mais ça mérite d'en parler à une sage-femme, surtout si tu te sens fatiguée.",
    });
  }

  if (o.ecartsCycles.some((e) => e < 21)) {
    alertes.push({
      titre: 'Tes cycles sont courts',
      texte:
        "Un cycle de moins de 21 jours revient dans ce que tu as noté. Une sage-femme saura dire si c'est ton rythme à toi, ou s'il faut regarder de plus près.",
    });
  }

  if (o.ecartsCycles.some((e) => e > 35)) {
    alertes.push({
      titre: 'Tes cycles sont longs',
      texte:
        "Un cycle de plus de 35 jours revient dans ce que tu as noté. Ça arrive souvent, et ça vaut la peine d'en parler au centre de santé.",
    });
  }

  if (o.retard > 7) {
    alertes.push({
      titre: `Tes règles ont ${o.retard} jours de retard`,
      texte:
        "Un retard arrive pour beaucoup de raisons : stress, fatigue, maladie, changement de poids. Si tu as eu un rapport non protégé, un test de grossesse donne une réponse en quelques minutes.",
    });
  }

  if (o.douleursFortes >= 3) {
    alertes.push({
      titre: 'Des douleurs fortes qui reviennent',
      texte:
        "Tu as noté plusieurs fois des douleurs très fortes. Avoir mal au point de ne pas pouvoir aller en cours ou au travail n'est pas normal, et ça se soigne. Parles-en à une sage-femme.",
    });
  }

  if (o.fluxAbondants >= 5) {
    alertes.push({
      titre: 'Des saignements abondants qui reviennent',
      texte:
        'Des règles très abondantes plusieurs fois de suite fatiguent le corps et font manquer de fer. Une consultation permet de vérifier simplement.',
    });
  }

  return alertes;
}

/**
 * L'avertissement sur la contraception.
 *
 * RETIRÉ DES DEUX ÉCRANS le 13 octobre 2026, à la demande d'Arthur (sur Mon
 * cycle puis sur le calendrier, redemandé deux fois). Il l'avait lui-même
 * exigé « obligatoire » la veille. Cette constante reste, inutilisée, pour
 * qu'on puisse le réafficher sans le réécrire.
 *
 * Texte d'origine de la raison : demande expresse d'Arthur, et c'est
 * une question de santé : un calendrier qui marque des jours comme fertiles
 * sans cette phrase se lit comme une méthode de contraception, ce qu'il n'est
 * pas.
 *
 * Réécrit le 13 octobre 2026. Il disait « les jours verts indiquent un risque
 * plus faible » ; le calendrier n'a plus de jours verts (la période fertile y
 * est en rose clair, les autres dates sont ordinaires). La nouvelle phrase ne
 * dépend plus d'une couleur, et elle dit l'essentiel : les jours qui ne sont
 * pas marqués ne sont PAS sans risque. Les deux morceaux mis en gras par les
 * écrans (« n'est pas une méthode de contraception fiable » et « utilise une
 * contraception adaptée ») n'ont pas bougé.
 */
export const AVERTISSEMENT_CONTRACEPTION =
  "Les jours en rose clair sont ceux où une grossesse est possible, mais les autres jours ne sont pas sans risque : ce calcul n'est pas une méthode de contraception fiable, surtout si ton cycle est irrégulier. Pour éviter une grossesse, utilise une contraception adaptée.";
