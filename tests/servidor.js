// Servidor local que imita o Cloudflare Pages: serve public/ e aplica public/_headers.
// Uso: node tests/servidor.js [porta]   (padrão 8788)
const http = require('http');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', 'public');
const porta = +process.argv[2] || 8788;
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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
  let arq = path.join(raiz, url);
  if (!arq.startsWith(raiz)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
  if (!fs.existsSync(arq)) { res.writeHead(404); return res.end('404'); }
  const cab = { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream' };
  for (const r of regras()) if (casa(r.padrao, url)) Object.assign(cab, r.cab);
  res.writeHead(200, cab); fs.createReadStream(arq).pipe(res);
}).listen(porta, () => console.log('http://localhost:' + porta));
