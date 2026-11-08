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
import { tuileAutorisee } from '../../../../lib/tuiles';

export const prerender = false;

const UN_AN = 60 * 60 * 24 * 365;

export const GET: APIRoute = async ({ params }) => {
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y);

  if (!tuileAutorisee(z, x, y)) return new Response(null, { status: 404 });

  try {
    const amont = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
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

    return new Response(amont.body, {
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
