/**
 * Parler a Vercel : variables d'environnement, deploiements, journaux.
 *
 *   node outils/vercel.mjs etat        montre le projet, ses variables, ses deploiements
 *   node outils/vercel.mjs variables   pose les variables depuis le coffre
 *   node outils/vercel.mjs journaux    montre les erreurs d'execution
 *   node outils/vercel.mjs redeployer  relance le dernier deploiement
 *   node outils/vercel.mjs region      met les fonctions a Londres
 *   node outils/vercel.mjs domaines    liste les noms de domaine et leur etat
 *
 * Le jeton est lu dans le coffre et jamais affiche. Les valeurs des variables
 * ne sont jamais affichees non plus, seulement leurs noms.
 */
import { valeurUnique } from './coffre.mjs';

const PROJET = 'prj_8fr446kbsmMrxoT0H45KO6VtqafT';
const action = process.argv[2] ?? 'etat';

/*
 * LE JETON DU PROJET, PAS CELUI DU DNS (corrige le 7 novembre 2026).
 *
 * Le coffre contient deux jetons Vercel depuis le 6 novembre : celui du projet,
 * et un jeton de compte reserve aux enregistrements DNS (voir dns-vercel.mjs,
 * qui fait l'inverse et cherche « dns » en premier). L'ancien motif
 * reconnaissait les deux, et l'outil s'arretait en demandant d'en supprimer un,
 * alors que les deux doivent exister.
 *
 * On exclut donc « dns » ici. Cet outil pose des variables d'environnement et
 * relance des deploiements : il n'a aucune raison de tenir un jeton de compte
 * capable de toucher au DNS d'un domaine.
 */
/*
 * LE NOM EXACT, ET RIEN QUI LUI RESSEMBLE (durci le 7 novembre 2026).
 *
 * Le motif d'avant acceptait toute ligne contenant « vercel » et « mousso »
 * sans « dns ». Le coffre s'est enrichi ce jour-là d'une ligne ABÎMÉE : un
 * jeton collé sans retour à la ligne, si bien qu'une partie de sa valeur
 * s'est retrouvée DANS LE NOM (« vcp_…JETON VERCEL COMPTE mousso dambe »).
 * Elle correspondait au motif, et l'outil s'est arrêté en demandant de
 * choisir — ce qu'il fait bien, mais il n'aurait pas dû avoir à le demander.
 *
 * Un nom exact ne peut pas attraper une ligne mal recopiée par accident.
 */
const jeton = valeurUnique(/^jeton vercel mousso dambe$/i, {
  quoi: 'le jeton Vercel du projet',
});
if (!jeton.valeur) {
  console.error(jeton.erreur);
  process.exit(1);
}

const H = { authorization: `Bearer ${jeton.valeur}`, 'content-type': 'application/json' };

async function api(chemin, options = {}) {
  const r = await fetch(`https://api.vercel.com${chemin}`, { headers: H, ...options });
  const texte = await r.text();
  let corps = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { ok: r.ok, statut: r.status, corps };
}

/** Ce que le code attend, et ou le trouver dans le coffre. */
const ATTENDUES = [
  {
    cle: 'PUBLIC_SUPABASE_URL',
    /*
     * LUE DANS LE COFFRE, PLUS ECRITE EN DUR (7 novembre 2026).
     *
     * Cette ligne portait l'adresse de l'ancien projet Supabase, celui qui a
     * disparu le 6 novembre et qui est aujourd'hui en pause. Relancer
     * `variables` aurait donc rebranche le site sur une base morte, sans le
     * moindre avertissement : l'outil aurait dit « pose » et le site serait
     * tombe. Une valeur ecrite en dur a toujours une date de peremption qu'on
     * oublie d'ecrire a cote.
     */
    motif: /supabase.*url.*mousso|url.*supabase.*mousso/i,
    quoi: "l'adresse de la base",
    secrete: false,
  },
  {
    cle: 'PUBLIC_SUPABASE_ANON_KEY',
    motif: /supabase.*anon.*mousso/i,
    quoi: 'la cle publiable',
    secrete: false,
  },
  {
    cle: 'MD_CLE_SERVEUR',
    motif: /^(?!.*test)(?=.*mousso)(?=.*cle)(?=.*serveur)/i,
    quoi: 'la cle serveur',
    secrete: true,
  },
  {
    // Les emails de commande (7 novembre 2026). Sans elle, aucune commande
    // n'echoue : les messages ne partent simplement pas. Voir
    // src/lib/courriels.ts.
    cle: 'RESEND_API_KEY',
    motif: /^resend api key mousso dambe$/i,
    quoi: "la cle d'API Resend",
    secrete: true,
  },
  /*
   * L'ASSISTANTE DAMBE (7 novembre 2026). Arthur : « et pourquoi l'IA ne
   * repond pas ? »
   *
   * Parce que ces trois lignes n'existaient pas sur Vercel. La cle dormait
   * dans le coffre depuis le 13 octobre, mais personne ne l'avait posee, et
   * `ollamaConfigure()` ne regarde qu'une chose : la presence de OLLAMA_URL.
   * Sans elle, Dambe se taisait, et l'ecran l'annoncait a tout le monde.
   *
   * L'ADRESSE EST ECRITE ICI, et c'est voulu : c'est l'adresse publique
   * d'Ollama en ligne, elle n'a rien d'un secret et elle ne depend d'aucun
   * projet. Un Ollama installe sur le PC d'Arthur ne conviendrait pas : le
   * site tourne sur Vercel et ne verrait jamais cette machine.
   */
  {
    cle: 'OLLAMA_URL',
    valeur: () => 'https://ollama.com',
    secrete: false,
  },
  {
    cle: 'OLLAMA_API_KEY',
    motif: /^ollama_api_key mousso dambe$/i,
    quoi: "la cle Ollama de Mousso Dambe",
    secrete: true,
  },
  {
    /*
     * `gemma3:4b` a ete RETIRE par Ollama le 15 juillet 2026 : il repond
     * « 410, retired ». Verifie ce jour contre la vraie cle, les trois
     * modeles donnent : gemma4:31b repond « Bonjour » en 800 ms,
     * gemma3:4b repond 410, et gpt-oss:20b repond 200 avec un texte VIDE
     * (il met tout dans un champ « thinking »). Un seul tient.
     */
    cle: 'ASSISTANTE_MODELE',
    valeur: () => 'gemma4:31b',
    secrete: false,
  },
];

async function etat() {
  const p = await api(`/v9/projects/${PROJET}`);
  if (!p.ok) {
    console.error(`projet illisible (${p.statut})`);
    process.exit(1);
  }
  console.log(`projet : ${p.corps.name}`);
  console.log(`Node : ${p.corps.nodeVersion ?? '?'}`);
  console.log(`region des fonctions : ${p.corps.serverlessFunctionRegion ?? 'iad1 (defaut, Washington)'}`);

  const e = await api(`/v10/projects/${PROJET}/env?decrypt=false`);
  const envs = e.ok ? (e.corps.envs ?? []) : [];
  console.log(`\nvariables sur Vercel (${envs.length}) :`);
  for (const v of envs) console.log(`  ${v.key}  [${(v.target ?? []).join('/')}] ${v.type}`);

  const noms = new Set(envs.map((v) => v.key));
  const manquantes = ATTENDUES.filter((a) => !noms.has(a.cle)).map((a) => a.cle);
  const inutiles = envs.filter((v) => !ATTENDUES.some((a) => a.cle === v.key)).map((v) => v.key);
  if (manquantes.length) console.log(`\nMANQUE : ${manquantes.join(', ')}`);
  if (inutiles.length) console.log(`inutiles (ignorees par le code) : ${inutiles.join(', ')}`);
  if (!manquantes.length && !inutiles.length) console.log('\nles trois variables attendues sont la, et rien de trop.');

  const d = await api(`/v6/deployments?projectId=${PROJET}&limit=3`);
  console.log('\ndeploiements :');
  for (const x of (d.corps?.deployments ?? [])) {
    console.log(`  ${x.uid}  ${x.state}  ${x.url}`);
  }
}

async function poserVariables() {
  const e = await api(`/v10/projects/${PROJET}/env?decrypt=false`);
  const envs = e.ok ? (e.corps.envs ?? []) : [];
  const parCle = new Map(envs.map((v) => [v.key, v]));

  for (const a of ATTENDUES) {
    const valeur = a.valeur
      ? a.valeur()
      : (() => {
          const r = valeurUnique(a.motif, { quoi: a.quoi });
          if (!r.valeur) {
            console.error(`${a.cle} : ${r.erreur}`);
            process.exit(1);
          }
          return r.valeur;
        })();

    const existante = parCle.get(a.cle);
    if (existante) {
      const r = await api(`/v9/projects/${PROJET}/env/${existante.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ value: valeur, target: ['production', 'preview', 'development'] }),
      });
      console.log(`${a.cle} : ${r.ok ? 'mise a jour' : 'echec ' + r.statut + ' ' + JSON.stringify(r.corps).slice(0, 150)}`);
    } else {
      const r = await api(`/v10/projects/${PROJET}/env`, {
        method: 'POST',
        body: JSON.stringify({
          key: a.cle,
          value: valeur,
          type: 'encrypted',
          target: ['production', 'preview', 'development'],
        }),
      });
      console.log(`${a.cle} : ${r.ok ? 'creee' : 'echec ' + r.statut + ' ' + JSON.stringify(r.corps).slice(0, 150)}`);
    }
  }

  // Les variables que le code n'utilise pas : on les nomme, on ne les touche pas.
  const inutiles = envs.filter((v) => !ATTENDUES.some((a) => a.cle === v.key));
  for (const v of inutiles) {
    console.log(`${v.key} : inutile pour le code. A supprimer a la main si tu veux.`);
  }
}

async function journaux() {
  const d = await api(`/v6/deployments?projectId=${PROJET}&limit=1`);
  const dep = d.corps?.deployments?.[0];
  if (!dep) {
    console.log('aucun deploiement');
    return;
  }
  console.log(`deploiement ${dep.uid} (${dep.state})\n`);
  const e = await api(`/v3/deployments/${dep.uid}/events?limit=100&builds=1`);
  if (!e.ok) {
    console.log(`journaux illisibles (${e.statut}) : ${JSON.stringify(e.corps).slice(0, 200)}`);
    return;
  }
  const lignes = Array.isArray(e.corps) ? e.corps : [];
  const interessantes = lignes.filter((l) => {
    const t = (l.text ?? l.payload?.text ?? '').toLowerCase();
    return t.includes('error') || t.includes('erreur') || t.includes('failed') || t.includes('cannot');
  });
  const aMontrer = interessantes.length ? interessantes : lignes.slice(-25);
  for (const l of aMontrer.slice(-30)) {
    const t = (l.text ?? l.payload?.text ?? '').replace(/\s+$/, '');
    if (t) console.log(`  ${t.slice(0, 300)}`);
  }
  if (!aMontrer.length) console.log('  (aucune ligne)');
}

async function redeployer() {
  const d = await api(`/v6/deployments?projectId=${PROJET}&limit=1`);
  const dep = d.corps?.deployments?.[0];
  if (!dep) {
    console.log('aucun deploiement a relancer');
    return;
  }
  const r = await api('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: 'mousso-dambe',
      project: PROJET,
      target: 'production',
      deploymentId: dep.uid,
      meta: { action: 'redeploy' },
    }),
  });
  console.log(r.ok ? `relance : ${r.corps.url}` : `echec ${r.statut} : ${JSON.stringify(r.corps).slice(0, 250)}`);
}

async function region() {
  const r = await api(`/v9/projects/${PROJET}`, {
    method: 'PATCH',
    body: JSON.stringify({ serverlessFunctionRegion: 'lhr1' }),
  });
  console.log(r.ok ? 'region des fonctions : Londres (lhr1)' : `echec ${r.statut} : ${JSON.stringify(r.corps).slice(0, 200)}`);
}

/**
 * Les noms de domaine du projet, et ce qu'il leur manque.
 *
 * Ajoute le 27 octobre 2026, quand Arthur a achete moussodambe.com : avant de
 * poser SITE_URL, il faut savoir si le domaine est attache et verifie. Un
 * SITE_URL qui pointe vers un domaine non verifie fabrique des liens morts
 * dans les emails de connexion, ce que personne ne voit avant qu'une cliente
 * s'en plaigne.
 */
async function domaines() {
  const liste = await api(`/v9/projects/${PROJET}/domains`);
  const noms = liste.domains ?? [];
  if (!noms.length) {
    console.log('Aucun domaine attache a ce projet : il ne repond que sur son adresse vercel.app.');
    return;
  }
  console.log('domaines du projet :');
  for (const d of noms) {
    const etat = d.verified ? 'verifie' : 'EN ATTENTE DE VERIFICATION';
    const vers = d.redirect ? ` -> redirige vers ${d.redirect}` : '';
    console.log(`  ${d.name}  ${etat}${vers}`);
  }
}

const actions = { etat, variables: poserVariables, journaux, redeployer, region, domaines };
const choisie = actions[action];
if (!choisie) {
  console.error(`action inconnue : ${action}. Attendu : ${Object.keys(actions).join(', ')}`);
  process.exit(1);
}
await choisie();
