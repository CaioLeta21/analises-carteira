"""Preço ajustado mensal dos americanos de out/2001 a ago/2004 (Yahoo) e conferência.

QQQ: retorno do ajustado do Yahoo contra o índice Nasdaq-100 do FRED (série NASDAQ100). O ETF
replica o índice; o ajustado inclui os dividendos (pequenos) e desconta a taxa (0,2% ao ano), então
a diferença mensal tem de ficar entre -0,5 e +2,5 pontos, a mesma faixa da conferência mensal.
SPY, BLK e LLY: ainda sem segunda fonte para esse período (impresso só para registro).

Uso: python eua.py CACHE   (CACHE com y_<símbolo>.json e fred_ndx.csv)
"""
import csv
import datetime as dt
import json
import sys

S = sys.argv[1]
MESES = [f"{a}-{m:02d}" for a in range(2001, 2005) for m in range(1, 13) if "2001-10" <= f"{a}-{m:02d}" <= "2004-08"]


def fim_mes(serie):
    out = {}
    for d in sorted(serie):
        out[d[:7]] = serie[d]
    return out


def yahoo(sym):
    r = json.load(open(f"{S}/y_{sym}.json"))["chart"]["result"][0]
    off = r["meta"].get("gmtoffset", 0)
    ds = [dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat() for t in r["timestamp"]]
    return fim_mes({d: c for d, c in zip(ds, r["indicators"]["adjclose"][0]["adjclose"]) if c})


ndx = fim_mes({r["observation_date"]: float(r["NASDAQ100"]) for r in csv.DictReader(open(f"{S}/fred_ndx.csv")) if r["NASDAQ100"] not in ("", ".")})
res = {}
for sym in ("QQQ", "SPY", "BLK", "LLY"):
    y = yahoo(sym)
    res[sym] = {m: y[m] for m in MESES}
    if sym == "QQQ":
        ok = 0
        for m0, m1 in zip(MESES, MESES[1:]):
            ry, rn = y[m1] / y[m0] - 1, ndx[m1] / ndx[m0] - 1
            d = (1 + ry) / (1 + rn) - 1
            ok += -0.005 <= d <= 0.025
            if not -0.005 <= d <= 0.025:
                print(f"   QQQ {m1} yahoo {ry:+.2%} ndx {rn:+.2%}")
        print(f"QQQ: {len(MESES) - 1} meses; dentro da faixa em {ok}")
json.dump(res, open(f"{S}/eua2001.json", "w"), indent=1)
