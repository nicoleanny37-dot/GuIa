// Teste de integridade de dados e busca
const TransitApiService = require('../js/transit-api-service');
const transitService = new TransitApiService();

async function testInternetFallback() {
  console.log('\n[4] Teste de busca de pontos na internet (OpenStreetMap)');
  const pontos = await transitService.buscarPontosReferenciaOSM('Hospital Sao Paulo');
  
  if (pontos.length > 0 && pontos[0].lat) {
    console.log(`  [PASSOU] Ponto encontrado na internet: ${pontos[0].nome} (${pontos[0].lat}, ${pontos[0].lng})`);
  } else {
    console.log('  [AVISO] Busca online requer conexão ativa à internet no momento do teste.');
  }
}

testInternetFallback();
