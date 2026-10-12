// L'assistante : les bornes, les quotas, et surtout ce qui part vers le
// service d'IA extérieur. Ce dernier point est le plus important du fichier :
// une donnée partie ne revient pas.
import { nouvelleBase, nouveauCompte, commeApi, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const auth = { role: 'authenticated', sub: awa };
const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

await rpc(`select public.enregistrer_questionnaire('Awa', 29, 5, current_date - 7) as x`);
// Elle a commandé : son numéro et son quartier sont donc en base.
await rpc(`select public.passer_commande($1::jsonb, 'Awa Ouédraogo', '70123456', 'Dassasgho', 'Chez le tailleur') as x`,
  [JSON.stringify([{ slug: 'serviettes-nuit-10', quantite: 1 }])]);

titre('Poser une question');
{
  const r = await rpc(`select public.assistante_poser('J''ai mal au ventre, qu''est-ce que je peux faire ?') as x`);
  verifier('la question est enregistrée', r.x.ok === true, JSON.stringify(r.x));
  verifier('un identifiant de message revient', typeof r.x.id === 'string' && r.x.id.length === 36);
  const m = await rpc(`select question, reponse from public.assistante_messages where id = $1`, [r.x.id]);
  verifier('la question est bien celle posée', m.question.startsWith("J'ai mal au ventre"));
  verifier('la réponse est encore vide', m.reponse === null);
}

titre('Les bornes de la question');
{
  const vide = await rpc(`select public.assistante_poser('  ') as x`);
  verifier('une question vide est refusée', vide.x.ok === false && vide.x.erreur === 'question_vide');
  const longue = await rpc(`select public.assistante_poser(repeat('pourquoi ', 200)) as x`);
  verifier('une question très longue passe', longue.x.ok === true);
  const l = await rpc(`select length(question) as n from public.assistante_messages where id = $1`, [longue.x.id]);
  verifier('elle est coupée à 500 caractères', l.n === 500, `${l.n} caractères`);
}

titre('La réponse ne s\'enregistre qu\'une fois');
{
  const q = await rpc(`select public.assistante_poser('Quelle serviette pour la nuit ?') as x`);
  const r = await rpc(`select public.assistante_repondre($1, 'Prends les serviettes nuit.', 'serviettes-nuit-10', 120, 40) as x`, [q.x.id]);
  verifier('la réponse est enregistrée', r.x.ok === true, JSON.stringify(r.x));
  const m = await rpc(`select reponse, produit_slug, jetons_entree, jetons_sortie from public.assistante_messages where id = $1`, [q.x.id]);
  verifier('le texte est là', m.reponse.startsWith('Prends'));
  verifier('le produit proposé est retenu', m.produit_slug === 'serviettes-nuit-10');
  verifier('les jetons sont comptés', m.jetons_entree === 120 && m.jetons_sortie === 40);

  const encore = await rpc(`select public.assistante_repondre($1, 'Autre réponse', null, 0, 0) as x`, [q.x.id]);
  verifier('on ne réécrit pas une réponse déjà donnée', encore.x.ok === false && encore.x.erreur === 'message_inconnu');
  const toujours = await rpc(`select reponse from public.assistante_messages where id = $1`, [q.x.id]);
  verifier('le texte d\'origine est intact', toujours.reponse.startsWith('Prends'));
}

titre('Un produit inventé par le modèle ne s\'affiche pas');
{
  const q = await rpc(`select public.assistante_poser('Tu as des tampons ?') as x`);
  await rpc(`select public.assistante_repondre($1, 'Essaie la culotte en or à 300 francs.', 'culotte-en-or-300f', 10, 10) as x`, [q.x.id]);
  const m = await rpc(`select produit_slug from public.assistante_messages where id = $1`, [q.x.id]);
  verifier('le produit inconnu est effacé', m.produit_slug === null, `slug ${m.produit_slug}`);
}

titre("Ce qui part vers le service d'IA, et rien de plus");
{
  const r = await rpc(`select public.assistante_contexte() as c`);
  const c = r.c;
  const texte = JSON.stringify(c);
  verifier('le prénom part', c.prenom === 'Awa');
  verifier('le jour du cycle part', c.jour_du_cycle === 8, `jour ${c.jour_du_cycle}`);
  verifier('la phase part', c.phase === 'elan');
  verifier('le catalogue part', Array.isArray(c.catalogue) && c.catalogue.length > 0);
  verifier('les trois derniers échanges partent', Array.isArray(c.echanges));
  verifier('les échanges sont bornés à trois', c.echanges.length <= 3, `${c.echanges.length} échanges`);

  verifier('le numéro de téléphone NE part PAS', !texte.includes('70123456'), 'le numéro est dans le contexte');
  verifier('le quartier NE part PAS', !texte.includes('Dassasgho'), 'le quartier est dans le contexte');
  verifier('le point de repère NE part PAS', !texte.includes('tailleur'), 'le repère est dans le contexte');
  verifier('le nom de famille NE part PAS', !texte.includes('Ouédraogo'), 'le nom complet est dans le contexte');
  verifier('aucun numéro de commande NE part', !texte.includes('MD-'), 'un numéro de commande est dans le contexte');
  verifier("l'identifiant du compte NE part PAS", !texte.includes(awa), "l'identifiant est dans le contexte");
}

titre('Le journal intime ne part pas non plus');
{
  await rpc(`select public.noter_journee(current_date, 'abondant', 3, array['ventre'], 'Mon secret à moi') as x`);
  const r = await rpc(`select public.assistante_contexte() as c`);
  verifier('la note du journal reste sur le téléphone', !JSON.stringify(r.c).includes('Mon secret'),
    'la note est partie dans le contexte');
}

titre('Le catalogue envoyé ne contient que des produits en stock');
{
  await db.query(`update public.produits set stock = 0 where slug = 'kit-premieres-regles'`);
  const r = await rpc(`select public.assistante_contexte() as c`);
  const slugs = r.c.catalogue.map((p) => p.slug);
  verifier('le produit en rupture est retiré', !slugs.includes('kit-premieres-regles'));
  verifier('les autres restent', slugs.includes('serviettes-nuit-10'));
  await db.query(`update public.produits set stock = 20 where slug = 'kit-premieres-regles'`);
}

titre("Le quota par minute protège la formule d'Arthur");
{
  const s = { role: 'authenticated', sub: awa, ip: '41.78.3.3' };
  let refus = 0;
  for (let i = 0; i < 9; i += 1) {
    const r = await rpc(`select public.assistante_poser('Question numéro ${i}') as x`, [], s);
    if (r.x.ok === false && r.x.erreur === 'trop_vite') refus += 1;
  }
  verifier('au-delà de 6 questions par minute, on refuse', refus === 3, `${refus} refus`);
}

titre('Le quota par jour aussi');
{
  const lea = await nouveauCompte(db, 'lea', 'Léa');
  const s = { role: 'authenticated', sub: lea };
  await db.query(`update public.reglages set valeur = '3' where cle = 'assistante_quota_jour'`);
  const resultats = [];
  for (let i = 0; i < 5; i += 1) {
    const r = await rpc(`select public.assistante_poser('Question ${i}') as x`, [], s);
    resultats.push(r.x);
  }
  verifier('les trois premières passent', resultats.slice(0, 3).every((x) => x.ok === true));
  verifier('la quatrième est refusée', resultats[3].ok === false && resultats[3].erreur === 'quota_jour');
  await db.query(`update public.reglages set valeur = '40' where cle = 'assistante_quota_jour'`);
}

titre("L'assistante s'éteint d'un réglage");
{
  await db.query(`update public.reglages set valeur = 'non' where cle = 'assistante_active'`);
  const r = await rpc(`select public.assistante_poser('Tu es là ?') as x`);
  verifier('éteinte, elle refuse poliment', r.x.ok === false && r.x.erreur === 'assistante_eteinte');
  await db.query(`update public.reglages set valeur = 'oui' where cle = 'assistante_active'`);
}

titre('Effacer son fil');
{
  const avant = await rpc(`select count(*)::int as n from public.assistante_messages where profil_id = auth.uid()`);
  verifier('elle a bien des messages', avant.n > 0);
  const r = await rpc(`select public.effacer_mon_fil() as x`);
  verifier("l'effacement passe", r.x.ok === true);
  const apres = await rpc(`select count(*)::int as n from public.assistante_messages where profil_id = auth.uid()`);
  verifier('le fil est vide', apres.n === 0);
}

bilan('Assistante');
await db.close();
