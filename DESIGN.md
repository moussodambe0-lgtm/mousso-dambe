# Mousso Dambé : direction visuelle

Application mobile (PWA) pour les femmes et les jeunes filles du Burkina :
suivre son cycle, acheter serviettes et culottes menstruelles, poser ses
questions à une assistante. « Mousso Dambé » : la dignité de la femme, en
dioula et en bambara.

Demande d'Arthur (12 octobre 2026) : rose, blanc, noir. Surtout le rose et le
blanc. Quelques animations, à l'accueil notamment. « Quelque chose de très bon. »

## Le ton

Franc, chaleureux, jamais gnangnan ni médical. Une grande sœur qui sait de quoi
elle parle. On tutoie. On dit « règles », pas « menstrues » ni « ces jours-là ».
Aucune honte, aucun rose bonbon infantile : un rose vif, assumé, posé sur du
blanc, tenu par du noir.

## Couleurs

| Jeton | Valeur | Usage |
|---|---|---|
| `--fond` | `#FFF6F9` | Fond de page (blanc rosé) |
| `--surface` | `#FFFFFF` | Cartes, champs, feuilles |
| `--surface-douce` | `#FFEEF4` | Zones d'appui, lignes |
| `--bordure` | `#F6D9E4` | Toutes les bordures |
| `--encre` | `#1B1116` | Texte principal, barre de navigation, boutons sombres (le « noir ») |
| `--texte-2` | `#6B5560` | Texte de second plan |
| `--texte-3` | `#8C7480` | Libellés discrets (jamais sous 14 px) |
| `--rose` | `#D0206A` | **Action principale et règles** : boutons, jours de règles, état actif |
| `--rose-fonce` | `#9C1450` | Appui, texte sur rose clair |
| `--rose-clair` | `#FFDCE9` | Fonds d'accent, règles prévues |
| `--violet` | `#6A3FC9` | **Fertilité seulement** : période fertile, ovulation |
| `--violet-clair` | `#ECE5FB` | Fond de la période fertile |
| `--vert` | `#17794A` | Confirmation (commande passée, enregistré) |
| `--ambre` | `#A8590B` | Avertissement, à surveiller |
| `--rouge` | `#B3261E` | Erreur, signe d'alerte de santé |

Règle de lecture : **le rose agit et dit « règles », le violet dit
« fertilité », le noir tient la structure.** Deux couleurs qu'on doit
distinguer diffèrent aussi par la forme (jour plein, anneau, point), jamais par
la teinte seule.

Pas de dégradé décoratif, pas de halo lumineux. Le seul motif autorisé est la
**bande tissée** : de fines rayures franches, clin d'œil au Faso Dan Fani,
utilisées en bandeau ou en fond d'un bloc, jamais partout.

## Typographie

- **Bricolage Grotesque** 600 à 800 : titres, grands chiffres (jour du cycle, prix).
- **Figtree** 400 à 700 : texte, boutons, champs.

Auto-hébergées en WOFF2 dans `public/fonts/`. Jamais de Google Fonts en ligne :
sur 3G, cela coûte plusieurs secondes avant le premier texte lisible.

Échelle : 13 (légende), 15 (texte), 17 (texte fort), 22 (titre), 30 (titre
d'écran), 64 (le chiffre du jour).

## Formes

- Rayons : 14 px (champs, boutons), 20 px (cartes), 28 px (feuilles et bloc du cycle).
- Élévation : bordure fine pour la structure ; une seule ombre douce pour ce qui flotte (barre de navigation, feuille).
- Espacement sur une échelle de 4 : 4, 8, 12, 16, 24, 32, 48.
- Cibles tactiles : 48 px.
- Icônes : trait de 1,75 px, bouts ronds, jamais d'émoji.

## Mouvement

- 150 à 250 ms pour l'interface, `ease-out` à l'entrée.
- Seuls `transform` et `opacity` sont animés.
- Les animations d'ambiance (anneau du cycle qui se dessine, illustration de
  phase) se jouent **une fois** à l'arrivée, puis s'arrêtent. Seul le repère
  « aujourd'hui » respire doucement.
- `prefers-reduced-motion` : tout est posé d'emblée, sans mouvement.

## Les quatre phases du cycle

| Phase | Nom dans l'appli | Couleur | Signe |
|---|---|---|---|
| Règles | « Tes règles » | rose plein | goutte |
| Folliculaire | « Tu reprends de l'élan » | rose clair | pousse |
| Ovulation, période fertile | « Période fertile » | violet | soleil |
| Lutéale | « Ton corps ralentit » | noir doux | lune |

## Contraintes techniques qui pèsent sur le dessin

- Android d'entrée de gamme, 3G, data comptée : 390 px de large en référence,
  peu d'octets, images WebP légères.
- Aucun attribut `style=` en ligne dans le code de l'appli (politique de
  sécurité du contenu). Tout passe par des classes.
