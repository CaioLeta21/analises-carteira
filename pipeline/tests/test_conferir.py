"""Conferência mensal contra a segunda fonte, com fontes falsas."""
from pipeline import conferir as C


def cot(cod, dias):
    return {cod: dict(dias)}


def test_b3_com_provento_ok_e_divergente():
    ant = cot("EGIE3", [("2026-07-31", 30.0)])
    mes = cot("EGIE3", [("2026-08-19", 30.5), ("2026-08-20", 30.6), ("2026-08-21", 30.1), ("2026-08-31", 30.2)])
    prov = {"cash": [{"assetIssued": "BREGIEACNOR9", "lastDatePrior": "20/08/2026", "rate": "0,50"},
                     {"assetIssued": "BREGIEACNPR6", "lastDatePrior": "20/08/2026", "rate": "9,99"}], "stock": []}
    buscas = {"cotahist": lambda a, m: mes if m == 8 else ant, "proventos": lambda e: prov}
    oficial = (30.6 / 30.0) * ((30.1 + 0.5) / 30.6) * (30.2 / 30.1) - 1
    at = [{"id": "EGIE3", "simbolo": "EGIE3.SA", "tipo": "acao", "moeda": "BRL"}]
    r = C.conferir(at, "2026-08", {"EGIE3": oficial + 0.001}, buscas)
    assert r["EGIE3"]["situacao"] == "ok"
    r = C.conferir(at, "2026-08", {"EGIE3": 30.2 / 30.0 - 1}, buscas)  # fonte principal sem o provento
    assert r["EGIE3"]["situacao"] == "diverge"


def test_b3_bonificacao_e_sem_arquivo():
    ant = cot("ITUB4", [("2025-11-28", 40.0)])
    mes = cot("ITUB4", [("2025-12-22", 41.0), ("2025-12-23", 41.2), ("2025-12-31", 40.0)])
    prov = {"cash": [], "stock": [{"assetIssued": "BRITUBACNPR1", "lastDatePrior": "22/12/2025", "factor": "3,00000000000", "label": "BONIFICACAO"}]}
    at = [{"id": "ITUB4", "simbolo": "ITUB4.SA", "tipo": "acao", "moeda": "BRL"}]
    esperado = (41.0 / 40.0) * (41.2 * 1.03 / 41.0) * (40.0 / 41.2) - 1
    r = C.conferir(at, "2025-12", {"ITUB4": esperado}, {"cotahist": lambda a, m: mes if m == 12 else ant, "proventos": lambda e: prov})
    assert r["ITUB4"]["situacao"] == "ok"
    r = C.conferir(at, "2025-12", {"ITUB4": esperado}, {"cotahist": lambda a, m: None, "proventos": lambda e: prov})
    assert r["ITUB4"]["situacao"] == "sem_fonte"


def test_eua_acao_e_etf():
    precos = {"2026-09-30": 100.0, "2026-10-15": 102.0, "2026-10-30": 103.0}
    divs = [("2026-10-10", 1.0)]
    at = [{"id": "KO", "simbolo": "KO", "tipo": "acao", "moeda": "USD"}, {"id": "VOO", "simbolo": "VOO", "tipo": "etf", "moeda": "USD"}]
    nas = lambda s, etf, i, f: (precos, [] if etf else divs)
    r = C.conferir(at, "2026-10", {"KO": 0.04, "VOO": 0.035}, {"nasdaq": nas})
    assert r["KO"]["situacao"] == "ok" and r["VOO"]["situacao"] == "ok"
    r = C.conferir(at, "2026-10", {"KO": 0.03, "VOO": 0.07}, {"nasdaq": nas})
    assert r["KO"]["situacao"] == "diverge" and r["VOO"]["situacao"] == "diverge"


def test_cripto():
    at = [{"id": "ETH", "simbolo": "ETH-USD", "tipo": "cripto", "moeda": "USD"}]
    cg = lambda i, a, b: {"2026-09-30": 2000.0, "2026-10-31": 2200.0}
    assert C.conferir(at, "2026-10", {"ETH": 0.1}, {"coingecko": cg})["ETH"]["situacao"] == "ok"
    assert C.conferir(at, "2026-10", {"ETH": 0.2}, {"coingecko": cg})["ETH"]["situacao"] == "diverge"


def test_fechamento_coingecko():
    import datetime as dt
    ts = lambda s: dt.datetime.fromisoformat(s).replace(tzinfo=dt.timezone.utc).timestamp() * 1000
    f = C._fechamentos_coingecko([[ts('2026-10-31T00:00'), 1.0], [ts('2026-10-31T23:00'), 2.0], [ts('2026-11-01T00:00'), 3.0]])
    assert f == {'2026-10-30': 1.0, '2026-10-31': 3.0}


def test_acao_nyse_sem_dividendos_no_nasdaq_usa_faixa():
    precos = {"2026-09-30": 100.0, "2026-10-30": 101.0}
    at = [{"id": "KO", "simbolo": "KO", "tipo": "acao", "moeda": "USD"}]
    nas = lambda s, etf, i, f: (precos, [])
    assert C.conferir(at, "2026-10", {"KO": 0.018}, {"nasdaq": nas})["KO"]["situacao"] == "ok"
    assert C.conferir(at, "2026-10", {"KO": 0.05}, {"nasdaq": nas})["KO"]["situacao"] == "diverge"


def test_londres():
    at = [{"id": "VHYL", "simbolo": "VHYD.L", "tipo": "etf", "moeda": "USD"}]
    lon = lambda s, i, f: {"2026-09-30": 50.0, "2026-10-30": 51.0}
    assert C.conferir(at, "2026-10", {"VHYL": 0.025}, {"londres": lon})["VHYL"]["situacao"] == "ok"
