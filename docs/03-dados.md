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

**Confirmado na primeira execução (04/nov/2026):**
- `VHYD.L` existe no Yahoo e vem em USD (desde mai/2013). `VHYL.L` vem em GBP e, convertido,
  concorda com ele.
- O fechamento ajustado do Yahoo para a B3 inclui dividendos e JCP (valor bruto, na data ex).
  Nos 12 meses até out/2026 bateu com o retorno calculado pela cotação oficial da B3 e pela
  lista oficial de proventos em todos os meses, com diferença de até 0,05 ponto. Antes de
  2016 o Yahoo é fraco para a B3 (WEGE3 até 2007 é inutilizável); por isso o histórico não vem dele.
- Ainda falta: confirmar que a API do Banco Central responde a partir dos servidores do GitHub
  (etapa 3).

## Como as séries são montadas

### Histórico (até out/2026)
Montado à mão e conferido. Em `dados/historico/precos_mensais.csv`, uma linha por ativo e mês,
com a coluna `fonte`. Correções ficam registradas em `dados/correcoes/`. Resumo:
- Americanos: preço ajustado mensal da Digrin.
- Brasileiros: retornos mensais com proventos da Mais Retorno, encadeados a partir do
  fechamento de 30/out/2026. TAEE11 desde mai/2012; CSMG3 desde fev/2006.
  Em 04/nov/2026 cada mês de 2004 a 2026 foi conferido contra o retorno total oficial
  (fechamento do COTAHIST da B3 + proventos na data ex + desdobramentos e bonificações), com o
  Yahoo como terceira fonte. O histórico batia em cerca de 95% dos meses. Os 48 meses em que a B3
  oficial e o Yahoo concordavam entre si e o histórico divergia foram corrigidos (evidência em
  `dados/correcoes/2026-11-04-b3-oficial.csv`), a maioria dividendos da Tractebel (EGIE3) entre
  2007 e 2015 e jun–jul/2026 em cinco ações. Exceção mantida: ITUB3 em out/2021, cisão da XP,
  cujo valor distribuído o histórico inclui e as outras fontes não.
- DIVO11: fechamento oficial da B3 (o ETF reinveste os proventos, então o preço já é o retorno
  total). A série antiga (Meus Dividendos e ETFs Brasil) estava desalinhada em 86 de 131 meses.
- VHYL: preço ajustado em USD na Bolsa de Londres (`VHYD.L`), desde mai/2013. Conferido contra
  os retornos anuais oficiais da Vanguard (diferença de até 0,6 ponto por ano, típica entre
  cotação e valor da cota). Substituiu a série sintética (anuais da Vanguard distribuídos pelo
  padrão de VYM e VYMI), comparada em `dados/correcoes/2026-11-04-vhyl.csv`.
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
