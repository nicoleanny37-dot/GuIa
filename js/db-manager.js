/**
 * DBManager: Banco de dados local IndexedDB do aplicativo GuIa.
 * Armazena:
 * - Linhas de ônibus
 * - Paradas cadastradas e georreferenciadas (WGS84)
 * - Histórico de viagens, telemetria e ocorrências de segurança
 */
class DBManager {
  constructor() {
    this.dbName = 'GuIaDatabase';
    this.version = 2; // Atualizado para suporte a histórico avançado
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Tabela de Linhas
        if (!db.objectStoreNames.contains('linhas')) {
          const storeLinhas = db.createObjectStore('linhas', { keyPath: 'id' });
          storeLinhas.createIndex('nome', 'nome', { unique: false });
        }

        // 2. Tabela de Paradas
        if (!db.objectStoreNames.contains('paradas')) {
          const storeParadas = db.createObjectStore('paradas', { keyPath: 'id' });
          storeParadas.createIndex('nome', 'nome', { unique: false });
          storeParadas.createIndex('linhaId', 'linhaId', { unique: false });
          storeParadas.createIndex('tipo', 'tipo', { unique: false });
        }

        // 3. Tabela de Viagens do Passageiro
        if (!db.objectStoreNames.contains('viagens')) {
          const storeViagens = db.createObjectStore('viagens', { keyPath: 'id', autoIncrement: true });
          storeViagens.createIndex('linhaId', 'linhaId', { unique: false });
          storeViagens.createIndex('status', 'status', { unique: false });
          storeViagens.createIndex('dataInicio', 'dataInicio', { unique: false });
        }

        // 4. Logs de GPS e Auditoria
        if (!db.objectStoreNames.contains('viagem_logs')) {
          const storeLogs = db.createObjectStore('viagem_logs', { keyPath: 'id', autoIncrement: true });
          storeLogs.createIndex('viagemId', 'viagemId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Erro ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Popula a linha piloto 875C-10 e suas 46 paradas georreferenciadas
   */
  async seedPilotLine(stops875C) {
    if (!this.db) await this.init();

    const tx = this.db.transaction(['linhas', 'paradas'], 'readwrite');
    const linhasStore = tx.objectStore('linhas');
    const paradasStore = tx.objectStore('paradas');

    linhasStore.put({
      id: '875C-10',
      nome: 'Terminal Lapa / Metrô Santa Cruz',
      sentido: 'Terminal Lapa → Metrô Santa Cruz',
      extensaoKm: 24.5,
      tempoMedioMinutos: 80,
      totalParadas: stops875C.length
    });

    stops875C.forEach((stop, idx) => {
      paradasStore.put({
        ...stop,
        linhaId: '875C-10',
        ordem: idx + 1
      });
    });

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Salva novas paradas descobertas via internet no banco de dados local
   */
  async salvarParadasDaInternet(linhaId, paradasNovas) {
    if (!this.db) await this.init();
    const tx = this.db.transaction(['paradas'], 'readwrite');
    const store = tx.objectStore('paradas');

    paradasNovas.forEach(p => {
      store.put({ ...p, linhaId });
    });

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
    });
  }

  /**
   * Retorna paradas cadastradas de uma determinada linha
   */
  async obterParadasPorLinha(linhaId) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(['paradas'], 'readonly');
      const store = tx.objectStore('paradas');
      const index = store.index('linhaId');
      const req = index.getAll(linhaId);

      req.onsuccess = () => {
        // Ordena por sequência do itinerário
        const ordenadas = req.result.sort((a, b) => a.ordem - b.ordem);
        resolve(ordenadas);
      };
    });
  }

  /**
   * Registra o início de uma viagem
   */
  async registrarInicioViagem(linhaId, paradaOrigemId, paradaDestinoId) {
    if (!this.db) await this.init();
    const tx = this.db.transaction(['viagens'], 'readwrite');
    const store = tx.objectStore('viagens');

    const novaViagem = {
      linhaId,
      paradaOrigemId,
      paradaDestinoId,
      dataInicio: new Date().toISOString(),
      dataFim: null,
      status: 'EM_ANDAMENTO',
      paradasPercorridas: [],
      sosAcionado: false
    };

    return new Promise((resolve, reject) => {
      const req = store.add(novaViagem);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Grava log de telemetria por GPS e passagem em paradas
   */
  async registrarLogGps(viagemId, lat, lng, paradaId = null) {
    if (!this.db) await this.init();
    const tx = this.db.transaction(['viagem_logs', 'viagens'], 'readwrite');
    const logStore = tx.objectStore('viagem_logs');
    const viagemStore = tx.objectStore('viagens');

    logStore.add({
      viagemId,
      lat,
      lng,
      paradaId,
      timestamp: new Date().toISOString()
    });

    if (paradaId) {
      const vReq = viagemStore.get(viagemId);
      vReq.onsuccess = () => {
        const v = vReq.result;
        if (v && !v.paradasPercorridas.includes(paradaId)) {
          v.paradasPercorridas.push(paradaId);
          viagemStore.put(v);
        }
      };
    }
  }

  /**
   * Encerra a viagem (Concluída, Cancelada ou Emergência)
   */
  async finalizarViagem(viagemId, status = 'CONCLUIDA', sos = false) {
    if (!this.db) await this.init();
    const tx = this.db.transaction(['viagens'], 'readwrite');
    const store = tx.objectStore('viagens');

    const req = store.get(viagemId);
    req.onsuccess = () => {
      const v = req.result;
      if (v) {
        v.status = status;
        v.dataFim = new Date().toISOString();
        v.sosAcionado = sos;
        store.put(v);
      }
    };
  }

  /**
   * Lista o histórico de viagens
   */
  async listarHistoricoViagens() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(['viagens'], 'readonly');
      const store = tx.objectStore('viagens');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.reverse());
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DBManager;
}
