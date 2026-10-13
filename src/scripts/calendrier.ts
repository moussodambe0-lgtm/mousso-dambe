/**
 * Le calendrier, en mieux quand JavaScript est là.
 *
 * La page marche entièrement sans lui : chaque jour est un lien qui ouvre sa
 * fiche, et les flèches de mois sont des liens.
 *
 * CE QUE FAIT CE FICHIER, ET POURQUOI (retour d'Arthur, 13 octobre 2026 :
 * « quand je défile ou que je clique quelque part sur le calendrier, la page
 * se recharge, et quand j'appuie sur retour ça me renvoie où j'étais dans le
 * calendrier au lieu de me faire quitter la page ») :
 *
 *   1. UN TOUCHER NE RECHARGE PLUS LA PAGE. Toucher une date, une flèche de
 *      mois ou le voile de la fiche va chercher la nouvelle page, et ne
 *      remplace que le contenu du calendrier. Le défilement reste où il est,
 *      rien ne clignote.
 *
 *   2. UN TOUCHER N'AJOUTE PLUS DE PAGE À L'HISTORIQUE. On remplace l'entrée
 *      courante (`replaceState`) au lieu d'en empiler une. « Retour » quitte
 *      donc le calendrier, comme sur n'importe quel écran, au lieu de
 *      repasser par chaque date qu'on a touchée.
 *
 *   3. LE GLISSEMENT HORIZONTAL EST RETIRÉ. Il changeait de mois quand le doigt
 *      dérivait un peu pendant un défilement, et il envoyait à `/cycle?mois=`,
 *      une adresse qui est celle du tableau de bord : d'où « la page se
 *      recharge » sans raison. Les deux flèches de mois suffisent, et une
 *      commodité qui se déclenche toute seule est pire que pas de commodité.
 *
 * Si le chargement échoue (réseau coupé, session expirée), on retombe sur une
 * vraie navigation : le lien fait son travail comme avant.
 */

const PREFIXE = '/cycle/calendrier?';

function conteneur(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ecran-calendrier');
}

async function ouvrir(href: string): Promise<void> {
  const ici = conteneur();
  if (!ici) {
    window.location.replace(href);
    return;
  }

  try {
    const reponse = await fetch(href, { credentials: 'same-origin', headers: { accept: 'text/html' } });
    // Une redirection vers la connexion, ou une erreur : on laisse le
    // navigateur faire une vraie navigation et montrer ce qu'il faut.
    if (!reponse.ok || reponse.redirected) {
      window.location.replace(href);
      return;
    }

    const doc = new DOMParser().parseFromString(await reponse.text(), 'text/html');
    const la = doc.querySelector<HTMLElement>('.ecran-calendrier');
    if (!la) {
      window.location.replace(href);
      return;
    }

    ici.innerHTML = la.innerHTML;
    // Remplacer, pas empiler : « retour » doit quitter le calendrier.
    history.replaceState(null, '', href);
  } catch {
    window.location.replace(href);
  }
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!(e.target instanceof Element)) return;

  const lien = e.target.closest<HTMLAnchorElement>('a[href]');
  if (!lien) return;

  const href = lien.getAttribute('href') ?? '';
  const ici = conteneur();
  if (!href.startsWith(PREFIXE) || !ici || !ici.contains(lien)) return;

  e.preventDefault();
  void ouvrir(href);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const voile = document.querySelector<HTMLAnchorElement>('.cal-voile');
  const href = voile?.getAttribute('href');
  if (href && href.startsWith(PREFIXE)) void ouvrir(href);
});

// Un témoin « le script est en place », pour les essais : un toucher qui part
// avant lui est un simple lien, donc une vraie navigation (c'est le repli, et
// il est correct). L'essai attend ce témoin avant de toucher.
document.documentElement.dataset.calendrier = 'pret';

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
