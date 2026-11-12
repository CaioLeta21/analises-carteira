/* Página do radar: lê /data/radar.json (mandado pela carteira a cada mudança) e os preços do
   próprio site (/data/mercado.json e /data/catalogo/<ID>.json). Texto dos dados só por textContent. */
(async function () {
'use strict';
const $ = (s) => document.querySelector(s);
const el = (tag, attrs, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const f of filhos) if (f != null) e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return e;
};
const dec = (v, d) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, sinal = true) => (v == null || !isFinite(v) ? '—' : (sinal && v > 0 ? '+' : v < 0 ? '−' : '') + dec(Math.abs(v) * 100, 1) + '%');
const dinheiro = (v, moeda) => (v == null ? '—' : (moeda === 'BRL' ? 'R$ ' : moeda === 'USD' ? 'US$ ' : '') + dec(v, v >= 1000 ? 0 : 2));
const lembrar = (k, p) => { try { return localStorage.getItem('radar:' + k) || p; } catch (e) { return p; } };
const guardar = (k, v) => { try { localStorage.setItem('radar:' + k, v); } catch (e) { /* sem armazenamento */ } };

let R, M, CAT;
try {
  [R, M, CAT] = await Promise.all([Dados.buscarJSON('/data/radar.json'), Dados.buscarJSON('/data/mercado.json'), Dados.buscarJSON('/data/catalogo.json').catch(() => null)]);
} catch (e) {
  $('#atualizacao').replaceWith(el('p', { class: 'erro-carga', text: 'Não foi possível carregar o radar agora. Tente de novo em alguns minutos.' }));
  return;
}
// preços: ativos do comparador vêm no mercado.json; os do catálogo, um arquivo por ativo
const base = Object.fromEntries(M.ativos.map((a) => [a.id, a]));
const doCat = CAT ? Object.fromEntries(CAT.ativos.map((a) => [a.id, a])) : {};
const series = {};
await Promise.all(R.itens.map(async (i) => {
  const id = i.site_id;
  if (!id) return;
  if (base[id]) { series[id] = base[id]; return; }
  if (doCat[id]) { try { series[id] = await Dados.buscarJSON('/data/catalogo/' + encodeURIComponent(id) + '.json'); } catch (e) { /* sem série */ } }
}));
const linhas = R.itens.map((i) => {
  const s = i.site_id && series[i.site_id];
  const p = s && s.precos && s.precos.length ? s.precos : null;
  const preco = p ? p[p.length - 1] : null;
  const a12 = p && p.length > 12 ? preco / p[p.length - 13] - 1 : null;
  const alvoDist = preco != null && i.preco_alvo ? preco / i.preco_alvo - 1 : null;
  const moeda = i.moeda || (s && s.moeda) || null;
  return { i, preco, a12, alvoDist, moeda };
});

const dref = new Date(M.data_ref + 'T12:00:00');
$('#atualizacao').textContent = 'Preços até ' + dref.toLocaleDateString('pt-BR') + '. Radar atualizado em ' + (R.atualizado_em ? new Date(R.atualizado_em).toLocaleDateString('pt-BR') : '—') + '.';

function situacao(x) {
  if (!x.i.preco_alvo) return { t: 'Sem alvo de preço', c: 'sem' };
  if (x.preco == null) return { t: 'Sem cotação no site', c: 'sem' };
  if (x.preco <= x.i.preco_alvo) return { t: 'No alvo · ' + pct(x.i.preco_alvo / x.preco - 1, false) + ' abaixo', c: 'ok' };
  const falta = 1 - x.i.preco_alvo / x.preco;
  return { t: 'Falta cair ' + pct(falta, false), c: falta <= 0.05 ? 'perto' : 'longe' };
}

function fecharPops() {
  document.querySelectorAll('.pop').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.ajuda').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function cartao(x) {
  const { i } = x;
  const s = situacao(x);
  const c = el('article', { class: 'cartao s-' + s.c, 'aria-label': i.codigo },
    el('span', { class: 'id' }, el('strong', { text: i.codigo }), el('span', { class: 'nome', title: i.nome || null, text: i.nome || '' })),
    el('span', { class: 'precos' },
      el('span', { class: 'p' }, el('span', { class: 'r', text: 'Hoje' }), el('strong', { text: dinheiro(x.preco, x.moeda) })),
      el('span', { class: 'p alvo' }, el('span', { class: 'r', text: 'Alvo' }), el('strong', { text: i.preco_alvo ? dinheiro(i.preco_alvo, x.moeda) : '—' }))),
    el('span', { class: 'sit', text: s.t }),
    x.a12 != null ? el('span', { class: 'a12' }, '12 meses: ', el('span', { class: x.a12 > 0 ? 'pos' : x.a12 < 0 ? 'neg' : null, text: pct(x.a12) })) : null);
  if (i.alvo_explicacao) {
    const id = 'pop-' + i.codigo.replace(/[^\w-]/g, '_');
    const pop = el('div', { class: 'pop', id, role: 'note', hidden: true }, el('strong', { text: 'Como o alvo foi definido' }), i.alvo_explicacao);
    const b = el('button', { type: 'button', class: 'ajuda', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': 'Como foi definido o alvo de ' + i.codigo, title: 'Como foi definido o alvo', text: '?' });
    b.addEventListener('click', (ev) => { ev.stopPropagation(); const abrir = pop.hidden; fecharPops(); pop.hidden = !abrir; b.setAttribute('aria-expanded', String(abrir)); });
    c.append(b, pop);
  }
  return c;
}

let filtro = lembrar('filtro', 'todos'), ordem = lembrar('ordem', 'alvo');
function desenhar() {
  const vis = linhas.filter((x) => filtro === 'todos' || x.i.mercado === filtro);
  const chave = { alvo: (x) => (x.alvoDist == null ? Infinity : x.alvoDist), a12: (x) => (x.a12 == null ? Infinity : -x.a12), codigo: (x) => x.i.codigo }[ordem];
  vis.sort((a, b) => { const p = chave(a), q = chave(b); return typeof p === 'string' ? p.localeCompare(q) : p - q; });
  $('#grade').replaceChildren(...vis.map(cartao));
  const noAlvo = vis.filter((x) => situacao(x).c === 'ok');
  const perto = vis.filter((x) => situacao(x).c === 'perto');
  const comAlvo = vis.filter((x) => x.alvoDist != null);
  const mediana = comAlvo.length ? comAlvo.map((x) => x.alvoDist).sort((a, b) => a - b)[Math.floor(comAlvo.length / 2)] : null;
  const c = (r, v, s) => el('div', { class: 'c' }, el('div', { class: 'r', text: r }), el('div', { class: 'v', text: v }), s ? el('div', { class: 's', text: s }) : null);
  $('#resumo').replaceChildren(
    c('Ativos no radar', String(vis.length), vis.filter((x) => x.preco == null).length ? vis.filter((x) => x.preco == null).length + ' sem cotação no site' : 'todos com cotação'),
    c('No preço-alvo', String(noAlvo.length), noAlvo.length ? noAlvo.map((x) => x.i.codigo).join(', ') : 'nenhum hoje'),
    c('A até 5% do alvo', String(perto.length), perto.length ? perto.map((x) => x.i.codigo).join(', ') : 'nenhum hoje'),
    c('Distância típica', mediana == null ? '—' : pct(mediana), 'mediana do preço acima do alvo'));
  document.querySelectorAll('#filtro button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === filtro)));
  $('#ordem').value = ordem;
}
$('#filtro').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; filtro = b.dataset.f; guardar('filtro', filtro); desenhar(); });
$('#ordem').addEventListener('change', (ev) => { ordem = ev.target.value; guardar('ordem', ordem); desenhar(); });
document.addEventListener('click', (ev) => { if (!ev.target.closest('.pop, .ajuda')) fecharPops(); });
document.addEventListener('keydown', (ev) => { if (ev.key !== 'Escape') return; const aberto = document.querySelector('.pop:not([hidden])'); if (!aberto) return; fecharPops(); const b = document.querySelector(`[aria-controls="${aberto.id}"]`); if (b) b.focus(); });
desenhar();
})();
