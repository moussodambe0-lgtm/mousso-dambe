/**
 * L'espace vendeur, de bout en bout, dans un vrai navigateur.
 *
 * Arthur, le 14 octobre 2026 : un espace vendeur « à peu près comme celui de
 * Jia », avec un tableau de bord, les messages de la boutique, les commandes,
 * et de quoi ajouter ou retirer un produit.
 *
 * Ce que cet essai prouve, dans l'ordre de gravité :
 *   1. une cliente ordinaire n'entre pas, et ne voit même pas la porte ;
 *   2. un produit s'ajoute, se modifie, se retire, et le retrait le sort
 *      vraiment de la boutique publique ;
 *   3. les quatre écrans s'ouvrent et montrent ce qu'ils annoncent.
 *
 *   node outils/essai-vendeur.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'http://127.0.0.1:4322';
const PORT = 9476;
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

async function connexion(email, motdepasse) {
  const r = await fetch(`${SITE}/connexion`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
    body: new URLSearchParams({ email, motdepasse }),
    redirect: 'manual',
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [paire] = c.split(';');
    const [nom, ...reste] = paire.split('=');
    if (nom === 'md_session') return reste.join('=');
  }
  return '';
}

// Awa est l'administratrice du banc. On fabrique aussi une cliente ordinaire.
const admin = await connexion('awa@essai.bf', 'motdepasse');
const cliente = await (async () => {
  const email = `cliente-${Date.now()}@essai.bf`;
  const r = await fetch(`${SITE}/inscription`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: SITE },
    body: new URLSearchParams({ email, motdepasse: 'motdepasse', prenom: 'Cliente' }),
    redirect: 'manual',
  });
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [paire] = c.split(';');
    const [nom, ...reste] = paire.split('=');
    if (nom === 'md_session') return reste.join('=');
  }
  return '';
})();

const profil = path.join(RACINE, 'captures', '.profil-vendeur');
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

const seConnecter = async (jeton) => {
  await envoyer('Network.setCookie', { name: 'md_session', value: jeton, domain: '127.0.0.1', path: '/' });
};
const aller = async (chemin, pause = 1600) => {
  await envoyer('Page.navigate', { url: `${SITE}${chemin}` });
  await attendre(pause);
};

/**
 * Une page en erreur garde la bonne adresse : vérifier `location.pathname` ne
 * prouve donc RIEN. C'est ce qui m'a fait croire que l'écran des commandes
 * marchait alors qu'il rendait une 500 (14 octobre 2026). On demande donc
 * aussi au navigateur ce que le serveur a vraiment répondu.
 */
const ouverte = async (chemin) => {
  const r = await evaluer(`(async () => {
    const r = await fetch(${JSON.stringify(chemin)}, { redirect: 'manual' });
    return r.status;
  })()`);
  // On ne cherche PAS « 500 » dans le texte : les prix en contiennent
  // (« 2 500 FCFA »), et la page passait pour cassée alors qu'elle allait
  // bien. Le statut HTTP suffit, avec la trace d'erreur d'Astro.
  const erreurAffichee = await evaluer(
    `document.body.innerText.includes('Cannot read') || document.title.includes('Error')`
  );
  return r === 200 && !erreurAffichee;
};

console.log('\nUne cliente ordinaire n’entre pas');
await seConnecter(cliente);
await aller('/vendeur');
let ou = await evaluer(`location.pathname`);
verifier('/vendeur la renvoie ailleurs', ou !== '/vendeur', `${ou}`);
await aller('/vendeur/produits');
ou = await evaluer(`location.pathname`);
verifier('/vendeur/produits aussi', ou !== '/vendeur/produits', `${ou}`);
await aller('/compte');
const voitLaPorte = await evaluer(`document.body.innerText.includes('Espace vendeur')`);
verifier('et son compte ne montre même pas la porte', voitLaPorte === false);

console.log('\nLe tableau de bord');
await seConnecter(admin);
await aller('/vendeur');
verifier('il s’ouvre vraiment (200, pas une page d’erreur)', await ouverte('/vendeur'));
const texteTableau = await evaluer(`document.body.innerText`);
verifier('il annonce ce qu’il y a à traiter', texteTableau.includes('À traiter aujourd’hui') || texteTableau.includes("À traiter aujourd'hui"));
verifier('il montre les chiffres', texteTableau.includes('Mes chiffres') && texteTableau.includes('Ventes du jour'));
verifier('et l’état du stock', texteTableau.includes('Mon stock'));
const onglets = await evaluer(`[...document.querySelectorAll('.nav-vendeur a')].map(a => a.textContent.trim()).join('|')`);
verifier('la barre a ses quatre onglets', (onglets ?? '').split('|').length === 4, `${onglets}`);

console.log('\nAjouter, modifier, retirer un produit');
await aller('/vendeur/produits?nouveau');
verifier('l’écran des produits s’ouvre vraiment', await ouverte('/vendeur/produits'));
verifier('le formulaire s’ouvre', (await evaluer(`!!document.querySelector('form.formulaire')`)) === true);

const nom = `Essai vendeur ${Date.now()}`;
await evaluer(`(() => {
  const f = document.querySelector('form.formulaire');
  f.querySelector('#nom').value = ${JSON.stringify(nom)};
  f.querySelector('#prix').value = '2500';
  f.querySelector('#stock').value = '2';
  f.querySelector('#rayon').value = 'lavables';
  f.querySelector('#resume').value = 'Ajouté par un essai automatique.';
  f.submit();
  return 'ok';
})()`);
await attendre(2200);
let liste = await evaluer(`document.body.innerText`);
verifier('le produit apparaît dans la liste', liste.includes(nom));
verifier('avec son prix', /2\s?500/.test(liste), liste.slice(0, 0) || 'prix introuvable');
verifier('et son stock bas signalé', liste.includes('2 en stock'));

// Il doit aussi être visible dans la vraie boutique.
await aller('/boutique');
verifier('et il est en vente dans la boutique', (await evaluer(`document.body.innerText`)).includes(nom));

// On le retire.
await aller('/vendeur/produits');
await evaluer(`(() => {
  const titres = [...document.querySelectorAll('.produit')];
  const cible = titres.find(p => p.textContent.includes(${JSON.stringify(nom)}));
  cible.querySelector('form.produit-geste').submit();
  return 'ok';
})()`);
await attendre(2200);
liste = await evaluer(`document.body.innerText`);
verifier('retiré, il reste visible côté vendeur', liste.includes(nom));
verifier('et marqué comme retiré', liste.includes('Retiré'));
await aller('/boutique');
verifier('mais il a disparu de la boutique', (await evaluer(`document.body.innerText`)).includes(nom) === false);

console.log('\nLes commandes et les messages');
await aller('/vendeur/commandes');
verifier('l’écran des commandes s’ouvre vraiment', await ouverte('/vendeur/commandes'));
const filtres = await evaluer(`[...document.querySelectorAll('.filtre')].map(a => a.textContent.trim()).join('|')`);
verifier('avec ses filtres par état', (filtres ?? '').includes('À préparer'), `${filtres}`);

await aller('/vendeur/messages');
verifier('l’écran des messages s’ouvre vraiment', await ouverte('/vendeur/messages'));
const texteMessages = await evaluer(`document.body.innerText`);
verifier(
  'et il dit que le médecin n’est pas ici',
  texteMessages.includes('médecin'),
  'la note de séparation manque'
);

console.log(`\n${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
