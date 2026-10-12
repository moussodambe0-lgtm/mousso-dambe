/**
 * Parler à Ollama.
 *
 * Décision d'Arthur du 12 octobre 2026 : l'assistante de Mousso Dambé passe
 * par Ollama, comme celle de Jia. Ollama fait tourner des modèles ouverts,
 * soit sur une machine à soi (http://localhost:11434, sans clé), soit sur ses
 * serveurs (https://ollama.com, avec une clé). Les deux parlent le même
 * langage, seule l'adresse change.
 *
 * Sans OLLAMA_URL, l'assistante est simplement absente : aucune page ne casse,
 * et l'écran le dit au lieu de tourner dans le vide.
 *
 * À savoir avant la mise en ligne : un Ollama qui tourne sur le PC d'Arthur
 * n'est joignable que depuis ce PC. Le site hébergé sur Vercel ne le verra
 * jamais ; il lui faut l'adresse d'Ollama en ligne et sa clé.
 */
import { OLLAMA_URL, OLLAMA_API_KEY, ASSISTANTE_MODELE } from 'astro:env/server';

const MODELE_PAR_DEFAUT = 'gemma3:4b';

/**
 * Au-delà d'une minute, elle est déjà partie : mieux vaut dire que Dambé ne
 * répond pas que la laisser devant une page qui tourne.
 */
const DELAI_MS = 60_000;

export interface MessageOllama {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ReponseOllama {
  texte: string;
  jetonsEntree: number;
  jetonsSortie: number;
}

export class ErreurOllama extends Error {
  constructor(public readonly statut: number) {
    super(`ollama ${statut}`);
  }
}

export function ollamaConfigure(): boolean {
  return !!OLLAMA_URL;
}

export async function demanderOllama(messages: MessageOllama[], maxJetons = 700): Promise<ReponseOllama> {
  const adresse = new URL(`${OLLAMA_URL.replace(/\/+$/, '')}/api/chat`);
  const surCetteMachine = ['localhost', '127.0.0.1', '[::1]'].includes(adresse.hostname);
  // Hors de cette machine, tout passe en HTTPS ou ne passe pas : les questions
  // sur les règles et la clé ne voyagent jamais en clair, même si l'adresse a
  // été mal recopiée dans les réglages.
  if (adresse.protocol !== 'https:' && !surCetteMachine) throw new ErreurOllama(0);

  const entetes: Record<string, string> = { 'content-type': 'application/json' };
  if (OLLAMA_API_KEY) entetes.authorization = `Bearer ${OLLAMA_API_KEY}`;

  const reponse = await fetch(adresse, {
    method: 'POST',
    // Une redirection emporterait la question vers une autre adresse.
    redirect: 'error',
    headers: entetes,
    body: JSON.stringify({
      model: ASSISTANTE_MODELE || MODELE_PAR_DEFAUT,
      messages,
      stream: false,
      options: { num_predict: maxJetons, temperature: 0.4 },
    }),
    signal: AbortSignal.timeout(DELAI_MS),
  });

  if (!reponse.ok) throw new ErreurOllama(reponse.status);

  const lu = (await reponse.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    texte: String(lu.message?.content ?? '').trim(),
    jetonsEntree: lu.prompt_eval_count ?? 0,
    jetonsSortie: lu.eval_count ?? 0,
  };
}
