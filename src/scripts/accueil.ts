/**
 * L'ACCUEIL, CÔTÉ NAVIGATEUR.
 *
 * Trois choses, et rien de plus : le carrousel qui avance tout seul, les
 * points qui suivent, et les cartes produits qui apparaissent au défilement.
 * Si ce fichier ne se charge jamais, la page reste entièrement lisible et
 * utilisable : on fait glisser les cartes au doigt, et les produits sont là.
 *
 * Arthur voulait « jamais statique ». Mais le défilement automatique s'arrête
 * dès qu'elle touche la bande : rien n'est plus agaçant qu'un carrousel qui
 * vous reprend la main.
 */
const rail = document.getElementById('vedettes');
const points = document.getElementById('points');

const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (rail && points) {
  const cartes = Array.from(rail.children) as HTMLElement[];
  const pastilles = Array.from(points.children) as HTMLElement[];

  const marquer = (i: number) => {
    pastilles.forEach((p, n) => p.classList.toggle('actif', n === i));
  };

  // Quelle carte est au centre : c'est le navigateur qui nous le dit, on ne
  // calcule aucune position à la main.
  const vue = new IntersectionObserver(
    (entrees) => {
      for (const e of entrees) {
        if (e.isIntersecting) marquer(cartes.indexOf(e.target as HTMLElement));
      }
    },
    { root: rail, threshold: 0.6 },
  );
  cartes.forEach((c) => vue.observe(c));

  if (!calme && cartes.length > 1) {
    let tour = 0;
    let libre = true;

    // Dès qu'elle touche, on lui laisse la main pour de bon.
    const rendre = () => {
      libre = false;
      rail.removeEventListener('pointerdown', rendre);
      rail.removeEventListener('touchstart', rendre);
    };
    rail.addEventListener('pointerdown', rendre, { passive: true });
    rail.addEventListener('touchstart', rendre, { passive: true });

    setInterval(() => {
      if (!libre || document.hidden) return;
      tour = (tour + 1) % cartes.length;
      cartes[tour].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 4200);
  }
}

// Les cartes qui montent en cascade quand on arrive dessus.
const aReveler = document.querySelectorAll<HTMLElement>('[data-revele]');
if (aReveler.length > 0) {
  if (calme) {
    aReveler.forEach((e) => e.classList.add('vu'));
  } else {
    const oeil = new IntersectionObserver(
      (entrees, moi) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('vu');
          moi.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    aReveler.forEach((e) => oeil.observe(e));
  }
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la meme constante se heurtent.
export {};
