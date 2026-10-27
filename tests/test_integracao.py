"""CA de integração com o exemplo real. Ignorado se o arquivo não existir."""

from pathlib import Path

import pytest

from tests.conftest import ler_csv

EXEMPLO = (
    Path(__file__).resolve().parents[1]
    / "Exemplo"
    / "DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4 - DESENVOLVIMENTO.json"
)


@pytest.mark.integration
@pytest.mark.skipif(not EXEMPLO.exists(), reason="exemplo real ausente")
def test_exemplo_real_sanitiza_sem_base64(tmp_path):
    """RF-03, RF-08, RF-11, RF-15. Exemplo real."""
    from conversor.lote import converter_pasta

    saida = tmp_path / "saida"
    entrada = tmp_path / "entrada"
    entrada.mkdir()
    destino = entrada / EXEMPLO.name
    destino.write_bytes(EXEMPLO.read_bytes())
    converter_pasta(entrada, saida)
    txts = list(saida.glob("*.txt"))
    assert len(txts) == 1
    texto = txts[0].read_text(encoding="utf-8")
    assert "data:image" not in texto
    assert "base64" not in texto
    assert "href=" not in texto
    assert "<h2>SUMÁRIO</h2>" in texto
    assert "\t" in texto
    assert txts[0].name.startswith("DESENVOLVIMENTO_")
    linha = ler_csv(saida)[0]
    assert linha["status"] == "convertido"
    assert linha["codigoDisciplina"] == "DESENVOLVIMENTO"
    assert linha["arquivo_saida"] == txts[0].name
