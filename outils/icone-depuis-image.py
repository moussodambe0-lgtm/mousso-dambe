"""
Faire une icône d'interface à partir d'une image que m'envoie Arthur.

Le 13 octobre 2026, pour « En livraison » dans Mon compte, Arthur a demandé de
coller SA photo (un livreur en scooter) plutôt qu'un dessin refait au trait.
L'image reçue est un JPEG à fond blanc, avec beaucoup de vide autour.

Ce que fait ce fichier :
  1. recadre sur le dessin (tout ce qui n'est pas blanc) ;
  2. rend le fond transparent ;
  3. garde la forme en noir foncé, à l'alpha près, pour qu'elle se pose sur
     n'importe quel fond de l'application sans rectangle blanc autour ;
  4. écrit un PNG carré, à la taille demandée.

  python outils/icone-depuis-image.py <source> <destination> [taille]
"""

import sys
from PIL import Image

SEUIL_BLANC = 235  # au-dessus, c'est le fond


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    source, destination = sys.argv[1], sys.argv[2]
    taille = int(sys.argv[3]) if len(sys.argv) > 3 else 128

    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    largeur, hauteur = image.size

    # Le fond blanc devient transparent ; le reste devient noir foncé, en
    # gardant son opacité d'origine pour que les bords restent doux.
    for y in range(hauteur):
        for x in range(largeur):
            r, v, b, _ = pixels[x, y]
            clarte = (r + v + b) / 3
            if clarte >= SEUIL_BLANC:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                # Plus c'est sombre, plus c'est opaque. Le facteur 1.8 rend le
                # trait franchement noir au lieu de gris : demande d'Arthur du
                # 13 octobre 2026, « les logos plus foncés ». Seuls les tout
                # derniers pixels du bord restent translucides, ce qui garde le
                # contour lisse au lieu de le créneler.
                alpha = min(255, int(255 * (1 - clarte / SEUIL_BLANC) * 1.8))
                pixels[x, y] = (13, 10, 12, alpha)

    boite = image.getbbox()
    if boite is None:
        print("L'image est vide après détourage.")
        return 1
    image = image.crop(boite)

    # Carré, le dessin centré, avec une marge d'un vingtième : une icône
    # collée au bord se touche mal et se voit mal.
    cote = max(image.size)
    marge = max(2, cote // 20)
    toile = Image.new("RGBA", (cote + marge * 2, cote + marge * 2), (0, 0, 0, 0))
    toile.paste(
        image,
        ((toile.width - image.width) // 2, (toile.height - image.height) // 2),
        image,
    )
    toile = toile.resize((taille, taille), Image.LANCZOS)
    toile.save(destination, "PNG", optimize=True)
    print(f"{destination} écrit ({taille}x{taille}, depuis {boite[2] - boite[0]}x{boite[3] - boite[1]}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
