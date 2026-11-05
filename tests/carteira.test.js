const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Modelo = require('../public/assets/js/carteira-modelo.js');
const Motor = require('../public/assets/js/carteira-motor.js');
const Cripto = require('../public/assets/js/carteira-cripto.js');

const raiz = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(raiz, 'public/data/mercado.json')));
// corta em out/2026 para o teste não depender dos meses novos
const S0 = JSON.parse(fs.readFileSync(path.join(raiz, 'public/data/simulador.json')));
const NC = S0.months.indexOf('2026-10') + 1;
const S = Object.fromEntries(Object.entries(S0).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, NC) : v]));
const info = Object.fromEntries(M.ativos.map((a) => [a.id, a]));
const fxr = S.fx;

test('CSV: lê vírgula, ponto e vírgula, decimal brasileiro e categorias por nome', () => {
  const t = 'Código;Nome;Categoria;Quantidade;Valor;Moeda\nITUB3;Itaú;;1.000;;\n;Tesouro Selic;Renda fixa;;250.000,50;BRL\nXYZ9;Ação X;ações;10;;\n';
  const { ativos, avisos } = Modelo.lerCSV(t, info);
  assert.strictEqual(ativos.length, 3);
  assert.deepStrictEqual([ativos[0].codigo, ativos[0].categoria, ativos[0].quantidade], ['ITUB3', 'rvbr', 1000]);
  assert.strictEqual(ativos[1].valor, 250000.5);
  assert.strictEqual(ativos[1].categoria, 'rfbr');
  assert.ok(avisos.some((a) => a.includes('XYZ9')));
});

test('CSV: ida e volta', () => {
  const { ativos } = Modelo.lerCSV(Modelo.MODELO_CSV, info);
  const de_novo = Modelo.lerCSV(Modelo.escreverCSV(ativos), info).ativos;
  assert.deepStrictEqual(de_novo, ativos);
});

test('valoração e pesos por ativo', () => {
  const atuais = Modelo.precosAtuais(M);
  const c = { ...Modelo.novaCarteira(), modo: 'ativos', ativos: Modelo.lerCSV(Modelo.MODELO_CSV, info).ativos };
  const { pesos, total, linhas } = Modelo.pesosPorCategoria(c, atuais);
  assert.ok(total > 430000);
  assert.ok(Math.abs(Object.values(pesos).reduce((s, x) => s + x, 0) - 1) < 1e-9);
  const itub = linhas.find((l) => l.codigo === 'ITUB3');
  assert.ok(Math.abs(itub.valorBRL - 1000 * atuais.precos.ITUB3.brl) < 1e-6);
});

test('motor reproduz o simulador (carteira D: 7,2% de volatilidade em reais)', () => {
  const D = { rfbr: 30, rfex: 22.55, ouro: 10, alt: 7.45, rvex: 20, rvbr: 10 };
  const c = { ...Modelo.novaCarteira(), modo: 'categorias', categorias: D };
  const comp = Motor.componentes(c, S, {}, Modelo, Modelo.precosAtuais(M));
  const rr = Motor.retornosCarteira(comp, S.months.length);
  const m = Motor.metricas(rr, fxr, S.months);
  assert.strictEqual((m.vol * 100).toFixed(1), '7.2');
});

test('modo por ativo usa a série do ativo e cai para a categoria antes da estreia', () => {
  const ret = Motor.retornosAtivos(M, S.months);
  const i = S.months.indexOf('2015-11'), j = S.months.indexOf('2016-01');
  assert.strictEqual(ret.DIVO11[i], null);
  assert.ok(ret.DIVO11[j] != null);
  const c = { ...Modelo.novaCarteira(), modo: 'ativos', ativos: [{ codigo: 'DIVO11', categoria: 'rvbr', quantidade: 100, valor: null, moeda: 'BRL' }] };
  const comp = Motor.componentes(c, S, ret, Modelo, Modelo.precosAtuais(M));
  const rr = Motor.retornosCarteira(comp, S.months.length);
  assert.strictEqual(rr[i], S.rvbr[i]);
  assert.strictEqual(rr[j], ret.DIVO11[j]);
});

test('backup com senha: ida e volta e senha errada', async () => {
  const cs = [Modelo.novaCarteira('Teste')];
  const txt = await Cripto.exportar(cs, 'senha forte');
  assert.ok(!txt.includes('Teste'));
  assert.deepStrictEqual(await Cripto.importar(txt, 'senha forte'), cs);
  await assert.rejects(() => Cripto.importar(txt, 'errada'), /Senha errada/);
  assert.deepStrictEqual(await Cripto.importar(await Cripto.exportar(cs), null), cs);
});

test('restaurar backup substitui só a carteira de exemplo intocada', () => {
  const ex = Modelo.novaCarteira(), b = { ...Modelo.novaCarteira('Do backup'), intocada: undefined };
  assert.deepStrictEqual(Modelo.idsParaSubstituir([ex], [b]), [ex.id]);
  const editada = { ...ex }; delete editada.intocada;
  assert.deepStrictEqual(Modelo.idsParaSubstituir([editada], [b]), []);
  assert.deepStrictEqual(Modelo.idsParaSubstituir([ex, b], [b]), []);
  assert.deepStrictEqual(Modelo.idsParaSubstituir([ex], [ex]), []);
  assert.deepStrictEqual(Modelo.idsParaSubstituir([ex], []), []);
});

test('validação da linha e ordenação por valor', () => {
  const atuais = Modelo.precosAtuais(M);
  assert.deepStrictEqual(Modelo.problemasLinha({ codigo: 'ITUB3', quantidade: null, valor: null }, info), ['Informe a quantidade ou o valor.']);
  assert.ok(Modelo.problemasLinha({ codigo: 'XYZ9', quantidade: 10, valor: null }, info)[0].includes('não está na base'));
  assert.ok(Modelo.problemasLinha({ codigo: 'ITUB3', quantidade: 10, valor: 500 }, info)[0].includes('prioridade'));
  assert.deepStrictEqual(Modelo.problemasLinha({ codigo: 'ITUB3', quantidade: 10, valor: null }, info), []);
  const l = [{ codigo: 'A', valor: 10, moeda: 'BRL' }, { codigo: 'B', valor: null, quantidade: null }, { codigo: 'C', valor: 50, moeda: 'BRL' }];
  assert.deepStrictEqual(Modelo.ordenarPorValor(l, atuais).map((x) => x.codigo), ['C', 'A', 'B']);
});

test('exemplos da carteira são os mesmos do simulador', () => {
  const sim = fs.readFileSync(path.join(raiz, 'public/simulador/app.js'), 'utf8');
  for (const [nome, chave] of [['Conservadora', 'cons'], ['Moderada', 'mod'], ['Arrojada', 'arr']]) {
    const m = sim.match(new RegExp(chave + ':\\{([^}]+)\\}'))[1];
    const w = Object.fromEntries(m.split(',').map((x) => x.split(':').map((y) => y.trim())).map(([k, v]) => [k, +v]));
    assert.deepStrictEqual(w, Modelo.EXEMPLOS[nome], nome);
  }
});

test('catálogo: preço atual, categoria padrão e CSV reconhecem os ativos', () => {
  const CAT = JSON.parse(fs.readFileSync(path.join(raiz, 'public/data/catalogo.json')));
  const atuais = Modelo.precosAtuais(M, CAT);
  const petr = CAT.ativos.find((a) => a.id === 'PETR4'), aapl = CAT.ativos.find((a) => a.id === 'AAPL'), tlt = CAT.ativos.find((a) => a.id === 'TLT');
  assert.strictEqual(atuais.precos.PETR4.brl, petr.preco);
  assert.ok(Math.abs(atuais.precos.AAPL.brl - aapl.preco * atuais.fx) < 1e-9);
  assert.strictEqual(Modelo.categoriaPadrao(tlt), 'rfex');
  assert.strictEqual(Modelo.categoriaPadrao(CAT.ativos.find((a) => a.id === 'GOLD11')), 'ouro');
  const infoTudo = Object.fromEntries([...CAT.ativos, ...M.ativos].map((a) => [a.id, a]));
  const { ativos, avisos } = Modelo.lerCSV('codigo,quantidade\nPETR4,100\nAAPL,10\nTLT,5\n', infoTudo);
  assert.deepStrictEqual(ativos.map((a) => a.categoria), ['rvbr', 'rvex', 'rfex']);
  assert.deepStrictEqual(ativos.map((a) => a.moeda), ['BRL', 'USD', 'USD']);
  assert.deepStrictEqual(avisos, []);
  // catálogo de outro mês é ignorado (preço velho não entra)
  assert.strictEqual(Modelo.precosAtuais(M, { ...CAT, ultimo_mes: '1999-01' }).precos.PETR4, undefined);
});

test('bitcoin: categoria própria; antes de out/2014 a fatia rende o CDI, depois o bitcoin', () => {
  assert.strictEqual(Modelo.categoriaPadrao(info.BTC), 'btc');
  assert.strictEqual(Modelo.categoriaDe('Cripto'), 'btc');
  const i0 = S.btc.findIndex((x) => x !== null);
  assert.strictEqual(S.months[i0], '2014-10');
  const cat = Motor.serieCategoria(S, 'btc');
  assert.strictEqual(cat[i0 - 1], S.rfbr[i0 - 1]);
  assert.strictEqual(cat[i0], S.btc[i0]);
  // por ativo: BTC usa a própria série só a partir da série da categoria
  const atuais = Modelo.precosAtuais(M);
  const c = { modo: 'ativos', ativos: [{ codigo: 'BTC', quantidade: 1, categoria: 'btc', moeda: 'USD' }] };
  const comp = Motor.componentes(c, S, Motor.retornosAtivos(M, S.months), Modelo, atuais);
  const rr = Motor.retornosCarteira(comp, S.months.length);
  assert.strictEqual(rr[S.months.indexOf('2012-03')], S.rfbr[S.months.indexOf('2012-03')]);
  assert.ok(rr.every((x) => Number.isFinite(x)));
});
