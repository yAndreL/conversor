import { Parser } from "htmlparser2";
import sanitizeHtml from "sanitize-html";

import { nivelDeHeading, niveisPadronizados } from "./hierarquia.js";
import { apararEsquerda, ehEspaco, ehObjeto } from "./identidade.js";
import { semSumario } from "./sumario.js";

const TAGS_PERMITIDAS = [
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
];

const TAGS_SEM_CONTEUDO = ["script", "style", "iframe", "object", "embed"];
const TAGS_VAZIAS = new Set(["br"]);
const INVISIVEIS = new Set(["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff"]);
const FECHO_VAZIO = /<(embed|img)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

type No = { tag: string; attrs: Array<[string, string]>; filhos: Array<No | string> };

export function renderizar(blocks: readonly unknown[]): { corpo: string; motivos: string[] } {
  const blocos = semSumario(blocks);
  const niveis = niveisPadronizados(blocos);
  const fragmentos: string[] = [];
  const motivos: string[] = [];
  for (const bloco of blocos) {
    const [fragmento, motivo] = fragmentoDe(bloco, niveis);
    if (motivo) motivos.push(motivo);
    if (fragmento) fragmentos.push(fragmento);
  }
  const documento = fragmentos.join("\n").replace(FECHO_VAZIO, "");
  const limpo = sanitizeHtml(documento, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    disallowedTagsMode: "discard",
    nonTextTags: TAGS_SEM_CONTEUDO,
    enforceHtmlBoundary: false,
    selfClosing: ["br"],
    parser: { decodeEntities: true },
  });
  return { corpo: podarEJuntar(limpo), motivos };
}

function fragmentoDe(bloco: unknown, niveis: ReadonlyMap<object, number>): [string, string] {
  if (!ehObjeto(bloco)) return ["", "bloco_ignorado:"];
  const tipo = bloco.type;
  if (tipo === "paragraph") {
    const miolo = typeof bloco.html === "string" ? bloco.html : escapar(textoDe(bloco.text), true);
    return [`<p>${miolo}</p>`, ""];
  }
  if (tipo === "heading") {
    const tag = tagHeading(bloco, niveis);
    if (!tag) return ["", "bloco_ignorado:heading"];
    return [`<${tag}>${escapar(textoDe(bloco.text), true)}</${tag}>`, ""];
  }
  if (tipo === "table") return [tabela(bloco), ""];
  if (tipo === "aside") return [`<p>${escapar(textoDe(bloco.text), true)}</p>`, ""];
  if (tipo === "imageGroup") return ["", ""];
  return ["", `bloco_ignorado:${tipo === undefined || tipo === null ? "None" : String(tipo)}`];
}

function tagHeading(bloco: Record<string, unknown>, niveis: ReadonlyMap<object, number>): string | null {
  const padronizado = niveis.get(bloco);
  if (padronizado !== undefined) return `h${padronizado}`;
  const nivel = nivelDeHeading(bloco);
  return nivel === null ? null : `h${nivel}`;
}

function tabela(bloco: Record<string, unknown>): string {
  const htmlTabela = bloco.html;
  if (typeof htmlTabela === "string" && aparar(htmlTabela) !== "") {
    if (apararEsquerda(htmlTabela).slice(0, 6).toLowerCase() === "<table") return htmlTabela;
    return `<table>${htmlTabela}</table>`;
  }
  return tabelaDeLinhas(bloco.rows);
}

function tabelaDeLinhas(linhas: unknown): string {
  const partes = ["<table>"];
  if (Array.isArray(linhas)) {
    for (const linha of linhas) {
      if (!Array.isArray(linha)) continue;
      partes.push("<tr>");
      for (const celula of linha) partes.push(celulaHtml(celula));
      partes.push("</tr>");
    }
  }
  partes.push("</table>");
  return partes.join("");
}

function celulaHtml(celula: unknown): string {
  if (!ehObjeto(celula)) return "<td></td>";
  const tagBruta = celula.tag;
  const tag =
    typeof tagBruta === "string" && (tagBruta.toLowerCase() === "td" || tagBruta.toLowerCase() === "th")
      ? tagBruta.toLowerCase()
      : "td";
  let atributos = "";
  for (const nome of ["colspan", "rowspan"] as const) {
    const valor = celula[nome];
    if (typeof valor === "number" && Number.isInteger(valor) && valor > 1) {
      atributos += ` ${nome}="${valor}"`;
    }
  }
  return `<${tag}${atributos}>${escapar(textoDe(celula.text), true)}</${tag}>`;
}

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

export function escapar(texto: string, aspas: boolean): string {
  let saida = texto.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (aspas) saida = saida.replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
  return saida;
}

function podarEJuntar(documento: string): string {
  const partes: string[] = [];
  for (const no of analisar(documento)) {
    const podado = podar(no);
    if (podado === null) continue;
    if (typeof podado === "string") {
      if (aparar(podado) === "") continue;
      partes.push(escapar(podado, false));
      continue;
    }
    partes.push(serializar(podado));
  }
  return partes.join("\n");
}

function analisar(documento: string): Array<No | string> {
  const raiz: Array<No | string> = [];
  const pilha: No[] = [];
  const parser = new Parser(
    {
      onopentag(nome, atributos) {
        const no: No = { tag: nome, attrs: Object.entries(atributos), filhos: [] };
        anexar(no);
        if (!TAGS_VAZIAS.has(nome)) pilha.push(no);
      },
      ontext(data) {
        anexar(data);
      },
      onclosetag(nome) {
        if (TAGS_VAZIAS.has(nome)) return;
        while (pilha.length > 0) {
          const atual = pilha.pop();
          if (atual?.tag === nome) break;
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(documento);
  parser.end();
  return raiz;

  function anexar(no: No | string): void {
    const topo = pilha[pilha.length - 1];
    if (topo) topo.filhos.push(no);
    else raiz.push(no);
  }
}

function podar(no: No | string): No | string | null {
  if (typeof no === "string") return no;
  const filhos: Array<No | string> = [];
  for (const filho of no.filhos) {
    const podado = podar(filho);
    if (podado !== null) filhos.push(podado);
  }
  const atual: No = { tag: no.tag, attrs: no.attrs, filhos };
  if (deveRemover(atual)) return null;
  return atual;
}

function deveRemover(no: No): boolean {
  if (!["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(no.tag)) return false;
  if (no.tag === "p" && temBr(no)) return false;
  return textoVazio(textoDoNo(no));
}

function temBr(no: No): boolean {
  return no.filhos.some((filho) => typeof filho !== "string" && (filho.tag === "br" || temBr(filho)));
}

function textoDoNo(no: No | string): string {
  if (typeof no === "string") return no;
  return no.filhos.map((filho) => textoDoNo(filho)).join("");
}

function textoVazio(texto: string): boolean {
  return ![...texto].some((caractere) => !INVISIVEIS.has(caractere) && !ehEspaco(caractere));
}

function serializar(no: No | string): string {
  if (typeof no === "string") return escapar(no, false);
  let atributos = "";
  if (no.tag === "td" || no.tag === "th") {
    for (const [chave, valor] of no.attrs) {
      if (chave === "colspan" || chave === "rowspan") {
        atributos += ` ${chave}="${escapar(valor, true)}"`;
      }
    }
  }
  if (TAGS_VAZIAS.has(no.tag)) return `<${no.tag}>`;
  const interno = no.filhos.map((filho) => serializar(filho)).join("");
  return `<${no.tag}${atributos}>${interno}</${no.tag}>`;
}

function aparar(texto: string): string {
  let inicio = 0;
  let fim = texto.length;
  while (inicio < fim && ehEspaco(texto[inicio] ?? "")) inicio += 1;
  while (fim > inicio && ehEspaco(texto[fim - 1] ?? "")) fim -= 1;
  return texto.slice(inicio, fim);
}
