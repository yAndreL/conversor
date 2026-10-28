import { ehEspaco, ehObjeto } from "./identidade.js";

const INVISIVEIS = new Set(["\u200b", "\u200c", "\u200d", "\u2060", "\ufeff"]);
const NUMERACAO = /^(\d+(?:\.\d+)*)\.?(?:\s+|$)/u;
const UNIDADE = /^(?:unidade|capitulo)\s+([ivxlcdm]+|\d+)\b/u;
const VALOR_ROMANO: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

type ClasseTitulo =
  | { tipo: "unidade"; numero: number }
  | { tipo: "numerado"; partes: number[] }
  | { tipo: "original" };

type Marco = { partes: number[]; nivel: number };

export function nivelDeHeading(bloco: Record<string, unknown>): number | null {
  const nivel = bloco.level;
  if (typeof nivel === "number" && Number.isInteger(nivel) && nivel >= 1 && nivel <= 6) return nivel;
  const tag = bloco.tag;
  if (typeof tag === "string" && /^h[1-6]$/i.test(tag)) return Number(tag[1]);
  return null;
}

export function niveisPadronizados(blocos: readonly unknown[]): ReadonlyMap<object, number> {
  const mapa = new Map<object, number>();
  const pilha: Marco[] = [];
  for (const bloco of blocos) {
    if (!ehObjeto(bloco) || bloco.type !== "heading") continue;
    const nivel = nivelDeHeading(bloco);
    if (nivel === null) continue;
    const texto = typeof bloco.text === "string" ? bloco.text : "";
    if (textoVazio(texto)) continue;
    mapa.set(bloco, atribuirNivel(classificarTitulo(texto), nivel, pilha));
  }
  return mapa;
}

function classificarTitulo(texto: string): ClasseTitulo {
  const aparado = aparar(texto);
  const unidade = UNIDADE.exec(dobrar(aparado));
  const numero = unidade?.[1] ? numeroDeUnidade(unidade[1]) : null;
  if (numero !== null) return { tipo: "unidade", numero };
  const partes = NUMERACAO.exec(aparado)?.[1];
  if (partes) return { tipo: "numerado", partes: partes.split(".").map((parte) => Number(parte)) };
  return { tipo: "original" };
}

function atribuirNivel(classe: ClasseTitulo, original: number, pilha: Marco[]): number {
  switch (classe.tipo) {
    case "unidade":
      pilha.length = 0;
      pilha.push({ partes: [classe.numero], nivel: 1 });
      return 1;
    case "numerado": {
      const calculado = nivelPeloNumero(classe.partes, pilha);
      if (calculado === null) return original;
      const nivel = limitar(calculado);
      pilha.push({ partes: classe.partes, nivel });
      return nivel;
    }
    case "original":
      return original;
    default: {
      const nunca: never = classe;
      return nunca;
    }
  }
}

function nivelPeloNumero(partes: number[], pilha: readonly Marco[]): number | null {
  let melhor: Marco | null = null;
  for (const marco of pilha) {
    if (!ehPrefixo(marco.partes, partes)) continue;
    if (
      !melhor ||
      marco.partes.length > melhor.partes.length ||
      (marco.partes.length === melhor.partes.length && marco.nivel > melhor.nivel)
    ) {
      melhor = marco;
    }
  }
  if (!melhor) return null;
  if (melhor.partes.length === partes.length) return melhor.nivel + 1;
  return melhor.nivel + (partes.length - melhor.partes.length);
}

function ehPrefixo(prefixo: readonly number[], partes: readonly number[]): boolean {
  if (prefixo.length > partes.length) return false;
  return prefixo.every((parte, indice) => parte === partes[indice]);
}

function numeroDeUnidade(token: string): number | null {
  if (/^\d+$/u.test(token)) {
    const numero = Number(token);
    return numero > 0 ? numero : null;
  }
  return romanoParaNumero(token);
}

function romanoParaNumero(token: string): number | null {
  let total = 0;
  let anterior = 0;
  for (let indice = token.length - 1; indice >= 0; indice -= 1) {
    const valor = VALOR_ROMANO[token[indice] ?? ""];
    if (valor === undefined) return null;
    if (valor < anterior) total -= valor;
    else {
      total += valor;
      anterior = valor;
    }
  }
  return total > 0 ? total : null;
}

function limitar(nivel: number): number {
  if (nivel < 1) return 1;
  if (nivel > 6) return 6;
  return nivel;
}

function dobrar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function textoVazio(texto: string): boolean {
  return ![...texto].some((caractere) => !INVISIVEIS.has(caractere) && !ehEspaco(caractere));
}

function aparar(texto: string): string {
  let inicio = 0;
  let fim = texto.length;
  while (inicio < fim && ehEspaco(texto[inicio] ?? "")) inicio += 1;
  while (fim > inicio && ehEspaco(texto[fim - 1] ?? "")) fim -= 1;
  return texto.slice(inicio, fim);
}
