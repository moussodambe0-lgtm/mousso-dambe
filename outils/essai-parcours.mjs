/**
 * ESSAI DE BOUT EN BOUT : on traverse l'application comme une utilisatrice.
 *
 * Pourquoi ce fichier existe. Les suites de `npm run test:sql` vérifient la
 * base, et elles sont solides : 329 vérifications. Mais elles ne touchent
 * jamais aux formulaires. Le 12 octobre 2026, Arthur s'est retrouvé bloqué sur
 * l'écran de la date du questionnaire : quelle que soit la date choisie,
 * l'écran redemandait la même chose. La cause était dans la plomberie du
 * formulaire, pas dans la base, et aucun test ne pouvait la voir.
 *
 * Ce script remplit les formulaires pour de vrai, en suivant les champs que la
 * page envoie, comme un navigateur. Il demande que la démonstration tourne :
 *
 *   npm run demo        (dans un terminal)
 *   node outils/essai-parcours.mjs
 */
const SITE = 'http://localhost:4322';
const COMPTE = { email: 'awa@essai.bf', motdepasse: 'motdepasse' };

let cookies = new Map();
let total = 0;
let rates = 0;

function verifier(titre, condition, detail = '') {
  total += 1;
  if (condition) {
    console.log(`  ok   ${titre}`);
  } else {
    rates += 1;
    console.log(`  RATÉ ${titre}${detail ? ` — ${detail}` : ''}`);
  }
}

function garderCookies(reponse) {
  for (const brut of reponse.headers.getSetCookie?.() ?? []) {
    const [paire] = brut.split(';');
    const i = paire.indexOf('=');
    cookies.set(paire.slice(0, i), paire.slice(i + 1));
  }
}

function enteteCookie() {
  return [...cookies].map(([n, v]) => `${n}=${v}`).join('; ');
}

async function ouvrir(chemin) {
  const r = await fetch(`${SITE}${chemin}`, {
    headers: { cookie: enteteCookie() },
    redirect: 'manual',
  });
  garderCookies(r);
  return { statut: r.status, vers: r.headers.get('location'), html: await r.text() };
}

async function envoyer(chemin, champs) {
  const r = await fetch(`${SITE}${chemin}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: SITE,
      cookie: enteteCookie(),
    },
    body: new URLSearchParams(champs),
    redirect: 'manual',
  });
  garderCookies(r);
  return { statut: r.status, vers: r.headers.get('location'), html: await r.text() };
}

/** Les champs cachés que la page vient d'écrire : on les renvoie, comme un
 * navigateur le ferait, sans en inventer un seul. */
function champsCaches(html) {
  const champs = {};
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const nom = /name="([^"]*)"/.exec(m[0])?.[1];
    const valeur = /value="([^"]*)"/.exec(m[0])?.[1] ?? '';
    if (nom) champs[nom] = valeur.replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  }
  return champs;
}

// L'avancement s'écrit « 3 / 8 » dans la barre du haut depuis la refonte du
// 12 octobre 2026 (section 3 du cahier d'Arthur : huit questions).
// La barre du haut porte « 3 / 8 » depuis la refonte du 12 octobre 2026
// (section 3 du cahier d'Arthur : huit questions). On lit la classe de la
// jauge plutôt que le texte : Astro pose ses propres attributs sur les
// balises, et un `<span>` nu ne se trouve plus dans la page rendue.
const etapeAffichee = (html) => Number(/class="jauge part-(\d)"/.exec(html)?.[1] ?? 0);
const ilYAJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// --- Le parcours ------------------------------------------------------------

console.log('\nConnexion');
{
  const r = await envoyer('/connexion', COMPTE);
  verifier('la connexion passe', r.statut === 303, `${r.statut}`);
  verifier('le cookie de session est posé', cookies.has('md_session'));
}

console.log('\nLe questionnaire, écran par écran');
// Plus récente que les cycles déjà posés par la démonstration : c'est donc
// elle qui doit commander le calcul du jour affiché à l'accueil.
const JOURS_AVANT = 3;
const DATE_REGLES = ilYAJours(JOURS_AVANT);
{
  let page = await ouvrir('/bienvenue?etape=1');
  verifier("l'écran 1 s'affiche", etapeAffichee(page.html) === 1, `écran ${etapeAffichee(page.html)}`);

  // Écran 1 : le prénom.
  let r = await envoyer('/bienvenue', { ...champsCaches(page.html), prenom: 'Fatoumata' });
  verifier("le prénom fait passer à l'écran 2", etapeAffichee(r.html) === 2, `écran ${etapeAffichee(r.html)}`);

  // Écran 2 : la date, choisie par un des boutons de jour.
  r = await envoyer('/bienvenue', { ...champsCaches(r.html), dernieres: DATE_REGLES });
  verifier(
    'une date choisie fait passer à l’écran 3',
    etapeAffichee(r.html) === 3,
    `écran ${etapeAffichee(r.html)} — c'est le blocage trouvé par Arthur le 12 octobre`
  );

  // Écran 3 : la durée des règles.
  r = await envoyer('/bienvenue', { ...champsCaches(r.html), duree: '6' });
  verifier("la durée fait passer à l'écran 4", etapeAffichee(r.html) === 4, `écran ${etapeAffichee(r.html)}`);

  // Écran 4 : la durée du cycle.
  r = await envoyer('/bienvenue', { ...champsCaches(r.html), cycle: '31' });
  verifier("le cycle fait passer à l'écran 5", etapeAffichee(r.html) === 5, `écran ${etapeAffichee(r.html)}`);

  // La barre du haut doit déjà montrer ce qu'elle a répondu : sans ça, deux
  // écrans qui demandent tous les deux un nombre de jours se ressemblent
  // assez pour qu'on croie que rien ne s'est passé.
  verifier('ce qu’elle a déjà dit est rappelé', r.html.includes('Fatoumata') && r.html.includes('règles 6 j'));
  verifier('et le cycle qu’elle a donné aussi', r.html.includes('cycle 31 j'));

  // Écran 5 : la régularité, qui enregistre tout. Le questionnaire s'arrête
  // ici depuis le 13 octobre 2026 (trois écrans retirés à la demande
  // d'Arthur : ressentis, objectif, protection).
  const fin = await envoyer('/bienvenue', { ...champsCaches(r.html), regularite: 'parfois' });
  verifier(
    "l'enregistrement mène à l'écran de fin",
    fin.statut === 303 && (fin.vers ?? '').includes('fini=1'),
    `${fin.statut} ${fin.vers}`
  );

  const ecranFin = await ouvrir('/bienvenue?fini=1&prenom=Fatoumata');
  verifier('l’écran de fin la remercie par son prénom', ecranFin.html.includes('Merci Fatoumata'));
}

console.log('\nCe qui est vraiment enregistré');
{
  const compte = await ouvrir('/compte');
  verifier('le prénom saisi est enregistré', compte.html.includes('Fatoumata'), 'le prénom a été perdu');
  // La durée du cycle et celle des règles n'ont plus de menu déroulant nulle
  // part dans l'application depuis que « Mon cycle » a été retiré de
  // `/compte` (demande d'Arthur, 13 octobre 2026) : il n'y a donc plus rien à
  // lire à l'écran pour les deux vérifications qui vivaient ici. Leur
  // enregistrement reste couvert, lui, par `supabase/tests/cycle.test.mjs`
  // (`enregistrer_questionnaire`) et par la vérification suivante, qui prouve
  // que le jour du cycle affiché à l'accueil dépend bien de la durée saisie.

  const accueil = await ouvrir('/');
  verifier('le cycle est calculé depuis la date donnée', accueil.html.includes('Jour'), "l'accueil ne montre pas de cycle");
  // Depuis la refonte du haut de l'accueil (12 octobre 2026), le jour du cycle
  // est écrit en toutes lettres dans la carte vedette : « Jour 4 de tes
  // règles » pendant les règles, « Jour 4 de ton cycle » le reste du temps.
  const jour = JOURS_AVANT + 1;
  verifier(
    `on est au jour ${jour} du cycle`,
    new RegExp(`Jour ${jour}\\s+de (tes règles|ton cycle)`).test(accueil.html),
    'le jour affiché ne découle pas de la date donnée au questionnaire'
  );
}

console.log('\nNoter une journée');
{
  const r = await envoyer('/journal', {
    jour: ilYAJours(0),
    flux: 'leger',
    douleur: '1',
    signes: 'fatigue',
    note: 'Essai de bout en bout',
  });
  verifier('la journée est enregistrée', r.statut === 303, `${r.statut}`);
}

console.log('\nCommander');
{
  let r = await envoyer('/panier', { geste: 'ajouter', slug: 'serviettes-nuit-10', quantite: '2' });
  verifier('le produit entre au panier', r.statut === 303, `${r.statut}`);

  const page = await ouvrir('/commande');
  verifier("la page de commande s'ouvre", page.statut === 200, `${page.statut}`);

  r = await envoyer('/commande', {
    nom: 'Fatoumata Ouédraogo',
    telephone: '70112233',
    quartier: 'Zogona',
    repere: 'Derrière le lycée',
    garder: 'oui',
  });
  // Le plafond est de cinq commandes par heure et par compte. Quand on relance
  // cet essai plusieurs fois de suite, c'est LUI qui répond, et il a raison de
  // le faire : ce n'est pas une panne, c'est le garde-fou qui marche. On le
  // dit, et on ne compte pas ça comme un échec.
  const plafondAtteint = r.statut === 200 && /commandes de suite/.test(r.html);
  if (plafondAtteint) {
    console.log('  --   la commande est refusée par le plafond horaire (essai relancé trop souvent)');
  } else {
    verifier(
      'la commande part',
      r.statut === 303 && (r.vers ?? '').includes('/commande-confirmee?numero=MD-'),
      `${r.statut} ${r.vers}`
    );
    if (r.statut === 303 && r.vers) {
      const confirmee = await ouvrir(r.vers);
      verifier('la page de confirmation s’affiche', confirmee.statut === 200, `${confirmee.statut}`);
    }
  }
}

console.log('\nEntrer sans compte');
{
  // Un deuxième jeu de cookies : c'est une autre personne, sur un autre
  // téléphone, qui n'a jamais rien créé.
  const avant = cookies;
  cookies = new Map();

  let r = await envoyer('/commencer', {});
  verifier(
    '« Commencer » mène droit au questionnaire',
    r.statut === 303 && r.vers === '/bienvenue',
    `${r.statut} ${r.vers}`
  );
  verifier('une session est posée sans qu’on ait rien demandé', cookies.has('md_session'));

  const page = await ouvrir('/bienvenue?etape=1');
  verifier('le questionnaire s’ouvre', etapeAffichee(page.html) === 1, `écran ${etapeAffichee(page.html)}`);

  // On remplit d'un coup : ce parcours-ci vérifie l'entrée, pas les écrans.
  r = await envoyer('/bienvenue', {
    etape: '5',
    prenom: 'Salimata',
    dernieres: ilYAJours(2),
    sait: 'oui',
    duree: '5',
    cycle: '29',
    regularite: 'oui',
  });
  verifier('le questionnaire s’enregistre sans compte', r.statut === 303, `${r.statut}`);

  // « Garde ton compte » (email + mot de passe, pour retrouver son compte
  // anonyme sur un autre téléphone) a été retiré de cette page le 13 octobre
  // 2026, à la demande d'Arthur. Ce parcours ne vérifie donc plus que
  // l'entrée et l'enregistrement sans compte : la récupération sur un autre
  // téléphone n'a plus d'écran qui y mène.
  const compte = await ouvrir('/compte');
  verifier('la page Compte montre son prénom', compte.html.includes('Salimata'));
  // La phrase « Sans compte, sans mot de passe » a été supprimée le 13 octobre
  // 2026, à la demande d'Arthur : elle expliquait un manque à quelqu'un qui
  // n'avait rien demandé. Ce qu'on vérifie maintenant, c'est qu'un compte sans
  // email n'affiche AUCUNE ligne d'email, au lieu d'une ligne vide ou d'un
  // « null » écrit en toutes lettres.
  verifier(
    'et n’affiche aucune adresse email',
    !compte.html.includes('Sans compte, sans mot de passe') && !/>\s*null\s*</.test(compte.html)
  );

  const accueil = await ouvrir('/');
  verifier(
    'et son cycle est calculé depuis la date qu’elle avait donnée',
    /Jour 3\s+de (tes règles|ton cycle)/.test(accueil.html),
    'le cycle du compte anonyme n’a pas été calculé'
  );

  cookies = avant;
}

console.log(`\nParcours complet : ${total - rates} sur ${total} vérifications passées.`);
if (rates > 0) process.exitCode = 1;
