// Alvo automático do radar: junta os números do Yahoo e pede ao Gemini (plano gratuito) o preço-alvo
// pela metodologia do dono do radar. A resposta só vale se passar nas conferências (alvo = base × múltiplo,
// distância razoável do preço, níveis em ordem). Vai para o Gemini só dado público de mercado e a
// metodologia: nada da carteira, nota ou preço de entrada.
import { grafico, resumir } from './_radar.js';

const UA = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
// cada modelo tem cota diária própria; quando uma acaba (ou o modelo não existe), passa para o próximo
export const MODELOS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemma-4-31b-it'];

export const METODOLOGIA = `Cada alvo responde à pergunta: até que preço vale a pena aportar sem pagar caro demais?

REGRA GERAL (empresas lucrativas): Alvo = lucro por ação esperado para os próximos 12 meses × P/L justo.
O P/L justo sai de três passos:
1. Histórico: comece pela média do P/L futuro (projetado) da própria empresa nos últimos 5 a 10 anos.
2. Crescimento: ajuste pelo PEG (P/L ÷ crescimento anual do lucro em %). Para empresas de crescimento, PEG entre 1 e 1,5. Se o crescimento desacelerou, desconto sobre a média.
3. Risco: desconto maior para negócios cíclicos, concentrados, regulados ou com problema recente.
Níveis: oportunidade ≈ 15–20% abaixo do alvo; pausar acima de ≈ 25–40% acima do alvo (perto do múltiplo máximo histórico).
Nunca use P/L de pico como "justo". Prefira ser conservador.

Exemplos de P/L justo já definidos (calibração): AZO 20x (média histórica, recompra); MSFT 24x (abaixo da média pelo investimento pesado em IA); MA 28x; V 26x; TMO 22x (desaceleração); GE 30x (carteira de pedidos); SYK 22x (corte de projeção); AMD 28x (PEG≈1); AVGO 22x (semicondutor é cíclico); NVDA ~25x (PEG≈1); GOOGL 22x; AMZN 28x; COST 35x (sempre com prêmio); LLY 30x (crescimento >25%); PLTR 50x (cresce ~50% a.a.); BLK 22x; CMG ~25x (recuperação incerta); WEGE3 26x (média ~31x com desconto pela margem em queda).
Lucro ainda volátil: mesmo método com desconto maior.

OUTROS CASOS:
- Pré-lucro (lucro pequeno demais para P/L): preço/vendas (ex.: TSLA 9x vendas por ação). metodo = "preco_vendas", base = receita por ação 12m.
- Cíclica no pico (ex.: memória, commodities): lucro de meio de ciclo × múltiplo baixo; nunca o lucro do pico. metodo = "meio_de_ciclo".
- Bancos, seguradoras e holdings: preço/valor patrimonial (P/VP) justo, olhando também o dividend yield. metodo = "pvp", base = valor patrimonial por ação.
- Elétricas, saneamento e outras reguladas no Brasil: P/L com desconto pelo risco regulatório, olhando o dividend yield.
- Sem lucro nem receita confiável, ou dados insuficientes: metodo = "sem_alvo" (não invente).`;

const tipos = ['trailingPeRatio', 'trailingForwardPeRatio', 'trailingPbRatio', 'trailingPsRatio', 'trailingMarketCap',
  'annualDilutedEPS', 'quarterlyDilutedEPS', 'annualTotalRevenue', 'quarterlyTotalRevenue', 'annualNetIncome', 'annualStockholdersEquity', 'annualDilutedAverageShares'];

// Séries do Yahoo (10 anos; o Yahoo publica poucos pontos dos múltiplos) + preço, máxima/mínima e dividendos de 1 ano.
export async function dadosAlvo(item, buscar = fetch) {
  const t = Math.floor(Date.now() / 1000);
  const [ts, gr] = await Promise.all([
    buscar(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(item.simbolo)}?type=${tipos.join(',')}&period1=${t - 86400 * 365 * 10}&period2=${t}`, { headers: UA }),
    grafico(item.simbolo, buscar),
  ]);
  if (!ts.ok) throw new Error('Yahoo fundamentos ' + ts.status);
  const s = {};
  for (const x of (await ts.json()).timeseries.result || []) {
    const k = x.meta.type[0];
    const pts = (x[k] || []).filter((e) => e && e.reportedValue).map((e) => [e.asOfDate, +Number(e.reportedValue.raw).toPrecision(6), e.currencyCode || undefined])
      .sort((a, b) => a[0].localeCompare(b[0]));
    if (pts.length) s[k] = pts.slice(-12).map((p) => (p[2] ? p : p.slice(0, 2)));
  }
  const q = resumir(gr);
  const trimestre = s.quarterlyDilutedEPS ? s.quarterlyDilutedEPS[s.quarterlyDilutedEPS.length - 1][0] : (s.annualDilutedEPS ? s.annualDilutedEPS[s.annualDilutedEPS.length - 1][0] : null);
  return {
    trimestre,
    dados: {
      codigo: item.codigo, nome: q.nome || item.nome, bolsa: /\.SA$/.test(item.simbolo) ? 'B3' : item.simbolo.includes('.') ? 'bolsa ' + item.simbolo.split('.').pop() : 'EUA',
      moeda: q.moeda, preco: +q.preco.toPrecision(6), data_preco: q.data, max_52s: +q.max_52s.toPrecision(6), min_52s: +q.min_52s.toPrecision(6),
      var_12m: q.var_12m == null ? null : +(q.var_12m * 100).toFixed(1), dividend_yield_12m: +(q.dividend_yield * 100).toFixed(2),
      series_yahoo: s,
      obs: 'Séries [data, valor, moeda]. trailingPeRatio = P/L dos últimos 12 meses; trailingForwardPeRatio = P/L projetado (12 meses à frente) na data. EPS = lucro por ação. Receita e lucro em unidades da moeda indicada (pode diferir da moeda da cotação).',
    },
  };
}

export function montarPrompt(dados) {
  return `Você é um analista que aplica uma metodologia fixa de preço-alvo. Use SÓ os números abaixo (não invente dados; pode usar conhecimento geral sobre o negócio da empresa para julgar crescimento e risco).

METODOLOGIA:
${METODOLOGIA}

DADOS (${dados.data_preco}):
${JSON.stringify(dados)}

Responda só com JSON neste formato:
{"metodo": "pl_futuro" | "preco_vendas" | "meio_de_ciclo" | "pvp" | "sem_alvo",
 "base": número (lucro por ação esperado 12m, receita por ação, lucro de meio de ciclo ou valor patrimonial por ação, na moeda da cotação) ou null,
 "multiplo": número (P/L, P/S ou P/VP justo) ou null,
 "alvo": número = base × multiplo, na moeda da cotação, ou null,
 "oportunidade": número ou null, "pausar": número ou null,
 "explicacao": "em português do Brasil, 2 a 4 frases curtas, até 600 caracteres, para um leitor leigo: qual o método, os números usados (base e múltiplo) e por que esse múltiplo (histórico, crescimento, risco). Sem recomendar compra."}`;
}

// Confere a resposta; devolve o resultado limpo ou lança erro com o motivo.
export function validar(r, preco) {
  if (!r || typeof r !== 'object') throw new Error('resposta sem JSON');
  const metodos = ['pl_futuro', 'preco_vendas', 'meio_de_ciclo', 'pvp', 'sem_alvo'];
  if (!metodos.includes(r.metodo)) throw new Error('método desconhecido: ' + r.metodo);
  const explicacao = String(r.explicacao || '').trim().replace(/\s+/g, ' ');
  if (r.metodo === 'sem_alvo') return { metodo: 'sem_alvo', alvo: null, explicacao: explicacao.slice(0, 900) };
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const base = n(r.base), multiplo = n(r.multiplo), alvo = n(r.alvo);
  if (!base || !multiplo || !alvo) throw new Error('faltam base, múltiplo ou alvo');
  if (Math.abs(base * multiplo / alvo - 1) > 0.03) throw new Error(`alvo ${alvo} ≠ base ${base} × múltiplo ${multiplo}`);
  if (alvo < preco * 0.25 || alvo > preco * 3) throw new Error(`alvo ${alvo} longe demais do preço ${preco}`);
  const op = n(r.oportunidade), pa = n(r.pausar);
  if ((op && op >= alvo) || (pa && pa <= alvo)) throw new Error('níveis fora de ordem');
  if (explicacao.length < 40) throw new Error('explicação curta demais');
  const arred = (v) => (v == null ? null : +v.toPrecision(v >= 100 ? 5 : 4));
  return { metodo: r.metodo, base: arred(base), multiplo: +multiplo.toFixed(1), alvo: arred(alvo), oportunidade: arred(op), pausar: arred(pa), explicacao: explicacao.slice(0, 900) };
}

export function extrairJSON(texto) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(texto);
  const corpo = m ? m[1] : texto;
  const i = corpo.indexOf('{');
  if (i < 0) throw new Error('sem JSON na resposta');
  let prof = 0, aspas = false;
  for (let k = i; k < corpo.length; k++) {
    const c = corpo[k];
    if (aspas) { if (c === '\\') k++; else if (c === '"') aspas = false; continue; }
    if (c === '"') aspas = true;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return JSON.parse(corpo.slice(i, k + 1));
  }
  throw new Error('JSON incompleto');
}

// Chama o Gemini trocando de modelo quando a cota acaba. Devolve { modelo, resposta (objeto) }.
export async function perguntarGemini(prompt, chave, buscar = fetch, modelos = MODELOS, esgotados = new Set()) {
  const falhas = [];
  for (const modelo of modelos) {
    if (esgotados.has(modelo)) continue;
    const cfg = { temperature: 0.2 };
    if (modelo.startsWith('gemini')) cfg.responseMimeType = 'application/json';
    const r = await buscar(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: cfg }),
    });
    if (r.status === 429 || r.status === 404 || r.status === 400 || r.status >= 500) { falhas.push(modelo + ' ' + r.status); esgotados.add(modelo); continue; }
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    const texto = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => (p.thought ? '' : p.text || '')).join('');
    try { return { modelo, resposta: extrairJSON(texto) }; } catch (e) { falhas.push(modelo + ': ' + e.message); }
  }
  throw new Error('Gemini indisponível (' + falhas.join('; ') + ')');
}

const dataBR = (d) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);

// Calcula o alvo de um item do radar. Devolve o que gravar: { preco_alvo, alvo_explicacao, alvo_auto }.
// Para ETF e FII não calcula (a metodologia deles é aporte contínuo / P/L do índice).
export async function calcularAlvo(item, env, buscar = fetch) {
  if (!env.GEMINI_API_KEY) throw new Error('sem GEMINI_API_KEY');
  if (item.tipo !== 'acao') throw new Error('alvo automático só para ações');
  const { dados, trimestre } = await dadosAlvo(item, buscar);
  const prompt = montarPrompt(dados);
  let ultimoErro;
  const esgotados = new Set();
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { modelo, resposta } = await perguntarGemini(prompt, env.GEMINI_API_KEY, buscar, MODELOS, esgotados);
    try {
      const v = validar(resposta, dados.preco);
      const hoje = new Date().toISOString().slice(0, 10);
      const auto = { ...v, modelo, em: hoje, trimestre, preco: dados.preco };
      if (!v.alvo) return { preco_alvo: null, alvo_explicacao: null, alvo_auto: auto };
      const niveis = [v.oportunidade ? 'oportunidade perto de ' + v.oportunidade.toLocaleString('pt-BR') : null, v.pausar ? 'pausar acima de ' + v.pausar.toLocaleString('pt-BR') : null].filter(Boolean).join('; ');
      const explicacao = (v.explicacao + (niveis ? ' Níveis: ' + niveis + '.' : '') + ` Calculado automaticamente em ${dataBR(hoje)} com os balanços até ${trimestre ? dataBR(trimestre) : '—'}; recalculado a cada balanço novo.`).slice(0, 1500);
      return { preco_alvo: v.alvo, alvo_explicacao: explicacao, alvo_auto: auto };
    } catch (e) { ultimoErro = e; }
  }
  throw new Error('resposta do Gemini recusada: ' + ultimoErro.message);
}

// Grava o resultado (ou o erro, para não tentar de novo a cada abertura da página).
export async function gravarAlvo(env, id, item, buscar = fetch) {
  try {
    const r = await calcularAlvo(item, env, buscar);
    await env.DB.prepare('UPDATE radar SET preco_alvo = ?, alvo_explicacao = ?, alvo_auto = ? WHERE id = ?')
      .bind(r.preco_alvo, r.alvo_explicacao, JSON.stringify(r.alvo_auto), id).run();
    return { ok: true, ...r };
  } catch (e) {
    const erro = String(e.message || e).slice(0, 300);
    await env.DB.prepare('UPDATE radar SET alvo_auto = ? WHERE id = ? AND preco_alvo IS NULL').bind(JSON.stringify({ erro, em: new Date().toISOString().slice(0, 10) }), id).run();
    return { ok: false, erro };
  }
}

// Worker diário: ações sem alvo (ainda não calculado, ou que falhou antes de hoje) e alvos automáticos
// com balanço novo publicado. No máximo `limite` chamadas ao Gemini por rodada.
export async function recalcularAlvos(env, limite = 4, buscar = fetch) {
  if (!env.GEMINI_API_KEY) return { feitos: [], aviso: 'sem GEMINI_API_KEY' };
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = (await env.DB.prepare("SELECT id, simbolo, codigo, nome, tipo, preco_alvo, alvo_auto FROM radar WHERE tipo = 'acao' ORDER BY id").all()).results;
  const feitos = [];
  for (const i of itens) {
    if (feitos.length >= limite) break;
    let auto = null; try { auto = i.alvo_auto ? JSON.parse(i.alvo_auto) : null; } catch { auto = null; }
    let precisa = false;
    if (i.preco_alvo == null && (!auto || (auto.erro && auto.em < hoje))) precisa = true;
    // alvo automático (ou "sem alvo" automático) de antes de hoje: recalcula se saiu balanço novo.
    // Alvo digitado à mão não tem alvo_auto e nunca é trocado.
    else if (auto && !auto.erro && auto.em < hoje) {
      // balanço novo? (só o lucro trimestral, 1 chamada barata)
      try {
        const t = Math.floor(Date.now() / 1000);
        const r = await buscar(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(i.simbolo)}?type=quarterlyDilutedEPS&period1=${t - 86400 * 400}&period2=${t}`, { headers: UA });
        const x = ((await r.json()).timeseries.result || [])[0];
        const pts = ((x && x.quarterlyDilutedEPS) || []).filter((e) => e && e.reportedValue).map((e) => e.asOfDate).sort();
        precisa = pts.length > 0 && (!auto.trimestre || pts[pts.length - 1] > auto.trimestre);
      } catch { precisa = false; }
    }
    if (!precisa) continue;
    const r = await gravarAlvo(env, i.id, i, buscar);
    feitos.push({ codigo: i.codigo, ok: r.ok, alvo: r.preco_alvo || null, erro: r.erro || null });
  }
  return { feitos };
}
