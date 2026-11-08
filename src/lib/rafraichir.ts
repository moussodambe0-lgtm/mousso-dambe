/**
 * Les appels d'authentification qu'on fait à la main, parce que supabase-js
 * ne sait pas les faire sur un serveur.
 *
 * Deux pannes du 6 novembre 2026 ont la même racine, et il y en aura d'autres :
 * le client d'authentification de supabase-js est écrit pour un navigateur.
 * Il attend un stockage, une session déjà chargée et un verrou qui sérialise
 * ses opérations. Sur un serveur, avec `persistSession: false`, il se suspend
 * ou rend des réponses vides, sans jamais lever d'erreur.
 *
 *   - `auth.refreshSession()` ne revient jamais. Toutes les pages de toutes
 *     les femmes connectées depuis plus d'une heure rendaient 504.
 *   - `auth.signInAnonymously()` rend `{ session: null, error: null }`. Le
 *     bouton « Commencer » de l'écran d'ouverture ne faisait rien : aucune
 *     visiteuse nouvelle ne pouvait entrer dans l'application.
 *
 * LA RÈGLE QUI EN SORT. Côté serveur, on n'appelle de `auth.*` que ce qui est
 * prouvé sans danger (`getUser(jeton)` l'est). Tout le reste est une requête
 * HTTP ordinaire vers `/auth/v1/…`, écrite ici, bornée dans le temps, et
 * couverte par `supabase/tests/rafraichir.test.mjs`.
 *
 * ----------------------------------------------------------------------------
 *
 * Échanger un jeton de rafraîchissement, sans passer par supabase-js.
 *
 * POURQUOI CE FICHIER EXISTE. C'est la panne du 6 novembre 2026, et elle a
 * mis toute l'application à terre sans que rien ne le dise.
 *
 * Un jeton d'accès Supabase vit une heure. Passé ce délai, chaque page d'une
 * femme connectée appelait `auth.refreshSession({ refresh_token })` pour en
 * obtenir un neuf. Sur le serveur, cet appel NE REVIENT JAMAIS. Il ne lève
 * pas d'erreur, il ne rend pas une réponse vide : il reste suspendu. La page
 * attend, et Vercel finit par tuer la fonction au bout de ses 15 secondes.
 * La femme voit « 504 FUNCTION_INVOCATION_TIMEOUT ».
 *
 * La raison tient au client d'authentification de supabase-js, construit pour
 * un navigateur : il sérialise ses opérations derrière un verrou et attend une
 * initialisation de session qui, sans stockage et sans session en cours
 * (`persistSession: false`), ne vient pas.
 *
 * CE QUE LA PANNE AVAIT DE TRAÎTRE, et ce qu'il faut en retenir :
 *
 *   - elle ne frappait QUE les femmes connectées depuis plus d'une heure.
 *     Déconnecté, le site répondait en 200 ms, et tous mes essais étaient
 *     faits déconnecté ;
 *   - elle frappait TOUTES leurs pages d'un coup, l'accueil, le cycle, le
 *     journal, Dambé, le compte, la boutique, puisque toutes demandent qui
 *     est la visiteuse ;
 *   - elle était parfaitement reproductible, mais seulement avec une session.
 *     Un cookie `md_session` portant deux jetons faux suffit à la provoquer :
 *     c'est ainsi qu'elle a été trouvée, après deux fausses pistes.
 *
 * LA RÈGLE : sur le serveur, on ne se sert du client d'authentification de
 * supabase-js que pour ce qui est prouvé sans danger. Un échange de jeton est
 * une simple requête HTTP, on l'écrit comme telle, et on lui pose une limite
 * de temps. Tout appel réseau d'une page doit avoir une limite ; sans elle, ce
 * n'est pas une lenteur qu'on risque, c'est une page morte.
 */

/**
 * Borner n'importe quelle promesse, et rendre une valeur de repli au-delà.
 *
 * Sert à tout ce qui passe encore par le client d'authentification de
 * supabase-js, en particulier `auth.setSession()`, qui rafraîchit le jeton
 * tout seul quand il le trouve expiré et se suspend alors comme
 * `refreshSession()`. Les deux écrans concernés (lier un compte Google, et
 * changer son email ou son mot de passe) n'ont pas été vus tomber, mais ils
 * tiennent exactement le même mécanisme : les borner coûte trois lignes, les
 * laisser coûte une page morte le jour où quelqu'un y arrive avec un jeton
 * d'une heure et une minute.
 *
 * Elle ne masque pas une erreur : une promesse qui échoue échoue encore. Elle
 * ne borne que le temps.
 */
export async function sansDepasser<T>(
  promesse: PromiseLike<T>,
  delaiMs: number,
  repli: T
): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const trancher = new Promise<T>((resoudre) => {
    minuteur = setTimeout(() => resoudre(repli), delaiMs);
  });
  try {
    return await Promise.race([promesse, trancher]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/** Ce que Supabase rend quand l'échange réussit. */
export interface JetonsRafraichis {
  access_token: string;
  refresh_token: string;
}

/**
 * Ouvrir une session anonyme, sans passer par supabase-js.
 *
 * C'est ce que fait le bouton « Commencer » de l'écran d'ouverture : Supabase
 * crée une identité sans email ni mot de passe, avec un vrai jeton signé, et
 * toutes les règles d'accès de la base continuent de marcher.
 *
 * POURQUOI PAS `auth.signInAnonymously()`. Sur le serveur, il rend
 * `{ data: { user: null, session: null }, error: null }` : ni session, ni
 * erreur, rien à quoi se raccrocher. Le 6 novembre 2026, aucune visiteuse
 * nouvelle ne pouvait entrer dans l'application, et la page renvoyait
 * simplement vers l'accueil sans rien dire. Arthur : « quand j'appuie
 * commencer, ça ne marche pas, ça ne m'envoie pas à la page suivante. »
 *
 * La route `/auth/v1/signup` avec un corps vide est exactement l'appel que la
 * bibliothèque est censée faire. Rendu ainsi, un échec est un échec : un
 * statut, un code, et de quoi savoir quoi réparer.
 *
 * Rend les jetons, ou un code de refus. Jamais d'exception.
 */
export async function connexionAnonyme(
  urlBase: string,
  cleAnonyme: string,
  delaiMs: number = DELAI_RAFRAICHISSEMENT_MS,
  chercher: typeof fetch = fetch
): Promise<{ jetons: JetonsRafraichis } | { motif: string }> {
  if (!urlBase || !cleAnonyme) return { motif: 'base_non_configuree' };

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const trancher = new Promise<null>((resoudre) => {
    minuteur = setTimeout(() => resoudre(null), delaiMs);
  });

  try {
    const reponse = await Promise.race([
      chercher(`${urlBase.replace(/\/+$/, '')}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: cleAnonyme,
          Authorization: `Bearer ${cleAnonyme}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(delaiMs),
      }),
      trancher,
    ]);

    if (!reponse) return { motif: 'delai_depasse' };

    const corps = (await reponse.json().catch(() => null)) as Record<string, unknown> | null;

    if (!reponse.ok) {
      // Supabase nomme ses refus : `anonymous_provider_disabled` quand le
      // réglage est fermé, `over_request_rate_limit` quand on insiste. Le code
      // est repris tel quel, parce qu'il dit quoi réparer.
      const code =
        (typeof corps?.error_code === 'string' && corps.error_code) ||
        (typeof corps?.code === 'string' && corps.code) ||
        `http_${reponse.status}`;
      return { motif: code };
    }

    const acces = corps?.access_token;
    const rafraichissement = corps?.refresh_token;
    if (typeof acces !== 'string' || typeof rafraichissement !== 'string') {
      return { motif: 'reponse_sans_jetons' };
    }

    return { jetons: { access_token: acces, refresh_token: rafraichissement } };
  } catch (e) {
    // Le motif dit LAQUELLE des pannes possibles s'est produite. « Injoignable »
    // tout court a coûté un aller-retour de plus : une adresse introuvable, un
    // certificat refusé et un délai dépassé demandent trois réparations
    // différentes, et rien ne les distinguait.
    const cause = (e as { name?: string; cause?: { code?: string } } | null) ?? {};
    const code = cause.cause?.code ?? cause.name ?? 'inconnu';
    return { motif: `injoignable_${String(code).replace(/[^a-z0-9_]/gi, '').slice(0, 24)}` };
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/**
 * Au-delà de ce délai, on renonce et on déconnecte proprement.
 *
 * Cinq secondes sont très larges pour un échange de jeton (il se fait en
 * moins de 300 ms), et restent bien en deçà des 15 secondes de Vercel : même
 * dans le pire cas, la page a le temps de se construire et de s'afficher.
 */
export const DELAI_RAFRAICHISSEMENT_MS = 5000;

/**
 * FERMER LA SESSION CHEZ SUPABASE, POUR DE VRAI (audit de Cyber, 8 novembre
 * 2026).
 *
 * CE QUI NE MARCHAIT PAS, ET POURQUOI C'EST GRAVE ICI PRÉCISÉMENT.
 *
 * `/deconnexion` appelait `client.auth.signOut({ scope: 'local' })`, et son
 * commentaire disait : « On révoque la session auprès de Supabase AVANT de
 * supprimer les cookies. Supprimer le cookie seul ne fermait rien. » C'était
 * la bonne intention, et l'appel ne la tenait pas.
 *
 * `clientSession()` ne pose le jeton que dans un EN-TÊTE. La partie « auth »
 * de supabase-js, elle, ne lit que sa propre session, et avec
 * `persistSession: false` elle n'en a aucune. `signOut` commence par demander
 * `getSession()`, n'obtient rien, et n'a donc aucun jeton à envoyer : il vide
 * un stockage déjà vide et rend la main sans avoir parlé à Supabase. Le jeton
 * de rafraîchissement restait valable des semaines.
 *
 * Dans cette application, ce n'est pas une subtilité : le danger numéro un est
 * le téléphone qu'on se passe à la maison. « Je me déconnecte » doit vouloir
 * dire « c'est fermé », y compris pour quelqu'un qui aurait gardé une copie du
 * cookie. C'était l'objet même de l'audit du 12 octobre 2026, et la réparation
 * d'alors ne faisait rien.
 *
 * ET C'EST LA MÊME RACINE QUE LES DEUX PANNES DU 6 NOVEMBRE (voir l'en-tête de
 * ce fichier) : un appel `auth.*` sur un serveur. `signOut` prend en plus le
 * même verrou que `refreshSession`, sans aucune limite de temps autour. Un
 * `try/catch` attrape une erreur, il n'attrape pas une lenteur : la page de
 * déconnexion pouvait rendre 504.
 *
 * On applique donc la règle du fichier : une requête HTTP ordinaire, écrite
 * ici, bornée dans le temps, qui ne lève jamais.
 *
 * `scope=local` ne ferme QUE cette session : elle a peut-être l'application sur
 * un deuxième téléphone, et on ne la déconnecte pas de partout sans qu'elle
 * l'ait demandé.
 *
 * Rend `true` si Supabase a bien fermé la session. L'appelant supprime les
 * cookies DANS TOUS LES CAS : jamais laisser quelqu'une sur une page connectée
 * parce que la révocation a raté.
 */
export async function deconnexionSupabase(
  urlBase: string,
  cleAnonyme: string,
  jetonAcces: string,
  delaiMs: number = DELAI_RAFRAICHISSEMENT_MS,
  chercher: typeof fetch = fetch
): Promise<boolean> {
  if (!urlBase || !cleAnonyme || !jetonAcces) return false;

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const trancher = new Promise<null>((resoudre) => {
    minuteur = setTimeout(() => resoudre(null), delaiMs);
  });

  try {
    const reponse = await Promise.race([
      chercher(`${urlBase.replace(/\/+$/, '')}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: {
          apikey: cleAnonyme,
          // C'est CE jeton qui désigne la session à fermer. C'est exactement ce
          // qui manquait à l'appel d'avant.
          Authorization: `Bearer ${jetonAcces}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(delaiMs),
      }),
      trancher,
    ]);

    if (!reponse) return false;
    // 204 quand c'est fait. 401 quand le jeton était déjà périmé : la session
    // est fermée de toute façon, il n'y a rien à réparer.
    return reponse.ok || reponse.status === 401;
  } catch {
    return false;
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/**
 * Échange le jeton de rafraîchissement contre un couple neuf.
 *
 * Rend `null` dans tous les cas d'échec, sans jamais lever : jeton révoqué,
 * base injoignable, délai dépassé, réponse inattendue. L'appelant déconnecte
 * alors proprement, ce qui est le bon comportement dans chacun de ces cas.
 */
export async function rafraichirJetons(
  urlBase: string,
  cleAnonyme: string,
  jetonRafraichissement: string,
  delaiMs: number = DELAI_RAFRAICHISSEMENT_MS,
  chercher: typeof fetch = fetch
): Promise<JetonsRafraichis | null> {
  if (!urlBase || !cleAnonyme || !jetonRafraichissement) return null;

  // DEUX PROTECTIONS, ET ELLES NE FONT PAS DOUBLE EMPLOI. Le signal demande à
  // la requête de s'arrêter ; la course garantit que CETTE fonction rend la
  // main, même si l'appel ignorait le signal. C'est précisément parce qu'on
  // avait fait confiance à une bibliothèque pour revenir que le site est
  // tombé : on ne refait pas reposer une page sur cette confiance.
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const trancher = new Promise<null>((resoudre) => {
    minuteur = setTimeout(() => resoudre(null), delaiMs);
  });

  try {
    const reponse = await Promise.race([
      chercher(`${urlBase.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: cleAnonyme,
          Authorization: `Bearer ${cleAnonyme}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: jetonRafraichissement }),
        signal: AbortSignal.timeout(delaiMs),
      }),
      trancher,
    ]);

    // La course a tranché avant la réponse : on renonce sans rien attendre.
    if (!reponse) return null;

    // 400 et 401 sont les réponses normales d'un jeton périmé ou révoqué.
    // Ce n'est pas une anomalie : c'est une femme qu'il faut reconnecter.
    if (!reponse.ok) return null;

    const corps = (await reponse.json()) as Partial<JetonsRafraichis>;
    if (!corps?.access_token || !corps?.refresh_token) return null;

    return { access_token: corps.access_token, refresh_token: corps.refresh_token };
  } catch {
    return null;
  } finally {
    // Sans cela, chaque page garderait un minuteur vivant pour rien jusqu'au
    // bout du délai, même quand la base a répondu en 200 ms.
    if (minuteur) clearTimeout(minuteur);
  }
}
