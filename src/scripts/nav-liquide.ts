/**
 * Navigation « liquide » : la bulle glisse de l'onglet quitté vers l'onglet
 * ouvert.
 *
 * Jia est fait de vraies pages : chaque onglet recharge la page, la barre est
 * redessinée à neuf. Pour que la bulle ait l'air de voyager, l'onglet quitté est
 * noté au moment du tap (sessionStorage), puis la nouvelle page fait partir la
 * bulle de cette position-là. Tout le mouvement est en CSS (`.nav-repere.glisse`
 * dans components.css) ; ce module ne fait que poser la position de départ.
 *
 * Sans JavaScript, ou si le stockage est refusé, la bulle est simplement déjà
 * en place : rien ne casse.
 */

const CLE = 'yaar-nav-precedent';

export function brancherNavLiquide(): void {
  const nav = document.querySelector<HTMLElement>('[data-nav-liquide]');
  if (!nav) return;

  const actuel = Number(nav.dataset.actif ?? -1);
  const repere = nav.querySelector<HTMLElement>('.nav-repere');

  let precedent = -1;
  try {
    precedent = Number(sessionStorage.getItem(CLE) ?? -1);
    sessionStorage.removeItem(CLE);
  } catch {
    /* navigation privée ou stockage bloqué : la bulle apparaît en place */
  }

  // Avec les transitions entre pages, c'est le navigateur qui fait glisser la
  // bulle (voir components.css). Cette glissade-ci ne sert que de secours aux
  // navigateurs qui n'en ont pas : sinon les deux se superposeraient.
  const transitionsNatives = 'PageRevealEvent' in window;
  const sansMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (repere && !transitionsNatives && actuel >= 0 && precedent >= 0 && precedent !== actuel && !sansMouvement) {
    repere.style.setProperty('--de', String(precedent));
    repere.classList.add('glisse');
  }

  if (actuel < 0) return;
  nav.querySelectorAll<HTMLAnchorElement>('a.nav-onglet').forEach((lien) => {
    lien.addEventListener('click', () => {
      try {
        sessionStorage.setItem(CLE, String(actuel));
      } catch {
        /* sans importance : la bulle ne glissera simplement pas */
      }
    });
  });
}
