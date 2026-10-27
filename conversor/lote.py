"""Lote sequencial: lê a pasta, grava txt, CSV e log."""

import csv
import hashlib
import io
import json
import os
import re
import uuid
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from conversor.documento import renderizar

NAMESPACE = uuid.UUID("d1698526-798c-54c8-b0e5-cfba1794bddb")
COLUNAS = ["codigoDisciplina", "uuid", "arquivo_origem", "arquivo_saida", "status"]
RESERVADOS = {"CON", "PRN", "AUX", "NUL"}
RESERVADOS.update(f"COM{indice}" for indice in range(10))
RESERVADOS.update(f"LPT{indice}" for indice in range(10))
_PROIBIDOS = re.compile(r'[\x00-\x1f\x7f\\/:*?"<>|]')
_ORFAO = re.compile(r"^.+_[0-9a-f-]{36}\.txt$")


@dataclass
class ResultadoLote:
    codigo_saida: int
    resumo: str


def converter_pasta(entrada, saida, limpar=False, estrito=False):
    entrada = Path(entrada)
    saida = Path(saida)
    if not entrada.is_dir():
        return ResultadoLote(1, "")
    try:
        saida.mkdir(parents=True, exist_ok=True)
    except OSError:
        return ResultadoLote(1, "")

    linhas = []
    eventos = []
    gerados = set()
    for caminho in _listar_json(entrada):
        origem = caminho.relative_to(entrada).as_posix()
        linha, motivos = _converter_arquivo(caminho, origem, saida, gerados)
        linhas.append(linha)
        eventos.extend(f"{origem}\t{motivo}" for motivo in motivos)

    orfaos = _orfaos(saida, gerados, limpar)
    eventos.extend(f"{nome}\torfao" for nome in orfaos)
    try:
        _publicar(saida / "resultado.csv", _csv(linhas))
        _publicar(saida / "erros.log", ("\n".join(eventos) + ("\n" if eventos else "")).encode("utf-8"))
    except OSError:
        return ResultadoLote(1, "")

    resumo = _resumo(linhas, len(orfaos))
    erros = sum(1 for linha in linhas if linha["status"] == "erro")
    codigo = 1 if estrito and erros else 0
    return ResultadoLote(codigo, resumo)


def limpar_codigo(valor):
    texto = "".join(
        caractere
        for caractere in valor
        if not caractere.isspace() and _PROIBIDOS.match(caractere) is None
    )
    texto = texto.rstrip(".")[:80].rstrip(".")
    if texto.upper() in RESERVADOS:
        return ""
    return texto


def _listar_json(entrada):
    encontrados = []
    for diretorio, subdirs, arquivos in os.walk(entrada, followlinks=False):
        pasta = Path(diretorio)
        subdirs[:] = [nome for nome in subdirs if not (pasta / nome).is_symlink()]
        for nome in arquivos:
            caminho = pasta / nome
            if caminho.suffix.lower() != ".json" or caminho.is_symlink():
                continue
            encontrados.append(caminho)
    encontrados.sort(key=lambda caminho: caminho.relative_to(entrada).as_posix())
    return encontrados


def _converter_arquivo(caminho, origem, saida, gerados):
    try:
        bruto = caminho.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return _linha("", origem, "", "erro"), ["leitura"]
    try:
        documento = json.loads(bruto)
    except json.JSONDecodeError:
        return _linha("", origem, "", "erro"), ["json_invalido"]
    if not isinstance(documento, dict) or not isinstance(documento.get("blocks"), list):
        codigo = _codigo_bruto(documento) if isinstance(documento, dict) else ""
        return _linha(codigo, origem, "", "erro"), ["blocks_invalidos"]

    situacao, codigo = _classificar_codigo(documento)
    if situacao != "ok":
        status = "erro" if situacao == "tipo_codigo" else situacao
        return _linha(codigo, origem, "", status), [situacao]

    corpo, motivos = renderizar(documento["blocks"])
    identificador = str(uuid.uuid5(NAMESPACE, hashlib.sha256(corpo.encode("utf-8")).hexdigest()))
    nome = f"{limpar_codigo(codigo)}_{identificador}.txt"
    if nome in gerados:
        return _linha(codigo, origem, "", "erro"), [*motivos, "colisao"]
    try:
        _publicar(saida / nome, (corpo + "\n").encode("utf-8") if corpo else b"")
    except OSError:
        return _linha(codigo, origem, "", "erro"), [*motivos, "leitura"]
    gerados.add(nome)
    return _linha(codigo, origem, nome, "convertido", identificador), motivos


def _classificar_codigo(documento):
    if "codigoDisciplina" not in documento or documento["codigoDisciplina"] is None:
        return "sem_codigo", ""
    valor = documento["codigoDisciplina"]
    if isinstance(valor, bool):
        return "tipo_codigo", ""
    if isinstance(valor, int):
        bruto = str(valor)
    elif isinstance(valor, str):
        bruto = valor
    else:
        return "tipo_codigo", ""
    if bruto == "" or not limpar_codigo(bruto):
        return "sem_codigo", bruto
    return "ok", bruto


def _codigo_bruto(documento):
    valor = documento.get("codigoDisciplina")
    if isinstance(valor, str):
        return valor
    if isinstance(valor, int) and not isinstance(valor, bool):
        return str(valor)
    return ""


def _linha(codigo, origem, arquivo, status, identificador=""):
    return {
        "codigoDisciplina": codigo,
        "uuid": identificador,
        "arquivo_origem": origem,
        "arquivo_saida": arquivo,
        "status": status,
    }


def _orfaos(saida, gerados, limpar):
    nomes = sorted(
        caminho.name
        for caminho in saida.iterdir()
        if caminho.is_file() and _ORFAO.match(caminho.name) and caminho.name not in gerados
    )
    if limpar:
        for nome in nomes:
            (saida / nome).unlink()
    return nomes


def _csv(linhas):
    buffer = io.StringIO(newline="")
    escritor = csv.DictWriter(buffer, fieldnames=COLUNAS, lineterminator="\n")
    escritor.writeheader()
    escritor.writerows(linhas)
    return buffer.getvalue().encode("utf-8")


def _resumo(linhas, orfaos):
    convertidos = [linha for linha in linhas if linha["status"] == "convertido"]
    repetidos = sum(
        1 for quantidade in Counter(linha["codigoDisciplina"] for linha in convertidos).values() if quantidade > 1
    )
    return (
        f"lidos: {len(linhas)}\n"
        f"convertidos: {len(convertidos)}\n"
        f"erros: {sum(1 for linha in linhas if linha['status'] == 'erro')}\n"
        f"sem_codigo: {sum(1 for linha in linhas if linha['status'] == 'sem_codigo')}\n"
        f"codigos_repetidos: {repetidos}\n"
        f"orfaos: {orfaos}\n"
    )


def _publicar(caminho, dados):
    temporario = caminho.with_name(caminho.name + ".tmp")
    temporario.write_bytes(dados)
    os.replace(temporario, caminho)
