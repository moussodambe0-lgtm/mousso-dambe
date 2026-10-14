/**
 * Parler à Dambé sans que la page se recharge.
 *
 * Arthur, le 14 octobre 2026 : « à chaque fois que j'envoie un message à IA
 * Dambé, la page se recharge et revient sur la même page avec la réponse ».
 * C'était vrai : la page est un formulaire ordinaire, le serveur répondait par
 * une redirection vers `/dambe`, et le navigateur rechargeait tout. L'écran
 * blanchissait, le défilement sautait, et sur une connexion lente ça donnait
 * l'impression d'avoir perdu la conversation.
 *
 * CE QUE FAIT CE FICHIER, dans l'ordre :
 *   1. il pose tout de suite la question dans le fil, avec le dessin
 *      « Dambé réfléchit » en dessous (demande du 14 octobre aussi) ;
 *   2. il envoie le formulaire LUI-MÊME, en arrière-plan ;
 *   3. il ne remplace QUE la conversation, par celle que le serveur vient
 *      d'écrire. Le reste de la page ne bouge pas.
 *
 * Ce n'est donc pas un faux affichage à réconcilier plus tard : le contenu
 * final vient du serveur, exactement comme avant, mais sans recharger.
 *
 * Si quoi que ce soit échoue (réseau coupé, session expirée, page inattendue),
 * on retombe sur une vraie navigation : le formulaire part comme avant. Et
 * sans JavaScript, rien de tout ceci ne s'exécute, l'envoi marche quand même.
 */
const formulaire = document.querySelector<HTMLFormElement>('form.saisie');
const modele = document.querySelector<HTMLTemplateElement>('#modele-attente');
const principal = document.querySelector<HTMLElement>('main.page');

/**
 * Descendre voir ce qui vient d'arriver.
 *
 * Arthur, le 14 octobre 2026 : « quand j'envoie le message [...] il apparaît
 * totalement en bas et je suis obligé de descendre pour voir ». Deux raisons,
 * et les deux sont traitées ici :
 *
 *   - `scrollIntoView` visait un repère placé AVANT la case où elle écrit, qui
 *     est fixée au-dessus du contenu : le dernier message se retrouvait caché
 *     dessous. On descend donc tout en bas de la page, pas jusqu'à un repère.
 *   - le défilement partait avant que le navigateur ait dessiné ce qu'on
 *     venait d'ajouter, donc il s'arrêtait à l'ancienne hauteur. On le relance
 *     une fois la page redessinée.
 */
function versLeBas(): void {
  const descendre = () => window.scrollTo({ top: document.documentElement.scrollHeight });
  descendre();
  requestAnimationFrame(descendre);
}

if (formulaire && modele && principal) {
  formulaire.addEventListener('submit', (evenement) => {
    const champ = formulaire.querySelector<HTMLInputElement>('#question');
    const question = champ?.value.trim() ?? '';
    // Le navigateur refuse déjà d'envoyer un champ vide (`required`) : s'il
    // l'est quand même, on le laisse faire son travail.
    if (!question) return;

    evenement.preventDefault();

    // --- 1. Sa question, et le dessin qui réfléchit ------------------------
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
    // `textContent`, jamais `innerHTML` : ce qu'elle a écrit est du texte et
    // doit le rester, même si elle tape des chevrons.
    if (bulle) bulle.textContent = question;
    fil.append(morceau);

    const envoyer = formulaire.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (envoyer) envoyer.disabled = true;
    if (champ) champ.readOnly = true;
    versLeBas();

    // --- 2. L'envoi, en arrière-plan ---------------------------------------
    const donnees = new FormData(formulaire);

    void (async () => {
      try {
        const reponse = await fetch(formulaire.action || location.pathname, {
          method: 'POST',
          body: new URLSearchParams(donnees as unknown as Record<string, string>),
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          credentials: 'same-origin',
          // Le serveur répond par une redirection vers /dambe : on la suit, et
          // on récupère la page déjà écrite, avec la réponse dedans.
          redirect: 'follow',
        });

        if (!reponse.ok) {
          formulaire.submit();
          return;
        }

        // Une redirection vers la connexion : la session a expiré pendant
        // qu'elle écrivait. On laisse le navigateur l'emmener où il faut.
        const arrivee = new URL(reponse.url, location.origin);
        if (!arrivee.pathname.startsWith('/dambe')) {
          location.href = reponse.url;
          return;
        }

        const doc = new DOMParser().parseFromString(await reponse.text(), 'text/html');
        const neuf = doc.querySelector('main.page');
        if (!neuf) {
          formulaire.submit();
          return;
        }

        // --- 3. On ne remplace QUE la conversation --------------------------
        // Tout vient du serveur : les bulles, la réponse, le produit proposé,
        // et le message d'erreur s'il y en a un.
        principal.innerHTML = neuf.innerHTML;
      } catch {
        // Réseau coupé en cours de route : le formulaire part pour de vrai,
        // et elle verra ce que le navigateur sait dire.
        formulaire.submit();
        return;
      }

      if (champ) {
        champ.readOnly = false;
        champ.value = '';
      }
      if (envoyer) envoyer.disabled = false;
      versLeBas();
    })();
  });
}

// Un témoin « le script est passé », pour les essais : sans lui, un essai qui
// regarde la page avant que Vite ait fini de compiler croit à une panne.
document.documentElement.dataset.dambe = 'pret';

// Ce fichier est un module : sans cette ligne, TypeScript le traite comme un
// script global, et deux fichiers qui nomment la même constante se heurtent.
export {};
