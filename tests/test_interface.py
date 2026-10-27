"""A interface local usa o lote da SPEC e a paleta de Design/DESIGN.md."""

import json
from urllib.request import urlopen

from tests.conftest import documento


def test_pagina_inicial_usa_a_paleta_e_as_duas_telas():
    from conversor.interface import pagina_converter

    html = pagina_converter()
    assert "Converter JSON para TXT" in html
    assert "Arquivos Processados" in html
    assert "#E53935" in html
    assert "Plus Jakarta Sans" in html
    assert "Selecionar arquivos JSON" in html


def test_envio_vazio_permanece_na_conversao(tmp_path):
    from conversor.interface import criar_servidor

    servidor = criar_servidor(tmp_path / "saida", "127.0.0.1", 0)
    servidor.timeout = 2
    fio = __import__("threading").Thread(target=servidor.serve_forever, daemon=True)
    fio.start()
    porta = servidor.server_address[1]
    try:
        limite = b"----LimiteConversor"
        pacote = b"\r\n".join([b"--" + limite, b'Content-Disposition: form-data; name="arquivos"; filename=""', b"", b"", b"--" + limite + b"--", b""])
        pedido = __import__("urllib.request").request.Request(
            f"http://127.0.0.1:{porta}/converter",
            data=pacote,
            method="POST",
            headers={"Content-Type": "multipart/form-data; boundary=----LimiteConversor"},
        )
        with urlopen(pedido) as resposta:
            pagina = resposta.read().decode("utf-8")
        assert resposta.status == 200
        assert "Nenhum arquivo JSON chegou" in pagina
        assert "Arquivos processados" not in pagina
        assert not (tmp_path / "saida" / "resultado.csv").exists()
    finally:
        servidor.shutdown()


def test_envio_aparece_na_lista(tmp_path):
    from conversor.interface import criar_servidor

    servidor = criar_servidor(tmp_path / "saida", "127.0.0.1", 0)
    servidor.timeout = 2
    fio = __import__("threading").Thread(target=servidor.serve_forever, daemon=True)
    fio.start()
    porta = servidor.server_address[1]
    base = f"http://127.0.0.1:{porta}"
    try:
        corpo = json.dumps(documento([{"type": "paragraph", "html": "Pela interface"}])).encode("utf-8")
        limite = b"----LimiteConversor"
        pacote = b"\r\n".join(
            [
                b"--" + limite,
                b'Content-Disposition: form-data; name="arquivos"; filename="nota.json"',
                b"Content-Type: application/json",
                b"",
                corpo,
                b"--" + limite + b"--",
                b"",
            ]
        )
        pedido = __import__("urllib.request").request.Request(
            base + "/converter",
            data=pacote,
            method="POST",
            headers={"Content-Type": "multipart/form-data; boundary=----LimiteConversor"},
        )
        with urlopen(pedido) as resposta:
            pagina = resposta.read().decode("utf-8")
        assert resposta.status == 200
        assert "nota.json" in pagina
        assert "convertido" in pagina
        assert "Pela interface" not in pagina or ".txt" in pagina
    finally:
        servidor.shutdown()
