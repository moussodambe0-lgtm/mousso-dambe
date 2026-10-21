// Deux adresses, deux mondes.
//
// Décision d'Arthur du 21 octobre 2026 : l'administration est séparée de la
// plateforme principale, sur son propre sous-domaine, avec le même code.
//
// Ce que ces vérifications protègent : qu'aucune cliente ne tombe sur
// l'administration en se promenant sur le site, et qu'aucun écran intime (le
// cycle, le journal, les questions à Dambé) ne se promène sur l'adresse de
// l'administration. La barrière réelle reste la base, qui refuse de répondre à
// qui n'est pas dans la table `administrateurs` : ici on vérifie la séparation
// des adresses, qui s'ajoute à elle sans la remplacer.
import { verifier, bilan, titre } from './banc.mjs';
import {
  hoteDemande,
  estHoteAdmin,
  verdict,
  cheminAdmin,
  cheminPartage,
  urlAdmin,
  CHEMINS_ADMIN,
} from '../../src/lib/hotes.ts';

/** De faux en-têtes, comme ceux d'une vraie requête. */
function entetes(table) {
  return {
    get: (nom) => table[nom.toLowerCase()] ?? null,
  };
}

titre("L'hôte demandé est celui que la personne a tapé");
{
  verifier(
    'le port est retiré',
    hoteDemande(entetes({ host: 'admin.localhost:4322' })) === 'admin.localhost'
  );
  verifier(
    "derrière Vercel, c'est x-forwarded-host qui compte",
    hoteDemande(entetes({ host: 'interne.vercel.app', 'x-forwarded-host': 'admin.moussodambe.bf' })) ===
      'admin.moussodambe.bf'
  );
  verifier(
    'une liste de relais ne garde que le premier',
    hoteDemande(entetes({ 'x-forwarded-host': 'admin.moussodambe.bf, relais.interne' })) ===
      'admin.moussodambe.bf'
  );
  verifier(
    'la casse ne change rien',
    hoteDemande(entetes({ host: 'ADMIN.MoussoDambe.BF' })) === 'admin.moussodambe.bf'
  );
  verifier(
    "sans en-tête, on prend ce qu'Astro a reconstruit",
    hoteDemande(entetes({}), 'moussodambe.bf') === 'moussodambe.bf'
  );
}

titre("On reconnaît l'adresse de l'administration");
{
  verifier('admin.moussodambe.bf en est', estHoteAdmin('admin.moussodambe.bf') === true);
  verifier('admin.localhost en est, pour le développement', estHoteAdmin('admin.localhost') === true);
  verifier("le site des clientes n'en est pas", estHoteAdmin('moussodambe.bf') === false);
  verifier('localhost tout court non plus', estHoteAdmin('localhost') === false);
  verifier('www non plus', estHoteAdmin('www.moussodambe.bf') === false);
  verifier(
    "un nom qui contient « admin » ailleurs n'en est pas",
    estHoteAdmin('mon-admin.moussodambe.bf') === false
  );
  verifier(
    "un faux voisin ne passe pas : administration.moussodambe.bf n'est pas admin.",
    estHoteAdmin('administration.moussodambe.bf') === false
  );
  verifier(
    'un nom précis posé dans ADMIN_HOST est reconnu',
    estHoteAdmin('gestion.moussodambe.bf', 'gestion.moussodambe.bf') === true
  );
  verifier(
    "ADMIN_HOST n'ouvre pas la porte à un autre nom",
    estHoteAdmin('moussodambe.bf', 'gestion.moussodambe.bf') === false
  );
  verifier('un hôte vide ne passe jamais', estHoteAdmin('') === false);
}

titre('Sur le domaine public, l\'administration est introuvable');
{
  for (const chemin of ['/admin', '/admin/', '/admin/42', '/vendeur', '/vendeur/produits']) {
    verifier(`${chemin} est caché`, verdict(chemin, false).quoi === 'cacher');
  }
  verifier(
    'et jamais redirigé vers le sous-domaine, qui en révélerait l\'adresse',
    verdict('/admin', false).quoi !== 'rediriger'
  );
  verifier("l'accueil reste l'accueil", verdict('/', false).quoi === 'laisser');
  verifier('la boutique reste ouverte', verdict('/boutique/serviette', false).quoi === 'laisser');
  verifier('le cycle reste accessible', verdict('/cycle', false).quoi === 'laisser');
  verifier(
    "un nom qui commence pareil n'est pas confondu avec l'admin",
    verdict('/vendeuses-partenaires', false).quoi === 'laisser'
  );
}

titre("Sur l'adresse de l'administration, la plateforme des clientes n'existe pas");
{
  verifier("l'adresse courte mène au tableau de bord", verdict('/', true).quoi === 'rediriger');
  verifier('le tableau de bord répond', verdict('/vendeur', true).quoi === 'laisser');
  verifier('les produits répondent', verdict('/vendeur/produits', true).quoi === 'laisser');
  verifier('la boîte de réception répond', verdict('/admin', true).quoi === 'laisser');
  verifier('un fil de discussion répond', verdict('/admin/abc', true).quoi === 'laisser');

  // Le coeur de la promesse de cette application : rien d'intime ne se promène
  // sur une deuxième adresse.
  for (const chemin of ['/cycle', '/cycle/calendrier', '/journal', '/dambe', '/boutique', '/panier']) {
    verifier(`${chemin} est caché sur l'adresse de l'administration`, verdict(chemin, true).quoi === 'cacher');
  }
}

titre('Ce qui doit répondre sur les deux adresses');
{
  // Sans ces chemins, personne ne pourrait entrer dans l'administration : la
  // session du sous-domaine se crée sur le sous-domaine.
  for (const chemin of ['/connexion', '/auth/retour', '/deconnexion', '/_astro/page.css', '/fonts/a.woff2']) {
    verifier(`${chemin} répond sur l'administration`, verdict(chemin, true).quoi === 'laisser');
    verifier(`${chemin} répond aussi sur le site public`, verdict(chemin, false).quoi === 'laisser');
  }
  verifier(
    'les notes vocales répondent, le fil les fait écouter',
    verdict('/vocal/abc', true).quoi === 'laisser'
  );
}

titre('La séparation peut être éteinte, et alors rien ne change');
{
  verifier(
    "l'admin reste accessible sans séparation",
    verdict('/admin', false, false).quoi === 'laisser'
  );
  verifier(
    "le cycle aussi, sur n'importe quel hôte",
    verdict('/cycle', true, false).quoi === 'laisser'
  );
}

titre('Les deux espaces de gestion sont couverts, pas seulement /admin');
{
  // Le 14 octobre, un espace vendeur est né à côté de /admin, avec les produits
  // et les chiffres. Les deux sont réservés à Arthur par la même fonction
  // `est_admin()` : les deux doivent donc suivre l'administration.
  verifier('/admin est listé', CHEMINS_ADMIN.includes('/admin'));
  verifier('/vendeur est listé', CHEMINS_ADMIN.includes('/vendeur'));
  verifier('cheminAdmin reconnaît un sous-chemin', cheminAdmin('/vendeur/commandes') === true);
  verifier("cheminAdmin ne confond pas un préfixe", cheminAdmin('/vendeurs') === false);
  verifier('cheminPartage reconnaît la connexion', cheminPartage('/connexion') === true);
  verifier("cheminPartage ne laisse pas passer le journal", cheminPartage('/journal') === false);
}

titre("Le seul lien qui traverse la frontière mène au bon endroit");
{
  // Affiché sur « Mon compte », à Arthur seulement. Il doit suivre le domaine
  // du jour : rien n'est écrit en dur, le domaine n'est pas encore acheté.
  verifier(
    'en développement, il mène à admin.localhost avec le port',
    urlAdmin('http://localhost:4322') === 'http://admin.localhost:4322'
  );
  verifier(
    'en production, il mène au sous-domaine en https',
    urlAdmin('https://moussodambe.bf') === 'https://admin.moussodambe.bf'
  );
  verifier(
    'un www ne donne pas admin.www',
    urlAdmin('https://www.moussodambe.bf') === 'https://admin.moussodambe.bf'
  );
  verifier(
    'un nom configuré est respecté',
    urlAdmin('https://moussodambe.bf', 'gestion.moussodambe.bf') === 'https://gestion.moussodambe.bf'
  );
  verifier(
    "depuis l'administration, il ne s'empile pas",
    urlAdmin('https://admin.moussodambe.bf') === 'https://admin.moussodambe.bf'
  );
  verifier(
    "une origine illisible ne casse pas la page",
    urlAdmin('pas une adresse') === '/vendeur'
  );
}

bilan('Séparation de l\'administration par sous-domaine');
