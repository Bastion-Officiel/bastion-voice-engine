# 🎙️ bastion-voice-engine

<p align="center">
  <img src="https://img.shields.io/badge/Module-Haute_Fidelite-5865F2?style=for-the-badge" alt="Module" />
  <a href="https://webrtc.org"><img src="https://img.shields.io/badge/WebRTC-Enabled-23A55A?style=for-the-badge" alt="WebRTC" /></a>
  <a href="https://developer.mozilla.org/fr/docs/Web/API/Web_Audio_API"><img src="https://img.shields.io/badge/Web_Audio_API-W3C-FEE75C?style=for-the-badge" alt="Web Audio API" /></a>
  <img src="https://img.shields.io/badge/License-MIT-gray?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Moteur de traitement vocal haute fidélité et WebRTC pour BASTION.</strong><br/>
  Analyse fréquentielle en temps réel, détection active de prise de parole (VAD), suppression de bruit et passerelle de conférence Stage.
</p>

---

## 🌟 Fonctionnalités Clés

- 🎧 **Qualité Audio Studio** : Fréquence d'échantillonnage 48 kHz avec annulation d'écho et contrôle automatique de gain (AGC).
- ⚡ **Détection Vocale Active (VAD)** : Détection dynamique de parole avec filtrage intelligent des bruits de fond et lissage temporel anti-coupure.
- 📊 **Analyseur Fréquentiel FFT** : Visualisation en direct du spectre audio et calcul de volume crête/moyen.
- 🏛️ **Passerelle Conférence Stage** : Gestion stricte des rôles (Intervenant, Auditeur, Modérateur), système de levée de main et mixage dynamique.

---

## 📦 Installation

```bash
npm install @bastion-hub/voice-engine
```

---

## 🚀 Démarrage Rapide

### 1. Initialiser le micro & le VAD

```javascript
const { VoiceEngine } = require('@bastion-hub/voice-engine');

const engine = new VoiceEngine({
    sampleRate: 48000,
    noiseSuppression: true,
    echoCancellation: true,
    vadThreshold: 20 // Sensibilité (0-100)
});

// Démarrer la capture micro
await engine.initMicrophone();

// Écouter l'état de prise de parole (animation du cercle vert)
engine.on('voiceStateChange', ({ isSpeaking, volume }) => {
    if (isSpeaking) {
        console.log(`🗣️ En train de parler (Volume: ${Math.round(volume)})`);
    } else {
        console.log('🤫 Silence');
    }
});
```

### 2. Conférence Stage (Intervenants / Auditeurs)

```javascript
const { StageConferenceBridge } = require('@bastion-hub/voice-engine');

const stage = new StageConferenceBridge(engine, {
    channelId: 'stage-123',
    role: 'listener' // 'speaker' ou 'listener'
});

// Lever la main pour demander la parole
stage.toggleRaiseHand();

stage.on('handRaisedChange', ({ raised }) => {
    console.log(raised ? '✋ Main levée' : '✋ Main baissée');
});
```

---

## 📄 Licence

Distribué sous licence **MIT**. Développé pour l'écosystème **BASTION**.
