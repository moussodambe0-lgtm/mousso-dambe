"""
Agrandir les écritures de toute l'application, d'un seul coup.

Arthur, le 13 octobre 2026 : « augmente la police des écritures partout sur
l'application ». Elles étaient réglées pour des yeux de trentenaire sur un
grand écran ; sur un téléphone, au soleil de Ouaga, c'était petit.

Comment, et pourquoi comme ça :
  - les tailles sont écrites en pixels dans tout le projet, donc changer la
    taille du `html` n'aurait eu aucun effet : il faut toucher chaque règle ;
  - le texte courant (jusqu'à 28 px) grossit de 12 % : c'est lui qu'on lit, et
    c'est là que ça compte ;
  - les très grands titres ne grossissent que de 6 % : à cette taille, 12 %
    les feraient déborder de l'écran, et ils sont déjà lisibles ;
  - rien ne descend en dessous de 11 px au final, et chaque valeur est
    arrondie au demi-pixel, comme le reste du projet.

  python outils/grossir-les-ecritures.py          (montre ce qui changerait)
  python outils/grossir-les-ecritures.py --ecrire  (écrit vraiment)
"""

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER = RACINE / "src"
EXTENSIONS = {".css", ".astro"}
MOTIF = re.compile(r"(font-size:\s*)([0-9.]+)(px)")

GRAND = 28.0
FACTEUR_TEXTE = 1.12
FACTEUR_TITRE = 1.06
PLANCHER = 11.0


def nouvelle_taille(ancienne: float) -> float:
    facteur = FACTEUR_TITRE if ancienne > GRAND else FACTEUR_TEXTE
    taille = max(ancienne * facteur, PLANCHER)
    # Au demi-pixel, comme les tailles déjà écrites dans le projet.
    return round(taille * 2) / 2


def main() -> int:
    ecrire = "--ecrire" in sys.argv
    touches = 0
    fichiers = 0

    for chemin in sorted(DOSSIER.rglob("*")):
        if chemin.suffix not in EXTENSIONS or not chemin.is_file():
            continue
        texte = chemin.read_text(encoding="utf-8")
        compte = 0

        def remplacer(m: re.Match) -> str:
            nonlocal compte
            ancienne = float(m.group(2))
            neuve = nouvelle_taille(ancienne)
            if neuve == ancienne:
                return m.group(0)
            compte += 1
            mot = f"{neuve:g}"
            return f"{m.group(1)}{mot}{m.group(3)}"

        neuf = MOTIF.sub(remplacer, texte)
        if compte:
            fichiers += 1
            touches += compte
            if ecrire:
                chemin.write_text(neuf, encoding="utf-8")

    action = "changées" if ecrire else "à changer"
    print(f"{touches} tailles {action}, dans {fichiers} fichiers.")
    if not ecrire:
        print("Relance avec --ecrire pour appliquer.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
