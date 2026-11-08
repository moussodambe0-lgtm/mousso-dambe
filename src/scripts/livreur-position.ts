/**
 * « Je partage ma position », sur l'écran du livreur.
 *
 * C'EST LE CHAÎNON QUI MANQUAIT. Jusqu'au 8 novembre 2026, tout allait dans un
 * seul sens : la cliente donnait sa position, le livreur la recevait. L'inverse
 * n'existait nulle part. La carte de suivi (Arthur : « AVEC UNE VRAI MAPS »)
 * n'aurait donc montré qu'un point fixe, en promettant un suivi qui n'existe
 * pas. C'est ce bouton qui la rend honnête.
 *
 * UN APPUI, UNE POSITION. Pas de relevé continu, et c'est un choix, pas un
 * raccourci :
 *   - un relevé continu vide la batterie et le forfait d'un livreur qui roule
 *     toute la journée, et c'est lui qui paie les deux ;
 *   - surtout, il transformerait l'écran en traceur. Ici, il appuie quand il
 *     veut, il voit ce qu'il envoie, et il peut livrer sans jamais appuyer.
 *
 * Le même formulaire ressert autant de fois qu'il le veut : il appuie en
 * partant, puis en arrivant dans le quartier, et la cliente voit son point
 * avancer avec l'heure de chaque envoi.
 *
 * SANS JAVASCRIPT, le bloc reste caché : aucun navigateur ne sait donner une
 * position sans lui, et un bouton qui ne peut rien faire vaut moins que pas de
 * bouton. C'est le script qui le démasque.
 */
const bloc = document.querySelector<HTMLElement>('[data-livreur-position]');

if (bloc) {
  const bouton = bloc.querySelector<HTMLButtonElement>('.lp-bouton');
  const dit = bloc.querySelector<HTMLElement>('.lp-dit');
  const lat = bloc.querySelector<HTMLInputElement>('.lp-lat');
  const lng = bloc.querySelector<HTMLInputElement>('.lp-lng');
  const formulaire = bloc.closest('form');

  if (bouton && dit && lat && lng && formulaire) {
    // Démasqué dès que le script tourne, même si le navigateur refusera la
    // position : un bouton qui explique vaut mieux qu'une option invisible.
    // C'est la leçon du 13 octobre 2026, où `navigator.geolocation` n'existait
    // pas sur une adresse en http et où rien ne disait pourquoi.
    bloc.hidden = false;

    bouton.addEventListener('click', (evenement) => {
      evenement.preventDefault();

      if (!navigator.geolocation) {
        dit.hidden = false;
        dit.textContent =
          "Ce téléphone ne permet pas de partager la position ici. Appelle-la pour te faire guider.";
        return;
      }

      bouton.disabled = true;
      dit.hidden = false;
      dit.textContent = 'On cherche où tu es…';

      navigator.geolocation.getCurrentPosition(
        (position) => {
          lat.value = String(position.coords.latitude);
          lng.value = String(position.coords.longitude);
          dit.textContent = 'Envoi…';
          // On envoie tout de suite : le livreur est dehors, souvent d'une
          // main, à moto arrêtée. Lui demander un deuxième appui pour
          // confirmer, c'est lui demander de s'arrêter deux fois.
          formulaire.submit();
        },
        (erreur) => {
          bouton.disabled = false;
          dit.textContent =
            erreur.code === erreur.PERMISSION_DENIED
              ? "La position est refusée par le téléphone. Tu peux livrer sans : elle a ton numéro."
              : "La position n'a pas pu être trouvée. Réessaie dehors, ou appelle-la.";
        },
        // Plus patient que côté cliente : un livreur est dehors, en mouvement,
        // et le premier point précis met parfois dix secondes à arriver.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  }
}

export {};
