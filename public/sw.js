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

// Le nom change quand la façon de garder change : à l'activation, tout ce qui
// porte un autre nom est effacé. C'est ce qui débarrasse les téléphones de la
// réserve fabriquée par la version précédente.
const RESERVE = 'mousso-dambe-v2';

// Ce qui ne change pas et ne parle de personne.
const SOCLE = ['/fonts/figtree.woff2', '/fonts/bricolage.woff2', '/manifest.webmanifest', '/favicon.svg'];

// Les chemins qui ne doivent JAMAIS être gardés.
//
// « / » en fait partie depuis le 12 octobre 2026 : connectée, l'accueil affiche
// son jour de cycle, sa phase et la date de ses prochaines règles. Une copie
// gardée se rouvrait hors connexion, après la déconnexion, pour qui tient le
// téléphone. C'était la faille la plus grave de l'audit de Cyber.
// Complétée le 26 octobre 2026 par l'audit de Cyber : neuf chemins nés depuis
// le 12 octobre n'y étaient pas (`/discussions`, `/parametres`, `/recherche`,
// `/vocal`, `/favoris`, `/commande-confirmee`, `/ouverture`, `/auth`, et les
// deux chemins de la gestion). Aucun n'était réellement gardé, parce que la
// deuxième serrure tient : le site leur pose `private, no-store`, et
// `gardable()` refuse tout ce qui n'annonce pas `s-maxage`. Mais le 12 octobre
// on s'était donné DEUX serrures indépendantes, et une seule était encore
// fermée. `/commande-confirmee` est l'exemple du piège : il ne commence pas par
// `/commande/`, donc `/commande` ne le couvrait pas.
//
// Un garde-fou dans supabase/tests/cache.test.mjs relit maintenant les pages du
// dossier src/pages et tombe si l'une d'elles n'est couverte ni par cette liste
// ni par la liste des chemins publics. La liste ne peut donc plus vieillir en
// silence.
// Depuis le 27 octobre 2026 : /avis (son avis, lie a sa commande) et
// /livreur (le nom, le numero et l adresse d une cliente, sur le telephone
// d un livreur de passage). Aucun des deux ne se garde hors ligne.
const PRIVE = [
  '/',
  '/cycle',
  '/journal',
  '/dambe',
  '/compte',
  '/commande',
  '/commande-confirmee',
  '/commandes',
  '/panier',
  '/discussions',
  '/parametres',
  '/recherche',
  '/favoris',
  '/vocal',
  '/confidentialite',
  '/connexion',
  '/inscription',
  '/commencer',
  '/bienvenue',
  '/ouverture',
  '/deconnexion',
  '/auth',
  '/admin',
  '/vendeur',
  '/dev',
  '/avis',
  '/livreur',
];

const estPrive = (url) => PRIVE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

/*
 * Cette réponse a-t-elle le droit d'entrer dans la réserve du téléphone ?
 *
 * Seule une page qui se déclare explicitement cacheable par le réseau de
 * diffusion (« s-maxage ») entre. Ne JAMAIS se contenter de chercher le mot
 * « public » : un hébergeur qui ne trouve aucun en-tête en pose un lui-même, et
 * celui de Vercel est « public, max-age=0, must-revalidate ». Avec l'ancienne
 * règle, toute page sans en-tête devenait gardable, l'accueil personnalisé
 * compris.
 *
 * Même règle que gardableParLeTelephone() dans src/lib/cache.ts. Un service
 * worker est un script, pas un module : il ne peut rien importer. Le test
 * supabase/tests/cache.test.mjs vérifie que les deux disent la même chose.
 */
const gardable = (entete) => {
  const c = (entete || '').toLowerCase();
  if (!c) return false;
  if (c.includes('no-store') || c.includes('private') || c.includes('no-cache')) return false;
  return c.includes('s-maxage');
};

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
  // économise le plus de données sur un forfait compté. Leur contenu ne change
  // pas sous la même adresse.
  const estFige = /\.(woff2|png|svg|webp|jpg|jpeg|ico)$/.test(url.pathname);

  // Les styles et les scripts : LE RÉSEAU D'ABORD.
  //
  // Pourquoi ils ne sont pas traités comme les images, et ça a coûté une
  // soirée à Arthur le 12 octobre 2026 : la réserve d'abord servait l'ancienne
  // feuille de style indéfiniment. Il voyait une barre de navigation de trois
  // versions en arrière et me disait, à juste titre, que son code n'était pas
  // appliqué. En production les fichiers construits portent une empreinte dans
  // leur nom, donc le cas est rare ; mais « rare » n'est pas « jamais », et le
  // jour où ça arrive, personne ne comprend ce qui se passe.
  //
  // On garde quand même une copie, pour que l'application reste consultable
  // hors connexion : simplement, elle ne sert qu'en dernier recours.
  const estStyleOuScript = /\.(css|js|mjs)$/.test(url.pathname);
  const estFichier = estFige || estStyleOuScript;

  /*
   * LE RÉSEAU PART D'ABORD, LA RÉSERVE S'OUVRE À CÔTÉ (7 novembre 2026).
   *
   * Arthur : « l'application est très lente, quand on clique sur un bouton ça
   * prend 5 secondes ».
   *
   * Ce fichier y était pour sa part. Il écrivait `await ouvrirReserve()` AVANT
   * de lancer quoi que ce soit : chaque requête de l'application attendait
   * donc l'ouverture du magasin local avant même que le premier octet parte
   * sur le réseau. Sur un téléphone d'entrée de gamme, ouvrir ce magasin
   * coûte quelques dizaines de millisecondes, et il faut d'abord RÉVEILLER le
   * service worker, ce qui en coûte davantage. Multiplié par la douzaine de
   * fichiers d'une page, cela se voit.
   *
   * Les deux ne dépendent pas l'un de l'autre : on les lance ENSEMBLE. La
   * réserve n'est attendue qu'au moment où l'on en a vraiment besoin, c'est-
   * à-dire pour y ranger la réponse, ou pour y chercher un fichier figé.
   *
   * CE QUI NE CHANGE PAS : les fichiers figés (polices, images, icônes) sont
   * toujours servis depuis la réserve en priorité, parce que c'est ce qui
   * économise le plus de données sur un forfait compté. Pour eux seuls, on
   * attend la réserve avant de décider.
   */
  const reservePromise = ouvrirReserve();

  e.respondWith(
    (async () => {
      if (estFige) {
        const reserve = await reservePromise;
        if (reserve) {
          const garde = await reserve.match(requete);
          if (garde) return garde;
        }
      }

      try {
        // Le réseau part sans attendre la réserve : c'est tout l'objet du
        // changement.
        const reseau = await fetch(requete);
        const reserve = await reservePromise;
        if (reserve && reseau.ok && (estFichier || url.pathname.startsWith('/boutique'))) {
          // Une page n'entre dans la réserve que si elle se déclare cacheable
          // par le réseau de diffusion. Les fichiers (polices, images, styles)
          // ne parlent de personne et entrent toujours.
          if (estFichier || gardable(reseau.headers.get('Cache-Control'))) {
            reserve.put(requete, reseau.clone()).catch(() => {});
          }
        }
        return reseau;
      } catch {
        // Le réseau est tombé. C'est le seul moment où la réserve est le
        // dernier recours, et c'est ici qu'on l'attend.
        const reserve = await reservePromise;
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
