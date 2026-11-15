/* Edição do radar (só o dono; o Cloudflare Access pede o login). Fala só com /admin/api/ do próprio site.
   Texto vindo do banco ou do Yahoo entra só por textContent. */
(function () {
'use strict';
const $ = (s) => document.querySelector(s);
const el = (tag, attrs, ...filhos) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const f of filhos) if (f != null) e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return e;
};
const TIPOS = { acao: 'Ação', etf: 'ETF', fii: 'FII', cripto: 'Cripto' };
const dec = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 1000 ? 0 : 2 });
const dinheiro = (v, m) => (v == null ? '—' : (m === 'BRL' ? 'R$ ' : m === 'USD' ? 'US$ ' : '') + dec(v));
const dataBR = (d) => (d ? d.split('-').reverse().join('/') : '—');
// mesmo critério do servidor (functions/_balancos.js)
const balancoNovo = (i) => (i.tipo === 'acao' && i.balanco_ultimo && i.teto_balanco && i.balanco_ultimo > i.teto_balanco ? i.balanco_ultimo : null);

async function api(caminho, opcoes = {}) {
  // redirect manual: com o login vencido o Access responde com redirecionamento; recarrega para logar de novo
  const r = await fetch(caminho, { redirect: 'manual', headers: { 'Content-Type': 'application/json' }, ...opcoes });
  if (r.type === 'opaqueredirect' || r.status === 0) { location.reload(); throw new Error('Login vencido. Recarregando…'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}

function origem(i) {
  let a = null; try { a = i.alvo_auto ? JSON.parse(i.alvo_auto) : null; } catch (e) { a = null; }
  if (!a) return i.preco_alvo != null ? 'teto digitado' : 'sem teto';
  if (a.erro) return 'automático falhou em ' + a.em + ': ' + a.erro;
  if (a.metodo === 'termometro_btc') return 'termômetro do BTC · ' + a.em;
  return 'Gemini (' + (a.modelo || '') + ') · ' + a.em;
}

function item(i) {
  const f = el('form', { novalidate: true },
    el('label', { class: 'campo' }, 'Preço teto (' + (i.moeda || '') + ')', el('input', { name: 'preco_alvo', inputmode: 'decimal', value: i.preco_alvo != null ? String(i.preco_alvo).replace('.', ',') : '' })),
    el('label', { class: 'campo' }, 'Tipo', el('select', { name: 'tipo' }, ...Object.entries(TIPOS).map(([v, r]) => el('option', { value: v, selected: v === i.tipo, text: r })))),
    el('label', { class: 'campo largo' }, 'Como o preço teto foi definido (aparece no "?" do cartão)', el('textarea', { name: 'alvo_explicacao', rows: '5' }, i.alvo_explicacao || '')),
  );
  const msg = el('p', { class: 'msg', role: 'status' });
  const salvar = el('button', { type: 'submit', text: 'Salvar' });
  const recalc = el('button', { type: 'button', class: 'sec', text: 'Recalcular o preço teto' });
  const tirar = el('button', { type: 'button', class: 'perigo', text: 'Tirar do radar' });
  const novo = balancoNovo(i);
  const revisado = el('button', { type: 'button', class: 'sec', text: 'Teto revisado, manter' });
  f.append(el('div', { class: 'acoes' }, salvar, i.simbolo === 'BTC-USD' ? recalc : null, novo ? revisado : null, tirar), msg);
  const ocupado = (sim, t) => { [salvar, recalc, revisado, tirar].forEach((b) => { b.disabled = sim; }); msg.className = 'msg'; if (t) msg.textContent = t; };
  revisado.addEventListener('click', async () => {
    ocupado(true, 'Marcando…');
    try { await api('/admin/api/radar/' + i.id + '/revisado', { method: 'POST' }); await carregar(i.id); } catch (e) { ocupado(false); msg.className = 'msg erro'; msg.textContent = e.message; }
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); ocupado(true, 'Salvando…');
    try { await api('/admin/api/radar/' + i.id, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(f))) }); await carregar(i.id); } catch (e) { ocupado(false); msg.className = 'msg erro'; msg.textContent = e.message; }
  });
  recalc.addEventListener('click', async () => {
    ocupado(true, i.simbolo === 'BTC-USD' ? 'Lendo os indicadores do termômetro…' : 'Calculando com o Gemini (até 1 minuto)…');
    try { await api('/admin/api/radar/' + i.id + '/alvo', { method: 'POST' }); await carregar(i.id); } catch (e) { ocupado(false); msg.className = 'msg erro'; msg.textContent = e.message; }
  });
  // dois cliques para tirar (sem janela de confirmação do navegador)
  let armado = false;
  tirar.addEventListener('click', async () => {
    if (!armado) { armado = true; tirar.textContent = 'Clique de novo para tirar ' + i.codigo; setTimeout(() => { armado = false; tirar.textContent = 'Tirar do radar'; }, 4000); return; }
    ocupado(true, 'Tirando…');
    try { await api('/admin/api/radar/' + i.id, { method: 'DELETE' }); await carregar(); } catch (e) { ocupado(false); msg.className = 'msg erro'; msg.textContent = e.message; }
  });
  return el('details', { class: 'item', id: 'i-' + i.id },
    el('summary', null, el('strong', { text: i.codigo }), el('span', { class: 'nome', text: (i.nome || '') + ' · ' + (TIPOS[i.tipo] || i.tipo) }),
      el('span', { class: 'alvo', text: 'Teto ' + dinheiro(i.preco_alvo, i.moeda) }), el('span', { class: 'orig', text: origem(i) }),
      balancoNovo(i) ? el('span', { class: 'aviso', text: 'Balanço novo (tri até ' + dataBR(balancoNovo(i)) + ') desde o teto' }) : null),
    f);
}

async function carregar(abrir) {
  try {
    const itens = await api('/admin/api/radar');
    const velhos = itens.filter(balancoNovo).map((i) => i.codigo);
    $('#estado').textContent = itens.length + ' ativos no radar. Clique num ativo para editar.'
      + (velhos.length ? ' Balanço novo desde o teto: ' + velhos.join(', ') + ' (peça ao Claude para revisar).' : ' Nenhum teto desatualizado.');
    $('#lista').replaceChildren(...itens.map(item));
    if (abrir) { const d = document.getElementById('i-' + abrir); if (d) d.open = true; }
  } catch (e) { $('#estado').textContent = e.message; }
}

// adicionar, com sugestões do Yahoo enquanto digita
(function () {
  const f = $('#f-add'), campo = $('#add-codigo'), lista = $('#sugestoes'), msg = $('#add-msg');
  let timer = null, ultimas = [];
  campo.addEventListener('input', () => {
    f.simbolo.value = '';
    const q = campo.value.trim();
    const escolhida = ultimas.find((x) => x.codigo + ' · ' + x.nome === q);
    if (escolhida) { campo.value = escolhida.codigo; f.simbolo.value = escolhida.simbolo; return; }
    clearTimeout(timer);
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        ultimas = (await api('/admin/api/buscar?q=' + encodeURIComponent(q))).resultados || [];
        lista.replaceChildren(...ultimas.map((x) => el('option', { value: x.codigo + ' · ' + x.nome, text: x.bolsa + ' · ' + (TIPOS[x.tipo] || x.tipo) })));
      } catch (e) { /* sem sugestões: o código digitado ainda funciona */ }
    }, 300);
  });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = f.querySelector('button');
    b.disabled = true; msg.className = 'msg';
    msg.textContent = f.preco_alvo.value.trim() ? 'Buscando…' : 'Buscando e calculando o alvo (pode levar até 1 minuto)…';
    try {
      const r = await api('/admin/api/radar', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(f))) });
      const a = r.alvo_auto;
      msg.textContent = `Adicionado: ${r.nome} (${r.codigo}, ${TIPOS[r.tipo] || r.tipo}), ${dinheiro(r.preco, r.moeda)}.`
        + (!a ? (f.preco_alvo.value.trim() ? '' : ' Sem preço teto ainda: peça ao Claude para calcular.') : a.ok && a.preco_alvo ? ` Preço teto calculado: ${dinheiro(a.preco_alvo, r.moeda)}.` : a.ok ? ' Sem preço teto: dados insuficientes.' : ` O cálculo do preço teto falhou (${a.erro}); é refeito amanhã.`);
      f.reset(); f.simbolo.value = '';
      await carregar(r.id);
    } catch (e) { msg.className = 'msg erro'; msg.textContent = e.message; }
    b.disabled = false;
  });
})();

carregar();
})();
