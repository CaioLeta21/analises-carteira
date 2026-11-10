/* Como cada ativo aparece no comparador: rótulo do botão, cor e traço.
   Para incluir um ativo: acrescente-o em pipeline/config.py (dados) e aqui (visual). */
window.CONFIG_ATIVOS = {
  // ordem dos botões e das linhas
  ordem: ['ITUB3', 'EGIE3', 'PSSA3', 'WEGE3', 'TAEE11', 'CSMG3', 'DIVO11', 'BLK', 'GOOGL', 'LLY', 'TSLA', 'COST', 'NVDA', 'AMZN', 'MU', 'PLTR', 'QQQ', 'SPY', 'VHYL', 'BTC', 'CDI'],
  rotulo: {
    ITUB3: 'Itaú ON (ITUB3)', EGIE3: 'Engie Brasil (EGIE3)', PSSA3: 'Porto Seguro (PSSA3)', WEGE3: 'WEG (WEGE3)',
    TAEE11: 'Taesa (TAEE11)', CSMG3: 'Copasa (CSMG3)', DIVO11: 'DIVO11 (ETF de dividendos)', BLK: 'BlackRock (BLK)',
    GOOGL: 'Google (GOOGL)', LLY: 'Eli Lilly (LLY)', TSLA: 'Tesla (TSLA)', COST: 'Costco (COST)', NVDA: 'Nvidia (NVDA)', AMZN: 'Amazon (AMZN)', MU: 'Micron (MU)', PLTR: 'Palantir (PLTR)', QQQ: 'QQQ (ETF da Nasdaq-100)',
    SPY: 'S&P 500 (ETF SPY)', VHYL: 'VHYL (ETF irlandês global de dividendos, Vanguard)', BTC: 'Bitcoin (BTC)', CDI: 'CDI (renda fixa)',
  },
  // índice na paleta categórica (8 cores) ou cor fixa
  paleta: { ITUB3: 0, EGIE3: 1, PSSA3: 2, TAEE11: 3, BLK: 4, GOOGL: 5, LLY: 6, TSLA: 7 },
  corFixa: {
    DIVO11: 'var(--color-fg-muted)', QQQ: 'var(--color-fg)', CDI: 'var(--color-fg-muted)', SPY: 'var(--color-fg)',
    WEGE3: 'var(--color-warn)', CSMG3: 'var(--color-bad)', VHYL: 'var(--color-ok)', BTC: '#F7931A', COST: '#0b8a94', NVDA: '#5f9e1c', AMZN: '#a0522d', MU: '#7d6608', PLTR: '#5a5a8c',
  },
  traco: { DIVO11: '6 4', QQQ: '6 4', CDI: '8 3 2 3', VHYL: '6 4', COST: '2 3', NVDA: '2 3', AMZN: '2 3', MU: '2 3', PLTR: '2 3' },
  grupos: {
    acoes: ['ITUB3', 'EGIE3', 'PSSA3', 'WEGE3', 'TAEE11', 'CSMG3', 'BLK', 'GOOGL', 'LLY', 'TSLA', 'COST', 'NVDA', 'AMZN', 'MU', 'PLTR'],
    etfs: ['DIVO11', 'QQQ', 'SPY', 'VHYL'],
  },
  paletaClara: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  paletaEscura: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
