import csv
import json
from pathlib import Path

import pytest


def documento(blocks, codigo="ADS001", **extra):
    """Monta um JSON mínimo. codigo=None omite codigoDisciplina."""
    dados = {"blocks": blocks}
    if codigo is not None:
        dados["codigoDisciplina"] = codigo
    dados.update(extra)
    return dados


def executar(tmp_path, arquivos, limpar=False, estrito=False, preparar_saida=None):
    entrada = tmp_path / "entrada"
    saida = tmp_path / "saida"
    entrada.mkdir(parents=True, exist_ok=True)
    saida.mkdir(parents=True, exist_ok=True)
    if preparar_saida is not None:
        preparar_saida(saida)
    for nome, conteudo in arquivos.items():
        caminho = entrada / nome
        caminho.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(conteudo, str):
            caminho.write_text(conteudo, encoding="utf-8")
        else:
            caminho.write_text(
                json.dumps(conteudo, ensure_ascii=False),
                encoding="utf-8",
            )
    from conversor.lote import converter_pasta

    resultado = converter_pasta(entrada, saida, limpar=limpar, estrito=estrito)
    return saida, resultado


def ler_csv(saida):
    with (saida / "resultado.csv").open(encoding="utf-8", newline="") as arquivo:
        return list(csv.DictReader(arquivo))


def ler_log(saida):
    texto = (saida / "erros.log").read_text(encoding="utf-8")
    return [linha for linha in texto.splitlines() if linha]


def txt_unico(saida):
    arquivos = sorted(
        caminho
        for caminho in saida.iterdir()
        if caminho.is_file() and caminho.suffix == ".txt"
    )
    assert len(arquivos) == 1
    return arquivos[0]


def corpo(saida):
    return txt_unico(saida).read_text(encoding="utf-8")


@pytest.fixture
def raiz_exemplo():
    return (
        Path(__file__).resolve().parents[1]
        / "Exemplo"
        / "DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4 - DESENVOLVIMENTO.json"
    )
