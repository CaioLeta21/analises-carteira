// GET /api/logo/<símbolo do Yahoo> — logo do ativo, servido pelo próprio site (ver functions/_logo.js).
import { SIMBOLO, buscarLogo, permitido } from '../../_logo.js';
import { SEGURANCA } from '../../_comum.js';

const semLogo = (seg) => new Response('sem logo', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA, 'Cache-Control': `public, max-age=${seg}` } });

export async function onRequestGet(ctx) {
  const { env, request, params } = ctx;
  const simbolo = String(params.simbolo || '').toUpperCase();
  if (!SIMBOLO.test(simbolo)) return semLogo(86400);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const chave = new Request('https://logo.ativos.letabuild.interno/' + encodeURIComponent(simbolo));
  if (cache) { const achou = await cache.match(chave); if (achou) return achou; }
  if (!(await permitido(simbolo, env, request.url))) return semLogo(3600);
  const l = await buscarLogo(simbolo);
  const res = l
    ? new Response(l.corpo, { headers: { 'Content-Type': l.tipo, ...SEGURANCA, 'Cache-Control': 'public, max-age=2592000' } })
    : semLogo(86400);
  if (cache) ctx.waitUntil(cache.put(chave, res.clone()));
  return res;
}
