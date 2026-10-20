/**
 * GuIa — BOT DO RESPONSÁVEL (Telegram)
 *
 * É aqui que a pessoa responsável se cadastra para receber os alertas de emergência:
 *   1. No Telegram, ela abre o bot e envia /start: informa nome completo e data de nascimento.
 *   2. No aplicativo, a pessoa que usa o GuIa diz o nome completo dela. O bot manda um pedido com Aceitar / Recusar.
 *   3. Se aceitar, quando a palavra de segurança for dita em uma emergência o bot manda o alerta: hora, linha, parada e localização.
 *
 * Comandos do bot: /start  /status  /teste  /parar  /ajuda
 * Guarda os dados no KV (GUIA_KV). Segredos: TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET. Variável: BOT_USERNAME.
 */
import { MAX_RESPONSAVEIS, json, aleatorio, limpar, num, UID_OK, palavrasNome, hmacHex, parseNascimento, nomeChave, lerBody, getUser, putUser, limite, tg, removerContato } from './comum.js';

async function concluirVinculo(env, chat, uid, from) {
  const user = await getUser(env, uid);
  if (!user) return { erro: 'invalido' };
  user.contatos = user.contatos || [];
  if (!user.contatos.some(c => c.chat === chat)) {
    if (user.contatos.length >= MAX_RESPONSAVEIS) return { erro: 'limite' };
    user.contatos.push({ chat, nome: limpar(from && from.first_name, 40) || 'Responsável', desde: Date.now() });
    await putUser(env, uid, user);
    const idx = (await env.GUIA_KV.get('chat:' + chat, 'json')) || [];
    if (!idx.includes(uid)) { idx.push(uid); await env.GUIA_KV.put('chat:' + chat, JSON.stringify(idx)); }
  }
  return { user };
}

async function apagarPedidos(env, chat) {
  const l = await env.GUIA_KV.list({ prefix: 'pedido:' + chat + ':' });
  for (const k of l.keys) await env.GUIA_KV.delete(k.name);
}

async function aoClicar(cq, env) {
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const [acao, uid] = String(cq.data || '').split(':');
  const fim = (txt) => tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: txt || '' });
  if (!chat || !['sim', 'nao'].includes(acao) || !UID_OK.test(uid || '')) { await fim(); return; }
  const chave = 'pedido:' + chat + ':' + uid;
  if (!(await env.GUIA_KV.get(chave))) { await fim('Este pedido expirou.'); return; }
  await env.GUIA_KV.delete(chave);
  const user = await getUser(env, uid);
  if (!user) { await fim('Este pedido não é mais válido.'); return; }
  if (acao === 'nao') {
    user.recusas = (user.recusas || 0) + 1; await putUser(env, uid, user);
    await fim('Recusado.');
    await tg(env, 'sendMessage', { chat_id: chat, text: 'Certo, você recusou. Nada será enviado a você sobre ' + user.nome + '.' });
    return;
  }
  const r = await concluirVinculo(env, chat, uid, cq.from);
  if (r.erro === 'limite') { await fim('Esta pessoa já tem o máximo de responsáveis.'); return; }
  if (r.erro) { await fim('Este pedido não é mais válido.'); return; }
  await fim('Aceito!');
  await tg(env, 'sendMessage', { chat_id: chat, text: '✅ Pronto! Você agora é responsável de ' + user.nome + ' no GuIa.\n\nSe ' + user.nome + ' acionar a palavra de segurança, você recebe aqui um alerta com a hora, a linha de ônibus e a localização.\n\nPara sair, envie /parar.' });
}

const AJUDA = 'Comandos:\n/start — fazer o seu cadastro como responsável\n/status — ver seu cadastro e de quem você é responsável\n/teste — receber uma mensagem de teste, para conferir se os alertas chegam\n/parar — apagar o seu cadastro e parar de receber alertas\n/ajuda — mostrar esta ajuda';

/** Tudo que o Telegram manda para o bot: cadastro do responsável, botões Aceitar/Recusar e comandos. */
export async function webhook(req, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET)
    return new Response('forbidden', { status: 403 });
  const up = await lerBody(req); const ok = () => new Response('ok');
  if (up && up.callback_query) { await aoClicar(up.callback_query, env); return ok(); }
  const msg = up && up.message;
  if (!msg || !msg.chat || msg.chat.type !== 'private' || typeof msg.text !== 'string') return ok();
  const chat = msg.chat.id, bruto = msg.text.trim();
  const cmd = bruto.startsWith('/') ? bruto.split(/\s+/)[0].split('@')[0].toLowerCase() : '';
  const responder = (texto) => tg(env, 'sendMessage', { chat_id: chat, text: texto });
  const cadastro = await env.GUIA_KV.get('resp:' + chat, 'json');

  if (cmd === '/ajuda') { await responder(AJUDA); return ok(); }

  if (cmd === '/status') {
    if (!cadastro) { await responder('Você ainda não tem cadastro. Envie /start para se cadastrar.'); return ok(); }
    const idx = (await env.GUIA_KV.get('chat:' + chat, 'json')) || [], nomes = [];
    for (const uid of idx) { const u = await getUser(env, uid); if (u) nomes.push(u.nome); }
    await responder('Cadastro: ' + cadastro.nome + '.\n' + (nomes.length ? 'Você é responsável de: ' + nomes.join(', ') + '.' : 'Você ainda não é responsável de ninguém. Quando alguém indicar você no aplicativo, o pedido chega aqui.'));
    return ok();
  }

  if (cmd === '/teste') {
    if (!cadastro) { await responder('Faça o seu cadastro primeiro. Envie /start.'); return ok(); }
    if (!(await limite(env, 'teste:' + chat, 3, 3600))) { await responder('Você já pediu testes demais. Tente de novo mais tarde.'); return ok(); }
    await responder('🧪 TESTE — não é uma emergência.\n\nEste é o tipo de aviso que você recebe aqui quando alguém de quem você é responsável aciona a palavra de segurança no GuIa: a hora, a linha de ônibus, a parada e a localização.\n\nSe esta mensagem chegou, os alertas vão chegar.');
    return ok();
  }

  if (cmd === '/parar') {
    const idx = (await env.GUIA_KV.get('chat:' + chat, 'json')) || [];
    for (const uid of idx) await removerContato(env, uid, chat);
    await env.GUIA_KV.delete('chat:' + chat); await env.GUIA_KV.delete('resp:' + chat); await env.GUIA_KV.delete('reg:' + chat);
    await apagarPedidos(env, chat);
    await responder(cadastro || idx.length ? 'Certo. Seu cadastro foi apagado e você não receberá mais alertas do GuIa. Para voltar, envie /start.' : 'Você não tem cadastro aqui.');
    return ok();
  }

  if (cmd === '/start' || cmd === '/cadastrar') {
    if (cadastro) { await responder('Você já está cadastrado(a) como ' + cadastro.nome + '. Quando alguém indicar você como responsável, o pedido chega aqui e você aceita ou recusa.\n\nPara apagar seu cadastro, envie /parar.'); return ok(); }
    await env.GUIA_KV.put('reg:' + chat, JSON.stringify({ etapa: 'nome' }), { expirationTtl: 1800 });
    await responder('Olá! Eu sou o bot de alertas do GuIa, um guia por voz para a linha de ônibus 875C-10.\n\nPara ser responsável por alguém, cadastre-se aqui primeiro. Depois, a pessoa só precisa dizer o seu nome completo no aplicativo, e você aceita ou recusa o pedido. Você só recebe um alerta se aceitar e se ela acionar a palavra de segurança em uma emergência.\n\nQual é o seu nome completo?');
    return ok();
  }

  const reg = await env.GUIA_KV.get('reg:' + chat, 'json');
  if (reg && !cmd) {
    if (reg.etapa === 'nome') {
      const nome = limpar(bruto, 80);
      if (palavrasNome(nome).length < 2 || /[0-9@]/.test(nome)) { await responder('Preciso do nome e do sobrenome. Qual é o seu nome completo?'); return ok(); }
      await env.GUIA_KV.put('reg:' + chat, JSON.stringify({ etapa: 'nasc', nome }), { expirationTtl: 1800 });
      await responder('Obrigado, ' + nome + '. Agora, qual é a sua data de nascimento? Envie no formato dia/mês/ano, por exemplo 15/03/1990.\n\nEla serve só para diferenciar pessoas com o mesmo nome e não fica guardada em texto.');
      return ok();
    }
    const nasc = parseNascimento(bruto);
    if (!nasc) { await responder('Não entendi a data. Envie no formato dia/mês/ano, por exemplo 15/03/1990.'); return ok(); }
    const chave = nomeChave(reg.nome);
    await env.GUIA_KV.put('resp:' + chat, JSON.stringify({ nome: reg.nome, nascHash: await hmacHex(env, chave + '|' + nasc), criado: Date.now() }), { metadata: { n: chave } });
    await env.GUIA_KV.delete('reg:' + chat);
    await responder('✅ Cadastro concluído, ' + reg.nome + '!\n\nAgora a pessoa que quer você como responsável diz o seu nome completo no aplicativo GuIa. Você recebe aqui um pedido e aceita ou recusa.\n\nEnvie /teste para receber uma mensagem de teste e conferir se os alertas chegam. Para apagar seu cadastro, envie /parar.');
    return ok();
  }
  await responder(cadastro ? 'Você está cadastrado(a) como ' + cadastro.nome + '.\n\n' + AJUDA : 'Olá! Para ser responsável por alguém, envie /start e faça o seu cadastro.\n\n' + AJUDA);
  return ok();
}

/* ------------------------------------------------------------------ vínculo com o aplicativo e alerta de emergência */

export async function vinculoNovo(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await limite(env, 'novo:' + ip, 20, 3600))) return json({ erro: 'muitas_tentativas' }, 429);
  const b = await lerBody(req); if (!b) return json({ erro: 'corpo_invalido' }, 400);
  const nome = limpar(b.nome, 80); if (!nome) return json({ erro: 'nome_obrigatorio' }, 400);
  let uid = b.uid;
  if (uid) {
    if (!(await getUser(env, uid))) return json({ erro: 'usuario_nao_encontrado' }, 404);
  } else {
    uid = aleatorio(24);
    await putUser(env, uid, { nome, contatos: [], criado: Date.now() });
  }
  return json({ uid, bot: '@' + env.BOT_USERNAME });
}

/** O usuário diz o nome completo do responsável. Procura entre os cadastrados no bot e manda o pedido de aceite. */
export async function vinculoBuscar(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x';
  if (!(await limite(env, 'busca:' + ip, 60, 3600))) return json({ erro: 'muitas_tentativas' }, 429);
  const b = await lerBody(req); if (!b) return json({ erro: 'corpo_invalido' }, 400);
  const user = await getUser(env, b.uid);
  if (!user) return json({ erro: 'usuario_nao_encontrado' }, 404);
  if (!(await limite(env, 'buscauid:' + b.uid, 12, 3600))) return json({ erro: 'muitas_tentativas' }, 429);
  const toks = palavrasNome(b.nome);
  if (toks.length < 2) return json({ erro: 'nome_curto' }, 400);
  const alvo = [...toks].sort().join(' ');

  const exatos = [], parciais = [];
  let cursor;
  do {
    const l = await env.GUIA_KV.list({ prefix: 'resp:', cursor });
    for (const k of l.keys) {
      const n = (k.metadata && k.metadata.n) || '', set = n.split(' ').filter(Boolean);
      if (n === alvo) exatos.push(k.name);
      else if (set.length >= 2 && (toks.every(w => set.includes(w)) || set.every(w => toks.includes(w)))) parciais.push(k.name);
    }
    cursor = l.list_complete ? undefined : l.cursor;
  } while (cursor);

  let cands = exatos.length ? exatos : parciais;
  if (!cands.length) return json({ encontrados: 0 });
  if (cands.length > 1) {
    const nasc = parseNascimento(b.nasc);
    if (!nasc) return json({ encontrados: cands.length, precisaNascimento: true });
    const filtrados = [];
    for (const nomeKv of cands) {
      const r = await env.GUIA_KV.get(nomeKv, 'json');
      if (r && r.nascHash === await hmacHex(env, nomeChave(r.nome) + '|' + nasc)) filtrados.push(nomeKv);
    }
    if (!filtrados.length) return json({ encontrados: 0, nascimentoNaoConfere: true });
    if (filtrados.length > 1) return json({ encontrados: filtrados.length, ambiguo: true });
    cands = filtrados;
  }
  const chat = Number(cands[0].slice('resp:'.length));
  if ((user.contatos || []).some(c => c.chat === chat)) return json({ encontrados: 1, jaVinculado: true });
  if ((user.contatos || []).length >= MAX_RESPONSAVEIS) return json({ erro: 'limite_responsaveis' }, 409);
  const r = await tg(env, 'sendMessage', {
    chat_id: chat,
    text: '👤 ' + user.nome + ' quer você como responsável de emergência no GuIa.\n\nSe aceitar, você recebe aqui um alerta, com a hora, a linha de ônibus e a localização, quando essa pessoa acionar a palavra de segurança.\n\nVocê aceita?',
    reply_markup: { inline_keyboard: [[{ text: '✅ Aceitar', callback_data: 'sim:' + b.uid }, { text: '❌ Recusar', callback_data: 'nao:' + b.uid }]] }
  });
  if (!r.ok) return json({ encontrados: 0 });
  await env.GUIA_KV.put('pedido:' + chat + ':' + b.uid, '1', { expirationTtl: 3600 });
  return json({ encontrados: 1, pedidoEnviado: true });
}

export async function vinculoStatus(url, env) {
  const user = await getUser(env, url.searchParams.get('uid'));
  if (!user) return json({ erro: 'usuario_nao_encontrado' }, 404);
  return json({ contatos: (user.contatos || []).map(c => ({ nome: c.nome })), recusas: user.recusas || 0 });
}

export async function alerta(req, env) {
  const b = await lerBody(req); if (!b) return json({ erro: 'corpo_invalido' }, 400);
  const user = await getUser(env, b.uid);
  if (!user) return json({ erro: 'usuario_nao_encontrado' }, 404);
  const contatos = user.contatos || [];
  if (!contatos.length) return json({ erro: 'sem_responsaveis' }, 409);
  const trava = 'rl:alerta:' + b.uid;
  if (await env.GUIA_KV.get(trava)) return json({ erro: 'aguarde', enviados: 0 }, 429); // evita repetição em menos de 1 minuto
  await env.GUIA_KV.put(trava, '1', { expirationTtl: 60 });

  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  const prec = num(b.precisao, 0, 100000);
  const teste = !!b.simulacao;
  const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const linhas = [
    teste ? '🧪 TESTE (modo simulação) — não é uma emergência real' : '🚨 ALERTA DE EMERGÊNCIA',
    '',
    user.nome + (teste ? ' usou a palavra de segurança no GuIa durante uma simulação.' : ' acionou a palavra de segurança no GuIa.'),
    'Hora: ' + hora,
    'Linha: 875C-10 (Terminal Lapa → Metrô Santa Cruz)'
  ];
  const parada = limpar(b.parada, 80), destino = limpar(b.destino, 80);
  if (parada) linhas.push((teste ? 'Parada simulada: ' : 'Parada mais recente: ') + parada);
  if (destino) linhas.push('Destino: ' + destino);
  if (lat != null && lng != null && !teste) linhas.push('Localização: https://maps.google.com/?q=' + lat.toFixed(6) + ',' + lng.toFixed(6) + (prec != null ? ' (precisão de cerca de ' + Math.round(prec) + ' m)' : ''));
  else if (!teste) linhas.push('Localização: não disponível agora.');
  linhas.push('', teste ? 'Se isso foi um teste combinado, pode ignorar.' : 'Tente ligar para ' + user.nome + ' agora. Se houver risco imediato, ligue 190.');
  const texto = linhas.join('\n');

  let enviados = 0, falhas = 0;
  for (const c of [...contatos]) {
    const r = await tg(env, 'sendMessage', { chat_id: c.chat, text: texto });
    if (r.ok) {
      enviados++;
      if (lat != null && lng != null && !teste) await tg(env, 'sendLocation', { chat_id: c.chat, latitude: lat, longitude: lng });
    } else {
      falhas++;
      if (r.status === 403) { await removerContato(env, b.uid, c.chat); } // o responsável bloqueou o bot
    }
  }
  if (!enviados) await env.GUIA_KV.delete(trava); // nada saiu: deixa tentar de novo
  return json({ enviados, falhas }, enviados ? 200 : 502);
}

