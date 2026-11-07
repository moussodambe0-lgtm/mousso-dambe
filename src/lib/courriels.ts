/**
 * Les emails de commande : ce qu'on écrit, et ce qu'on n'écrit pas.
 *
 * Arthur, le 7 novembre 2026 : « si quelqu'un fait un achat sur Mousso Dambé,
 * il faut que je lui envoie des emails. »
 *
 * CE SONT DES MESSAGES TRANSACTIONNELS, et c'est ce qui les rend légitimes
 * sans rien demander à personne. Confirmer une commande, dire que le colis
 * part, dire qu'il est arrivé : cela fait partie de la vente. La loi
 * burkinabè n°037-2026 n'exige un consentement distinct que pour les messages
 * de démarchage, qui n'existent pas ici et qui, le jour où ils existeront,
 * auront leur case à cocher et leur lien de désinscription.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CE QU'UN EMAIL DE MOUSSO DAMBÉ NE DIT JAMAIS
 * ──────────────────────────────────────────────────────────────────────────
 *
 * AUCUN NOM DE PRODUIT. Jamais. Arthur l'a confirmé le 7 novembre 2026 quand
 * la question lui a été posée, et c'est déjà la règle des messages WhatsApp
 * (voir `lienWhatsApp` dans src/lib/format-gestion.ts).
 *
 * La raison n'est pas la pudeur, c'est la sécurité. Ici le danger n'est pas
 * le pirate : c'est le téléphone qu'on se passe à la maison, le mari qui
 * regarde par-dessus l'épaule, la boîte mail restée ouverte sur l'ordinateur
 * du bureau, et l'aperçu de notification qui s'affiche sur un écran
 * verrouillé. « 2 × Serviettes lavables » dans un objet de message, c'est une
 * information intime remise à quiconque passe devant l'écran, et remise pour
 * toujours : un email reste.
 *
 * On écrit donc le nombre d'articles et le total. Le détail est dans
 * l'application, derrière son compte, où elle décide qui regarde.
 *
 * NI L'OBJET NI LE CORPS NE DISENT CE QUE L'APPLICATION SUIT. « Mousso
 * Dambé » est un nom, pas une description. C'est la même raison qui fait que
 * l'icône posée sur l'écran d'accueil est neutre et que les pages privées
 * sont en « noindex ».
 *
 * AUCUN NUMÉRO DE COMMANDE (Arthur, le 7 novembre 2026 : « je veux pas de
 * numéro de commande »). On situe par la date.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * UN EMAIL NE DOIT JAMAIS FAIRE ÉCHOUER UNE COMMANDE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * `envoyer` ne lève jamais d'exception et ne bloque jamais plus de quelques
 * secondes. Les pages de Vercel meurent à 15 secondes (`maxDuration`), et
 * cette limite est partagée avec tout le reste du traitement : si Resend est
 * lent ou injoignable, la cliente verrait sa commande échouer alors qu'elle
 * est passée, son panier serait vidé, et elle recommencerait, persuadée que
 * rien n'a marché. Le colis partirait deux fois.
 *
 * Un email manquant est un désagrément. Une commande perdue est une cliente
 * perdue. L'ordre de gravité décide de tout ce fichier : on envoie si on
 * peut, on renonce sans bruit sinon.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * BEAUCOUP DE CLIENTES N'ONT PAS D'EMAIL, ET CE N'EST PAS UN OUBLI
 * ──────────────────────────────────────────────────────────────────────────
 *
 * On entre dans Mousso Dambé par « Commencer », sans compte et sans adresse
 * (voir src/lib/identite.ts). Une grande partie des commandes viendra donc de
 * femmes qu'aucun email n'atteindra. Leur seule coordonnée est le téléphone,
 * obligatoire pour commander, et le canal de repli de toute la plateforme
 * reste WhatsApp. Ces fonctions renoncent proprement quand l'adresse manque :
 * c'est le cas ordinaire, pas une erreur.
 */
import { RESEND_API_KEY } from 'astro:env/server';

/** L'adresse qui envoie. Le domaine est vérifié chez Resend depuis le 7 novembre 2026. */
const EXPEDITEUR = 'Mousso Dambé <bonjour@moussodambe.com>';

/**
 * Au-delà, on renonce.
 *
 * Six secondes sur les quinze de la page. Resend répond d'ordinaire en moins
 * d'une seconde ; six laisse de la marge pour une connexion lente sans mettre
 * en danger le reste du traitement.
 */
const DELAI_MS = 6000;

export interface Courriel {
  a: string;
  sujet: string;
  html: string;
}

/**
 * Envoyer, ou renoncer sans bruit.
 *
 * Rend `true` si Resend a accepté le message, `false` dans tous les autres
 * cas : pas de clé configurée, pas d'adresse, réseau coupé, délai dépassé,
 * refus de Resend. L'appelant n'a jamais à entourer cet appel d'un `try`.
 *
 * ON N'ÉCRIT PAS LA RÉPONSE DE RESEND DANS LES JOURNAUX. Elle contient
 * l'adresse de la cliente, et un journal se lit, se copie et se partage. En
 * cas d'échec on note le code HTTP, qui suffit à comprendre, et rien d'autre.
 */
export async function envoyer(
  message: Courriel,
  { cle = RESEND_API_KEY, delaiMs = DELAI_MS, chercher = fetch } = {}
): Promise<boolean> {
  if (!cle) return false;
  if (!message.a || !message.a.includes('@')) return false;

  try {
    const r = await chercher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [message.a],
        subject: message.sujet,
        html: message.html,
      }),
      signal: AbortSignal.timeout(delaiMs),
    });
    if (!r.ok) {
      console.warn(`[courriels] Resend a refusé : HTTP ${r.status}`);
      return false;
    }
    return true;
  } catch {
    // Réseau coupé, délai dépassé, Resend en panne. La commande, elle, est
    // passée : il n'y a rien à faire de plus ici.
    console.warn('[courriels] envoi impossible');
    return false;
  }
}

// --- La mise en page ---------------------------------------------------------

/** Les couleurs de l'application, recopiées depuis src/styles/tokens.css. */
const ROSE = '#d0206a';
const FOND = '#fff6f9';
const BORDURE = '#f6d9e4';
const ENCRE = '#3a2530';
const ENCRE_2 = '#6b5560';
const ENCRE_3 = '#9b8794';

/** Le format du Burkina : des milliers séparés par une espace, et « FCFA ». */
export function montant(cfa: number): string {
  return `${Math.round(cfa).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

/** « 7 novembre 2026 ». Les emails n'ont pas de fuseau : on prend celui du Burkina (UTC). */
export function dateEnLettres(quand: string | Date): string {
  const d = typeof quand === 'string' ? new Date(quand) : quand;
  if (Number.isNaN(d.getTime())) return '';
  const mois = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  return `${d.getUTCDate()} ${mois[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** « 3 articles », « 1 article ». */
export function combienDArticles(n: number): string {
  return n <= 1 ? '1 article' : `${n} articles`;
}

/**
 * Le gabarit, en tableaux imbriqués et en styles en ligne.
 *
 * Ce n'est pas de la négligence : une messagerie sur deux supprime la balise
 * <style> et ne connaît ni flexbox ni grid. Ce qui serait une faute dans le
 * site est ici la seule chose qui s'affiche partout.
 *
 * Tout ce qui vient de l'extérieur (un prénom, un quartier) passe par
 * `propre()` : un prénom contenant « < » casserait la page, et une adresse
 * recopiée depuis un formulaire pourrait porter autre chose.
 */
export function propre(texte: string): string {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Gabarit {
  titre: string;
  corps: string;
  lignes?: { mot: string; valeur: string }[];
  bouton?: { texte: string; lien: string };
  pied?: string;
}

export function page({ titre, corps, lignes = [], bouton, pied }: Gabarit): string {
  const tableau = lignes.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:1px solid ${BORDURE};">
                  ${lignes
                    .map(
                      (l) => `<tr>
                    <td style="padding:11px 0 0;font-size:14px;color:${ENCRE_2};">${l.mot}</td>
                    <td align="right" style="padding:11px 0 0;font-size:14px;font-weight:700;color:${ENCRE};">${l.valeur}</td>
                  </tr>`
                    )
                    .join('\n                  ')}
                </table>`
    : '';

  const lien = bouton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                  <tr>
                    <td style="border-radius:999px;background:${ROSE};">
                      <a href="${bouton.lien}" style="display:inline-block;padding:14px 30px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">${bouton.texte}</a>
                    </td>
                  </tr>
                </table>`
    : '';

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:${FOND};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FOND};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:18px;border:1px solid ${BORDURE};padding:28px 24px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td>
                <p style="margin:0;font-size:17px;font-weight:700;color:${ROSE};letter-spacing:0.2px;">Mousso Dambé</p>
                <h1 style="margin:18px 0 12px;font-size:20px;line-height:1.35;font-weight:700;color:${ENCRE};">${titre}</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:${ENCRE_2};">${corps}</p>
                ${tableau}
                ${lien}
                ${pied ? `<p style="margin:0;padding-top:16px;border-top:1px solid ${BORDURE};font-size:12.5px;line-height:1.55;color:${ENCRE_3};">${pied}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// --- Les messages ------------------------------------------------------------

export interface FaitsCommande {
  /** Son prénom, s'il est connu. Sinon le message tutoie sans nommer. */
  prenom?: string | null;
  /** Le nombre d'articles, jamais leurs noms. */
  articles: number;
  total: number;
  quand: string | Date;
  /** L'adresse de la page de suivi, déjà complète. */
  lien: string;
}

const DISCRETION =
  'Ce message ne dit pas ce que contient ton colis, et le colis non plus : '
  + 'l’emballage est neutre, rien n’est écrit dessus.';

function bonjour(prenom?: string | null): string {
  return prenom ? `Bonjour ${propre(prenom)},` : 'Bonjour,';
}

export function commandeRecue(f: FaitsCommande): Courriel {
  return {
    a: '',
    sujet: 'Ta commande est confirmée',
    html: page({
      titre: 'C’est noté',
      corps:
        `${bonjour(f.prenom)} ta commande du ${dateEnLettres(f.quand)} est bien enregistrée. `
        + 'On prépare ton colis, et un livreur te l’apportera. Tu ne paies qu’à la remise.',
      lignes: [
        { mot: 'Articles', valeur: combienDArticles(f.articles) },
        { mot: 'À payer à la livraison', valeur: montant(f.total) },
      ],
      bouton: { texte: 'Suivre ma commande', lien: f.lien },
      pied: DISCRETION,
    }),
  };
}

export function commandeEnRoute(f: FaitsCommande & { livreur?: string | null }): Courriel {
  return {
    a: '',
    sujet: 'Ton colis est en route',
    html: page({
      titre: 'Le livreur a ton colis',
      corps:
        `${bonjour(f.prenom)} ton colis vient de partir`
        + (f.livreur ? `, ${propre(f.livreur)} te l’apporte` : '')
        + '. Il t’appellera en arrivant. Prépare la somme, tu paies à la remise.',
      lignes: [{ mot: 'À payer à la livraison', valeur: montant(f.total) }],
      bouton: { texte: 'Suivre ma commande', lien: f.lien },
      pied: DISCRETION,
    }),
  };
}

export function commandeLivree(f: FaitsCommande): Courriel {
  return {
    a: '',
    sujet: 'Ton colis est arrivé',
    html: page({
      titre: 'Reçu, et payé',
      corps:
        `${bonjour(f.prenom)} ton colis du ${dateEnLettres(f.quand)} t’a été remis. `
        + 'Merci de ta confiance. Si quelque chose ne va pas, réponds à ce message ou écris-nous sur WhatsApp.',
      lignes: [{ mot: 'Payé', valeur: montant(f.total) }],
      bouton: { texte: 'Donner mon avis', lien: f.lien },
      pied:
        'Ton avis aide les autres femmes à choisir. Il s’affiche sans ton nom, '
        + 'sans ton prénom et sans rien qui permette de te reconnaître.',
    }),
  };
}

export function commandeAnnulee(f: FaitsCommande): Courriel {
  return {
    a: '',
    sujet: 'Ta commande est annulée',
    html: page({
      titre: 'Commande annulée',
      corps:
        `${bonjour(f.prenom)} ta commande du ${dateEnLettres(f.quand)} est annulée. `
        + 'Elle n’a pas été livrée, et tu n’as rien payé.',
      bouton: { texte: 'Retourner à la boutique', lien: f.lien },
      pied: 'Si ce n’est pas toi qui as annulé, écris-nous : on regarde tout de suite.',
    }),
  };
}

/**
 * Le message à la boutique, quand une commande tombe.
 *
 * Celui-là PEUT nommer le quartier et la cliente : il part sur l'adresse de
 * la boutique, qui est celle d'Arthur, et il lui sert à décider s'il prépare
 * le colis tout de suite. Il ne nomme toujours pas les produits : il n'en a
 * pas besoin, l'espace vendeur les montre, et une adresse mail se fait
 * pirater comme une autre.
 */
export function nouvelleCommandePourLaBoutique(f: {
  nom: string;
  quartier: string;
  articles: number;
  total: number;
  lien: string;
}): Courriel {
  return {
    a: '',
    sujet: `Nouvelle commande · ${propre(f.quartier) || 'quartier à préciser'}`,
    html: page({
      titre: 'Une commande vient de tomber',
      corps: 'Elle attend d’être préparée.',
      lignes: [
        { mot: 'Pour', valeur: propre(f.nom) },
        { mot: 'Où', valeur: propre(f.quartier) || '—' },
        { mot: 'Articles', valeur: combienDArticles(f.articles) },
        { mot: 'À encaisser', valeur: montant(f.total) },
      ],
      bouton: { texte: 'Ouvrir mes commandes', lien: f.lien },
    }),
  };
}
