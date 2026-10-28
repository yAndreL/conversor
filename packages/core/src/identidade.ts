import { createHash } from "node:crypto";
import { v5 as uuidv5 } from "uuid";

import { semSumario } from "./sumario.js";

export const NAMESPACE = "d1698526-798c-54c8-b0e5-cfba1794bddb";

const TIPOS_EXCLUIDOS = new Set(["imageGroup", "image"]);
const TAGS_SEM_CONTEUDO = new Set(["script", "style", "iframe", "object", "embed"]);

export function identificadorDe(canonico: string): string {
  const chave = createHash("sha256").update(canonico, "utf8").digest("hex");
  return uuidv5(chave, NAMESPACE);
}

export function chaveCanonica(blocks: readonly unknown[]): string {
  let saida = "conteudo-v1\n";
  for (const bloco of semSumario(blocks)) {
    if (!ehObjeto(bloco)) continue;
    const tipo = typeof bloco.type === "string" ? bloco.type : "";
    if (TIPOS_EXCLUIDOS.has(tipo)) continue;
    saida += `${tipo}\u001f${textoDoBloco(bloco, tipo)}\u001e`;
  }
  return saida;
}

function textoDoBloco(bloco: Record<string, unknown>, tipo: string): string {
  if (tipo === "paragraph") {
    if (typeof bloco.html === "string") return textoVisivel(bloco.html);
    return typeof bloco.text === "string" ? bloco.text : "";
  }
  if (tipo === "table") {
    if (typeof bloco.html === "string" && apararEsquerda(bloco.html) !== "") {
      return textoVisivel(bloco.html);
    }
    return textoDasCelulas(bloco.rows);
  }
  if (tipo === "list") {
    const ordered = bloco.ordered === true ? "1" : "0";
    const itens = Array.isArray(bloco.items)
      ? bloco.items.filter((item): item is string => typeof item === "string")
      : [];
    return `${ordered}\n${itens.join("\n")}`;
  }
  return typeof bloco.text === "string" ? bloco.text : "";
}

function textoDasCelulas(rows: unknown): string {
  if (!Array.isArray(rows)) return "";
  const linhas: string[] = [];
  for (const linha of rows) {
    if (!Array.isArray(linha)) continue;
    linhas.push(
      linha
        .map((celula) => (ehObjeto(celula) && typeof celula.text === "string" ? celula.text : ""))
        .join("\t"),
    );
  }
  return linhas.join("\n");
}

export function textoVisivel(html: string): string {
  return decodificarEntidades(removerMarcacao(html));
}

function removerMarcacao(html: string): string {
  let indice = 0;
  let saida = "";
  while (indice < html.length) {
    if (html.startsWith("<!--", indice)) {
      const fim = html.indexOf("-->", indice + 4);
      indice = fim === -1 ? html.length : fim + 3;
      continue;
    }
    if (html[indice] !== "<") {
      saida += html[indice];
      indice += 1;
      continue;
    }
    const tag = lerTag(html, indice);
    if (!tag) {
      saida += "<";
      indice += 1;
      continue;
    }
    const nome = tag.nome.toLowerCase();
    if (TAGS_SEM_CONTEUDO.has(nome) && !tag.fechamento && !tag.autoFecha) {
      indice = pularConteudo(html, tag.fim, nome);
      continue;
    }
    if ((nome === "img" || nome === "embed") && !tag.fechamento) {
      indice = tag.autoFecha ? tag.fim : pularConteudo(html, tag.fim, nome);
      continue;
    }
    indice = tag.fim;
  }
  return saida;
}

function pularConteudo(html: string, inicio: number, nome: string): number {
  let indice = inicio;
  let profundidade = 1;
  while (indice < html.length && profundidade > 0) {
    if (html.startsWith("<!--", indice)) {
      const fim = html.indexOf("-->", indice + 4);
      indice = fim === -1 ? html.length : fim + 3;
      continue;
    }
    if (html[indice] !== "<") {
      indice += 1;
      continue;
    }
    const tag = lerTag(html, indice);
    if (!tag) {
      indice += 1;
      continue;
    }
    if (tag.nome.toLowerCase() === nome && !tag.fechamento && !tag.autoFecha) profundidade += 1;
    if (tag.nome.toLowerCase() === nome && tag.fechamento) profundidade -= 1;
    indice = tag.fim;
  }
  return indice;
}

type TagLida = { nome: string; fim: number; fechamento: boolean; autoFecha: boolean };

function lerTag(html: string, inicio: number): TagLida | null {
  if (html[inicio] !== "<") return null;
  let indice = inicio + 1;
  let fechamento = false;
  if (html[indice] === "/") {
    fechamento = true;
    indice += 1;
  }
  if (!/[A-Za-z]/.test(html[indice] ?? "")) return null;
  const nomeInicio = indice;
  while (/[A-Za-z0-9]/.test(html[indice] ?? "")) indice += 1;
  const nome = html.slice(nomeInicio, indice);
  let aspas: string | null = null;
  while (indice < html.length) {
    const caractere = html[indice] ?? "";
    if (aspas) {
      if (caractere === aspas) aspas = null;
    } else if (caractere === '"' || caractere === "'") {
      aspas = caractere;
    } else if (caractere === ">") {
      return { nome, fim: indice + 1, fechamento, autoFecha: html[indice - 1] === "/" };
    }
    indice += 1;
  }
  return { nome, fim: html.length, fechamento, autoFecha: false };
}

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#x[0-9a-fA-F]+|#\d+);/g, (original) => {
    switch (original) {
      case "&amp;":
        return "&";
      case "&lt;":
        return "<";
      case "&gt;":
        return ">";
      case "&quot;":
        return '"';
      case "&apos;":
        return "'";
      case "&nbsp;":
        return "\u00a0";
      default:
        break;
    }
    const hexadecimal = /^&#x([0-9a-fA-F]+);$/.exec(original);
    if (hexadecimal?.[1]) return ponto(Number.parseInt(hexadecimal[1], 16), original);
    const decimal = /^&#(\d+);$/.exec(original);
    if (decimal?.[1]) return ponto(Number.parseInt(decimal[1], 10), original);
    return original;
  });
}

function ponto(codigo: number, original: string): string {
  if (!Number.isInteger(codigo) || codigo < 0 || codigo > 0x10ffff) return original;
  return String.fromCodePoint(codigo);
}

export function ehEspaco(caractere: string): boolean {
  return /^\p{White_Space}$/u.test(caractere);
}

export function apararEsquerda(texto: string): string {
  let indice = 0;
  while (indice < texto.length && ehEspaco(texto[indice] ?? "")) indice += 1;
  return texto.slice(indice);
}

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
