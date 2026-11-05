"""Busca de séries diárias nas fontes públicas.

Toda função devolve uma lista ordenada de (data 'AAAA-MM-DD', valor float).
Para ações e ETFs o valor é o preço de fechamento ajustado por proventos e
desdobramentos, na moeda da própria fonte. As funções levantam FonteErro quando
a resposta não serve; o chamador tenta a próxima fonte da lista.

IMPORTANTE: estas funções foram escritas sem acesso às APIs ao vivo. Na
primeira execução, confira cada uma (docs/05-plano.md, etapa 2).
"""
import datetime as dt
import os
import time

import requests

UA = {"User-Agent": "analises-carteira/1.0 (+https://letabuild.com)", "Accept": "application/json"}
TIMEOUT = 30


class FonteErro(Exception):
    pass


def _get(url, params=None, headers=None, tentativas=3):
    ult = None
    for i in range(tentativas):
        try:
            r = requests.get(url, params=params, headers={**UA, **(headers or {})}, timeout=TIMEOUT)
            if r.status_code == 429:
                time.sleep(5 * (i + 1))
                continue
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as e:
            ult = e
            time.sleep(2 * (i + 1))
    raise FonteErro(f"{url}: {ult}")


def _ts(d):
    return int(dt.datetime.combine(d, dt.time()).replace(tzinfo=dt.timezone.utc).timestamp())


# ---------------------------------------------------------------- Yahoo Finance
def yahoo(simbolo, inicio, fim):
    """Fechamento ajustado diário do Yahoo Finance (API não oficial, sem token).

    Devolve (serie, moeda_da_fonte)."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{simbolo}"
    j = _get(url, {"period1": _ts(inicio), "period2": _ts(fim + dt.timedelta(days=1)),
                   "interval": "1d", "events": "div,split", "includeAdjustedClose": "true"})
    try:
        res = j["chart"]["result"][0]
        ts = res["timestamp"]
        adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose") or res["indicators"]["quote"][0]["close"]
        off = res["meta"].get("gmtoffset", 0)
        moeda = res["meta"].get("currency", "")
    except (KeyError, IndexError, TypeError) as e:
        raise FonteErro(f"yahoo {simbolo}: resposta inesperada ({e})")
    serie = {}
    for t, v in zip(ts, adj):
        if v is None:
            continue
        d = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat()
        serie[d] = float(v)
    if not serie:
        raise FonteErro(f"yahoo {simbolo}: sem dados")
    return sorted(serie.items()), moeda


# ---------------------------------------------------------------- brapi (B3)
def brapi(ticker, inicio, fim):
    token = os.environ.get("BRAPI_TOKEN")
    if not token:
        raise FonteErro("brapi: BRAPI_TOKEN não definido")
    j = _get(f"https://brapi.dev/api/quote/{ticker}", {"range": "3mo", "interval": "1d", "token": token})
    try:
        hist = j["results"][0]["historicalDataPrice"]
    except (KeyError, IndexError, TypeError) as e:
        raise FonteErro(f"brapi {ticker}: resposta inesperada ({e})")
    serie = {}
    for h in hist:
        v = h.get("adjustedClose") or h.get("close")
        if v is None:
            continue
        d = dt.datetime.fromtimestamp(h["date"], dt.timezone(dt.timedelta(hours=-3))).date()
        if inicio <= d <= fim:
            serie[d.isoformat()] = float(v)
    if not serie:
        raise FonteErro(f"brapi {ticker}: sem dados")
    return sorted(serie.items()), "BRL"


# ---------------------------------------------------------------- Tiingo (EUA)
def tiingo(ticker, inicio, fim):
    token = os.environ.get("TIINGO_TOKEN")
    if not token:
        raise FonteErro("tiingo: TIINGO_TOKEN não definido")
    j = _get(f"https://api.tiingo.com/tiingo/daily/{ticker}/prices",
             {"startDate": inicio.isoformat(), "endDate": fim.isoformat(), "token": token})
    serie = [(x["date"][:10], float(x["adjClose"])) for x in j if x.get("adjClose") is not None]
    if not serie:
        raise FonteErro(f"tiingo {ticker}: sem dados")
    return sorted(serie), "USD"


# ---------------------------------------------------------------- CoinGecko
def coingecko(moeda_id, inicio, fim):
    headers = {}
    if os.environ.get("COINGECKO_KEY"):
        headers["x-cg-demo-api-key"] = os.environ["COINGECKO_KEY"]
    j = _get(f"https://api.coingecko.com/api/v3/coins/{moeda_id}/market_chart/range",
             {"vs_currency": "usd", "from": _ts(inicio), "to": _ts(fim + dt.timedelta(days=1))}, headers)
    serie = {}
    for ms, preco in j.get("prices", []):
        t = dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc)
        # o ponto das 00:00 UTC é o fechamento do dia anterior; senão fica o último ponto do dia
        d = (t.date() - dt.timedelta(days=1) if t.hour == 0 and t.minute < 5 else t.date()).isoformat()
        serie[d] = float(preco)
    if not serie:
        raise FonteErro(f"coingecko {moeda_id}: sem dados")
    return sorted(serie.items()), "USD"


# ---------------------------------------------------------------- Banco Central (SGS)
def bcb_sgs(codigo, inicio, fim):
    """Série do SGS do Banco Central. 1 = PTAX venda diária; 12 = CDI diário (% ao dia);
    4391 = CDI acumulado no mês (%)."""
    j = _get(f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados",
             {"formato": "json", "dataInicial": inicio.strftime("%d/%m/%Y"), "dataFinal": fim.strftime("%d/%m/%Y")})
    serie = []
    for x in j:
        d, m, a = x["data"].split("/")
        serie.append((f"{a}-{m}-{d}", float(x["valor"])))
    if not serie:
        raise FonteErro(f"bcb {codigo}: sem dados")
    return sorted(serie)


def converter_moeda(serie, de, para, inicio, fim):
    """Converte uma série diária de uma moeda para outra com o par do Yahoo (ex.: GBPUSD=X)."""
    if de in ("GBp", "GBX"):
        serie = [(d, v / 100) for d, v in serie]
        de = "GBP"
    if de == para:
        return serie
    par, _ = yahoo(f"{de}{para}=X", inicio, fim)
    fx = dict(par)
    out, ult = [], None
    datas = sorted(set(d for d, _ in serie) | set(fx))
    s = dict(serie)
    for d in datas:
        if d in fx:
            ult = fx[d]
        if d in s and ult is not None:
            out.append((d, s[d] * ult))
    return out


BUSCADORES = {"yahoo": yahoo, "brapi": brapi, "tiingo": tiingo, "coingecko": coingecko}


def buscar_ativo(ativo, inicio, fim, buscadores=None):
    """Tenta as fontes do ativo em ordem. Devolve (serie_na_moeda_do_ativo, descricao_da_fonte)."""
    buscadores = buscadores or BUSCADORES
    erros = []
    for nome, simbolo in ativo["fontes"]:
        if nome not in buscadores:
            continue
        try:
            serie, moeda = buscadores[nome](simbolo, inicio, fim)
            if moeda and moeda != ativo["moeda"]:
                serie = converter_moeda(serie, moeda, ativo["moeda"], inicio, fim)
            return serie, f"{nome}:{simbolo}"
        except FonteErro as e:
            erros.append(str(e))
    raise FonteErro(f"{ativo['id']}: nenhuma fonte respondeu: " + " | ".join(erros))
