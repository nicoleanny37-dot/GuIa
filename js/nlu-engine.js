/**
 * NLUEngine: Processamento de linguagem natural e compreensão contextual.
 */
class NLUEngine {
  constructor(stopsData) {
    this.stops = stopsData || [];
    this.forbiddenSosWords = [
      'onibus', 'ônibus', 'ponto', 'parada', 'descer', 'subir', 'linha',
      'lapa', 'santa cruz', 'catraca', 'motorista', 'trocador', 'bilhete'
    ];
  }

  normalize(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Identifica intenção geral do usuário a partir da fala
   */
  classifyIntent(transcript, currentContext = {}) {
    const norm = this.normalize(transcript);

    // Intenções de Confirmação e Cancelamento
    if (/^(sim|confirmar|confirma|esta certo|pode ser|isso|positivo)$/.test(norm)) {
      return { type: 'CONFIRM', raw: transcript };
    }
    if (/^(nao|cancelar|cancela|parar|agora nao|fechar|sai)$/.test(norm)) {
      return { type: 'CANCEL', raw: transcript };
    }

    // Mudança de intenção ou correção explícita
    if (norm.includes('corrigir') || norm.includes('errei') || norm.includes('muda') || norm.includes('mudar') || norm.includes('nao e')) {
      const match = this.matchDestination(transcript);
      return { type: 'CORRECTION', newDestination: match, raw: transcript };
    }

    // Perguntas durante a viagem
    if (norm.includes('quanto falta') || norm.includes('quantas paradas') || norm.includes('onde estamos') || norm.includes('proxima parada')) {
      return { type: 'QUERY_TRIP_STATUS', raw: transcript };
    }

    if (norm.includes('hora de descer') || norm.includes('tenho que descer') || norm.includes('ja cheguei')) {
      return { type: 'QUERY_DESCENT', raw: transcript };
    }

    // Procura por parada / destino na rota 875C-10
    const matchedStop = this.matchDestination(transcript);
    if (matchedStop) {
      return {
        type: 'SET_DESTINATION',
        destination: matchedStop,
        raw: transcript
      };
    }

    return { type: 'UNKNOWN', raw: transcript };
  }

  /**
   * Reconhece o destino na relação oficial de paradas da linha 875C-10
   */
  matchDestination(text) {
    const norm = this.normalize(text);

    // 1. Busca por tags exatas ou nomes de marcos
    for (const stop of this.stops) {
      for (const tag of stop.tags) {
        if (norm.includes(this.normalize(tag))) {
          return stop;
        }
      }
    }

    // 2. Busca por número predial + logradouro
    const numMatch = norm.match(/\b\d{2,4}\b/);
    if (numMatch) {
      const parsedNum = parseInt(numMatch[0], 10);
      const foundByNum = this.stops.find(s => s.numero === parsedNum);
      if (foundByNum) return foundByNum;
    }

    // 3. Busca por logradouro aproximado
    for (const stop of this.stops) {
      const normLogradouro = this.normalize(stop.logradouro);
      if (norm.includes(normLogradouro) || normLogradouro.includes(norm)) {
        return stop;
      }
    }

    return null;
  }

  /**
   * Validação de segurança para a Palavra-Chave de Socorro
   */
  validateEmergencyWord(word) {
    const norm = this.normalize(word);
    if (!norm || norm.length < 3) {
      return { valid: false, reason: 'A palavra deve ter pelo menos 3 letras.' };
    }

    if (norm.split(' ').length > 1) {
      return { valid: false, reason: 'Escolha uma palavra só, que você não costuma falar no dia a dia.' };
    }

    if (this.forbiddenSosWords.includes(norm)) {
      return {
        valid: false,
        reason: 'Esta palavra é comum demais no transporte coletivo. Escolha outra que você não usa no dia a dia.'
      };
    }

    return { valid: true, cleanWord: norm };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NLUEngine;
}
