// Verificação do token (JWT RS256) que o Cloudflare Access põe em cada pedido.
// Chaves públicas em <time>.cloudflareaccess.com/cdn-cgi/access/certs.

let chaves = null;
let chavesEm = 0;

function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

const json = (parte) => JSON.parse(new TextDecoder().decode(b64url(parte)));

async function buscarChaves(team, buscar, renovar) {
  if (!renovar && chaves && Date.now() - chavesEm < 3600e3) return chaves;
  const r = await buscar(team + '/cdn-cgi/access/certs');
  if (!r.ok) throw new Error('certs ' + r.status);
  chaves = (await r.json()).keys || [];
  chavesEm = Date.now();
  return chaves;
}

export async function verificarToken(token, env, buscar = fetch, agora = Date.now() / 1000) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [h, p, s] = partes;
  const cab = json(h);
  const corpo = json(p);
  if (cab.alg !== 'RS256') return null;
  let jwk = (await buscarChaves(env.ACCESS_TEAM, buscar)).find((k) => k.kid === cab.kid);
  if (!jwk) jwk = (await buscarChaves(env.ACCESS_TEAM, buscar, true)).find((k) => k.kid === cab.kid); // chave trocada
  if (!jwk) return null;
  const chave = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) return null;
  const aud = [].concat(corpo.aud || []);
  if (!(corpo.exp > agora) || (corpo.nbf && corpo.nbf > agora + 60)) return null;
  if (corpo.iss !== env.ACCESS_TEAM || !aud.includes(env.ACCESS_AUD)) return null;
  return corpo;
}

export function _limparCache() { chaves = null; chavesEm = 0; }
