// Servidor local que imita o Cloudflare Pages: serve public/ e aplica public/_headers.
// Uso: node tests/servidor.js [porta]   (padrão 8788)
const http = require('http');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', 'public');
const porta = +process.argv[2] || 8788;
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
function regras() {
  const out = []; let atual = null;
  for (const l of fs.readFileSync(path.join(raiz, '_headers'), 'utf8').split('\n')) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (!/^\s/.test(l)) { atual = { padrao: l.trim(), cab: {} }; out.push(atual); } else if (atual) { const i = l.indexOf(':'); atual.cab[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
  }
  return out;
}
const casa = (padrao, url) => new RegExp('^' + padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(url);
http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  // /api/radar é uma função do Pages (functions/); aqui responde com a cópia do radar, sem rede
  if (url === '/api/radar') {
    const copia = JSON.parse(fs.readFileSync(path.join(raiz, 'data', 'radar.json'), 'utf8'));
    copia.gerado_em = new Date().toISOString();
    // a API de verdade põe o score do termômetro no bitcoin
    for (const i of copia.itens) if (i.codigo === 'BTC') i.termometro = { score: 0.875, sinal: 'COMPRA', dados_de: '2026-11-15' };
    // cotação de agora com dia e faixa de 52 semanas (régua do cartão)
    for (const i of copia.itens) if (i.codigo === 'AMZN') i.cotacao = { preco: 250, moeda: 'USD', hora: copia.gerado_em, a12: 0.1, var_dia: -0.012, min_52s: 198.79, max_52s: 284.02, fonte: 'Yahoo Finance' };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(copia));
  }
  // /api/logo/<símbolo> também é função; aqui devolve o ícone do site (sem rede)
  if (url.startsWith('/api/logo/')) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return fs.createReadStream(path.join(raiz, 'assets', 'icones', 'favicon-32.png')).pipe(res);
  }
  let arq = path.join(raiz, url);
  if (!arq.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
  if (!fs.existsSync(arq)) { res.writeHead(404, { 'Content-Type': tipos['.html'] }); return fs.createReadStream(path.join(raiz, '404.html')).pipe(res); }
  const cab = { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream' };
  for (const r of regras()) if (casa(r.padrao, url)) Object.assign(cab, r.cab);
  res.writeHead(200, cab); fs.createReadStream(arq).pipe(res);
}).listen(porta, () => console.log('http://localhost:' + porta));
