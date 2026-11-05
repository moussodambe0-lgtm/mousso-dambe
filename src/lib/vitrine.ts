/**
 * Ce qui manque à la boutique pour être présentable.
 *
 * Copié de `lib/vitrine.ts` de Jia, écrit là-bas après une demande d'Arthur du
 * 23 septembre 2026 : « le vendeur doit voir en rouge que sa boutique n'est
 * pas complète ». Une boutique sans logo et sans description ne vend pas :
 * l'acheteuse ne sait pas à qui elle parle. Mais rien ne le dit au vendeur,
 * qui croit avoir fini.
 *
 * Ce fichier ne décide rien : il dresse la liste de ce qui manque, et chaque
 * écran choisit comment la montrer (pastille sur l'onglet « Ma boutique »,
 * bandeau rouge en haut des pages, liste à cocher dans la page elle-même).
 *
 * CE QUI N'EST PAS DANS LA LISTE, et pourquoi. Le RCCM et l'IFU : facultatifs
 * pour un petit commerce de Ouagadougou, et les réclamer en rouge découragerait
 * précisément celles qui débutent. La position sur la carte, présente chez
 * Jia : Mousso Dambé livre, on ne vient jamais retirer sur place.
 */

export interface Vitrine {
  nom?: string;
  accroche?: string;
  description?: string;
  logo?: string;
  whatsapp?: string;
  quartier?: string;
  raison_sociale?: string;
  rccm?: string;
  ifu?: string;
}

export interface PointManquant {
  /** Repère stable, utilisé pour l'ancre dans la page « Ma boutique ». */
  cle: string;
  /** Ce qui manque, dit simplement. */
  libelle: string;
  /** Pourquoi cela coûte des ventes. */
  pourquoi: string;
}

/**
 * Renvoie ce qui manque, dans l'ordre où cela coûte des ventes.
 *
 * Une vitrine complète renvoie un tableau vide : aucun écran n'affiche alors
 * de rouge, et c'est le but.
 */
export function manquantsVitrine(v: Vitrine | null | undefined): PointManquant[] {
  const b = v ?? {};
  const manque: PointManquant[] = [];

  if (!(b.logo ?? '').trim()) {
    manque.push({
      cle: 'logo',
      libelle: 'Aucun logo',
      pourquoi: 'La boutique apparaît avec une image vide dans les messages et au partage.',
    });
  }

  if (!(b.accroche ?? '').trim()) {
    manque.push({
      cle: 'accroche',
      libelle: 'Aucune accroche',
      pourquoi: 'La phrase qui s’affiche sous le nom et dit en un coup d’œil ce qu’on vend.',
    });
  }

  // Quarante caractères : en dessous, ce n'est pas une présentation, c'est un
  // titre. Le même seuil que chez Jia.
  if ((b.description ?? '').trim().length < 40) {
    manque.push({
      cle: 'description',
      libelle: 'Présentation trop courte',
      pourquoi: 'Quelques lignes sur la boutique rassurent une cliente qui hésite à commander.',
    });
  }

  if (!(b.whatsapp ?? '').trim()) {
    manque.push({
      cle: 'whatsapp',
      libelle: 'Aucun numéro WhatsApp',
      pourquoi: 'Celle qui a une question avant de commander n’a aucun moyen de la poser.',
    });
  }

  if (!(b.quartier ?? '').trim()) {
    manque.push({
      cle: 'quartier',
      libelle: 'Quartier non renseigné',
      pourquoi: 'Il dit d’où partent les livraisons, et combien de temps elles prennent.',
    });
  }

  return manque;
}
