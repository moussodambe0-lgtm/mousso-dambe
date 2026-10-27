/**
 * La photo jointe à un avis.
 *
 * Même principe que les vocaux : les octets vivent dans la base, et cette
 * route les remet en image. La différence tient en un mot, et elle change
 * tout : un avis est PUBLIC. N'importe qui regardant la fiche d'un produit
 * voit ses photos, y compris sans compte. On passe donc par le client public,
 * et la base le sait (`photo_avis` est ouverte à `anon`).
 *
 * C'est précisément pour cela que l'écran de dépôt prévient avant de joindre
 * une photo : une photo prise chez soi montre aussi chez soi.
 *
 * Ces images-là PEUVENT être gardées longtemps, contrairement aux vocaux : une
 * photo d'avis ne change jamais après coup, et son adresse contient un
 * identifiant tiré au hasard. Un an de cache évite de refaire traverser 400 Ko
 * à chaque visite d'une fiche produit, sur un forfait compté.
 */
import type { APIRoute } from 'astro';
import { clientPublic, baseConfiguree } from '../../lib/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const REFUS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export const GET: APIRoute = async (contexte) => {
  const id = contexte.params.id ?? '';
  if (!UUID.test(id) || !baseConfiguree()) {
    return new Response('Introuvable', { status: 404, headers: REFUS });
  }

  const { data } = await clientPublic(contexte as never).rpc('photo_avis', { p_id: id });
  if (!data?.base64) return new Response('Introuvable', { status: 404, headers: REFUS });

  // Le type vient de la base, mais on ne le sert pas sur parole : un type
  // inattendu deviendrait une façon de faire interpréter un fichier par le
  // navigateur. Trois types sont acceptés à l'entrée, les trois mêmes sortent.
  const type = String(data.type);
  if (!TYPES.includes(type)) return new Response('Introuvable', { status: 404, headers: REFUS });

  const octets = Buffer.from(String(data.base64), 'base64');
  return new Response(octets, {
    status: 200,
    headers: {
      'content-type': type,
      'content-length': String(octets.length),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
};
