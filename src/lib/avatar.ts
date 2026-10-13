/**
 * LE GÉNÉRATEUR D'AVATARS, version « film d'animation » (13 octobre 2026).
 *
 * Demande d'Arthur : chaque inscrite a automatiquement une photo de profil à
 * elle, qui ne ressemble pas à celles des autres, dans le style de son image
 * de référence (portrait façon dessin animé 3D : peau brune aux ombres
 * douces, cheveux brillants, grands yeux, lèvres brillantes, bijoux dorés).
 *
 * Le principe ne change pas : une graine de texte donne toujours le même
 * avatar, dessiné en SVG sur le serveur. Pas d'image à téléverser, pas de
 * photo à héberger, rien qui parte sur le réseau.
 *
 * Ce qui change : le dessin. Volume du visage par dégradés radiaux, reflets
 * sur les cheveux, yeux à iris dégradé et trait d'eye-liner, lèvres à reflet,
 * onze coiffures, huit teints, trois formes de visage, trois regards, trois
 * sourires, huit hauts, des bijoux tirés au sort.
 *
 * Les identifiants internes (dégradés, motif wax) sont dérivés de la graine :
 * deux avatars de graines différentes n'ont jamais le même identifiant, et
 * deux avatars de même graine ont des définitions identiques.
 *
 * Contraintes tenues : pas de style=, pas de <style>, pas de script, pas de
 * lien externe (seulement url(#id) internes), pas d'animation, pas de signe
 * religieux, de drapeau, de logo ni de croix.
 */

// [peau, ombre] : du plus clair au plus foncé
const TEINTS: [string, string][] = [
  ['#C9906A', '#A26A47'],
  ['#BB7F55', '#93593A'],
  ['#AC6E45', '#854E30'],
  ['#9B5F3A', '#764127'],
  ['#8E5A3B', '#6E3B26'],
  ['#7C4A2E', '#5C321D'],
  ['#6A3C25', '#4C2816'],
  ['#5A3020', '#3E1E12'],
];
// noir, brun très foncé, brun chaud, reflet bordeaux, reflet miel
const CHEVEUX = ['#141012', '#2A1B15', '#4A2C1C', '#4A1C24', '#6A4222'];
const FONDS: [string, string][] = [
  ['#FFD1E3', '#F7A8C8'],
  ['#FFE3CF', '#FFC6A3'],
  ['#D9F2E4', '#AEE0C6'],
  ['#D6ECFF', '#AFD3F5'],
  ['#FFF1BF', '#FBDB86'],
  ['#FFDCD6', '#F9B3A8'],
  ['#E3F4F4', '#B5E2E0'],
  ['#FBE4F0', '#F0BFD9'],
];
const COULEURS_HAUT = ['#D61F69', '#F2614A', '#F5B82E', '#1F9D72', '#2D5BD9', '#F08A24', '#19A7A8', '#D9363E', '#F7A8C4', '#F4EEE6', '#2A2228'];
const LEVRES = ['#B5506A', '#C2185B', '#8E3B3B', '#A0405A', '#7A2E3A', '#C46A6A'];
const MONTURES = ['#E3B04B', '#1B1116', '#D96A8E', '#8A5A3C'];
const WAX: [string, string, string][] = [
  ['#E5484D', '#F5B82E', '#1B1116'],
  ['#1F9D72', '#F5B82E', '#F06C8F'],
  ['#F59E2A', '#2D5BD9', '#FFF6E5'],
  ['#D61F69', '#FFD166', '#1F9D72'],
  ['#2D5BD9', '#F28B2E', '#FFF6E5'],
  ['#19A7A8', '#E5484D', '#FFF1BF'],
];
const COIFFURES = ['carre', 'longs', 'afro', 'tresses', 'twists', 'chignon', 'queue', 'locks', 'court', 'bandeau'] as const;
const HAUTS = ['mao', 'bretelles', 'colv', 'epaules', 'wax', 'rond', 'chemise', 'licou'] as const;
const OR = '#E3B04B';
const OR_F = '#A97A1F';

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

/** Mélange deux couleurs #RRGGBB (t = 0 : la première, t = 1 : la seconde). */
function melange(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const c = (d: number) => Math.round(((x >> d) & 255) * (1 - t) + ((y >> d) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1).toUpperCase();
}

const n = (v: number) => Math.round(v * 10) / 10;

/** Le titre va dans un attribut : on neutralise les guillemets et les chevrons. */
const echappe = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Un trait arrondi (mèche, tresse, lock). */
function trait(d: string, couleur: string, largeur: number, opacite = 1): string {
  return `<path d="${d}" stroke="${couleur}" stroke-width="${largeur}" stroke-linecap="round" fill="none"${opacite < 1 ? ` opacity="${opacite}"` : ''}/>`;
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
  const id = `av${empreinte(graine).toString(36)}`;

  const [peau, ombre] = prendre(TEINTS);
  const lumiere = melange(peau, '#FFE7D6', 0.28);
  const cheveux = prendre(CHEVEUX);
  const cheveuxO = melange(cheveux, '#000000', 0.45);
  const cheveuxL = melange(cheveux, '#C8A08A', 0.4);
  const [fond1, fond2] = prendre(FONDS);
  // le foulard wax sort une fois sur huit environ : souvent, sans dominer
  const coiffure: string = r() < 0.13 ? 'foulard' : prendre(COIFFURES);
  const haut = prendre(HAUTS);
  const couleurHaut = prendre(COULEURS_HAUT);
  const wax = prendre(WAX);
  const levres = prendre(LEVRES);
  const forme = Math.floor(r() * 3); // 0 rond, 1 ovale, 2 menton fin
  const regard = Math.floor(r() * 3); // 0 amande, 1 rond, 2 rieur
  const sourire = Math.floor(r() * 3); // 0 en coin, 1 fermé, 2 dents
  const sourcil = Math.floor(r() * 3);
  // Bijoux : jamais tous à la fois
  const oreilles = Math.floor(r() * 3); // 0 rien, 1 anneaux, 2 pendantes
  const collier = r() < 0.45;
  const lunettes = r() < 0.18 ? 1 : r() < 0.15 ? 2 : 0; // 1 sur le nez, 2 sur la tête
  const monture = prendre(MONTURES);
  const nez = r() < 0.15;
  const brasDore = r() < 0.4;
  const tete = r() < 0.5 ? -1 : 1; // sens de l'inclinaison et du sourire en coin
  const inclinaison = tete * [0, 3, 5][Math.floor(r() * 3)];

  // Le visage
  const w = [18.5, 17.2, 16.6][forme];
  const menton = [66, 67.5, 68][forme];
  const mach = [0.78, 0.62, 0.42][forme];
  const visage =
    `M50 25C${n(50 + w * 0.68)} 25 ${n(50 + w)} 32 ${n(50 + w)} 44C${n(50 + w)} 54 ${n(50 + w * mach)} ${n(menton - 3)} 50 ${menton}` +
    `C${n(50 - w * mach)} ${n(menton - 3)} ${n(50 - w)} 54 ${n(50 - w)} 44C${n(50 - w)} 32 ${n(50 - w * 0.68)} 25 50 25Z`;

  const defs =
    `<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fond1}"/><stop offset="1" stop-color="${fond2}"/></linearGradient>` +
    `<radialGradient id="${id}f" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${lumiere}"/><stop offset=".55" stop-color="${peau}"/><stop offset="1" stop-color="${ombre}"/></radialGradient>` +
    `<radialGradient id="${id}s" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="${lumiere}"/><stop offset=".6" stop-color="${peau}"/><stop offset="1" stop-color="${ombre}"/></radialGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${cheveuxL}"/><stop offset=".35" stop-color="${cheveux}"/><stop offset="1" stop-color="${cheveuxO}"/></linearGradient>` +
    `<linearGradient id="${id}v" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${melange(couleurHaut, '#FFFFFF', 0.22)}"/><stop offset="1" stop-color="${melange(couleurHaut, '#000000', 0.18)}"/></linearGradient>` +
    `<radialGradient id="${id}i" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#8A5530"/><stop offset="1" stop-color="#2A140A"/></radialGradient>` +
    (haut === 'wax' || coiffure === 'foulard' || coiffure === 'bandeau'
      ? `<pattern id="${id}w" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(${[0, 30, 45][Math.floor(r() * 3)]})">` +
        `<rect width="7" height="7" fill="${wax[0]}"/><circle cx="3.5" cy="3.5" r="2.3" fill="${wax[1]}"/><circle cx="3.5" cy="3.5" r="1.1" fill="${wax[0]}"/>` +
        `<circle cx="3.5" cy="3.5" r=".5" fill="${wax[2]}"/><circle cx="0" cy="0" r="1.1" fill="${wax[2]}"/><circle cx="7" cy="0" r="1.1" fill="${wax[2]}"/>` +
        `<circle cx="0" cy="7" r="1.1" fill="${wax[2]}"/><circle cx="7" cy="7" r="1.1" fill="${wax[2]}"/></pattern>`
      : '');

  const H = `url(#${id}h)`;
  let arriere = '';
  let devant = '';
  let dessus = '';
  // Une mèche de reflet blanc translucide, posée sur le dessus du crâne
  const reflet = (d: string) => `<path d="${d}" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
  const raieMilieu =
    `<path d="M50 23C39 23 31 31 31 43C31 52 32 60 35 67Q38 68 39 65C36 54 37 38 50 26Z" fill="${H}"/>` +
    `<path d="M50 23C61 23 69 31 69 43C69 52 68 60 65 67Q62 68 61 65C64 54 63 38 50 26Z" fill="${H}"/>`;
  const plaque = `<path d="M31 46C30 31 38 22 50 22C62 22 70 31 69 46C66 35 59 30 50 30C41 30 34 35 31 46Z" fill="${H}"/>`;

  switch (coiffure) {
    case 'carre':
      arriere = `<path d="M28 66C23 50 25 24 50 20C75 24 77 50 72 66Q70 71 64 69H36Q30 71 28 66Z" fill="${H}"/>`;
      devant =
        r() < 0.5
          ? raieMilieu + reflet('M44 26Q36 30 34 40') + reflet('M57 27Q63 31 65 38')
          : // frange droite
            `<path d="M31 62C29 50 29 32 34 27C39 22 61 22 66 27C71 32 71 50 69 62Q66 64 65 60C65 50 66 42 64 38Q50 41 36 38C34 42 35 50 35 60Q34 64 31 62Z" fill="${H}"/>` +
            reflet('M37 29Q50 25 63 29');
      break;
    case 'longs':
      arriere = `<path d="M27 70C21 50 25 22 50 19C75 22 79 50 73 70L78 94Q71 99 64 92H36Q29 99 22 94Z" fill="${H}"/>`;
      devant =
        `<path d="M50 23C38 23 30 33 30 48C30 62 29 76 26 90Q32 92 35 86C37 70 35 44 50 26Z" fill="${H}"/>` +
        `<path d="M50 23C61 22 70 30 70 44C70 52 66 56 64 50C63 38 58 30 50 26Z" fill="${H}"/>` +
        reflet('M43 26Q35 31 33 44') + reflet('M31 58Q30 70 29 80');
      break;
    case 'afro': {
      const bosses = [[50, 13], [33, 19], [67, 19], [23, 33], [77, 33], [21, 48], [79, 48], [41, 12], [59, 12]];
      arriere =
        `<circle cx="50" cy="38" r="29" fill="${H}"/>` +
        bosses.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${H}"/>`).join('') +
        `<path d="M30 22Q34 16 40 14M60 14Q66 16 70 22" stroke="#fff" stroke-opacity=".25" stroke-width="2" stroke-linecap="round" fill="none"/>`;
      devant = plaque;
      break;
    }
    case 'tresses': {
      arriere = `<path d="M28 60C24 44 28 22 50 20C72 22 76 44 72 60L74 96H26Z" fill="${cheveuxO}"/>`;
      let t = '';
      let u = '';
      for (const x of [27, 31, 35, 65, 69, 73]) {
        const s = x < 50 ? -1 : 1;
        t += `M${x} 50Q${x + s * 2} 72 ${x + s} 98`;
        u += `M${x} 52Q${x + s * 2} 72 ${x + s} 98`;
      }
      arriere += trait(t, cheveux, 4.2) + trait(u, cheveuxL, 1.2, 0.5);
      devant = plaque + trait('M36 30Q42 25 50 24M64 30Q58 25 50 24M33 38Q38 30 45 27M67 38Q62 30 55 27', cheveuxO, 1.1, 0.8);
      break;
    }
    case 'twists': {
      arriere = `<path d="M26 64C20 42 27 18 50 16C73 18 80 42 74 64Q70 76 62 72H38Q30 76 26 64Z" fill="${cheveuxO}"/>`;
      let t = '';
      let u = '';
      for (let i = 0; i < 9; i++) {
        const x = 26 + i * 6;
        const bas = 60 + ((i * 7) % 5) * 3;
        t += `M${x} 26Q${x - 3} ${bas - 14} ${x + 1} ${bas}`;
        u += `M${x - 1} 34L${x + 1} 36M${x - 2} 44L${x} 46M${x - 1} 54L${x + 1} 56`;
      }
      arriere += trait(t, cheveux, 3.4) + trait(u, cheveuxL, 0.9, 0.6);
      devant = plaque + trait('M38 25Q44 22 50 23', cheveuxL, 1.4, 0.6);
      break;
    }
    case 'chignon': {
      // haut et rond, ou plus bas et décalé, plus ou moins gros
      const [bx, by, br] = [[50, 13, 11], [50 + tete * 9, 16, 10], [50, 11, 13]][Math.floor(r() * 3)];
      arriere =
        `<circle cx="${bx}" cy="${by}" r="${br}" fill="${H}"/>` +
        trait(`M${bx + 5} ${by - 5}A6 6 0 1 0 ${bx + 6} ${by + 1}`, cheveuxO, 1.1, 0.6) +
        (r() < 0.5 ? `<path d="M${bx - 8} ${by + br - 3}Q${bx} ${by + br + 2} ${bx + 8} ${by + br - 3}" stroke="${couleurHaut}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` : '');
      devant = plaque + reflet('M42 25Q36 28 34 35') + trait('M38 30Q44 27 50 27M62 30Q56 27 50 27', cheveuxO, 0.9, 0.6);
      break;
    }
    case 'queue':
      arriere =
        `<path d="M${50 + tete * 14} 26C${50 + tete * 30} 30 ${50 + tete * 30} 52 ${50 + tete * 26} 74Q${50 + tete * 22} 82 ${50 + tete * 18} 76C${50 + tete * 22} 58 ${50 + tete * 22} 40 ${50 + tete * 12} 30Z" fill="${H}"/>`;
      devant = plaque + reflet('M42 25Q36 28 34 35') + `<circle cx="${50 + tete * 15}" cy="27" r="2.4" fill="${melange(couleurHaut, '#000', 0.1)}"/>`;
      break;
    case 'locks': {
      arriere = `<path d="M28 60C24 42 28 20 50 18C72 20 76 42 72 60L72 86H28Z" fill="${cheveuxO}"/>`;
      let t = '';
      let u = '';
      for (const [x, b] of [[27, 82], [32, 88], [37, 84], [63, 86], [68, 88], [73, 80]]) {
        const s = x < 50 ? -1 : 1;
        t += `M${x} 40Q${x + s * 2} 62 ${x + s} ${b}`;
        u += `M${x - 1} 52L${x + 1} 53M${x} 64L${x + 2} 65M${x} 76L${x + 2} 77`;
      }
      arriere += trait(t, cheveux, 5) + trait(u, cheveuxO, 1, 0.7);
      devant =
        `<path d="M30 46C29 30 38 21 50 21C62 21 71 30 70 46C67 38 63 34 57 33C53 36 47 36 43 33C37 34 33 38 30 46Z" fill="${H}"/>` +
        trait('M40 23Q37 30 38 34M50 21V34M60 23Q63 30 62 34', cheveuxO, 1.1, 0.7);
      break;
    }
    case 'court':
      devant =
        `<path d="M31 45C29 27 38 19 50 19C62 19 71 27 69 45C67 36 62 31 56 30Q50 32 44 30C38 31 33 36 31 45Z" fill="${H}"/>` +
        trait('M36 26h.1M42 23h.1M48 22h.1M54 22h.1M60 24h.1M65 29h.1M39 29h.1M45 26h.1M51 25h.1M57 26h.1M62 28h.1M34 33h.1M66 34h.1', cheveuxO, 1.6, 0.7) +
        reflet('M41 23Q36 25 34 30');
      break;
    case 'foulard':
      arriere =
        `<path d="M24 46C18 22 34 6 52 7C70 8 84 22 76 46Z" fill="url(#${id}w)"/>` +
        `<path d="M${50 + tete * 6} 9C${50 + tete * 16} -2 ${50 + tete * 28} 2 ${50 + tete * 26} 12C${50 + tete * 22} 18 ${50 + tete * 12} 14 ${50 + tete * 6} 9Z" fill="url(#${id}w)" stroke="${wax[2]}" stroke-width=".6"/>`;
      devant =
        `<path d="M29 45C26 26 38 15 50 15C62 15 74 26 71 45C66 33 59 28 50 28C41 28 34 33 29 45Z" fill="url(#${id}w)"/>` +
        `<path d="M30 40Q50 24 70 40" stroke="${melange(wax[0], '#000', 0.3)}" stroke-opacity=".5" stroke-width="1.4" fill="none"/>` +
        `<path d="M33 30Q50 18 67 30" stroke="#fff" stroke-opacity=".3" stroke-width="1.6" fill="none"/>`;
      break;
    case 'bandeau':
      arriere = `<circle cx="50" cy="16" r="15" fill="${H}"/><circle cx="40" cy="12" r="8" fill="${H}"/><circle cx="60" cy="12" r="8" fill="${H}"/>`;
      devant = plaque;
      dessus = `<path d="M31 37C34 26 42 23 50 23C58 23 66 26 69 37L68 41C64 32 58 29 50 29C42 29 36 32 32 41Z" fill="url(#${id}w)"/>`;
      break;
  }

  // Le haut
  const V = `url(#${id}v)`;
  let vetement = '';
  const sansManches = haut === 'mao' || haut === 'bretelles' || haut === 'epaules' || haut === 'licou';
  switch (haut) {
    case 'mao':
      vetement =
        `<path d="M24 102C25 92 28 85 33 81L40 78Q50 81 60 78L67 81C72 85 75 92 76 102Z" fill="${V}"/>` +
        `<path d="M41 77V72Q50 75 59 72V77Q50 80 41 77Z" fill="${melange(couleurHaut, '#000', 0.12)}"/><path d="M50 79V86" stroke="#000" stroke-opacity=".2" stroke-width=".8"/>`;
      break;
    case 'bretelles':
      vetement =
        `<path d="M30 102C31 92 33 88 36 86Q50 91 64 86C67 88 69 92 70 102Z" fill="${V}"/>` +
        `<path d="M37 87L39 77M63 87L61 77" stroke="${couleurHaut}" stroke-width="1.6"/>`;
      break;
    case 'colv':
      vetement = `<path d="M8 102C10 86 22 80 37 77L50 93L63 77C78 80 90 86 92 102Z" fill="${V}"/>`;
      break;
    case 'epaules':
      vetement =
        `<path d="M14 102C14 94 17 88 20 86Q50 93 80 86C83 88 86 94 86 102Z" fill="${V}"/>` +
        `<path d="M20 86Q50 93 80 86" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" fill="none"/>`;
      break;
    case 'wax':
      vetement = `<path d="M8 102C10 86 22 80 37 77Q50 85 63 77C78 80 90 86 92 102Z" fill="url(#${id}w)"/>` +
        `<path d="M37 77Q50 85 63 77" stroke="${wax[2]}" stroke-width="1.6" fill="none"/>`;
      break;
    case 'rond':
      vetement = `<path d="M8 102C10 86 22 80 37 77Q50 84 63 77C78 80 90 86 92 102Z" fill="${V}"/>`;
      break;
    case 'chemise':
      vetement =
        `<path d="M8 102C10 86 22 80 37 77L50 90L63 77C78 80 90 86 92 102Z" fill="${V}"/>` +
        `<path d="M37 77L44 89L50 90L41 76ZM63 77L56 89L50 90L59 76Z" fill="${melange(couleurHaut, '#FFFFFF', 0.45)}"/>` +
        `<circle cx="50" cy="95" r=".9" fill="#fff" opacity=".7"/>`;
      break;
    case 'licou':
      vetement = `<path d="M31 102C32 92 35 87 39 85L45 76H55L61 85C65 87 68 92 69 102Z" fill="${V}"/>`;
      break;
  }

  // Le corps : épaules, cou, ombre sous le menton
  const corps =
    `<path d="M10 104C12 86 24 79 38 77H62C76 79 88 86 90 104Z" fill="url(#${id}s)"/>` +
    `<path d="M43 60H57V79Q50 83 43 79Z" fill="url(#${id}s)"/>` +
    `<path d="M43 63Q50 71 57 63V69Q50 75 43 69Z" fill="${ombre}" opacity=".7"/>` +
    (sansManches && brasDore ? `<path d="M15 96Q19 93 24 95M14 99Q19 96 24 98" stroke="${OR}" stroke-width="1.3" fill="none"/>` : '');

  // Les yeux
  const ecart = [-0.6, 0, 0.7][Math.floor(r() * 3)];
  const yeux = [43 - ecart, 57 + ecart]
    .map((x, k) => {
      const s = k === 0 ? -1 : 1; // côté extérieur
      const ry = [3.6, 4.2, 3][regard];
      const y = 47;
      let o =
        `<ellipse cx="${x}" cy="${y}" rx="5" ry="${ry}" fill="#FBF4EF"/>` +
        `<circle cx="${n(x + s * 0.2)}" cy="${y + 0.4}" r="${regard === 2 ? 2.8 : 3.2}" fill="url(#${id}i)"/>` +
        `<circle cx="${n(x + s * 0.2)}" cy="${y + 0.4}" r="1.5" fill="#120806"/>` +
        `<circle cx="${n(x + 1.1)}" cy="${y - 0.8}" r="1.1" fill="#fff"/><circle cx="${n(x - 1)}" cy="${y + 1.5}" r=".5" fill="#fff" opacity=".8"/>` +
        // paupière en croissant, plus épaisse au milieu, et trait d'eye-liner vers l'extérieur
        `<path d="M${n(x - 5.3)} ${y + 0.3}Q${x} ${n(y - ry - 2.8)} ${n(x + 5.3)} ${y + 0.3}Q${x} ${n(y - ry - 1.1)} ${n(x - 5.3)} ${y + 0.3}Z" fill="#1A0E0B"/>` +
        `<path d="M${n(x + s * 5.1)} ${y + 0.2}L${n(x + s * 7.2)} ${y - 1.8}L${n(x + s * 4.4)} ${y - 1}Z" fill="#1A0E0B"/>`;
      if (regard === 2) o += `<path d="M${x - 4.4} ${y + 3}Q${x} ${y + 0.8} ${x + 4.4} ${y + 3}" stroke="${ombre}" stroke-width="1.2" fill="none"/>`;
      return o;
    })
    .join('');

  // Les sourcils
  const haussement = [3.4, 1.6, 2.4][sourcil];
  const epais = [1.5, 1.8, 1.2][sourcil];
  const sourcils = [
    `M37.6 39.6Q42 ${n(38.4 - haussement)} 46.8 38.9`,
    `M62.4 39.6Q58 ${n(38.4 - haussement)} 53.2 38.9`,
  ]
    .map((d) => `<path d="${d}" stroke="${melange(cheveuxO, '#000', 0.2)}" stroke-width="${epais}" stroke-linecap="round" fill="none"/>`)
    .join('');

  // Nez, joues
  const visageDetails =
    `<path d="M48.6 50.5Q47.6 54.2 49 55.4Q50.6 56.3 52.2 55.2" stroke="${ombre}" stroke-width=".9" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="50.6" cy="53.4" rx="1.2" ry=".8" fill="#fff" opacity=".22"/>` +
    `<ellipse cx="37.5" cy="54" rx="4.2" ry="2.6" fill="#F07A8C" opacity=".3"/><ellipse cx="62.5" cy="54" rx="4.2" ry="2.6" fill="#F07A8C" opacity=".3"/>` +
    `<ellipse cx="41" cy="34" rx="6" ry="3" fill="#fff" opacity=".1"/>`;

  // La bouche
  const levresO = melange(levres, '#000', 0.25);
  let bouche: string;
  if (sourire === 0) {
    // sourire en coin, comme sur l'image de référence : lèvres fermées, un coin relevé
    bouche =
      `<g transform="rotate(${tete * -7} 50 60) translate(${tete} 0)">` +
      `<path d="M45 59Q47.6 57.6 50 58.3Q52.4 57.6 55 59Q50 60.2 45 59Z" fill="${levresO}"/>` +
      `<path d="M45 59Q50 60.2 55 59Q53.6 62.8 50 63Q46.4 62.8 45 59Z" fill="${levres}"/>` +
      `<ellipse cx="50.6" cy="61.6" rx="2" ry=".55" fill="#fff" opacity=".4"/></g>`;
  } else if (sourire === 1) {
    bouche =
      `<path d="M44 58.6Q47 57 50 58Q53 57 56 58.6Q50 60.4 44 58.6Z" fill="${levresO}"/>` +
      `<path d="M44 58.6Q50 60.4 56 58.6Q54 63.2 50 63.4Q46 63.2 44 58.6Z" fill="${levres}"/>` +
      `<ellipse cx="50" cy="61.8" rx="2.4" ry=".6" fill="#fff" opacity=".4"/>`;
  } else {
    bouche =
      `<path d="M43.6 58.2Q50 56.6 56.4 58.2Q55 64.6 50 64.8Q45 64.6 43.6 58.2Z" fill="${levres}"/>` +
      `<path d="M45 59Q50 58.2 55 59Q54.4 61 50 61.2Q45.6 61 45 59Z" fill="#FFFDF8"/>` +
      `<ellipse cx="50" cy="63.4" rx="2" ry=".5" fill="#fff" opacity=".35"/>`;
  }

  // Bijoux
  let bijoux = '';
  const ox = [50 - w + 0.6, 50 + w - 0.6];
  if (oreilles === 1) bijoux += ox.map((x) => `<circle cx="${n(x)}" cy="56" r="2.8" stroke="${OR}" stroke-width="1.1" fill="none"/>`).join('');
  if (oreilles === 2)
    bijoux += ox
      .map((x) => `<path d="M${n(x)} 53V57" stroke="${OR}" stroke-width=".8"/><path d="M${n(x)} 56.5Q${n(x - 2)} 60 ${n(x)} 61.5Q${n(x + 2)} 60 ${n(x)} 56.5Z" fill="${OR}" stroke="${OR_F}" stroke-width=".4"/>`)
      .join('');
  if (collier) bijoux += `<path d="M42 78Q50 85 58 78M43 80Q50 88 57 80" stroke="${OR}" stroke-width=".7" fill="none"/><circle cx="50" cy="86.6" r="1" fill="${OR}"/>`;
  if (nez) bijoux += `<circle cx="${52.4}" cy="54.6" r=".6" fill="${OR}"/>`;
  if (lunettes === 1)
    bijoux +=
      `<circle cx="43" cy="47" r="5.6" stroke="${monture}" stroke-width=".9" fill="#fff" fill-opacity=".08"/><circle cx="57" cy="47" r="5.6" stroke="${monture}" stroke-width=".9" fill="#fff" fill-opacity=".08"/>` +
      `<path d="M48.6 46.4Q50 45.4 51.4 46.4M37.4 46L33 45M62.6 46L67 45" stroke="${monture}" stroke-width=".9" fill="none"/>`;
  const lunettesTete =
    lunettes === 2
      ? `<ellipse cx="42.5" cy="25.5" rx="5.2" ry="3.4" fill="#2A1B20"/><ellipse cx="57.5" cy="25.5" rx="5.2" ry="3.4" fill="#2A1B20"/>` +
        `<path d="M47.6 25Q50 23.6 52.4 25" stroke="${monture}" stroke-width="1" fill="none"/><path d="M39 24.4L41.6 23.6" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>`
      : '';

  return (
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${echappe(titre)}">` +
    `<defs>${defs}</defs>` +
    `<rect width="100" height="100" fill="url(#${id}b)"/>` +
    `<circle cx="80" cy="18" r="13" fill="#fff" opacity=".22"/>` +
    // tout le portrait est agrandi d'un quart pour que le visage se lise à 38 px
    `<g transform="matrix(1.22 0 0 1.22 -11 -7) rotate(${inclinaison} 50 62)">` +
    arriere +
    corps +
    vetement +
    `<ellipse cx="${n(50 - w + 0.4)}" cy="48" rx="3" ry="4.4" fill="${ombre}"/><ellipse cx="${n(50 + w - 0.4)}" cy="48" rx="3" ry="4.4" fill="${ombre}"/>` +
    `<path d="${visage}" fill="url(#${id}f)"/>` +
    visageDetails +
    sourcils +
    yeux +
    bouche +
    devant +
    dessus +
    lunettesTete +
    bijoux +
    `</g></svg>`
  );
}

/** Une graine au hasard, pour le bouton « changer d'avatar ». */
export function graineAuHasard(): string {
  return Math.random().toString(36).slice(2, 9);
}
