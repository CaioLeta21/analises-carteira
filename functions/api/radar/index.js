// GET /api/radar — público, só leitura. O resultado fica 1 minuto no cache da borda: muitos visitantes,
// uma conta por minuto. Na 1ª visita do dia, dispara (em outro pedido, com limite de buscas próprio)
// o recálculo dos alvos automáticos.
import { montarRadar } from '../../_radar_publico.js';
import { resp, erro, emCache } from '../../_comum.js';

export const CHAVE_RADAR = 'radar:resposta:v1';

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  try {
    const r = await emCache(CHAVE_RADAR, 60, () => montarRadar(env));
    ctx.waitUntil(dispararRecalculo(env, new URL(request.url).origin).catch(() => {}));
    return resp(r, 200, { 'Cache-Control': 'public, max-age=30' });
  } catch (e) {
    return erro('Radar indisponível agora: ' + (e.message || e), 503);
  }
}

async function dispararRecalculo(env, origem) {
  const hoje = new Date().toISOString().slice(0, 10);
  const marca = await env.DB.prepare("SELECT valor FROM cache WHERE chave = 'alvos:conferido'").first();
  if (marca && marca.valor === hoje) return;
  await fetch(origem + '/api/radar/recalcular', { method: 'POST' });
}
