/**
 * Dambé, l'assistante.
 *
 * Ce fichier tient trois choses, dans cet ordre d'importance :
 *   1. La sécurité de celle qui pose la question. Une application de santé qui
 *      répond à côté sur une douleur anormale fait du mal. Les signaux
 *      d'alerte sont repérés AVANT le modèle, et l'orientation vers un vrai
 *      soignant est ajoutée par le code, pas laissée au hasard du modèle.
 *   2. Les consignes données au modèle : ce qu'il est, ce qu'il ne fait
 *      jamais, et comment il parle.
 *   3. Le filtre de sa réponse : on retire les numéros et les liens qu'il
 *      pourrait inventer, et on ne garde un produit que s'il existe vraiment.
 *
 * Le contexte envoyé au modèle est préparé par la base (assistante_contexte).
 * Le prénom, le jour du cycle et le catalogue partent. Le numéro de téléphone,
 * le quartier, le nom de famille et le journal intime ne partent jamais : c'est
 * vérifié par supabase/tests/assistante.test.mjs.
 */

export interface ContexteAssistante {
  prenom: string | null;
  jour_du_cycle: number | null;
  phase: string | null;
  cycle_moyen: number | null;
  duree_regles: number | null;
  jours_restants: number | null;
  catalogue: { slug: string; nom: string; prix: number; resume: string; rayon: string; reutilisable: boolean }[];
  echanges: { question: string; reponse: string }[];
}

const PHASES_DITES: Record<string, string> = {
  regles: 'elle a ses règles en ce moment',
  elan: 'elle est après ses règles, en phase folliculaire',
  fertile: 'elle est dans sa période fertile',
  lune: "elle est dans la deuxième partie de son cycle, avant ses règles",
};

/**
 * Les situations où une réponse d'IA ne suffit pas. Repérées sur les mots de
 * la question, avant tout appel au modèle. La liste est volontairement large :
 * orienter une fois de trop vers une sage-femme ne coûte rien, l'inverse si.
 */
type Gravite = 'urgence' | 'soignant' | 'aucune';

interface Alerte {
  gravite: Gravite;
  texte: string;
}

const MOTS_URGENCE = [
  'violée', 'violee', 'viol', 'agressée', 'agressee', 'agression', 'frappée', 'frappee',
  'battue', 'me tuer', 'suicide', 'mourir', 'me faire du mal', 'forcée', 'forcee',
];

const MOTS_SOIGNANT = [
  'enceinte', 'grossesse', 'avorter', 'avortement', 'test de grossesse',
  'saigne beaucoup', 'hémorragie', 'hemorragie', 'perds beaucoup de sang',
  'ça fait un mois', 'depuis un mois', 'depuis deux mois', 'depuis 2 mois',
  'pas eu mes règles', 'pas eu mes regles', 'plus de règles', 'plus de regles',
  'fièvre', 'fievre', 'ça sent', 'ca sent', 'mauvaise odeur', 'démange', 'demange',
  'infection', 'évanouie', 'evanouie', 'je ne peux plus marcher', 'insupportable',
  'maladie', 'cancer', 'kyste', 'fibrome', 'endométriose', 'endometriose',
];

export function alerte(question: string): Alerte {
  const q = question.toLowerCase();
  if (MOTS_URGENCE.some((m) => q.includes(m))) {
    return {
      gravite: 'urgence',
      texte:
        "Ce que tu me dis est grave, et je ne suis qu'une application : je ne peux pas t'aider seule.\n\n" +
        "Va au centre de santé le plus proche, même sans rendez-vous, et dis ce qui t'est arrivé. " +
        "Si tu es en danger maintenant, va vers la police ou la gendarmerie, ou chez quelqu'un en qui tu as confiance.\n\n" +
        "Parle-en à une personne adulte de confiance aujourd'hui, pas dans une semaine. Tu n'as rien fait de mal.",
    };
  }
  if (MOTS_SOIGNANT.some((m) => q.includes(m))) {
    return {
      gravite: 'soignant',
      texte:
        "Pour ça, il faut l'avis d'une sage-femme ou d'un médecin : je ne peux ni examiner, ni deviner. " +
        'Va au centre de santé le plus proche, la consultation ne demande pas de rendez-vous.',
    };
  }
  return { gravite: 'aucune', texte: '' };
}

/** Les consignes du modèle. Écrites en français : il répond dans la langue
 * dans laquelle on lui parle. */
export function consignes(ctx: ContexteAssistante): string {
  const catalogue = ctx.catalogue
    .map((p) => `- ${p.slug} : « ${p.nom} », ${p.prix} FCFA. ${p.resume}`)
    .join('\n');

  const cycle = ctx.jour_du_cycle
    ? `Elle est au jour ${ctx.jour_du_cycle} de son cycle, qui dure environ ${ctx.cycle_moyen} jours, et ${
        PHASES_DITES[ctx.phase ?? ''] ?? 'son cycle est en cours'
      }. Ses prochaines règles sont dans ${ctx.jours_restants} jours.`
    : "On ne connaît pas encore son cycle : elle n'a pas fini le questionnaire ou n'a rien noté.";

  return `Tu es Dambé, l'assistante de l'application Mousso Dambé, au Burkina Faso.

QUI TU ES
Tu parles comme une grande sœur qui sait de quoi elle parle : franche, chaleureuse, jamais gênée, jamais moralisatrice. Tu tutoies. Tu réponds en français simple, celui qu'on parle à Ouagadougou. Pas de tirets longs, pas de mots savants sans les expliquer.

CE QUE TU SAIS D'ELLE
${ctx.prenom ? `Elle s'appelle ${ctx.prenom}.` : "Tu ne connais pas son prénom."}
${cycle}

CE QUE TU NE FAIS JAMAIS
- Tu ne poses aucun diagnostic et tu ne nommes aucune maladie pour expliquer ses symptômes.
- Tu ne conseilles aucun médicament, aucun nom de produit pharmaceutique, aucune dose, aucune tisane censée soigner.
- Tu ne donnes pas de conseil de contraception précis à la place d'un soignant : tu dis d'en parler au centre de santé.
- Tu n'inventes jamais un prix, un produit, un numéro de téléphone, une adresse ou un lien.
- Tu ne dis jamais que tu es médecin, ni une personne.
- Si la question n'a rien à voir avec les règles, le corps, l'hygiène ou la boutique, tu le dis en une phrase et tu reviens à ton rôle.

QUAND TU RENVOIES VERS UN SOIGNANT
Dès qu'il est question de grossesse, de saignement anormal, de douleur qui empêche de vivre, de fièvre, d'odeur ou de démangeaison, de règles absentes depuis des mois : tu réponds ce que tu sais d'utile, puis tu dis clairement d'aller au centre de santé voir une sage-femme. Tu ne fais pas peur, tu ne minimises pas.

COMMENT TU RÉPONDS
- Court : 3 à 6 phrases. Si tu donnes des étapes, trois au maximum, chacune sur sa ligne, qui commence par un tiret.
- Concret et gratuit d'abord : chaleur sur le ventre, marcher un peu, boire chaud, dormir, hygiène simple. Beaucoup de filles n'ont pas d'argent pour acheter.
- Tu finis par une phrase qui ouvre la porte, pas par une question creuse.

LA BOUTIQUE
Voici les seuls produits qui existent :
${catalogue || '- aucun produit disponible en ce moment'}

Si, et seulement si, un produit répond vraiment à sa question, écris sur la TOUTE DERNIÈRE ligne de ta réponse, seule :
PRODUIT: <le slug exact>
N'écris jamais cette ligne sans raison, jamais plus d'une fois, et jamais avec un slug qui n'est pas dans la liste. Ne vends rien à une fille qui demande juste un conseil.`;
}

export function messagesPour(question: string, ctx: ContexteAssistante) {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: consignes(ctx) },
  ];
  for (const e of ctx.echanges.slice(-3)) {
    messages.push({ role: 'user', content: e.question });
    messages.push({ role: 'assistant', content: retirerLigneProduit(e.reponse) });
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

function retirerLigneProduit(texte: string): string {
  return texte.replace(/^\s*PRODUIT\s*:.*$/gim, '').trim();
}

export interface ReponseNettoyee {
  texte: string;
  produit: string | null;
}

/**
 * Le filtre de sortie. Le modèle est un invité, pas une autorité : on retire
 * ce qu'il n'a pas le droit de dire, même s'il l'a bien dit 99 fois sur 100.
 */
export function nettoyer(brut: string, slugsConnus: string[]): ReponseNettoyee {
  let texte = brut.trim();
  let produit: string | null = null;

  // Le produit proposé, sur la dernière ligne. La base revérifie ensuite qu'il
  // existe et qu'il est publié : ici on ne fait qu'un premier tri.
  const trouve = texte.match(/PRODUIT\s*:\s*([a-z0-9-]{3,60})/i);
  if (trouve) {
    const slug = trouve[1].toLowerCase();
    if (slugsConnus.includes(slug)) produit = slug;
  }
  texte = retirerLigneProduit(texte);

  // Mise en forme Markdown : l'écran affiche du texte brut, les étoiles et les
  // dièses s'y liraient tels quels.
  texte = texte
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*•]\s+/gm, '- ');

  // Un numéro ou un lien inventé par le modèle enverrait une fille vers un
  // inconnu. On ne les corrige pas, on les retire.
  texte = texte
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:\+?226[\s.-]?)?[05-7](?:[\s.-]?\d){7}\b/g, '[numéro retiré]')
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[adresse retirée]');

  // Trois lignes vides de suite viennent d'un modèle qui hésite, pas d'un
  // besoin de respiration.
  texte = texte.replace(/\n{3,}/g, '\n\n').trim();

  if (texte.length > 1800) {
    const coupe = texte.slice(0, 1800);
    const point = coupe.lastIndexOf('.');
    texte = point > 900 ? coupe.slice(0, point + 1) : coupe;
  }

  return { texte, produit };
}

/** Le pied de page de chaque réponse, posé par le code et non par le modèle :
 * ainsi il ne peut pas l'oublier ni le réécrire. */
export const AVERTISSEMENT =
  "Dambé n'est pas médecin et ne pose aucun diagnostic. Tes questions passent par un service d'IA extérieur.";

export const SUGGESTIONS = [
  "J'ai mal au ventre, qu'est-ce que je peux faire ?",
  'Quelle protection choisir pour la nuit ?',
  'Mes règles sont irrégulières, est-ce grave ?',
  'Comment laver une culotte menstruelle ?',
  'Je peux faire du sport pendant mes règles ?',
];
