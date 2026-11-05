# CLAUDE.md

Instruções para o Claude Code trabalhar neste repositório.

## O que é

Site estático em português do Brasil, publicado no Cloudflare Pages:
comparador de ativos, simulador de carteira e "Minha carteira".
Os dados públicos (preços, CDI, câmbio) são atualizados todo dia por um GitHub Action.
A carteira de cada usuário fica **só no navegador dele**.

Leia antes de mexer: `docs/01-produto.md`, `docs/02-arquitetura.md`, `docs/03-dados.md`,
`docs/04-privacidade.md`. O trabalho a fazer está em `docs/05-plano.md`.

## Regras que não podem ser quebradas

1. **A carteira do usuário nunca sai do navegador.** Nenhum `fetch`, `XMLHttpRequest`,
   `sendBeacon`, `WebSocket`, formulário ou imagem que envie dados do usuário. As únicas
   requisições permitidas são `GET` de arquivos do próprio site (`/data/*.json`, `/assets/*`).
2. **Sem scripts de terceiros.** Nada de analytics, pixels, fontes do Google, CDNs ou widgets.
   Bibliotecas ficam copiadas em `public/assets/vendor/` com a versão no nome do arquivo.
3. **A política de segurança (`public/_headers`) continua com `connect-src 'self'` e
   `script-src 'self'`.** Por isso não há `<script>` embutido no HTML: todo JS fica em arquivo.
   Se algo precisar afrouxar a CSP, pare e pergunte ao dono do projeto.
4. **Dado do usuário é texto não confiável.** Use `textContent`, nunca `innerHTML` com
   conteúdo vindo do usuário, de CSV ou de backup.
5. **O histórico em `dados/historico/` só cresce.** Não reescreva meses fechados. Correção de
   dado histórico é feita à mão, num commit separado, com explicação na mensagem.
6. **Se uma checagem do pipeline falhar, nada é publicado.** Não desligue checagens para
   "fazer passar"; investigue a fonte.

## Estilo

- Textos da interface: frases curtas e objetivas, em português do Brasil, sem jargão.
  Números no formato brasileiro (1.234,5; R$; "a.a."). Datas como "out/2026".
- Toda página termina com "Não é recomendação de investimento."
- JS sem build: arquivos comuns carregados por `<script src>`, compatíveis com navegadores
  atuais. Módulos compartilhados expõem um objeto global (ex.: `window.CarteiraModelo`) e
  também `module.exports`, para os testes em Node.
- Python 3.12, só `requests` como dependência de produção.

## Comandos

```bash
python -m pytest -q pipeline/tests   # pipeline, sem rede
npm test                             # módulos JS (node:test)
npm run dados:offline                # regrava public/data a partir do histórico
npm run dados                        # busca ao vivo e grava (use com cuidado: pode promover meses)
npm run dev                          # servidor local com _headers em http://localhost:8788
npm run e2e                          # Playwright: 4 páginas, CSP, nenhuma requisição externa
```

## Pronto quer dizer

- `pytest`, `npm test` e `npm run e2e` passando.
- Nenhuma requisição para outro domínio no teste de ponta a ponta.
- Página conferida no celular (largura 390px) e no modo escuro.
- Documentação em `docs/` atualizada se o comportamento mudou.

## Onde está cada coisa

- Universo de ativos e fontes: `pipeline/config.py` (dados) e `public/assets/js/config-ativos.js` (cores e rótulos).
- Cálculo das janelas e tabelas do comparador: `public/assets/js/dados.js` (testado contra `reference/compute2_original.py`).
- Carteira: `carteira-modelo.js` (CSV, categorias, valores), `carteira-motor.js` (risco),
  `carteira-armazenamento.js` (IndexedDB), `carteira-cripto.js` (backup com senha).
