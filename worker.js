
/**
 * GuIa — Sistema de alertas de emergência
 * Executado no Cloudflare Workers.
 *
 * Configure no Cloudflare:
 * TELEGRAM_BOT_TOKEN (Secret)
 * GUIA_API_SECRET (Secret)
 * GUIA_CHANNEL_ID (Variable)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders,
  });
}

async function sendTelegramMessage(env, chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error("Falha no envio pelo Telegram");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "GuIa Emergency",
      });
    }

    if (
      request.method !== "POST" ||
      url.pathname !== "/emergency"
    ) {
      return json({ error: "Endpoint não encontrado" }, 404);
    }

    if (
      !env.TELEGRAM_BOT_TOKEN ||
      !env.GUIA_API_SECRET ||
      !env.GUIA_CHANNEL_ID
    ) {
      return json({
        error: "Configuração incompleta no Cloudflare",
      }, 500);
    }

    const authorization =
      request.headers.get("Authorization");

    if (
      authorization !== `Bearer ${env.GUIA_API_SECRET}`
    ) {
      return json({ error: "Não autorizado" }, 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }

    const name = String(body.name || "Não identificado")
      .slice(0, 100);

    const message = String(
      body.message || "Pedido de ajuda acionado pelo GuIa"
    ).slice(0, 700);

    const alert = [
      "🚨 ALERTA DE EMERGÊNCIA — GuIa",
      `Pessoa: ${name}`,
      `Mensagem: ${message}`,
      `Horário UTC: ${new Date().toISOString()}`,
    ];

    const location = body.location;

    if (
      location &&
      Number.isFinite(Number(location.latitude)) &&
      Number.isFinite(Number(location.longitude)) &&
      Number(location.latitude) >= -90 &&
      Number(location.latitude) <= 90 &&
      Number(location.longitude) >= -180 &&
      Number(location.longitude) <= 180
    ) {
      alert.push(
        `Localização: https://maps.google.com/?q=${Number(location.latitude)},${Number(location.longitude)}`
      );
    }

    const text = alert.join("\n");

    try {
      await sendTelegramMessage(
        env,
        env.GUIA_CHANNEL_ID,
        text
      );
    } catch {
      return json({
        ok: false,
        error: "Não foi possível enviar ao canal",
      }, 502);
    }

    let responsibleSent = false;

    if (body.responsibleChatId) {
      try {
        await sendTelegramMessage(
          env,
          String(body.responsibleChatId),
          text
        );
        responsibleSent = true;
      } catch {
        responsibleSent = false;
      }
    }

    return json({
      ok: true,
      channelSent: true,
      responsibleSent,
    });
  },
};
