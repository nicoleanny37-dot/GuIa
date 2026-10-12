# GuIa: Assistente de Navegação em Ônibus (Linha Piloto 875C-10)

Aplicativo de apoio à mobilidade urbana acessível voltado para pessoas com deficiência visual, idosos e acompanhantes, guiado por voz, vibração e painel de alto contraste (WCAG AAA).

## Funcionalidades
1. **Onboarding por Voz**: Condução multimodal pedindo permissões de localização e microfone.
2. **NLU com Entendimento Contextual**: Reconhecimento de nomes de paradas, logradouros com números, estações de metrô, referências e tratamento de correções.
3. **Georreferenciamento Oficial da Linha 875C-10**: 46 paradas com coordenadas decimais WGS84 auditadas.
4. **Alerta de 3 Paradas e Alerta Crítico**: Earcons sintetizados e padrão de vibração háptico (100 ms curta / 400 ms longa).
5. **Segurança (SOS 190)**: Cadastro de palavra de emergência com verificação de termos seguros, detecção com janela discreta de 20 segundos e acionamento real do discador nativo (`tel:190`) com cancelamento prévio.

## Como Executar
1. Instale as dependências e execute os testes:
   ```bash
   npm test
