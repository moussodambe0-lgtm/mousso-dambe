/**
 * Installe le service worker, qui rend l'application installable et
 * consultable hors connexion. Il n'améliore que l'installation : chaque page
 * fonctionne sans lui.
 *
 * EN DÉVELOPPEMENT, ON NE L'INSTALLE PAS, ET ON RETIRE CELUI QUI TRAÎNE.
 *
 * Pourquoi, et ça a coûté une soirée à Arthur le 12 octobre 2026 : en
 * développement, les feuilles de style gardent la même adresse d'une version à
 * l'autre. Le service worker servait donc l'ancienne feuille, indéfiniment.
 * Arthur voyait une barre de navigation de trois versions en arrière et me
 * disait, à juste titre, que je n'avais pas appliqué son code.
 *
 * Rien ne pouvait le dire : ni les types, ni les tests, ni même mes captures
 * d'écran, qui partent d'un profil de navigateur neuf à chaque fois et
 * voyaient donc toujours la bonne version.
 *
 * En production, le problème n'existe pas : chaque fichier construit porte une
 * empreinte dans son nom, donc une nouvelle version a une nouvelle adresse.
 * Mais en développement, un service worker ne rend aucun service et cache les
 * changements. On le désinstalle.
 */
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // On retire celui qu'une version précédente a pu installer, et on vide ce
    // qu'il gardait. Sans ça, le défaut survivrait à sa propre correction.
    navigator.serviceWorker
      .getRegistrations()
      .then((liste) => Promise.all(liste.map((r) => r.unregister())))
      .catch(() => {
        /* rien à faire : le site marche sans */
      });

    if ('caches' in window) {
      caches
        .keys()
        .then((noms) => Promise.all(noms.map((n) => caches.delete(n))))
        .catch(() => {
          /* idem */
        });
    }
  } else {
    // Après le chargement, pour ne pas disputer la bande passante à la page
    // elle-même sur une connexion lente.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Refusé en navigation privée, ou sur une origine non sûre. Ce n'est
        // pas une erreur : le site marche sans.
      });
    });
  }
}
