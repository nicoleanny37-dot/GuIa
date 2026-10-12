/**
 * VoiceEngine: Gerencia Text-to-Speech (TTS) e Speech-to-Text (STT)
 */
class VoiceEngine {
  constructor(audioHaptics) {
    this.audioHaptics = audioHaptics;
    this.synth = window.speechSynthesis || null;
    this.recognition = null;
    this.isListening = false;
    this.onResultCallback = null;
    this.onStateChangeCallback = null;
    this.currentUtterance = null;
    this.selectedVoice = null;

    this.initSpeechRecognition();
    this.initVoices();
  }

  initVoices() {
    if (!this.synth) return;
    const findVoice = () => {
      const voices = this.synth.getVoices();
      this.selectedVoice = voices.find(v => v.lang.startsWith('pt-BR') || v.lang.startsWith('pt')) || null;
    };
    findVoice();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = findVoice;
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition não é suportado nativamente neste navegador.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'pt-BR';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.audioHaptics.playMicStart();
      this.audioHaptics.vibrateShort();
      if (this.onStateChangeCallback) this.onStateChangeCallback('listening');
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      this.audioHaptics.playMicStop();
      if (this.onResultCallback) {
        this.onResultCallback(transcript);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Erro de reconhecimento de fala:', event.error);
      this.isListening = false;
      this.audioHaptics.playMicStop();
      if (this.onStateChangeCallback) this.onStateChangeCallback('error', event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onStateChangeCallback) this.onStateChangeCallback('idle');
    };
  }

  speak(text, onComplete = null) {
    if (!this.synth) {
      console.log('[TTS Falado]:', text);
      if (onComplete) onComplete();
      return;
    }

    this.synth.cancel(); // Interrompe fala anterior

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    utterance.onend = () => {
      if (onComplete) onComplete();
    };

    utterance.onerror = (err) => {
      console.warn('Erro na síntese de voz:', err);
      if (onComplete) onComplete();
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  startListening(onResult) {
    if (!this.recognition) {
      console.warn('Reconhecimento indisponível. Utilize entrada simulada/manual para testes.');
      return;
    }
    this.onResultCallback = onResult;
    try {
      this.recognition.start();
    } catch (e) {
      // Já iniciado
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceEngine;
}
