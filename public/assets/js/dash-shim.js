/* Pequena camada que imita a API "dash" da versão original do painel:
   dash.data(id), dash.onData(fn), dash.draw(nome, fn), dash.params(), dash.setParams().
   Os filtros ficam no endereço (#periodo=10a&moeda=BRL), então um link guarda a visão. */
(function () {
  'use strict';
  window.criarDash = function (D) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const pal = () => (mq.matches ? CONFIG_ATIVOS.paletaEscura : CONFIG_ATIVOS.paletaClara);
    const ouvintes = [], desenhos = {};
    const ler = () => { const o = {}; new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { o[k] = v; }); return o; };
    let params = ler();
    const rodar = (nome) => { const fn = desenhos[nome]; if (!fn) return; document.querySelectorAll('[data-draw="' + nome + '"]').forEach((el) => { try { fn(el); } catch (e) { console.error(e); } }); };
    const atualizar = () => { ouvintes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); Object.keys(desenhos).forEach(rodar); };
    const gravar = () => { const s = new URLSearchParams(params).toString(); history.replaceState(null, '', s ? '#' + s : location.pathname + location.search); };
    const dash = {
      data: (id) => (D.datasets[id] ? { status: 'ok', data: D.datasets[id].rows, columns: D.datasets[id].columns } : { status: 'missing', data: [], columns: [] }),
      onData: (fn) => { ouvintes.push(fn); try { fn(); } catch (e) { console.error(e); } },
      draw: (nome, fn) => { if (fn) desenhos[nome] = fn; rodar(nome); },
      params: () => Object.assign({}, params),
      setParams: (o) => { for (const k in o) { const v = o[k]; if (v === '' || v == null) delete params[k]; else params[k] = String(v); } gravar(); atualizar(); },
      colors: pal(),
    };
    window.addEventListener('hashchange', () => { params = ler(); atualizar(); });
    let largura = window.innerWidth, t = null;
    window.addEventListener('resize', () => { if (window.innerWidth === largura) return; largura = window.innerWidth; clearTimeout(t); t = setTimeout(atualizar, 120); });
    const tema = () => { dash.colors = pal(); atualizar(); };
    try { mq.addEventListener('change', tema); } catch (e) { mq.addListener(tema); }
    return dash;
  };
})();
