// L'échange du jeton de rafraîchissement, et la panne qu'il a causée.
//
// LE 6 NOVEMBRE 2026, TOUTE L'APPLICATION ÉTAIT À TERRE pour les femmes
// connectées depuis plus d'une heure, et personne ne pouvait le voir. Le site
// répondait en 200 ms à qui n'était pas connecté : la page d'accueil, la
// boutique, tout avait l'air parfait. Mais dès qu'une session existait et que
// son jeton d'accès avait dépassé son heure de vie, la page appelait
// `auth.refreshSession()` de supabase-js, et cet appel ne revenait jamais.
// La page attendait, Vercel la tuait à 15 secondes, et la femme voyait
// « 504 FUNCTION_INVOCATION_TIMEOUT ».
//
// Toutes ses pages d'un coup : l'accueil, le cycle, le journal, Dambé, le
// compte, la boutique. Toutes demandent qui est la visiteuse.
//
// L'échange est désormais une simple requête HTTP, bornée dans le temps. Ces
// vérifications tiennent les deux choses qui comptent : qu'un échec rende
// `null` au lieu de lever, et surtout QU'IL RENDE LA MAIN. Une page qui
// attend sans limite n'est pas une page lente, c'est une page morte.
//
// Lancer : node supabase/tests/rafraichir.test.mjs
import { verifier, bilan, titre } from './banc.mjs';
import { rafraichirJetons, DELAI_RAFRAICHISSEMENT_MS } from '../../src/lib/rafraichir.ts';

const URL_BASE = 'https://exemple.supabase.co';
const CLE = 'cle-publiable-du-banc';

/** Un faux `fetch` dont on choisit la réponse. */
function faux(reponse, journal = []) {
  return async (url, options) => {
    journal.push({ url, options });
    if (typeof reponse === 'function') return reponse(url, options);
    return reponse;
  };
}

const reponseJson = (statut, corps) => ({
  ok: statut >= 200 && statut < 300,
  status: statut,
  json: async () => corps,
});

titre("L'échange qui réussit");
{
  const journal = [];
  const jetons = await rafraichirJetons(
    URL_BASE,
    CLE,
    'jeton-de-rafraichissement',
    5000,
    faux(reponseJson(200, { access_token: 'acces-neuf', refresh_token: 'rafraichissement-neuf' }), journal)
  );
  verifier('les deux jetons neufs sont rendus', jetons?.access_token === 'acces-neuf' && jetons?.refresh_token === 'rafraichissement-neuf');
  verifier(
    "l'adresse appelée est celle de l'échange",
    journal[0].url === `${URL_BASE}/auth/v1/token?grant_type=refresh_token`,
    journal[0].url
  );
  verifier('la méthode est POST', journal[0].options.method === 'POST');
  verifier('la clé publiable accompagne la demande', journal[0].options.headers.apikey === CLE);
  verifier(
    'le jeton part dans le corps, jamais dans l\'adresse',
    journal[0].options.body.includes('jeton-de-rafraichissement') &&
      !journal[0].url.includes('jeton-de-rafraichissement')
  );
  verifier('une limite de temps est toujours posée', !!journal[0].options.signal);
}

titre('Les échecs, qui ne doivent jamais lever');
{
  const cas = [
    ['un jeton révoqué (400)', reponseJson(400, { error: 'invalid_grant' })],
    ['un jeton périmé (401)', reponseJson(401, { error: 'unauthorized' })],
    ['une base en panne (500)', reponseJson(500, {})],
    ['une réponse sans jeton', reponseJson(200, { access_token: 'seul' })],
    ['une réponse vide', reponseJson(200, {})],
  ];
  for (const [nom, reponse] of cas) {
    const r = await rafraichirJetons(URL_BASE, CLE, 'jeton', 5000, faux(reponse));
    verifier(`${nom} rend null`, r === null);
  }

  const casse = await rafraichirJetons(URL_BASE, CLE, 'jeton', 5000, async () => {
    throw new Error('reseau coupe');
  });
  verifier('un réseau coupé rend null', casse === null);

  const corpsIllisible = await rafraichirJetons(URL_BASE, CLE, 'jeton', 5000, faux({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('pas du json');
    },
  }));
  verifier('une réponse illisible rend null', corpsIllisible === null);
}

titre('Les cas où il ne faut même pas appeler');
{
  let appels = 0;
  const compter = async () => {
    appels += 1;
    return reponseJson(200, { access_token: 'a', refresh_token: 'b' });
  };
  verifier('sans adresse de base, rien', (await rafraichirJetons('', CLE, 'j', 5000, compter)) === null);
  verifier('sans clé publiable, rien', (await rafraichirJetons(URL_BASE, '', 'j', 5000, compter)) === null);
  verifier('sans jeton, rien', (await rafraichirJetons(URL_BASE, CLE, '', 5000, compter)) === null);
  verifier('et la base n\'a pas été dérangée', appels === 0, `${appels} appels`);

  const avecSlash = [];
  await rafraichirJetons(`${URL_BASE}/`, CLE, 'j', 5000, faux(reponseJson(200, { access_token: 'a', refresh_token: 'b' }), avecSlash));
  verifier(
    "une barre oblique en trop ne double pas dans l'adresse",
    avecSlash[0].url === `${URL_BASE}/auth/v1/token?grant_type=refresh_token`,
    avecSlash[0].url
  );
}

titre('LE CAS QUI A MIS LE SITE À TERRE : un appel qui ne revient jamais');
{
  const debut = Date.now();
  const r = await rafraichirJetons(URL_BASE, CLE, 'jeton', 120, (_url, options) =>
    // Un vrai `fetch` suspendu, qui n'obéit qu'au signal d'abandon : c'est
    // exactement ce que faisait supabase-js, au signal près.
    new Promise((_resoudre, rejeter) => {
      options.signal.addEventListener('abort', () => rejeter(new Error('abandonne')));
    })
  );
  const duree = Date.now() - debut;
  verifier('un appel suspendu rend null', r === null);
  verifier(
    `et il rend la main tout de suite (${duree} ms)`,
    duree < 2000,
    `${duree} ms, alors que la page meurt à 15 000`
  );
}

verifier(
  'le délai reste bien en deçà des 15 secondes de Vercel',
  DELAI_RAFRAICHISSEMENT_MS > 0 && DELAI_RAFRAICHISSEMENT_MS <= 8000,
  `${DELAI_RAFRAICHISSEMENT_MS} ms`
);

bilan("L'échange du jeton de rafraîchissement");
