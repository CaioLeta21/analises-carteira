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
    ok((await p.$eval('#total-editor', (e) => e.textContent)) === (await p.$eval('#tot-brl', (e) => e.textContent)), 'editor mostra o total no rodapé');
    ok(/Moderada .*CDI/.test(await p.$eval('#resumo-comp', (e) => e.textContent)), 'carteira se compara com Moderada e CDI');
    await p.click('#ordenar'); await p.waitForTimeout(200);
    const vals = await p.$$eval('#corpo tr td.num span:first-child', (s) => s.map((x) => +x.textContent.replace(/\D/g, '')));
    ok(vals.every((v, i) => !i || vals[i - 1] >= v), 'ordenar por valor');
    await p.click('#add'); await p.waitForTimeout(200);
    ok(await p.$eval('#corpo tr:last-child', (t) => t.classList.contains('alerta')), 'linha sem quantidade nem valor fica destacada');
    await p.click('#corpo tr:last-child .rem'); await p.waitForTimeout(300);
    await p.waitForTimeout(600); await p.reload(); await p.waitForTimeout(1000);
    ok(await p.$$eval('#corpo tr', (r) => r.length) === 7, 'carteira continua salva depois de recarregar');

    // backup com senha, restaurado num navegador novo: a carteira de exemplo sai
    await p.fill('#senha', 'teste123');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportar')]);
    const arqBackup = path.join(require('os').tmpdir(), 'backup-e2e.json'); await dl.saveAs(arqBackup);
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const p2 = await ctx2.newPage(); p2.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) externos.push(r.url()); });
    await p2.goto(BASE + '/carteira/'); await p2.waitForTimeout(1000);
    await p2.fill('#senha', 'teste123'); await p2.setInputFiles('#importar', arqBackup); await p2.waitForTimeout(1500);
    ok(await p2.$$eval('#sel option', (o) => o.length) === 1, 'backup restaurado substitui a carteira de exemplo');
    ok(await p2.$$eval('#corpo tr', (r) => r.length) === 7, 'backup restaurado traz as posições');
    await ctx2.close();

    const cel = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    for (const pg of ['/', '/acoes-etfs/', '/simulador/', '/carteira/']) {
      await cel.goto(BASE + pg); await cel.waitForTimeout(1000);
      ok(!(await cel.evaluate(() => document.documentElement.scrollWidth > innerWidth)), pg + ' sem rolagem lateral em 390 px');
    }
    await cel.click('#aba-ativos'); await cel.click('#add'); await cel.waitForTimeout(300);
    ok((await cel.$eval('#corpo tr', (t) => getComputedStyle(t).display)) === 'grid', 'editor vira cartões no celular');
    ok(!(await cel.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'editor em cartões sem rolagem lateral');
    await cel.close();

    ok(externos.length === 0, 'nenhuma requisição para outro domínio ' + (externos.length ? JSON.stringify(externos) : ''));
    ok(erros.length === 0, 'sem erros no console ' + (erros.length ? JSON.stringify(erros) : ''));
  } finally {
    await b.close(); if (srv) srv.kill();
  }
  if (falhas.length) { console.error('\n' + falhas.length + ' falha(s).'); process.exit(1); }
  console.log('\nTudo certo.');
})();
