"""
La mascotte, à partir de L'IMAGE d'Arthur, en ne changeant que le teint.

    python outils/mascotte-depuis-image.py

Arthur, le 13 octobre 2026 : « pour la mascotte utilise cette image, change
juste le teint en brun ». Redessiner à la main (les versions v1 à v5 de
Motion) s'éloignait de son image à chaque fois : la reprendre, elle, est la
seule façon de lui rendre exactement ce qu'il a choisi.

Ce que fait ce script, dans l'ordre :
  1. DÉTOURE la fillette : le fond est un damier rose, le contour noir épais
     du dessin est continu, donc on remplit le fond depuis les bords sans
     jamais traverser le trait.
  2. REPEINT LA PEAU en brun (#8E5A3B) en gardant les ombres du dessin. Les
     cheveux, les joues roses, les yeux et la tenue ne bougent pas.
  3. RETIRE LA CROIX du bonnet et pose la fleur du logo à la place. Règle du
     projet, tenue depuis le début : aucune croix, nulle part (emblème
     protégé par les Conventions de Genève, dont le Burkina Faso est
     signataire).

Écrit dans public/mascotte/ :
  infirmiere.webp         la fillette entière, fond transparent
  infirmiere-visage.webp  la tête seule, pour les petits avatars
"""
import io
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "atelier-motion" / "references" / "infirmiere-chibi-arthur-13oct.jpg"
SORTIE = RACINE / "public" / "mascotte"
SORTIE.mkdir(parents=True, exist_ok=True)

# Le teint validé par Arthur, et l'ombre qui va avec.
PEAU = np.array([0x8E, 0x5A, 0x3B], np.float32)

bgr = cv2.imread(str(SOURCE))
if bgr is None:
    sys.exit(f"Impossible de lire {SOURCE}")
h, w = bgr.shape[:2]
rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

# ---------------------------------------------------------------------------
# 1. Le détourage : le fond, c'est ce qu'on atteint depuis les bords sans
#    traverser le trait noir.
# ---------------------------------------------------------------------------
gris = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
trait = (gris < 95).astype(np.uint8)
# On épaissit un peu le trait : un contour anti-crénelé laisse passer le
# remplissage par ses pixels les plus clairs.
trait = cv2.dilate(trait, np.ones((3, 3), np.uint8))
libre = (1 - trait).astype(np.uint8)

exterieur = np.zeros((h + 2, w + 2), np.uint8)
masque_fill = np.pad(1 - libre, 1, constant_values=1).astype(np.uint8)  # 1 = interdit
tampon = libre.copy() * 255
for pt in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3), (w // 2, 2), (2, h // 2), (w - 3, h // 2)]:
    if libre[pt[1], pt[0]]:
        cv2.floodFill(tampon, masque_fill.copy(), pt, 128, flags=4 | cv2.FLOODFILL_FIXED_RANGE)
fond = tampon == 128
perso = ~fond

# Le contour dilaté fait partie de la fillette : on le lui rend.
perso = cv2.morphologyEx(perso.astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, etiq, stats, _ = cv2.connectedComponentsWithStats(perso, 8)
plus_grand = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
perso = (etiq == plus_grand).astype(np.uint8) * 255

# Les poches de fond prises dans le dessin (entre les jambes, entre le bras
# et le buste) : ce sont des zones ENTOURÉES de trait dont la couleur est
# celle du damier (rose pâle ou crème), pas du blanc de la blouse.
H, S, V = cv2.split(hsv)
# Deux couleurs de damier, et seulement elles : un rose très pâle (saturation
# faible) et un crème (saturation plus faible encore). La PEAU claire du dessin
# (saturation 40 à 105) et la planchette rose (saturation plus forte) ne
# doivent jamais être prises pour du fond : c'est ce qui rendait les oreilles,
# le cou, les mains et le bras transparents.
rose_pale = (H >= 150) & (S >= 10) & (S <= 48) & (V > 225)
creme = (H >= 8) & (H <= 32) & (S >= 6) & (S <= 30) & (V > 228)
ressemble_fond = (rose_pale | creme).astype(np.uint8)
non_trait = (trait == 0).astype(np.uint8)
n2, etiq2, st2, _ = cv2.connectedComponentsWithStats(non_trait & (perso > 0).astype(np.uint8), 4)
for i in range(1, n2):
    aire = st2[i, cv2.CC_STAT_AREA]
    if aire < 60:
        continue
    zone = etiq2 == i
    part_fond = ressemble_fond[zone].mean()
    # Une poche de damier : grande part de couleur de fond, et petite (la
    # blouse et le visage sont plus grands, ou pas de cette couleur).
    if part_fond > 0.72 and aire < 6000:
        perso[zone] = 0

# Bord adouci, pour qu'il ne scintille pas sur le rose de l'application.
alpha = cv2.GaussianBlur(perso, (0, 0), 0.9)

# ---------------------------------------------------------------------------
# 2. La peau : pêche clair, faible saturation, teinte orangée. Les cheveux
#    ont la même teinte mais bien plus de saturation et sont plus sombres.
# ---------------------------------------------------------------------------
Hf = H.astype(np.float32)
Sf = S.astype(np.float32)
Vf = V.astype(np.float32)
peau = (Hf >= 3) & (Hf <= 22) & (Sf >= 22) & (Sf <= 105) & (Vf >= 185)
# Le blanc de la blouse et du bonnet : saturation presque nulle, exclu par
# Sf >= 22. Les joues roses : teinte rose (H > 150), exclues par Hf <= 22.
peau &= perso > 0

# Un masque doux : on étend d'un pixel pour attraper le bord anti-crénelé
# entre la peau et le trait, puis on adoucit.
peau_u8 = cv2.dilate(peau.astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
peau_u8 = cv2.GaussianBlur(peau_u8, (0, 0), 0.8)
poids = (peau_u8.astype(np.float32) / 255.0)[..., None]

# Le brun garde les nuances du dessin : on module par la valeur d'origine,
# relative à la peau claire de référence.
reference_v = float(np.median(Vf[peau])) if peau.any() else 245.0
module = np.clip(Vf / reference_v, 0.55, 1.08)[..., None]
brun = np.clip(PEAU[None, None, :] * module, 0, 255)

recolore = rgb.astype(np.float32) * (1 - poids) + brun * poids

# Les joues : un rose un peu plus soutenu, pour qu'elles se voient sur le
# brun (sur la peau claire d'origine, elles étaient franches ; sur du brun
# le même rose s'éteint).
joues = (Hf >= 150) & (Hf <= 178) & (Sf >= 35) & (Sf <= 120) & (Vf >= 200)
joues &= (np.arange(h)[:, None] > 0.40 * h) & (np.arange(h)[:, None] < 0.58 * h)
j_u8 = cv2.GaussianBlur(joues.astype(np.uint8) * 255, (0, 0), 0.8).astype(np.float32) / 255.0
rose_joue = np.array([0xE0, 0x6A, 0x8C], np.float32)
recolore = recolore * (1 - 0.65 * j_u8[..., None]) + rose_joue * (0.65 * j_u8[..., None])

# ---------------------------------------------------------------------------
# 3. La croix du bonnet devient la fleur du logo.
# ---------------------------------------------------------------------------
# La croix : un « + » rose dans la moitié haute du bonnet, centré à x ≈ 363.
rose_croix = (Hf >= 150) & (Hf <= 179) & (Sf >= 40) & (Vf >= 200)
zone_bonnet = np.zeros((h, w), bool)
zone_bonnet[140:240, 300:430] = True
croix = rose_croix & zone_bonnet
# Le liseré rose du bonnet est plus haut (y < 160) : on ne touche que le
# plus gros bloc compact, la croix.
n3, etiq3, st3, cen3 = cv2.connectedComponentsWithStats(croix.astype(np.uint8), 8)
cx = cy = None
if n3 > 1:
    # le bloc dont la boîte est la plus carrée et la plus proche de 70 px
    meilleur, score = None, 1e9
    for i in range(1, n3):
        bw, bh = st3[i, cv2.CC_STAT_WIDTH], st3[i, cv2.CC_STAT_HEIGHT]
        if bw < 30 or bh < 30:
            continue
        s = abs(bw - bh) + abs(bw - 75)
        if s < score:
            meilleur, score = i, s
    if meilleur is not None:
        x, y, bw, bh = st3[meilleur, :4]
        cx, cy = x + bw // 2, y + bh // 2
        zone = cv2.dilate((etiq3 == meilleur).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        blanc = np.array([252, 250, 250], np.float32)
        recolore[zone] = blanc
        cote = max(bw, bh)
        print(f"croix retirée en ({cx},{cy}), {bw}x{bh}")
    else:
        print("ATTENTION : croix du bonnet non trouvée, à vérifier à l'oeil")
else:
    print("ATTENTION : aucun bloc rose dans le bonnet")

image = Image.fromarray(np.clip(recolore, 0, 255).astype(np.uint8)).convert("RGBA")

# La fleur : on la dessine vectoriellement à partir du logo existant.
fleur_svg = RACINE / "src" / "assets" / "logo" / "logo-fleur.svg"
if cx is not None:
    try:
        import fitz  # PyMuPDF

        taille = int(cote * 1.05)
        if fleur_svg.exists():
            doc = fitz.open(str(fleur_svg))
            page = doc[0]
            zoom = taille / max(page.rect.width, page.rect.height)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
            fleur = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
        else:
            raise FileNotFoundError(fleur_svg)
    except Exception as e:  # noqa: BLE001
        print(f"Fleur du logo indisponible ({e}) : une fleur simple est dessinée à la place.")
        fleur = Image.new("RGBA", (taille, taille), (0, 0, 0, 0))
        d = ImageDraw.Draw(fleur)
        for angle in (-50, 0, 50):
            pass
        d.ellipse([taille * 0.30, taille * 0.05, taille * 0.70, taille * 0.70], fill=(228, 24, 84, 255))
        d.ellipse([taille * 0.05, taille * 0.35, taille * 0.45, taille * 0.85], fill=(228, 24, 84, 255))
        d.ellipse([taille * 0.55, taille * 0.35, taille * 0.95, taille * 0.85], fill=(228, 24, 84, 255))
    image.alpha_composite(fleur, (cx - fleur.width // 2, cy - fleur.height // 2))

# Fond transparent.
a = Image.fromarray(alpha)
image.putalpha(a)

# ---------------------------------------------------------------------------
# Sorties : la fillette entière, et la tête seule.
# ---------------------------------------------------------------------------
ys, xs = np.where(alpha > 10)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
pad = 6
entiere = image.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
def reduire(im, largeur=400):
    """400 px de large : de quoi rester nette à 200 px sur un écran double
    densité, pour une trentaine de ko. Elle est sur CHAQUE page (le bouton
    flottant), donc son poids compte."""
    return im.resize((largeur, round(im.height * largeur / im.width)), Image.LANCZOS)


entiere = reduire(entiere)
entiere.save(SORTIE / "infirmiere.webp", "WEBP", quality=82, method=6)
print("infirmiere.webp", entiere.size)

# La tête : du haut du chignon au bas du menton (la zone de la peau + le
# col). On la cadre à partir de l'image d'origine, repère mesuré au dessin.
tete = image.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), int(y0 + (y1 - y0) * 0.58)))
# Le visage sert en petit (32 à 56 px) : 240 px de large suffisent, même en
# triple densité, et il est affiché sur chaque page.
tete = reduire(tete, 240)
tete.save(SORTIE / "infirmiere-visage.webp", "WEBP", quality=82, method=6)
print("infirmiere-visage.webp", tete.size)
