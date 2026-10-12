// Le prix de la livraison, ouvert en lecture au site, et rien d'autre.
//
// Point 15 de l'audit du 12 octobre 2026 : trois pages écrivaient ce prix en
// dur. Il est maintenant lu en base. Ce fichier vérifie les deux côtés de la
// correction : que le site peut le lire, et que la porte ouverte pour cela ne
// laisse rien passer d'autre.
import { nouvelleBase, nouveauCompte, commeApi, echoue, verifier, bilan, titre } from './banc.mjs';

const db = await nouvelleBase();
const awa = await nouveauCompte(db, 'awa', 'Awa');
const auth = { role: 'authenticated', sub: awa };
const anon = { role: 'anon' };
const rpc = async (sql, params = [], session = auth) => (await commeApi(db, session, sql, params)).rows[0];

titre('Le prix de la livraison se lit, connectée ou non');
{
  const visiteuse = await rpc(`select public.prix_livraison() as p`, [], anon);
  verifier('une visiteuse sans compte le lit', visiteuse.p === 1000, `${visiteuse.p}`);
  const cliente = await rpc(`select public.prix_livraison() as p`);
  verifier('une cliente connectée le lit', cliente.p === 1000, `${cliente.p}`);
}

titre("L'écran et la base donnent le même chiffre");
{
  // C'est tout l'objet de la correction : avant, l'écran disait 1000 pendant
  // que la base facturait autre chose.
  await db.query(`update public.reglages set valeur = '1500' where cle = 'livraison_cfa'`);
  const lu = await rpc(`select public.prix_livraison() as p`, [], anon);
  verifier('le changement de réglage se voit tout de suite', lu.p === 1500, `${lu.p}`);

  const commande = await rpc(
    `select public.passer_commande($1::jsonb, 'Awa', '70123456', 'Zogona', '') as x`,
    [JSON.stringify([{ slug: 'serviettes-jour-10', quantite: 1 }])]
  );
  verifier('la commande passe', commande.x.ok === true, JSON.stringify(commande.x));
  verifier(
    'la base facture le même prix que celui affiché',
    commande.x.total === 1000 + 1500,
    `total ${commande.x.total}`
  );
  await db.query(`update public.reglages set valeur = '1000' where cle = 'livraison_cfa'`);
}

titre("La porte ouverte ne laisse passer que ce chiffre");
{
  await echoue(
    "la table des réglages reste fermée",
    () => rpc(`select * from public.reglages`, [], anon),
    'permission'
  );
  await echoue(
    "la lecture libre des réglages reste fermée",
    () => rpc(`select public.reglage('cle_serveur_sha256')`, [], anon),
    'permission'
  );
  await echoue(
    "la lecture des entiers reste fermée",
    () => rpc(`select public.reglage_entier('assistante_quota_jour', 0)`, [], anon),
    'permission'
  );

  // Et la preuve que l'empreinte de la clé n'est pas atteignable par ce
  // chemin : la fonction ne prend aucun paramètre, elle ne sait dire qu'une
  // chose.
  const arguments_ = await rpc(
    `select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'prix_livraison' and p.pronargs = 0`,
    [],
    anon
  );
  verifier('la fonction ne prend aucun paramètre', arguments_.n === 1);
}

bilan('Prix de la livraison');
await db.close();
