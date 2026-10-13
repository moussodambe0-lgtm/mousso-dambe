/**
 * LE CŒUR DES FAVORIS.
 *
 * Elle touche le cœur : il devient rouge tout de suite, avant même que le
 * serveur ait répondu. Sur une 3G, attendre la réponse pour changer de couleur
 * donne l'impression que le bouton n'a rien fait, et elle retouche deux fois,
 * ce qui annule son geste.
 *
 * Si le serveur dit non (réseau coupé, session expirée), on remet le cœur
 * comme il était et on le dit. Si elle n'a pas de session, on l'envoie se
 * connecter : un favori sans compte n'a nulle part où vivre.
 *
 * Sans ce script, le bouton ne fait rien : il ne ment pas, il est inerte.
 */
const boutons = document.querySelectorAll<HTMLButtonElement>('.favori[data-slug]');

boutons.forEach((bouton) => {
  let enCours = false;

  bouton.addEventListener('click', async () => {
    // Un deuxième toucher pendant que le premier part annulerait le geste.
    if (enCours) return;
    enCours = true;

    delete bouton.dataset.enregistre;
    const avant = bouton.getAttribute('aria-pressed') === 'true';
    const maintenant = !avant;
    pose(bouton, maintenant);

    try {
      const rep = await fetch('/favoris', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: bouton.dataset.slug }),
      });

      if (rep.status === 401) {
        pose(bouton, avant);
        window.location.assign('/connexion');
        return;
      }

      const lu = await rep.json().catch(() => ({}));
      if (rep.ok && lu.ok) {
        // La base a le dernier mot : si elle dit autre chose, on la croit.
        pose(bouton, !!lu.favori);
        // Témoin « la base l'a enregistré » : l'essai attend celui-ci, pas le
        // changement de couleur, qui part avant la réponse.
        bouton.dataset.enregistre = 'oui';
      } else {
        pose(bouton, avant);
      }
    } catch {
      pose(bouton, avant);
    } finally {
      enCours = false;
    }
  });
});

function pose(bouton: HTMLButtonElement, actif: boolean) {
  bouton.setAttribute('aria-pressed', String(actif));
  bouton.setAttribute('aria-label', actif ? 'Retirer des favoris' : 'Mettre en favori');
  bouton.classList.toggle('favori-actif', actif);
}

// Témoin « le script est en place », pour l'essai : un toucher qui part avant
// lui ne fait rien (le bouton est inerte), donc l'essai attend ce témoin.
document.documentElement.dataset.favori = 'pret';

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
