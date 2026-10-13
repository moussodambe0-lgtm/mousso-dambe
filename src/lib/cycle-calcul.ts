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
 * Les formules viennent du code de référence d'Arthur :
 *   prochaines règles = début des dernières règles + durée du cycle
 *   ovulation         = début des prochaines règles moins 14 jours
 *   fenêtre fertile   = ovulation moins 5 jours, jusqu'à ovulation plus 1
 *
 * Attention à l'ovulation : elle se compte à partir des règles QUI VIENNENT,
 * pas de celles qui sont passées. Pour un cycle de 28 jours, les prochaines
 * règles tombent au jour 29, donc l'ovulation au jour 15 et non au jour 14.
 * La première version de cette application se trompait d'un jour, ce qui
 * décalait toute la fenêtre fertile. Trouvé grâce au code de référence.
 */

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

export function ecartEnJours(a: string, b: string): number {
  return Math.round((enDate(a).getTime() - enDate(b).getTime()) / JOUR_MS);
}

/* --- Les repères du cycle ------------------------------------------------ */

/** Le jour d'ovulation, en jours de cycle (1 = premier jour de règles). */
export function jourOvulation(dureeCycle: number): number {
  return Math.max(1, dureeCycle + 1 - 14);
}

/**
 * La fenêtre fertile, en jours de cycle.
 *
 * Cinq jours avant l'ovulation, l'ovulation, et le lendemain : les
 * spermatozoïdes vivent jusqu'à cinq jours, l'ovule environ une journée.
 */
export function fenetreFertile(dureeCycle: number): { debut: number; fin: number } {
  const ovu = jourOvulation(dureeCycle);
  return { debut: Math.max(1, ovu - 5), fin: Math.min(dureeCycle, ovu + 1) };
}

/**
 * Le cycle auquel appartient une date : son premier jour, et le rang du jour.
 *
 * On part des règles réellement déclarées quand il y en a une qui précède la
 * date. Sinon on projette, en avant comme en arrière, par la durée du cycle.
 * C'est ce qui permet au calendrier de montrer un mois passé sans mentir sur
 * ce qui a vraiment été vécu.
 */
export function cycleDeLaDate(iso: string, reglages: ReglagesCycle): { debut: string; jour: number } {
  const L = Math.max(1, reglages.dureeCycle);
  const tries = [...reglages.debuts].sort().reverse();
  const precedent = tries.find((d) => d <= iso);

  if (precedent) {
    const ecart = ecartEnJours(iso, precedent);
    const tours = Math.floor(ecart / L);
    return { debut: plusDeJours(precedent, tours * L), jour: (ecart % L) + 1 };
  }

  const plusAncien = tries[tries.length - 1];
  if (!plusAncien) return { debut: iso, jour: 1 };
  const ecart = ecartEnJours(iso, plusAncien);
  const tours = Math.floor(ecart / L);
  return { debut: plusDeJours(plusAncien, tours * L), jour: (((ecart % L) + L) % L) + 1 };
}

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
  const L = Math.max(1, reglages.dureeCycle);
  const P = Math.max(1, reglages.dureeRegles);
  const { jour } = cycleDeLaDate(iso, reglages);
  const ovu = jourOvulation(L);
  const fertile = fenetreFertile(L);

  let type: TypeJour = 'faible';
  if (jour <= P) type = 'regles';
  else if (jour === ovu) type = 'ovulation';
  else if (jour >= fertile.debut && jour <= fertile.fin) type = 'fertile';

  const declare = confirmes.has(iso);
  if (declare) type = 'regles';

  const prevu = type === 'regles' && !declare && (aujourdhui === '' || iso > aujourdhui);
  const risque: Risque = type === 'ovulation' ? 'tres-eleve' : type === 'fertile' ? 'eleve' : 'faible';

  return { type, prevu, jourDuCycle: jour, risque };
}

/** Le premier jour des prochaines règles, à partir d'aujourd'hui. */
export function prochainesRegles(reglages: ReglagesCycle, aujourdhui: string): string {
  const { debut } = cycleDeLaDate(aujourdhui, reglages);
  return plusDeJours(debut, reglages.dureeCycle);
}

/** Le prochain jour d'ovulation, à partir d'aujourd'hui. */
export function prochaineOvulation(reglages: ReglagesCycle, aujourdhui: string): string {
  const { debut } = cycleDeLaDate(aujourdhui, reglages);
  const rang = jourOvulation(reglages.dureeCycle) - 1;
  const ovu = plusDeJours(debut, rang);
  if (ovu >= aujourdhui) return ovu;
  return plusDeJours(plusDeJours(debut, reglages.dureeCycle), rang);
}

/**
 * La durée moyenne des derniers cycles, mesurée sur les écarts réels.
 *
 * Les écarts impossibles sont écartés : une déclaration oubliée puis rattrapée
 * produit un écart de soixante jours qui fausserait tout. On garde ce qui est
 * physiologiquement plausible, de 20 à 45 jours.
 */
export function moyenneCycles(debuts: string[], combien = 6): number | null {
  const tries = [...debuts].sort().reverse().slice(0, combien + 1);
  const ecarts: number[] = [];
  for (let i = 0; i < tries.length - 1; i += 1) {
    const e = ecartEnJours(tries[i], tries[i + 1]);
    if (e >= 20 && e <= 45) ecarts.push(e);
  }
  if (ecarts.length === 0) return null;
  return Math.round(ecarts.reduce((s, e) => s + e, 0) / ecarts.length);
}

/** Les segments de l'anneau : un par jour du cycle. */
export function segmentsAnneau(dureeRegles: number, dureeCycle: number): { jour: number; type: TypeJour }[] {
  const reglages: ReglagesCycle = { debuts: ['2026-01-01'], dureeRegles, dureeCycle };
  const segments: { jour: number; type: TypeJour }[] = [];
  for (let jour = 1; jour <= dureeCycle; jour += 1) {
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
