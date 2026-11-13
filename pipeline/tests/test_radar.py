import datetime as dt

from pipeline import fontes, radar


def test_cotacao_so_yahoo_para_quem_nao_tem_dados_no_site():
    hoje = dt.date(2026, 11, 13)
    serie = [("2025-11-12", 100.0), ("2025-11-13", 102.0), ("2026-11-12", 150.0), ("2026-11-13", 153.0)]
    pedidos = []

    def falso(simbolo, inicio, fim):
        pedidos.append(simbolo)
        if simbolo == "ERRO.L":
            raise fontes.FonteErro("fora do ar")
        if simbolo == "PENCE.L":
            return serie, "GBp"
        return serie, "USD"

    itens = [
        {"codigo": "MSFT", "simbolo": "MSFT", "moeda": "USD", "site_id": "MSFT", "cotacao": {"preco": 1}},
        {"codigo": "CNDX.L", "simbolo": "CNDX.L", "moeda": "USD", "site_id": None},
        {"codigo": "ERRO.L", "simbolo": "ERRO.L", "moeda": "USD", "site_id": None},
        {"codigo": "PENCE.L", "simbolo": "PENCE.L", "moeda": "USD", "site_id": None},
    ]
    radar.cotar(itens, falso, hoje)
    assert pedidos == ["CNDX.L", "ERRO.L", "PENCE.L"]  # quem tem dados no site não é cotado
    assert "cotacao" not in itens[0]
    assert itens[1]["cotacao"] == {"preco": 153.0, "data": "2026-11-13", "a12": 0.5, "fonte": "Yahoo Finance"}
    assert "cotacao" not in itens[2] and "cotacao" not in itens[3]  # falha e moeda trocada ficam sem


def test_cotacao_velha_ou_sem_um_ano_de_historico():
    hoje = dt.date(2026, 11, 13)
    velha = radar.cotar([{"codigo": "A.L", "simbolo": "A.L", "moeda": "USD", "site_id": None}], lambda *a: ([("2026-10-01", 10.0)], "USD"), hoje)
    assert "cotacao" not in velha[0]
    curta = radar.cotar([{"codigo": "B.L", "simbolo": "B.L", "moeda": "USD", "site_id": None}], lambda *a: ([("2026-06-01", 9.0), ("2026-11-13", 10.0)], "USD"), hoje)
    assert curta[0]["cotacao"]["preco"] == 10.0 and curta[0]["cotacao"]["a12"] is None


def test_so_campos_publicos_e_codigo_do_site():
    ids = {"MSFT", "BRK.B", "PSSA3"}
    itens = radar.limpar([
        {"codigo": "MSFT", "nome": "Microsoft", "preco_alvo": 500, "alvo_explicacao": "P/L 24x", "nota": "segredo", "preco_entrada": 410},
        {"codigo": "BRK-B", "preco_alvo": 500},
        {"codigo": "CNDX.L", "preco_alvo": None},
        {"codigo": "<script>", "preco_alvo": 1},
        "lixo",
    ], ids)
    assert [i["codigo"] for i in itens] == ["MSFT", "BRK-B", "CNDX.L"]
    assert "nota" not in itens[0] and "preco_entrada" not in itens[0]
    assert itens[0]["site_id"] == "MSFT" and itens[1]["site_id"] == "BRK.B" and itens[2]["site_id"] is None
    assert itens[0]["preco_alvo"] == 500.0 and itens[2]["preco_alvo"] is None


def test_alvo_invalido_vira_nulo_e_texto_e_cortado():
    itens = radar.limpar([{"codigo": "X", "preco_alvo": "100", "alvo_explicacao": "a" * 5000}], set())
    assert itens[0]["preco_alvo"] is None
    assert len(itens[0]["alvo_explicacao"]) == 1500
