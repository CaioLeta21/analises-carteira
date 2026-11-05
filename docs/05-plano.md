# Plano de trabalho para o Claude Code

Faça uma etapa por vez. No fim de cada uma, rode os testes indicados e mostre o resultado ao
dono do projeto antes de seguir. Não pule as checagens.

## Etapa 0. Preparar o ambiente

```bash
pip install -r pipeline/requirements.txt
npm install && npx playwright install chromium
python -m pytest -q pipeline/tests && npm test && npm run e2e
```
**Pronto quando:** os três passam sem mudar código.

## Etapa 1. Ler e entender

Leia `docs/` e os módulos em `public/assets/js/`. Rode `npm run dev` e abra as quatro páginas.
Liste ao dono qualquer inconsistência que encontrar entre a documentação e o código.

## Etapa 2. Validar as fontes ao vivo

O pipeline foi escrito sem acesso às APIs. Agora, com internet:

1. Teste cada buscador isoladamente (Python interativo), para 2 ou 3 símbolos:
   `fontes.yahoo("ITUB3.SA", date(2026,10,1), date.today())`, `fontes.bcb_sgs(1, ...)`,
   `fontes.bcb_sgs(12, ...)`, `fontes.yahoo("BTC-USD", ...)`, `fontes.yahoo("VHYD.L", ...)`.
2. Corrija o que não funcionar (formato da resposta, cabeçalhos, fuso das datas).
3. Confirme os pontos "A confirmar" de `docs/03-dados.md` e atualize o documento.
4. Rode `python -m pipeline.atualizar --sem-promover` e confira em `public/data/status.json`
   a fonte usada por ativo.
5. Compare o retorno do mês corrente de 3 ativos (um da B3, um americano, o bitcoin) com outra
   fonte pública. Diferença aceitável: até 0,3 ponto percentual.

**Pronto quando:** o pipeline roda ao vivo sem erro, os números batem e os testes continuam passando.
**Não faça:** commit de `dados/historico/` nesta etapa (use `--sem-promover`).

## Etapa 3. GitHub

1. Crie o repositório (pergunte ao dono se público ou privado; público reforça a promessa de privacidade).
2. Configure os *secrets* opcionais: `BRAPI_TOKEN`, `TIINGO_TOKEN`, `COINGECKO_KEY`.
3. Rode o Action à mão (`workflow_dispatch`) e confira o commit gerado.
4. Ative a notificação de falha por e-mail (padrão do GitHub) para o dono.

**Pronto quando:** uma execução manual do Action termina verde e gera commit com `public/data`.

## Etapa 4. Cloudflare Pages

Siga `docs/06-deploy.md`. Domínio sugerido: `ativos.letabuild.com` (confirme com o dono).

**Pronto quando:** o site abre no domínio, `curl -I` mostra os cabeçalhos do `_headers`, e o
teste de ponta a ponta passa apontando para o endereço publicado
(`BASE=https://ativos.letabuild.com npm run e2e`).

## Etapa 5. Terminar a página Minha carteira

O básico funciona. Faça, nesta ordem, uma por commit:

1. **Primeira visita:** se a única carteira é a padrão e nunca foi editada, a restauração de
   backup a substitui (hoje ela fica junto, com o mesmo nome).
2. **Editor por ativo mais confortável:** coluna de código mais larga, autocompletar mostrando
   o nome, valor em R$ alinhado à direita, total no rodapé da tabela, ordenar por valor.
3. **Validação na hora:** destacar linha sem quantidade nem valor; avisar ativo da base com
   valor informado (o valor tem prioridade sobre a quantidade).
4. **Comparação:** mostrar a carteira contra CDI e contra um exemplo (Moderada) no gráfico de
   "quanto viraria R$ 100" e de quedas, como no simulador.
5. **Instalável na Tela de Início (decidido em 04/nov/2026):** manifesto e ícone para "Adicionar à
   Tela de Início". No Safari, só assim os dados escapam da limpeza após 7 dias sem visita.
   Lembrete de backup na página.
   **Modo "só arquivo" (decidido):** opção de não guardar nada no navegador; a pessoa abre o
   arquivo de backup a cada visita e baixa de novo se editar. O modo normal continua padrão.
   (Fotos mensais / histórico automático: adiado. Senha local: não fazer.)
6. **Acessibilidade:** navegação por teclado nas abas (setas), foco visível, rótulos em todos os
   campos, contraste AA nos dois temas.
7. **Celular:** editor por ativo vira lista de cartões abaixo de 600 px.

**Pronto quando:** cada item tem teste (unitário ou no `e2e.js`) e o e2e continua sem
requisições externas.

## Etapa 5b. Catálogo de ativos (decidido em 04/nov/2026)

- Universo médio, ~200 ativos: Ibovespa, principais ETFs da B3 e dos EUA, ~50 maiores ações
  americanas, ouro (GLD), bitcoin e ether. O usuário escolhe quais aparecem no comparador e
  na carteira (escolha salva só no navegador).
- Carga inicial validada como na etapa 2: B3 pela cotação oficial (COTAHIST) + proventos;
  EUA por uma segunda fonte (Nasdaq). Ativo que não bater não entra até ser explicado.
- Conferência contínua: todo mês fechado é comparado com a segunda fonte antes de ir para o
  histórico; divergência bloqueia a gravação e manda e-mail.
- Arquivos por ativo em `/data/` carregados sob demanda, para a página não ficar pesada.

## Etapa 6. Acabamento

- Página 404 simples (`public/404.html`).
- `favicon` e imagem de compartilhamento (`og:image`) sem depender de serviço externo.
- Fontes próprias (decidido: sim): baixar IBM Plex Sans/Serif (licença OFL) para `assets/fonts/` e
  trocar as variáveis `--font-sans` e `--font-serif`. Nada de Google Fonts.
- Link para o repositório (se público) no rodapé, com a frase "Confira o código: nada sai do seu navegador."

## Etapa 7. Operação

- Documente no README o que fazer quando o Action falhar (ler o log, testar a fonte, rodar de
  novo, abrir issue).
- Uma vez por mês, confira um mês fechado contra outra fonte e anote no `docs/03-dados.md`.
