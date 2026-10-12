/**
 * Les quatre phases du cycle, telles qu'elles se disent et se dessinent.
 *
 * Le vocabulaire est celui d'une conversation, pas celui d'un manuel : « tu
 * reprends de l'élan » plutôt que « phase folliculaire ». Le nom savant est
 * gardé à côté, pour celle qui veut savoir et pour les recherches.
 */
import type { Phase } from './session';

export interface DescriptionPhase {
  nom: string;
  savant: string;
  couleur: 'rose' | 'violet' | 'encre';
  explique: string;
  conseil: string;
}

export const PHASES: Record<Phase, DescriptionPhase> = {
  regles: {
    nom: 'Tes règles',
    savant: 'menstruations',
    couleur: 'rose',
    explique: "Ton utérus évacue sa paroi. Les douleurs viennent des contractions, c'est normal qu'il y en ait un peu.",
    conseil: "Chaleur sur le bas du ventre, boissons chaudes, et du repos si tu peux. Change ta protection toutes les 4 à 6 heures.",
  },
  elan: {
    nom: "Tu reprends de l'élan",
    savant: 'phase folliculaire',
    couleur: 'rose',
    explique: "Tes règles sont finies, ton corps remonte en énergie. C'est souvent la période où tu te sens le mieux.",
    conseil: "Profites-en pour ce qui demande de la force : les examens, le sport, les grosses journées.",
  },
  fertile: {
    nom: 'Période fertile',
    savant: 'ovulation',
    couleur: 'violet',
    explique: "C'est la semaine où une grossesse est possible. Tu peux avoir des pertes plus claires et plus élastiques.",
    conseil: "Si tu ne veux pas d'enfant maintenant, c'est la période où il faut être la plus attentive à ta contraception.",
  },
  lune: {
    nom: 'Ton corps ralentit',
    savant: 'phase lutéale',
    couleur: 'encre',
    explique: "Les hormones redescendent. Seins sensibles, humeur qui bouge, envie de sucré : ça vient de là, et ça passe.",
    conseil: "Dors un peu plus si tu peux. Tes règles arrivent bientôt, prépare tes protections.",
  },
};

/** Le texte d'alerte quand une grossesse ou un souci est possible : on ne
 * diagnostique pas, on dit quand aller voir quelqu'un. */
export const QUAND_CONSULTER = [
  'Des règles qui durent plus de 8 jours, ou un saignement qui trempe une protection par heure.',
  "Des douleurs qui t'empêchent d'aller en cours ou au travail, ou qui augmentent chaque mois.",
  'Pas de règles depuis plus de 3 mois, sans grossesse.',
  'Des pertes qui sentent fort, qui démangent, ou de la fièvre pendant tes règles.',
];

export const SIGNES = [
  { id: 'ventre', libelle: 'Ventre lourd' },
  { id: 'dos', libelle: 'Mal de dos' },
  { id: 'fatigue', libelle: 'Fatigue' },
  { id: 'tete', libelle: 'Maux de tête' },
  { id: 'nausees', libelle: 'Nausées' },
  { id: 'humeur', libelle: 'Humeur basse' },
  { id: 'boutons', libelle: 'Boutons' },
  { id: 'sucre', libelle: 'Envie de sucré' },
  { id: 'seins', libelle: 'Seins sensibles' },
  { id: 'sommeil', libelle: 'Mal dormi' },
];

export const FLUX = [
  { id: 'rien', libelle: 'Rien' },
  { id: 'leger', libelle: 'Léger' },
  { id: 'moyen', libelle: 'Moyen' },
  { id: 'abondant', libelle: 'Abondant' },
];

export const DOULEURS = [
  { id: 0, note: '0', libelle: 'Aucune' },
  { id: 1, note: '1', libelle: 'Légère' },
  { id: 2, note: '2', libelle: 'Forte' },
  { id: 3, note: '3', libelle: 'Très forte' },
];

/**
 * L'anneau du cycle : les segments à dessiner, en longueurs de trait.
 * Calculé côté serveur pour qu'aucun script ne soit nécessaire à l'affichage.
 */
export interface Anneau {
  circonference: number;
  regles: string;
  fertile: string;
  parcouru: number;
  marqueur: { x: number; y: number };
}

export function anneauDuCycle(jour: number, dureeRegles: number, cycle: number, rayon = 88): Anneau {
  const circonference = 2 * Math.PI * rayon;
  const part = (jours: number) => (jours / cycle) * circonference;
  const ovulation = Math.max(1, cycle - 14);
  const fertileDebut = Math.max(1, ovulation - 5);
  const fertileJours = Math.min(cycle, ovulation + 1) - fertileDebut + 1;

  // Le marqueur « aujourd'hui » se place au milieu du jour en cours.
  const angle = ((jour - 0.5) / cycle) * 2 * Math.PI - Math.PI / 2;
  return {
    circonference,
    regles: `${part(dureeRegles).toFixed(1)} ${circonference.toFixed(1)}`,
    fertile: `0 ${part(fertileDebut - 1).toFixed(1)} ${part(fertileJours).toFixed(1)} ${circonference.toFixed(1)}`,
    parcouru: part(Math.min(jour, cycle)),
    marqueur: {
      x: Number((100 + rayon * Math.cos(angle)).toFixed(2)),
      y: Number((100 + rayon * Math.sin(angle)).toFixed(2)),
    },
  };
}
