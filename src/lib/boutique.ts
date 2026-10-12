/**
 * Le prix de la livraison, lu une seule fois par page.
 *
 * Relevé par l'audit du 12 octobre 2026 : trois pages l'écrivaient en dur,
 * alors que la base relit le réglage au moment de la commande. Un écran qui
 * annonce un total et une base qui en calcule un autre, c'est une cliente qui
 * refuse le colis à la livraison.
 *
 * L'appel est fait côté serveur, entre Vercel et Supabase, tous deux à
 * Londres : il ne coûte rien au téléphone, et surtout pas un aller-retour de
 * plus sur la 3G de Ouagadougou.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Valeur de repli, la même que celle posée par la migration des fondations.
 * Elle ne sert que si la base ne répond pas : mieux vaut un prix plausible
 * affiché qu'une page qui casse. La base, elle, aura toujours le dernier mot
 * au moment de la commande. */
const REPLI_CFA = 1000;

export async function prixLivraison(client: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await client.rpc('prix_livraison');
    if (error || typeof data !== 'number' || data < 0) return REPLI_CFA;
    return data;
  } catch {
    return REPLI_CFA;
  }
}
