// Logos dos cartões do radar. A CSP do site só aceita imagens do próprio domínio, então a função busca
// o logo (Financial Modeling Prep; reserva Parqet) pelo símbolo do Yahoo e guarda no cache da borda por
// 30 dias (sem logo: 404 guardado por 1 dia). Só atende símbolos do radar, do comparador ou do catálogo,
// para não virar um proxy aberto. Nenhum dado do visitante é lido ou guardado.

export const FONTES_LOGO = [
  (s) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`,
  (s) => `https://assets.parqet.com/logos/symbol/${encodeURIComponent(s)}?format=png`,
];

export const SIMBOLO = /^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/;

// Ativo do comparador/catálogo → símbolo do Yahoo (o mesmo cálculo de public/radar/app.js)
export function simboloLogo(a) {
  if (a.mercado === 'Brasil') return a.id + '.SA';
  if (a.tipo === 'cripto') return a.id + '-USD';
  return a.id.replace('.', '-');
}

// imagens aceitas: SVG fica de fora (pode carregar script se aberto direto no domínio do site)
const TIPOS = /^image\/(png|jpe?g|webp|gif)\b/;

export async function buscarLogo(simbolo, buscar = fetch) {
  for (const f of FONTES_LOGO) {
    try {
      const r = await buscar(f(simbolo), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const tipo = r.headers.get('content-type') || '';
      if (!r.ok || !TIPOS.test(tipo)) continue;
      const corpo = await r.arrayBuffer();
      if (corpo.byteLength < 100 || corpo.byteLength > 300000) continue;
      return { corpo, tipo };
    } catch { /* tenta a próxima fonte */ }
  }
  return null;
}

// símbolos permitidos: radar (banco) + comparador e catálogo (arquivos do próprio site)
export async function permitido(simbolo, env, origem) {
  const r = await env.DB.prepare('SELECT 1 AS ok FROM radar WHERE simbolo = ?').bind(simbolo).first();
  if (r) return true;
  for (const arq of ['/data/catalogo.json', '/data/mercado.json']) {
    try {
      const res = await env.ASSETS.fetch(new URL(arq, origem));
      if (!res.ok) continue;
      const j = await res.json();
      if ((j.ativos || []).some((a) => a && a.id && simboloLogo(a) === simbolo)) return true;
    } catch { /* arquivo indisponível: segue */ }
  }
  return false;
}
