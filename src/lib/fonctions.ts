/**
 * LES FONCTIONS DE L'APPLICATION, POUR LA RECHERCHE.
 *
 * Arthur, le 13 octobre 2026 : « une barre de recherche avec un micro [...] la
 * recherche va concerner les produits ou les fonctionnalités présentes dans
 * l'application ». Les produits viennent de la base ; les fonctionnalités, ce
 * sont les écrans de l'application, et ils sont listés ici avec les mots qu'on
 * emploie pour les chercher.
 *
 * Les mots-clés sont ceux d'une femme qui PARLE, pas ceux d'un menu : elle dit
 * « mes règles », « le docteur », « acheter », « ma photo », pas « Discussions ».
 * Les accents et les majuscules ne comptent pas.
 */

export interface Fonction {
  titre: string;
  sous: string;
  lien: string;
  icone: string;
  /** Les mots qu'on emploie pour la chercher, sans accents, en minuscules. */
  mots: string;
}

export const FONCTIONS: Fonction[] = [
  {
    titre: 'Suivre mon cycle',
    sous: 'Le tableau de bord de tes règles',
    lien: '/cycle',
    icone: 'cycle',
    mots: 'cycle regles menstruation suivre suivi tableau de bord anneau jour ovulation fertile prochaine retard',
  },
  {
    titre: 'Mon calendrier',
    sous: 'Tes dates de règles et de fertilité',
    lien: '/cycle/calendrier',
    icone: 'cycle',
    mots: 'calendrier date mois jour ovulation fertile fertilite regles prevision prochaine',
  },
  {
    titre: 'Noter ma journée',
    sous: 'Flux, douleurs, humeur',
    lien: '/journal',
    icone: 'crayon',
    mots: 'noter journal journee douleur mal ventre flux abondant humeur symptome ressenti carnet',
  },
  {
    titre: 'Parler à un médecin',
    sous: 'Écrire ou envoyer un vocal',
    lien: '/discussions/medecin',
    icone: 'coeur',
    mots: 'medecin docteur docteure sante conseil question douleur inquiete vocal audio message infirmiere sage femme',
  },
  {
    titre: 'IA Dambé',
    sous: 'Pose ta question à l’assistante',
    lien: '/dambe',
    icone: 'dambe',
    mots: 'dambe assistante ia intelligence artificielle question aide discuter conseil robot',
  },
  {
    titre: 'Écrire à la boutique',
    sous: 'Une taille, une livraison, un prix',
    lien: '/discussions/boutique',
    icone: 'bulles',
    mots: 'ecrire boutique vendeur vendeuse message livraison prix taille commande question vocal audio contacter',
  },
  {
    titre: 'Mes discussions',
    sous: 'IA Dambé, le médecin et la boutique',
    lien: '/discussions',
    icone: 'bulle',
    mots: 'discussion discussions message messages conversation messagerie ecrire lire',
  },
  {
    titre: 'La boutique',
    sous: 'Serviettes lavables, culottes menstruelles',
    lien: '/boutique',
    icone: 'boutique',
    mots: 'boutique acheter achat produit produits serviette serviettes culotte culottes lavable lavables protection protections commander magasin',
  },
  {
    titre: 'Mon panier',
    sous: 'Ce que tu as choisi',
    lien: '/panier',
    icone: 'panier',
    mots: 'panier achats commande commander payer paiement',
  },
  {
    titre: 'Mes commandes',
    sous: 'Suivre une livraison',
    lien: '/commandes',
    icone: 'colis',
    mots: 'commande commandes livraison livre colis suivre suivi recu',
  },
  {
    titre: 'Mon compte',
    sous: 'Ma photo, mes réglages, mes durées',
    lien: '/compte',
    icone: 'compte',
    mots: 'compte profil photo avatar reglages parametres duree cycle email mot de passe deconnexion notification rappel',
  },
  {
    titre: 'Ce que l’application sait de moi',
    sous: 'Mes données, et les effacer',
    lien: '/confidentialite',
    icone: 'bouclier',
    mots: 'confidentialite donnees vie privee effacer supprimer secret prive securite',
  },
];

/** Sans accents, sans majuscules, sans ponctuation : de quoi comparer. */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Les petits mots qui ne cherchent rien : « je veux acheter des serviettes »
// doit chercher « acheter » et « serviettes », pas « je », « veux » et « des ».
const VIDES = new Set(
  (
    'a au aux ai as avec ce ces cet cette comment dans de des du elle en est et il je j la le les leur ' +
    'ma mes mon moi me mais ne ou par pas pour pourquoi que qu quel quelle quoi qui sa se ses si son sur ta te ' +
    'tes ton toi tu un une veux voudrais voudrai cherche chercher trouve trouver voir faire peux peut puis ' +
    'ou ya y il ici la'
  ).split(' ')
);

/** Les mots utiles d'une recherche : au moins deux lettres, et pas des mots vides. */
export function motsUtiles(recherche: string): string[] {
  return normaliser(recherche)
    .split(' ')
    .filter((m) => m.length >= 2 && !VIDES.has(m));
}

/** Un mot de la recherche « correspond » s'il commence un mot du texte. */
function correspond(mot: string, texte: string): boolean {
  return texte.split(' ').some((t) => t.startsWith(mot) || (mot.length >= 4 && t.includes(mot)));
}

/**
 * Les fonctions qui répondent à la recherche, de la plus pertinente à la
 * moins pertinente. Le titre pèse plus que les mots-clés.
 */
export function chercherFonctions(recherche: string): Fonction[] {
  const mots = motsUtiles(recherche);
  if (mots.length === 0) return [];

  return FONCTIONS.map((f) => {
    const titre = normaliser(f.titre);
    let score = 0;
    for (const m of mots) {
      if (correspond(m, titre)) score += 3;
      else if (correspond(m, f.mots)) score += 1;
    }
    return { f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}
