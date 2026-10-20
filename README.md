# GuIa — servidor e bot do responsável

## Arquivos

| Arquivo | O que é |
|---|---|
| `src/bot-responsavel.js` | **O bot do Telegram**: cadastro do responsável, aceite do pedido, comandos e envio do alerta de emergência |
| `src/worker.js` | Roteador do servidor + previsão do ônibus 875C-10 (API Olho Vivo, SPTrans) |
| `src/comum.js` | Funções usadas pelos dois |
| `worker-unico.js` | Os três juntos em **um arquivo só**, para colar no editor do painel da Cloudflare |
| `construir.mjs` | Gera o `worker-unico.js` (`node construir.mjs`) depois de qualquer mudança em `src/` |
| `wrangler.toml` | Configuração para quem publica pelo terminal (`wrangler deploy`) |

## O bot do responsável

A pessoa responsável se cadastra **antes** no bot, para receber os alertas se acontecer uma emergência:

1. No Telegram, abre o bot e envia `/start`.
2. Responde o **nome completo** e a **data de nascimento** (dia/mês/ano).
3. No aplicativo, quem usa o GuIa diz o nome completo dela. O bot manda um pedido com os botões **Aceitar** e **Recusar**.
4. Se aceitar, quando a palavra de segurança for dita em uma emergência o bot manda o alerta: hora, linha, parada e localização.

Comandos do bot:

| Comando | O que faz |
|---|---|
| `/start` | Faz o cadastro do responsável |
| `/status` | Mostra o cadastro e de quem a pessoa é responsável |
| `/teste` | Manda uma mensagem de teste, para conferir se os alertas chegam (máx. 3 por hora) |
| `/parar` | Apaga o cadastro e para de receber alertas |
| `/ajuda` | Lista os comandos |

Opcional: para os comandos aparecerem no menu do Telegram, abra no navegador (trocando `TOKEN`; o token fica só no seu navegador, não cole em chats):

`https://api.telegram.org/botTOKEN/setMyCommands?commands=[{"command":"start","description":"Cadastrar como responsável"},{"command":"status","description":"Ver meu cadastro"},{"command":"teste","description":"Receber mensagem de teste"},{"command":"parar","description":"Apagar meu cadastro"},{"command":"ajuda","description":"Ver os comandos"}]`

## Publicar pelo painel da Cloudflare

1. **Código:** abra o worker, apague o código e cole o conteúdo de **`worker-unico.js`**. Clique em **Deploy**.
2. **KV:** em *Storage & Databases → KV*, crie um namespace `GUIA_KV`. No worker, *Settings → Bindings → Add → KV namespace*, nome da variável **`GUIA_KV`**.
3. **Variáveis** (*Settings → Variables and Secrets*):
   - tipo **Text**: `BOT_USERNAME` (nome do bot **sem** o @) e `ALLOWED_ORIGINS` (`*`, ou o endereço do seu site).
   - tipo **Secret**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (uma senha longa inventada, só letras e números) e `SPTRANS_TOKEN`.
4. **Deploy** de novo.
5. **Ligar o Telegram ao servidor** (uma vez, e de novo se trocar o token). Abra no navegador, trocando `TOKEN` e `SENHA` (a mesma do `TELEGRAM_WEBHOOK_SECRET`) e o endereço do seu worker:
   `https://api.telegram.org/botTOKEN/setWebhook?url=https://SEU-WORKER.workers.dev/telegram/webhook&secret_token=SENHA`
   A resposta deve conter `"ok":true`.
6. **No app** (`index.html`), preencha `apiUrl` dentro de `GUIA_CONFIG` com o endereço do worker.

## Publicar pelo terminal

```bash
npm install -g wrangler && wrangler login
wrangler kv namespace create GUIA_KV      # copie o id para o wrangler.toml
# edite o wrangler.toml: id do KV e BOT_USERNAME
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put SPTRANS_TOKEN
wrangler deploy                           # junta os arquivos de src/ sozinho
```

Depois faça o passo 5 acima (setWebhook).

## Conferir antes de usar

1. `/` — deve mostrar `"bot":"@NomeDoSeuBot"`.
2. `/linha` — mostra a linha escolhida e os candidatos da SPTrans.
3. `/paradas` — confira `total`, `sentido`, `ordenacao`, `alertas` (o ideal é vazio) e `conferencia` (`ruasSoDaVolta` e `trechosForaDeOrdem` devem ser 0). A primeira parada deve ser o Terminal Lapa e a última o Terminal Santa Cruz.
4. `/previsao?parada=10` — deve devolver `fonte: "sptrans"`, `passagens` (minutos e hora) e `intervalo`.
5. No Telegram: envie `/start` ao bot e faça o cadastro. Depois `/teste`.
6. Peça a alguém para dizer a palavra-chave em **modo simulação** no app: a mensagem chega marcada como **TESTE**.

## Rotas do servidor

| Rota | O que faz |
|---|---|
| `GET /` | Confirma que o servidor está no ar e informa o nome do bot |
| `POST /telegram/webhook` | Recebe tudo do Telegram (exige o segredo do webhook) |
| `POST /vinculo/novo` | Cria o usuário (ou confirma o existente) e devolve `uid` e o nome do bot |
| `POST /vinculo/buscar` | Procura o responsável pelo nome falado e manda o pedido de aceite (pede a data de nascimento só se houver nomes iguais) |
| `GET /vinculo/status?uid=` | Responsáveis já vinculados e pedidos recusados |
| `POST /alerta` | Envia o alerta aos responsáveis (1 por minuto por usuário) |
| `GET /paradas` | Lista oficial e completa de paradas, já na ordem Terminal Lapa → Metrô Santa Cruz |
| `GET /previsao?parada=N` | Previsão e intervalo do ônibus |
| `GET /linha` | Diagnóstico da linha escolhida |

## Paradas e previsão

- O app **não usa lista fixa**: ao abrir, lê `/paradas`. O servidor busca as paradas dos **dois sentidos**, compara com o **itinerário oficial por vias** da SPTrans (tabela "Via / N°") e fica com o sentido Terminal Lapa → Metrô Santa Cruz: ruas na ordem certa e nenhuma rua que só existe na volta.
- A previsão usa os **horários previstos pela SPTrans** na parada e calcula o intervalo pela diferença entre eles. Sem horários, estima pela posição dos ônibus (marcado como estimativa).
- Tempo por parada = 82 minutos ÷ (paradas − 1).

## Segurança e privacidade

- Tokens e senhas ficam só como **Secret** no servidor, nunca no app nem em prints.
- A **data de nascimento nunca é guardada em texto**: fica só um HMAC (nome + data), usado para desempatar nomes iguais.
- Ninguém recebe alerta sem **aceitar** o pedido no bot. O responsável sai quando quiser com `/parar`, que apaga o cadastro dele.
- O `uid` é um segredo de 192 bits guardado só no aparelho do usuário; é ele que autoriza o envio de alertas.
- Pedidos de aceite valem 1 hora. Buscas por nome são limitadas (12 por hora por usuário, 60 por hora por IP).
- A localização só vai no alerta, e só se o GPS estiver liberado. Em simulação não é enviada.
- Máximo de 5 responsáveis por usuário.
- O KV da Cloudflare é eventualmente consistente: logo depois de o responsável tocar em *Aceitar*, a confirmação no app pode levar alguns segundos.
