"""Radar público: grava public/data/radar.json com a lista que a carteira privada manda.

A carteira (carteira.letabuild.com) dispara um repository_dispatch "radar" a cada mudança no
radar, com client_payload = {"radar": [...], "em": "..."}. Aqui só passam os campos públicos
(ativo, nome, tipo, mercado, moeda, alvo e explicação do alvo); qualquer outro campo é ignorado.
Cada ativo ganha "site_id": o código dele nos dados deste site (comparador ou catálogo), ou null.

Ativo sem dados no site (site_id null, ex.: ETFs de Londres, que ficaram fora do catálogo por
falta de segunda fonte) ganha "cotacao": último fechamento do Yahoo e a variação em 12 meses,
só para mostrar no radar. Não entra no histórico nem no comparador, e a página avisa "só Yahoo".

Uso: python -m pipeline.radar ARQUIVO_DO_EVENTO   (o $GITHUB_EVENT_PATH do Action)
     python -m pipeline.radar --cotar             (atualização diária das cotações)
"""
import datetime as dt
import json
import os
import re
import sys

from . import config, catalogo, fontes

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "data", "radar.json")
CAMPOS_TEXTO = {"codigo": 16, "simbolo": 20, "nome": 120, "tipo": 10, "mercado": 4, "moeda": 4, "alvo_explicacao": 1500}
CODIGO = re.compile(r"^[A-Z0-9.\-]{1,16}$")


def ids_do_site():
    return {a["id"] for a in config.ATIVOS} | {a["id"] for a in catalogo.CATALOGO}


def site_id(codigo, ids):
    for c in (codigo, codigo.replace("-", ".")):
        if c in ids:
            return c
    return None


def limpar(lista, ids=None):
    ids = ids if ids is not None else ids_do_site()
    out = []
    for x in lista or []:
        if not isinstance(x, dict):
            continue
        item = {}
        for k, n in CAMPOS_TEXTO.items():
            v = x.get(k)
            item[k] = str(v).strip()[:n] if v not in (None, "") else None
        if not item["codigo"] or not CODIGO.match(item["codigo"]):
            continue
        alvo = x.get("preco_alvo")
        item["preco_alvo"] = float(alvo) if isinstance(alvo, (int, float)) and alvo > 0 else None
        item["site_id"] = site_id(item["codigo"], ids)
        out.append(item)
    return out


def cotar(itens, buscar=fontes.yahoo, hoje=None):
    """Põe "cotacao" nos ativos sem dados no site. Falha num ativo não derruba os outros:
    ele fica sem cotação (a página mostra "Sem cotação no site")."""
    hoje = hoje or dt.date.today()
    for it in itens:
        it.pop("cotacao", None)
        if it.get("site_id") or not it.get("simbolo"):
            continue
        try:
            serie, moeda = buscar(it["simbolo"], hoje - dt.timedelta(days=400), hoje)
        except fontes.FonteErro as e:
            print("sem cotação:", it["codigo"], e)
            continue
        # moeda diferente (ex.: pence, GBp) daria preço 100× errado: melhor ficar sem
        if it.get("moeda") and moeda and moeda != it["moeda"]:
            print("sem cotação:", it["codigo"], "moeda do Yahoo", moeda, "≠", it["moeda"])
            continue
        data, preco = serie[-1]
        if dt.date.fromisoformat(data) < hoje - dt.timedelta(days=10):
            print("sem cotação:", it["codigo"], "último fechamento velho", data)
            continue
        ano_antes = (dt.date.fromisoformat(data) - dt.timedelta(days=365)).isoformat()
        antes = [p for d, p in serie if d <= ano_antes]
        # só vale se o Yahoo tem o dia de um ano antes (com folga de uma semana para feriados)
        ok12 = antes and any(ano_antes >= d >= (dt.date.fromisoformat(ano_antes) - dt.timedelta(days=7)).isoformat() for d, _ in serie)
        it["cotacao"] = {"preco": round(preco, 4), "data": data, "a12": round(preco / antes[-1] - 1, 6) if ok12 else None, "fonte": "Yahoo Finance"}
    return itens


def gravar(dado):
    tmp = SAIDA + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dado, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, SAIDA)


def main(evento):
    payload = json.load(open(evento)).get("client_payload") or {}
    itens = limpar(payload.get("radar"))
    if not itens:
        raise SystemExit("radar vazio ou inválido: nada gravado")
    cotar(itens)
    gravar({"atualizado_em": str(payload.get("em") or "")[:30], "itens": itens})
    print(len(itens), "ativos no radar;", sum(1 for i in itens if i["site_id"]), "com dados no site;",
          sum(1 for i in itens if i.get("cotacao")), "com cotação só do Yahoo")


def atualizar_cotacoes():
    if not os.path.exists(SAIDA):
        return print("sem radar.json: nada a cotar")
    dado = json.load(open(SAIDA))
    cotar(dado.get("itens") or [])
    gravar(dado)
    print(sum(1 for i in dado.get("itens") or [] if i.get("cotacao")), "cotações do radar (só Yahoo) atualizadas")


if __name__ == "__main__":
    if sys.argv[1] == "--cotar":
        atualizar_cotacoes()
    else:
        main(sys.argv[1])
