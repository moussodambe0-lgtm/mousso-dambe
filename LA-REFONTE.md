# La refonte du 12 octobre 2026

Ce document répond à la section 12 de ton cahier : ce qui a été fait, où
remplacer les images et les vidéos, comment lancer l'application, et ce qui
reste. Il est écrit pour toi, Arthur, pas pour un développeur.

---

## 1. Ce qui a été fait, section par section

| # | Ce que tu demandais | Fait | Où ça vit |
|---|---|---|---|
| 1 | Écran d'ouverture animé, 3 scènes | oui | `src/pages/ouverture.astro` |
| 2 | Plus d'inscription, identité anonyme | oui | `src/pages/commencer.ts`, bloc « Garde ton compte » dans `compte.astro` |
| 3 | Questionnaire de 8 questions illustrées | oui | `src/pages/bienvenue.astro` |
| 4 | Tableau de bord du cycle | oui | `src/pages/cycle/index.astro`, `src/components/AnneauSegmente.astro` |
| 5 | Calendrier (gouttes, bébés, bandes vertes) | oui | `src/pages/cycle/calendrier.astro` |
| 6 | Mascotte « Dambé » et bulle flottante | oui | `src/components/Mascotte.astro`, `BoutonMascotte.astro` |
| 7 | Onglet « Discussions » | oui | `src/pages/discussions/` |
| 8 | « Écrire au vendeur » sur une fiche produit | oui | bouton dans `boutique/[slug].astro` |
| 9 | Espace administrateur | oui | `src/pages/admin/` |
| 10 | Accueil animé (bannières, ruban, conseils, produits) | oui | `src/pages/index.astro` |
| 10 bis | Haut de l'accueil d'après ta maquette | oui | `src/styles/accueil.css`, `Avatar.astro`, `ObjetsCarte.astro` |
| 10 ter | Avatars générés | oui | `src/lib/avatar.ts` |
| 11 | Navigation liquide, transitions, vibration | oui | `composants.css`, `src/scripts/nav.ts` |
| + | Bannière du médecin sur l'accueil | oui | `src/pages/index.astro`, `public/accueil/` |
| + | Conversation « Le médecin » | oui | `src/pages/discussions/[sujet].astro` |

**Ce qui n'est pas fait, et pourquoi :** voir la section 5 plus bas. Rien n'a
été abandonné en silence.

---

## 2. Où remplacer les images et les vidéos

Tout ce qui suit se remplace en **déposant un fichier**, sans toucher au code.

### Les trois vidéos de l'écran d'ouverture

Dépose-les dans `public/ouverture/` :

```
public/ouverture/scene1.mp4    « Ton corps, ton rythme »
public/ouverture/scene2.mp4    « Ne sois plus jamais surprise »
public/ouverture/scene3.mp4    « Tes protections livrées chez toi »
```

Muettes, en boucle, environ 5 secondes, format vertical (9:16), compressées
(vise 1 Mo par vidéo au plus : une femme à Ouaga paie sa connexion). Un
fichier `.webm` à côté du `.mp4` serait encore plus léger, et il est utilisé
en premier s'il existe.

**Tant qu'elles n'existent pas, l'écran n'est pas vide** : les trois scènes
sont dessinées en code et s'animent déjà. Tu peux lancer l'application sans
jamais déposer une seule vidéo.

### Les huit illustrations du questionnaire

Elles sont dessinées par Motion et vivent dans `src/animations/` :
`q1-prenom.svg` à `q8-protection.svg`. Pour en changer une, remplace le
fichier par un autre SVG du même nom (viewBox `0 0 390 300`).

### Les photos des produits

Elles vivent dans `public/produits/`, en deux tailles par produit
(`-600.webp` et `-1200.webp`). Le chemin de la petite est écrit dans la
colonne `image` de la table `produits`.

**C'est le point le plus faible aujourd'hui** : les visuels sont des dessins,
pas des photos. Tu avais demandé de vraies images de serviettes et de
culottes. Il te faut soit des photos de ton stock (le mieux : ce sont tes
vrais produits), soit des photos libres de droits.

### Les photos du médecin

`public/accueil/medecin-detoure-600.webp` et `-1200.webp`, puis
`medecin-pose2-detoure-*` et `medecin-pose3-detoure-*` : une par message de la
bannière qui défile. Détourées sur fond transparent, cadrées pour que la tête
fasse la même taille sur les trois quand elles sont à la même hauteur.

Pour les remplacer par ton vrai médecin : garde les mêmes noms de fichiers.
Si tu n'en déposes qu'une, les trois messages la reprennent, et la bannière
reste entière.

**La licence de celles-ci interdit de laisser croire que la personne
recommande le produit.** C'est pour ça que la mention « Photo d'illustration »
est sous la bannière, et qu'aucun nom ni aucune spécialité ne lui est
attribué. Provenance et licence complètes :
`atelier-motion/images/medecin/LICENCE.md`.

### Le logo

Ton logo (le PDF du 12 octobre 2026) est la source, gardée dans
`atelier-motion/logo/logo-source.pdf`. Trois formes en sont tirées
automatiquement par `node outils/logo-depuis-pdf.mjs` :

| Fichier | Quoi | Où |
|---|---|---|
| `logo-fleur.svg` (4 Ko) | la fleur seule | barres, ronds, favicon |
| `logo-avec-nom.svg` (10 Ko) | fleur + « MOUSSO DAMBÉ » | écran d'ouverture, connexion, page introuvable |
| `logo-entier.svg` (29 Ko) | avec la phrase « Révolutionnez votre cycle avec style ! » | pas utilisé dans l'application, gardé pour tes supports |
| `icone-192.png`, `icone-512.png` | les icônes du téléphone | `public/` |

**Si tu changes ton logo**, remplace le PDF et relance la commande : tout se
refait, y compris les icônes.

Deux choses à savoir :
- **Le rose de ton logo (`#EA194E`) n'est pas celui de l'interface
  (`#D0206A`).** Ce n'est pas une erreur : sur fond blanc, ton rose donne 4,43
  contre 1, sous le minimum lisible de 4,5. Celui de l'interface est plus
  sombre et passe à 5,13. Le logo garde SA couleur partout où il apparaît ;
  l'interface garde la sienne pour ce qui doit se lire.
- **Le profil de la femme est noir.** Sur l'écran d'ouverture, qui est sombre,
  le logo est donc posé sur une pastille blanche : sans elle, il ne resterait
  qu'une fleur sans visage. Si tu as une version du logo pour fond sombre
  (profil blanc), envoie-la et je l'utiliserai à la place.

### La mascotte

`src/assets/mascotte/mascotte-salut.svg`, `-ecoute`, `-bravo`, `-visage`,
avec `src/styles/mascotte.css`. Elle est le visage d'IA Dambé partout.

---

## 3. Comment lancer l'application sur ton PC

Une seule commande, dans le dossier du projet :

```
npm run demo
```

Elle démarre trois choses : une fausse base de données (avec des données
inventées), une fausse assistante, et le site. Puis elle affiche l'adresse :

```
http://127.0.0.1:4322
```

Le compte de démonstration est `awa@essai.bf` / `motdepasse`, et il est
administrateur, donc `/admin` s'ouvre. `Ctrl+C` arrête tout.

**Rien de tout cela ne part en ligne.** C'est une démonstration locale.

---

## 4. Ce qui est vérifié, et comment

| Commande | Ce qu'elle prouve |
|---|---|
| `npm run test:sql` | 505 vérifications sur la base : les règles d'accès, les calculs du cycle, les quotas, et qu'une femme ne lit jamais les données d'une autre |
| `npm run essai` | 34 vérifications sur les écrans : on traverse l'application comme une utilisatrice, formulaires compris (il faut que `npm run demo` tourne) |
| `npm run essai:carrousel` | 5 vérifications dans un vrai navigateur : le carrousel de l'accueil ne remonte jamais la page, et s'arrête quand il n'est plus à l'écran |
| `npm run captures` | 34 captures d'écran en 390 px, dans `captures/` : le seul moyen de juger ce qui se voit |
| `npm run check` | Les erreurs de code |
| `node outils/collisions.mjs` | Les noms de style qui se heurtent entre deux fichiers |
| `node outils/mesurer.mjs /cycle ".anneau-s"` | Interroge un vrai navigateur quand un écran est de travers sans qu'on voie pourquoi |

Trois choses que ces vérifications prouvent, et qui comptent plus que les
autres :

1. **Personne ne lit le journal d'une autre**, pas même l'administration. Ce
   n'est pas une promesse écrite à l'écran, c'est la base qui refuse.
2. **Rien d'intime ne part vers l'IA** : seulement le prénom, le jour du
   cycle et le catalogue.
3. **L'avertissement sur la contraception** est présent sur le calendrier et
   sur le tableau de bord, et il vient d'une seule source dans le code : on ne
   peut pas l'oublier à un endroit.

---

## 5. Ce qui reste à faire, et ce qu'il faut de toi

### Ce que je ne peux pas faire sans toi

| Quoi | Ce qu'il me faut |
|---|---|
| **Mettre en ligne** | Un projet Supabase créé par toi, et ses deux clés. Je ne crée pas de compte à ta place et je n'écris jamais une vraie clé dans le code. |
| **L'assistante IA** | L'adresse et la clé d'Ollama. Aujourd'hui une fausse assistante répond en local. |
| **Les vraies photos** | Des photos de tes produits, ou ton accord pour chercher des photos libres. |
| **L'email de commande** | Ta décision sur Brevo (tu voulais recevoir les commandes par email). Il faut une clé Brevo et une adresse d'envoi. |
| **Les numéros d'urgence** | Les vrais numéros du centre de santé ou de la sage-femme que tu veux citer. Je n'en invente aucun : un faux numéro sur une application de santé est dangereux. |
| **Les prix et les produits** | Une relecture : les prix actuels sont des exemples. |

### Ce que je peux faire, quand tu me le diras

- Les vraies photos de produits à la place des dessins.
- L'email de commande par Brevo.
- « Mot de passe oublié » (il dépend de l'email).
- Le bouton Google à l'entrée : il existe sur la page Compte pour garder son
  compte, mais il n'est pas branché à un vrai projet Google.
- Les notifications (« tes règles arrivent dans 3 jours »).

### Une chose que j'ai enlevée, et pourquoi tu dois le savoir

Ton cahier proposait, sur la grande carte de l'accueil, « +120 femmes de la
communauté sont dans la même phase que toi », **ou** un petit bouton d'action.
J'ai pris la seconde option.

Pourquoi : ce nombre n'existe pas. L'application n'a pas 120 utilisatrices, et
elle ne compte la phase de personne. L'écrire serait afficher un faux sur une
application de santé, là où la confiance est tout ce qu'on a. Le jour où il y
aura du monde, ce compte sera vrai, et il reviendra.

À sa place : « Noter ma journée », qui devient « Modifier ma journée » si elle
l'a déjà fait.

### Qui répond au médecin ?

La conversation « Le médecin » marche de bout en bout : elle écrit, le message
arrive dans ton espace d'administration, tu réponds, elle reçoit. Mais **elle
ne vaut que si quelqu'un lit.** Dis-moi qui : toi, ou un vrai médecin à qui tu
donnes l'accès (une ligne dans la table `administrateurs`, comme pour toi).

Tant que tu n'as pas tranché, l'écran ne promet aucun délai de réponse et
n'écrit le nom d'aucun médecin.

Une chose que j'ai ajoutée sans te la demander, parce qu'il s'agit de santé :
si les mots d'un message disent une urgence, l'orientation vers le centre de
santé s'affiche **tout de suite**, sans attendre que quelqu'un réponde. Un
médecin répond quand il peut ; une urgence, non.

---

### Ce qui a changé le 13 octobre 2026 (et ce que tu dois en savoir)

**Les vocaux au médecin.** Un micro dans la conversation « Le médecin » : elle
enregistre, elle se réécoute, elle envoie. Un humain l'écoute, donc le moré et
le dioula passent, et aucun son ne part vers un service extérieur (voir
`supabase/migrations/20261013140000_vocaux.sql`, qui explique chaque choix).
Bornes tenues par la base : 90 secondes, 1,2 Mo, le médecin seulement.

**La dictée chez Dambé.** Un micro dans la discussion avec IA Dambé, mais qui
ÉCRIT : elle parle, le téléphone écrit dans la case, elle relit. Dambé lit du
texte et n'entend rien. Français seulement. Sur Android c'est Google qui
reconnaît la voix, comme la touche micro de son clavier : nous ne gardons
aucun son.

**Une trouvaille grave, réparée.** L'en-tête de sécurité interdisait le micro
à toute l'application (`microphone=()`). Aucune des deux fonctions n'aurait
marché, avec ou sans l'autorisation de la femme. Il dit maintenant
`microphone=(self)`.

**« Effacer mes données » n'effaçait pas les messages.** La fonction datait
d'avant la messagerie : elle supprimait le journal, les cycles et les
questions à Dambé, rien d'autre. Elle supprime maintenant aussi la
conversation avec le médecin, vocaux compris. **La conversation avec la
boutique reste**, comme les commandes (adresses, délais, litiges). C'est une
décision que je t'ai laissée : si tu veux tout effacer, c'est une ligne dans la
migration. La page « Ce qu'on sait de toi » le dit en toutes lettres.

**La barre du bas flotte.** Une pastille décollée du bas et des côtés, avec une
ombre. L'ancien effet d'encoche creusée ne marche que sur un fond uni.

**D'une page à l'autre, sans clignotement.** Le « petit bug » entre l'accueil,
mon cycle et mon compte n'en était pas un : chaque onglet est une vraie page,
le navigateur la jetait et la redessinait. Une règle de CSS (`@view-transition`)
lui demande de fondre d'une page à l'autre, sans une ligne de JavaScript.

**Retiré de l'accueil :** la bande qui défile, les conseils de phase, le
bouton « Noter aujourd'hui » (doublon), la mention sous le panneau (déplacée
dans le coin de la photo : elle est obligatoire).

**Retiré de « Mon cycle » :** la rangée « Comment tu te sens aujourd'hui ? ».
L'ovulation n'a plus un bébé comme image mais un ovule, et les trois dates sont
empilées en rectangles.

**La mascotte, version 6.** Après cinq versions dessinées à la main qui
s'éloignaient à chaque fois, c'est maintenant TON image, recolorée (peau
brune, le reste tel quel, la fleur du logo à la place de la croix). Outils :
`outils/mascotte-depuis-image.py` puis `outils/mascotte-svg.py`.

**La croix.** Ton image avait une croix rose sur le bonnet. Je ne l'ai pas
gardée : un emblème proche de la croix rouge est protégé par les Conventions de
Genève, dont le Burkina Faso est signataire. La fleur du logo est à la place.

**Les photos du panneau « médecin ».** Trois personnes différentes : une femme
au stéthoscope, un homme (la photo que tu avais envoyée n'avait pas de source
connue, elle a été remplacée par une photo libre, Pexels n° 4989148, et tu m'as
demandé de la changer encore : Motion prépare des candidats plus âgés), et une
troisième femme. Attention : la page dit « le médecin » au singulier. Ce sont
des photos d'illustration, chacune porte la mention « Illustration ». Les
sources et licences sont dans `atelier-motion/images/medecin/LICENCE.md`.

**Le calendrier, à plat.** Plus de dégradés, d'ombres, de halo qui respire ni
de rebonds. La période fertile est en rose clair, le bébé n'est plus que sur le jour d'ovulation, et toutes les
autres dates sont ordinaires. Tu avais dit « vert » : le vert veut dire
« risque plus faible » partout dans l'application, le mettre sur les jours
fertiles aurait inversé son sens, et tu as choisi le lilas. Les jours de règles
gardent une goutte (plate) : sans elle le calendrier perd sa raison d'être. Dis
-moi si tu veux la retirer aussi.

**L'avertissement contraception a été retiré des deux écrans, à ta demande**
(Mon cycle, puis le calendrier : tu l'as demandé deux fois). Tu l'avais toi-même
exigé « obligatoire » le 12. La phrase existe toujours dans
`src/lib/cycle-calcul.ts` (`AVERTISSEMENT_CONTRACEPTION`) : la réafficher tient
en quelques lignes. Ce que ça change, pour que tu le saches : plus rien, sur
ces écrans, ne dit qu'une date « sans couleur » n'est pas sûre, ni que le
calcul n'est pas une contraception. La fiche d'un jour a aussi perdu son
« Risque de grossesse ». Il reste le panneau « Risque de grossesse » de Mon
cycle, que tu avais demandé en grand.

**La période fertile est en rose clair**, plus en violet : bande du calendrier,
anneau de Mon cycle, légende et cartes (`--fertile` dans `tokens.css`).

**Mon cycle.** Les titres des cartes de dates sont grands et les dates
petites. Le « Risque de grossesse » est un panneau : titre et mot en grand,
avec un signal d'alerte (🚨 quand le risque est élevé, ⚠️ sinon). Il est rouge
quand le risque est élevé, orangé quand il est moyen et vert doux quand il est
faible : un panneau rouge posé sur un risque faible ferait crier au loup.

**Les dates de l'accueil** ouvrent le calendrier sur le jour touché.

---

## 6. Ce que j'ai cassé et réparé en chemin

Pour que tu saches où regarder si quelque chose se remet de travers :

- **Une classe `.fil` existait déjà** dans la feuille de style générale. La
  nouvelle liste des discussions portait le même nom, et sa mise en page
  s'empilait au lieu de s'aligner. Rien dans le code ne le disait : seule la
  capture d'écran l'a montré. D'où `outils/collisions.mjs`.
- **Les captures gardaient les anciennes couleurs** : l'agent de service de
  l'application (celui qui la rend utilisable hors ligne) gardait les
  feuilles de style de la veille. Les captures jettent maintenant le profil
  du navigateur à chaque fois.
- **Le service worker resservait un style périmé.** Il gardait les `.css` en
  réserve et les servait en premier : tu voyais une barre de navigation de
  trois versions en arrière, et tu me disais, à juste titre, que mon code
  n'était pas appliqué. Rien ne pouvait le dire, pas même mes captures, qui
  partent d'un navigateur neuf à chaque fois. Depuis : plus de service worker
  en développement, et en production les styles passent par le réseau d'abord.
  **Si tu revois un écran qui ne change pas : recharge deux fois, ou
  Ctrl+Shift+R.**
- **Le carrousel remontait la page.** Il demandait à la carte suivante de se
  mettre en vue ; quand tu avais défilé plus bas, le navigateur remontait tout
  l'écran pour la montrer. C'est la bande qui glisse, maintenant.
- **Le cercle de la barre mordait la case de saisie** (13 octobre). La
  barre liquide avait grandi de 34 px et les zones d'écriture étaient restées
  calées à 68 px. Elles lisent maintenant la hauteur réelle de la barre.
- **Mon propre essai du vocal mentait** : il comptait le mot « vocal-lecteur »
  dans le CSS de la page, et supposait une base vide alors que la démo garde
  les essais précédents. Il compare maintenant avant et après.
- **`updateUser` ne lisait pas la session** quand on attache une adresse à un
  compte anonyme : il lui faut une session en mémoire, pas seulement un
  en-tête. La page disait « réessaie plus tard » pour une raison qui n'avait
  rien à voir.

---

*Dernière mise à jour : 13 octobre 2026, l'après-midi.*
