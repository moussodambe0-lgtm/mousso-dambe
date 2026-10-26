/**
 * La visiteuse : qui elle est, et ce que l'application sait de son cycle.
 *
 * Toute page qui parle d'elle passe par ici. Si la session est expirée, on la
 * rafraîchit une fois ; si ça échoue, on la déconnecte proprement plutôt que
 * de montrer une page à moitié vide.
 */
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import {
  clientSession,
  jetonDeSession,
  poserSession,
  retirerSession,
  baseConfiguree,
  type ContexteAstro,
} from './supabase';
import type { ChoixAvatar } from './avatar';

export interface Visiteuse {
  id: string;
  email: string | null;
  prenom: string;
  questionnaireFini: boolean;
  rappelRegles: boolean;
  notificationsDiscretes: boolean;
  codeOuverture: boolean;
  cycleMoyen: number;
  dureeRegles: number;
  telephone: string | null;
  quartier: string | null;
  repere: string | null;
  /** Le nom donné au livreur, distinct du prénom utilisé dans l'application. */
  nomLivraison: string | null;
  positionLat: number | null;
  positionLng: number | null;
  /**
   * Le fichier choisi dans la galerie de photos de profil (public/avatars/),
   * ou null tant qu'elle n'en a pas choisi une (décision d'Arthur du
   * 13 octobre 2026 : plus d'avatar automatique).
   */
  avatarFichier: string | null;
  /**
   * Les traits qu'elle a choisis pour son avatar dessine, ou null si elle n'a
   * rien compose (Arthur, le 26 octobre 2026 : « les clientes doivent pouvoir
   * personnaliser les avatars, les habiller et tout »). `avatarFichier` passe
   * devant quand les deux existent, mais la base n'en garde jamais deux.
   */
  avatarChoix: ChoixAvatar | null;
}

export async function visiteuse(astro: ContexteAstro): Promise<Visiteuse | null> {
  if (!baseConfiguree()) return null;
  const jeton = jetonDeSession(astro);
  if (!jeton) return null;

  let client = clientSession(astro);
  if (!client) return null;

  // Le jeton est passé explicitement : sans argument, supabase-js cherche une
  // session gardée dans le navigateur, qui n'existe pas côté serveur. Il
  // répondrait alors « pas de session » alors que le cookie est là, et toute
  // l'application croirait la visiteuse déconnectée.
  let { data: compte } = await client.auth.getUser(jeton.access_token);

  // Le jeton d'accès ne vit qu'une heure. Elle ne doit pas être déconnectée
  // pour autant : on échange le jeton de rafraîchissement, une seule fois.
  if (!compte?.user && jeton.refresh_token) {
    const neuf = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await neuf.auth.refreshSession({ refresh_token: jeton.refresh_token });
    if (data?.session) {
      poserSession(astro, {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      client = clientSession(astro);
      if (!client) return null;
      compte = (await client.auth.getUser(data.session.access_token)).data;
    } else {
      retirerSession(astro);
      return null;
    }
  }

  if (!compte?.user) {
    retirerSession(astro);
    return null;
  }

  const { data: profil } = await client
    .from('profils')
    .select('prenom, questionnaire_fini, rappel_regles, notifications_discretes, code_ouverture, cycle_moyen, duree_regles, telephone, quartier, repere, nom_livraison, position_lat, position_lng, avatar_fichier, avatar_choix')
    .eq('id', compte.user.id)
    .maybeSingle();

  return {
    id: compte.user.id,
    email: compte.user.email ?? null,
    prenom: profil?.prenom ?? '',
    questionnaireFini: profil?.questionnaire_fini ?? false,
    rappelRegles: profil?.rappel_regles ?? true,
    notificationsDiscretes: profil?.notifications_discretes ?? true,
    codeOuverture: profil?.code_ouverture ?? false,
    cycleMoyen: profil?.cycle_moyen ?? 28,
    dureeRegles: profil?.duree_regles ?? 5,
    telephone: profil?.telephone ?? null,
    quartier: profil?.quartier ?? null,
    repere: profil?.repere ?? null,
    nomLivraison: profil?.nom_livraison ?? null,
    positionLat: profil?.position_lat ?? null,
    positionLng: profil?.position_lng ?? null,
    avatarFichier: profil?.avatar_fichier ?? null,
    avatarChoix: (profil?.avatar_choix as ChoixAvatar | null) ?? null,
  };
}

export interface Cycle {
  connue: boolean;
  aDesDonnees: boolean;
  prenom: string;
  jourDuCycle: number;
  cycleMoyen: number;
  dureeRegles: number;
  cyclesMesures: number;
  depasse: boolean;
  phase: Phase;
  debutDernieresRegles: string | null;
  prochainesRegles: string | null;
  joursRestants: number;
  ovulation: string | null;
  fertileDebut: string | null;
  fertileFin: string | null;
}

export type Phase = 'regles' | 'elan' | 'fertile' | 'lune';

export async function monCycle(astro: ContexteAstro): Promise<Cycle | null> {
  const client = clientSession(astro);
  if (!client) return null;
  const { data } = await client.rpc('mon_cycle');
  if (!data || data.connue !== true) return null;
  return {
    connue: true,
    aDesDonnees: data.a_des_donnees === true,
    prenom: data.prenom ?? '',
    jourDuCycle: data.jour_du_cycle ?? 0,
    cycleMoyen: data.cycle_moyen ?? 28,
    dureeRegles: data.duree_regles ?? 5,
    cyclesMesures: data.cycles_mesures ?? 0,
    depasse: data.depasse === true,
    phase: (data.phase ?? 'elan') as Phase,
    debutDernieresRegles: data.debut_dernieres_regles ?? null,
    prochainesRegles: data.prochaines_regles ?? null,
    joursRestants: data.jours_restants ?? 0,
    ovulation: data.ovulation ?? null,
    fertileDebut: data.fertile_debut ?? null,
    fertileFin: data.fertile_fin ?? null,
  };
}

/** Le panier vit dans un cookie lisible par la page : des slugs et des
 * quantités, jamais un prix. Le prix est toujours relu en base. */
export const COOKIE_PANIER = 'md_panier';

export interface LignePanier {
  slug: string;
  taille?: string;
  quantite: number;
}

export function lirePanier(astro: ContexteAstro): LignePanier[] {
  const brut = astro.cookies.get(COOKIE_PANIER)?.value;
  if (!brut) return [];
  try {
    const lu = JSON.parse(decodeURIComponent(brut));
    if (!Array.isArray(lu)) return [];
    return lu
      .filter((l) => l && typeof l.slug === 'string')
      .slice(0, 20)
      .map((l) => ({
        slug: String(l.slug).slice(0, 60),
        taille: l.taille ? String(l.taille).slice(0, 4) : undefined,
        quantite: Math.min(Math.max(parseInt(String(l.quantite), 10) || 1, 1), 20),
      }));
  } catch {
    return [];
  }
}

export function ecrirePanier(astro: ContexteAstro, lignes: LignePanier[]): void {
  if (lignes.length === 0) {
    astro.cookies.delete(COOKIE_PANIER, { path: '/' });
    return;
  }
  astro.cookies.set(COOKIE_PANIER, encodeURIComponent(JSON.stringify(lignes.slice(0, 20))), {
    httpOnly: false,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function comptePanier(lignes: LignePanier[]): number {
  return lignes.reduce((n, l) => n + l.quantite, 0);
}
