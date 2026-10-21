/**
 * Capture chaque écran de l'application, en 390 px de large, comme sur un
 * téléphone.
 *
 * Lire le code prouve ce que fait l'application ; seul le rendu prouve qu'elle
 * est regardable. Ce script pilote Chrome sans interface par le protocole
 * DevTools (le WebSocket est celui de Node, aucune dépendance en plus).
 *
 * Avant de le lancer : le banc local (outils/banc-local/serveur.mjs) et
 * `npx astro dev --port 4322` doivent tourner.
 *
 *   node outils/captures.mjs
 *
 * Les images sortent dans captures/. Elles servent à juger, pas à être
 * livrées : le dossier est ignoré par Git.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'captures');
const SITE = 'http://127.0.0.1:4322';
// Depuis le 21 octobre 2026, la gestion repond sur son propre sous-domaine :
// /admin et /vendeur sont introuvables sur l'adresse des clientes. Les
// navigateurs resolvent tout *.localhost vers la machine, donc rien a installer.
const SITE_ADMIN = 'http://admin.localhost:4322';
const PORT_DEBUG = 9333;

// L'adresse de l'administrateur n'est ecrite nulle part dans le depot : elle est
// lue dans le coffre, hors du depot, comme le font le banc local et
// outils/nommer-admin.mjs. Sans elle, les ecrans de gestion sont sautes plutot
// que photographies de travers.
const COFFRE = 'C:/Users/larou/OneDrive/Desktop/Jarvis/secrets/.env';

function adresseAdmin() {
  if (!fs.existsSync(COFFRE)) return null;
  for (const ligne of fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/)) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith('#')) continue;
    const m = /^(.+?)\s*=\s*(.*)$/.exec(propre);
    if (m && /e-?mail.*admin.*mousso/i.test(m[1].trim())) {
      const v = m[2].trim();
      if (v) return v;
    }
  }
  return null;
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.error("Aucun navigateur trouvé. Installer Chrome, ou corriger la liste dans ce fichier.");
  process.exit(1);
}

const ECRANS = [
  { nom: '01-ouverture', url: '/ouverture', connectee: false },
  { nom: '03-connexion', url: '/connexion', connectee: false },
  { nom: '04-accueil', url: '/', connectee: true },
  { nom: '04b-accueil-ecran', url: '/', connectee: true, ecranSeul: true },
  {
    nom: '04c-banniere-2',
    url: '/',
    connectee: true,
    ecranSeul: true,
    // On rend la main au doigt AVANT de faire glisser : sinon le défilement
    // automatique reprend la bande et nous ramène à sa propre carte, et on
    // capture la mauvaise.
    prepare: `const r = document.getElementById('vedettes');
      r.dispatchEvent(new Event('pointerdown'));
      r.scrollTo({ left: r.children[1].offsetLeft - r.offsetLeft });
      await new Promise((x) => setTimeout(x, 600));`,
  },
  {
    nom: '04d-banniere-3',
    url: '/',
    connectee: true,
    ecranSeul: true,
    prepare: `const r = document.getElementById('vedettes');
      r.dispatchEvent(new Event('pointerdown'));
      r.scrollTo({ left: r.children[2].offsetLeft - r.offsetLeft });
      await new Promise((x) => setTimeout(x, 600));`,
  },
  { nom: '05-questionnaire-1', url: '/bienvenue?etape=1', connectee: true },
  { nom: '05b-questionnaire-2', url: '/bienvenue?etape=2', connectee: true },
  { nom: '05c-questionnaire-3', url: '/bienvenue?etape=3', connectee: true },
  { nom: '05d-questionnaire-4', url: '/bienvenue?etape=4', connectee: true },
  { nom: '05e-questionnaire-5', url: '/bienvenue?etape=5', connectee: true },
  // Le questionnaire s'arrête à l'étape 5 depuis le 13 octobre 2026 (trois
  // pages retirées à la demande d'Arthur : ressentis, objectif, protection).
  { nom: '05i-questionnaire-fin', url: '/bienvenue?fini=1&prenom=Awa', connectee: true },
  { nom: '08-cycle', url: '/cycle', connectee: true },
  { nom: '08b-calendrier', url: '/cycle/calendrier', connectee: true },
  { nom: '09-journal', url: '/journal', connectee: true },
  { nom: '10-dambe', url: '/dambe', connectee: true },
  { nom: '11-boutique', url: '/boutique', connectee: true },
  { nom: '11b-recherche', url: '/recherche?q=serviettes+lavables', connectee: true },
  { nom: '12-produit', url: '/boutique/culotte-flux-abondant', connectee: true },
  { nom: '13-panier', url: '/panier', connectee: true },
  { nom: '14-commande', url: '/commande', connectee: true },
  { nom: '15-commandes', url: '/commandes', connectee: true },
  { nom: '16-compte', url: '/compte', connectee: true },
  { nom: '17-confidentialite', url: '/confidentialite', connectee: true },
  { nom: '18-panier-vide', url: '/panier?vide=1', connectee: false },
  { nom: '19-introuvable', url: '/cette-page-nexiste-pas', connectee: true },
  { nom: '20-discussions', url: '/discussions', connectee: true },
  { nom: '21-fil-boutique', url: '/discussions/boutique', connectee: true },
  { nom: '21b-fil-medecin', url: '/discussions/medecin', connectee: true },
  { nom: '22-fil-boutique-produit', url: '/discussions/boutique?produit=culotte-flux-abondant', connectee: true },
  // La gestion, sur son sous-domaine et avec le seul compte qui y entre.
  { nom: '23-admin-messages', url: '/admin', connectee: true, admin: true },
  { nom: '24-admin-commandes', url: '/admin?vue=commandes', connectee: true, admin: true },
  { nom: '25-gestion-tableau', url: '/vendeur', connectee: true, admin: true },
  { nom: '26-gestion-produits', url: '/vendeur/produits', connectee: true, admin: true },
  { nom: '27-gestion-commandes', url: '/vendeur/commandes', connectee: true, admin: true },
  { nom: '28-gestion-messages', url: '/vendeur/messages', connectee: true, admin: true },
  // Ce qu'une cliente voit si elle devine l'adresse de la gestion.
  { nom: '29-gestion-introuvable', url: '/vendeur', connectee: true },
];

/** Se connecte comme le ferait un téléphone, et récupère le cookie de session. */
async function cookieDeSession(base = SITE, email = 'awa@essai.bf') {
  const reponse = await fetch(`${base}/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ email, motdepasse: 'motdepasse' }),
    redirect: 'manual',
  });
  const brut = reponse.headers.getSetCookie?.() ?? [];
  for (const c of brut) {
    const [paire] = c.split(';');
    const [nom, ...reste] = paire.split('=');
    if (nom === 'md_session') return reste.join('=');
  }
  throw new Error(`La connexion au banc local a échoué (${base}) : le cookie n'est pas revenu.`);
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function cible() {
  for (let essai = 0; essai < 40; essai += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT_DEBUG}/json/list`);
      const liste = await r.json();
      const page = liste.find((c) => c.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* le navigateur n'est pas encore prêt */
    }
    await attendre(300);
  }
  throw new Error("Chrome n'a pas ouvert son port de pilotage.");
}

function pilote(ws) {
  let numero = 0;
  const attentes = new Map();
  ws.addEventListener('message', (e) => {
    const lu = JSON.parse(e.data);
    if (lu.id && attentes.has(lu.id)) {
      const { ok, ko } = attentes.get(lu.id);
      attentes.delete(lu.id);
      if (lu.error) ko(new Error(lu.error.message));
      else ok(lu.result);
    }
  });
  return (methode, params = {}) =>
    new Promise((ok, ko) => {
      numero += 1;
      attentes.set(numero, { ok, ko });
      ws.send(JSON.stringify({ id: numero, method: methode, params }));
    });
}

fs.mkdirSync(SORTIE, { recursive: true });

// Le profil du navigateur est jeté à chaque fois. Sans ça, l'agent de service
// de l'application (public/sw.js) garde les feuilles de style de la dernière
// fois : le 12 octobre 2026, un anneau tout neuf s'est affiché sans ses
// couleurs pendant deux captures, et la cause n'était pas dans le code.
fs.rmSync(path.join(SORTIE, '.profil'), { recursive: true, force: true });
const cookie = await cookieDeSession();

// La gestion a sa propre adresse et sa propre session : il faut donc un second
// cookie, obtenu avec la seule adresse qui y entre. Sans coffre sur cette
// machine, les écrans de gestion sont sautés plutôt que photographiés de
// travers : une capture d'un écran de refus ne prouve rien sur la gestion.
const EMAIL_ADMIN = adresseAdmin();
let cookieAdmin = null;
if (EMAIL_ADMIN) {
  cookieAdmin = await cookieDeSession(SITE_ADMIN, EMAIL_ADMIN);
} else {
  console.log("Coffre introuvable : les écrans de gestion sont sautés.");
}

const navigateur = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT_DEBUG}`,
    '--user-data-dir=' + path.join(RACINE, 'captures', '.profil'),
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

try {
  const adresse = await cible();
  const ws = new WebSocket(adresse);
  await new Promise((ok, ko) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => ko(new Error('WebSocket refusé')), { once: true });
  });
  const envoyer = pilote(ws);

  await envoyer('Page.enable');
  await envoyer('Network.enable');
  // Un vrai téléphone d'entrée de gamme : 390 px, écran dense, mode tactile.
  await envoyer('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  for (const ecran of ECRANS) {
    // Un écran de gestion vit sur l'autre adresse, avec l'autre session.
    if (ecran.admin && !cookieAdmin) continue;
    const base = ecran.admin ? SITE_ADMIN : SITE;

    await envoyer('Network.clearBrowserCookies');
    if (ecran.connectee) {
      await envoyer('Network.setCookie', {
        name: 'md_session',
        value: ecran.admin ? cookieAdmin : cookie,
        url: base,
        path: '/',
        httpOnly: true,
      });
    }
    // Le panier vit dans un cookie du téléphone : sans lui, les écrans du
    // panier et de la commande renvoient vers la boutique.
    if (['13-panier', '14-commande'].includes(ecran.nom)) {
      await envoyer('Network.setCookie', {
        name: 'md_panier',
        value: encodeURIComponent(
          JSON.stringify([
            { slug: 'culotte-flux-abondant', taille: 'M', quantite: 1 },
            { slug: 'serviettes-nuit-10', quantite: 2 },
          ])
        ),
        url: SITE,
        path: '/',
      });
    }

    await envoyer('Page.navigate', { url: `${base}${ecran.url}` });
    // Le temps du rendu serveur, puis des animations d'arrivée (1,5 s au plus).
    await attendre(2200);

    // Les images sous la ligne de flottaison ne se chargent qu'au défilement :
    // sans ce passage, la capture pleine page les montrerait vides.
    await envoyer('Runtime.evaluate', {
      expression: `(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 700));
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 400));
      })()`,
      awaitPromise: true,
    });

    // Une préparation propre à l'écran : faire glisser un carrousel, ouvrir un
    // panneau. Sans ça, on ne capture jamais que la première carte d'une
    // bande qui défile, et on ne voit pas ce qu'elle montre ensuite.
    if (ecran.prepare) {
      await envoyer('Runtime.evaluate', {
        expression: `(async () => { ${ecran.prepare} })()`,
        awaitPromise: true,
      });
      await attendre(900);
    }

    // `ecranSeul` ne prend que ce qu'on voit, sans dérouler la page : c'est le
    // seul moyen de juger ce qui est posé en bas de l'écran (la barre basse,
    // la bulle de la mascotte). Sur une capture déroulée, ces éléments
    // flottent au milieu de rien et on ne peut rien en dire.
    const { data } = await envoyer('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !ecran.ecranSeul,
      clip: ecran.ecranSeul ? { x: 0, y: 0, width: 390, height: 844, scale: 2 } : undefined,
    });
    fs.writeFileSync(path.join(SORTIE, `${ecran.nom}.png`), Buffer.from(data, 'base64'));
    console.log(`  ${ecran.nom}.png`);
  }

  ws.close();
  console.log(`\n${ECRANS.length} captures dans ${SORTIE}`);
} finally {
  navigateur.kill();
}
