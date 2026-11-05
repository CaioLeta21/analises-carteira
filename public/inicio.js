fetch('/data/status.json', { cache: 'no-cache' }).then((r) => r.json()).then((s) => {
  document.getElementById('atualizacao').textContent = 'Dados até ' + new Date(s.data_ref + 'T12:00:00').toLocaleDateString('pt-BR') + (s.parcial ? ' (mês corrente parcial)' : '') + '.';
}).catch(() => {});
