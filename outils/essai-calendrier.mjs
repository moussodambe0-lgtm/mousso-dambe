/**
 * Le calendrier ne doit ni se recharger ni empiler l'historique.
 *
 * Arthur, le 13 octobre 2026 : « quand je défile ou que je clique quelque part
 * sur le calendrier la page se recharge, et quand j'appuie sur retour ça me
 * renvoie où j'étais dans le calendrier au lieu de me faire quitter la page ».
 *
 * Cet essai pose un marqueur dans la page, touche une date, puis vérifie que
 * le marqueur est toujours là (donc pas de rechargement), que la fiche s'est
 * ouverte, que l'historique n'a pas grandi, et que « retour » quitte le
 * calendrier. Il demande que `npm run demo` tourne.
 *
 *   node outils/essai-calendrier.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9458;
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

const profil = path.join(RACINE, 'captures', '.profil-calendrier');
fs.rmSync(profil, { recursive: true, force: true });

const nav = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + profil,
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
const evaluer = async (code) =>
  (await cmd('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true })).result.value;
const jusqua = async (code, essais = 40, pas = 250) => {
  for (let i = 0; i < essais; i += 1) {
    try {
      if (await evaluer(code)) return true;
    } catch {
      /* la page se recharge : on redemande */
    }
    await attendre(pas);
  }
  return false;
};

await cmd('Page.enable');
await cmd('Runtime.enable');
await cmd('Network.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cmd('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });

// On arrive de l'accueil : « retour » doit y ramener.
await cmd('Page.navigate', { url: `${SITE}/` });
await attendre(2500);
await evaluer(`location.assign('/cycle/calendrier'); 'ok'`);

console.log('\nLe calendrier');

const la = await jusqua(`!!document.querySelector('.cal-case') && location.pathname === '/cycle/calendrier' && document.documentElement.dataset.calendrier === 'pret'`, 80);
verifier('le calendrier est ouvert', la);

if (process.env.DIAG) {
  // Pour comprendre un échec : ce que la page contient vraiment.
  console.log(
    await evaluer(`JSON.stringify({
      href: document.querySelector('.cal-case')?.getAttribute('href'),
      scripts: [...document.querySelectorAll('script')].map((s) => s.src || s.textContent.slice(0, 80)),
      conteneur: !!document.querySelector('.ecran-calendrier'),
      contient: document.querySelector('.ecran-calendrier')?.contains(document.querySelector('.cal-case')),
    }, null, 1)`),
  );
}

await evaluer(`window.__marqueur = 'ici'; window.scrollTo(0, 120); 'ok'`);
await attendre(300);
const avant = JSON.parse(await evaluer(`JSON.stringify({ h: history.length, y: Math.round(window.scrollY) })`));

// On touche une date (la première case qui est un lien de jour).
await evaluer(`document.querySelector('.cal-case').click(); 'ok'`);
const fiche = await jusqua(`!!document.querySelector('.cal-fiche')`, 40);
verifier('toucher une date ouvre sa fiche', fiche);

const apres = JSON.parse(
  await evaluer(`JSON.stringify({ h: history.length, y: Math.round(window.scrollY), m: window.__marqueur ?? null })`),
);
verifier('la page ne s’est PAS rechargée', apres.m === 'ici', JSON.stringify(apres));
verifier('l’historique n’a pas grandi', apres.h === avant.h, `${avant.h} puis ${apres.h}`);
verifier('le défilement n’a pas bougé', Math.abs(apres.y - avant.y) < 5, `${avant.y} puis ${apres.y}`);

const adr = await evaluer(`location.pathname + location.search`);
verifier('l’adresse dit quel jour est ouvert', /jour=\d{4}-\d{2}-\d{2}/.test(adr), adr);

// On ferme la fiche en touchant le voile.
await evaluer(`document.querySelector('.cal-voile').click(); 'ok'`);
const fermee = await jusqua(`!document.querySelector('.cal-fiche')`, 40);
verifier('toucher à côté referme la fiche', fermee);
const encore = await evaluer(`window.__marqueur ?? null`);
verifier('toujours sans rechargement', encore === 'ici');

// Le mois suivant.
await evaluer(`document.querySelectorAll('.cal-fleche')[1].click(); 'ok'`);
const suivant = await jusqua(`/mois=/.test(location.search)`, 40);
verifier('la flèche change de mois', suivant);
const h2 = await evaluer(`history.length`);
verifier('sans empiler l’historique', h2 === avant.h, `${avant.h} puis ${h2}`);
verifier('et sans rechargement', (await evaluer(`window.__marqueur ?? null`)) === 'ici');

// Un glissement horizontal ne doit plus rien changer.
const avantAdr = await evaluer(`location.pathname + location.search`);
await evaluer(`(() => {
  const g = document.getElementById('grille') || document.querySelector('.cal-grille');
  const t = (type, x, y) => g.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
    touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: g, clientX: x, clientY: y })],
    changedTouches: [new Touch({ identifier: 1, target: g, clientX: x, clientY: y })] }));
  t('touchstart', 300, 400); t('touchend', 80, 410);
  return 'ok';
})()`);
await attendre(800);
const apresAdr = await evaluer(`location.pathname + location.search`);
verifier('un glissement ne change plus de mois ni de page', avantAdr === apresAdr, `${avantAdr} puis ${apresAdr}`);

// « Retour » quitte le calendrier.
await evaluer(`history.back(); 'ok'`);
await attendre(1500);
const ou = await evaluer(`location.pathname`);
verifier('« retour » quitte le calendrier', ou !== '/cycle/calendrier', ou);

console.log(`\nCalendrier : ${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
