// Utilidades das funções do site: respostas JSON e cache de borda (Cache API do Cloudflare).

export const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function resp(obj, status = 200, cabecalhos = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SEGURANCA, ...cabecalhos } });
}

export const erro = (msg, status = 400) => resp({ erro: msg }, status, { 'Cache-Control': 'no-store' });

// Chave sintética no cache da borda (o domínio não precisa existir)
const chaveCache = (chave) => new Request('https://cache.ativos.letabuild.interno/' + encodeURIComponent(chave));

// Guarda o resultado de fn() por `segundos` no cache da borda. Fora do Cloudflare (testes), só chama fn().
export async function emCache(chave, segundos, fn) {
  const c = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  if (!c) return fn();
  const k = chaveCache(chave);
  const achou = await c.match(k);
  if (achou) return achou.json();
  const v = await fn();
  await c.put(k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${segundos}` } }));
  return v;
}

export async function esquecer(chave) {
  const c = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  if (c) await c.delete(chaveCache(chave));
}
