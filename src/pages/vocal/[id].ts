/**
 * Écouter un vocal.
 *
 * Le son sort par ici et nulle part ailleurs. La base décide qui a le droit
 * (celle qui l'a envoyé, ou l'administratrice) ; cette route ne fait que le
 * remettre en octets.
 *
 * Les requêtes à intervalle (`Range`) sont gérées pour de bon : Safari sur
 * iPhone refuse de jouer un son dont le serveur ne sait pas répondre « 206 »,
 * et Chrome en a besoin pour avancer dans un enregistrement.
 *
 * Rien n'est mis en cache, ni par le téléphone ni par un intermédiaire : c'est
 * une voix.
 */
import type { APIRoute } from 'astro';
import { clientSession } from '../../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTETES = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' };

/**
 * LES TROIS SEULS TYPES QUI SORTENT D'ICI (ajouté le 8 novembre 2026, audit de
 * Cyber).
 *
 * Le type venait de la base et était servi sur parole. La base le tient par une
 * contrainte de colonne (`type_mime in ('audio/webm','audio/mp4','audio/ogg')`,
 * migration 20261013140000), donc rien ne passait aujourd'hui. Mais c'était la
 * SEULE serrure, et on ne fait pas reposer sur une seule serrure une valeur qui
 * décide de la façon dont le navigateur interprète des octets envoyés par
 * quelqu'un d'autre : un `text/html` servi depuis notre domaine, c'est du code
 * qui s'exécute chez qui ouvre le fichier, et ici celui qui ouvre les vocaux
 * d'une cliente, c'est l'espace de gestion.
 *
 * La route des photos d'avis le faisait déjà, pour exactement cette raison
 * (« un type inattendu deviendrait une façon de faire interpréter un fichier
 * par le navigateur »). Les deux routes disent maintenant la même chose.
 */
const TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];

export const GET: APIRoute = async (contexte) => {
  const id = contexte.params.id ?? '';
  if (!UUID.test(id)) return new Response('Introuvable', { status: 404, headers: ENTETES });

  const client = clientSession(contexte as never);
  if (!client) return new Response('Connexion requise', { status: 401, headers: ENTETES });

  const { data } = await client.rpc('lire_vocal', { p_message: id });
  // « Pas à toi » et « n'existe pas » reçoivent la même réponse : on ne
  // confirme pas qu'une autre femme a envoyé un vocal.
  if (!data?.ok) return new Response('Introuvable', { status: 404, headers: ENTETES });

  const type = String(data.type);
  // Même réponse que « pas à toi » et « n'existe pas » : on ne renseigne pas
  // sur ce qui est rangé en base.
  if (!TYPES.includes(type)) return new Response('Introuvable', { status: 404, headers: ENTETES });

  const octets = Buffer.from(String(data.base64), 'base64');
  const total = octets.length;

  const demande = contexte.request.headers.get('range');
  const m = demande ? /^bytes=(\d*)-(\d*)$/.exec(demande.trim()) : null;

  if (m && (m[1] !== '' || m[2] !== '')) {
    let debut: number;
    let fin: number;
    if (m[1] === '') {
      // « les N derniers octets »
      debut = Math.max(0, total - Number(m[2]));
      fin = total - 1;
    } else {
      debut = Number(m[1]);
      fin = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
    }
    if (debut >= total || debut > fin) {
      return new Response(null, {
        status: 416,
        headers: { ...ENTETES, 'content-range': `bytes */${total}` },
      });
    }
    const morceau = octets.subarray(debut, fin + 1);
    return new Response(morceau, {
      status: 206,
      headers: {
        ...ENTETES,
        'content-type': type,
        'accept-ranges': 'bytes',
        'content-range': `bytes ${debut}-${fin}/${total}`,
        'content-length': String(morceau.length),
      },
    });
  }

  return new Response(octets, {
    status: 200,
    headers: { ...ENTETES, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(total) },
  });
};
