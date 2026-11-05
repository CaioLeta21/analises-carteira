# Validação do catálogo

Scripts usados em 04/nov/2026 para validar cada ativo de `pipeline/catalogo.py` contra uma
segunda fonte antes de ele entrar. Rodam fora do Action (baixam alguns GB). Todos recebem o
mesmo diretório de cache `CACHE`:

- `CACHE/yh/<símbolo>.json`: Yahoo diário desde 2004 (`v8/finance/chart`, `events=div,split`).
- `CACHE/b3all/A<ano>.TXT`: linhas do COTAHIST anual da B3 só com os códigos do catálogo.
- `CACHE/fund/<código>.html`: página de proventos do Fundamentus.
- `CACHE/nq/<símbolo>.json`: Nasdaq (10 anos de preço; dividendos para ações).
- `CACHE/universo.json`: lista de candidatos com símbolo do Yahoo e grupo.

Ordem: `validar_b3.py CACHE` → `inicios_b3.py CACHE` → `validar_eua.py CACHE` →
`montar_historico.py CACHE` (grava `dados/historico/catalogo.csv` e
`dados/correcoes/2026-11-04-catalogo.csv`). Regras em `docs/03-dados.md`, "Catálogo".
