const test = require('node:test');
const assert = require('node:assert');

// Indicadores do dia 15/11/2026, quando a página letabuild.com/btc mostrava "COMPRA (score: 0.88)"
// com 200W +2, MVRV +1, Fear & Greed +2, SOPR 0, RHODL 0, RSI 0, RSI/ouro 0, CVDD +2.
function dia() {
  const mensal = [];
  for (let k = 0; k < 40; k++) mensal.push(60000 + 8000 * Math.sin(k / 3));
  const ouro = mensal.map((v) => v / 2500);
  return { preco: 64679, ma200: 68807, mvrv: 1.188, medo: 10, sopr: 1.0067, rhodl: 1073, cvdd: 64679 / 1.41, mensal, ouro };
}

test('faixas de cada indicador iguais às da página', async () => {
  const { REGRAS } = await import('../functions/_btc.js');
  assert.deepStrictEqual([0.9, 1.1, 2, 3.5, 3.6].map(REGRAS.ma200s), [2, 1, 0, -1, -2]);
  assert.deepStrictEqual([10, 11, 74, 90, 91].map(REGRAS.medo_ganancia), [2, 1, 0, -1, -2]);
  assert.deepStrictEqual([0.94, 0.98, 1.0067, 1.08, 1.09].map(REGRAS.sopr), [2, 1, 0, -1, -2]);
  assert.deepStrictEqual([1.4, 2.9, 5, 10, 11].map(REGRAS.cvdd), [2, 1, 0, -1, -2]);
  assert.deepStrictEqual([29, 39, 59, 69, 70].map(REGRAS.rsi), [2, 1, 0, -1, -2]);
});

test('score sobe quando o preço cai, e os níveis ficam em ordem', async () => {
  const { score, niveis } = await import('../functions/_btc.js');
  const b = dia();
  const hoje = score(b);
  const nota = Object.fromEntries(hoje.partes.map(([k, , s]) => [k, s]));
  assert.strictEqual(nota.ma200s, 2); assert.strictEqual(nota.mvrv, 1); assert.strictEqual(nota.medo_ganancia, 2); assert.strictEqual(nota.cvdd, 2);
  assert.ok(score(b, 40000).score >= hoje.score && hoje.score >= score(b, 120000).score);
  const n = niveis({ ...b, medo: 50, sopr: 1, rhodl: 5000 });
  assert.ok(n.oportunidade < n.alvo && n.alvo < n.pausar, JSON.stringify(n));
  assert.ok(score({ ...b, medo: 50, sopr: 1, rhodl: 5000 }, n.alvo - 500).score > 0);
});

test('recalcularBTC respeita alvo digitado e não refaz no mesmo dia', async () => {
  const { recalcularBTC } = await import('../functions/_btc.js');
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = [
    { id: 1, preco_alvo: 90000, alvo_auto: null }, // digitado
    { id: 2, preco_alvo: 100000, alvo_auto: JSON.stringify({ metodo: 'termometro_btc', em: hoje }) }, // já feito hoje
  ];
  const env = { DB: { prepare: () => ({ all: async () => ({ results: linhas }), bind: () => ({ run: async () => { throw new Error('não devia gravar'); } }) }) } };
  const buscar = async () => { throw new Error('não devia buscar'); };
  assert.deepStrictEqual(await recalcularBTC(env, buscar), []);
});
