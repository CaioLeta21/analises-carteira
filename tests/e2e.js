// Teste de ponta a ponta com Playwright e os cabeçalhos de segurança do _headers.
// Uso: npm run e2e   (precisa de: npm i && npx playwright install chromium)
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

// BASE=https://seu-dominio node tests/e2e.js testa o site publicado em vez do servidor local.
const PORTA = 8799, BASE = process.env.BASE || 'http://localhost:' + PORTA;
const falhas = [];
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FALHA') + ' ' + msg); if (!cond) falhas.push(msg); };

(async () => {
  const srv = process.env.BASE ? null : spawn(process.execPath, [path.join(__dirname, 'servidor.js'), String(PORTA)], { stdio: 'ignore' });
  if (srv) await new Promise((r) => setTimeout(r, 600));
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    const p = await ctx.newPage();
    const erros = [], externos = [];
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    p.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) externos.push(r.url()); });
    p.on('dialog', (d) => d.accept());

    for (const pg of ['/', '/acoes-etfs/', '/simulador/', '/carteira/']) {
      await p.goto(BASE + pg); await p.waitForTimeout(1200);
      ok((await p.evaluate(() => window.__csp)).length === 0, pg + ' sem violação de CSP');
    }
    await p.goto(BASE + '/acoes-etfs/'); await p.waitForTimeout(1000);
    ok((await p.$eval('#lede', (e) => e.textContent)).includes('dividendos reinvestidos'), 'comparador gera o texto de abertura');
    ok(await p.$$eval('[data-draw="linhas"] svg path', (x) => x.length) > 10, 'comparador desenha as linhas');
    for (const per of ['15a', 'divo', '10a', '5a']) { await p.click(`.lx-periodo[data-v="${per}"]`); await p.waitForTimeout(150); }
    ok((await p.$eval('#tit-evolucao', (e) => e.textContent)).startsWith('Quanto valeria'), 'títulos mudam com o período');

    await p.goto(BASE + '/simulador/'); await p.waitForTimeout(1000);
    ok(/%$/.test(await p.$eval('#mVol', (e) => e.textContent)), 'simulador calcula a volatilidade');

    await p.goto(BASE + '/carteira/'); await p.waitForTimeout(1000);
    await p.click('#aba-ativos');
    const fs = require('fs'), tmp = path.join(require('os').tmpdir(), 'modelo-e2e.csv');
    fs.writeFileSync(tmp, require('../public/assets/js/carteira-modelo.js').MODELO_CSV);
    await p.setInputFiles('#csv', tmp); await p.waitForTimeout(800);
    ok(await p.$$eval('#corpo tr', (r) => r.length) === 7, 'carteira importa o CSV modelo');
    ok(/^R\$ [\d.]+$/.test(await p.$eval('#tot-brl', (e) => e.textContent)), 'carteira mostra o patrimônio');
    await p.waitForTimeout(600); await p.reload(); await p.waitForTimeout(1000);
    ok(await p.$$eval('#corpo tr', (r) => r.length) === 7, 'carteira continua salva depois de recarregar');

    ok(externos.length === 0, 'nenhuma requisição para outro domínio ' + (externos.length ? JSON.stringify(externos) : ''));
    ok(erros.length === 0, 'sem erros no console ' + (erros.length ? JSON.stringify(erros) : ''));
  } finally {
    await b.close(); if (srv) srv.kill();
  }
  if (falhas.length) { console.error('\n' + falhas.length + ' falha(s).'); process.exit(1); }
  console.log('\nTudo certo.');
})();
