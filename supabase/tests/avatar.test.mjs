// Le générateur d'avatars : il doit rendre toujours le même visage pour la
// même graine, sur l'accueil comme dans l'admin, et ne jamais produire quoi
// que ce soit que la politique de sécurité du contenu refuserait.
import { avatar, graineDe, graineAuHasard } from '../../src/lib/avatar.ts';
import { verifier, bilan, titre } from './banc.mjs';

titre('Même graine, même avatar');
{
  const a = avatar('awa-7f3c');
  const b = avatar('awa-7f3c');
  verifier('deux appels donnent exactement le même dessin', a === b);
  verifier('une autre graine donne un autre dessin', avatar('fati-91ab') !== a);

  // Le point qui compte vraiment : l'avatar doit survivre au redémarrage du
  // serveur et être le même sur toutes les pages.
  const cent = new Set(Array.from({ length: 100 }, () => avatar('awa-7f3c')));
  verifier('cent appels donnent un seul résultat', cent.size === 1);
}

titre('La graine se construit du prénom et de l’identifiant');
{
  verifier('elle est en minuscules', graineDe('AWA', 'abcdef123456') === 'awa-abcdef12');
  verifier('les espaces sont retirés', graineDe('  Awa  ', 'abcdef123456') === 'awa-abcdef12');
  verifier("l'identifiant est coupé à huit caractères", graineDe('awa', 'abcdefghijklmnop').endsWith('abcdefgh'));
  verifier('deux prénoms identiques mais des comptes différents diffèrent',
    graineDe('awa', 'aaaaaaaa') !== graineDe('awa', 'bbbbbbbb'));
}

titre('La variété est réelle');
{
  const dessins = new Set();
  for (let i = 0; i < 300; i += 1) dessins.add(avatar(`graine-${i}`));
  verifier('300 graines donnent 300 dessins différents', dessins.size === 300, `${dessins.size}`);

  // Les six coiffures doivent sortir, sinon le tirage est déséquilibré.
  const avecFoulard = Array.from({ length: 300 }, (_, i) => avatar(`g${i}`)).filter((s) => s.includes('pattern'));
  verifier('le foulard wax sort parfois', avecFoulard.length > 20, `${avecFoulard.length} sur 300`);
  verifier('le foulard ne sort pas tout le temps', avecFoulard.length < 150, `${avecFoulard.length} sur 300`);
}

titre('Ce que la politique de sécurité du contenu interdit');
{
  const echantillon = Array.from({ length: 200 }, (_, i) => avatar(`s${i}`));
  verifier('aucun attribut style en ligne', echantillon.every((s) => !s.includes('style=')));
  verifier('aucun script', echantillon.every((s) => !s.includes('<script')));
  verifier('aucune balise de style', echantillon.every((s) => !s.includes('<style')));
  // L'adresse « http://www.w3.org/2000/svg » est l'espace de noms du format
  // SVG, pas un chargement : ce qu'on traque, ce sont les vraies requêtes.
  verifier('aucun chargement extérieur', echantillon.every((s) => !/(href|src)=|url\(http/.test(s)));
  verifier('aucune animation SMIL', echantillon.every((s) => !s.includes('<animate')));
}

titre('Accessibilité et bonne formation');
{
  const a = avatar('awa-7f3c', 'Avatar de Awa');
  verifier('le nom accessible est repris', a.includes('aria-label="Avatar de Awa"'));
  verifier("c'est bien une image pour un lecteur d'écran", a.includes('role="img"'));
  verifier('le dessin est fermé', a.endsWith('</svg>'));
  verifier('il a une zone de dessin', a.includes('viewBox="0 0 100 100"'));

  // Les identifiants internes doivent être dérivés de la graine, sinon deux
  // rendus du même avatar donneraient des découpes différentes.
  const id1 = /id="(av[a-z0-9]+)c"/.exec(avatar('awa-7f3c'))?.[1];
  const id2 = /id="(av[a-z0-9]+)c"/.exec(avatar('awa-7f3c'))?.[1];
  verifier("l'identifiant interne est stable", !!id1 && id1 === id2);
  const id3 = /id="(av[a-z0-9]+)c"/.exec(avatar('autre'))?.[1];
  verifier('une autre graine donne un autre identifiant', id1 !== id3);
}

titre('La graine au hasard');
{
  const graines = new Set(Array.from({ length: 200 }, () => graineAuHasard()));
  verifier('200 tirages donnent presque autant de graines', graines.size > 190, `${graines.size}`);
  verifier('elles sont courtes et sans caractère spécial', [...graines].every((g) => /^[a-z0-9]{1,8}$/.test(g)));
}

bilan('Générateur d’avatars');
