# Análises de carteira

Site estático com três páginas:

- **Ações e ETFs** (`/acoes-etfs/`): retorno de ações brasileiras e americanas, ETFs, bitcoin e CDI, em dólar e em real, em cinco janelas (desde 2004, 15 anos, desde o DIVO11, 10 anos, 5 anos).
- **Simulador** (`/simulador/`): o usuário mexe nas categorias da carteira e vê volatilidade, quedas e retorno em 20 anos.
- **Minha carteira** (`/carteira/`): o usuário monta a própria carteira, por categoria ou por ativo (digitando ou subindo um CSV), e guarda **só no navegador dele**. O dono do site não tem como ver.

Os dados se atualizam **todo dia depois do fechamento**, por um GitHub Action que grava `public/data/*.json`. O Cloudflare Pages publica sozinho a cada mudança.

## Como entregar para o Claude Code

1. Descompacte esta pasta e crie um repositório no GitHub com ela (privado ou público).
2. Abra o Claude Code dentro da pasta.
3. Cole este pedido:

   > Leia o CLAUDE.md e os arquivos em docs/. Depois execute o plano de docs/05-plano.md, uma etapa por vez. Antes de cada etapa, diga o que vai fazer; no fim de cada uma, rode os testes e me mostre o resultado.

O Claude Code vai validar as fontes de dados ao vivo, configurar o GitHub Action, publicar no Cloudflare Pages e terminar a página Minha carteira.

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

## Estado atual

- Histórico até **out/2026**, conferido contra o cálculo original (`tests/dados.test.js`).
- Pipeline testado com fontes falsas. **As chamadas às APIs reais ainda não foram rodadas**: é a etapa 2 do plano.
- As três páginas funcionam com os dados do histórico e passam no teste de ponta a ponta, com a política de segurança (CSP) ligada.

Não é recomendação de investimento.
