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
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: unknown) {
      etat('refuse');
      temps.textContent = '';
      dire(
        (e as { name?: string })?.name === 'NotAllowedError'
          ? 'Le micro est refusé. Autorise-le dans les réglages du navigateur, ou écris ton message.'
          : "Ce téléphone n'arrive pas à ouvrir le micro. Écris ton message."
      );
      return;
    }

    enregistreur = new MediaRecorder(flux, format ? { mimeType: format } : undefined);
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
