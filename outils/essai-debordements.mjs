/**
 * Chercher les débordements horizontaux, sur tous les écrans d'un coup.
 *
 * Après avoir agrandi les écritures partout (13 octobre 2026), un texte peut
 * sortir de l'écran sans que personne le voie : on demande au navigateur
 * lui-même, écran par écran, si quelque chose dépasse la largeur du téléphone.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const SITE = 'http://127.0.0.1:4322';
const PORT = 9471;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  '/', '/cycle', '/cycle/calendrier', '/journal', '/boutique',
  '/boutique/serviettes-lavables-3', '/panier', '/commande', '/commandes',
  '/compte', '/compte/adresse', '/compte/avatar', '/compte/favoris',
  '/parametres', '/parametres/informations', '/parametres/mise-a-jour',
  '/discussions', '/discussions/boutique', '/discussions/medecin',
  '/dambe', '/recherche', '/confidentialite', '/bienvenue',
];

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

const profil = 'C:/Users/larou/Projets/mousso-dambe/captures/.profil-debord';
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
    if (p?.webSocketDebuggerUrl) { adresse = p.webSocketDebuggerUrl; break; }
  } catch { /* pas prêt */ }
  await attendre(300);
}

const ws = new WebSocket(adresse);
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const enCours = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
});
const envoyer = (methode, params = {}) =>
  new Promise((r) => { n += 1; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method: methode, params })); });
const evaluer = async (code) =>
  (await envoyer('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }))
    .result?.result?.value;

await envoyer('Page.enable');
await envoyer('Network.enable');
await envoyer('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await envoyer('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });

let soucis = 0;
for (const page of PAGES) {
  await envoyer('Page.navigate', { url: `${SITE}${page}` });
  await attendre(1400);
  const resultat = await evaluer(`(() => {
    const large = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const coupables = [];
    if (large) {
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > window.innerWidth + 1 || r.left < -1) {
          const s = getComputedStyle(e);
          if (s.position === 'fixed') continue; if (e.closest('[hidden]')) continue;
          coupables.push(e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0]
            + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
        }
      }
    }
    return JSON.stringify({ large, coupables: coupables.slice(0, 8), titre: document.title });
  })()`);
  const { large, coupables } = JSON.parse(resultat ?? '{}');
  if (large) {
    soucis += 1;
    console.log(`  DÉBORDE  ${page}`);
    for (const c of coupables) console.log(`           ${c}`);
  } else {
    console.log(`  ok       ${page}`);
  }
}

console.log(`\n${PAGES.length - soucis} sur ${PAGES.length} écrans tiennent dans la largeur.`);
ws.close();
nav.kill();
