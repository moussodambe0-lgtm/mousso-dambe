// Le fil du médecin est fermé jusqu'à ce qu'un médecin réponde.
//
// Arthur, le 26 octobre 2026 : « pour le médecin on va mettre bientôt
// disponible. Après on va créer un lien qui donnera accès à cette page pour que
// le médecin réponde aux questions. »
//
// Ce que ces vérifications protègent : qu'une femme n'écrive pas une question
// intime à un médecin qui n'existe pas encore, et n'attende pas une réponse qui
// ne viendra jamais. La carte ne s'ouvre plus dans l'application, mais une page
// bien élevée ne protège rien : la fonction reste appelable par l'API. C'est la
// leçon de l'audit du 14 octobre sur l'autre application.
//
// Et ce qu'elles protègent tout autant : que la BOUTIQUE reste ouverte, et que
// l'orientation d'urgence continue de marcher.
import { nouvelleBase, nouveauCompte, commeApi, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const auth = { role: 'authenticated', sub: awa };
const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

await rpc(`select public.enregistrer_questionnaire('Awa', 28, 5, current_date - 3) as x`);

titre('Le réglage existe et le fil est fermé au départ');
{
  // `reglages` est fermée à `authenticated` depuis les fondations : on la lit
  // en direct, hors session, comme le ferait l'éditeur SQL de Supabase.
  const r = (await db.query(`select valeur from public.reglages where cle = 'medecin_actif'`)).rows[0];
  verifier('le réglage est posé', r?.valeur === 'non', String(r?.valeur));
}

titre("Écrire au médecin est refusé, même par un appel direct à l'API");
{
  const r = await rpc(`select public.ecrire_a('medecin', 'J''ai mal depuis trois jours') as x`);
  verifier('le message est refusé', r.x.ok === false, JSON.stringify(r.x));
  verifier('et le motif est clair', r.x.erreur === 'medecin_bientot', r.x.erreur);

  const n = await rpc(
    `select count(*)::int as n from public.messages m
       join public.fils f on f.id = m.fil_id
      where f.profil_id = $1 and f.sujet = 'medecin'`,
    [awa]
  );
  verifier('rien n’est enregistré', n.n === 0, String(n.n));
}

titre('La boutique, elle, reste ouverte');
{
  const r = await rpc(`select public.ecrire_a('boutique', 'La culotte existe en taille L ?') as x`);
  verifier('le message passe', r.x.ok === true, JSON.stringify(r.x));
  verifier('le retour donne le fil', typeof r.x.fil === 'string' && r.x.fil.length > 10, JSON.stringify(r.x.fil));
  verifier('le retour donne le sujet', r.x.sujet === 'boutique', r.x.sujet);

  const n = await rpc(
    `select count(*)::int as n from public.messages m
       join public.fils f on f.id = m.fil_id
      where f.profil_id = $1 and f.sujet = 'boutique'`,
    [awa]
  );
  verifier('et il est enregistré', n.n === 1, String(n.n));
}

titre('Le jour où un médecin répond, une ligne suffit à ouvrir');
{
  await db.exec(`update public.reglages set valeur = 'oui' where cle = 'medecin_actif'`);

  const r = await rpc(`select public.ecrire_a('medecin', 'J''ai une question') as x`);
  verifier('le message passe maintenant', r.x.ok === true, JSON.stringify(r.x));
  verifier('et le sujet est bien le médecin', r.x.sujet === 'medecin', r.x.sujet);

  // On referme, pour que l'état du banc reflète la production.
  await db.exec(`update public.reglages set valeur = 'non' where cle = 'medecin_actif'`);
  const apres = await rpc(`select public.ecrire_a('medecin', 'Encore une') as x`);
  verifier('refermer refonctionne', apres.x.ok === false && apres.x.erreur === 'medecin_bientot');
}

titre("L'orientation d'urgence ne dépend pas de ce réglage");
{
  // Les mots qui disent un danger doivent toujours orienter vers un centre de
  // santé, tout de suite, sans attendre une réponse humaine (Arthur, 12 oct).
  // Le repérage se fait côté code, avant tout appel : on vérifie ici que fermer
  // le fil ne l'a pas touché.
  const { alerte } = await import('../../src/lib/assistante.ts');
  // Phrase reprise des vérifications existantes : j'en avais inventé une, que
  // le code classe « soignant » et non « urgence ». C'était mon test qui avait
  // tort, pas le repérage.
  const danger = 'mon mari me frappe quand je refuse';
  verifier(
    'une urgence reste repérée',
    alerte(danger).gravite === 'urgence',
    alerte(danger).gravite
  );
  verifier(
    'une question ordinaire ne devient pas une urgence',
    alerte('la culotte existe en taille L ?').gravite !== 'urgence'
  );
}

bilan('Le médecin, bientôt disponible');
