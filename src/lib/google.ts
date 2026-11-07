/**
 * Google est-il réellement allumé sur la base ?
 *
 * ──────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Arthur, le 7 novembre 2026, pour la troisième fois : « le bouton continuer
 * avec Google, je ne le vois toujours pas. Je ne sais pas pourquoi tu ne veux
 * pas mettre ça. »
 *
 * Le bouton était caché par une constante écrite à la main,
 * `GOOGLE_DISPONIBLE = false`, posée le matin même parce que le fournisseur
 * Google avait disparu avec l'ancienne base. La raison tenait : un bouton qui
 * ne peut pas aboutir est pire que pas de bouton, il occupe la place du
 * chemin qui marche et apprend à celle qui arrive que le site est cassé.
 *
 * Mais une constante écrite à la main est une mauvaise réponse à une bonne
 * question. Elle oblige à modifier le code, à le pousser et à redéployer le
 * jour où Google revient, et surtout elle oblige quelqu'un à SE SOUVENIR de
 * le faire. Entre-temps, Arthur regarde sa page et ne comprend pas.
 *
 * ON DEMANDE DONC À LA BASE. Supabase publie la liste de ses fournisseurs de
 * connexion sur une adresse ouverte, `/auth/v1/settings`. Le bouton apparaît
 * de lui-même dans la minute où Google est activé, et disparaît de lui-même
 * s'il est coupé. Plus rien à se rappeler, plus de code à changer.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TROIS PRÉCAUTIONS, CHACUNE POUR UNE PANNE VÉCUE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. ON GARDE LA RÉPONSE EN MÉMOIRE. Sans cela, chaque affichage de l'écran
 *    de connexion ajouterait un aller-retour réseau à une page qu'Arthur
 *    trouve déjà lente. Dix minutes : assez pour que le branchement de Google
 *    se voie presque tout de suite, assez long pour que la question ne soit
 *    posée qu'une fois par instance et par quart d'heure.
 *
 * 2. ON BORNE L'ATTENTE À DEUX SECONDES. Les pages meurent à quinze secondes
 *    sur Vercel, et cette limite est partagée avec tout le reste. Le
 *    6 novembre, un appel d'authentification sans borne a mis l'application
 *    entière hors service pendant des heures : toutes les pages, pour toutes
 *    les femmes connectées, répondaient 504. On ne refait pas ça pour savoir
 *    si un bouton doit s'afficher.
 *
 * 3. EN CAS DE DOUTE, ON RÉPOND NON. Réseau coupé, délai dépassé, réponse
 *    incompréhensible : le bouton ne s'affiche pas. Ne pas montrer un bouton
 *    qui marche est un désagrément ; en montrer un qui ne marche pas est ce
 *    qu'on essaie justement d'éviter.
 */
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';

/** Dix minutes. Voir la précaution 1. */
export const DUREE_MEMOIRE_MS = 10 * 60 * 1000;

/** Deux secondes. Voir la précaution 2. */
export const DELAI_MS = 2000;

interface Souvenir {
  quand: number;
  actif: boolean;
}

let souvenir: Souvenir | null = null;

/** Pour les essais : oublier ce qu'on croit savoir. */
export function oublierGoogle(): void {
  souvenir = null;
}

/**
 * Lit la liste des fournisseurs et dit si Google en fait partie.
 *
 * Ne lève jamais. Rend `false` dès qu'il y a le moindre doute.
 */
export async function googleActif({
  url = PUBLIC_SUPABASE_URL,
  cle = PUBLIC_SUPABASE_ANON_KEY,
  delaiMs = DELAI_MS,
  dureeMs = DUREE_MEMOIRE_MS,
  chercher = fetch,
  maintenant = () => Date.now(),
} = {}): Promise<boolean> {
  if (!url || !cle) return false;

  const t = maintenant();
  if (souvenir && t - souvenir.quand < dureeMs) return souvenir.actif;

  let actif = false;
  try {
    const r = await chercher(`${url}/auth/v1/settings`, {
      headers: { apikey: cle },
      signal: AbortSignal.timeout(delaiMs),
    });
    if (r.ok) {
      const lu = (await r.json()) as { external?: Record<string, unknown> };
      actif = lu?.external?.google === true;
    }
  } catch {
    // Réseau coupé, délai dépassé, réponse illisible : on répond non, et on
    // ne garde PAS cette réponse longtemps (voir juste en dessous).
    actif = false;
  }

  // Un « non » venu d'une panne ne doit pas tenir dix minutes : sinon une
  // coupure de deux secondes cacherait le bouton pour un quart d'heure. On ne
  // garde longtemps que les réponses qu'on a vraiment obtenues.
  souvenir = { quand: actif ? t : t - dureeMs + 30_000, actif };
  return actif;
}
