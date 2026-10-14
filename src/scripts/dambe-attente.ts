/**
 * Le temps que Dambé réfléchisse.
 *
 * Arthur, le 14 octobre 2026 : « quand on envoie un message, ça doit partir,
 * et ensuite la tête de la mascotte apparaît comme si elle réfléchit, et enfin
 * elle répond ».
 *
 * CE QUI SE PASSAIT AVANT : la page est un formulaire ordinaire, donc envoyer
 * une question partait en POST et l'écran ne bougeait plus pendant les trois
 * secondes du modèle. Rien ne disait que c'était parti ; sur une connexion
 * lente, on appuyait deux fois.
 *
 * CE QUE FAIT CE FICHIER : au moment de l'envoi, il pose tout de suite la
 * question dans le fil et le dessin « Dambé réfléchit » juste en dessous, puis
 * il LAISSE le formulaire partir normalement. La page revient ensuite avec la
 * vraie réponse, écrite par le serveur, et remplace tout ça.
 *
 * Ce n'est donc pas un faux affichage qu'il faudrait réconcilier avec la
 * suite : c'est le même écran, montré trois secondes plus tôt.
 *
 * Sans JavaScript, rien de tout ça n'arrive et l'envoi marche comme avant.
 */
const formulaire = document.querySelector<HTMLFormElement>('form.saisie');
const modele = document.querySelector<HTMLTemplateElement>('#modele-attente');
const principal = document.querySelector<HTMLElement>('main.page');

if (formulaire && modele && principal) {
  formulaire.addEventListener('submit', () => {
    const champ = formulaire.querySelector<HTMLInputElement>('#question');
    const question = champ?.value.trim() ?? '';
    // Le navigateur refuse déjà d'envoyer un champ vide (`required`) : s'il
    // l'est quand même, on ne montre rien et on le laisse faire son travail.
    if (!question) return;

    // Le fil n'existe pas encore à la toute première question : l'écran
    // d'accueil (« Pose ta question ») prend sa place. On l'enlève et on crée
    // le fil, exactement comme le serveur l'aurait fait.
    let fil = principal.querySelector<HTMLElement>('.fil');
    if (!fil) {
      principal.querySelector('.accueil-dambe')?.remove();
      principal.querySelector('.suggestions')?.remove();
      fil = document.createElement('div');
      fil.className = 'fil';
      principal.prepend(fil);
    }

    const morceau = modele.content.cloneNode(true) as DocumentFragment;
    const bulle = morceau.querySelector('.bulle-moi');
    // `textContent`, jamais `innerHTML` : ce qu'elle a écrit est du texte, et
    // doit le rester même si elle tape des chevrons.
    if (bulle) bulle.textContent = question;
    fil.append(morceau);

    // Le bouton d'envoi se ferme : le formulaire est déjà parti, un deuxième
    // appui enverrait la même question une seconde fois.
    const envoyer = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (envoyer) envoyer.disabled = true;
    if (champ) champ.readOnly = true;

    // Et on descend voir ce qui vient d'apparaître.
    document.querySelector('#fin')?.scrollIntoView({ block: 'end' });
  });
}

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
