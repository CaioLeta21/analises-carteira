/* Página do comparador: lê /data/mercado.json, deriva as tabelas e desenha. */
(async function () {
'use strict';
const CA = window.CONFIG_ATIVOS;
let M, D, dash, CAT = null;
// ativos do catálogo que o usuário adicionou: guardados só neste navegador
const CHAVE_EXTRAS = 'analises-carteira:comparador';
const lerExtras = () => { try { return JSON.parse(localStorage.getItem(CHAVE_EXTRAS) || '[]').filter((x) => typeof x === 'string'); } catch (e) { return []; } };
const gravarExtras = (l) => { try { localStorage.setItem(CHAVE_EXTRAS, JSON.stringify(l)); } catch (e) { /* sem armazenamento: vale só nesta visita */ } };
let extras = lerExtras();
// radar (lista mandada pela carteira): os ativos dele que não estão no comparador entram desligados
let radarIds = [], radarSo = [];
try {
  let RADAR;
  [M, CAT, RADAR] = await Promise.all([Dados.buscarJSON('/data/mercado.json'), Dados.buscarJSON('/data/catalogo.json').catch(() => null), Dados.buscarJSON('/data/radar.json').catch(() => null)]);
  const doCatalogo = CAT && CAT.ultimo_mes === M.ultimo_mes ? Object.fromEntries(CAT.ativos.map((a) => [a.id, a])) : {};
  const naBase = (id) => M.ativos.some((a) => a.id === id);
  extras = extras.filter((id) => doCatalogo[id] && !naBase(id));
  radarIds = [...new Set(((RADAR && RADAR.itens) || []).map((i) => i.site_id).filter((id) => id && (naBase(id) || doCatalogo[id])))];
  radarSo = radarIds.filter((id) => !naBase(id) && !extras.includes(id));
  const pedir = extras.concat(radarSo);
  const series = await Promise.all(pedir.map((id) => Dados.buscarJSON('/data/catalogo/' + encodeURIComponent(id) + '.json').catch(() => null)));
  const okId = new Set(pedir.filter((id, i) => series[i] && series[i].fim === M.ultimo_mes));
  extras = extras.filter((id) => okId.has(id)); radarSo = radarSo.filter((id) => okId.has(id)); radarIds = radarIds.filter((id) => naBase(id) || okId.has(id));
  series.filter((x) => x && x.fim === M.ultimo_mes).forEach((x, i) => {
    const a = doCatalogo[x.id];
    M.ativos.push({ id: x.id, nome: a.nome, tipo: a.tipo, mercado: a.mercado, moeda: a.moeda, inicio: x.inicio, precos: x.precos });
    if (CA.corFixa[x.id] == null && CA.paleta[x.id] == null) CA.paleta[x.id] = i % 8;
  });
  CA.grupos.radar = radarIds;
  D = Dados.derivar(M, CA.ordem.concat(extras, radarSo));
  dash = window.dash = criarDash(D);
} catch (e) {
  document.getElementById('atualizacao').outerHTML = '<p class="erro-carga">Não foi possível carregar os dados agora. Tente de novo em alguns minutos.</p>';
  console.error(e);
  return;
}

const NOMES = Object.fromEntries(D.ids.map((id) => [id, D.info[id].nome]));
const DZ = window.DZ = {
  ORD: D.ids, NOMES, hl: null,
  cor: (t) => CA.corFixa[t] || dash.colors[CA.paleta[t] ?? 0],
};
DZ.swatch = (t) => { const c = DZ.cor(t), d = CA.traco[t]; if (!d) return c; const seg = d === '6 4' ? [4, 2] : [5, 2, 2, 2]; let x = 0; const st = seg.map((w, i) => { const r = (i % 2 ? 'transparent' : c) + ' ' + x + 'px ' + (x + w) + 'px'; x += w; return r; }); return 'repeating-linear-gradient(90deg,' + st.join(',') + ')'; };
// "fora" ausente do endereço = padrão (os ativos que só estão no radar começam desligados);
// "-" = nenhum desligado
const listaFora = (f) => (f.size ? [...f].join(',') : '-');
DZ.p = () => { const P = dash.params(); return { moeda: P.moeda || 'USD', escala: P.escala || 'lin', periodo: ({ '25a': 'ipo' })[P.periodo] || P.periodo || 'ipo', fora: P.fora == null ? new Set(radarSo) : new Set(String(P.fora).split(',').filter((t) => t && t !== '-')) }; };
DZ.vis = (t) => !DZ.p().fora.has(t);
DZ.rows = (id) => dash.data(id).data;
DZ.num = (x) => (x === '' || x == null || isNaN(Number(x))) ? null : Number(x);
DZ.dec = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
DZ.pct = (v) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + DZ.dec(Math.abs(v), 1) + '%';
DZ.mult = (v) => DZ.dec(v, v >= 1000 ? 0 : 1) + 'x';
DZ.mes = (m) => { const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return n[+m.slice(5) - 1] + '/' + m.slice(0, 4); };
DZ.sign = (el, v) => { el.classList.toggle('pos', v != null && v > 0); el.classList.toggle('neg', v != null && v < 0); };
DZ.measure = (svg, txt) => { const t = svg.append('text').attr('font-size', 12).text(txt); const w = t.node().getComputedTextLength(); t.remove(); return w; };
DZ.tip = (el) => { let t = el.querySelector('.tip'); if (!t) { t = document.createElement('div'); t.className = 'tip'; t.style.display = 'none'; el.appendChild(t); } return t; };
DZ.tipShow = (el, tip, x, y, head, lines) => {
  tip.replaceChildren();
  const h = document.createElement('div'); h.className = 'h'; h.textContent = head; tip.appendChild(h);
  lines.forEach((l) => { const r = document.createElement('div'); r.className = 'r'; if (l.c) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = l.c; r.appendChild(s); } const a = document.createElement('span'); a.textContent = l.n; const b = document.createElement('span'); b.textContent = l.v; r.append(a, b); tip.appendChild(r); });
  tip.style.display = 'block';
  const W = el.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 14; if (left + tw > W) left = x - tw - 14; if (left < 0) left = 0;
  let top = y - th / 2; if (top < 0) top = 0; if (top + th > el.clientHeight) top = Math.max(0, el.clientHeight - th);
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
};
const PER = Object.fromEntries(D.periodos.map((p) => [p.id, p]));
const SRC = { ipo: 'retornos_longo', '20a': 'retornos_20a', '15a': 'retornos_15a', divo: 'retornos_divo', '10a': 'retornos_10a', '5a': 'retornos_5a' };

// data de atualização
const dref = new Date(M.data_ref + 'T12:00:00');
document.getElementById('atualizacao').textContent = 'Dados até ' + dref.toLocaleDateString('pt-BR') + (M.parcial ? ' (mês de ' + DZ.mes(M.ultimo_mes) + ' ainda parcial)' : '') + '. Atualizado todo dia depois do fechamento.';
document.getElementById('th-ano').textContent = M.ultimo_mes.slice(0, 4);

// botões de ativos, gerados a partir da configuração
const chips = document.getElementById('chips');
for (const id of D.ids) {
  const b = document.createElement('button'); b.className = 'chip lx-leg'; b.dataset.t = id;
  const s = document.createElement('span'); s.className = 'sw lx-sw'; s.dataset.t = id;
  b.append(s, document.createTextNode(CA.rotulo[id] || (NOMES[id] + (extras.includes(id) || radarSo.includes(id) ? ' (' + id + ')' : ''))));
  chips.appendChild(b);
  if (extras.includes(id)) {
    const x = document.createElement('button'); x.className = 'rem-ext'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Tirar ' + NOMES[id] + ' do comparador');
    x.addEventListener('click', () => { gravarExtras(extras.filter((e) => e !== id)); location.reload(); });
    chips.appendChild(x);
  }
}

// adicionar ativo do catálogo
(function () {
  const lista = document.getElementById('lista-catalogo'), inp = document.getElementById('busca-ativo'), msg = document.getElementById('msg-ativo');
  if (!CAT) { document.querySelector('.adicionar').hidden = true; return; }
  for (const a of CAT.ativos) { if (D.info[a.id]) continue; const o = document.createElement('option'); o.value = a.id; o.label = a.nome; o.textContent = a.nome; lista.appendChild(o); }
  const achar = (t) => { const q = t.trim().toUpperCase(); if (!q) return null; return CAT.ativos.find((a) => a.id === q) || CAT.ativos.find((a) => a.nome.toUpperCase() === q) || (CAT.ativos.filter((a) => a.nome.toUpperCase().includes(q)).length === 1 ? CAT.ativos.find((a) => a.nome.toUpperCase().includes(q)) : null); };
  const adicionar = () => {
    const a = achar(inp.value);
    if (!a) { msg.textContent = 'Não achei esse ativo no catálogo. Escolha um da lista.'; return; }
    if (D.info[a.id]) { msg.textContent = a.nome + ' já está no comparador.'; return; }
    gravarExtras(lerExtras().filter((e) => e !== a.id).concat([a.id]));
    msg.textContent = 'Adicionando ' + a.nome + '…';
    location.reload();
  };
  document.getElementById('add-ativo').addEventListener('click', adicionar);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } });
})();
for (const [g, txt] of [['acoes', 'ações'], ['etfs', 'ETFs']]) {
  const b = document.createElement('button'); b.className = 'lnk lx-grupo'; b.dataset.g = g;
  b.innerHTML = '<span class="lx-g-on">Esconder ' + txt + '</span><span class="lx-g-off" hidden>Mostrar ' + txt + '</span>';
  chips.appendChild(b);
}
// radar: liga só os ativos do radar (e desliga o resto); de novo, volta ao padrão
const naoRadar = () => D.ids.filter((t) => !radarIds.includes(t));
const soRadar = () => { const f = DZ.p().fora; return radarIds.length > 0 && radarIds.every((t) => !f.has(t)) && naoRadar().every((t) => f.has(t)); };
const btRadar = document.createElement('button'); btRadar.className = 'lnk lx-radar'; btRadar.type = 'button'; btRadar.hidden = !radarIds.length;
btRadar.title = 'Ativos acompanhados no radar (ativos.letabuild.com/radar)';
chips.appendChild(btRadar);
const todos = document.createElement('button'); todos.className = 'lnk lx-todos'; todos.hidden = true; todos.textContent = 'Mostrar todos'; chips.appendChild(todos);

// texto de abertura, gerado a partir dos números (não fica velho quando os dados mudam)
function gerarLede() {
  const p = DZ.p(), per = PER[p.periodo], k = p.moeda === 'USD' ? 'usd' : 'brl';
  const L = DZ.rows(SRC[p.periodo]), by = Object.fromEntries(L.map((r) => [r.ativo, r]));
  const cam = DZ.rows('cambio').find((r) => r.periodo === p.periodo);
  const el = document.getElementById('lede'); el.replaceChildren();
  const txt = (s) => el.appendChild(document.createTextNode(s));
  const neg = (s) => { const b = document.createElement('b'); b.textContent = s; el.appendChild(b); };
  const m = (r) => DZ.mult(r['multiplicador_' + k]);
  const estreia = (r) => (r.inicio > per.inicio ? ', desde ' + DZ.mes(r.inicio) : '');
  const ini = p.periodo === 'ipo' ? 'Desde ago/2004, mês do IPO do Google,' : p.periodo === 'divo' ? 'Desde nov/2015, lançamento do DIVO11,' : 'De ' + DZ.mes(per.inicio) + ' a ' + DZ.mes(D.fim) + (M.parcial ? ' (parcial)' : '') + ',';
  const resumo = (r) => DZ.dec(r['cagr_' + k], 1) + '% a.a., ' + m(r) + estreia(r);
  txt(ini + ' em ' + (k === 'usd' ? 'dólar' : 'reais') + ' e com dividendos reinvestidos, os maiores retornos anuais foram de ');
  const top = L.filter((r) => r.ativo !== 'CDI' && DZ.vis(r.ativo)).sort((a, b) => b['cagr_' + k] - a['cagr_' + k]).slice(0, 3);
  top.forEach((r, i) => { txt((i ? (i === top.length - 1 ? ' e ' : ', ') : '') + NOMES[r.ativo] + ' ('); neg(resumo(r)); txt(')'); });
  txt('. O S&P 500 multiplicou o capital por '); neg(m(by.SPY)); txt(' e o QQQ, por '); neg(m(by.QQQ)); txt('. ');
  const br = L.filter((r) => D.info[r.ativo].mercado === 'Brasil' && D.info[r.ativo].tipo === 'acao' && DZ.vis(r.ativo)).sort((a, b) => b['cagr_' + k] - a['cagr_' + k]);
  if (br.length > 1) { txt('Entre as ações brasileiras, a melhor foi ' + NOMES[br[0].ativo] + ' ('); neg(resumo(br[0])); txt(') e a pior, ' + NOMES[br[br.length - 1].ativo] + ' ('); neg(resumo(br[br.length - 1])); txt('). '); }
  txt('O CDI multiplicou o capital por '); neg(DZ.mult(by.CDI.multiplicador_brl)); txt(' em reais e por '); neg(DZ.mult(by.CDI.multiplicador_usd)); txt(' em dólar. ');
  if (cam) { txt('O dólar ' + (cam.alta_dolar_pct >= 0 ? 'subiu ' : 'caiu ')); neg(DZ.dec(Math.abs(cam.alta_dolar_pct), 1) + '%'); txt(' contra o real no período, de R$ ' + DZ.dec(cam.usdbrl_inicio, 2) + ' para R$ ' + DZ.dec(cam.usdbrl_fim, 2) + '.'); }
}

// títulos e notas que dependem do período
function textosDoPeriodo() {
  const p = DZ.p(), per = PER[p.periodo];
  const tardios = D.ids.filter((id) => D.info[id].inicio > per.inicio);
  const sufixo = p.periodo === 'divo' ? ', no lançamento do DIVO11' : tardios.length ? ', ou na estreia de quem chegou depois' : '';
  document.getElementById('tit-evolucao').textContent = 'Quanto valeria cada 100 aplicado em ' + DZ.mes(per.inicio) + sufixo;
  document.getElementById('nota-estreias').textContent = tardios.length ? ' Nesta visão, ' + tardios.map((id) => NOMES[id] + ' (desde ' + DZ.mes(D.info[id].inicio) + ')').join(', ') + ' começam valendo 100 na própria data de início.' : '';
  document.getElementById('tit-tabela-longa').textContent = 'Retornos e risco no período ' + per.rotulo;
  document.getElementById('nota-tabela-longa').textContent = 'Do fechamento de ' + DZ.mes(per.inicio) + ' (ou da estreia) até ' + DZ.mes(D.fim) + (M.parcial ? ' (parcial)' : '') + '. Volatilidade anualizada dos retornos mensais em dólar; queda máxima entre fechamentos mensais.';
  document.getElementById('nota-tabela10').textContent = 'Retorno total em dólar de ' + DZ.mes(PER['10a'].inicio) + ' a ' + DZ.mes(D.fim) + '. Volatilidade anualizada dos retornos mensais; queda máxima entre fechamentos mensais. A última coluna mostra o mesmo período medido em reais.';
  document.getElementById('tabela').hidden = p.periodo !== '10a';
  document.getElementById('tabela-longa').hidden = p.periodo === '10a';
}

document.querySelectorAll('.lx-moeda').forEach((b) => b.addEventListener('click', () => dash.setParams({ moeda: b.dataset.v })));
document.querySelectorAll('.lx-escala').forEach((b) => b.addEventListener('click', () => dash.setParams({ escala: b.dataset.v })));
document.querySelectorAll('.lx-periodo').forEach((b) => b.addEventListener('click', () => dash.setParams({ periodo: b.dataset.v })));
dash.onData(() => {
  const p = DZ.p();
  for (const [cls, v] of [['.lx-moeda', p.moeda], ['.lx-escala', p.escala], ['.lx-periodo', p.periodo]]) {
    document.querySelectorAll(cls).forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  document.querySelectorAll('.lx-sw').forEach((w) => { w.style.background = DZ.swatch(w.dataset.t); });
  document.querySelectorAll('.lx-leg').forEach((b) => { const on = !p.fora.has(b.dataset.t); b.classList.toggle('off', !on); b.setAttribute('aria-pressed', String(on)); });
  document.querySelectorAll('.lx-grupo').forEach((b) => { const ts = CA.grupos[b.dataset.g] || []; const algum = ts.some((t) => !p.fora.has(t)); b.setAttribute('aria-pressed', String(algum)); b.querySelector('.lx-g-on').hidden = !algum; b.querySelector('.lx-g-off').hidden = algum; });
  todos.hidden = !p.fora.size || soRadar() || dash.params().fora == null; // no padrão, nada a mostrar
  btRadar.textContent = soRadar() ? 'Sair do radar' : 'Só o radar (' + radarIds.length + ')';
  btRadar.setAttribute('aria-pressed', String(soRadar()));
  textosDoPeriodo();
  gerarLede();
});

document.querySelectorAll('.lx-leg').forEach((it) => {
  it.addEventListener('pointerenter', () => { if (!DZ.vis(it.dataset.t)) return; DZ.hl = it.dataset.t; dash.draw('linhas'); });
  it.addEventListener('pointerleave', () => { if (DZ.hl === null) return; DZ.hl = null; dash.draw('linhas'); });
  it.addEventListener('click', () => { const f = DZ.p().fora, t = it.dataset.t; if (f.has(t)) f.delete(t); else f.add(t); DZ.hl = null; dash.setParams({ fora: listaFora(f) }); });
});
todos.addEventListener('click', () => dash.setParams({ fora: '-' }));
btRadar.addEventListener('click', () => { DZ.hl = null; dash.setParams({ fora: soRadar() ? '' : listaFora(new Set(naoRadar())) }); });
// vindo da página do radar (#radar=1): abre só com o radar
if (dash.params().radar === '1') dash.setParams({ radar: '', fora: listaFora(new Set(naoRadar())) });
document.querySelectorAll('.lx-grupo').forEach((b) => b.addEventListener('click', () => { const ts = CA.grupos[b.dataset.g] || []; const f = DZ.p().fora; const algum = ts.some((t) => !f.has(t)); ts.forEach((t) => { if (algum) f.add(t); else f.delete(t); }); DZ.hl = null; dash.setParams({ fora: listaFora(f) }); }));

dash.draw('linhas', (el) => {
  el.replaceChildren();
  const p = DZ.p(), parse = d3.utcParse('%Y-%m');
  const rows = DZ.rows('base100').filter((r) => r.moeda === p.moeda && r.periodo === p.periodo);
  const pr = {}; DZ.rows('precos_mensais').forEach((r) => { pr[r.ativo + '|' + r.mes] = r; });
  const series = DZ.ORD.map((t) => ({ t, v: rows.filter((r) => r.ativo === t).map((r) => ({ d: parse(r.mes), m: r.mes, y: +r.indice })) })).filter((s) => s.v.length && !p.fora.has(s.t));
  if (!series.length) { el.textContent = 'Escolha ao menos um ativo.'; return; }
  const W = Math.max(el.clientWidth, 300), H = 420, top = 10, bot = H - 28;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', 'Evolução base 100 dos ativos escolhidos');
  const ymax = d3.max(series, (s) => d3.max(s.v, (d) => d.y)), ymin = d3.min(series, (s) => d3.min(s.v, (d) => d.y));
  let y, ticks;
  if (p.escala === 'log') {
    const lo = Math.min(ymin, 100) * 0.9, hi = ymax * 1.1;
    y = d3.scaleLog([lo, hi], [bot, top]);
    const p10 = []; for (let e = 0; e <= 9; e++) p10.push(10 ** e);
    const cand = Math.log10(hi / lo) > 4 ? p10 : [].concat(...p10.map((t) => [t, 2 * t, 5 * t]));
    ticks = cand.filter((t) => t >= lo && t <= hi);
  } else { y = d3.scaleLinear([0, ymax * 1.04], [bot, top]).nice(); ticks = y.ticks(6); }
  const ml = Math.max(...ticks.map((t) => DZ.measure(svg, DZ.dec(t, 0)))) + 10;
  const lab = series.map((s) => { const last = s.v[s.v.length - 1]; return { s, txt: NOMES[s.t] + ' ' + DZ.dec(last.y, 0), y0: y(last.y) }; });
  const mr = Math.max(...lab.map((l) => DZ.measure(svg, l.txt))) + 30;
  const allv = [].concat(...series.map((s) => s.v));
  const x = d3.scaleUtc(d3.extent(allv, (d) => d.d), [ml, W - mr]);
  const span = (x.domain()[1] - x.domain()[0]) / (365.25 * 864e5);
  svg.selectAll('line.gr').data(ticks).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).attr('stroke', 'var(--chart-grid)');
  svg.selectAll('text.yt').data(ticks).join('text').attr('x', ml - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'var(--color-fg-muted)').text((d) => DZ.dec(d, 0));
  svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y(100)).attr('y2', y(100)).attr('stroke', 'var(--chart-reference)').attr('stroke-dasharray', '4 3');
  const xa = d3.axisBottom(x).ticks(d3.utcYear.every(Math.max(1, Math.ceil(span / Math.max(2, Math.floor((W - ml - mr) / 56)))))).tickFormat(d3.utcFormat('%Y')).tickSizeOuter(0);
  const ax = svg.append('g').attr('transform', 'translate(0,' + bot + ')').call(xa).attr('font-size', null).attr('font-family', null);
  ax.selectAll('text').attr('font-size', 12).attr('fill', 'var(--color-fg-muted)'); ax.selectAll('line,path').attr('stroke', 'var(--chart-axis)');
  const line = d3.line().x((d) => x(d.d)).y((d) => y(d.y));
  const op = (t) => (DZ.hl && DZ.hl !== t ? 0.15 : 1);
  series.forEach((s) => svg.append('path').datum(s.v).attr('fill', 'none').attr('stroke', DZ.cor(s.t)).attr('stroke-width', DZ.hl === s.t ? 3 : 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('stroke-dasharray', CA.traco[s.t] || null).attr('opacity', op(s.t)).attr('d', line));
  const gap = 15, lo = top + 6, hi = bot - 2;
  lab.sort((a, b) => a.y0 - b.y0);
  const cl = lab.map((l) => ({ ls: [l], y: l.y0 }));
  const fit = (c) => { const n = c.ls.length; const m = c.ls.reduce((a, l) => a + l.y0, 0) / n; c.y = Math.max(lo, Math.min(m - (n - 1) * gap / 2, hi - (n - 1) * gap)); };
  cl.forEach(fit);
  for (let i = 1; i < cl.length;) { const a = cl[i - 1], b = cl[i]; if (a.y + a.ls.length * gap > b.y) { a.ls = a.ls.concat(b.ls); cl.splice(i, 1); fit(a); i = 1; } else i++; }
  cl.forEach((c) => c.ls.forEach((l, k) => { l.yl = c.y + k * gap; }));
  const xl = W - mr + 22;
  lab.forEach((l) => { const e = l.s.v[l.s.v.length - 1]; const xe = x(e.d), ye = y(e.y); svg.append('path').attr('d', 'M' + (xe + 4) + ',' + ye + 'L' + (W - mr + 10) + ',' + ye + 'L' + (xl - 4) + ',' + l.yl).attr('fill', 'none').attr('stroke', DZ.cor(l.s.t)).attr('stroke-width', 1).attr('opacity', 0.8 * op(l.s.t)); });
  lab.forEach((l) => svg.append('text').attr('x', xl).attr('y', l.yl).attr('dy', '0.32em').attr('font-size', 12).attr('fill', 'var(--color-fg)').attr('opacity', op(l.s.t)).text(l.txt));
  lab.forEach((l) => { const e = l.s.v[l.s.v.length - 1]; svg.append('circle').attr('cx', x(e.d)).attr('cy', y(e.y)).attr('r', 3).attr('fill', DZ.cor(l.s.t)).attr('opacity', op(l.s.t)); });
  const rule = svg.append('line').attr('y1', top).attr('y2', bot).attr('stroke', 'var(--chart-axis)').style('display', 'none');
  const dots = svg.append('g');
  const tip = DZ.tip(el);
  const months = Array.from(new Set(allv.map((d) => d.m))).sort();
  svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', bot).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [px] = d3.pointer(ev); const dt = x.invert(px);
      let best = months[0], bd = Infinity; months.forEach((m) => { const dd = Math.abs(parse(m) - dt); if (dd < bd) { bd = dd; best = m; } });
      const X = x(parse(best)); rule.attr('x1', X).attr('x2', X).style('display', null);
      const pts = series.map((s) => ({ s, d: s.v.find((v) => v.m === best) })).filter((o) => o.d);
      dots.selectAll('circle').data(pts).join('circle').attr('cx', X).attr('cy', (o) => y(o.d.y)).attr('r', 4).attr('fill', (o) => DZ.cor(o.s.t)).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2);
      const lines = pts.sort((a, b) => b.d.y - a.d.y).map((o) => { const q = pr[o.s.t + '|' + best]; let px2 = ''; if (q) { const v = p.moeda === 'USD' ? q.preco_ajustado_usd : (q.moeda_original === 'BRL' ? q.preco_ajustado_original : q.preco_ajustado_original * q.usdbrl_fim_mes); px2 = (p.moeda === 'USD' ? 'US$ ' : 'R$ ') + DZ.dec(v, 2); } return { c: DZ.cor(o.s.t), n: NOMES[o.s.t] + (px2 ? ' · ' + px2 : ''), v: DZ.dec(o.d.y, 0) }; });
      const q0 = pr['CDI|' + best]; if (q0) lines.push({ n: 'Dólar (PTAX)', v: 'R$ ' + DZ.dec(q0.usdbrl_fim_mes, 2) });
      DZ.tipShow(el, tip, X / W * el.clientWidth, (ev.offsetY || H / 2), DZ.mes(best) + (best === D.fim && M.parcial ? ' (parcial)' : ''), lines);
    })
    .on('pointerleave', () => { rule.style('display', 'none'); dots.selectAll('circle').remove(); tip.style.display = 'none'; });
});

dash.draw('barras', (el) => {
  el.replaceChildren();
  const p = DZ.p(), k = p.moeda === 'USD' ? 'usd' : 'brl';
  const rows = DZ.rows(SRC[p.periodo]).map((r) => ({ t: r.ativo, cagr: r['cagr_' + k], mult: r['multiplicador_' + k], ini: r.inicio })).filter((r) => !p.fora.has(r.t)).sort((a, b) => b.cagr - a.cagr);
  if (!rows.length) { el.textContent = 'Escolha ao menos um ativo.'; return; }
  const W = Math.max(el.clientWidth, 300), rowH = 36, H = Math.max(320, rows.length * rowH + 30);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img').attr('aria-label', 'Retorno anual composto por ativo');
  const ml = Math.max(...rows.map((r) => DZ.measure(svg, NOMES[r.t]))) + 12;
  const labs = rows.map((r) => DZ.dec(r.cagr, 1) + '% a.a. · ' + DZ.mult(r.mult));
  const mr = Math.max(...labs.map((s) => DZ.measure(svg, s))) + 10;
  const x = d3.scaleLinear([Math.min(0, d3.min(rows, (r) => r.cagr)), d3.max(rows, (r) => r.cagr)], [ml, W - mr]);
  const yb = d3.scaleBand(rows.map((r) => r.t), [8, H - 8]).padding(0.3);
  svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 4).attr('y2', H - 4).attr('stroke', 'var(--chart-axis)');
  const tip = DZ.tip(el);
  rows.forEach((r, i) => {
    svg.append('text').attr('x', ml - 8).attr('y', yb(r.t) + yb.bandwidth() / 2).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'var(--color-fg)').text(NOMES[r.t]);
    const x0 = x(Math.min(0, r.cagr)), x1 = x(Math.max(0, r.cagr));
    svg.append('rect').attr('x', x0).attr('y', yb(r.t)).attr('width', Math.max(1, x1 - x0)).attr('height', Math.min(24, yb.bandwidth())).attr('rx', 3).attr('fill', DZ.cor(r.t))
      .on('pointermove', () => { DZ.tipShow(el, tip, x1 / W * el.clientWidth, (yb(r.t) + yb.bandwidth() / 2) / H * el.clientHeight, NOMES[r.t] + ' (' + r.t + ')', [{ n: 'Ao ano', v: DZ.dec(r.cagr, 1) + '%' }, { n: 'Multiplicou', v: DZ.mult(r.mult) }, { n: 'Desde', v: DZ.mes(r.ini) }]); })
      .on('pointerleave', () => { tip.style.display = 'none'; });
    svg.append('text').attr('x', x1 + 6).attr('y', yb(r.t) + Math.min(24, yb.bandwidth()) / 2).attr('dy', '0.32em').attr('font-size', 12).attr('fill', 'var(--color-fg-muted)').text(labs[i]);
  });
});

const celula = (tr, txt) => { const td = document.createElement('td'); td.textContent = txt; tr.appendChild(td); return td; };
dash.draw('tabela', (tb) => {
  tb.replaceChildren();
  DZ.rows('retornos').filter((r) => DZ.vis(r.ativo)).sort((a, b) => b.ret_10a_usd - a.ret_10a_usd).forEach((r) => {
    const tr = document.createElement('tr');
    celula(tr, r.ativo); celula(tr, NOMES[r.ativo] + (r.inicio > PER['10a'].inicio ? ' (desde ' + DZ.mes(r.inicio) + ')' : ''));
    ['ret_10a_usd', 'cagr_10a_usd', 'ret_5a_usd', 'ret_12m_usd', 'ret_ano_usd'].forEach((f) => { const v = r[f]; DZ.sign(celula(tr, DZ.pct(v)), v); });
    celula(tr, DZ.dec(r.vol_10a_usd, 1) + '%');
    DZ.sign(celula(tr, DZ.pct(r.queda_max_usd)), r.queda_max_usd);
    DZ.sign(celula(tr, DZ.pct(r.ret_10a_brl)), r.ret_10a_brl);
    tb.appendChild(tr);
  });
});
dash.draw('tabela-longa', (tb) => {
  tb.replaceChildren();
  const p = DZ.p(); if (p.periodo === '10a') return;
  DZ.rows(SRC[p.periodo]).filter((r) => DZ.vis(r.ativo)).sort((a, b) => b.cagr_usd - a.cagr_usd).forEach((r) => {
    const tr = document.createElement('tr');
    celula(tr, r.ativo); celula(tr, NOMES[r.ativo]); celula(tr, DZ.mes(r.inicio));
    celula(tr, DZ.mult(r.multiplicador_usd)); celula(tr, DZ.dec(r.cagr_usd, 1) + '%'); celula(tr, DZ.dec(r.vol_usd, 1) + '%');
    DZ.sign(celula(tr, DZ.pct(r.queda_max_usd)), r.queda_max_usd);
    celula(tr, DZ.mult(r.multiplicador_brl)); celula(tr, DZ.dec(r.cagr_brl, 1) + '%');
    tb.appendChild(tr);
  });
});
})();
