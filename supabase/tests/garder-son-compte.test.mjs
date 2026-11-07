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
  /*
   * DEUX BOUTONS, SUR DEUX VRAIES PAGES (Arthur, le 27 octobre 2026 : « la
   * personne doit voir s'inscrire ou se connecter, les deux options, deux
   * boutons », puis le 7 novembre 2026 : « je veux la même page que Jia »).
   *
   * Le 27 octobre, les deux boutons menaient au MÊME écran, avec un paramètre
   * `?action=`. Depuis le 7 novembre, chacun a sa page, comme chez Jia :
   * l'écran de choix est /compte pour une visiteuse (compte/visiteur.astro),
   * et l'inscription a retrouvé la sienne. La promesse, elle, n'a pas bougé :
   * celle qui n'a jamais eu de compte cherche « s'inscrire » et n'ose pas
   * cliquer sur « se connecter ».
   */
  const accueil = lire('src/pages/compte/visiteur.astro');
  const inscription = lire('src/pages/inscription.astro');

  verifier("l'écran d'accueil du compte propose de se connecter", accueil.includes("vers('/connexion')"));
  verifier('il propose aussi de créer un compte', accueil.includes("vers('/inscription')"));
  verifier(
    'et il la remet où elle allait une fois connectée',
    /const suite = suiteSure\(chemin/.test(accueil),
    'elle atterrirait sur /compte au lieu de la page qu’elle voulait'
  );
  verifier(
    'les anciennes adresses « ?action=inscrire » mènent toujours quelque part',
    /action'\) === 'inscrire'[\s\S]{0,200}redirect\(`\/inscription/.test(page),
    'un lien déjà partagé sur WhatsApp ne mènerait plus nulle part'
  );
  verifier(
    's’inscrire ATTACHE l’email au compte commencé, au lieu d’en ouvrir un autre',
    /const attache = Boolean\(moi\)/.test(inscription) && inscription.includes('auth.updateUser'),
    "/inscription ouvrirait un compte neuf et vide a celle qui a deja note son cycle"
  );
  verifier(
    'se connecter rejoint bien un compte qui existe ailleurs',
    page.includes('signInWithPassword')
  );
  /*
   * L'AVERTISSEMENT A DISPARU UNE HEURE, le 7 novembre 2026, en coupant la
   * page en deux, et c'est cette vérification qui l'a rattrapé.
   *
   * Il ne doit PAS être sur /inscription, qui attache et ne perd rien : il
   * doit être sur /connexion, où rejoindre un autre compte abandonne pour de
   * bon ce qu'elle a noté depuis ce téléphone.
   */
  verifier(
    'et elle est prévenue de ce qu’elle laisse derrière elle',
    /ne suivra pas/.test(page),
    "/connexion ne previent plus celle qui va abandonner son compte commence"
  );
  verifier(
    'l’avertissement ne s’affiche que si elle a un compte commencé',
    /\{moi && \([\s\S]{0,400}ne suivra pas/.test(page),
    'il inquieterait celle qui arrive de nulle part'
  );
  verifier(
    'et il lui montre la sortie, pas seulement le danger',
    /ne suivra pas[\s\S]{0,200}versInscription/.test(page)
  );
}

titre('L’email en premier, Google en dessous');
{
  const page = lire('src/pages/connexion.astro');
  const bouton = lire('src/components/BoutonGoogle.astro');

  // LES MOTS D'ARTHUR, LE 27 OCTOBRE 2026, APRÈS AVOIR VU L'ÉCRAN.
  verifier(
    'le bouton parle de Google, et pas d’autre chose',
    /texte="Continuer avec Google"/.test(page),
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

  /*
   * LE CUL-DE-SAC, ET COMMENT IL EST FERMÉ DEPUIS LE 7 NOVEMBRE 2026.
   *
   * Arthur, le 27 octobre : « quand j'arrive là-bas, la barre en bas
   * disparaît, et il n'y a pas un truc pour revenir en arrière. Faut pas que
   * les gens aillent là-bas se bloquer. » La réponse d'alors : garder la
   * barre du bas pour celle qui était déjà dans l'application.
   *
   * Les pages de Jia, qu'Arthur a demandées le 7 novembre, sont en écran
   * plein avec une flèche de retour en haut, comme toutes les pages
   * intérieures de Jia. La barre du bas disparaît donc à nouveau, MAIS la
   * flèche, elle, est toujours là, et sur les deux pages. La promesse tenue
   * est « on ne se bloque pas », pas « il y a une barre en bas » : on vérifie
   * donc la sortie, quelle qu'en soit la forme.
   *
   * L'accueil du compte, lui, GARDE la barre : c'est un onglet, pas une page
   * intérieure, et on y revient en changeant d'onglet.
   */
  const accueilCompte = lire('src/pages/compte/visiteur.astro');
  const pageInscription = lire('src/pages/inscription.astro');

  // La flèche ronde en haut à gauche des captures de Jia. On vérifie que
  // c'est un VRAI LIEN et non un retour d'historique : il doit marcher quand
  // la page a été ouverte directement, et quand l'application est posée sur
  // l'écran d'accueil, où il n'y a plus de bouton « précédent ».
  for (const [nom, src] of [['connexion', page], ['inscription', pageInscription]]) {
    verifier(
      `la page de ${nom} a une sortie visible`,
      /<a class="retour-rond" href="\/compte"/.test(src),
      'plus aucune flèche de retour : on peut s’y bloquer'
    );
  }
  /*
   * LA BARRE DU BAS NE DISPARAÎT PLUS (Arthur, le 7 novembre 2026, après
   * avoir touché « Discussions ») : « la petite barre en bas, où il y a
   * accueil, compte et tout, ça disparaît. Ce n'est pas normal. »
   *
   * L'accueil du compte s'affiche à la place de la page demandée, SANS
   * changer l'adresse. Il allume donc l'onglet d'où elle vient, pas
   * « Compte » : celle qui a touché Discussions doit voir Discussions
   * allumé, sinon elle croit s'être trompée de bouton.
   */
  verifier(
    'l’accueil du compte garde la barre du bas',
    /nav=\{onglet\}/.test(accueilCompte),
    'la barre disparaîtrait, ou allumerait le mauvais onglet'
  );
  /*
   * LE PIÈGE D'`Astro.rewrite`, ET POURQUOI CETTE VÉRIFICATION EXISTE.
   *
   * Arthur, le 7 novembre 2026 : « quand je clique sur discussion, ça me
   * renvoie directement au niveau de compte. Chaque fois. »
   *
   * Après une réécriture, `Astro.url.pathname` vaut le chemin de la page
   * AFFICHÉE (« /compte/visiteur »), pas celui qu'elle a demandé. La page
   * croyait donc toujours venir de Compte : onglet Compte allumé, mascotte
   * au lieu de l'écran des discussions. `Astro.originPathname` garde le
   * chemin d'avant la réécriture.
   */
  verifier(
    'et il allume l’onglet d’où elle vient, pas toujours « Compte »',
    /Astro\.originPathname/.test(accueilCompte) && /debut: '\/discussions'/.test(accueilCompte),
    'sans originPathname, toutes les zones fermées affichent l’écran de Compte'
  );
  verifier(
    'le chemin d’origine passe AVANT celui de la page affichée',
    /const chemin = Astro\.originPathname \?\? Astro\.url\.pathname;/.test(accueilCompte)
  );
  verifier(
    'et /compte l’affiche sans changer d’adresse, pour que « précédent » marche',
    /Astro\.rewrite\('\/compte\/visiteur'\)/.test(lire('src/pages/compte.astro')),
    'une redirection renverrait la femme ici en boucle'
  );

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
  /*
   * LE VOLET EMAIL EST FERMÉ, SAUF QUAND LE LAISSER FERMÉ PIÉGERAIT.
   *
   * Arthur, le 7 novembre 2026, après avoir vu la page : « l'email est
   * déballé par défaut. Normalement c'est la personne qui doit appuyer sur le
   * bouton email pour que ça se déballe. Il faut pas que ça soit déballé. »
   *
   * Il avait été ouvert d'emblée parce que le téléphone n'envoie pas encore
   * de code. Arthur a vu les deux et a tranché pour le volet fermé, comme sur
   * les captures de Jia.
   *
   * DEUX EXCEPTIONS, et chacune évite une impasse :
   *   - une erreur du formulaire email l'ouvre, sinon elle lit « mot de passe
   *     incorrect » sans voir le champ à corriger ;
   *   - sur l'adresse de la gestion, l'email est le SEUL chemin (ni
   *     téléphone, ni Google, ni inscription) : un volet fermé y serait une
   *     porte sans poignée.
   */
  verifier(
    'connexion : le volet email est fermé par défaut',
    /const emailOuvert = Boolean\(erreur\) \|\| surHoteAdmin;/.test(page),
    'le volet s’ouvre tout seul alors qu’Arthur veut qu’on appuie'
  );
  verifier(
    'inscription : le volet email est fermé par défaut',
    /const emailOuvert = Boolean\(erreur\);/.test(pageInscription),
    'le volet s’ouvre tout seul alors qu’Arthur veut qu’on appuie'
  );
  verifier(
    'mais une erreur du formulaire l’ouvre, sinon le champ à corriger reste caché',
    /Boolean\(erreur\)/.test(page) && /Boolean\(erreur\)/.test(pageInscription)
  );
  verifier(
    'et sur l’adresse de la gestion il reste ouvert : c’est le seul chemin',
    /surHoteAdmin/.test(page.slice(page.indexOf('const emailOuvert'), page.indexOf('const emailOuvert') + 60))
  );
  for (const [nom, src] of [['connexion', page], ['inscription', pageInscription]]) {
    verifier(
      `${nom} : le volet est bien piloté par cette décision`,
      /<details class="volet" open=\{emailOuvert\}>/.test(src)
    );
    verifier(
      `${nom} : il s’ouvre sans JavaScript (c’est un <details>)`,
      !/addEventListener\(.(click|toggle)./.test(src)
    );
  }
  verifier(
    'un « ou » sépare les chemins dès qu’il y en a plusieurs',
    /\{TELEPHONE_DISPONIBLE && <div class="separateur">/.test(page),
    'sans lui, deux blocs l’un sous l’autre se lisent comme deux étapes'
  );
  verifier(
    'un seul formulaire de mot de passe par page',
    (page.match(/name="motdepasse"/g) ?? []).length === 1
      && (pageInscription.match(/name="motdepasse"/g) ?? []).length === 1
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
  /*
   * LES DEUX BOUTS DOIVENT SE RÉPONDRE, et ce n'est plus le même mécanisme
   * depuis le 7 novembre 2026.
   *
   * Avant : chaque page fermée redirigeait vers `/connexion?pour=messagerie`,
   * et l'écran de connexion traduisait ce mot en une phrase. Arthur, après
   * avoir touché « Discussions » : « ça me renvoie sur une page se connecter,
   * et les menus en bas disparaissent. Ce n'est pas normal. On ne doit pas me
   * forcer comme ça à me connecter : on doit mettre les deux options, avec la
   * mascotte. »
   *
   * Maintenant : les pages fermées affichent l'accueil du compte SANS changer
   * l'adresse (`sansCompte`, src/lib/porte.ts), et c'est cet accueil qui lit
   * le chemin pour dire pourquoi. Ce qu'on vérifie n'est donc plus la
   * correspondance des `?pour=`, mais que CHAQUE page fermée a sa phrase.
   */
  const accueilVisiteuse = lire('src/pages/compte/visiteur.astro');

  verifier(
    'aucune page fermée ne redirige plus vers /connexion',
    FERMEES.every((f) => !/redirect\('\/connexion/.test(lire(f))),
    FERMEES.filter((f) => /redirect\('\/connexion/.test(lire(f))).join(', ')
  );
  verifier(
    'elles affichent toutes l’accueil du compte à la place',
    FERMEES.filter((f) => f !== 'src/pages/compte.astro').every((f) => /sansCompte\(Astro\)/.test(lire(f))),
    FERMEES.filter((f) => f !== 'src/pages/compte.astro' && !/sansCompte\(Astro\)/.test(lire(f))).join(', ')
  );
  verifier(
    'et /compte l’affiche par un rewrite, sans changer d’adresse',
    /Astro\.rewrite\('\/compte\/visiteur'\)/.test(lire('src/pages/compte.astro'))
  );

  /*
   * CHAQUE ZONE FERMÉE A SON ÉCRAN, copié de la capture envoyée par Arthur le
   * 7 novembre 2026 : une icône, un titre, une phrase, puis « Créer un
   * compte » en plein et « Se connecter » en contour.
   *
   * Sans le titre et la phrase, elle verrait deux boutons sans savoir ce
   * qu'on lui reproche ni ce qu'elle gagne à continuer.
   */
  for (const debut of ['/discussions', '/dambe', '/cycle', '/journal']) {
    verifier(
      `l'accueil sait quoi afficher pour « ${debut} »`,
      new RegExp(`debut: '${debut}'[\\s\\S]{0,500}titre: '[^']{5,}'[\\s\\S]{0,500}dit: '[^']{20,}`).test(accueilVisiteuse),
      'cette zone tomberait sur la mascotte, sans dire pourquoi'
    );
  }
  verifier(
    'et « Créer un compte » passe devant « Se connecter » sur ces écrans',
    accueilVisiteuse.indexOf("vers('/inscription')") < accueilVisiteuse.indexOf("vers('/connexion')"),
    'celle qui arrive ici n’a le plus souvent pas de compte'
  );
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
