// La carte du suivi de commande, et tout ce qui la rend honnête.
//
// Arthur, le 8 novembre 2026 : « AU NIVEAU DE SUIVRE MA COMMANDE JE VEUX QUE SA
// SOIT COMME SA. AVEC UNE VRAI MAPS », puis « les icônes avec en livraison, en
// préparation, et j'en passe. Si quelqu'un appuie sur ça, ça doit s'afficher
// comme ça. »
//
// CE QUE CES VERIFICATIONS PROTEGENT, dans l'ordre d'importance :
//
//   1. QUE LE FOND DE CARTE NE TRAHISSE PAS OU ELLE HABITE. Le reflexe aurait
//      ete de laisser le telephone prendre ses tuiles chez OpenStreetMap, et
//      d'ouvrir la politique de securite pour l'autoriser. Chaque tuile aurait
//      alors annonce a un serveur etranger l'adresse IP de la cliente ET le
//      carre de terrain qu'elle regarde. Les tuiles passent par notre serveur.
//      Si quelqu'un refait un jour le raccourci, ces verifications tombent.
//
//   2. QUE LA ROUTE DES TUILES NE DEVIENNE PAS UN PROXY OUVERT, par lequel
//      n'importe qui ferait passer n'importe quelle requete avec notre
//      reputation et notre facture.
//
//   3. QUE LA CARTE NE MENTE PAS. Elle ne s'affiche que s'il y a un point a
//      montrer, et le point du livreur ne sort de la base que tant que le colis
//      roule.
//
//   4. QUE LA POLITIQUE DE SECURITE RESTE FERMEE. Leaflet place ses tuiles par
//      l'API JavaScript, pas par des attributs style=, donc rien n'avait besoin
//      d'etre ouvert. Une verification le prouve plutot que de l'esperer.
//
// Lancer : node supabase/tests/carte-suivi.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifier, bilan, titre } from './banc.mjs';
import { tuileAutorisee, tuileDuPoint, ZOOM_MINI, ZOOM_MAXI } from '../../src/lib/tuiles.ts';
import { dateEtHeure } from '../../src/lib/format.ts';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');

const config = lire('astro.config.mjs');
const migration = lire('supabase/migrations/20261108020000_la_carte_du_suivi.sql');
const suivi = lire('src/pages/commandes/suivre/[numero].astro');
const livreur = lire('src/pages/livreur/[jeton].astro');
const carteScript = lire('src/scripts/carte.ts');
const carteVue = lire('src/components/CarteSuivi.astro');
const route = lire('src/pages/tuile/[z]/[x]/[y].png.ts');

// Les commentaires d'un fichier parlent souvent de ce qu'on a REFUSE de faire.
// Les verifications qui cherchent l'absence de quelque chose doivent donc
// regarder le code, pas les explications : sinon elles tombent sur la phrase
// qui explique pourquoi la chose n'y est pas. Ce piege a deja coute deux
// fausses alertes le 7 novembre 2026.
const sansCommentaires = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');

/**
 * Le corps d'UNE fonction SQL, isole du reste du fichier.
 *
 * NE DE DEUX VERIFICATIONS FAUSSES, le 8 novembre 2026. Elles cherchaient
 * `confirmer_reception[\s\S]{0,900}set etat` : une fenetre de 900 caracteres
 * apres le nom. Le corps de la fonction en fait 1300, commentaires compris, et
 * les deux verifications tombaient alors que le code etait juste.
 *
 * Compter des caracteres pour delimiter un bloc est une mauvaise idee : la
 * fenetre est toujours trop courte ou trop longue, et trop longue est pire,
 * parce qu'elle attrape la fonction suivante et declare bon ce qui ne l'est
 * pas. On decoupe donc sur les vraies bornes : du `create ... function` au
 * `$$;` qui ferme le corps.
 */
function corpsDeLaFonction(sql, nom) {
  const debut = sql.indexOf(`create or replace function public.${nom}`);
  if (debut < 0) return '';
  const fin = sql.indexOf('$$;', debut);
  return fin < 0 ? sql.slice(debut) : sql.slice(debut, fin + 3);
}

titre('Le fond de carte ne dit a personne ou elle habite');
{
  verifier(
    "la politique de securite n'ouvre PAS openstreetmap aux telephones",
    !/img-src[^"]*openstreetmap/.test(sansCommentaires(config)),
    "img-src a ete ouvert a openstreetmap : chaque tuile dirait a un serveur etranger ou habite la cliente"
  );
  verifier(
    'le navigateur demande ses tuiles a notre propre serveur',
    /tileLayer\('\/tuile\/\{z\}\/\{x\}\/\{y\}\.png'/.test(carteScript),
    'la couche de tuiles ne pointe plus sur /tuile/'
  );
  verifier(
    "aucune adresse d'openstreetmap ne part du navigateur",
    !/openstreetmap\.org/.test(sansCommentaires(carteScript)),
    'le script du navigateur contient une adresse openstreetmap'
  );
  verifier(
    "c'est le serveur qui va chercher chez openstreetmap",
    /tile\.openstreetmap\.org/.test(route)
  );
  verifier(
    "le serveur s'identifie, comme la politique d'OpenStreetMap l'exige",
    /'User-Agent': 'MoussoDambe/.test(route)
  );
  verifier(
    "il donne une adresse de service, jamais celle de quelqu'un",
    /bonjour@moussodambe\.com/.test(route) && !/\bArthur\b/.test(route)
  );
  verifier(
    'la licence ODbL est citee, elle est obligatoire',
    /ODbL/.test(route) && /OpenStreetMap/.test(carteScript)
  );
}

titre('La route des tuiles ne peut pas servir de proxy ouvert');
{
  // Ouagadougou, au zoom ou l'on suit un colis.
  const ouaga = tuileDuPoint(12.3714, -1.5197, 15);
  verifier(
    'une tuile de Ouagadougou passe',
    tuileAutorisee(15, ouaga.x, ouaga.y),
    JSON.stringify(ouaga)
  );

  // Bobo-Dioulasso : l'autre grande ville, elle doit passer aussi.
  const bobo = tuileDuPoint(11.1771, -4.2979, 14);
  verifier('une tuile de Bobo-Dioulasso passe', tuileAutorisee(14, bobo.x, bobo.y));

  // Et ce qui ne doit JAMAIS passer.
  const paris = tuileDuPoint(48.8566, 2.3522, 15);
  verifier('une tuile de Paris est refusee', !tuileAutorisee(15, paris.x, paris.y));

  const jakarta = tuileDuPoint(-6.2, 106.8, 15);
  verifier('une tuile de Jakarta est refusee', !tuileAutorisee(15, jakarta.x, jakarta.y));

  const newyork = tuileDuPoint(40.71, -74.0, 14);
  verifier('une tuile de New York est refusee', !tuileAutorisee(14, newyork.x, newyork.y));

  // Accra est au sud du Burkina, Bamako a l'ouest : les deux sont proches, et
  // c'est precisement pour ca qu'il faut les verifier. Un filtre trop large
  // passerait inapercu sur Paris et laisserait passer les voisins.
  const accra = tuileDuPoint(5.6037, -0.187, 15);
  verifier('Accra, pourtant voisine, est refusee', !tuileAutorisee(15, accra.x, accra.y));

  const bamako = tuileDuPoint(12.6392, -8.0029, 15);
  verifier('Bamako, pourtant voisine, est refusee', !tuileAutorisee(15, bamako.x, bamako.y));

  verifier('un zoom trop large est refuse', !tuileAutorisee(ZOOM_MINI - 1, ouaga.x, ouaga.y));
  verifier('un zoom trop serre est refuse', !tuileAutorisee(ZOOM_MAXI + 1, 0, 0));
  verifier('le zoom le plus large passe', tuileAutorisee(ZOOM_MINI, ...Object.values(tuileDuPoint(12.37, -1.52, ZOOM_MINI))));

  verifier('un x negatif est refuse', !tuileAutorisee(15, -1, ouaga.y));
  verifier('un y hors grille est refuse', !tuileAutorisee(15, ouaga.x, 2 ** 15));
  verifier('un nombre a virgule est refuse', !tuileAutorisee(15, ouaga.x + 0.5, ouaga.y));
  verifier('un NaN est refuse', !tuileAutorisee(Number.NaN, 1, 1));
  verifier("l'infini est refuse", !tuileAutorisee(15, Number.POSITIVE_INFINITY, 1));

  verifier(
    'la route passe bien par ce filtre, et pas par une copie',
    /tuileAutorisee\(z, x, y\)/.test(route)
  );
  verifier(
    'une tuile refusee ne demande rien a personne',
    route.indexOf('tuileAutorisee') < route.indexOf('fetch('),
    'le filtre doit etre AVANT la requete, sinon il ne protege rien'
  );
  verifier(
    'une tuile servie est gardee un an, sinon la facture suit le trafic',
    /s-maxage=\$\{UN_AN\}/.test(route) && /immutable/.test(route)
  );
  verifier(
    'un echec amont n est PAS garde',
    /status: 502[\s\S]{0,80}no-store/.test(route),
    'une erreur gardee un an serait un trou definitif dans la carte'
  );
  verifier(
    'la requete amont est bornee dans le temps',
    /AbortSignal\.timeout\(6000\)/.test(route)
  );
}

titre('La politique de securite reste fermee');
{
  verifier(
    "aucun 'unsafe-inline' n'a ete ajoute",
    !/unsafe-inline/.test(sansCommentaires(config)),
    "la politique a ete ouverte : verifier que c'etait vraiment necessaire"
  );
  verifier("aucun 'unsafe-eval' non plus", !/unsafe-eval/.test(sansCommentaires(config)));
  verifier("img-src reste sur 'self'", /img-src 'self' data: https:\/\/\*\.supabase\.co/.test(config));

  // LA VERIFICATION QUI REND LA PRECEDENTE TENABLE. Leaflet place ses tuiles
  // en ecrivant `element.style.transform = ...`, ce que la politique de
  // securite ne couvre PAS. Si une version future passait a
  // `setAttribute('style', ...)` ou a `cssText`, la carte se briserait en
  // silence : les tuiles s'empileraient en haut a gauche, et il faudrait une
  // soiree pour comprendre pourquoi. Mieux vaut que la verification tombe.
  const leaflet = path.join(RACINE, 'node_modules', 'leaflet', 'dist', 'leaflet-src.js');
  if (fs.existsSync(leaflet)) {
    const code = sansCommentaires(fs.readFileSync(leaflet, 'utf8'));
    verifier(
      "Leaflet n'ecrit jamais d'attribut style= (sinon il faudrait ouvrir la politique)",
      !/setAttribute\(\s*['"]style['"]/.test(code) && !/\.cssText\s*=/.test(code)
    );
    verifier(
      "il passe par l'API JavaScript, que la politique ne couvre pas",
      (code.match(/\.style\.[a-zA-Z]+\s*=/g) ?? []).length > 10
    );
  } else {
    verifier('Leaflet absent du dossier des dependances : verification sautee', true);
  }
}

titre('La carte ne s affiche que s il y a quelque chose a montrer');
{
  verifier(
    'elle est posee quand la commande est en cours ET qu un point existe',
    /carteUtile = EN_COURS\.includes\(c\.etat\) && \(elle \|\| leLivreur\)/.test(suivi)
  );
  verifier(
    'une commande livree n affiche plus de carte',
    /const EN_COURS = \['nouvelle', 'preparee', 'envoyee'\]/.test(suivi),
    "le colis est arrive : il n'y a plus rien a suivre"
  );
  verifier(
    'sans aucun point, pas de carte vide',
    /&& \(elle \|\| leLivreur\)/.test(suivi)
  );
  verifier('et la page respecte cette condition', /carteUtile && \(\s*<CarteSuivi/.test(suivi));
  verifier(
    'le point du livreur ne sort de la base que pendant la course',
    /'livreur_lat', case when v_c\.etat = 'envoyee' then v_c\.livreur_lat else null end/.test(
      corpsDeLaFonction(migration, 'suivi_de_ma_commande')
    )
  );
  verifier(
    'un point hors du Burkina est refuse par le navigateur aussi',
    /lat < 9 \|\| lat > 15\.5 \|\| lng < -6 \|\| lng > 2\.5/.test(carteScript)
  );
  verifier(
    'le trait entre les deux points ne se fait pas passer pour un itineraire',
    /dashArray/.test(carteScript) && /vol d'oiseau|PAS UN ITINERAIRE|PAS UN ITINÉRAIRE/i.test(carteScript)
  );
  verifier(
    "la carte est inerte tant qu'on ne l'a pas touchee",
    /dragging: false/.test(carteScript) && /touchZoom: false/.test(carteScript)
  );
  verifier(
    'un echec de chargement laisse une phrase, pas un carre gris',
    /data-panne/.test(carteVue) && /n'a pas pu se charger/.test(carteVue)
  );
  verifier(
    'Leaflet est charge en differe, pas sur toutes les pages',
    /await import\('leaflet'\)/.test(carteScript)
  );
  verifier(
    "le nom du livreur est pose par textContent, jamais dans du HTML",
    /etiquette\.textContent = toile\.dataset\.etiquette/.test(carteScript),
    'un nom venu de la base ne se colle pas dans une chaine de HTML'
  );
}

titre('La position du livreur ne survit pas a la course');
{
  verifier(
    'les trois colonnes existent',
    /add column if not exists livreur_lat/.test(migration) &&
      /add column if not exists livreur_lng/.test(migration) &&
      /add column if not exists livreur_position_le/.test(migration)
  );
  verifier(
    "elle s'efface a la livraison et a l'annulation",
    /livreur_lat = case when v_apres in \('livree', 'annulee', 'envoyee'\) then null/.test(migration)
  );
  verifier(
    'elle s efface aussi au depart d une nouvelle course',
    /'envoyee'\) then null else livreur_lat end/.test(migration),
    'sinon la cliente suivante verrait un point vieux de trois jours'
  );
  verifier(
    'confirmer la reception l efface aussi',
    /recue_confirmee_le = now\(\)[\s\S]{0,400}livreur_lat = null/.test(migration)
  );
  const partage = corpsDeLaFonction(migration, 'livreur_partage_sa_position');
  verifier('la fonction de partage est bien dans la migration', partage !== '');
  verifier(
    'le livreur doit passer par le site pour ecrire sa position',
    /appel_du_site\(\)/.test(partage)
  );
  verifier(
    'un point hors du Burkina est refuse par la base',
    /p_lat not between 9\.0 and 15\.5/.test(partage)
  );
  verifier(
    'et seulement tant que la course est ouverte',
    /etat = 'envoyee'/.test(partage) && /48 hours/.test(partage)
  );
  verifier('le jeton doit faire ses 48 caracteres', /length\(p_jeton\) <> 48/.test(partage));
  verifier(
    'le bouton existe sur la page du livreur',
    /data-livreur-position/.test(livreur) && /livreur_partage_sa_position/.test(livreur)
  );
  verifier(
    "un relevé continu n'a PAS ete mis en place",
    !/watchPosition/.test(lire('src/scripts/livreur-position.ts')),
    'un relevé continu viderait sa batterie et ferait de son ecran un traceur'
  );
}

titre('Le jeton du livreur ne sort jamais vers la cliente');
{
  const lecture = corpsDeLaFonction(migration, 'suivi_de_ma_commande');
  verifier('la fonction de lecture est bien dans la migration', lecture !== '');
  verifier(
    'suivi_de_ma_commande ne rend pas le jeton',
    !/'jeton'|livreur_jeton/.test(sansCommentaires(lecture)),
    "le jeton n'a rien a faire dans l'ecran de la cliente"
  );
  verifier(
    'la page de suivi ne lit plus toutes les commandes pour en afficher une',
    !/mes_commandes/.test(sansCommentaires(suivi)),
    'elle chargeait les vingt dernieres avec toutes leurs lignes'
  );
  verifier(
    'elle lit la commande, et elle seule',
    /rpc\('suivi_de_ma_commande'/.test(suivi)
  );
  verifier(
    'un numero qui n est pas le sien renvoie a sa liste, sans rien dire',
    /if \(!brut\?\.ok\) return Astro\.redirect/.test(suivi)
  );
  verifier(
    'la fonction ne repond qu a la proprietaire de la commande',
    /c\.profil_id = v_id/.test(lecture)
  );
  verifier(
    'elle refuse une visiteuse non connectee',
    /v_id is null[\s\S]{0,120}connexion_requise/.test(lecture)
  );
}

titre('Aucun numero de commande sous ses yeux, la regle du 7 novembre tient');
{
  const corps = sansCommentaires(suivi)
    .replace(/\b(?:href|value|action|data-\w+)=\{[^}]*\}/g, '')
    .replace(/p_numero:[^,}]*/g, '');
  verifier(
    "l'ecran de suivi n'affiche pas le numero",
    !/\{\s*c(?:\?)?\.numero\s*\}/.test(corps),
    'le numero est reapparu sous les yeux de la cliente'
  );
  verifier(
    'il reste dans les champs caches, parce que les formulaires en ont besoin',
    /name="numero" value=\{c\.numero\}/.test(suivi)
  );
}

titre('Les quatre etapes, et leurs heures');
{
  for (const mot of ['Commandée', 'En préparation', 'En route', 'Livrée']) {
    verifier(`la frise porte « ${mot} »`, suivi.includes(`'${mot}'`), mot);
  }
  for (const mot of ['Commande passée', 'Colis préparé', 'Colis remis au livreur', 'Colis livré']) {
    verifier(`le journal porte « ${mot} »`, suivi.includes(`'${mot}'`), mot);
  }
  verifier(
    'les deux heures du milieu sont enregistrees',
    /add column if not exists preparee_le/.test(migration) &&
      /add column if not exists envoyee_le/.test(migration)
  );
  verifier(
    "revenir en arriere puis repartir ne reecrit pas la premiere heure",
    /preparee_le = case when v_apres = 'preparee' then coalesce\(preparee_le, now\(\)\)/.test(migration),
    "c'est l'heure qu'elle a vue a l'ecran qui compte"
  );
  verifier(
    'les commandes deja parties recuperent leur heure d expedition',
    /update public\.commandes[\s\S]{0,200}set envoyee_le = livreur_jeton_le/.test(migration),
    'le jeton nait exactement au passage a « envoyee » : son heure EST celle du depart'
  );

  // Et la mise en forme, celle qu'Arthur a montree : « 7 nov. · 22h06 ».
  const essai = new Date(2026, 10, 7, 22, 6);
  verifier('« 7 nov. · 22h06 »', dateEtHeure(essai) === '7 nov. · 22h06', dateEtHeure(essai));
  verifier('minuit s ecrit 00h00', dateEtHeure(new Date(2026, 0, 1, 0, 0)) === '1 janv. · 00h00');
  verifier('une etape sans heure ne rend rien', dateEtHeure(null) === '');
  verifier('une date illisible ne rend rien', dateEtHeure('pas une date') === '');
  verifier(
    'une etape sans heure s affiche quand meme, sans heure',
    /\{e\.quand && <small>\{e\.quand\}<\/small>\}/.test(suivi),
    'les commandes d avant le 8 novembre 2026 n ont pas toutes leur horodatage'
  );
}

titre('Confirmer la reception, et signaler qu on n a rien recu');
{
  const confirmer = corpsDeLaFonction(migration, 'confirmer_reception');
  const signaler = corpsDeLaFonction(migration, 'signaler_non_reception');

  verifier('le bouton existe', /J'ai reçu ma commande/.test(suivi));
  verifier("l'autre porte existe aussi", /Je n'ai pas reçu ma commande/.test(suivi));
  verifier('les deux fonctions sont bien dans la migration', confirmer !== '' && signaler !== '');

  verifier('confirmer cloture la commande', /set etat = 'livree'/.test(confirmer));
  verifier(
    'on ne peut confirmer que si le colis est parti',
    /v_etat <> 'envoyee'[\s\S]{0,120}colis_pas_parti/.test(confirmer)
  );
  verifier(
    'appuyer deux fois ne provoque pas d erreur',
    /v_etat = 'livree'[\s\S]{0,320}'ok', true/.test(confirmer),
    "appuyer deux fois sur un bouton n'est pas une faute"
  );
  verifier(
    'confirmer eteint le lien du livreur, comme le ferait la boutique',
    /livreur_jeton = null/.test(confirmer)
  );

  verifier(
    "signaler n'annule RIEN tout seul",
    !/set etat/.test(sansCommentaires(signaler)),
    "un appui ne doit pas pouvoir vider la journee d'Arthur"
  );
  verifier(
    'signaler enregistre seulement l alerte',
    /set probleme_signale_le = now\(\)/.test(signaler)
  );
  verifier(
    'on ne signale que si le colis est parti',
    /v_etat not in \('envoyee', 'livree'\)/.test(signaler)
  );
  verifier(
    'les deux fonctions exigent de passer par le site',
    /appel_du_site/.test(confirmer) && /appel_du_site/.test(signaler)
  );
  verifier(
    'les deux verrouillent la ligne avant de la lire',
    /for update/.test(confirmer) && /for update/.test(signaler),
    'sans cela, deux appuis simultanes passeraient tous les deux'
  );
}

titre('Les droits sont poses, et au plus juste');
{
  const droits = [
    ['livreur_partage_sa_position', 'anon, authenticated'],
    ['confirmer_reception', 'authenticated'],
    ['signaler_non_reception', 'authenticated'],
    ['suivi_de_ma_commande', 'authenticated'],
  ];
  for (const [nom, qui] of droits) {
    verifier(
      `${nom} est d abord retiree a tout le monde`,
      new RegExp(`revoke all on function public\\.${nom}`).test(migration),
      nom
    );
    verifier(
      `${nom} n est rendue qu a « ${qui} »`,
      new RegExp(`grant execute on function public\\.${nom}\\([^)]*\\)\\s*\\n?\\s*to ${qui}`).test(migration),
      nom
    );
  }
  verifier(
    'suivi_de_ma_commande est fermee a anon',
    !/grant execute on function public\.suivi_de_ma_commande\(text\) to anon/.test(migration)
  );
}

titre('Ce que cette migration ne touche pas');
{
  // Deux sessions travaillaient sur ce depot le 8 novembre 2026. Deux
  // redefinitions de la meme fonction, la derniere posee gagne et efface
  // l'autre EN SILENCE. Cette verification garde la frontiere.
  verifier(
    'elle ne redefinit PAS mes_commandes()',
    !/create or replace function public\.mes_commandes/.test(migration),
    "l'autre session lui ajoute la photo et le slug le meme jour"
  );
  verifier(
    'elle ne touche pas au raccourci a deux arguments de changer_etat_commande',
    !/create or replace function public\.changer_etat_commande\(p_id uuid, p_etat text\)\s*$/m.test(migration),
    "y toucher rouvrirait l'ambiguite de signature du 26 octobre 2026"
  );
  verifier(
    'elle redefinit bien la forme a quatre arguments, elle',
    /create or replace function public\.changer_etat_commande\(\s*p_id uuid,\s*p_etat text,\s*p_livreur_nom text,/.test(migration)
  );
}

bilan('La carte du suivi, et ce qui la rend honnete');
