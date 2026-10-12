/*
 * Le service worker : l'application s'installe et reste consultable quand le
 * réseau tombe.
 *
 * Deux règles qui ne se relâchent pas :
 *
 * 1. AUCUNE page personnelle n'est mise en réserve. Un téléphone se partage
 *    ici : une copie de la page « Mon cycle » ou « Dambé » pourrait s'afficher
 *    pour quelqu'un d'autre, hors connexion, après une déconnexion. C'est la
 *    liste PRIVE, et toute page nouvelle qui parle d'une personne doit y être
 *    ajoutée.
 *
 * 2. On ne coupe jamais le réseau quand il n'y a rien en réserve. Un délai qui
 *    affiche « pas de connexion » alors que la page allait arriver, c'est une
 *    vente perdue sur une connexion lente.
 */

const RESERVE = 'mousso-dambe-v1';

// Ce qui ne change pas et ne parle de personne.
const SOCLE = ['/fonts/figtree.woff2', '/fonts/bricolage.woff2', '/manifest.webmanifest', '/favicon.svg'];

// Les chemins qui ne doivent JAMAIS être gardés.
const PRIVE = [
  '/cycle',
  '/journal',
  '/dambe',
  '/compte',
  '/commande',
  '/commandes',
  '/panier',
  '/confidentialite',
  '/connexion',
  '/inscription',
  '/bienvenue',
  '/deconnexion',
];

const estPrive = (url) => PRIVE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

async function ouvrirReserve() {
  // caches.open échoue en navigation privée et quand la mémoire est pleine.
  // Sans ce filet, le service worker casserait le site entier.
  try {
    return await caches.open(RESERVE);
  } catch {
    return null;
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const reserve = await ouvrirReserve();
      if (reserve) {
        try {
          await reserve.addAll(SOCLE);
        } catch {
          /* un fichier manquant ne doit pas empêcher l'installation */
        }
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n !== RESERVE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (estPrive(url)) return;

  // Les polices, les images et les icônes : la réserve d'abord, c'est ce qui
  // économise le plus de données sur un forfait compté.
  const estFichier = /\.(woff2|png|svg|webp|jpg|jpeg|css|js)$/.test(url.pathname);

  e.respondWith(
    (async () => {
      const reserve = await ouvrirReserve();

      if (estFichier && reserve) {
        const garde = await reserve.match(requete);
        if (garde) return garde;
      }

      try {
        const reseau = await fetch(requete);
        if (reserve && reseau.ok && (estFichier || url.pathname === '/' || url.pathname.startsWith('/boutique'))) {
          // On ne garde une page que si elle se dit publique : une page
          // marquée « private » ne doit jamais atterrir ici.
          const controle = reseau.headers.get('Cache-Control') ?? '';
          if (estFichier || controle.includes('public')) {
            reserve.put(requete, reseau.clone()).catch(() => {});
          }
        }
        return reseau;
      } catch {
        if (reserve) {
          const garde = await reserve.match(requete);
          if (garde) return garde;
        }
        return new Response(
          `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pas de connexion</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#FFF6F9;color:#1B1116;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center">
<div style="padding:24px;max-width:320px">
<h1 style="font-size:22px;margin:0 0 8px">Pas de connexion</h1>
<p style="color:#6B5560;line-height:1.5;margin:0">Ton téléphone n'arrive pas à joindre l'application.
Réessaie quand le réseau revient.</p>
</div></body></html>`,
          { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
      }
    })()
  );
});
