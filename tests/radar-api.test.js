const test = require('node:test');
const assert = require('node:assert');

const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });

// resposta do Yahoo spark para um símbolo: um ano de fechamentos diários
function spark(simbolo, preco, umAnoAntes, moeda = 'USD') {
  const fim = Date.UTC(2026, 10, 13, 21) / 1000;
  const ts = [], close = [];
  for (let k = 370; k >= 0; k--) { ts.push(fim - k * 86400); close.push(k >= 365 ? umAnoAntes : preco); }
  return { symbol: simbolo, response: [{ meta: { regularMarketPrice: preco, regularMarketTime: fim, currency: moeda }, timestamp: ts, indicators: { quote: [{ close }] } }] };
}

test('lerSpark: preço, hora e 12 meses; sem histórico de um ano fica sem a12', async () => {
  const { lerSpark } = await import('../functions/_cotacoes.js');
  const c = lerSpark(spark('MSFT', 150, 100));
  assert.strictEqual(c.preco, 150); assert.strictEqual(c.a12, 0.5); assert.match(c.hora, /^2026-11-13T21/);
  const curto = spark('X', 10, 9); curto.response[0].timestamp = curto.response[0].timestamp.slice(-30); curto.response[0].indicators.quote[0].close = curto.response[0].indicators.quote[0].close.slice(-30);
  assert.strictEqual(lerSpark(curto).a12, null);
  assert.strictEqual(lerSpark({ symbol: 'Y', response: [] }), null);
});

test('cotacoes: pede em lotes de até 20 símbolos', async () => {
  const { cotacoes } = await import('../functions/_cotacoes.js');
  const urls = [];
  const simbolos = Array.from({ length: 33 }, (_, k) => 'S' + k);
  const f = async (u) => { urls.push(u); const s = decodeURIComponent(u.match(/symbols=([^&]+)/)[1]).split(','); return json({ spark: { result: s.map((x) => spark(x, 2, 1)) } }); };
  const r = await cotacoes(simbolos, f);
  assert.strictEqual(urls.length, 2);
  assert.strictEqual(Object.keys(r).length, 33);
});

test('montarRadar: só campos públicos, cotação de agora e termômetro no bitcoin', async () => {
  const { montarRadar } = await import('../functions/_radar_publico.js');
  const linhas = [
    { simbolo: 'MSFT', codigo: 'MSFT', nome: 'Microsoft', tipo: 'acao', mercado: 'EXT', moeda: 'USD', preco_alvo: 500, alvo_explicacao: 'P/L 24x', atualizado_em: '2026-11-14 10:00:00' },
    { simbolo: 'BTC-USD', codigo: 'BTC', nome: 'Bitcoin', tipo: 'cripto', mercado: 'EXT', moeda: 'USD', preco_alvo: 101900, alvo_explicacao: 'termômetro', atualizado_em: '2026-11-15 12:00:00' },
  ];
  const env = { DB: { prepare: (sql) => { assert.doesNotMatch(sql, /nota|entrada/); return { all: async () => ({ results: linhas }) }; } } };
  // termômetro já calculado (os dados do dia vêm do cache): o teste injeta pelo cache falso
  const mensal = Array.from({ length: 40 }, (_, k) => 60000 + 8000 * Math.sin(k / 3));
  const diarios = { data: '2026-11-15', ultimo_fechamento: 64000, ma200: 68807, mensal, mvrv: 1.188, medo: 10, sopr: 1.0067, rhodl: 1073, cvdd: 64679 / 1.41, ouro: mensal.map((v) => v / 2500), faltando: [] };
  const cache = async (chave, s, fn) => (chave.startsWith('btc:diarios') ? diarios : fn());
  const f = async (u) => {
    if (u.includes('spark')) return json({ spark: { result: [spark('MSFT', 520, 400), spark('BTC-USD', 64500, 90000)] } });
    if (u.includes('binance.com/api/v3/ticker')) return json({ lastPrice: '64679' });
    throw new Error('url inesperada ' + u);
  };
  const r = await montarRadar(env, f, cache);
  assert.strictEqual(r.atualizado_em, '2026-11-15T12:00:00Z');
  const [m, b] = r.itens;
  assert.strictEqual(m.cotacao.preco, 520); assert.strictEqual(m.preco_alvo, 500); assert.ok(!('atualizado_em' in m));
  assert.strictEqual(b.cotacao.preco, 64679); // o mesmo preço do score
  // 200 semanas +2, MVRV +1, medo +2, CVDD +2 (o RSI depende dos fechamentos inventados do teste)
  assert.strictEqual(b.termometro.sinal, 'COMPRA'); assert.ok(b.termometro.score >= 0.5); assert.strictEqual(b.termometro.dados_de, '2026-11-15');
});

// D1 falso para a edição
function banco() {
  const linhas = [];
  let id = 0;
  const DB = {
    prepare: (sql) => ({
      bind: (...a) => ({
        first: async () => (/SELECT 1 FROM radar WHERE simbolo/.test(sql) ? linhas.find((l) => l.simbolo === a[0]) || null : linhas.find((l) => l.id === a[0]) || null),
        run: async () => {
          if (/^INSERT INTO radar/.test(sql)) { id++; linhas.push({ id, simbolo: a[0], codigo: a[1], nome: a[2], tipo: a[3], mercado: a[4], moeda: a[5], preco_alvo: a[6], alvo_explicacao: a[7], alvo_auto: null }); return { meta: { last_row_id: id, changes: 1 } }; }
          if (/^UPDATE radar SET preco_alvo = \?, tipo/.test(sql)) {
            const l = linhas.find((x) => x.id === a[5]); if (!l) return { meta: { changes: 0 } };
            const mesmo = l.preco_alvo === a[3] && (l.alvo_explicacao || '') === (a[4] || '');
            Object.assign(l, { preco_alvo: a[0], tipo: a[1] || l.tipo, alvo_explicacao: a[2], alvo_auto: mesmo ? l.alvo_auto : null });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };
  return { DB, linhas };
}

const chartYahoo = (simbolo, preco, moeda, tipo) => json({ chart: { result: [{ meta: { currency: moeda, regularMarketPrice: preco, longName: simbolo + ' SA', symbol: simbolo, instrumentType: tipo, gmtoffset: 0 }, timestamp: [Date.UTC(2026, 10, 13) / 1000], indicators: { quote: [{ close: [preco] }] } }] } });

test('edição: adicionar resolve o código, recusa repetido e alvo inválido; editar o alvo desliga o automático', async () => {
  const { adicionar, editar } = await import('../functions/admin/api/[[rota]].js');
  const { DB, linhas } = banco();
  const env = { DB };
  const f = async (u) => { if (u.includes('/v8/finance/chart/WEGE3.SA')) return chartYahoo('WEGE3.SA', 50, 'BRL', 'EQUITY'); throw new Error('url inesperada ' + u); };
  const [s1, r1] = await adicionar(env, { codigo: 'wege3', preco_alvo: '45,50' }, f);
  assert.strictEqual(s1, 201); assert.strictEqual(r1.codigo, 'WEGE3'); assert.strictEqual(linhas[0].preco_alvo, 45.5); assert.strictEqual(linhas[0].mercado, 'BR');
  assert.strictEqual((await adicionar(env, { codigo: 'WEGE3' }, f))[0], 409);
  assert.strictEqual((await adicionar(env, { codigo: 'WEGE3', preco_alvo: 'abc' }, f))[0], 400);
  linhas[0].alvo_auto = '{"metodo":"pl_futuro"}';
  await editar(env, '1', { preco_alvo: '45,50', alvo_explicacao: null, tipo: 'acao' });
  assert.ok(linhas[0].alvo_auto, 'sem mudança no alvo, o automático continua');
  await editar(env, '1', { preco_alvo: '1.620', alvo_explicacao: 'meu', tipo: 'acao' });
  assert.strictEqual(linhas[0].preco_alvo, 1620); assert.strictEqual(linhas[0].alvo_auto, null);
  assert.strictEqual((await editar(env, '9', { preco_alvo: '1' }))[0], 404);
});
