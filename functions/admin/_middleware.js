// Porteiro de /admin/ (página e API de edição do radar). O Cloudflare Access pede o login antes de
// chegar aqui (mesmo app da carteira privada); mesmo assim cada pedido só passa com o token do Access
// válido e do e-mail do dono (segredo EMAIL_DONO). Sem configuração, ninguém entra.
import { verificarToken } from '../_access.js';

const SEGURANCA = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
};

const negar = (status, texto) => new Response(texto, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SEGURANCA } });

function cookie(req, nome) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'));
  return m ? m[1] : null;
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD || !env.EMAIL_DONO) return negar(403, 'Edição não configurada.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request, 'CF_Authorization');
  let quem = null;
  try { quem = token ? await verificarToken(token, env) : null; } catch { quem = null; }
  if (!quem || String(quem.email || '').toLowerCase() !== env.EMAIL_DONO.toLowerCase()) return negar(403, 'Acesso negado.');
  // escrita só a partir da própria página (protege contra formulário de outro site usando o cookie)
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origem = request.headers.get('Origin');
    if (!origem || origem !== new URL(request.url).origin) return negar(403, 'Origem não permitida.');
  }
  const r = await ctx.next();
  const out = new Response(r.body, r);
  for (const [k, v] of Object.entries(SEGURANCA)) out.headers.set(k, v);
  return out;
}
