/* Carrega public/data/*.json e deriva as tabelas usadas pelas páginas.
   Mesma lógica de reference/compute2_original.py, agora no navegador, para que
   as janelas (5, 10, 15 e 25 anos) andem sozinhas com os dados novos.
   Funciona no navegador (window.Dados) e no Node (require) para os testes. */
(function (root) {
  'use strict';

  const nxt = (m) => { let a = +m.slice(0, 4), mm = +m.slice(5) + 1; if (mm === 13) { a++; mm = 1; } return a + '-' + String(mm).padStart(2, '0'); };
  const somaMeses = (m, k) => { let a = +m.slice(0, 4), mm = +m.slice(5) - 1 + k; a += Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12; return a + '-' + String(mm + 1).padStart(2, '0'); };
  const mesesDe = (a, b) => { const out = []; let m = a; while (m <= b) { out.push(m); m = nxt(m); } return out; };

  async function buscarJSON(caminho) {
    const r = await fetch(caminho, { cache: 'no-cache' });
    if (!r.ok) throw new Error(caminho + ': HTTP ' + r.status);
    return r.json();
  }

  /* Séries mensais em dólar e em real por ativo. */
  function series(M) {
    const fx = {}; M.meses.forEach((m, i) => { fx[m] = M.usdbrl[i]; });
    const usd = {}, brl = {}, info = {};
    for (const a of M.ativos) {
      const i0 = M.meses.indexOf(a.inicio);
      usd[a.id] = {}; brl[a.id] = {}; info[a.id] = a;
      a.precos.forEach((p, k) => {
        const m = M.meses[i0 + k];
        if (a.moeda === 'BRL') { brl[a.id][m] = p; usd[a.id][m] = p / fx[m]; }
        else { usd[a.id][m] = p; brl[a.id][m] = p * fx[m]; }
      });
    }
    return { fx, usd, brl, info, fim: M.ultimo_mes, meses: M.meses };
  }

  function periodos(fim) {
    return [
      { id: '25a', rotulo: 'de 25 anos', inicio: somaMeses(fim, -300) },
      { id: '15a', rotulo: 'de 15 anos', inicio: somaMeses(fim, -180) },
      { id: 'divo', rotulo: 'desde o lançamento do DIVO11', inicio: '2015-11' },
      { id: '10a', rotulo: 'de 10 anos', inicio: somaMeses(fim, -120) },
      { id: '5a', rotulo: 'de 5 anos', inicio: somaMeses(fim, -60) },
    ];
  }

  function risco(u, ms) {
    const r = [];
    for (let i = 1; i < ms.length; i++) r.push(u[ms[i]] / u[ms[i - 1]] - 1);
    const media = r.reduce((s, x) => s + x, 0) / r.length;
    const vol = r.length > 1 ? Math.sqrt(r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1)) * Math.sqrt(12) : null;
    let pico = -Infinity, queda = 0;
    for (const m of ms) { pico = Math.max(pico, u[m]); queda = Math.min(queda, u[m] / pico - 1); }
    return { vol, queda };
  }

  /* Deriva todas as tabelas. ordem: lista de ids na ordem de exibição. */
  function derivar(M, ordem) {
    const S = series(M);
    const ids = (ordem || M.ativos.map((a) => a.id)).filter((id) => S.info[id]);
    const fim = S.fim;
    // janela que começa antes do histórico começa no primeiro mês com dados
    const P = periodos(fim).map((p) => (p.inicio < S.meses[0] ? { ...p, inicio: S.meses[0] } : p));
    const inicioDe = (id, base) => (S.info[id].inicio > base ? S.info[id].inicio : base);

    const base100 = [];
    for (const p of P) {
      for (const [moeda, X] of [['USD', S.usd], ['BRL', S.brl]]) {
        for (const id of ids) {
          const st = inicioDe(id, p.inicio), b = X[id][st];
          for (const m of mesesDe(st, fim)) base100.push({ periodo: p.id, mes: m, ativo: id, moeda, indice: 100 * X[id][m] / b });
        }
      }
    }

    const precos = [];
    for (const id of ids) {
      const a = S.info[id];
      for (const m of mesesDe(a.inicio, fim)) {
        precos.push({ mes: m, ativo: id, moeda_original: a.moeda,
          preco_ajustado_original: a.moeda === 'BRL' ? S.brl[id][m] : S.usd[id][m],
          usdbrl_fim_mes: S.fx[m], preco_ajustado_usd: S.usd[id][m] });
      }
    }

    const longo = (base) => ids.map((id) => {
      const st = inicioDe(id, base), ms = mesesDe(st, fim), anos = (ms.length - 1) / 12;
      const mu = S.usd[id][fim] / S.usd[id][st], mb = S.brl[id][fim] / S.brl[id][st];
      const rk = risco(S.usd[id], ms);
      return { ativo: id, nome: S.info[id].nome, inicio: st, anos,
        multiplicador_usd: mu, cagr_usd: (mu ** (1 / anos) - 1) * 100,
        multiplicador_brl: mb, cagr_brl: (mb ** (1 / anos) - 1) * 100,
        vol_usd: rk.vol * 100, queda_max_usd: rk.queda * 100 };
    });

    const ini10 = somaMeses(fim, -120), dezAnt = (+fim.slice(0, 4) - 1) + '-12';
    const ret = (u, de) => (u[de] ? (u[fim] / u[de] - 1) * 100 : null);
    const retornos = ids.map((id) => {
      const st = inicioDe(id, ini10), u = S.usd[id], b = S.brl[id], ms = mesesDe(st, fim), anos = (ms.length - 1) / 12;
      const r10 = u[fim] / u[st] - 1, mb = b[fim] / b[st], rk = risco(u, ms);
      return { ativo: id, nome: S.info[id].nome, inicio: st,
        ret_10a_usd: r10 * 100, cagr_10a_usd: ((1 + r10) ** (1 / anos) - 1) * 100,
        ret_5a_usd: ret(u, somaMeses(fim, -60)), ret_12m_usd: ret(u, somaMeses(fim, -12)), ret_ano_usd: ret(u, dezAnt),
        ret_10a_brl: (mb - 1) * 100, vol_10a_usd: rk.vol * 100, queda_max_usd: rk.queda * 100,
        multiplicador_10a_usd: 1 + r10, cagr_10a_brl: (mb ** (1 / anos) - 1) * 100, multiplicador_10a_brl: mb };
    });

    const cambio = P.map((p) => { const ini = p.inicio < S.meses[0] ? S.meses[0] : p.inicio; return { periodo: p.id, inicio: ini, fim, usdbrl_inicio: S.fx[ini], usdbrl_fim: S.fx[fim],
      alta_dolar_pct: (S.fx[fim] / S.fx[ini] - 1) * 100, perda_real_em_usd_pct: (S.fx[ini] / S.fx[fim] - 1) * 100 }; });

    const tab = (rows) => ({ rows, columns: rows.length ? Object.keys(rows[0]) : [] });
    return {
      fim, periodos: P, info: S.info, ids,
      datasets: {
        base100: tab(base100), precos_mensais: tab(precos), retornos: tab(retornos),
        retornos_25a: tab(longo(P[0].inicio)), retornos_15a: tab(longo(somaMeses(fim, -180))),
        retornos_divo: tab(longo('2015-11')), retornos_10a: tab(longo(ini10)), retornos_5a: tab(longo(somaMeses(fim, -60))),
        cambio: tab(cambio),
      },
    };
  }

  const api = { nxt, somaMeses, mesesDe, buscarJSON, series, periodos, risco, derivar };
  root.Dados = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
