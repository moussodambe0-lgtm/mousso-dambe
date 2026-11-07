/**
 * LE VOCAL : elle parle, on enregistre, un humain écoute. Chez le médecin,
 * chez la boutique, et côté administratrice pour répondre.
 *
 * Contrairement à la dictée de Dambé, ici le son part TEL QUEL. Personne ne le
 * transcrit, aucun service extérieur ne le reçoit : il est rangé dans la base
 * et le médecin l'écoute. C'est ce qui fait que le moré et le dioula passent.
 *
 * Le parcours, volontairement en trois temps et pas en un :
 *   1. elle appuie sur le micro : ça enregistre, un compteur tourne ;
 *   2. elle appuie sur stop : elle peut RÉÉCOUTER ce qu'elle a dit ;
 *   3. elle envoie, ou elle recommence.
 * L'étape 2 n'est pas du confort. Elle parle de son corps, à voix haute, sur
 * un téléphone : un vocal qui part dès qu'on lâche le bouton, c'est un vocal
 * qu'elle regrette. Elle doit pouvoir se réécouter avant que quelqu'un le fasse.
 *
 * Le bouton arrive caché (`hidden`) et n'apparaît que si le navigateur sait
 * enregistrer. Un micro qui ne marche pas est pire que pas de micro.
 */
const MAX_SECONDES = 90;

const bouton = document.querySelector<HTMLButtonElement>('.vocal-micro');
const panneau = document.querySelector<HTMLElement>('.vocal-panneau');
const zone = document.querySelector<HTMLElement>('.zone-ecriture');

const sait =
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  window.isSecureContext;

if (sait && bouton && panneau && zone) {
  bouton.hidden = false;

  const temps = panneau.querySelector<HTMLElement>('.vocal-temps')!;
  const message = panneau.querySelector<HTMLElement>('.vocal-message')!;
  const btnStop = panneau.querySelector<HTMLButtonElement>('.vocal-stop')!;
  const btnEnvoyer = panneau.querySelector<HTMLButtonElement>('.vocal-envoyer')!;
  const btnAnnuler = panneau.querySelector<HTMLButtonElement>('.vocal-annuler')!;
  const btnEcouter = panneau.querySelector<HTMLButtonElement>('.vocal-ecouter')!;

  // Les formats, du meilleur au plus répandu. Chrome sait le webm/opus, Safari
  // seulement le mp4. On prend le premier que le navigateur accepte et on
  // envoie SON nom : le serveur vérifie qu'il est dans sa liste fermée.
  const FORMATS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  const format = FORMATS.find((f) => MediaRecorder.isTypeSupported(f)) ?? '';

  type Etat = 'repos' | 'enregistre' | 'pret' | 'envoi' | 'refuse';

  let flux: MediaStream | null = null;
  let enregistreur: MediaRecorder | null = null;
  let morceaux: Blob[] = [];
  let debut = 0;
  let minuteur = 0;
  let secondes = 0;
  let blob: Blob | null = null;
  let lecture: HTMLAudioElement | null = null;
  let urlLocale = '';

  const etat = (e: Etat) => {
    panneau.dataset.etat = e;
    panneau.hidden = e === 'repos';
    zone.classList.toggle('vocal-actif', e !== 'repos');
    bouton.classList.toggle('vocal-ecoute', e === 'enregistre');
    bouton.setAttribute('aria-pressed', String(e === 'enregistre'));
    btnStop.hidden = e !== 'enregistre';
    btnEnvoyer.hidden = e !== 'pret' && e !== 'envoi';
    btnEcouter.hidden = e !== 'pret';
    btnAnnuler.hidden = e === 'repos' || e === 'envoi';
    btnEnvoyer.disabled = e === 'envoi';
  };

  const dire = (t: string) => {
    message.textContent = t;
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const libererMicro = () => {
    flux?.getTracks().forEach((p) => p.stop());
    flux = null;
  };

  const oublier = () => {
    window.clearInterval(minuteur);
    lecture?.pause();
    lecture = null;
    if (urlLocale) URL.revokeObjectURL(urlLocale);
    urlLocale = '';
    blob = null;
    morceaux = [];
    secondes = 0;
    libererMicro();
  };

  const arreter = () => {
    window.clearInterval(minuteur);
    if (enregistreur && enregistreur.state !== 'inactive') enregistreur.stop();
  };

  const commencer = async () => {
    oublier();
    dire('');
    try {
      /*
       * ══════════════════════════════════════════════════════════════════
       * POURQUOI ON DEMANDE LE MICRO AVEC AUTANT DE PRÉCISIONS
       * ══════════════════════════════════════════════════════════════════
       *
       * Arthur, le 7 novembre 2026 : « quand on envoie un audio par
       * message, c'est comme la voix d'un robot. Les voix sont modifiées.
       * On ne sait même pas que c'est la voix de la personne. »
       *
       * La ligne d'avant était `getUserMedia({ audio: true })`. Cette
       * demande-là, la plus simple, est aussi la pire pour un message
       * vocal : sans précision, le navigateur applique le traitement d'un
       * APPEL TÉLÉPHONIQUE. Sur Android, il bascule même le micro sur la
       * voie « communication vocale », qui travaille en 16 kHz mono.
       *
       * Trois traitements s'ajoutent alors, tous conçus pour une
       * conversation en direct, aucun pour une voix qu'on réécoute :
       *
       *   - l'ANNULATION D'ÉCHO suppose qu'un haut-parleur joue en même
       *     temps et soustrait ce qu'elle croit être son écho. Ici rien ne
       *     joue : elle ne retire que des morceaux de la vraie voix.
       *   - la SUPPRESSION DE BRUIT coupe tout ce qui ressemble à un fond
       *     continu. Elle emporte avec lui les graves et les souffles qui
       *     font qu'une voix est reconnaissable, et elle hache les fins de
       *     mots. C'est elle, le métallique.
       *   - le RÉGLAGE AUTOMATIQUE DU VOLUME, lui, est utile et on le
       *     GARDE : une femme ne tient pas son téléphone à la même
       *     distance d'un bout à l'autre, et sans lui la moitié du message
       *     serait inaudible.
       *
       * On demande donc 48 kHz, un seul canal (une voix n'a pas de stéréo,
       * et deux canaux doubleraient le poids pour rien), et on coupe les
       * deux traitements qui abîment.
       *
       * CE QU'ON ACCEPTE EN ÉCHANGE : le bruit de la rue s'entendra. C'est
       * le bon côté du marché. Un fond sonore naturel se comprend ; une
       * voix hachée et métallique ne se reconnaît pas, et le but d'un
       * message vocal est justement qu'on reconnaisse celle qui parle.
       *
       * Ces valeurs sont des SOUHAITS, pas des exigences : un navigateur
       * qui ne sait pas les tenir enregistre quand même, au lieu de
       * refuser le micro.
       */
      flux = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
    } catch (e: unknown) {
      const nom = (e as { name?: string })?.name;

      /*
       * LE REPLI : UN SON MOINS BON VAUT MIEUX QUE PAS DE SON.
       *
       * Les valeurs ci-dessus sont écrites comme des souhaits, et la plupart
       * des navigateurs les traitent ainsi. Mais pas tous : certains
       * refusent la demande entière plutôt que d'ignorer ce qu'ils ne savent
       * pas tenir, et répondent `OverconstrainedError` ou `NotFoundError`.
       *
       * Sans ce repli, une femme dont le téléphone est un peu ancien
       * perdrait le micro COMPLÈTEMENT, et lirait « ce téléphone n'arrive
       * pas à ouvrir le micro » — ce qui serait faux, et ce qui la
       * renverrait à l'écriture. Or le vocal est justement le chemin de
       * celle qui lit mal.
       *
       * On redemande donc le micro sans aucune exigence. La voix sera
       * retraitée comme avant, c'est-à-dire moins belle, mais elle existera.
       *
       * UN REFUS D'AUTORISATION NE SE REJOUE PAS : si elle a dit non, ou si
       * le navigateur a bloqué, redemander ne ferait que lui poser deux fois
       * la même question. On ne se replie que sur un refus TECHNIQUE.
       */
      const technique = nom !== 'NotAllowedError' && nom !== 'SecurityError';
      if (technique) {
        try {
          flux = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          flux = null;
        }
      }

      if (!flux) {
        etat('refuse');
        temps.textContent = '';
        dire(
          nom === 'NotAllowedError' || nom === 'SecurityError'
            ? 'Le micro est refusé. Autorise-le dans les réglages du navigateur, ou écris ton message.'
            : "Ce téléphone n'arrive pas à ouvrir le micro. Écris ton message."
        );
        return;
      }
    }

    /*
     * LE DÉBIT, ET POURQUOI 64 000 ET PAS PLUS.
     *
     * Sans cette ligne, le navigateur choisit lui-même, et il choisit bas :
     * il suppose une voix de téléphone, puisque c'est ce qu'on lui demandait
     * jusqu'ici. Le résultat était maigre même une fois le micro corrigé.
     *
     * 64 kbit/s en Opus mono, c'est une voix pleine, qu'on reconnaît. Et le
     * calcul tient dans la limite de la base : 90 secondes au maximum, à
     * 64 000 bits par seconde, font 720 000 octets. La base en refuse
     * 1 200 000 (voir la migration 20261013140000). Il reste donc 40 % de
     * marge, assez pour qu'un navigateur qui dépasse un peu ne fasse pas
     * perdre son message à une femme qui vient de parler une minute et
     * demie.
     *
     * Monter plus haut n'apporterait rien d'audible sur une voix, et
     * coûterait des données sur un forfait compté.
     */
    enregistreur = new MediaRecorder(flux, {
      ...(format ? { mimeType: format } : {}),
      audioBitsPerSecond: 64_000,
    });
    morceaux = [];
    enregistreur.ondataavailable = (ev) => {
      if (ev.data.size > 0) morceaux.push(ev.data);
    };
    enregistreur.onstop = () => {
      libererMicro();
      const type = enregistreur?.mimeType || format || 'audio/webm';
      blob = new Blob(morceaux, { type });
      secondes = Math.max(1, Math.round((Date.now() - debut) / 1000));
      temps.textContent = mmss(Math.min(secondes, MAX_SECONDES));
      if (blob.size < 500) {
        etat('refuse');
        dire("On n'a rien entendu. Rapproche-toi du téléphone et recommence.");
        return;
      }
      /*
       * LA LIMITE DE LA BASE, VÉRIFIÉE ICI AUSSI.
       *
       * La base refuse au-delà de 1 200 000 octets (migration
       * 20261013140000). À 64 kbit/s, 90 secondes en font 720 000 : on ne
       * devrait jamais y arriver. Mais `audioBitsPerSecond` est un souhait,
       * pas une loi, et un navigateur qui l'ignore enverrait un message que
       * la base rejetterait APRÈS l'envoi, c'est-à-dire après l'attente.
       *
       * Le dire ici, tout de suite, lui évite d'envoyer pour rien et lui
       * donne la seule consigne utile : parler moins longtemps.
       */
      if (blob.size > 1_150_000) {
        etat('refuse');
        dire('Ce message est trop lourd pour être envoyé. Refais-le un peu plus court.');
        return;
      }
      etat('pret');
      dire('Réécoute avant d’envoyer, ou recommence.');
    };

    debut = Date.now();
    enregistreur.start();
    etat('enregistre');
    temps.textContent = '0:00';
    dire('Parle. Touche stop quand tu as fini.');

    minuteur = window.setInterval(() => {
      const s = Math.round((Date.now() - debut) / 1000);
      temps.textContent = mmss(s);
      // Au-delà de 90 secondes, ce n'est plus une question : on coupe nous-mêmes
      // plutôt que de laisser envoyer ce que la base refusera.
      if (s >= MAX_SECONDES) arreter();
    }, 250);
  };

  bouton.addEventListener('click', () => {
    const e = panneau.dataset.etat;
    if (e === 'enregistre') arreter();
    else if (e === 'pret' || e === 'envoi') return;
    else void commencer();
  });

  btnStop.addEventListener('click', arreter);

  btnAnnuler.addEventListener('click', () => {
    if (enregistreur && enregistreur.state !== 'inactive') {
      enregistreur.onstop = null;
      enregistreur.stop();
    }
    oublier();
    etat('repos');
    dire('');
  });

  btnEcouter.addEventListener('click', () => {
    if (!blob) return;
    if (lecture && !lecture.paused) {
      lecture.pause();
      return;
    }
    if (!urlLocale) urlLocale = URL.createObjectURL(blob);
    lecture = new Audio(urlLocale);
    void lecture.play();
  });

  btnEnvoyer.addEventListener('click', async () => {
    if (!blob) return;
    etat('envoi');
    dire('Envoi…');
    lecture?.pause();

    try {
      // Du binaire passe en JSON par le base64, qui pèse un tiers de plus :
      // c'est le prix d'une seule route et d'une seule règle côté base.
      const octets = new Uint8Array(await blob.arrayBuffer());
      let texte = '';
      for (let i = 0; i < octets.length; i += 0x8000) {
        texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      }
      const rep = await fetch('/vocal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Chez qui ? Une femme écrit à la boutique ou au médecin (`sujet`) ;
          // l'administratrice répond dans un fil précis (`fil`).
          sujet: bouton.dataset.sujet ?? 'medecin',
          fil: bouton.dataset.fil ?? null,
          base64: btoa(texte),
          // « audio/webm;codecs=opus » devient « audio/webm » : la base ne
          // connaît que le type, pas ses paramètres.
          type: blob.type.split(';')[0],
          secondes: Math.min(secondes, MAX_SECONDES),
        }),
      });
      const lu = await rep.json().catch(() => ({}));
      if (rep.ok && lu.ok) {
        oublier();
        // La conversation se relit depuis le serveur : c'est lui qui a le
        // vocal rangé, avec sa durée.
        location.assign(location.pathname);
        return;
      }
      etat('pret');
      dire(lu.message ?? "Le vocal n'est pas parti. Réessaie.");
    } catch {
      etat('pret');
      dire('La connexion a coupé. Ton vocal est toujours là, réessaie.');
    }
  });

  // Elle quitte la page en plein enregistrement : on rend le micro.
  window.addEventListener('pagehide', oublier);
}

export {};
