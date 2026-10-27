"""Monta o HTML de blocks e sanitiza uma única vez."""

import html
import re
from html.parser import HTMLParser

import nh3

TAGS_PERMITIDAS = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "blockquote",
}
TAGS_SEM_CONTEUDO = {"script", "style", "iframe", "object", "embed"}
ATRIBUTOS_PERMITIDOS = {
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}
TAGS_VAZIAS = {"br"}
INVISIVEIS = frozenset("\u200b\u200c\u200d\u2060\ufeff")
# O parser HTML trata embed e img como vazias e deixaria o miolo escapar do nh3.
_FECHO_VAZIO = re.compile(
    r"<(embed|img)\b[^>]*>.*?</\1\s*>",
    re.IGNORECASE | re.DOTALL,
)


def renderizar(blocks):
    """Devolve o corpo sem o \\n final do arquivo e os motivos de bloco ignorado."""
    fragmentos = []
    motivos = []
    for bloco in blocks:
        fragmento, motivo = _fragmento(bloco)
        if motivo:
            motivos.append(motivo)
        if fragmento:
            fragmentos.append(fragmento)
    documento = "\n".join(fragmentos)
    documento = _FECHO_VAZIO.sub("", documento)
    limpo = nh3.clean(
        documento,
        tags=TAGS_PERMITIDAS,
        clean_content_tags=TAGS_SEM_CONTEUDO,
        attributes=ATRIBUTOS_PERMITIDOS,
    )
    return _podar_e_juntar(limpo), motivos


def _fragmento(bloco):
    if not isinstance(bloco, dict):
        return "", "bloco_ignorado:"
    tipo = bloco.get("type")
    if tipo == "paragraph":
        miolo = bloco.get("html")
        if not isinstance(miolo, str):
            miolo = _escapar(bloco.get("text") if isinstance(bloco.get("text"), str) else "")
        return f"<p>{miolo}</p>", ""
    if tipo == "heading":
        tag = _tag_heading(bloco)
        if tag is None:
            return "", "bloco_ignorado:heading"
        texto = bloco.get("text") if isinstance(bloco.get("text"), str) else ""
        return f"<{tag}>{_escapar(texto)}</{tag}>", ""
    if tipo == "table":
        return _tabela(bloco), ""
    if tipo == "aside":
        texto = bloco.get("text") if isinstance(bloco.get("text"), str) else ""
        return f"<p>{_escapar(texto)}</p>", ""
    if tipo == "imageGroup":
        return "", ""
    return "", f"bloco_ignorado:{tipo}"


def _tag_heading(bloco):
    nivel = bloco.get("level")
    if isinstance(nivel, int) and not isinstance(nivel, bool) and 1 <= nivel <= 6:
        return f"h{nivel}"
    tag = bloco.get("tag")
    if isinstance(tag, str) and tag.lower() in {f"h{indice}" for indice in range(1, 7)}:
        return tag.lower()
    return None


def _tabela(bloco):
    html_tabela = bloco.get("html")
    if isinstance(html_tabela, str) and html_tabela.strip():
        if html_tabela.lstrip()[:6].lower() == "<table":
            return html_tabela
        return f"<table>{html_tabela}</table>"
    return _tabela_de_linhas(bloco.get("rows"))


def _tabela_de_linhas(linhas):
    partes = ["<table>"]
    if isinstance(linhas, list):
        for linha in linhas:
            if not isinstance(linha, list):
                continue
            partes.append("<tr>")
            for celula in linha:
                partes.append(_celula(celula))
            partes.append("</tr>")
    partes.append("</table>")
    return "".join(partes)


def _celula(celula):
    if not isinstance(celula, dict):
        return "<td></td>"
    tag = celula.get("tag")
    tag = tag.lower() if isinstance(tag, str) and tag.lower() in {"td", "th"} else "td"
    atributos = ""
    for nome in ("colspan", "rowspan"):
        valor = celula.get(nome)
        if isinstance(valor, int) and not isinstance(valor, bool) and valor > 1:
            atributos += f' {nome}="{valor}"'
    texto = celula.get("text") if isinstance(celula.get("text"), str) else ""
    return f"<{tag}{atributos}>{_escapar(texto)}</{tag}>"


def _escapar(texto):
    return html.escape(texto, quote=True)


def _podar_e_juntar(documento):
    analisador = _ArvoreHtml()
    analisador.feed(documento)
    analisador.close()
    partes = []
    for no in analisador.raiz:
        podado = _podar(no)
        if podado is None:
            continue
        if isinstance(podado, str):
            if podado.strip() == "":
                continue
            partes.append(html.escape(podado, quote=False))
            continue
        partes.append(_serializar(podado))
    return "\n".join(partes)


def _podar(no):
    if isinstance(no, str):
        return no
    filhos = []
    for filho in no["filhos"]:
        podado = _podar(filho)
        if podado is not None:
            filhos.append(podado)
    no = {"tag": no["tag"], "attrs": no["attrs"], "filhos": filhos}
    if _deve_remover(no):
        return None
    return no


def _deve_remover(no):
    if no["tag"] not in {"p", "h1", "h2", "h3", "h4", "h5", "h6"}:
        return False
    if no["tag"] == "p" and _tem_br(no):
        return False
    return _texto_vazio(_texto(no))


def _tem_br(no):
    for filho in no["filhos"]:
        if isinstance(filho, dict) and (filho["tag"] == "br" or _tem_br(filho)):
            return True
    return False


def _texto(no):
    if isinstance(no, str):
        return no
    return "".join(_texto(filho) for filho in no["filhos"])


def _texto_vazio(texto):
    return not any(caractere not in INVISIVEIS and not caractere.isspace() for caractere in texto)


def _serializar(no):
    if isinstance(no, str):
        return html.escape(no, quote=False)
    atributos = ""
    if no["tag"] in {"td", "th"}:
        for chave, valor in no["attrs"]:
            if chave in {"colspan", "rowspan"}:
                atributos += f' {chave}="{html.escape(valor, quote=True)}"'
    if no["tag"] in TAGS_VAZIAS:
        return f"<{no['tag']}>"
    interno = "".join(_serializar(filho) for filho in no["filhos"])
    return f"<{no['tag']}{atributos}>{interno}</{no['tag']}>"


class _ArvoreHtml(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.raiz = []
        self._pilha = []

    def handle_starttag(self, tag, attrs):
        no = {"tag": tag, "attrs": attrs, "filhos": []}
        self._anexar(no)
        if tag not in TAGS_VAZIAS:
            self._pilha.append(no)

    def handle_startendtag(self, tag, attrs):
        self._anexar({"tag": tag, "attrs": attrs, "filhos": []})

    def handle_endtag(self, tag):
        while self._pilha:
            atual = self._pilha.pop()
            if atual["tag"] == tag:
                break

    def handle_data(self, data):
        self._anexar(data)

    def _anexar(self, no):
        if self._pilha:
            self._pilha[-1]["filhos"].append(no)
        else:
            self.raiz.append(no)
