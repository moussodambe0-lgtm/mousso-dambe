/**
 * Tout lancer d'un coup, pour regarder l'application sur ce PC.
 *
 *   npm run demo
 *
 * Démarre trois choses : la fausse base (PGlite), la fausse assistante, et le
 * site. Puis affiche l'adresse à ouvrir. Ctrl+C arrête tout.
 *
 * Rien de tout cela ne part en ligne : c'est une démonstration locale, avec
 * des données inventées et un compte de démonstration.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(RACINE, '.env');

// Le .env de démonstration, écrit seulement s'il n'existe pas : on n'écrase
// jamais les vraies clés d'Arthur.
if (!fs.existsSync(ENV)) {
  fs.writeFileSync(
    ENV,
    [
      '# Écrit par « npm run demo ». Remplace ces valeurs par les vraies clés',
      '# Supabase quand le projet sera créé.',
      'PUBLIC_SUPABASE_URL=http://127.0.0.1:5433',
      'PUBLIC_SUPABASE_ANON_KEY=cle-anon-du-banc',
      'MD_CLE_SERVEUR=cle-du-banc-local-mousso-dambe',
      'OLLAMA_URL=http://127.0.0.1:11435',
      'OLLAMA_API_KEY=',
      'ASSISTANTE_MODELE=demonstration',
      '',
    ].join('\n')
  );
  console.log('Un .env de démonstration a été écrit.');
}

const enfants = [];

function lancer(nom, commande, arguments_, parLeShell = false) {
  // Node s'appelle directement : son chemin contient « Program Files », et le
  // shell de Windows couperait sur l'espace. Seul `npx` a besoin du shell,
  // parce que c'est un fichier .cmd.
  const enfant = spawn(commande, arguments_, {
    cwd: RACINE,
    shell: parLeShell && process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ecrire = (bout) => {
    for (const ligne of String(bout).split('\n')) {
      if (ligne.trim()) console.log(`[${nom}] ${ligne}`);
    }
  };
  enfant.stdout.on('data', ecrire);
  enfant.stderr.on('data', ecrire);
  enfants.push(enfant);
  return enfant;
}

console.log('\nDémarrage de la démonstration de Mousso Dambé…\n');

lancer('base', process.execPath, ['outils/banc-local/serveur.mjs']);
lancer('dambé', process.execPath, ['outils/banc-local/faux-ollama.mjs']);

// Le site attend que la base ait fini de rejouer les migrations.
setTimeout(() => {
  // « --host » tout court n'est pas un détail. Sans aucun hôte, Astro n'écoute
  // qu'en IPv6 (« [::1] ») et tout ce qui appelle en IPv4 tombe sur un lien
  // mort : c'est le cas du navigateur intégré de VS Code (trouvé le 12 octobre
  // 2026, « le lien ne marche pas »). Mais avec « --host 127.0.0.1 », c'est
  // l'inverse : « localhost » se résout d'abord en IPv6 sur Windows, et c'est
  // LUI qui tombe sur un lien mort (trouvé le 13 octobre, « NON LOCALHOST »).
  //
  // « --host » écoute sur les deux, donc les deux adresses marchent. Revers à
  // connaître : le site devient aussi joignable depuis le wifi de la maison.
  // C'est une démonstration locale avec des données inventées, donc sans
  // conséquence ici.
  lancer('site', 'npx', ['astro', 'dev', '--port', '4322', '--host'], true);
  // Le site met une bonne trentaine de secondes à être prêt sur cette
  // machine : on n'annonce l'adresse qu'une fois qu'elle répond vraiment,
  // sinon on envoie Arthur sur une page blanche.
  const guetter = setInterval(async () => {
    try {
      await fetch('http://127.0.0.1:4322/');
      clearInterval(guetter);
      console.log('\n========================================================');
      console.log('  Ouvre http://127.0.0.1:4322 dans ton navigateur.');
      console.log('  Connexion : awa@essai.bf   mot de passe : motdepasse');
      console.log('  Ctrl+C pour tout arrêter.');
      console.log('========================================================\n');
    } catch {
      /* pas encore prêt */
    }
  }, 2000);
}, 12000);

function arreter() {
  for (const enfant of enfants) {
    try {
      enfant.kill();
    } catch {
      /* déjà fini */
    }
  }
  process.exit(0);
}

process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);
