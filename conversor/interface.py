"""Interface local no visual de Design/DESIGN.md."""

import csv
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote

from conversor.lote import converter_pasta

ESTILO = (Path(__file__).parent / "estatico" / "estilo.css").read_text(encoding="utf-8")


def pagina_converter(aviso=""):
    mensagem = f'<p class="aviso">{html.escape(aviso)}</p>' if aviso else '<p class="aviso" hidden></p>'
    return _moldura(
        "converter",
        f"""
        <section class="centro">
          <p class="selo">SANITIZADOR LOCAL</p>
          <h1>Converter JSON para TXT</h1>
          <p class="subtitulo">Gera o HTML sanitizado de cada JSON e registra a relação entre o código da disciplina e o UUID.</p>
        </section>
        <form class="cartao zona" action="/converter" method="post" enctype="multipart/form-data" onsubmit="return confirmarSelecao(this)" ondragover="event.preventDefault(); this.classList.add('arrastando')" ondragleave="this.classList.remove('arrastando')" ondrop="receberSoltura(event, this)">
          <div class="icone-zona" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E53935" stroke-width="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"></path>
            </svg>
          </div>
          <label class="botao">
            + Selecionar arquivos JSON
            <input class="arquivo" type="file" name="arquivos" accept=".json,application/json" multiple onchange="mostrarSelecao(this)">
          </label>
          <p class="selecionados">Nenhum arquivo selecionado.</p>
          <p class="dica">ou solte os arquivos <strong>.json</strong> aqui</p>
          <p class="nota-segura">O lote segue o contrato: blocks na ordem original, sem imagens e sem links.</p>
          <button class="botao" type="submit" style="margin-top: 18px">Converter agora</button>
          {mensagem}
        </form>
        <script>
          function mostrarSelecao(entrada) {{
            var nomes = [];
            for (var i = 0; i < entrada.files.length; i++) nomes.push(entrada.files[i].name);
            entrada.form.querySelector(".selecionados").textContent = nomes.length ? nomes.join(", ") : "Nenhum arquivo selecionado.";
          }}
          function confirmarSelecao(formulario) {{
            var entrada = formulario.querySelector("input[type=file]");
            if (entrada.files.length) return true;
            var aviso = formulario.querySelector(".aviso");
            aviso.hidden = false;
            aviso.textContent = "Selecione ao menos um arquivo JSON.";
            return false;
          }}
          function receberSoltura(evento, formulario) {{
            evento.preventDefault();
            formulario.classList.remove("arrastando");
            var entrada = formulario.querySelector("input[type=file]");
            entrada.files = evento.dataTransfer.files;
            mostrarSelecao(entrada);
            if (entrada.files.length) formulario.submit();
          }}
        </script>
        """,
    )


def pagina_arquivos(saida):
    linhas = _ler_linhas(saida)
    contagem = _contar(linhas)
    corpo = _tabela(linhas) if linhas else '<p class="vazio">Nenhum JSON convertido ainda.</p>'
    return _moldura(
        "arquivos",
        f"""
        <section class="metricas">
          <article class="cartao"><div><small>LIDOS</small><strong>{contagem["lidos"]}</strong></div></article>
          <article class="cartao"><div><small>CONVERTIDOS</small><strong>{contagem["convertidos"]}</strong></div></article>
          <article class="cartao"><div><small>ERROS</small><strong class="negativo">{contagem["erros"]}</strong></div></article>
          <article class="cartao"><div><small>SEM CÓDIGO</small><strong>{contagem["sem_codigo"]}</strong></div></article>
        </section>
        <div class="linha-titulo">
          <div>
            <p class="olho">RESULTADO DO LOTE</p>
            <h1>Arquivos processados</h1>
          </div>
          <a class="botao" href="/">+ Novo upload</a>
        </div>
        <section class="cartao painel">
          <input class="busca" type="search" placeholder="Buscar pelo arquivo original, saída ou código" oninput="filtrarTabela(this.value)">
          {corpo}
        </section>
        <script>
          function filtrarTabela(texto) {{
            var termo = texto.toLocaleLowerCase();
            document.querySelectorAll("tbody tr").forEach(function (linha) {{
              linha.hidden = !linha.innerText.toLocaleLowerCase().includes(termo);
            }});
          }}
        </script>
        """,
    )


def criar_servidor(saida, host="127.0.0.1", porta=8765):
    pasta = Path(saida)

    class Manipulador(BaseHTTPRequestHandler):
        def do_GET(self):
            caminho = self.path.split("?", 1)[0]
            if caminho in {"/", "/converter"}:
                self._html(pagina_converter())
            elif caminho == "/arquivos":
                self._html(pagina_arquivos(pasta))
            elif caminho == "/estilo.css":
                self._bytes(ESTILO.encode("utf-8"), "text/css; charset=utf-8")
            elif caminho.startswith("/baixar/"):
                self._baixar(unquote(caminho.removeprefix("/baixar/")))
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path.split("?", 1)[0] != "/converter":
                self.send_error(404)
                return
            arquivos = _extrair_arquivos(
                self.rfile.read(int(self.headers.get("Content-Length", "0"))),
                self.headers.get("Content-Type", ""),
            )
            if not arquivos:
                self._html(pagina_converter("Nenhum arquivo JSON chegou. Selecione o arquivo e clique em Converter agora."))
                return
            with TemporaryDirectory() as temporario:
                entrada = Path(temporario)
                for nome, conteudo in arquivos:
                    (entrada / nome).write_bytes(conteudo)
                converter_pasta(entrada, pasta)
            self.send_response(303)
            self.send_header("Location", "/arquivos")
            self.end_headers()

        def log_message(self, formato, *args):
            return

        def _html(self, pagina):
            self._bytes(pagina.encode("utf-8"), "text/html; charset=utf-8")

        def _bytes(self, dados, tipo):
            self.send_response(200)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

        def _baixar(self, nome):
            if "/" in nome or "\\" in nome or nome.startswith("."):
                self.send_error(404)
                return
            arquivo = pasta / nome
            if not arquivo.is_file() or arquivo.parent != pasta:
                self.send_error(404)
                return
            self._bytes(arquivo.read_bytes(), "text/plain; charset=utf-8")

    return ThreadingHTTPServer((host, porta), Manipulador)


def main():
    servidor = criar_servidor(Path("output"))
    print("CleanTXT em http://127.0.0.1:8765")
    servidor.serve_forever()


def _moldura(ativo, conteudo):
    def classe(nome):
        return "ativo" if nome == ativo else ""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#E53935">
  <title>CleanTXT</title>
  <style>body {{ font-family: "Plus Jakarta Sans", sans-serif; }}</style>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&amp;display=swap">
  <link rel="stylesheet" href="/estilo.css">
</head>
<body>
  <header class="topo">
    <a class="marca" href="/">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#E53935"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path></svg>
      CleanTXT
    </a>
    <nav class="nav">
      <a class="{classe("converter")}" href="/">Converter JSON/HTML</a>
      <a class="{classe("arquivos")}" href="/arquivos">Arquivos Processados</a>
    </nav>
  </header>
  <main class="miolo">{conteudo}</main>
  <footer class="rodape"><span>CleanTXT · processamento local</span><span>Converter · Arquivos</span></footer>
</body>
</html>"""


def _ler_linhas(saida):
    arquivo = Path(saida) / "resultado.csv"
    if not arquivo.is_file():
        return []
    with arquivo.open(encoding="utf-8", newline="") as planilha:
        return list(csv.DictReader(planilha))


def _contar(linhas):
    return {
        "lidos": len(linhas),
        "convertidos": sum(1 for linha in linhas if linha["status"] == "convertido"),
        "erros": sum(1 for linha in linhas if linha["status"] == "erro"),
        "sem_codigo": sum(1 for linha in linhas if linha["status"] == "sem_codigo"),
    }


def _tabela(linhas):
    corpo = []
    for linha in linhas:
        saida = linha["arquivo_saida"]
        destino = f'<a href="/baixar/{html.escape(saida, quote=True)}">{html.escape(saida)}</a>' if saida else ""
        corpo.append(
            "<tr>"
            f"<td>{html.escape(linha['arquivo_origem'])}</td>"
            f"<td>{destino}</td>"
            f"<td><span class=\"pilula {html.escape(linha['status'], quote=True)}\">{html.escape(linha['status'])}</span></td>"
            f"<td>{html.escape(linha['codigoDisciplina'])}</td>"
            f"<td>{html.escape(linha['uuid'])}</td>"
            "</tr>"
        )
    return (
        "<table><thead><tr>"
        "<th>Arquivo original</th><th>Saída</th><th>Status</th><th>Código</th><th>UUID</th>"
        "</tr></thead><tbody>"
        + "".join(corpo)
        + "</tbody></table>"
    )


def _extrair_arquivos(corpo, tipo):
    if "boundary=" not in tipo:
        return []
    limite = tipo.split("boundary=", 1)[1].strip().strip('"').encode("utf-8")
    arquivos = []
    for pedaco in corpo.split(b"--" + limite):
        if not pedaco or pedaco.startswith(b"--"):
            continue
        pedaco = pedaco.removeprefix(b"\r\n").removesuffix(b"\r\n")
        if b"\r\n\r\n" not in pedaco:
            continue
        cabecalho, conteudo = pedaco.split(b"\r\n\r\n", 1)
        texto = cabecalho.decode("utf-8", "replace")
        if 'filename="' not in texto:
            continue
        nome = Path(texto.split('filename="', 1)[1].split('"', 1)[0]).name
        if not nome.lower().endswith(".json"):
            continue
        arquivos.append((nome, conteudo.removesuffix(b"\r\n")))
    return arquivos


if __name__ == "__main__":
    main()
