import json, sys
S = sys.argv[1]; r = json.load(open(S + '/valb3.json'))
res = {}
for a, v in r.items():
    d = v['diffs']
    if not d: res[a] = {'inicio': None, 'correcoes': {}}; print(f'{a:7} sem dados oficiais'); continue
    corr = {}
    for m, x, o, y, pv in d:
        # Yahoo perdeu provento (todo ou parte) ou contou o mesmo provento duas vezes
        if pv > 0 and (.005 < (o - y) <= pv * 1.05 + .003 or (y - o > .005 and abs((y - o) - pv) <= .15 * pv + .003)):
            corr[m] = o
    rr = [(m, corr.get(m, y), o) for m, x, o, y, pv in d]
    w = []
    for i in range(2, len(rr)):
        y3 = (1 + rr[i-2][1]) * (1 + rr[i-1][1]) * (1 + rr[i][1]) - 1
        o3 = (1 + rr[i-2][2]) * (1 + rr[i-1][2]) * (1 + rr[i][2]) - 1
        w.append((rr[i-2][0], y3 - o3))
    ini = None
    for i in range(len(w)):
        t = w[i:]
        if sum(abs(z[1]) > .015 for z in t) <= .05 * len(t) and all(abs(z[1]) <= .03 for z in t): ini = w[i][0]; break
    res[a] = {'inicio': ini, 'correcoes': {m: o for m, o in corr.items() if ini and m >= ini}, 'cobertos': [z[0] for z in d]}
    print(f"{a:7} início {ini}  provento ausente no Yahoo corrigido: {len(res[a]['correcoes'])}")
json.dump(res, open(S + '/inicios_b3.json', 'w'))
