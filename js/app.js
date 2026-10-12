/**
 * App: Orquestrador da Aplicação GuIa
 */
document.addEventListener('DOMContentLoaded', async () => {
  const audioHaptics = new AudioHapticsEngine();
  const voice = new VoiceEngine(audioHaptics);
  
  // Carrega paradas oficiais da linha 875C-10
  let stops = [];
  try {
    const res = await fetch('data/stops-875c-10.json');
    stops = await res.json();
  } catch (e) {
    console.error('Erro carregando paradas:', e);
  }

  const nlu = new NLUEngine(stops);
  const geoNav = new GeolocationNavigationEngine(stops, audioHaptics);
  const emergency = new EmergencySecurityModule(audioHaptics, voice);

  // Elementos do DOM
  const views = {
    onboarding: document.getElementById('view-onboarding'),
    askDestination: document.getElementById('view-ask-destination'),
    confirmDestination: document.getElementById('view-confirm-destination'),
    activeTrip: document.getElementById('view-active-trip'),
    busApproaching: document.getElementById('view-bus-approaching'),
    aiResponse: document.getElementById('view-ai-response'),
    arrival: document.getElementById('view-arrival'),
    offerSos: document.getElementById('view-offer-sos'),
    recordSos: document.getElementById('view-record-sos'),
    confirmSos: document.getElementById('view-confirm-sos'),
    sosFirstHeard: document.getElementById('view-sos-first-heard'),
    sosCalling: document.getElementById('view-sos-calling')
  };

  let activeDestination = null;
  let tempCandidateWord = null;

  function switchView(targetKey) {
    Object.keys(views).forEach(key => {
      if (views[key]) {
        views[key].classList.toggle('hidden', key !== targetKey);
      }
    });
  }

  // --- CONFIGURAÇÃO DE SEGURANÇA E CALLBACKS SOS ---
  emergency.onFirstWordDetectedCallback = (secondsLeft) => {
    switchView('sosFirstHeard');
    document.getElementById('sos-countdown-text').innerText = `${secondsLeft}s`;
  };

  emergency.onEmergencyTriggeredCallback = (secondsLeft) => {
    switchView('sosCalling');
    document.getElementById('sos-call-countdown').innerText = `Em ${secondsLeft} segundos...`;
  };

  emergency.onResetCallback = () => {
    if (activeDestination) {
      switchView('activeTrip');
    } else {
      switchView('askDestination');
    }
  };

  document.getElementById('btn-cancel-sos-heard').addEventListener('click', () => {
    emergency.resetEmergencyDetection();
  });

  document.getElementById('btn-cancel-sos-call').addEventListener('click', () => {
    emergency.cancelEmergencyTrigger();
  });

  // --- FLUXO 01: ONBOARDING & PERMISSÕES ---
  audioHaptics.vibrateAppOpen();
  audioHaptics.playAppReady();
  
  voice.speak(
    "Olá. Eu vou guiar você no ônibus por voz. Para começar, preciso da sua localização e do microfone. Toque duas vezes para permitir.",
    () => audioHaptics.vibrateAwaiting()
  );

  document.getElementById('btn-allow-permissions').addEventListener('click', async () => {
    audioHaptics.vibrateShort();
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      geoNav.startTracking(handleNavUpdate);
      switchView('askDestination');
      startDestinationPrompt();
    } catch (e) {
      console.warn('Permissão concedida parcialmente ou simulada:', e);
      switchView('askDestination');
      startDestinationPrompt();
    }
  });

  document.getElementById('btn-deny-permissions').addEventListener('click', () => {
    switchView('askDestination');
    startDestinationPrompt();
  });

  // --- FLUXO 02: PEDIR DESTINO ---
  function startDestinationPrompt() {
    voice.speak("Para onde você quer ir? Fale depois do sinal.", () => {
      audioHaptics.playQuestionPrompt();
      audioHaptics.vibrateShort();
      voice.startListening(handleDestinationSpeech);
    });
  }

  document.getElementById('btn-mic-destination').addEventListener('click', () => {
    if (voice.isListening) {
      voice.stopListening();
    } else {
      voice.startListening(handleDestinationSpeech);
    }
  });

  function handleDestinationSpeech(transcript) {
    document.getElementById('transcript-text').innerText = `"${transcript}"`;

    // Verifica se é palavra de socorro
    if (emergency.processSpeechForEmergency(transcript)) return;

    const intent = nlu.classifyIntent(transcript);

    if (intent.type === 'SET_DESTINATION' && intent.destination) {
      activeDestination = intent.destination;
      showDestinationConfirmation(activeDestination);
    } else {
      voice.speak("Não encontrei esse ponto na linha 875C-10. Diga o nome de uma parada, rua ou estação.");
    }
  }

  // --- FLUXO 03: CONFIRMAÇÃO DO DESTINO ---
  function showDestinationConfirmation(dest) {
    switchView('confirmDestination');
    document.getElementById('confirmed-dest-title').innerText = dest.nome;
    const promptText = `Entendi: ${dest.nome}, pela linha 875C-10. Diga 'confirmar' ou 'corrigir'.`;

    voice.speak(promptText, () => {
      audioHaptics.playQuestionPrompt();
      audioHaptics.vibrateAwaiting();
      voice.startListening((resp) => {
        const replyIntent = nlu.classifyIntent(resp);
        if (replyIntent.type === 'CONFIRM') {
          confirmAndStartJourney();
        } else if (replyIntent.type === 'CORRECTION' || replyIntent.type === 'CANCEL') {
          switchView('askDestination');
          startDestinationPrompt();
        }
      });
    });
  }

  document.getElementById('btn-confirm-dest').addEventListener('click', confirmAndStartJourney);
  document.getElementById('btn-correct-dest').addEventListener('click', () => {
    switchView('askDestination');
    startDestinationPrompt();
  });

  function confirmAndStartJourney() {
    audioHaptics.vibrateConfirmed();
    geoNav.setDestination(activeDestination);

    // Se o usuário ainda não cadastrou a palavra SOS, sugere agora
    if (!emergency.emergencyWord) {
      switchView('offerSos');
      voice.speak("Quer definir uma palavra de emergência? Se você falar essa palavra 2 vezes em menos de 20 segundos, eu ligo para o 190. Diga sim ou agora não.", () => {
        audioHaptics.playQuestionPrompt();
        audioHaptics.vibrateAwaiting();
        voice.startListening((answer) => {
          const ansIntent = nlu.classifyIntent(answer);
          if (ansIntent.type === 'CONFIRM') {
            startRecordSos();
          } else {
            startActiveTripView();
          }
        });
      });
    } else {
      startActiveTripView();
    }
  }

  // --- FLUXO 08 a 10: CONFIGURAÇÃO SOS ---
  document.getElementById('btn-define-sos-yes').addEventListener('click', startRecordSos);
  document.getElementById('btn-define-sos-no').addEventListener('click', startActiveTripView);

  function startRecordSos() {
    switchView('recordSos');
    voice.speak("Fale sua palavra de emergência depois do sinal. Escolha uma palavra que você não usa no dia a dia.", () => {
      audioHaptics.playQuestionPrompt();
      voice.startListening((recordedWord) => {
        const val = nlu.validateEmergencyWord(recordedWord);
        if (val.valid) {
          tempCandidateWord = val.cleanWord;
          showSosConfirmation(tempCandidateWord);
        } else {
          voice.speak(val.reason, () => startRecordSos());
        }
      });
    });
  }

  function showSosConfirmation(word) {
    switchView('confirmSos');
    document.getElementById('display-sos-word').innerText = word.toUpperCase();
    voice.speak(`Sua palavra de emergência é: ${word}. Se você falar ${word} 2 vezes em até 20 segundos, eu ligo para o 190. Diga salvar ou corrigir.`, () => {
      audioHaptics.playQuestionPrompt();
      audioHaptics.vibrateAwaiting();
      voice.startListening((ans) => {
        const ansIntent = nlu.classifyIntent(ans);
        if (ansIntent.type === 'CONFIRM') {
          emergency.saveEmergencyWord(tempCandidateWord);
          startActiveTripView();
        } else {
          startRecordSos();
        }
      });
    });
  }

  document.getElementById('btn-save-sos-word').addEventListener('click', () => {
    emergency.saveEmergencyWord(tempCandidateWord);
    startActiveTripView();
  });

  document.getElementById('btn-correct-sos-word').addEventListener('click', startRecordSos);

  // --- FLUXO 04: TRAJETO ATIVO ---
  function startActiveTripView() {
    switchView('activeTrip');
    voice.speak("Monitoramento iniciado. Vou avisar cada parada e o momento certo de descer.");
  }

  function handleNavUpdate(data) {
    if (!data || !activeDestination) return;

    const remaining = data.stopsRemaining !== null ? data.stopsRemaining : 0;
    document.getElementById('remaining-stops-count').innerText = `Faltam ${remaining} paradas`;
    document.getElementById('current-stop-name').innerText = data.currentStop ? data.currentStop.nome : 'Em trânsito';
    document.getElementById('target-stop-name').innerText = activeDestination.nome;

    if (remaining === 0) {
      showArrivalScreen();
    }
  }

  // --- FLUXO 06: DÚVIDAS A BORDO ---
  document.getElementById('btn-ask-during-trip').addEventListener('click', () => {
    voice.speak("Pode perguntar.", () => {
      audioHaptics.playQuestionPrompt();
      voice.startListening((query) => {
        if (emergency.processSpeechForEmergency(query)) return;

        const intent = nlu.classifyIntent(query);
        switchView('aiResponse');
        document.getElementById('user-question-text').innerText = `"${query}"`;

        let reply = "";
        const remaining = geoNav.destinationStop ? Math.max(0, stops.findIndex(s => s.id === geoNav.destinationStop.id) - geoNav.currentStopIndex) : 0;

        if (intent.type === 'QUERY_TRIP_STATUS') {
          reply = `Faltam ${remaining} paradas, cerca de ${remaining * 3} minutos. Eu aviso quando for a hora de descer.`;
        } else if (intent.type === 'QUERY_DESCENT') {
          reply = remaining <= 1 ? "Prepare-se para descer na próxima parada." : `Ainda não. Faltam ${remaining} paradas.`;
        } else {
          reply = `Você está na linha 875C-10 em direção a ${activeDestination ? activeDestination.nome : 'Metrô Santa Cruz'}.`;
        }

        document.getElementById('ai-response-text').innerText = reply;
        audioHaptics.vibrateShort();
        voice.speak(reply);
      });
    });
  });

  document.getElementById('btn-back-to-trip').addEventListener('click', () => {
    switchView('activeTrip');
  });

  // --- FLUXO 07: DESEMBARQUE FINAL ---
  function showArrivalScreen() {
    switchView('arrival');
    document.getElementById('arrival-title').innerText = `Você chegou: ${activeDestination.nome}`;
    const orientation = activeDestination.tipo === 'terminal' || activeDestination.tipo === 'estacao'
      ? "Desça pela porta do meio. A entrada da estação fica à sua direita, a 30 metros."
      : "Desça pela porta do meio com atenção à guia da calçada.";

    document.getElementById('arrival-instructions').innerText = orientation;
    voice.speak(`Você chegou ao ${activeDestination.nome}. ${orientation}`);
  }

  document.getElementById('btn-new-trip').addEventListener('click', () => {
    activeDestination = null;
    switchView('askDestination');
    startDestinationPrompt();
  });
});
