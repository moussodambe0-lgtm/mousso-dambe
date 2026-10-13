/**
 * Les photos des produits, prêtes pour la boutique.
 *
 *   node outils/photos-produits.mjs
 *
 * Arthur a livré de vraies photos le 13 octobre 2026. Ce script en fait ce
 * dont la boutique a besoin, et rien d'autre :
 *
 *   - un format 4:3, cadré au bon endroit. Le cadre d'une carte produit est en
 *     PAYSAGE (environ 150 × 104) : une image carrée y est recoupée en haut et
 *     en bas par le navigateur, et sur une culotte menstruelle c'est justement
 *     la doublure, en bas, qui disparaît. Or c'est elle qu'on vient voir ;
 *   - deux tailles, 600 et 1200, pour que le téléphone ne télécharge que
 *     celle qu'il affiche ;
 *   - en WebP, parce qu'une photo de produit en JPEG pèse deux à trois fois
 *     plus pour le même rendu, et que ça se paie sur un forfait compté.
 *
 * `ancre` dit où regarder dans la hauteur de la photo (0 = en haut, 1 = en
 * bas) : sur une photo verticale, le produit n'est presque jamais au milieu.
 *
 * `couperBas` enlève une bande en bas : les photos d'un fournisseur portent
 * souvent SON badge (« LeakProof » et ses pictogrammes sur l'une d'elles).
 * Ce n'est pas notre marque, et une promesse écrite par quelqu'un d'autre n'a
 * rien à faire sur notre fiche produit.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATELIER = path.join(RACINE, 'atelier-motion', 'images', 'produits-photos');
const PUBLIC = path.join(RACINE, 'public', 'produits');

/**
 * Ce qu'on fabrique.
 *
 * `source`  : le fichier d'origine, dans l'atelier.
 * `nom`     : le nom de sortie, qui finit dans la colonne `image` de la base.
 * `cadre`   : [gauche, haut, droite, bas] en part de l'image, avant le carré.
 *             Sert à montrer UN produit quand la photo en montre plusieurs.
 * `couperBas` : part de l'image à enlever en bas (badges du fournisseur).
 */
const PHOTOS = [
  {
    source: 'culottes-leakproof.jpg',
    nom: 'culotte-flux-abondant',
    couperBas: 0.17,
    // Un peu bas : c'est la doublure grise qu'on vient voir.
    ancre: 0.56,
  },
  // Pas de recadrage sur UNE culotte : sur ces photos elles sont empilées les
  // unes sur les autres, et isoler celle du milieu donne une image coupée qui
  // montre encore les deux autres. Pour une fiche « culotte rose », il faut
  // une photo de la rose seule.
  {
    source: 'culottes-trois-couleurs.jpg',
    nom: 'lot-3-culottes',
    ancre: 0.5,
  },
  {
    source: 'culottes-coton-quatre.jpg',
    nom: 'culottes-coton',
    ancre: 0.45,
  },
  {
    source: 'culottes-pastel-cinq.jpg',
    nom: 'culottes-pastel',
    ancre: 0.5,
  },
  {
    // LA SERVIETTE DE JOUR. Celle du premier plan, posée à plat : on y voit le
    // tissu, la doublure et la pression.
    //
    // Les autres serviettes de cette série portent, SUR LE PRODUIT, l'étiquette
    // d'un autre fabricant. Ce cadrage est le seul de toute la photo qui la
    // laisse hors champ, et c'est pour ça qu'il est si serré. Décision
    // d'Arthur du 13 octobre 2026 : « je garde les cadrages qui l'évitent ».
    source: 'serviettes-lavables-pochette.jpg',
    nom: 'serviettes-jour',
    cadre: [0.0, 0.52, 0.78, 1.0],
  },
  {
    // LA SERVIETTE DE NUIT : la grande rose, vue de près. C'est la plus longue
    // de la planche, et c'est ce qui distingue une serviette de nuit.
    source: 'serviettes-lavables-douze.jpg',
    nom: 'serviettes-nuit',
    cadre: [0.02, 0.0, 0.66, 0.52],
  },
  {
    // LE LOT : plusieurs serviettes en éventail. Le badge « 12 PCS » du
    // fournisseur est hors cadre, parce que notre lot n'en vend pas douze.
    source: 'serviettes-lavables-douze.jpg',
    nom: 'serviettes-lavables-lot',
    cadre: [0.30, 0.28, 1.0, 0.80],
  },
];

const PYTHON = `
from PIL import Image
import json, os, sys

travaux = json.loads(sys.argv[1])
atelier = sys.argv[2]
sortie = sys.argv[3]
faits = []

for t in travaux:
    chemin = os.path.join(atelier, t["source"])
    if not os.path.exists(chemin):
        faits.append({"nom": t["nom"], "erreur": "source absente : " + t["source"]})
        continue

    im = Image.open(chemin).convert("RGB")
    l, h = im.size

    # 1. Le cadrage demandé, s'il y en a un.
    if t.get("cadre"):
        g, ht, d, b = t["cadre"]
        im = im.crop((int(g * l), int(ht * h), int(d * l), int(b * h)))
        l, h = im.size

    # 2. La bande du bas, avec le badge du fournisseur.
    if t.get("couperBas"):
        im = im.crop((0, 0, l, int(h * (1 - t["couperBas"]))))
        l, h = im.size

    # 3. Le 4:3, au niveau demandé par l'ancre.
    large = l
    haut = round(l * 3 / 4)
    if haut > h:
        haut = h
        large = round(h * 4 / 3)

    x = (l - large) // 2
    ancre = t.get("ancre", 0.5)
    y = max(0, min(h - haut, round(h * ancre - haut / 2)))
    im = im.crop((x, y, x + large, y + haut))

    tailles = {}
    for taille in (1200, 600):
        petite = im.resize((taille, round(taille * 3 / 4)), Image.LANCZOS)
        fichier = os.path.join(sortie, t["nom"] + "-" + str(taille) + ".webp")
        petite.save(fichier, "WEBP", quality=82, method=6)
        tailles[taille] = round(os.path.getsize(fichier) / 1024)
    faits.append({"nom": t["nom"], "cadre": [large, haut], "poids": tailles})

print(json.dumps(faits, ensure_ascii=False))
`;

fs.mkdirSync(PUBLIC, { recursive: true });

const r = spawnSync('python', ['-c', PYTHON, JSON.stringify(PHOTOS), ATELIER, PUBLIC], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}

for (const f of JSON.parse(r.stdout.trim())) {
  if (f.erreur) console.log(`  ${f.nom} : ${f.erreur}`);
  else console.log(`  ${f.nom} — ${f.cadre[0]} × ${f.cadre[1]}, ${f.poids[600]} Ko en 600, ${f.poids[1200]} Ko en 1200`);
}
