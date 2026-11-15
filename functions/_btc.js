// Alvo do bitcoin no radar pelo Termômetro do Bitcoin (letabuild.com/btc): mesmas fontes, mesmas faixas
// e mesma média de 8 indicadores (de -2 a +2) que a página. Score 0 = neutro; positivo = preço abaixo
// do alvo; negativo = acima. O alvo é o preço em que o score consolidado deixaria de ser positivo,
// com os indicadores que não dependem do preço (Fear & Greed, SOPR, RHODL) em neutro: parados no valor
// de hoje, um medo extremo (+2) empurraria o alvo para o dobro do preço, e o medo não dura se o preço dobra.
// Oportunidade = até onde o score fica em COMPRA (>= 0,5); pausar = a partir de onde vira VENDA (<= -0,5).
// O score de hoje (o da página) usa os 8 indicadores com os valores reais.

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
const CM = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';

async function json(buscar, url) {
  const r = await buscar(url, { headers: UA });
  if (!r.ok) throw new Error(url.split('/')[2] + ' ' + r.status);
  return r.json();
}

// Coinmetrics (gratuito): uma métrica diária, seguindo as páginas
async function coinmetrics(buscar, metrica, inicio) {
  let url = `${CM}?${new URLSearchParams({ assets: 'btc', metrics: metrica, frequency: '1d', start_time: inicio, page_size: '10000' })}`;
  const out = [];
  while (url) {
    const j = await json(buscar, url);
    for (const l of j.data || []) if (l[metrica] != null) out.push({ d: l.time.slice(0, 10), v: parseFloat(l[metrica]) });
    if (!(j.data || []).length) break;
    url = j.next_page_url || null;
  }
  if (!out.length) throw new Error('Coinmetrics sem ' + metrica);
  return out;
}

// Fechamentos por semana ISO e por mês, como a página faz com a série diária do Coinmetrics
function semanal(diario) {
  const m = new Map();
  for (const p of diario) {
    const c = new Date(p.d + 'T00:00:00Z'), y = c.getUTCFullYear();
    const h = Math.floor((c - Date.UTC(y, 0, 1)) / 864e5), w = Math.ceil((h + new Date(Date.UTC(y, 0, 4)).getUTCDay() + 1) / 7);
    m.set(`${y}-W${String(w).padStart(2, '0')}`, p.v);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
}
function mensal(diario) {
  const m = new Map();
  for (const p of diario) m.set(p.d.slice(0, 7), p);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
}

// RSI de 14 períodos (Wilder), igual ao da página
export function rsi(c, t = 14) {
  if (!c || c.length < t + 1) return null;
  const d = c.slice(1).map((x, i) => x - c[i]);
  const g = d.map((x) => (x > 0 ? x : 0)), p = d.map((x) => (x < 0 ? -x : 0));
  let a = g.slice(0, t).reduce((s, x) => s + x, 0) / t, b = p.slice(0, t).reduce((s, x) => s + x, 0) / t;
  for (let i = t; i < g.length; i++) { a = (a * (t - 1) + g[i]) / t; b = (b * (t - 1) + p[i]) / t; }
  return b === 0 ? 100 : 100 - 100 / (1 + a / b);
}

// Faixas de cada indicador (copiadas da página)
const faixa = (v, lim, inclusivo = []) => {
  if (v == null) return null;
  const sc = [2, 1, 0, -1];
  for (let i = 0; i < 4; i++) if (inclusivo[i] ? v <= lim[i] : v < lim[i]) return sc[i];
  return -2;
};
export const REGRAS = {
  ma200s: (v) => faixa(v, [1, 1.2, 2.5, 3.5], [0, 0, 0, 1]),
  mvrv: (v) => faixa(v, [1, 1.5, 2.5, 3.5], [0, 0, 0, 1]),
  medo_ganancia: (v) => faixa(v, [10, 25, 74, 90], [1, 1, 1, 1]),
  sopr: (v) => faixa(v, [0.95, 0.99, 1.04, 1.08], [0, 0, 0, 1]),
  rhodl: (v) => faixa(v, [350, 1000, 10000, 50000], [1, 1, 1, 1]),
  rsi: (v) => faixa(v, [30, 40, 60, 70]),
  rsi_ouro: (v) => faixa(v, [30, 40, 60, 70]),
  cvdd: (v) => faixa(v, [1.5, 3, 6, 10], [0, 0, 0, 1]),
};
export const NOMES = { ma200s: 'Média de 200 semanas', mvrv: 'MVRV', medo_ganancia: 'Fear & Greed', sopr: 'SOPR', rhodl: 'RHODL', rsi: 'RSI mensal BTC/USD', rsi_ouro: 'RSI mensal BTC/ouro', cvdd: 'CVDD' };

// Valores dos indicadores se o bitcoin estivesse a `p` (o que não depende do preço fica igual)
export function indicadores(b, p) {
  const k = p / b.preco;
  const meses = b.mensal.slice(0, -1).concat([p]);
  const ouro = b.ouro ? b.ouro.slice(0, -1).concat([b.ouro[b.ouro.length - 1] * k]) : null;
  return {
    ma200s: b.ma200 ? p / b.ma200 : null,
    mvrv: b.mvrv != null ? b.mvrv * k : null,
    medo_ganancia: b.medo,
    sopr: b.sopr,
    rhodl: b.rhodl,
    rsi: rsi(meses),
    rsi_ouro: ouro ? rsi(ouro) : null,
    cvdd: b.cvdd ? p / b.cvdd : null,
  };
}

export function score(b, p = b.preco) {
  const v = indicadores(b, p);
  const s = Object.keys(REGRAS).map((k) => [k, v[k], REGRAS[k](v[k])]).filter((x) => x[1] != null);
  return { score: s.length ? s.reduce((t, x) => t + x[2], 0) / s.length : 0, partes: s };
}

export const sinal = (s) => (s >= 1.5 ? 'COMPRA FORTE' : s >= 0.5 ? 'COMPRA' : s > -0.5 ? 'NEUTRO' : s > -1.5 ? 'VENDA' : 'VENDA FORTE');

// O score só cai quando o preço sobe; procura as fronteiras numa grade de 0,5% entre 0,2× e 5× o preço.
export function niveis(b) {
  const grade = [];
  for (let p = b.preco * 0.2; p <= b.preco * 5; p *= 1.005) grade.push(p);
  const ult = (f) => { let r = null; for (const p of grade) if (f(score(b, p).score)) r = p; else if (r != null) break; return r; };
  const pri = (f) => grade.find((p) => f(score(b, p).score)) || null;
  const arr = (v) => (v == null ? null : Math.round(v / 100) * 100);
  return { alvo: arr(ult((s) => s > 0)), oportunidade: arr(ult((s) => s >= 0.5)), pausar: arr(pri((s) => s <= -0.5)) };
}

// Indicadores do dia: tudo menos o preço de agora. Saem uma vez por dia; o site guarda por algumas horas.
export async function dadosDiarios(buscar = fetch) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [diario, mvrv, fng, sopr, cvdd, rhodl, ouro] = await Promise.allSettled([
    coinmetrics(buscar, 'PriceUSD', '2010-01-01'),
    coinmetrics(buscar, 'CapMVRVCur', '2026-01-01'),
    json(buscar, 'https://api.alternative.me/fng/?limit=1'),
    json(buscar, 'https://btc.letabuild.com/api/sopr'),
    json(buscar, 'https://btc.letabuild.com/api/cvdd-history-v2'),
    json(buscar, 'https://charts.bgeometrics.com/files/rhodl.json'),
    btcOuro(buscar),
  ]);
  if (diario.status !== 'fulfilled') throw new Error('sem preços do bitcoin: ' + diario.reason.message);
  const ok = (x) => (x.status === 'fulfilled' ? x.value : null);
  const d = diario.value;
  const sem = semanal(d);
  const ultimo = (arr, f) => { if (!Array.isArray(arr)) return null; for (let i = arr.length - 1; i >= 0; i--) { const v = f(arr[i]); if (v != null && v > 0) return v; } return null; };
  const b = {
    data: hoje,
    ultimo_fechamento: d[d.length - 1].v,
    ma200: sem.length >= 200 ? sem.slice(-200).reduce((t, x) => t + x, 0) / 200 : null,
    mensal: mensal(d).map((x) => x.v),
    mvrv: ok(mvrv) ? ok(mvrv)[ok(mvrv).length - 1].v : null,
    medo: ok(fng) && ok(fng).data && ok(fng).data[0] ? parseInt(ok(fng).data[0].value) : null,
    sopr: ultimo(ok(sopr), (x) => (x[1] == null ? null : Math.round(x[1] * 1e4) / 1e4)),
    cvdd: ultimo(ok(cvdd), (x) => x.v),
    rhodl: ultimo(ok(rhodl), (x) => (x[1] == null ? null : Math.round(x[1]))),
    ouro: ok(ouro),
  };
  b.faltando = Object.entries({ mvrv: b.mvrv, medo: b.medo, sopr: b.sopr, cvdd: b.cvdd, rhodl: b.rhodl, ouro: b.ouro }).filter((e) => e[1] == null).map((e) => e[0]);
  return b;
}

// Preço de agora: Binance (como a página) ou, se bloqueada (a Binance recusa alguns países), Coinbase.
export async function precoAgora(buscar = fetch) {
  try {
    const t = await json(buscar, 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    const p = parseFloat(t.lastPrice);
    if (p > 0) return { preco: p, fonte: 'Binance' };
  } catch { /* cai para a Coinbase */ }
  const t = await json(buscar, 'https://api.coinbase.com/v2/prices/BTC-USD/spot');
  const p = parseFloat(t.data.amount);
  if (!(p > 0)) throw new Error('sem preço do bitcoin agora');
  return { preco: p, fonte: 'Coinbase' };
}

// Indicadores do dia + preço de agora (o mês corrente fecha no preço de agora, como na página)
export function comPreco(d, preco) {
  const m = d.mensal.slice();
  m[m.length - 1] = preco;
  return { ...d, preco, mensal: m };
}

export async function dadosBTC(buscar = fetch) {
  const [d, p] = await Promise.all([dadosDiarios(buscar), precoAgora(buscar).catch(() => null)]);
  return comPreco(d, p ? p.preco : d.ultimo_fechamento);
}

// Score de agora, para o cartão
export function termometro(b) {
  const s = score(b);
  return { score: +s.score.toFixed(3), sinal: sinal(s.score), preco: b.preco, dados_de: b.data,
    indicadores: Object.fromEntries(s.partes.map(([k, v, sc]) => [k, { valor: +v.toFixed(4), score: sc }])) };
}

// BTC/ouro mensal: Binance (BTCUSDT ÷ PAXGUSDT, como a página) ou, se bloqueada, Yahoo (BTC-USD ÷ GC=F)
async function btcOuro(buscar) {
  const kl = (s) => json(buscar, `https://api.binance.com/api/v3/klines?symbol=${s}&interval=1M&limit=200`).then((a) => new Map(a.map((l) => [l[0], parseFloat(l[4])])));
  try {
    const [b, g] = await Promise.all([kl('BTCUSDT'), kl('PAXGUSDT')]);
    const ts = [...b.keys()].filter((t) => g.has(t)).sort((x, y) => x - y);
    if (ts.length > 15) return ts.map((t) => b.get(t) / g.get(t));
  } catch { /* cai para o Yahoo */ }
  const yh = async (s) => {
    const r = (await json(buscar, `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=20y&interval=1mo`)).chart.result[0];
    return new Map(r.timestamp.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 7), r.indicators.quote[0].close[i]]).filter((e) => e[1] != null));
  };
  const [b, g] = await Promise.all([yh('BTC-USD'), yh('GC=F')]);
  const ms = [...b.keys()].filter((m) => g.has(m)).sort();
  if (ms.length <= 15) throw new Error('BTC/ouro sem dados');
  return ms.map((m) => b.get(m) / g.get(m));
}

const usd = (v) => (v == null ? '—' : 'US$ ' + Math.round(v).toLocaleString('pt-BR'));
const num = (v, c = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: c, minimumFractionDigits: 0 });

// Alvo a partir dos dados (indicadores do dia + preço): { preco_alvo, alvo_explicacao, alvo_auto }
export function alvoBTC(b) {
  const s = score(b);
  // valores neutros dos três que não dependem do preço (score 0 em cada um)
  const n = niveis({ ...b, medo: b.medo == null ? null : 50, sopr: b.sopr == null ? null : 1, rhodl: b.rhodl == null ? null : 5000 });
  const partes = s.partes.map(([k, v, sc]) => `${NOMES[k]} ${num(v, k === 'rhodl' ? 0 : 2)} (${sc > 0 ? '+' : ''}${sc})`).join('; ');
  const em = b.data.split('-').reverse().join('/');
  const explicacao = `Pelo Termômetro do Bitcoin (letabuild.com/btc): média de ${s.partes.length} indicadores, cada um de -2 (venda forte) a +2 (compra forte); o cartão mostra o score de agora. `
    + `O alvo é o preço em que o score cairia para zero (neutro) só pelos indicadores de preço (média de 200 semanas, MVRV, RSI e CVDD), com Fear & Greed, SOPR e RHODL em neutro: ${usd(n.alvo)}. `
    + `Oportunidade (score em COMPRA) até ${usd(n.oportunidade)}; pausar (score em VENDA) acima de ${usd(n.pausar)}. `
    + `Na conta de ${em}, com o bitcoin a ${usd(b.preco)}, o score era ${s.score > 0 ? '+' : ''}${num(s.score)} (${sinal(s.score)}): ${partes}. Os indicadores saem uma vez por dia; o alvo é refeito todo dia.`;
  return {
    preco_alvo: n.alvo,
    alvo_explicacao: explicacao.slice(0, 1500),
    alvo_auto: { metodo: 'termometro_btc', score: +s.score.toFixed(3), sinal: sinal(s.score), preco: b.preco, ...n, em: b.data, faltando: b.faltando,
      indicadores: Object.fromEntries(s.partes.map(([k, v, sc]) => [k, { valor: +v.toFixed(4), score: sc }])) },
  };
}

export async function calcularAlvoBTC(buscar = fetch) {
  return alvoBTC(await dadosBTC(buscar));
}

// Grava no item do radar. Devolve { ok, preco_alvo, ... } ou { ok: false, erro }.
export async function gravarAlvoBTC(env, id, buscar = fetch, b = null) {
  try {
    const r = alvoBTC(b || await dadosBTC(buscar));
    if (!r.preco_alvo) throw new Error('sem alvo na faixa de preços testada');
    await env.DB.prepare("UPDATE radar SET preco_alvo = ?, alvo_explicacao = ?, alvo_auto = ?, atualizado_em = datetime('now') WHERE id = ?")
      .bind(r.preco_alvo, r.alvo_explicacao, JSON.stringify(r.alvo_auto), id).run();
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, erro: String(e.message || e) };
  }
}

// Recálculo diário: bitcoin sem alvo ou com alvo do termômetro de outro dia. Alvo digitado (alvo_auto NULL) fica.
export async function recalcularBTC(env, buscar = fetch, b = null) {
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = (await env.DB.prepare("SELECT id, preco_alvo, alvo_auto FROM radar WHERE simbolo = 'BTC-USD'").all()).results;
  const feitos = [];
  for (const i of itens) {
    let a = null; try { a = i.alvo_auto ? JSON.parse(i.alvo_auto) : null; } catch { a = null; }
    if (i.preco_alvo != null && !a) continue;
    if (a && a.em === hoje && !a.erro) continue;
    const r = await gravarAlvoBTC(env, i.id, buscar, b);
    feitos.push({ codigo: 'BTC', ok: r.ok, alvo: r.preco_alvo || null, erro: r.erro || null });
  }
  return feitos;
}

