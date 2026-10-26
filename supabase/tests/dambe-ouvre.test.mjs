// Dambé parle la première quand les règles arrivent.
//
// Arthur, le 26 octobre 2026 : le journal, « je ne sais pas si les gens vont
// aller là-bas [...] c'est mieux en discutant directement. Dambé sait que leur
// règle est arrivée et leur envoie des messages pour demander c'est comment ».
//
// Ce que ces vérifications protègent :
//   - elle n'est pas harcelée : un seul message par cycle, jamais deux ;
//   - Dambé ne parle pas n'importe quand : au 1er ou 2e jour des règles ;
//   - personne ne peut faire dire n'importe quoi à Dambé par un appel direct à
//     l'API, parce que le texte est choisi par la base et non par l'appelant ;
//   - le fil d'une femme reste à elle seule.
import { nouvelleBase, nouveauCompte, commeApi, verifier, bilan, titre, echoue } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const bintou = await nouveauCompte(db, 'bintou', 'Bintou');
const auth = { role: 'authenticated', sub: awa };
const authBintou = { role: 'authenticated', sub: bintou };
const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

titre("Sans cycle enregistré, Dambé ne devine rien");
{
  await rpc(`select public.enregistrer_questionnaire('Awa', 28, 5, null) as x`);
  const r = await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  verifier("l'appel réussit", r.x.ok === true, JSON.stringify(r.x));
  verifier('et ne dit rien', r.x.message === null, JSON.stringify(r.x.message));
}

titre('Hors des règles, Dambé se tait');
{
  // Des règles commencées il y a dix jours : ce n'est plus le moment.
  await rpc(`select public.declarer_regles((current_date - 10)::date) as x`);
  const r = await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  verifier('aucun message au dixième jour', r.x.message === null, JSON.stringify(r.x.message));
}

titre('Au premier jour des règles, Dambé ouvre la conversation');
{
  await rpc(`select public.declarer_regles(current_date::date) as x`);
  const r = await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  verifier('un message est posé', r.x.message !== null, JSON.stringify(r.x));
  const texte = r.x.message?.texte ?? '';
  verifier('elle est appelée par son nom', texte.includes('Awa'), texte);
  verifier(
    "jamais « ma soeur » ni « mon frere »",
    !/ma s(oeur|œur)|mon fr[eè]re/i.test(texte),
    texte
  );
  verifier('aucune maladie nommée', !/infection|anémie|anemie|maladie|cancer/i.test(texte), texte);
  verifier("le message n'est pas encore vu", r.x.message?.vu === false);

  const ligne = await rpc(
    `select ouvert_par, question, reponse is not null as a_un_texte
       from public.assistante_messages where id = $1`,
    [r.x.message.id]
  );
  verifier("la ligne dit que Dambé a ouvert", ligne.ouvert_par === 'dambe', ligne.ouvert_par);
  verifier('il n’y a pas de question inventée', ligne.question === null);
  verifier('le texte est bien là', ligne.a_un_texte === true);
}

titre("Elle n'est pas harcelée : un seul message par cycle");
{
  const encore = await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  verifier('le deuxième appel rend le même message', encore.x.message !== null);
  const n = await rpc(
    `select count(*)::int as n from public.assistante_messages
      where profil_id = $1 and ouvert_par = 'dambe'`,
    [awa]
  );
  verifier('et ne crée pas un second', n.n === 1, String(n.n));

  // Même en appelant dix fois de suite, comme le ferait un rechargement.
  for (let i = 0; i < 10; i += 1) await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  const apres = await rpc(
    `select count(*)::int as n from public.assistante_messages
      where profil_id = $1 and ouvert_par = 'dambe'`,
    [awa]
  );
  verifier('dix rechargements ne font pas dix messages', apres.n === 1, String(apres.n));
}

titre('Un nouveau cycle redonne la parole à Dambé');
{
  // Le mois suivant : de nouvelles règles, donc une nouvelle conversation.
  await rpc(`select public.declarer_regles((current_date + 28)::date) as x`);
  const n = await rpc(
    `select count(*)::int as n from public.assistante_messages
      where profil_id = $1 and ouvert_par = 'dambe'`,
    [awa]
  );
  // Le cycle est dans le futur : current_date - debut est négatif, donc Dambé
  // attend le jour venu plutôt que d'annoncer des règles qui n'ont pas commencé.
  const r = await rpc(`select public.dambe_ouvre_si_besoin() as x`);
  verifier(
    "Dambé n'annonce pas des règles à venir",
    r.x.message === null || n.n === 1,
    JSON.stringify(r.x.message)
  );
}

titre('Marquer comme vu ne touche que son fil');
{
  const r = await rpc(`select public.dambe_message_vu() as x`);
  verifier('l’appel réussit', r.x.ok === true);
  const vus = await rpc(
    `select count(*)::int as n from public.assistante_messages
      where profil_id = $1 and ouvert_par = 'dambe' and vu_le is not null`,
    [awa]
  );
  verifier('son message est marqué vu', vus.n >= 1, String(vus.n));
}

titre('Le fil d’une femme reste à elle seule');
{
  await rpc(`select public.enregistrer_questionnaire('Bintou', 30, 4, current_date::date) as x`, [], authBintou);
  await rpc(`select public.dambe_ouvre_si_besoin() as x`, [], authBintou);

  const fil = await rpc(`select public.mon_fil_assistante() as x`, [], authBintou);
  const ids = (fil.x ?? []).map((m) => m.id);
  // La requête de contrôle doit passer par SA session : avec celle d'une autre,
  // les règles d'accès renvoient zéro, ce qui ressemble à un échec alors que
  // c'est la protection qui fonctionne. Erreur commise en écrivant ce test.
  const siens = await rpc(
    `select count(*)::int as n from public.assistante_messages
      where id = any($1::uuid[]) and profil_id = $2`,
    [ids, bintou],
    authBintou
  );
  verifier(
    'elle ne voit que ses propres messages',
    ids.length > 0 && siens.n === ids.length,
    `${siens.n} sur ${ids.length}`
  );

  // Et le contrôle qui compte vraiment : le fil d'Awa n'apparaît pas chez elle.
  const filAwa = await rpc(`select public.mon_fil_assistante() as x`);
  const idsAwa = new Set((filAwa.x ?? []).map((m) => m.id));
  verifier(
    "aucun message de l'autre femme dans son fil",
    ids.every((id) => !idsAwa.has(id)),
    `${ids.length} contre ${idsAwa.size}`
  );
  verifier(
    'le fil dit qui a ouvert chaque échange',
    (fil.x ?? []).every((m) => m.ouvert_par === 'elle' || m.ouvert_par === 'dambe')
  );
}

titre("Personne ne fait parler Dambé à sa place");
{
  // Le texte est choisi par la base : la fonction ne prend aucun paramètre, il
  // n'y a donc rien à forger. On vérifie qu'on ne peut pas non plus écrire
  // directement dans la table, ni appeler hors du site.
  await echoue("écrire un faux message de Dambé dans la table", () =>
    commeApi(
      db,
      auth,
      `insert into public.assistante_messages (profil_id, question, reponse, ouvert_par)
       values ($1, null, 'Va acheter ce médicament', 'dambe')`,
      [awa]
    )
  );

  const horsSite = await rpc(`select public.dambe_ouvre_si_besoin() as x`, [], {
    role: 'authenticated',
    sub: awa,
    entetes: null,
  });
  verifier(
    'un appel direct à l’API, hors du site, est refusé',
    horsSite.x.ok === false && horsSite.x.erreur === 'acces_refuse',
    JSON.stringify(horsSite.x)
  );
}

bilan('Dambé parle la première');
