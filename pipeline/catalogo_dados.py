"""Histórico, extensão diária e saídas do catálogo (pipeline/catalogo.py).

Diferente dos 16 ativos do comparador, um ativo do catálogo que falhar não derruba a atualização:
ele fica de fora das saídas daquele dia e entra um aviso em status.json (o Action manda e-mail).
Cada ativo tem a própria âncora (o último mês gravado no histórico dele).
"""
import csv
import json
import os

from . import catalogo as cfg
from .fontes import FonteErro, buscar_ativo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(RAIZ, "dados", "historico", "catalogo.csv")
SAIDA = os.path.join(RAIZ, "public", "data")
CAMPOS = ["mes", "ativo", "moeda", "preco_ajustado", "fonte"]
# Retorno mensal novo fora disto é tratado como erro de dado (o catálogo tem ações pequenas e voláteis).
LIMITE = {"cripto": (-0.8, 2.0), "default": (-0.75, 1.5)}


def _nxt(m):
    a, mm = int(m[:4]), int(m[5:]) + 1
    return f"{a + (mm > 12)}-{(mm - 1) % 12 + 1:02d}"


def carregar():
    """{id: {'precos': {mes: preço}, 'fonte': {mes: texto}}}"""
    out = {}
    if not os.path.exists(HIST):
        return out
    with open(HIST) as f:
        for r in csv.DictReader(f):
            a = out.setdefault(r["ativo"], {"precos": {}, "fonte": {}})
            a["precos"][r["mes"]] = float(r["preco_ajustado"])
            a["fonte"][r["mes"]] = r["fonte"]
    return out


def gravar(C):
    ordem = [a["id"] for a in cfg.CATALOGO]
    linhas = []
    for aid in sorted(C, key=lambda x: ordem.index(x) if x in ordem else 9999):
        moeda = next((a["moeda"] for a in cfg.CATALOGO if a["id"] == aid), "")
        for m in sorted(C[aid]["precos"]):
            linhas.append({"mes": m, "ativo": aid, "moeda": moeda, "preco_ajustado": f"{C[aid]['precos'][m]:.6g}", "fonte": C[aid]["fonte"].get(m, "")})
    with open(HIST, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        w.writeheader()
        w.writerows(linhas)


def _ultimo_do_mes(serie, m, ate):
    v = None
    for d, x in serie:
        if d[:7] == m and d <= ate:
            v = x
    return v


def estender(C, meses_alvo, inicio, hoje, buscar=buscar_ativo):
    """Estende cada ativo do catálogo até o último mês de meses_alvo (os meses aceitos para o
    comparador). Devolve (ext, avisos): ext[id] = {'precos': {mes: preço}, 'fechamentos': {...}, 'fonte': str}."""
    ext, avisos = {}, []
    if not meses_alvo:
        return ext, avisos
    ate, ultimo = hoje.isoformat(), meses_alvo[-1]
    for at in cfg.CATALOGO:
        aid = at["id"]
        if aid not in C or not C[aid]["precos"]:
            continue
        anc = max(C[aid]["precos"])
        meses = []
        m = anc
        while m < ultimo:
            m = _nxt(m)
            meses.append(m)
        if not meses:
            continue
        try:
            ini = min(inicio, _data_inicio(anc))
            serie, fonte = buscar({"id": aid, "moeda": at["moeda"], "fontes": [("yahoo", at["yahoo"])]}, ini, hoje)
        except FonteErro as e:
            avisos.append(f"catálogo {aid}: {e}")
            continue
        base = _ultimo_do_mes(serie, anc, ate)
        fech = {m: _ultimo_do_mes(serie, m, ate) for m in meses}
        if base is None or any(v is None for v in fech.values()):
            avisos.append(f"catálogo {aid}: sem cotação em {anc if base is None else [m for m, v in fech.items() if v is None]}")
            continue
        p0 = C[aid]["precos"][anc]
        precos = {m: p0 * fech[m] / base for m in meses}
        lo, hi = LIMITE.get(at["tipo"], LIMITE["default"])
        ant, ruim = p0, None
        for m in meses:
            r = precos[m] / ant - 1
            if not lo <= r <= hi:
                ruim = f"catálogo {aid}: retorno de {m} fora do limite ({r:+.1%})"
                break
            ant = precos[m]
        if ruim:
            avisos.append(ruim)
            continue
        ext[aid] = {"precos": precos, "fonte": fonte, "anc": anc}
    return ext, avisos


def _data_inicio(m):
    import datetime as dt
    return dt.date.fromisoformat(m + "-01") - dt.timedelta(days=7)


def retornos_do_mes(C, ext, mes):
    """Retorno de cada ativo do catálogo em `mes` (para a conferência)."""
    out = {}
    for aid, e in ext.items():
        if mes not in e["precos"]:
            continue
        prev = max(m for m in list(C[aid]["precos"]) + list(e["precos"]) if m < mes)
        p_prev = e["precos"].get(prev, C[aid]["precos"].get(prev))
        out[aid] = e["precos"][mes] / p_prev - 1
    return out


def promover(C, ext, mes, aprovados, nao_conferidos=()):
    """Grava `mes` no histórico dos ativos aprovados na conferência."""
    for aid in aprovados:
        e = ext.get(aid)
        if e and mes in e["precos"] and max(C[aid]["precos"]) < mes:
            C[aid]["precos"][mes] = e["precos"][mes]
            C[aid]["fonte"][mes] = e["fonte"] + (" (atualização automática; não conferido: segunda fonte fora do ar)" if aid in nao_conferidos else " (atualização automática; conferido)")


def saidas(C, ext, meses, parcial, agora):
    """(índice, {id: arquivo}) alinhados aos meses do comparador (mesmo último mês)."""
    ultimo = meses[-1]
    indice, arquivos = [], {}
    for at in cfg.CATALOGO:
        aid = at["id"]
        if aid not in C:
            continue
        serie = {**C[aid]["precos"], **(ext.get(aid, {}).get("precos", {}))}
        if ultimo not in serie:
            continue  # ativo atrasado hoje (aviso já emitido); volta quando a fonte responder
        ini = min(serie)
        ms = [m for m in meses if m >= ini]
        if any(m not in serie for m in ms):
            continue
        precos = [round(serie[m], 6) for m in ms]
        arquivos[aid] = {"versao": 1, "id": aid, "inicio": ini, "fim": ultimo, "precos": precos}
        indice.append({"id": aid, "nome": at["nome"], "tipo": at["tipo"], "mercado": at["mercado"], "moeda": at["moeda"],
                       "categoria": at["categoria"], "inicio": ini, "preco": precos[-1]})
    return {"versao": 1, "atualizado_em": agora, "ultimo_mes": ultimo, "parcial": parcial, "ativos": indice}, arquivos


def gravar_saidas(indice, arquivos):
    pasta = os.path.join(SAIDA, "catalogo")
    os.makedirs(pasta, exist_ok=True)
    for aid, obj in arquivos.items():
        with open(os.path.join(pasta, aid + ".json"), "w") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    for nome in os.listdir(pasta):  # ativo que saiu do catálogo
        if nome.endswith(".json") and nome[:-5] not in arquivos and nome[:-5] not in {a["id"] for a in cfg.CATALOGO}:
            os.remove(os.path.join(pasta, nome))
    tmp = os.path.join(SAIDA, "catalogo.json.tmp")
    with open(tmp, "w") as f:
        json.dump(indice, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, os.path.join(SAIDA, "catalogo.json"))
