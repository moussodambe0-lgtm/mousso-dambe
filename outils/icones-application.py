"""
Fabriquer les icones de l'application installee sur le telephone.

  python outils/icones-application.py

POURQUOI CET OUTIL EXISTE (27 octobre 2026)

Arthur voulait qu'on puisse installer l'application, et que l'icone posee sur
l'ecran d'accueil soit le logo de Mousso Dambe. Les deux icones declarees dans
`public/manifest.webmanifest` annoncaient 192x192 et 512x512, mais les fichiers
mesuraient 192x96 et 512x256 : le logo est deux fois plus large que haut.

Ce n'etait pas qu'une question d'allure. Chrome exige une icone CARREE d'au
moins 192 px pour declarer un site installable. Avec une icone qui ment sur sa
taille, il refuse en silence : l'evenement `beforeinstallprompt` n'arrive
jamais, le bandeau d'invitation ne s'affiche jamais, et l'entree « Installer »
reste absente de son menu. Autrement dit, l'application n'etait tout
simplement pas installable, et rien a l'ecran ne le disait.

CE QUE L'OUTIL PRODUIT

  icone-192.png           192x192, pour la liste des applications
  icone-512.png           512x512, pour l'ecran de demarrage
  icone-maskable-512.png  512x512, logo reduit dans la zone sure

LA ZONE SURE, ET POURQUOI UNE ICONE A PART

Android recadre les icones « maskable » selon la forme choisie par le
fabricant : cercle, goutte, carre arrondi. Il ne garantit qu'un disque central
occupant 80 % du cote ; tout ce qui depasse peut etre coupe. Un logo qui
remplit l'image y perd ses petales. On le reduit donc a 56 % et on remplit le
reste de fond : la meme image ne peut pas servir aux deux usages, d'ou deux
fichiers.

LE FOND N'EST PAS TRANSPARENT, ET C'EST VOULU. Une icone transparente se pose
sur le fond d'ecran de la personne, qui peut etre une photo sombre ou chargee :
le trait noir du visage y disparait. Le rose tres pale de l'application
(#FFF6F9) donne toujours le meme resultat, et c'est deja la couleur que le
manifeste annonce pour l'ecran de demarrage.
"""

import sys
from pathlib import Path

from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
PUBLIC = RACINE / 'public'
SOURCE = PUBLIC / 'icone-512.png'

# Le rose de `background_color` et `theme_color` du manifeste.
FOND = (255, 246, 249, 255)

# Part du cote occupee par le logo. L'icone ordinaire respire sans etre perdue
# au milieu ; la maskable tient dans le disque des 80 %, avec de la marge.
PART_ORDINAIRE = 0.80
PART_MASKABLE = 0.56


def carree(source: Image.Image, cote: int, part: float) -> Image.Image:
    """Le logo, centre sur un carre de fond, sans jamais etre agrandi."""
    large = max(1, round(cote * part))
    haut = max(1, round(source.height * large / source.width))

    # LANCZOS pour une reduction : c'est le filtre qui garde les bords nets du
    # trait noir, la ou BILINEAR le rend cotonneux aux petites tailles.
    logo = source.resize((large, haut), Image.LANCZOS)

    fond = Image.new('RGBA', (cote, cote), FOND)
    fond.paste(logo, ((cote - large) // 2, (cote - haut) // 2), logo)
    return fond


def main() -> int:
    if not SOURCE.exists():
        print(f'Source introuvable : {SOURCE}')
        return 1

    source = Image.open(SOURCE).convert('RGBA')
    if source.width == source.height:
        print(
            f'{SOURCE.name} est deja carree ({source.width}x{source.height}).\n'
            'Cet outil part du logo en bandeau : relire son en-tete avant de le relancer.'
        )
        return 1

    print(f'source : {SOURCE.name} ({source.width}x{source.height})')

    sorties = [
        (PUBLIC / 'icone-512.png', 512, PART_ORDINAIRE),
        (PUBLIC / 'icone-192.png', 192, PART_ORDINAIRE),
        (PUBLIC / 'icone-maskable-512.png', 512, PART_MASKABLE),
    ]

    # La source est lue une fois, AVANT d'ecrire : le premier fichier ecrit est
    # justement celui dont on part.
    for chemin, cote, part in sorties:
        carree(source, cote, part).save(chemin, 'PNG', optimize=True)
        print(f'  {chemin.name} : {cote}x{cote}')

    print('\nFait. Le manifeste doit lister icone-maskable-512.png en « maskable ».')
    return 0


if __name__ == '__main__':
    sys.exit(main())
