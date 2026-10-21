/**
 * GuIa — Worker Cloudflare
 *
 * Rotas:
 *   GET  /health      Verifica se o Worker está ativo.
 *   POST /emergency   Envia um alerta para o canal do Telegram.
 *
 * Configure em Settings > Variables and Secrets:
 *   TELEGRAM_BOT_TOKEN (Secret)
 *   GUIA_API_SECRET    (Secret)
 *   GUIA_CHANNEL_ID    (Variable), ex.: -100...
 *
 * Segurança:
 * - Não coloque tokens no código.
 * - /emergency exige Authorization: Bearer <GUIA_API_SECRET>.
 * - Este arquivo-base NÃO substitui funções antigas do bot.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLength);
}

async function sendTelegramMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Secret TELEGRAM_BOT_TOKEN não configurado.");
  if (!chatId) throw new Error("Destino do Telegram não configurado.");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    // Não retornar token nem a URL da API ao cliente.
    throw new Error(`Telegram recusou o envio (HTTP ${response.status}).`);
  }
  return result;
}

async function handleEmergency(request, env) {
  if (!env.GUIA_API_SECRET) {
    return json({ ok: false, erro: "configuracao_incompleta" }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.GUIA_API_SECRET}`;
  if (!safeEqual(authorization, expected)) {
    return json({ ok: false, erro: "nao_autorizado" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, erro: "json_invalido" }, 400);
  }

  const nome = cleanText(body.nome || body.name, 100);
  const mensagem = cleanText(body.mensagem || body.message || body.alerta, 1200);
  const usuario = cleanText(body.usuario || body.username, 100);
  const localizacao = cleanText(body.localizacao || body.location, 300);

  if (!nome && !usuario && !mensagem) {
    return json({ ok: false, erro: "dados_insuficientes" }, 400);
  }

  const parts = [
    "🚨 ALERTA DE EMERGÊNCIA — GuIa",
    nome ? `Nome: ${nome}` : null,
    usuario ? `Usuário: ${usuario}` : null,
    mensagem ? `Mensagem: ${mensagem}` : "A pessoa acionou o alerta de emergência.",
    localizacao ? `Localização informada: ${localizacao}` : null,
    `Horário UTC: ${new Date().toISOString()}`,
  ].filter(Boolean);

  const text = parts.join("\n");
  const channelId = env.GUIA_CHANNEL_ID;
  if (!channelId) {
    return json({ ok: false, erro: "canal_nao_configurado" }, 500);
  }

  try {
    await sendTelegramMessage(env, channelId, text);
    return json({ ok: true, mensagem: "Alerta enviado ao canal do GuIa." });
  } catch (error) {
    console.error("Falha ao enviar alerta do GuIa:", error?.message || "erro desconhecido");
    return json({ ok: false, erro: "falha_no_envio_telegram" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "GuIa Emergency", status: "online" });
    }

    if (request.method === "POST" && url.pathname === "/emergency") {
      return handleEmergency(request, env);
    }

    return json({ ok: false, erro: "nao_encontrado" }, 404);
  },
};
