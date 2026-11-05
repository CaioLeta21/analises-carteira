"""Histórico mensal do bitcoin desde out/2009 (feito em 05/nov/2026).

Fontes (todas fechamento diário em dólar, UTC):
- out/2009–mar/2010: New Liberty Standard, a primeira casa de câmbio (taxa diária publicada no site;
  páginas arquivadas no Internet Archive). A última taxa conhecida é de 02/03/2010; ela vale como
  fechamento de mar/2010. Conferida contra a série compilada por bitcoin.zorinaq.com/price.
- abr–jun/2010: BitcoinMarket.com, a segunda casa de câmbio (preço médio ponderado do dia, a partir
  das negociações brutas de api.bitcoincharts.com, cópia do Internet Archive). Conferida contra a Zorinaq.
- jul/2010 em diante: Coin Metrics (taxa de referência), CoinDesk BPI (via Zorinaq) e o histórico.

Regra para cada retorno mensal de ago/2010 a set/2014 (antes disso só existe uma casa de câmbio):
o histórico fica se bater (até 1 ponto) com a Coin Metrics ou com a CoinDesk; senão, vale a
mediana das três. De out/2014 em diante nada muda (o histórico já bate com o Yahoo e a Coin Metrics).

Uso: python montar_inicio.py CACHE RAIZ   (CACHE com nls.json, bcm.json, zor.json, cm_btc.json)
Grava o novo histórico do BTC em RAIZ/dados/historico/precos_mensais.csv e a evidência em
RAIZ/dados/correcoes/2026-11-05-bitcoin-desde-2009.csv.
"""
import csv
import json
import statistics
import sys

S, RAIZ = sys.argv[1], sys.argv[2]
HIST = RAIZ + "/dados/historico/precos_mensais.csv"


def fim(serie, ate="9999"):
    o = {}
    for k in sorted(serie):
        if k <= ate:
            o[k[:7]] = serie[k]
    return o


def nxt(m):
    a, mm = int(m[:4]), int(m[5:]) + 1
    return f"{a + (mm > 12)}-{(mm - 1) % 12 + 1:02d}"


nls, bcm, zor, cm = (json.load(open(f"{S}/{n}.json")) for n in ("nls", "bcm", "zor", "cm_btc"))
fn, fb, fz, fc = fim(nls), fim(bcm), fim(zor, "2022-05-16"), fim(cm)  # a Zorinaq usa a CoinDesk até mai/2022
linhas = list(csv.DictReader(open(HIST)))
H = {r["mes"]: float(r["preco_ajustado_original"]) for r in linhas if r["ativo"] == "BTC"}
FX = {r["mes"]: float(r["usdbrl_fim_mes"]) for r in linhas}

meses = []
m = "2009-10"
while m <= "2014-09":
    meses.append(m)
    m = nxt(m)

# preços das casas de câmbio pioneiras (out/2009–jun/2010)
pioneiro = {**{k: v for k, v in fn.items()}, **{k: v for k, v in fb.items() if k <= "2010-06"}}
for k in ("2009-10", "2009-11", "2009-12", "2010-01", "2010-02", "2010-03", "2010-04", "2010-05", "2010-06"):
    assert abs(pioneiro[k] / fz[k] - 1) < 0.01, (k, pioneiro[k], fz[k])  # segunda cópia (Zorinaq)

ret, evid = {}, []
for a, b in zip(meses, meses[1:]):
    if b <= "2010-06":
        r = pioneiro[b] / pioneiro[a] - 1
        evid.append({"mes": b, "fonte": "New Liberty Standard" if b <= "2010-03" else "BitcoinMarket.com",
                     "historico": "", "coin_metrics": "", "coindesk": "", "usado": r, "regra": "única casa de câmbio; confere com a Zorinaq"})
    elif b == "2010-07":
        r = fc[b] / pioneiro[a] - 1  # jun: BitcoinMarket.com; jul: Mt. Gox já negocia (Coin Metrics e CoinDesk)
        evid.append({"mes": b, "fonte": "BitcoinMarket.com (jun) e Coin Metrics (jul)", "historico": "", "coin_metrics": fc[b] / fc.get(a, pioneiro[a]) - 1,
                     "coindesk": fz[b] / fz[a] - 1, "usado": r, "regra": "fechamento de jul igual nas duas fontes (0,0675 e 0,0679)"})
    else:
        rc, rz = fc[b] / fc[a] - 1, fz[b] / fz[a] - 1
        rh = H[b] / H[a] - 1 if a in H and b in H else None
        if rh is not None and (abs(rh - rc) <= 0.01 or abs(rh - rz) <= 0.01):
            r, regra = rh, "histórico confere"
        elif rh is None:
            r, regra = (rc, "Coin Metrics (confere com a CoinDesk)") if abs(rc - rz) <= 0.01 else (statistics.median([rc, rz]), "média das duas fontes")
        else:
            r, regra = statistics.median([rh, rc, rz]), "mediana das três fontes"
        evid.append({"mes": b, "fonte": "Digrin/Coin Metrics/CoinDesk", "historico": rh, "coin_metrics": rc, "coindesk": rz, "usado": r, "regra": regra})
    ret[b] = r

# encadeia para trás a partir de set/2014, que fica como está
P = {"2014-09": H["2014-09"]}
for a, b in reversed(list(zip(meses, meses[1:]))):
    P[a] = P[b] / (1 + ret[b])

novas = []
for r in linhas:
    if r["ativo"] == "BTC" and r["mes"] <= "2014-09":
        continue
    novas.append(r)
for mm in meses:
    if mm not in FX:
        continue  # antes de ago/2004 não há PTAX no histórico (não acontece aqui)
    p = round(P[mm], 4) if P[mm] >= 1 else float(f"{P[mm]:.6g}")  # mesmo arredondamento de pipeline/atualizar.py
    novas.append({"mes": mm, "ativo": "BTC", "moeda_original": "USD", "preco_ajustado_original": p,
                  "usdbrl_fim_mes": FX[mm], "preco_ajustado_usd": p,
                  "fonte": "New Liberty Standard (fechamento do mês)" if mm <= "2010-03" else "BitcoinMarket.com (média ponderada do último dia)" if mm <= "2010-06"
                  else "Coin Metrics/CoinDesk/Digrin conferidos (correção de 05/nov/2026)"})
ordem = []
for r in linhas:
    if r["ativo"] not in ordem:
        ordem.append(r["ativo"])
novas.sort(key=lambda r: (ordem.index(r["ativo"]), r["mes"]))
with open(HIST, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
    w.writeheader()
    w.writerows(novas)
with open(RAIZ + "/dados/correcoes/2026-11-05-bitcoin-desde-2009.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["mes", "fonte", "historico", "coin_metrics", "coindesk", "usado", "regra"])
    w.writeheader()
    for e in evid:
        w.writerow({k: (f"{v:.6f}" if isinstance(v, float) else v) for k, v in e.items()})
from collections import Counter
print(Counter(e["regra"] for e in evid))
print({k: round(P[k], 6) for k in ("2009-10", "2010-06", "2010-07", "2010-12", "2013-12", "2014-09")})
