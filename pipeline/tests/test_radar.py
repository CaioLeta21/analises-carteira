from pipeline import radar


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
