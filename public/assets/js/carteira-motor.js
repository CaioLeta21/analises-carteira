/* Motor de risco da carteira: retornos mensais em reais, rebalanceados todo mês.
   Mesmas contas do simulador (volatilidade, quedas, pior janela de 12 meses).
   Funciona no navegador (window.CarteiraMotor) e no Node (testes). */
(function (root) {
  'use strict';

  /* Retornos mensais em reais de cada ativo conhecido, alinhados aos meses do simulador. */
  function retornosAtivos(mercado, meses) {
    const fx = {}; mercado.meses.forEach((m, i) => { fx[m] = mercado.usdbrl[i]; });
    const out = {};
    for (const a of mercado.ativos) {
      const i0 = mercado.meses.indexOf(a.inicio), brl = {};
      a.precos.forEach((p, k) => { const m = mercado.meses[i0 + k]; brl[m] = a.moeda === 'BRL' ? p : p * fx[m]; });
      const prev = (m) => { const y = +m.slice(0, 4), mm = +m.slice(5) - 1; return mm ? y + '-' + String(mm).padStart(2, '0') : (y - 1) + '-12'; };
      out[a.id] = meses.map((m) => (brl[m] != null && brl[prev(m)] != null ? brl[m] / brl[prev(m)] - 1 : null));
    }
    return out;
  }

  /* Série de retornos da carteira.
     componentes: [{ peso, serie: [r|null...], reserva: [r...] }] — quando a série do ativo
     não existe naquele mês (antes da estreia), usa a série reserva (a da categoria). */
  function retornosCarteira(componentes, n) {
    const t = componentes.reduce((s, c) => s + c.peso, 0) || 1;
    const rr = new Array(n).fill(0);
    for (const c of componentes) {
      const w = c.peso / t;
      for (let i = 0; i < n; i++) {
        const r = c.serie && c.serie[i] != null ? c.serie[i] : c.reserva[i];
        rr[i] += w * r;
      }
    }
    return rr;
  }

  function metricas(rr, fxr, meses) {
    const N = rr.length;
    const ru = rr.map((x, i) => (1 + x) / (1 + fxr[i]) - 1);
    const dp = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) * Math.sqrt(12); };
    const caminho = (a) => { const idx = [1]; for (const x of a) idx.push(idx[idx.length - 1] * (1 + x)); return idx; };
    const queda = (idx) => { let pk = idx[0], pi = 0, m = 0, de = 0, ate = 0; const serie = []; for (let i = 0; i < idx.length; i++) { if (idx[i] > pk) { pk = idx[i]; pi = i; } const d = idx[i] / pk - 1; serie.push(d); if (d < m) { m = d; de = pi; ate = i; } } let volta = null; for (let i = ate; i < idx.length; i++) if (idx[i] >= idx[de]) { volta = i; break; } return { m, de, ate, volta, serie }; };
    const ib = caminho(rr), iu = caminho(ru), qb = queda(ib), qu = queda(iu);
    let p12 = Infinity, p12i = 0; for (let i = 0; i + 12 < ib.length; i++) { const r = ib[i + 12] / ib[i] - 1; if (r < p12) { p12 = r; p12i = i + 12; } }
    const anos = {};
    if (meses) for (let i = 0; i < N; i++) { const a = meses[i].slice(0, 4); anos[a] = (anos[a] ?? 1) * (1 + rr[i]); }
    for (const a in anos) anos[a] -= 1;
    const mult = ib[ib.length - 1];
    return { vol: dp(rr), volUSD: dp(ru), cagr: Math.pow(mult, 12 / N) - 1, mult, queda: qb, quedaUSD: qu,
      pior12m: p12, pior12mAte: p12i, mesesNegativos: rr.filter((x) => x < 0).length / N, anos, indice: ib };
  }

  /* Série da categoria. Bitcoin: antes de out/2009 não havia preço (sim.btc é null);
     nesses meses a fatia rende o CDI, como no simulador. */
  function serieCategoria(sim, k) {
    if (k !== 'btc') return sim[k];
    return sim.rfbr.map((r, i) => (sim.btc && sim.btc[i] != null ? sim.btc[i] : r));
  }
  /* Mesma regra para um ativo da categoria bitcoin (BTC, ETH...): antes da série da categoria, CDI. */
  function mascarar(serie, sim, k) {
    if (k !== 'btc' || !serie) return serie;
    return serie.map((r, i) => (sim.btc && sim.btc[i] != null ? r : null));
  }

  /* Monta os componentes a partir da carteira.
     sim: /data/simulador.json; retAtivos: saída de retornosAtivos; modelo: CarteiraModelo. */
  function componentes(carteira, sim, retAtivos, modelo, atuais) {
    if (carteira.modo === 'categorias') {
      const { pesos } = modelo.pesosPorCategoria(carteira, atuais);
      return modelo.CHAVES.filter((k) => pesos[k] > 0).map((k) => ({ rotulo: k, peso: pesos[k], serie: null, reserva: serieCategoria(sim, k) }));
    }
    const linhas = modelo.valorar(carteira.ativos, atuais).filter((l) => l.valorBRL > 0);
    return linhas.map((l) => ({ rotulo: l.codigo || l.nome, peso: l.valorBRL, serie: mascarar(retAtivos[l.codigo] || null, sim, l.categoria), reserva: serieCategoria(sim, l.categoria) }));
  }

  const api = { retornosAtivos, retornosCarteira, metricas, componentes, serieCategoria };
  root.CarteiraMotor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
