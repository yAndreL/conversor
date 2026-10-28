import { readFileSync } from "node:fs";

import type { LinhaWeb } from "./loteEstado.js";

const GATILHO_FORMULA = /^[=+\-@\t\r]/u;

export function escaparControle(valor: string): string {
  let saida = "";
  for (const caractere of valor) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (caractere === "\t") saida += "\\t";
    else if (caractere === "\r") saida += "\\r";
    else if (caractere === "\n") saida += "\\n";
    else if (codigo <= 0x1f || codigo === 0x7f) saida += `\\u${codigo.toString(16).padStart(4, "0")}`;
    else saida += caractere;
  }
  return saida;
}

export function csvResultado(linhas: readonly LinhaWeb[]): string {
  const cabecalho = "codigoDisciplina,uuid,arquivo_origem,arquivo_saida,status";
  const corpo = linhas.map((linha) =>
    [campoCsv(linha.codigoDisciplina), campoCsv(linha.uuid), campoOrigem(linha.arquivo_origem), campoCsv(linha.arquivo_saida), campoCsv(linha.status)].join(
      ",",
    ),
  );
  return `${cabecalho}\n${corpo.join("\n")}${corpo.length > 0 ? "\n" : ""}`;
}

export function csvRelacao(linhas: readonly LinhaWeb[]): string {
  const corpo = linhas
    .filter((linha) => linha.status === "convertido")
    .map((linha) => `${campoCsv(linha.codigoDisciplina)},${campoCsv(linha.uuid)}`);
  return `codigoDisciplina,uuid\n${corpo.join("\n")}${corpo.length > 0 ? "\n" : ""}`;
}

export function textoLog(linhas: readonly LinhaWeb[]): string {
  const eventos: string[] = [];
  for (const linha of linhas) {
    for (const motivo of linha.motivos) {
      const referencia = escaparControle(linha.arquivo_origem);
      const frase = motivo.frase ? escaparControle(motivo.frase) : "";
      eventos.push(frase ? `${referencia}\t${motivo.codigo}\t${frase}` : `${referencia}\t${motivo.codigo}`);
    }
  }
  return eventos.length > 0 ? `${eventos.join("\n")}\n` : "";
}

export function filtrarLog(bruto: string, origem: string): string {
  const prefixo = `${escaparControle(origem)}\t`;
  const restantes = bruto.split("\n").filter((linha) => linha.length > 0 && !linha.startsWith(prefixo));
  return restantes.length > 0 ? `${restantes.join("\n")}\n` : "";
}

export function lerLog(caminho: string): string {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return "";
  }
}

function campoOrigem(valor: string): string {
  const comPrefixo = GATILHO_FORMULA.test(valor) ? `'${valor}` : valor;
  return campoCsv(comPrefixo);
}

function campoCsv(valor: string): string {
  if (/[",\n\r]/u.test(valor)) return `"${valor.replaceAll('"', '""')}"`;
  return valor;
}
