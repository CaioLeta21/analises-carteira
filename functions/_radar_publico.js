// O radar como o site mostra: ativos do banco + cotação de agora + termômetro do bitcoin.
// Só campos públicos (nada de anotação ou preço de entrada, que ficam na carteira privada).
import { cotacoes } from './_cotacoes.js';
import { dadosDiarios, precoAgora, comPreco, termometro } from './_btc.js';
import { emCache } from './_comum.js';
import { balancoNovo } from './_balancos.js';

const CAMPOS = 'simbolo, codigo, nome, tipo, mercado, moeda, preco_alvo, alvo_explicacao, atualizado_em, teto_balanco, balanco_ultimo, tese';

// tese qualitativa guardada como JSON; só passam textos curtos nos campos conhecidos
export function lerTese(t) {
  let o = null;
  try { o = typeof t === 'string' ? JSON.parse(t) : t; } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const [k, n] of [['faz', 400], ['tese', 500]]) if (typeof o[k] === 'string' && o[k].trim()) out[k] = o[k].trim().slice(0, n);
  for (const k of ['pros', 'contras', 'riscos']) {
    const l = Array.isArray(o[k]) ? o[k].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 220)).slice(0, 5) : [];
    if (l.length) out[k] = l;
  }
  return Object.keys(out).length ? out : null;
}

// Bitcoin: indicadores do dia guardados por 3 horas; preço de agora a cada pedido (o radar inteiro já fica 1 minuto em cache)
export async function btcAgora(buscar = fetch, cache = emCache) {
  const [d, p] = await Promise.all([cache('btc:diarios:v1', 3 * 3600, () => dadosDiarios(buscar)), precoAgora(buscar).catch(() => null)]);
  return comPreco(d, p ? p.preco : d.ultimo_fechamento);
}

export async function montarRadar(env, buscar = fetch, cache = emCache) {
  const itens = (await env.DB.prepare(`SELECT ${CAMPOS} FROM radar ORDER BY adicionado_em, id`).all()).results;
  const temBTC = itens.some((i) => i.simbolo === 'BTC-USD');
  const [cot, btc] = await Promise.all([
    cotacoes(itens.map((i) => i.simbolo), buscar).catch(() => ({})),
    temBTC ? btcAgora(buscar, cache).catch(() => null) : null,
  ]);
  const atualizado = itens.map((i) => i.atualizado_em).sort().pop() || null;
  return {
    atualizado_em: atualizado ? atualizado.replace(' ', 'T') + 'Z' : null,
    gerado_em: new Date().toISOString(),
    itens: itens.map((i) => {
      const { atualizado_em, teto_balanco, balanco_ultimo, tese, ...pub } = i;
      const o = { ...pub, cotacao: cot[i.simbolo] || null };
      const t = lerTese(tese);
      if (t) o.tese = t;
      const novo = balancoNovo(i);
      if (novo) o.balanco_novo = novo; // saiu balanço depois do teto: em revisão
      if (i.simbolo === 'BTC-USD' && btc) {
        const t = termometro(btc);
        o.termometro = { score: t.score, sinal: t.sinal, dados_de: t.dados_de };
        // o preço do cartão é o mesmo usado no score
        if (o.cotacao) o.cotacao = { ...o.cotacao, preco: btc.preco };
      }
      return o;
    }),
  };
}
