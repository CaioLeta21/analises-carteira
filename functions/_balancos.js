// "Balanço novo desde o teto": o site confere sozinho, pelo Yahoo, a data do último trimestre publicado
// de cada ação do radar. O preço teto das ações é revisado à mão (pelo Claude, quando o dono pede);
// esta conferência só avisa quando um teto ficou velho. Colunas: balanco_ultimo (último trimestre
// visto), teto_balanco (trimestre que o teto levou em conta), balanco_conferido_em (dia da conferência).

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

// Data de fim do último trimestre publicado (lucro por ação ou receita), ou null se o Yahoo não tiver.
export async function ultimoBalanco(simbolo, buscar = fetch) {
  const t = Math.floor(Date.now() / 1000);
  const r = await buscar(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(simbolo)}?type=quarterlyDilutedEPS,quarterlyTotalRevenue&period1=${t - 86400 * 400}&period2=${t}`, { headers: UA });
  if (!r.ok) throw new Error('Yahoo ' + r.status);
  const datas = [];
  for (const x of ((await r.json()).timeseries || {}).result || []) {
    const k = x.meta && x.meta.type && x.meta.type[0];
    for (const e of (k && x[k]) || []) if (e && e.asOfDate && e.reportedValue) datas.push(e.asOfDate);
  }
  return datas.sort().pop() || null;
}

// Confere até `limite` ações por vez (as conferidas há mais tempo primeiro; cada uma a cada 3 dias).
// Na primeira conferência, o teto atual passa a valer pelo último balanço já publicado.
export async function conferirBalancos(env, buscar = fetch, limite = 15, agora = new Date()) {
  const hoje = agora.toISOString().slice(0, 10);
  const corte = new Date(agora.getTime() - 3 * 86400e3).toISOString().slice(0, 10);
  const itens = (await env.DB.prepare(`SELECT id, simbolo, codigo, teto_balanco FROM radar WHERE tipo = 'acao'
      AND (balanco_conferido_em IS NULL OR balanco_conferido_em <= ?) ORDER BY balanco_conferido_em IS NOT NULL, balanco_conferido_em LIMIT ?`)
    .bind(corte, limite).all()).results;
  const feitos = [];
  for (const i of itens) {
    let b = null, erro = null;
    try { b = await ultimoBalanco(i.simbolo, buscar); } catch (e) { erro = String(e.message || e); }
    await env.DB.prepare('UPDATE radar SET balanco_ultimo = COALESCE(?, balanco_ultimo), teto_balanco = COALESCE(teto_balanco, ?), balanco_conferido_em = ? WHERE id = ?')
      .bind(b, b, hoje, i.id).run();
    feitos.push({ codigo: i.codigo, balanco: b, novo: !!(b && i.teto_balanco && b > i.teto_balanco), erro });
  }
  return feitos;
}

// Para mostrar: data do trimestre novo, se o teto ainda não levou ele em conta
export const balancoNovo = (i) => (i.tipo === 'acao' && i.balanco_ultimo && i.teto_balanco && i.balanco_ultimo > i.teto_balanco ? i.balanco_ultimo : null);
