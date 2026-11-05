/**
 * Codes d'erreur levés par les fonctions SQL, traduits pour l'acheteur.
 *
 * La base lève des codes courts (`stock_insuffisant:Pack Ciné`), jamais des
 * phrases : le texte affiché vit ici, en un seul endroit.
 */

const MESSAGES: Record<string, string> = {
  panier_vide: 'Votre panier est vide.',
  panier_trop_grand: 'Trop d’articles différents dans le panier. Passez deux commandes.',
  paiement_mobile_indisponible: 'Le paiement mobile n’est pas disponible pour le moment. Choisissez le paiement à la livraison.',
  paiement_mobile_obligatoire: 'Le paiement se fait par Orange Money ou Moov Money.',
  moyen_paiement_invalide: 'Moyen de paiement invalide.',
  montant_paiement_mobile_trop_eleve: 'Montant trop élevé pour un paiement mobile (2 000 000 FCFA maximum). Passez plusieurs commandes.',
  deja_paye: 'Cette commande est déjà payée.',
  rien_a_payer: 'Plus rien à payer sur cette commande.',
  paiement_indisponible: 'La page de paiement ne répond pas. Réessayez dans un instant : votre commande est gardée.',
  paiement_introuvable: 'Paiement introuvable.',
  facture_invalide: 'Paiement impossible. Réessayez dans un instant.',
  paiement_livraison_indisponible: 'Le paiement à la livraison n’est pas proposé pour le moment.',
  paiement_en_cours: 'Un paiement est en cours de vérification. Patientez une minute.',
  ligdicash_non_configure: 'Ligdicash n’est pas configuré : clés dans Vault et adresse du site en https.',
  mode_paiement_invalide: 'Mode de paiement invalide.',
  commande_non_reversable: 'Une des commandes n’est pas reversable (déjà versée, non livrée ou délai de retour en cours).',
  moyen_versement_invalide: 'Choisissez un moyen de versement.',
  aucune_commande: 'Aucune commande sélectionnée.',
  montant_nul: 'Montant nul : rien à verser.',
  coordonnees_incompletes: 'Indiquez votre nom et un numéro de téléphone valide.',
  quartier_requis: 'Indiquez votre quartier pour que le livreur vous trouve.',
  produits_introuvables: 'Les produits de votre panier ne sont plus disponibles.',
  produit_indisponible: 'Un produit n’est plus disponible',
  boutique_non_verifiee: 'Cette boutique n’est pas vérifiée pour le moment.',
  stock_insuffisant: 'Stock insuffisant pour',
  variante_introuvable: 'Cette option n’existe plus pour',
  aucune_commande_creee: 'Aucune commande n’a pu être créée. Vérifiez votre panier.',
  cle_invalide: 'La page a expiré. Rechargez-la puis réessayez.',
  commande_introuvable: 'Commande introuvable.',

  // Assistant Jia
  assistant_inactif: 'L’assistant n’est pas encore disponible. Écrivez directement à la boutique.',
  assistant_indisponible: 'L’assistant ne répond pas en ce moment. Réessayez dans un instant.',
  assistant_surcharge: 'L’assistant reçoit beaucoup de questions. Réessayez dans une minute.',
  assistant_quota_atteint:
    'Vous avez posé toutes vos questions du jour. Revenez demain, ou écrivez directement à la boutique.',
  assistant_refus: 'Je préfère ne pas répondre à cette question. Posez-m’en une autre sur Jia.',
  assistant_vide: 'L’assistant n’a rien répondu. Reformulez votre question.',
  assistant_conversation_invalide: 'Conversation illisible. Rechargez la page.',

  transition_non_autorisee: 'Cette action n’est plus possible pour cette commande.',
  statut_inchange: 'La commande est déjà dans cet état.',
  motif_requis: 'Expliquez le problème en quelques mots.',
  action_inconnue: 'Action inconnue.',
  note_invalide: 'Choisissez une note de 1 à 5 étoiles.',
  commande_non_livree: 'Vous pourrez donner votre avis après la livraison.',
  avis_deja_publie: 'Vous avez déjà donné votre avis sur cet article.',
  pas_votre_commande: 'Cette commande ne vous appartient pas.',
  reserve_aux_vendeurs: 'Réservé aux vendeurs.',
  photo_invalide: 'Photo invalide.',
  authentification_requise: 'Connectez-vous pour continuer.',
  nom_invalide: 'Le nom de la boutique doit faire entre 2 et 60 caractères.',
  slug_invalide: 'Adresse de boutique invalide.',
  whatsapp_invalide: 'Numéro WhatsApp invalide.',
  boutique_deja_existante: 'Vous avez déjà une boutique.',
  slug_deja_pris: 'Ce nom de boutique est déjà pris. Essayez une variante.',
  reserve_a_l_administration: 'Réservé à l’administration.',
  aucun_litige_ouvert: 'Aucun litige ouvert sur cette commande.',
  boutique_introuvable: 'Boutique introuvable.',
  chemin_media_invalide: 'Photo invalide.',
  lien_livreur_invalide: 'Ce lien de livraison a expiré. Demandez un nouveau lien à la boutique.',
  position_invalide: 'Position GPS invalide. Activez la localisation et réessayez à l’extérieur.',
  trop_de_points: 'Nombre maximum de points de passage atteint pour cette livraison.',
  trop_de_commandes: 'Trop de commandes avec ce numéro en une heure. Réessayez plus tard ou écrivez à la boutique.',
  trop_de_messages: 'Vous envoyez beaucoup de messages. Patientez quelques minutes.',
  message_vide: 'Écrivez un message avant d’envoyer.',
  message_trop_long: 'Message trop long : 2 000 caractères maximum.',
  conversation_introuvable: 'Conversation introuvable.',
  votre_propre_boutique: 'Vous ne pouvez pas écrire à votre propre boutique.',
  trop_d_adresses: 'Dix adresses maximum. Supprimez-en une.',
  trop_de_tentatives: 'Trop de tentatives depuis votre connexion internet. Patientez quelques minutes puis réessayez.',
  acces_refuse: 'Service momentanément indisponible. Réessayez dans un instant.',
  remboursement_en_attente:
    'Publication suspendue : un remboursement décidé par Jia est en attente. Remboursez l’acheteur, puis prévenez-nous dans la conversation pour lever le blocage.',
  avis_refuse_boutique: 'Une boutique ne peut pas noter ses propres produits.',
  ligne_introuvable: 'Article introuvable dans cette commande.',
  produit_supprime: 'Ce produit a été retiré du catalogue : il ne peut plus être noté.',
  boutique_verifiee_verrouillee: 'Le nom et le numéro WhatsApp d’une boutique vérifiée se changent avec l’équipe Jia, pour protéger votre badge.',
  chemin_piece_invalide: 'Fichier invalide. Réessayez.',
};

/** Message lisible à partir d'une erreur Supabase ou d'un code brut. */
export function messageErreur(erreur: unknown): string {
  const brut =
    typeof erreur === 'string'
      ? erreur
      : erreur && typeof erreur === 'object' && 'message' in erreur
        ? String((erreur as { message: unknown }).message)
        : '';

  const [code, ...detail] = brut.split(':');
  const cle = (code ?? '').trim();
  const message = MESSAGES[cle];
  if (!message) {
    if (brut) console.error('Erreur non traduite :', brut);
    return 'Une erreur est survenue. Réessayez dans un instant.';
  }
  const precision = detail.join(':').trim();
  return precision && !precision.includes(' vers ') ? `${message} « ${precision} ».` : message;
}

/** Code seul, pour le passer en paramètre d'URL après une redirection. */
export function codeErreur(erreur: unknown): string {
  const brut = erreur && typeof erreur === 'object' && 'message' in erreur ? String((erreur as { message: unknown }).message) : String(erreur ?? '');
  const code = brut.split(':')[0]?.trim() ?? '';
  return MESSAGES[code] ? code : 'inconnue';
}

export function messageDepuisCode(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? 'Une erreur est survenue. Réessayez dans un instant.';
}
