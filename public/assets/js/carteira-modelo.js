/* Modelo da carteira do usuário: categorias, leitura e escrita de CSV, pesos e valores.
   Sem acesso a rede. Funciona no navegador (window.CarteiraModelo) e no Node (testes). */
(function (root) {
  'use strict';

  const CATEGORIAS = [
    { k: 'rfbr', nome: 'Renda fixa Brasil', cor: '#2E6BB5', brasil: true },
    { k: 'rfex', nome: 'Renda fixa exterior', cor: '#2BA58A', brasil: false },
    { k: 'ouro', nome: 'Ouro', cor: '#C9A227', brasil: false },
    { k: 'alt', nome: 'Alternativos', cor: '#8C8C8C', brasil: false },
    { k: 'rvex', nome: 'Renda variável exterior', cor: '#E07B39', brasil: false },
    { k: 'rvbr', nome: 'Renda variável Brasil', cor: '#D97AA5', brasil: true },
  ];
  const CHAVES = CATEGORIAS.map((c) => c.k);
  // Os mesmos exemplos do simulador (public/simulador/app.js, PRESETS).
  const EXEMPLOS = {
    Conservadora: { rfbr: 70, rfex: 15, ouro: 5, alt: 0, rvex: 5, rvbr: 5 },
    Moderada: { rfbr: 45, rfex: 15, ouro: 8, alt: 5, rvex: 17, rvbr: 10 },
    Arrojada: { rfbr: 25, rfex: 10, ouro: 10, alt: 5, rvex: 35, rvbr: 15 },
  };

  // nomes aceitos no CSV para cada categoria (sem acento, minúsculas)
  const SINONIMOS = {
    rfbr: ['rfbr', 'renda fixa brasil', 'renda fixa', 'rf brasil', 'cdi', 'tesouro', 'cdb', 'lci', 'lca', 'debenture', 'credito privado'],
    rfex: ['rfex', 'renda fixa exterior', 'rf exterior', 'bonds', 'treasury', 'treasuries'],
    ouro: ['ouro', 'gold'],
    alt: ['alt', 'alternativos', 'alternativo', 'multimercado', 'hedge fund', 'hedge funds', 'cripto', 'criptomoedas', 'bitcoin', 'private equity', 'venture capital'],
    rvex: ['rvex', 'renda variavel exterior', 'acoes exterior', 'acoes eua', 'stocks', 'etf exterior', 'reits'],
    rvbr: ['rvbr', 'renda variavel brasil', 'acoes brasil', 'acoes', 'fii', 'fiis', 'fundos imobiliarios', 'etf brasil'],
  };
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function categoriaDe(texto) {
    const t = semAcento(texto);
    if (!t) return null;
    for (const k of CHAVES) if (SINONIMOS[k].includes(t)) return k;
    return null;
  }

  /* Categoria padrão de um ativo conhecido (dados de /data/mercado.json). */
  function categoriaPadrao(info) {
    if (!info) return null;
    if (info.categoria && CHAVES.includes(info.categoria)) return info.categoria; // ativos do catálogo já dizem
    if (info.id === 'CDI') return 'rfbr';
    if (info.tipo === 'cripto') return 'alt';
    return info.mercado === 'Brasil' ? 'rvbr' : 'rvex';
  }

  function novaCarteira(nome) {
    const agora = new Date().toISOString();
    return { versao: 1, id: 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36), nome: nome || 'Minha carteira',
      criadaEm: agora, atualizadaEm: agora, modo: 'categorias', patrimonio: 1000000,
      categorias: { rfbr: 40, rfex: 15, ouro: 5, alt: 5, rvex: 25, rvbr: 10 }, ativos: [], intocada: true };
  }

  /* Ao restaurar um backup: a carteira de exemplo criada na primeira visita, se for a única e
     nunca tiver sido editada, sai para não ficar ao lado das restauradas. Devolve os ids a apagar. */
  function idsParaSubstituir(existentes, restauradas) {
    if (!restauradas.length || existentes.length !== 1 || !existentes[0].intocada) return [];
    return restauradas.some((c) => c.id === existentes[0].id) ? [] : [existentes[0].id];
  }

  /* ---------- CSV (separador vírgula ou ponto e vírgula; decimal com vírgula ou ponto) */
  /* br = true quando o arquivo usa ";" como separador (padrão do Excel em português):
     aí o ponto é separador de milhar e a vírgula é decimal ("1.000,50"). */
  function numeroBR(s, br) {
    if (s == null) return null;
    let t = String(s).trim().replace(/[R$US\s]/g, '');
    if (!t) return null;
    if (br) t = t.replace(/\./g, '').replace(',', '.');
    else if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (t.includes(',')) t = t.replace(',', '.');
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }
  function dividirLinha(l, sep) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  }

  const COLUNAS = { codigo: ['codigo', 'ativo', 'ticker', 'papel'], nome: ['nome', 'descricao'], categoria: ['categoria', 'classe', 'tipo'],
    quantidade: ['quantidade', 'qtd', 'cotas'], valor: ['valor', 'valor atual', 'saldo', 'posicao'], moeda: ['moeda'] };

  /* Lê o CSV e devolve { ativos, avisos }. infoPorCodigo: mapa de ativos conhecidos. */
  function lerCSV(texto, infoPorCodigo) {
    const linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!linhas.length) return { ativos: [], avisos: ['Arquivo vazio.'] };
    const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
    const cab = dividirLinha(linhas[0], sep).map(semAcento);
    const idx = {};
    for (const [campo, nomes] of Object.entries(COLUNAS)) idx[campo] = cab.findIndex((c) => nomes.includes(c));
    const avisos = [];
    if (idx.codigo < 0 && idx.nome < 0) return { ativos: [], avisos: ['O CSV precisa de uma coluna "codigo" ou "nome".'] };
    if (idx.quantidade < 0 && idx.valor < 0) return { ativos: [], avisos: ['O CSV precisa de uma coluna "quantidade" ou "valor".'] };
    const ativos = [];
    linhas.slice(1).forEach((l, i) => {
      const v = dividirLinha(l, sep), get = (c) => (idx[c] >= 0 ? v[idx[c]] : '');
      const codigo = String(get('codigo')).toUpperCase().replace(/\.SA$/, '');
      const info = infoPorCodigo && infoPorCodigo[codigo];
      let categoria = categoriaDe(get('categoria')) || categoriaPadrao(info);
      const br = sep === ';', quantidade = numeroBR(get('quantidade'), br), valor = numeroBR(get('valor'), br);
      const moeda = (String(get('moeda')).toUpperCase() || (info ? info.moeda : 'BRL')) === 'USD' ? 'USD' : 'BRL';
      if (!codigo && !get('nome')) return;
      if (!categoria) { avisos.push(`Linha ${i + 2}: categoria não reconhecida para "${codigo || get('nome')}"; usei Renda variável Brasil.`); categoria = 'rvbr'; }
      if (quantidade == null && valor == null) { avisos.push(`Linha ${i + 2}: sem quantidade nem valor; linha ignorada.`); return; }
      if (quantidade != null && !info && valor == null) avisos.push(`Linha ${i + 2}: "${codigo}" não está na base de preços; informe o valor.`);
      ativos.push({ codigo, nome: get('nome') || (info ? info.nome : codigo), categoria, quantidade, valor, moeda });
    });
    return { ativos, avisos };
  }

  function escreverCSV(ativos) {
    const esc = (x) => (x == null ? '' : /[",;\n]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : String(x));
    const linhas = ['codigo,nome,categoria,quantidade,valor,moeda'];
    for (const a of ativos) linhas.push([a.codigo, a.nome, a.categoria, a.quantidade, a.valor, a.moeda].map(esc).join(','));
    return linhas.join('\n') + '\n';
  }

  const MODELO_CSV = 'codigo,nome,categoria,quantidade,valor,moeda\n' +
    'ITUB3,Itaú ON,rvbr,1000,,BRL\nDIVO11,ETF de dividendos,rvbr,500,,BRL\nQQQ,ETF Nasdaq-100,rvex,20,,USD\n' +
    'BTC,Bitcoin,alt,0.05,,USD\n,Tesouro Selic 2029,rfbr,,250000,BRL\n,CDB Banco X,rfbr,,100000,BRL\n,Fundo multimercado Y,alt,,80000,BRL\n';

  /* Último preço de cada ativo conhecido, em reais. catalogo (opcional): /data/catalogo.json. */
  function precosAtuais(mercado, catalogo) {
    const fx = mercado.usdbrl[mercado.usdbrl.length - 1], out = {};
    if (catalogo && catalogo.ultimo_mes === mercado.ultimo_mes) {
      for (const a of catalogo.ativos) out[a.id] = { info: a, brl: a.moeda === 'BRL' ? a.preco : a.preco * fx, original: a.preco };
    }
    for (const a of mercado.ativos) {
      const p = a.precos[a.precos.length - 1];
      out[a.id] = { info: a, brl: a.moeda === 'BRL' ? p : p * fx, original: p };
    }
    return { fx, precos: out };
  }

  /* Valor em reais de cada linha: valor informado tem prioridade; senão quantidade × preço.
     Para ativos da base, "preço" é o fechamento ajustado (aproxima o preço de tela). */
  function valorar(ativos, atuais) {
    return ativos.map((a) => {
      let brl = null, origem = '';
      if (a.valor != null) { brl = a.moeda === 'USD' ? a.valor * atuais.fx : a.valor; origem = 'valor informado'; }
      else if (a.quantidade != null && atuais.precos[a.codigo]) { brl = a.quantidade * atuais.precos[a.codigo].brl; origem = 'quantidade × último preço'; }
      return { ...a, valorBRL: brl, origem };
    });
  }

  /* Problemas de uma linha, para mostrar na hora. info: mapa de ativos conhecidos. */
  function problemasLinha(a, info) {
    const out = [];
    const conhecido = !!(info && info[a.codigo]);
    if (a.quantidade == null && a.valor == null) out.push('Informe a quantidade ou o valor.');
    else if (a.valor == null && !conhecido) out.push(a.codigo ? '"' + a.codigo + '" não está na base de preços: informe o valor.' : 'Sem código: informe o valor.');
    if (conhecido && a.valor != null && a.quantidade != null) out.push('Valor informado tem prioridade sobre a quantidade.');
    return out;
  }

  /* Ordena as linhas pelo valor em reais, do maior para o menor (sem valor vão para o fim). */
  function ordenarPorValor(ativos, atuais) {
    const v = valorar(ativos, atuais);
    return ativos.map((a, i) => [a, v[i].valorBRL]).sort((x, y) => (y[1] ?? -1) - (x[1] ?? -1)).map((x) => x[0]);
  }

  /* Pesos por categoria (somam 1) e patrimônio total em reais. */
  function pesosPorCategoria(carteira, atuais) {
    if (carteira.modo === 'categorias') {
      const t = CHAVES.reduce((s, k) => s + (+carteira.categorias[k] || 0), 0) || 1;
      return { pesos: Object.fromEntries(CHAVES.map((k) => [k, (+carteira.categorias[k] || 0) / t])), total: carteira.patrimonio || 0 };
    }
    const linhas = valorar(carteira.ativos, atuais);
    const soma = Object.fromEntries(CHAVES.map((k) => [k, 0]));
    let total = 0;
    for (const l of linhas) if (l.valorBRL != null) { soma[l.categoria] += l.valorBRL; total += l.valorBRL; }
    return { pesos: Object.fromEntries(CHAVES.map((k) => [k, total ? soma[k] / total : 0])), total, linhas };
  }

  const api = { CATEGORIAS, CHAVES, EXEMPLOS, categoriaDe, categoriaPadrao, novaCarteira, idsParaSubstituir, problemasLinha, ordenarPorValor, numeroBR, lerCSV, escreverCSV, MODELO_CSV, precosAtuais, valorar, pesosPorCategoria };
  root.CarteiraModelo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
