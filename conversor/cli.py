"""Linha de comando do lote."""

import argparse

from conversor.lote import converter_pasta


def main(argv=None):
    analisador = argparse.ArgumentParser(prog="conversor")
    analisador.add_argument("--entrada", required=True)
    analisador.add_argument("--saida", default="output")
    analisador.add_argument("--limpar", action="store_true")
    analisador.add_argument("--estrito", action="store_true")
    argumentos = analisador.parse_args(argv)
    resultado = converter_pasta(
        argumentos.entrada,
        argumentos.saida,
        limpar=argumentos.limpar,
        estrito=argumentos.estrito,
    )
    if resultado.resumo:
        print(resultado.resumo, end="")
    return resultado.codigo_saida
