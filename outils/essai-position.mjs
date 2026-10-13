/**
 * « Partager ma position » au moment de commander, dans un vrai navigateur.
 *
 * Arthur, le 13 octobre 2026 : « le partage de position quand on veut
 * commander ne marche pas ». Cet essai va jusqu'au bout : il simule une vraie
 * position à Ouagadougou, appuie sur le bouton comme elle le ferait, et
 * regarde si les deux champs cachés se remplissent et si le quartier cesse
 * d'être obligatoire.
 *
 * À SAVOIR, et c'est la cause la plus probable de ce qu'il a vu : un
 * navigateur ne donne la position QUE sur une adresse sécurisée (https) ou sur
 * localhost. Ouverte depuis un téléphone sur http://192.168.x.x, la fonction
 * n'existe même pas, et aucun code ne peut y changer quoi que ce soit. Cet
 * essai passe par 127.0.0.1, qui est considéré comme sûr.
 *
 *   node outils/essai-position.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9468;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
let total = 0;
let rates = 0;
const verifier = (titre, ok, detail = '') => {
  total += 1;
  if (ok) console.log(`  ok   ${titre}`);
  else {
    rates += 1;
    console.log(`  RATÉ ${titre}${detail ? ` — ${detail}` : ''}`);
  }
};

// Connexion, puis un produit au panier : sans panier, /commande renvoie ailleurs.
const rep = await fetch(`${SITE}/connexion`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
  body: new URLSearchParams({ email: 'awa@essai.bf', motdepasse: 'motdepasse' }),
  redirect: 'manual',
});
let cookie = '';
for (const c of rep.headers.getSetCookie?.() ?? []) {
  const [paire] = c.split(';');
  const [nom, ...reste] = paire.split('=');
  if (nom === 'md_session') cookie = reste.join('=');
}

let panier = '';
const repPanier = await fetch(`${SITE}/panier`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    origin: SITE,
    cookie: `md_session=${cookie}`,
  },
  body: new URLSearchParams({ geste: 'ajouter', slug: 'serviettes-nuit-10', quantite: '1' }),
  redirect: 'manual',
});
for (const c of repPanier.headers.getSetCookie?.() ?? []) {
  const [paire] = c.split(';');
  const [nom, ...reste] = paire.split('=');
  if (nom === 'md_panier') panier = reste.join('=');
}

const profil = path.join(RACINE, 'captures', '.profil-position');
fs.rmSync(profil, { recursive: true, force: true });
const nav = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + profil, '--no-first-run', 'about:blank'],
  { stdio: 'ignore' }
);

let adresse = '';
for (let i = 0; i < 40; i += 1) {
  try {
    const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((c) => c.type === 'page');
    if (p?.webSocketDebuggerUrl) {
      adresse = p.webSocketDebuggerUrl;
      break;
    }
  } catch {
    /* pas prêt */
  }
  await attendre(300);
}

const ws = new WebSocket(adresse);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const enCours = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) {
    enCours.get(m.id)(m);
    enCours.delete(m.id);
  }
});
const envoyer = (methode, params = {}) =>
  new Promise((r) => {
    n += 1;
    enCours.set(n, r);
    ws.send(JSON.stringify({ id: n, method: methode, params }));
  });
const evaluer = async (expression) => {
  const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

await envoyer('Page.enable');
await envoyer('Network.enable');
await envoyer('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });
await envoyer('Network.setCookie', { name: 'md_panier', value: panier, domain: '127.0.0.1', path: '/' });

// La permission de position, accordée comme elle le ferait au téléphone, et
// une position réelle à Ouagadougou (Zogona).
await envoyer('Browser.grantPermissions', { origin: SITE, permissions: ['geolocation'] });
await envoyer('Emulation.setGeolocationOverride', { latitude: 12.3714, longitude: -1.5197, accuracy: 20 });

console.log('\nCommander : partager sa position');
await envoyer('Page.navigate', { url: `${SITE}/commande` });
for (let i = 0; i < 40; i += 1) {
  if (await evaluer(`document.documentElement.dataset.position === 'pret'`)) break;
  await attendre(250);
}

const laPage = await evaluer(`location.pathname`);
verifier('la page de commande est bien ouverte', laPage === '/commande', `${laPage}`);

const cache = await evaluer(`document.querySelector('.position-bouton')?.hidden ?? null`);
verifier('le bouton est visible', cache === false, `hidden = ${cache}`);

const geoLa = await evaluer(`!!navigator.geolocation`);
verifier('le navigateur sait donner une position (adresse sécurisée)', geoLa === true);

await evaluer(`document.querySelector('.position-bouton').click(); 'ok'`);
let rempli = false;
for (let i = 0; i < 40; i += 1) {
  rempli = await evaluer(`!!document.querySelector('.position-lat')?.value`);
  if (rempli) break;
  await attendre(250);
}
verifier('appuyer dessus remplit la latitude', rempli === true);

const coords = await evaluer(
  `document.querySelector('.position-lat').value + ' / ' + document.querySelector('.position-lng').value`
);
verifier(
  'ce sont bien les coordonnées données par le téléphone',
  /^12\.37/.test(coords.split(' / ')[0]) && /^-1\.51/.test(coords.split(' / ')[1]),
  coords
);

const dit = await evaluer(`document.querySelector('.position-dit')?.textContent?.trim()`);
verifier('elle est prévenue que c’est fait', /partagée/i.test(dit ?? ''), `${dit}`);

const quartierLibre = await evaluer(`document.querySelector('#quartier')?.required === false`);
verifier('le quartier n’est plus obligatoire', quartierLibre === true);

// Et la commande part-elle VRAIMENT avec la position ? C'est le seul test qui
// prouve que le bout en bout tient : le reste n'est que de l'affichage.
const envoi = await evaluer(`(async () => {
  const f = document.querySelector('form');
  const d = new FormData(f);
  d.set('quartier', '');
  const r = await fetch('/commande', { method: 'POST', body: new URLSearchParams(d), redirect: 'manual' });
  return r.status + ' ' + (r.type === 'opaqueredirect' ? 'redirigée' : await r.text()).slice(0, 120);
})()`);
verifier(
  'la commande part SANS quartier, avec la seule position',
  /redirigée|303/.test(envoi) || /commande-confirmee/.test(envoi),
  `${envoi}`
);

console.log(`\n${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
