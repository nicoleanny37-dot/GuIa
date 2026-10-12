/**
 * AudioHapticsEngine: Gerencia os sinais sonoros (earcons) e padrões táteis de vibração
 * em estrita conformidade com a Especificação UX e Acessibilidade do GuIa.
 */
class AudioHapticsEngine {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // --- MOTOR HÁPTICO (VIBRAÇÃO) ---
  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (err) {
        console.warn('Erro na vibração:', err);
      }
    }
  }

  vibrateAppOpen() {
    // 1 longa (400 ms)
    this.vibrate(400);
  }

  vibrateShort() {
    // 1 curta (100 ms)
    this.vibrate(100);
  }

  vibrateAwaiting() {
    // 2 curtas (100 ms + pausa 100 ms + 100 ms)
    this.vibrate([100, 100, 100]);
  }

  vibrateConfirmed() {
    // 1 longa (400 ms)
    this.vibrate(400);
  }

  vibrateStopPassed() {
    // 1 curta (100 ms)
    this.vibrate(100);
  }

  vibrateThreeStopsRemaining() {
    // 2 curtas (curta + pausa + curta)
    this.vibrate([100, 150, 100]);
  }

  vibrateBusApproaching() {
    // 3 longas sequenciais (o padrão mais forte do app)
    this.vibrate([400, 200, 400, 200, 400]);
  }

  vibrateArrival() {
    // 1 longa + 2 curtas (assinatura tátil exclusiva de 'chegou')
    this.vibrate([400, 150, 100, 100, 100]);
  }

  vibrateSOSDetectedFirst() {
    // 3 curtas (diferente das 3 longas do ônibus)
    this.vibrate([100, 100, 100, 100, 100]);
  }

  vibrateEmergencyTriggered() {
    // Vibração longa e contínua até conectar
    this.vibrate([500, 100, 500, 100, 500, 100, 500]);
  }

  // --- MOTOR SONORO (EARCONS SINTETIZADOS) ---
  playBeep(frequency, duration, type = 'sine') {
    if (this.isMuted) return;
    this.initAudio();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

    gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + duration);
  }

  playAppReady() {
    // Tom suave ascendente ao abrir o aplicativo
    this.initAudio();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.35);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playMicStart() {
    // Bip agudo curto (início da escuta)
    this.playBeep(880, 0.09, 'sine');
  }

  playMicStop() {
    // Bip duplo grave (fim da escuta)
    this.playBeep(440, 0.08, 'triangle');
    setTimeout(() => this.playBeep(330, 0.12, 'triangle'), 100);
  }

  playQuestionPrompt() {
    // Bip agudo convidando resposta do usuário
    this.playBeep(750, 0.12, 'sine');
  }

  playThreeStopsNotice() {
    // Som curto de 2 notas quando faltarem 3 paradas
    this.playBeep(523.25, 0.12, 'sine'); // C5
    setTimeout(() => this.playBeep(659.25, 0.18, 'sine'), 130); // E5
  }

  playStopTick() {
    // Tique suave a cada parada ultrapassada
    this.playBeep(800, 0.03, 'sine');
  }

  playBusApproachingTone() {
    // 3 tons ascendentes periódicos
    this.playBeep(440, 0.1, 'sine');
    setTimeout(() => this.playBeep(554.37, 0.1, 'sine'), 110);
    setTimeout(() => this.playBeep(659.25, 0.15, 'sine'), 220);
  }

  playArrivalFanfare() {
    // Melodia ascendente de 3 notas resolvendo para cima
    this.playBeep(440, 0.14, 'triangle');
    setTimeout(() => this.playBeep(554.37, 0.14, 'triangle'), 150);
    setTimeout(() => this.playBeep(880, 0.28, 'triangle'), 300);
  }

  playWordSavedSuccess() {
    // 2 notas descendentes firmes indicando salvamento
    this.playBeep(659.25, 0.12, 'sine');
    setTimeout(() => this.playBeep(440, 0.2, 'sine'), 130);
  }

  playDiscreetSosFirstDetected() {
    // 1 tom médio discreto = palavra reconhecida
    this.playBeep(520, 0.12, 'sine');
  }

  playEmergencyAlarm() {
    // Tom contínuo pulsante de emergência
    this.playBeep(920, 0.25, 'sawtooth');
    setTimeout(() => this.playBeep(700, 0.25, 'sawtooth'), 260);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioHapticsEngine;
}