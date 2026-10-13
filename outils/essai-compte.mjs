/**
 * Vérification rapide, dans un vrai navigateur :
 *   - /compte/adresse : le bouton « Partager ma position » est-il VISIBLE ?
 *   - /compte : le titre « Mes commandes » est-il là, avec les 4 icônes ?
 * Demande que `npm run demo` tourne.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SITE = 'http://127.0.0.1:4322';
const PORT = 9466;
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

const profil = path.join(RACINE, "captures", ".profil-compte");
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

// Le WebSocket de Node, pas le paquet `ws` : il n'est pas installé ici, et
// les autres essais du dossier font déjà comme ça.
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

await envoyer('Network.enable');
await envoyer('Network.setCookie', { name: 'md_session', value: cookie, domain: '127.0.0.1', path: '/' });
await envoyer('Page.enable');

async function aller(chemin) {
  await envoyer('Page.navigate', { url: `${SITE}${chemin}` });
  await attendre(1800);
}

console.log('\nMes adresses : le bouton de position');
await aller('/compte/adresse');
// On attend que le script soit passé : sur un serveur qui vient de démarrer,
// Vite compile à la volée et la page peut s'afficher avant lui.
for (let i = 0; i < 40; i += 1) {
  if (await evaluer(`document.documentElement.dataset.position === 'pret'`)) break;
  await attendre(250);
}
const boutonLa = await evaluer(`!!document.querySelector('.position-bouton')`);
verifier('le bouton est dans la page', boutonLa === true);
const cache = await evaluer(`document.querySelector('.position-bouton')?.hidden ?? null`);
verifier('il n’est PAS caché', cache === false, `hidden = ${cache}`);
const visible = await evaluer(
  `(() => { const b = document.querySelector('.position-bouton'); if (!b) return null;
    const r = b.getBoundingClientRect(); return r.width > 50 && r.height > 20; })()`
);
verifier('il occupe une vraie place à l’écran', visible === true, `${visible}`);
const motBouton = await evaluer(`document.querySelector('.position-mot')?.textContent?.trim() ?? null`);
verifier('il dit « Partager ma position »', motBouton === 'Partager ma position', `${motBouton}`);
const icone = await evaluer(`!!document.querySelector('.position-bouton svg')`);
verifier('et il garde son icône de lieu', icone === true);

console.log('\nMon compte : le bandeau des commandes');
await aller('/compte');
const titre = await evaluer(
  `[...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'Mes commandes')`
);
verifier('« Mes commandes » est écrit au-dessus', titre === true);
const mots = await evaluer(`[...document.querySelectorAll('.etat-mot')].map(e => e.textContent.trim()).join(' | ')`);
verifier(
  'les quatre options sont là, « Livrées » comprise',
  mots === 'En préparation | En livraison | Livrées | Annulées',
  mots
);
const nbIcones = await evaluer(`document.querySelectorAll('.etat-rond svg, .etat-rond img').length`);
verifier('chaque option a son dessin', nbIcones === 4, `${nbIcones}`);
const scooter = await evaluer(
  `(() => { const i = document.querySelector('.etat-image'); if (!i) return null;
    return i.complete && i.naturalWidth > 0 ? i.getAttribute('src') : 'pas chargée'; })()`
);
verifier(
  '« En livraison » montre la photo du livreur, et elle se charge',
  scooter === '/icones/en-livraison.png',
  `${scooter}`
);
const noir = await evaluer(
  `(() => { const m = document.querySelector('.etat-mot'); const r = document.querySelector('.etat-rond');
    return m && r ? getComputedStyle(m).color + ' / ' + getComputedStyle(r).color : null; })()`
);
verifier(
  'les mots et les dessins sont en noir foncé',
  (noir ?? '').split(' / ').every((c) => c === 'rgb(13, 10, 12)'),
  `${noir}`
);
const unSeul = await evaluer(
  `(() => { const b = document.querySelector('.etats'); const e = document.querySelector('.etat');
    if (!b || !e) return null;
    const cadre = getComputedStyle(b).borderTopWidth;
    const dedans = getComputedStyle(e).borderTopWidth;
    return cadre !== '0px' && dedans === '0px'; })()`
);
verifier('les quatre logos sont dans UN SEUL rectangle', unSeul === true, `${unSeul}`);
const engrenage = await evaluer(
  `(() => { const i = document.querySelector('.engrenage img'); if (!i) return null;
    return i.complete && i.naturalWidth > 0 ? i.getAttribute('src') : 'pas chargée'; })()`
);
verifier("l'engrenage d'Arthur est en haut à droite", engrenage === '/icones/parametres.png', `${engrenage}`);
const nu = await evaluer(
  `(() => { const e = document.querySelector('.engrenage'); if (!e) return null;
    const s = getComputedStyle(e);
    return s.borderTopWidth === '0px' && (s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent'); })()`
);
verifier("l'engrenage est nu, sans carré autour", nu === true, `${nu}`);
const sansPhrase = await evaluer(`!document.body.textContent.includes('Sans compte, sans mot de passe')`);
verifier('« Sans compte, sans mot de passe » a disparu', sansPhrase === true);
const ordre = await evaluer(
  `(() => { const t = document.querySelector('.tuiles'); const e = document.querySelector('.etats');
    if (!t || !e) return null;
    return t.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING ? 'favoris avant commandes' : 'commandes avant favoris'; })()`
);
verifier('favoris et panier sont AVANT les commandes', ordre === 'favoris avant commandes', `${ordre}`);
const produits = await evaluer(`document.querySelectorAll('.produits a').length > 0`);
verifier('les produits de la boutique sont tout en bas', produits === true);
const deconnexionIci = await evaluer(`!document.body.textContent.includes('Me déconnecter')`);
verifier('« Me déconnecter » n’est plus sur cette page', deconnexionIci === true);

await aller('/parametres');
const deconnexionLa = await evaluer(`document.body.textContent.includes('Me déconnecter')`);
verifier('« Me déconnecter » est passé dans Paramètres', deconnexionLa === true);

console.log('\nParamètres : le service client');
await aller('/parametres');
const serviceBoutique = await evaluer(
  `[...document.querySelectorAll('a')].some(a => (a.getAttribute('href') || '').includes('/discussions/boutique'))`
);
verifier('« Service client » ne renvoie plus à la boutique', serviceBoutique === false);
const serviceLa = await evaluer(
  `[...document.querySelectorAll('.ligne, .ligne-morte')].some(l => l.textContent.includes('Service client'))`
);
verifier('la ligne reste en place, en attendant la page d’Arthur', serviceLa === true);

console.log(`\n${total - rates} sur ${total} vérifications passées.`);
ws.close();
nav.kill();
process.exit(rates > 0 ? 1 : 0);
