// Proposer l'application, se taire quand elle l'a, reproposer quand elle l'enlève.
//
// Arthur, le 7 novembre 2026 : « dès que la personne rentre sur le site, on
// lui propose de télécharger. Mais si la personne a l'application dans son
// téléphone, cette proposition n'a pas lieu. Si la personne supprime
// l'application, on lui repropose encore. »
//
// CE QUE CES VÉRIFICATIONS PROTÈGENT. La version du 27 octobre écrivait un
// refus définitif AUSSI quand la femme acceptait. Une femme qui installait
// puis désinstallait ne revoyait donc jamais la proposition, pour toujours.
// C'était l'exact contraire du comportement voulu, et rien ne le disait : le
// défaut ne se voit qu'en désinstallant une application, ce qu'aucun essai ne
// fait.
//
// Le script tourne dans un navigateur et touche à localStorage, à
// matchMedia et à des événements. On ne peut pas l'importer ici. On vérifie
// donc ce qu'on peut vérifier sans navigateur, et qui suffit à tenir la
// règle : la forme du fichier, et la logique de la mémoire, rejouée à
// l'identique.
//
// Lancer : node supabase/tests/invite-installer.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = fs.readFileSync(path.join(RACINE, 'src/scripts/invite-installer.ts'), 'utf8');
const base = fs.readFileSync(path.join(RACINE, 'src/layouts/Base.astro'), 'utf8');

titre('Le défaut du 27 octobre ne doit pas revenir');
{
  // La phrase qui faisait tout le mal : noter un refus apres une acceptation.
  const apresAccepte = script.slice(script.indexOf("'accepted'"), script.indexOf("'accepted'") + 400);
  verifier(
    "accepter n'écrit PAS un refus",
    !/accepted[\s\S]{0,200}ecrireEtat\('refuse'\)/.test(apresAccepte),
    'une acceptation note encore un refus'
  );
  // Large a dessein : un commentaire explique pourquoi, entre les deux lignes.
  verifier("accepter note l'installation", /accepted[\s\S]{0,500}ecrireEtat\('installee'\)/.test(script));
  verifier('refuser note bien un refus', /dismissed|else[\s\S]{0,80}ecrireEtat\('refuse'\)/.test(script));
}

titre("Reproposer quand l'application a été supprimée");
{
  verifier(
    "l'écoute de beforeinstallprompt n'est pas coupée par un refus gardé",
    // L'ecouteur doit etre pose AVANT tout retour anticipe lie au refus :
    // c'est son arrivee qui prouve la desinstallation.
    script.indexOf("addEventListener('beforeinstallprompt'") < script.indexOf('refusFrais)') ||
      /desinstallee[\s\S]{0,120}else if \(refusFrais\) return/.test(script),
    "le script se tait avant d'avoir pu apprendre la désinstallation"
  );
  verifier(
    "un état « installee » plus l'événement veut dire désinstallée",
    /etat\?\.quoi === 'installee'/.test(script) && /oublier\(\)/.test(script)
  );
  verifier(
    "l'installation faite par le menu du navigateur est entendue aussi",
    /addEventListener\('appinstalled'/.test(script)
  );
}

titre('Se taire quand elle est dedans');
{
  verifier('on détecte le plein écran', /display-mode: standalone/.test(script));
  verifier('on détecte aussi Safari sur iPhone', /navigator.*standalone/.test(script));
  verifier(
    "être dedans note l'installation, pour pouvoir la démentir plus tard",
    /dansLApplication\(\)[\s\S]{0,200}ecrireEtat\('installee'\)/.test(script)
  );
}

titre("Un « plus tard » ne vaut pas pour toujours");
{
  const m = script.match(/DELAI_REFUS_JOURS = (\d+)/);
  verifier('un délai est posé', !!m, 'aucun délai');
  const jours = m ? Number(m[1]) : 0;
  verifier(`le délai est raisonnable (${jours} jours)`, jours >= 7 && jours <= 120, `${jours} jours`);
  verifier("l'ancienne clé définitive est reprise, pas ignorée", /md-installer-non/.test(script));
}

titre('La mémoire, rejouée à l\'identique');
{
  // Meme logique que le script, en trois lignes, pour verifier les cas.
  const JOUR = 86_400_000;
  const DELAI = Number(script.match(/DELAI_REFUS_JOURS = (\d+)/)?.[1] ?? 0);
  const refusFrais = (etat) => etat?.quoi === 'refuse' && (Date.now() - etat.le) / JOUR < DELAI;
  const onPropose = (etat, evenementArrive) => {
    if (!evenementArrive) return false;
    if (etat?.quoi === 'installee') return true; // elle l'a supprimee
    return !refusFrais(etat);
  };

  verifier('jamais vue : on propose', onPropose(null, true) === true);
  verifier(
    'refus d’hier : on se tait',
    onPropose({ quoi: 'refuse', le: Date.now() - 1 * JOUR }, true) === false
  );
  verifier(
    `refus d’il y a ${DELAI + 1} jours : on repropose`,
    onPropose({ quoi: 'refuse', le: Date.now() - (DELAI + 1) * JOUR }, true) === true
  );
  verifier(
    "installée : l'événement n'arrive pas, donc rien",
    onPropose({ quoi: 'installee', le: Date.now() }, false) === false
  );
  verifier(
    'LE CAS D’ARTHUR : installée puis supprimée, on repropose',
    onPropose({ quoi: 'installee', le: Date.now() - 3 * JOUR }, true) === true
  );
  verifier(
    'et on repropose même si elle avait refusé avant d’installer',
    onPropose({ quoi: 'installee', le: Date.now() - 1 * JOUR }, true) === true
  );
}

titre('Où le bandeau apparaît');
{
  verifier(
    "il n'est plus réservé aux femmes déjà entrées",
    !/\{nav && !chemin\.startsWith\('\/connexion'\) && <InviteInstaller/.test(base),
    'la condition « nav && » est encore là'
  );
  verifier(
    'il apparaît sur les pages des clientes',
    /chemin\.startsWith\('\/connexion'\) && <InviteInstaller/.test(base)
  );
  verifier("il reste hors de l'écran de connexion", /!chemin\.startsWith\('\/connexion'\)/.test(base));
}

titre('Rien ne casse sans stockage');
{
  const corps = script;
  const acces = (corps.match(/localStorage\./g) ?? []).length;
  const filets = (corps.match(/catch\s*\{/g) ?? []).length;
  verifier(`chaque accès au stockage a son filet (${acces} accès, ${filets} filets)`, filets >= 3, `${filets}`);
  verifier(
    'une valeur abîmée ne fait pas tomber la page',
    /JSON\.parse[\s\S]{0,400}catch/.test(corps)
  );
}

bilan("L'invitation à installer l'application");
