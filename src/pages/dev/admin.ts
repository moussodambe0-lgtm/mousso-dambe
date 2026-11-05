/**
 * Entrer dans l'administration en local, sans rien taper.
 *
 * Arthur, le 26 octobre 2026 : « supprime le fait qu'on doit se connecter, fais
 * que si je clique sur le lien j'ai accès sans mettre mon email [...] c'est pas
 * encore en ligne, c'est en local, je veux voir c'est comment d'abord. Après on
 * le remettra évidemment avant de le déployer. »
 *
 * CE RACCOURCI N'EXISTE PAS EN PRODUCTION, et ce n'est pas une promesse : la
 * première ligne du code renvoie une page introuvable dès que le site tourne en
 * production. Il n'y a donc rien à « remettre avant de déployer », rien à
 * désactiver, et rien à oublier. C'était la seule façon acceptable de donner
 * cet accès : l'administration expose les noms, les numéros et les adresses de
 * toutes les clientes, et une porte ouverte en ligne serait indéfendable.
 *
 * Comment : on se connecte pour de vrai, avec le compte administrateur que le
 * banc local a créé au démarrage (l'adresse du coffre, mot de passe
 * « motdepasse »). La session obtenue est une vraie session, donc toutes les
 * règles d'accès de la base continuent de s'appliquer : ce raccourci fait
 * gagner la saisie, il ne contourne aucune protection.
 *
 * À utiliser : http://admin.localhost:4322/dev/admin
 */
import type { APIRoute } from 'astro';
import fs from 'node:fs';
import { clientPublic, poserSession, baseConfiguree } from '../../lib/supabase';

export const prerender = false;

// Deux PC, deux comptes Windows, deux emplacements du dossier Jarvis : un seul
// chemin en dur marchait sur une machine et pas sur l'autre. On prend le
// premier des emplacements connus qui existe. Même liste que outils/coffre.mjs.
const COFFRES = [
  'C:/Users/larou/OneDrive/Desktop/Jarvis/secrets/.env',
  'C:/Users/larou/Desktop/Jarvis/secrets/.env',
  'C:/Users/USER/Desktop/Jarvis/secrets/.env',
];

/** L'adresse de l'administrateur, lue dans le coffre, hors du dépôt. */
function adresseAdmin(): string | null {
  try {
    const COFFRE = COFFRES.find((c) => fs.existsSync(c));
    if (!COFFRE) return null;
    const trouvees: string[] = [];
    for (const ligne of fs.readFileSync(COFFRE, 'utf8').split(/\r?\n/)) {
      const propre = ligne.trim();
      if (!propre || propre.startsWith('#')) continue;
      const m = /^(.+?)\s*=\s*(.*)$/.exec(propre);
      if (m && /e-?mail.*admin.*mousso/i.test(m[1].trim()) && m[2].trim()) trouvees.push(m[2].trim());
    }
    // Plusieurs lignes : on ne devine pas, comme partout ailleurs dans ce projet.
    return trouvees.length === 1 ? trouvees[0] : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async (contexte) => {
  // LE GARDE-FOU. En production, cette route n'existe pas.
  if (import.meta.env.PROD) {
    return new Response('Not found', { status: 404 });
  }

  if (!baseConfiguree()) {
    return new Response("L'application n'est pas branchée à une base.", { status: 503 });
  }

  const email = adresseAdmin();
  if (!email) {
    return new Response(
      "Aucune adresse d'administrateur lisible dans le coffre (ou plusieurs lignes la donnent).",
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  const { data, error } = await clientPublic(contexte as never).auth.signInWithPassword({
    email,
    password: 'motdepasse',
  });

  if (error || !data?.session) {
    return new Response(
      `La connexion automatique a échoué : ${error?.message ?? 'pas de session'}.\n\n` +
        "Le banc local recrée sa base à chaque démarrage : si le serveur vient d'être relancé, " +
        'réessaie. Si cela persiste, le compte administrateur n\'a pas été créé au démarrage ' +
        '(regarde la ligne « Administrateur : » dans la sortie de npm run demo).',
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }

  poserSession(contexte as never, data.session);
  return contexte.redirect('/vendeur', 303);
};
