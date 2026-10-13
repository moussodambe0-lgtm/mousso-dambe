"""
Les quatre SVG de la mascotte, construits autour de l'IMAGE d'Arthur.

    python outils/mascotte-depuis-image.py   # d'abord : l'image recolorée
    python outils/mascotte-svg.py            # ensuite : les quatre SVG

Chaque SVG pose la même fillette (public/mascotte/infirmiere.webp) dans un
disque rose, et ajoute ce qui fait la pose : elle se balance un peu pour
saluer, penche la tête avec sa bulle pour écouter, hoche la tête avec ses
éclats pour féliciter. Les classes sont celles de `mascotte.css`, déjà en
place : l'entrée, la bulle, les éclats et le hochement existent déjà.

La moitié haute du cadre n'est pas rognée par le disque : le chignon et le
bonnet dépassent, ce qui donne du relief à un avatar rond.
"""
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "src" / "assets" / "mascotte"
SORTIE.mkdir(parents=True, exist_ok=True)

ENTIERE = "/mascotte/infirmiere.webp"
VISAGE = "/mascotte/infirmiere-visage.webp"

# Le détourage du cadre : tout le haut passe, le bas suit le disque.
CLIP_POSE = "M0 0H200V118H194A94 94 0 0 1 6 118H0Z"
CLIP_VISAGE = "M26 10H174V96H160A60 60 0 0 1 40 96H26Z"

BULLE = (
    '<g class="md-m-bulle"><path class="md-m-rose" d="M22 30H44C51 30 56 35 56 42C56 49 51 54 44 54H42'
    'L56 66L33 54H22C15 54 10 49 10 42C10 35 15 30 22 30Z"/>'
    '<circle class="md-m-point md-m-blanc" cx="21" cy="42" r="3.2"/>'
    '<circle class="md-m-point md-m-point-2 md-m-blanc" cx="33" cy="42" r="3.2"/>'
    '<circle class="md-m-point md-m-point-3 md-m-blanc" cx="45" cy="42" r="3.2"/></g>'
)


def eclat(cx, cy, r, n):
    """Une étincelle à quatre branches."""
    p = (
        f"M{cx} {cy - r}L{cx + r * 0.28:.1f} {cy - r * 0.28:.1f}L{cx + r} {cy}"
        f"L{cx + r * 0.28:.1f} {cy + r * 0.28:.1f}L{cx} {cy + r}"
        f"L{cx - r * 0.28:.1f} {cy + r * 0.28:.1f}L{cx - r} {cy}"
        f"L{cx - r * 0.28:.1f} {cy - r * 0.28:.1f}Z"
    )
    return f'<path class="md-m-eclat md-m-eclat-{n} md-m-rose" d="{p}"/>'


ECLATS = eclat(30, 50, 9, 1) + eclat(172, 44, 12, 2) + eclat(178, 96, 7, 3)


def pose(nom, etiquette, corps_classe, extra=""):
    return (
        f'<svg class="md-mascotte md-mascotte-{nom}" viewBox="0 0 200 220" role="img" '
        f'aria-label="{etiquette}" xmlns="http://www.w3.org/2000/svg">'
        f'<defs><clipPath id="md-m-{nom}-cadre"><path d="{CLIP_POSE}"/></clipPath></defs>'
        f'<circle class="md-m-disque" cx="100" cy="118" r="94"/>'
        f'<g class="md-m-entre"><g clip-path="url(#md-m-{nom}-cadre)">'
        f'<g class="{corps_classe}">'
        f'<image href="{ENTIERE}" x="31" y="16" width="138" height="272" preserveAspectRatio="xMidYMin meet"/>'
        f"</g></g>{extra}</g></svg>"
    )


svgs = {
    "salut": pose(
        "salut",
        "Dambé, l'infirmière de Mousso Dambé, te salue",
        "md-m-balance",
    ),
    "ecoute": pose(
        "ecoute",
        "Dambé, l'infirmière de Mousso Dambé, penche la tête et t'écoute ; elle écrit sa réponse",
        "md-m-penche",
        BULLE,
    ),
    "bravo": pose(
        "bravo",
        "Dambé, l'infirmière de Mousso Dambé, sourit : bravo",
        "md-m-content",
        ECLATS,
    ),
    "visage": (
        '<svg class="md-mascotte-visage" viewBox="26 10 148 148" role="img" '
        "aria-label=\"Dambé, l'infirmière de Mousso Dambé, visage d'IA Dambé\" "
        'xmlns="http://www.w3.org/2000/svg">'
        f'<defs><clipPath id="md-m-visage-cadre"><path d="{CLIP_VISAGE}"/></clipPath></defs>'
        '<circle class="md-m-disque" cx="100" cy="96" r="60"/>'
        '<g clip-path="url(#md-m-visage-cadre)">'
        f'<image href="{VISAGE}" x="46" y="20" width="108" height="123" preserveAspectRatio="xMidYMin meet"/>'
        "</g></svg>"
    ),
}

for nom, contenu in svgs.items():
    (SORTIE / f"mascotte-{nom}.svg").write_text(contenu, encoding="utf-8")
    print(f"mascotte-{nom}.svg  {len(contenu)} octets")
