// Cotações de agora para o radar: Yahoo "spark" (até 20 símbolos por pedido, sem chave), com o
// fechamento de um ano antes para a variação de 12 meses. A B3 no Yahoo tem atraso de ~15 minutos.

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

export function lerSpark(x) {
  const r = x && x.response && x.response[0];
  if (!r || !r.meta) return null;
  const m = r.meta;
  const ts = r.timestamp || [], close = (r.indicators && r.indicators.quote && r.indicators.quote[0].close) || [];
  const pts = ts.map((t, i) => [t, close[i]]).filter((p) => p[1] != null);
  const preco = m.regularMarketPrice || (pts.length ? pts[pts.length - 1][1] : null);
  if (!(preco > 0)) return null;
  const quando = m.regularMarketTime || (pts.length ? pts[pts.length - 1][0] : null);
  // 12 meses: último fechamento até um ano antes, se houver pregão até uma semana antes dessa data
  let a12 = null;
  if (quando) {
    const alvo = quando - 365 * 86400;
    const antes = pts.filter((p) => p[0] <= alvo);
    if (antes.length && antes[antes.length - 1][0] >= alvo - 7 * 86400) a12 = preco / antes[antes.length - 1][1] - 1;
  }
  // dia: contra o último fechamento de um pregão anterior ao do preço; 52 semanas: fechamentos do último ano + o preço de agora
  let var_dia = null, min_52s = null, max_52s = null;
  if (quando) {
    const dia = (t) => Math.floor((t + (m.gmtoffset || 0)) / 86400);
    const antes = pts.filter((p) => dia(p[0]) < dia(quando));
    if (antes.length) var_dia = +(preco / antes[antes.length - 1][1] - 1).toFixed(6);
    const ano = pts.filter((p) => p[0] > quando - 365 * 86400).map((p) => p[1]).concat([preco]);
    min_52s = Math.min(...ano); max_52s = Math.max(...ano);
  }
  return { preco, moeda: m.currency || null, hora: quando ? new Date(quando * 1000).toISOString() : null, a12: a12 == null ? null : +a12.toFixed(6), var_dia, min_52s, max_52s, fonte: 'Yahoo Finance' };
}

export async function cotacoes(simbolos, buscar = fetch) {
  const out = {};
  const lotes = [];
  for (let i = 0; i < simbolos.length; i += 20) lotes.push(simbolos.slice(i, i + 20));
  await Promise.all(lotes.map(async (lote) => {
    const r = await buscar(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${lote.map(encodeURIComponent).join(',')}&range=2y&interval=1d`, { headers: UA });
    if (!r.ok) return;
    const j = await r.json();
    for (const x of (j.spark && j.spark.result) || []) { const c = lerSpark(x); if (c) out[x.symbol] = c; }
  }));
  return out;
}
