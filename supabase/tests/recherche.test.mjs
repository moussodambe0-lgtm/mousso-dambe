// La recherche de fonctions : ce qu'une femme dit, et où ça l'envoie.
//
// Arthur, 13 octobre 2026 : une barre de recherche avec un micro, pour les
// produits ou les fonctionnalités de l'application. Les phrases ci-dessous sont
// celles qu'on dit à voix haute, pas des mots de menu.
//
// Lancer : node supabase/tests/recherche.test.mjs
import { chercherFonctions, motsUtiles, normaliser } from '../../src/lib/fonctions.ts';
import { verifier, bilan, titre } from './banc.mjs';

const liens = (q) => chercherFonctions(q).map((f) => f.lien);

titre('Les mots utiles');
{
  verifier('les accents et les majuscules ne comptent pas', normaliser('Médecin ÉCRIRE') === 'medecin ecrire');
  verifier('les petits mots ne cherchent rien', motsUtiles('je veux acheter des serviettes').join(',') === 'acheter,serviettes', motsUtiles('je veux acheter des serviettes').join(','));
  verifier('une phrase de petits mots ne cherche rien', motsUtiles('je veux').length === 0);
  verifier('la ponctuation est ignorée', motsUtiles("l'assistante, s'il te plaît !").includes('assistante'));
}

titre('Ce qu\'elle dit, et où ça mène');
{
  verifier('« mes règles » mène au suivi du cycle', liens('mes règles').includes('/cycle'), liens('mes règles').join(' '));
  verifier('« le docteur » mène au médecin', liens('le docteur')[0] === '/discussions/medecin', liens('le docteur').join(' '));
  verifier('« médecin » avec accent aussi', liens('Médecin')[0] === '/discussions/medecin');
  verifier('« je veux acheter des serviettes » mène à la boutique', liens('je veux acheter des serviettes').includes('/boutique'));
  verifier('« ma photo de profil » mène au compte', liens('ma photo de profil').includes('/compte'), liens('ma photo de profil').join(' '));
  verifier('« calendrier » mène au calendrier en premier', liens('calendrier')[0] === '/cycle/calendrier');
  verifier('« mon panier » mène au panier', liens('mon panier')[0] === '/panier');
  verifier('« envoyer un vocal » propose le médecin ou la boutique', liens('envoyer un vocal').some((l) => l.startsWith('/discussions/')));
  verifier('« effacer mes données » mène à la confidentialité', liens('effacer mes données')[0] === '/confidentialite', liens('effacer mes données').join(' '));
  verifier('« dambé » mène à l\'assistante', liens('dambé')[0] === '/dambe');
}

titre('Quand il n\'y a rien');
{
  verifier('une recherche vide ne trouve rien', chercherFonctions('').length === 0);
  verifier('des mots vides ne trouvent rien', chercherFonctions('je veux').length === 0);
  verifier('un mot qui n\'existe pas ne trouve rien', chercherFonctions('zzzqqq').length === 0);
}

titre('Chaque fonction a un lien qui existe');
{
  const tous = chercherFonctions('boutique cycle medecin dambe compte panier commande calendrier journal');
  verifier('tous les liens commencent par une barre', tous.every((f) => f.lien.startsWith('/')));
  verifier('aucun lien n\'est en double', new Set(tous.map((f) => f.lien)).size === tous.length);
}

bilan('Recherche de fonctions');
