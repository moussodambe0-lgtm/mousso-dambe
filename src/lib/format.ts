/**
 * Les mots et les nombres tels qu'ils s'affichent.
 *
 * Tout est en français, et on vouvoie personne : l'application tutoie ses
 * utilisatrices, comme une grande sœur. Pas de tirets longs.
 */

/** 9000 devient « 9 000 ». Espace insécable : un prix ne se coupe jamais en
 * deux lignes. */
export function prix(cfa: number): string {
  return String(Math.round(cfa)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function prixComplet(cfa: number): string {
  return `${prix(cfa)} FCFA`;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Une date venue de la base (AAAA-MM-JJ) lue sans décalage d'heure : une
 * date de règles n'a pas d'heure, et un fuseau la ferait reculer d'un jour. */
export function dateDe(iso: string): Date {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, (m ?? 1) - 1, j ?? 1);
}

export function enIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export function aujourdhui(): string {
  return enIso(new Date());
}

/** « lundi 12 octobre » */
export function dateLongue(iso: string): string {
  const d = dateDe(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** « 12 octobre » */
export function dateCourte(iso: string): string {
  const d = dateDe(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function moisEtAnnee(d: Date): string {
  return `${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

export function nomDuMois(index: number): string {
  return MOIS[index] ?? '';
}

/** « dans 22 jours », « demain », « aujourd'hui », « il y a 3 jours ». Une
 * phrase juste vaut mieux qu'un nombre brut à interpréter. */
export function enJours(nb: number): string {
  if (nb === 0) return "aujourd'hui";
  if (nb === 1) return 'demain';
  if (nb === -1) return 'hier';
  if (nb > 1) return `dans ${nb} jours`;
  return `il y a ${Math.abs(nb)} jours`;
}

export function pluriel(nb: number, singulier: string, plurielMot?: string): string {
  if (nb <= 1) return `${nb} ${singulier}`;
  return `${nb} ${plurielMot ?? singulier + 's'}`;
}

/** Les messages d'erreur de la base, traduits pour une personne réelle. Un
 * code technique à l'écran est un abandon de vente. */
const ERREURS: Record<string, string> = {
  connexion_requise: 'Il faut te connecter pour faire ça.',
  acces_refuse: "Cette action n'a pas pu être vérifiée. Recharge la page et réessaie.",
  cycle_invalide: 'La durée du cycle doit être entre 21 et 45 jours.',
  duree_invalide: 'La durée des règles doit être entre 2 et 10 jours.',
  date_invalide: "Cette date n'est pas possible.",
  flux_invalide: "Ce choix n'existe pas.",
  panier_vide: 'Ton panier est vide.',
  produit_inconnu: "Un des produits n'existe plus. Retire-le de ton panier.",
  adresse_incomplete: 'Donne ton nom et ton quartier pour la livraison.',
  prenom_requis: 'Donne ton prénom.',
  telephone_invalide: 'Donne un numéro burkinabè à 8 chiffres, qui commence par 5, 6 ou 7.',
  trop_de_commandes: 'Tu as passé plusieurs commandes de suite. Attends un peu, ou appelle-nous.',
  deja_preparee: "Cette commande est déjà partie. Tu pourras refuser le colis à la livraison.",
  commande_inconnue: 'Cette commande est introuvable.',
  assistante_eteinte: "Dambé est en pause pour le moment. Reviens un peu plus tard.",
  question_vide: 'Écris ta question.',
  trop_vite: 'Tu vas un peu vite. Attends quelques secondes.',
  quota_jour: "Tu as posé beaucoup de questions aujourd'hui. Reviens demain.",
  message_inconnu: "Cette question n'a pas été retrouvée.",
  quota: 'Tu as écrit beaucoup de messages cette heure-ci. Reviens dans un moment.',
  message_vide: 'Écris ton message.',
  // Les vocaux au médecin.
  vocal_trop_long: "Ce vocal est trop long pour partir. Redis-le plus court, en moins d'une minute et demie.",
  duree_refusee: 'Un vocal dure entre 1 seconde et 1 minute 30. Recommence.',
  format_refuse:
    "Ton téléphone a enregistré dans un format que l'application ne sait pas lire. Écris ton message à la place.",
  vocal_abime: "L'enregistrement est arrivé abîmé, souvent à cause de la connexion. Recommence.",
  vocal_vide: "On n'a rien entendu dans cet enregistrement. Rapproche-toi du téléphone et recommence.",
  vocal_inconnu: "Ce vocal n'est plus disponible.",
  // Confier un colis à un livreur, et le lien qu'il reçoit.
  livreur_nom_manquant: 'Écris le nom du livreur avant de lui donner le colis.',
  livreur_telephone_invalide:
    'Le numéro du livreur doit être un numéro burkinabè à 8 chiffres, qui commence par 5, 6 ou 7.',
  lien_invalide: "Ce lien n'est pas valable.",
  lien_expire: 'Ce lien a expiré. Demande-en un nouveau à la boutique.',
  course_terminee: 'Cette course est terminée.',
  position_hors_zone: "Cette position n'est pas au Burkina Faso.",
  // Les avis, après la livraison.
  commande_non_livree: 'Tu pourras donner ton avis quand tu auras reçu ta commande.',
  produit_hors_commande: "Ce produit n'était pas dans cette commande.",
  note_invalide: 'Donne une note de 1 à 5 étoiles.',
  avis_inconnu: 'Cet avis est introuvable.',
  trop_de_photos: 'Tu peux joindre trois photos au maximum.',
  image_trop_lourde: 'Cette photo est trop lourde. Prends-en une plus petite.',
  image_illisible: "Cette photo n'a pas pu être lue. Essaie avec une autre.",
  type_refuse: 'Joins une photo (JPEG, PNG ou WebP).',
};

export function messageErreur(code: string | null | undefined): string {
  if (!code) return "Quelque chose n'a pas marché. Réessaie.";
  if (code.startsWith('stock_insuffisant')) {
    const nom = code.split(':')[1];
    return nom ? `Il n'y a plus assez de « ${nom} » en stock.` : "Il n'y a plus assez de stock.";
  }
  if (code.startsWith('taille_invalide')) {
    return 'Choisis une taille avant de commander.';
  }
  return ERREURS[code] ?? "Quelque chose n'a pas marché. Réessaie.";
}

/**
 * L'heure d'un message dans une liste de discussions.
 *
 * Aujourd'hui : l'heure. Hier : « Hier ». Cette semaine : le jour. Au-delà :
 * la date courte. C'est ce que fait toute messagerie, et c'est la seule forme
 * qui tient dans le coin d'une ligne sans la couper.
 */
export function quandCourt(quand: string | Date | null | undefined): string {
  if (!quand) return '';
  const d = quand instanceof Date ? quand : new Date(quand);
  if (Number.isNaN(d.getTime())) return '';

  const maintenant = new Date();
  const jour = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (jour(d) === jour(maintenant)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (jour(d) === jour(hier)) return 'Hier';

  const ecart = (maintenant.getTime() - d.getTime()) / 86400000;
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  if (ecart < 7) return JOURS[d.getDay()];

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${d.getDate()} ${MOIS[d.getMonth()]}`;
}

/** L'heure seule, pour l'horodatage sous une bulle de message. */
export function heureCourte(quand: string | Date | null | undefined): string {
  if (!quand) return '';
  const d = quand instanceof Date ? quand : new Date(quand);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
