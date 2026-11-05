# Análises de carteira

Site estático com três páginas:

- **Ações e ETFs** (`/acoes-etfs/`): retorno de ações brasileiras e americanas, ETFs, bitcoin e CDI, em dólar e em real, em cinco janelas (25 anos, 15 anos, desde o DIVO11, 10 anos, 5 anos).
- **Simulador** (`/simulador/`): o usuário mexe nas categorias da carteira e vê volatilidade, quedas e retorno em 20 anos.
- **Minha carteira** (`/carteira/`): o usuário monta a própria carteira, por categoria ou por ativo (digitando ou subindo um CSV), e guarda **só no navegador dele**. O dono do site não tem como ver.

Os dados se atualizam **todo dia depois do fechamento**, por um GitHub Action que grava `public/data/*.json`. O Cloudflare Pages publica sozinho a cada mudança.

## Onde está no ar

- Site: https://ativos.letabuild.com (Cloudflare Pages, projeto `ativos-letabuild`, publica a
  pasta `public/` a cada push na `main`; endereço provisório `ativos-letabuild.pages.dev`).
- Dados: GitHub Action `Atualizar dados`, todo dia às 23:30 UTC (20:30 em Brasília).

## Estrutura

```
CLAUDE.md                  instruções para o Claude Code
docs/                      produto, arquitetura, dados, privacidade, plano, deploy
dados/historico/           meses fechados (fonte da verdade; só cresce)
pipeline/                  Python: busca diária, extensão das séries, checagens
public/                    o site (HTML, CSS, JS, dados gerados)
  data/                    mercado.json, simulador.json, status.json (gerados)
  assets/js/               módulos compartilhados (dados, carteira, cripto)
  acoes-etfs/ simulador/ carteira/
tests/                     testes JS (node:test), ponta a ponta (Playwright), servidor local
reference/                 versões estáticas originais e o script de cálculo original
.github/workflows/         atualização diária dos dados
```

## Rodar localmente

```bash
pip install -r pipeline/requirements.txt
npm install && npx playwright install chromium

python -m pytest -q pipeline/tests   # testes do pipeline (sem rede)
npm test                             # testes dos módulos JS
npm run dados:offline                # regrava public/data a partir do histórico
npm run dev                          # http://localhost:8788 com os cabeçalhos de segurança
npm run e2e                          # testa as quatro páginas no navegador
npm run dados                        # busca nas fontes ao vivo (precisa de internet)
```

## Quando o Action falhar

O GitHub manda e-mail. O site continua no ar com os dados do dia anterior: nada é publicado
quando uma checagem falha. Para resolver:

1. **Leia o log.** Em Actions → Atualizar dados → a execução vermelha → passo "Buscar dados".
   A mensagem diz o ativo e o motivo, por exemplo:
   - `CHECAGENS FALHARAM ... retorno de 2026-11 fora do limite`: a fonte mandou um preço
     estranho (desdobramento não ajustado, erro de digitação da fonte) ou o mercado mexeu muito.
   - `nenhuma fonte respondeu`: o Yahoo (ou o Banco Central) caiu ou mudou o formato.
   - `não tem o fechamento de AAAA-MM (âncora)`: a fonte apagou dados antigos do ativo.
   - `dados velhos`: algum ativo parou de ser negociado ou a fonte travou.
2. **Teste a fonte isolada**, na sua máquina:
   ```bash
   python -c "from pipeline import fontes; from datetime import date; print(fontes.yahoo('ITUB3.SA', date(2026,10,1), date.today())[0][-3:])"
   ```
3. **Se for instabilidade da fonte**, rode o Action de novo (Actions → Atualizar dados → Run
   workflow) depois de algumas horas. Ele também roda sozinho no dia seguinte.
4. **Se for dado errado de verdade**, não desligue a checagem. Confira o mês contra a cotação
   oficial (B3, Nasdaq) e, se a fonte estiver errada, abra uma issue descrevendo o ativo, o mês
   e os números das duas fontes. Correção de histórico é feita à mão, num commit separado, com a
   evidência em `dados/correcoes/` (veja `docs/03-dados.md`).
5. **Dado ruim que já foi publicado:** `git revert` do commit `dados: ...` do Action.

## Estado atual

- Histórico de 2004 a out/2026, conferido mês a mês contra a cotação oficial da B3 em 04/nov/2026
  (correções em `dados/correcoes/`).
- Fontes ao vivo validadas; o Action roda todo dia e grava os dados.
- Quatro páginas no ar, com política de segurança (CSP), acessibilidade (axe, WCAG AA) e
  nenhuma requisição externa conferidas pelo teste de ponta a ponta.

Não é recomendação de investimento.
