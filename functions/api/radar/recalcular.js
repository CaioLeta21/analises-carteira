// POST /api/radar/recalcular — uma vez por dia (a marca no banco barra o resto): refaz o alvo do
// bitcoin (termômetro) e, se houver a chave do Gemini, calcula alvos de ações que faltam e refaz os
// automáticos com balanço novo. Alvo digitado à mão nunca é trocado. Não recebe dado nenhum.
import { recalcularBTC } from '../../_btc.js';
import { recalcularAlvos } from '../../_alvo.js';
import { conferirBalancos } from '../../_balancos.js';
import { btcAgora } from '../../_radar_publico.js';
import { resp, esquecer } from '../../_comum.js';
import { CHAVE_RADAR } from './index.js';

export async function recalcularTudo(env, buscar = fetch) {
  const btc = await recalcularBTC(env, buscar, await btcAgora(buscar).catch(() => null))
    .catch((e) => [{ codigo: 'BTC', ok: false, erro: String(e.message || e) }]);
  // ações: o teto é revisado pelo Claude quando o dono pede; aqui só se confere se saiu balanço novo.
  // (O cálculo pelo Gemini só roda se alguém instalar GEMINI_API_KEY; o dono escolheu não usar.)
  const balancos = await conferirBalancos(env, buscar).catch((e) => [{ erro: String(e.message || e) }]);
  const a = env.GEMINI_API_KEY ? await recalcularAlvos(env, 4, buscar) : { feitos: [] };
  return { feitos: btc.concat(a.feitos || []), balancos };
}

export async function onRequestPost({ env }) {
  const hoje = new Date().toISOString().slice(0, 10);
  // marca antes de calcular: dois visitantes ao mesmo tempo não disparam duas contas
  const r = await env.DB.prepare("INSERT INTO cache (chave, valor, atualizado_em) VALUES ('alvos:conferido', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em WHERE cache.valor IS NOT excluded.valor")
    .bind(hoje, Date.now()).run();
  if (!r.meta.changes) return resp({ feito: false, motivo: 'já conferido hoje' });
  const a = await recalcularTudo(env);
  await env.DB.prepare("INSERT INTO cache (chave, valor, atualizado_em) VALUES ('alvos:ultimo', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em")
    .bind(JSON.stringify({ ...a, em: new Date().toISOString() }), Date.now()).run();
  if (a.feitos.some((f) => f.ok) || a.balancos.some((b) => b.novo)) await esquecer(CHAVE_RADAR);
  return resp({ feito: true, ...a });
}
