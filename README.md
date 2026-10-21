# GuIa Worker — base inicial

Esta pasta contém uma base para o Worker de alertas de emergência do GuIa.

## Arquivos

- `src/worker.js`: implementação inicial das rotas `/health` e `/emergency`.
- `construir.mjs`: copia `src/worker.js` para o `worker.js` gerado.
- `package.json`: scripts de build e verificação.
- `worker.js`: saída gerada por `npm run build`.

## Antes de publicar

**Não substitua o Worker existente sem revisar o código atual.** Esta base não contém as funções desconhecidas do bot responsável e, portanto, não é uma restauração completa do bot.

## Segredos e variáveis no Cloudflare

Em Worker > Settings > Variables and Secrets, configure:

- `TELEGRAM_BOT_TOKEN` como Secret.
- `GUIA_API_SECRET` como Secret.
- `GUIA_CHANNEL_ID` como variável de texto com o ID do canal.

Nunca coloque os valores dos segredos no repositório GitHub.

## Teste

Depois de publicar deliberadamente a versão revisada, abra:

`https://SEU-WORKER.workers.dev/health`

A resposta esperada é semelhante a:

`{"ok":true,"service":"GuIa Emergency","status":"online"}`

Para chamar `POST /emergency`, envie JSON com um cabeçalho
`Authorization: Bearer SEU_GUIA_API_SECRET`. Exemplo de corpo:

```json
{
  "nome": "Pessoa cadastrada",
  "usuario": "@usuario",
  "mensagem": "Preciso de ajuda",
  "localizacao": "Local informado pela pessoa"
}
```

A base envia o alerta ao canal configurado. Envio ao Telegram pessoal do responsável,
preferências do usuário, cadastro, palavra-chave de segurança e tratamento de respostas
do bot ainda precisam ser integrados a partir do código original.
