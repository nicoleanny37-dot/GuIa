/* ATENÇÃO: ESTE ARQUIVO TEM O SEU TOKEN. Cole só no Cloudflare. NUNCA suba no GitHub.
 *
 * previsao-worker.js — intermediário entre o GuIa e o Olho Vivo (SPTrans).
 *
 * Por que existe: o Olho Vivo exige um token e não aceita chamadas diretas do navegador
 * (não envia CORS e usa http). Este Cloudflare Worker guarda o token em segredo, conversa com o
 * Olho Vivo e devolve ao app um JSON simples:
 *   { "atualizadoEm": "14:32",
 *     "saida": { "parada": "Terminal Lapa", "hora": "14:45", "minutos": 13 },   // só na parada 1
 *     "passagens": [ { "hora": "14:36", "minutos": 4 }, { "hora": "14:51", "minutos": 19 } ] }
 *
 * IMPORTANTE: escrito a partir da documentação do Olho Vivo v2.1 e testado só com respostas
 * simuladas. Ainda não foi testado contra o serviço real (precisa do seu token).
 *
 * Como usar:
 *  1) Peça o token grátis em https://www.sptrans.com.br/desenvolvedores/ (cadastro de desenvolvedor).
 *  2) Crie um Worker em https://dash.cloudflare.com (Workers & Pages), cole este arquivo.
 *  3) Em Settings > Variables, crie o segredo SPTRANS_TOKEN com o seu token.
 *  4) Copie o endereço do Worker e cole em window.GUIA_CONFIG.previsaoUrl no topo do index.html.
 */
const BASE = 'http://api.olhovivo.sptrans.com.br/v2.1'; /* endereço que a documentação e as bibliotecas do Olho Vivo usam (http); o Worker pode chamá-lo, o navegador não */
const TOKEN_LOCAL = '3b929840e7f2a4d9d29d3e308ebbdcd31ad0f0dc293da08b5404ca8463092f6a'; /* deixe vazio e use o segredo SPTRANS_TOKEN do Cloudflare (recomendado). A versão "COM-TOKEN" tem o token aqui e NÃO deve ir para o GitHub. */
const ORIGENS = ['https://nicoleanny37-dot.github.io', 'http://localhost:8000', 'http://localhost:8123']; /* sites que podem chamar este Worker */
const cabecalhos = req => ({ 'Access-Control-Allow-Origin': ORIGENS.includes(req.headers.get('Origin')) ? req.headers.get('Origin') : ORIGENS[0], 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' });

function metros(a, b) { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng), h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const minutosEntre = (hr, t) => { const [h1, m1] = hr.split(':').map(Number), [h2, m2] = t.split(':').map(Number); let d = (h2 * 60 + m2) - (h1 * 60 + m1); if (d < -60) d += 1440; return Math.max(0, d); };

export default {
  async fetch(req, env) {
    const H = cabecalhos(req), resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: H });
    if (req.method === 'OPTIONS') return new Response(null, { headers: H });
    const origem = req.headers.get('Origin'); if (origem && !ORIGENS.includes(origem)) return resp({ erro: 'origem não permitida' }, 403);
    const token = env.SPTRANS_TOKEN || TOKEN_LOCAL; if (!token) return resp({ erro: 'token não configurado' }, 500);
    const u = new URL(req.url), lat = parseFloat(u.searchParams.get('lat')), lng = parseFloat(u.searchParams.get('lng'));
    const paradaId = parseInt(u.searchParams.get('parada') || '0', 10), linha = u.searchParams.get('linha') || '875C-10';
    if (!isFinite(lat) || !isFinite(lng)) return resp({ erro: 'lat/lng obrigatórios' }, 400);
    try {
      const login = await fetch(BASE + '/Login/Autenticar?token=' + encodeURIComponent(token), { method: 'POST' });
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
      if (!cookie) return resp({ erro: 'login recusado: confira o token' }, 502);
      const sp = async p => (await fetch(BASE + p, { headers: { Cookie: cookie } })).json();
      const [letreiro, tipo] = linha.split('-');
      const linhas = (await sp('/Linha/Buscar?termosBusca=' + encodeURIComponent(letreiro))).filter(l => l.lt === letreiro && String(l.tl) === String(tipo));
      if (!linhas.length) return resp({ erro: 'linha não encontrada' }, 404);
      const lapa = s => /lapa/i.test(s || '');
      /* sentido 1 = terminal principal → secundário; queremos sempre Terminal Lapa → Metrô Santa Cruz */
      const alvo = linhas.find(l => (l.sl === 1 && lapa(l.tp)) || (l.sl === 2 && lapa(l.ts))) || linhas[0];
      const paradas = await sp('/Parada/BuscarParadasPorLinha?codigoLinha=' + alvo.cl);
      let melhor = null;
      for (const p of paradas) { const d = metros({ lat, lng }, { lat: p.py, lng: p.px }); if (!melhor || d < melhor.d) melhor = { p, d }; }
      if (!melhor || melhor.d > 150) return resp({ passagens: [], aviso: 'nenhuma parada do Olho Vivo perto de ' + Math.round(melhor ? melhor.d : 0) + ' m' });
      const prev = await sp('/Previsao?codigoParada=' + melhor.p.cp + '&codigoLinha=' + alvo.cl);
      const hr = prev && prev.hr, veiculos = (prev && prev.p && prev.p.l || []).flatMap(l => l.vs || []);
      const passagens = hr ? veiculos.map(v => ({ hora: v.t, minutos: minutosEntre(hr, v.t) })).sort((a, b) => a.minutos - b.minutos).slice(0, 3) : [];
      const out = { atualizadoEm: hr || null, passagens };
      if (paradaId === 1 && passagens[0]) out.saida = { parada: 'Terminal Lapa', hora: passagens[0].hora, minutos: passagens[0].minutos };
      return resp(out);
    } catch (e) { return resp({ erro: 'falha ao consultar o Olho Vivo' }, 502); }
  }
};
