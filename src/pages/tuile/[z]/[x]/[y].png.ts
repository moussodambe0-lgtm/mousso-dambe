/**
 * Les tuiles du fond de carte, servies par notre serveur.
 *
 * POURQUOI CE DÉTOUR, ALORS QUE LE TÉLÉPHONE POURRAIT LES PRENDRE DIRECTEMENT.
 *
 * Parce qu'une carte trahit où l'on habite. Si le téléphone d'une cliente va
 * chercher ses tuiles chez OpenStreetMap, il annonce à chaque fois son adresse
 * IP et le carré de terrain qu'il regarde. Mis bout à bout sur une page qui
 * s'appelle « suivi de ma commande », cela dit : cette personne-là habite ici.
 * Dans une application où la même base contient son cycle et ses questions de
 * santé, ajouter un destinataire à cette donnée-là demandait mieux qu'une ligne
 * de configuration.
 *
 * Ici, c'est notre serveur qui demande les tuiles. OpenStreetMap ne voit qu'un
 * seul visiteur, nous, et ne peut relier aucune tuile à personne. La politique
 * de sécurité du site reste donc fermée : `img-src 'self'`, rien à ouvrir.
 *
 * CE QUE ÇA COÛTE, HONNÊTEMENT : la bande passante passe par Vercel. C'est la
 * raison du cache d'un an plus bas. Une rue de Ouagadougou ne bouge pas d'une
 * semaine à l'autre : chaque tuile est demandée une fois, puis servie par le
 * cache de Vercel sans que cette fonction soit rappelée. Et la zone autorisée
 * est bornée au Burkina Faso, donc le nombre de tuiles possibles est fini.
 *
 * LE FILTRE EST DANS src/lib/tuiles.ts, pas ici, pour qu'un test puisse le
 * rejouer. C'est lui qui empêche cette adresse de devenir un proxy ouvert, par
 * lequel n'importe qui ferait passer n'importe quelle requête, avec notre
 * réputation et notre facture.
 *
 * La politique d'usage d'OpenStreetMap demande qu'un client automatique
 * s'identifie et mette en cache. Les deux sont faits.
 */
import type { APIRoute } from 'astro';
import { tuileAutorisee, segmentCanonique } from '../../../../lib/tuiles';

export const prerender = false;

const UN_AN = 60 * 60 * 24 * 365;

/**
 * Au-delà, ce n'est plus une tuile.
 *
 * Une tuile d'OpenStreetMap pèse de 2 à 40 Ko. 512 Ko laisse une marge
 * confortable et borne quand même ce que notre serveur accepte d'avaler : une
 * réponse amont sans fin remplirait la mémoire de la fonction jusqu'à ce que
 * Vercel la tue, et la carte tomberait pour tout le monde.
 */
const POIDS_MAXI = 512 * 1024;

/** Un refus ne se met JAMAIS en réserve : voir le commentaire du 502. */
const REFUS = { 'Cache-Control': 'no-store' };

export const GET: APIRoute = async ({ params, url }) => {
  /*
   * UNE TUILE, UNE SEULE ADRESSE (audit de Cyber du 8 novembre 2026).
   *
   * Deux refus avant tout le reste, et ils ne coûtent rien :
   *
   *   - AUCUNE CHAÎNE DE REQUÊTE. Cette route n'en lit pas une seule, mais le
   *     réseau de diffusion de Vercel range ses réponses par adresse COMPLÈTE :
   *     `?x=1`, `?x=2`, `?x=3` sont trois réserves vides pour une seule image.
   *     Chacune réveille la fonction et fait repartir une requête chez
   *     OpenStreetMap, sous notre nom. Le cache d'un an ne protégeait plus rien.
   *   - DES ENTIERS ÉCRITS NORMALEMENT. « 18 », « 018 », « 18.0 », « 0x12 » et
   *     « 1.8e1 » donnent tous 18 pour `Number()` : la même tuile par une
   *     infinité d'adresses. Voir `segmentCanonique` dans src/lib/tuiles.ts.
   *
   * Ce que ça ferme : la politique d'usage d'OpenStreetMap interdit qu'un
   * client automatique tire sans fin, et leur réponse est le blocage. Le fond
   * de carte s'éteindrait alors pour TOUTES les clientes. Avec ces deux refus,
   * chaque tuile n'est demandée chez eux qu'une fois, puis servie par le cache.
   *
   * Leaflet n'écrit jamais autre chose que des entiers simples, et n'ajoute
   * aucun paramètre : rien ne change à l'écran.
   */
  if (url.search) return new Response(null, { status: 404, headers: REFUS });
  if (!segmentCanonique(params.z) || !segmentCanonique(params.x) || !segmentCanonique(params.y)) {
    return new Response(null, { status: 404, headers: REFUS });
  }

  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);

  if (!tuileAutorisee(z, x, y)) return new Response(null, { status: 404, headers: REFUS });

  try {
    const amont = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      // UNE REDIRECTION N'EST PAS SUIVIE, exactement comme pour l'assistante
      // (voir src/lib/ollama.ts : « une redirection emporterait la question
      // vers une autre adresse »). Ici, suivre un détour reviendrait à laisser
      // le serveur d'en face choisir à qui notre serveur parle, et à faire
      // ressortir le contenu obtenu sous notre propre domaine, avec un cache
      // d'un an. OpenStreetMap ne redirige pas une tuile valide : ce refus ne
      // coûte rien et retire la décision à quelqu'un d'autre.
      redirect: 'error',
      headers: {
        // La politique d'OpenStreetMap exige qu'un client automatique
        // s'identifie, avec un moyen de le joindre. C'est l'adresse du service,
        // publiée sur le site ; jamais celle de quelqu'un.
        'User-Agent': 'MoussoDambe/1.0 (+https://www.moussodambe.com; bonjour@moussodambe.com)',
        Accept: 'image/png,image/*',
      },
      // Une page qui ne répond pas en 15 s est une page abandonnée, et une
      // tuile n'a pas le droit de manger ce budget à elle seule.
      signal: AbortSignal.timeout(6000),
    });

    if (!amont.ok) {
      // Un échec amont ne se met pas en réserve : la tuile pourrait très bien
      // répondre dans dix secondes, et une erreur gardée un an serait un trou
      // définitif dans la carte.
      return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    /*
     * ON NE RELAIE PAS UNE RÉPONSE DONT ON IGNORE LA TAILLE.
     *
     * Le corps était recopié en flux, sans jamais être compté : une réponse
     * amont anormalement longue aurait traversé notre serveur jusqu'à remplir
     * sa mémoire, puis Vercel aurait tué la fonction. Le poids annoncé est
     * vérifié d'abord, parce que c'est gratuit, et le vrai poids ensuite,
     * parce qu'un en-tête se trompe ou ment.
     */
    const annonce = Number(amont.headers.get('content-length'));
    if (Number.isFinite(annonce) && annonce > POIDS_MAXI) {
      return new Response(null, { status: 502, headers: REFUS });
    }

    const corps = await amont.arrayBuffer();
    if (corps.byteLength === 0 || corps.byteLength > POIDS_MAXI) {
      return new Response(null, { status: 502, headers: REFUS });
    }

    return new Response(corps, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        // Un an pour le réseau de diffusion de Vercel ET pour le téléphone :
        // c'est ce qui fait qu'une deuxième visite ne coûte plus rien à
        // personne, ni en données ni en attente.
        'Cache-Control': `public, max-age=${UN_AN}, s-maxage=${UN_AN}, immutable`,
        // La licence ODbL exige de citer la source. Leaflet l'affiche déjà dans
        // le coin de la carte ; cet en-tête la porte aussi sur le fichier
        // lui-même, pour qui le trouverait seul.
        'X-Donnees': '© OpenStreetMap contributors, ODbL',
      },
    });
  } catch {
    return new Response(null, { status: 504, headers: { 'Cache-Control': 'no-store' } });
  }
};
