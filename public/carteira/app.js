/* Página Minha carteira. Tudo fica no navegador: IndexedDB para guardar,
   arquivos locais para importar e exportar. Nenhuma chamada de rede além de
   /data/*.json (preços públicos). */
(async function () {
  'use strict';
  const Mod = window.CarteiraModelo, Mot = window.CarteiraMotor, Arm = window.CarteiraArmazenamento, Cri = window.CarteiraCripto;
  const $ = (id) => document.getElementById(id);
  const fmt = (x, d = 0) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (x) => 'R$ ' + fmt(x, 0);
  const pct = (x, d = 1) => (x == null ? '—' : fmt(x * 100, d) + '%');
  const sgn = (x, d = 1) => (x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x * 100), d) + '%');
  const MN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mes = (m) => MN[+m.slice(5) - 1] + '/' + m.slice(0, 4);

  let MERC, SIM;
  try {
    [MERC, SIM] = await Promise.all([Dados.buscarJSON('/data/mercado.json'), Dados.buscarJSON('/data/simulador.json')]);
  } catch (e) {
    $('atualizacao').textContent = 'Não foi possível carregar os preços agora. Suas carteiras continuam salvas; tente de novo em alguns minutos.';
    $('atualizacao').className = 'erro-carga';
    return;
  }
  const atuais = Mod.precosAtuais(MERC);
  const info = Object.fromEntries(MERC.ativos.map((a) => [a.id, a]));
  const retAtivos = Mot.retornosAtivos(MERC, SIM.months);
  $('atualizacao').textContent = 'Preços até ' + new Date(MERC.data_ref + 'T12:00:00').toLocaleDateString('pt-BR') + (MERC.parcial ? ' (mês parcial)' : '') + '. Dólar a R$ ' + fmt(atuais.fx, 2) + '.';
  const dl = $('conhecidos');
  MERC.ativos.forEach((a) => { const o = document.createElement('option'); o.value = a.id; o.label = a.nome; dl.appendChild(o); });

  Arm.pedirPersistencia();
  let carteiras = await Arm.listar();
  if (!carteiras.length) carteiras = [await Arm.salvar(Mod.novaCarteira())];
  carteiras.sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
  let atual = carteiras[0];

  /* ---------- salvar com atraso (evita gravar a cada tecla) */
  let timer = null;
  function mudou() {
    $('status').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      atual = await Arm.salvar(atual);
      carteiras = carteiras.map((c) => (c.id === atual.id ? atual : c));
      $('status').textContent = 'Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
    }, 400);
    analisar();
  }

  /* ---------- seletor de carteiras */
  function preencherSeletor() {
    const s = $('sel'); s.replaceChildren();
    carteiras.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.nome; s.appendChild(o); });
    s.value = atual.id;
  }
  $('sel').addEventListener('change', () => { atual = carteiras.find((c) => c.id === $('sel').value); montar(); });
  $('nova').addEventListener('click', async () => { const c = await Arm.salvar(Mod.novaCarteira('Carteira ' + (carteiras.length + 1))); carteiras.unshift(c); atual = c; montar(); });
  $('duplicar').addEventListener('click', async () => { const c = await Arm.salvar({ ...structuredClone(atual), id: Mod.novaCarteira().id, nome: atual.nome + ' (cópia)' }); carteiras.unshift(c); atual = c; montar(); });
  $('renomear').addEventListener('click', () => { const n = prompt('Novo nome da carteira:', atual.nome); if (n && n.trim()) { atual.nome = n.trim().slice(0, 80); preencherSeletor(); mudou(); } });
  $('apagar').addEventListener('click', async () => {
    if (!confirm('Apagar "' + atual.nome + '" deste navegador? Não dá para desfazer.')) return;
    await Arm.apagar(atual.id);
    carteiras = carteiras.filter((c) => c.id !== atual.id);
    if (!carteiras.length) carteiras = [await Arm.salvar(Mod.novaCarteira())];
    atual = carteiras[0]; montar();
  });

  /* ---------- abas */
  function aba(modo) {
    atual.modo = modo;
    $('aba-categorias').setAttribute('aria-selected', String(modo === 'categorias'));
    $('aba-ativos').setAttribute('aria-selected', String(modo === 'ativos'));
    $('painel-categorias').hidden = modo !== 'categorias';
    $('painel-ativos').hidden = modo !== 'ativos';
  }
  $('aba-categorias').addEventListener('click', () => { aba('categorias'); mudou(); });
  $('aba-ativos').addEventListener('click', () => { aba('ativos'); mudou(); });

  /* ---------- modo categorias */
  function montarCategorias() {
    $('patrimonio').value = atual.patrimonio || 0;
    const box = $('linhas-cat'); box.replaceChildren();
    for (const c of Mod.CATEGORIAS) {
      const l = document.createElement('div'); l.className = 'linha-cat';
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = c.cor;
      const lab = document.createElement('label'); lab.htmlFor = 'cat-' + c.k; lab.textContent = c.nome;
      const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '0.5'; inp.id = 'cat-' + c.k; inp.value = atual.categorias[c.k] ?? 0;
      inp.addEventListener('input', () => { atual.categorias[c.k] = Math.max(0, parseFloat(inp.value) || 0); totalCat(); mudou(); });
      l.append(sw, lab, inp); box.appendChild(l);
    }
    totalCat();
  }
  function totalCat() { const t = Mod.CHAVES.reduce((s, k) => s + (+atual.categorias[k] || 0), 0); $('total-cat').textContent = 'Total informado: ' + fmt(t, 1) + '%' + (Math.abs(t - 100) > 0.05 ? ' (o cálculo usa a proporção entre as categorias)' : ''); }
  $('patrimonio').addEventListener('input', () => { atual.patrimonio = Math.max(0, parseFloat($('patrimonio').value) || 0); mudou(); });

  /* ---------- modo ativos */
  function celula(tr, el) { const td = document.createElement('td'); td.appendChild(el); tr.appendChild(td); return td; }
  function input(tipo, valor, aoMudar, attrs) { const i = document.createElement('input'); i.type = tipo; if (valor != null) i.value = valor; for (const [k, v] of Object.entries(attrs || {})) i.setAttribute(k, v); i.addEventListener(tipo === 'text' && attrs && attrs.list ? 'change' : 'input', () => aoMudar(i.value)); return i; }
  function montarAtivos() {
    const tb = $('corpo'); tb.replaceChildren();
    const linhas = Mod.valorar(atual.ativos, atuais);
    atual.ativos.forEach((a, i) => {
      const tr = document.createElement('tr');
      celula(tr, input('text', a.codigo, (v) => { a.codigo = v.toUpperCase().trim(); const inf = info[a.codigo]; if (inf) { a.nome = a.nome || inf.nome; a.categoria = Mod.categoriaPadrao(inf); a.moeda = inf.moeda; } montarAtivos(); mudou(); }, { list: 'conhecidos', size: 7, 'aria-label': 'Código' }));
      celula(tr, input('text', a.nome, (v) => { a.nome = v.slice(0, 80); mudou(); }, { 'aria-label': 'Nome' }));
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Categoria');
      Mod.CATEGORIAS.forEach((c) => { const o = document.createElement('option'); o.value = c.k; o.textContent = c.nome; sel.appendChild(o); });
      sel.value = a.categoria; sel.addEventListener('change', () => { a.categoria = sel.value; mudou(); }); celula(tr, sel);
      celula(tr, input('number', a.quantidade, (v) => { a.quantidade = v === '' ? null : +v; atualizarValor(); mudou(); }, { step: 'any', min: '0', 'aria-label': 'Quantidade' }));
      celula(tr, input('number', a.valor, (v) => { a.valor = v === '' ? null : +v; atualizarValor(); mudou(); }, { step: 'any', min: '0', 'aria-label': 'Valor' }));
      const m = document.createElement('select'); m.setAttribute('aria-label', 'Moeda'); ['BRL', 'USD'].forEach((x) => { const o = document.createElement('option'); o.value = x; o.textContent = x; m.appendChild(o); });
      m.value = a.moeda || 'BRL'; m.addEventListener('change', () => { a.moeda = m.value; atualizarValor(); mudou(); }); celula(tr, m);
      const v = document.createElement('span'); const tdv = celula(tr, v); tdv.className = 'num';
      const atualizarValor = () => { const l = Mod.valorar([a], atuais)[0]; v.textContent = l.valorBRL != null ? brl(l.valorBRL) : '—'; v.title = l.origem; };
      v.textContent = linhas[i].valorBRL != null ? brl(linhas[i].valorBRL) : '—'; v.title = linhas[i].origem;
      const rem = document.createElement('button'); rem.className = 'rem'; rem.textContent = '×'; rem.setAttribute('aria-label', 'Remover linha');
      rem.addEventListener('click', () => { atual.ativos.splice(i, 1); montarAtivos(); mudou(); }); celula(tr, rem);
      tb.appendChild(tr);
    });
  }
  $('add').addEventListener('click', () => { atual.ativos.push({ codigo: '', nome: '', categoria: 'rvbr', quantidade: null, valor: null, moeda: 'BRL' }); montarAtivos(); mudou(); });
  $('csv').addEventListener('change', async () => {
    const f = $('csv').files[0]; if (!f) return;
    const { ativos, avisos } = Mod.lerCSV(await f.text(), info);
    const lista = $('avisos'); lista.replaceChildren();
    avisos.forEach((a) => { const li = document.createElement('li'); li.textContent = a; lista.appendChild(li); });
    if (ativos.length && (!atual.ativos.length || confirm('Substituir as ' + atual.ativos.length + ' posições atuais pelas ' + ativos.length + ' do arquivo? (Cancelar = juntar)'))) atual.ativos = ativos;
    else atual.ativos = atual.ativos.concat(ativos);
    $('csv').value = '';
    montarAtivos(); mudou();
  });
  const baixar = (nome, texto, tipo) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('modelo').addEventListener('click', () => baixar('modelo-carteira.csv', Mod.MODELO_CSV, 'text/csv'));
  $('exportar-csv').addEventListener('click', () => baixar((atual.nome || 'carteira') + '.csv', Mod.escreverCSV(atual.ativos), 'text/csv'));

  /* ---------- backup */
  $('exportar').addEventListener('click', async () => {
    const txt = await Cri.exportar(await Arm.listar(), $('senha').value || null);
    baixar('backup-carteiras-' + new Date().toISOString().slice(0, 10) + '.json', txt, 'application/json');
    $('msg-backup').textContent = $('senha').value ? 'Backup cifrado baixado. Guarde a senha: sem ela, o arquivo não abre.' : 'Backup baixado sem senha. Quem tiver o arquivo consegue ler.';
  });
  $('importar').addEventListener('change', async () => {
    const f = $('importar').files[0]; if (!f) return;
    try {
      const lista = await Cri.importar(await f.text(), $('senha').value || null);
      for (const c of lista) await Arm.salvar(c);
      carteiras = (await Arm.listar()).sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
      atual = carteiras[0]; montar();
      $('msg-backup').textContent = lista.length + ' carteira(s) restaurada(s).';
    } catch (e) { $('msg-backup').textContent = e.message; }
    $('importar').value = '';
  });

  /* ---------- análise */
  let pizza = null;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function tile(k, v, c, cls) { const d = document.createElement('div'); d.className = 'tile'; const a = document.createElement('div'); a.className = 'k'; a.textContent = k; const b = document.createElement('div'); b.className = 'v' + (cls ? ' ' + cls : ''); b.textContent = v; const e = document.createElement('div'); e.className = 'c'; e.textContent = c || ''; d.append(a, b, e); return d; }
  function analisar() {
    const { pesos, total, linhas } = Mod.pesosPorCategoria(atual, atuais);
    $('tot-brl').textContent = brl(total);
    $('tot-usd').textContent = 'US$ ' + fmt(total / atuais.fx, 0);
    const dados = Mod.CATEGORIAS.map((c) => pesos[c.k] * 100);
    if (window.Chart) {
      if (!pizza) pizza = new Chart($('pizza'), { type: 'doughnut', data: { labels: Mod.CATEGORIAS.map((c) => c.nome), datasets: [{ data: dados, backgroundColor: Mod.CATEGORIAS.map((c) => c.cor), borderColor: css('--color-panel'), borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '58%', animation: { duration: 150 }, plugins: { legend: { position: 'right', labels: { color: css('--color-fg-muted'), boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + fmt(c.parsed, 1) + '%' } } } } });
      else { pizza.data.datasets[0].data = dados; pizza.update(); }
    }
    const br = Mod.CATEGORIAS.filter((c) => c.brasil).reduce((s, c) => s + pesos[c.k], 0);
    $('sb-br').style.cssText = 'width:' + br * 100 + '%;background:#2E6BB5'; $('sb-ex').style.cssText = 'width:' + (1 - br) * 100 + '%;background:#E07B39';
    $('sl-br').textContent = 'Brasil ' + pct(br, 0); $('sl-ex').textContent = 'Exterior (inclui ouro) ' + pct(1 - br, 0);

    const tiles = $('tiles'); tiles.replaceChildren();
    const comp = Mot.componentes(atual, SIM, retAtivos, Mod, atuais);
    if (!comp.length) { tiles.appendChild(tile('Sem dados', '—', 'Preencha a carteira para ver o risco.')); }
    else {
      const rr = Mot.retornosCarteira(comp, SIM.months.length);
      const m = Mot.metricas(rr, SIM.fx, SIM.months);
      const alm = ['2006-10', ...SIM.months];
      tiles.append(
        tile('Volatilidade anual em reais', pct(m.vol), m.vol < 0.04 ? 'Conservadora' : m.vol < 0.08 ? 'Moderada' : m.vol < 0.12 ? 'Arrojada' : 'Agressiva'),
        tile('Volatilidade em dólar', pct(m.volUSD), ''),
        tile('Retorno anual (reais)', pct(m.cagr), 'R$ 100 → R$ ' + fmt(m.mult * 100, 0)),
        tile('Maior queda em reais', sgn(m.queda.m), m.queda.m < 0 ? mes(alm[m.queda.de]) + ' a ' + mes(alm[m.queda.ate]) + (total ? ' · ' + brl(-m.queda.m * total) : '') : '', 'neg'),
        tile('Pior janela de 12 meses', sgn(m.pior12m), 'até ' + mes(alm[m.pior12mAte]), m.pior12m < 0 ? 'neg' : ''),
        tile('Meses negativos', pct(m.mesesNegativos, 0), 'de ' + SIM.months.length + ' meses'));
      $('nota-metodo').textContent = 'Simulação de ' + mes(SIM.months[0]) + ' a ' + mes(SIM.months[SIM.months.length - 1]) + ', com rebalanceamento mensal. ' +
        (atual.modo === 'ativos' ? 'Ativos da base usam a própria série; os demais, e os meses antes da estreia de cada ativo, usam o substituto da categoria.' : 'Cada categoria usa um substituto (veja o simulador).');
      $('abrir-sim').href = '/simulador/#pesos=' + Mod.CHAVES.map((k) => k + ':' + (Math.round(pesos[k] * 1000) / 10)).join(',') + '&pat=' + (Math.round(total / 1e4) / 100);
    }
    // desempenho por ativo conhecido
    const card = $('posicoes-card'), corpo = $('corpo-pos'); corpo.replaceChildren();
    const conhecidas = atual.modo === 'ativos' && linhas ? linhas.filter((l) => info[l.codigo] && l.valorBRL > 0) : [];
    card.hidden = !conhecidas.length;
    for (const l of conhecidas) {
      const a = info[l.codigo], fx = MERC.usdbrl, n = a.precos.length;
      const emBRL = (k) => { const i = MERC.meses.length - 1 - k; const p = a.precos[n - 1 - k]; return p == null ? null : (a.moeda === 'BRL' ? p : p * fx[i]); };
      const r = (k) => (n > k ? emBRL(0) / emBRL(k) - 1 : null);
      const tr = document.createElement('tr');
      [[l.codigo], [a.nome], [brl(l.valorBRL), 'num'], [pct(l.valorBRL / total), 'num'], [sgn(r(12)), 'num'], [sgn(r(60)), 'num']].forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; if (c) td.className = c; tr.appendChild(td); });
      corpo.appendChild(tr);
    }
  }

  function montar() { preencherSeletor(); aba(atual.modo || 'categorias'); montarCategorias(); montarAtivos(); $('avisos').replaceChildren(); analisar(); }
  montar();
})();
