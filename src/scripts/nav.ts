/**
 * LA BARRE BASSE, CÔTÉ NAVIGATEUR.
 *
 * Le cercle est déjà au bon endroit quand la page arrive : c'est le serveur
 * qui l'a posé. Ce fichier n'ajoute que ce qui ne peut pas venir du serveur,
 * c'est-à-dire la réponse au doigt.
 *
 * Pourquoi cela compte ici plus qu'ailleurs : chaque onglet est une vraie
 * page, et sur une 3G de Ouagadougou elle peut mettre une seconde à arriver.
 * Sans ce petit geste, on touche et il ne se passe rien pendant une seconde,
 * alors on touche encore. Le cercle glisse donc TOUT DE SUITE vers l'onglet
 * touché, pendant que la page charge.
 *
 * Si ce fichier ne se charge jamais, la barre reste juste : elle ne bouge
 * simplement qu'à l'arrivée de la page suivante.
 */
const barre = document.querySelector<HTMLElement>('.nav-basse');
const cercle = barre?.querySelector<HTMLElement>('.nav-cercle');
const onglets = barre ? Array.from(barre.querySelectorAll<HTMLElement>('.nav-item')) : [];

const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (barre && cercle && onglets.length > 0) {
  onglets.forEach((onglet, place) => {
    onglet.addEventListener(
      'pointerdown',
      () => {
        // Déjà là : rien à faire, et surtout pas rejouer l'animation.
        if (barre.dataset.place === String(place)) return;

        // Le cercle part maintenant, la page suivra. `data-place` est un
        // attribut, pas un `style=` : la politique de sécurité du contenu
        // interdit le second.
        barre.dataset.place = String(place);

        if (!calme) {
          // On redémarre les animations en les retirant puis en forçant le
          // navigateur à recalculer : sans ce temps mort, il considère que
          // rien n'a changé et ne les rejoue pas.
          cercle.classList.remove('liquide');
          void cercle.offsetWidth;
          cercle.classList.add('liquide');

          const icone = onglet.querySelector<HTMLElement>('.nav-icone');
          if (icone) {
            icone.classList.remove('rebond');
            void icone.offsetWidth;
            icone.classList.add('rebond');
          }
        }

        // L'onglet touché prend l'air actif tout de suite : l'icône monte,
        // le libellé apparaît. La page qui arrive dira la même chose.
        onglets.forEach((autre) => autre.classList.remove('nav-item-actif'));
        onglet.classList.add('nav-item-actif');

        // Une vibration très courte, si le téléphone sait le faire et si elle
        // n'a pas demandé moins de mouvement.
        if (!calme && typeof navigator.vibrate === 'function') {
          try {
            navigator.vibrate(10);
          } catch {
            // Certains navigateurs refusent hors d'un geste jugé direct. Ce
            // n'est pas une panne : on ne vibre pas, c'est tout.
          }
        }
      },
      { passive: true },
    );
  });
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
