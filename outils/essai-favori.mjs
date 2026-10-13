/**
 * Le cœur des favoris, dans un vrai navigateur.
 *
 * Il doit devenir rouge au toucher, rester rouge quand on recharge la page
 * (c'est la base qui s'en souvient, pas le téléphone), et redevenir vide au
 * deuxième toucher. Il demande que `npm run demo` tourne.
 *
 *   node outils/essai-favori.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9459;
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

const profil = path.join(RACINE, 'captures', '.profil-favori');
fs.rmSync(profil, { recursive: true, force: true });
const nav = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + profil, '--no-first-run', 'about:blank'],
  { stdio: 'ignore' },
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
const jusqua = async (code, essais = 60, pas = 250) => {
  for (let i = 0; i < essais; i += 1) {
    try {
      if (await evaluer(code)) return true;
    } catch {
      /* rechargement */
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

const PRODUIT = '/boutique/serviettes-lavables-3';
await cmd('Page.navigate', { url: `${SITE}${PRODUIT}` });

console.log('\nLe cœur des favoris');
const pret = await jusqua(`document.documentElement.dataset.favori === 'pret' && !!document.querySelector('.favori')`);
verifier('le cœur est là et son script est en place', pret);

// Partir d'un état connu : si un essai précédent l'a laissé rouge, on le vide.
if ((await evaluer(`document.querySelector('.favori').getAttribute('aria-pressed')`)) === 'true') {
  await evaluer(`document.querySelector('.favori').click(); 'ok'`);
  await jusqua(`document.querySelector('.favori').getAttribute('aria-pressed') === 'false'`);
}

const couleur = async () =>
  evaluer(`getComputedStyle(document.querySelector('.favori svg')).fill`);

const videAvant = await couleur();
verifier('au repos, il est vide (pas de remplissage)', /none|rgba\(0, 0, 0, 0\)/.test(String(videAvant)), String(videAvant));

await evaluer(`document.querySelector('.favori').click(); 'ok'`);
const rouge = await jusqua(`document.querySelector('.favori').getAttribute('aria-pressed') === 'true'`);
// On attend que la BASE l'ait enregistré avant de recharger : sans cela, la
// navigation interrompt la requête (la première compile la route en dev).
await jusqua(`document.querySelector('.favori').dataset.enregistre === 'oui'`, 120);
verifier('toucher le met en favori', rouge);
await attendre(400);
const apres = String(await couleur());
verifier('et il devient ROUGE', /rgb\(225, 29, 72\)/.test(apres), apres);

// La base s'en souvient : on recharge.
await cmd('Page.navigate', { url: `${SITE}${PRODUIT}` });
await jusqua(`document.documentElement.dataset.favori === 'pret'`);
const encore = await evaluer(`document.querySelector('.favori').getAttribute('aria-pressed')`);
verifier('rechargé, il est toujours rouge (la base le garde)', encore === 'true', String(encore));

await evaluer(`document.querySelector('.favori').click(); 'ok'`);
await jusqua(`document.querySelector('.favori').dataset.enregistre === 'oui'`, 120);
const vide = await jusqua(`document.querySelector('.favori').getAttribute('aria-pressed') === 'false'`);
verifier('un deuxième toucher le retire', vide);

// « Écrire à la boutique » est sur la même ligne que le cœur
const memeLigne = await evaluer(`(() => {
  const a = document.querySelector('.ecrire-vendeur')?.getBoundingClientRect();
  const b = document.querySelector('.favori')?.getBoundingClientRect();
  return !!a && !!b && Math.abs(a.top - b.top) < 4;
})()`);
verifier('« Écrire à la boutique » et le cœur sont sur la même ligne', memeLigne);

const hauteur = await evaluer(`Math.round(document.querySelector('.ecrire-vendeur').getBoundingClientRect().height)`);
verifier('le rectangle est réduit (44 px)', hauteur <= 46, `${hauteur} px`);

console.log(`\nFavoris : ${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
