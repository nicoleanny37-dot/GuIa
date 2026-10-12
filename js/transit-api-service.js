/**
 * TransitApiService: Integração com serviços de transporte e geocodificação na internet.
 * - SPTrans Olho Vivo (linhas oficiais e paradas da cidade de São Paulo)
 * - OpenStreetMap Overpass API (fallback geográfico para pontos de ônibus e referências)
 */
class TransitApiService {
  constructor(apiToken = null) {
    // Token de desenvolvedor da API Olho Vivo SPTrans (se configurado)
    this.sptransToken = apiToken || localStorage.getItem('guia_sptrans_token') || null;
    this.sptransBaseUrl = 'https://api.olhovivo.sptrans.com.br/v2.1';
    this.osmBaseUrl = 'https://overpass-api.de/api/interpreter';
  }

  setToken(token) {
    this.sptransToken = token;
    localStorage.setItem('guia_sptrans_token', token);
  }

  /**
   * Autentica na API Olho Vivo da SPTrans
   */
  async authenticateSPTrans() {
    if (!this.sptransToken) return false;
    try {
      const res = await fetch(`${this.sptransBaseUrl}/Login/Autenticar?token=${this.sptransToken}`, {
        method: 'POST'
      });
      return res.ok;
    } catch (err) {
      console.warn('Falha na autenticação da SPTrans:', err);
      return false;
    }
  }

  /**
   * Busca linhas de ônibus na SPTrans por número ou letreiro
   */
  async buscarLinhaNaInternet(termoBusca) {
    if (this.sptransToken) {
      try {
        const authed = await this.authenticateSPTrans();
        if (authed) {
          const res = await fetch(`${this.sptransBaseUrl}/Linha/Buscar?termosBusca=${encodeURIComponent(termoBusca)}`);
          if (res.ok) {
            const data = await res.json();
            return data.map(item => ({
              codigoLinha: item.cl,
              codigoLetreiro: item.lc,
              letreiro: `${item.lt}-${item.tl}`,
              sentido: item.sl === 1 ? 'Terminal Principal → Secundário' : 'Terminal Secundário → Principal',
              denominacao: item.tp + ' / ' + item.ts
            }));
          }
        }
      } catch (err) {
        console.warn('Erro ao consultar SPTrans Olho Vivo:', err);
      }
    }

    // Fallback: Busca via OpenStreetMap / Nominatim
    return this.buscarPontosReferenciaOSM(termoBusca);
  }

  /**
   * Busca paradas e pontos de interesse em São Paulo via OpenStreetMap Overpass API
   */
  async buscarPontosReferenciaOSM(query) {
    const encoded = encodeURIComponent(query);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encoded}+Sao+Paulo+SP&format=json&addressdetails=1&limit=5`;

    try {
      const response = await fetch(nominatimUrl, {
        headers: { 'Accept-Language': 'pt-BR' }
      });
      if (!response.ok) return [];
      const results = await response.json();

      return results.map((item, idx) => ({
        id: 1000 + idx,
        nome: item.display_name.split(',')[0],
        logradouro: item.address.road || item.display_name.split(',')[0],
        numero: item.address.house_number ? parseInt(item.address.house_number, 10) : null,
        bairro: item.address.suburb || item.address.neighbourhood || 'São Paulo',
        tipo: item.type === 'station' ? 'estacao' : (item.type === 'bus_stop' ? 'parada' : 'referencia'),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        tags: [item.display_name.toLowerCase(), query.toLowerCase()]
      }));
    } catch (e) {
      console.warn('Erro buscando no OpenStreetMap:', e);
      return [];
    }
  }

  /**
   * Baixa paradas de uma linha identificada e formata para o banco de dados do GuIa
   */
  async baixarParadasDaLinha(codigoLinha) {
    if (!this.sptransToken) return [];
    try {
      const res = await fetch(`${this.sptransBaseUrl}/Parada/BuscarParadasPorLinha?codigoLinha=${codigoLinha}`);
      if (!res.ok) return [];
      const paradasRaw = await res.json();

      return paradasRaw.map(p => ({
        codigo_sptrans: p.cp.toString(),
        nome: p.np,
        logradouro: p.ed,
        numero: null,
        bairro: null,
        tipo: 'parada',
        lat: p.py,
        lng: p.px,
        tags: [p.np.toLowerCase(), p.ed.toLowerCase()]
      }));
    } catch (err) {
      console.warn('Erro ao baixar paradas da linha:', err);
      return [];
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TransitApiService;
}
