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

  let MERC, SIM, CAT = null;
  try {
    [MERC, SIM, CAT] = await Promise.all([Dados.buscarJSON('/data/mercado.json'), Dados.buscarJSON('/data/simulador.json'), Dados.buscarJSON('/data/catalogo.json').catch(() => null)]);
    if (CAT && CAT.ultimo_mes !== MERC.ultimo_mes) CAT = null;
  } catch (e) {
    $('atualizacao').textContent = 'Não foi possível carregar os preços agora. Suas carteiras continuam salvas; tente de novo em alguns minutos.';
    $('atualizacao').className = 'erro-carga';
    return;
  }
  const atuais = Mod.precosAtuais(MERC, CAT);
  const info = Object.fromEntries([...(CAT ? CAT.ativos : []), ...MERC.ativos].map((a) => [a.id, a]));
  let retAtivos = Mot.retornosAtivos(MERC, SIM.months);
  /* Série de preços dos ativos do catálogo que estão nas carteiras: carregada sob demanda. */
  const series = Object.fromEntries(MERC.ativos.map((a) => [a.id, a]));
  async function carregarSeries(codigos) {
    const faltam = [...new Set(codigos)].filter((c) => c && !series[c] && CAT && CAT.ativos.some((a) => a.id === c));
    if (!faltam.length) return false;
    const novas = await Promise.all(faltam.map((c) => Dados.buscarJSON('/data/catalogo/' + encodeURIComponent(c) + '.json').catch(() => null)));
    novas.filter((x) => x && x.fim === MERC.ultimo_mes).forEach((x) => { series[x.id] = { ...info[x.id], inicio: x.inicio, precos: x.precos }; });
    retAtivos = Mot.retornosAtivos({ ...MERC, ativos: Object.values(series) }, SIM.months);
    return true;
  }
  $('atualizacao').textContent = 'Preços até ' + new Date(MERC.data_ref + 'T12:00:00').toLocaleDateString('pt-BR') + (MERC.parcial ? ' (mês parcial)' : '') + '. Dólar a R$ ' + fmt(atuais.fx, 2) + '.';
  const dl = $('conhecidos');
  Object.values(info).forEach((a) => { const o = document.createElement('option'); o.value = a.id; o.label = a.nome; o.textContent = a.nome; dl.appendChild(o); });

  Arm.pedirPersistencia();
  let carteiras = await Arm.listar();
  await carregarSeries(carteiras.flatMap((c) => (c.ativos || []).map((a) => a.codigo)));
  if (!carteiras.length) carteiras = [await Arm.salvar(Mod.novaCarteira())];
  carteiras.sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
  let atual = carteiras[0];

  /* ---------- salvar com atraso (evita gravar a cada tecla) */
  let timer = null;
  let sujo = false;
  function mudou(edicao = true) {
    if (edicao) { delete atual.intocada; if (Arm.soArquivo) { sujo = true; mostrarGuarda(); } }
    $('status').textContent = 'Salvando…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      atual = await Arm.salvar(atual);
      carteiras = carteiras.map((c) => (c.id === atual.id ? atual : c));
      $('status').textContent = Arm.soArquivo ? '' : 'Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
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
  $('nova').addEventListener('click', async () => { const c = await Arm.salvar({ ...Mod.novaCarteira('Carteira ' + (carteiras.length + 1)), intocada: undefined }); carteiras.unshift(c); atual = c; montar(); });
  $('duplicar').addEventListener('click', async () => { const c = await Arm.salvar({ ...structuredClone(atual), id: Mod.novaCarteira().id, nome: atual.nome + ' (cópia)', intocada: undefined }); carteiras.unshift(c); atual = c; montar(); });
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
    for (const [id, m] of [['aba-categorias', 'categorias'], ['aba-ativos', 'ativos']]) {
      $(id).setAttribute('aria-selected', String(modo === m));
      $(id).tabIndex = modo === m ? 0 : -1;
    }
    $('painel-categorias').hidden = modo !== 'categorias';
    $('painel-ativos').hidden = modo !== 'ativos';
    document.querySelector('.grade').classList.toggle('modo-ativos', modo === 'ativos');
  }
  $('aba-categorias').addEventListener('click', () => { aba('categorias'); mudou(false); });
  $('aba-ativos').addEventListener('click', () => { aba('ativos'); mudou(false); });
  // setas, Home e End trocam de aba (padrão WAI-ARIA para abas)
  document.querySelector('.abas').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const alvo = e.key === 'Home' ? 'aba-categorias' : e.key === 'End' ? 'aba-ativos' : (atual.modo === 'ativos' ? 'aba-categorias' : 'aba-ativos');
    $(alvo).click(); $(alvo).focus();
  });

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
  const ROTULOS = ['Código', 'Nome', 'Categoria', 'Quantidade', 'Valor', 'Moeda', 'Em R$', ''];
  function celula(tr, el) { const td = document.createElement('td'); td.appendChild(el); td.dataset.rotulo = ROTULOS[tr.children.length] || ''; tr.appendChild(td); return td; }
  function input(tipo, valor, aoMudar, attrs) { const i = document.createElement('input'); i.type = tipo; if (valor != null) i.value = valor; for (const [k, v] of Object.entries(attrs || {})) i.setAttribute(k, v); i.addEventListener(tipo === 'text' && attrs && attrs.list ? 'change' : 'input', () => aoMudar(i.value)); return i; }
  function montarAtivos() {
    const tb = $('corpo'); tb.replaceChildren();
    atual.ativos.forEach((a, i) => {
      const tr = document.createElement('tr');
      const tdc = celula(tr, input('text', a.codigo, (v) => { a.codigo = v.toUpperCase().trim(); const inf = info[a.codigo]; if (inf) { a.nome = a.nome || inf.nome; a.categoria = Mod.categoriaPadrao(inf); a.moeda = inf.moeda; } montarAtivos(); mudou(); carregarSeries([a.codigo]).then((n) => { if (n) analisar(); }); }, { list: 'conhecidos', size: 9, 'aria-label': 'Código', autocomplete: 'off' }));
      tdc.className = 'cod';
      celula(tr, input('text', a.nome, (v) => { a.nome = v.slice(0, 80); mudou(); }, { 'aria-label': 'Nome' }));
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Categoria');
      Mod.CATEGORIAS.forEach((c) => { const o = document.createElement('option'); o.value = c.k; o.textContent = c.nome; sel.appendChild(o); });
      sel.value = a.categoria; sel.addEventListener('change', () => { a.categoria = sel.value; mudou(); }); celula(tr, sel);
      celula(tr, input('number', a.quantidade, (v) => { a.quantidade = v === '' ? null : +v; atualizarLinha(); mudou(); }, { step: 'any', min: '0', 'aria-label': 'Quantidade', inputmode: 'decimal' }));
      celula(tr, input('number', a.valor, (v) => { a.valor = v === '' ? null : +v; atualizarLinha(); mudou(); }, { step: 'any', min: '0', 'aria-label': 'Valor', inputmode: 'decimal' }));
      const m = document.createElement('select'); m.setAttribute('aria-label', 'Moeda'); ['BRL', 'USD'].forEach((x) => { const o = document.createElement('option'); o.value = x; o.textContent = x; m.appendChild(o); });
      m.value = a.moeda || 'BRL'; m.addEventListener('change', () => { a.moeda = m.value; atualizarLinha(); mudou(); }); celula(tr, m);
      const v = document.createElement('span'), dica = document.createElement('span'); dica.className = 'dica';
      const tdv = celula(tr, v); tdv.className = 'num'; tdv.appendChild(dica);
      const atualizarLinha = () => {
        const l = Mod.valorar([a], atuais)[0];
        v.textContent = l.valorBRL != null ? brl(l.valorBRL) : '—'; v.title = l.origem;
        const p = Mod.problemasLinha(a, info);
        dica.textContent = p.join(' ');
        tr.classList.toggle('alerta', p.length > 0 && !(p.length === 1 && p[0].startsWith('Valor informado')));
        totalEditor();
      };
      const rem = document.createElement('button'); rem.className = 'rem'; rem.textContent = '×'; rem.setAttribute('aria-label', 'Remover linha ' + (a.codigo || a.nome || i + 1));
      rem.addEventListener('click', () => { atual.ativos.splice(i, 1); montarAtivos(); mudou(); }); celula(tr, rem).className = 'acao';
      tb.appendChild(tr);
      atualizarLinha();
    });
    totalEditor();
  }
  function totalEditor() {
    const t = Mod.valorar(atual.ativos, atuais).reduce((s, l) => s + (l.valorBRL || 0), 0);
    $('total-editor').textContent = brl(t);
  }
  $('ordenar').addEventListener('click', () => { atual.ativos = Mod.ordenarPorValor(atual.ativos, atuais); montarAtivos(); mudou(); });
  $('add').addEventListener('click', () => { atual.ativos.push({ codigo: '', nome: '', categoria: 'rvbr', quantidade: null, valor: null, moeda: 'BRL' }); montarAtivos(); mudou(); });
  $('csv').addEventListener('change', async () => {
    const f = $('csv').files[0]; if (!f) return;
    const { ativos, avisos } = Mod.lerCSV(await f.text(), info);
    await carregarSeries(ativos.map((x) => x.codigo));
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
  const CHAVE_BACKUP = 'analises-carteira:ultimoBackup';
  const lerUltimoBackup = () => { try { return localStorage.getItem(CHAVE_BACKUP); } catch (e) { return null; } };
  async function exportar() {
    const txt = await Cri.exportar(await Arm.listar(), $('senha').value || null);
    baixar('carteiras-' + new Date().toISOString().slice(0, 10) + '.json', txt, 'application/json');
    $('msg-backup').textContent = $('senha').value ? 'Arquivo cifrado baixado. Guarde a senha: sem ela, o arquivo não abre.' : 'Arquivo baixado sem senha. Quem tiver o arquivo consegue ler.';
    if (Arm.soArquivo) sujo = false;
    else { try { localStorage.setItem(CHAVE_BACKUP, new Date().toISOString()); } catch (e) { /* sem localStorage */ } }
    mostrarGuarda();
  }
  $('exportar').addEventListener('click', exportar);
  $('baixar-arquivo').addEventListener('click', exportar);

  /* ---------- onde guardar: neste navegador ou só no arquivo */
  function mostrarGuarda() {
    const arq = Arm.soArquivo;
    $('guarda-arquivo').checked = arq; $('guarda-navegador').checked = !arq;
    $('arquivo-barra').hidden = !arq;
    $('status-arquivo').textContent = arq ? (sujo ? 'Há mudanças que ainda não estão no arquivo. Baixe antes de sair.' : 'Nada está guardado neste aparelho.') : '';
    $('status-arquivo').classList.toggle('sujo', arq && sujo);
    const ult = lerUltimoBackup(), l = $('lembrete-backup');
    if (arq) { l.hidden = true; $('ultimo-backup').textContent = ''; return; }
    const editou = carteiras.some((c) => !c.intocada);
    const dias = ult ? (Date.now() - Date.parse(ult)) / 864e5 : null;
    $('ultimo-backup').textContent = ult ? 'Último backup baixado neste navegador: ' + new Date(ult).toLocaleDateString('pt-BR') + '.' : 'Você ainda não baixou um backup neste navegador.';
    l.hidden = !(editou && (dias == null || dias > 30));
    l.textContent = dias == null ? 'Lembrete: baixe um backup. Se o navegador apagar os dados, é ele que traz sua carteira de volta.' : 'Seu último backup tem mais de 30 dias. Baixe um novo.';
  }
  for (const r of document.querySelectorAll('input[name=guarda]')) r.addEventListener('change', async () => {
    if (r.value === 'arquivo' && r.checked) { await Arm.definirSoArquivo(true); sujo = true; }
    if (r.value === 'navegador' && r.checked) { await Arm.definirSoArquivo(false); sujo = false; carteiras = await Arm.listar(); }
    mostrarGuarda();
  });
  window.addEventListener('beforeunload', (e) => { if (Arm.soArquivo && sujo) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- instalar na Tela de Início */
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!instalado && ios) { $('instalar').hidden = false; $('instalar-texto').textContent += ' No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".'; }
  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; $('instalar').hidden = false; $('instalar-btn').hidden = false; });
  $('instalar-btn').addEventListener('click', async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $('instalar').hidden = true; });
  window.addEventListener('appinstalled', () => { $('instalar').hidden = true; });

  $('importar').addEventListener('change', async () => {
    const f = $('importar').files[0]; if (!f) return;
    try {
      const lista = await Cri.importar(await f.text(), $('senha').value || null);
      for (const id of Mod.idsParaSubstituir(await Arm.listar(), lista)) await Arm.apagar(id);
      for (const c of lista) await Arm.salvar(c);
      carteiras = (await Arm.listar()).sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm));
      await carregarSeries(carteiras.flatMap((c) => (c.ativos || []).map((x) => x.codigo)));
      atual = carteiras[0]; sujo = false; montar();
      $('msg-backup').textContent = lista.length + ' carteira(s) restaurada(s).';
    } catch (e) { $('msg-backup').textContent = e.message; }
    $('importar').value = '';
  });

  /* ---------- análise */
  let pizza = null, gCresc = null, gQueda = null;
  const MOD = (() => {
    const c = { modo: 'categorias', categorias: Mod.EXEMPLOS.Moderada, patrimonio: 1 };
    return Mot.metricas(Mot.retornosCarteira(Mot.componentes(c, SIM, retAtivos, Mod, atuais), SIM.months.length), SIM.fx, SIM.months);
  })();
  const CDI = (() => { const idx = [1]; for (const r of SIM.rfbr) idx.push(idx[idx.length - 1] * (1 + r)); return idx; })();
  function comparar(m) {
    const meses = ['2006-10', ...SIM.months];
    const rot = meses.map(mes);
    const ticks = { color: css('--color-fg-muted'), font: { size: 11 }, autoSkip: false, maxRotation: 0, callback: (v, i) => (meses[i].endsWith('-01') && +meses[i].slice(0, 4) % 4 === 0 ? meses[i].slice(0, 4) : '') };
    const grade = css('--color-border-line'), acc = css('--color-accent'), mut = css('--color-fg-muted'), bad = css('--color-bad');
    const base = (fmtY, max) => ({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + fmtY(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks }, y: { max, grid: { color: grade }, border: { display: false }, ticks: { color: mut, font: { size: 11 }, callback: fmtY } } } });
    const serieC = m ? m.indice.map((v) => v * 100) : [], serieQ = m ? m.queda.serie.map((v) => v * 100) : [];
    if (!window.Chart) return;
    if (!gCresc) {
      gCresc = new Chart($('g-cresc'), { type: 'line', data: { labels: rot, datasets: [
        { label: 'Sua carteira', data: serieC, borderColor: acc, borderWidth: 2.2, pointRadius: 0 },
        { label: 'Moderada', data: MOD.indice.map((v) => v * 100), borderColor: '#8C8C8C', borderDash: [6, 4], borderWidth: 1.6, pointRadius: 0 },
        { label: 'CDI', data: CDI.map((v) => v * 100), borderColor: mut, borderDash: [2, 3], borderWidth: 1.6, pointRadius: 0 }] }, options: base((v) => 'R$ ' + fmt(v, 0)) });
      gQueda = new Chart($('g-queda'), { type: 'line', data: { labels: rot, datasets: [
        { label: 'Sua carteira', data: serieQ, borderColor: bad, backgroundColor: bad + '22', fill: 'origin', borderWidth: 1.8, pointRadius: 0 },
        { label: 'Moderada', data: MOD.queda.serie.map((v) => v * 100), borderColor: '#8C8C8C', borderDash: [6, 4], borderWidth: 1.4, pointRadius: 0 }] }, options: base((v) => fmt(v, 0) + '%', 0) });
    } else { gCresc.data.datasets[0].data = serieC; gQueda.data.datasets[0].data = serieQ; gCresc.update('none'); gQueda.update('none'); }
    const n = SIM.months.length, cdiA = Math.pow(CDI[n], 12 / n) - 1;
    $('resumo-comp').textContent = m ? 'Retorno anual: sua carteira ' + pct(m.cagr) + ', Moderada ' + pct(MOD.cagr) + ', CDI ' + pct(cdiA) + '. Maior queda: sua carteira ' + sgn(m.queda.m) + ', Moderada ' + sgn(MOD.queda.m) + '.' : 'Preencha a carteira para comparar.';
  }
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
    $('sl-br').textContent = 'Brasil ' + pct(br, 0); $('sl-ex').textContent = 'Exterior (inclui ouro e bitcoin) ' + pct(1 - br, 0);

    const tiles = $('tiles'); tiles.replaceChildren();
    const comp = Mot.componentes(atual, SIM, retAtivos, Mod, atuais);
    if (!comp.length) { tiles.appendChild(tile('Sem dados', '—', 'Preencha a carteira para ver o risco.')); comparar(null); }
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
      comparar(m);
      $('abrir-sim').href = '/simulador/#pesos=' + Mod.CHAVES.map((k) => k + ':' + (Math.round(pesos[k] * 1000) / 10)).join(',') + '&pat=' + (Math.round(total / 1e4) / 100);
    }
    // desempenho por ativo conhecido
    const card = $('posicoes-card'), corpo = $('corpo-pos'); corpo.replaceChildren();
    const conhecidas = atual.modo === 'ativos' && linhas ? linhas.filter((l) => series[l.codigo] && l.valorBRL > 0) : [];
    card.hidden = !conhecidas.length;
    for (const l of conhecidas) {
      const a = series[l.codigo], fx = MERC.usdbrl, n = a.precos.length;
      const emBRL = (k) => { const i = MERC.meses.length - 1 - k; const p = a.precos[n - 1 - k]; return p == null ? null : (a.moeda === 'BRL' ? p : p * fx[i]); };
      const r = (k) => (n > k ? emBRL(0) / emBRL(k) - 1 : null);
      const tr = document.createElement('tr');
      [[l.codigo], [a.nome], [brl(l.valorBRL), 'num'], [pct(l.valorBRL / total), 'num'], [sgn(r(12)), 'num'], [sgn(r(60)), 'num']].forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; if (c) td.className = c; tr.appendChild(td); });
      corpo.appendChild(tr);
    }
  }

  function montar() { mostrarGuarda(); preencherSeletor(); aba(atual.modo || 'categorias'); montarCategorias(); montarAtivos(); $('avisos').replaceChildren(); analisar(); }
  montar();
})();
