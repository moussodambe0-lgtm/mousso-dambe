# Mousso Dambé

Application mobile (PWA) pour les femmes et les jeunes filles du Burkina :
suivre son cycle, acheter des serviettes et des culottes menstruelles, poser
ses questions à une assistante.

« Mousso Dambé » : la dignité de la femme, en dioula.

Projet d'Arthur, démarré le 12 octobre 2026. Le code est écrit par Claude.

---

## Ce qu'elle fait

1. **Le cycle.** Un questionnaire de six écrans au départ, puis un journal
   quotidien (saignements, douleur, symptômes, note). L'application calcule le
   jour du cycle, la phase, la période fertile et la date des prochaines
   règles. **La moyenne observée sur les derniers cycles l'emporte sur la
   valeur déclarée** : le corps a raison contre le souvenir.
2. **La boutique.** Sept produits, panier, commande payée à la livraison,
   colis neutre. Les prix sont toujours relus en base.
3. **Dambé, l'assistante.** Les questions passent par Ollama. Avant le modèle,
   le code repère les situations graves et répond lui-même par une orientation
   vers un centre de santé : une orientation ne dépend jamais d'un service
   extérieur.

## Les trois règles qui tiennent tout le reste

### 1. Le dossier intime n'est lisible que par elle

Les règles d'accès de la base (RLS) sont actives sur 100 % des tables. Chaque
personne ne voit que ses lignes, et **il n'existe aucun rôle, aucun écran
d'administration et aucun export qui lise le journal de quelqu'un d'autre.**
Ce n'est pas un oubli à combler plus tard : c'est la promesse faite à l'écran,
et `supabase/tests/securite.test.mjs` la vérifie à chaque modification.

### 2. Rien d'intime ne part vers le service d'IA

Ce qui part vers Ollama : le prénom, le jour du cycle, la phase, le catalogue,
et les trois derniers échanges. **Jamais** le journal, le numéro de téléphone,
le quartier, le nom de famille ni les commandes. C'est la base qui prépare ce
contexte (`assistante_contexte()`), pas les pages : ainsi une page mal écrite
ne peut pas laisser fuir une donnée par erreur. Vérifié par
`supabase/tests/assistante.test.mjs`.

### 3. Aucune écriture directe depuis le navigateur

Toute mutation passe par une fonction SQL `SECURITY DEFINER` qui relit et
recalcule. Le navigateur n'envoie jamais un prix : il envoie des identifiants
et des quantités. Sinon n'importe qui commande à 0 FCFA, et aucune règle
d'accès ne sait vérifier une addition.

## Le marché, qui justifie les choix techniques

Android d'entrée de gamme, 3G souvent lente, forfait de données compté,
paiement à la livraison. D'où : rendu côté serveur, **aucun framework
côté navigateur**, polices auto-hébergées, images en WebP, et chaque page qui
fonctionne sans JavaScript. Le seul script envoyé installe le mode hors ligne.

Et un point qui n'est pas technique : **un téléphone se partage.** D'où les
notifications sans détail allumées d'office, le service worker qui ne met
jamais en cache une page personnelle, et le colis neutre.

---

## Monter le projet

```bash
npm install
cp .env.example .env     # puis remplir les valeurs
```

### Voir l'application sans base en ligne

Un faux Supabase local permet de tout essayer avant que le projet Supabase
existe. Il rejoue les vraies migrations sur PGlite, avec les vrais rôles et les
vraies règles d'accès : ce qu'on voit est ce que la vraie base rendrait.

```bash
npm run demo
```

Démarre trois choses et affiche l'adresse à ouvrir :

- un **faux Supabase** (`outils/banc-local/serveur.mjs`) ;
- une **fausse assistante** (`outils/banc-local/faux-ollama.mjs`), qui répond
  des textes écrits d'avance, sans clé et sans dépense. Lancée avec
  `MONTRER=1`, elle affiche tout ce que le site lui envoie : c'est ainsi qu'on
  vérifie de ses yeux qu'aucun journal intime ne traverse ;
- le site, sur http://localhost:4322.

Compte de démonstration : `awa@essai.bf` / `motdepasse`, avec trois cycles,
deux journées notées, une question à Dambé et une commande.

**Ces deux bancs ne sont pas la production.** Ils ne vérifient pas les jetons
et ne hachent pas les mots de passe. À ne jamais exposer sur un réseau.

### Regarder les écrans

```bash
node outils/captures.mjs
```

Pilote Chrome sans interface et capture les 19 écrans en 390 px de large, dans
`captures/`. Lire le code prouve ce que fait l'application ; seul le rendu
prouve qu'elle est regardable.

### Vérifier

```bash
npm run test:sql     # 4 suites, 168 vérifications sur copie locale
npx astro check      # doit rester à 0 erreur
```

`npm run test:sql` rejoue toutes les migrations dans PGlite et exécute les
requêtes comme le ferait l'API, avec les rôles et les en-têtes du site. Aucune
donnée réelle n'est touchée. **À lancer avant toute migration.**

---

## Ce qu'il reste à faire par Arthur

1. **Créer le projet Supabase**, coller les deux clés dans `.env`, appliquer
   les quatre migrations, et déposer l'empreinte de la clé serveur. Le guide
   pas à pas est dans
   `Jarvis\livrables\business\2026-10-12_mousso-dambe-mise-en-route.md`.
2. **La clé Ollama**, pour allumer Dambé.
3. **Valider les prix et les produits** : le catalogue actuel est un exemple.
4. **Les vraies photos des produits** : ce sont aujourd'hui des illustrations
   dessinées par Motion. Une photo vend mieux qu'un dessin.

## Pièges connus

- **`auth.getUser()` sans argument ne marche pas côté serveur** : il cherche
  une session gardée dans le navigateur. Il faut lui passer le jeton :
  `getUser(jeton.access_token)`.
- **L'en-tête `Authorization` s'écrit avec un A majuscule**, exactement comme
  supabase-js : avec une autre casse, les deux clés coexistent dans l'objet,
  sont collées en « Bearer a, Bearer b », et plus personne n'est reconnu.
- **PGlite n'a qu'une connexion** : dans le banc local, les requêtes sont mises
  à la queue leu leu, sinon deux pages se volent leur identité.
- **Aucun attribut `style=` en ligne, aucun `<script is:inline>`** : la
  politique de sécurité du contenu les refuse. Passer par une classe ou un
  attribut `data-`.
- **Les images en `loading="lazy"`** ne se chargent pas dans une capture pleine
  page : le script de capture fait défiler la page avant de photographier.

## Où est quoi

| Dossier | Contenu |
|---|---|
| `src/pages/` | Les écrans. Un fichier par page, formulaires POST ordinaires |
| `src/lib/` | La logique : base, session, cycle, assistante, formats |
| `src/components/` | Les morceaux réutilisés (icônes, anneau, cartes) |
| `src/animations/` | Les SVG animés dessinés par Motion |
| `src/styles/` | Jetons, base, composants, animations |
| `supabase/migrations/` | Le schéma, dans l'ordre. **Ne jamais modifier une migration déjà appliquée** |
| `supabase/tests/` | Le banc PGlite et les quatre suites |
| `outils/` | Le faux Supabase local et le script de captures |
| `atelier-motion/` | Les sources de Motion (hors Git, déjà copiées dans le projet) |
| `DESIGN.md` | La direction visuelle : couleurs, polices, mouvement |

---

## La mise en ligne (26 octobre 2026)

Tout est en ligne sur des comptes **dédiés à ce projet**, séparés de ceux des
autres projets d'Arthur, à sa demande : « je veux m'inscrire comme nouvel
utilisateur pour ne pas mélanger les dossiers ».

| Où | Quoi |
|---|---|
| GitHub | `moussodambe0-lgtm/mousso-dambe`, dépôt **privé** |
| Supabase | projet `vnbaojckbhcjczdnjdjh`, région Londres |
| Vercel | projet `mousso-dambe`, fonctions en région `lhr1` (Londres) |

Les jetons et les clés vivent dans le coffre (`secrets/.env`, hors du dépôt),
et `outils/coffre.mjs` les lit. Trois outils parlent aux services :

- `node outils/migrer.mjs` dit ce qui serait appliqué, `--appliquer` applique.
- `node outils/poser-reglages.mjs --appliquer` pose la clé serveur et l'adresse
  de l'administrateur.
- `node outils/vercel.mjs etat | variables | journaux | redeployer | region`.

### Trois pièges qui ont coûté une demi-journée

**1. L'auteur du commit décide si Vercel accepte de déployer.** Le plan gratuit
n'autorise les déploiements que par le propriétaire du compte, et Vercel lit
l'auteur du dernier commit. Les commits portaient l'identité d'un autre compte
GitHub, et le déploiement passait en `BLOCKED`, sans message ni journal. D'où
l'identité posée **dans ce dépôt seulement** :

```
git config user.name "moussodambe0-lgtm"
git config user.email "348124437+moussodambe0-lgtm@users.noreply.github.com"
```

**2. Le gestionnaire d'identifiants de Windows répond avant tout helper ajouté
en ligne de commande.** Il renvoyait les identifiants de l'ancien compte, et
GitHub répondait « Repository not found » pour un dépôt privé qui existait. Il
faut vider la liste avant d'ajouter le sien : `git -c credential.helper=
-c credential.helper='!bash mon-aide.sh' push`.

**3. Sharp partait dans la fonction sans servir à rien.** Ce projet n'utilise
nulle part `astro:assets`, mais faute de réglage `image`, Astro embarquait
sharp : 19 Mo sur 25. C'est aussi la seule dépendance du paquet qui porte des
binaires propres au système, donc la seule qui puisse marcher sur Windows et
échouer sur le Linux de Vercel. Réglé par
`image: { service: { entrypoint: 'astro/assets/services/noop' } }`.

### Ce qui n'est pas prêt pour de vraies utilisatrices

- **Le mot de passe oublié n'existe pas**, et **aucun email ne part** : une
  femme qui perd son mot de passe perd son compte. Bloquant avant l'ouverture.
- Le plan gratuit de Vercel **interdit l'usage commercial**.
- Le rappel « 2 jours avant » s'enregistre mais rien ne l'envoie.
- Les numéros d'urgence du Burkina sont absents, faute d'en avoir un vérifié.
