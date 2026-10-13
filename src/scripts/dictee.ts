/**
 * LA DICTÉE : elle parle, le téléphone écrit.
 *
 * Décision d'Arthur du 13 octobre 2026. IA Dambé lit du texte et n'entend
 * rien : le micro ne lui envoie donc pas un vocal, il écrit les mots dans la
 * case, qu'elle relit avant d'envoyer. Elle garde la main sur ce qui part.
 * Le même micro sert la RECHERCHE de l'accueil (« je veux une barre de
 * recherche avec un micro, c'est-à-dire la possibilité de faire une recherche
 * par audio »), où il lance la recherche dès qu'elle a fini de parler.
 *
 * COMMENT ON LE BRANCHE. Un bouton porte `data-dictee`, et dit où écrire :
 *   data-cible="#id"      la case de texte à remplir ;
 *   data-dit=".classe"    la ligne qui dit ce que le micro entend ;
 *   data-envoyer="oui"    envoyer le formulaire quand elle a fini de parler
 *                         (la recherche) ; sinon elle relit et envoie elle-même
 *                         (la question à Dambé).
 *
 * CE QUI SORT DU TÉLÉPHONE, ET QU'IL FAUT DIRE HONNÊTEMENT : la reconnaissance
 * n'est pas faite ici, elle est faite par le navigateur, qui sur Android passe
 * par Google. C'est exactement ce que fait déjà la touche micro de son clavier.
 * Nous, nous ne gardons aucun son : rien n'est enregistré, rien n'est envoyé à
 * notre serveur, seul le texte final part avec le formulaire.
 *
 * LE FRANÇAIS SEULEMENT. Le moré et le dioula ne sont pas reconnus. Celle qui
 * parle moré doit pouvoir faire autrement : c'est pour elle que le vrai vocal
 * existe dans la discussion avec le médecin et avec la boutique, où un humain
 * écoute.
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

function installer(bouton: HTMLButtonElement) {
  const champ = document.querySelector<HTMLInputElement>(bouton.dataset.cible ?? '');
  const mot = document.querySelector<HTMLElement>(bouton.dataset.dit ?? '');
  if (!champ || !mot) return;

  const envoyer = bouton.dataset.envoyer === 'oui';
  const libelleRepos = bouton.getAttribute('aria-label') ?? 'Dicter';
  const longueurMax = champ.maxLength > 0 ? champ.maxLength : 500;

  bouton.hidden = false;

  const reco: Reco = new Moteur();
  reco.lang = 'fr-FR';
  // Pour une question, elle parle jusqu'à ce qu'elle retouche le bouton : une
  // question se dit rarement d'un seul souffle. Pour une recherche, on s'arrête
  // à la première phrase : c'est un mot ou deux.
  reco.continuous = !envoyer;
  // Les mots s'affichent pendant qu'elle parle. Sans cela, elle parle dans le
  // vide pendant dix secondes sans savoir si on l'entend.
  reco.interimResults = true;

  let ecoute = false;
  // Ce qu'il y avait déjà dans la case quand elle a appuyé : la dictée
  // s'ajoute à son texte, elle ne l'efface pas (sauf pour une recherche, où
  // on repart de zéro).
  let depart = '';
  let acquis = '';
  let envoye = false;

  const dire = (texte: string) => {
    mot.textContent = texte;
    mot.hidden = texte === '';
  };

  const etat = (enCours: boolean) => {
    ecoute = enCours;
    bouton.classList.toggle('dictee-ecoute', enCours);
    bouton.setAttribute('aria-pressed', String(enCours));
    bouton.setAttribute('aria-label', enCours ? 'Arrêter le micro' : libelleRepos);
  };

  reco.onstart = () => {
    etat(true);
    dire('Je t’écoute…');
  };

  reco.onresult = (e: any) => {
    let enCours = '';
    let fini = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const bout = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        acquis += bout;
        fini = true;
      } else enCours += bout;
    }
    const tout = (depart + acquis + enCours).replace(/\s+/g, ' ').trimStart();
    // `maxlength` ne retient pas ce que le script écrit : on coupe nous-mêmes,
    // sinon le serveur reçoit plus long que ce que le champ annonce.
    champ.value = tout.slice(0, longueurMax);
    if (enCours) dire(enCours.trim());

    // La recherche part toute seule dès que la phrase est finie.
    if (envoyer && fini && champ.value.trim() !== '' && !envoye) {
      envoye = true;
      dire('Je cherche…');
      reco.stop();
      window.setTimeout(() => champ.form?.requestSubmit(), 150);
    }
  };

  reco.onerror = (e: any) => {
    etat(false);
    const quoi = e?.error;
    if (quoi === 'not-allowed' || quoi === 'service-not-allowed') {
      dire('Le micro est refusé. Autorise-le dans les réglages du navigateur.');
    } else if (quoi === 'no-speech') {
      dire("Je n'ai rien entendu. Réessaie en parlant plus près.");
    } else if (quoi === 'network') {
      dire('La connexion est trop faible pour écouter. Écris ce que tu cherches.');
    } else if (quoi === 'aborted') {
      dire('');
    } else {
      dire("Ça n'a pas marché. Écris-le à la place.");
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
    depart = !envoyer && champ.value ? champ.value.trimEnd() + ' ' : '';
    if (envoyer) champ.value = '';
    acquis = '';
    envoye = false;
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

if (Moteur) {
  document.querySelectorAll<HTMLButtonElement>('[data-dictee]').forEach(installer);
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
