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

const etapeAffichee = (html) => Number(/Question (\d) sur 6/.exec(html)?.[1] ?? 0);
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

  // Écran 5 : la vie privée.
  r = await envoyer('/bienvenue', champsCaches(r.html));
  verifier("on arrive au récapitulatif", etapeAffichee(r.html) === 6, `écran ${etapeAffichee(r.html)}`);

  // Le récapitulatif doit montrer ce qu'elle a répondu, pas les valeurs par défaut.
  verifier('le récapitulatif montre son prénom', r.html.includes('Fatoumata'));
  verifier('le récapitulatif montre 6 jours de règles', r.html.includes('6 jours'));
  verifier('le récapitulatif montre un cycle de 31 jours', r.html.includes('31 jours'));

  // Écran 6 : on enregistre.
  const fin = await envoyer('/bienvenue', champsCaches(r.html));
  verifier("l'enregistrement renvoie à l'accueil", fin.statut === 303 && (fin.vers ?? '').includes('bienvenue=1'), `${fin.statut} ${fin.vers}`);
}

console.log('\nCe qui est vraiment enregistré');
{
  const compte = await ouvrir('/compte');
  verifier('le prénom saisi est enregistré', compte.html.includes('Fatoumata'), 'le prénom a été perdu');
  verifier(
    'la durée du cycle saisie est enregistrée',
    /<option value="31" selected/.test(compte.html),
    'le cycle est resté à sa valeur par défaut'
  );
  verifier(
    'la durée des règles saisie est enregistrée',
    /<option value="6" selected/.test(compte.html),
    'la durée est restée à sa valeur par défaut'
  );

  const accueil = await ouvrir('/');
  verifier('le cycle est calculé depuis la date donnée', accueil.html.includes('Jour'), "l'accueil ne montre pas de cycle");
  const jour = JOURS_AVANT + 1;
  verifier(
    `on est au jour ${jour} du cycle`,
    new RegExp(`>\\s*${jour}\\s*<`).test(accueil.html),
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
  });
  verifier('la commande part', r.statut === 303 && (r.vers ?? '').includes('nouvelle=MD-'), `${r.statut} ${r.vers}`);
}

console.log(`\nParcours complet : ${total - rates} sur ${total} vérifications passées.`);
if (rates > 0) process.exitCode = 1;
