import io
import zipfile

from pipeline import setores as S


def xlsx(linhas):
    """Planilha mínima com textos compartilhados, como a da State Street."""
    textos, idx = [], {}
    def ref(t):
        if t not in idx:
            idx[t] = len(textos); textos.append(t)
        return idx[t]
    rows = []
    for i, l in enumerate(linhas, 1):
        cel = []
        for j, v in enumerate(l):
            col = "ABCDEFGH"[j]
            if isinstance(v, str):
                cel.append(f'<c r="{col}{i}" t="s"><v>{ref(v)}</v></c>')
            else:
                cel.append(f'<c r="{col}{i}"><v>{v}</v></c>')
        rows.append(f'<row r="{i}">{"".join(cel)}</row>')
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("xl/sharedStrings.xml", "<sst>" + "".join(f"<si><t>{t}</t></si>" for t in textos) + "</sst>")
        z.writestr("xl/worksheets/sheet1.xml", "<worksheet><sheetData>" + "".join(rows) + "</sheetData></worksheet>")
    return b.getvalue()


def test_ler_carteira_ssga(monkeypatch):
    arq = xlsx([["Fund Name:", "SPDR"], ["Holdings:", "As of 10-Nov-2026"], [],
                ["Name", "Ticker", "Weight", "Sector"], ["APPLE INC", "AAPL", 7.5, "-"], ["BERKSHIRE B", "BRK.B", 1.5, "-"],
                ["US DOLLAR", "CASH_USD", 0.1, "-"], ["", "", "", ""]])
    class R:
        content = arq
        def raise_for_status(self): pass
    monkeypatch.setattr(S.requests, "get", lambda *a, **k: R())
    pesos, data = S.carteira_ssga("SPY")
    assert data == "2026-11-10"
    assert pesos == [("AAPL", 7.5), ("BRK-B", 1.5)]


def test_classes_da_mesma_empresa_nao_contam_duas_vezes():
    nomes = {"GOOGL": "Alphabet Inc. Class A Common Stock", "GOOG": "Alphabet Inc. Class C Capital Stock", "AAPL": "Apple Inc. Common Stock"}
    p = dict(S.sem_dupla_contagem([("GOOGL", 3.5e12), ("GOOG", 3.4e12), ("AAPL", 5e12)], nomes))
    assert abs(p["GOOGL"] + p["GOOG"] - 3.45e12) < 1
    assert p["AAPL"] == 5e12


def test_somar_por_setor_com_reserva_da_nasdaq():
    mapa = {"AAPL": "Tecnologia", "AMZN": "Consumo discricionário"}
    tela = {"ASML": {"setor": "Technology"}}
    s, sem = S.somar([("AAPL", 50), ("AMZN", 30), ("ASML", 10), ("XYZ", 10)], mapa, tela)
    assert s == {"Tecnologia": 60.0, "Consumo discricionário": 30.0, "Sem classificação": 10.0}
    assert sem == ["XYZ"]


def test_tetos_do_nasdaq100():
    # cinco gigantes de 15% (75% acima de 4,5%) e 25 ações de 1%
    pesos = [(f"G{i}", 15.0) for i in range(5)] + [(f"P{i}", 1.0) for i in range(25)]
    w = dict(S.tetos_nasdaq100(pesos))
    assert abs(sum(w.values()) - 100) < 1e-9
    assert sum(v for k, v in w.items() if k.startswith("G")) <= 48.01
    assert all(v <= 4.4 + 1e-9 for k, v in w.items() if k.startswith("P"))
    # sem concentração, nada muda
    w2 = dict(S.tetos_nasdaq100([(f"A{i}", 1.0) for i in range(50)]))
    assert all(abs(v - 2.0) < 1e-9 for v in w2.values())
