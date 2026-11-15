// O radar como o site mostra: ativos do banco + cotação de agora + termômetro do bitcoin.
// Só campos públicos (nada de anotação ou preço de entrada, que ficam na carteira privada).
import { cotacoes } from './_cotacoes.js';
import { dadosDiarios, precoAgora, comPreco, termometro } from './_btc.js';
import { emCache } from './_comum.js';

const CAMPOS = 'simbolo, codigo, nome, tipo, mercado, moeda, preco_alvo, alvo_explicacao, atualizado_em';

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
      const { atualizado_em, ...pub } = i;
      const o = { ...pub, cotacao: cot[i.simbolo] || null };
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
