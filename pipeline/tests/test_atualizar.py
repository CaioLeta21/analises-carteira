"""Testes offline do pipeline: fontes falsas com crescimento conhecido."""
import copy
import datetime as dt

import pytest

from pipeline import atualizar as at
from pipeline import config


def dias(inicio, fim):
    d = inicio
    while d <= fim:
        if d.weekday() < 5:
            yield d
        d += dt.timedelta(days=1)


def fonte_falsa(taxa_dia=0.001, faltando=None):
    """Preço diário que cresce taxa_dia por pregão. faltando: ids sem dados."""
    def buscar(ativo, inicio, fim):
        if faltando and ativo["id"] in faltando:
            raise at.FonteErro("sem dados")
        v, serie = 50.0, []
        for d in dias(inicio, fim):
            v *= 1 + taxa_dia
            serie.append((d.isoformat(), v))
        return serie, "fake:" + ativo["id"]
    return buscar


def bcb_falso(codigo, inicio, fim):
    if codigo == 1:
        return [(d.isoformat(), 5.0 + 0.001 * i) for i, d in enumerate(dias(inicio, fim))]
    if codigo == 12:
        return [(d.isoformat(), 0.05) for d in dias(inicio, fim)]
    raise ValueError(codigo)


CORTE = "2026-10"  # os testes usam o histórico cortado aqui, para não quebrar quando ele crescer


@pytest.fixture()
def H():
    h = at.carregar_historico()
    for m in [m for m in h["fx"] if m > CORTE]:
        del h["fx"][m]
    for a in h["ativos"].values():
        for chave in ("precos", "usd", "fonte"):
            for m in [m for m in a[chave] if m > CORTE]:
                del a[chave][m]
    n = h["sim"]["months"].index(CORTE) + 1
    for k, v in h["sim"].items():
        if isinstance(v, list):
            h["sim"][k] = v[:n]
    h["ultimo"] = CORTE
    return h


def test_historico_carrega(H):
    assert H["ultimo"] == CORTE
    assert set(a["id"] for a in config.ATIVOS) <= set(H["ativos"])
    assert H["sim"]["months"][-1] == H["ultimo"]


def test_extensao_mes_parcial(H):
    E = at.estender(H, dt.date(2026, 11, 4), fonte_falsa(), bcb_falso)
    assert E["meses"] == ["2026-11"]
    # out/2026 termina numa sexta (30); de 30/10 a 04/11 há 3 pregões
    esperado = H["ativos"]["GOOGL"]["precos"]["2026-10"] * 1.001 ** 3
    assert E["precos"]["GOOGL"]["2026-11"] == pytest.approx(esperado)
    # CDI: 0,05% ao dia em 3 dias úteis de novembro
    assert E["precos"]["CDI"]["2026-11"] == pytest.approx(H["ativos"]["CDI"]["precos"]["2026-10"] * 1.0005 ** 3)
    assert len(E["sim"]["rfbr"]) == 1 and E["sim"]["rfbr"][0] == pytest.approx(1.0005 ** 3 - 1)
    assert at.checar(H, E, dt.date(2026, 11, 4)) == []


def test_saidas_e_parcial(H):
    hoje = dt.date(2026, 11, 4)
    E = at.estender(H, hoje, fonte_falsa(), bcb_falso)
    mercado, sim, status = at.montar_saidas(H, E, hoje)
    assert mercado["ultimo_mes"] == "2026-11" and mercado["parcial"] is True
    assert len(mercado["usdbrl"]) == len(mercado["meses"])
    for a in mercado["ativos"]:
        assert len(a["precos"]) == len([m for m in mercado["meses"] if m >= a["inicio"]])
    assert sim["months"][-1] == "2026-11" and len(sim["fx"]) == len(sim["months"]) == len(sim["rvex"])


def test_promocao_de_mes_fechado(H):
    hoje = dt.date(2026, 12, 10)
    H2 = copy.deepcopy(H)
    E = at.estender(H2, hoje, fonte_falsa(), bcb_falso)
    assert E["meses"] == ["2026-11", "2026-12"]
    prom = at.promover(H2, E, hoje)
    assert prom == ["2026-11"] and H2["ultimo"] == "2026-11"
    assert H2["sim"]["months"][-1] == "2026-11"


def test_ativo_sem_dados_bloqueia(H):
    with pytest.raises(at.FonteErro):
        at.estender(H, dt.date(2026, 11, 4), fonte_falsa(faltando={"TAEE11"}), bcb_falso)


def test_checagem_pega_salto(H):
    def louca(ativo, inicio, fim):
        s, moeda = fonte_falsa()(ativo, inicio, fim)
        if ativo["id"] == "WEGE3":
            s[-1] = (s[-1][0], s[-1][1] * 3)
        return s, moeda
    hoje = dt.date(2026, 11, 4)
    E = at.estender(H, hoje, louca, bcb_falso)
    assert any("WEGE3" in e for e in at.checar(H, E, hoje))


def test_ida_e_volta_do_historico(tmp_path, monkeypatch, H):
    monkeypatch.setattr(at, "HIST_CSV", str(tmp_path / "h.csv"))
    monkeypatch.setattr(at, "HIST_SIM", str(tmp_path / "s.json"))
    at.gravar_historico(H)
    H2 = at.carregar_historico()
    assert H2["fx"] == H["fx"] and H2["ultimo"] == H["ultimo"] and H2["sim"] == H["sim"]
    for aid, a in H["ativos"].items():
        assert H2["ativos"][aid]["precos"] == a["precos"]
        assert H2["ativos"][aid]["usd"] == a["usd"]


def test_semear_ativo_novo(H, monkeypatch):
    novo = {"id": "XPTO3", "nome": "Xpto", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL", "fontes": [("fake", "XPTO3")]}
    monkeypatch.setattr(config, "ATIVOS", config.ATIVOS + [novo])
    H2 = copy.deepcopy(H)
    ini, fim = at.semear(H2, "XPTO3", fonte_falsa())
    assert ini == "2004-07" or ini == "2004-08"
    assert fim == "2026-10" and "XPTO3" in H2["ativos"]


# ---------------------------------------------------------------- conferência e catálogo
from pipeline import catalogo_dados as CD


def conf_falsa(situacao_por_id=None, padrao="ok"):
    def conf(ativos, mes, retornos):
        return {a["id"]: {"situacao": (situacao_por_id or {}).get(a["id"], padrao), "principal": retornos.get(a["id"], 0.0), "segunda": 0.0} for a in ativos}
    return conf


def catalogo_pequeno():
    C = {"AAPL": {"precos": {"2026-09": 100.0, "2026-10": 110.0}, "fonte": {}},
         "PETR4": {"precos": {"2026-09": 30.0, "2026-10": 31.0}, "fonte": {}}}
    return C


def test_conferencia_divergente_no_comparador_para_tudo(H):
    hoje = dt.date(2026, 12, 10)
    H2 = copy.deepcopy(H)
    E = at.estender(H2, hoje, fonte_falsa(), bcb_falso)
    relato = {"avisos": [], "erros": []}
    assert at.promover(H2, E, hoje, conf_falsa({"SPY": "diverge"}), None, relato) == []
    assert relato["erros"] and "SPY" in relato["erros"][0] and H2["ultimo"] == CORTE


def test_segunda_fonte_fora_do_ar_espera_e_depois_grava(H):
    E = at.estender(copy.deepcopy(H), dt.date(2026, 12, 4), fonte_falsa(), bcb_falso)
    H2 = copy.deepcopy(H)
    assert at.promover(H2, E, dt.date(2026, 12, 4), conf_falsa({"VHYL": "sem_fonte"})) == []  # 4 dias depois do fim
    H3 = copy.deepcopy(H)
    relato = {"avisos": [], "erros": []}
    E = at.estender(copy.deepcopy(H), dt.date(2026, 12, 11), fonte_falsa(), bcb_falso)
    assert at.promover(H3, E, dt.date(2026, 12, 11), conf_falsa({"VHYL": "sem_fonte"}), None, relato) == ["2026-11"]
    assert "não conferido" in H3["ativos"]["VHYL"]["fonte"]["2026-11"] and relato["avisos"]


def test_catalogo_estende_e_so_o_divergente_fica_de_fora(H, monkeypatch):
    monkeypatch.setattr(CD.cfg, "CATALOGO", [
        {"id": "AAPL", "yahoo": "AAPL", "nome": "Apple", "tipo": "acao", "mercado": "EUA", "moeda": "USD", "categoria": "rvex"},
        {"id": "PETR4", "yahoo": "PETR4.SA", "nome": "Petrobras PN", "tipo": "acao", "mercado": "Brasil", "moeda": "BRL", "categoria": "rvbr"}])
    hoje = dt.date(2026, 12, 10)
    H2 = copy.deepcopy(H)
    E = at.estender(H2, hoje, fonte_falsa(), bcb_falso)
    C = catalogo_pequeno()
    ext, avisos = CD.estender(C, E["meses"], dt.date(2026, 9, 24), hoje, fonte_falsa())
    assert avisos == [] and set(ext) == {"AAPL", "PETR4"} and set(ext["AAPL"]["precos"]) == {"2026-11", "2026-12"}
    relato = {"avisos": [], "erros": []}
    assert at.promover(H2, E, hoje, conf_falsa({"PETR4": "diverge"}), (C, ext), relato) == ["2026-11"]
    assert "2026-11" in C["AAPL"]["precos"] and "2026-11" not in C["PETR4"]["precos"]
    assert any("PETR4" in a for a in relato["avisos"])
    # no dia seguinte o PETR4 continua sendo servido (da âncora dele) e as saídas ficam alinhadas
    mercado, _, _ = at.montar_saidas(H2, {**E, "meses": ["2026-12"], "fxr": E["fxr"][1:], "fx": {"2026-12": E["fx"]["2026-12"]},
                                          "precos": {k: {"2026-12": v["2026-12"]} for k, v in E["precos"].items()}, "sim": {k: v[1:] for k, v in E["sim"].items()}}, hoje)
    ext2, _ = CD.estender(C, ["2026-12"], dt.date(2026, 10, 24), hoje, fonte_falsa())
    indice, arquivos = CD.saidas(C, ext2, mercado["meses"], True, "agora")
    assert {a["id"] for a in indice["ativos"]} == {"AAPL", "PETR4"}
    for aid, arq in arquivos.items():
        assert arq["fim"] == mercado["ultimo_mes"] and len(arq["precos"]) == len([m for m in mercado["meses"] if m >= arq["inicio"]])


def test_catalogo_ativo_sem_dados_nao_derruba(H, monkeypatch):
    monkeypatch.setattr(CD.cfg, "CATALOGO", [{"id": "AAPL", "yahoo": "AAPL", "nome": "Apple", "tipo": "acao", "mercado": "EUA", "moeda": "USD", "categoria": "rvex"}])
    ext, avisos = CD.estender(catalogo_pequeno(), ["2026-11"], dt.date(2026, 9, 24), dt.date(2026, 11, 4), fonte_falsa(faltando={"AAPL"}))
    assert ext == {} and avisos and "AAPL" in avisos[0]
