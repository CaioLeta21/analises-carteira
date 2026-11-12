"""Radar público: grava public/data/radar.json com a lista que a carteira privada manda.

A carteira (carteira.letabuild.com) dispara um repository_dispatch "radar" a cada mudança no
radar, com client_payload = {"radar": [...], "em": "..."}. Aqui só passam os campos públicos
(ativo, nome, tipo, mercado, moeda, alvo e explicação do alvo); qualquer outro campo é ignorado.
Cada ativo ganha "site_id": o código dele nos dados deste site (comparador ou catálogo), ou null.

Uso: python -m pipeline.radar ARQUIVO_DO_EVENTO   (o $GITHUB_EVENT_PATH do Action)
"""
import json
import os
import re
import sys

from . import config, catalogo

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


def main(evento):
    payload = json.load(open(evento)).get("client_payload") or {}
    itens = limpar(payload.get("radar"))
    if not itens:
        raise SystemExit("radar vazio ou inválido: nada gravado")
    dado = {"atualizado_em": str(payload.get("em") or "")[:30], "itens": itens}
    tmp = SAIDA + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dado, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, SAIDA)
    print(len(itens), "ativos no radar;", sum(1 for i in itens if i["site_id"]), "com dados no site")


if __name__ == "__main__":
    main(sys.argv[1])
