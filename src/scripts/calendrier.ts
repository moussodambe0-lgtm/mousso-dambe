/**
 * Le calendrier, en mieux quand JavaScript est là.
 *
 * La page marche entièrement sans lui : chaque jour est un lien qui ouvre sa
 * fiche, et les flèches de mois sont des liens. Ce script ne fait qu'éviter
 * des allers-retours au serveur, ce qui compte sur une 3G.
 *
 * Il ajoute deux choses :
 *   - glisser à gauche ou à droite sur la grille pour changer de mois ;
 *   - la touche Échap pour fermer la fiche d'un jour.
 */

const grille = document.getElementById('grille');

if (grille) {
  const mois = grille.dataset.mois ?? '';

  function moisDecale(clef: string, pas: number): string {
    const [a, m] = clef.split('-').map(Number);
    const d = new Date(a, m - 1 + pas, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  let departX: number | null = null;
  let departY: number | null = null;

  grille.addEventListener(
    'touchstart',
    (e) => {
      departX = e.touches[0].clientX;
      departY = e.touches[0].clientY;
    },
    { passive: true }
  );

  grille.addEventListener('touchend', (e) => {
    if (departX === null || departY === null) return;
    const dx = e.changedTouches[0].clientX - departX;
    const dy = e.changedTouches[0].clientY - departY;
    departX = null;
    departY = null;
    // Un glissement vertical est un défilement de page, pas un changement de
    // mois : on ne réagit que si le geste est franchement horizontal.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    window.location.href = `/cycle?mois=${moisDecale(mois, dx < 0 ? 1 : -1)}`;
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const voile = document.querySelector<HTMLAnchorElement>('.cal-voile');
  if (voile) window.location.href = voile.href;
});
