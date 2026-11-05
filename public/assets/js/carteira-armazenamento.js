/* Guarda as carteiras SÓ neste navegador (IndexedDB; localStorage se o IndexedDB faltar).
   Nada é enviado para servidor nenhum. Veja docs/04-privacidade.md. */
(function (root) {
  'use strict';
  const BANCO = 'analises-carteira', LOJA = 'carteiras', VERSAO = 1, CHAVE_LS = 'analises-carteira:carteiras';

  function abrir() {
    return new Promise((ok, falha) => {
      if (!root.indexedDB) return falha(new Error('sem IndexedDB'));
      const req = root.indexedDB.open(BANCO, VERSAO);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' }); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }
  async function transacao(modo, fn) {
    const db = await abrir();
    return new Promise((ok, falha) => {
      const tx = db.transaction(LOJA, modo), loja = tx.objectStore(LOJA);
      const r = fn(loja);
      tx.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => falha(tx.error);
    });
  }
  const ls = {
    todas: () => { try { return JSON.parse(root.localStorage.getItem(CHAVE_LS) || '[]'); } catch (e) { return []; } },
    gravar: (lista) => root.localStorage.setItem(CHAVE_LS, JSON.stringify(lista)),
  };

  let usaLS = false;
  const api = {
    async listar() {
      try { if (!usaLS) return (await transacao('readonly', (l) => l.getAll())) || []; } catch (e) { usaLS = true; }
      return ls.todas();
    },
    async obter(id) { return (await api.listar()).find((c) => c.id === id) || null; },
    async salvar(carteira) {
      const c = { ...carteira, atualizadaEm: new Date().toISOString() };
      try { if (!usaLS) { await transacao('readwrite', (l) => l.put(c)); return c; } } catch (e) { usaLS = true; }
      const lista = ls.todas().filter((x) => x.id !== c.id); lista.push(c); ls.gravar(lista); return c;
    },
    async apagar(id) {
      try { if (!usaLS) { await transacao('readwrite', (l) => l.delete(id)); return; } } catch (e) { usaLS = true; }
      ls.gravar(ls.todas().filter((x) => x.id !== id));
    },
    /* Pede ao navegador para não apagar os dados por falta de espaço. */
    async pedirPersistencia() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } },
    get modo() { return usaLS ? 'localStorage' : 'IndexedDB'; },
  };
  root.CarteiraArmazenamento = api;
})(typeof window !== 'undefined' ? window : globalThis);
