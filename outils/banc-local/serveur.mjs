/**
 * BANC LOCAL : un faux Supabase, pour voir l'application tourner.
 *
 * Il n'a RIEN à voir avec la production, et rien ici ne part dans le site. Il
 * existe pour une seule raison : tant que le projet Supabase d'Arthur n'est pas
 * créé, on ne pourrait pas regarder l'application, et une application qu'on
 * n'a pas regardée n'est pas finie.
 *
 * Ce qu'il fait : il parle le langage de PostgREST et de Supabase Auth, juste
 * assez pour les requêtes que ce site envoie vraiment, et il exécute tout sur
 * PGlite (Postgres en WebAssembly) avec les migrations réelles, le rôle réel
 * (anon ou authenticated) et les règles d'accès réelles. Donc ce qu'on voit à
 * l'écran est ce que la vraie base rendrait, règles de sécurité comprises.
 *
 * Ce qu'il NE fait PAS : vérifier les jetons (il les décode sans contrôler la
 * signature), hacher les mots de passe, envoyer des emails. À n'exposer sur
 * aucun réseau, à ne jamais utiliser ailleurs qu'en local.
 *
 * Lancer :   node outils/banc-local/serveur.mjs
 * Puis :     npx astro dev   (avec le .env que ce script affiche)
 */
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATIONS = path.join(RACINE, 'supabase', 'migrations');
const PORT = 5433;
const CLE_SERVEUR = 'cle-du-banc-local-mousso-dambe';

const SOCLE = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  mot_de_passe text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const db = new PGlite();
await db.exec(SOCLE);
for (const f of fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  } catch (e) {
    console.error(`Migration ${f} : ${e.message}`);
    process.exit(1);
  }
}
await db.query(
  `update public.reglages set valeur = encode(sha256(convert_to($1, 'UTF8')), 'hex') where cle = 'cle_serveur_sha256'`,
  [CLE_SERVEUR]
);

// Un compte de démonstration, pour voir tout de suite les écrans connectés.
const DEMO_ID = randomUUID();
await db.query(
  `insert into auth.users (id, email, mot_de_passe, raw_user_meta_data) values ($1, $2, $3, $4)`,
  [DEMO_ID, 'awa@essai.bf', 'motdepasse', JSON.stringify({ prenom: 'Awa' })]
);
const comme = (sql, params, claims) => executer(sql, params, claims);

// PGlite n'a qu'une seule connexion : le rôle et les claims sont un état
// partagé. Deux requêtes qui se chevauchent se voleraient leur identité, et la
// page afficherait au hasard les données d'une autre. On les met donc à la
// queue leu leu. Le vrai Supabase n'a pas ce problème, chaque requête y a sa
// propre connexion.
let file = Promise.resolve();

function executer(sql, params = [], claims = { role: 'anon', sub: null }) {
  const suivant = file.then(() => executerVraiment(sql, params, claims));
  file = suivant.catch(() => {});
  return suivant;
}

async function executerVraiment(sql, params = [], claims = { role: 'anon', sub: null }) {
  await db.exec('reset role;');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
  await db.query(`select set_config('request.headers', $1, false)`, [
    JSON.stringify({ 'x-md-cle': CLE_SERVEUR, 'x-md-ip': '127.0.0.1' }),
  ]);
  await db.exec(`set role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'};`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
}

// Des données de démonstration : trois cycles passés et quelques journées
// notées, pour que les écrans ne soient pas vides quand on les regarde.
const claimsDemo = { role: 'authenticated', sub: DEMO_ID };
await comme(`select public.enregistrer_questionnaire('Awa', 29, 5, current_date - 7)`, [], claimsDemo);
for (const jours of [65, 36, 7]) {
  await comme(`select public.declarer_regles(current_date - ${jours})`, [], claimsDemo);
}
await comme(
  `select public.noter_journee(current_date - 1, 'rien', 1, array['fatigue','sucre'], 'Grosse journée au marché')`,
  [], claimsDemo
);
await comme(
  `select public.noter_journee(current_date - 7, 'abondant', 3, array['ventre','dos'], '')`,
  [], claimsDemo
);
await comme(
  `select public.assistante_poser('J''ai mal au ventre pendant mes règles, qu''est-ce que je peux faire ?')`,
  [], claimsDemo
);
const { rows: posees } = await comme(
  `select id from public.assistante_messages where profil_id = auth.uid() order by cree_le desc limit 1`,
  [], claimsDemo
);
await comme(
  `select public.assistante_repondre($1,
     'Des douleurs pendant les règles, c''est courant : l''utérus se contracte pour évacuer. Trois choses qui soulagent, et qui ne coûtent rien :
- Une bouteille d''eau chaude sur le bas du ventre, 15 minutes.
- Marcher un peu, même dix minutes dans la cour.
- Boire chaud, et dormir assez les jours d''avant.

Si la douleur t''empêche d''aller en cours ou au travail, va voir une sage-femme. Ce n''est pas à endurer.',
     'serviettes-nuit-10', 180, 120)`,
  [posees[0].id], claimsDemo
);
await comme(
  `select public.passer_commande($1::jsonb, 'Awa Ouédraogo', '70123456', 'Dassasgho', 'À côté de la pharmacie Nabi')`,
  [JSON.stringify([
    { slug: 'culotte-flux-abondant', taille: 'M', quantite: 1 },
    { slug: 'serviettes-nuit-10', quantite: 1 },
  ])],
  claimsDemo
);

// Une deuxième femme, pour que la boîte de réception d'Arthur ait deux fils
// et qu'on voie tout de suite ce que c'est que de répondre à quelqu'un.
const AUTRE_ID = randomUUID();
await db.query(
  `insert into auth.users (id, email, mot_de_passe, raw_user_meta_data) values ($1, $2, $3, $4)`,
  [AUTRE_ID, 'bintou@essai.bf', 'motdepasse', JSON.stringify({ prenom: 'Bintou' })]
);
const claimsAutre = { role: 'authenticated', sub: AUTRE_ID };
await comme(`select public.enregistrer_questionnaire('Bintou', 31, 6, current_date - 12)`, [], claimsAutre);
await comme(
  `select public.ecrire_a_la_boutique('Bonjour, est-ce que la culotte existe en taille L ?', 'culotte-flux-abondant')`,
  [], claimsAutre
);
await comme(`select public.changer_telephone('70889900')`, [], claimsAutre);

// Et le compte de démonstration est administrateur, pour que /admin se
// regarde sur ce PC. C'est le banc local, pas la production : en ligne,
// Arthur s'ajoutera lui-même par une ligne de SQL.
await db.query(`insert into public.administrateurs (profil_id) values ($1)`, [DEMO_ID]);

// --- Traduction du langage de PostgREST vers du SQL -------------------------

const OPERATEURS = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'like', ilike: 'ilike', is: 'is',
};

function colonneSure(nom) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(nom)) throw new Error(`colonne refusée : ${nom}`);
  return `"${nom}"`;
}

function construireSelect(table, params) {
  const choix = params.get('select') ?? '*';
  // « count(*) » quand supabase-js demande seulement le nombre.
  const colonnes = choix
    .split(',')
    .map((c) => c.trim().split(':')[0].trim())
    .filter((c) => c && c !== '*')
    .map(colonneSure);
  const liste = colonnes.length > 0 ? colonnes.join(', ') : '*';

  const valeurs = [];
  const ou = [];
  const et = [];

  for (const [clef, valeur] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'or'].includes(clef)) continue;
    const [op, ...reste] = valeur.split('.');
    const brut = reste.join('.');
    if (op === 'in') {
      const items = brut.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      const trous = items.map((v) => {
        valeurs.push(v);
        return `$${valeurs.length}`;
      });
      et.push(`${colonneSure(clef)} in (${trous.join(', ')})`);
    } else if (OPERATEURS[op]) {
      if (op === 'is') {
        et.push(`${colonneSure(clef)} is ${brut === 'null' ? 'null' : brut === 'true' ? 'true' : 'false'}`);
      } else {
        valeurs.push(brut);
        et.push(`${colonneSure(clef)} ${OPERATEURS[op]} $${valeurs.length}`);
      }
    }
  }

  const expressionOu = params.get('or');
  if (expressionOu) {
    for (const bout of expressionOu.replace(/^\(|\)$/g, '').split(',')) {
      const [col, op, ...v] = bout.split('.');
      if (!OPERATEURS[op]) continue;
      valeurs.push(v.join('.'));
      ou.push(`${colonneSure(col)} ${OPERATEURS[op]} $${valeurs.length}`);
    }
  }

  const conditions = [...et];
  if (ou.length > 0) conditions.push(`(${ou.join(' or ')})`);

  let sql = `select ${liste} from public.${colonneSure(table).replace(/"/g, '')}`;
  if (conditions.length > 0) sql += ` where ${conditions.join(' and ')}`;

  const tri = params.get('order');
  if (tri) {
    const [col, ...options] = tri.split('.');
    sql += ` order by ${colonneSure(col)} ${options.includes('desc') ? 'desc' : 'asc'}`;
  }
  const limite = params.get('limit');
  if (limite && /^\d+$/.test(limite)) sql += ` limit ${limite}`;

  return { sql, valeurs };
}

/**
 * Traduit une valeur JSON en ce que Postgres attend.
 *
 * Le vrai PostgREST connaît le type de chaque paramètre et fait la conversion
 * tout seul. Ici on devine : une liste de textes devient un tableau Postgres
 * (`{a,b}`, pour un paramètre `text[]`), tout le reste devient du JSON (pour
 * un paramètre `jsonb`). C'est suffisant pour les deux cas de cette
 * application : les symptômes du journal, et le panier.
 */
function valeurPostgres(v) {
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) {
      return `{${v.map((x) => `"${String(x).replace(/(["\\])/g, '\\$1')}"`).join(',')}}`;
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return v;
}

function jetonPour(utilisateur) {
  // Les trois morceaux sont du base64url, comme un vrai jeton. Ce n'est pas
  // du zèle : supabase-js décode l'en-tête avant d'accepter une session, et
  // avec « banc. » en tête il répondait « JWT not in base64url format ». La
  // page Compte affichait alors « réessaie plus tard » pour une raison qui
  // n'avait rien à voir. Trouvé le 12 octobre 2026.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const entete = b64({ alg: 'none', typ: 'JWT' });
  const corps = b64({
    sub: utilisateur.id,
    email: utilisateur.email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: 9999999999,
  });
  // La signature n'est jamais vérifiée ici : c'est un banc local, pas une
  // base en ligne. En production, Supabase signe pour de vrai.
  return `${entete}.${corps}.bancmousso`;
}

function claimsDe(entetes) {
  const brut = entetes.authorization ?? '';
  // Un en-tête peut porter plusieurs valeurs collées (« Bearer a, Bearer b ») :
  // on prend la dernière, celle que la bibliothèque a posée en dernier.
  const jeton = brut.split(/,\s*/).pop().replace(/^Bearer\s+/i, '');
  const morceaux = jeton.split('.');
  if (morceaux.length !== 3) return { role: 'anon', sub: null };
  // La signature n'est pas vérifiée : c'est un banc local. Mais le jeton doit
  // avoir la FORME d'un vrai jeton, parce que supabase-js refuse les autres.
  if (morceaux[2] !== 'bancmousso') return { role: 'anon', sub: null };
  try {
    const lu = JSON.parse(Buffer.from(morceaux[1], 'base64url').toString('utf8'));
    if (!lu.sub) return { role: 'anon', sub: null };
    return { role: 'authenticated', sub: lu.sub, email: lu.email };
  } catch {
    return { role: 'anon', sub: null };
  }
}

async function corpsJson(requete) {
  const bouts = [];
  for await (const bout of requete) bouts.push(bout);
  if (bouts.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(bouts).toString('utf8'));
  } catch {
    return {};
  }
}

async function utilisateurPar(champ, valeur) {
  await db.exec('reset role;');
  const { rows } = await db.query(`select id, email, raw_user_meta_data from auth.users where ${champ} = $1`, [valeur]);
  return rows[0] ?? null;
}

const serveur = createServer(async (requete, reponse) => {
  const url = new URL(requete.url, `http://localhost:${PORT}`);
  const chemin = url.pathname;
  const claims = claimsDe(requete.headers);
  if (process.env.BANC_BAVARD) {
    console.log(`${requete.method} ${chemin}${url.search} (${claims.role})`);
  }

  const repondre = (code, corps, entetes = {}) => {
    const texte = corps === null ? '' : JSON.stringify(corps);
    reponse.writeHead(code, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      ...entetes,
    });
    reponse.end(texte);
  };

  if (requete.method === 'OPTIONS') return repondre(200, {});

  try {
    // --- Authentification ---
    if (chemin === '/auth/v1/signup') {
      const corps = await corpsJson(requete);
      // Sans adresse, c'est une entrée anonyme (`signInAnonymously`), qui
      // passe par la même porte dans le vrai Supabase. Elle ne doit surtout
      // pas être confondue avec « une utilisatrice sans email existe déjà ».
      const anonyme = !corps.email;
      const existe = anonyme ? null : await utilisateurPar('email', corps.email);
      if (existe) return repondre(400, { message: 'User already registered' });
      await db.exec('reset role;');
      const { rows } = await db.query(
        `insert into auth.users (email, mot_de_passe, raw_user_meta_data) values ($1, $2, $3) returning id, email`,
        [corps.email ?? null, corps.password ?? null, JSON.stringify(corps.data ?? {})]
      );
      const u = rows[0];
      return repondre(200, {
        access_token: jetonPour(u),
        refresh_token: `r.${u.id}`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 9999999999,
        user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }

    if (chemin === '/auth/v1/token') {
      const corps = await corpsJson(requete);
      const type = url.searchParams.get('grant_type');
      let u = null;
      if (type === 'refresh_token') {
        u = await utilisateurPar('id', String(corps.refresh_token ?? '').replace(/^r\./, ''));
      } else {
        u = await utilisateurPar('email', corps.email);
        if (u) {
          await db.exec('reset role;');
          const { rows } = await db.query(`select mot_de_passe from auth.users where id = $1`, [u.id]);
          if (rows[0]?.mot_de_passe !== corps.password) u = null;
        }
      }
      if (!u) return repondre(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return repondre(200, {
        access_token: jetonPour(u),
        refresh_token: `r.${u.id}`,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 9999999999,
        user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }

    if (chemin === '/auth/v1/user' && requete.method === 'GET') {
      if (!claims.sub) return repondre(401, { message: 'invalid claim' });
      const u = await utilisateurPar('id', claims.sub);
      if (!u) return repondre(401, { message: 'user not found' });
      return repondre(200, {
        id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: u.raw_user_meta_data ?? {}, created_at: new Date().toISOString(),
      });
    }

    // Attacher une adresse (et un mot de passe) à une identité déjà là.
    // C'est ce qui rend une entrée anonyme récupérable : même identifiant,
    // donc mêmes cycles, même journal, mêmes commandes.
    if (chemin === '/auth/v1/user' && (requete.method === 'PUT' || requete.method === 'PATCH')) {
      if (!claims.sub) return repondre(401, { message: 'pas de session' });
      const corps = await corpsJson(requete);
      if (corps.email) {
        const pris = await utilisateurPar('email', corps.email);
        if (pris && pris.id !== claims.sub) return repondre(422, { message: 'User already registered' });
      }
      await db.exec('reset role;');
      await db.query(
        `update auth.users
            set email = coalesce($2, email),
                mot_de_passe = coalesce($3, mot_de_passe)
          where id = $1`,
        [claims.sub, corps.email ?? null, corps.password ?? null]
      );
      const u = await utilisateurPar('id', claims.sub);
      return repondre(200, {
        id: u.id,
        email: u.email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
      });
    }

    if (chemin === '/auth/v1/logout') return repondre(204, null);

    // --- Fonctions de la base ---
    if (chemin.startsWith('/rest/v1/rpc/')) {
      const nom = chemin.slice('/rest/v1/rpc/'.length);
      if (!/^[a-z_][a-z0-9_]*$/.test(nom)) return repondre(400, { message: 'fonction refusée' });
      const corps = await corpsJson(requete);
      const noms = Object.keys(corps);
      const trous = noms.map((n, i) => `${n} => $${i + 1}`);
      const valeurs = noms.map((n) => valeurPostgres(corps[n]));
      const sql = `select public.${nom}(${trous.join(', ')}) as resultat`;
      const { rows } = await executer(sql, valeurs, claims);
      return repondre(200, rows[0]?.resultat ?? null);
    }

    // --- Lecture des tables ---
    if (chemin.startsWith('/rest/v1/')) {
      const table = chemin.slice('/rest/v1/'.length);
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) return repondre(400, { message: 'table refusée' });
      const { sql, valeurs } = construireSelect(table, url.searchParams);
      const unSeul = String(requete.headers.accept ?? '').includes('vnd.pgrst.object');
      const veutCompte = String(requete.headers.prefer ?? '').includes('count=');

      if (requete.method === 'HEAD' || (veutCompte && requete.method === 'GET' && url.searchParams.get('select') === '*')) {
        const compte = await executer(sql.replace(/^select .* from/, 'select count(*) as n from'), valeurs, claims);
        const n = Number(compte.rows[0]?.n ?? 0);
        reponse.writeHead(200, {
          'content-type': 'application/json',
          'content-range': `0-${Math.max(n - 1, 0)}/${n}`,
          'access-control-expose-headers': 'content-range',
          'access-control-allow-origin': '*',
        });
        return reponse.end(requete.method === 'HEAD' ? '' : '[]');
      }

      const { rows } = await executer(sql, valeurs, claims);
      if (unSeul) {
        if (rows.length === 0) return repondre(200, null);
        return repondre(200, rows[0]);
      }
      return repondre(200, rows, {
        'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
        'access-control-expose-headers': 'content-range',
      });
    }

    return repondre(404, { message: 'inconnu' });
  } catch (e) {
    // Une erreur de la base se présente comme PostgREST le ferait, pour que le
    // site affiche ses vrais messages d'erreur.
    return repondre(400, { message: e.message, code: e.code ?? 'erreur' });
  }
});

serveur.listen(PORT, '127.0.0.1', () => {
  const empreinte = createHash('sha256').update(CLE_SERVEUR).digest('hex').slice(0, 8);
  console.log(`\nBanc local prêt sur http://127.0.0.1:${PORT}`);
  console.log(`Compte de démonstration : awa@essai.bf / motdepasse`);
  console.log(`\nÀ mettre dans le .env DE DÉVELOPPEMENT, et nulle part ailleurs :`);
  console.log(`PUBLIC_SUPABASE_URL=http://127.0.0.1:${PORT}`);
  console.log(`PUBLIC_SUPABASE_ANON_KEY=cle-anon-du-banc`);
  console.log(`MD_CLE_SERVEUR=${CLE_SERVEUR}`);
  console.log(`(empreinte posée en base : ${empreinte}…)`);
  console.log(`
  /!\\  Ces trois valeurs sont écrites en clair dans le dépôt : elles ne prouvent
       rien. En production il faut une vraie adresse en https et une clé serveur
       tirée au hasard. Le site refuse de démarrer en production avec celles-ci
       (voir src/lib/configuration.ts).
`);
});
