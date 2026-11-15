// Radar: ações e ETFs (Brasil e exterior) que estou acompanhando para talvez comprar.
// Preço e histórico de 1 ano: Yahoo. Conferência do preço: B3 (ativos brasileiros) ou Nasdaq
// (listados nos EUA); "conferido" quando os dois diferem até 1%. Múltiplos das ações: Yahoo.

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

// Código digitado → símbolo do Yahoo. PETR4, BOVA11, HGLG11 → .SA; com sufixo (ASML.AS) fica como está.
export function simboloYahoo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (/^[A-Z]{4}\d{1,2}[A-Z]?$/.test(c)) return c + '.SA';
  return c;
}

// Ação, ETF ou fundo imobiliário, pelo tipo e pelo nome que o Yahoo devolve.
export function tipoAuto(meta, simbolo) {
  if (meta.instrumentType === 'CRYPTOCURRENCY' || /-USD$/.test(simbolo)) return 'cripto';
  const nome = (meta.longName || meta.shortName || '') + ' ';
  if (meta.instrumentType === 'ETF' || /\bETF\b|ÍNDICE|INDICE|ISHARES|\bINDEX\b|IT NOW/i.test(nome)) return 'etf';
  if (/\.SA$/.test(simbolo) && /IMOBILI|\bFII\b/i.test(nome)) return 'fii';
  return 'acao';
}

// Código como aparece: PETR4.SA → PETR4; BTC-USD → BTC
export const codigoDe = (simbolo) => simbolo.replace(/\.SA$/, '').replace(/-USD$/, '');

// Busca por nome ou código (Yahoo): "itausa" → ITSA4, ITSA3. Tira futuros e as linhas fracionárias da B3 (ITSA4F).
const BOLSA = { SAO: 'B3', NMS: 'Nasdaq', NGM: 'Nasdaq', NCM: 'Nasdaq', NYQ: 'NYSE', PCX: 'NYSE Arca', ASE: 'NYSE American', BTS: 'Cboe' };
const EUA = ['NMS', 'NGM', 'NCM', 'NYQ', 'PCX', 'ASE', 'BTS'];

export function filtrarBusca(quotes) {
  // cripto: só o bitcoin (BTC-USD), que tem alvo pelo Termômetro do Bitcoin
  return (quotes || []).filter((x) => x.symbol && (['EQUITY', 'ETF'].includes(x.quoteType) || x.symbol === 'BTC-USD') && !/^[A-Z]{4}\d{1,2}[FQ]\.SA$/.test(x.symbol))
    .map((x) => ({ simbolo: x.symbol, codigo: codigoDe(x.symbol), nome: x.longname || x.shortname || x.symbol, tipo: x.symbol === 'BTC-USD' ? 'cripto' : x.quoteType === 'ETF' ? 'etf' : 'acao',
      bolsa: BOLSA[x.exchange] || x.exchDisp || x.exchange, sao: x.exchange === 'SAO', eua: EUA.includes(x.exchange) }));
}

// O melhor resultado para o texto digitado. Preferência pela B3 (sem BDRs): "vale" → VALE3, não o ADR VALE;
// mas "msft" → MSFT (o BDR MSFT34 não conta como B3). Código idêntico vence, salvo se a mesma empresa tiver ação na B3.
const naB3 = (x) => x.sao && !/^[A-Z]{4}3[1-9]$/.test(x.codigo);
const mesmaEmpresa = (a, b) => a.nome.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) === b.nome.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10);
export function escolher(lista, texto) {
  const t = String(texto || '').trim().toUpperCase();
  const exato = lista.find((x) => x.simbolo === t || x.simbolo === t + '.SA');
  if (exato) return exato.sao ? exato : (lista.find((x) => naB3(x) && mesmaEmpresa(x, exato)) || exato);
  return lista.find(naB3) || lista.find((x) => x.eua) || lista[0] || null;
}

// A busca do Yahoo não acha nomes com acento ("Itaúsa"); vai sem acento.
export const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export async function buscarAtivos(texto, buscar = fetch) {
  const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(semAcento(texto))}&quotesCount=12&newsCount=0&lang=pt-BR&region=BR`;
  const r = await buscar(u, { headers: UA });
  if (!r.ok) throw new Error('busca do Yahoo ' + r.status);
  return ordenarBusca(filtrarBusca((await r.json()).quotes)).slice(0, 8);
}

// A lista de sugestões mostra primeiro a ação da B3 (sem BDRs), depois EUA, depois o resto, mantendo a
// ordem do Yahoo dentro de cada grupo: "sabesp" → SBSP3 antes do ADR SBS (o Yahoo põe o ADR em 1º).
export function ordenarBusca(lista) {
  const grupo = (x) => (naB3(x) ? 0 : x.eua ? 1 : 2);
  return lista.map((x, k) => [x, k]).sort((a, b) => grupo(a[0]) - grupo(b[0]) || a[1] - b[1]).map(([x]) => x);
}

// Texto digitado (código ou nome) → símbolo do Yahoo. Código da B3 ou com sufixo de bolsa vai direto.
export async function resolver(texto, buscar = fetch) {
  const t = String(texto || '').trim();
  const up = semAcento(t).toUpperCase();
  // "BTC" na bolsa americana é um ETF da Grayscale; no radar, BTC e bitcoin querem dizer a moeda
  if (['BTC', 'BITCOIN', 'BTC-USD'].includes(up)) return { simbolo: 'BTC-USD' };
  if (/^[A-Z]{4}\d{1,2}[A-Z]?(\.SA)?$/.test(up) || /^[A-Z0-9-]+\.[A-Z]{1,3}$/.test(up)) return { simbolo: simboloYahoo(up.replace(/\.SA$/, '')) };
  let lista = [];
  try { lista = await buscarAtivos(t, buscar); } catch (e) { if (/^[A-Z0-9-]{1,10}$/.test(up)) return { simbolo: up }; throw e; }
  const x = escolher(lista, t);
  if (!x) throw new Error(`nada encontrado para "${t}"`);
  return { simbolo: x.simbolo, pelo_nome: x.simbolo !== up && x.simbolo !== up + '.SA' };
}

export async function grafico(simbolo, buscar = fetch) {
  const r = await buscar(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1y&interval=1d&events=div`, { headers: UA });
  if (r.status === 404) throw new Error('código não encontrado no Yahoo');
  if (!r.ok) throw new Error('Yahoo ' + r.status);
  const j = await r.json();
  if (!j.chart || !j.chart.result || !j.chart.result[0]) throw new Error('código não encontrado no Yahoo');
  return j.chart.result[0];
}

// Resumo de 1 ano de pregões: preço, variações, máxima/mínima, dividendos 12m e uma série semanal para o mini-gráfico.
export function resumir(res) {
  const m = res.meta;
  const off = m.gmtoffset || 0;
  const dia = (t) => new Date((t + off) * 1000).toISOString().slice(0, 10);
  const pts = [];
  (res.timestamp || []).forEach((t, i) => { const c = res.indicators.quote[0].close[i]; if (c != null) pts.push({ d: dia(t), c }); });
  if (!pts.length) throw new Error('sem pregões');
  const ult = pts[pts.length - 1];
  const preco = m.regularMarketPrice || ult.c;
  const dataPreco = m.regularMarketTime ? dia(m.regularMarketTime) : ult.d;
  // fechamento anterior: o último pregão antes do dia do preço atual
  const antes = pts.filter((p) => p.d < dataPreco);
  const anterior = antes.length ? antes[antes.length - 1].c : null;
  const em = (d) => { const a = pts.filter((p) => p.d <= d); return a.length ? a[a.length - 1].c : pts[0].c; };
  const menos = (dias) => new Date(new Date(dataPreco).getTime() - dias * 86400e3).toISOString().slice(0, 10);
  const fimAnoPassado = (Number(dataPreco.slice(0, 4)) - 1) + '-12-31';
  const v = (base) => (base ? preco / base - 1 : null);
  const fech = pts.map((p) => p.c).concat([preco]);
  const max = Math.max(...fech), min = Math.min(...fech);
  const umAno = menos(365);
  const divs = Object.values((res.events && res.events.dividends) || {}).map((d) => ({ data: dia(d.date), valor: d.amount }));
  const d12 = divs.filter((d) => d.data > umAno && d.data <= dataPreco).reduce((t, d) => t + d.valor, 0);
  const serie = pts.filter((p, i) => i % 5 === 0 || i === pts.length - 1).map((p) => +p.c.toFixed(4));
  return {
    preco, moeda: m.currency, data: dataPreco, nome: m.longName || m.shortName || m.symbol,
    var_dia: v(anterior), var_1m: v(em(menos(30))), var_ano: pts[0].d <= fimAnoPassado ? v(em(fimAnoPassado)) : null, var_12m: pts[0].d <= menos(360) ? v(em(umAno)) : null,
    max_52s: max, min_52s: min, da_maxima: preco / max - 1, da_minima: preco / min - 1,
    dividendos_12m: d12, dividend_yield: d12 ? d12 / preco : 0, n_dividendos: divs.filter((d) => d.data > umAno).length, serie,
  };
}

const num = (s) => { const v = Number(String(s).replace(/[$,]/g, '')); return Number.isFinite(v) && v > 0 ? v : null; };

// Segunda fonte do preço.
export async function conferir(simbolo, tipo, buscar = fetch) {
  if (/\.SA$/.test(simbolo)) {
    const r = await buscar(`https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/${encodeURIComponent(simbolo.replace(/\.SA$/, ''))}`, { headers: UA });
    if (!r.ok) throw new Error('B3 ' + r.status);
    const t = ((await r.json()).Trad || [])[0];
    const p = t && t.scty && t.scty.SctyQtn ? t.scty.SctyQtn.curPrc : null;
    if (!p) throw new Error('B3 sem cotação');
    return { fonte: 'B3', preco: p };
  }
  if (simbolo === 'BTC-USD') {
    const r = await buscar('https://api.coinbase.com/v2/prices/BTC-USD/spot', { headers: UA });
    if (!r.ok) throw new Error('Coinbase ' + r.status);
    const p = num((await r.json()).data.amount);
    if (!p) throw new Error('Coinbase sem cotação');
    return { fonte: 'Coinbase', preco: p };
  }
  if (simbolo.includes('.') || simbolo.includes('-')) return null; // bolsa fora dos EUA ou cripto: sem segunda fonte gratuita
  for (const classe of tipo === 'etf' ? ['etf', 'stocks'] : ['stocks', 'etf']) {
    const r = await buscar(`https://api.nasdaq.com/api/quote/${encodeURIComponent(simbolo)}/info?assetclass=${classe}`, { headers: UA });
    if (!r.ok) continue;
    const d = (await r.json()).data;
    const p = d && d.primaryData ? num(d.primaryData.lastSalePrice) : null;
    if (p) return { fonte: 'Nasdaq', preco: p };
  }
  throw new Error('Nasdaq sem cotação');
}

// Múltiplos das ações (P/L, P/L projetado, P/VP, EV/EBITDA, valor de mercado), com a média do P/L em 2 anos (o Yahoo publica poucos pontos).
export async function multiplos(simbolo, buscar = fetch) {
  const t = Math.floor(Date.now() / 1000);
  const tipos = ['trailingPeRatio', 'trailingForwardPeRatio', 'trailingPbRatio', 'trailingEnterprisesValueEBITDARatio', 'trailingMarketCap'];
  const r = await buscar(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(simbolo)}?type=${tipos.join(',')}&period1=${t - 86400 * 800}&period2=${t}`, { headers: UA });
  if (!r.ok) throw new Error('Yahoo múltiplos ' + r.status);
  const s = {};
  for (const x of (await r.json()).timeseries.result || []) {
    const k = x.meta.type[0];
    s[k] = (x[k] || []).filter((e) => e && e.reportedValue).map((e) => ({ d: e.asOfDate, v: e.reportedValue.raw })).sort((a, b) => a.d.localeCompare(b.d));
  }
  const ult = (k) => (s[k] && s[k].length ? s[k][s[k].length - 1].v : null);
  const pls = (s.trailingPeRatio || []).map((e) => e.v).filter((v) => v > 0);
  return { pl: ult('trailingPeRatio'), pl_projetado: ult('trailingForwardPeRatio'), pvp: ult('trailingPbRatio'), ev_ebitda: ult('trailingEnterprisesValueEBITDARatio'),
    valor_mercado: ult('trailingMarketCap'), pl_medio_2a: pls.length >= 3 ? pls.reduce((a, b) => a + b, 0) / pls.length : null, multiplos_em: (s.trailingPeRatio || []).slice(-1).map((e) => e.d)[0] || null };
}

// Tudo de um ativo do radar; falhas na conferência ou nos múltiplos não derrubam o preço.
export async function cotarRadar(item, buscar = fetch) {
  const res = resumir(await grafico(item.simbolo, buscar));
  const [c, m] = await Promise.allSettled([conferir(item.simbolo, item.tipo, buscar), item.tipo === 'acao' ? multiplos(item.simbolo, buscar) : Promise.resolve(null)]);
  const conf = c.status === 'fulfilled' && c.value ? { ...c.value, diferenca: c.value.preco / res.preco - 1 } : null;
  return { ...res, conferencia: conf, conferido: conf ? Math.abs(conf.diferenca) <= 0.01 : false, aviso_conferencia: c.status === 'rejected' ? c.reason.message : null,
    multiplos: m.status === 'fulfilled' ? m.value : null };
}
