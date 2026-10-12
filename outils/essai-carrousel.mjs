/**
 * Le carrousel de l'accueil ne doit JAMAIS remonter la page.
 *
 * Arthur, le 12 octobre 2026 : « quand je défile vers le bas, dès que le
 * panneau change d'image, l'accueil revient vers le haut ». La cause était
 * `scrollIntoView` : la bande n'étant plus à l'écran, le navigateur remontait
 * toute la page pour la montrer.
 *
 * Cet essai défile vers le bas, attend que le carrousel tourne, et vérifie
 * deux choses : la page est restée où elle était, et la bande a bien avancé.
 * Il demande que `npm run demo` tourne.
 *
 *   node outils/essai-carrousel.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9455;
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

const nav = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + path.join(RACINE, 'captures', '.profil-carrousel'),
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let adresse = '';
for (let i = 0; i < 40; i += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const p = (await r.json()).find((c) => c.type === 'page');
    if (p?.webSocketDebuggerUrl) {
      adresse = p.webSocketDebuggerUrl;
      break;
    }
  } catch {
    /* pas encore prêt */
  }
  await attendre(300);
}

const ws = new WebSocket(adresse);
await new Promise((r) => ws.addEventListener('open', r));
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
const cmd = (m, p = {}) =>
  new Promise((ok, ko) => {
    numero += 1;
    attentes.set(numero, { ok, ko });
    ws.send(JSON.stringify({ id: numero, method: m, params: p }));
  });
const evaluer = async (code) => (await cmd('Runtime.evaluate', { expression: code, returnByValue: true })).result.value;

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Network.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cmd('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });
await cmd('Page.navigate', { url: `${SITE}/` });
await attendre(3000);

console.log('\nLe carrousel de l’accueil');

const aUnRail = await evaluer(`!!document.getElementById('vedettes')`);
verifier('la bande des cartes est là', aUnRail === true);

// On défile vers le bas, comme Arthur.
await evaluer(`window.scrollTo(0, 900); 'ok'`);
await attendre(600);
const avant = await evaluer(`JSON.stringify({ page: Math.round(window.scrollY), bande: Math.round(document.getElementById('vedettes').scrollLeft) })`);
const a = JSON.parse(avant);
verifier('on est bien descendu dans la page', a.page > 300, `scrollY=${a.page}`);

// Le carrousel tourne toutes les 4,2 s. On en laisse passer deux.
await attendre(9500);
const apres = JSON.parse(
  await evaluer(
    `JSON.stringify({ page: Math.round(window.scrollY), bande: Math.round(document.getElementById('vedettes').scrollLeft) })`,
  ),
);

verifier(
  'la page n’a pas bougé pendant que le carrousel tournait',
  Math.abs(apres.page - a.page) <= 2,
  `avant ${a.page}, après ${apres.page} — c’est le défaut trouvé par Arthur le 12 octobre`,
);

// La bande, elle, ne doit tourner que si elle est encore à l'écran. À 900 px
// de défilement elle ne l'est plus : elle doit donc être restée en place.
verifier(
  'le carrousel s’arrête quand la bande n’est plus à l’écran',
  apres.bande === a.bande,
  `avant ${a.bande}, après ${apres.bande}`,
);

// Et quand on remonte, il doit repartir.
await evaluer(`window.scrollTo(0, 0); 'ok'`);
await attendre(9500);
const enHaut = JSON.parse(
  await evaluer(`JSON.stringify({ bande: Math.round(document.getElementById('vedettes').scrollLeft) })`),
);
verifier('et il repart quand on remonte', enHaut.bande > 0, `scrollLeft=${enHaut.bande}`);

console.log(`\nCarrousel : ${total - rates} sur ${total} vérifications passées.`);
nav.kill();
process.exit(rates > 0 ? 1 : 0);
