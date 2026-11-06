/**
 * Les textes auxquels une femme dit oui, et leur numéro de version.
 *
 * POURQUOI ILS VIVENT ICI ET PAS DANS LA PAGE. C'est le texte exact qui fait
 * la preuve : la base en garde l'empreinte SHA-256 au moment du oui (voir
 * `consentement_noter`, migration 20261106090000). Un mot changé dans la page
 * sans changer la version, et l'empreinte gardée ne correspond plus à rien :
 * on ne saurait plus dire à quoi elle a dit oui. Un seul endroit, un seul
 * texte, un seul numéro.
 *
 * QUAND CHANGER LA VERSION. Dès qu'un mot change le sens de ce qu'elle
 * accepte. Une virgule, non ; « l'équipe peut relire » devenu « l'équipe
 * relit », oui. En cas de doute, on change : redemander un accord coûte un
 * écran, un accord qu'on ne peut plus rattacher à son texte ne vaut rien.
 *
 * Les textes sont du Juriste, rapport du 5 novembre 2026, § 1.4, repris mot
 * pour mot. Ils ne se réécrivent pas « pour faire plus joli » : chaque phrase
 * nomme l'une des trois choses que l'article 26 exige qu'elle sache, à savoir
 * que Dambé est une machine, que ce qu'elle écrit sort du Burkina Faso, et
 * qu'un humain peut le relire.
 */

/** Ce à quoi elle peut dire oui. Même liste que la contrainte en base. */
export type ObjetAccord = 'assistante' | 'cgu' | 'cgv' | 'age' | 'cycle';

/**
 * La version du texte de l'assistante.
 *
 * Datée plutôt que numérotée : en lisant une ligne de la table deux ans plus
 * tard, « 2026-11-06 » dit tout de suite de quand date le texte, là où « v3 »
 * oblige à aller chercher ailleurs.
 */
export const VERSION_ACCORD_ASSISTANTE = '2026-11-06';

/**
 * A. La ligne permanente, sous la case où elle écrit.
 *
 * La plus importante des trois, et c'est le Juriste qui le dit : elle est là
 * AU MOMENT où elle écrit, pas dans un document qu'elle n'ouvrira jamais.
 */
export const LIGNE_SOUS_LA_SAISIE =
  "Dambé est une machine, mais l'équipe de Mousso Dambé peut relire tes " +
  'questions et ses réponses, pour vérifier qu\'elle ne te dit pas de bêtises. ' +
  'Ton journal et ton cycle, personne ne les lit.';

/** La même, pour un écran étroit. Même sens, moins de mots. */
export const LIGNE_SOUS_LA_SAISIE_COURTE =
  "L'équipe peut relire tes questions à Dambé. Ton journal et ton cycle, non.";

/** B. Le paragraphe de l'écran d'accueil, quand elle n'a encore rien écrit. */
export const PARAGRAPHE_ACCUEIL =
  "Dambé te répond toute seule, c'est une machine. L'équipe de Mousso Dambé " +
  "peut relire ce que tu lui demandes et ce qu'elle t'a répondu, pour corriger " +
  "ses erreurs et te répondre quand elle n'a pas su. Ton journal, tes règles et " +
  'tes douleurs restent fermés : personne d\'autre que toi ne les voit. Tu peux ' +
  'effacer toute la discussion quand tu veux.';

/**
 * C. La demande d'accord, la première fois seulement.
 *
 * C'EST CE TEXTE-LÀ QUI PORTE LE CONSENTEMENT EXPRÈS DE L'ARTICLE 26, et c'est
 * donc celui dont l'empreinte est gardée en base. Les trois paragraphes sont
 * gardés séparés pour l'affichage, et recollés par `texteAccordAssistante()`
 * pour la preuve : ce qui est haché doit être ce qu'elle a lu, en entier.
 */
export const TITRE_ACCORD_ASSISTANTE = 'Avant ta première question';

export const PARAGRAPHES_ACCORD_ASSISTANTE = [
  "Dambé est une intelligence artificielle. Ce que tu écris part vers le service " +
    'qui la fait tourner, hors du Burkina Faso, et l\'équipe de Mousso Dambé peut ' +
    "le relire pour vérifier ses réponses et te répondre elle-même quand elle n'a pas su.",
  'Ton journal, tes règles et tes douleurs ne partent jamais vers elle et ne sont ' +
    "lus par personne d'autre que toi.",
  'Tu peux effacer toute la discussion quand tu veux, et revenir sur ton accord quand tu veux.',
] as const;

/**
 * Le bouton dit ce qu'il fait, et pas « J'accepte ».
 *
 * Le Juriste, sur ce choix : un accord donné dans ces termes, après un texte
 * qui nomme la machine, la sortie du pays et la relecture humaine, est
 * exactement ce que l'article 26 appelle un consentement exprès, c'est-à-dire
 * un oui donné en connaissance de cause.
 */
export const BOUTON_ACCORD_OUI = "J'ai compris, je peux écrire";
export const BOUTON_ACCORD_NON = 'Pas maintenant';

/**
 * Le texte intégral dont l'empreinte est gardée.
 *
 * Titre et paragraphes, assemblés toujours de la même façon. Changer cet
 * assemblage change toutes les empreintes futures sans changer un mot du
 * texte : si jamais il faut le faire, il faut changer la version avec.
 */
export function texteAccordAssistante(): string {
  return [TITRE_ACCORD_ASSISTANTE, ...PARAGRAPHES_ACCORD_ASSISTANTE].join('\n\n');
}
