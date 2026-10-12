/**
 * LE GÉNÉRATEUR D'AVATARS.
 *
 * Porté du code de référence d'Arthur (12 octobre 2026), à l'identique :
 * mêmes teints, mêmes coiffures, mêmes couleurs, mêmes formes.
 *
 * Le principe : une graine de texte donne toujours le même avatar, partout
 * dans l'application. Pas d'image à téléverser, pas de photo à héberger, rien
 * qui parte sur le réseau. Une fille qui n'a pas de photo d'elle, ou qui ne
 * veut pas en mettre sur une application de règles, a quand même un visage à
 * elle.
 *
 * Tout est en SVG, dessiné sur le serveur : zéro octet de JavaScript envoyé
 * au téléphone pour l'afficher.
 *
 * Les identifiants internes (découpe, motif) sont dérivés de la graine : deux
 * avatars identiques sur une même page portent donc le même identifiant, et
 * c'est sans conséquence puisque leurs définitions sont identiques.
 */

const TEINTS = ['#5C3317', '#7A4520', '#8D5524', '#A0662F', '#B8763E'];
const CHEVEUX = ['#170E0A', '#24150D', '#3A2214'];
const FONDS = ['#FFD3DE', '#E2D7FF', '#FFE0BD', '#CBEFDD', '#FFF0B3', '#CFE6FF'];
const HAUTS = ['#F0668B', '#7C5CE0', '#F59E2A', '#25B086', '#E5484D', '#2D7FF9'];
const WAX: [string, string][] = [
  ['#E5484D', '#F5B82E'],
  ['#7C5CE0', '#FFB800'],
  ['#1F9D72', '#F06C8F'],
  ['#F59E2A', '#2D7FF9'],
];
const COIFFURES = ['afro', 'tresses', 'foulard', 'chignon', 'court', 'nattes'] as const;

/** Empreinte FNV-1a : courte, rapide, et surtout stable d'une version à
 * l'autre. Ce n'est pas une empreinte de sécurité, et elle n'en a pas besoin. */
function empreinte(texte: string): number {
  let h = 2166136261;
  for (const c of texte) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tirage pseudo-aléatoire reproductible, dérivé de la graine. */
function tirage(graine: string): () => number {
  let a = empreinte(graine);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une graine lisible, tirée de ce qu'on connaît d'elle. */
export function graineDe(prenom: string, identifiant: string): string {
  return `${prenom.toLowerCase().trim()}-${identifiant.slice(0, 8)}`;
}

/**
 * Dessine l'avatar. Rend un fragment SVG complet, prêt à coller dans la page.
 *
 * `titre` devient le nom accessible : « Avatar de Awa » plutôt qu'« Avatar »,
 * pour qu'un lecteur d'écran distingue le sien de ceux de la communauté.
 */
export function avatar(graine: string, titre = 'Avatar'): string {
  const r = tirage(graine);
  const prendre = <T>(liste: readonly T[]): T => liste[Math.floor(r() * liste.length)];

  const teint = prendre(TEINTS);
  const cheveux = prendre(CHEVEUX);
  const fond = prendre(FONDS);
  const haut = prendre(HAUTS);
  const coiffure = prendre(COIFFURES);
  const wax = prendre(WAX);
  const boucles = r() > 0.45;
  const cils = r() > 0.5;
  const id = `av${empreinte(graine).toString(36)}`;

  // Les cheveux derrière la tête.
  let arriere = '';
  if (coiffure === 'afro') {
    arriere =
      `<circle cx="50" cy="40" r="31" fill="${cheveux}"/>` +
      `<circle cx="26" cy="30" r="12" fill="${cheveux}"/>` +
      `<circle cx="74" cy="30" r="12" fill="${cheveux}"/>`;
  }
  if (coiffure === 'tresses') {
    arriere =
      `<path d="M24 40Q20 78 24 100H76Q80 78 76 40Z" fill="${cheveux}"/>` +
      [30, 38, 62, 70]
        .map(
          (x) =>
            `<path d="M${x} 52V96" stroke="#000" stroke-opacity=".25" stroke-width="1.6" stroke-dasharray="3 3"/>`
        )
        .join('');
  }
  if (coiffure === 'chignon') {
    arriere =
      `<circle cx="50" cy="16" r="12" fill="${cheveux}"/>` +
      `<path d="M42 18q8 -6 16 0" stroke="#000" stroke-opacity=".25" stroke-width="1.5" fill="none"/>`;
  }
  if (coiffure === 'nattes') {
    arriere =
      `<circle cx="25" cy="40" r="9" fill="${cheveux}"/><circle cx="75" cy="40" r="9" fill="${cheveux}"/>` +
      `<path d="M25 48q-3 10 1 20q-4 8 0 16" stroke="${cheveux}" stroke-width="7" stroke-linecap="round" fill="none"/>` +
      `<path d="M75 48q3 10 -1 20q4 8 0 16" stroke="${cheveux}" stroke-width="7" stroke-linecap="round" fill="none"/>`;
  }

  // Les cheveux devant, ou le foulard.
  let devant: string;
  if (coiffure === 'foulard') {
    devant =
      `<pattern id="${id}p" width="8" height="8" patternUnits="userSpaceOnUse">` +
      `<rect width="8" height="8" fill="${wax[0]}"/><circle cx="4" cy="4" r="1.8" fill="${wax[1]}"/></pattern>` +
      `<path d="M25 47Q22 12 50 10Q79 12 75 47Q70 28 50 28Q31 28 25 47Z" fill="url(#${id}p)"/>` +
      `<path d="M50 10q-14 -8 -9 -12q6 -2 9 7q3 -9 9 -7q5 4 -9 12z" fill="${wax[0]}" stroke="${wax[1]}" stroke-width="1.2"/>` +
      `<path d="M27 40Q50 30 73 40" stroke="${wax[1]}" stroke-width="2" fill="none" opacity=".8"/>`;
  } else {
    const frange =
      coiffure === 'court'
        ? 'M31 44Q30 22 50 21Q70 22 69 44Q64 31 50 31Q36 31 31 44Z'
        : 'M30 44Q29 20 50 20Q71 20 70 44Q63 30 51 33Q40 28 30 44Z';
    devant = `<path d="${frange}" fill="${cheveux}"/>`;
  }

  return (
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${titre}">` +
    `<defs><clipPath id="${id}c"><circle cx="50" cy="50" r="50"/></clipPath></defs>` +
    `<g clip-path="url(#${id}c)">` +
    `<rect width="100" height="100" fill="${fond}"/>` +
    `<circle cx="82" cy="18" r="10" fill="#fff" opacity=".35"/>` +
    arriere +
    `<path d="M12 104Q14 76 50 74Q86 76 88 104Z" fill="${haut}"/>` +
    `<path d="M38 76Q50 86 62 76" stroke="#fff" stroke-opacity=".45" stroke-width="2.5" fill="none"/>` +
    `<rect x="43" y="58" width="14" height="19" rx="7" fill="${teint}"/>` +
    `<rect x="43" y="58" width="14" height="10" rx="5" fill="#000" opacity=".12"/>` +
    `<circle cx="31" cy="48" r="4.2" fill="${teint}"/><circle cx="69" cy="48" r="4.2" fill="${teint}"/>` +
    `<ellipse cx="50" cy="46" rx="19" ry="22" fill="${teint}"/>` +
    `<ellipse cx="44" cy="38" rx="8" ry="5" fill="#fff" opacity=".08"/>` +
    devant +
    `<path d="M39 42q3.5 -2.4 7 0M54 42q3.5 -2.4 7 0" stroke="${cheveux}" stroke-width="1.8" stroke-linecap="round" fill="none"/>` +
    `<ellipse cx="42.5" cy="48" rx="2.3" ry="2.9" fill="#160C08"/><ellipse cx="57.5" cy="48" rx="2.3" ry="2.9" fill="#160C08"/>` +
    `<circle cx="43.3" cy="47" r=".8" fill="#fff"/><circle cx="58.3" cy="47" r=".8" fill="#fff"/>` +
    (cils
      ? `<path d="M40 46.4l-1.8 -1.2M60 46.4l1.8 -1.2" stroke="#160C08" stroke-width="1.2" stroke-linecap="round"/>`
      : '') +
    `<path d="M48.6 52q1.4 1.4 2.8 0" stroke="#000" stroke-opacity=".3" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    `<circle cx="37" cy="54" r="3.4" fill="#FF7E96" opacity=".35"/><circle cx="63" cy="54" r="3.4" fill="#FF7E96" opacity=".35"/>` +
    `<path d="M44.5 57.5Q50 62.5 55.5 57.5" stroke="#5A1E24" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    (boucles
      ? `<circle cx="31" cy="55" r="2.6" fill="#F5C443" stroke="#C99419" stroke-width=".8"/>` +
        `<circle cx="69" cy="55" r="2.6" fill="#F5C443" stroke="#C99419" stroke-width=".8"/>`
      : '') +
    `</g></svg>`
  );
}

/** Une graine au hasard, pour le bouton « changer d'avatar ». */
export function graineAuHasard(): string {
  return Math.random().toString(36).slice(2, 9);
}
