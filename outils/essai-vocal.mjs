/**
 * Le vocal au médecin, de bout en bout, dans un vrai navigateur.
 *
 * Les tests de la base prouvent que la base tient ses bornes. Ils ne
 * prouvent PAS que le bouton marche : il y a entre les deux un navigateur,
 * une autorisation de micro, une politique de sécurité, une route, un
 * lecteur. Une de ces cinq pièces peut casser sans qu'aucun test SQL ne
 * bouge. C'est exactement ce qui est arrivé avec `Permissions-Policy:
 * microphone=()` : le micro était fermé par notre propre en-tête, et rien
 * ne l'aurait dit avant qu'une femme appuie.
 *
 * Chrome est lancé avec un micro factice (`--use-fake-device-for-media-stream`)
 * et l'autorisation accordée d'office : il « enregistre » un bip. L'essai
 * appuie sur le micro, laisse tourner, arrête, vérifie qu'on peut se
 * réécouter, envoie, puis va chercher le son sur la route d'écoute.
 *
 * Il demande que `npm run demo` tourne.
 *
 *   node outils/essai-vocal.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9457;
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

const profil = path.join(RACINE, 'captures', '.profil-vocal');
fs.rmSync(profil, { recursive: true, force: true });

const nav = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + profil,
    // Un micro qui existe, et l'autorisation accordée sans demander.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
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

// Attend une condition au lieu d'un temps fixe : un essai qui ment de temps
// en temps est pire que pas d'essai.
const jusqua = async (code, essais = 40, pas = 250) => {
  for (let i = 0; i < essais; i += 1) {
    try {
      if (await evaluer(code)) return true;
    } catch {
      // La page est en train de se recharger : le navigateur coupe la
      // question en cours. Ce n'est pas un échec, on redemande.
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
await cmd('Page.navigate', { url: `${SITE}/discussions/medecin` });

console.log('\nLe vocal au médecin');

const micro = await jusqua(`!!document.querySelector('.vocal-micro') && !document.querySelector('.vocal-micro').hidden`, 60);
verifier('le bouton micro apparaît (le navigateur sait enregistrer)', micro);

// L'en-tête qui était en cause.
const entetes = await evaluer(`fetch('/discussions/medecin').then(r => r.headers.get('permissions-policy'))`);
verifier(
  "l'en-tête n'interdit pas le micro à ce site",
  typeof entetes === 'string' && /microphone=\(self\)/.test(entetes),
  String(entetes),
);

// On appuie, on laisse tourner, on arrête.
await evaluer(`document.querySelector('.vocal-micro').click(); 'ok'`);
const enregistre = await jusqua(`document.querySelector('.vocal-panneau')?.dataset.etat === 'enregistre'`, 20);
verifier("elle appuie : l'enregistrement démarre", enregistre);

await attendre(2600);
const temps = await evaluer(`document.querySelector('.vocal-temps').textContent`);
verifier('le compteur tourne', /^0:0[1-9]$/.test(temps), `lu « ${temps} »`);

await evaluer(`document.querySelector('.vocal-stop').click(); 'ok'`);
const pret = await jusqua(`document.querySelector('.vocal-panneau')?.dataset.etat === 'pret'`, 20);
verifier("elle arrête : on peut réécouter avant d'envoyer", pret);

const visibles = await evaluer(`JSON.stringify({
  ecouter: !document.querySelector('.vocal-ecouter').hidden,
  envoyer: !document.querySelector('.vocal-envoyer').hidden,
  annuler: !document.querySelector('.vocal-annuler').hidden,
  texteCache: getComputedStyle(document.querySelector('.zone-ecriture textarea')).display === 'none',
})`);
const v = JSON.parse(visibles);
verifier('Réécouter, Envoyer et Annuler sont là', v.ecouter && v.envoyer && v.annuler, visibles);
verifier('la case de texte s’efface pendant le vocal', v.texteCache);

// Rien n'est parti tant qu'elle n'a pas envoyé. On compare à ce qu'il y avait
// AVANT, pas à zéro : la base de démonstration garde les vocaux des essais
// précédents.
const compte = `fetch('/discussions/medecin').then(r => r.text()).then(t => (t.match(/<audio/g) || []).length)`;
const avant = await evaluer(compte);
await attendre(600);
const memeEncore = await evaluer(compte);
verifier("rien n'est parti avant qu'elle envoie", memeEncore === avant, `${avant} puis ${memeEncore}`);

// On envoie.
await evaluer(`document.querySelector('.vocal-envoyer').click(); 'ok'`);
const parti = await jusqua(`document.querySelectorAll('.vocal-lecteur').length > ${avant}`, 60);
verifier('le vocal part et la conversation le montre', parti);
if (!parti) {
  // Un essai qui échoue doit dire pourquoi, pas seulement qu'il échoue.
  const diag = await evaluer(`JSON.stringify({
    etat: document.querySelector('.vocal-panneau')?.dataset.etat,
    message: document.querySelector('.vocal-message')?.textContent,
    url: location.pathname,
  })`);
  console.log(`       diagnostic : ${diag}`);
  ws.close();
  nav.kill();
  console.log(`
Vocal : ${total - rates} sur ${total} vérifications passées (essai interrompu).`);
  process.exit(1);
}

const etiquette = await evaluer(`[...document.querySelectorAll('.vocal-etiquette')].pop()?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''`);
verifier("la bulle dit « Message vocal » et sa durée", /Message vocal · 0:0\d/.test(etiquette), etiquette);

// Le son sort bien de la route d'écoute, avec le bon type et en octets.
const son = await evaluer(`(async () => {
  const src = [...document.querySelectorAll('.vocal-lecteur')].pop().getAttribute('src');
  const r = await fetch(src);
  const b = await r.arrayBuffer();
  return JSON.stringify({ src, status: r.status, type: r.headers.get('content-type'), octets: b.byteLength,
    cache: r.headers.get('cache-control') });
})()`);
const s = JSON.parse(son);
verifier('la route renvoie le son', s.status === 200 && s.octets > 500, son);
verifier('avec un type audio', /^audio\//.test(s.type ?? ''), String(s.type));
verifier('et sans mise en cache', /no-store/.test(s.cache ?? ''), String(s.cache));

// Safari refuse un son dont le serveur ne répond pas aux intervalles.
const intervalle = await evaluer(`(async () => {
  const src = [...document.querySelectorAll('.vocal-lecteur')].pop().getAttribute('src');
  const r = await fetch(src, { headers: { Range: 'bytes=0-99' } });
  return JSON.stringify({ status: r.status, plage: r.headers.get('content-range'), octets: (await r.arrayBuffer()).byteLength });
})()`);
const iv = JSON.parse(intervalle);
verifier('un intervalle est servi en 206 (Safari l_exige)', iv.status === 206 && iv.octets === 100, intervalle);

// Un identifiant inventé ne donne rien.
const faux = await evaluer(`fetch('/vocal/00000000-0000-0000-0000-000000000000').then(r => r.status)`);
verifier('un identifiant inventé renvoie 404', faux === 404, String(faux));

// Sans session : la route ne livre rien.
const sans = await fetch(`${SITE}${s.src}`);
verifier('sans connexion, le son ne sort pas', sans.status === 401 || sans.status === 404, String(sans.status));

// Un envoi qui ne vient pas de ce site est refusé.
const etranger = await fetch(`${SITE}/vocal`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://site-pirate.example', cookie: `md_session=${cookie}` },
  body: JSON.stringify({ base64: 'AAAA', type: 'audio/webm', secondes: 3 }),
});
verifier("un envoi venu d'un autre site est refusé", etranger.status === 403, String(etranger.status));

// ---------------------------------------------------------------------------
// Chez la boutique, puis la réponse de l'administratrice (le compte de la
// démonstration est les deux à la fois).
// ---------------------------------------------------------------------------
console.log('\nLes vocaux avec la boutique');

const enregistrerEtEnvoyer = async () => {
  await evaluer(`document.querySelector('.vocal-micro').click(); 'ok'`);
  const en = await jusqua(`document.querySelector('.vocal-panneau')?.dataset.etat === 'enregistre'`, 20);
  if (!en) return false;
  await attendre(1800);
  await evaluer(`document.querySelector('.vocal-stop').click(); 'ok'`);
  const pret2 = await jusqua(`document.querySelector('.vocal-panneau')?.dataset.etat === 'pret'`, 20);
  if (!pret2) return false;
  await evaluer(`document.querySelector('.vocal-envoyer').click(); 'ok'`);
  return true;
};

await cmd('Page.navigate', { url: `${SITE}/discussions/boutique` });
const microBoutique = await jusqua(
  `!!document.querySelector('.vocal-micro') && !document.querySelector('.vocal-micro').hidden`,
  60,
);
verifier('chez la boutique, le micro est là aussi', microBoutique);
const sujet = await evaluer(`document.querySelector('.vocal-micro')?.dataset.sujet ?? null`);
verifier('et il parle à la boutique, pas au médecin', sujet === 'boutique', String(sujet));

const avantB = await evaluer(`document.querySelectorAll('.vocal-lecteur').length`);
const envoyeB = await enregistrerEtEnvoyer();
verifier('elle enregistre et envoie à la boutique', envoyeB);
const partiB = await jusqua(`document.querySelectorAll('.vocal-lecteur').length > ${avantB}`, 60);
verifier('le vocal apparaît dans la conversation de la boutique', partiB);

// L'administratrice ouvre le fil et répond par un vocal.
await cmd('Page.navigate', { url: `${SITE}/admin` });
const lien = await jusqua(`!!document.querySelector('a[href^="/admin/"]')`, 60);
verifier("l'administratrice voit des conversations", lien);
const href = await evaluer(`document.querySelector('a[href^="/admin/"]')?.getAttribute('href') ?? ''`);
await cmd('Page.navigate', { url: `${SITE}${href}` });
const microAdmin = await jusqua(
  `!!document.querySelector('.vocal-micro') && !document.querySelector('.vocal-micro').hidden`,
  60,
);
verifier('côté administratrice, le micro est là pour répondre', microAdmin);
const filCible = await evaluer(`document.querySelector('.vocal-micro')?.dataset.fil ?? ''`);
verifier('et il sait dans quel fil il répond', /^[0-9a-f-]{36}$/i.test(String(filCible)), String(filCible));

const avantA = await evaluer(`document.querySelectorAll('.vocal-lecteur').length`);
const envoyeA = await enregistrerEtEnvoyer();
verifier('elle enregistre et envoie sa réponse', envoyeA);
const partiA = await jusqua(`document.querySelectorAll('.vocal-lecteur').length > ${avantA}`, 60);
verifier('la réponse vocale apparaît dans le fil', partiA);

const deMoi = await evaluer(`!!document.querySelector('.de-moi .vocal-lecteur')`);
verifier('elle est de son côté (boutique), pas du côté de la cliente', deMoi);

console.log(`\nVocal : ${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
