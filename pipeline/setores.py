"""Divisão por setor do S&P 500 (SPY) e do Nasdaq-100 (QQQ), para a área privada da carteira.

    python -m pipeline.setores        # grava public/data/setores.json

Setores no padrão GICS (o do S&P), tirados dos 11 fundos setoriais da State Street (XLK, XLC...):
juntos eles têm exatamente as ações do S&P 500, cada uma no seu setor.
- SPY: pesos do arquivo diário de carteira do SPY (State Street).
- QQQ: as 101 ações do Nasdaq-100 (lista da Nasdaq), pesadas pelo valor de mercado com a regra de
  tetos do índice. É uma aproximação do fundo (os pesos reais só mudam no rebalanceamento); ações
  fora do S&P 500 recebem o setor pela classificação da própria Nasdaq.
Conferência: o SPY é refeito pelo valor de mercado das mesmas ações (lista da Nasdaq) e os dois
cálculos precisam bater por setor.
"""
import datetime as dt
import io
import json
import os
import re
import sys
import zipfile

import requests

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "data", "setores.json")
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
SSGA = "https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{}.xlsx"

FUNDOS_SETOR = {
    "XLK": "Tecnologia", "XLC": "Comunicação", "XLY": "Consumo discricionário", "XLP": "Consumo básico",
    "XLV": "Saúde", "XLF": "Financeiro", "XLI": "Industriais", "XLE": "Energia", "XLU": "Utilidades",
    "XLB": "Materiais", "XLRE": "Imobiliário",
}
# Empresas que ainda não têm setor GICS e cuja classificação da Nasdaq foge do negócio principal.
# SpaceX: foguetes e satélites (aeroespacial), como a classificaria o GICS; a Nasdaq põe em Technology.
MANUAL = {"SPCX": "Industriais"}
# Classificação da Nasdaq → GICS, só para ações do Nasdaq-100 que não estão no S&P 500.
NASDAQ_GICS = {
    "Technology": "Tecnologia", "Telecommunications": "Comunicação", "Consumer Discretionary": "Consumo discricionário",
    "Consumer Staples": "Consumo básico", "Health Care": "Saúde", "Finance": "Financeiro", "Industrials": "Industriais",
    "Energy": "Energia", "Utilities": "Utilidades", "Basic Materials": "Materiais", "Real Estate": "Imobiliário",
}


def _get(url, **kw):
    r = requests.get(url, headers=UA, timeout=60, **kw)
    r.raise_for_status()
    return r


def ler_xlsx(conteudo):
    """Linhas da primeira planilha de um .xlsx, como listas de texto (sem dependências)."""
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode("utf8"), re.S):
            ss.append(re.sub(r"<[^>]+>", "", si).replace("&amp;", "&").strip())
    folha = z.read("xl/worksheets/sheet1.xml").decode("utf8")
    linhas = []
    for row in re.findall(r"<row[^>]*>(.*?)</row>", folha, re.S):
        cel = []
        for attr, v in re.findall(r"<c ([^>]*?)(?:/>|>(?:<v>(.*?)</v>)?.*?</c>)", row, re.S):
            cel.append(ss[int(v)] if 't="s"' in attr and v else (v or ""))
        linhas.append(cel)
    return linhas


def carteira_ssga(ticker):
    """[(ticker, peso%)] e a data do arquivo de um fundo da State Street."""
    linhas = ler_xlsx(_get(SSGA.format(ticker.lower())).content)
    data = next((l[1] for l in linhas if l and l[0].startswith("Holdings") and len(l) > 1), "")
    i = next(k for k, l in enumerate(linhas) if "Ticker" in l and "Weight" in l)
    ct, cw = linhas[i].index("Ticker"), linhas[i].index("Weight")
    out = []
    for l in linhas[i + 1:]:
        if len(l) > cw and l[ct] and l[ct] not in ("-", "CASH_USD") and re.match(r"^-?\d", l[cw] or ""):
            out.append((l[ct].replace(".", "-").upper(), float(l[cw])))
    m = re.search(r"(\d{2})-(\w{3})-(\d{4})", data)
    data_iso = dt.datetime.strptime(m.group(0), "%d-%b-%Y").date().isoformat() if m else None
    return out, data_iso


def mapa_gics():
    mapa = {}
    for t, setor in FUNDOS_SETOR.items():
        for tk, _ in carteira_ssga(t)[0]:
            mapa[tk] = setor
    return mapa


def tela_nasdaq():
    """Valor de mercado e setor (classificação Nasdaq) de todas as ações listadas nos EUA."""
    j = _get("https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true").json()
    out = {}
    for r in j["data"]["rows"]:
        mc = float(re.sub(r"[^\d.]", "", r.get("marketCap") or "") or 0)
        out[r["symbol"].replace("/", "-").upper()] = {"mc": mc, "setor": r.get("sector") or "", "nome": r.get("name") or ""}
    return out


def nasdaq100():
    j = _get("https://api.nasdaq.com/api/quote/list-type/nasdaq100").json()
    rows = j["data"]["data"]["rows"]
    return ([(r["symbol"].replace("/", "-").upper(), float(re.sub(r"[^\d.]", "", r["marketCap"] or "") or 0)) for r in rows],
            {r["symbol"].replace("/", "-").upper(): r.get("companyName") or "" for r in rows}, j["data"].get("date"))


def empresa(nome):
    """'Alphabet Inc. Class C Capital Stock' e 'Alphabet Inc. Class A Common Stock' → 'alphabet inc.'"""
    return re.split(r"\s+(?:Class\s|Series\s|Common\s|Capital\s|Ordinary\s|American\s|New\s|Subordinate)", nome or "", maxsplit=1)[0].strip().lower()


def sem_dupla_contagem(pesos, nomes):
    """A Nasdaq dá o valor de mercado da empresa inteira em cada classe de ação (GOOG e GOOGL, FOX e FOXA):
    classes da mesma empresa dividem esse valor (a média entre elas), para a empresa não contar duas vezes."""
    grupos = {}
    for tk, v in pesos:
        grupos.setdefault(empresa(nomes.get(tk)) or tk, []).append((tk, v))
    out = []
    for g in grupos.values():
        media = sum(v for _, v in g) / len(g)
        out += [(tk, media / len(g)) for tk, _ in g]
    return out


def tetos_nasdaq100(pesos):
    """Regra de tetos do Nasdaq-100 (rebalanceamento trimestral): nenhuma ação acima de 24%; se as
    ações com mais de 4,5% somarem mais de 48%, elas são reduzidas para somar 40% e a diferença vai
    para as demais, proporcionalmente (sem passar de 4,5%)."""
    tot = sum(v for _, v in pesos)
    w = {tk: v / tot for tk, v in pesos}
    for _ in range(50):
        acima = {k for k, v in w.items() if v > 0.24}
        if acima:
            sobra = sum(w[k] - 0.24 for k in acima)
            for k in acima:
                w[k] = 0.24
            resto = sum(v for k, v in w.items() if k not in acima)
            for k in w:
                if k not in acima:
                    w[k] += sobra * w[k] / resto
            continue
        grandes = {k for k, v in w.items() if v > 0.045}
        soma_g = sum(w[k] for k in grandes)
        if soma_g <= 0.48 + 1e-9:
            break
        f = 0.40 / soma_g
        sobra = soma_g - 0.40
        for k in grandes:
            w[k] *= f
        resto = sum(v for k, v in w.items() if k not in grandes)
        for k in w:
            if k not in grandes:
                w[k] = min(w[k] + sobra * w[k] / resto, 0.044)
        # o que não coube abaixo de 4,4% fica nas grandes, proporcionalmente
        falta = 1 - sum(w.values())
        sg = sum(w[k] for k in grandes)
        for k in grandes:
            w[k] += falta * w[k] / sg
        break
    return [(tk, w[tk] * 100) for tk, _ in pesos]


def somar(pesos, mapa, reserva=None):
    """{setor: %} a partir de [(ticker, peso)]; reserva = setor Nasdaq para quem não está no mapa."""
    tot, por, sem = 0.0, {}, []
    for tk, p in pesos:
        if p <= 0:
            continue
        s = mapa.get(tk) or mapa.get(tk.replace("-", "")) or MANUAL.get(tk) or (NASDAQ_GICS.get(reserva.get(tk, {}).get("setor")) if reserva else None)
        if not s:
            sem.append(tk)
            s = "Sem classificação"
        por[s] = por.get(s, 0) + p
        tot += p
    return {k: round(v / tot * 100, 2) for k, v in sorted(por.items(), key=lambda x: -x[1])}, sem


def montar():
    mapa = mapa_gics()
    spy, data_spy = carteira_ssga("SPY")
    tela = tela_nasdaq()
    nq, nomes_nq, data_nq = nasdaq100()
    nomes = {tk: x["nome"] for tk, x in tela.items()}
    s_spy, sem_spy = somar(spy, mapa)
    # conferência do SPY: mesmas ações, pesadas pelo valor de mercado da Nasdaq
    s_conf, _ = somar(sem_dupla_contagem([(tk, tela.get(tk, {}).get("mc", 0)) for tk, _ in spy], nomes), mapa)
    difs = {k: round(s_spy.get(k, 0) - s_conf.get(k, 0), 2) for k in set(s_spy) | set(s_conf)}
    pesos_qqq = tetos_nasdaq100(sem_dupla_contagem(nq, nomes_nq))
    s_qqq, sem_qqq = somar(pesos_qqq, mapa, tela)
    pq = dict(pesos_qqq)
    fora_sp = sorted(({"ticker": tk, "nome": nomes_nq.get(tk, ""), "peso": round(pq[tk], 2),
                       "setor": MANUAL.get(tk) or NASDAQ_GICS.get(tela.get(tk, {}).get("setor"), "Sem classificação"),
                       "classificacao": "manual" if tk in MANUAL else "Nasdaq"} for tk, _ in nq if tk not in mapa),
                     key=lambda x: -x["peso"])
    # peso de cada ação no índice e, para empresas com mais de uma classe (GOOG e GOOGL), o total da empresa
    grupos = {}
    for tk, _ in nq:
        grupos.setdefault(empresa(nomes_nq.get(tk)) or tk, []).append(tk)
    pesos_acoes = {tk: {"peso": round(pq[tk], 3), "empresa": round(sum(pq[o] for o in g), 3), "classes": g}
                   for g in grupos.values() for tk in g}
    agora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    return {
        "versao": 1, "atualizado_em": agora,
        "SPY": {"nome": "S&P 500 (SPY)", "data": data_spy, "acoes": len(spy), "setores": s_spy, "sem_setor": sem_spy,
                "fonte": "pesos: carteira diária do SPY (State Street); setores GICS: fundos setoriais da State Street",
                "conferencia": {"metodo": "mesmas ações pesadas pelo valor de mercado (Nasdaq)", "maior_diferenca_pp": max(abs(v) for v in difs.values())}},
        "QQQ": {"nome": "Nasdaq-100 (QQQ)", "data": data_nq, "acoes": len(nq), "setores": s_qqq, "sem_setor": sem_qqq, "fora_do_sp500": fora_sp,
                "pesos": pesos_acoes,
                "fonte": "ações e valor de mercado: lista do Nasdaq-100 (Nasdaq); setores GICS: fundos setoriais da State Street",
                "aproximacao": "valor de mercado com a regra de tetos do índice (maiores empresas limitadas); pode diferir alguns décimos do fundo"},
    }


def checar(d):
    erros = []
    for k, minimo in (("SPY", 490), ("QQQ", 95)):
        x = d[k]
        if x["acoes"] < minimo:
            erros.append(f"{k}: só {x['acoes']} ações")
        if abs(sum(x["setores"].values()) - 100) > 0.1:
            erros.append(f"{k}: setores somam {sum(x['setores'].values())}")
        if x["setores"].get("Sem classificação", 0) > 2:
            erros.append(f"{k}: {x['setores']['Sem classificação']}% sem setor")
    soma_qqq = sum(x["peso"] for x in d["QQQ"].get("pesos", {}).values())
    if abs(soma_qqq - 100) > 0.5:
        erros.append(f"QQQ: pesos das ações somam {round(soma_qqq, 2)}")
    # O S&P pesa só as ações em circulação livre (Walmart, Tesla, Alphabet e Meta têm donos grandes e pesam
    # menos que o valor de mercado total); por isso os dois cálculos diferem até ~1,5 p.p. num setor.
    if d["SPY"]["conferencia"]["maior_diferenca_pp"] > 2.0:
        erros.append(f"SPY: pesos da State Street e valor de mercado diferem {d['SPY']['conferencia']['maior_diferenca_pp']} p.p. num setor")
    return erros


def main():
    d = montar()
    erros = checar(d)
    if erros:
        print("CHECAGENS FALHARAM, setores.json não foi gravado:\n- " + "\n- ".join(erros), file=sys.stderr)
        return 1
    with open(SAIDA + ".tmp", "w") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(SAIDA + ".tmp", SAIDA)
    for k in ("SPY", "QQQ"):
        print(k, d[k]["data"], d[k]["setores"])
    print("conferência SPY:", d["SPY"]["conferencia"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
