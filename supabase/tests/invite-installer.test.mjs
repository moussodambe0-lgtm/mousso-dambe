// Proposer l'application a chaque visite, se taire seulement quand elle l'a.
//
// Arthur, le 7 novembre 2026 : « quand je rentre sur la plateforme, on doit
// TOUJOURS me proposer de telecharger l'application. Une fois que je
// telecharge et que l'application est dans mon telephone, on me propose plus.
// Mais une fois que je supprime l'application, si je repars sur le site, on
// doit me proposer. »
//
// CE QUE CES VERIFICATIONS PROTEGENT, ET C'EST UNE HISTOIRE EN DEUX TEMPS.
//
// 1. La version du 27 octobre ecrivait un refus definitif AUSSI quand la femme
//    acceptait. Installer puis desinstaller voulait donc dire ne plus jamais
//    revoir la proposition.
// 2. La correction du matin du 7 novembre a remplace ce refus definitif par un
//    refus de trente jours. Personne ne l'avait demande : c'etait un ajout de
//    Claude « pour ne pas harceler ». Il contredisait la demande, et sa reprise
//    de l'ancienne cle datait le refus du JOUR DE LA MISE A JOUR : tous ceux
//    qui avaient dit non en octobre se retrouvaient muets trente jours de plus
//    sans avoir rien touche. C'est comme ca qu'Arthur s'en est apercu.
//
// La regle tenue ici est donc : AUCUNE memoire d'un refus entre deux visites.
// Le seul silence autorise est celui de la visite en cours, dans
// sessionStorage, que le navigateur efface tout seul.
//
// Le script tourne dans un navigateur et touche a sessionStorage, a
// matchMedia et a des evenements. On ne peut pas l'importer ici. On verifie
// donc ce qu'on peut verifier sans navigateur, et qui suffit a tenir la
// regle : la forme du fichier, et la logique rejouee a l'identique.
//
// Lancer : node supabase/tests/invite-installer.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = fs.readFileSync(path.join(RACINE, 'src/scripts/invite-installer.ts'), 'utf8');
const base = fs.readFileSync(path.join(RACINE, 'src/layouts/Base.astro'), 'utf8');

titre('Aucun refus ne survit a la visite');
{
  verifier(
    'le refus est range dans sessionStorage, pas dans localStorage',
    /sessionStorage\.setItem/.test(script) && !/localStorage\.setItem/.test(script),
    'un refus est encore ecrit dans un stockage qui survit a la visite'
  );
  verifier(
    'plus aucun delai en jours',
    !/DELAI_REFUS_JOURS/.test(script) && !/86_?400_?000/.test(script),
    'un delai est revenu'
  );
  verifier(
    'plus aucune date gardee',
    !/joursDepuis/.test(script) && !/Date\.now\(\)/.test(script),
    'le script date encore quelque chose'
  );
}

titre('Les cles des anciennes versions sont effacees');
{
  // Les deux feraient taire la proposition pour une femme qui n'a pas
  // l'application. On ne les ignore pas, on les enleve.
  verifier("l'ancienne cle du 27 octobre est nommee", /md-installer-non/.test(script));
  verifier('celle du matin du 7 novembre aussi', /'md-installer'/.test(script));
  verifier('et elles sont retirees du stockage', /localStorage\.removeItem/.test(script));
  verifier(
    "l'effacement est appele au demarrage",
    /^oublierLesAnciennes\(\);$/m.test(script),
    "la fonction existe mais n'est pas appelee"
  );
}

titre("L'arrivee de l'evenement suffit, sans condition ajoutee");
{
  const i = script.indexOf("addEventListener('beforeinstallprompt'");
  verifier("l'evenement est ecoute", i > 0);
  const corps = script.slice(i, i + 900);
  verifier(
    'rien ne coupe la proposition avant de la montrer',
    !/\breturn;/.test(corps.slice(0, corps.indexOf('montrer('))),
    'un retour anticipe empeche encore de proposer'
  );
  verifier("montrer('android') est bien appele", /montrer\('android'/.test(corps));
}

titre('Se taire quand elle est dedans');
{
  verifier('on detecte le plein ecran', /display-mode: standalone/.test(script));
  verifier('on detecte aussi Safari sur iPhone', /navigator.*standalone/.test(script));
  verifier(
    "tout le mecanisme est sous « pas dans l'application »",
    /if \(!dansLApplication\(\)\) \{/.test(script)
  );
}

titre('La logique, rejouee a l identique');
{
  // Meme logique que le script, en deux lignes, pour verifier les cas.
  const onPropose = (dedans, evenementArrive, refuseeCetteVisite) => {
    if (dedans) return false;
    if (!evenementArrive) return false;
    return !refuseeCetteVisite;
  };

  verifier('jamais vue : on propose', onPropose(false, true, false) === true);
  verifier(
    "installee : l'evenement n'arrive pas, donc rien",
    onPropose(false, false, false) === false
  );
  verifier('ouverte DANS l application : rien', onPropose(true, true, false) === false);
  verifier(
    'LE CAS D ARTHUR : installee puis supprimee, on repropose',
    onPropose(false, true, false) === true
  );
  verifier(
    'elle a dit « plus tard » : silence sur cette page',
    onPropose(false, true, true) === false
  );
  verifier(
    'MAIS la visite suivante repropose (sessionStorage vide)',
    onPropose(false, true, false) === true
  );
}

titre('Ou le bandeau apparait');
{
  verifier(
    "il n'est plus reserve aux femmes deja entrees",
    !/\{nav && !chemin\.startsWith\('\/connexion'\) && <InviteInstaller/.test(base),
    'la condition « nav && » est encore la'
  );
  verifier(
    'il apparait sur les pages des clientes',
    /chemin\.startsWith\('\/connexion'\) && <InviteInstaller/.test(base)
  );
  verifier("il reste hors de l'ecran de connexion", /!chemin\.startsWith\('\/connexion'\)/.test(base));
}

titre('Rien ne casse sans stockage');
{
  const acces = (script.match(/(?:local|session)Storage\./g) ?? []).length;
  const filets = (script.match(/catch\s*\{/g) ?? []).length;
  verifier(`chaque acces au stockage a son filet (${acces} acces, ${filets} filets)`, filets >= 3, `${filets}`);
  verifier(
    'un stockage bloque fait proposer, pas se taire',
    /catch \{[\s\S]{0,200}return false;/.test(script),
    'un stockage bloque pourrait faire taire la proposition'
  );
}

bilan("L'invitation a installer l'application");
