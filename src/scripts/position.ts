/**
 * « Partager ma position », au lieu de donner son quartier à la main.
 *
 * Demande d'Arthur du 13 octobre 2026 : sur l'adresse de livraison, un bouton
 * qui demande sa position au téléphone (le navigateur affiche sa propre
 * question, « autoriser la position ? » : rien ne la lui demande à sa place),
 * et remplit deux champs cachés (latitude, longitude) à la place du quartier.
 *
 * Ce script sert plusieurs formulaires (l'adresse depuis le compte, et celle
 * d'une commande) : il cherche `[data-position]` sur la page, et à
 * l'intérieur ses morceaux par leur classe.
 *
 * Rien n'est enregistré avant qu'elle envoie le formulaire : la position
 * reste dans deux champs cachés, comme le reste de la saisie.
 */
const bloc = document.querySelector<HTMLElement>('[data-position]');

if (bloc) {
  const bouton = bloc.querySelector<HTMLButtonElement>('.position-bouton');
  const dit = bloc.querySelector<HTMLElement>('.position-dit');
  const lat = bloc.querySelector<HTMLInputElement>('.position-lat');
  const lng = bloc.querySelector<HTMLInputElement>('.position-lng');
  const quartierBloc = document.querySelector<HTMLElement>('.position-quartier');
  const champQuartier = quartierBloc?.querySelector<HTMLInputElement>('input');

  if (bouton && dit && lat && lng && navigator.geolocation) {
    bouton.hidden = false;

    bouton.addEventListener('click', () => {
      bouton.disabled = true;
      dit.hidden = false;
      dit.textContent = 'On te demande ta position…';

      navigator.geolocation.getCurrentPosition(
        (position) => {
          lat.value = String(position.coords.latitude);
          lng.value = String(position.coords.longitude);
          bouton.disabled = false;
          bouton.textContent = 'Position partagée';
          bouton.classList.add('position-ok');
          dit.textContent = 'Ta position est partagée. Le quartier n’est plus obligatoire.';

          // Le quartier n'est plus exigé : elle peut le laisser vide.
          if (champQuartier) champQuartier.required = false;
          quartierBloc?.classList.add('position-quartier-facultatif');
        },
        (erreur) => {
          bouton.disabled = false;
          dit.textContent =
            erreur.code === erreur.PERMISSION_DENIED
              ? 'La position est refusée. Donne ton quartier à la place.'
              : "La position n'a pas pu être trouvée. Donne ton quartier à la place.";
        },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
  }
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
