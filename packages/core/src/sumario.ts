function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function textoPlano(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function textoDoBloco(bloco: Record<string, unknown>): string {
  if (typeof bloco.html === "string") return textoPlano(bloco.html);
  return typeof bloco.text === "string" ? bloco.text : "";
}

function ehTituloDeSumario(bloco: unknown): boolean {
  if (!ehRegistro(bloco)) return false;
  const id = typeof bloco.id === "string" ? normalizar(bloco.id) : "";
  if (id === "sumario") return true;
  return normalizar(textoDoBloco(bloco)) === "sumario";
}

function ehSoAncorasInternas(html: string): boolean {
  if (!/<a\b[^>]*\bhref\s*=\s*(["'])#/i.test(html)) return false;
  if (/<a\b[^>]*\bhref\s*=\s*(["'])(?!#)/i.test(html)) return false;
  const semAncoras = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "");
  return semAncoras.replace(/<[^>]+>/g, "").trim() === "";
}

function ehEntradaDeSumario(bloco: unknown): boolean {
  if (!ehRegistro(bloco) || bloco.type !== "paragraph") return false;
  const html = typeof bloco.html === "string" ? bloco.html : "";
  if (html !== "" && ehSoAncorasInternas(html)) return true;
  const texto = (html !== "" ? textoPlano(html) : typeof bloco.text === "string" ? bloco.text : "").trim();
  return /(?:\t|\.{4,}|…{2,})\s*\d+\s*$/u.test(texto);
}

export function semSumario(blocks: readonly unknown[]): unknown[] {
  const saida: unknown[] = [];
  for (let indice = 0; indice < blocks.length; indice += 1) {
    if (!ehTituloDeSumario(blocks[indice])) {
      saida.push(blocks[indice]);
      continue;
    }
    indice += 1;
    while (indice < blocks.length && ehEntradaDeSumario(blocks[indice])) indice += 1;
    indice -= 1;
  }
  return saida;
}
