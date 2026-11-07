// Garder son compte, et poser l'application sur le téléphone (27 octobre 2026).
//
// Ce fichier ne touche pas la base. Il garde trois promesses faites à Arthur,
// qui se cassent toutes les trois en silence : rien ne plante, aucun test
// existant ne tombe, et on ne s'en aperçoit qu'en tenant un vrai téléphone.
//
//   1. Une femme entrée par « Commencer » peut atteindre l'écran de connexion.
//      Elle en était renvoyée, donc elle n'avait AUCUN moyen d'obtenir un
//      compte : la seule porte vers la messagerie lui était fermée à clé.
//
//   2. Se connecter avec Google ATTACHE Google à son compte au lieu de la
//      poser sur un autre. Sans ça, son cycle et son journal deviennent
//      inaccessibles au moment précis où elle essaie de les mettre à l'abri.
//
//   3. Les icônes de l'application sont carrées et font la taille qu'elles
//      annoncent. Le 27 octobre, elles mesuraient 192x96 et 512x256 en se
//      déclarant 192x192 et 512x512. Chrome refuse alors d'installer le site,
//      sans message : l'invitation ne s'affiche jamais et l'entrée disparaît
//      de son menu. C'est la panne la plus discrète des trois.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';
import { seulementLeVerificateur, porteUnVerificateur } from '../../src/lib/oauth.ts';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lire = (relatif) => fs.readFileSync(path.join(RACINE, relatif), 'utf8');

titre("L'écran de connexion n'est plus interdit à celle qui est déjà entrée");
{
  const page = lire('src/pages/connexion.astro');

  verifier(
    'seul un VRAI compte est renvoyé à l’accueil',
    /if \(moi\?\.compteReel\) return Astro\.redirect\('\/'/.test(page)
  );
  verifier(
    'la session anonyme ne referme plus la porte',
    !/if \(baseConfiguree\(\) && \(await visiteuse\(Astro\)\)\) \{\s*return Astro\.redirect/.test(page)
  );
  // DEUX BOUTONS AVANT GOOGLE (Arthur, le 27 octobre 2026) : « la personne doit
  // voir s'inscrire ou se connecter, les deux options, deux boutons ». Les deux
  // mènent au même second écran, mais celle qui n'a jamais eu de compte cherche
  // « s'inscrire » et n'ose pas cliquer sur « se connecter ».
  verifier("le premier écran propose de s'inscrire", page.includes("action=inscrire"));
  verifier('il propose aussi de se connecter', page.includes('action=connecter'));
  verifier(
    's’inscrire ATTACHE l’email au compte commencé, au lieu d’en ouvrir un autre',
    page.includes("geste === 'attacher'") && page.includes('auth.updateUser')
  );
  verifier(
    'se connecter rejoint bien un compte qui existe ailleurs',
    page.includes('signInWithPassword')
  );
  verifier(
    'et elle est prévenue de ce qu’elle laisse derrière elle',
    /ne suivra pas/.test(page)
  );
}

titre('L’email en premier, Google en dessous');
{
  const page = lire('src/pages/connexion.astro');
  const bouton = lire('src/components/BoutonGoogle.astro');

  // LES MOTS D'ARTHUR, LE 27 OCTOBRE 2026, APRÈS AVOIR VU L'ÉCRAN.
  verifier(
    'le bouton parle de Google, et pas d’autre chose',
    /texte=\{etape === 'inscrire' \? "S'inscrire avec Google" : 'Se connecter avec Google'\}/.test(page),
    'le libellé du bouton Google a changé de forme'
  );
  verifier('et plus « Garder avec Google »', !page.includes('Garder avec Google'));
  verifier(
    'la phrase « deux touches, rien à retenir » est retirée',
    !/rien à retenir/.test(page)
  );
  verifier('« Garde ton compte » ne sert plus de titre', !page.includes('Garde ton compte'));
  // « Nous n'avons pas pu attacher Google a ton compte » ne voulait rien dire
  // pour elle (Arthur : « ca veut dire quoi ? »). Attacher est un mot de
  // mecanique interne : il a sa place dans les commentaires, jamais a l'ecran.
  // On relit donc seulement les textes affiches, pas tout le fichier.
  const affiches = [...page.matchAll(/(?:erreur|reussite) =\s*((?:'[^']*'|"[^"]*"|\s*\+\s*)+)/g)]
    .map((m) => m[1])
    .join(' ');
  verifier(
    'aucun message a l’ecran ne parle d’« attacher »',
    affiches.length > 0 && !/attach/i.test(affiches),
    affiches.slice(0, 80)
  );

  // LE CUL-DE-SAC : « la barre en bas disparaît, et il n'y a pas un truc pour
  // revenir en arrière. Faut pas que les gens aillent là-bas se bloquer. »
  verifier('la barre du bas reste pour celle qui est déjà dedans', /nav=\{onglet\}/.test(page));
  verifier(
    'l’écran plein ne vaut plus que pour celle qui vient de dehors',
    /pleinEcran=\{!onglet\}/.test(page)
  );
  verifier('un retour existe', page.includes('class="revenir"'));

  verifier('le bouton Google est demandé en grand', /<BoutonGoogle\s+grand/.test(page));
  verifier('la version en grand existe vraiment', bouton.includes('btn-google-grand'));
  /*
   * LE VOLET EST SUPPRIMÉ (7 novembre 2026). Arthur, après avoir essayé la
   * page : « il doit avoir une partie où on renseigne à la main son email, et
   * en bas mot de passe. Et maintenant en bas encore, on va voir se connecter
   * ou s'inscrire avec Google. »
   *
   * Ce test exigeait l'inverse, et il avait raison de le faire le 27 octobre :
   * ce jour-là, l'email n'était qu'une promesse, puisque aucun message de
   * confirmation ne partait. Le replier derrière « Utiliser un email et un mot
   * de passe » n'était donc pas une erreur de mise en page, c'était la
   * conséquence d'un chemin qui n'existait pas.
   *
   * Depuis le 7 novembre, l'email part vraiment (Resend). Les deux chemins
   * sont réels, et c'est celui qui marche pour une femme sans compte Google
   * qui passe devant.
   */
  verifier(
    'le formulaire email est visible d’emblée, plus aucun volet à ouvrir',
    !/<details class="replie"/.test(page) && /<form method="POST" class="formulaire">/.test(page)
  );
  verifier(
    'l’email est AVANT le bouton Google dans la page',
    page.indexOf('class="formulaire"') < page.indexOf('<BoutonGoogle'),
    'le bouton Google est remonté au-dessus du formulaire'
  );
  verifier(
    'un « ou » sépare les deux chemins, pour qu’on ne croie pas devoir faire les deux',
    /class="ou" role="separator"/.test(page)
  );
  verifier(
    'la page marche sans JavaScript : aucun script ne la pilote',
    !/addEventListener\(.(click|toggle)./.test(page)
  );
  verifier(
    'un seul formulaire de mot de passe',
    (page.match(/<form method="POST"/g) ?? []).length === 1
  );
}

titre('Se connecter avec Google n’efface pas ce qu’elle a déjà écrit');
{
  const route = lire('src/pages/auth/google.ts');

  verifier('la liaison existe', route.includes('linkIdentity'));
  verifier(
    'elle est choisie quand une session est déjà ouverte',
    /if \(moi && !basculer/.test(route)
  );
  verifier(
    'un vrai compte ne repasse pas par là',
    route.includes('if (moi?.compteReel) return contexte.redirect')
  );
  // Le vrai risque est qu'un jour quelqu'un « repare » l'echec de liaison en
  // rappelant signInWithOAuth juste apres : la femme serait alors connectee
  // sur un compte neuf, sans rien comprendre, et son cycle resterait derriere.
  // Un seul appel dans tout le fichier, c'est la preuve qu'il n'y a pas de
  // second chemin.
  verifier(
    'un seul signInWithOAuth dans tout le fichier',
    (route.match(/auth\.signInWithOAuth/g) ?? []).length === 1
  );
  verifier(
    "l'echec renvoie a l'ecran qui explique, au lieu de connecter",
    /erreur=\$\{cause === 'deja-pris' \? 'google-deja-pris' : 'liaison'\}/.test(route)
  );
  verifier(
    'le basculement existe, mais seulement si elle le demande',
    route.includes("basculer") && route.includes("'1'")
  );
}

titre('Le secret de connexion voyage seul, sans la session');
{
  const sac = {
    'sb-abc-auth-token-code-verifier': 'x'.repeat(40),
    'sb-abc-auth-token': JSON.stringify({ access_token: 'JETON', refresh_token: 'RAFRAICHIR' }),
  };
  const filtre = seulementLeVerificateur(sac);

  verifier('le vérificateur est gardé', porteUnVerificateur(filtre));
  verifier('la session ne part pas dans le cookie', !JSON.stringify(filtre).includes('JETON'));
  verifier(
    'le jeton de rafraîchissement non plus',
    !JSON.stringify(filtre).includes('RAFRAICHIR')
  );
  verifier('rien d’autre ne passe', Object.keys(filtre).length === 1);
}

titre('La messagerie et le compte demandent un vrai compte, le reste non');
{
  const FERMEES = [
    'src/pages/discussions/index.astro',
    'src/pages/discussions/[sujet].astro',
    'src/pages/dambe.astro',
    'src/pages/compte.astro',
    'src/pages/compte/adresse.astro',
    'src/pages/compte/avatar.astro',
    'src/pages/compte/favoris.astro',
  ];
  for (const f of FERMEES) {
    verifier(`fermée sans compte : ${f.replace('src/pages/', '')}`, /!moi\.compteReel/.test(lire(f)));
  }

  // CE QUI DOIT RESTER OUVERT, et c'est la moitié qui compte : Arthur n'a
  // nommé que deux zones. Fermer le cycle ou la boutique viderait « Commencer »
  // de son sens, puisqu'il n'y aurait plus rien à faire après.
  const OUVERTES = [
    'src/pages/cycle/index.astro',
    'src/pages/journal.astro',
    'src/pages/boutique/index.astro',
    'src/pages/panier.astro',
    'src/pages/parametres.astro',
  ];
  for (const f of OUVERTES) {
    verifier(`reste ouverte : ${f.replace('src/pages/', '')}`, !/!moi\.compteReel/.test(lire(f)));
  }

  // On cherche la GARDE, pas le mot : le fichier parle justement de
  // `compteReel` pour expliquer pourquoi il n'en pose pas.
  verifier(
    'effacer ses propres questions reste possible sans compte',
    !/if \([^)]*!\s*\w+\.compteReel[^)]*\)\s*return/.test(lire('src/pages/dambe/effacer.ts'))
  );
  // Les deux bouts doivent se repondre : les pages fermees posent `?pour=…`,
  // et l'ecran de connexion doit savoir traduire chacune des valeurs posees.
  const connexion = lire('src/pages/connexion.astro');
  const demandes = new Set();
  for (const f of FERMEES) {
    const m = lire(f).match(/\/connexion\?pour=([a-z]+)/);
    if (m) demandes.add(m[1]);
  }
  verifier('les pages fermées disent pourquoi', demandes.size >= 2);
  for (const quoi of demandes) {
    // `^\s*nom:` en mode multiligne : on cherche la cle de l'objet POURQUOI,
    // pas le mot n'importe ou dans le fichier.
    verifier(
      `l'ecran de connexion sait traduire « ${quoi} »`,
      new RegExp('^\\s*' + quoi + ':', 'm').test(connexion)
    );
  }
}

titre('Les icônes de l’application sont ce qu’elles prétendent être');
{
  const manifeste = JSON.parse(lire('public/manifest.webmanifest'));

  verifier('le manifeste ouvre sans barre d’adresse', manifeste.display === 'standalone');
  verifier('il porte le nom de l’application', manifeste.name === 'Mousso Dambé');

  for (const icone of manifeste.icons) {
    const relatif = path.join('public', icone.src.replace(/^\//, ''));
    const complet = path.join(RACINE, relatif);

    verifier(`${icone.src} existe`, fs.existsSync(complet));
    if (!fs.existsSync(complet)) continue;

    // Les dimensions se lisent dans l'en-tête IHDR d'un PNG : huit octets de
    // signature, puis la longueur et le nom du bloc, puis largeur et hauteur
    // sur quatre octets chacune. Pas besoin d'une bibliothèque pour ça.
    const tete = fs.readFileSync(complet).subarray(0, 24);
    const largeur = tete.readUInt32BE(16);
    const hauteur = tete.readUInt32BE(20);
    const [annoncee] = icone.sizes.split('x').map(Number);

    verifier(
      `${icone.src} est carrée (${largeur}x${hauteur})`,
      largeur === hauteur,
      `${largeur}x${hauteur}`
    );
    verifier(
      `${icone.src} fait bien les ${icone.sizes} annoncés`,
      largeur === annoncee,
      `${largeur} au lieu de ${annoncee}`
    );
  }

  // CHROME N'INSTALLE RIEN SANS UNE ICÔNE D'AU MOINS 192 PX DE CÔTÉ.
  const assezGrande = manifeste.icons.some((i) => Number(i.sizes.split('x')[0]) >= 192);
  verifier('au moins une icône de 192 px ou plus', assezGrande);

  // Une maskable à part : la même image ne peut pas servir aux deux, son logo
  // doit être réduit pour survivre au recadrage d'Android.
  const maskables = manifeste.icons.filter((i) => String(i.purpose).includes('maskable'));
  const ordinaires = manifeste.icons.filter((i) => String(i.purpose).includes('any'));
  verifier('une icône maskable est déclarée', maskables.length >= 1);
  verifier(
    'elle a son propre fichier, pas celui de l’icône ordinaire',
    maskables.every((m) => !ordinaires.some((o) => o.src === m.src))
  );
}

titre('L’invitation à installer ne ment jamais');
{
  const composant = lire('src/components/InviteInstaller.astro');
  const script = lire('src/scripts/invite-installer.ts');

  verifier('le bandeau est caché tant que rien ne l’a ouvert', /id="invite-installer" hidden/.test(composant));
  verifier(
    'il ne s’ouvre qu’après l’accord du navigateur',
    script.includes("addEventListener('beforeinstallprompt'")
  );
  verifier(
    'il se tait si l’application est déjà installée',
    script.includes('dansLApplication') && /if \(!dansLApplication\(\)\)/.test(script)
  );
  /*
   * CE QUI ÉTAIT VÉRIFIÉ ICI, ET QUI NE DOIT PLUS L'ÊTRE.
   *
   * Deux lignes exigeaient `dejaInstallee` et `retenirLeRefus`, les fonctions
   * de la version du 27 octobre, et l'une d'elles portait ce titre :
   * « un "Plus tard" vaut pour toujours ». C'était précisément le défaut.
   * Arthur, le 7 novembre 2026 : « quand je rentre sur la plateforme, on doit
   * TOUJOURS me proposer de télécharger l'application ».
   *
   * Un test qui nomme des fonctions internes se casse au premier remaniement,
   * et pire : il défend la mauvaise règle avec le même aplomb que la bonne.
   * Le comportement attendu est désormais vérifié pour lui-même dans
   * supabase/tests/invite-installer.test.mjs.
   */
  // Chaque acces au stockage doit etre entoure : en navigation privee, ou
  // quand les donnees de site sont bloquees, une simple lecture leve une
  // exception et le script meurt avant d'avoir rien affiche.
  const acces = (script.match(/(?:local|session)Storage\./g) ?? []).length;
  const filets = (script.match(/catch \{/g) ?? []).length;
  verifier(
    `chaque accès au stockage a son filet (${acces} accès, ${filets} filets)`,
    acces > 0 && filets >= acces
  );
  verifier(
    "sur iPhone, aucun bouton qui ne mènerait nulle part",
    composant.includes("html[data-installer='ios']) .installer") && composant.includes('display: none')
  );
}

bilan('Garder son compte, et installer l’application');
