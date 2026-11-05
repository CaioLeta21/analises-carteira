// Confere as tabelas derivadas no navegador contra as do pipeline original (reference/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Dados = require('../public/assets/js/dados.js');

const raiz = path.join(__dirname, '..');
// Os dados de out/2026 ficam congelados em tests/referencia: o teste confere o cálculo, não os dados.
const M = JSON.parse(fs.readFileSync(path.join(raiz, 'tests/referencia/mercado_out2026.json')));
const ref = (nome) => {
  const linhas = fs.readFileSync(path.join(raiz, 'tests/referencia', nome), 'utf8').trim().split('\n');
  const cab = linhas[0].split(',');
  return Object.fromEntries(linhas.slice(1).map((l) => { const v = l.match(/("[^"]*"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g).map((x) => x.replace(/^"|"$/g, '')); const o = {}; cab.forEach((c, i) => { o[c] = v[i]; }); return [o.ativo, o]; }));
};
const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('tabelas batem com o pipeline original (out/2026)', () => {
  if (M.ultimo_mes !== '2026-10') return; // só vale para o histórico congelado
  const D = Dados.derivar(M);
  const r10 = ref('retornos.csv');
  for (const r of D.datasets.retornos.rows) {
    const o = r10[r.ativo];
    perto(r.ret_10a_usd, +o.ret_10a_usd, 0.06, r.ativo + ' ret_10a');
    perto(r.vol_10a_usd, +o.vol_10a_usd, 0.06, r.ativo + ' vol');
    perto(r.queda_max_usd, +o.queda_max_usd, 0.06, r.ativo + ' queda');
    perto(r.ret_ano_usd, +o.ret_2026_usd, 0.06, r.ativo + ' ano');
  }
  for (const [ds, arq] of [['retornos_longo', 'retornos_longo.csv'], ['retornos_divo', 'retornos_divo.csv'], ['retornos_5a', 'retornos_5a.csv'], ['retornos_15a', 'retornos_15a.csv']]) {
    const R = ref(arq);
    for (const r of D.datasets[ds].rows) {
      const o = R[r.ativo];
      assert.strictEqual(r.inicio, o.inicio, ds + ' ' + r.ativo + ' inicio');
      perto(r.multiplicador_usd, +o.multiplicador_usd, Math.max(0.06, +o.multiplicador_usd * 0.001), ds + ' ' + r.ativo + ' mult');
      perto(r.cagr_brl, +o.cagr_brl, 0.06, ds + ' ' + r.ativo + ' cagr_brl');
    }
  }
});

test('base100 começa em 100 em cada período', () => {
  const D = Dados.derivar(M);
  const primeiros = {};
  for (const r of D.datasets.base100.rows) {
    const k = r.periodo + r.moeda + r.ativo;
    if (!(k in primeiros)) primeiros[k] = r.indice;
  }
  for (const v of Object.values(primeiros)) perto(v, 100, 1e-9, 'base');
});

test('somaMeses', () => {
  assert.strictEqual(Dados.somaMeses('2026-10', -120), '2016-10');
  assert.strictEqual(Dados.somaMeses('2026-01', -1), '2025-12');
  assert.strictEqual(Dados.somaMeses('2025-12', 1), '2026-01');
});
