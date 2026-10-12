// Ce qui peut être gardé sur le téléphone, et ce qui ne doit l'être nulle part.
//
// Ces vérifications valent la phrase écrite à l'écran : « personne de ton
// entourage ne peut le voir ». Le danger n'est pas un pirate lointain, c'est le
// téléphone qu'on se passe à la maison. Avant l'audit du 12 octobre 2026, une
// copie de l'accueil, avec le jour du cycle et la date des prochaines règles,
// pouvait rester consultable hors connexion après la déconnexion.
//
// Le service worker est chargé pour de vrai, dans un bac à sable, et on rejoue
// les requêtes une par une.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';
import { cheminPublic, gardableParLeTelephone, CHEMINS_PUBLICS } from '../../src/lib/cache.ts';
import { defautDeConfiguration, CLE_DU_BANC_LOCAL } from '../../src/lib/configuration.ts';
import { motCherche, filtreRecherche } from '../../src/lib/recherche.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// --- Le service worker, chargé dans un bac à sable ------------------------
function chargerServiceWorker() {
  const code = fs.readFileSync(path.join(RACINE, 'public', 'sw.js'), 'utf8');
  const ecouteurs = {};
  const reserve = new Map();

  const fausseReserve = {
    match: async (requete) => reserve.get(requete.url) ?? undefined,
    put: async (requete, reponse) => {
      reserve.set(requete.url, reponse);
      return undefined;
    },
    addAll: async () => undefined,
  };
  const fauxCaches = {
    open: async () => fausseReserve,
    keys: async () => ['mousso-dambe-v1'],
    delete: async () => true,
  };
  const fauxSelf = {
    addEventListener: (nom, fn) => {
      ecouteurs[nom] = fn;
    },
    location: { origin: 'https://moussodambe.bf' },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  let reponseDuReseau = null;
  const fauxFetch = async () => {
    if (!reponseDuReseau) throw new Error('réseau coupé');
    return reponseDuReseau.clone();
  };

  const fabrique = new Function('self', 'caches', 'fetch', 'Response', 'URL', code);
  fabrique(fauxSelf, fauxCaches, fauxFetch, Response, URL);

  return {
    /** Rejoue une requête. Renvoie { interceptee, gardee }. */
    async requete(chemin, entetes = {}, { methode = 'GET' } = {}) {
      reponseDuReseau = new Response('<html>page</html>', { status: 200, headers: entetes });
      const requete = new Request(`https://moussodambe.bf${chemin}`, { method: methode });
      /** @type {Promise<Response> | null} */
      let promesse = null;
      ecouteurs.fetch({ request: requete, respondWith: (p) => { promesse = p; } });
      const interceptee = promesse !== null;
      if (interceptee) await Promise.resolve(promesse);
      return { interceptee, gardee: reserve.has(requete.url) };
    },
    reserve,
  };
}

const sw = chargerServiceWorker();

titre("L'accueil ne se garde jamais sur le téléphone");
{
  // L'en-tête que Vercel pose tout seul quand une page n'en demande aucun.
  const DEFAUT_VERCEL = { 'Cache-Control': 'public, max-age=0, must-revalidate' };

  const accueil = await sw.requete('/', DEFAUT_VERCEL);
  verifier("le service worker ne touche pas à l'accueil", accueil.interceptee === false);
  verifier("l'accueil n'entre pas dans la réserve", accueil.gardee === false);

  const cycle = await sw.requete('/cycle', DEFAUT_VERCEL);
  verifier('la page du cycle non plus', cycle.interceptee === false && cycle.gardee === false);
  const journal = await sw.requete('/journal', DEFAUT_VERCEL);
  verifier('le journal non plus', journal.gardee === false);
  const dambe = await sw.requete('/dambe', DEFAUT_VERCEL);
  verifier('la page de Dambé non plus', dambe.gardee === false);
  const commandes = await sw.requete('/commandes', DEFAUT_VERCEL);
  verifier('les commandes non plus', commandes.gardee === false);
}

titre("Le mot « public » seul ne suffit plus à faire garder une page");
{
  const boutiqueDefaut = await sw.requete('/boutique', { 'Cache-Control': 'public, max-age=0, must-revalidate' });
  verifier("une page sans vrai réglage de cache n'est pas gardée", boutiqueDefaut.gardee === false);

  const boutiqueDeclaree = await sw.requete('/boutique', { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' });
  verifier('une page qui se déclare cacheable est gardée', boutiqueDeclaree.gardee === true);

  const boutiqueConnectee = await sw.requete('/boutique/culotte-rose', { 'Cache-Control': 'private, no-store' });
  verifier("la même page vue par une femme connectée n'est pas gardée", boutiqueConnectee.gardee === false);

  const fichier = await sw.requete('/fonts/figtree.woff2', {});
  verifier('une police est gardée, elle ne parle de personne', fichier.gardee === true);
}

titre('La liste des chemins publics ne contient aucune page personnelle');
{
  verifier("« / » n'est pas un chemin public", cheminPublic('/') === false);
  verifier('la boutique est publique', cheminPublic('/boutique') === true);
  verifier('une fiche produit est publique', cheminPublic('/boutique/culotte-rose') === true);
  for (const prive of ['/cycle', '/journal', '/dambe', '/compte', '/commande', '/commandes', '/panier', '/confidentialite', '/connexion', '/inscription', '/bienvenue', '/deconnexion']) {
    verifier(`${prive} n'est pas public`, cheminPublic(prive) === false);
  }
  verifier(
    "aucun chemin public ne ressemble à l'accueil",
    !CHEMINS_PUBLICS.includes('/') && !CHEMINS_PUBLICS.includes('')
  );

  // Le service worker recopie la règle, il ne peut rien importer : on vérifie
  // que les deux disent la même chose.
  const swSource = fs.readFileSync(path.join(RACINE, 'public', 'sw.js'), 'utf8');
  verifier("la liste PRIVE du service worker contient l'accueil", /const PRIVE = \[\s*'\/'/.test(swSource));
  verifier('le service worker exige s-maxage', swSource.includes("includes('s-maxage')"));
  verifier('le service worker refuse no-store', swSource.includes("includes('no-store')"));
}

titre('La règle de mise en réserve, cas par cas');
{
  verifier('rien du tout : on ne garde pas', gardableParLeTelephone('') === false);
  verifier('absent : on ne garde pas', gardableParLeTelephone(null) === false);
  verifier("le défaut de Vercel : on ne garde pas", gardableParLeTelephone('public, max-age=0, must-revalidate') === false);
  verifier('no-store : on ne garde pas', gardableParLeTelephone('private, no-store') === false);
  verifier('private avec s-maxage : on ne garde pas', gardableParLeTelephone('private, s-maxage=60') === false);
  verifier('no-cache : on ne garde pas', gardableParLeTelephone('public, s-maxage=60, no-cache') === false);
  verifier('s-maxage déclaré : on garde', gardableParLeTelephone('public, s-maxage=120') === true);
  verifier('casse différente : on garde quand même', gardableParLeTelephone('Public, S-MaxAge=120') === true);
}

titre("La configuration de production refuse le banc d'essai");
{
  const bon = { urlSupabase: 'https://abc.supabase.co', cleServeur: 'une-cle-tiree-au-hasard-bien-longue', production: true };
  verifier('une vraie configuration passe', defautDeConfiguration(bon) === null);

  verifier(
    'en développement, rien ne bloque',
    defautDeConfiguration({ urlSupabase: 'http://127.0.0.1:5433', cleServeur: CLE_DU_BANC_LOCAL, production: false }) === null
  );
  verifier(
    "la clé du banc est refusée en production",
    (defautDeConfiguration({ ...bon, cleServeur: CLE_DU_BANC_LOCAL }) ?? '').includes("banc")
  );
  verifier(
    'une adresse en http est refusée en production',
    (defautDeConfiguration({ ...bon, urlSupabase: 'http://abc.supabase.co' }) ?? '').includes('https')
  );
  verifier(
    "l'adresse du banc local est refusée en production",
    defautDeConfiguration({ ...bon, urlSupabase: 'http://127.0.0.1:5433' }) !== null
  );
  verifier('une adresse absente est refusée', defautDeConfiguration({ ...bon, urlSupabase: '' }) !== null);
  verifier('une clé absente est refusée', defautDeConfiguration({ ...bon, cleServeur: undefined }) !== null);
  verifier('une clé trop courte est refusée', defautDeConfiguration({ ...bon, cleServeur: 'secret' }) !== null);
}

titre('Le mot cherché dans la boutique ne change pas le filtre de la base');
{
  verifier('un mot normal passe entier', motCherche('culotte') === 'culotte');
  verifier('les accents restent', motCherche('premières règles') === 'premières règles');
  verifier('une virgule disparaît', !motCherche('x,publie.eq.false').includes(','));
  verifier('un point disparaît', !motCherche('x,publie.eq.false').includes('.'));
  verifier('une parenthèse disparaît', !motCherche('a)or(prix_cfa.gt.0').includes(')'));
  verifier('un guillemet disparaît', !motCherche('a"b').includes('"'));
  verifier('une barre oblique inverse disparaît', !motCherche('a\\b').includes('\\'));
  verifier('les jokers de like disparaissent', motCherche('%_%') === '');
  verifier('le mot reste borné à 60 caractères', motCherche('a'.repeat(200)).length === 60);
  const filtre = filtreRecherche(motCherche('x,publie.eq.false'));
  verifier(
    "le filtre fabriqué ne contient que les deux conditions voulues",
    filtre.split('ilike').length === 3 && !filtre.includes('publie.eq'),
    filtre
  );
  verifier(
    'aucune virgule ne peut être injectée dans le filtre',
    filtreRecherche(motCherche('a,b,c')).split(',').length === 2,
    filtreRecherche(motCherche('a,b,c'))
  );
  verifier(
    "une recherche normale garde sa forme habituelle",
    filtreRecherche(motCherche('culotte')) === 'nom.ilike.%culotte%,resume.ilike.%culotte%'
  );
}

bilan('Réserve du téléphone, configuration et recherche');
