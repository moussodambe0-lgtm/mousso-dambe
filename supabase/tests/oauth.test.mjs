/**
 * Le va-et-vient de la connexion Google.
 *
 * Né de l'audit de Cyber du 26 octobre 2026. Deux choses à prouver, et la
 * première est une réparation :
 *
 *   1. le secret PKCE tiré au départ doit être RÉCUPÉRABLE, parce que c'est
 *      ce qui manquait : les deux bouts ne parlaient pas la même langue, et
 *      aucune connexion Google ne pouvait aboutir ;
 *   2. un retour sans ce secret doit être REFUSÉ, parce que c'est ce qui
 *      empêche un lien `…/auth/retour?code=…` envoyé sur WhatsApp de
 *      connecter le téléphone d'une femme au compte de quelqu'un d'autre.
 *
 * Aucun appel ne sort de cette machine : l'adresse visée est 127.0.0.1:1.
 */
import { createClient } from '@supabase/supabase-js';
import {
  COOKIE_OAUTH,
  optionsCookieOAuth,
  stockageDansObjet,
  lireStockage,
  porteUnVerificateur,
} from '../../src/lib/oauth.ts';
import { verifier, bilan, titre } from './banc.mjs';

// Nulle part : ni Supabase, ni Google, ni aucun service. Un port fermé.
const NULLE_PART = 'http://127.0.0.1:1';
const CLE = 'cle-sans-valeur-pour-cet-essai';

const nouveauClient = (sac) =>
  createClient(NULLE_PART, CLE, {
    auth: {
      // Comme les deux routes : a false, supabase-js ignore notre stockage.
      persistSession: true,
      autoRefreshToken: false,
      flowType: 'pkce',
      storage: stockageDansObjet(sac),
    },
  });

titre('Le stockage qu on peut relire');
{
  const sac = {};
  const s = stockageDansObjet(sac);
  s.setItem('a', 'un');
  verifier('ce qui est ecrit se relit', s.getItem('a') === 'un');
  verifier('ce qui est ecrit atterrit dans le sac', sac.a === 'un');
  s.removeItem('a');
  verifier('ce qui est retire disparait', s.getItem('a') === null && !('a' in sac));
  verifier('une cle absente rend null, pas undefined', s.getItem('jamais-posee') === null);
  verifier(
    "une cle heritee d Object ne passe pas pour une valeur",
    s.getItem('toString') === null
  );
}

titre('Le cookie du va-et-vient');
{
  const prod = optionsCookieOAuth(true);
  const local = optionsCookieOAuth(false);
  verifier('illisible par un script de la page', prod.httpOnly === true);
  verifier('en HTTPS seulement en production', prod.secure === true && local.secure === false);
  verifier('ne part que vers /auth', prod.path === '/auth');
  verifier('revient bien du retour de Google (lax, pas strict)', prod.sameSite === 'lax');
  verifier('ne vit pas plus de dix minutes', prod.maxAge <= 600);
  verifier('porte un nom a lui', COOKIE_OAUTH === 'md_oauth');
}

titre('Ce qui sort du cookie ne se croit jamais sur parole');
{
  const CAS = [
    [undefined, 'cookie absent'],
    ['', 'cookie vide'],
    ['pas du json', 'texte quelconque'],
    ['null', 'le mot null'],
    ['[]', 'un tableau'],
    ['"une chaine"', 'une chaine'],
    ['{}', 'un objet vide'],
    ['{"a":1}', 'une valeur qui n est pas du texte'],
    ['{"a":{"b":"c"}}', 'une valeur imbriquee'],
    [`{"a":"${'x'.repeat(2500)}"}`, 'une valeur demesuree'],
    [`{"${'k'.repeat(300)}":"x"}`, 'une cle demesuree'],
    [`{"a":"${'x'.repeat(4100)}"}`, 'un cookie plus gros que la limite'],
  ];
  for (const [brut, nom] of CAS) {
    verifier(`refuse : ${nom}`, lireStockage(brut) === null, JSON.stringify(lireStockage(brut)));
  }
  verifier(
    'accepte un stockage honnete',
    JSON.stringify(lireStockage('{"sb-x-auth-token-code-verifier":"abc"}')) ===
      '{"sb-x-auth-token-code-verifier":"abc"}'
  );
}

titre('Reconnaitre un vrai depart de connexion');
{
  verifier('rien du tout : non', porteUnVerificateur(null) === false);
  verifier('un sac vide : non', porteUnVerificateur({}) === false);
  verifier(
    'un sac sans verificateur : non',
    porteUnVerificateur({ 'sb-x-auth-token': 'une session' }) === false
  );
  verifier(
    'un verificateur trop court pour etre vrai : non',
    porteUnVerificateur({ 'sb-x-code-verifier': 'court' }) === false
  );
  verifier(
    'un vrai verificateur : oui',
    porteUnVerificateur({ 'sb-x-auth-token-code-verifier': 'a'.repeat(56) }) === true
  );
}

titre('REPARATION : le depart laisse bien un secret recuperable');
{
  const sac = {};
  const client = nouveauClient(sac);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'http://127.0.0.1:1/auth/retour',
      queryParams: { access_type: 'offline', prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  });
  verifier("le depart construit bien une adresse d'autorisation", !error && !!data?.url, String(error?.message).slice(0, 90));
  verifier("l'adresse porte une empreinte PKCE", String(data?.url).includes('code_challenge'), String(data?.url).slice(0, 120));
  verifier('le secret est dans le sac, donc dans le cookie', porteUnVerificateur(sac), Object.keys(sac).join(','));
  verifier('le sac tient dans un cookie', JSON.stringify(sac).length < 4000, `${JSON.stringify(sac).length} octets`);

  // Et il repasse le voyage par le cookie sans se perdre.
  const relu = lireStockage(JSON.stringify(sac));
  verifier('le secret survit a l aller-retour par le cookie', porteUnVerificateur(relu));
}

titre('PROTECTION : un retour sans secret ne va pas plus loin');
{
  // Sans secret : supabase-js refuse AVANT tout appel reseau. C'etait l'etat
  // du site avant ce correctif, pour TOUTES les connexions Google.
  const t0 = Date.now();
  const { error } = await nouveauClient({}).auth.exchangeCodeForSession('un-code-de-google');
  const ms = Date.now() - t0;
  verifier('refus immediat', /verifier/i.test(`${error?.name} ${error?.message}`), `${error?.name} en ${ms} ms`);
  verifier('refus avant tout appel reseau', ms < 500, `${ms} ms`);
}

titre('Avec le secret, l echange est bel et bien tente');
{
  const sac = {};
  await nouveauClient(sac).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'http://127.0.0.1:1/auth/retour', skipBrowserRedirect: true },
  });
  const relu = lireStockage(JSON.stringify(sac));
  const { error } = await nouveauClient(relu).auth.exchangeCodeForSession('un-code-de-google');
  // Le port 1 est ferme : l'erreur doit parler de reseau, PAS de verificateur.
  // C'est la preuve que le secret a bien ete trouve et envoye.
  verifier(
    "l echange passe la verification du secret et part sur le reseau",
    !/verifier/i.test(`${error?.name} ${error?.message}`),
    `${error?.name} : ${String(error?.message).slice(0, 80)}`
  );
}

bilan('Le va-et-vient de la connexion Google');
