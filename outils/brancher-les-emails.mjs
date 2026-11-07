/**
 * Brancher l'envoi des emails de Mousso Dambe, et les ecrire en francais.
 *
 * POURQUOI CET OUTIL EXISTE
 *
 * Arthur, le 7 novembre 2026 : « l'objectif, c'est que quelqu'un qui vient sur
 * la plateforme puisse se connecter avec son email. Son vrai email. »
 *
 * Le formulaire email et mot de passe existe depuis le 27 octobre
 * (src/pages/connexion.astro). Ce qui manquait n'etait pas du code : c'etait
 * un serveur capable d'envoyer le message de confirmation. Sans lui, Supabase
 * se rabat sur son expediteur de depannage, limite a DEUX messages par heure
 * et reserve aux membres de l'equipe du projet. Autrement dit, une inscription
 * sur trois aboutissait, et seulement pour Arthur.
 *
 * POURQUOI RESEND ET PAS BREVO
 *
 * Brevo avait ete branche en premier : compte cree, domaine authentifie dans
 * le DNS le 6 novembre, cles rangees dans le coffre. Il a fallu l'abandonner,
 * et la raison merite d'etre ecrite pour qu'on n'y revienne pas par erreur.
 *
 * BREVO REFUSE L'AUTHENTIFICATION DES SERVEURS DE SUPABASE. Mesure, pas
 * suppose : avec un serveur SMTP qui n'existe pas, Supabase echoue au bout de
 * 37 secondes ; avec Brevo, en 1 seconde. Il joint donc le relais et se fait
 * renvoyer. Les memes identifiants, utilises a la main depuis un poste,
 * marchent de bout en bout : AUTH 235, MAIL FROM 250, message en file
 * d'attente, livre, et ouvert. Le mot de passe a ete ressaisi a la main dans
 * le tableau de bord de Supabase : meme refus. Le compteur de Brevo est reste
 * a UNE seule requete sur toute la periode, celle de l'essai direct.
 *
 * Ecartes un par un : les gabarits (vides, meme echec), l'accent du nom de
 * l'expediteur, les ports 465, 2525 et 25, l'adresse d'expedition, et un
 * redemarrage complet du projet. Les journaux d'authentification de Supabase
 * ne sont pas disponibles sur ce projet, d'ou la methode par elimination.
 *
 * Le compte Brevo n'est pas supprime : il reste bon pour les emails de la
 * boutique, qui partiraient de nos serveurs et non de ceux de Supabase.
 *
 * CE QUI EST DEJA FAIT, ET QU'ON NE REFAIT PAS : l'authentification du domaine
 * moussodambe.com chez Resend (DKIM, SPF, MX de retour et CNAME poses dans le
 * DNS de Vercel le 7 novembre par outils/dns-vercel.mjs, verifies en une
 * minute). C'est elle qui fait qu'un message partant de @moussodambe.com
 * arrive dans la boite de reception et pas dans les indesirables. Sans elle,
 * tout le reste ne sert a rien.
 *
 * CE QUE CET OUTIL FAIT
 *
 *   1. Pose le relais SMTP de Resend dans les reglages de la base.
 *   2. Releve la limite de 2 messages par heure, qui est celle du depannage.
 *   3. Remplace les cinq messages anglais de Supabase par des messages en
 *      francais, aux couleurs de l'application.
 *   4. Aligne la longueur minimale du mot de passe sur celle du formulaire.
 *   5. Relit tout et verifie, parce qu'un PATCH accepte n'est pas un PATCH
 *      applique.
 *
 * CE QU'IL N'AFFICHE JAMAIS : aucune cle, aucun mot de passe, aucun jeton.
 * Ni en clair, ni tronque. Seulement des longueurs et des oui/non. C'est une
 * regle d'Arthur, et elle a ete enfreinte une fois.
 *
 * POURQUOI LES MESSAGES NE DISENT PAS CE QU'EST L'APPLICATION
 *
 * Le danger, ici, n'est pas le pirate : c'est le telephone qu'on se passe a la
 * maison, et la boite mail ouverte sur l'ordinateur du bureau. Un objet de
 * message qui annoncerait « suivi de tes regles » trahirait celle qui le
 * recoit aupres de quiconque regarde par-dessus son epaule. Les messages ne
 * nomment donc que la marque, jamais ce qu'elle sert a faire. C'est la meme
 * raison qui fait que l'application s'installe sous une icone neutre et que
 * les pages privees sont en « noindex ».
 *
 * Lancer : node outils/brancher-les-emails.mjs
 *          node outils/brancher-les-emails.mjs --lire   (ne modifie rien)
 */
import { valeurUnique } from './coffre.mjs';

const LIRE_SEULEMENT = process.argv.includes('--lire');

/** Le relais de Resend. Le port 587 est celui du STARTTLS. */
const SMTP_HOTE = 'smtp.resend.com';
const SMTP_PORT = '587';

/**
 * L'identifiant SMTP de Resend est le mot « resend », pour tout le monde. Ce
 * n'est pas une erreur de recopie : c'est la cle d'API qui tient lieu de mot
 * de passe et qui identifie le compte.
 */
const SMTP_IDENTIFIANT = 'resend';

/**
 * L'adresse qui envoie.
 *
 * Elle est sur moussodambe.com, et c'est exprès : Resend n'autorise l'envoi
 * que depuis un domaine verifie chez lui. Un message parti d'une adresse gmail
 * arriverait signe par le mauvais domaine, et Gmail le rangerait dans les
 * indesirables. Le domaine etant verifie, n'importe quelle adresse en
 * @moussodambe.com est legitime sans avoir a la declarer une par une.
 */
const EXPEDITEUR = 'bonjour@moussodambe.com';
const NOM_EXPEDITEUR = 'Mousso Dambé';

/**
 * Combien de messages par heure.
 *
 * Le defaut est 2, celui de l'expediteur de depannage. Resend en offre 3000
 * par mois et 100 par jour sur le plan gratuit : 100 par heure laisse de la
 * marge pour une pointe sans pouvoir vider le quota en vingt minutes si
 * quelque chose tourne en boucle.
 */
const PAR_HEURE = 100;

/** Le formulaire d'inscription exige deja 8 caracteres. La base en exigeait 6. */
const MOT_DE_PASSE_MINI = 8;

// --- Les messages ------------------------------------------------------------

/**
 * Le gabarit, en tableaux imbriques et en styles en ligne.
 *
 * Ce n'est pas de la negligence : une messagerie sur deux supprime la balise
 * <style> et ne connait ni flexbox ni grid. Ce qui serait une faute dans le
 * site est ici la seule chose qui s'affiche partout.
 */
function message({ titre, corps, bouton, pied, lien = '{{ .ConfirmationURL }}' }) {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#fff6f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff6f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid #f6d9e4;padding:28px 24px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td>
                <p style="margin:0;font-size:17px;font-weight:700;color:#d0206a;letter-spacing:0.2px;">Mousso Dambé</p>
                <h1 style="margin:18px 0 12px;font-size:20px;line-height:1.35;font-weight:700;color:#3a2530;">${titre}</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#6b5560;">${corps}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:999px;background:#d0206a;">
                      <a href="${lien}" style="display:inline-block;padding:14px 30px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${bouton}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#7a6370;">${pied}</p>
                <p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #f6d9e4;font-size:12px;line-height:1.5;color:#9b8794;">
                  Si le bouton ne s'ouvre pas, copie cette adresse dans ton navigateur&nbsp;:<br />
                  <span style="word-break:break-all;color:#9b8794;">${lien}</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const EXPIRE = 'Ce lien est valable une heure.';

const MESSAGES = {
  confirmation: {
    sujet: 'Confirme ton adresse',
    html: message({
      titre: 'Encore un geste',
      corps:
        'Tu viens de créer ton compte Mousso Dambé. Appuie sur le bouton pour confirmer que cette adresse est bien la tienne.',
      bouton: 'Confirmer mon adresse',
      pied: `${EXPIRE} Si tu n'as rien demandé, tu peux ignorer ce message&nbsp;: aucun compte ne sera ouvert avec ton adresse sans ce clic.`,
    }),
  },
  recovery: {
    sujet: 'Choisir un nouveau mot de passe',
    html: message({
      titre: 'Un nouveau mot de passe',
      corps:
        'Tu as demandé à changer ton mot de passe. Appuie sur le bouton pour en choisir un autre.',
      bouton: 'Changer mon mot de passe',
      pied: `${EXPIRE} Si tu n'as rien demandé, ignore ce message&nbsp;: ton mot de passe actuel reste valable et personne n'y a touché.`,
    }),
  },
  magic_link: {
    sujet: 'Ton lien pour entrer',
    html: message({
      titre: 'Entre sans mot de passe',
      corps: 'Voici ton lien pour ouvrir ton compte Mousso Dambé.',
      bouton: 'Entrer',
      pied: `${EXPIRE} Il ne fonctionne qu'une seule fois. Ne le transmets à personne&nbsp;: il ouvre ton compte sans demander de mot de passe.`,
    }),
  },
  email_change: {
    sujet: 'Confirme ta nouvelle adresse',
    html: message({
      titre: 'Ta nouvelle adresse',
      corps:
        'Tu as demandé à utiliser <strong style="color:#3a2530;">{{ .NewEmail }}</strong> pour te connecter. Appuie sur le bouton pour confirmer que cette adresse est bien la tienne.',
      bouton: 'Confirmer',
      pied: `${EXPIRE} Si tu n'as rien demandé, ignore ce message&nbsp;: ton adresse actuelle ne changera pas.`,
    }),
  },
  invite: {
    sujet: 'Tu es invitée sur Mousso Dambé',
    html: message({
      titre: 'Une invitation',
      corps: 'Quelqu’un t’a ouvert un compte sur Mousso Dambé. Appuie sur le bouton pour le prendre en main et choisir ton mot de passe.',
      bouton: 'Prendre mon compte',
      pied: `${EXPIRE} Si tu ne sais pas de quoi il s'agit, ignore ce message.`,
    }),
  },
};

// --- Ce qu'on envoie ---------------------------------------------------------

function reglages(cleSmtp) {
  const r = {
    smtp_host: SMTP_HOTE,
    smtp_port: SMTP_PORT,
    smtp_user: SMTP_IDENTIFIANT,
    smtp_pass: cleSmtp,
    smtp_admin_email: EXPEDITEUR,
    smtp_sender_name: NOM_EXPEDITEUR,
    rate_limit_email_sent: PAR_HEURE,
    password_min_length: MOT_DE_PASSE_MINI,
  };
  for (const [nom, m] of Object.entries(MESSAGES)) {
    r[`mailer_subjects_${nom}`] = m.sujet;
    r[`mailer_templates_${nom}_content`] = m.html;
  }
  return r;
}

// --- Marche a suivre ---------------------------------------------------------

const jeton = valeurUnique(/^jeton supabase auth mousso dambe$/i, {
  quoi: "le jeton Supabase avec la permission « Auth Config »",
});
const cle = valeurUnique(/^resend api key mousso dambe$/i, {
  quoi: "la clé d'API Resend",
});

for (const [quoi, v] of [['jeton', jeton], ['clé Resend', cle]]) {
  if (v.erreur) {
    console.error(`Arrêt : ${v.erreur}`);
    process.exit(1);
  }
  console.log(`  ${quoi} : lu dans « ${v.nom} », ${v.valeur.length} caractères`);
}

const REF = 'svdmqncixccdfhhghyth';
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const entetes = {
  Authorization: `Bearer ${jeton.valeur}`,
  'Content-Type': 'application/json',
};

async function lire() {
  const r = await fetch(API, { headers: entetes, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`lecture des réglages : HTTP ${r.status}`);
  return r.json();
}

console.log('\n--- Avant ---');
const avant = await lire();
console.log('  serveur SMTP      :', avant.smtp_host || 'VIDE');
console.log('  messages par heure:', avant.rate_limit_email_sent);
console.log('  objet du message  :', avant.mailer_subjects_confirmation);

if (LIRE_SEULEMENT) {
  console.log('\n(--lire : rien n’a été modifié)');
  process.exit(0);
}

console.log('\n--- Envoi ---');
const envoi = await fetch(API, {
  method: 'PATCH',
  headers: entetes,
  body: JSON.stringify(reglages(cle.valeur)),
  signal: AbortSignal.timeout(30_000),
});

if (!envoi.ok) {
  // Le corps d'une erreur de l'API ne contient pas de secret : il nomme le
  // champ refuse. On l'affiche, sinon on cherche a l'aveugle.
  console.error(`  REFUSÉ : HTTP ${envoi.status}`);
  console.error('  ', (await envoi.text()).slice(0, 600));
  process.exit(1);
}
console.log('  accepté.');

// Un PATCH accepte n'est pas un PATCH applique : on relit.
console.log('\n--- Après, relu depuis Supabase ---');
const apres = await lire();

const attendu = [
  ['serveur SMTP', apres.smtp_host, SMTP_HOTE],
  ['port', String(apres.smtp_port), SMTP_PORT],
  ['expéditeur', apres.smtp_admin_email, EXPEDITEUR],
  ['nom affiché', apres.smtp_sender_name, NOM_EXPEDITEUR],
  ['messages par heure', apres.rate_limit_email_sent, PAR_HEURE],
  ['mot de passe mini', apres.password_min_length, MOT_DE_PASSE_MINI],
];
for (const [nom, m] of Object.entries(MESSAGES)) {
  attendu.push([`objet « ${nom} »`, apres[`mailer_subjects_${nom}`], m.sujet]);
  attendu.push([
    `corps « ${nom} »`,
    apres[`mailer_templates_${nom}_content`]?.length,
    m.html.length,
  ]);
}

let faux = 0;
for (const [nom, obtenu, voulu] of attendu) {
  const bon = String(obtenu) === String(voulu);
  if (!bon) faux++;
  console.log(`  ${bon ? 'OK  ' : 'NON '} ${nom.padEnd(22)} ${bon ? obtenu : `${obtenu} (attendu ${voulu})`}`);
}

// Le mot de passe SMTP ne se relit pas : l'API renvoie une empreinte opaque,
// qui ne correspond a aucune transformation connue de la cle. On ne peut donc
// RIEN en conclure, et le seul vrai essai est l'envoi d'un message :
// outils/essai-email.mjs.
const bonId = apres.smtp_user === SMTP_IDENTIFIANT;
if (!bonId) faux++;
console.log(`  ${bonId ? 'OK  ' : 'NON '} identifiant SMTP      ${apres.smtp_user || 'VIDE'}`);

console.log(
  faux === 0
    ? '\nTout est en place. Reste à envoyer un vrai message pour en avoir le cœur net.'
    : `\n${faux} réglage(s) n’ont pas pris. Voir ci-dessus.`
);
process.exit(faux === 0 ? 0 : 1);
