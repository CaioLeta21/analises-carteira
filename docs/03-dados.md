# Dados

## Ativos e fontes

| Ativo | Moeda | Fonte principal | Reserva |
|---|---|---|---|
| ITUB3, EGIE3, PSSA3, WEGE3, TAEE11, CSMG3, DIVO11 | BRL | Yahoo (`XXXX.SA`) | brapi (`BRAPI_TOKEN`) |
| BLK, GOOGL, LLY, TSLA, QQQ, SPY | USD | Yahoo | Tiingo (`TIINGO_TOKEN`) |
| VHYL | USD | Yahoo `VHYD.L` (linha em dólar em Londres) | Yahoo `VHYL.L` convertido de GBP |
| BTC | USD | Yahoo `BTC-USD` | CoinGecko |
| CDI | BRL | Banco Central, SGS 12 (diário) | — |
| PTAX | BRL/USD | Banco Central, SGS 1 (venda, diária) | — |
| Substitutos do simulador: SHY, VCSH, EFA, GLD, URTH | USD | Yahoo | Tiingo |

Tokens são opcionais e ficam nos *secrets* do GitHub. Sem token, a fonte reserva é pulada.

**A confirmar na primeira execução (etapa 2 do plano):**
- Se `VHYD.L` existe no Yahoo e vem em USD. Se não, usar `VHYL.L`; o pipeline converte de
  GBP/GBp para USD com `GBPUSD=X`.
- Se o fechamento ajustado do Yahoo para ações da B3 inclui JCP e dividendos (compare um mês
  com a Mais Retorno ou a Status Invest).
- Se a API do Banco Central responde a partir dos servidores do GitHub (às vezes exige
  cabeçalho `Accept: application/json`).

## Como as séries são montadas

### Histórico (até out/2026)
Montado à mão e conferido. Em `dados/historico/precos_mensais.csv`, uma linha por ativo e mês,
com a coluna `fonte`. Resumo:
- Americanos: preço ajustado mensal da Digrin.
- Brasileiros: retornos mensais com proventos da Mais Retorno, encadeados a partir do
  fechamento de 30/out/2026. TAEE11 desde mai/2012; CSMG3 desde fev/2006.
- DIVO11: retornos mensais da Meus Dividendos (até 2023) e da ETFs Brasil.
- VHYL: retornos anuais oficiais da Vanguard, distribuídos mês a mês pelo padrão de 40% VYM e
  60% VYMI. Começa em out/2016.
- Bitcoin: fechamento mensal em dólar (Digrin), desde dez/2010.
- CDI: Banco Central, série 4391, capitalizada a partir de 100 em ago/2004.

### Extensão diária
A cada execução, para cada ativo:

```
P[m] = P[âncora] × fechamento_ajustado(último pregão de m) / fechamento_ajustado(último pregão da âncora)
```

- A **âncora** é o último mês do histórico. A razão usa duas cotações da mesma busca, então
  ajustes retroativos da fonte (dividendos novos) não distorcem.
- O mês corrente usa o último pregão disponível e sai marcado como parcial.
- Um mês só entra se **todos** os ativos e a PTAX tiverem dado nele (feriado só na B3, por
  exemplo, segura o mês até o próximo pregão).
- Depois de 3 dias do fim do mês, ele é **gravado no histórico** e vira a nova âncora.

### Simulador
Retornos mensais em reais por categoria. Para meses novos:
- Renda fixa Brasil: CDI.
- Renda fixa exterior: 37,7% VCSH + 62,3% SHY, em reais.
- Renda variável Brasil: DIVO11.
- Renda variável exterior: 50% QQQ + 50% EFA, em reais.
- Ouro: GLD, em reais.
- Alternativos: 50% URTH + 50% SHY, em reais.

## Checagens (bloqueiam a publicação)

- Retorno mensal novo acima de 60% em módulo (100% no bitcoin).
- Mês faltando no meio de uma série.
- PTAX fora de 1 a 20.
- Último pregão comum a todos os ativos com mais de 10 dias.
- Fonte sem o fechamento do mês âncora.

Quando uma checagem falha, o Action termina com erro e o GitHub manda e-mail. O site continua
com os dados do dia anterior.

## Ativo novo

1. Acrescente em `pipeline/config.py` (`ATIVOS`).
2. Rode `python -m pipeline.atualizar --semear CODIGO`: baixa o histórico desde ago/2004 (ou a
   estreia) até a âncora e grava no histórico. Confira alguns meses contra outra fonte.
3. Acrescente rótulo, cor e grupo em `public/assets/js/config-ativos.js` (e o código em `ordem`).
4. Rode os testes e o pipeline normal.

## Termos de uso das fontes

- Yahoo Finance: API não oficial, sem garantia. Por isso existem reservas.
- brapi, Tiingo, CoinGecko: planos grátis com limite de chamadas; uma execução por dia cabe.
  A CoinGecko pede atribuição no plano grátis quando usada ("Dados de preço: CoinGecko").
- Banco Central: dados públicos.
- O método das páginas cita as fontes. Mantenha essa citação atualizada.
