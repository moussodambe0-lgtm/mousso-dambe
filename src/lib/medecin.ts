/**
 * Le fil du médecin est-il ouvert ?
 *
 * Arthur, le 26 octobre 2026 : « côté message, pour le médecin on va mettre
 * bientôt disponible. Après on va créer un lien qui donnera accès à cette page
 * pour que le médecin réponde aux questions. »
 *
 * Tant que personne ne répond de l'autre côté, laisser une femme écrire est
 * pire que ne rien proposer : elle attendrait une réponse qui ne viendrait
 * jamais, sur une question qu'elle n'ose peut-être poser à personne d'autre.
 * La carte reste donc visible, pour annoncer ce qui arrive, mais elle ne
 * s'ouvre pas.
 *
 * POUR OUVRIR LE FIL, LE JOUR OÙ UN MÉDECIN RÉPOND : passer cette valeur à
 * `true`, et appliquer la migration qui rouvre `ecrire_au_medecin` en base
 * (voir 20261026130000_medecin_bientot.sql, qui explique comment). Les deux
 * sont nécessaires : la page cesse de dire « bientôt », et la base cesse de
 * refuser. Fermer aux deux endroits est volontaire, pour qu'un oubli d'un côté
 * ne laisse pas un message partir dans le vide.
 *
 * L'orientation d'urgence, elle, ne dépend pas de ce réglage : les mots qui
 * disent un danger déclenchent toujours le message vers un centre de santé,
 * tout de suite, sans attendre une réponse humaine. C'était la décision
 * d'Arthur du 12 octobre et elle ne change pas.
 */
export const MEDECIN_DISPONIBLE = false;

/** Ce que la carte annonce tant que le fil n'est pas ouvert. */
export const MEDECIN_BIENTOT = 'Bientôt disponible';
