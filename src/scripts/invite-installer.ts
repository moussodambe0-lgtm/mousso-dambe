/**
 * Proposer d'installer l'application, à chaque visite, tant qu'elle ne l'a pas.
 *
 * Arthur, le 7 novembre 2026, et c'est la règle entière :
 *
 *   « Quand je rentre sur la plateforme, on doit TOUJOURS me proposer de
 *     télécharger l'application. Une fois que je télécharge l'application et
 *     que l'application est dans mon téléphone, on me propose plus. Mais une
 *     fois que je supprime l'application de mon téléphone, si je repars sur
 *     le site, on doit me proposer de télécharger. »
 *
 * DEUX ÉTATS, PAS TROIS. Elle l'a, ou elle ne l'a pas. Il n'y a pas de
 * troisième cas à retenir.
 *
 * CE QUE J'AVAIS AJOUTÉ, ET QU'IL A FALLU RETIRER
 *
 * La version du matin gardait un « plus tard » pendant trente jours. Personne
 * ne l'avait demandé : je l'avais ajouté pour ne pas harceler. Deux
 * conséquences, toutes deux mauvaises. D'abord elle contredisait la demande :
 * une femme qui n'a pas l'application ne se voyait plus rien proposer pendant
 * un mois. Ensuite la reprise de l'ancienne clé datait ce refus du JOUR DE LA
 * MISE À JOUR : tous ceux qui avaient dit non en octobre, Arthur compris, se
 * retrouvaient muets trente jours de plus, sans avoir rien touché. C'est
 * exactement comme ça qu'il s'en est aperçu.
 *
 * La leçon n'est pas « le délai était mauvais ». C'est qu'une règle inventée
 * en plus de la demande doit être proposée, pas glissée dans le code.
 *
 * CE QUI REND LA CHOSE SIMPLE, et c'est le navigateur qui fait le travail :
 * `beforeinstallprompt` N'ARRIVE PAS quand l'application est installée. Son
 * arrivée prouve donc, à elle seule, que l'application n'est pas là. On n'a
 * rien à retenir entre deux visites, rien à dater, rien à faire vieillir : on
 * écoute, et si le navigateur parle, on propose. Le jour où elle désinstalle,
 * l'événement revient de lui-même.
 *
 * CE QU'ON GARDE QUAND MÊME, ET POURQUOI C'EST LE MINIMUM. Si elle appuie sur
 * « Plus tard », on se tait jusqu'à la fin de sa visite. Pas un mois : le
 * temps de cette visite. Sans cela, le bandeau reviendrait à chaque page
 * qu'elle ouvre, dans la minute, après qu'elle vient de dire non. Ce n'est pas
 * un délai, c'est le respect d'un refus qu'on vient d'entendre. C'est rangé
 * dans `sessionStorage`, qui s'efface tout seul quand elle ferme : la visite
 * suivante repropose, comme demandé.
 *
 * SUR IPHONE, rien de tout cela n'existe : Safari n'a ni événement, ni moyen
 * de savoir si l'application est posée. On ne peut que décrire le geste. Une
 * femme qui a déjà l'application sur son iPhone et qui revient par Safari
 * reverra donc la proposition. C'est une limite de Safari, pas un oubli, et
 * c'est pour ça qu'on attend quelques secondes avant de l'afficher.
 */

/** Ce que Chrome envoie, et que les types du navigateur ne décrivent pas. */
interface DemandeInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Le refus du moment, effacé par le navigateur à la fin de la visite. */
const CLE_VISITE = 'md-installer-pas-maintenant';

/**
 * Les deux clés des versions précédentes, effacées au passage.
 *
 * `md-installer-non` (27 octobre) était un « non » définitif, et il était
 * écrit AUSSI quand elle acceptait. `md-installer` (ce matin) portait le
 * refus de trente jours. Les deux feraient taire la proposition pour des
 * femmes qui n'ont pas l'application. On ne se contente pas de les ignorer :
 * on les enlève, pour qu'il ne reste rien à mal relire un jour.
 */
const CLES_MORTES = ['md-installer-non', 'md-installer'];

function oublierLesAnciennes(): void {
  try {
    for (const cle of CLES_MORTES) localStorage.removeItem(cle);
  } catch {
    /* pas de stockage : il n'y a alors rien à effacer */
  }
}

function refuseePourCetteVisite(): boolean {
  try {
    return sessionStorage.getItem(CLE_VISITE) === '1';
  } catch {
    // Navigation privée, stockage bloqué : on préfère proposer que se taire.
    return false;
  }
}

function noterLeRefus(): void {
  try {
    sessionStorage.setItem(CLE_VISITE, '1');
  } catch {
    /* tant pis : au pire le bandeau revient à la page suivante */
  }
}

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
  if (refuseePourCetteVisite()) return;

  document.documentElement.dataset.installer = famille;
  bandeau.hidden = false;

  const ranger = () => {
    bandeau.hidden = true;
    delete document.documentElement.dataset.installer;
  };

  document.getElementById('invite-non')?.addEventListener('click', () => {
    noterLeRefus();
    ranger();
  });

  document.getElementById('invite-oui')?.addEventListener('click', () => {
    ranger();
    quandOui?.();
  });
}

// --- Ce qu'on fait, et quand --------------------------------------------------

oublierLesAnciennes();

if (!dansLApplication()) {
  /*
   * ANDROID ET CHROME. L'événement n'arrive que si l'application n'est pas
   * installée : il n'y a donc aucune condition à ajouter. S'il arrive, on
   * propose.
   */
  window.addEventListener('beforeinstallprompt', (evenement) => {
    // Sans ça, Chrome affiche sa propre invitation par-dessus la nôtre.
    evenement.preventDefault();
    const demande = evenement as DemandeInstallation;

    montrer('android', () => {
      demande.prompt().catch(() => {
        /* la demande a expiré : la proposition reviendra à la prochaine visite */
      });
    });
  });

  /*
   * IPHONE ET SAFARI. Aucun événement, aucune interface : il n'y a que le
   * geste à décrire. On attend un peu pour ne pas accueillir une femme par
   * une demande avant qu'elle ait vu à quoi elle dit oui.
   */
  const surIPhone =
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    /safari/i.test(navigator.userAgent) &&
    !/crios|fxios|edgios/i.test(navigator.userAgent);

  if (surIPhone) {
    window.setTimeout(() => montrer('ios', null), 4000);
  }
}
