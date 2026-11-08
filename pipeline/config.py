"""Universo de ativos e fontes de dados.

Cada ativo tem uma lista de fontes, tentadas em ordem. A primeira que responder
com dados válidos é usada. Fontes com token só são tentadas se o token existir
na variável de ambiente indicada em fontes.py.

Para incluir um ativo novo no comparador:
1. acrescente uma entrada em ATIVOS (id único, em maiúsculas);
2. rode `python -m pipeline.atualizar --semear ID` para baixar o histórico longo
   (veja docs/03-dados.md, "Ativo novo");
3. acrescente a cor e o rótulo em public/assets/js/config-ativos.js.
"""

# tipo: acao | etf | cripto | renda_fixa
# mercado: Brasil | EUA | Global
ATIVOS = [
    {"id": "ITUB3", "nome": "Itaú ON", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "ITUB3.SA"), ("brapi", "ITUB3")]},
    {"id": "EGIE3", "nome": "Engie Brasil", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "EGIE3.SA"), ("brapi", "EGIE3")]},
    {"id": "PSSA3", "nome": "Porto Seguro", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "PSSA3.SA"), ("brapi", "PSSA3")]},
    {"id": "WEGE3", "nome": "WEG", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "WEGE3.SA"), ("brapi", "WEGE3")]},
    {"id": "TAEE11", "nome": "Taesa", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "TAEE11.SA"), ("brapi", "TAEE11")]},
    {"id": "CSMG3", "nome": "Copasa", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "CSMG3.SA"), ("brapi", "CSMG3")]},
    {"id": "DIVO11", "nome": "DIVO11", "tipo": "etf", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("yahoo", "DIVO11.SA"), ("brapi", "DIVO11")]},
    {"id": "BLK", "nome": "BlackRock", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "BLK"), ("tiingo", "BLK")]},
    {"id": "GOOGL", "nome": "Google", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "GOOGL"), ("tiingo", "GOOGL")]},
    {"id": "LLY", "nome": "Eli Lilly", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "LLY"), ("tiingo", "LLY")]},
    {"id": "TSLA", "nome": "Tesla", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "TSLA"), ("tiingo", "TSLA")]},
    {"id": "COST", "nome": "Costco", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "COST"), ("tiingo", "COST")]},
    {"id": "NVDA", "nome": "Nvidia", "tipo": "acao", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "NVDA"), ("tiingo", "NVDA")]},
    {"id": "QQQ", "nome": "QQQ", "tipo": "etf", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "QQQ"), ("tiingo", "QQQ")]},
    {"id": "SPY", "nome": "S&P 500", "tipo": "etf", "mercado": "EUA", "moeda": "USD",
     "fontes": [("yahoo", "SPY"), ("tiingo", "SPY")]},
    # VHYL: a linha em dólar na Bolsa de Londres. Confirme o símbolo e a moeda na
    # primeira execução (veja docs/03-dados.md). Se a fonte vier em GBP, o
    # pipeline converte para USD com o par GBPUSD=X.
    {"id": "VHYL", "nome": "VHYL", "tipo": "etf", "mercado": "Global", "moeda": "USD",
     "fontes": [("yahoo", "VHYD.L"), ("yahoo", "VHYL.L")]},
    {"id": "BTC", "nome": "Bitcoin", "tipo": "cripto", "mercado": "Global", "moeda": "USD",
     "fontes": [("yahoo", "BTC-USD"), ("coingecko", "bitcoin")]},
    {"id": "CDI", "nome": "CDI", "tipo": "renda_fixa", "mercado": "Brasil", "moeda": "BRL",
     "fontes": [("cdi", "bcb")]},
]

# Substitutos usados só pelo simulador e pela página Minha carteira.
PROXIES = [
    {"id": "SHY", "moeda": "USD", "fontes": [("yahoo", "SHY"), ("tiingo", "SHY")]},
    {"id": "VCSH", "moeda": "USD", "fontes": [("yahoo", "VCSH"), ("tiingo", "VCSH")]},
    {"id": "EFA", "moeda": "USD", "fontes": [("yahoo", "EFA"), ("tiingo", "EFA")]},
    {"id": "GLD", "moeda": "USD", "fontes": [("yahoo", "GLD"), ("tiingo", "GLD")]},
    {"id": "URTH", "moeda": "USD", "fontes": [("yahoo", "URTH"), ("tiingo", "URTH")]},
]

# Composição das categorias do simulador (retorno mensal em reais).
# U(x) = retorno em dólar convertido para reais pela PTAX do fim do mês.
BMIX = 497203 / 1318739  # parte de bonds corporativos curtos na renda fixa exterior (~37,7%)
CATEGORIAS = {
    "rfbr": "CDI",
    "rfex": [("VCSH", BMIX), ("SHY", 1 - BMIX)],
    "rvbr": "DIVO11",
    "rvex": [("QQQ", 0.5), ("EFA", 0.5)],
    "ouro": [("GLD", 1.0)],
    "alt": [("URTH", 0.5), ("SHY", 0.5)],
    # Bitcoin: a própria série (BTC-USD). No histórico, desde nov/2009 (primeiro preço: out/2009,
    # New Liberty Standard; docs/03-dados.md).
    "btc": [("BTC", 1.0)],
}

# Retorno mensal acima disso (em módulo) é tratado como erro de dado.
LIMITE_RETORNO_MENSAL = {"BTC": 1.0, "default": 0.6}

# Dias depois do fim do mês para "fechar" o mês no histórico.
DIAS_PARA_FECHAR_MES = 3
