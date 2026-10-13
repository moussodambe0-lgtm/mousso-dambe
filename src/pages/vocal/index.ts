/**
 * Recevoir un vocal : pour le médecin, pour la boutique, ou la réponse de l'administratrice.
 *
 * Le seul endroit du site qui reçoit du son. Il ne fait presque rien : il
 * vérifie d'où vient la requête, la passe à la base, et renvoie ce que la base
 * a dit. Les bornes (90 secondes, 1,2 Mo, médecin seulement, quota) vivent
 * dans `envoyer_vocal`, parce qu'une page se contourne et pas une fonction.
 *
 * Aucun son ne part vers un service extérieur et rien n'est transcrit
 * (décision d'Arthur du 13 octobre 2026).
 */
import type { APIRoute } from 'astro';
import { clientSession } from '../../lib/supabase';
import { messageErreur } from '../../lib/format';

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
  });

export const POST: APIRoute = async (contexte) => {
  // `checkOrigin` d'Astro ne couvre que les formulaires. Un corps JSON n'est
  // pas un formulaire, donc on vérifie nous-mêmes : un envoi qui ne vient pas
  // de ce site est refusé. Le cookie est en SameSite Lax, ce qui fait déjà
  // l'essentiel ; ceci est la deuxième serrure.
  const origine = contexte.request.headers.get('origin');
  if (origine && origine !== contexte.url.origin) return json({ ok: false, erreur: 'acces_refuse' }, 403);

  const client = clientSession(contexte as never);
  if (!client) return json({ ok: false, erreur: 'connexion_requise' }, 401);

  // On borne la taille AVANT de lire : sans ça, quelqu'un peut envoyer
  // cent mégaoctets et les faire avaler au serveur pour que la base les
  // refuse ensuite. 1,2 Mo de son font environ 1,7 Mo en base64.
  const annonce = Number(contexte.request.headers.get('content-length') ?? 0);
  if (annonce > 1_800_000) return json({ ok: false, erreur: 'vocal_trop_long' }, 413);

  let corps: { base64?: unknown; type?: unknown; secondes?: unknown; sujet?: unknown; fil?: unknown };
  try {
    corps = await contexte.request.json();
  } catch {
    return json({ ok: false, erreur: 'vocal_abime' }, 400);
  }

  const base64 = typeof corps.base64 === 'string' ? corps.base64 : '';
  const type = typeof corps.type === 'string' ? corps.type : '';
  const secondes = Number.isFinite(Number(corps.secondes)) ? Math.round(Number(corps.secondes)) : 0;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Un `fil` : c'est l'administratrice qui répond. La base vérifie qu'elle l'est ;
  // ici on s'assure seulement que c'est bien un identifiant, pas un texte libre.
  const reponse = typeof corps.fil === 'string' && UUID.test(corps.fil) ? corps.fil : null;

  const { data, error } = reponse
    ? await client.rpc('repondre_vocal', {
        p_fil: reponse,
        p_base64: base64,
        p_type: type,
        p_secondes: secondes,
      })
    : await client.rpc('envoyer_vocal', {
        p_base64: base64,
        p_type: type,
        p_secondes: secondes,
        p_sujet: corps.sujet === 'boutique' ? 'boutique' : 'medecin',
      });

  if (error || !data?.ok) {
    return json({ ok: false, erreur: data?.erreur ?? 'erreur', message: messageErreur(data?.erreur) }, 400);
  }
  return json({ ok: true, secondes: data.secondes });
};

// Un envoi en GET partirait au premier robot qui suit un lien.
export const GET: APIRoute = (contexte) => contexte.redirect('/discussions/medecin', 303);
