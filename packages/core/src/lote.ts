import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { documentoEntradaSchema } from "@conversor/contratos";

import { renderizar } from "./documento.js";
import { chaveCanonica, ehObjeto, identificadorDe } from "./identidade.js";

export type Status = "convertido" | "sem_codigo" | "erro";

export type Linha = {
  codigoDisciplina: string;
  uuid: string;
  arquivo_origem: string;
  arquivo_saida: string;
  status: Status;
};

export type ResultadoLote = {
  codigoSaida: number;
  resumo: string;
};

export type Preparo =
  | { pronto: false; linha: Linha; motivos: string[]; anotacoes?: string[] }
  | {
      pronto: true;
      codigo: string;
      origem: string;
      uuid: string;
      nome: string;
      corpo: string;
      motivos: string[];
      anotacoes?: string[];
    };

const COLUNAS = ["codigoDisciplina", "uuid", "arquivo_origem", "arquivo_saida", "status"] as const;
const RESERVADOS = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 10 }, (_, indice) => `COM${indice}`),
  ...Array.from({ length: 10 }, (_, indice) => `LPT${indice}`),
]);
// Controle e DEL são proibidos no nome do arquivo.
// eslint-disable-next-line no-control-regex
const PROIBIDOS = /[\u0000-\u001f\u007f\\/:*?"<>|]/;
const ORFAO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/;

export function converterPasta(
  entrada: string,
  saida: string,
  opcoes: { limpar?: boolean; estrito?: boolean } = {},
): ResultadoLote {
  let estatistica: ReturnType<typeof statSync>;
  try {
    estatistica = statSync(entrada);
  } catch {
    return { codigoSaida: 1, resumo: "" };
  }
  if (!estatistica.isDirectory()) return { codigoSaida: 1, resumo: "" };
  try {
    mkdirSync(saida, { recursive: true });
  } catch {
    return { codigoSaida: 1, resumo: "" };
  }

  const preparos = listarJson(entrada).map((caminho) => prepararArquivo(caminho, caminhoRelativo(entrada, caminho)));
  try {
    const concluido = concluirPasta(saida, preparos, opcoes.limpar ?? false);
    const erros = concluido.linhas.filter((linha) => linha.status === "erro").length;
    return { codigoSaida: opcoes.estrito && erros > 0 ? 1 : 0, resumo: concluido.resumo };
  } catch {
    return { codigoSaida: 1, resumo: "" };
  }
}

export function concluirPasta(
  saida: string,
  preparos: readonly Preparo[],
  limpar = false,
): { linhas: Linha[]; resumo: string; orfaos: number } {
  const linhas: Linha[] = [];
  const eventos: string[] = [];
  const gerados = new Set<string>();
  for (const preparo of preparos) {
    const publicado = publicarPreparo(saida, preparo, gerados);
    linhas.push(publicado.linha);
    const origem = preparo.pronto ? preparo.origem : preparo.linha.arquivo_origem;
    eventos.push(...publicado.motivos.map((motivo) => `${origem}\t${motivo}`));
  }
  const orfaos = listarOrfaos(saida, gerados, limpar);
  eventos.push(...orfaos.map((nome) => `${nome}\torfao`));
  publicar(path.join(saida, "resultado.csv"), Buffer.from(csv(linhas), "utf8"));
  publicar(path.join(saida, "relacao.csv"), Buffer.from(csvRelacao(linhas), "utf8"));
  const log = eventos.length > 0 ? `${eventos.join("\n")}\n` : "";
  publicar(path.join(saida, "erros.log"), Buffer.from(log, "utf8"));
  return { linhas, resumo: montarResumo(linhas, orfaos.length), orfaos: orfaos.length };
}

export function prepararArquivo(caminho: string, origem: string): Preparo {
  let bruto: string;
  try {
    bruto = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(caminho));
  } catch {
    return {
      pronto: false,
      linha: linhaDe("", origem, "", "erro"),
      motivos: ["leitura"],
      anotacoes: ["Não foi possível ler o arquivo."],
    };
  }
  let documento: unknown;
  try {
    documento = JSON.parse(bruto) as unknown;
  } catch (falha: unknown) {
    return {
      pronto: false,
      linha: linhaDe("", origem, "", "erro"),
      motivos: ["json_invalido"],
      anotacoes: [fraseJsonInvalido(falha)],
    };
  }
  const estrutural = documentoEntradaSchema.safeParse(documento);
  if (!estrutural.success) {
    const codigo = ehObjeto(documento) ? codigoBruto(lexemaCodigo(bruto)) : "";
    return {
      pronto: false,
      linha: linhaDe(codigo, origem, "", "erro"),
      motivos: ["blocks_invalidos"],
      anotacoes: [fraseBlocks(documento)],
    };
  }
  const situacao = classificarCodigo(lexemaCodigo(bruto));
  if (situacao.situacao !== "ok") {
    const status: Status = situacao.situacao === "tipo_codigo" ? "erro" : "sem_codigo";
    return {
      pronto: false,
      linha: linhaDe(situacao.codigo, origem, "", status),
      motivos: [situacao.situacao],
      anotacoes: [fraseCodigo(situacao)],
    };
  }
  const { corpo, motivos } = renderizar(estrutural.data.blocks);
  const uuid = identificadorDe(chaveCanonica(estrutural.data.blocks));
  const nome = `${uuid}.txt`;
  return { pronto: true, codigo: situacao.codigo, origem, uuid, nome, corpo, motivos };
}

export function publicarPreparo(
  saida: string,
  preparo: Preparo,
  gerados: Set<string>,
): { linha: Linha; motivos: string[] } {
  if (!preparo.pronto) return { linha: preparo.linha, motivos: preparo.motivos };
  if (gerados.has(preparo.nome)) {
    return {
      linha: linhaDe(preparo.codigo, preparo.origem, "", "erro"),
      motivos: [...preparo.motivos, "colisao"],
    };
  }
  try {
    const dados = preparo.corpo ? Buffer.from(`${preparo.corpo}\n`, "utf8") : Buffer.alloc(0);
    publicar(path.join(saida, preparo.nome), dados);
  } catch {
    return {
      linha: linhaDe(preparo.codigo, preparo.origem, "", "erro"),
      motivos: [...preparo.motivos, "leitura"],
    };
  }
  gerados.add(preparo.nome);
  return {
    linha: linhaDe(preparo.codigo, preparo.origem, preparo.nome, "convertido", preparo.uuid),
    motivos: preparo.motivos,
  };
}

export function limparCodigo(valor: string): string {
  const texto = [...valor]
    .filter((caractere) => !ehEspacoUnicode(caractere) && !PROIBIDOS.test(caractere))
    .join("")
    .replace(/\.+$/u, "")
    .slice(0, 80)
    .replace(/\.+$/u, "");
  if (RESERVADOS.has(texto.toUpperCase())) return "";
  return texto;
}

export function listarJson(entrada: string): string[] {
  const encontrados: string[] = [];
  const visitar = (diretorio: string): void => {
    for (const entradaDir of readdirSync(diretorio, { withFileTypes: true })) {
      if (entradaDir.isSymbolicLink()) continue;
      const caminho = path.join(diretorio, entradaDir.name);
      if (entradaDir.isDirectory()) visitar(caminho);
      else if (entradaDir.isFile() && caminho.toLowerCase().endsWith(".json")) encontrados.push(caminho);
    }
  };
  visitar(entrada);
  encontrados.sort((esquerda, direita) => {
    const a = caminhoRelativo(entrada, esquerda);
    const b = caminhoRelativo(entrada, direita);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  return encontrados;
}

function classificarCodigo(token: string | null): {
  situacao: "ok" | "sem_codigo" | "tipo_codigo";
  codigo: string;
  detalhe?: "ausente" | "vazio";
} {
  if (token === null || token === "null") return { situacao: "sem_codigo", codigo: "", detalhe: "ausente" };
  if (token === "true" || token === "false" || token.startsWith("{") || token.startsWith("[")) {
    return { situacao: "tipo_codigo", codigo: "" };
  }
  if (token.startsWith('"')) {
    const valor = JSON.parse(token) as unknown;
    if (typeof valor !== "string") return { situacao: "tipo_codigo", codigo: "" };
    if (valor === "" || limparCodigo(valor) === "") return { situacao: "sem_codigo", codigo: valor, detalhe: "vazio" };
    return { situacao: "ok", codigo: valor };
  }
  if (/^-?\d+$/.test(token)) {
    if (limparCodigo(token) === "") return { situacao: "sem_codigo", codigo: token, detalhe: "vazio" };
    return { situacao: "ok", codigo: token };
  }
  return { situacao: "tipo_codigo", codigo: "" };
}

function fraseJsonInvalido(falha: unknown): string {
  const mensagem = falha instanceof Error ? falha.message : "";
  const posicao = /position (\d+)/i.exec(mensagem)?.[1] ?? /posição (\d+)/i.exec(mensagem)?.[1];
  if (posicao) return `JSON inválido: token inesperado na posição ${posicao}.`;
  return "JSON inválido.";
}

function fraseBlocks(documento: unknown): string {
  if (ehObjeto(documento) && "blocks" in documento && !Array.isArray(documento.blocks)) {
    return "O campo blocks não é uma lista.";
  }
  return "O campo blocks está ausente.";
}

function fraseCodigo(situacao: { situacao: "sem_codigo" | "tipo_codigo"; detalhe?: "ausente" | "vazio" }): string {
  if (situacao.situacao === "tipo_codigo") return "codigoDisciplina com tipo inválido.";
  if (situacao.detalhe === "vazio") return "codigoDisciplina vazio.";
  return "codigoDisciplina ausente.";
}

function codigoBruto(token: string | null): string {
  if (token === null || token === "true" || token === "false" || token === "null") return "";
  if (token.startsWith('"')) {
    const valor = JSON.parse(token) as unknown;
    return typeof valor === "string" ? valor : "";
  }
  if (/^-?\d+$/.test(token)) return token;
  return "";
}

function lexemaCodigo(bruto: string): string | null {
  let indice = 0;
  let profundidade = 0;
  while (indice < bruto.length) {
    const caractere = bruto[indice] ?? "";
    if (caractere === '"') {
      const inicio = indice;
      indice = fimDaString(bruto, indice);
      const trecho = bruto.slice(inicio, indice);
      if (profundidade === 1 && trecho === '"codigoDisciplina"') {
        indice = pularEspaco(bruto, indice);
        if (bruto[indice] !== ":") return null;
        indice = pularEspaco(bruto, indice + 1);
        return capturarValor(bruto, indice);
      }
      continue;
    }
    if (caractere === "{" || caractere === "[") profundidade += 1;
    else if (caractere === "}" || caractere === "]") profundidade -= 1;
    indice += 1;
  }
  return null;
}

function capturarValor(bruto: string, indice: number): string {
  const caractere = bruto[indice] ?? "";
  if (caractere === '"') return bruto.slice(indice, fimDaString(bruto, indice));
  if (caractere === "{" || caractere === "[") return bruto.slice(indice, fimDoBloco(bruto, indice));
  let fim = indice;
  while (fim < bruto.length && !",[}]".includes(bruto[fim] ?? "") && !ehEspacoUnicode(bruto[fim] ?? "")) fim += 1;
  return bruto.slice(indice, fim);
}

function fimDaString(bruto: string, inicio: number): number {
  let indice = inicio + 1;
  let escape = false;
  while (indice < bruto.length) {
    const caractere = bruto[indice] ?? "";
    if (escape) escape = false;
    else if (caractere === "\\") escape = true;
    else if (caractere === '"') return indice + 1;
    indice += 1;
  }
  return bruto.length;
}

function fimDoBloco(bruto: string, inicio: number): number {
  const abre = bruto[inicio];
  const fecha = abre === "{" ? "}" : "]";
  let profundidade = 0;
  let indice = inicio;
  let emString = false;
  let escape = false;
  while (indice < bruto.length) {
    const caractere = bruto[indice] ?? "";
    if (emString) {
      if (escape) escape = false;
      else if (caractere === "\\") escape = true;
      else if (caractere === '"') emString = false;
    } else if (caractere === '"') emString = true;
    else if (caractere === abre) profundidade += 1;
    else if (caractere === fecha) {
      profundidade -= 1;
      if (profundidade === 0) return indice + 1;
    }
    indice += 1;
  }
  return bruto.length;
}

function pularEspaco(bruto: string, indice: number): number {
  let cursor = indice;
  while (cursor < bruto.length && ehEspacoUnicode(bruto[cursor] ?? "")) cursor += 1;
  return cursor;
}

function linhaDe(codigo: string, origem: string, arquivo: string, status: Status, uuid = ""): Linha {
  return { codigoDisciplina: codigo, uuid, arquivo_origem: origem, arquivo_saida: arquivo, status };
}

function listarOrfaos(saida: string, gerados: Set<string>, limpar: boolean): string[] {
  const nomes = readdirSync(saida, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && ORFAO.test(entrada.name) && !gerados.has(entrada.name))
    .map((entrada) => entrada.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (limpar) {
    for (const nome of nomes) rmSync(path.join(saida, nome));
  }
  return nomes;
}

function csv(linhas: readonly Linha[]): string {
  const corpo = linhas.map((linha) => COLUNAS.map((coluna) => campoCsv(linha[coluna])).join(","));
  return `${COLUNAS.join(",")}\n${corpo.join("\n")}${corpo.length ? "\n" : ""}`;
}

function csvRelacao(linhas: readonly Linha[]): string {
  const corpo = linhas
    .filter((linha) => linha.status === "convertido")
    .map((linha) => `${campoCsv(linha.codigoDisciplina)},${campoCsv(linha.uuid)}`);
  return `codigoDisciplina,uuid\n${corpo.join("\n")}${corpo.length > 0 ? "\n" : ""}`;
}

function campoCsv(valor: string): string {
  if (/[",\n\r]/.test(valor)) return `"${valor.replaceAll('"', '""')}"`;
  return valor;
}

function montarResumo(linhas: readonly Linha[], orfaos: number): string {
  const convertidos = linhas.filter((linha) => linha.status === "convertido");
  const contagem = new Map<string, number>();
  for (const linha of convertidos) {
    contagem.set(linha.codigoDisciplina, (contagem.get(linha.codigoDisciplina) ?? 0) + 1);
  }
  let repetidos = 0;
  for (const quantidade of contagem.values()) {
    if (quantidade > 1) repetidos += 1;
  }
  return (
    `lidos: ${linhas.length}\n` +
    `convertidos: ${convertidos.length}\n` +
    `erros: ${linhas.filter((linha) => linha.status === "erro").length}\n` +
    `sem_codigo: ${linhas.filter((linha) => linha.status === "sem_codigo").length}\n` +
    `codigos_repetidos: ${repetidos}\n` +
    `orfaos: ${orfaos}\n`
  );
}

function publicar(caminho: string, dados: Buffer): void {
  const temporario = `${caminho}.tmp`;
  writeFileSync(temporario, dados);
  try {
    renameSync(temporario, caminho);
  } catch {
    rmSync(caminho, { force: true });
    renameSync(temporario, caminho);
  }
}

export function caminhoRelativo(raiz: string, caminho: string): string {
  return path.relative(raiz, caminho).split(path.sep).join("/");
}

function ehEspacoUnicode(caractere: string): boolean {
  return /^\p{White_Space}$/u.test(caractere);
}
