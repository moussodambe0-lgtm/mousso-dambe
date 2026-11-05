/**
 * Lire le coffre d'Arthur, sans jamais deviner.
 *
 * Le coffre (`secrets/.env`, hors du depot) contient des noms avec des espaces
 * et des tirets (« e-mail admin MOUSSO DAMBE »), ecrits a la main au fil du
 * temps. Le 26 octobre 2026, deux lignes differentes designaient l'adresse de
 * l'administrateur, avec deux adresses differentes : les outils en prenaient
 * une selon l'ordre du fichier, et le banc local et le script de verification
 * n'avaient pas choisi la meme. Resultat, une connexion refusee sans raison
 * visible.
 *
 * La regle est donc : plusieurs lignes qui correspondent, c'est une erreur, pas
 * un choix a faire. L'outil s'arrete et nomme les lignes en cause. Une valeur
 * fausse appliquee en silence coute plus cher qu'un outil qui refuse de partir.
 *
 * Aucune valeur n'est jamais affichee : seules les trois premieres lettres
 * d'une adresse, et rien du tout pour une cle.
 */
import fs from 'node:fs';

/**
 * Ou vit le coffre, selon la machine.
 *
 * Arthur travaille sur deux PC, dont les comptes Windows ne portent pas le meme
 * nom, et le dossier Jarvis n'est pas au meme endroit sur les deux. Un chemin
 * unique ecrit en dur marchait donc sur une machine et echouait sur l'autre,
 * avec un message qui n'expliquait rien (« Aucune adresse d'administrateur
 * lisible dans le coffre »). On essaie les emplacements connus, dans l'ordre,
 * et on garde le premier qui existe. Rien n'est devine : ce sont des chemins
 * fixes, pas une recherche sur le disque.
 */
export const COFFRES_CONNUS = [
  'C:/Users/larou/OneDrive/Desktop/Jarvis/secrets/.env',
  'C:/Users/larou/Desktop/Jarvis/secrets/.env',
  'C:/Users/USER/Desktop/Jarvis/secrets/.env',
];

/** Le premier coffre qui existe sur cette machine, sinon le premier de la liste. */
export function trouverCoffre(candidats = COFFRES_CONNUS) {
  return candidats.find((c) => fs.existsSync(c)) ?? candidats[0];
}

export const COFFRE = trouverCoffre();

/** Toutes les lignes `nom = valeur` du coffre, dans l'ordre du fichier. */
export function lignesDuCoffre(chemin = COFFRE) {
  if (!fs.existsSync(chemin)) return [];
  const lignes = [];
  for (const brute of fs.readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const propre = brute.trim();
    if (!propre || propre.startsWith('#')) continue;
    const m = /^(.+?)\s*=\s*(.*)$/.exec(propre);
    if (m) lignes.push({ nom: m[1].trim(), valeur: m[2].trim() });
  }
  return lignes;
}

/**
 * La seule valeur dont le nom correspond au motif.
 *
 * Rend `{ valeur }`, ou `{ erreur }` si rien ne correspond ou si plusieurs
 * lignes correspondent. L'appelant decide quoi faire du refus : s'arreter pour
 * un script qui ecrit en base, se replier pour un outil de confort.
 */
export function valeurUnique(motif, { chemin = COFFRE, quoi = 'cette valeur' } = {}) {
  const trouvees = lignesDuCoffre(chemin).filter((l) => motif.test(l.nom) && l.valeur);

  if (trouvees.length === 0) {
    return { erreur: `Aucune ligne du coffre ne donne ${quoi}.` };
  }
  if (trouvees.length > 1) {
    const noms = trouvees.map((l) => `« ${l.nom} »`).join(' et ');
    const memes = new Set(trouvees.map((l) => l.valeur.toLowerCase())).size === 1;
    return {
      erreur:
        `Le coffre donne ${trouvees.length} fois ${quoi} : ${noms}. ` +
        (memes
          ? 'Les valeurs sont identiques, mais il faut quand meme en supprimer une : demain elles ne le seront plus.'
          : 'Les valeurs sont DIFFERENTES. Supprime la ligne de trop avant de continuer : deviner laquelle est la bonne reviendrait a tirer au sort.'),
    };
  }
  return { valeur: trouvees[0].valeur, nom: trouvees[0].nom };
}

/**
 * Un motif ancre sur « mousso », et qui exclut ou exige « test ».
 *
 * Le 26 octobre 2026, un motif trop large a reconnu la ligne
 * « JIA_TEST_ANON_KEY », qui appartient a un autre projet, parce que son nom
 * contient « TEST_ANON ». L'outil a cru avoir trouve la cle de la base d'essai
 * de Mousso Dambe. Le coffre est partage entre plusieurs projets : un nom de
 * ligne doit donc nommer le projet, et le motif doit l'exiger.
 */
export function motifMousso(sujet, { test = false } = {}) {
  const source = `(?=.*mousso)${test ? '(?=.*test)' : '(?!.*test)'}${sujet}`;
  return new RegExp(source, 'i');
}

/** L'adresse qui a le droit d'etre administratrice de Mousso Dambe. */
export const MOTIF_EMAIL_ADMIN = /e-?mail.*admin.*mousso/i;

export function emailAdmin(options = {}) {
  return valeurUnique(MOTIF_EMAIL_ADMIN, {
    ...options,
    quoi: "l'adresse de l'administrateur de Mousso Dambe",
  });
}

/** Le jeton GitHub du depot de Mousso Dambe. */
export const MOTIF_JETON_GITHUB = /git.*(hup|hub).*mousso|mousso.*git.*(hup|hub)|github_token_mousso/i;

export function jetonGitHub(options = {}) {
  return valeurUnique(MOTIF_JETON_GITHUB, {
    ...options,
    quoi: 'le jeton GitHub de Mousso Dambe',
  });
}

/**
 * Ne RIEN montrer d'une valeur, jamais.
 *
 * Cette fonction rendait les trois premieres lettres et le domaine. Arthur, le
 * 26 octobre 2026 : « je t'ai dit d'eviter de mettre mes infos ici », « tu
 * balances carrement mon email ». Il a raison : trois lettres et un domaine
 * suffisent souvent a reconnaitre quelqu'un, et ce qui s'imprime dans un
 * terminal finit dans un journal, un commit ou une conversation.
 *
 * Elle rend donc seulement de quoi VERIFIER qu'une valeur est la et qu'elle
 * ressemble a ce qu'on attend : sa longueur, et la forme generale.
 */
export function masquer(valeur) {
  if (!valeur) return '(vide)';
  const texte = String(valeur);
  const forme = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(texte)
    ? 'une adresse bien formee'
    : 'une valeur';
  return `${forme}, ${texte.length} caracteres`;
}
