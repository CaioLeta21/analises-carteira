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
    // No domínio próprio, a Cloudflare injeta no HTML dois scripts dela (detecção de robôs e o
    // contador do Web Analytics da zona letabuild.com). A CSP do site os bloqueia, então nada sai do
    // navegador; o teste os remove antes de a página carregar para conferir só o código do site.
    await ctx.route((u) => u.href.startsWith(BASE), async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const r = await route.fetch();
      const html = (await r.text()).replace(/<script>\(function\(\)\{[^<]*__CF\$cv\$params[^<]*<\/script>/g, '')
        .replace(/<script[^>]*static\.cloudflareinsights\.com[^>]*><\/script>/g, '');
      await route.fulfill({ response: r, body: html });
    });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => { if (!e.blockedURI.startsWith('https://static.cloudflareinsights.com/')) window.__csp.push(e.violatedDirective + ' ' + e.blockedURI); }); });
    const p = await ctx.newPage();
    const erros = [], externos = [];
    // contador da Cloudflare que escape da remoção acima (navegações servidas sem passar pela rota)
    const CF = 'https://static.cloudflareinsights.com/';
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes(CF)) erros.push(m.text()); });
    p.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && !r.url().startsWith(CF)) externos.push(r.url()); });
    p.on('dialog', (d) => d.accept());

    for (const pg of ['/', '/acoes-etfs/', '/radar/', '/simulador/', '/carteira/']) {
      await p.goto(BASE + pg); await p.waitForTimeout(1200);
      ok((await p.evaluate(() => window.__csp)).length === 0, pg + ' sem violação de CSP');
    }
    await p.goto(BASE + '/acoes-etfs/'); await p.waitForTimeout(1000);
    ok((await p.$eval('#lede', (e) => e.textContent)).includes('dividendos reinvestidos'), 'comparador gera o texto de abertura');
    ok((await p.$eval('h1', (e) => e.textContent)) === 'Ações, ETFs e bitcoin em dólar e em real', 'comparador: título sem o IPO do Google');
    ok(await p.$eval('.lx-periodo[data-v="ipo"]', (e) => e.getAttribute('aria-pressed') === 'true'), 'comparador abre na janela desde o IPO do Google');
    await p.click('.lx-periodo[data-v="20a"]'); await p.waitForTimeout(150);
    ok(/^Quanto valeria cada 100 aplicado em (out|nov|dez)\/2006/.test(await p.$eval('#tit-evolucao', (e) => e.textContent)), 'janela de 20 anos');
    ok(await p.$$eval('[data-draw="linhas"] svg path', (x) => x.length) > 10, 'comparador desenha as linhas');
    for (const per of ['15a', 'divo', '10a', '5a']) { await p.click(`.lx-periodo[data-v="${per}"]`); await p.waitForTimeout(150); }
    ok((await p.$eval('#tit-evolucao', (e) => e.textContent)).startsWith('Quanto valeria'), 'títulos mudam com o período');
    // catálogo: adicionar e tirar um ativo
    await p.fill('#busca-ativo', 'PETR4'); await p.click('#add-ativo'); await p.waitForLoadState('load'); await p.waitForTimeout(1200);
    ok(await p.$('.lx-leg[data-t="PETR4"]') !== null, 'comparador adiciona ativo do catálogo');
    ok((await p.$$eval('#tabela-longa tbody tr td:first-child, #tabela tbody tr td:first-child', (t) => t.map((x) => x.textContent))).includes('PETR4'), 'ativo adicionado entra na tabela');
    await p.click('.rem-ext'); await p.waitForLoadState('load'); await p.waitForTimeout(1000);
    ok(await p.$('.lx-leg[data-t="PETR4"]') === null, 'comparador tira o ativo adicionado');

    // radar: lista vinda da carteira, cartões com "?" e o botão "Só o radar" no comparador
    const radarJson = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'public', 'data', 'radar.json'), 'utf8'));
    await p.goto(BASE + '/acoes-etfs/'); await p.waitForTimeout(1500);
    const padrao = await p.$$eval('[data-draw="linhas"] svg path[stroke-width]', (x) => x.length);
    ok(await p.$('.lx-todos[hidden]') !== null, 'comparador no padrão: ativos só do radar desligados, sem "Mostrar todos"');
    await p.click('.lx-radar'); await p.waitForTimeout(300);
    const ligados = await p.$$eval('.lx-leg[aria-pressed="true"]', (x) => x.map((b) => b.dataset.t));
    const doRadar = radarJson.itens.map((i) => i.site_id).filter(Boolean);
    ok(ligados.length > 0 && ligados.every((t) => doRadar.includes(t)) && (await p.$eval('.lx-radar', (e) => e.textContent)) === 'Sair do radar', 'comparador: "Só o radar" liga só os ativos do radar ' + ligados.length);
    await p.click('.lx-radar'); await p.waitForTimeout(300);
    ok((await p.$$eval('[data-draw="linhas"] svg path[stroke-width]', (x) => x.length)) === padrao, 'comparador: sair do radar volta ao padrão');
    await p.goto(BASE + '/radar/'); await p.waitForTimeout(1500);
    const nCartoes = await p.$$eval('.cartao', (x) => x.length);
    ok(nCartoes === radarJson.itens.length, 'radar: um cartão por ativo (' + nCartoes + ')');
    const comPreco = await p.$$eval('.cartao', (cs) => cs.filter((c) => !/Sem cotação/.test(c.textContent) && /(US\$|R\$) \d/.test(c.querySelector('.p strong').textContent)).length);
    ok(comPreco >= radarJson.itens.filter((i) => i.site_id).length - 1, 'radar: cartões com preço do site ' + comPreco);
    const bt = p.locator('.ajuda').first();
    await bt.click(); await p.waitForTimeout(100);
    const pop = await p.$eval('.pop:not([hidden])', (e) => e.textContent).catch(() => '');
    ok(/Como o alvo foi definido/.test(pop) && pop.length > 40 && (await bt.getAttribute('aria-expanded')) === 'true', 'radar: o "?" mostra como o alvo foi definido');
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await p.$('.pop:not([hidden])') === null, 'radar: Esc fecha a explicação');
    await p.click('#filtro [data-f="BR"]'); await p.waitForTimeout(100);
    ok((await p.$$eval('.cartao', (x) => x.length)) === radarJson.itens.filter((i) => i.mercado === 'BR').length, 'radar: filtro Brasil');
    await p.click('#filtro [data-f="todos"]');
    // fora do catálogo (ETFs de Londres): preço do Yahoo vindo no radar.json, com aviso
    const comCot = radarJson.itens.filter((i) => !i.site_id && i.cotacao);
    if (comCot.length) {
      const txt = await p.locator('.cartao', { has: p.locator('.id strong', { hasText: new RegExp('^' + comCot[0].codigo.replace('.', '\\.') + '$') }) }).textContent();
      ok(!/Sem cotação/.test(txt) && /Só Yahoo/.test(txt) && /12 meses/.test(txt), 'radar: ' + comCot[0].codigo + ' com preço só do Yahoo');
    }
    // visitante adiciona ao radar (só no navegador), com alvo, e tira
    const novo = await p.$eval('#lista-add option', (o) => o.value);
    await p.fill('#add-codigo', novo); await p.fill('#add-alvo', '1.234,5');
    await Promise.all([p.waitForNavigation(), p.click('#f-add button')]); await p.waitForTimeout(1500);
    const meu = p.locator('.cartao.meu');
    ok((await p.$$eval('.cartao', (x) => x.length)) === radarJson.itens.length + 1 && (await meu.count()) === 1 && /Adicionado por você/.test(await meu.textContent()) && /1\.235/.test(await meu.locator('.alvo').textContent()), 'radar: adicionar ' + novo + ' com alvo 1.234,5 → 1.235 (só neste navegador)');
    await p.fill('#add-codigo', novo); await p.click('#f-add button'); await p.waitForTimeout(200);
    ok(/já está no radar/.test(await p.textContent('#add-msg')), 'radar: não adiciona repetido');
    await Promise.all([p.waitForNavigation(), meu.locator('.tirar').click()]); await p.waitForTimeout(1500);
    ok((await p.$$eval('.cartao', (x) => x.length)) === radarJson.itens.length, 'radar: o × tira o adicionado');
    ok(!/nota|entrada/i.test(JSON.stringify(radarJson.itens.map((i) => Object.keys(i)))), 'radar.json sem anotação nem preço de entrada');

    await p.goto(BASE + '/simulador/'); await p.waitForTimeout(1000);
    ok(/%$/.test(await p.$eval('#mVol', (e) => e.textContent)), 'simulador calcula a volatilidade');
    const volSemBtc = await p.$eval('#mVol', (e) => e.textContent);
    ok(await p.$('#r-btc') !== null, 'simulador tem a categoria bitcoin');
    await p.fill('#n-btc', '10'); await p.dispatchEvent('#n-btc', 'change'); await p.waitForTimeout(200);
    ok((await p.$eval('#mVol', (e) => e.textContent)) !== volSemBtc && !/NaN/.test(await p.$eval('.metrics', (e) => e.textContent)), 'bitcoin muda o risco simulado');

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
    const p2 = await ctx2.newPage(); p2.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && !r.url().startsWith(CF)) externos.push(r.url()); });
    await p2.goto(BASE + '/carteira/'); await p2.waitForTimeout(1000);
    await p2.fill('#senha', 'teste123'); await p2.setInputFiles('#importar', arqBackup); await p2.waitForTimeout(1500);
    ok(await p2.$$eval('#sel option', (o) => o.length) === 1, 'backup restaurado substitui a carteira de exemplo');
    ok(await p2.$$eval('#corpo tr', (r) => r.length) === 7, 'backup restaurado traz as posições');
    await ctx2.close();

    const cel = await b.newPage({ viewport: { width: 390, height: 900 }, colorScheme: 'dark' });
    for (const pg of ['/', '/acoes-etfs/', '/radar/', '/simulador/', '/carteira/']) {
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
    p3.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:') && !r.url().startsWith(CF)) externos.push(r.url()); });
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
      for (const pg of ['/', '/acoes-etfs/', '/radar/', '/simulador/', '/carteira/']) { await pa.goto(BASE + pg); await pa.waitForTimeout(800); await auditar(pa, pg + ' (' + tema + ')'); }
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
