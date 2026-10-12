/**
 * LE PETIT RETOUR AU TOUCHER.
 *
 * Section 11 du cahier d'Arthur : une vibration très courte quand elle touche
 * quelque chose qui compte. Dix millisecondes, c'est le seuil où l'on sent que
 * le téléphone a reçu le geste sans que ça ressemble à une notification.
 *
 * Trois précautions, et leurs raisons :
 *   - seulement sur ce qui agit (barre basse, boutons principaux, cartes du
 *     questionnaire) : faire vibrer tout ce qu'on touche fatigue la main et
 *     use la batterie ;
 *   - rien si elle a demandé moins de mouvement : une vibration EST du
 *     mouvement, et certaines personnes la coupent pour de bonnes raisons ;
 *   - rien si le navigateur ne connaît pas `vibrate` (c'est le cas de tous
 *     les iPhone) : l'application marche pareil, elle ne vibre simplement pas.
 */
const peutVibrer = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (peutVibrer && !calme) {
  const CIBLES = '.nav-item, .btn-rose, .carte-choix, .carte-carree, .carte-coche, .commencer, .goutte-choix, .carte-courte, .puce';

  document.addEventListener(
    'pointerdown',
    (e) => {
      const cible = e.target as Element | null;
      if (cible?.closest?.(CIBLES)) {
        try {
          navigator.vibrate(10);
        } catch {
          // Certains navigateurs refusent la vibration hors d'un geste jugé
          // direct. Ce n'est pas une panne : on ne vibre pas, c'est tout.
        }
      }
    },
    { passive: true },
  );
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la meme constante se heurtent.
export {};
