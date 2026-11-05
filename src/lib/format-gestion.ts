/**
 * Les nombres, les dates et les numeros tels que la GESTION les affiche.
 *
 * Copie de `src/lib/format.ts` de Jia, le 5 novembre 2026, pour que les
 * ecrans de l'espace vendeur et de l'administration copies de Jia le soient
 * vraiment, sans retoucher un seul appel.
 *
 * POURQUOI UN SECOND FICHIER ALORS QUE `format.ts` EXISTE DEJA. Les deux
 * projets ont une fonction `prix()` et elles ne rendent pas la meme chose :
 * celle de Mousso Dambe rend `9 000`, celle de Jia rend `9 000 FCFA`. Les
 * pages copiees ecrivent `{prix(x)}` en comptant sur la devise ; les pages
 * des clientes ecrivent `{prix(x)} FCFA` en comptant sur son absence. Fondre
 * les deux aurait fait apparaitre ou disparaitre la devise sur des dizaines
 * d'ecrans. Chaque monde garde donc la sienne, et rien ne bouge chez les
 * clientes.
 */
/**
 * Formatage partagé. Pur, sans dépendance : utilisable côté serveur comme client.
 */

/** Espace insécable, pour qu'un prix ne se coupe jamais en fin de ligne. */
const NBSP = ' ';

/**
 * Prix en FCFA. Les montants sont TOUJOURS des entiers en base : le franc CFA
 * n'a pas de sous-unité et un flottant finit par produire un total faux.
 */
export function prix(montantCfa: number): string {
  return `${entier(montantCfa)}${NBSP}FCFA`;
}

/** Nombre avec séparateur de milliers, sans la devise. */
export function entier(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/ |\s/g, NBSP);
}

/** Pourcentage de remise, arrondi. Retourne null si pas de remise réelle. */
export function remise(prixCfa: number, prixBarreCfa: number | null): number | null {
  if (!prixBarreCfa || prixBarreCfa <= prixCfa) return null;
  return Math.round((1 - prixCfa / prixBarreCfa) * 100);
}

/** Étoiles pleines et vides, pour affichage texte. */
export function etoiles(note: number): string {
  const pleines = Math.round(note);
  return '★'.repeat(pleines) + '☆'.repeat(Math.max(0, 5 - pleines));
}

/** « Aujourd'hui », « Hier », sinon « 14 sept. ». */
export function dateCourte(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  const jour = 86400000;
  const meme = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (meme(d, auj)) return "Aujourd'hui";
  if (meme(d, new Date(auj.getTime() - jour))) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Dans une phrase : « aujourd'hui », « hier », sinon « le 14 sept. ». */
export function leJour(iso: string): string {
  const court = dateCourte(iso);
  if (court === "Aujourd'hui") return "aujourd'hui";
  if (court === 'Hier') return 'hier';
  return `le ${court}`;
}

/** Heure au format 15h42, l'usage local. */
export function heure(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/** « il y a 3 h », « il y a 25 min ». */
export function depuis(iso: string): string {
  const secondes = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secondes < 60) return "à l'instant";
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.floor(heures / 24);
  return `il y a ${jours} j`;
}

/**
 * Lien WhatsApp pré-rempli. WhatsApp reste le canal de repli de toute la
 * plateforme : un acheteur bloqué écrit sur WhatsApp, pas un courriel.
 */
export function lienWhatsApp(numero: string, message: string): string {
  const propre = numero.replace(/[^0-9]/g, '');
  return `https://wa.me/${propre}?text=${encodeURIComponent(message)}`;
}

/** Affichage lisible d'un numéro burkinabè : +226 70 12 34 56 */
export function telephone(numero: string): string {
  const chiffres = numero.replace(/[^0-9]/g, '');
  const local = chiffres.startsWith('226') ? chiffres.slice(3) : chiffres;
  const paires = local.match(/.{1,2}/g) ?? [];
  return `+226 ${paires.join(' ')}`;
}

/**
 * Le numero tel qu'on le SAISIT : les 8 chiffres locaux, groupes par deux.
 *
 * Distinct de telephone(), qui sert a AFFICHER et prefixe « +226 ». Un champ de
 * saisie porte deja « +226 » a cote de lui : y remettre l'indicatif affichait
 * « +226 » deux fois, depassait maxlength, et surtout ne respectait pas le
 * pattern du champ. Resultat, la commande refusait de partir sans rien dire,
 * parce qu'un champ invalide bloque l'envoi sans message visible sur telephone
 * (bug trouve le 23 septembre 2026 : Arthur tapait « Confirmer » et rien ne
 * se passait).
 *
 * Toute valeur prete-a-remplir d'un champ telephone passe par ici.
 */
export function telephoneLocal(numero: string | null | undefined): string {
  if (!numero) return '';
  const chiffres = numero.replace(/[^0-9]/g, '');
  const local = chiffres.startsWith('226') ? chiffres.slice(3) : chiffres;
  if (!local) return '';
  return (local.match(/.{1,2}/g) ?? []).join(' ');
}

/**
 * Numéro normalisé en +226XXXXXXXX, miroir de public.normaliser_telephone.
 * Retourne null si le numéro est trop court pour être réel.
 */
export function normaliserTelephone(saisie: string): string | null {
  let chiffres = saisie.replace(/[^0-9]/g, '');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.length === 8) chiffres = `226${chiffres}`;
  return chiffres.length >= 8 ? `+${chiffres}` : null;
}

/** Slug URL sûr, sans accent. */
export function slugifier(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
