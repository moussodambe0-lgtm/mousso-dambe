// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// L'URL publique sert aux balises og: et au lien canonique. Mousso Dambé se
// partage de bouche à oreille et sur WhatsApp : un lien sans aperçu ne circule
// pas. Ordre : SITE_URL (domaine final), sinon l'adresse fournie par Vercel,
// sinon le serveur de développement.
function urlDuSite() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:4322';
}

export default defineConfig({
  site: urlDuSite(),

  // Rendu serveur : les pages de la boutique doivent arriver peuplées, y
  // compris pour le robot d'aperçu de WhatsApp, qui n'exécute pas JavaScript.
  output: 'server',

  prefetch: { prefetchAll: false, defaultStrategy: 'tap' },

  adapter: vercel({
    // Une page qui ne répond pas en 15 s sur 3G est une page abandonnée.
    maxDuration: 15,
  }),

  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public', optional: true, default: '' }),
      // Clé partagée entre le serveur du site et la base (empreinte dans
      // reglages « cle_serveur_sha256 »). Jamais envoyée au navigateur : c'est
      // elle qui prouve qu'une commande vient bien du site et pas d'un robot.
      MD_CLE_SERVEUR: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Le sous-domaine de l'administration (décision d'Arthur du 21 octobre
      // 2026 : l'admin est séparée de la plateforme principale). Facultative :
      // sans elle, tout hôte commençant par « admin. » est reconnu, ce qui
      // couvre `admin.localhost` en développement et le vrai sous-domaine le
      // jour où le domaine sera acheté. À renseigner seulement pour un nom qui
      // ne commence pas par « admin. ».
      ADMIN_HOST: envField.string({ context: 'server', access: 'public', optional: true, default: '' }),
      // L'assistante passe par Ollama (décision d'Arthur, comme pour Jia).
      // Sans OLLAMA_URL, l'assistante reste simplement absente : aucune page ne
      // casse, et l'écran le dit.
      OLLAMA_URL: envField.string({ context: 'server', access: 'public', optional: true, default: '' }),
      OLLAMA_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ASSISTANTE_MODELE: envField.string({ context: 'server', access: 'public', optional: true, default: '' }),
    },
  },

  // Pas d'optimisation d'images par Astro : ce projet n'utilise nulle part
  // `astro:assets` (ni <Image>, ni <Picture>, ni getImage). Les illustrations
  // sont deja en WebP, preparees a la main, et servies depuis public/.
  //
  // Sans ce reglage, Astro embarque sharp par defaut : 19 Mo sur les 25 Mo
  // envoyes a Vercel, pour rien. Surtout, sharp est la seule dependance du
  // paquet qui porte des binaires propres au systeme. C'est le suspect
  // principal du FUNCTION_INVOCATION_FAILED du 26 octobre 2026 : le meme
  // paquet se chargeait sans erreur sur ce PC (binaires Windows) et plantait a
  // chaque invocation sur Vercel (Linux).
  image: { service: { entrypoint: 'astro/assets/services/noop' } },

  devToolbar: { enabled: false },
  markdown: { syntaxHighlight: false },

  build: {
    // Sur 3G, une requête de plus coûte plus cher que quelques kilo-octets.
    inlineStylesheets: 'auto',
  },

  security: {
    // Protection CSRF des formulaires POST : ne jamais désactiver.
    checkOrigin: true,
    // Politique de sécurité du contenu, avec l'empreinte de chaque script et
    // style émis. Conséquence : aucun attribut style= en ligne, aucun
    // <script is:inline>. Inactive en `astro dev`.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://*.supabase.co",
        "font-src 'self'",
        // Les vocaux : ceux du médecin viennent de ce site, et celui qu'elle
        // vient d'enregistrer, qu'elle réécoute avant d'envoyer, est un blob
        // local. Rien d'autre ne peut jouer un son ici.
        "media-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        // Personne n'affiche Mousso Dambé dans un cadre : parade au
        // détournement de clic.
        "frame-ancestors 'none'",
        "form-action 'self'",
      ],
    },
  },

  vite: {
    build: {
      // Garde-fou de poids : rien de lourd ne doit partir au navigateur.
      chunkSizeWarningLimit: 80,
    },
    server: {
      // En développement, l'administration s'ouvre sur `admin.localhost:4322`
      // (les navigateurs résolvent tout `*.localhost` vers la machine). Sans
      // cette ligne, Vite répond « Blocked request » à cet hôte, par parade
      // contre le détournement de DNS. N'a aucun effet en production.
      allowedHosts: ['localhost', 'admin.localhost', '127.0.0.1'],
    },
  },
});
