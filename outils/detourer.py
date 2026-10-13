"""
Détourer une photo posée sur un fond de studio uni, pour la bannière de
l'accueil.

    python outils/detourer.py ENTREE.jpg SORTIE_SANS_EXTENSION x0 y0 x1 y1

Écrit SORTIE-600.webp et SORTIE-1200.webp (RGBA, fond transparent), comme les
trois photos du médecin déjà en place dans public/accueil/.

Pourquoi ce n'est pas un outil magique : GrabCut (OpenCV) sépare bien une
personne d'un fond de studio gris ou blanc, et mal une personne en blouse
blanche sur un fond blanc. On le vérifie à l'oeil, toujours, sur un fond de la
couleur de la bannière : un détourage qui bave se voit en rose, pas en gris.

Le recadrage (x0 y0 x1 y1) est celui de la bannière : la case fait environ
164 x 182 px, calée en bas, `object-fit: cover`. Une photo trop haute y perd
sa tête. On recadre donc ici, sur la tête et les épaules.
"""
import sys

import cv2
import numpy as np
from PIL import Image

entree, sortie = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = (int(v) for v in sys.argv[3:7])

img = cv2.imread(entree)
if img is None:
    sys.exit(f"Impossible de lire {entree}")
h, w = img.shape[:2]

# GrabCut sur l'image entière, avec un cadre à quelques pixels des bords : le
# contour de la photo est du fond à coup sûr.
masque = np.zeros((h, w), np.uint8)
marge = 4
rect = (marge, marge, w - 2 * marge, h - 2 * marge)
fond = np.zeros((1, 65), np.float64)
avant = np.zeros((1, 65), np.float64)
cv2.grabCut(img, masque, rect, fond, avant, 8, cv2.GC_INIT_WITH_RECT)

# 0 et 2 = fond, 1 et 3 = personne.
personne = np.where((masque == 1) | (masque == 3), 255, 0).astype(np.uint8)

# On garde le plus grand bloc : les éclats isolés du fond ne sont pas elle.
n, etiq, stats, _ = cv2.connectedComponentsWithStats(personne, 8)
if n > 1:
    plus_grand = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    personne = np.where(etiq == plus_grand, 255, 0).astype(np.uint8)

# On bouche les encoches : une blouse blanche posée sur un fond gris clair a
# des bords que GrabCut confond avec le fond, et il les ronge par morceaux.
# Sur une carte SOMBRE, chaque encoche laisse voir le noir de la carte
# (retour d'Arthur, 13 octobre 2026 : « mal collée au niveau du dos et de
# l'épaule, c'est noir »). Une fermeture large rebouche ces encoches, puis on
# remplit les trous intérieurs, et on lisse le contour pour qu'il ne soit
# plus en escalier.
grand = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
personne = cv2.morphologyEx(personne, cv2.MORPH_CLOSE, grand)

# Les trous intérieurs : toute zone de fond qui ne touche AUCUN bord de
# l'image. On part de tous les bords, pas d'un seul coin : un coin de fond
# coincé entre le bras et le bas de l'image (ici, en bas à gauche) touche le
# bord et n'est pas un trou, c'est du fond à garder transparent.
fond_masque = (personne == 0).astype(np.uint8)
nb, lab, st, _ = cv2.connectedComponentsWithStats(fond_masque, 4)
bords = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
exterieur = np.isin(lab, bords[bords > 0])
personne = np.where(exterieur, 0, 255).astype(np.uint8)

# Les pointes et le liseré : une ouverture retire les pics minces de fond
# gris restés collés au bord, une érosion de deux pixels retire le liseré
# clair d'anti-crénelage qui reste de l'ancien fond.
personne = cv2.morphologyEx(personne, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
personne = cv2.erode(personne, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))

# Lissage du contour : un flou large puis un seuil arrondit les marches
# sans rien déplacer de plus de deux pixels.
personne = cv2.GaussianBlur(personne, (0, 0), 3.0)
personne = np.where(personne > 127, 255, 0).astype(np.uint8)
# Puis le bord adouci, pour qu'il ne scintille pas.
personne = cv2.GaussianBlur(personne, (0, 0), 1.0)

rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
rgba[:, :, 3] = personne
im = Image.fromarray(rgba).crop((x0, y0, x1, y1))

for largeur in (600, 1200):
    hauteur = round(im.height * largeur / im.width)
    im.resize((largeur, hauteur), Image.LANCZOS).save(
        f"{sortie}-{largeur}.webp", "WEBP", quality=88, method=6
    )
    print(f"{sortie}-{largeur}.webp  {largeur}x{hauteur}")
