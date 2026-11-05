"""Retorno total mensal oficial das ações brasileiras de out/2001 a ago/2004.

Cotação: COTAHIST anual da B3 (lote-padrão, fechamento / fator de cotação), com os códigos da
época. Proventos: Fundamentus (valor por ação, na data com; entram no pregão seguinte).
Conferência: retorno de preço da B3 contra o fechamento do Yahoo (que, para a B3 antes de 2005,
não traz proventos), mês a mês.

Uso: python br.py CACHE   (CACHE com B<ano>.TXT, f_<código>.html ou fund/<código>.html, y_<símbolo>.json)
"""
import datetime as dt
import json
import os
import re
import sys

S = sys.argv[1]
CODIGOS = {"ITUB3": ["ITAU3", "ITUB3"], "EGIE3": ["GRSU3", "TBLE3", "EGIE3"], "WEGE3": ["ELMJ4", "WEGE4"]}
PROVENTOS = {"ITUB3": "ITUB3", "EGIE3": "EGIE3", "WEGE3": "WEGE3"}
MESES = [f"{a}-{m:02d}" for a in range(2001, 2005) for m in range(1, 13) if "2001-10" <= f"{a}-{m:02d}" <= "2004-08"]


def cotacoes():
    q = {}
    for a in range(2001, 2005):
        for l in open(f"{S}/B{a}.TXT", encoding="latin-1"):
            if l[24:27] != "010":
                continue
            q.setdefault(l[12:24].strip(), {})[f"{l[2:6]}-{l[6:8]}-{l[8:10]}"] = int(l[108:121]) / 100 / int(l[210:217])
    return q


def proventos(p):
    for f in (f"{S}/f_{p}.html", f"{S}/fund/{p}.html"):
        if os.path.exists(f):
            t = open(f, encoding="latin-1").read()
            break
    else:
        return []
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        c = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        if len(c) >= 5 and re.match(r"\d\d/\d\d/\d{4}", c[0]):
            d, m, y = c[0].split("/")
            out.append((f"{y}-{m}-{d}", float(c[1].replace(".", "").replace(",", ".")) / float(c[4].replace(".", "")), c[2]))
    return sorted(out)  # duas parcelas iguais na mesma data são dois proventos: nada de set()


def yahoo(sym):
    r = json.load(open(f"{S}/y_{sym}.json"))["chart"]["result"][0]
    off = r["meta"].get("gmtoffset", 0)
    ds = [dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat() for t in r["timestamp"]]
    return {d: c for d, c in zip(ds, r["indicators"]["quote"][0]["close"]) if c}


def fim_mes(serie):
    out = {}
    for d in sorted(serie):
        out[d[:7]] = (d, serie[d])
    return out


def main():
    q = cotacoes()
    res = {}
    for a, cods in CODIGOS.items():
        divs = proventos(PROVENTOS[a])
        datas = sorted(d for c in cods for d in q.get(c, {}) if "2001-09-01" <= d <= "2004-08-31")
        datas = sorted(set(datas))
        tot, pre, idx_t, idx_p, prev, prev_c = 1.0, 1.0, {}, {}, None, None
        for d in datas:
            c = next((c for c in cods if d in q.get(c, {})), None)
            if prev:
                pc = prev_c if d in q.get(prev_c, {}) else c  # troca de código: usa o par do mesmo código
                if prev in q.get(pc, {}) and d in q.get(pc, {}):
                    div = sum(v for dd, v, _ in divs if prev <= dd < d)
                    tot *= (q[pc][d] + div) / q[pc][prev]
                    pre *= q[pc][d] / q[pc][prev]
            idx_t[d], idx_p[d], prev, prev_c = tot, pre, d, c
        ft, fp = fim_mes(idx_t), fim_mes(idx_p)
        y = fim_mes(yahoo(a + ".SA"))
        linhas = []
        for m0, m1 in zip(MESES, MESES[1:]):
            if m0 not in ft or m1 not in ft:
                continue
            rt = ft[m1][1] / ft[m0][1] - 1
            rp = fp[m1][1] / fp[m0][1] - 1
            ry = y[m1][1] / y[m0][1] - 1 if m0 in y and m1 in y else None
            linhas.append({"mes": m1, "total_b3": rt, "preco_b3": rp, "preco_yahoo": ry, "provento": rt - rp,
                           "ultimo_pregao": ft[m1][0]})
        res[a] = linhas
        ok = sum(l["preco_yahoo"] is not None and abs(l["preco_b3"] - l["preco_yahoo"]) <= 0.005 for l in linhas)
        print(f"{a}: {len(linhas)} meses; preço B3 = preço Yahoo (±0,5 pp) em {ok}")
        for l in linhas:
            if l["preco_yahoo"] is None or abs(l["preco_b3"] - l["preco_yahoo"]) > 0.005:
                print(f"   {l['mes']} b3 {l['preco_b3']:+.2%} yahoo {'—' if l['preco_yahoo'] is None else format(l['preco_yahoo'], '+.2%')} provento {l['provento']:.2%}")
    json.dump(res, open(f"{S}/br2001.json", "w"), indent=1)


main()
