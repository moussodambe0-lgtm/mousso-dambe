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
  // Les deux champs cachés sont cherchés dans TOUTE la page, pas dans le
  // bloc : ils vivent en haut du formulaire, au-dessus du bloc, parce qu'un
  // champ caché se met au début d'un formulaire. Les chercher dans le bloc
  // les rendait introuvables, et le bouton restait caché pour tout le monde.
  // C'est le défaut qu'Arthur a signalé le 13 octobre 2026 (« au niveau de
  // mes adresses ajoute une option pour partager sa position » : l'option
  // était bien écrite, mais invisible).
  const lat = document.querySelector<HTMLInputElement>('.position-lat');
  const lng = document.querySelector<HTMLInputElement>('.position-lng');
  const quartierBloc = document.querySelector<HTMLElement>('.position-quartier');
  const champQuartier = quartierBloc?.querySelector<HTMLInputElement>('input');
  // Le mot du bouton vit dans son propre `span` : écrire dans le bouton
  // entier effacerait l'icône de lieu qu'il contient.
  const mot = bloc.querySelector<HTMLElement>('.position-mot');

  if (bouton && dit && lat && lng) {
    // Le bouton est démasqué DÈS QUE ce script tourne, même si le navigateur
    // ne sait pas donner la position. C'est un défaut constaté le 13 octobre
    // 2026 : Arthur ne voyait aucune option de position sur son téléphone,
    // parce que `navigator.geolocation` n'existe QUE sur une adresse en https
    // ou en localhost. En réseau local (http://192.168.x.x), le bouton
    // restait caché, et rien ne disait pourquoi. Un bouton qui explique vaut
    // mieux qu'une option invisible.
    bouton.hidden = false;

    bouton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        dit.hidden = false;
        dit.textContent =
          "Ton navigateur ne permet pas de partager ta position ici (il la refuse hors d'une adresse sécurisée). Donne ton quartier à la place.";
        return;
      }

      bouton.disabled = true;
      dit.hidden = false;
      dit.textContent = 'On te demande ta position…';

      navigator.geolocation.getCurrentPosition(
        (position) => {
          lat.value = String(position.coords.latitude);
          lng.value = String(position.coords.longitude);
          bouton.disabled = false;
          if (mot) mot.textContent = 'Position partagée';
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

// Un témoin « le script est passé », pour les essais : sans lui, un essai qui
// regarde la page avant que Vite ait fini de compiler voit le bouton encore
// caché et croit à une panne. Constaté le 13 octobre 2026, sur un serveur qui
// venait de redémarrer.
document.documentElement.dataset.position = 'pret';

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
