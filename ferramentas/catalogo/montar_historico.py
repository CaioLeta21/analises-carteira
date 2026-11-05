"""Monta dados/historico/catalogo.csv a partir do Yahoo, só nos meses validados.

Uso (depois de rodar validar_b3.py, inicios_b3.py e validar_eua.py com o mesmo diretório de cache):
    python ferramentas/catalogo/montar_historico.py CACHE

CACHE tem: yh/<símbolo>.json (Yahoo diário), inicios_b3.json (início validado e meses
corrigidos de cada ativo da B3) e valus.json (conferência dos americanos contra o Nasdaq).

Regras (docs/03-dados.md, "Catálogo"):
- B3: começa no mês validado contra a cotação oficial da B3 + proventos; meses em que o Yahoo
  perdeu ou duplicou um provento usam o retorno oficial.
- EUA e cripto: Yahoo desde ago/2004 ou a estreia, conferido contra o Nasdaq/CoinGecko onde há dado.
- O preço de out/2026 é o fechamento real do último pregão; os meses anteriores são encadeados
  para trás pelos retornos mensais (com dividendos).
"""
import csv, json, os, sys, datetime as dt
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RAIZ)
from pipeline.catalogo import CATALOGO
from pipeline.atualizar import nxt, carregar_historico

def main(cache):
    A = carregar_historico()['ultimo']
    ini_b3 = json.load(open(os.path.join(cache, 'inicios_b3.json')))
    linhas, resumo, desdob = [], [], []
    for at in CATALOGO:
        j = json.load(open(os.path.join(cache, 'yh', at['yahoo'] + '.json')))['chart']['result'][0]
        off = j['meta'].get('gmtoffset', 0)
        ds = [dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat() for t in j['timestamp']]
        adj = {d: v for d, v in zip(ds, j['indicators']['adjclose'][0]['adjclose']) if v}
        raw = {d: v for d, v in zip(ds, j['indicators']['quote'][0]['close']) if v}
        if j['meta'].get('currency') != at['moeda']: raise SystemExit(f"{at['id']}: moeda {j['meta'].get('currency')}")
        fim = {}
        for d in sorted(adj):
            if d[:7] <= A: fim[d[:7]] = d
        if A not in fim: print('sem', A, at['id']); continue
        b3 = at['mercado'] == 'Brasil' and at['yahoo'].endswith('.SA')
        if b3:
            info = ini_b3.get(at['id']) or {}
            inicio = info.get('inicio'); corr = info.get('correcoes', {})
            if not inicio: print('sem validação', at['id']); continue
            inicio = max(inicio, min(fim))
            # todo mês a partir do início precisa ter cotação oficial (troca de código deixa buraco)
            cob = set(info.get('cobertos', [])); m = nxt(inicio); sem = []
            while m <= A:
                if m not in cob: sem.append(m)
                m = nxt(m)
            if sem: inicio = max(sem)
        else:
            inicio, corr = max('2004-08', min(fim)), {}
        meses = []; m = inicio
        while m <= A: meses.append(m); m = nxt(m)
        falta = [m for m in meses if m not in fim]
        if falta: inicio = nxt(max(falta)); meses = [m for m in meses if m >= inicio]
        ret = {meses[i]: corr.get(meses[i], adj[fim[meses[i]]] / adj[fim[meses[i - 1]]] - 1) for i in range(1, len(meses))}
        # ETF com desdobramento que o Yahoo não registrou: salto de um pregão para perto de 1:n ou n:1
        if at['tipo'] == 'etf':
            dias = sorted(d for d in raw if d[:7] >= inicio and d[:7] <= A)
            for d0, d1 in zip(dias, dias[1:]):
                r = raw[d1] / raw[d0]
                if r < 0.55 or r > 1.8:
                    n = round(1 / r) if r < 1 else round(r)
                    if n >= 2 and abs((1 / r if r < 1 else r) - n) / n < 0.06 and abs(adj[d1] / adj[d0] - r) < 0.02 * r:
                        f = n if r < 1 else 1 / n
                        ret[d1[:7]] = (1 + ret[d1[:7]]) * f - 1
                        desdob.append((at['id'], d1, ('1:%d' % n) if r < 1 else ('%d:1' % n)))
        p = {A: raw[fim[A]]}
        for i in range(len(meses) - 1, 0, -1): p[meses[i - 1]] = p[meses[i]] / (1 + ret[meses[i]])
        for m in meses:
            fonte = 'yahoo:' + at['yahoo'] + ('; retorno oficial B3 (provento ausente ou duplicado no Yahoo)' if m in corr else '')
            linhas.append({'mes': m, 'ativo': at['id'], 'moeda': at['moeda'], 'preco_ajustado': f'{p[m]:.6g}', 'fonte': fonte})
        resumo.append({'ativo': at['id'], 'inicio': inicio, 'meses': len(meses), 'meses_corrigidos': len([m for m in corr if m in ret]),
                       'validacao': 'B3 oficial (COTAHIST + proventos)' if b3 else 'Nasdaq (preço e dividendos)' if at['tipo'] == 'acao' else 'Nasdaq (preço)' if at['moeda'] == 'USD' and at['tipo'] == 'etf' else 'CoinGecko'})
    os.makedirs(os.path.join(RAIZ, 'dados', 'historico'), exist_ok=True)
    with open(os.path.join(RAIZ, 'dados', 'historico', 'catalogo.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['mes', 'ativo', 'moeda', 'preco_ajustado', 'fonte']); w.writeheader(); w.writerows(linhas)
    with open(os.path.join(RAIZ, 'dados', 'correcoes', '2026-11-04-catalogo.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(resumo[0].keys())); w.writeheader(); w.writerows(resumo)
    print(len(resumo), 'ativos,', len(linhas), 'linhas; desdobramentos não registrados corrigidos:', desdob)

if __name__ == '__main__':
    main(sys.argv[1])
