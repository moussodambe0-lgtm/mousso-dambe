/**
 * Monter le second projet Vercel : celui de l'administration.
 *
 *   node outils/vercel-admin.mjs etat     dit ou en est le projet d'admin
 *   node outils/vercel-admin.mjs creer    le cree, pose ses variables, deploie
 *
 * POURQUOI DEUX PROJETS POUR UN SEUL DEPOT
 *
 * Decision d'Arthur du 21 octobre 2026 : l'administration est separee de la
 * plateforme des clientes, sur sa propre adresse, avec le meme code. Deux
 * adresses veut dire deux sessions, parce qu'un cookie sans `Domain`
 * n'appartient qu'a l'hote exact qui l'a pose : se connecter a la boutique ne
 * connecte donc pas a l'administration.
 *
 * Le plan d'origine etait un sous-domaine, `admin.moussodambe.bf`. Il attend
 * l'achat du nom de domaine : sous `.vercel.app`, on ne peut pas poser de
 * sous-domaine. Arthur a donc choisi, le 26 octobre 2026, la seule chose qui
 * marche tout de suite : un SECOND PROJET Vercel sur le meme depot GitHub,
 * donc une seconde adresse. Le jour ou le domaine arrive, il suffira de
 * pointer `admin.moussodambe.bf` sur ce projet et de changer une variable.
 *
 * CE QUI SEPARE REELLEMENT LES DEUX
 *
 * `ADMIN_HOST` dit a chaque deploiement quel hote est celui de l'admin, et
 * `src/lib/hotes.ts` en tire son verdict : sur le site des clientes,
 * `/admin` et `/vendeur` repondent « introuvable » ; sur le site d'admin, le
 * cycle, le journal et la boutique repondent « introuvable » a leur tour.
 *
 * Cette separation d'adresses est une serrure DE PLUS, jamais la seule : la
 * barriere reelle reste la base, ou `est_admin()` et les regles d'acces
 * refusent de repondre a quelqu'un d'autre, quelle que soit l'adresse. Une
 * page d'administration servie par erreur sur le domaine public afficherait de
 * toute facon « Cet espace n'est pas pour toi ».
 *
 * Le jeton est lu dans le coffre et jamais affiche, comme dans vercel.mjs.
 * Les valeurs des variables ne sont jamais affichees non plus.
 */
import { valeurUnique, motifMousso } from './coffre.mjs';

/** Le projet des clientes, celui qui existe depuis le 25 octobre. */
const PROJET_CLIENTES = 'prj_8fr446kbsmMrxoT0H45KO6VtqafT';

/** Le depot que les DEUX projets deploient. Le meme code, deux adresses. */
const DEPOT = 'moussodambe0-lgtm/mousso-dambe';
const BRANCHE = 'master';

/** Le nom du second projet, donc son adresse : <nom>.vercel.app. */
const NOM_ADMIN = 'mousso-dambe-admin';
const HOTE_ADMIN = `${NOM_ADMIN}.vercel.app`;

/** Londres, comme le projet des clientes : c'est le plus proche du Burkina. */
const REGION = 'lhr1';

const action = process.argv[2] ?? 'etat';

const jeton = valeurUnique(motifMousso('(?:vercel|jeton.*vercel)'), { quoi: 'le jeton Vercel' });
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

/** Ce que chaque deploiement attend, et ou le trouver. */
function variablesAttendues(hoteAdmin) {
  const cle = (motif, quoi) => {
    const r = valeurUnique(motif, { quoi });
    if (!r.valeur) {
      console.error(`${quoi} : ${r.erreur}`);
      process.exit(1);
    }
    return r.valeur;
  };
  return [
    { key: 'PUBLIC_SUPABASE_URL', value: 'https://vnbaojckbhcjczdnjdjh.supabase.co', type: 'encrypted' },
    {
      key: 'PUBLIC_SUPABASE_ANON_KEY',
      value: cle(motifMousso('supabase.*anon'), 'la cle publiable'),
      type: 'encrypted',
    },
    {
      key: 'MD_CLE_SERVEUR',
      value: cle(motifMousso('(?:md.*)?cle.*serveur'), 'la cle serveur'),
      type: 'encrypted',
    },
    // La seule qui differe d'un projet a l'autre : elle nomme l'hote de
    // l'admin. Les deux deploiements recoivent la MEME valeur, et c'est voulu :
    // le site des clientes en a besoin pour construire le lien de « Mon
    // compte », le site d'admin pour se reconnaitre lui-meme.
    { key: 'ADMIN_HOST', value: hoteAdmin, type: 'encrypted' },
  ];
}

/** Trouver le projet d'admin, s'il existe deja. */
async function projetAdmin() {
  const r = await api(`/v9/projects/${NOM_ADMIN}`);
  return r.ok ? r.corps : null;
}

async function poserVariables(projetId, attendues) {
  const e = await api(`/v10/projects/${projetId}/env?decrypt=false`);
  const parCle = new Map((e.ok ? (e.corps.envs ?? []) : []).map((v) => [v.key, v]));
  for (const v of attendues) {
    const existante = parCle.get(v.key);
    const corps = JSON.stringify({
      ...(existante ? {} : { key: v.key, type: v.type }),
      value: v.value,
      target: ['production', 'preview', 'development'],
    });
    const r = existante
      ? await api(`/v9/projects/${projetId}/env/${existante.id}`, { method: 'PATCH', body: corps })
      : await api(`/v10/projects/${projetId}/env`, { method: 'POST', body: corps });
    console.log(
      `  ${v.key} : ${r.ok ? (existante ? 'mise a jour' : 'posee') : 'echec ' + r.statut + ' ' + JSON.stringify(r.corps).slice(0, 160)}`
    );
  }
}

async function etat() {
  const p = await projetAdmin();
  if (!p) {
    console.log(`projet d'admin : il n'existe pas encore (${NOM_ADMIN}).`);
    console.log("lancer : node outils/vercel-admin.mjs creer");
  } else {
    console.log(`projet d'admin : ${p.name}  (${p.id})`);
    console.log(`region des fonctions : ${p.serverlessFunctionRegion ?? 'iad1 (defaut, Washington)'}`);
    const e = await api(`/v10/projects/${p.id}/env?decrypt=false`);
    const envs = e.ok ? (e.corps.envs ?? []) : [];
    console.log(`variables (${envs.length}) : ${envs.map((v) => v.key).join(', ') || 'aucune'}`);
    const d = await api(`/v6/deployments?projectId=${p.id}&limit=3`);
    console.log('deploiements :');
    for (const x of d.corps?.deployments ?? []) console.log(`  ${x.state}  https://${x.url}`);
  }

  // Et la variable du cote des clientes, sans laquelle le lien de « Mon
  // compte » ne mene nulle part.
  const e2 = await api(`/v10/projects/${PROJET_CLIENTES}/env?decrypt=false`);
  const a = (e2.ok ? (e2.corps.envs ?? []) : []).find((v) => v.key === 'ADMIN_HOST');
  console.log(`\ncote clientes, ADMIN_HOST : ${a ? 'posee' : 'MANQUE'}`);
}

async function creer() {
  const attendues = variablesAttendues(HOTE_ADMIN);

  let p = await projetAdmin();
  if (p) {
    console.log(`le projet ${p.name} existe deja, on le met a jour.`);
  } else {
    const r = await api('/v11/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: NOM_ADMIN,
        framework: 'astro',
        gitRepository: { type: 'github', repo: DEPOT },
        serverlessFunctionRegion: REGION,
      }),
    });
    if (!r.ok) {
      console.error(`creation refusee (${r.statut}) : ${JSON.stringify(r.corps).slice(0, 400)}`);
      process.exit(1);
    }
    p = r.corps;
    console.log(`projet cree : ${p.name}  (${p.id})`);
  }

  console.log("\nvariables du projet d'admin :");
  await poserVariables(p.id, attendues);

  // Le site des clientes a besoin de la meme valeur, pour que le lien affiche
  // a Arthur dans « Mon compte » mene a la bonne adresse.
  console.log('\nvariable du cote des clientes :');
  await poserVariables(PROJET_CLIENTES, [attendues.find((v) => v.key === 'ADMIN_HOST')]);

  // Un projet fraichement cree n'a aucun deploiement : il faut le demander.
  const repo = await api(`/v9/projects/${p.id}`);
  const lien = repo.corps?.link ?? {};
  const r = await api('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: NOM_ADMIN,
      project: p.id,
      target: 'production',
      gitSource: {
        type: 'github',
        ref: BRANCHE,
        ...(lien.repoId ? { repoId: lien.repoId } : { repo: DEPOT, org: DEPOT.split('/')[0] }),
      },
    }),
  });
  if (!r.ok) {
    console.error(`\ndeploiement refuse (${r.statut}) : ${JSON.stringify(r.corps).slice(0, 400)}`);
    console.error("le projet et ses variables sont en place : relancer « creer » relancera le deploiement.");
    process.exit(1);
  }
  console.log(`\ndeploiement lance : ${r.corps.id}`);
  console.log(`adresse de l'administration : https://${HOTE_ADMIN}`);
  console.log('\nLe site des clientes doit etre redeploye pour voir ADMIN_HOST :');
  console.log('  node outils/vercel.mjs redeployer');
}

const actions = { etat, creer };
if (!actions[action]) {
  console.error(`action inconnue : ${action}. Choisir parmi ${Object.keys(actions).join(', ')}.`);
  process.exit(1);
}
await actions[action]();
