// Le bouton Google s'affiche tout seul, ou pas du tout.
//
// Arthur, le 7 novembre 2026, pour la troisieme fois : « le bouton continuer
// avec Google, je ne le vois toujours pas. Je ne sais pas pourquoi tu ne veux
// pas mettre ca. »
//
// Il etait cache par une constante ecrite a la main, posee le matin parce que
// le fournisseur Google avait disparu avec l'ancienne base. La raison tenait,
// mais la reponse etait mauvaise : elle obligeait a modifier le code, a le
// pousser et a redeployer le jour ou Google revient, et surtout elle obligeait
// quelqu'un a SE SOUVENIR de le faire.
//
// On demande donc a la base. Ce fichier garde les trois precautions qui
// rendent cette question sans danger, et chacune vient d'une panne vecue :
//
//   1. la reponse est gardee en memoire, sinon chaque affichage de l'ecran de
//      connexion ajoute un aller-retour reseau a une page deja lente ;
//   2. l'attente est bornee a deux secondes. Le 6 novembre, un appel
//      d'authentification sans borne a mis l'application entiere hors service
//      pendant des heures : 504 sur toutes les pages, pour toutes les femmes
//      connectees. On ne refait pas ca pour savoir si un bouton s'affiche ;
//   3. en cas de doute, on repond NON. Ne pas montrer un bouton qui marche
//      est un desagrement ; en montrer un qui ne marche pas est exactement ce
//      qu'on essaie d'eviter.
//
// Lancer : node supabase/tests/google-actif.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const source = lire('src/lib/google.ts');

// `astro:env/client` n'existe qu'a l'interieur d'Astro : on remplace cette
// seule ligne, puis le vrai compilateur TypeScript enleve les types.
const js = ts.transpileModule(
  source.replace(
    /^import \{ PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY \} from 'astro:env\/client';$/m,
    "const PUBLIC_SUPABASE_URL = ''; const PUBLIC_SUPABASE_ANON_KEY = '';"
  ),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;
const m = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const BASE = { url: 'https://exemple.supabase.co', cle: 'cle-publiable' };
const reponse = (corps, ok = true) => () =>
  Promise.resolve({ ok, json: () => Promise.resolve(corps) });

titre('Ce que la base repond decide, et rien d autre');
{
  m.oublierGoogle();
  const allume = await m.googleActif({ ...BASE, chercher: reponse({ external: { google: true } }) });
  verifier('google: true -> le bouton s affiche', allume === true);

  m.oublierGoogle();
  const eteint = await m.googleActif({ ...BASE, chercher: reponse({ external: { google: false } }) });
  verifier('google: false -> il ne s affiche pas', eteint === false);

  m.oublierGoogle();
  const absent = await m.googleActif({ ...BASE, chercher: reponse({ external: {} }) });
  verifier('fournisseur absent de la liste -> non', absent === false);

  m.oublierGoogle();
  const bizarre = await m.googleActif({ ...BASE, chercher: reponse({ external: { google: 'oui' } }) });
  verifier('une valeur qui n est pas un booleen -> non', bizarre === false);
}

titre('En cas de doute, on repond non');
{
  m.oublierGoogle();
  const coupe = await m.googleActif({ ...BASE, chercher: () => Promise.reject(new Error('reseau')) });
  verifier('reseau coupe -> non, et aucune exception', coupe === false);

  m.oublierGoogle();
  const refus = await m.googleActif({ ...BASE, chercher: reponse({}, false) });
  verifier('reponse en erreur -> non', refus === false);

  m.oublierGoogle();
  const illisible = await m.googleActif({
    ...BASE,
    chercher: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('pas du json')) }),
  });
  verifier('reponse illisible -> non', illisible === false);

  m.oublierGoogle();
  const sansBase = await m.googleActif({ url: '', cle: '', chercher: () => { throw new Error('ne doit pas etre appele'); } });
  verifier('base non configuree -> non, sans meme demander', sansBase === false);
}

titre('On ne demande pas a chaque affichage');
{
  m.oublierGoogle();
  let appels = 0;
  const compte = () => { appels++; return reponse({ external: { google: true } })(); };

  await m.googleActif({ ...BASE, chercher: compte });
  await m.googleActif({ ...BASE, chercher: compte });
  await m.googleActif({ ...BASE, chercher: compte });
  verifier(`trois affichages, une seule question (${appels})`, appels === 1, `${appels} appels`);

  // Le temps passe : on redemande.
  const depart = Date.now();
  await m.googleActif({ ...BASE, chercher: compte, maintenant: () => depart + m.DUREE_MEMOIRE_MS + 1000 });
  verifier('passe le delai, on redemande', appels === 2, `${appels} appels`);
}

titre('Un « non » venu d une panne ne tient pas dix minutes');
{
  // Sinon une coupure de deux secondes cacherait le bouton pour un quart
  // d'heure, et Arthur verrait de nouveau une page sans Google sans
  // comprendre pourquoi.
  m.oublierGoogle();
  let appels = 0;
  const depart = Date.now();

  await m.googleActif({ ...BASE, chercher: () => { appels++; return Promise.reject(new Error('panne')); }, maintenant: () => depart });
  const apres = await m.googleActif({
    ...BASE,
    chercher: () => { appels++; return reponse({ external: { google: true } })(); },
    maintenant: () => depart + 40_000,
  });
  verifier('quarante secondes plus tard, on redemande', appels === 2, `${appels} appels`);
  verifier('et le bouton revient', apres === true);
}

titre('L attente est bornee, et courte');
{
  const borne = Number(source.match(/DELAI_MS = (\d+)/)?.[1] ?? 0);
  verifier('un delai est pose', borne > 0);
  verifier(
    `il est bien en dessous des 15 s de la page (${borne} ms)`,
    borne > 0 && borne <= 3000,
    `${borne} ms`
  );
  verifier(
    'et il est applique a la requete',
    /AbortSignal\.timeout\(delaiMs\)/.test(source)
  );
}

titre('Les deux pages s en servent, plus aucune constante ecrite a la main');
{
  for (const f of ['src/pages/connexion.astro', 'src/pages/inscription.astro']) {
    const src = lire(f);
    verifier(
      `${f.replace('src/pages/', '')} demande a la base`,
      /const GOOGLE_DISPONIBLE = await googleActif\(\)/.test(src),
      'une constante ecrite a la main est revenue'
    );
    verifier(
      `${f.replace('src/pages/', '')} : plus de « = false » fige`,
      !/GOOGLE_DISPONIBLE = false/.test(src)
    );
  }
}

titre('Le drapeau est dessine, pas ecrit');
{
  // Un emoji de drapeau est un COUPLE DE LETTRES que le systeme remplace par
  // une image s'il en possede une. Windows n'en possede aucune et affiche
  // « BF » ; plusieurs Android d'entree de gamme font de meme. Arthur, le
  // 7 novembre 2026 : « je ne vois pas le drapeau du Burkina ».
  const drapeau = lire('src/components/DrapeauBF.astro');
  verifier('le composant existe', drapeau.length > 0);
  verifier('il dessine un SVG', /<svg/.test(drapeau) && /<polygon/.test(drapeau));
  verifier('aux trois couleurs du Burkina', /#EF2B2D/.test(drapeau) && /#009E49/.test(drapeau) && /#FCD116/.test(drapeau));
  verifier('et il se nomme pour les lecteurs d ecran', /aria-label="Burkina Faso"/.test(drapeau));

  for (const f of ['src/pages/connexion.astro', 'src/pages/inscription.astro']) {
    const src = lire(f);
    verifier(
      `${f.replace('src/pages/', '')} n utilise plus l emoji`,
      !src.includes('\u{1F1E7}\u{1F1EB}'),
      'l emoji est revenu : il s affiche « BF » sur beaucoup d appareils'
    );
    if (/DrapeauBF/.test(src)) {
      verifier(`${f.replace('src/pages/', '')} affiche le dessin`, /<DrapeauBF taille=\{22\} \/>/.test(src));
    }
  }
}

bilan('Google, et le drapeau du Burkina');
