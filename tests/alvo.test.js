const test = require('node:test');
const assert = require('node:assert');

// Yahoo e Gemini falsos: o teste não usa rede.
function falso({ gemini = [], yahooEPS = '2026-06-30' } = {}) {
  const pedidos = [];
  const respostas = [...gemini];
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
  const f = async (url, opt) => {
    pedidos.push({ url, opt });
    if (url.includes('generativelanguage')) {
      const r = respostas.shift();
      if (typeof r === 'number') return json({ error: 'x' }, r);
      return json({ candidates: [{ content: { parts: [{ text: typeof r === 'string' ? r : JSON.stringify(r) }] } }] });
    }
    if (url.includes('fundamentals-timeseries')) {
      return json({ timeseries: { result: [
        { meta: { type: ['quarterlyDilutedEPS'] }, quarterlyDilutedEPS: [{ asOfDate: yahooEPS, reportedValue: { raw: 0.35 }, currencyCode: 'BRL' }] },
        { meta: { type: ['trailingPeRatio'] }, trailingPeRatio: [{ asOfDate: '2026-11-01', reportedValue: { raw: 14.2 } }] },
      ] } });
    }
    if (url.includes('/v8/finance/chart/')) {
      const t0 = Date.UTC(2025, 10, 14, 15) / 1000;
      const ts = [], close = [];
      for (let k = 0; k < 260; k++) { ts.push(t0 + k * 86400 * 1.4); close.push(14 + (k % 10) / 10); }
      return json({ chart: { result: [{ meta: { currency: 'BRL', regularMarketPrice: 15.3, longName: 'Copel', symbol: 'CPLE3.SA', gmtoffset: -10800 }, timestamp: ts, indicators: { quote: [{ close }] } }] } });
    }
    throw new Error('url inesperada ' + url);
  };
  return { f, pedidos };
}

const BOA = { metodo: 'pl_futuro', base: 1.2, multiplo: 11, alvo: 13.2, oportunidade: 11, pausar: 17, explicacao: 'Lucro por ação esperado de R$ 1,20 vezes P/L justo de 11x, abaixo da média por risco regulatório.' };

test('validar: aceita alvo coerente e recusa conta errada, alvo longe do preço e níveis fora de ordem', async () => {
  const { validar } = await import('../functions/_alvo.js');
  assert.strictEqual(validar(BOA, 15).alvo, 13.2);
  assert.throws(() => validar({ ...BOA, alvo: 20 }, 15), /≠/);
  assert.throws(() => validar({ ...BOA, base: 10, alvo: 110 }, 15), /longe demais/);
  assert.throws(() => validar({ ...BOA, oportunidade: 14 }, 15), /ordem/);
  assert.throws(() => validar({ ...BOA, metodo: 'chute' }, 15), /método/);
  assert.strictEqual(validar({ metodo: 'sem_alvo', explicacao: 'Prejuízo: sem base.' }, 15).alvo, null);
});

test('extrairJSON lê resposta com ```json e texto em volta', async () => {
  const { extrairJSON } = await import('../functions/_alvo.js');
  assert.deepStrictEqual(extrairJSON('Claro!\n```json\n{"a": {"b": 1}}\n```'), { a: { b: 1 } });
  assert.deepStrictEqual(extrairJSON('{"x": "}"} fim'), { x: '}' });
});

test('calcularAlvo: troca de modelo sem cota, refaz resposta recusada e monta a explicação pública', async () => {
  const { calcularAlvo } = await import('../functions/_alvo.js');
  const { f, pedidos } = falso({ gemini: [429, { ...BOA, alvo: 99 }, BOA] });
  const r = await calcularAlvo({ simbolo: 'CPLE3.SA', codigo: 'CPLE3', tipo: 'acao' }, { GEMINI_API_KEY: 'k' }, f);
  assert.strictEqual(r.preco_alvo, 13.2);
  assert.strictEqual(r.alvo_auto.modelo, 'gemini-3.5-flash-lite'); // o 1º estava sem cota
  assert.strictEqual(r.alvo_auto.trimestre, '2026-06-30');
  assert.match(r.alvo_explicacao, /P\/L justo de 11x/);
  assert.match(r.alvo_explicacao, /Calculado automaticamente em \d\d\/\d\d\/\d{4} com os balanços até 30\/06\/2026/);
  const ger = pedidos.filter((p) => p.url.includes('generativelanguage'));
  assert.strictEqual(ger[0].opt.headers['x-goog-api-key'], 'k');
  const prompt = JSON.parse(ger[0].opt.body).contents[0].parts[0].text;
  assert.match(prompt, /P\/L justo/); assert.match(prompt, /CPLE3/); assert.match(prompt, /"preco":15\.3/);
  assert.doesNotMatch(prompt, /nota|entrada|quantidade/i); // nada da carteira vai para o Gemini
});

test('calcularAlvo: sem chave ou ETF não chama ninguém', async () => {
  const { calcularAlvo } = await import('../functions/_alvo.js');
  const { f, pedidos } = falso();
  await assert.rejects(calcularAlvo({ simbolo: 'X', tipo: 'acao' }, {}, f), /GEMINI_API_KEY/);
  await assert.rejects(calcularAlvo({ simbolo: 'BOVA11.SA', tipo: 'etf' }, { GEMINI_API_KEY: 'k' }, f), /só para ações/);
  assert.strictEqual(pedidos.length, 0);
});

// D1 falso, só com o que o recálculo usa
function bancoFalso(linhas) {
  const updates = [];
  return {
    updates,
    DB: { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { updates.push({ sql, a }); return { meta: { changes: 1 } }; } }), all: async () => ({ results: linhas }) }) },
  };
}

test('recalcularAlvos: calcula quem não tem alvo, recalcula automático com balanço novo e nunca mexe em alvo digitado', async () => {
  const { recalcularAlvos } = await import('../functions/_alvo.js');
  const ontem = '2020-01-01';
  const linhas = [
    { id: 1, simbolo: 'CPLE3.SA', codigo: 'CPLE3', tipo: 'acao', preco_alvo: null, alvo_auto: null },
    { id: 2, simbolo: 'MSFT', codigo: 'MSFT', tipo: 'acao', preco_alvo: 500, alvo_auto: null }, // digitado à mão
    { id: 3, simbolo: 'CPFE3.SA', codigo: 'CPFE3', tipo: 'acao', preco_alvo: 40, alvo_auto: JSON.stringify({ alvo: 40, em: ontem, trimestre: '2026-03-31' }) }, // balanço novo
    { id: 4, simbolo: 'SBSP3.SA', codigo: 'SBSP3', tipo: 'acao', preco_alvo: 27, alvo_auto: JSON.stringify({ alvo: 27, em: ontem, trimestre: '2026-06-30' }) }, // sem balanço novo
  ];
  const b = bancoFalso(linhas);
  const { f } = falso({ gemini: [BOA, BOA] });
  const r = await recalcularAlvos({ ...b, GEMINI_API_KEY: 'k' }, 4, f);
  assert.deepStrictEqual(r.feitos.map((x) => [x.codigo, x.ok]), [['CPLE3', true], ['CPFE3', true]]);
  assert.ok(b.updates.every((u) => u.a[u.a.length - 1] !== 2 && u.a[u.a.length - 1] !== 4));
});
