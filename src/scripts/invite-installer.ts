/**
 * Proposer d'installer l'application, et la reproposer le jour où elle la
 * désinstalle.
 *
 * Arthur, le 27 octobre 2026 : « je veux qu'on puisse installer l'application
 * directement dans son téléphone ». Puis le 7 novembre 2026 : « dès que
 * quelqu'un rentre sur le site, on lui propose de télécharger. Mais si la
 * personne a l'application dans son téléphone, cette proposition n'a pas lieu.
 * Si la personne supprime l'application, on lui repropose encore. »
 *
 * CE QUE LA PREMIÈRE VERSION FAISAIT, ET QUI EMPÊCHAIT EXACTEMENT CELA. Elle
 * gardait un simple « non » définitif dans le téléphone, et elle l'écrivait
 * AUSSI quand la femme acceptait : « accepté ou refusé, la question est posée,
 * on ne la repose pas ». Une femme qui installait puis désinstallait ne
 * revoyait donc jamais la proposition, pour toujours. C'était le contraire du
 * comportement demandé.
 *
 * CE QUI REND LA CHOSE POSSIBLE, et c'est le navigateur qui fait le travail :
 * `beforeinstallprompt` N'ARRIVE PAS quand l'application est installée. Donc
 * si on l'avait notée installée et que l'événement revient, c'est qu'elle ne
 * l'est plus. La désinstallation n'a pas d'événement à elle, mais on n'en a
 * pas besoin : le retour de celui-ci la prouve.
 *
 * TROIS ÉTATS GARDÉS DANS LE TÉLÉPHONE, et pas dans son compte. Installer
 * concerne CE téléphone : une femme qui dit non sur le téléphone de la maison
 * peut vouloir oui sur le sien. Un stockage qui échoue (navigation privée,
 * site bloqué) ne doit rien casser, chaque accès est entouré d'un filet.
 *
 *   rien       jamais proposé, ou elle a vidé son navigateur : on propose.
 *   refuse     elle a dit « plus tard ». On se tait DÉLAI_REFUS_JOURS, pas
 *              pour toujours : un non d'octobre n'engage pas décembre, et
 *              une femme qui a pris l'habitude de l'application n'a pas la
 *              même réponse qu'une femme qui la découvre.
 *   installee  elle l'a posée sur son écran d'accueil. On se tait, jusqu'au
 *              jour où le navigateur nous dit qu'elle ne l'est plus.
 *
 * SUR IPHONE, rien de tout cela n'existe : Safari n'a ni événement, ni moyen
 * de savoir si l'application est posée. On ne peut que décrire le geste, et
 * se taire pendant DÉLAI_REFUS_JOURS après un refus. C'est une limite de
 * Safari, pas un oubli.
 */

/** Ce que Chrome envoie, et que les types du navigateur ne décrivent pas. */
interface DemandeInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLE = 'md-installer';

/**
 * Combien de temps un « plus tard » vaut.
 *
 * Trente jours : assez pour qu'elle ne soit pas harcelée, assez court pour
 * qu'un refus donné le jour de sa découverte ne la prive pas de
 * l'application pour toujours. C'est à peu près un cycle, et ce n'est pas un
 * hasard : une femme qui a traversé un mois avec l'application sait si elle
 * lui sert.
 */
const DELAI_REFUS_JOURS = 30;

/** Ancienne clé, un simple « 1 » définitif. Lue une fois, puis effacée. */
const CLE_ANCIENNE = 'md-installer-non';

type Etat = { quoi: 'refuse' | 'installee'; le: number };

function lireEtat(): Etat | null {
  try {
    // La version d'octobre ne gardait qu'un « 1 ». On la relit comme un refus
    // daté d'aujourd'hui : celles qui avaient dit non ne sont pas harcelées
    // du jour au lendemain, mais elles reverront la proposition dans un mois
    // au lieu de jamais.
    if (localStorage.getItem(CLE_ANCIENNE) === '1') {
      localStorage.removeItem(CLE_ANCIENNE);
      const reprise: Etat = { quoi: 'refuse', le: Date.now() };
      localStorage.setItem(CLE, JSON.stringify(reprise));
      return reprise;
    }
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const lu = JSON.parse(brut) as Partial<Etat>;
    if (lu.quoi !== 'refuse' && lu.quoi !== 'installee') return null;
    return { quoi: lu.quoi, le: typeof lu.le === 'number' ? lu.le : 0 };
  } catch {
    // Pas de stockage, ou valeur abîmée : on préfère proposer que se taire.
    return null;
  }
}

function ecrireEtat(quoi: Etat['quoi']): void {
  try {
    localStorage.setItem(CLE, JSON.stringify({ quoi, le: Date.now() }));
  } catch {
    /* tant pis : la proposition reviendra, elle ne cassera rien */
  }
}

function oublier(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* idem */
  }
}

const joursDepuis = (quand: number) => (Date.now() - quand) / 86_400_000;

/** Tourne-t-elle en ce moment DANS l'application installée ? */
function dansLApplication(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // Safari sur iPhone ne connaît pas `display-mode` et répond ici.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function montrer(famille: 'android' | 'ios', quandOui: (() => void) | null): void {
  const bandeau = document.getElementById('invite-installer');
  if (!bandeau) return;
  if (document.documentElement.dataset.installer) return; // déjà affiché

  document.documentElement.dataset.installer = famille;
  bandeau.hidden = false;

  const ranger = () => {
    bandeau.hidden = true;
    delete document.documentElement.dataset.installer;
  };

  document.getElementById('invite-non')?.addEventListener('click', () => {
    ecrireEtat('refuse');
    ranger();
  });

  document.getElementById('invite-oui')?.addEventListener('click', () => {
    ranger();
    quandOui?.();
  });
}

// --- Ce qu'on fait, et quand --------------------------------------------------

const etat = lireEtat();

// Elle est DEDANS, maintenant : rien à proposer, et on note qu'elle l'a, pour
// que le retour de l'événement nous dise plus tard qu'elle ne l'a plus.
if (dansLApplication()) {
  if (etat?.quoi !== 'installee') ecrireEtat('installee');
} else {
  // Un « plus tard » encore frais : on se tait.
  const refusFrais = etat?.quoi === 'refuse' && joursDepuis(etat.le) < DELAI_REFUS_JOURS;

  /*
   * ANDROID ET CHROME.
   *
   * On écoute TOUJOURS, même quand on s'est promis de se taire, parce que
   * l'arrivée de cet événement est en elle-même une information : le
   * navigateur ne l'envoie que si l'application n'est PAS installée. S'il
   * arrive alors qu'on la croyait installée, c'est qu'elle vient de la
   * supprimer, et c'est précisément le moment de reproposer.
   */
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Sans ça, Chrome affiche sa propre invitation par-dessus la nôtre.
    evenement.preventDefault();
    const demande = evenement as DemandeInstallation;

    // Elle l'avait, elle ne l'a plus. On repart de zéro et on propose.
    const desinstallee = etat?.quoi === 'installee';
    if (desinstallee) oublier();
    else if (refusFrais) return;

    montrer('android', () => {
      demande.prompt().then(
        () =>
          demande.userChoice.then(
            (choix) => {
              if (choix.outcome === 'accepted') {
                // Posée sur l'écran d'accueil. On NE note PAS un refus : c'est
                // ce que faisait la version d'octobre, et c'est ce qui la
                // privait de la proposition le jour où elle désinstallait.
                ecrireEtat('installee');
              } else {
                ecrireEtat('refuse');
              }
            },
            () => ecrireEtat('refuse')
          ),
        () => {
          /* la demande a expiré : la proposition reviendra à la prochaine visite */
        }
      );
    });
  });

  // Le navigateur confirme l'installation, même quand elle passe par son menu
  // à lui plutôt que par notre bouton.
  window.addEventListener('appinstalled', () => ecrireEtat('installee'));

  /*
   * IPHONE ET SAFARI. Aucun événement, aucune interface : il n'y a que le
   * geste à décrire. On attend un peu pour ne pas accueillir une femme par
   * une demande avant qu'elle ait vu à quoi elle dit oui.
   */
  const surIPhone =
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios/i.test(navigator.userAgent);

  if (surIPhone && !refusFrais) {
    window.setTimeout(() => montrer('ios', null), 4000);
  }
}
