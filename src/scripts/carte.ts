/**
 * La carte du suivi de commande, dessinée avec Leaflet.
 *
 * Arthur, le 8 novembre 2026 : « AVEC UNE VRAI MAPS ».
 *
 * POURQUOI L'IMPORT EST DIFFÉRÉ. Leaflet pèse environ 150 Ko. Ce fichier est
 * chargé par le composant de la carte, qui n'est lui-même posé que sur la page
 * de suivi d'UNE commande, et seulement quand il y a un point à montrer. Mais
 * même là, on ne va chercher la bibliothèque qu'après avoir vérifié qu'il y a
 * bien une toile dans la page : sur une commande sans position, le fichier ne
 * part jamais sur le réseau. Sur un forfait compté, 150 Ko est le prix de deux
 * pages entières.
 *
 * CE QUI SE PASSE SI ÇA RATE. Rien de grave, et c'est voulu. Le conteneur
 * affiche « Le plan n'a pas pu se charger », la page continue de fonctionner,
 * et les informations qui comptent (le nom du livreur, son numéro, les étapes)
 * sont dans le HTML, pas dans la carte. Une carte est un confort, jamais le
 * seul chemin vers une information.
 */

/** Lit « 12.37,-1.52 » et refuse tout ce qui n'est pas un point du Burkina. */
function lirePoint(brut: string | undefined): [number, number] | null {
  if (!brut) return null;
  const [a, b] = brut.split(',');
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Les mêmes bornes que la base. Un point hors zone est un capteur qui s'est
  // trompé : mieux vaut ne rien montrer qu'envoyer la carte dans l'Atlantique.
  if (lat < 9 || lat > 15.5 || lng < -6 || lng > 2.5) return null;
  return [lat, lng];
}

async function dessiner(toile: HTMLElement) {
  const elle = lirePoint(toile.dataset.elle);
  const livreur = lirePoint(toile.dataset.livreur);
  if (!elle && !livreur) return;

  const enveloppe = toile.parentElement;
  if (!enveloppe) return;
  const panne = enveloppe.querySelector<HTMLElement>('[data-panne]');
  const voile = enveloppe.querySelector<HTMLButtonElement>('[data-voile]');
  const recadrer = enveloppe.querySelector<HTMLButtonElement>('[data-recadrer]');

  const L = (await import('leaflet')).default;
  await import('leaflet/dist/leaflet.css');

  const carte = L.map(toile, {
    // Inerte au départ : le doigt qui veut faire défiler la page ne doit pas
    // se retrouver prisonnier de la carte. Le voile rend les deux au premier
    // appui franc.
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    // Rien à chercher au clavier dans un plan : le laisser prenable au clavier
    // ajoute un arrêt inutile sur le chemin de la tabulation.
    keyboard: false,
    zoomControl: true,
    attributionControl: true,
  });

  // LES TUILES VIENNENT DE NOTRE SERVEUR, PAS D'OPENSTREETMAP. Le téléphone de
  // la cliente ne parle qu'à moussodambe.com : son adresse IP et le carré de
  // terrain qu'elle regarde ne sortent jamais. C'est src/pages/tuile/ qui va
  // les chercher, une fois, pour tout le monde.
  L.tileLayer('/tuile/{z}/{x}/{y}.png', {
    minZoom: 10,
    maxZoom: 18,
    // Obligatoire : les données d'OpenStreetMap sont sous licence ODbL, qui
    // exige de citer la source. Le style la rend discrète, pas invisible.
    attribution: '© OpenStreetMap',
  }).addTo(carte);

  const marqueur = (point: [number, number], classe: string, etiquette = '') =>
    L.marker(point, {
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: etiquette
          ? `<i class="${classe}"><b class="point-etiquette"></b></i>`
          : `<i class="${classe}"></i>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(carte);

  const points: [number, number][] = [];

  if (elle) {
    marqueur(elle, 'point-elle');
    points.push(elle);
  }

  if (livreur) {
    const m = marqueur(livreur, 'point-livreur', toile.dataset.etiquette || ' ');
    points.push(livreur);
    // Le texte est posé APRÈS coup, par textContent et jamais par du HTML :
    // il porte le nom du livreur, qui vient de la base. Le construire dans la
    // chaîne de l'icône en ferait une porte d'entrée pour du balisage.
    const etiquette = m.getElement()?.querySelector<HTMLElement>('.point-etiquette');
    if (etiquette) etiquette.textContent = toile.dataset.etiquette || '';
  }

  // Le trait entre les deux. CE N'EST PAS UN ITINÉRAIRE : une ligne droite,
  // pointillée, pour qu'on ne la prenne pas pour la route que le livreur suit.
  if (elle && livreur) {
    L.polyline([livreur, elle], {
      color: '#d0206a',
      weight: 3,
      opacity: 0.75,
      dashArray: '6 7',
    }).addTo(carte);
  }

  const cadrer = () => {
    if (points.length > 1) {
      carte.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 16 });
    } else {
      carte.setView(points[0], 15);
    }
  };
  cadrer();

  if (panne) panne.remove();

  // Le voile part au premier appui, et rend la carte vivante. Un glissement de
  // défilement ne produit pas de « click », donc faire défiler la page au-
  // dessus de la carte continue de faire défiler la page.
  voile?.addEventListener(
    'click',
    () => {
      carte.dragging.enable();
      carte.touchZoom.enable();
      carte.doubleClickZoom.enable();
      voile.remove();
      if (recadrer) recadrer.hidden = false;
    },
    { once: true }
  );

  recadrer?.addEventListener('click', cadrer);

  // Leaflet mesure son conteneur au moment où il se construit. Si la page
  // bouge juste après (une image qui arrive, une police qui remplace la police
  // de secours), la carte garde la taille d'avant et s'affiche décalée. On la
  // fait remesurer quand sa taille change.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => carte.invalidateSize()).observe(toile);
  }
}

for (const toile of document.querySelectorAll<HTMLElement>('[data-carte]')) {
  dessiner(toile).catch(() => {
    // Réseau coupé au moment d'aller chercher Leaflet, ou navigateur qui
    // refuse. Le message « Le plan n'a pas pu se charger » reste affiché, et
    // tout le reste de la page marche.
  });
}
