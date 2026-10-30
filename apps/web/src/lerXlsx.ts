export type CelulaPlanilha = string | number | null;

export type LinhaPlanilha = Record<string, CelulaPlanilha>;

type EntradaZip = {
  nome: string;
  metodo: number;
  comprimido: number;
  inicioDados: number;
};

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;

export async function percorrerLinhasXlsx(
  conteudo: ArrayBuffer | Uint8Array,
  visitar: (linha: LinhaPlanilha, indice: number) => void,
  opcoes?: {
    aoProgredir?: (linhasLidas: number) => void;
    nomeDaColuna?: (coluna: string) => string;
  },
): Promise<void> {
  const dados = conteudo instanceof Uint8Array ? conteudo : new Uint8Array(conteudo);
  const entradas = entradasZip(dados);
  const textos = new Map<string, string>();
  for (const nome of ["xl/workbook.xml", "xl/_rels/workbook.xml.rels"]) {
    const entrada = entradas.find((item) => item.nome === nome);
    if (entrada) textos.set(nome, await lerTexto(dados, entrada));
  }
  const caminho = caminhoDaAba(entradas, textos.get("xl/workbook.xml") ?? "", textos.get("xl/_rels/workbook.xml.rels") ?? "");
  const folha = caminho ? entradas.find((item) => item.nome === caminho) : undefined;
  if (!folha) throw new Error("A planilha não tem aba.");
  const compartilhadas = await lerTextosCompartilhados(dados, entradas);
  let cabecalho: string[] | null = null;
  let indice = 0;
  for await (const trecho of linhasXml(dados, folha)) {
    const registro = registroDaLinha(trecho, compartilhadas, opcoes?.nomeDaColuna);
    if (!cabecalho) {
      cabecalho = registro.cabecalho;
      const faltando = ["name", "curso", "disciplina"].filter((coluna) => !cabecalho?.includes(coluna));
      if (faltando.length > 0) throw new Error(fraseColunas(faltando));
      continue;
    }
    const linha: LinhaPlanilha = {};
    for (let coluna = 0; coluna < cabecalho.length; coluna += 1) {
      const nome = cabecalho[coluna];
      if (!nome) continue;
      linha[nome] = registro.valores[coluna] ?? null;
    }
    visitar(linha, indice);
    indice += 1;
    if (indice % 10000 === 0) opcoes?.aoProgredir?.(indice);
  }
  if (!cabecalho) throw new Error("A planilha não tem cabeçalho.");
  opcoes?.aoProgredir?.(indice);
}

function fraseColunas(faltando: readonly string[]): string {
  if (faltando.length === 1) return `A planilha não tem a coluna ${faltando[0] ?? ""}.`;
  const ultima = faltando[faltando.length - 1] ?? "";
  return `A planilha não tem as colunas ${faltando.slice(0, -1).join(", ")} e ${ultima}.`;
}

function caminhoDaAba(entradas: readonly EntradaZip[], workbook: string, relacoes: string): string | null {
  const id = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  if (id) {
    const alvo = alvoDaRelacao(relacoes, id);
    if (alvo) return normalizarCaminho(alvo);
  }
  return entradas.find((item) => /^xl\/worksheets\/sheet\d+\.xml$/.test(item.nome))?.nome ?? null;
}

function alvoDaRelacao(relacoes: string, id: string): string | null {
  const trechos = relacoes.match(/<Relationship\b[^>]*\/>/g) ?? [];
  for (const trecho of trechos) {
    const encontrado = /\bId="([^"]+)"/.exec(trecho)?.[1];
    if (encontrado !== id) continue;
    return /\bTarget="([^"]+)"/.exec(trecho)?.[1] ?? null;
  }
  return null;
}

function normalizarCaminho(alvo: string): string {
  const caminho = alvo.replaceAll("\\", "/");
  if (caminho.startsWith("/")) return caminho.slice(1);
  if (caminho.startsWith("xl/")) return caminho;
  return `xl/${caminho}`;
}

async function lerTextosCompartilhados(dados: Uint8Array, entradas: readonly EntradaZip[]): Promise<string[]> {
  const entrada = entradas.find((item) => item.nome === "xl/sharedStrings.xml");
  if (!entrada) return [];
  const xml = await lerTexto(dados, entrada);
  const textos: string[] = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const abre = xml.indexOf("<si", cursor);
    if (abre === -1) break;
    const fecha = xml.indexOf("</si>", abre);
    if (fecha === -1) break;
    textos.push(textosDaMarca(xml.slice(abre, fecha)));
    cursor = fecha + 5;
  }
  return textos;
}

function textosDaMarca(trecho: string): string {
  let texto = "";
  let cursor = 0;
  while (cursor < trecho.length) {
    const abre = trecho.indexOf("<t", cursor);
    if (abre === -1) break;
    const fimTag = trecho.indexOf(">", abre);
    if (fimTag === -1) break;
    if (trecho[fimTag - 1] === "/") {
      cursor = fimTag + 1;
      continue;
    }
    const fecha = trecho.indexOf("</t>", fimTag);
    if (fecha === -1) break;
    texto += decodificar(trecho.slice(fimTag + 1, fecha));
    cursor = fecha + 4;
  }
  return texto;
}

function registroDaLinha(
  trecho: string,
  textos: readonly string[],
  nomeDaColuna?: (coluna: string) => string,
): { cabecalho: string[]; valores: CelulaPlanilha[] } {
  const cabecalho: string[] = [];
  const valores: CelulaPlanilha[] = [];
  let cursor = 0;
  while (cursor < trecho.length) {
    const abre = trecho.indexOf("<c", cursor);
    if (abre === -1) break;
    if (!ehTagCelula(trecho, abre)) {
      cursor = abre + 2;
      continue;
    }
    const fimTag = trecho.indexOf(">", abre);
    if (fimTag === -1) break;
    const atributos = trecho.slice(abre, fimTag);
    const fechada = trecho[fimTag - 1] === "/";
    let miolo = "";
    let proximo = fimTag + 1;
    if (!fechada) {
      const fecha = trecho.indexOf("</c>", fimTag);
      if (fecha === -1) break;
      miolo = trecho.slice(fimTag + 1, fecha);
      proximo = fecha + 4;
    }
    const coluna = indiceDaColuna(atributos);
    if (coluna !== null) {
      const valor = valorDaCelula(tipoDaCelula(atributos), miolo, textos);
      valores[coluna] = valor;
      if (typeof valor === "string") {
        const nome = valor.trim();
        cabecalho[coluna] = nomeDaColuna ? nomeDaColuna(nome) : nome;
      }
    }
    cursor = proximo;
  }
  return { cabecalho, valores };
}

function ehTagCelula(trecho: string, abre: number): boolean {
  const seguinte = trecho[abre + 2];
  return seguinte === " " || seguinte === ">" || seguinte === "/";
}

function indiceDaColuna(atributos: string): number | null {
  const referencia = /\br="([A-Z]+)\d+"/.exec(atributos)?.[1];
  if (!referencia) return null;
  let indice = 0;
  for (const letra of referencia) indice = indice * 26 + (letra.charCodeAt(0) - 64);
  return indice - 1;
}

function tipoDaCelula(atributos: string): string {
  return /\bt="([^"]+)"/.exec(atributos)?.[1] ?? "n";
}

function valorDaCelula(tipo: string, miolo: string, textos: readonly string[]): CelulaPlanilha {
  if (tipo === "s") {
    const indice = Number(valorTag(miolo));
    return textos[indice] ?? null;
  }
  if (tipo === "inlineStr") return decodificar(textosDaMarca(miolo));
  const bruto = tipo === "str" ? decodificar(valorTag(miolo)) : valorTag(miolo);
  if (bruto === "") return null;
  if (tipo === "str") return bruto;
  const numero = Number(bruto);
  return Number.isFinite(numero) ? numero : decodificar(bruto);
}

function valorTag(miolo: string): string {
  const abre = miolo.indexOf("<v>");
  if (abre === -1) return "";
  const fecha = miolo.indexOf("</v>", abre);
  if (fecha === -1) return "";
  return miolo.slice(abre + 3, fecha);
}

function decodificar(texto: string): string {
  return texto
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_texto, numero: string) => String.fromCodePoint(Number(numero)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_texto, numero: string) => String.fromCodePoint(Number.parseInt(numero, 16)));
}

async function lerTexto(dados: Uint8Array, entrada: EntradaZip): Promise<string> {
  let texto = "";
  for await (const pedaco of pedacosDeTexto(dados, entrada)) texto += pedaco;
  return texto;
}

async function* linhasXml(dados: Uint8Array, entrada: EntradaZip): AsyncGenerator<string> {
  let resto = "";
  for await (const pedaco of pedacosDeTexto(dados, entrada)) {
    resto += pedaco;
    let fecha = resto.indexOf("</row>");
    while (fecha !== -1) {
      const abre = resto.lastIndexOf("<row", fecha);
      if (abre === -1) {
        resto = resto.slice(fecha + 6);
      } else {
        yield resto.slice(abre, fecha + 6);
        resto = resto.slice(fecha + 6);
      }
      fecha = resto.indexOf("</row>");
    }
  }
}

async function* pedacosDeTexto(dados: Uint8Array, entrada: EntradaZip): AsyncGenerator<string> {
  const fatia = dados.subarray(entrada.inicioDados, entrada.inicioDados + entrada.comprimido);
  const origem = new ReadableStream<Uint8Array>({
    start(controlador) {
      controlador.enqueue(fatia);
      controlador.close();
    },
  });
  if (entrada.metodo !== 0 && entrada.metodo !== 8) throw new Error("Não foi possível ler a planilha.");
  const binario =
    entrada.metodo === 8
      ? origem.pipeThrough(new DecompressionStream("deflate-raw") as ReadableWritablePair<Uint8Array, Uint8Array>)
      : origem;
  const leitor = binario.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>).getReader();
  try {
    while (true) {
      const passo = await leitor.read();
      if (passo.done) return;
      yield passo.value;
    }
  } finally {
    leitor.releaseLock();
  }
}

function entradasZip(dados: Uint8Array): EntradaZip[] {
  const fim = acharFim(dados);
  const quantidade = u16(dados, fim + 10);
  let posicao = u32(dados, fim + 16);
  const entradas: EntradaZip[] = [];
  for (let indice = 0; indice < quantidade; indice += 1) {
    if (u32(dados, posicao) !== ASSINATURA_CENTRAL) break;
    const metodo = u16(dados, posicao + 10);
    const comprimido = u32(dados, posicao + 20);
    const nomeTam = u16(dados, posicao + 28);
    const extraTam = u16(dados, posicao + 30);
    const comentarioTam = u16(dados, posicao + 32);
    const local = u32(dados, posicao + 42);
    const nome = new TextDecoder().decode(dados.subarray(posicao + 46, posicao + 46 + nomeTam));
    const localNome = u16(dados, local + 26);
    const localExtra = u16(dados, local + 28);
    entradas.push({
      nome,
      metodo,
      comprimido,
      inicioDados: local + 30 + localNome + localExtra,
    });
    posicao += 46 + nomeTam + extraTam + comentarioTam;
  }
  if (entradas.length === 0) throw new Error("Não foi possível ler a planilha.");
  return entradas;
}

function acharFim(dados: Uint8Array): number {
  const minimo = Math.max(0, dados.length - 22 - 65535);
  for (let indice = dados.length - 22; indice >= minimo; indice -= 1) {
    if (u32(dados, indice) === ASSINATURA_FIM) return indice;
  }
  throw new Error("Não foi possível ler a planilha.");
}

function u16(dados: Uint8Array, offset: number): number {
  return (dados[offset] ?? 0) | ((dados[offset + 1] ?? 0) << 8);
}

function u32(dados: Uint8Array, offset: number): number {
  return (
    (dados[offset] ?? 0) |
    ((dados[offset + 1] ?? 0) << 8) |
    ((dados[offset + 2] ?? 0) << 16) |
    ((dados[offset + 3] ?? 0) << 24)
  ) >>> 0;
}
