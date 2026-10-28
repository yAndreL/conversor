import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v5 as uuidv5 } from "uuid";
import { afterEach, describe, expect, it } from "vitest";

import { converterPasta, limparCodigo, main } from "@conversor/core";

const RAIZ_TESTE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(RAIZ_TESTE, "fixtures");
const NAMESPACE = "d1698526-798c-54c8-b0e5-cfba1794bddb";
const ORFAO = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.txt";
const pastas: string[] = [];

afterEach(() => {
  for (const pasta of pastas.splice(0)) {
    rmSync(pasta, { recursive: true, force: true });
  }
});

function titulo(texto: string, nivel: number): Record<string, unknown> {
  return { type: "heading", tag: `h${nivel}`, level: nivel, text: texto };
}

function juntarTitulos(textos: string[], niveis: number[]): string {
  return `${textos.map((texto, indice) => `<h${niveis[indice]}>${texto}</h${niveis[indice]}>`).join("\n")}\n`;
}

function documento(
  blocks: unknown[],
  opcoes: { codigo?: unknown; omitirCodigo?: boolean; extra?: Record<string, unknown> } = {},
): Record<string, unknown> {
  const dados: Record<string, unknown> = { blocks };
  if (!opcoes.omitirCodigo) {
    dados.codigoDisciplina = opcoes.codigo === undefined ? "ADS001" : opcoes.codigo;
  }
  Object.assign(dados, opcoes.extra ?? {});
  return dados;
}

function executar(
  arquivos: Record<string, unknown>,
  opcoes: {
    limpar?: boolean;
    estrito?: boolean;
    preparar?: (saida: string) => void;
  } = {},
): { saida: string; codigoSaida: number; resumo: string } {
  const raiz = mkdtempSync(path.join(tmpdir(), "conversor-"));
  pastas.push(raiz);
  const entrada = path.join(raiz, "entrada");
  const saida = path.join(raiz, "saida");
  mkdirSync(entrada, { recursive: true });
  mkdirSync(saida, { recursive: true });
  opcoes.preparar?.(saida);
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const caminho = path.join(entrada, ...nome.split("/"));
    mkdirSync(path.dirname(caminho), { recursive: true });
    const texto = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo);
    writeFileSync(caminho, texto, "utf8");
  }
  const resultado = converterPasta(entrada, saida, {
    limpar: opcoes.limpar ?? false,
    estrito: opcoes.estrito ?? false,
  });
  return { raiz, entrada, saida, codigoSaida: resultado.codigoSaida, resumo: resultado.resumo };
}

function analisarCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let aspas = false;
  for (let indice = 0; indice < texto.length; indice += 1) {
    const caractere = texto[indice] ?? "";
    if (aspas) {
      if (caractere === '"') {
        if (texto[indice + 1] === '"') {
          campo += '"';
          indice += 1;
        } else {
          aspas = false;
        }
      } else {
        campo += caractere;
      }
      continue;
    }
    if (caractere === '"') {
      aspas = true;
    } else if (caractere === ",") {
      atual.push(campo);
      campo = "";
    } else if (caractere === "\n") {
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else if (caractere !== "\r") {
      campo += caractere;
    }
  }
  if (campo.length > 0 || atual.length > 0) {
    atual.push(campo);
    linhas.push(atual);
  }
  return linhas.filter((linha) => linha.some((coluna) => coluna.length > 0));
}

function lerCsv(saida: string): Record<string, string>[] {
  const tabela = analisarCsv(readFileSync(path.join(saida, "resultado.csv"), "utf8"));
  const cabecalho = tabela[0] ?? [];
  return tabela.slice(1).map((colunas) =>
    Object.fromEntries(cabecalho.map((nome, indice) => [nome, colunas[indice] ?? ""])),
  );
}

function lerLog(saida: string): string[] {
  return readFileSync(path.join(saida, "erros.log"), "utf8")
    .split("\n")
    .filter((linha) => linha.length > 0);
}

function txts(saida: string): string[] {
  return readdirSync(saida)
    .filter((nome) => nome.endsWith(".txt"))
    .sort();
}

function txtUnico(saida: string): string {
  const arquivos = txts(saida);
  expect(arquivos).toHaveLength(1);
  return path.join(saida, arquivos[0] ?? "");
}

function corpo(saida: string): string {
  return readFileSync(txtUnico(saida), "utf8");
}

function carregarFixture(nome: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, nome), "utf8")) as unknown;
}

function capturar(acao: () => number): { codigo: number; saida: string } {
  let saida = "";
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    saida += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    return { codigo: acao(), saida };
  } finally {
    process.stdout.write = original;
  }
}

describe("conversao", () => {
  it("CA-01 remove class do paragrafo", () => {
    const { saida } = executar({ "a.json": carregarFixture("paragraph.json") });
    const texto = corpo(saida);
    expect(texto).toContain("<p><strong>Titulo</strong></p>");
    expect(texto).not.toContain("class");
  });

  it("CA-02 heading escapa o texto", () => {
    const { saida } = executar({ "a.json": carregarFixture("heading.json") });
    expect(corpo(saida)).toContain("<h2>A &lt; B</h2>");
  });

  it("CA-30 ajusta titulos numerados pela unidade aberta", () => {
    const textos = [
      "INTRODUÇÃO",
      "UNIDADE I – FUNDAMENTOS",
      "1.1. Educação Especial",
      "1.1.1. Subtema",
      "Tema solto",
      "CONSIDERAÇÕES FINAIS",
    ];
    const achatado = executar({
      "a.json": documento(textos.map((texto) => titulo(texto, 1))),
    });
    const outroNivel = executar({
      "a.json": documento(textos.map((texto) => titulo(texto, 3))),
    });
    const filhoDaUnidade = executar({
      "a.json": documento([
        titulo("UNIDADE I – FUNDAMENTOS", 1),
        titulo("1. Introdução da unidade", 1),
        titulo("1.1. Tema", 1),
        titulo("1.1.1. Subtema", 6),
        titulo("1.2. Outro", 1),
        titulo("UNIDADE II – CONTINUAÇÃO", 4),
        titulo("2.1. Depois", 1),
        titulo("1.9. Fora", 1),
      ]),
    });
    const isolado = executar({
      "a.json": documento([
        titulo("UNIDADE I", 1),
        titulo("1.1. Alfa", 2),
        titulo("1.2. Isolado", 6),
        titulo("1.3. Beta", 1),
      ]),
    });
    const antesDaUnidade = executar({
      "a.json": documento([
        titulo("Título da disciplina", 1),
        titulo("1. Capítulo", 2),
        titulo("1.1. Filho", 3),
      ]),
    });
    const semUnidade = executar({
      "a.json": documento([
        titulo("1.1. Alfa", 1),
        titulo("1.2. Beta", 1),
        titulo("1.1.1. Gama", 1),
      ]),
    });
    const comVazio = executar({
      "a.json": documento([
        titulo("UNIDADE I", 1),
        { type: "heading", tag: "h2", level: 2, text: " \u00a0" },
        titulo("1.1. Tema", 1),
        { type: "heading", level: 0, tag: "x", text: "IGNORADO" },
      ]),
    });

    expect(corpo(achatado.saida)).toBe(juntarTitulos(textos, [1, 1, 2, 3, 1, 1]));
    expect(corpo(outroNivel.saida)).toBe(juntarTitulos(textos, [3, 1, 2, 3, 3, 3]));
    expect(lerCsv(achatado.saida)[0]?.uuid).toBe(lerCsv(outroNivel.saida)[0]?.uuid);
    expect(corpo(filhoDaUnidade.saida)).toBe(
      juntarTitulos(
        [
          "UNIDADE I – FUNDAMENTOS",
          "1. Introdução da unidade",
          "1.1. Tema",
          "1.1.1. Subtema",
          "1.2. Outro",
          "UNIDADE II – CONTINUAÇÃO",
          "2.1. Depois",
          "1.9. Fora",
        ],
        [1, 2, 3, 4, 3, 1, 2, 1],
      ),
    );
    expect(corpo(isolado.saida)).toBe(
      juntarTitulos(["UNIDADE I", "1.1. Alfa", "1.2. Isolado", "1.3. Beta"], [1, 2, 2, 2]),
    );
    expect(corpo(antesDaUnidade.saida)).toBe(
      juntarTitulos(["Título da disciplina", "1. Capítulo", "1.1. Filho"], [1, 2, 3]),
    );
    expect(corpo(semUnidade.saida)).toBe(
      juntarTitulos(["1.1. Alfa", "1.2. Beta", "1.1.1. Gama"], [1, 1, 1]),
    );
    expect(corpo(comVazio.saida)).toBe("<h1>UNIDADE I</h1>\n<h2>1.1. Tema</h2>\n");
    expect(lerLog(comVazio.saida)).toContain("a.json\tbloco_ignorado:heading");
  });

  it("CA-03 link e ancora vazia", () => {
    const { saida } = executar({
      "a.json": documento([
        { type: "paragraph", html: '<a href="https://exemplo.test/x">texto</a>' },
        { type: "paragraph", html: '<a id="_Toc146571594"></a>' },
      ]),
    });
    const texto = corpo(saida);
    expect(texto).toContain("<p>texto</p>");
    expect(texto).not.toContain("href");
    expect(texto).not.toContain("_Toc146571594");
    expect(texto.trim()).toBe("<p>texto</p>");
  });

  it("CA-04 tabela preserva tbody colspan e lista", () => {
    const { saida } = executar({ "a.json": carregarFixture("table.json") });
    const texto = corpo(saida);
    expect(texto.split("<table").length - 1).toBe(1);
    expect(texto).toContain("<tbody>");
    expect(texto).not.toContain("style");
    expect(texto).toContain('colspan="2"');
    expect(texto).toContain("<ul>");
    expect(texto).toContain("<li>Item</li>");
  });

  it("CA-04 tabela sem tag externa embrulha", () => {
    const { saida } = executar({
      "a.json": documento([{ type: "table", html: "<tr><td>Celula</td></tr>" }]),
    });
    const texto = corpo(saida);
    expect(texto.split("<table").length - 1).toBe(1);
    expect(texto).toContain("Celula");
  });

  it("CA-05 imagem nao entra no txt", () => {
    const fixture = carregarFixture("image_group.json") as { blocks: unknown[] };
    const { saida } = executar({
      "a.json": documento([
        fixture.blocks[0],
        { type: "paragraph", html: '<img src="AAAA" alt="foto">legenda' },
      ]),
    });
    const texto = corpo(saida);
    expect(texto).toContain("legenda");
    expect(texto).not.toContain("img");
    expect(texto).not.toContain("src");
    expect(texto).not.toContain("AAAA");
  });

  it("CA-06 remove as cinco tags com conteudo", () => {
    const { saida } = executar({ "a.json": carregarFixture("sintetico.json") });
    const texto = corpo(saida);
    for (const marcador of [
      "ALERTA_SCRIPT",
      "ALERTA_STYLE",
      "ALERTA_IFRAME",
      "ALERTA_OBJECT",
      "ALERTA_EMBED",
    ]) {
      expect(texto).not.toContain(marcador);
    }
    for (const tag of ["script", "style", "iframe", "object", "embed"]) {
      expect(texto).not.toContain(`<${tag}`);
    }
    expect(texto).toContain("texto do link");
  });

  it("CA-07 aside vira paragrafo", () => {
    const { saida } = executar({ "a.json": carregarFixture("aside.json") });
    const texto = corpo(saida);
    expect(texto).toContain("<p>Assista o vídeo</p>");
    expect(texto).not.toContain("aside");
    expect(texto).not.toContain("role");
  });

  it("CA-08 reexecucao estavel e uuid fora do txt", () => {
    const arquivos = { "a.json": documento([{ type: "paragraph", html: "Estavel" }]) };
    const primeiro = executar(arquivos);
    const primeiroTxt = readFileSync(txtUnico(primeiro.saida));
    const primeiroCsv = readFileSync(path.join(primeiro.saida, "resultado.csv"));
    const primeiroLog = readFileSync(path.join(primeiro.saida, "erros.log"));
    const segundo = converterPasta(primeiro.entrada, primeiro.saida);
    expect(readFileSync(txtUnico(primeiro.saida))).toEqual(primeiroTxt);
    expect(readFileSync(path.join(primeiro.saida, "resultado.csv"))).toEqual(primeiroCsv);
    expect(readFileSync(path.join(primeiro.saida, "erros.log"))).toEqual(primeiroLog);
    const uuidArquivo = path.basename(txtUnico(primeiro.saida), ".txt");
    expect(primeiroTxt.toString("utf8")).not.toContain(uuidArquivo);
    expect(primeiro.resumo).toBe(segundo.resumo);
  });

  it("CA-09 codigos invalidos e inteiro", () => {
    const { saida } = executar({
      "ausente.json": carregarFixture("codigo_ausente.json"),
      "vazio.json": carregarFixture("codigo_vazio.json"),
      "invalido.json": carregarFixture("codigo_invalido.json"),
      "reservado.json": documento([{ type: "paragraph", html: "x" }], { codigo: "CON" }),
      "ponto.json": documento([{ type: "paragraph", html: "x" }], { codigo: "." }),
    });
    const linhas = lerCsv(saida);
    expect(linhas).toHaveLength(5);
    expect(new Set(linhas.map((linha) => linha.status))).toEqual(new Set(["sem_codigo"]));
    expect(txts(saida)).toEqual([]);
    expect(lerLog(saida).every((linha) => linha.includes("sem_codigo"))).toBe(true);

    const erros = executar({
      "float.json": documento([{ type: "paragraph", html: "x" }], { codigo: 1.5 }),
      "bool.json": documento([{ type: "paragraph", html: "x" }], { codigo: true }),
      "lista.json": documento([{ type: "paragraph", html: "x" }], { codigo: ["A"] }),
      "objeto.json": documento([{ type: "paragraph", html: "x" }], { codigo: { valor: "A" } }),
    });
    expect(new Set(lerCsv(erros.saida).map((linha) => linha.status))).toEqual(new Set(["erro"]));
    expect(lerLog(erros.saida).every((linha) => linha.endsWith("\ttipo_codigo"))).toBe(true);

    const inteiro = executar({ "a.json": carregarFixture("codigo_inteiro.json") });
    const linha = lerCsv(inteiro.saida)[0];
    expect(linha?.status).toBe("convertido");
    expect(linha?.codigoDisciplina).toBe("42");
    expect(path.basename(txtUnico(inteiro.saida))).toBe(`${linha?.uuid}.txt`);
  });

  it("CA-10 dois corpos e reexecucao", () => {
    const arquivos = {
      "a.json": documento([{ type: "paragraph", html: "Um" }]),
      "b.json": documento([{ type: "paragraph", html: "Dois" }]),
    };
    const { entrada, saida } = executar(arquivos);
    const primeiraCsv = readFileSync(path.join(saida, "resultado.csv"));
    const linhas = lerCsv(saida);
    expect(linhas.map((linha) => linha.arquivo_origem)).toEqual(["a.json", "b.json"]);
    expect(linhas[0]?.uuid).not.toBe(linhas[1]?.uuid);
    expect(linhas[0]?.codigoDisciplina).toBe("ADS001");
    expect(linhas[1]?.codigoDisciplina).toBe("ADS001");
    const relacao = readFileSync(path.join(saida, "relacao.csv"), "utf8").trim().split("\n");
    expect(relacao).toHaveLength(1 + linhas.length);
    expect(relacao[0]).toBe("codigoDisciplina,uuid");
    converterPasta(entrada, saida);
    expect(readFileSync(path.join(saida, "resultado.csv"))).toEqual(primeiraCsv);
  });

  it("CA-11 json invalido nao derruba o lote", () => {
    const { saida, codigoSaida } = executar({
      "a.json": documento([{ type: "paragraph", html: "Valido" }]),
      "b.json": "{",
      "c.json": documento([{ type: "paragraph", html: "Tambem" }]),
    });
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("convertido");
    expect(linhas["c.json"]?.status).toBe("convertido");
    expect(linhas["b.json"]?.status).toBe("erro");
    expect(lerLog(saida)).toContain("b.json\tjson_invalido");
    expect(codigoSaida).toBe(0);
    expect(txts(saida)).toHaveLength(2);
  });

  it("CA-12 caminho com espaco acento e virgula", () => {
    const relativo = "disciplina, ção/nota final.json";
    const { saida } = executar({
      [relativo]: documento([{ type: "paragraph", html: "Caminho" }]),
    });
    expect(lerCsv(saida)[0]?.arquivo_origem).toBe(relativo);
  });

  it("CA-13 ignora metadados duplicados", () => {
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: "SO_BLOCO" }], {
        extra: {
          toc: [{ title: "SO_TOC" }],
          headings: [{ text: "SO_HEADING" }],
          contentHtml: "<p>SO_CONTENT</p>",
        },
      }),
    });
    const texto = corpo(saida);
    expect(texto).toContain("SO_BLOCO");
    expect(texto).not.toContain("SO_TOC");
    expect(texto).not.toContain("SO_HEADING");
    expect(texto).not.toContain("SO_CONTENT");
  });

  it("CA-14 so imagem gera txt vazio e uuid independente do base64", () => {
    const primeiro = executar({ "a.json": carregarFixture("image_group.json") });
    const segundo = executar({
      "b.json": documento(
        [{ type: "imageGroup", images: [{ src: "data:image/jpeg;base64,BBBB" }] }],
        { codigo: "ADS002" },
      ),
    });
    const linhaA = lerCsv(primeiro.saida)[0];
    const linhaB = lerCsv(segundo.saida)[0];
    expect(linhaA?.status).toBe("convertido");
    expect(linhaB?.status).toBe("convertido");
    expect(linhaA?.uuid).toBe(linhaB?.uuid);
    expect(linhaA?.uuid?.[14]).toBe("5");
    expect(readFileSync(txtUnico(primeiro.saida))).toEqual(Buffer.alloc(0));
    expect(readFileSync(txtUnico(segundo.saida))).toEqual(Buffer.alloc(0));
    const chave = createHash("sha256").update("conteudo-v1\n", "utf8").digest("hex");
    expect(linhaA?.uuid).toBe(uuidv5(chave, NAMESPACE));
  });

  it("CA-15 remove o sumario e preserva o corpo", () => {
    const antes = [{ type: "paragraph", html: "<strong>CAPA</strong>" }];
    const resto = [
      { type: "paragraph", html: '<a id="_Toc146571594"></a>' },
      { type: "heading", tag: "h1", level: 1, text: "INTRODUÇÃO" },
      { type: "paragraph", html: "O sumário da aula fica no corpo." },
      {
        type: "paragraph",
        html: '<a href="https://www.youtube.com/watch?v=cYefPOPuHOE">https://www.youtube.com/watch?v=cYefPOPuHOE</a>',
      },
    ];
    const { saida } = executar({
      "a.json": documento(
        [
          ...antes,
          { type: "heading", tag: "h2", level: 2, id: "sumario", text: "SUMÁRIO" },
          { type: "paragraph", html: '<a href="#_Toc199495875">INTRODUÇÃO\t3</a>' },
          {
            type: "paragraph",
            html: "<strong>REFERÊNCIAS</strong>.................................................................................................12",
          },
          ...resto,
        ],
        { codigo: "A" },
      ),
      "b.json": documento(
        [
          ...antes,
          { type: "paragraph", html: "Sumário" },
          {
            type: "paragraph",
            html: '<a href="#_bookmark0">INTRODUÇÃO\t9</a> <a href="#_bookmark0">CONTINUA\t9</a>',
          },
          ...resto,
        ],
        { codigo: "B" },
      ),
    });
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("convertido");
    expect(linhas["b.json"]?.status).toBe("erro");
    expect(lerLog(saida)).toContain("b.json\tcolisao");
    const texto = corpo(saida);
    expect(texto).toContain("<p><strong>CAPA</strong></p>");
    expect(texto).toContain("<h1>INTRODUÇÃO</h1>");
    expect(texto).toContain("<p>O sumário da aula fica no corpo.</p>");
    expect(texto).toContain("https://www.youtube.com/watch?v=cYefPOPuHOE");
    expect(texto).not.toContain("SUMÁRIO");
    expect(texto).not.toContain("INTRODUÇÃO\t");
    expect(texto).not.toContain("REFERÊNCIAS");
    expect(texto).not.toContain("href");
    expect(texto).not.toContain("_Toc");
    expect(texto).not.toContain("_bookmark");
  });

  it("CA-16 url visivel permanece", () => {
    const url = "https://www.youtube.com/watch?v=cYefPOPuHOE";
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: `<a href="${url}">${url}</a>` }]),
    });
    const texto = corpo(saida);
    expect(texto).toContain(`<p>${url}</p>`);
    expect(texto).not.toContain("href");
  });

  it("CA-17 documentId nao muda o uuid", () => {
    const bloco = [{ type: "paragraph", html: "Mesmo" }];
    const primeiro = executar({
      "a.json": documento(bloco, { codigo: "ADS001", extra: { documentId: "doc_aaa_111" } }),
    });
    const segundo = executar({
      "b.json": documento(bloco, { codigo: "ADS002", extra: { documentId: "doc_bbb_222" } }),
    });
    expect(lerCsv(primeiro.saida)[0]?.uuid).toBe(lerCsv(segundo.saida)[0]?.uuid);
  });

  it("CA-18 texto diferente muda o uuid e marcacao nao muda", () => {
    const diferentes = executar({
      "a.json": documento([{ type: "paragraph", html: "Um" }]),
      "b.json": documento([{ type: "paragraph", html: "Outro" }]),
    });
    const linhas = lerCsv(diferentes.saida);
    expect(linhas[0]?.uuid).not.toBe(linhas[1]?.uuid);

    const comMarca = executar({
      "a.json": documento([{ type: "paragraph", html: "<strong>Um</strong>" }], { codigo: "A" }),
    });
    const semMarca = executar({
      "a.json": documento([{ type: "paragraph", html: "Um" }], { codigo: "B" }),
    });
    expect(lerCsv(comMarca.saida)[0]?.uuid).toBe(lerCsv(semMarca.saida)[0]?.uuid);
    expect(corpo(comMarca.saida)).toContain("<strong>Um</strong>");
  });

  it("CA-19 trocar codigo mantem o uuid e o nome", () => {
    const bloco = [{ type: "paragraph", html: "Igual" }];
    const ads = executar({ "a.json": documento(bloco, { codigo: "ADS001" }) });
    const mat = executar({ "a.json": documento(bloco, { codigo: "MAT002" }) });
    const linhaAds = lerCsv(ads.saida)[0];
    const linhaMat = lerCsv(mat.saida)[0];
    expect(linhaAds?.uuid).toBe(linhaMat?.uuid);
    expect(linhaAds?.arquivo_saida).toBe(`${linhaAds?.uuid}.txt`);
    expect(linhaMat?.arquivo_saida).toBe(linhaAds?.arquivo_saida);

    const junto = executar({
      "a.json": documento(bloco, { codigo: "ADS001" }),
      "b.json": documento(bloco, { codigo: "MAT002" }),
    });
    const linhas = Object.fromEntries(lerCsv(junto.saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("convertido");
    expect(linhas["b.json"]?.status).toBe("erro");
    expect(lerLog(junto.saida)).toContain("b.json\tcolisao");
    const relacao = readFileSync(path.join(junto.saida, "relacao.csv"), "utf8").trim().split("\n");
    expect(relacao).toEqual(["codigoDisciplina,uuid", `ADS001,${linhas["a.json"]?.uuid ?? ""}`]);
  });

  it("CA-20 colisao nao sobrescreve", () => {
    const bloco = [{ type: "paragraph", html: "Igual" }];
    const { saida } = executar({
      "a.json": documento(bloco),
      "b.json": documento(bloco),
    });
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("convertido");
    expect(linhas["b.json"]?.status).toBe("erro");
    expect(linhas["b.json"]?.arquivo_saida).toBe("");
    expect(lerLog(saida)).toContain("b.json\tcolisao");
    expect(txts(saida)).toHaveLength(1);
    expect(corpo(saida)).toContain("Igual");
  });

  it("CA-21 orfaos listados e limpos", () => {
    const plantar = (pasta: string) => {
      writeFileSync(path.join(pasta, ORFAO), "antigo", "utf8");
      writeFileSync(path.join(pasta, "notas.txt"), "nota", "utf8");
    };
    const { saida, resumo } = executar(
      { "a.json": documento([{ type: "paragraph", html: "Novo" }]) },
      { preparar: plantar },
    );
    expect(readFileSync(path.join(saida, ORFAO), "utf8")).toBe("antigo");
    expect(readFileSync(path.join(saida, "notas.txt"), "utf8")).toBe("nota");
    expect(lerLog(saida)).toContain(`${ORFAO}\torfao`);
    expect(resumo).toContain("orfaos: 1");

    const limpo = executar(
      { "a.json": documento([{ type: "paragraph", html: "Novo" }]) },
      { limpar: true, preparar: plantar },
    );
    expect(readdirSync(limpo.saida)).not.toContain(ORFAO);
    expect(readFileSync(path.join(limpo.saida, "notas.txt"), "utf8")).toBe("nota");
    expect(readdirSync(limpo.saida).some((nome) => nome.endsWith(".txt") && nome !== "notas.txt")).toBe(true);
  });

  it("CA-22 recursao sem symlink e ordem lexicografica", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "conversor-"));
    pastas.push(raiz);
    const entrada = path.join(raiz, "entrada");
    const saida = path.join(raiz, "saida");
    mkdirSync(path.join(entrada, "a"), { recursive: true });
    writeFileSync(
      path.join(entrada, "a", "z.json"),
      JSON.stringify(documento([{ type: "paragraph", html: "Sub" }])),
      "utf8",
    );
    writeFileSync(
      path.join(entrada, "m.json"),
      JSON.stringify(documento([{ type: "paragraph", html: "Topo" }])),
      "utf8",
    );
    const externo = path.join(raiz, "externo");
    mkdirSync(externo);
    writeFileSync(
      path.join(externo, "escondido.json"),
      JSON.stringify(documento([{ type: "paragraph", html: "Fora" }])),
      "utf8",
    );
    try {
      symlinkSync(path.join(externo, "escondido.json"), path.join(entrada, "atalho.json"));
      symlinkSync(externo, path.join(entrada, "pasta_link"), "dir");
    } catch {
      // Sem privilegio de link, o restante do teste ainda cobre subpasta e ordem.
    }
    converterPasta(entrada, saida);
    const origens = lerCsv(saida).map((linha) => linha.arquivo_origem);
    expect(origens).toEqual(["a/z.json", "m.json"]);
    const textos = txts(saida)
      .map((nome) => readFileSync(path.join(saida, nome), "utf8"))
      .join(" ");
    expect(textos).not.toContain("Fora");
  });

  it("CA-23 blocks ausente ou invalido", () => {
    const { saida } = executar({
      "a.json": { codigoDisciplina: "ADS001" },
      "b.json": { codigoDisciplina: "ADS001", blocks: { type: "paragraph" } },
      "c.json": documento([{ type: "paragraph", html: "Segue" }]),
    });
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("erro");
    expect(linhas["b.json"]?.status).toBe("erro");
    expect(linhas["c.json"]?.status).toBe("convertido");
    const log = lerLog(saida);
    expect(log).toContain("a.json\tblocks_invalidos");
    expect(log).toContain("b.json\tblocks_invalidos");
  });

  it("CA-24 tipo desconhecido nao falha o arquivo", () => {
    const { saida } = executar({
      "a.json": documento([
        { type: "widget", text: "NAO_EMITIR" },
        { type: "paragraph", html: "Visivel" },
      ]),
    });
    const texto = corpo(saida);
    expect(texto).toContain("Visivel");
    expect(texto).not.toContain("NAO_EMITIR");
    expect(lerCsv(saida)[0]?.status).toBe("convertido");
    expect(lerLog(saida)).toContain("a.json\tbloco_ignorado:widget");
  });

  it("RF-15 codigo com underscore preserva o uuid", () => {
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: "X" }], { codigo: "A_B" }),
    });
    const linha = lerCsv(saida)[0];
    expect(linha?.codigoDisciplina).toBe("A_B");
    expect(linha?.uuid[14]).toBe("5");
    expect(linha?.arquivo_saida).toBe(`${linha?.uuid}.txt`);
  });

  it("CA-25 formato do nome", () => {
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: "Nome" }]),
    });
    const linha = lerCsv(saida)[0];
    const nome = path.basename(txtUnico(saida));
    expect(nome).toBe(`${linha?.uuid}.txt`);
    expect(nome).not.toContain("ADS001");
    expect(linha?.uuid[14]).toBe("5");
    expect(linha?.uuid).toBe(linha?.uuid.toLowerCase());
    expect(linha?.uuid).toHaveLength(36);
  });

  it("CA-26 resumo no stdout", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "conversor-"));
    pastas.push(raiz);
    const entrada = path.join(raiz, "entrada");
    const saida = path.join(raiz, "saida");
    mkdirSync(entrada);
    mkdirSync(saida);
    writeFileSync(path.join(saida, ORFAO), "antigo", "utf8");
    const arquivos: Record<string, unknown> = {
      "a.json": documento([{ type: "paragraph", html: "Um" }]),
      "b.json": documento([{ type: "paragraph", html: "Dois" }]),
      "c.json": "{",
      "d.json": documento([{ type: "paragraph", html: "Sem" }], { omitirCodigo: true }),
    };
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const texto = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo);
      writeFileSync(path.join(entrada, nome), texto, "utf8");
    }
    const capturado = capturar(() => main(["--entrada", entrada, "--saida", saida]));
    expect(capturado.codigo).toBe(0);
    expect(capturado.saida).toBe(
      "lidos: 4\nconvertidos: 2\nerros: 1\nsem_codigo: 1\ncodigos_repetidos: 1\norfaos: 1\n",
    );
  });

  it("CA-27 codigo de saida", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "conversor-"));
    pastas.push(raiz);
    expect(capturar(() => main(["--entrada", path.join(raiz, "nao-existe"), "--saida", path.join(raiz, "saida")])).codigo).toBe(1);

    const entrada = path.join(raiz, "entrada");
    const saida = path.join(raiz, "saida");
    mkdirSync(entrada);
    writeFileSync(path.join(entrada, "a.json"), "{", "utf8");
    expect(capturar(() => main(["--entrada", entrada, "--saida", saida])).codigo).toBe(0);
    expect(capturar(() => main(["--entrada", entrada, "--saida", saida, "--estrito"])).codigo).toBe(1);

    const entradaCodigo = path.join(raiz, "sem");
    const saidaCodigo = path.join(raiz, "saida-sem");
    mkdirSync(entradaCodigo);
    writeFileSync(
      path.join(entradaCodigo, "a.json"),
      JSON.stringify(documento([{ type: "paragraph", html: "x" }], { omitirCodigo: true })),
      "utf8",
    );
    expect(capturar(() => main(["--entrada", entradaCodigo, "--saida", saidaCodigo, "--estrito"])).codigo).toBe(0);
  });

  it("CA-28 paragrafos vazios", () => {
    const { saida } = executar({
      "a.json": documento([
        { type: "paragraph", html: "   \t\n" },
        { type: "paragraph", html: "&nbsp;" },
        { type: "paragraph", html: "\u200b" },
        { type: "paragraph", html: "<br>" },
        { type: "paragraph", html: "a\u200bb" },
      ]),
    });
    const texto = corpo(saida);
    expect(texto.includes("<p><br></p>") || texto.includes("<p><br/></p>")).toBe(true);
    expect(texto).toContain("a\u200bb");
    expect(texto.split("<p").length - 1).toBe(2);
  });

  it("CA-29 nao deixa temporario", () => {
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: "Fim" }]),
    });
    expect(readdirSync(saida).filter((nome) => nome.endsWith(".tmp"))).toEqual([]);
  });

  it("RF-16 mantem acento virgula e corta em 80", () => {
    const longo = "Á".repeat(81);
    const { saida } = executar({
      "a.json": documento([{ type: "paragraph", html: "Acento" }], { codigo: "LIÇÃO,01" }),
      "b.json": documento([{ type: "paragraph", html: "Longo" }], { codigo: longo }),
    });
    expect(limparCodigo("LIÇÃO,01")).toBe("LIÇÃO,01");
    expect(limparCodigo(longo)).toBe("Á".repeat(80));
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.codigoDisciplina).toBe("LIÇÃO,01");
    expect(linhas["b.json"]?.codigoDisciplina).toBe(longo);
    expect(linhas["a.json"]?.arquivo_saida).toBe(`${linhas["a.json"]?.uuid}.txt`);
    expect(linhas["b.json"]?.arquivo_saida).toBe(`${linhas["b.json"]?.uuid}.txt`);
  });

  it("RF-09 list e image nao entram no txt e list muda o uuid", () => {
    const base = [{ type: "paragraph", html: "Visivel" }];
    const { saida } = executar({
      "a.json": documento(base),
      "b.json": documento([...base, { type: "list", ordered: false, items: ["Item secreto"] }]),
    });
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    expect(linhas["a.json"]?.status).toBe("convertido");
    expect(linhas["b.json"]?.status).toBe("convertido");
    expect(corpoDe(saida, "b.json")).not.toContain("Item secreto");
    expect(lerLog(saida)).toContain("b.json\tbloco_ignorado:list");
    expect(linhas["b.json"]?.uuid).not.toBe(linhas["a.json"]?.uuid);
    const imagem = executar({
      "c.json": documento([...base, { type: "image", src: "data:image/png;base64,AAAA", alt: "foto" }], {
        codigo: "FOTO",
      }),
    });
    const linhaImagem = lerCsv(imagem.saida)[0];
    expect(corpo(imagem.saida)).not.toContain("AAAA");
    expect(lerLog(imagem.saida)).toContain("c.json\tbloco_ignorado:image");
    expect(linhaImagem?.uuid).toBe(linhas["a.json"]?.uuid);
  });

  it("RF-12 miolo de script nao muda o uuid", () => {
    const limpo = executar({
      "a.json": documento([{ type: "paragraph", html: "ok" }], { codigo: "A" }),
    });
    const comScript = executar({
      "b.json": documento([{ type: "paragraph", html: "ok<script>SEGREDO</script>" }], { codigo: "B" }),
    });
    expect(lerCsv(limpo.saida)[0]?.uuid).toBe(lerCsv(comScript.saida)[0]?.uuid);
    expect(corpo(comScript.saida)).not.toContain("SEGREDO");
    expect(corpo(comScript.saida)).toContain("ok");
  });

  it("CA-29 integracao com o exemplo real quando o arquivo existe", () => {
    const exemplo = path.resolve(
      RAIZ_TESTE,
      "../../../Exemplo/DESENVOLVIMENTO AFETIVO, FAMÍLIA E APRENDIZAGEM - NOTA 4 - DESENVOLVIMENTO.json",
    );
    let existe = true;
    try {
      readFileSync(exemplo);
    } catch {
      existe = false;
    }
    if (!existe) return;
    const raiz = mkdtempSync(path.join(tmpdir(), "conversor-"));
    pastas.push(raiz);
    const entrada = path.join(raiz, "entrada");
    const saida = path.join(raiz, "saida");
    mkdirSync(entrada);
    writeFileSync(path.join(entrada, path.basename(exemplo)), readFileSync(exemplo));
    converterPasta(entrada, saida);
    const arquivos = txts(saida);
    expect(arquivos).toHaveLength(1);
    const texto = readFileSync(path.join(saida, arquivos[0] ?? ""), "utf8");
    expect(texto).not.toContain("data:image");
    expect(texto).not.toContain("base64");
    expect(texto).not.toContain("href=");
    expect(texto).not.toContain("SUMÁRIO");
    expect(texto).not.toContain("INTRODUÇÃO\t");
    expect(texto).toContain("DESENVOLVIMENTO AFETIVO");
    const linha = lerCsv(saida)[0];
    expect(arquivos[0]).toBe(`${linha?.uuid}.txt`);
    expect(linha?.status).toBe("convertido");
    expect(linha?.codigoDisciplina).toBe("DESENVOLVIMENTO");
    expect(linha?.arquivo_saida).toBe(arquivos[0]);
  });
});

function corpoDe(saida: string, origem: string): string {
  const linha = lerCsv(saida).find((item) => item.arquivo_origem === origem);
  return readFileSync(path.join(saida, linha?.arquivo_saida ?? ""), "utf8");
}

describe("fixtures", () => {
  it("cada JSON de fixture fecha no status do contrato", () => {
    const { saida } = executar(Object.fromEntries(readdirSync(FIXTURES).map((nome) => [nome, carregarFixture(nome)])));
    const linhas = Object.fromEntries(lerCsv(saida).map((linha) => [linha.arquivo_origem, linha]));
    const status: Record<string, string> = {
      "paragraph.json": "convertido",
      "heading.json": "convertido",
      "table.json": "convertido",
      "aside.json": "convertido",
      "image_group.json": "convertido",
      "sintetico.json": "convertido",
      "codigo_ausente.json": "sem_codigo",
      "codigo_vazio.json": "sem_codigo",
      "codigo_invalido.json": "sem_codigo",
      "codigo_inteiro.json": "convertido",
    };
    expect(Object.keys(linhas).sort()).toEqual(Object.keys(status).sort());
    for (const [origem, esperado] of Object.entries(status)) {
      expect(linhas[origem]?.status).toBe(esperado);
    }
    expect(linhas["codigo_inteiro.json"]?.codigoDisciplina).toBe("42");
    expect(linhas["codigo_inteiro.json"]?.arquivo_saida).toBe(`${linhas["codigo_inteiro.json"]?.uuid}.txt`);
    expect(readFileSync(path.join(saida, linhas["image_group.json"]?.arquivo_saida ?? "")).length).toBe(0);
    const sintetico = corpoDe(saida, "sintetico.json");
    expect(sintetico).toContain("texto do link");
    expect(sintetico).toContain("Celula");
    expect(sintetico).not.toContain("ALERTA_SCRIPT");
    expect(sintetico).not.toContain("base64");
  });
});
