// Les trous trouvés le 8 novembre 2026, et qui ne doivent pas se rouvrir.
//
// Une vérification par correctif, et chacune échoue si on retire le correctif.
// L'ordre suit la gravité, du plus coûteux au moins coûteux.
//
//   1. LE RELAIS DES TUILES. Notre serveur va chercher des images chez
//      OpenStreetMap. Le filtre de zone était bon ; ce qui manquait, c'est
//      qu'une tuile n'ait QU'UNE adresse. « 18 », « 018 », « 18.0 », « 0x12 »,
//      « 1.8e1 » et « ?n'importe quoi » désignaient tous la même image, et le
//      réseau de diffusion range ses réponses par adresse complète : chaque
//      forme réveillait la fonction et faisait repartir une requête chez
//      OpenStreetMap, sous notre nom. Leur politique d'usage interdit cela, et
//      leur réponse est le blocage : le fond de carte s'éteindrait pour TOUTES
//      les clientes.
//
//   2. LE TYPE D'UN VOCAL était servi sur parole. La base le tient par une
//      contrainte de colonne, mais c'était la seule serrure, et cette valeur
//      décide de la façon dont un navigateur interprète des octets. Celui qui
//      ouvre les vocaux d'une cliente, c'est l'espace de gestion.
//
//   3. L'OBJET D'UN EMAIL n'est pas du HTML, et il tient sur une ligne.
//
// Lancer : node supabase/tests/audit-8-novembre.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { verifier, bilan, titre } from './banc.mjs';
import { segmentCanonique, tuileAutorisee, tuileDuPoint } from '../../src/lib/tuiles.ts';
import { deconnexionSupabase } from '../../src/lib/rafraichir.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

// Les commentaires d'un fichier parlent de ce qu'on a refusé de faire : une
// vérification qui cherche l'absence de quelque chose doit regarder le code, pas
// les explications. Ce piège a déjà coûté deux fausses alertes le 7 novembre.
const sansCommentaires = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');

const route = lire('src/pages/tuile/[z]/[x]/[y].png.ts');
const routeNue = sansCommentaires(route);
const vocal = sansCommentaires(lire('src/pages/vocal/[id].ts'));

// ---------------------------------------------------------------------------
titre('Une tuile, une seule adresse');
// ---------------------------------------------------------------------------
{
  // Ce qui doit passer : un entier décimal écrit normalement, et rien d'autre.
  verifier('« 15 » est accepté', segmentCanonique('15'));
  verifier('« 0 » est accepté, c’est une vraie colonne', segmentCanonique('0'));
  verifier('« 262143 » est accepté (dernière colonne du zoom 18)', segmentCanonique('262143'));

  // Ce qui ne doit plus passer. Chacune de ces formes donne le MÊME nombre pour
  // `Number()`, donc la même tuile, sous une adresse différente.
  const formes = [
    ['un zéro en tête', '018'],
    ['deux zéros en tête', '0018'],
    ['une virgule', '18.0'],
    ['un point tout court', '18.'],
    ['la notation exponentielle', '1.8e1'],
    ['l’autre notation exponentielle', '18e0'],
    ['l’hexadécimal', '0x12'],
    ['le signe plus', '+18'],
    ['le signe moins', '-1'],
    ['un moins zéro', '-0'],
    ['une espace devant', ' 18'],
    ['une espace derrière', '18 '],
    ['une tabulation', '\t18'],
    ['un saut de ligne', '\n18'],
    ['le séparateur de milliers de JavaScript', '1_8'],
    ['le vide', ''],
    ['l’infini écrit en lettres', 'Infinity'],
    ['un nombre démesuré', '99999999999'],
  ];
  for (const [quoi, brut] of formes) {
    verifier(`${quoi} est refusé (« ${JSON.stringify(brut)} »)`, !segmentCanonique(brut));
  }

  // La preuve que ces formes désignaient bien la même tuile : sans le filtre de
  // forme, le filtre de zone les acceptait toutes.
  const ouaga = tuileDuPoint(12.3714, -1.5197, 15);
  verifier(
    'le filtre de zone, lui, ne voyait aucune différence',
    tuileAutorisee(Number('015'), ouaga.x, ouaga.y) &&
      tuileAutorisee(Number('15.0'), ouaga.x, ouaga.y) &&
      tuileAutorisee(Number('0x0f'), ouaga.x, ouaga.y),
    'c’est pour cela que le filtre de forme ne peut pas vivre dans tuileAutorisee seule'
  );

  verifier(
    'la route refuse toute chaîne de requête',
    /if \(url\.search\) return new Response\(null, \{ status: 404/.test(routeNue),
    '?n’importe=quoi redevenait une réserve vide par requête'
  );
  verifier(
    'la route vérifie la forme des trois segments',
    /segmentCanonique\(params\.z\)/.test(routeNue) &&
      /segmentCanonique\(params\.x\)/.test(routeNue) &&
      /segmentCanonique\(params\.y\)/.test(routeNue),
    'oublier un seul des trois rouvre le trou en entier'
  );
  verifier(
    'les deux refus passent AVANT la requête chez OpenStreetMap',
    routeNue.indexOf('url.search') < routeNue.indexOf('fetch(') &&
      routeNue.indexOf('segmentCanonique(params.z)') < routeNue.indexOf('fetch('),
    'un filtre placé après la requête ne protège rien'
  );
  verifier(
    'un refus de forme n’est jamais mis en réserve',
    /const REFUS = \{ 'Cache-Control': 'no-store' \}/.test(routeNue)
  );
}

// ---------------------------------------------------------------------------
titre('Le relais sortant ne suit personne et n’avale rien d’illimité');
// ---------------------------------------------------------------------------
{
  verifier(
    'une redirection amont n’est pas suivie',
    /redirect: 'error'/.test(routeNue),
    "sinon le serveur d'en face choisit à qui notre serveur parle, et le résultat ressort sous notre domaine avec un cache d'un an"
  );
  verifier(
    'la règle est la même que pour l’assistante, et c’est voulu',
    /redirect: 'error'/.test(sansCommentaires(lire('src/lib/ollama.ts'))),
    'les deux relais sortants du projet doivent dire la même chose'
  );
  verifier('un poids maximum est posé', /POIDS_MAXI = 512 \* 1024/.test(routeNue));
  verifier(
    'le poids annoncé est vérifié',
    /content-length[\s\S]{0,160}POIDS_MAXI/.test(routeNue)
  );
  verifier(
    'et le poids réel aussi, parce qu’un en-tête se trompe',
    /byteLength > POIDS_MAXI/.test(routeNue)
  );
  verifier(
    'le corps n’est plus relayé en flux sans être compté',
    !/new Response\(amont\.body/.test(routeNue),
    'amont.body traversait le serveur sans jamais être mesuré'
  );

  // Ce qui ne doit PAS avoir changé en chemin.
  verifier('la tuile servie est toujours gardée un an', /s-maxage=\$\{UN_AN\}/.test(route));
  verifier('le serveur s’identifie toujours', /'User-Agent': 'MoussoDambe/.test(route));
  verifier('la requête reste bornée dans le temps', /AbortSignal\.timeout\(6000\)/.test(route));
  verifier('la licence ODbL est toujours citée', /ODbL/.test(route));
  verifier(
    'le type de sortie reste imposé par nous',
    /'Content-Type': 'image\/png'/.test(routeNue),
    'on ne sert jamais le type que le serveur d’en face annonce'
  );
}

// ---------------------------------------------------------------------------
titre('Un vocal ne sort qu’avec un type que nous connaissons');
// ---------------------------------------------------------------------------
{
  verifier(
    'la route porte sa propre liste de types',
    /const TYPES = \['audio\/webm', 'audio\/mp4', 'audio\/ogg'\]/.test(vocal)
  );
  verifier(
    'et elle la vérifie avant de rendre les octets',
    vocal.indexOf('TYPES.includes(type)') > 0 &&
      vocal.indexOf('TYPES.includes(type)') < vocal.indexOf("Buffer.from(String(data.base64)"),
    'un type inattendu servi depuis notre domaine, c’est du code qui s’exécute chez qui ouvre le fichier'
  );
  verifier(
    'un type refusé répond comme « introuvable », sans renseigner',
    /TYPES\.includes\(type\)\) return new Response\('Introuvable', \{ status: 404/.test(vocal)
  );
  verifier(
    'les deux routes de média disent maintenant la même chose',
    /const TYPES = \[/.test(sansCommentaires(lire('src/pages/photo-avis/[id].ts'))) &&
      /const TYPES = \[/.test(vocal),
    'la route des photos le faisait déjà, celle des vocaux non'
  );
  // La serrure de la base, celle qui rendait le défaut non exploitable
  // aujourd'hui. Si elle disparaissait, la route tiendrait seule désormais.
  verifier(
    'la base contraint toujours la colonne, elle aussi',
    /type_mime text not null check \(type_mime in \('audio\/webm', 'audio\/mp4', 'audio\/ogg'\)\)/.test(
      lire('supabase/migrations/20261013140000_vocaux.sql')
    )
  );
}

// ---------------------------------------------------------------------------
titre('« Je me déconnecte » ferme vraiment la session chez Supabase');
// ---------------------------------------------------------------------------
// LE DÉFAUT QUE ÇA GARDE FERMÉ. `client.auth.signOut({ scope: 'local' })` ne
// révoquait RIEN : `clientSession()` ne pose le jeton que dans un en-tête, donc
// la partie « auth » de supabase-js n'avait aucune session à fermer. Le jeton de
// rafraîchissement restait valable des semaines, et une copie de l'ancien cookie
// rouvrait le compte. Dans une application dont le danger numéro un est le
// téléphone qu'on se passe à la maison, c'est le défaut le plus cher de tous.
{
  const sortie = sansCommentaires(lire('src/pages/deconnexion.ts'));

  verifier(
    'la déconnexion ne passe plus par auth.signOut',
    !/auth\.signOut/.test(sortie),
    'un appel auth.* côté serveur, sans session chargée, ne ferme rien'
  );
  verifier(
    'elle appelle la révocation écrite à la main',
    /deconnexionSupabase\(/.test(sortie)
  );
  verifier(
    'et elle lui donne le jeton d’accès, qui désigne la session à fermer',
    /deconnexionSupabase\([^)]*jeton\.access_token/.test(sortie),
    'c’est exactement ce qui manquait à l’appel d’avant'
  );
  verifier(
    'la révocation passe AVANT la suppression des cookies',
    sortie.indexOf('deconnexionSupabase(') < sortie.indexOf('retirerSession('),
    'sans le jeton, il n’y a plus rien à révoquer'
  );
  // L'indentation EST la vérification : deux espaces veut dire « hors du bloc
  // conditionnel », quatre voudrait dire « seulement si la révocation a été
  // tentée ». Déplacer cette ligne dans le `if` ferait tomber cet essai.
  verifier(
    'mais les cookies partent dans TOUS les cas, hors du bloc conditionnel',
    /\n {2}retirerSession\(contexte as never\);/.test(sortie),
    'jamais laisser quelqu’une connectée parce que la révocation a raté'
  );
  verifier(
    'une déconnexion en GET reste impossible',
    /export const GET: APIRoute = \(contexte\) => contexte\.redirect/.test(sortie),
    'elle partirait depuis une image posée sur un autre site'
  );

  // Et le comportement de la fonction elle-même, rejoué.
  const appels = [];
  const faux = (statut) => async (adresse, options) => {
    appels.push({ adresse, options });
    return { ok: statut >= 200 && statut < 300, status: statut };
  };

  const fait = await deconnexionSupabase('https://base.exemple.co/', 'cle', 'jeton-acces', 50, faux(204));
  verifier('204 : la session est fermée', fait === true);
  verifier(
    'l’adresse appelée est bien celle de la déconnexion',
    appels[0]?.adresse === 'https://base.exemple.co/auth/v1/logout?scope=local',
    appels[0]?.adresse
  );
  verifier(
    'le jeton de la session voyage en Bearer',
    appels[0]?.options?.headers?.Authorization === 'Bearer jeton-acces'
  );
  verifier(
    'seule CETTE session est fermée, pas son autre téléphone',
    appels[0]?.adresse.includes('scope=local'),
    'on ne déconnecte pas de partout sans qu’elle l’ait demandé'
  );
  verifier('la requête est bornée', appels[0]?.options?.signal != null);

  verifier(
    'un jeton déjà périmé compte comme fermé',
    (await deconnexionSupabase('https://b.co', 'c', 'j', 50, faux(401))) === true,
    'la session est fermée de toute façon, il n’y a rien à réparer'
  );
  verifier(
    'un refus du serveur rend false, sans exception',
    (await deconnexionSupabase('https://b.co', 'c', 'j', 50, faux(500))) === false
  );
  verifier(
    'un réseau mort rend false, sans exception',
    (await deconnexionSupabase('https://b.co', 'c', 'j', 50, async () => {
      throw new Error('réseau coupé');
    })) === false
  );
  verifier(
    'une base qui ne répond jamais ne bloque pas la page',
    (await deconnexionSupabase('https://b.co', 'c', 'j', 30, () => new Promise(() => {}))) === false,
    'un try/catch attrape une erreur, il n’attrape pas une lenteur'
  );
  verifier(
    'sans jeton, on n’appelle personne',
    (await deconnexionSupabase('https://b.co', 'c', '', 50, faux(204))) === false
  );
}

// ---------------------------------------------------------------------------
titre('Un objet d’email est du texte, sur une seule ligne');
// ---------------------------------------------------------------------------
{
  // Même technique que courriels.test.mjs : le module importe `astro:env/server`,
  // qui n'existe pas hors d'Astro. On le remplace et on transpile.
  const source = lire('src/lib/courriels.ts');
  const javascript = ts.transpileModule(
    source.replace(
      /^import \{ RESEND_API_KEY \} from 'astro:env\/server';$/m,
      "const RESEND_API_KEY = '';"
    ),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
  ).outputText;

  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(javascript, 'utf8').toString('base64')
  ).catch((e) => {
    console.log('  (le module n’a pas pu être chargé :', e.message, ')');
    return null;
  });

  if (!module) {
    verifier('le module des courriels se charge', false, 'transpilation impossible');
  } else {
    verifier(
      'un retour à la ligne disparaît de l’objet',
      module.sujetPropre('Ouaga 2000\r\nBcc: ailleurs@exemple.com') ===
        'Ouaga 2000 Bcc: ailleurs@exemple.com',
      module.sujetPropre('Ouaga 2000\r\nBcc: ailleurs@exemple.com')
    );
    verifier(
      'une tabulation aussi',
      !module.sujetPropre('Zone\tdu bois').includes('\t'),
      module.sujetPropre('Zone\tdu bois')
    );
    verifier(
      'un caractère de commande invisible aussi',
      !module.sujetPropre('Pissy\u0000\u001b').includes('\u001b')
    );
    verifier(
      'l’objet est borné',
      module.sujetPropre('x'.repeat(400)).length === 120,
      String(module.sujetPropre('x'.repeat(400)).length)
    );
    verifier(
      'mais une esperluette reste une esperluette',
      module.sujetPropre('Zone & bois') === 'Zone & bois',
      module.sujetPropre('Zone & bois')
    );
    verifier(
      'et une apostrophe aussi : Patte d’Oie existe',
      module.sujetPropre('Patte d’Oie') === 'Patte d’Oie'
    );

    // L'objet de l'email de la boutique porte le quartier, tapé par la cliente.
    const pourLaBoutique = module.nouvelleCommandePourLaBoutique({
      nom: 'Awa',
      quartier: 'Tanghin\r\nBcc: ailleurs@exemple.com',
      articles: 2,
      total: 9000,
      lien: 'https://www.moussodambe.com/vendeur/commandes',
    });
    verifier(
      'le quartier d’une commande n’injecte pas de ligne dans l’objet',
      !/[\r\n]/.test(pourLaBoutique.sujet),
      JSON.stringify(pourLaBoutique.sujet)
    );
    verifier(
      'et il n’arrive plus échappé en HTML dans la boîte d’Arthur',
      module.nouvelleCommandePourLaBoutique({
        nom: 'Awa', quartier: 'Zone & bois', articles: 1, total: 1, lien: '/',
      }).sujet.includes('Zone & bois'),
      'un objet est du texte, pas du HTML'
    );
    // Le nom et le quartier restent échappés dans le CORPS, qui est du HTML.
    verifier(
      'dans le corps, les chevrons sont toujours neutralisés',
      module
        .nouvelleCommandePourLaBoutique({
          nom: '<script>alert(1)</script>', quartier: 'Pissy', articles: 1, total: 1, lien: '/',
        })
        .html.includes('&lt;script&gt;')
    );

    titre('Une seule adresse, et sur une seule ligne');
    const refuse = async (adresse) =>
      (await module.envoyer({ a: adresse, sujet: 's', html: 'h' }, { cle: 'x' })) === false;
    verifier('une virgule est refusée', await refuse('a@b.c,autre@d.e'));
    verifier('un point-virgule aussi', await refuse('a@b.c;autre@d.e'));
    verifier('une espace aussi', await refuse('a@b.c autre@d.e'));
    verifier('un retour à la ligne aussi', await refuse('a@b.c\r\nBcc: autre@d.e'));
    verifier('des chevrons aussi', await refuse('<a@b.c>'));
    verifier('une adresse démesurée aussi', await refuse(`${'x'.repeat(300)}@b.c`));
    // Et la vérification qui empêche la précédente d'être creuse : une adresse
    // ordinaire doit toujours partir.
    let partie = false;
    await module.envoyer(
      { a: 'awa@exemple.com', sujet: 's', html: 'h' },
      {
        cle: 'x',
        chercher: async () => {
          partie = true;
          return { ok: true, status: 200 };
        },
      }
    );
    verifier('une adresse ordinaire part toujours', partie, 'le filtre est trop serré');
  }
}

bilan('Les trous du 8 novembre 2026');
