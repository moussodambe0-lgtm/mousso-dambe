/**
 * Dambé : ce qui se passe entre la question et la réponse.
 *
 * Arthur, le 14 octobre 2026 : « quand on envoie un message, ça doit partir,
 * ensuite la tête de la mascotte apparaît comme si elle réfléchit, et enfin
 * elle répond ». Cet essai regarde les trois temps dans un vrai navigateur,
 * et vérifie au passage ce qu'il a fait retirer de cet écran.
 *
 * Il demande que `npm run demo` tourne, et il pose une VRAIE question au
 * modèle : compter quelques secondes.
 *
 *   node outils/essai-dambe-attente.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9473;
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

const profil = path.join(RACINE, 'captures', '.profil-dambe');
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

console.log('\nCe qui a été retiré de cet écran');
await envoyer('Page.navigate', { url: `${SITE}/dambe` });
await attendre(2000);
const texte = await evaluer(`document.body.innerText`);
verifier('plus de « Prête à répondre »', !texte.includes('Prête à répondre'));
verifier(
  'plus de mention « n’est pas médecin / service d’IA extérieur »',
  !texte.includes('pose aucun diagnostic') && !texte.includes("service d'IA extérieur")
);
const poubelle = await evaluer(`!!document.querySelector('form[action="/dambe/effacer"]')`);
verifier('plus de poubelle à côté d’IA Dambé', poubelle === false);

console.log('\nLes trois temps : ça part, elle réfléchit, elle répond');
// Le fil garde les échanges d'avant : on compte les réponses AVANT d'envoyer,
// sinon on prend une vieille bulle pour la nouvelle et on croit que le modèle
// a répondu avant même d'avoir été appelé.
const reponsesAvant = await evaluer(`document.querySelectorAll('.bulle-elle').length`);

// On écrit la question comme elle le ferait, puis on envoie.
await evaluer(`(() => {
  const c = document.querySelector('#question');
  c.value = "J'ai mal au ventre pendant mes règles, qu'est-ce que je peux faire ?";
  c.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);
await evaluer(`document.querySelector('form.saisie button[type="submit"]').click(); 'ok'`);

// Tout de suite après l'envoi, AVANT que le serveur ait répondu.
let vuTotDit = false;
let vuTotReflechit = false;
for (let i = 0; i < 12; i += 1) {
  const etat = await evaluer(`(() => {
    const bulles = [...document.querySelectorAll('.bulle-moi')].map(b => b.textContent.trim());
    return JSON.stringify({
      question: bulles.some(b => b.includes('mal au ventre')),
      reflechit: !!document.querySelector('.reflechit'),
      repondu: document.querySelectorAll('.bulle-elle').length > ${reponsesAvant},
    });
  })()`);
  const { question, reflechit, repondu } = JSON.parse(etat ?? '{}');
  if (question && !repondu) vuTotDit = true;
  if (reflechit && !repondu) vuTotReflechit = true;
  if (repondu) break;
  await attendre(250);
}
verifier('sa question s’affiche AVANT que la réponse arrive', vuTotDit);
verifier('la mascotte réfléchit pendant ce temps', vuTotReflechit);

// Puis la vraie réponse, écrite par le serveur.
let reponse = '';
for (let i = 0; i < 80; i += 1) {
  const assez = await evaluer(`document.querySelectorAll('.bulle-elle').length > ${reponsesAvant}`);
  if (assez) {
    reponse = (await evaluer(`[...document.querySelectorAll('.bulle-elle')].map(b => b.textContent.trim()).pop() || ''`)) ?? '';
    if (reponse) break;
  }
  await attendre(500);
}
verifier('elle finit par répondre', reponse.length > 40, `${reponse.length} caractères`);
verifier('la mascotte ne réfléchit plus', (await evaluer(`!document.querySelector('.reflechit')`)) === true);

const emojis = (reponse.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu) ?? []).filter((e) => e !== '\uFE0F');
verifier('elle met des émojis tendres dans sa réponse', emojis.length >= 1, `trouvés : ${emojis.join(' ') || 'aucun'}`);
verifier('mais pas une pluie d’émojis', emojis.length <= 4, `${emojis.length}`);

console.log('\n--- sa réponse ---');
console.log(reponse.slice(0, 600));

console.log(`\n${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
