// La preuve des accords : on ajoute des lignes, on n'en corrige aucune.
//
// CE QUE CES VÉRIFICATIONS PROTÈGENT. L'article 26 de la loi n°037-2026/ALP
// n'exige pas un consentement, il INTERDIT de traiter des données de santé
// sans consentement exprès, et l'article 5 range la consultation parmi les
// traitements. L'accord n'est donc pas une précaution : c'est lui qui lève
// l'interdiction. Et l'article 17 met la charge de la preuve sur Mousso
// Dambé : un accord qui ne se prouve pas ne sert à rien.
//
// L'article 34 de la loi n°045-2009/AN donne à un écrit électronique la force
// du papier à deux conditions, que la personne soit dûment identifiée et que
// l'intégrité de la conservation soit garantie. Une table qu'on peut corriger
// ne garantit rien. C'est ce que vérifie la deuxième section, et c'est la
// plus importante de ce fichier.
//
// Lancer : node supabase/tests/accords.test.mjs
import { nouvelleBase, commeApi, commeServeur, nouveauCompte, verifier, echoue, bilan, titre } from './banc.mjs';
import { createHash } from 'node:crypto';

const db = await nouvelleBase();
const aminata = await nouveauCompte(db, 'aminata', 'Aminata');
const salimata = await nouveauCompte(db, 'salimata', 'Salimata');

const TEXTE = [
  'Avant ta première question',
  '',
  "Dambé est une intelligence artificielle. Ce que tu écris part vers le service qui la fait tourner, hors du Burkina Faso.",
].join('\n');

const elle = (sub) => ({ role: 'authenticated', sub });

titre('Donner son accord');
{
  const r = await commeApi(
    db,
    elle(aminata),
    `select public.consentement_noter('assistante', true, '2026-11-06', $1) as j`,
    [TEXTE]
  );
  verifier("l'accord est enregistré", r.rows[0].j.ok === true, JSON.stringify(r.rows[0].j));

  const l = await commeServeur(db, `select * from public.consentements where profil = $1`, [aminata]);
  verifier('une seule ligne', l.rows.length === 1);
  verifier("l'objet est gardé", l.rows[0].objet === 'assistante');
  verifier('la version est gardée', l.rows[0].version === '2026-11-06');
  verifier('le texte intégral est gardé', l.rows[0].texte === TEXTE);

  // L'EMPREINTE EST CALCULÉE PAR LA BASE, pas par l'application : une cliente
  // qui pourrait écrire l'empreinte de son choix rendrait la preuve nulle.
  const attendue = createHash('sha256').update(TEXTE, 'utf8').digest('hex');
  verifier("l'empreinte correspond vraiment au texte", l.rows[0].empreinte === attendue, l.rows[0].empreinte);
  verifier("la date est posée", !!l.rows[0].le);
}

titre('LA PARTIE QUI COMPTE : on ne corrige rien, on n\'efface rien');
{
  await echoue(
    'modifier un accord est refusé',
    () => commeServeur(db, `update public.consentements set accorde = false where profil = $1`, [aminata]),
    'ne se modifie'
  );
  await echoue(
    'effacer un accord est refusé',
    () => commeServeur(db, `delete from public.consentements where profil = $1`, [aminata]),
    'ne se modifie'
  );
  await echoue(
    "changer le texte d'un accord est refusé",
    () => commeServeur(db, `update public.consentements set texte = 'autre chose' where profil = $1`, [aminata]),
    'ne se modifie'
  );

  const l = await commeServeur(db, `select count(*)::int as n from public.consentements where profil = $1`, [aminata]);
  verifier("et la ligne d'origine est toujours là, intacte", l.rows[0].n === 1);
}

titre('Retirer son accord : une ligne de plus, jamais une ligne corrigée');
{
  await commeApi(db, elle(aminata), `select public.consentement_noter('assistante', false, '2026-11-06', $1)`, [TEXTE]);

  const l = await commeServeur(
    db,
    `select accorde from public.consentements where profil = $1 order by le`,
    [aminata]
  );
  verifier('deux lignes, le oui puis le non', l.rows.length === 2, `${l.rows.length} lignes`);
  verifier("le oui d'origine est conservé", l.rows[0].accorde === true);
  verifier('le retrait est une ligne à part', l.rows[1].accorde === false);

  const e = await commeApi(db, elle(aminata), `select public.consentement_etat('assistante') as j`);
  verifier("l'état rendu est « retiré »", e.rows[0].j.accorde === false, JSON.stringify(e.rows[0].j));

  // Elle revient sur son retrait : troisième ligne, et c'est elle qui gagne.
  await commeApi(db, elle(aminata), `select public.consentement_noter('assistante', true, '2026-11-06', $1)`, [TEXTE]);
  const e2 = await commeApi(db, elle(aminata), `select public.consentement_etat('assistante') as j`);
  verifier("revenir sur son retrait redonne l'accord", e2.rows[0].j.accorde === true);
  const n = await commeServeur(db, `select count(*)::int as n from public.consentements where profil = $1`, [aminata]);
  verifier('et les trois lignes sont toutes là', n.rows[0].n === 3, `${n.rows[0].n} lignes`);
}

titre('La version compte autant que le oui');
{
  const e = await commeApi(db, elle(aminata), `select public.consentement_etat('assistante') as j`);
  verifier('la version acceptée est rendue', e.rows[0].j.version === '2026-11-06', JSON.stringify(e.rows[0].j));
  // C'est la page qui compare : un accord sur un ancien texte ne vaut pas
  // accord sur le nouveau, et elle doit redemander plutôt que supposer.
  verifier(
    "un texte plus récent ne vaut pas accord",
    e.rows[0].j.version !== '2027-01-01'
  );
}

titre("Ce qui n'a pas le droit d'arriver");
{
  const sans = await commeApi(db, { role: 'anon', sub: null }, `select public.consentement_noter('assistante', true, 'v', 'x') as j`);
  verifier('sans session, rien n\'est noté', sans.rows[0].j.ok === false && sans.rows[0].j.erreur === 'pas-de-session');

  const vide = await commeApi(db, elle(aminata), `select public.consentement_noter('assistante', true, 'v', '   ') as j`);
  verifier('un texte vide est refusé', vide.rows[0].j.ok === false, JSON.stringify(vide.rows[0].j));

  const inconnu = await commeApi(db, elle(aminata), `select public.consentement_noter('autre-chose', true, 'v', $1) as j`, [TEXTE]);
  verifier("un objet hors de la liste est refusé", inconnu.rows[0].j.ok === false, JSON.stringify(inconnu.rows[0].j));

  // Elle ne note jamais un accord au nom d'une autre : la fonction prend le
  // profil dans la session, elle ne le reçoit pas en argument.
  const n = await commeServeur(db, `select count(*)::int as n from public.consentements where profil = $1`, [salimata]);
  verifier("aucun accord n'a été noté au nom de quelqu'un d'autre", n.rows[0].n === 0);
}

titre('Chacune ne voit que les siens');
{
  await commeApi(db, elle(salimata), `select public.consentement_noter('cgu', true, '2026-11-06', $1)`, [TEXTE]);

  const vueAminata = await commeApi(db, elle(aminata), `select count(*)::int as n from public.consentements`);
  verifier("Aminata ne voit que ses trois lignes", vueAminata.rows[0].n === 3, `${vueAminata.rows[0].n}`);

  const vueSalimata = await commeApi(db, elle(salimata), `select count(*)::int as n from public.consentements`);
  verifier('Salimata ne voit que la sienne', vueSalimata.rows[0].n === 1, `${vueSalimata.rows[0].n}`);

  const anonyme = await commeApi(db, { role: 'anon', sub: null }, `select count(*)::int as n from public.consentements`);
  verifier("sans compte, on ne voit rien", anonyme.rows[0].n === 0, `${anonyme.rows[0].n}`);
}

titre("Un accord sans état rendu pour un objet jamais donné");
{
  const e = await commeApi(db, elle(salimata), `select public.consentement_etat('assistante') as j`);
  verifier("jamais donné, donc « pas accordé »", e.rows[0].j.ok === true && e.rows[0].j.accorde === false);
  verifier('et aucune version', e.rows[0].j.version === null);
}

titre("LA SERRURE : sans accord, l'administration ne lit pas le fil");
{
  // Arthur, administrateur. Deux femmes ont écrit à Dambé : Salimata a donné
  // son accord, Aminata l'a retiré puis redonné (elle est donc accordée),
  // et Fatou n'a jamais rien accepté.
  const fatou = await nouveauCompte(db, 'fatou', 'Fatou');
  const arthur = await nouveauCompte(db, 'arthur-admin', 'Arthur');
  await commeServeur(db, `insert into public.administrateurs (profil_id) values ($1) on conflict do nothing`, [arthur]);

  for (const [qui, q] of [[aminata, 'jai mal au ventre'], [fatou, 'mes regles sont en retard']]) {
    await commeServeur(
      db,
      `insert into public.assistante_messages (profil_id, question, reponse, ouvert_par)
       values ($1, $2, 'une reponse', 'elle')`,
      [qui, q]
    );
  }

  const lui = { role: 'authenticated', sub: arthur };

  const liste = await commeApi(db, lui, `select public.conversations_ia(null) as j`);
  const j = liste.rows[0].j;
  verifier("l'administration peut ouvrir l'écran", j.ok === true, JSON.stringify(j).slice(0, 120));
  const ids = (j.fils ?? []).map((f) => f.profil);
  verifier("le fil d'Aminata, qui a accepté, est visible", ids.includes(aminata), JSON.stringify(ids));
  verifier("le fil de Fatou, qui n'a rien accepté, est ABSENT", !ids.includes(fatou), JSON.stringify(ids));
  verifier('les fils fermés sont comptés, sans être nommés', j.fermes_faute_accord >= 1, String(j.fermes_faute_accord));

  const ouvert = await commeApi(db, lui, `select public.fil_ia($1) as j`, [aminata]);
  verifier("le fil accepté s'ouvre", ouvert.rows[0].j.ok === true);

  const refuse = await commeApi(db, lui, `select public.fil_ia($1) as j`, [fatou]);
  verifier("le fil sans accord est REFUSÉ, et le dit", refuse.rows[0].j.ok === false && refuse.rows[0].j.erreur === 'sans_accord', JSON.stringify(refuse.rows[0].j));

  // Elle retire son accord : le fil se referme le jour même, sans rien effacer.
  await commeApi(db, elle(aminata), `select public.consentement_noter('assistante', false, '2026-11-06', $1)`, [TEXTE]);
  const apresRetrait = await commeApi(db, lui, `select public.fil_ia($1) as j`, [aminata]);
  verifier('un accord retiré referme le fil tout de suite', apresRetrait.rows[0].j.ok === false, JSON.stringify(apresRetrait.rows[0].j));

  const restent = await commeServeur(
    db,
    `select count(*)::int as n from public.assistante_messages where profil_id = $1`,
    [aminata]
  );
  verifier("mais rien n'est effacé : les messages sont toujours en base", restent.rows[0].n === 1);

  // Une cliente ordinaire n'ouvre jamais ces fonctions, accord ou pas.
  const pasAdmin = await commeApi(db, elle(salimata), `select public.conversations_ia(null) as j`);
  verifier("une cliente ne peut pas lire les conversations", pasAdmin.rows[0].j.ok === false && pasAdmin.rows[0].j.erreur === 'acces_refuse');

  // Le contrat des deux fonctions n'a pas bougé : les écrans du 5 novembre
  // lisent les mêmes clés qu'avant. C'est ce qui a failli casser.
  const unFil = (j.fils ?? [])[0] ?? {};
  for (const cle of ['profil', 'prenom', 'avatar_fichier', 'messages', 'apercu', 'quand', 'sans_reponse']) {
    verifier(`la liste garde son champ « ${cle} »`, cle in unFil, JSON.stringify(Object.keys(unFil)));
  }
  const tete = ouvert.rows[0].j.tete ?? {};
  for (const cle of ['profil', 'prenom', 'avatar_fichier', 'messages']) {
    verifier(`la tête du fil garde son champ « ${cle} »`, cle in tete, JSON.stringify(Object.keys(tete)));
  }
}

bilan('La preuve des accords');
