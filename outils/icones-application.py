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

LE RECADRAGE, ET POURQUOI IL CHANGE TOUT

Arthur, apres avoir installe l'application : « je vois le logo, il est en petit
avec un fond blanc. Je veux que le logo prenne toute la place de l'icone. »

La cause n'etait pas la taille choisie plus bas. Le fichier source mesure
512x256, mais le DESSIN n'occupe que 252x253 au milieu : il y a 260 px de vide
transparent sur les cotes. On redimensionnait donc ce vide avec le logo, et le
logo se retrouvait deux fois trop petit dans l'icone.

Recadre sur son contenu, le dessin se revele CARRE (rapport 1,00). Il peut donc
remplir l'icone au lieu d'y flotter.

LA SOURCE EST HORS DE `public/`, ET C'EST DELIBERE

Cet outil partait d'abord de `public/icone-512.png`, qu'il ecrase ensuite. Au
second passage il aurait recadre sa propre sortie, dont le fond est plein :
`getbbox()` aurait rendu le canevas entier, le recadrage n'aurait plus rien
enleve, et le logo aurait retreci un peu plus a chaque lancement, sans la
moindre erreur. `src/assets/logo/logo-fleur.png` est le dessin d'origine, que
rien n'ecrit jamais.

CE QUE L'OUTIL PRODUIT

  icone-192.png           192x192, pour la liste des applications
  icone-512.png           512x512, pour l'ecran de demarrage
  icone-maskable-512.png  512x512, logo reduit dans la zone sure

LA ZONE SURE, ET POURQUOI UNE ICONE A PART

Android recadre les icones « maskable » selon la forme choisie par le
fabricant : cercle, goutte, carre arrondi. Il ne garantit qu'un disque central
occupant 80 % du cote ; tout ce qui depasse peut etre coupe. La meme image ne
peut donc pas servir aux deux usages, d'ou deux fichiers.

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
SOURCE = RACINE / 'src' / 'assets' / 'logo' / 'logo-fleur.png'

# Le rose de `background_color` et `theme_color` du manifeste.
FOND = (255, 246, 249, 255)

# Le logo remplit l'icone, a un lisere pres : « je veux que le logo soit grand,
# qu'il prenne toute la place, et qu'on ne voie pas trop le fond ».
PART_ORDINAIRE = 0.94

# La zone sure d'Android est un CERCLE de 80 % du cote. Un carre entierement
# inscrit dedans ne ferait que 56 %, ce qui redonnerait le logo minuscule
# qu'Arthur a vu. Mais le logo n'est pas un carre plein : c'est une fleur, et
# les coins de son cadre sont vides. Seules ses pointes approchent la limite,
# et elles survivent aux trois formes de recadrage.
PART_MASKABLE = 0.74


def recadree(source: Image.Image) -> Image.Image:
    """Le dessin seul, sans le vide transparent qui l'entoure."""
    boite = source.getbbox()
    return source.crop(boite) if boite else source


def carree(source: Image.Image, cote: int, part: float) -> Image.Image:
    """Le logo, centre sur un carre de fond."""
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

    brute = Image.open(SOURCE).convert('RGBA')
    source = recadree(brute)
    print(
        f'source : {SOURCE.name}, canevas {brute.width}x{brute.height}, '
        f'dessin {source.width}x{source.height}'
    )

    # Le dessin recadre doit etre a peu pres carre. S'il ne l'est pas, le faire
    # remplir l'icone le deformerait ou le couperait : mieux vaut s'arreter que
    # fabriquer une icone de travers que personne ne regardera en grand.
    rapport = source.width / source.height
    if not 0.9 <= rapport <= 1.1:
        print(f'Le dessin n est pas carre (rapport {rapport:.2f}) : relire l en-tete.')
        return 1

    sorties = [
        (PUBLIC / 'icone-512.png', 512, PART_ORDINAIRE),
        (PUBLIC / 'icone-192.png', 192, PART_ORDINAIRE),
        (PUBLIC / 'icone-maskable-512.png', 512, PART_MASKABLE),
    ]

    for chemin, cote, part in sorties:
        carree(source, cote, part).save(chemin, 'PNG', optimize=True)
        print(f'  {chemin.name} : {cote}x{cote}')

    print('\nFait. Le manifeste doit lister icone-maskable-512.png en « maskable ».')
    return 0


if __name__ == '__main__':
    sys.exit(main())
