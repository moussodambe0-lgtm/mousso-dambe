/**
 * Le mot cherché dans la boutique, rendu inoffensif pour le filtre de la base.
 *
 * PostgREST lit ses filtres comme du texte : `or(nom.ilike.%mot%,resume.ilike.%mot%)`.
 * Une virgule, un point ou une parenthèse glissés dans le mot cherché changent
 * la structure du filtre. Les valeurs qui contiennent des caractères réservés
 * doivent être entre guillemets, et les guillemets échappés.
 *
 * Module pur, testé par supabase/tests/cache.test.mjs.
 */

/** Ce qui reste d'un mot cherché : des lettres, des chiffres, des espaces. */
export function motCherche(brut: string | null | undefined): string {
  return (brut ?? '')
    // Les caractères qui servent de ponctuation à PostgREST, et ceux qui
    // servent de jokers à « like ». Retirés, pas échappés : personne ne cherche
    // une serviette en tapant une parenthèse.
    .replace(/["'\\(),.*%_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Le filtre « ou » tel qu'il est envoyé à la base, une fois le mot nettoyé.
 *
 * Le mot passé ici est déjà passé par motCherche() : il ne contient plus aucun
 * des caractères qui servent de ponctuation à PostgREST, donc il ne peut plus
 * changer la structure du filtre. On n'entoure PAS la valeur de guillemets : ce
 * serait la forme la plus propre, mais le faux Supabase du banc local ne les
 * retire pas dans un filtre « ou », et la recherche ne trouverait plus rien en
 * démonstration. Une protection qui casse l'écran se fait désactiver.
 */
export function filtreRecherche(mot: string): string {
  return `nom.ilike.%${mot}%,resume.ilike.%${mot}%`;
}
