/**
 * LE BOUTON « RETOUR » REVIENT VRAIMENT EN ARRIÈRE.
 *
 * Arthur, le 7 novembre 2026 : « quand je rentre dans un document et que
 * j'appuie retour, ça me mène dans "tous les documents". Ce n'est pas normal.
 * Quand j'appuie retour, ça part dans retour. »
 *
 * Il a raison, et c'est un défaut classique. Un lien de retour écrit en dur
 * mène toujours au même endroit, quel que soit le chemin pris pour arriver.
 * Une femme qui ouvre la politique de confidentialité depuis le bas de
 * l'accueil appuyait sur « retour » et se retrouvait sur une page de
 * documents qu'elle n'avait jamais vue. Pour revenir à l'accueil, il lui
 * fallait un second geste, et deviner lequel.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SCRIPT, ET NON UN SIMPLE `href`
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Seul le navigateur sait d'où elle vient. Le lien garde donc une vraie
 * adresse de repli dans son `href` : il fonctionne sans JavaScript, et le
 * script ne fait que l'améliorer quand il y a une histoire à remonter.
 *
 * TROIS GARDES, et chacune évite un piège :
 *
 * 1. `history.length > 1` : une page ouverte directement, depuis un lien
 *    WhatsApp par exemple, n'a rien derrière elle. `history.back()` ne ferait
 *    rien du tout, et le bouton serait mort.
 *
 * 2. LA PAGE D'OÙ ELLE VIENT DOIT ÊTRE DE CE SITE. Si elle arrive d'une
 *    recherche Google ou d'un lien reçu, revenir en arrière la ferait
 *    SORTIR de l'application. Un bouton de retour qui fait quitter le site
 *    est pire qu'un bouton qui mène toujours au même endroit.
 *
 * 3. LE CLIC ORDINAIRE SEULEMENT. Un appui avec Ctrl, Maj, ou du bouton du
 *    milieu veut dire « ouvre ailleurs » : on laisse le navigateur faire ce
 *    qu'il sait faire.
 */
const liens = document.querySelectorAll<HTMLAnchorElement>('a[data-retour]');

for (const lien of liens) {
  lien.addEventListener('click', (e) => {
    // Un clic qui demande autre chose qu'une navigation ordinaire.
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    if (window.history.length <= 1) return;

    // D'où elle vient. `referrer` est vide quand la page a été ouverte
    // directement, et porte un autre domaine quand elle arrive de dehors.
    let deChezNous = false;
    try {
      deChezNous =
        Boolean(document.referrer) &&
        new URL(document.referrer).origin === window.location.origin;
    } catch {
      deChezNous = false;
    }
    if (!deChezNous) return;

    e.preventDefault();
    window.history.back();
  });
}

export {};
