"""Testes do contrato em docs/SPEC.md. Cada teste cita o critério que cobre."""

import hashlib
import json
import uuid
from pathlib import Path

import pytest

from tests.conftest import corpo, documento, executar, ler_csv, ler_log, txt_unico

FIXTURES = Path(__file__).parent / "fixtures"
NAMESPACE = uuid.UUID("d1698526-798c-54c8-b0e5-cfba1794bddb")
ORFAO = "VELHO_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.txt"


def carregar_fixture(nome):
    return json.loads((FIXTURES / nome).read_text(encoding="utf-8"))


def uuid_do_corpo(texto):
    chave = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return str(uuid.uuid5(NAMESPACE, chave))


def test_ca01_paragrafo_remove_class(tmp_path):
    """CA-01, RF-04, RF-10."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("paragraph.json")},
    )
    texto = corpo(saida)
    assert "<p><strong>Titulo</strong></p>" in texto
    assert "class" not in texto


def test_ca02_heading_escapa_texto(tmp_path):
    """CA-02, RF-05."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("heading.json")},
    )
    assert "<h2>A &lt; B</h2>" in corpo(saida)


def test_ca03_link_e_ancora_vazia(tmp_path):
    """CA-03, RF-11, RF-13."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    {
                        "type": "paragraph",
                        "html": '<a href="https://exemplo.test/x">texto</a>',
                    },
                    {
                        "type": "paragraph",
                        "html": '<a id="_Toc146571594"></a>',
                    },
                ]
            )
        },
    )
    texto = corpo(saida)
    assert "<p>texto</p>" in texto
    assert "href" not in texto
    assert "_Toc146571594" not in texto
    assert texto.strip() == "<p>texto</p>"


def test_ca04_tabela_preserva_tbody_colspan_e_lista(tmp_path):
    """CA-04, RF-06, RF-10."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("table.json")},
    )
    texto = corpo(saida)
    assert texto.count("<table") == 1
    assert "<tbody>" in texto
    assert "style" not in texto
    assert 'colspan="2"' in texto
    assert "<ul>" in texto
    assert "<li>Item</li>" in texto


def test_ca04_tabela_sem_tag_externa_embrulha(tmp_path):
    """CA-04, RF-06."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    {
                        "type": "table",
                        "html": "<tr><td>Celula</td></tr>",
                    }
                ]
            )
        },
    )
    texto = corpo(saida)
    assert texto.count("<table") == 1
    assert "Celula" in texto


def test_ca05_imagem_nao_entra_no_txt(tmp_path):
    """CA-05, RF-08, RF-12."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    carregar_fixture("image_group.json")["blocks"][0],
                    {
                        "type": "paragraph",
                        "html": '<img src="AAAA" alt="foto">legenda',
                    },
                ]
            )
        },
    )
    texto = corpo(saida)
    assert "legenda" in texto
    assert "img" not in texto
    assert "src" not in texto
    assert "AAAA" not in texto


def test_ca06_remove_cinco_tags_com_conteudo(tmp_path):
    """CA-06, RF-10, RF-12."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("sintetico.json")},
    )
    texto = corpo(saida)
    for marcador in (
        "ALERTA_SCRIPT",
        "ALERTA_STYLE",
        "ALERTA_IFRAME",
        "ALERTA_OBJECT",
        "ALERTA_EMBED",
    ):
        assert marcador not in texto
    for tag in ("script", "style", "iframe", "object", "embed"):
        assert f"<{tag}" not in texto
    assert "texto do link" in texto


def test_ca07_aside_vira_paragrafo(tmp_path):
    """CA-07, RF-07."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("aside.json")},
    )
    texto = corpo(saida)
    assert "<p>Assista o vídeo</p>" in texto
    assert "aside" not in texto
    assert "role" not in texto


def test_ca08_reexecucao_estavel_e_uuid_fora_do_txt(tmp_path):
    """CA-08, RF-14, RF-22."""
    arquivos = {"a.json": documento([{"type": "paragraph", "html": "Estavel"}])}
    saida, primeiro = executar(tmp_path, arquivos)
    primeiro_txt = txt_unico(saida).read_bytes()
    primeiro_csv = (saida / "resultado.csv").read_bytes()
    primeiro_log = (saida / "erros.log").read_bytes()
    saida, _segundo = executar(tmp_path, arquivos)
    assert txt_unico(saida).read_bytes() == primeiro_txt
    assert (saida / "resultado.csv").read_bytes() == primeiro_csv
    assert (saida / "erros.log").read_bytes() == primeiro_log
    uuid_arquivo = txt_unico(saida).stem.split("_", 1)[1]
    assert uuid_arquivo not in primeiro_txt.decode("utf-8")
    assert primeiro.resumo == _segundo.resumo


def test_ca09_codigos_invalidos_e_inteiro(tmp_path):
    """CA-09, RF-16, RF-17, RF-18."""
    casos_sem_codigo = {
        "ausente.json": carregar_fixture("codigo_ausente.json"),
        "vazio.json": carregar_fixture("codigo_vazio.json"),
        "invalido.json": carregar_fixture("codigo_invalido.json"),
        "reservado.json": documento([{"type": "paragraph", "html": "x"}], codigo="CON"),
        "ponto.json": documento([{"type": "paragraph", "html": "x"}], codigo="."),
    }
    saida, _resultado = executar(tmp_path, casos_sem_codigo)
    linhas = ler_csv(saida)
    assert len(linhas) == 5
    assert {linha["status"] for linha in linhas} == {"sem_codigo"}
    assert list(saida.glob("*.txt")) == []
    assert all("sem_codigo" in linha for linha in ler_log(saida))

    saida_erro, _resultado = executar(
        tmp_path / "erros",
        {
            "float.json": documento([{"type": "paragraph", "html": "x"}], codigo=1.5),
            "bool.json": documento([{"type": "paragraph", "html": "x"}], codigo=True),
            "lista.json": documento([{"type": "paragraph", "html": "x"}], codigo=["A"]),
            "objeto.json": documento(
                [{"type": "paragraph", "html": "x"}],
                codigo={"valor": "A"},
            ),
        },
    )
    assert {linha["status"] for linha in ler_csv(saida_erro)} == {"erro"}
    assert all(linha.endswith("\ttipo_codigo") for linha in ler_log(saida_erro))

    saida_int, _resultado = executar(
        tmp_path / "inteiro",
        {"a.json": carregar_fixture("codigo_inteiro.json")},
    )
    linha = ler_csv(saida_int)[0]
    assert linha["status"] == "convertido"
    assert linha["codigoDisciplina"] == "42"
    assert txt_unico(saida_int).name.startswith("42_")


def test_ca10_dois_corpos_e_reexecucao(tmp_path):
    """CA-10, RF-19, RF-22."""
    arquivos = {
        "a.json": documento([{"type": "paragraph", "html": "Um"}]),
        "b.json": documento([{"type": "paragraph", "html": "Dois"}]),
    }
    saida, _resultado = executar(tmp_path, arquivos)
    primeira_csv = (saida / "resultado.csv").read_bytes()
    linhas = ler_csv(saida)
    assert [linha["arquivo_origem"] for linha in linhas] == ["a.json", "b.json"]
    assert linhas[0]["uuid"] != linhas[1]["uuid"]
    assert linhas[0]["codigoDisciplina"] == linhas[1]["codigoDisciplina"] == "ADS001"
    executar(tmp_path, arquivos)
    assert (saida / "resultado.csv").read_bytes() == primeira_csv


def test_ca11_json_invalido_nao_derruba_o_lote(tmp_path):
    """CA-11, RF-02, RF-20."""
    saida, resultado = executar(
        tmp_path,
        {
            "a.json": documento([{"type": "paragraph", "html": "Valido"}]),
            "b.json": "{",
            "c.json": documento([{"type": "paragraph", "html": "Tambem"}]),
        },
    )
    linhas = {linha["arquivo_origem"]: linha for linha in ler_csv(saida)}
    assert linhas["a.json"]["status"] == "convertido"
    assert linhas["c.json"]["status"] == "convertido"
    assert linhas["b.json"]["status"] == "erro"
    assert "b.json\tjson_invalido" in ler_log(saida)
    assert resultado.codigo_saida == 0
    assert len(list(saida.glob("*.txt"))) == 2


def test_ca12_caminho_com_espaco_acento_e_virgula(tmp_path):
    """CA-12, RF-23."""
    relativo = "disciplina, ção/nota final.json"
    saida, _resultado = executar(
        tmp_path,
        {relativo: documento([{"type": "paragraph", "html": "Caminho"}])},
    )
    assert ler_csv(saida)[0]["arquivo_origem"] == relativo


def test_ca13_ignora_metadados_duplicados(tmp_path):
    """CA-13, RF-03."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [{"type": "paragraph", "html": "SO_BLOCO"}],
                toc=[{"title": "SO_TOC"}],
                headings=[{"text": "SO_HEADING"}],
                contentHtml="<p>SO_CONTENT</p>",
            )
        },
    )
    texto = corpo(saida)
    assert "SO_BLOCO" in texto
    assert "SO_TOC" not in texto
    assert "SO_HEADING" not in texto
    assert "SO_CONTENT" not in texto


def test_ca14_so_imagem_gera_txt_vazio(tmp_path):
    """CA-14, RF-26."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": carregar_fixture("image_group.json")},
    )
    arquivo = txt_unico(saida)
    assert arquivo.read_bytes() == b""
    assert ler_csv(saida)[0]["status"] == "convertido"
    assert arquivo.stem.endswith(uuid_do_corpo(""))


def test_ca15_sumario_preserva_tabulacao(tmp_path):
    """CA-15, RF-03, RF-11."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    {"type": "heading", "tag": "h2", "level": 2, "text": "SUMÁRIO"},
                    {
                        "type": "paragraph",
                        "html": '<a href="#_Toc199495875">INTRODUÇÃO\t3</a>',
                    },
                ]
            )
        },
    )
    texto = corpo(saida)
    assert "<h2>SUMÁRIO</h2>" in texto
    assert "<p>INTRODUÇÃO\t3</p>" in texto
    assert "href" not in texto
    assert "id=" not in texto


def test_ca16_url_visivel_permanece(tmp_path):
    """CA-16, RF-11."""
    url = "https://www.youtube.com/watch?v=cYefPOPuHOE"
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [{"type": "paragraph", "html": f'<a href="{url}">{url}</a>'}]
            )
        },
    )
    texto = corpo(saida)
    assert f"<p>{url}</p>" in texto
    assert "href" not in texto


def test_ca17_document_id_nao_muda_uuid(tmp_path):
    """CA-17, RF-14."""
    bloco = [{"type": "paragraph", "html": "Mesmo"}]
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(bloco, codigo="ADS001", documentId="doc_aaa_111"),
            "b.json": documento(bloco, codigo="ADS002", documentId="doc_bbb_222"),
        },
    )
    linhas = ler_csv(saida)
    assert linhas[0]["uuid"] == linhas[1]["uuid"]


def test_ca18_conteudo_diferente_muda_uuid(tmp_path):
    """CA-18, RF-14."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento([{"type": "paragraph", "html": "Um"}]),
            "b.json": documento([{"type": "paragraph", "html": "Outro"}]),
        },
    )
    linhas = ler_csv(saida)
    assert linhas[0]["uuid"] != linhas[1]["uuid"]


def test_ca19_trocar_codigo_mantem_uuid(tmp_path):
    """CA-19, RF-14, RF-15."""
    bloco = [{"type": "paragraph", "html": "Igual"}]
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(bloco, codigo="ADS001"),
            "b.json": documento(bloco, codigo="MAT002"),
        },
    )
    linhas = ler_csv(saida)
    assert linhas[0]["uuid"] == linhas[1]["uuid"]
    assert linhas[0]["arquivo_saida"].startswith("ADS001_")
    assert linhas[1]["arquivo_saida"].startswith("MAT002_")
    assert linhas[0]["arquivo_saida"].endswith(linhas[1]["arquivo_saida"].split("_", 1)[1])


def test_ca20_colisao_nao_sobrescreve(tmp_path):
    """CA-20, RF-24."""
    bloco = [{"type": "paragraph", "html": "Igual"}]
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(bloco),
            "b.json": documento(bloco),
        },
    )
    linhas = {linha["arquivo_origem"]: linha for linha in ler_csv(saida)}
    assert linhas["a.json"]["status"] == "convertido"
    assert linhas["b.json"]["status"] == "erro"
    assert linhas["b.json"]["arquivo_saida"] == ""
    assert "b.json\tcolisao" in ler_log(saida)
    assert len(list(saida.glob("*.txt"))) == 1
    assert "Igual" in corpo(saida)


def test_ca21_orfaos_listados_e_limpos(tmp_path):
    """CA-21, RF-27, RF-28."""

    def plantar(pasta):
        (pasta / ORFAO).write_text("antigo", encoding="utf-8")
        (pasta / "notas.txt").write_text("nota", encoding="utf-8")

    saida, resultado = executar(
        tmp_path,
        {"a.json": documento([{"type": "paragraph", "html": "Novo"}])},
        preparar_saida=plantar,
    )
    assert (saida / ORFAO).read_text(encoding="utf-8") == "antigo"
    assert (saida / "notas.txt").read_text(encoding="utf-8") == "nota"
    assert f"{ORFAO}\torfao" in ler_log(saida)
    assert "orfaos: 1" in resultado.resumo

    saida_limpa, _resultado = executar(
        tmp_path / "limpo",
        {"a.json": documento([{"type": "paragraph", "html": "Novo"}])},
        limpar=True,
        preparar_saida=plantar,
    )
    assert not (saida_limpa / ORFAO).exists()
    assert (saida_limpa / "notas.txt").read_text(encoding="utf-8") == "nota"
    assert any(caminho.suffix == ".txt" and caminho.name != "notas.txt" for caminho in saida_limpa.iterdir())


def test_ca22_recursao_symlink_e_ordem(tmp_path):
    """CA-22, RF-01."""
    entrada = tmp_path / "entrada"
    saida = tmp_path / "saida"
    (entrada / "a").mkdir(parents=True)
    (entrada / "a" / "z.json").write_text(
        json.dumps(documento([{"type": "paragraph", "html": "Sub"}])),
        encoding="utf-8",
    )
    (entrada / "m.json").write_text(
        json.dumps(documento([{"type": "paragraph", "html": "Topo"}])),
        encoding="utf-8",
    )
    externo = tmp_path / "externo"
    externo.mkdir()
    (externo / "escondido.json").write_text(
        json.dumps(documento([{"type": "paragraph", "html": "Fora"}])),
        encoding="utf-8",
    )
    try:
        (entrada / "atalho.json").symlink_to(externo / "escondido.json")
        (entrada / "pasta_link").symlink_to(externo, target_is_directory=True)
    except OSError:
        pytest.skip("o sistema não permite criar link simbólico")

    from conversor.lote import converter_pasta

    converter_pasta(entrada, saida)
    origens = [linha["arquivo_origem"] for linha in ler_csv(saida)]
    assert origens == ["a/z.json", "m.json"]
    textos = " ".join(caminho.read_text(encoding="utf-8") for caminho in saida.glob("*.txt"))
    assert "Fora" not in textos


def test_ca23_blocks_ausente_ou_invalido(tmp_path):
    """CA-23, RF-02."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": {"codigoDisciplina": "ADS001"},
            "b.json": {"codigoDisciplina": "ADS001", "blocks": {"type": "paragraph"}},
            "c.json": documento([{"type": "paragraph", "html": "Segue"}]),
        },
    )
    linhas = {linha["arquivo_origem"]: linha for linha in ler_csv(saida)}
    assert linhas["a.json"]["status"] == "erro"
    assert linhas["b.json"]["status"] == "erro"
    assert linhas["c.json"]["status"] == "convertido"
    log = ler_log(saida)
    assert "a.json\tblocks_invalidos" in log
    assert "b.json\tblocks_invalidos" in log


def test_ca24_tipo_desconhecido_nao_falha_o_arquivo(tmp_path):
    """CA-24, RF-09."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    {"type": "widget", "text": "NAO_EMITIR"},
                    {"type": "paragraph", "html": "Visivel"},
                ]
            )
        },
    )
    texto = corpo(saida)
    assert "Visivel" in texto
    assert "NAO_EMITIR" not in texto
    assert ler_csv(saida)[0]["status"] == "convertido"
    assert "a.json\tbloco_ignorado:widget" in ler_log(saida)


def test_rf15_codigo_com_underscore_preserva_o_uuid(tmp_path):
    """RF-15."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": documento([{"type": "paragraph", "html": "X"}], codigo="A_B")},
    )
    linha = ler_csv(saida)[0]
    assert linha["arquivo_saida"].startswith("A_B_")
    assert uuid.UUID(linha["uuid"]).version == 5
    assert linha["arquivo_saida"] == f"A_B_{linha['uuid']}.txt"


def test_ca25_formato_do_nome(tmp_path):
    """CA-25, RF-15."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": documento([{"type": "paragraph", "html": "Nome"}])},
    )
    nome = txt_unico(saida).name
    prefixo, uuid_nome = nome.removesuffix(".txt").split("_", 1)
    assert prefixo == "ADS001"
    assert uuid.UUID(uuid_nome).version == 5
    assert uuid_nome == uuid_nome.lower()
    assert len(uuid_nome) == 36


def test_ca26_resumo_no_stdout(tmp_path, capsys):
    """CA-26, RF-21."""

    def plantar(pasta):
        (pasta / ORFAO).write_text("antigo", encoding="utf-8")

    entrada = tmp_path / "entrada"
    saida = tmp_path / "saida"
    entrada.mkdir()
    saida.mkdir()
    plantar(saida)
    arquivos = {
        "a.json": documento([{"type": "paragraph", "html": "Um"}]),
        "b.json": documento([{"type": "paragraph", "html": "Dois"}]),
        "c.json": "{",
        "d.json": documento([{"type": "paragraph", "html": "Sem"}], codigo=None),
    }
    for nome, conteudo in arquivos.items():
        (entrada / nome).write_text(
            conteudo if isinstance(conteudo, str) else json.dumps(conteudo),
            encoding="utf-8",
        )
    from conversor.cli import main

    codigo = main(["--entrada", str(entrada), "--saida", str(saida)])
    saida_padrao = capsys.readouterr().out
    assert codigo == 0
    assert saida_padrao == (
        "lidos: 4\n"
        "convertidos: 2\n"
        "erros: 1\n"
        "sem_codigo: 1\n"
        "codigos_repetidos: 1\n"
        "orfaos: 1\n"
    )


def test_ca27_codigo_de_saida(tmp_path, capsys):
    """CA-27, D-08, RF-30."""
    from conversor.cli import main

    assert (
        main(
            [
                "--entrada",
                str(tmp_path / "nao-existe"),
                "--saida",
                str(tmp_path / "saida"),
            ]
        )
        == 1
    )
    capsys.readouterr()

    entrada = tmp_path / "entrada"
    saida = tmp_path / "saida"
    entrada.mkdir()
    (entrada / "a.json").write_text("{", encoding="utf-8")
    assert main(["--entrada", str(entrada), "--saida", str(saida)]) == 0
    assert (
        main(["--entrada", str(entrada), "--saida", str(saida), "--estrito"]) == 1
    )

    entrada_codigo = tmp_path / "sem"
    saida_codigo = tmp_path / "saida-sem"
    entrada_codigo.mkdir()
    (entrada_codigo / "a.json").write_text(
        json.dumps(documento([{"type": "paragraph", "html": "x"}], codigo=None)),
        encoding="utf-8",
    )
    assert (
        main(
            [
                "--entrada",
                str(entrada_codigo),
                "--saida",
                str(saida_codigo),
                "--estrito",
            ]
        )
        == 0
    )


def test_ca28_paragrafos_vazios(tmp_path):
    """CA-28, RF-04, RF-13."""
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [
                    {"type": "paragraph", "html": "   \t\n"},
                    {"type": "paragraph", "html": "&nbsp;"},
                    {"type": "paragraph", "html": "\u200b"},
                    {"type": "paragraph", "html": "<br>"},
                    {"type": "paragraph", "html": "a\u200bb"},
                ]
            )
        },
    )
    texto = corpo(saida)
    assert "<p><br></p>" in texto or "<p><br/></p>" in texto
    assert "a\u200bb" in texto
    assert texto.count("<p") == 2


def test_ca29_nao_deixa_temporario(tmp_path):
    """CA-29, RF-29."""
    saida, _resultado = executar(
        tmp_path,
        {"a.json": documento([{"type": "paragraph", "html": "Fim"}])},
    )
    assert list(saida.glob("*.tmp")) == []


def test_rf16_mantem_acento_virgula_e_corta_em_80(tmp_path):
    """RF-16."""
    longo = "Á" * 81
    saida, _resultado = executar(
        tmp_path,
        {
            "a.json": documento(
                [{"type": "paragraph", "html": "Acento"}],
                codigo="LIÇÃO,01",
            ),
            "b.json": documento(
                [{"type": "paragraph", "html": "Longo"}],
                codigo=longo,
            ),
        },
    )
    nomes = {caminho.name for caminho in saida.glob("*.txt")}
    assert any(nome.startswith("LIÇÃO,01_") for nome in nomes)
    assert any(nome.startswith(("Á" * 80) + "_") for nome in nomes)
    assert not any(nome.startswith(longo + "_") for nome in nomes)
