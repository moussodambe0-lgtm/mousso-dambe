/**
 * FAUX OLLAMA : pour essayer Dambé sans clé et sans dépenser un jeton.
 *
 * Il parle comme Ollama (`POST /api/chat`) et renvoie une réponse écrite
 * d'avance. Ce qu'il permet de vérifier, et qu'aucun test de base de données
 * ne couvre : que la question part avec les bonnes consignes, que la réponse
 * est nettoyée, que le produit proposé est relu dans le catalogue, et que
 * l'écran affiche le tout.
 *
 * Il sert aussi à voir ce qui part vraiment : lancé avec MONTRER=1, il écrit
 * le contexte envoyé, ce qui permet de vérifier de ses yeux qu'aucun journal
 * intime ne traverse.
 *
 *   node outils/banc-local/faux-ollama.mjs
 *   puis dans .env : OLLAMA_URL=http://127.0.0.1:11435
 *
 * À ne jamais confondre avec le vrai service : il n'y a aucune intelligence
 * là-dedans, seulement des réponses figées.
 */
import { createServer } from 'node:http';

const PORT = 11435;

const REPONSES = [
  {
    quand: /mal|douleur|ventre|crampe/i,
    texte: `Des douleurs pendant les règles, c'est courant : l'utérus se contracte pour évacuer. Trois choses qui soulagent vraiment, et qui ne coûtent rien :
- Une bouteille d'eau chaude sur le bas du ventre, 15 minutes.
- Marcher un peu, même dix minutes dans la cour.
- Boire chaud, et dormir assez les jours d'avant.

Si la douleur t'empêche d'aller en cours ou au travail, va voir une sage-femme. Ce n'est pas à endurer.
PRODUIT: serviettes-nuit-10`,
  },
  {
    quand: /nuit|dormir|fuite|abondant/i,
    texte: `Pour la nuit, prends une protection plus longue à l'arrière : c'est là que ça fuit quand tu bouges en dormant.

Si tu changes souvent, une culotte menstruelle tient douze heures et t'évite de te lever.
PRODUIT: culotte-flux-abondant`,
  },
  {
    quand: /laver|lavable|culotte|entretien/i,
    texte: `Tu la rinces à l'eau froide juste après, jamais à l'eau chaude : le chaud fixe le sang dans le tissu.

Ensuite tu la laves au savon ordinaire, à la main, et tu la fais sécher à l'ombre. Elle tient deux ans comme ça.`,
  },
];

const PAR_DEFAUT = `Je te réponds sur ce que je connais : tes règles, ton corps, l'hygiène et les protections. Pose-moi ta question autrement, ou dis-moi simplement ce que tu ressens en ce moment.`;

createServer(async (requete, reponse) => {
  if (requete.method !== 'POST' || !requete.url.startsWith('/api/chat')) {
    reponse.writeHead(404).end('{}');
    return;
  }

  const bouts = [];
  for await (const bout of requete) bouts.push(bout);
  const corps = JSON.parse(Buffer.concat(bouts).toString('utf8'));
  const derniere = corps.messages?.[corps.messages.length - 1]?.content ?? '';
  const consignes = corps.messages?.[0]?.content ?? '';

  if (process.env.MONTRER) {
    console.log('\n--- ce que le site a envoyé ---');
    console.log(consignes);
    console.log('--- la question ---');
    console.log(derniere);
    console.log('-------------------------------\n');
  } else {
    console.log(`question reçue (${derniere.length} caractères), contexte de ${consignes.length} caractères`);
  }

  const trouvee = REPONSES.find((r) => r.quand.test(derniere));

  // Un vrai modèle met plusieurs secondes : on imite l'attente, sinon on ne
  // verrait jamais l'écran « Dambé réfléchit ».
  await new Promise((r) => setTimeout(r, 900));

  reponse.writeHead(200, { 'content-type': 'application/json' });
  reponse.end(
    JSON.stringify({
      model: corps.model,
      message: { role: 'assistant', content: trouvee ? trouvee.texte : PAR_DEFAUT },
      done: true,
      prompt_eval_count: Math.round(consignes.length / 4),
      eval_count: Math.round((trouvee?.texte.length ?? PAR_DEFAUT.length) / 4),
    })
  );
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Faux Ollama prêt sur http://127.0.0.1:${PORT}`);
  console.log(`Dans .env : OLLAMA_URL=http://127.0.0.1:${PORT}`);
  console.log(`Avec MONTRER=1, il écrit tout ce que le site lui envoie.\n`);
});
