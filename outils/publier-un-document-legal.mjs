/**
 * Publier un document de Juriste comme page du site, en retirant tout ce qui
 * n'est pas le document.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * POURQUOI CET OUTIL EXISTE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Arthur, le 7 novembre 2026, après avoir lu les deux premières pages mises
 * en ligne :
 *
 *   « Je vois "Note pour Arthur, à retirer avant la mise en ligne". Comment
 *     tu mets ça là-bas ? Faut supprimer ça. Il y a des phrases qui sont
 *     inutiles. Quand on tape conditions générales d'utilisation, on doit
 *     voir SEULEMENT les conditions générales d'utilisation. On se passe
 *     bien de tes commentaires. Enlève tous les commentaires bizarres. À la
 *     fin je vois "les textes cités dans ce document", on s'en fout. Et je
 *     ne veux pas voir mon nom là-bas, dans AUCUN document. Tes versions, on
 *     s'en passe. »
 *
 * Il a entièrement raison, et la faute est la mienne : j'avais recopié les
 * documents tels quels en me disant qu'on ne touche pas à un texte qui
 * engage. Mais les notes de Juriste À DESTINATION D'ARTHUR ne font pas
 * partie du document : ce sont des messages sur le document, écrits dans la
 * même page faute d'ailleurs où les mettre. Les publier, c'est montrer la
 * cuisine à la cliente, et pire, c'est publier le prénom du propriétaire sur
 * un site qui parle du corps des femmes.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CE QUI EST RETIRÉ, ET POURQUOI CHAQUE RÈGLE EXISTE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. LES NOTES À ARTHUR. Des blocs de citation qui commencent par « Note
 *    pour Arthur » ou « CORRECTION DU ». Ce sont des messages de travail.
 * 2. LE NOM D'ARTHUR, partout. L'outil REFUSE de publier s'il en reste un :
 *    mieux vaut une publication qui s'arrête qu'un prénom en ligne.
 * 3. LA VERSION ET LE JOURNAL DES VERSIONS. « Version 1.1 du 5 novembre
 *    2026 (précédemment version 1.0 du 26 octobre) » ne dit rien à une
 *    femme qui veut savoir ce qu'elle accepte, et le journal des
 *    modifications encore moins.
 * 4. « LES TEXTES CITÉS DANS CE DOCUMENT ». Une bibliographie n'est pas une
 *    condition d'utilisation.
 * 5. LES PHRASES QUI PARLENT DU DOCUMENT au lieu de dire son contenu : « ce
 *    texte dit ce que nous vous offrons », « il est court et écrit
 *    simplement pour être lu sur un téléphone ». On n'annonce pas qu'on va
 *    être clair, on l'est.
 *
 * CE QUI N'EST JAMAIS TOUCHÉ : les articles eux-mêmes. Pas une virgule. Ce
 * sont des textes qui engagent, et les reformuler serait les réécrire.
 *
 * L'OUTIL REFUSE AUSSI un document contenant encore un [CHAMP n] : un
 * document légal publié avec des trous est pire que pas de document.
 *
 * Usage :
 *   node outils/publier-un-document-legal.mjs            (tous ceux qui sont prêts)
 *   node outils/publier-un-document-legal.mjs --verifier (ne publie rien)
 */
import fs from 'node:fs';
import path from 'node:path';

const VERIFIER = process.argv.includes('--verifier');

const SOURCE = 'C:/Users/USER/Desktop/Jarvis/livrables/juridique';
const DEST = 'C:/Users/USER/Projets/mousso-dambe/src/pages/legal';

/**
 * Les documents, dans l'ordre où ils s'affichent sur /legal.
 *
 * Un document absent de la source, ou qui porte encore des champs à remplir,
 * est simplement sauté : la page /legal l'annonce alors comme « bientôt ».
 */
const DOCUMENTS = [
  {
    fichier: '2026-10-26_mousso-dambe_conditions-generales-utilisation.md',
    adresse: 'conditions-generales.md',
    titre: "Conditions générales d'utilisation",
    description: "Les règles d'usage de Mousso Dambé.",
  },
  {
    fichier: '2026-10-26_mousso-dambe_politique-cookies-et-traceurs.md',
    adresse: 'cookies.md',
    titre: 'Cookies et traceurs',
    description: 'Ce que Mousso Dambé dépose sur ton téléphone, et pourquoi.',
  },
  {
    fichier: '2026-10-26_mousso-dambe_politique-de-confidentialite.md',
    adresse: 'politique-de-confidentialite.md',
    titre: 'Politique de confidentialité',
    description: 'Ce que Mousso Dambé sait de toi, et comment tout effacer.',
  },
  {
    fichier: '2026-10-26_mousso-dambe_mentions-legales.md',
    adresse: 'mentions-legales.md',
    titre: 'Mentions légales',
    description: 'Qui édite Mousso Dambé, et comment nous joindre.',
  },
  {
    fichier: '2026-10-26_mousso-dambe_conditions-generales-de-vente.md',
    adresse: 'conditions-de-vente.md',
    titre: 'Conditions générales de vente',
    description: 'Les règles de la boutique : prix, livraison, paiement.',
  },
  {
    fichier: '2026-10-26_mousso-dambe_politique-de-retour-et-remboursement.md',
    adresse: 'retours.md',
    titre: 'Retours et remboursement',
    description: 'Ce que tu peux renvoyer, et comment tu es remboursée.',
  },
];

/** Les titres de section qui emportent tout ce qui les suit, jusqu'au suivant. */
const SECTIONS_A_RETIRER = [
  /^#{1,3}\s*Les textes cités dans ce document/i,
  /^#{1,3}\s*Journal des versions/i,
  /^#{1,3}\s*Historique des versions/i,
];

/** Les phrases qui parlent du document au lieu de dire son contenu. */
const PHRASES_A_RETIRER = [
  /^Ce texte dit ce que[\s\S]*?pour être lu sur un téléphone\.\s*$/m,
  /^Il est court et écrit simplement, pour être lu sur un téléphone\.\s*$/m,
];

/**
 * Retirer un bloc de citation entier.
 *
 * Un bloc de citation en Markdown, ce sont des lignes consécutives qui
 * commencent par « > », y compris les lignes « > » seules qui les séparent.
 * On retire le bloc en entier dès que sa PREMIÈRE ligne porte une marque de
 * note de travail : couper au milieu laisserait des morceaux de phrase.
 */
function retirerBlocsDeNote(lignes) {
  const MARQUES = /note pour arthur|à retirer avant la mise en ligne|correction du \d|note pour le développeur/i;
  const sortie = [];
  let i = 0;
  while (i < lignes.length) {
    if (/^>/.test(lignes[i])) {
      let j = i;
      const bloc = [];
      while (j < lignes.length && /^>/.test(lignes[j])) { bloc.push(lignes[j]); j++; }
      if (MARQUES.test(bloc.join(' '))) {
        // On avale aussi la ligne vide qui suivait, pour ne pas laisser un trou.
        if (lignes[j] === '') j++;
        i = j;
        continue;
      }
      sortie.push(...bloc);
      i = j;
      continue;
    }
    sortie.push(lignes[i]);
    i++;
  }
  return sortie;
}

/** Couper le document au premier titre de section à retirer. */
function couperLesSections(lignes) {
  const fin = lignes.findIndex((l) => SECTIONS_A_RETIRER.some((m) => m.test(l)));
  return fin < 0 ? lignes : lignes.slice(0, fin);
}

function nettoyer(brut) {
  let lignes = brut.split('\n');

  // Le titre de niveau 1 et la ligne « **Mousso Dambé** » juste dessous : le
  // gabarit affiche déjà le titre, et le nom de la marque est dans l'en-tête
  // de la page. Les garder ferait doublon à l'écran.
  lignes = lignes.filter((l, i) => !(i < 8 && (/^#\s/.test(l) || /^\*\*Mousso Dambé\*\*\s*$/.test(l))));
  lignes = lignes.filter((l, i) => !(i < 8 && /^\*\*Version /.test(l)));

  lignes = retirerBlocsDeNote(lignes);
  lignes = couperLesSections(lignes);

  let texte = lignes.join('\n');
  for (const m of PHRASES_A_RETIRER) texte = texte.replace(m, '');

  // Un séparateur en tête, ou deux à la suite, ou trois lignes vides : ce
  // sont les cicatrices de ce qu'on vient d'enlever.
  texte = texte
    .replace(/^\s*(?:---\s*\n)+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(?:^|\n)---\s*\n\s*---\s*(?=\n)/g, '\n---')
    .replace(/\n*---\s*$/, '')
    .trim();

  return texte + '\n';
}

fs.mkdirSync(DEST, { recursive: true });

let publies = 0;
let refuses = 0;

for (const d of DOCUMENTS) {
  const chemin = path.join(SOURCE, d.fichier);
  if (!fs.existsSync(chemin)) {
    console.log(`ABSENT  ${d.adresse.padEnd(34)} ${d.fichier}`);
    refuses++;
    continue;
  }

  const propre = nettoyer(fs.readFileSync(chemin, 'utf8'));

  const trous = [...propre.matchAll(/\[CHAMP \d+[^\]]*\]/g)].map((m) => m[0]);
  if (trous.length) {
    console.log(`ATTEND  ${d.adresse.padEnd(34)} ${trous.length} champ(s) à remplir`);
    refuses++;
    continue;
  }

  // LA DERNIÈRE SERRURE. Si un prénom a survécu au nettoyage, on ne publie
  // pas : une page en moins se rattrape, un prénom en ligne beaucoup moins.
  const restes = [...propre.matchAll(/\bArthur\b/g)];
  if (restes.length) {
    console.log(`REFUSÉ  ${d.adresse.padEnd(34)} le prénom d'Arthur apparaît encore ${restes.length} fois`);
    refuses++;
    continue;
  }

  if (VERIFIER) {
    console.log(`PRÊT    ${d.adresse.padEnd(34)} ${(propre.length / 1024).toFixed(1)} Ko`);
    publies++;
    continue;
  }

  const entete = [
    '---',
    'layout: ../../layouts/Legal.astro',
    `titre: ${JSON.stringify(d.titre)}`,
    `description: ${JSON.stringify(d.description)}`,
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(DEST, d.adresse), entete + propre, 'utf8');
  console.log(`PUBLIÉ  ${d.adresse.padEnd(34)} ${(propre.length / 1024).toFixed(1)} Ko`);
  publies++;
}

console.log(`\n${publies} prêt(s) ou publié(s), ${refuses} en attente.`);
