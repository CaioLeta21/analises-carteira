# Dados

## Ativos e fontes

| Ativo | Moeda | Fonte principal | Reserva |
|---|---|---|---|
| ITUB3, EGIE3, PSSA3, WEGE3, TAEE11, CSMG3, DIVO11 | BRL | Yahoo (`XXXX.SA`) | brapi (`BRAPI_TOKEN`) |
| BLK, GOOGL, LLY, TSLA, COST, NVDA, QQQ, SPY | USD | Yahoo | Tiingo (`TIINGO_TOKEN`) |
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
- Costco (COST) e Nvidia (NVDA), desde ago/2004, entraram em 08/nov/2026 pela carga do Yahoo
  (`--semear`), conferida mês a mês contra a Digrin (todos os meses) e o retorno de preço +
  dividendos do Nasdaq (desde nov/2016): diferença máxima de 0,04 ponto, salvo out–nov/2004 da
  NVDA (0,5 ponto, porque a Digrin arredonda o preço ajustado de US$ 0,11 a três casas)
  (`dados/correcoes/2026-11-08-cost-nvda.csv`).
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
- Bitcoin: fechamento mensal em dólar desde out/2009 (refeito em 05/nov/2026, evidência em
  `dados/correcoes/2026-11-05-bitcoin-desde-2009.csv`, script em `ferramentas/bitcoin/`):
  - out/2009–mar/2010: New Liberty Standard, a primeira casa de câmbio (taxa diária das páginas
    arquivadas; a última, de 02/03/2010, vale para março). Confere dia a dia com bitcoin.zorinaq.com.
  - abr–jun/2010: BitcoinMarket.com (média ponderada do último dia, negociações brutas da
    bitcoincharts). Confere dia a dia com a Zorinaq.
  - jul/2010–set/2014: cada retorno mensal fica o do histórico antigo (Digrin) quando ele bate com a
    Coin Metrics ou com a CoinDesk; senão, a mediana das três (20 meses, quase todos de 2011 a 2014,
    quando cada corretora tinha um preço).
  - Desde out/2014: igual ao Yahoo e à Coin Metrics.
  Bitbo e Glassnode não foram usados: a Bitbo bloqueia acesso automatizado e a Glassnode exige chave.
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
- Bitcoin: BTC-USD, em reais, desde nov/2009 (antes disso o bitcoin não tinha preço; as páginas
  usam o CDI no lugar).

## Catálogo (169 ativos que o usuário escolhe)

Definido em `pipeline/catalogo.py`: as ações do Ibovespa (composição oficial da B3 em
04/nov/2026), ETFs da B3 (BOVA11, SMAL11, IVVB11, SPXI11, NASD11, ACWI11, HASH11, GOLD11),
ETFs americanos (ações, títulos, setores, ouro, prata, bitcoin), ~50 das maiores ações
americanas (e TSMC, ASML, Mercado Livre, Nubank) e o ether. Histórico em
`dados/historico/catalogo.csv`; saídas em `public/data/catalogo.json` (índice) e
`public/data/catalogo/<ID>.json` (série de cada ativo).

**Nenhum ativo entrou sem validação** (ferramentas em `ferramentas/catalogo/`, resultado por
ativo em `dados/correcoes/2026-11-04-catalogo.csv`):
- **B3:** retorno total oficial calculado com a cotação de fechamento do COTAHIST da B3 +
  proventos (Fundamentus, todas as parcelas) na data ex + desdobramentos. O histórico de cada
  ativo começa no primeiro mês a partir do qual as janelas de 3 meses do Yahoo e do oficial
  batem (até 1,5 ponto em 95% delas, nenhuma acima de 3 pontos) e há cotação oficial em todo mês
  (troca de código ou fusão deixa buraco; o histórico recomeça depois). Meses em que o Yahoo
  perdeu (total ou parcialmente) ou duplicou um provento declarado usam o retorno oficial
  (97 meses). Desdobramento de ETF que o Yahoo não registrou (SPXI11, 1:8 em 22/jan/2026) é
  corrigido. Ficaram fora: IMAB11, B5P211 e FIXA11 (não aparecem no COTAHIST) e XFIX11 (distribui
  rendimentos sem fonte oficial para conferir).
- **EUA:** fechamento e dividendos do Nasdaq nos últimos 10 anos. 84 de 89 batem em todos os
  meses; os outros 5 divergem só em cisões (Merck/Organon, Pfizer/Viatris, AT&T/WBD,
  IBM/Kyndryl: o Yahoo inclui o valor distribuído) e na mudança de sede da Broadcom em 2018.
  O Nasdaq não dá dividendos de ETFs nem de ações da NYSE; nesses casos o preço é conferido e o
  dividendo vem do Yahoo (que bateu com a Digrin em 22 anos para BLK e LLY, ambas da NYSE).
  Antes de 2016 vale o Yahoo, pelo mesmo motivo.
- **Ether:** CoinGecko nos últimos 12 meses (até 0,6 ponto; o "fechamento" de cripto depende do minuto).

## Conferência mensal (antes de gravar um mês no histórico)

`pipeline/conferir.py` compara o retorno do mês fechado de cada ativo com uma segunda fonte:
B3 pelo arquivo mensal oficial de cotações + lista oficial de proventos (últimos 12 meses);
EUA pelo Nasdaq (para ETFs e ações da NYSE, o retorno ajustado deve ficar entre o retorno de
preço e esse + 2,5 pontos); VHYL pela linha em libras convertida; cripto pela CoinGecko.
Tolerância de 0,5 ponto (1 ponto para cripto e Londres).

- Divergência num dos 18 ativos do comparador: nada é gravado e o Action falha.
- Divergência num ativo do catálogo: só aquele ativo deixa de gravar o mês (ele continua no site,
  estendido a partir do último mês gravado) e entra um aviso.
- Segunda fonte fora do ar: o mês espera; depois de 10 dias do fim do mês é gravado marcado
  como "não conferido", com aviso.
- Avisos ficam em `public/data/status.json` (`avisos`); o último passo do Action falha quando há
  algum, e o GitHub manda e-mail. Os dados bons já foram gravados antes.

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
