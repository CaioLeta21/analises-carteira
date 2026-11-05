import json, re, os, sys, glob, datetime as dt
def nxt(m):
    a, mm = int(m[:4]), int(m[5:]) + 1
    return f'{a + (mm > 12)}-{(mm - 1) % 12 + 1:02d}'
S = sys.argv[1]
u = [x for x in json.load(open(S + '/universo.json')) if x['grupo'].startswith('b3') and x['id'] not in ('XFIX11', 'BOVV11')]
q = {}
for fn in glob.glob(S + '/b3all/A*.TXT'):
    for l in open(fn, encoding='latin-1'):
        if l[24:27] != '010': continue
        q.setdefault(l[12:24].strip(), {})[f'{l[2:6]}-{l[6:8]}-{l[8:10]}'] = int(l[108:121]) / 100 / int(l[210:217])
def fund(p):
    f = f'{S}/fund/{p}.html'
    if not os.path.exists(f): return []
    out = []
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', open(f).read(), re.S):
        c = [re.sub(r'<[^>]+>', '', x).strip() for x in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(c) >= 5 and re.match(r'\d\d/\d\d/\d{4}', c[0]):
            d, m, y = c[0].split('/'); out.append((f'{y}-{m}-{d}', float(c[1].replace('.', '').replace(',', '.')) / float(c[4].replace('.', ''))))
    return sorted(out)
def yah(sym):
    j = json.load(open(f'{S}/yh/{sym}.json'))['chart']['result'][0]
    off = j['meta'].get('gmtoffset', 0)
    ds = [dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat() for t in j['timestamp']]
    adj = {d: v for d, v in zip(ds, j['indicators']['adjclose'][0]['adjclose']) if v}
    sp = sorted((dt.datetime.fromtimestamp(int(k) + off, dt.timezone.utc).date().isoformat(), v['numerator'] / v['denominator']) for k, v in j.get('events', {}).get('splits', {}).items())
    return adj, sp
res = {}
for x in u:
    a = x['id']; adj, sp = yah(x['yahoo']); divs = fund(a); s = q.get(a, {})
    ds = sorted(s); v = 1.0; idx = {}; prev = None; pv = {}
    for d in ds:
        if prev:
            div = sum(r for dd, r in divs if prev <= dd < d)
            if div: pv[d[:7]] = pv.get(d[:7], 0) + div / s[prev]
            mult = 1.0
            for dd, f in sp:
                if prev < dd <= d: mult *= f
            v *= (s[d] * mult + div) / s[prev]
        idx[d] = v; prev = d
    eo, ey = {}, {}
    for d in sorted(idx): eo[d[:7]] = idx[d]
    for d in sorted(adj): ey[d[:7]] = adj[d]
    ms = [m for m in sorted(set(eo) & set(ey)) if '2004-08' <= m <= '2026-10']
    diffs = [(m1, (ey[m1] / ey[m0] - 1) - (eo[m1] / eo[m0] - 1), eo[m1] / eo[m0] - 1, ey[m1] / ey[m0] - 1, pv.get(m1, 0)) for m0, m1 in zip(ms, ms[1:]) if m1 == nxt(m0)]
    res[a] = {'diffs': diffs, 'ndiv': len(divs), 'ini_y': min(ey) if ey else None, 'ini_o': min(eo) if eo else None}
json.dump(res, open(S + '/valb3.json', 'w'))
# escolha do início: menor s com divergências >0,5pp <= max(1, 2%) e nenhuma >2pp depois de s
for a, r in res.items():
    d = r['diffs']; ini = None
    for i in range(len(d)):
        t = d[i:]; nb = sum(abs(z[1]) > .005 for z in t)
        if nb <= max(1, .02 * len(t)) and all(abs(z[1]) <= .02 for z in t): ini = d[i][0]; break
    nb_all = sum(abs(z[1]) > .005 for z in d)
    print(f"{a:7} yahoo≥{r['ini_y']} b3≥{r['ini_o']} prov={r['ndiv']:3} meses={len(d):3} div>0,5pp={nb_all:3} inicio_validado={ini}")
