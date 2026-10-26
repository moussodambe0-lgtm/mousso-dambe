/**
 * Les quatre états d'une commande, vus par une cliente.
 *
 * Arthur, le 26 octobre 2026 : « chacune de ces étapes doit mener sur une page
 * précise distincte des autres, et si le colis est dans une étape, seule
 * l'étape affiche des infos. » C'est la même décision qu'il avait prise sur son
 * autre application : une vraie page par état, pas un filtre sur place. Une
 * page a une adresse, elle se partage, le bouton retour du téléphone marche, et
 * on sait toujours où on est.
 *
 * Module pur, sans import d'Astro : la page des états, celle du compte et les
 * vérifications lisent tous la même liste. Deux listes qui divergent, c'est un
 * compteur qui annonce une commande introuvable.
 *
 * LA CORRESPONDANCE N'EST PAS UN POUR UN, et c'est voulu. La base connaît cinq
 * états (nouvelle, preparee, envoyee, livree, annulee) ; une cliente n'a pas à
 * distinguer « reçue » de « préparée », les deux veulent dire « on s'en
 * occupe ». Le bandeau du compte regroupait déjà ces deux-là depuis le
 * 13 octobre : cette liste reprend exactement ses regroupements.
 */

export interface EtatCliente {
  /** Le morceau d'adresse : /commandes/en-preparation */
  cle: string;
  /** Ce qu'on lit dans l'onglet et dans le titre de la page. */
  mot: string;
  /** Les états de la base qui tombent dans cette page. */
  etats: string[];
  /** Ce que la page dit quand elle est vide : jamais « rien », toujours pourquoi. */
  vide: string;
}

export const ETATS_CLIENTE: EtatCliente[] = [
  {
    cle: 'en-preparation',
    mot: 'En préparation',
    etats: ['nouvelle', 'preparee'],
    vide: "Aucune commande en préparation en ce moment.",
  },
  {
    cle: 'en-livraison',
    mot: 'En livraison',
    etats: ['envoyee'],
    vide: "Aucun colis en route pour l'instant.",
  },
  {
    cle: 'livrees',
    mot: 'Livrées',
    etats: ['livree'],
    vide: "Tu n'as pas encore reçu de commande.",
  },
  {
    cle: 'annulees',
    mot: 'Annulées',
    etats: ['annulee'],
    vide: 'Aucune commande annulée. Tant mieux.',
  },
];

/** L'état demandé par l'adresse, ou null si l'adresse ne correspond à rien. */
export function etatParCle(cle: string | undefined): EtatCliente | null {
  if (!cle) return null;
  return ETATS_CLIENTE.find((e) => e.cle === cle) ?? null;
}

/** Dans quelle page se trouve une commande, d'après son état en base. */
export function pageDeLEtat(etatEnBase: string): EtatCliente | null {
  return ETATS_CLIENTE.find((e) => e.etats.includes(etatEnBase)) ?? null;
}
