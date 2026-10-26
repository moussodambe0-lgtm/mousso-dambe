/**
 * Un formulaire ne part qu'une fois.
 *
 * LE JOUR OÙ ÇA S'EST VU. Le 26 octobre 2026, Arthur entre dans l'application
 * depuis son téléphone. La base garde la trace : DEUX comptes anonymes créés à
 * la même seconde, 21:21:55. Il avait appuyé deux fois sur « Commencer », parce
 * qu'en 3G rien ne bouge pendant deux secondes et que c'est ce que tout le
 * monde fait. Son navigateur a gardé le cookie de l'un des deux, au hasard de
 * la course : celui du compte vide. Il remplissait donc le questionnaire, et
 * l'application le renvoyait au prénom, indéfiniment.
 *
 * POURQUOI LE SERVEUR NE PEUT PAS S'EN CHARGER SEUL. `/commencer` vérifie déjà
 * qu'une session n'existe pas avant d'en créer une. Mais deux requêtes parties
 * en même temps n'ont, ni l'une ni l'autre, de cookie à montrer au moment où
 * elles vérifient : chacune croit être la première, et elle l'est. Le défaut
 * n'est pas dans la vérification, il est dans le fait qu'il y ait deux
 * requêtes. C'est donc ici qu'on l'arrête.
 *
 * CE QUE CE SCRIPT NE FAIT PAS. Il n'est pas la protection, il est le confort.
 * Sans JavaScript, le formulaire part normalement, et un double appui crée
 * encore deux comptes : c'est la règle du projet, tout formulaire marche sans
 * script. Les gestes qui touchent à l'argent ou au stock, eux, sont protégés
 * dans la base (voir `empreinte_du_panier`, du 26 octobre 2026). Une identité
 * anonyme en trop ne coûte rien à personne et ne contient rien.
 *
 * Le bouton garde son libellé : on n'écrit pas « Envoi… » à la place de
 * « Commencer ». Un mot qui change sous le doigt fait croire qu'on s'est trompé
 * de bouton. Il perd seulement sa réponse au toucher, le temps que la page
 * suivante arrive.
 */
const MARQUE = 'data-une-fois';

for (const forme of document.querySelectorAll<HTMLFormElement>(`form[${MARQUE}]`)) {
  let parti = false;

  forme.addEventListener('submit', (e) => {
    if (parti) {
      // Deuxième appui : on ne laisse rien partir.
      e.preventDefault();
      return;
    }
    parti = true;

    // Désactiver le bouton MAINTENANT annulerait l'envoi en cours dans
    // plusieurs navigateurs : le champ d'un bouton désactivé n'est pas envoyé.
    // On attend donc que la requête soit partie.
    setTimeout(() => {
      for (const bouton of forme.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])')) {
        bouton.disabled = true;
        bouton.setAttribute('aria-busy', 'true');
      }
    }, 0);
  });
}
