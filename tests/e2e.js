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
    // catálogo: adicionar e tirar um ativo
    await p.fill('#busca-ativo', 'PETR4'); await p.click('#add-ativo'); await p.waitForLoadState('load'); await p.waitForTimeout(1200);
    ok(await p.$('.lx-leg[data-t="PETR4"]') !== null, 'comparador adiciona ativo do catálogo');
    ok((await p.$$eval('#tabela-longa tbody tr td:first-child, #tabela tbody tr td:first-child', (t) => t.map((x) => x.textContent))).includes('PETR4'), 'ativo adicionado entra na tabela');
    await p.click('.rem-ext'); await p.waitForLoadState('load'); await p.waitForTimeout(1000);
    ok(await p.$('.lx-leg[data-t="PETR4"]') === null, 'comparador tira o ativo adicionado');

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
    // ativo do catálogo digitado na hora: valor pelo último preço e linha de desempenho
    await p.click('#add'); await p.waitForTimeout(200);
    const ult = '#corpo tr:last-child';
    await p.fill(ult + ' td.cod input', 'VALE3'); await p.press(ult + ' td.cod input', 'Tab'); await p.waitForTimeout(400);
    await p.fill('#corpo tr:last-child td:nth-child(4) input', '100'); await p.waitForTimeout(1500);
    ok(/^R\$ [\d.]+$/.test(await p.$eval('#corpo tr:last-child td.num span', (e) => e.textContent)), 'ativo do catálogo ganha valor pelo último preço');
    ok((await p.$$eval('#corpo-pos tr td:first-child', (t) => t.map((x) => x.textContent))).includes('VALE3'), 'ativo do catálogo aparece no desempenho');
    await p.click('#corpo tr:last-child .rem'); await p.waitForTimeout(300);
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

    // modo "só arquivo": nada fica no aparelho
    const ctx3 = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const p3 = await ctx3.newPage(); p3.on('dialog', (d) => d.accept());
    p3.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) externos.push(r.url()); });
    await p3.goto(BASE + '/carteira/'); await p3.waitForTimeout(1000);
    await p3.check('#guarda-arquivo'); await p3.waitForTimeout(300);
    await p3.fill('#cat-ouro', '33'); await p3.waitForTimeout(700);
    const noAparelho = () => p3.evaluate(() => new Promise((ok) => { const r = indexedDB.open('analises-carteira', 1); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains('carteiras')) return ok(0); const q = db.transaction('carteiras').objectStore('carteiras').count(); q.onsuccess = () => ok(q.result); }; r.onerror = () => ok(-1); }));
    ok(await noAparelho() === 0, 'só arquivo: nada gravado no IndexedDB');
    ok(/Baixe antes de sair/.test(await p3.$eval('#status-arquivo', (e) => e.textContent)), 'só arquivo: avisa que há mudanças não baixadas');
    const [dl3] = await Promise.all([p3.waitForEvent('download'), p3.click('#baixar-arquivo')]);
    const arq3 = path.join(require('os').tmpdir(), 'so-arquivo-e2e.json'); await dl3.saveAs(arq3);
    await p3.reload(); await p3.waitForTimeout(1000);
    ok(await p3.isChecked('#guarda-arquivo') && (await p3.inputValue('#cat-ouro')) !== '33', 'só arquivo: depois de recarregar, a carteira não está no aparelho');
    await p3.setInputFiles('#importar', arq3); await p3.waitForTimeout(1200);
    ok((await p3.inputValue('#cat-ouro')) === '33' && await noAparelho() === 0, 'só arquivo: abrir o arquivo traz a carteira sem gravar no aparelho');
    await p3.check('#guarda-navegador'); await p3.waitForTimeout(500);
    ok(await noAparelho() === 1, 'voltar para o navegador grava a carteira de novo');
    await ctx3.close();

    // acabamento: 404, fontes próprias, imagem de compartilhamento
    const pf = await ctx.newPage();
    const r404 = await pf.goto(BASE + '/nao-existe/'); await pf.waitForTimeout(300);
    ok(r404.status() === 404 && (await pf.title()).includes('não encontrada'), 'página 404');
    await pf.goto(BASE + '/'); await pf.waitForTimeout(800);
    ok(await pf.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px "IBM Plex Sans"') && [...document.fonts].some((f) => f.family.includes('IBM Plex Sans') && f.status === 'loaded'); }), 'fonte IBM Plex carregada do próprio site');
    const og = await pf.$eval('meta[property="og:image"]', (m) => m.content);
    ok((await p.request.get(BASE + new URL(og).pathname)).ok(), 'imagem de compartilhamento existe');
    await pf.close();

    // instalável: manifesto e ícones
    const man = await (await p.request.get(BASE + '/manifest.webmanifest')).json();
    ok(man.start_url === '/carteira/' && man.icons.length >= 2, 'manifesto da Tela de Início');
    for (const ic of man.icons) ok((await p.request.get(BASE + ic.src)).ok(), 'ícone ' + ic.src);

    // acessibilidade (WCAG 2 A e AA) com o axe-core, nos dois temas
    const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    const auditar = async (pg, rotulo) => {
      await pg.evaluate(axe);
      const r = await pg.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] }));
      ok(r.violations.length === 0, rotulo + ' sem problemas de acessibilidade ' + (r.violations.length ? JSON.stringify(r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', '))) : ''));
    };
    await p.click('#add'); await p.waitForTimeout(200);
    await auditar(p, 'carteira preenchida (claro)');
    await p.click('#corpo tr:last-child .rem'); await p.waitForTimeout(200);
    for (const tema of ['light', 'dark']) {
      const pa = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: tema });
      for (const pg of ['/', '/acoes-etfs/', '/simulador/', '/carteira/']) { await pa.goto(BASE + pg); await pa.waitForTimeout(800); await auditar(pa, pg + ' (' + tema + ')'); }
      await pa.close();
    }
    // abas da carteira pelo teclado
    await p.focus('#aba-ativos'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => document.activeElement.id === 'aba-categorias' && !document.getElementById('painel-categorias').hidden), 'abas trocam com as setas do teclado');
    await p.keyboard.press('End');

    ok(externos.length === 0, 'nenhuma requisição para outro domínio ' + (externos.length ? JSON.stringify(externos) : ''));
    ok(erros.length === 0, 'sem erros no console ' + (erros.length ? JSON.stringify(erros) : ''));
  } finally {
    await b.close(); if (srv) srv.kill();
  }
  if (falhas.length) { console.error('\n' + falhas.length + ' falha(s).'); process.exit(1); }
  console.log('\nTudo certo.');
})();
