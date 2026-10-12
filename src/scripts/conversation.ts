/**
 * LA CONVERSATION, CÔTÉ NAVIGATEUR.
 *
 * Trois commodités, aucune indispensable : la zone de texte qui grandit avec
 * le message, le fil qui se place en bas à l'ouverture, et le rafraîchissement
 * régulier qui fait apparaître la réponse de la boutique sans toucher à rien.
 *
 * Le rafraîchissement s'arrête dès qu'elle commence à écrire : recharger la
 * page sous les doigts de quelqu'un en train de taper lui ferait perdre son
 * message, et ça arriverait précisément quand elle a quelque chose à dire.
 */
const zone = document.querySelector<HTMLTextAreaElement>('.ecrire textarea');
const fil = document.querySelector<HTMLElement>('.fil');

// On arrive en bas du fil, là où est le dernier message.
if (fil) {
  const dernier = fil.lastElementChild;
  if (dernier) dernier.scrollIntoView({ block: 'end' });
}

if (zone) {
  // La hauteur est posée par le modèle objet des styles, et non par un
  // attribut `style=` écrit dans la page : la politique de sécurité du
  // contenu interdit le second, pas le premier.
  const ajuster = () => {
    zone.style.height = 'auto';
    zone.style.height = `${Math.min(zone.scrollHeight, 140)}px`;
  };
  zone.addEventListener('input', ajuster);
  if (zone.value) ajuster();

  // Entrée envoie, Maj+Entrée va à la ligne. C'est ce que font les gens.
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      zone.closest('form')?.requestSubmit();
    }
  });
}

// Le rafraîchissement. Vingt secondes : assez pour que la réponse arrive
// vite, assez peu pour ne pas consommer le forfait de quelqu'un qui a laissé
// la page ouverte.
let ecrit = false;
zone?.addEventListener('input', () => {
  ecrit = true;
});

setInterval(() => {
  if (ecrit || document.hidden) return;
  if (zone && zone.value.trim().length > 0) return;
  location.reload();
}, 20000);
