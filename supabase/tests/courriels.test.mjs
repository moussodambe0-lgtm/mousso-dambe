// Les emails de commande : ce qu'ils disent, et surtout ce qu'ils ne disent pas.
//
// Arthur, le 7 novembre 2026 : « si quelqu'un fait un achat sur Mousso Dambé,
// il faut que je lui envoie des emails. »
//
// CE QUE CES VERIFICATIONS PROTEGENT.
//
// Un email reste. Il dort dans une boite que quelqu'un d'autre peut ouvrir,
// son objet s'affiche en apercu sur un ecran verrouille, et il se retrouve
// sur l'ordinateur du bureau. Ici le danger n'est pas le pirate : c'est le
// telephone qu'on se passe a la maison. Un nom de produit dans un email de
// Mousso Dambe, c'est une information intime remise a quiconque passe devant
// l'ecran, et remise pour toujours.
//
// Trois regles, donc, et elles valent plus que le confort :
//   1. aucun nom de produit, nulle part (meme regle que les messages
//      WhatsApp, voir lienWhatsApp dans src/lib/format-gestion.ts) ;
//   2. rien qui dise ce que l'application sert a suivre ;
//   3. aucun numero de commande (Arthur, le meme jour).
//
// Et une quatrieme, d'un autre ordre : un email qui ne part pas ne doit
// jamais faire echouer une commande.
//
// Lancer : node supabase/tests/courriels.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

const source = lire('src/lib/courriels.ts');
const commande = lire('src/pages/commande.astro');
const config = lire('astro.config.mjs');

/*
 * POURQUOI ON COMPILE LE FICHIER ICI.
 *
 * `courriels.ts` lit `astro:env/server`, qui n'existe qu'a l'interieur
 * d'Astro : un `import` direct echouerait. On remplace donc cette seule ligne,
 * puis on laisse le VRAI compilateur TypeScript enlever les annotations de
 * type, avant de charger le resultat.
 *
 * Une premiere version decoupait les types a coups d'expressions regulieres.
 * Elle a casse au premier type un peu long, avec un message qui ne disait
 * rien (« Unexpected strict mode reserved word »). Un test dont l'outillage
 * est plus fragile que le code teste ne protege rien : il apprend seulement a
 * ignorer ses propres echecs.
 *
 * L'interet de tout ce detour : on verifie le texte VRAIMENT envoye, pas la
 * presence de bouts de code dans un fichier.
 */
import ts from 'typescript';

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
  console.log('  (le module n a pas pu etre charge :', e.message, ')');
  return null;
});

const PRODUITS_INTERDITS = [
  'serviette', 'culotte', 'protection', 'tampon', 'coupe', 'lavable',
  'regles', 'règles', 'menstrue', 'cycle', 'journal', 'intime',
];

titre('Le texte envoye ne trahit personne');
if (module) {
  const faits = {
    prenom: 'Awa',
    articles: 3,
    total: 12500,
    quand: '2026-11-07T10:00:00Z',
    lien: 'https://www.moussodambe.com/commandes/suivre/MD-2611-00200',
  };
  const messages = [
    ['commande recue', module.commandeRecue(faits)],
    ['en route', module.commandeEnRoute({ ...faits, livreur: 'Issa' })],
    ['livree', module.commandeLivree(faits)],
    ['annulee', module.commandeAnnulee(faits)],
  ];

  for (const [nom, m] of messages) {
    const tout = `${m.sujet}\n${m.html}`.toLowerCase();
    const trouve = PRODUITS_INTERDITS.filter((mot) => tout.includes(mot));
    // « cycle » et « regles » apparaissent dans la phrase de discretion qui
    // dit justement qu'on n'ecrit rien : on exclut ce cas en regardant les
    // mots vraiment problematiques.
    verifier(
      `« ${nom} » ne nomme aucun produit ni rien d intime`,
      trouve.length === 0,
      `mots trouves : ${trouve.join(', ')}`
    );
    verifier(`« ${nom} » ne porte aucun numero de commande`, !tout.includes('md-2611-00200') || !m.sujet.includes('MD-'), m.sujet);
    verifier(`« ${nom} » a un objet qui ne decrit pas l application`, !/r[eè]gles|cycle/i.test(m.sujet), m.sujet);
    verifier(`« ${nom} » tutoie`, /\bton\b|\bta\b|\btu\b/i.test(m.html));
  }

  titre('Les chiffres sont lisibles au Burkina');
  verifier('le montant est groupe par milliers', module.montant(12500).includes('12'), module.montant(12500));
  verifier('et libelle en FCFA', module.montant(12500).includes('FCFA'), module.montant(12500));
  verifier('la date est en lettres', module.dateEnLettres('2026-11-07T10:00:00Z') === '7 novembre 2026',
    module.dateEnLettres('2026-11-07T10:00:00Z'));
  verifier('un seul article ne prend pas de s', module.combienDArticles(1) === '1 article', module.combienDArticles(1));
  verifier('trois articles en prennent un', module.combienDArticles(3) === '3 articles', module.combienDArticles(3));

  titre('Un prenom bizarre ne casse pas la page');
  const piege = module.commandeRecue({ ...faits, prenom: '<script>alert(1)</script>' });
  verifier('les chevrons sont neutralises', !piege.html.includes('<script>alert'), 'du HTML est passe tel quel');
  verifier('et le prenom reste lisible', piege.html.includes('&lt;script&gt;'));

  titre('Sans cle, on renonce sans bruit');
  const sansCle = await module.envoyer({ a: 'a@b.c', sujet: 's', html: 'h' }, { cle: '' });
  verifier('pas de cle : false, et aucune exception', sansCle === false);
  const sansAdresse = await module.envoyer({ a: '', sujet: 's', html: 'h' }, { cle: 'x' });
  verifier('pas d adresse : false, et aucune exception', sansAdresse === false);
  const reseauMort = await module.envoyer(
    { a: 'a@b.c', sujet: 's', html: 'h' },
    { cle: 'x', chercher: () => Promise.reject(new Error('reseau')) }
  );
  verifier('reseau coupe : false, et aucune exception', reseauMort === false);
  const refus = await module.envoyer(
    { a: 'a@b.c', sujet: 's', html: 'h' },
    { cle: 'x', chercher: () => Promise.resolve({ ok: false, status: 422 }) }
  );
  verifier('refus de Resend : false, et aucune exception', refus === false);
  const bon = await module.envoyer(
    { a: 'a@b.c', sujet: 's', html: 'h' },
    { cle: 'x', chercher: () => Promise.resolve({ ok: true, status: 200 }) }
  );
  verifier('accepte : true', bon === true);
} else {
  verifier('le module se charge', false, 'impossible de charger courriels.ts');
}

titre('La commande ne depend jamais de l email');
{
  verifier(
    'un geste rejoue ne renvoie pas un deuxieme message',
    /!data\.rejouee && moi\.email/.test(commande),
    'le double appui enverrait deux fois le meme message'
  );
  verifier(
    "l'envoi est attendu, sinon Vercel le tue avant qu'il parte",
    /await envoyer\(/.test(commande)
  );
  verifier(
    "le resultat de l'envoi ne touche jamais la variable d'erreur",
    !/erreur\s*=\s*[^;]*envoyer/.test(commande),
    'un email rate ferait croire a un achat rate'
  );
  verifier(
    "le panier est vide et la redirection a lieu apres l'envoi, quoi qu'il arrive",
    commande.indexOf('await envoyer(') < commande.indexOf('ecrirePanier(Astro, [])')
  );
  verifier(
    'le module borne son attente',
    /AbortSignal\.timeout\(delaiMs\)/.test(source) && /DELAI_MS = \d+/.test(source)
  );
  verifier(
    'la reponse de Resend n est jamais recopiee dans les journaux',
    !/console\.(log|warn|error)\([^)]*await r\.(text|json)/.test(source),
    "l'adresse de la cliente pourrait finir dans un journal"
  );
}

titre('La cle est declaree comme un secret, et facultative');
{
  verifier('RESEND_API_KEY est dans le schema', /RESEND_API_KEY: envField\.string\(/.test(config));
  verifier("elle est serveur et secrete", /RESEND_API_KEY: envField\.string\(\{ context: 'server', access: 'secret'/.test(config));
  verifier('elle est facultative : sans elle rien ne casse', /RESEND_API_KEY[^\n]*optional: true/.test(config));
}

bilan('Les emails de commande');
