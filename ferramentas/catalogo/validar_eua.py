import json, sys, datetime as dt
S = sys.argv[1]
u = [x for x in json.load(open(S + '/universo.json')) if x['grupo'] in ('usetf', 'usstk')]
def num(s): return float(str(s).replace('$', '').replace(',', '')) if s not in (None, '', 'N/A') else None
def md(s): m, d, y = s.split('/'); return f'{y}-{m}-{d}'
res = {}
for x in u:
    j = json.load(open(f"{S}/yh/{x['yahoo']}.json"))['chart']['result'][0]
    off = j['meta'].get('gmtoffset', 0)
    ds = [dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat() for t in j['timestamp']]
    adj = {d: v for d, v in zip(ds, j['indicators']['adjclose'][0]['adjclose']) if v}
    cl = {d: v for d, v in zip(ds, j['indicators']['quote'][0]['close']) if v}
    sp = sorted((dt.datetime.fromtimestamp(int(k) + off, dt.timezone.utc).date().isoformat(), v['numerator'] / v['denominator']) for k, v in j.get('events', {}).get('splits', {}).items())
    ydiv = sorted((dt.datetime.fromtimestamp(int(k) + off, dt.timezone.utc).date().isoformat(), v['amount']) for k, v in j.get('events', {}).get('dividends', {}).items())
    n = json.load(open(f"{S}/nq/{x['yahoo']}.json"))
    nq = {md(r['date']): num(r['close']) for r in n['precos'] if num(r['close'])}
    fator = lambda d: __import__('math').prod(f for dd, f in sp if dd > d)  # desdobramentos depois de d
    ndiv = [(md(r['exOrEffDate']), num(r['amount']) / fator(md(r['exOrEffDate']))) for r in (n['dividendos'] or []) if r.get('exOrEffDate') not in (None, 'N/A') and num(r['amount'])]
    # perna de preço: fechamento no último pregão de cada mês
    em = {}
    for d in sorted(nq): em[d[:7]] = d
    preco_ruim = [m for m, d in em.items() if d in cl and abs(cl[d] / nq[d] - 1) > .005]
    # retorno total mensal pelo Nasdaq (preço + dividendos) x Yahoo ajustado
    idx, v, prev = {}, 1.0, None
    divs = ndiv if (x['grupo'] == 'usstk' and ndiv) else [(d, a) for d, a in ydiv]
    for d in sorted(nq):
        if prev: v *= (nq[d] + sum(a for dd, a in divs if prev < dd <= d)) / nq[prev]
        idx[d] = v; prev = d
    eo, ey = {}, {}
    for d in sorted(idx): eo[d[:7]] = idx[d]
    for d in sorted(adj): ey[d[:7]] = adj[d]
    ms = [m for m in sorted(set(eo) & set(ey)) if '2016-02' <= m <= '2026-10']
    dif = [(m1, (ey[m1] / ey[m0]) - (eo[m1] / eo[m0])) for m0, m1 in zip(ms, ms[1:])]
    ruins = [(m, round(z * 100, 2)) for m, z in dif if abs(z) > .003]
    res[x['id']] = {'preco_ruim': preco_ruim, 'ruins': ruins, 'n': len(dif)}
    print(f"{x['id']:6} meses={len(dif):3} preço≠={len(preco_ruim):2} retorno>0,3pp={len(ruins):2} {ruins[:4]}")
json.dump(res, open(S + '/valus.json', 'w'))
