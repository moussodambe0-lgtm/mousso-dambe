/**
 * Quelles tuiles de carte notre serveur accepte d'aller chercher.
 *
 * Séparé de la route (src/pages/tuile/[z]/[x]/[y].png.ts) pour une raison
 * précise : c'est le garde-fou qui empêche cette adresse de devenir un proxy
 * ouvert, et un garde-fou qu'on ne peut pas rejouer dans un test est un
 * garde-fou qu'on ne vérifie jamais.
 *
 * SANS CE FILTRE, n'importe qui pourrait faire passer n'importe quelle requête
 * par notre serveur, avec notre réputation et notre facture.
 */

/**
 * UNE TUILE, UNE SEULE ADRESSE (ajouté le 8 novembre 2026, audit de Cyber).
 *
 * Le filtre ci-dessous travaille sur des NOMBRES, parce que c'est ce qu'il faut
 * pour vérifier une grille et une zone. Mais la route reçoit des CHAÎNES, et
 * `Number()` est généreux : « 18 », « 018 », « 18.0 », « 0x12 », « 1.8e1 », « +18 »
 * et « %2018 » (une espace) donnent tous le nombre 18. Autrement dit, la MÊME
 * tuile d'OpenStreetMap se demande par une infinité d'adresses différentes.
 *
 * Pourquoi ça compte, alors que l'image servie est la même. Parce que le réseau
 * de diffusion de Vercel range ses réponses par ADRESSE COMPLÈTE, chaîne de
 * requête comprise. Chaque forme exotique est donc une réserve vide : la
 * fonction est réveillée, et notre serveur va redemander la tuile à
 * OpenStreetMap. Le cache d'un an ne protège plus rien.
 *
 * Ce que ça coûtait pour de vrai : n'importe qui, sans compte, pouvait faire
 * partir autant de requêtes qu'il voulait vers OpenStreetMap, sous notre nom et
 * depuis notre serveur. Leur politique d'usage interdit exactement cela, et
 * leur réponse est le blocage du client fautif. Le fond de carte du suivi
 * s'éteindrait alors pour TOUTES les clientes, et pas pour une heure.
 *
 * La parade tient en une phrase : un segment d'adresse doit être un entier
 * décimal écrit de la seule façon normale. Leaflet n'en écrit jamais d'autre
 * (`{z}/{x}/{y}` reçoit des entiers), donc rien ne change pour une cliente.
 */
export function segmentCanonique(brut: string | undefined | null): boolean {
  if (typeof brut !== 'string' || brut.length === 0 || brut.length > 7) return false;
  // Pas de zéro en tête, pas de signe, pas de virgule, pas d'exposant, pas
  // d'espace, pas de préfixe hexadécimal. « 0 » seul reste permis : c'est une
  // vraie colonne de la grille.
  return /^(0|[1-9][0-9]*)$/.test(brut);
}

/** Les bornes du Burkina Faso, les mêmes que celles de la base. */
export const SUD = 9.0;
export const NORD = 15.5;
export const OUEST = -6.0;
export const EST = 2.5;

/**
 * Le zoom utile, et rien d'autre.
 *
 * Sous 10, on ne montre plus une ville mais un pays, et ça n'aide personne à
 * suivre un colis. Au-dessus de 18, OpenStreetMap n'a plus de données pour
 * Ouagadougou : on servirait des carrés gris en consommant du réseau.
 */
export const ZOOM_MINI = 10;
export const ZOOM_MAXI = 18;

/** La longitude du bord gauche de la tuile x, au zoom z. */
export function longitudeDeX(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

/** La latitude du bord haut de la tuile y, au zoom z (projection Mercator). */
export function latitudeDeY(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Cette tuile a-t-elle le droit d'être servie ?
 *
 * Trois verrous, dans l'ordre du moins cher au plus cher à calculer :
 *   - z, x et y sont des entiers ;
 *   - le zoom est dans la fenêtre utile, et x et y tiennent dans sa grille ;
 *   - la tuile recouvre le Burkina Faso. Une demande sur Paris ou sur Jakarta
 *     ne sert aucune cliente et ne passe pas.
 */
export function tuileAutorisee(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < ZOOM_MINI || z > ZOOM_MAXI) return false;

  const cote = 2 ** z;
  if (x < 0 || x >= cote || y < 0 || y >= cote) return false;

  const ouest = longitudeDeX(x, z);
  const est = longitudeDeX(x + 1, z);
  const nord = latitudeDeY(y, z);
  const sud = latitudeDeY(y + 1, z);

  // Deux rectangles se touchent s'ils ne sont PAS entièrement l'un à côté de
  // l'autre. Écrit ainsi, le cas d'une tuile à cheval sur la frontière est
  // couvert sans énumérer les coins.
  return !(est < OUEST || ouest > EST || sud > NORD || nord < SUD);
}

/** La tuile qui contient ce point, au zoom demandé. Sert aux vérifications. */
export function tuileDuPoint(lat: number, lng: number, z: number): { x: number; y: number } {
  const cote = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * cote);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * cote);
  return { x, y };
}
