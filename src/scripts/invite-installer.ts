/**
 * Proposer d'installer l'application, une seule fois, et seulement si c'est
 * vraiment possible.
 *
 * Arthur, le 27 octobre 2026. Voir src/components/InviteInstaller.astro pour
 * le bandeau et pour le raisonnement.
 *
 * TROIS SILENCES, et chacun évite une proposition absurde :
 *   - déjà installée (l'application tourne en plein écran) : rien à proposer ;
 *   - elle a répondu « Plus tard » : un refus vaut pour toujours, pas pour
 *     une page ;
 *   - le navigateur n'a pas dit que l'installation est possible : on ne
 *     montre pas un bouton qui ne mènerait nulle part.
 *
 * Le refus est gardé dans le téléphone, pas dans son compte. C'est le bon
 * endroit : installer concerne CE téléphone, et une femme qui dit non sur le
 * téléphone de la maison peut vouloir oui sur le sien. Un stockage qui échoue
 * (navigation privée, site bloqué) ne doit rien casser : chaque accès est
 * entouré d'un filet.
 */

/** Ce que Chrome envoie, et que les types du navigateur ne décrivent pas. */
interface DemandeInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const CLE = 'md-installer-non';

function dejaRefuse(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    // Pas de stockage : on préfère proposer que de se taire. Au pire elle
    // revoit le bandeau une fois.
    return false;
  }
}

function retenirLeRefus(): void {
  try {
    localStorage.setItem(CLE, '1');
  } catch {
    /* tant pis : le bandeau reviendra, il ne cassera rien */
  }
}

/** Tourne-t-elle déjà dans l'application installée ? */
function dejaInstallee(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari sur iPhone ne connaît pas `display-mode` et répond ici.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function montrer(famille: 'android' | 'ios', quandOui: (() => void) | null): void {
  const bandeau = document.getElementById('invite-installer');
  if (!bandeau) return;

  document.documentElement.dataset.installer = famille;
  bandeau.hidden = false;

  const ranger = () => {
    bandeau.hidden = true;
    delete document.documentElement.dataset.installer;
  };

  document.getElementById('invite-non')?.addEventListener('click', () => {
    retenirLeRefus();
    ranger();
  });

  document.getElementById('invite-oui')?.addEventListener('click', () => {
    ranger();
    quandOui?.();
  });
}

if (!dejaInstallee() && !dejaRefuse()) {
  // ANDROID ET CHROME. L'événement n'arrive que si le site est installable :
  // c'est notre seule preuve, et elle vaut mieux qu'une liste de navigateurs.
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Sans ça, Chrome affiche sa propre invitation en plus de la nôtre.
    evenement.preventDefault();
    const demande = evenement as DemandeInstallation;

    montrer('android', () => {
      demande.prompt().then(
        () => {
          // Accepté ou refusé, la question est posée : on ne la repose pas.
          retenirLeRefus();
        },
        () => {
          /* la demande a expiré : le bandeau reviendra à la prochaine visite */
        }
      );
    });
  });

  // IPHONE ET SAFARI. Aucun événement, aucune interface : il n'y a que le
  // geste à décrire. On attend un peu pour ne pas accueillir une femme par
  // une demande avant qu'elle ait vu l'application.
  const surIPhone = /iphone|ipad|ipod/i.test(navigator.userAgent)
    && /safari/i.test(navigator.userAgent)
    && !/crios|fxios|edgios/i.test(navigator.userAgent);

  if (surIPhone) {
    window.setTimeout(() => {
      if (!document.documentElement.dataset.installer) montrer('ios', null);
    }, 4000);
  }
}
