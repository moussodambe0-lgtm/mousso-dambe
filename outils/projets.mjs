/**
 * Les seules bases que les outils de ce dépôt ont le droit de toucher.
 *
 * Arthur, le 26 octobre 2026 : « j'espère que si je te dis de faire une modif
 * sur Mousso Dambé tu ne risques pas de te tromper de clé et aller faire la
 * modif sur un autre projet ».
 *
 * La crainte est juste, et le risque s'est matérialisé deux fois le même jour :
 * un motif de recherche a reconnu la ligne `JIA_TEST_ANON_KEY` d'un autre
 * projet parce que son nom contenait « TEST_ANON », et une clé de Mousso Dambé
 * a été collée par-dessus la valeur de cette ligne. La cause est structurelle :
 * un seul coffre pour plusieurs projets, et des outils qui cherchent par le nom
 * des lignes. Un nom mal écrit, et l'outil se trompe de base sans rien dire.
 *
 * D'où cette liste, écrite dans le dépôt et non dans le coffre. Avant toute
 * écriture, un outil vérifie que la base visée est bien l'une des deux. Si le
 * coffre est modifié, si une ligne est renommée, si un motif attrape la
 * mauvaise valeur, l'outil s'arrête au lieu d'écrire ailleurs.
 *
 * Ces identifiants ne sont pas des secrets : ils apparaissent en clair dans
 * l'adresse de l'API du site, et dans les variables publiques de Vercel. Les
 * écrire ici ne divulgue rien, et les y voir est précisément ce qui protège.
 */

export const BASES = {
  production: {
    ref: 'vnbaojckbhcjczdnjdjh',
    nom: 'Mousso Dambé, PRODUCTION',
    danger: "des données d'utilisatrices, qui ne se reconstituent pas",
  },
  essai: {
    ref: 'hjofdpyibnqtvycuvysb',
    nom: "Mousso Dambé, base d'essai",
    danger: 'rien, on peut tout y casser',
  },
};

/**
 * Cette base est-elle l'une des nôtres, et laquelle ?
 *
 * Rend la base attendue, ou lève. On lève au lieu de rendre `null` : un
 * appelant qui oublie de vérifier le résultat ne doit pas pouvoir écrire quand
 * même.
 */
export function baseAttendue(ref, attendu) {
  const propre = String(ref ?? '').trim().toLowerCase();
  const connue = Object.entries(BASES).find(([, b]) => b.ref === propre);

  if (!connue) {
    throw new Error(
      `REFUS : la base « ${propre} » n'est pas une base de Mousso Dambé.\n` +
        `Les seules autorisées sont ${BASES.production.ref} (production) et ` +
        `${BASES.essai.ref} (essai).\n` +
        `Vérifier la ligne du coffre : elle désigne peut-être un autre projet.`
    );
  }

  const [quelle, base] = connue;
  if (attendu && quelle !== attendu) {
    throw new Error(
      `REFUS : la base « ${propre} » est ${base.nom}, alors que l'outil ` +
        `visait ${BASES[attendu].nom}.\n` +
        `Rien n'a été écrit.`
    );
  }

  return { quelle, ...base };
}
