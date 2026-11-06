/**
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

/** Ce que Supabase rend quand l'échange réussit. */
export interface JetonsRafraichis {
  access_token: string;
  refresh_token: string;
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
