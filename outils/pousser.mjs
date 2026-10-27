/**
 * Pousser le depot vers GitHub, sans jamais ecrire le jeton nulle part.
 *
 *   node outils/pousser.mjs            pousse la branche courante
 *   node outils/pousser.mjs --etat     dit seulement ce qui attend d'etre pousse
 *
 * REGLE D'ARTHUR : JAMAIS DE JETON DANS L'ADRESSE D'UN REMOTE.
 *
 * Un jeton colle dans `git remote set-url https://TOKEN@github.com/...` finit
 * dans `.git/config`, en clair, sur un disque synchronise avec OneDrive, et il
 * reapparait dans la sortie de la moindre commande qui affiche le remote. Il y
 * reste aussi apres sa revocation, ce qui donne des erreurs incomprehensibles
 * des mois plus tard.
 *
 * Ici, le jeton est lu dans le coffre au moment du push et passe a git par un
 * assistant d'identifiants ecrit sur la ligne de commande (`-c
 * credential.helper=...`), qui ne touche aucun fichier et disparait avec le
 * processus. Il voyage par l'environnement du seul processus git, et il n'est
 * jamais affiche : ni en entier, ni en morceaux, meme pour verifier.
 */
import { spawnSync } from 'node:child_process';
import { valeurUnique, motifMousso } from './coffre.mjs';

const seulementLEtat = process.argv.includes('--etat');

function git(args, env) {
  return spawnSync('git', args, {
    cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

const branche = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
const enAttente = git(['log', '--oneline', `origin/${branche}..HEAD`]).stdout.trim();

if (!enAttente) {
  console.log(`Rien a pousser : ${branche} est deja a jour avec GitHub.`);
  process.exit(0);
}

const combien = enAttente.split('\n').length;
console.log(`${combien} commit(s) a pousser depuis ${branche} :`);
console.log(enAttente.replace(/^/gm, '  '));

if (seulementLEtat) process.exit(0);

const jeton = valeurUnique(motifMousso('git.*(hub|hup).*token'), {
  quoi: 'le jeton GitHub de Mousso Dambe',
});
if (!jeton.valeur) {
  console.error(jeton.erreur ?? 'Jeton GitHub introuvable dans le coffre.');
  console.error('Attendu : une ligne du coffre nommant a la fois GitHub et Mousso Dambe.');
  process.exit(1);
}

// DIRE DE QUEL COMPTE VIENT CE JETON, ET RIEN DE PLUS.
//
// Sur un depot prive, GitHub repond « Repository not found » aussi bien quand
// le jeton est expire que quand il vient d'un compte qui n'a pas acces. Les
// deux causes se ressemblent a l'ecran et se corrigent de deux facons
// opposees : il faut donc pouvoir les distinguer. On demande a GitHub quel
// compte porte ce jeton, et on affiche ce nom. Le jeton lui-meme n'est jamais
// affiche, pas meme un fragment : connaitre ses premiers caracteres n'aide a
// rien et les fait entrer dans les journaux.
if (process.argv.includes('--qui')) {
  const h = { Authorization: `Bearer ${jeton.valeur}`, 'User-Agent': 'mousso-dambe' };
  const compte = await fetch('https://api.github.com/user', { headers: h });
  if (!compte.ok) {
    console.log(`GitHub refuse ce jeton (${compte.status}) : il est expire ou revoque.`);
    console.log('Il faut en creer un nouveau et remplacer la ligne du coffre.');
    process.exit(1);
  }
  const qui = (await compte.json()).login;
  console.log(`Ce jeton appartient au compte GitHub : ${qui}`);

  const depot = await fetch('https://api.github.com/repos/moussodambe0-lgtm/mousso-dambe', {
    headers: h,
  });
  if (depot.ok) {
    console.log('Et il a bien acces au depot mousso-dambe.');
  } else {
    console.log(`Mais il n'a PAS acces au depot mousso-dambe (${depot.status}).`);
    console.log("Le depot appartient au compte moussodambe0-lgtm : le jeton doit etre cree");
    console.log('en etant connecte a CE compte, ou ce compte doit inviter le tien.');
  }
  process.exit(depot.ok ? 0 : 1);
}

// L'assistant ne vit que le temps de cette commande. `username` peut valoir
// n'importe quoi avec un jeton personnel : c'est le mot de passe qui compte.
const assistant = '!f() { echo username=x-access-token; echo "password=$GIT_JETON_MD"; }; f';

// LE PREMIER `credential.helper=` VIDE N'EST PAS UNE MALADRESSE, IL EST
// INDISPENSABLE SUR WINDOWS.
//
// Git empile les assistants d'identifiants et les interroge dans l'ordre ou il
// les trouve : ceux de la configuration d'abord, le notre ensuite. Or Windows
// installe « manager », qui garde en memoire les identifiants deja utilises
// pour github.com. Il repondait donc le premier, avec l'ancien jeton revoque,
// et notre assistant n'etait jamais consulte : GitHub repondait « Repository
// not found » alors que le jeton du coffre etait le bon, et que l'API le
// confirmait a la ligne precedente. Une valeur vide efface la liste ; le notre
// devient alors le seul.
const sortie = git(
  ['-c', 'credential.helper=', '-c', `credential.helper=${assistant}`, 'push', 'origin', branche],
  { GIT_JETON_MD: jeton.valeur, GIT_TERMINAL_PROMPT: '0' }
);

// On recopie ce que git dit, mais on raye toute trace du jeton au cas ou il
// apparaitrait dans un message d'erreur.
const propre = (texte) =>
  String(texte ?? '').split(jeton.valeur).join('[jeton masque]');

if (propre(sortie.stdout).trim()) console.log(propre(sortie.stdout).trim());
if (propre(sortie.stderr).trim()) console.log(propre(sortie.stderr).trim());

if (sortie.status !== 0) {
  console.error('');
  console.error('Le push a echoue. Les deux causes habituelles :');
  console.error('  - le jeton est expire ou revoque (GitHub repond alors « Repository not found »,');
  console.error('    meme quand le depot existe : il ne dit jamais « mauvais jeton » sur un depot prive) ;');
  console.error('  - le jeton a ete cree depuis un autre compte que celui qui possede le depot.');
  process.exit(sortie.status ?? 1);
}

console.log('');
console.log(`Pousse. Vercel redeploie tout seul depuis GitHub.`);
