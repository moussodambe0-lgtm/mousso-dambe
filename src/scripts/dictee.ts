/**
 * LA DICTÉE : elle parle, le téléphone écrit.
 *
 * Décision d'Arthur du 13 octobre 2026. IA Dambé lit du texte et n'entend
 * rien : le micro ne lui envoie donc pas un vocal, il écrit les mots dans la
 * case, qu'elle relit avant d'envoyer. Elle garde la main sur ce qui part.
 *
 * CE QUI SORT DU TÉLÉPHONE, ET QU'IL FAUT DIRE HONNÊTEMENT : la reconnaissance
 * n'est pas faite ici, elle est faite par le navigateur, qui sur Android passe
 * par Google. C'est exactement ce que fait déjà la touche micro de son clavier.
 * Nous, nous ne gardons aucun son : rien n'est enregistré, rien n'est envoyé à
 * notre serveur, seul le texte final part avec le formulaire.
 *
 * LE FRANÇAIS SEULEMENT. Le moré et le dioula ne sont pas reconnus. Celle qui
 * parle moré doit pouvoir faire autrement : c'est pour elle que le vocal, le
 * vrai, existe dans la discussion avec le médecin, où un humain écoute.
 *
 * LE BOUTON ARRIVE CACHÉ. Le serveur ne sait pas si le navigateur sait écouter
 * (Firefox ne sait pas). Il part donc avec `hidden`, et seul ce fichier le
 * montre, une fois sûr. Un bouton qui ne marche pas est pire que pas de bouton.
 */
type Reco = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

const fenetre = window as any;
const Moteur = fenetre.SpeechRecognition ?? fenetre.webkitSpeechRecognition;

const bouton = document.querySelector<HTMLButtonElement>('.dictee');
const champ = document.querySelector<HTMLInputElement>('#question');
const mot = document.querySelector<HTMLElement>('.dictee-dit');

if (Moteur && bouton && champ && mot) {
  bouton.hidden = false;

  const reco: Reco = new Moteur();
  reco.lang = 'fr-FR';
  // Elle parle jusqu'à ce qu'elle retouche le bouton : une question se dit
  // rarement d'un seul souffle, et s'arrêter à la première respiration donne
  // l'impression que le micro n'a pas marché.
  reco.continuous = true;
  // Les mots s'affichent pendant qu'elle parle. Sans cela, elle parle dans le
  // vide pendant dix secondes sans savoir si on l'entend.
  reco.interimResults = true;

  let ecoute = false;
  // Ce qu'il y avait déjà dans la case quand elle a appuyé : la dictée
  // s'ajoute à son texte, elle ne l'efface pas.
  let depart = '';
  // Ce qui est acquis, par opposition à ce que le moteur est en train de
  // corriger pendant qu'elle parle.
  let acquis = '';

  const dire = (texte: string) => {
    mot.textContent = texte;
    mot.hidden = texte === '';
  };

  const etat = (enCours: boolean) => {
    ecoute = enCours;
    bouton.classList.toggle('dictee-ecoute', enCours);
    bouton.setAttribute('aria-pressed', String(enCours));
    bouton.setAttribute('aria-label', enCours ? 'Arrêter de dicter' : 'Dicter ma question');
  };

  reco.onstart = () => {
    etat(true);
    dire('Je t’écoute…');
  };

  reco.onresult = (e: any) => {
    let enCours = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const bout = e.results[i][0].transcript;
      if (e.results[i].isFinal) acquis += bout;
      else enCours += bout;
    }
    const tout = (depart + acquis + enCours).replace(/\s+/g, ' ').trimStart();
    // `maxlength` ne retient pas ce que le script écrit : on coupe nous-mêmes,
    // sinon le serveur reçoit plus long que ce que le champ annonce.
    champ.value = tout.slice(0, 500);
    if (enCours) dire(enCours.trim());
  };

  reco.onerror = (e: any) => {
    etat(false);
    const quoi = e?.error;
    if (quoi === 'not-allowed' || quoi === 'service-not-allowed') {
      dire('Le micro est refusé. Autorise-le dans les réglages du navigateur.');
    } else if (quoi === 'no-speech') {
      dire("Je n'ai rien entendu. Réessaie en parlant plus près.");
    } else if (quoi === 'network') {
      dire('La connexion est trop faible pour écouter. Écris ta question.');
    } else if (quoi === 'aborted') {
      dire('');
    } else {
      dire("Ça n'a pas marché. Écris ta question.");
    }
  };

  reco.onend = () => {
    // Le moteur s'arrête parfois tout seul, même en `continuous`. On ne le
    // relance pas : relancer un micro sans qu'elle l'ait demandé, ce n'est pas
    // un service.
    etat(false);
    if (mot.textContent === 'Je t’écoute…') dire('');
  };

  bouton.addEventListener('click', () => {
    if (ecoute) {
      reco.stop();
      return;
    }
    depart = champ.value ? champ.value.trimEnd() + ' ' : '';
    acquis = '';
    dire('');
    try {
      reco.start();
    } catch {
      // Déjà démarré : le moteur refuse un second départ. Rien à signaler.
    }
  });

  // En envoyant, on coupe le micro : sinon il continue d'écrire dans une case
  // que la page est en train de quitter.
  champ.form?.addEventListener('submit', () => {
    if (ecoute) reco.abort();
  });
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
