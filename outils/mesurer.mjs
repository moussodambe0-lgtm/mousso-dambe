/**
 * Mesurer un écran dans un vrai navigateur.
 *
 * Quand une capture montre une mise en page cassée sans qu'on voie pourquoi,
 * ce script interroge le navigateur : quel élément déborde, et quel style il
 * a réellement reçu. Lire le CSS ne suffit pas, le navigateur est le seul
 * juge.
 *
 *   node outils/mesurer.mjs /discussions ".fil,.fil-corps,.fil-visage,.mascotte"
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9444;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const page = process.argv[2] ?? '/';
const selecteurs = process.argv[3] ?? '';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

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
    '--user-data-dir=' + path.join(RACINE, 'captures', '.profil-mesure'),
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let adresse = '';
for (let i = 0; i < 40; i += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const liste = await r.json();
    const p = liste.find((c) => c.type === 'page');
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

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Network.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cmd('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });
await cmd('Page.navigate', { url: SITE + page });
await attendre(2800);

const code = `(() => {
  const sortie = { page: location.pathname, largeurPage: document.documentElement.scrollWidth };
  sortie.debordent = [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().right > 392)
    .slice(0, 8)
    .map((e) => {
      const r = e.getBoundingClientRect();
      return e.tagName + '.' + String(e.className?.baseVal ?? e.className ?? '').slice(0, 40) +
        ' l=' + Math.round(r.width) + ' droite=' + Math.round(r.right);
    });
  const sels = ${JSON.stringify(selecteurs)}.split(',').filter(Boolean);
  sortie.styles = sels.map((s) => {
    const e = document.querySelector(s.trim());
    if (!e) return s + ' : absent';
    const c = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return s + ' : display=' + c.display + ' direction=' + c.flexDirection + ' wrap=' + c.flexWrap +
      ' flex=' + c.flex + ' minWidth=' + c.minWidth + ' position=' + c.position + ' whiteSpace=' + c.whiteSpace +
      ' largeur=' + Math.round(r.width) + ' hauteur=' + Math.round(r.height);
  });
  return JSON.stringify(sortie, null, 1);
})()`;

const r = await cmd('Runtime.evaluate', { expression: code, returnByValue: true });
console.log(r.result.value);

nav.kill();
process.exit(0);
