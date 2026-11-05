/* Backup da carteira em arquivo, com senha opcional.
   AES-GCM 256 com chave derivada da senha por PBKDF2-SHA256 (600 mil iterações).
   Tudo acontece no navegador; a senha e o conteúdo nunca saem dele. */
(function (root) {
  'use strict';
  const subtle = (root.crypto || globalThis.crypto).subtle;
  const ITER = 600000;
  const b64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
  const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function chave(senha, sal, iter) {
    const base = await subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function exportar(carteiras, senha) {
    const corpo = { formato: 'analises-carteira-backup', versao: 1, criadoEm: new Date().toISOString() };
    const dados = JSON.stringify(carteiras);
    if (!senha) return JSON.stringify({ ...corpo, cifrado: false, carteiras }, null, 2);
    const sal = (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(16));
    const iv = (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(12));
    const k = await chave(senha, sal, ITER);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(dados));
    return JSON.stringify({ ...corpo, cifrado: true, kdf: { alg: 'PBKDF2-SHA256', iteracoes: ITER, sal: b64(sal) }, cifra: { alg: 'AES-GCM', iv: b64(iv) }, dados: b64(ct) }, null, 2);
  }

  async function importar(texto, senha) {
    const j = JSON.parse(texto);
    if (j.formato !== 'analises-carteira-backup') throw new Error('Este arquivo não é um backup do site.');
    if (!j.cifrado) return j.carteiras;
    if (!senha) throw new Error('Este backup tem senha.');
    try {
      const k = await chave(senha, deb64(j.kdf.sal), j.kdf.iteracoes);
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv: deb64(j.cifra.iv) }, k, deb64(j.dados));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { throw new Error('Senha errada ou arquivo corrompido.'); }
  }

  const api = { exportar, importar };
  root.CarteiraCripto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
