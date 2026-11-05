"""Conferência de um mês fechado contra uma segunda fonte, antes de gravá-lo no histórico.

Para cada ativo, compara o retorno do mês calculado pela fonte principal (Yahoo, já ajustado por
proventos) com o de uma fonte independente:
- B3: cotação de fechamento oficial (arquivo mensal COTAHIST da B3) + proventos e eventos da lista
  oficial da B3 (últimos 12 meses).
- EUA: fechamento do Nasdaq; dividendos do Nasdaq para ações (para ETFs, só o preço).
- Cripto: fechamento diário da CoinGecko.

Devolve, por ativo, "ok", "diverge" (com os números) ou "sem_fonte" (a fonte não respondeu; o mês
espera a próxima execução). CDI e PTAX vêm do Banco Central, que já é a fonte oficial.

As funções de rede ficam em BUSCAS para os testes trocarem por versões falsas.
"""
import base64
import datetime as dt
import io
import json
import time
import zipfile

import requests

TOLERANCIA = 0.005  # 0,5 ponto percentual no mês
TOLERANCIA_CRIPTO = 0.01  # cripto negocia 24 h: minutos de diferença no "fechamento" já mexem no número
DIV_MAX_ETF = 0.025  # dividendo máximo num mês sem a lista do Nasdaq (ETFs e ações da NYSE; a Verizon paga ~1,7%)
# O Nasdaq derruba a conexão se o User-Agent tiver texto além do padrão.
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def _get(url, params=None, binario=False, tentativas=2):
    for i in range(tentativas):
        try:
            r = requests.get(url, params=params, headers={"User-Agent": UA["User-Agent"]} if binario else UA, timeout=45 if binario else 25)
            if r.status_code == 200:
                return r.content if binario else r.json()
        except (requests.RequestException, ValueError):
            pass
        time.sleep(2)
    return None


# ---------------------------------------------------------------- B3
def cotahist_mensal(ano, mes):
    """{código: {data: fechamento}} do arquivo mensal oficial da B3 (None se ainda não saiu)."""
    z = _get(f"https://bvmf.bmfbovespa.com.br/InstDados/SerHist/COTAHIST_M{mes:02d}{ano}.ZIP", binario=True)
    if not z:
        return None
    out = {}
    with zipfile.ZipFile(io.BytesIO(z)) as arq:
        for nome in arq.namelist():
            for l in arq.read(nome).decode("latin-1").splitlines():
                if l[:2] != "01" or l[24:27] != "010":
                    continue
                d = f"{l[2:6]}-{l[6:8]}-{l[8:10]}"
                out.setdefault(l[12:24].strip(), {})[d] = int(l[108:121]) / 100 / int(l[210:217])
    return out


def proventos_b3(empresa):
    """Lista oficial da B3 (cerca de 12 meses): {'cash': [...], 'stock': [...]}, ou None."""
    p = base64.b64encode(json.dumps({"issuingCompany": empresa, "language": "pt-br"}).encode()).decode()
    j = _get("https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/" + p)
    if isinstance(j, str):  # com alguns cabeçalhos a B3 devolve o JSON dentro de uma string
        try:
            j = json.loads(j)
        except ValueError:
            return None
    if not j or not isinstance(j, list):
        return None
    j = j[0]
    return {"cash": j.get("cashDividends") or [], "stock": j.get("stockDividends") or []}


def classe_isin(codigo):
    """Trecho do ISIN que identifica a classe do papel: ON, PN, PNA, PNB ou unit."""
    suf = codigo[4:]
    return {"3": "ACNOR", "4": "ACNPR", "5": "ACNPA", "6": "ACNPB", "11": "CDAM"}.get(suf, "ACNOR")


def _num(s):
    return float(str(s).replace(".", "").replace(",", "."))


def _data_br(s):
    d, m, a = s.split("/")
    return f"{a}-{m}-{d}"


def retorno_b3(codigo, mes, cot_mes, cot_ant, prov):
    """Retorno total oficial do mês: preço da B3 + proventos (data ex = pregão seguinte à data com)
    + desdobramentos, grupamentos e bonificações. None se faltar dado."""
    q = {**(cot_ant or {}).get(codigo, {}), **(cot_mes or {}).get(codigo, {})}
    dias = sorted(q)
    ant = [d for d in dias if d[:7] < mes]
    no_mes = [d for d in dias if d[:7] == mes]
    if not ant or not no_mes:
        return None
    cls = classe_isin(codigo)
    cash = [(_data_br(c["lastDatePrior"]), _num(c["rate"])) for c in (prov or {}).get("cash", []) if c["assetIssued"][6:].startswith(cls)]
    stock = [(_data_br(s["lastDatePrior"]), _num(s["factor"]), s["label"]) for s in (prov or {}).get("stock", []) if s["assetIssued"][6:].startswith(cls)]
    v, prev = 1.0, ant[-1]
    for d in no_mes:
        div = sum(r for dd, r in cash if prev <= dd < d)
        mult = 1.0
        for dd, f, lab in stock:
            if prev <= dd < d:
                mult *= f if "GRUP" in lab.upper() else 1 + f / 100
        v *= (q[d] * mult + div) / q[prev]
        prev = d
    return v - 1


# ---------------------------------------------------------------- EUA
def nasdaq(simbolo, etf, inicio, fim):
    """({data: fechamento}, [(data_ex, dividendo)]) do Nasdaq, ou None."""
    cls = "etf" if etf else "stocks"
    h = _get(f"https://api.nasdaq.com/api/quote/{simbolo.replace('-', '.')}/historical",
             {"assetclass": cls, "fromdate": inicio.isoformat(), "todate": fim.isoformat(), "limit": 100})
    rows = (((h or {}).get("data") or {}).get("tradesTable") or {}).get("rows")
    if not rows:
        return None
    md = lambda s: f"{s[6:10]}-{s[0:2]}-{s[3:5]}"
    num = lambda s: float(str(s).replace("$", "").replace(",", ""))
    precos = {md(r["date"]): num(r["close"]) for r in rows}
    divs = []
    if not etf:
        d = _get(f"https://api.nasdaq.com/api/quote/{simbolo.replace('-', '.')}/dividends", {"assetclass": cls})
        for r in ((((d or {}).get("data") or {}).get("dividends")) or {}).get("rows") or []:
            if r.get("exOrEffDate") not in (None, "N/A") and r.get("amount") not in (None, "N/A"):
                divs.append((md(r["exOrEffDate"]), num(r["amount"])))
    return precos, divs


def retorno_eua(precos, divs, mes):
    dias = sorted(precos)
    ant = [d for d in dias if d[:7] < mes]
    no_mes = [d for d in dias if d[:7] == mes]
    if not ant or not no_mes:
        return None
    a, b = ant[-1], no_mes[-1]
    return (precos[b] + sum(x for d, x in divs if a < d <= b)) / precos[a] - 1


# ---------------------------------------------------------------- cripto
def coingecko(moeda_id, inicio, fim):
    def ts(d):
        return int(dt.datetime.combine(d, dt.time()).replace(tzinfo=dt.timezone.utc).timestamp())
    j = _get(f"https://api.coingecko.com/api/v3/coins/{moeda_id}/market_chart/range",
             {"vs_currency": "usd", "from": ts(inicio), "to": ts(fim + dt.timedelta(days=1))})
    if not j or not j.get("prices"):
        return None
    return _fechamentos_coingecko(j["prices"])


def _fechamentos_coingecko(pontos):
    """Fechamento diário (UTC) a partir dos pontos da CoinGecko. O ponto das 00:00 UTC é o fechamento
    do dia anterior (em períodos longos a CoinGecko só manda esse); senão vale o último ponto do dia."""
    out = {}
    for ms, p in pontos:
        t = dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc)
        d = t.date() - dt.timedelta(days=1) if t.hour == 0 and t.minute < 5 else t.date()
        out[d.isoformat()] = p
    return out


def londres(simbolo, inicio, fim):
    """Fechamento ajustado da outra linha do ETF em Londres (VHYD.L -> VHYL.L), em USD."""
    from .fontes import FonteErro, converter_moeda, yahoo
    outra = {"VHYD.L": "VHYL.L"}.get(simbolo)
    if not outra:
        return None
    try:
        serie, moeda = yahoo(outra, inicio, fim)
        return dict(converter_moeda(serie, moeda, "USD", inicio, fim))
    except FonteErro:
        return None


BUSCAS = {"cotahist": cotahist_mensal, "proventos": proventos_b3, "nasdaq": nasdaq, "coingecko": coingecko, "londres": londres}
CRIPTO = {"BTC-USD": "bitcoin", "ETH-USD": "ethereum"}


def conferir(ativos, mes, retornos, buscas=None):
    """ativos: [{'id', 'simbolo' (Yahoo), 'tipo', 'moeda'}]; retornos: {id: retorno do mês pela fonte principal}.
    Devolve {id: {'situacao': 'ok'|'diverge'|'sem_fonte', 'principal': r, 'segunda': r2}}."""
    b = {**BUSCAS, **(buscas or {})}
    ano, m = int(mes[:4]), int(mes[5:])
    a_ant, m_ant = (ano, m - 1) if m > 1 else (ano - 1, 12)
    ini = dt.date(a_ant, m_ant, 1)
    fim = (dt.date(ano + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1))
    cache = {}
    res = {}
    for at in ativos:
        sim, r1 = at["simbolo"], retornos.get(at["id"])
        r2, sem_div = None, False
        if sim.endswith(".SA"):
            if "cot" not in cache:
                cache["cot"] = (b["cotahist"](ano, m), b["cotahist"](a_ant, m_ant))
            cot, cot_ant = cache["cot"]
            cod = sim[:-3]
            if cot and cot_ant:
                prov = None
                if at["tipo"] != "etf":
                    emp = cod[:4]
                    if emp not in cache:
                        cache[emp] = b["proventos"](emp)
                    prov = cache[emp]
                if at["tipo"] == "etf" or prov is not None:
                    r2 = retorno_b3(cod, mes, cot, cot_ant, prov or {})
        elif sim in CRIPTO:
            p = b["coingecko"](CRIPTO[sim], ini, fim)
            if p:
                r2 = retorno_eua(p, [], mes)
        elif sim.endswith(".L"):
            # Londres: a outra linha do mesmo ETF (em libras), convertida pelo câmbio
            alt = b["londres"](sim, ini, fim)
            if alt:
                r2 = retorno_eua(alt, [], mes)
        elif at["moeda"] == "USD":
            n = b["nasdaq"](sim, at["tipo"] == "etf", ini, fim)
            if n:
                r2 = retorno_eua(n[0], n[1], mes)
                sem_div = at["tipo"] == "etf" or not n[1]
        if r1 is None or r2 is None:
            res[at["id"]] = {"situacao": "sem_fonte", "principal": r1, "segunda": r2}
            continue
        if sem_div:
            # o Nasdaq não dá dividendos de ETF nem de ações da NYSE: o ajustado do Yahoo deve ficar
            # entre o retorno de preço do Nasdaq e esse retorno + 2,5 pp
            ok = -TOLERANCIA <= (1 + r1) / (1 + r2) - 1 <= DIV_MAX_ETF
        else:
            ok = abs(r1 - r2) <= (TOLERANCIA_CRIPTO if sim in CRIPTO or sim.endswith(".L") else TOLERANCIA)
        res[at["id"]] = {"situacao": "ok" if ok else "diverge", "principal": r1, "segunda": r2}
    return res
