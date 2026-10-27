/**
 * Les photos qui illustrent le médecin.
 *
 * Elles vivaient dans `src/pages/index.astro`, où le panneau du médecin les
 * utilise depuis le 13 octobre 2026. Elles servent maintenant aussi à l'écran
 * du fil (`/discussions/medecin`), d'où ce module : le même choix de fichiers
 * aux deux endroits, et une seule place à corriger.
 *
 * POURQUOI DE VRAIES PERSONNES ET PAS LA MASCOTTE. Arthur, le 26 octobre 2026 :
 * « les gens vont penser que c'est l'IA Dambé qui est médecin [...] c'est pour
 * ça que je tenais à mettre des vraies personnes, des vrais humains médecins ».
 * Il a raison, et ce n'est pas une question de goût : Dambé est une machine, le
 * médecin est un humain, et confondre les deux sur un écran de santé est la
 * confusion la plus coûteuse que cette application puisse produire. Une femme
 * qui croit parler à un médecin alors qu'elle parle à une IA prendrait une
 * réponse de machine pour un avis médical.
 *
 * CE QUE CES PHOTOS NE DISENT PAS. Le texte parle du médecin au SINGULIER
 * (« Le médecin »). Trois visages différents ne sont donc pas trois médecins
 * de l'équipe : ce sont des illustrations, et personne n'y est présenté comme
 * celui ou celle qui répondra. La mention visible « Illustration » a été
 * retirée le 13 octobre 2026, à la demande d'Arthur (deux fois) ; elle reste
 * dans le texte alternatif de chaque image, donc lue par un lecteur d'écran.
 *
 * RÉSERVE LEVÉE LE 27 OCTOBRE 2026. La provenance de l'une des anciennes photos
 * n'était pas vérifiée (notée par Juriste) : une photo d'une personne réelle
 * sans autorisation est un risque de droit à l'image, et il ne se règle pas
 * dans le code. Motion a livré trois portraits fabriqués, photoréalistes, qui
 * ne représentent personne. Ils passent donc EN PREMIER dans chaque pose. Les
 * anciennes restent en second, comme filet si un fichier venait à manquer.
 *
 * POURQUOI PHOTORÉALISTES ET PAS EN DESSIN. Motion a écarté le style des
 * avatars : un portrait façon film d'animation aurait recréé exactement la
 * confusion avec la mascotte qu'on cherche à éviter.
 *
 * On regarde si le fichier existe vraiment, au lieu d'écrire son adresse en
 * dur : une image manquante laisserait une icône cassée en plein milieu de
 * l'écran, et c'est l'application qui aurait l'air abîmée. Chaque pose est une
 * liste de candidates, la première qui existe gagne.
 */
import { existsSync as fsExiste } from 'node:fs';

export interface PhotoMedecin {
  src: string;
  /** Les deux tailles, pour qu'un grand écran ne charge pas une image floue. */
  jeu: string | undefined;
}

const POSES = [
  // Motion a placé la n° 1 en tête : c'est elle qui a le plus grand visage,
  // donc la seule qui reste lisible dans le rond de 38 px de l'en-tête.
  ['medecin-fabrique-1-detoure', 'medecin-fabrique-1', 'medecin-detoure'],
  ['medecin-fabrique-2-detoure', 'medecin-fabrique-2', 'medecin-homme-detoure'],
  ['medecin-fabrique-3-detoure', 'medecin-fabrique-3', 'medecin-autre-detoure', 'medecin-pose3-detoure'],
];

const dossierPublic = new URL('../../public', import.meta.url);
const existe = (chemin: string) => fsExiste(new URL(`.${chemin}`, `${dossierPublic}/`));

export const PHOTOS_MEDECIN: PhotoMedecin[] = POSES.map((candidates) => {
  for (const nom of candidates) {
    const petite = `/accueil/${nom}-600.webp`;
    const grande = `/accueil/${nom}-1200.webp`;
    if (existe(petite)) {
      return { src: petite, jeu: existe(grande) ? `${petite} 600w, ${grande} 1200w` : undefined };
    }
  }
  return null;
}).filter((p): p is PhotoMedecin => p !== null);

/** La photo numéro `i`, ou la dernière livrée si celle-là manque. */
export function photoMedecin(i: number): PhotoMedecin | null {
  return PHOTOS_MEDECIN[i] ?? PHOTOS_MEDECIN[PHOTOS_MEDECIN.length - 1] ?? null;
}
