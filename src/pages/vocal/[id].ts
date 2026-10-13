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

export const GET: APIRoute = async (contexte) => {
  const id = contexte.params.id ?? '';
  if (!UUID.test(id)) return new Response('Introuvable', { status: 404, headers: ENTETES });

  const client = clientSession(contexte as never);
  if (!client) return new Response('Connexion requise', { status: 401, headers: ENTETES });

  const { data } = await client.rpc('lire_vocal', { p_message: id });
  // « Pas à toi » et « n'existe pas » reçoivent la même réponse : on ne
  // confirme pas qu'une autre femme a envoyé un vocal.
  if (!data?.ok) return new Response('Introuvable', { status: 404, headers: ENTETES });

  const octets = Buffer.from(String(data.base64), 'base64');
  const total = octets.length;
  const type = String(data.type);

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
