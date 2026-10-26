// Ne jamais écrire dans la base d'un autre projet.
//
// Arthur, le 26 octobre 2026 : « j'espère que si je te dis de faire une modif
// sur Mousso Dambé tu ne risques pas de te tromper de clé et aller faire la
// modif sur un autre projet ».
//
// Le risque s'est matérialisé deux fois le même jour : un motif de recherche a
// reconnu la ligne d'un autre projet parce que son nom se ressemblait, et une
// clé de Mousso Dambé a été collée par-dessus la valeur de cette ligne. Le
// coffre est partagé entre plusieurs projets : la protection ne peut donc pas
// reposer sur le nom des lignes.
//
// Ces vérifications valent une promesse : elles disent que l'outil s'arrête
// plutôt que d'écrire dans une base qui n'est pas la bonne.
import { verifier, bilan, titre } from './banc.mjs';
import { BASES, baseAttendue } from '../../outils/projets.mjs';

/** Rend l'erreur levée, ou null si rien n'a été levé. */
function erreurDe(fn) {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

titre('Les deux bases de Mousso Dambé sont reconnues');
{
  const p = baseAttendue(BASES.production.ref);
  verifier('la production est reconnue', p.quelle === 'production');
  const e = baseAttendue(BASES.essai.ref);
  verifier("l'essai est reconnu", e.quelle === 'essai');
  verifier(
    'les deux identifiants sont différents',
    BASES.production.ref !== BASES.essai.ref
  );
  verifier(
    "la production annonce ce qui est en jeu",
    /utilisatrice/i.test(BASES.production.danger)
  );
}

titre("La base d'un autre projet est refusée");
{
  // Les identifiants réels de deux projets qui ne sont pas Mousso Dambé. Les
  // écrire ici n'est pas une fuite (ils sont publics dans les URL d'API), et
  // c'est ce qui prouve le refus.
  for (const etranger of ['dopcirwmmgkvjwoyejva', 'uskayebvpbxxggkozqhl']) {
    const e = erreurDe(() => baseAttendue(etranger));
    verifier(`${etranger} est refusée`, e !== null);
    verifier(
      `${etranger} : le refus dit pourquoi`,
      e !== null && /n'est pas une base de Mousso Dambé/.test(e.message)
    );
  }
}

titre('Une valeur vide ou absurde ne passe pas');
{
  for (const mauvais of ['', '   ', null, undefined, 'production', 'https://exemple.bf']) {
    verifier(
      `« ${String(mauvais)} » est refusé`,
      erreurDe(() => baseAttendue(mauvais)) !== null
    );
  }
}

titre('Se tromper de base entre les deux nôtres est refusé aussi');
{
  // Le cas le plus dangereux : l'outil croit viser l'essai, mais la ligne du
  // coffre donne la production.
  const e = erreurDe(() => baseAttendue(BASES.production.ref, 'essai'));
  verifier("viser l'essai et tomber sur la production est refusé", e !== null);
  verifier(
    'et le refus dit que rien n’a été écrit',
    e !== null && /Rien n'a été écrit/.test(e.message)
  );

  const e2 = erreurDe(() => baseAttendue(BASES.essai.ref, 'production'));
  verifier("viser la production et tomber sur l'essai est refusé", e2 !== null);

  // Et le cas normal passe, sinon la protection empêcherait de travailler.
  verifier(
    "viser l'essai et tomber sur l'essai passe",
    erreurDe(() => baseAttendue(BASES.essai.ref, 'essai')) === null
  );
  verifier(
    'viser la production et tomber sur la production passe',
    erreurDe(() => baseAttendue(BASES.production.ref, 'production')) === null
  );
}

titre('La casse et les espaces ne contournent pas le contrôle');
{
  verifier(
    'un identifiant en majuscules est reconnu',
    erreurDe(() => baseAttendue(BASES.essai.ref.toUpperCase(), 'essai')) === null
  );
  verifier(
    'un identifiant entouré d’espaces est reconnu',
    erreurDe(() => baseAttendue(`  ${BASES.essai.ref}  `, 'essai')) === null
  );
  verifier(
    'un identifiant presque juste est refusé',
    erreurDe(() => baseAttendue(BASES.essai.ref.slice(0, -1) + 'x')) !== null
  );
}

bilan("Ne jamais écrire dans la base d'un autre projet");
