// Le comptage des passages ne doit JAMAIS retarder une page.
//
// Ce que ces vérifications protègent. Le 6 novembre 2026, le site a rendu
// « 504 FUNCTION_INVOCATION_TIMEOUT » sur le téléphone d'Arthur, par
// intermittence : une visiteuse voyait une page d'erreur, la suivante voyait
// le site marcher. La cause était le comptage ajouté la veille dans le
// middleware. Il partait sur chaque page, en attente bloquante, entouré d'un
// `try/catch`. Or un `try/catch` attrape une erreur, pas une lenteur : quand
// la base tardait, la page attendait sans limite jusqu'à ce que Vercel tue la
// fonction à 15 secondes.
//
// Le défaut n'était donc visible ni dans les tests, ni en local, ni dans la
// plupart des visites. C'est exactement le genre de chose qu'un test doit
// tenir à notre place. Les deux vérifications qui comptent ici sont la
// troisième et la quatrième : une base muette et une base qui explose doivent
// toutes les deux rendre la main tout de suite.
//
// Lancer : node supabase/tests/visites.test.mjs
import { verifier, bilan, titre } from './banc.mjs';
import {
  estPageComptable,
  jourCourant,
  compterPassage,
  DELAI_COMPTAGE_MS,
  COOKIE_JOUR,
} from '../../src/lib/visites.ts';

/** Un faux client Supabase dont on choisit le comportement. */
function client(comportement) {
  return {
    rpc(nom, args) {
      const promesse = comportement(nom, args);
      // Le vrai constructeur de requêtes porte `abortSignal`. On le reproduit
      // pour que le chemin nominal du code soit bien celui qu'on teste.
      promesse.abortSignal = () => promesse;
      return promesse;
    },
  };
}

titre('Ce qui compte comme une page');

verifier('une vraie page compte', estPageComptable('/boutique'));
verifier("l'accueil compte", estPageComptable('/'));
verifier('une fiche produit compte', estPageComptable('/produit/serviettes-lavables'));
verifier('une police ne compte pas', !estPageComptable('/fonts/karla-400.woff2'));
verifier('une image ne compte pas', !estPageComptable('/produits/photo-12.jpg'));
verifier('un vocal ne compte pas', !estPageComptable('/vocal/abc'));
verifier("un fichier de l'outillage ne compte pas", !estPageComptable('/_astro/page.B4g.js'));
verifier('une route de service ne compte pas', !estPageComptable('/api/commande'));
verifier('sw.js ne compte pas', !estPageComptable('/sw.js'));
verifier(
  "tout chemin finissant par une extension ne compte pas",
  !estPageComptable('/quelque-chose/fichier.xml')
);

titre('La date du jour');

const j = jourCourant(new Date(2026, 10, 6, 8, 9));
verifier('la date est écrite AAAA-MM-JJ', j === '2026-11-06', j);
verifier('le cookie porte un nom neutre', COOKIE_JOUR === 'md_jour');

titre('Le comptage ne peut pas retarder une page');

{
  const appels = [];
  const ok = await compterPassage(
    client((nom, args) => {
      appels.push([nom, args]);
      return Promise.resolve({ data: null, error: null });
    }),
    true
  );
  verifier('une base qui répond compte le passage', ok === true);
  verifier(
    'la fonction appelée est la bonne',
    appels.length === 1 && appels[0][0] === 'enregistrer_passage',
    JSON.stringify(appels)
  );
  verifier(
    'le premier passage du jour est signalé comme nouveau',
    appels[0][1].p_nouvelle === true
  );
}

{
  // LE CAS QUI CASSAIT LE SITE : la base ne répond jamais.
  const debut = Date.now();
  const ok = await compterPassage(
    client(() => new Promise(() => {})),
    false,
    80
  );
  const duree = Date.now() - debut;
  verifier('une base muette ne bloque pas la page', ok === false);
  verifier(
    `elle rend la main tout de suite (${duree} ms)`,
    duree < 1000,
    `${duree} ms, ce qui est trop`
  );
}

{
  // Une base qui refuse franchement : ni exception remontée, ni attente.
  const debut = Date.now();
  const ok = await compterPassage(
    client(() => Promise.reject(new Error('la base est fâchée'))),
    false,
    80
  );
  verifier("une base qui refuse ne fait pas tomber la page", ok === false);
  verifier('et elle ne fait pas attendre non plus', Date.now() - debut < 1000);
}

{
  // Un client sans `abortSignal` : la course doit suffire à elle seule.
  const sansAbandon = {
    rpc: () => new Promise(() => {}),
  };
  const debut = Date.now();
  const ok = await compterPassage(sansAbandon, false, 80);
  verifier("un client sans abandon est quand même borné", ok === false);
  verifier('la course seule suffit', Date.now() - debut < 1000);
}

{
  // Un `rpc` qui explose avant même de rendre une promesse.
  const casse = {
    rpc() {
      throw new Error('client mal construit');
    },
  };
  const ok = await compterPassage(casse, true, 80);
  verifier('un client cassé ne fait pas tomber la page', ok === false);
}

verifier(
  'le délai par défaut reste court',
  DELAI_COMPTAGE_MS > 0 && DELAI_COMPTAGE_MS <= 1000,
  `${DELAI_COMPTAGE_MS} ms`
);

bilan('Le comptage des visites');
