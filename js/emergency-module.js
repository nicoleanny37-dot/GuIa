/**
 * EmergencySecurityModule: Gerencia a palavra de emergência,
 * contatos de emergência e procedimento de acionamento do 190.
 */
class EmergencySecurityModule {
  constructor(audioHaptics, voiceEngine) {
    this.audioHaptics = audioHaptics;
    this.voiceEngine = voiceEngine;
    this.emergencyWord = localStorage.getItem('guia_sos_word') || null;
    this.emergencyContacts = JSON.parse(localStorage.getItem('guia_sos_contacts') || '[]');
    this.sharedDataPrefs = JSON.parse(localStorage.getItem('guia_shared_prefs') || '{"location":true,"route":true,"medical":true}');

    this.firstDetectionTimestamp = null;
    this.countdownTimer = null;
    this.callCountdownTimer = null;
    this.onEmergencyTriggeredCallback = null;
    this.onFirstWordDetectedCallback = null;
    this.onResetCallback = null;
  }

  saveEmergencyWord(word) {
    this.emergencyWord = word.trim().toLowerCase();
    localStorage.setItem('guia_sos_word', this.emergencyWord);
    this.audioHaptics.playWordSavedSuccess();
    this.audioHaptics.vibrateConfirmed();
  }

  addEmergencyContact(name, phone) {
    this.emergencyContacts.push({ name, phone });
    localStorage.setItem('guia_sos_contacts', JSON.stringify(this.emergencyContacts));
  }

  setSharedPrefs(prefs) {
    this.sharedDataPrefs = { ...this.sharedDataPrefs, ...prefs };
    localStorage.setItem('guia_shared_prefs', JSON.stringify(this.sharedDataPrefs));
  }

  /**
   * Monitora a palavra de emergência a cada fala capturada
   */
  processSpeechForEmergency(transcript) {
    if (!this.emergencyWord) return false;

    const norm = transcript.toLowerCase();
    const words = norm.split(/\s+/);
    const matched = words.includes(this.emergencyWord);

    if (!matched) return false;

    const now = Date.now();

    // Primeira detecção: abre a janela de 20 segundos
    if (!this.firstDetectionTimestamp || (now - this.firstDetectionTimestamp) > 20000) {
      this.firstDetectionTimestamp = now;
      this.audioHaptics.playDiscreetSosFirstDetected();
      this.audioHaptics.vibrateSOSDetectedFirst();

      if (this.onFirstWordDetectedCallback) {
        this.onFirstWordDetectedCallback(20);
      }

      // Contador de 20 segundos
      clearInterval(this.countdownTimer);
      let remaining = 20;
      this.countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          this.resetEmergencyDetection();
        } else if (this.onFirstWordDetectedCallback) {
          this.onFirstWordDetectedCallback(remaining);
        }
      }, 1000);

      return true;
    }

    // Segunda detecção em menos de 20 segundos: aciona chamada ao 190
    if ((now - this.firstDetectionTimestamp) <= 20000) {
      clearInterval(this.countdownTimer);
      this.firstDetectionTimestamp = null;
      this.triggerEmergencyCall();
      return true;
    }

    return false;
  }

  triggerEmergencyCall() {
    this.audioHaptics.playEmergencyAlarm();
    this.audioHaptics.vibrateEmergencyTriggered();

    if (this.onEmergencyTriggeredCallback) {
      this.onEmergencyTriggeredCallback(5);
    }

    let secondsToCall = 5;
    this.voiceEngine.speak("Ligando para o 190 em 5 segundos. Diga cancelar para parar.");

    this.callCountdownTimer = setInterval(() => {
      secondsToCall -= 1;
      if (this.onEmergencyTriggeredCallback) {
        this.onEmergencyTriggeredCallback(secondsToCall);
      }

      if (secondsToCall <= 0) {
        clearInterval(this.callCountdownTimer);
        this.executeNativeDialer();
      }
    }, 1000);
  }

  cancelEmergencyTrigger() {
    clearInterval(this.countdownTimer);
    clearInterval(this.callCountdownTimer);
    this.firstDetectionTimestamp = null;
    this.audioHaptics.playMicStop();
    this.audioHaptics.vibrateShort();
    if (this.onResetCallback) {
      this.onResetCallback();
    }
  }

  resetEmergencyDetection() {
    clearInterval(this.countdownTimer);
    this.firstDetectionTimestamp = null;
    if (this.onResetCallback) {
      this.onResetCallback();
    }
  }

  executeNativeDialer() {
    // Acionamento real do discador de emergência nativo no celular
    window.location.href = 'tel:190';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmergencySecurityModule;
}
