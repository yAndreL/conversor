import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  FRASE_DUPLICADO,
  FRASE_NAO_JSON,
  FRASE_NOME_INVALIDO,
  fraseArquivoGrande,
  fraseLoteCheioArquivos,
  fraseLoteCheioBytes,
  maxBytesRequisicao,
  type LimitesContrato,
} from "@conversor/contratos";

import {
  bytesLivres,
  caberiaNoLote,
  expiracao,
  lerManifesto,
  moverManifesto,
  origensDoLote,
  persistir,
  publicarTexto,
  respostaDe,
  rotuloDuplicado,
  type EntradaDisco,
  type Job,
  type ManifestoDisco,
  type RecusaDisco,
} from "./loteEstado.js";

const ENVIO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FluxoArquivo = NodeJS.ReadableStream & { truncated?: boolean };

export type ParteEnvio =
  | { type: "file"; fieldname: string; filename: string; file: FluxoArquivo }
  | { type: "field"; fieldname: string; value: unknown };

export type ResultadoEnvio =
  | { status: 200; corpo: { aceitos: number; recusados: RecusaDisco[] } }
  | { status: 400 | 409 | 413 | 500; erro: "lote_invalido" | "limite_excedido" | "limite_lote" | "envio_em_andamento" | "lote_ocupado"; mensagem: string };

type RecusaHttp = Extract<ResultadoEnvio, { status: 400 | 409 | 413 | 500 }>;

export async function drenarIterador(iterador: AsyncIterator<ParteEnvio>): Promise<void> {
  let passo = await iterador.next();
  while (!passo.done) {
    if (passo.value.type === "file") passo.value.file.resume();
    passo = await iterador.next();
  }
}

export function envioIdValido(valor: string): boolean {
  return ENVIO_ID.test(valor);
}

export async function receberEnvio(
  job: Job,
  partes: AsyncIterable<ParteEnvio>,
  limites: LimitesContrato,
  ttlMs: number,
  aoSegurarEnvio?: () => Promise<void>,
): Promise<ResultadoEnvio> {
  const iterador = partes[Symbol.asyncIterator]();
  const envioId = await lerEnvioId(iterador);
  if (envioId === null) return recusa(400, "lote_invalido", "Informe o envioId.");
  if (!envioIdValido(envioId)) {
    await drenarIterador(iterador);
    return recusa(400, "lote_invalido", "O envioId é inválido.");
  }
  if (job.emVoo.has(envioId)) {
    await drenarIterador(iterador);
    return recusa(409, "envio_em_andamento", "Esse envio já está sendo gravado.");
  }
  const guardado = lerManifesto(path.join(job.metaEnvios, `${envioId}.json`));
  if (guardado) {
    await drenarIterador(iterador);
    return { status: 200, corpo: respostaDe(guardado) };
  }
  const pasta = path.join(job.staging, envioId);
  const manifestoStaging = lerManifesto(path.join(pasta, "manifesto.json"));
  if (!manifestoStaging && job.status !== "recebendo") {
    await drenarIterador(iterador);
    return recusa(400, "lote_invalido", "O lote não está recebendo arquivos.");
  }
  if (job.emVoo.size > 0) {
    await drenarIterador(iterador);
    return recusa(409, "lote_ocupado", "Ainda há envio em andamento.");
  }

  job.emVoo.add(envioId);
  const anterior = job.cadeiaEnvio;
  let liberar: () => void = () => undefined;
  job.cadeiaEnvio = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let manifestoEscrito = false;
  try {
    await anterior;
    if (aoSegurarEnvio && !manifestoStaging) await aoSegurarEnvio();
    if (manifestoStaging) {
      await drenarIterador(iterador);
      moverManifesto(job, pasta, envioId, manifestoStaging);
      job.expiraEm = expiracao(ttlMs);
      persistir(job);
      return { status: 200, corpo: respostaDe(manifestoStaging) };
    }
    rmSync(pasta, { recursive: true, force: true });
    mkdirSync(pasta, { recursive: true });
    const manifesto = await lerArquivos(job, pasta, iterador, limites);
    const estouro = caberiaNoLote(job, manifesto.entradas, limites);
    if (estouro) {
      rmSync(pasta, { recursive: true, force: true });
      const mensagem = estouro === "arquivos" ? fraseLoteCheioArquivos(limites.maxArquivosLote) : fraseLoteCheioBytes(limites.maxBytesLote);
      return recusa(413, "limite_lote", mensagem);
    }
    publicarTexto(path.join(pasta, "manifesto.json"), JSON.stringify(manifesto));
    manifestoEscrito = true;
    moverManifesto(job, pasta, envioId, manifesto);
    job.expiraEm = expiracao(ttlMs);
    persistir(job);
    return { status: 200, corpo: respostaDe(manifesto) };
  } catch (falha: unknown) {
    if (!manifestoEscrito) rmSync(pasta, { recursive: true, force: true });
    if (falha instanceof CampoInvalido) return recusa(400, "lote_invalido", falha.message);
    if (falha instanceof LimiteEnvio) return recusa(falha.status, falha.codigo, falha.mensagem);
    if (estouroMultipart(falha)) return recusa(413, "limite_excedido", "O envio passou do limite permitido.");
    return recusa(500, "lote_invalido", "Não foi possível concluir o envio.");
  } finally {
    job.emVoo.delete(envioId);
    liberar();
  }
}

export function tetoRequisicao(limites: LimitesContrato): number {
  return maxBytesRequisicao(limites);
}

class CampoInvalido extends Error {}

class LimiteEnvio extends Error {
  constructor(
    readonly status: 413,
    readonly codigo: "limite_excedido" | "limite_lote",
    readonly mensagem: string,
  ) {
    super(mensagem);
  }
}

async function lerEnvioId(iterador: AsyncIterator<ParteEnvio>): Promise<string | null> {
  let passo = await iterador.next();
  while (!passo.done) {
    const parte = passo.value;
    if (parte.type === "field" && parte.fieldname === "envioId") return typeof parte.value === "string" ? parte.value : "";
    if (parte.type === "file") {
      parte.file.resume();
      await drenarIterador(iterador);
      return null;
    }
    passo = await iterador.next();
  }
  return "";
}

async function lerArquivos(job: Job, pasta: string, iterador: AsyncIterator<ParteEnvio>, limites: LimitesContrato): Promise<ManifestoDisco> {
  const entradas: EntradaDisco[] = [];
  const recusados: RecusaDisco[] = [];
  const origens = origensDoLote(job);
  let bytesEnvio = 0;
  let arquivos = 0;
  let passo = await iterador.next();
  while (!passo.done) {
    const parte = passo.value;
    if (parte.type !== "file") {
      passo = await iterador.next();
      continue;
    }
    if (parte.fieldname !== "arquivos") {
      await descartarFluxo(parte.file);
      throw new CampoInvalido("O campo do arquivo deve ser arquivos.");
    }
    arquivos += 1;
    if (arquivos > limites.maxArquivosEnvio) {
      await descartarFluxo(parte.file);
      throw new LimiteEnvio(413, "limite_excedido", "O envio passou do limite permitido.");
    }
    const nome = basenameEnvio(parte.filename);
    const recusaNome = classificarNome(nome, origens);
    const nomeDisco = `${randomUUID()}.json`;
    const destino = recusaNome ? null : path.join(pasta, nomeDisco);
    const bytes = destino ? await gravarFluxo(parte.file, destino) : await descartarFluxo(parte.file);
    if (parte.file.truncated || bytes > limites.maxBytesArquivo) {
      throw new LimiteEnvio(413, "limite_excedido", fraseArquivoGrande(limites.maxBytesArquivo));
    }
    bytesEnvio += bytes;
    if (bytesEnvio > limites.maxBytesEnvio) {
      throw new LimiteEnvio(413, "limite_excedido", "O envio passou do limite permitido.");
    }
    const livre = bytesLivres(job.dir);
    if (livre !== null && livre < limites.minBytesLivres) {
      throw new LimiteEnvio(413, "limite_excedido", "Não há espaço livre suficiente no disco.");
    }
    if (recusaNome) {
      recusados.push(recusaNome);
      if (recusaNome.motivo !== "duplicado") origens.add(nome);
    } else {
      entradas.push({ arquivo_origem: nome, nomeDisco, bytes });
      origens.add(nome);
    }
    passo = await iterador.next();
  }
  return { aceitos: entradas.length, recusados, entradas };
}

function classificarNome(nome: string, origens: Set<string>): RecusaDisco | null {
  if (nomeInvalido(nome)) {
    return { arquivo_origem: nome, motivo: "nome_invalido", diagnostico: FRASE_NOME_INVALIDO };
  }
  if (!nome.toLowerCase().endsWith(".json")) {
    return { arquivo_origem: nome, motivo: "nao_json", diagnostico: FRASE_NAO_JSON };
  }
  if (origens.has(nome)) {
    return { arquivo_origem: rotuloDuplicado(origens, nome), motivo: "duplicado", diagnostico: FRASE_DUPLICADO };
  }
  return null;
}

function nomeInvalido(nome: string): boolean {
  if (nome.length === 0 || nome === "." || nome === "..") return true;
  return Buffer.byteLength(nome, "utf8") > 255;
}

function basenameEnvio(nome: string): string {
  const barra = Math.max(nome.lastIndexOf("/"), nome.lastIndexOf("\\"));
  return barra >= 0 ? nome.slice(barra + 1) : nome;
}

async function gravarFluxo(fluxo: FluxoArquivo, destino: string): Promise<number> {
  let bytes = 0;
  const contador = new Transform({
    transform(pedaco: Buffer, _encoding, callback) {
      bytes += pedaco.length;
      callback(null, pedaco);
    },
  });
  await pipeline(fluxo, contador, createWriteStream(destino));
  return bytes;
}

async function descartarFluxo(fluxo: FluxoArquivo): Promise<number> {
  let bytes = 0;
  for await (const pedaco of fluxo) bytes += (pedaco as Buffer).length;
  return bytes;
}

function estouroMultipart(falha: unknown): boolean {
  if (typeof falha !== "object" || falha === null) return false;
  const codigo = "code" in falha && (typeof falha.code === "string" || typeof falha.code === "number") ? String(falha.code) : "";
  const mensagem = "message" in falha && typeof falha.message === "string" ? falha.message : "";
  return codigo.startsWith("FST_") || /limit|fileSize|files/i.test(mensagem);
}

function recusa(status: RecusaHttp["status"], erro: RecusaHttp["erro"], mensagem: string): RecusaHttp {
  return { status, erro, mensagem };
}
