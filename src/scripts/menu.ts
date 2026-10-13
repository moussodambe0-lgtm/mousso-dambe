/**
 * LE MENU DE L'ACCUEIL, CÔTÉ NAVIGATEUR.
 *
 * Le menu s'ouvre et se ferme sans ce fichier : c'est un `<details>`, et le
 * navigateur sait le faire tout seul. Ce qui suit n'ajoute que les deux gestes
 * qu'il ne connaît pas :
 *
 *   - toucher à côté du panneau le referme ;
 *   - la touche Échap le referme et remet le doigt du clavier sur le bouton.
 *
 * Pourquoi ces deux-là et rien d'autre : un panneau qu'on ne sait pas fermer
 * est un panneau qui fait peur. Sur un téléphone, on touche à côté ; sur un
 * ordinateur, on tape Échap. Partout ailleurs, on retouche les trois traits,
 * et cela marche déjà sans nous.
 *
 * Si ce fichier n'arrive jamais, rien n'est cassé : il reste les trois traits.
 */
const menu = document.querySelector<HTMLDetailsElement>('.menu');

if (menu) {
  const bouton = menu.querySelector<HTMLElement>('.menu-bouton');

  // Toucher à côté. On écoute sur le document, en phase de capture, pour que
  // le clic soit vu même si quelque chose l'arrête en route.
  document.addEventListener(
    'pointerdown',
    (ev) => {
      if (!menu.open) return;
      if (ev.target instanceof Node && menu.contains(ev.target)) return;
      menu.open = false;
    },
    { capture: true },
  );

  // Échap. Le navigateur ne le fait pas pour un `<details>` : il ne le fait
  // que pour un `<dialog>`.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    bouton?.focus();
  });

  // En partant vers une des pages du menu, on le referme. Sans cela, le menu
  // est encore ouvert au retour en arrière, parce que le navigateur restitue
  // la page telle qu'elle était.
  menu.addEventListener('click', (ev) => {
    if (ev.target instanceof Element && ev.target.closest('a')) menu.open = false;
  });
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
