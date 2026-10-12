/**
 * La configuration est-elle celle d'une vraie mise en ligne ?
 *
 * Deux accidents à rendre impossibles le jour du déploiement :
 *
 *   1. Recopier la clé du banc local dans les variables de l'hébergeur. Le faux
 *      Supabase local affiche « À mettre dans .env : MD_CLE_SERVEUR=… » et cette
 *      valeur est écrite en clair dans outils/banc-local/serveur.mjs, donc
 *      lisible par quiconque a le code. En production, elle ne prouverait plus
 *      rien : n'importe qui pourrait appeler la base en se faisant passer pour
 *      le site.
 *   2. Laisser une adresse Supabase en http://. Tout partirait en clair : les
 *      notes du journal, le jeton de session, la clé du serveur. Le module
 *      Ollama exige déjà HTTPS hors de la machine locale ; il n'y a aucune
 *      raison d'être plus laxiste avec la base.
 *
 * Module pur, testé par supabase/tests/cache.test.mjs. Il ne lit pas
 * l'environnement lui-même : on lui passe les valeurs, pour qu'un test puisse
 * les inventer sans toucher au vrai .env.
 */

/** La clé écrite en clair dans le banc local. Jamais en production. */
export const CLE_DU_BANC_LOCAL = 'cle-du-banc-local-mousso-dambe';

export interface ReglagesSite {
  urlSupabase: string;
  cleServeur: string | undefined;
  production: boolean;
}

/**
 * Renvoie null si tout va bien, sinon la phrase à afficher. En développement,
 * on ne bloque rien : le banc local tourne en http et c'est normal.
 */
export function defautDeConfiguration(r: ReglagesSite): string | null {
  if (!r.production) return null;

  const url = (r.urlSupabase ?? '').trim();
  if (!url) {
    return "L'adresse de la base de données manque dans les réglages du site.";
  }
  if (!url.toLowerCase().startsWith('https://')) {
    return "L'adresse de la base de données doit être en https. En http, tout ce qu'une utilisatrice écrit circulerait en clair.";
  }

  const cle = (r.cleServeur ?? '').trim();
  if (!cle) {
    return "La clé du serveur manque dans les réglages du site. Sans elle, la base ne peut pas reconnaître les appels du site.";
  }
  if (cle === CLE_DU_BANC_LOCAL) {
    return "La clé du serveur est celle du banc d'essai local, qui est publiée dans le code. Il faut une clé choisie au hasard, connue du site seul.";
  }
  if (cle.length < 24) {
    return 'La clé du serveur est trop courte pour être devinée difficilement : il en faut au moins 24 caractères.';
  }
  return null;
}
