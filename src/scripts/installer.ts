/**
 * Installe le service worker, qui rend l'application installable et
 * consultable hors connexion.
 *
 * C'est le seul JavaScript envoyé au navigateur dans toute l'application, et
 * il n'améliore que l'installation : chaque page fonctionne sans lui.
 */
if ('serviceWorker' in navigator) {
  // Après le chargement, pour ne pas disputer la bande passante à la page
  // elle-même sur une connexion lente.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Refusé en navigation privée, ou sur une origine non sûre. Ce n'est pas
      // une erreur : le site marche sans.
    });
  });
}
