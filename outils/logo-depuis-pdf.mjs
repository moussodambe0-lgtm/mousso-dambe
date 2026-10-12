/**
 * Le logo de Mousso Dambé, depuis le PDF d'Arthur.
 *
 *   node outils/logo-depuis-pdf.mjs
 *
 * Arthur a livré son logo le 12 octobre 2026 en PDF vectoriel. Ce script en
 * tire ce dont l'application a besoin, sans jamais le redessiner à la main :
 *
 *   - la FLEUR seule, en SVG, pour le symbole de l'application (barre, écran
 *     d'ouverture, icône) ;
 *   - le logo ENTIER, en SVG, pour les écrans où le nom doit se lire ;
 *   - les icônes PNG de l'application (192 et 512), que le téléphone exige en
 *     image matricielle.
 *
 * Pourquoi en SVG et pas en image : le logo apparaît à 30 px dans la barre et
 * à 200 px sur l'écran d'ouverture. Une image choisie pour l'un est floue ou
 * trop lourde pour l'autre. Un tracé est net partout et pèse quelques kilos.
 *
 * Le découpage se fait sur les coordonnées du PDF, pas sur une approximation :
 * on demande à MuPDF où sont les tracés, et on coupe entre la fleur et le
 * texte.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(RACINE, 'atelier-motion', 'logo', 'logo-source.pdf');
const SORTIE = path.join(RACINE, 'atelier-motion', 'logo');

if (!fs.existsSync(SOURCE)) {
  console.error(`Le PDF du logo est introuvable : ${SOURCE}`);
  process.exit(1);
}

// MuPDF fait tout le travail. On passe par Python parce que c'est là qu'il est
// installé sur ce PC ; le script reste lisible et ne dépend de rien d'autre.
const PYTHON = `
import pymupdf, json, sys

doc = pymupdf.open(r"${SOURCE}")
page = doc[0]

# Où s'arrête la fleur, où commence le nom. Le texte de ce PDF est vectorisé
# (ce sont des tracés, plus des lettres), donc on ne peut pas le chercher comme
# du texte : on cherche les BANDES VIDES entre les groupes de tracés. Il y en a
# deux : entre la fleur et « MOUSSO DAMBÉ », puis entre le nom et la phrase.
dessins = page.get_drawings()

bas = 0.0
vides = []
for d in sorted(dessins, key=lambda d: d["rect"].y0):
    if d["rect"].y0 > bas + 1:
        vides.append((bas, d["rect"].y0))
    bas = max(bas, d["rect"].y1)

# On ne garde que les vides assez larges pour séparer deux blocs, et on les
# prend dans l'ordre : le premier sépare la fleur du nom, le second le nom de
# la phrase.
coupures = [v for v in vides if v[1] - v[0] > 8 and v[0] > 20]
fin_fleur = coupures[0][0] if coupures else page.rect.y1
fin_nom = coupures[1][0] if len(coupures) > 1 else page.rect.y1

x0 = min((d["rect"].x0 for d in dessins), default=page.rect.x0)
y0 = min((d["rect"].y0 for d in dessins), default=page.rect.y0)
x1 = max((d["rect"].x1 for d in dessins), default=page.rect.x1)
x1_nom = max((d["rect"].x1 for d in dessins if d["rect"].y1 <= fin_nom + 1), default=x1)

marge = 2
fleur = pymupdf.Rect(x0 - marge, y0 - marge, x1 + marge, fin_fleur + marge)
# Le logo avec son nom, sans la phrase : c'est la forme qu'on met dans une
# application, où la place est comptée.
avec_nom = pymupdf.Rect(x0 - marge, y0 - marge, x1_nom + marge, fin_nom + marge)
entier = pymupdf.Rect(x0 - marge, y0 - marge, page.rect.x1, page.rect.y1)

# Le SVG : MuPDF garde les tracés, donc le logo reste net à toutes les tailles.
#
# Rogner ne suffit pas : un cadre plus petit CACHE les lettres, il ne les
# enlève pas. La fleur seule pesait donc autant que le logo entier, lettres
# comprises, pour être affichée à 30 px dans une barre. On les efface pour de
# bon, sur une copie du document, avec une occultation.
def exporter(zone, fichier):
    copie = pymupdf.open(r"${SOURCE}")
    f = copie[0]
    dehors = pymupdf.Rect(f.rect.x0, zone.y1, f.rect.x1, f.rect.y1)
    if dehors.height > 1:
        f.add_redact_annot(dehors)
        f.apply_redactions(graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED)
    f.set_cropbox(zone)
    open(fichier, "w", encoding="utf-8").write(f.get_svg_image())
    copie.close()

exporter(fleur, r"${path.join(SORTIE, 'logo-fleur.svg')}")
exporter(avec_nom, r"${path.join(SORTIE, 'logo-avec-nom.svg')}")
exporter(entier, r"${path.join(SORTIE, 'logo-entier.svg')}")

# Les icônes de l'application, que le téléphone veut en PNG. Fond transparent :
# le manifeste donne déjà la couleur derrière.
page.set_cropbox(page.mediabox)
page.set_cropbox(fleur)
for taille in (192, 512):
    zoom = taille / max(fleur.width, fleur.height)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=True)
    pix.save(r"${path.join(SORTIE, 'icone')}" + str(taille) + ".png")

# Les couleurs vraiment utilisées, pour que les jetons de l'application
# collent au logo au lieu de s'en approcher.
couleurs = {}
for d in dessins:
    for cle in ("fill", "color"):
        c = d.get(cle)
        if c:
            h = "#%02X%02X%02X" % tuple(round(x * 255) for x in c)
            couleurs[h] = couleurs.get(h, 0) + 1

print(json.dumps({
  "fleur": [round(fleur.x0, 1), round(fleur.y0, 1), round(fleur.width, 1), round(fleur.height, 1)],
  "avec_nom": [round(avec_nom.width, 1), round(avec_nom.height, 1)],
  "page": [round(page.mediabox.width, 1), round(page.mediabox.height, 1)],
  "couleurs": sorted(couleurs.items(), key=lambda c: -c[1]),
}, ensure_ascii=False))
`;

const r = spawnSync('python', ['-c', PYTHON], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(1);
}

console.log(r.stdout.trim());
for (const f of ['logo-fleur.svg', 'logo-avec-nom.svg', 'logo-entier.svg', 'icone192.png', 'icone512.png']) {
  const chemin = path.join(SORTIE, f);
  if (fs.existsSync(chemin)) {
    console.log(`  ${f} — ${Math.round(fs.statSync(chemin).size / 1024)} Ko`);
  }
}
