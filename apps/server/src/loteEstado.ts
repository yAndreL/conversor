import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  FRASE_COLISAO,
  FRASE_TELA_NAVEGADOR,
  FRASE_LEITURA,
  ordenarPorCodePoint,
  type LimitesContrato,
} from "@conversor/contratos";

export type Contagens = {
  convertidos: number;
  erros: number;
  sem_codigo: number;
  codigos_repetidos: number;
  orfaos: number;
};

export type MotivoLinha = { codigo: string; frase: string };

export type LinhaWeb = {
  codigoDisciplina: string;
  uuid: string;
  arquivo_origem: string;
  arquivo_saida: string;
  status: "convertendo" | "convertido" | "sem_codigo" | "erro";
  diagnostico: string;
  motivos: MotivoLinha[];
};

export type EntradaDisco = {
  arquivo_origem: string;
  nomeDisco: string;
  bytes: number;
};

export type RecusaDisco = {
  arquivo_origem: string;
  motivo: string;
  diagnostico: string;
};

export type ManifestoDisco = {
  aceitos: number;
  recusados: RecusaDisco[];
  entradas: EntradaDisco[];
};

export type StatusLote = "recebendo" | "processando" | "concluido" | "erro";

export type EstadoLote = {
  id: string;
  status: StatusLote;
  expiraEm: string;
  total: number;
  processados: number;
  contagens: Contagens;
  bytes: number;
  linhas: LinhaWeb[];
  entradas: EntradaDisco[];
};

export type Job = EstadoLote & {
  dir: string;
  entrada: string;
  saida: string;
  staging: string;
  metaEnvios: string;
  emVoo: Set<string>;
  cadeiaEnvio: Promise<void>;
};

const CONTAGENS_VAZIAS: Contagens = {
  convertidos: 0,
  erros: 0,
  sem_codigo: 0,
  codigos_repetidos: 0,
  orfaos: 0,
};

const NOME_DISCO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;

export function criarJob(id: string, dir: string, ttlMs: number): Job {
  const job = hidratar(dir, {
    id,
    status: "recebendo",
    expiraEm: expiracao(ttlMs),
    total: 0,
    processados: 0,
    contagens: { ...CONTAGENS_VAZIAS },
    bytes: 0,
    linhas: [],
    entradas: [],
  });
  mkdirSync(job.entrada, { recursive: true });
  mkdirSync(job.saida, { recursive: true });
  mkdirSync(job.staging, { recursive: true });
  mkdirSync(job.metaEnvios, { recursive: true });
  persistir(job);
  return job;
}

export function hidratar(dir: string, estado: EstadoLote): Job {
  return {
    ...estado,
    contagens: { ...estado.contagens },
    linhas: estado.linhas.map((linha) => ({ ...linha, motivos: linha.motivos.map((motivo) => ({ ...motivo })) })),
    entradas: estado.entradas.map((entrada) => ({ ...entrada })),
    dir,
    entrada: path.join(dir, "entrada"),
    saida: path.join(dir, "saida"),
    staging: path.join(dir, "staging"),
    metaEnvios: path.join(dir, "meta", "envios"),
    emVoo: new Set(),
    cadeiaEnvio: Promise.resolve(),
  };
}

export function persistir(job: Job): void {
  const estado: EstadoLote = {
    id: job.id,
    status: job.status,
    expiraEm: job.expiraEm,
    total: job.total,
    processados: job.processados,
    contagens: job.contagens,
    bytes: job.bytes,
    linhas: job.linhas,
    entradas: job.entradas,
  };
  publicarTexto(path.join(job.dir, "lote.json"), JSON.stringify(estado));
}

export function lerEstado(dir: string): EstadoLote | null {
  try {
    const bruto = JSON.parse(readFileSync(path.join(dir, "lote.json"), "utf8")) as EstadoLote;
    if (!bruto || typeof bruto.id !== "string" || !Array.isArray(bruto.linhas) || !Array.isArray(bruto.entradas)) return null;
    return bruto;
  } catch {
    return null;
  }
}

export function expiracao(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

export function atualizarContadores(job: Job): void {
  job.linhas = ordenarPorCodePoint(job.linhas, (linha) => linha.arquivo_origem);
  job.total = job.linhas.length;
  job.processados = job.linhas.filter((linha) => linha.status !== "convertendo").length;
  job.bytes = job.entradas.reduce((soma, entrada) => soma + entrada.bytes, 0);
  job.contagens = contar(job.linhas);
}

export function origensDoLote(job: Job): Set<string> {
  return new Set(job.linhas.map((linha) => linha.arquivo_origem));
}

export function rotuloDuplicado(origens: Set<string>, basename: string): string {
  let ocorrencia = 2;
  while (origens.has(`${basename}#${ocorrencia}`)) ocorrencia += 1;
  const rotulo = `${basename}#${ocorrencia}`;
  origens.add(rotulo);
  return rotulo;
}

export function linhaConvertendo(arquivoOrigem: string): LinhaWeb {
  return {
    codigoDisciplina: "",
    uuid: "",
    arquivo_origem: arquivoOrigem,
    arquivo_saida: "",
    status: "convertendo",
    diagnostico: "",
    motivos: [],
  };
}

export function linhaRecusa(recusa: RecusaDisco): LinhaWeb {
  return {
    codigoDisciplina: "",
    uuid: "",
    arquivo_origem: recusa.arquivo_origem,
    arquivo_saida: "",
    status: "erro",
    diagnostico: recusa.diagnostico,
    motivos: [{ codigo: recusa.motivo, frase: recusa.diagnostico }],
  };
}

export function incorporarManifesto(job: Job, manifesto: ManifestoDisco): void {
  const origens = origensDoLote(job);
  const discos = new Set(job.entradas.map((entrada) => entrada.nomeDisco));
  for (const entrada of manifesto.entradas) {
    if (discos.has(entrada.nomeDisco) || origens.has(entrada.arquivo_origem)) continue;
    if (!nomeDiscoSeguro(entrada.nomeDisco)) continue;
    job.entradas.push(entrada);
    job.linhas.push(linhaConvertendo(entrada.arquivo_origem));
    origens.add(entrada.arquivo_origem);
  }
  for (const recusa of manifesto.recusados) {
    if (origens.has(recusa.arquivo_origem)) continue;
    job.linhas.push(linhaRecusa(recusa));
    origens.add(recusa.arquivo_origem);
  }
  atualizarContadores(job);
}

export function reconciliar(job: Job): void {
  mkdirSync(job.entrada, { recursive: true });
  mkdirSync(job.saida, { recursive: true });
  mkdirSync(job.staging, { recursive: true });
  mkdirSync(job.metaEnvios, { recursive: true });
  if (existsSync(job.metaEnvios)) {
    for (const nome of readdirSync(job.metaEnvios)) {
      if (!nome.endsWith(".json")) continue;
      const manifesto = lerManifesto(path.join(job.metaEnvios, nome));
      if (manifesto) incorporarManifesto(job, manifesto);
    }
  }
  if (existsSync(job.staging)) {
    for (const envioId of readdirSync(job.staging)) {
      const pasta = path.join(job.staging, envioId);
      const manifesto = lerManifesto(path.join(pasta, "manifesto.json"));
      if (!manifesto) {
        rmSync(pasta, { recursive: true, force: true });
        continue;
      }
      moverManifesto(job, pasta, envioId, manifesto);
    }
  }
  atualizarContadores(job);
  persistir(job);
}

export function moverManifesto(job: Job, pasta: string, envioId: string, manifesto: ManifestoDisco): void {
  for (const entrada of manifesto.entradas) {
    if (!nomeDiscoSeguro(entrada.nomeDisco)) continue;
    const origem = path.join(pasta, entrada.nomeDisco);
    const destino = path.join(job.entrada, entrada.nomeDisco);
    if (!existsSync(destino) && existsSync(origem)) renameSync(origem, destino);
  }
  const meta = path.join(job.metaEnvios, `${envioId}.json`);
  if (!existsSync(meta)) publicarTexto(meta, JSON.stringify(manifesto));
  rmSync(pasta, { recursive: true, force: true });
  incorporarManifesto(job, manifesto);
}

export function lerManifesto(caminho: string): ManifestoDisco | null {
  try {
    const bruto = JSON.parse(readFileSync(caminho, "utf8")) as ManifestoDisco;
    if (!bruto || !Array.isArray(bruto.entradas) || !Array.isArray(bruto.recusados)) return null;
    return bruto;
  } catch {
    return null;
  }
}

export function respostaDe(manifesto: ManifestoDisco): { aceitos: number; recusados: RecusaDisco[] } {
  return { aceitos: manifesto.aceitos, recusados: manifesto.recusados };
}

export function nomeDiscoSeguro(nome: string): boolean {
  return NOME_DISCO.test(nome);
}

export function fraseDoMotivo(motivo: string): string {
  if (motivo.startsWith("bloco_ignorado:")) return `Bloco ignorado: ${motivo.slice("bloco_ignorado:".length)}.`;
  switch (motivo) {
    case "leitura":
      return FRASE_LEITURA;
    case "json_invalido":
      return "JSON inválido.";
    case "blocks_invalidos":
      return "O campo blocks está ausente.";
    case "sem_codigo":
      return "codigoDisciplina ausente.";
    case "tipo_codigo":
      return "codigoDisciplina com tipo inválido.";
    case "colisao":
      return FRASE_COLISAO;
    case "tela_navegador":
      return FRASE_TELA_NAVEGADOR;
    case "orfao":
      return "";
    default:
      return "";
  }
}

export function bytesLivres(dir: string): number | null {
  try {
    const info = statfsSync(dir);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return null;
  }
}

export function caberiaNoLote(job: Job, entradas: readonly EntradaDisco[], limites: Pick<LimitesContrato, "maxArquivosLote" | "maxBytesLote">): "arquivos" | "bytes" | null {
  if (job.entradas.length + entradas.length > limites.maxArquivosLote) return "arquivos";
  const bytes = entradas.reduce((soma, entrada) => soma + entrada.bytes, 0);
  if (job.bytes + bytes > limites.maxBytesLote) return "bytes";
  return null;
}

export function publicarTexto(caminho: string, texto: string): void {
  const temporario = `${caminho}.tmp`;
  writeFileSync(temporario, texto);
  try {
    renameSync(temporario, caminho);
  } catch {
    rmSync(caminho, { force: true });
    renameSync(temporario, caminho);
  }
}

function contar(linhas: readonly LinhaWeb[]): Contagens {
  const convertidos = linhas.filter((linha) => linha.status === "convertido");
  const contagem = new Map<string, number>();
  for (const linha of convertidos) contagem.set(linha.codigoDisciplina, (contagem.get(linha.codigoDisciplina) ?? 0) + 1);
  let repetidos = 0;
  for (const quantidade of contagem.values()) {
    if (quantidade > 1) repetidos += 1;
  }
  return {
    convertidos: convertidos.length,
    erros: linhas.filter((linha) => linha.status === "erro").length,
    sem_codigo: linhas.filter((linha) => linha.status === "sem_codigo").length,
    codigos_repetidos: repetidos,
    orfaos: 0,
  };
}
