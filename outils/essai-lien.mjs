/**
 * Un essai isolé : attacher une adresse à une identité anonyme.
 *
 * Écrit le 12 octobre 2026 parce que la page Compte répondait « réessaie plus
 * tard » sans dire pourquoi. Ici, l'erreur de supabase-js est affichée telle
 * quelle, sans passer par une page.
 *
 *   node outils/essai-lien.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:5433';
const CLE = 'cle-anon-du-banc';
const CLE_SITE = 'cle-du-banc-local-mousso-dambe';

const client = createClient(URL, CLE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-md-cle': CLE_SITE } },
});

const anonyme = await client.auth.signInAnonymously();
console.log('entrée anonyme :', anonyme.error ? anonyme.error.message : 'ok');
if (!anonyme.data?.session) process.exit(1);

const pose = await client.auth.setSession({
  access_token: anonyme.data.session.access_token,
  refresh_token: anonyme.data.session.refresh_token,
});
console.log('session posée :', pose.error ? pose.error.message : 'ok');

const lien = await client.auth.updateUser({
  email: `essai-${Date.now()}@essai.bf`,
  password: 'motdepasse123',
});
console.log('adresse attachée :', lien.error ? `ÉCHEC — ${lien.error.message}` : `ok (${lien.data.user?.email})`);
