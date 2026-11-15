// Edição do radar (só o dono, ver ../_middleware.js):
//   GET    /admin/api/radar            lista completa (com o alvo automático)
//   GET    /admin/api/buscar?q=        sugestões enquanto digita (Yahoo)
//   POST   /admin/api/radar            adiciona; sem alvo digitado, calcula (termômetro no BTC, Gemini nas ações)
//   PUT    /admin/api/radar/:id        muda alvo, explicação ou tipo (alvo mexido à mão deixa de ser automático)
//   DELETE /admin/api/radar/:id        tira do radar
//   POST   /admin/api/radar/:id/alvo   recalcula o alvo agora
import { resolver, buscarAtivos, tipoAuto, grafico, resumir, codigoDe } from '../../_radar.js';
import { gravarAlvo } from '../../_alvo.js';
import { gravarAlvoBTC } from '../../_btc.js';
import { resp, erro, esquecer } from '../../_comum.js';
import { CHAVE_RADAR } from '../../api/radar/index.js';

const TIPOS = ['acao', 'etf', 'fii', 'cripto'];
const CODIGO = /^[A-Z0-9.\-]{1,12}$/;
const texto = (x, n) => (x == null || String(x).trim() === '' ? null : String(x).trim().slice(0, n));
const numero = (v) => { const n = typeof v === 'string' ? Number(v.replace(/\s|R\$|US\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) : Number(v); return Number.isFinite(n) ? n : NaN; };
const alvo = (v) => (v == null || v === '' ? null : numero(v));
const corpo = async (req) => { try { return await req.json(); } catch { return null; } };

export async function lista(env) {
  return (await env.DB.prepare('SELECT * FROM radar ORDER BY adicionado_em, id').all()).results;
}

export async function adicionar(env, b, buscar = fetch) {
  if (!b) return [400, 'Corpo inválido.'];
  const digitado = String(b.codigo || '').trim();
  if (!digitado || digitado.length > 60) return [400, 'Escreva o código ou o nome. Exemplos: ITSA4, Itaúsa, VOO, Microsoft, BTC.'];
  if (b.tipo && !TIPOS.includes(b.tipo)) return [400, 'Tipo inválido.'];
  const pa = alvo(b.preco_alvo);
  if (pa != null && !(pa > 0)) return [400, 'Preço teto inválido.'];
  let simbolo;
  if (b.simbolo && CODIGO.test(String(b.simbolo).toUpperCase())) simbolo = String(b.simbolo).toUpperCase();
  else { try { simbolo = (await resolver(digitado, buscar)).simbolo; } catch (e) { return [404, `${digitado}: ${e.message}.`]; } }
  const codigo = codigoDe(simbolo);
  if (await env.DB.prepare('SELECT 1 FROM radar WHERE simbolo = ?').bind(simbolo).first()) return [409, codigo + ' já está no radar.'];
  let res;
  try { res = await grafico(simbolo, buscar); } catch (e) { return [404, `${digitado}: ${e.message}.`]; }
  const q = resumir(res);
  const tipo = b.tipo || tipoAuto(res.meta, simbolo);
  const mercado = /\.SA$/.test(simbolo) ? 'BR' : 'EXT';
  const r = await env.DB.prepare('INSERT INTO radar (simbolo, codigo, nome, tipo, mercado, moeda, preco_alvo, alvo_explicacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(simbolo, codigo, texto(q.nome, 120), tipo, mercado, q.moeda || null, pa, texto(b.alvo_explicacao, 1500)).run();
  const id = r.meta.last_row_id;
  let auto = null;
  if (pa == null && simbolo === 'BTC-USD') auto = await gravarAlvoBTC(env, id, buscar);
  else if (pa == null && tipo === 'acao' && env.GEMINI_API_KEY) auto = await gravarAlvo(env, id, { simbolo, codigo, nome: q.nome, tipo }, buscar);
  return [201, { id, simbolo, codigo, nome: q.nome, tipo, moeda: q.moeda, preco: q.preco, alvo_auto: auto }];
}

export async function editar(env, id, b) {
  if (!b || !/^\d+$/.test(id)) return [400, 'Dados inválidos.'];
  const pa = alvo(b.preco_alvo);
  if (pa != null && !(pa > 0)) return [400, 'Preço teto inválido.'];
  if (b.tipo && !TIPOS.includes(b.tipo)) return [400, 'Tipo inválido.'];
  const ex = texto(b.alvo_explicacao, 1500);
  // mexeu no alvo ou na explicação: vira alvo digitado e o automático para (no SQLite o lado direito do SET usa os valores antigos)
  const r = await env.DB.prepare(`UPDATE radar SET preco_alvo = ?, tipo = COALESCE(?, tipo), alvo_explicacao = ?, atualizado_em = datetime('now'),
      alvo_auto = CASE WHEN preco_alvo IS ? AND COALESCE(alvo_explicacao, '') = COALESCE(?, '') THEN alvo_auto ELSE NULL END WHERE id = ?`)
    .bind(pa, b.tipo || null, ex, pa, ex, Number(id)).run();
  return r.meta.changes ? [200, { ok: true }] : [404, 'Não encontrado.'];
}

export async function recalcular(env, id, buscar = fetch) {
  if (!/^\d+$/.test(id)) return [400, 'Dados inválidos.'];
  const i = await env.DB.prepare('SELECT id, simbolo, codigo, nome, tipo FROM radar WHERE id = ?').bind(Number(id)).first();
  if (!i) return [404, 'Não encontrado.'];
  let r;
  if (i.simbolo === 'BTC-USD') r = await gravarAlvoBTC(env, i.id, buscar);
  else if (i.tipo !== 'acao') return [400, 'O preço teto automático é para ações e bitcoin (ETF e FII seguem aporte contínuo).'];
  else if (!env.GEMINI_API_KEY) return [503, 'Falta a chave do Gemini (segredo GEMINI_API_KEY do Pages ativos-letabuild).'];
  else r = await gravarAlvo(env, i.id, i, buscar);
  return r.ok ? [200, r] : [502, 'Não deu para calcular agora: ' + r.erro];
}

export async function onRequest({ request, env, params }) {
  const rota = params.rota || [];
  const m = request.method;
  const saida = async ([status, x]) => {
    if (m !== 'GET' && status < 300) await esquecer(CHAVE_RADAR);
    return typeof x === 'string' ? erro(x, status) : resp(x, status, { 'Cache-Control': 'no-store' });
  };
  try {
    if (rota[0] === 'radar' && rota.length === 1 && m === 'GET') return resp(await lista(env), 200, { 'Cache-Control': 'no-store' });
    if (rota[0] === 'buscar' && m === 'GET') {
      const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60);
      return resp({ resultados: q.length < 2 ? [] : await buscarAtivos(q) }, 200, { 'Cache-Control': 'no-store' });
    }
    if (rota[0] === 'radar' && rota.length === 1 && m === 'POST') return saida(await adicionar(env, await corpo(request)));
    if (rota[0] === 'radar' && rota.length === 2 && m === 'PUT') return saida(await editar(env, rota[1], await corpo(request)));
    if (rota[0] === 'radar' && rota.length === 2 && m === 'DELETE') {
      if (!/^\d+$/.test(rota[1])) return erro('Dados inválidos.');
      const r = await env.DB.prepare('DELETE FROM radar WHERE id = ?').bind(Number(rota[1])).run();
      return saida(r.meta.changes ? [200, { ok: true }] : [404, 'Não encontrado.']);
    }
    if (rota[0] === 'radar' && rota.length === 3 && rota[2] === 'alvo' && m === 'POST') return saida(await recalcular(env, rota[1]));
    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro('Erro: ' + (e.message || e), 500);
  }
}
