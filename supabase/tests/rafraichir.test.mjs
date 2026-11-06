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
import {
  rafraichirJetons,
  connexionAnonyme,
  sansDepasser,
  DELAI_RAFRAICHISSEMENT_MS,
} from '../../src/lib/rafraichir.ts';

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

titre('La limite générique, pour ce qui passe encore par supabase-js');
{
  // `auth.setSession()` rafraîchit le jeton de lui-même quand il le trouve
  // expiré, donc il se suspend de la même façon. Deux écrans l'appellent
  // encore : lier un compte Google, et changer son email ou son mot de passe.
  verifier(
    'une promesse qui répond à temps passe telle quelle',
    (await sansDepasser(Promise.resolve('la vraie valeur'), 500, 'repli')) === 'la vraie valeur'
  );

  const debut = Date.now();
  const r = await sansDepasser(new Promise(() => {}), 100, 'repli');
  const duree = Date.now() - debut;
  verifier('une promesse suspendue rend le repli', r === 'repli');
  verifier(`et elle rend la main tout de suite (${duree} ms)`, duree < 2000, `${duree} ms`);

  let leve = false;
  try {
    await sansDepasser(Promise.reject(new Error('vraie erreur')), 500, 'repli');
  } catch (e) {
    leve = e.message === 'vraie erreur';
  }
  verifier('une vraie erreur reste une erreur, elle n\'est pas masquée', leve);
}

titre('La connexion anonyme : le bouton « Commencer »');
{
  // Le 6 novembre 2026, aucune visiteuse nouvelle ne pouvait entrer dans
  // l'application : `auth.signInAnonymously()` de supabase-js rendait
  // `{ session: null, error: null }` sur le serveur, et la page renvoyait vers
  // l'accueil sans rien dire. Ce que ces vérifications tiennent : que l'appel
  // soit la bonne requête, et surtout QU'UN ÉCHEC SOIT NOMMÉ.
  const journal = [];
  const ok = await connexionAnonyme(
    URL_BASE,
    CLE,
    5000,
    faux(reponseJson(200, { access_token: 'acces', refresh_token: 'rafraichissement' }), journal)
  );
  verifier('une session anonyme rend ses deux jetons', ok.jetons?.access_token === 'acces' && ok.jetons?.refresh_token === 'rafraichissement');
  verifier(
    "l'adresse appelée est celle de l'inscription",
    journal[0].url === `${URL_BASE}/auth/v1/signup`,
    journal[0].url
  );
  verifier('le corps est vide, c\'est ce qui la rend anonyme', journal[0].options.body === '{}');
  verifier('une limite de temps est posée', !!journal[0].options.signal);

  // LE CAS QU'ARTHUR A VU : le réglage est fermé côté Supabase.
  const ferme = await connexionAnonyme(URL_BASE, CLE, 5000, faux(reponseJson(422, { error_code: 'anonymous_provider_disabled' })));
  verifier(
    'un réglage fermé est nommé, pas avalé',
    ferme.motif === 'anonymous_provider_disabled',
    JSON.stringify(ferme)
  );

  const trop = await connexionAnonyme(URL_BASE, CLE, 5000, faux(reponseJson(429, { code: 'over_request_rate_limit' })));
  verifier('une limite de débit est nommée', trop.motif === 'over_request_rate_limit', JSON.stringify(trop));

  const sansCode = await connexionAnonyme(URL_BASE, CLE, 5000, faux(reponseJson(500, {})));
  verifier('un refus sans code garde au moins son statut', sansCode.motif === 'http_500', JSON.stringify(sansCode));

  const vide = await connexionAnonyme(URL_BASE, CLE, 5000, faux(reponseJson(200, { user: null })));
  verifier(
    "une réponse sans jetons est un échec nommé, pas un succès vide",
    vide.motif === 'reponse_sans_jetons',
    JSON.stringify(vide)
  );

  const coupe = await connexionAnonyme(URL_BASE, CLE, 5000, async () => {
    const e = new Error('fetch failed');
    e.cause = { code: 'ENOTFOUND' };
    throw e;
  });
  verifier(
    'une adresse introuvable est nommée précisément',
    coupe.motif === 'injoignable_ENOTFOUND',
    JSON.stringify(coupe)
  );
  const sansCause = await connexionAnonyme(URL_BASE, CLE, 5000, async () => { throw new TypeError('reseau'); });
  verifier('et sans détail, on garde au moins le genre de panne', sansCause.motif === 'injoignable_TypeError', JSON.stringify(sansCause));

  verifier('sans configuration, on ne tente rien', (await connexionAnonyme('', CLE, 5000, faux(reponseJson(200, {})))).motif === 'base_non_configuree');

  const debut = Date.now();
  const suspendu = await connexionAnonyme(URL_BASE, CLE, 100, (_u, o) =>
    new Promise((_r, rejeter) => o.signal.addEventListener('abort', () => rejeter(new Error('abandonne'))))
  );
  verifier('un appel suspendu rend la main', !!suspendu.motif, JSON.stringify(suspendu));
  verifier(`et tout de suite (${Date.now() - debut} ms)`, Date.now() - debut < 2000);
}

bilan("L'échange du jeton de rafraîchissement");
