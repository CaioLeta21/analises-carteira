"""Atualiza os dados do site.

Uso:
    python -m pipeline.atualizar               # busca nas fontes e grava public/data/
    python -m pipeline.atualizar --offline     # só regrava public/data/ a partir do histórico
    python -m pipeline.atualizar --hoje 2026-11-04   # simula outra data (testes)

Como funciona (detalhes em docs/03-dados.md):
- dados/historico/ guarda os meses fechados (preço mensal ajustado por ativo e PTAX).
  É a fonte da verdade e só cresce.
- A cada execução, o pipeline baixa os preços diários desde o último mês do
  histórico (a "âncora") até hoje e estende cada série pela razão entre os
  fechamentos ajustados: P[m] = P[âncora] * fech(m) / fech(âncora).
- O mês corrente entra como parcial (último pregão disponível).
- Um mês fechado há mais de DIAS_PARA_FECHAR_MES dias é gravado no histórico.
- Se qualquer checagem falhar, nada é gravado e o processo sai com erro.
"""
import argparse
import csv
import datetime as dt
import json
import math
import os
import sys

from . import catalogo_dados as CD
from . import config
from . import conferir as CONF
from .fontes import FonteErro, bcb_sgs, buscar_ativo

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST_CSV = os.path.join(RAIZ, "dados", "historico", "precos_mensais.csv")
HIST_SIM = os.path.join(RAIZ, "dados", "historico", "simulador.json")
SAIDA = os.path.join(RAIZ, "public", "data")
CAMPOS = ["mes", "ativo", "moeda_original", "preco_ajustado_original", "usdbrl_fim_mes", "preco_ajustado_usd", "fonte"]


# ---------------------------------------------------------------- meses
def nxt(m):
    a, mm = int(m[:4]), int(m[5:]) + 1
    return f"{a + (mm > 12)}-{(mm - 1) % 12 + 1:02d}"


def prv(m):
    a, mm = int(m[:4]), int(m[5:]) - 1
    return f"{a - (mm < 1)}-{(mm - 1) % 12 + 1:02d}"


def mes_de(d):
    return d.isoformat()[:7] if isinstance(d, dt.date) else d[:7]


def fim_do_mes(m):
    return dt.date.fromisoformat(nxt(m) + "-01") - dt.timedelta(days=1)


def meses_entre(a, b):
    """Meses de a (exclusive) até b (inclusive)."""
    out, m = [], a
    while m < b:
        m = nxt(m)
        out.append(m)
    return out


def ultimo_do_mes(serie, m, ate):
    """Último valor da série diária dentro do mês m e com data <= ate."""
    v = None
    for d, x in serie:
        if d[:7] == m and d <= ate:
            v = x
    return v


# ---------------------------------------------------------------- histórico
def carregar_historico():
    H = {"fx": {}, "ativos": {}}
    with open(HIST_CSV) as f:
        for r in csv.DictReader(f):
            a = H["ativos"].setdefault(r["ativo"], {"moeda": r["moeda_original"], "precos": {}, "fonte": {}, "usd": {}})
            a["precos"][r["mes"]] = float(r["preco_ajustado_original"])
            a["usd"][r["mes"]] = r["preco_ajustado_usd"]
            a["fonte"][r["mes"]] = r["fonte"]
            H["fx"][r["mes"]] = float(r["usdbrl_fim_mes"])
    H["ultimo"] = max(H["fx"])
    with open(HIST_SIM) as f:
        H["sim"] = json.load(f)
    return H


def gravar_historico(H):
    linhas = []
    for aid, a in H["ativos"].items():
        for m in sorted(a["precos"]):
            p = a["precos"][m]
            fx = H["fx"][m]
            usd = a["usd"].get(m) or round(p if a["moeda"] == "USD" else p / fx, 4)
            linhas.append({"mes": m, "ativo": aid, "moeda_original": a["moeda"],
                           "preco_ajustado_original": round(p, 4), "usdbrl_fim_mes": fx,
                           "preco_ajustado_usd": usd, "fonte": a["fonte"].get(m, "")})
    ordem = [x["id"] for x in config.ATIVOS]
    linhas.sort(key=lambda x: (ordem.index(x["ativo"]) if x["ativo"] in ordem else 99, x["mes"]))
    with open(HIST_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        w.writeheader()
        w.writerows(linhas)
    with open(HIST_SIM, "w") as f:
        json.dump(H["sim"], f, separators=(",", ":"))


# ---------------------------------------------------------------- extensão
def estender(H, hoje, buscar=buscar_ativo, bcb=bcb_sgs):
    """Calcula os meses depois da âncora. Devolve dict com meses, fx, preços, retornos do simulador."""
    A = H["ultimo"]
    alvo = mes_de(hoje)
    vivos = meses_entre(A, alvo)
    if not vivos:
        return {"meses": [], "fx": {}, "precos": {}, "sim": {}, "fontes": {}, "data_ref": None}
    inicio = dt.date.fromisoformat(A + "-01") - dt.timedelta(days=7)
    ate = hoje.isoformat()

    ptax = bcb(1, inicio, hoje)
    cdi_d = bcb(12, inicio, hoje)
    fx = {m: ultimo_do_mes(ptax, m, ate) for m in vivos}

    precos, fontes, fech, datas = {}, {}, {}, []
    for at in config.ATIVOS + config.PROXIES:
        aid = at["id"]
        if aid == "CDI":
            continue
        serie, fonte = buscar(at, inicio, hoje)
        fontes[aid] = fonte
        datas.append(serie[-1][0])
        base = ultimo_do_mes(serie, A, ate)
        if base is None:
            raise FonteErro(f"{aid}: a fonte {fonte} não tem o fechamento de {A} (âncora)")
        fech[aid] = {A: base, **{m: ultimo_do_mes(serie, m, ate) for m in vivos}}
        if aid in H["ativos"]:
            p0 = H["ativos"][aid]["precos"][A]
            precos[aid] = {m: (p0 * fech[aid][m] / base if fech[aid][m] is not None else None) for m in vivos}

    # CDI: índice composto pela taxa diária (SGS 12, em % ao dia)
    idx = H["ativos"]["CDI"]["precos"][A]
    precos["CDI"] = {}
    for m in vivos:
        dias = [v for d, v in cdi_d if d[:7] == m and d <= ate]
        if not dias:
            precos["CDI"][m] = None
            continue
        idx *= math.prod(1 + v / 100 for v in dias)
        precos["CDI"][m] = idx
    fontes["CDI"] = "bcb:sgs12"
    fontes["PTAX"] = "bcb:sgs1"

    # só ficam meses completos para todos os ativos do comparador e a PTAX
    ok = []
    for m in vivos:
        if fx[m] is None or any(precos[a["id"]][m] is None for a in config.ATIVOS):
            break
        if any(fech[p["id"]][m] is None for p in config.PROXIES):
            break
        ok.append(m)

    # retornos do simulador (em reais) para os meses aceitos
    sim = {k: [] for k in config.CATEGORIAS}
    fx_ant, fxr = H["fx"][A], []
    for i, m in enumerate(ok):
        ant = A if i == 0 else ok[i - 1]
        f = fx[m] / fx_ant - 1
        fx_ant = fx[m]
        fxr.append(f)
        r_usd = {k: fech[k][m] / fech[k][ant] - 1 for k in fech}
        cdi_r = precos["CDI"][m] / (H["ativos"]["CDI"]["precos"][A] if i == 0 else precos["CDI"][ant]) - 1
        divo_r = precos["DIVO11"][m] / (H["ativos"]["DIVO11"]["precos"][A] if i == 0 else precos["DIVO11"][ant]) - 1
        for k, comp in config.CATEGORIAS.items():
            if comp == "CDI":
                sim[k].append(cdi_r)
            elif comp == "DIVO11":
                sim[k].append(divo_r)
            else:
                sim[k].append(sum(w * ((1 + r_usd[p]) * (1 + f) - 1) for p, w in comp))
    data_ref = min(datas) if datas else None
    return {"meses": ok, "fx": {m: fx[m] for m in ok}, "fxr": fxr,
            "precos": {a: {m: v[m] for m in ok} for a, v in precos.items()},
            "sim": sim, "fontes": fontes, "data_ref": data_ref}


DIAS_ESPERA_SEGUNDA_FONTE = 10  # depois disso o mês é gravado mesmo sem a segunda fonte, com aviso


def promover(H, E, hoje, conf=None, cat=None, relato=None):
    """Grava no histórico os meses fechados há mais de DIAS_PARA_FECHAR_MES dias.

    conf: função de conferência (pipeline.conferir.conferir). Com ela, cada mês só é gravado depois de
    comparado com uma segunda fonte. Divergência num ativo do comparador para tudo (vai para
    relato['erros']); no catálogo, só o ativo divergente fica de fora (relato['avisos']).
    cat: (C, ext) do catálogo, para gravar os ativos aprovados junto."""
    relato = relato if relato is not None else {"avisos": [], "erros": []}
    promovidos = []
    for i, m in enumerate(E["meses"]):
        fim = fim_do_mes(m)
        if hoje < fim + dt.timedelta(days=config.DIAS_PARA_FECHAR_MES):
            break
        aprovados_cat, nao_conf = [], set()
        if conf:
            ant = H["ultimo"] if i == 0 else E["meses"][i - 1]
            nucleo = [a for a in config.ATIVOS if a["id"] != "CDI"]
            ativos = [{"id": a["id"], "simbolo": a["fontes"][0][1], "tipo": a["tipo"], "moeda": a["moeda"]} for a in nucleo]
            ret = {a["id"]: E["precos"][a["id"]][m] / (H["ativos"][a["id"]]["precos"][ant] if i == 0 else E["precos"][a["id"]][ant]) - 1 for a in nucleo}
            if cat:
                C, ext = cat
                rc = CD.retornos_do_mes(C, ext, m)
                ativos += [{"id": a["id"], "simbolo": a["yahoo"], "tipo": a["tipo"], "moeda": a["moeda"]} for a in CD.cfg.CATALOGO if a["id"] in rc]
                ret.update(rc)
            res = conf(ativos, m, ret)
            ids_nucleo = {a["id"] for a in nucleo}
            fmt = lambda k: f"{k} ({res[k]['principal']:+.2%} na fonte principal, {res[k]['segunda']:+.2%} na segunda)"
            div = [k for k in ids_nucleo if res[k]["situacao"] == "diverge"]
            if div:
                relato["erros"].append(f"conferência de {m}: " + ", ".join(fmt(k) for k in sorted(div)))
                break
            liberado = hoje >= fim + dt.timedelta(days=DIAS_ESPERA_SEGUNDA_FONTE)
            sem = sorted(k for k, v in res.items() if v["situacao"] == "sem_fonte")
            if any(k in ids_nucleo for k in sem) and not liberado:
                print(f"{m}: aguardando a segunda fonte para {', '.join(k for k in sem if k in ids_nucleo)}")
                break
            if sem and liberado:
                relato["avisos"].append(f"{m} gravado sem segunda fonte para: {', '.join(sem)}")
                nao_conf = set(sem)
            for k, v in res.items():
                if k in ids_nucleo:
                    continue
                if v["situacao"] == "ok" or (v["situacao"] == "sem_fonte" and liberado):
                    aprovados_cat.append(k)
                elif v["situacao"] == "diverge":
                    relato["avisos"].append(f"conferência de {m}, catálogo: " + fmt(k) + "; o mês não foi gravado para este ativo")
        H["fx"][m] = E["fx"][m]
        for aid, a in H["ativos"].items():
            a["precos"][m] = E["precos"][aid][m]
            a["fonte"][m] = f"{E['fontes'].get(aid, '')} (atualização automática" + ("; não conferido" if aid in nao_conf else "; conferido" if conf else "") + ")"
        H["sim"]["months"].append(m)
        H["sim"]["fx"].append(round(E["fxr"][i], 6))
        for k in config.CATEGORIAS:
            H["sim"][k].append(round(E["sim"][k][i], 6))
        if cat:
            CD.promover(cat[0], cat[1], m, aprovados_cat, nao_conf)
        promovidos.append(m)
    if promovidos:
        H["ultimo"] = promovidos[-1]
    return promovidos


def semear(H, aid, buscar=buscar_ativo):
    """Baixa o histórico longo de um ativo novo (já listado em config.ATIVOS) e o
    grava no histórico, de ago/2004 (ou da estreia) até a âncora."""
    if aid in H["ativos"]:
        raise ValueError(f"{aid} já está no histórico")
    at = next((a for a in config.ATIVOS if a["id"] == aid), None)
    if not at:
        raise ValueError(f"{aid} não está em config.ATIVOS")
    A = H["ultimo"]
    serie, fonte = buscar(at, dt.date(2004, 7, 1), fim_do_mes(A))
    ate = fim_do_mes(A).isoformat()
    precos = {}
    for m in sorted(H["fx"]):
        v = ultimo_do_mes(serie, m, ate)
        if v is not None:
            precos[m] = v
        elif precos:
            raise FonteErro(f"{aid}: mês {m} sem dado depois da estreia")
    if A not in precos:
        raise FonteErro(f"{aid}: a fonte não chega até {A}")
    H["ativos"][aid] = {"moeda": at["moeda"], "precos": precos, "usd": {},
                        "fonte": {m: f"{fonte} (preço ajustado, carga inicial)" for m in precos}}
    return min(precos), A


# ---------------------------------------------------------------- checagens
def checar(H, E, hoje=None):
    erros = []
    for aid, a in H["ativos"].items():
        lim = config.LIMITE_RETORNO_MENSAL.get(aid, config.LIMITE_RETORNO_MENSAL["default"])
        serie = {**a["precos"], **E["precos"].get(aid, {})}
        ms = sorted(serie)
        novos = set(E["precos"].get(aid, {}))
        for x, y in zip(ms, ms[1:]):
            if nxt(x) != y:
                erros.append(f"{aid}: buraco entre {x} e {y}")
            elif y in novos and serie[x] and abs(serie[y] / serie[x] - 1) > lim:
                erros.append(f"{aid}: retorno de {y} fora do limite ({serie[y] / serie[x] - 1:+.1%})")
    for m, v in E["fx"].items():
        if not (1 < v < 20):
            erros.append(f"PTAX de {m} estranha: {v}")
    if E["data_ref"]:
        idade = ((hoje or dt.date.today()) - dt.date.fromisoformat(E["data_ref"])).days
        if idade > 10:
            erros.append(f"dados velhos: último pregão comum a todos é {E['data_ref']}")
    return erros


# ---------------------------------------------------------------- saídas
def montar_saidas(H, E, hoje):
    meses_h = sorted(H["fx"])
    meses = meses_h + E["meses"]
    fx = {**H["fx"], **E["fx"]}
    ultimo = meses[-1]
    parcial = bool(E["meses"]) and E["meses"][-1] == mes_de(hoje) and hoje < fim_do_mes(ultimo)
    ativos = []
    for at in config.ATIVOS:
        h = H["ativos"][at["id"]]["precos"]
        serie = {**h, **E["precos"].get(at["id"], {})}
        ini = min(serie)
        ativos.append({"id": at["id"], "nome": at["nome"], "tipo": at["tipo"], "mercado": at["mercado"],
                       "moeda": at["moeda"], "inicio": ini,
                       "precos": [round(serie[m], 6) for m in meses if m >= ini]})
    agora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    mercado = {"versao": 1, "atualizado_em": agora, "data_ref": E["data_ref"] or fim_do_mes(ultimo).isoformat(),
               "ultimo_mes": ultimo, "parcial": parcial, "meses": meses,
               "usdbrl": [fx[m] for m in meses], "ativos": ativos}
    s = H["sim"]
    sim = {"versao": 1, "atualizado_em": agora, "parcial": parcial,
           "months": s["months"] + E["meses"], "fx": s["fx"] + [round(x, 6) for x in E.get("fxr", [])]}
    for k in config.CATEGORIAS:
        sim[k] = s[k] + [round(x, 6) for x in E["sim"].get(k, [])]
    status = {"atualizado_em": agora, "data_ref": mercado["data_ref"], "ultimo_mes": ultimo,
              "parcial": parcial, "fontes": E.get("fontes", {}), "meses_no_historico": len(meses_h)}
    return mercado, sim, status


def gravar_saidas(mercado, sim, status):
    os.makedirs(SAIDA, exist_ok=True)
    for nome, obj in (("mercado.json", mercado), ("simulador.json", sim), ("status.json", status)):
        tmp = os.path.join(SAIDA, nome + ".tmp")
        with open(tmp, "w") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, os.path.join(SAIDA, nome))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="não busca nada; regrava as saídas a partir do histórico")
    ap.add_argument("--hoje", help="data de referência AAAA-MM-DD (padrão: hoje)")
    ap.add_argument("--sem-promover", action="store_true", help="não grava meses fechados no histórico")
    ap.add_argument("--semear", metavar="ID", help="baixa o histórico longo de um ativo novo e sai")
    a = ap.parse_args(argv)
    hoje = dt.date.fromisoformat(a.hoje) if a.hoje else dt.date.today()
    H = carregar_historico()
    C = CD.carregar()
    if a.semear:
        ini, fim = semear(H, a.semear.upper())
        gravar_historico(H)
        print(f"ok: {a.semear.upper()} gravado no histórico de {ini} a {fim}. Rode de novo sem --semear.")
        return 0
    if a.offline:
        E = {"meses": [], "fx": {}, "fxr": [], "precos": {}, "sim": {}, "fontes": {}, "data_ref": None}
        ext, avisos = {}, []
    else:
        E = estender(H, hoje)
        inicio = dt.date.fromisoformat(H["ultimo"] + "-01") - dt.timedelta(days=7)
        ext, avisos = CD.estender(C, E["meses"], inicio, hoje)
    erros = checar(H, E, hoje)
    if erros:
        print("CHECAGENS FALHARAM, nada foi gravado:\n- " + "\n- ".join(erros), file=sys.stderr)
        return 1
    relato = {"avisos": avisos, "erros": []}
    promovidos = [] if (a.offline or a.sem_promover) else promover(H, E, hoje, CONF.conferir, (C, ext), relato)
    if relato["erros"]:
        print("CONFERÊNCIA FALHOU, nada foi gravado:\n- " + "\n- ".join(relato["erros"]), file=sys.stderr)
        return 1
    if promovidos:
        gravar_historico(H)
        CD.gravar(C)
        E = {**E, "meses": E["meses"][len(promovidos):], "fxr": E["fxr"][len(promovidos):],
             "fx": {m: E["fx"][m] for m in E["meses"][len(promovidos):]},
             "precos": {k: {m: v[m] for m in E["meses"][len(promovidos):]} for k, v in E["precos"].items()},
             "sim": {k: v[len(promovidos):] for k, v in E["sim"].items()}}
    mercado, sim, status = montar_saidas(H, E, hoje)
    indice, arquivos = CD.saidas(C, ext, mercado["meses"], mercado["parcial"], mercado["atualizado_em"])
    status["catalogo"] = len(indice["ativos"])
    status["avisos"] = relato["avisos"]
    gravar_saidas(mercado, sim, status)
    CD.gravar_saidas(indice, arquivos)
    for av in relato["avisos"]:
        print("AVISO:", av)
    print(f"ok: último mês {mercado['ultimo_mes']}{' (parcial)' if mercado['parcial'] else ''}; "
          f"meses gravados no histórico: {promovidos or 'nenhum'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
