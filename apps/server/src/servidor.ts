import { randomUUID } from "node:crypto";
import { createReadStream, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FRASE_FORA_DE_RECEBIMENTO,
  FRASE_LOTE_AUSENTE,
  FRASE_LOTE_OCUPADO,
  LIMITES_PADRAO,
  aceiteSchema,
  consultaLinhasSchema,
  erroApiSchema,
  exclusaoLinhaSchema,
  fraseLotesAtivos,
  loteSchema,
  paginaLinhasSchema,
  respostaEnvioSchema,
  type ErroApi,
  type LimitesContrato,
} from "@conversor/contratos";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZipArchive } from "archiver";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { Piscina } from "piscina";

import { converterLote } from "./conversao.js";
import { csvRelacao, csvResultado, filtrarLog, lerLog } from "./csvWeb.js";
import { receberEnvio, tetoRequisicao, type ParteEnvio } from "./envio.js";
import {
  atualizarContadores,
  bytesLivres,
  criarJob,
  hidratar,
  lerEstado,
  linhaRecusa,
  origensDoLote,
  persistir,
  publicarTexto,
  reconciliar,
  type Job,
  type RecusaDisco,
} from "./loteEstado.js";

export type ConfigServidor = {
  dirBase?: string;
  ttlHoras?: number;
  maxArquivos?: number;
  maxBytesArquivo?: number;
  maxBytesTotal?: number;
  maxArquivosLote?: number;
  maxBytesLote?: number;
  maxArquivosSelecao?: number;
  maxLotesAtivos?: number;
  minBytesLivres?: number;
  overheadPorArquivo?: number;
  overheadEnvelope?: number;
  tamanhoBloco?: number;
  limiteBlocos?: number;
  intervaloVarredorMs?: number;
  antesDoBloco?: () => Promise<void>;
  aoSegurarEnvio?: () => Promise<void>;
  pastaWeb?: string;
};

const MOTIVOS_FALHA = new Set(["limite", "duplicado", "nao_json", "envio", "limite_lote"]);

export async function criarServidor(config: ConfigServidor = {}): Promise<FastifyInstance> {
  const dirBase = config.dirBase ?? path.join(tmpdir(), "conversor-lotes");
  const ttlMs = (config.ttlHoras ?? numeroEnv("LOTE_TTL_HORAS", 6)) * 60 * 60 * 1000;
  const limites = limitesDe(config);
  const tamanhoBloco = config.tamanhoBloco ?? 32;
  const jobs = new Map<string, Job>();
  const carregadorTsx = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const piscina = new Piscina({
    filename: fileURLToPath(new URL("./worker.ts", import.meta.url)),
    execArgv: ["--import", carregadorTsx],
    maxThreads: Math.max(1, numeroEnv("LOTE_WORKERS", 2)),
  });
  let cadeia: Promise<void> = Promise.resolve();
  let encerrado = false;

  const enfileirar = (trabalho: () => Promise<void>): void => {
    cadeia = cadeia.then(trabalho, trabalho).then(
      () => undefined,
      () => undefined,
    );
  };

  const opcoesConversao = (job: Job) => ({
    tamanhoBloco,
    limiteBlocos: config.limiteBlocos,
    antesDoBloco: config.antesDoBloco,
    ttlMs,
    encerrado: () => encerrado,
    aindaExiste: () => jobs.has(job.id),
  });

  const restaurar = (): void => {
    mkdirSync(dirBase, { recursive: true });
    for (const nome of readdirSync(dirBase)) {
      const dir = path.join(dirBase, nome);
      let diretorio = false;
      try {
        diretorio = statSync(dir).isDirectory();
      } catch {
        continue;
      }
      if (!diretorio) continue;
      const estado = lerEstado(dir);
      if (!estado) {
        rmSync(dir, { recursive: true, force: true });
        continue;
      }
      const job = hidratar(dir, estado);
      if (job.status !== "processando" && Date.parse(job.expiraEm) <= Date.now()) {
        rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (job.status === "recebendo" || job.status === "processando") reconciliar(job);
      jobs.set(job.id, job);
      if (job.status === "processando") enfileirar(() => converterLote(job, piscina, opcoesConversao(job)));
    }
  };

  restaurar();

  const app = Fastify({ logger: false });
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: limites.maxBytesArquivo, files: limites.maxArquivosEnvio + 1 },
  });

  const varredor = setInterval(() => {
    const agora = Date.now();
    for (const [id, job] of jobs) {
      if (job.status === "processando") continue;
      if (Date.parse(job.expiraEm) <= agora) {
        rmSync(job.dir, { recursive: true, force: true });
        jobs.delete(id);
      }
    }
  }, config.intervaloVarredorMs ?? 30_000);
  varredor.unref();
  app.addHook("onClose", async () => {
    encerrado = true;
    clearInterval(varredor);
    await piscina.destroy();
  });

  app.addHook("onRequest", async (requisicao, resposta) => {
    const caminho = requisicao.url.split("?")[0] ?? "";
    const marca = "/arquivos/";
    const indice = caminho.indexOf(marca);
    if (indice < 0) return;
    let nome = caminho.slice(indice + marca.length);
    try {
      nome = decodeURIComponent(nome);
    } catch {
      nome = caminho.slice(indice + marca.length);
    }
    if (nome.includes("/") || nome.includes("\\") || nome === ".." || nome === ".") {
      return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    }
  });

  app.get("/api/limites", async () => limites);

  app.post("/api/lotes", async (requisicao, resposta) => {
    const tipo = requisicao.headers["content-type"];
    if (typeof tipo === "string" && tipo.includes("multipart/form-data")) {
      return erro(resposta, 400, "lote_invalido", "Crie o lote sem arquivos e envie os JSON em seguida.");
    }
    const ativos = [...jobs.values()].filter((job) => job.status === "recebendo" || job.status === "processando").length;
    if (ativos >= limites.maxLotesAtivos) return erro(resposta, 413, "limite_excedido", fraseLotesAtivos(ativos));
    const id = randomUUID();
    const job = criarJob(id, path.join(dirBase, id), ttlMs);
    jobs.set(id, job);
    return resposta.code(202).send(aceiteSchema.parse({ id, limites }));
  });

  app.post("/api/lotes/:id/arquivos", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    const declarado = comprimento(requisicao.headers["content-length"]);
    if (declarado !== null && declarado > tetoRequisicao(limites)) {
      return erro(resposta, 413, "limite_excedido", "O envio passou do limite permitido.");
    }
    if (declarado !== null) {
      const livre = bytesLivres(dirBase);
      if (livre !== null && livre < declarado + limites.minBytesLivres) {
        return erro(resposta, 413, "limite_excedido", "Não há espaço livre suficiente no disco.");
      }
    }
    const partes = requisicao.parts() as AsyncIterable<ParteEnvio>;
    const resultado = await receberEnvio(job, partes, limites, ttlMs, config.aoSegurarEnvio);
    if (resultado.status === 200) return respostaEnvioSchema.parse(resultado.corpo);
    return erro(resposta, resultado.status, resultado.erro, resultado.mensagem);
  });

  app.post("/api/lotes/:id/fechar", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    if (job.emVoo.size > 0) return erro(resposta, 409, "lote_ocupado", FRASE_LOTE_OCUPADO);
    if (job.status !== "recebendo") return erro(resposta, 400, "lote_invalido", FRASE_FORA_DE_RECEBIMENTO);
    const falhas = lerFalhas(requisicao.body);
    if (!falhas) return erro(resposta, 400, "lote_invalido", "As falhas do fechamento são inválidas.");
    reconciliar(job);
    const origens = origensDoLote(job);
    for (const falha of falhas) {
      if (origens.has(falha.arquivo_origem)) continue;
      job.linhas.push(linhaRecusa(falha));
      origens.add(falha.arquivo_origem);
    }
    job.status = "processando";
    atualizarContadores(job);
    persistir(job);
    enfileirar(() => converterLote(job, piscina, opcoesConversao(job)));
    return resposta.code(202).send({ id: job.id });
  });

  app.delete("/api/lotes/:id", async (requisicao, resposta) => {
    const id = textoDe(requisicao.params, "id");
    const job = pegar(jobs, id);
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    if (job.status === "processando" || job.emVoo.size > 0) return erro(resposta, 409, "lote_ocupado", FRASE_LOTE_OCUPADO);
    jobs.delete(id);
    rmSync(job.dir, { recursive: true, force: true });
    return resposta.code(204).send();
  });

  app.get("/api/lotes/:id", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    return loteSchema.parse(visao(job));
  });

  app.get("/api/lotes/:id/linhas", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    const consulta = consultaLinhasSchema.safeParse({
      q: textoDe(requisicao.query, "q"),
      pagina: textoDe(requisicao.query, "pagina") || 1,
      tamanho: textoDe(requisicao.query, "tamanho") || 50,
    });
    if (!consulta.success) return erro(resposta, 400, "lote_invalido", "Paginação inválida.");
    const termo = consulta.data.q.toLocaleLowerCase("pt-BR");
    const filtradas = job.linhas.filter((linha) =>
      [linha.codigoDisciplina, linha.arquivo_origem, linha.arquivo_saida, linha.uuid, linha.status, linha.diagnostico]
        .join("\n")
        .toLocaleLowerCase("pt-BR")
        .includes(termo),
    );
    const inicio = (consulta.data.pagina - 1) * consulta.data.tamanho;
    return paginaLinhasSchema.parse({
      total: filtradas.length,
      pagina: consulta.data.pagina,
      tamanho: consulta.data.tamanho,
      linhas: filtradas.slice(inicio, inicio + consulta.data.tamanho).map((linha) => ({
        codigoDisciplina: linha.codigoDisciplina,
        uuid: linha.uuid,
        arquivo_origem: linha.arquivo_origem,
        arquivo_saida: linha.arquivo_saida,
        status: linha.status,
        diagnostico: linha.diagnostico,
      })),
    });
  });

  app.delete("/api/lotes/:id/linhas", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    if (job.status !== "concluido") return erro(resposta, 400, "lote_invalido", "O lote ainda não terminou.");
    const corpo = exclusaoLinhaSchema.safeParse(requisicao.body);
    if (!corpo.success) return erro(resposta, 400, "lote_invalido", "Informe o arquivo a excluir.");
    const pedido = corpo.data;
    const origens = origensDaExclusao(pedido, job.linhas);
    if (origens === "ausente") return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    const restantes = job.linhas.filter((linha) => !origens.has(linha.arquivo_origem));
    try {
      publicarTexto(path.join(job.saida, "resultado.csv"), csvResultado(restantes));
      publicarTexto(path.join(job.saida, "relacao.csv"), csvRelacao(restantes));
      let log = lerLog(path.join(job.saida, "erros.log"));
      for (const origem of origens) log = filtrarLog(log, origem);
      publicarTexto(path.join(job.saida, "erros.log"), log);
      for (const linha of job.linhas) {
        if (!origens.has(linha.arquivo_origem) || !linha.arquivo_saida) continue;
        const nome = nomeSeguro(linha.arquivo_saida);
        if (nome) rmSync(path.join(job.saida, nome), { force: true });
      }
    } catch {
      return erro(resposta, 400, "lote_invalido", "Não foi possível excluir o arquivo.");
    }
    job.linhas = restantes;
    job.entradas = job.entradas.filter((entrada) => !origens.has(entrada.arquivo_origem));
    atualizarContadores(job);
    persistir(job);
    return loteSchema.parse(visao(job));
  });

  app.get("/api/lotes/:id/arquivos/:nome", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    const nome = nomeSeguro(textoDe(requisicao.params, "nome"));
    if (!nome) return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    const alvo = path.resolve(job.saida, nome);
    const relativo = path.relative(path.resolve(job.saida), alvo);
    if (relativo.startsWith("..") || path.isAbsolute(relativo)) {
      return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    }
    try {
      if (!statSync(alvo).isFile()) return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
      const fluxo = createReadStream(alvo);
      const ascii = nome.replace(/[^\x20-\x7E]/g, "_").replaceAll('"', "");
      const tipo = nome.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8";
      resposta.header("Content-Type", tipo);
      resposta.header("X-Content-Type-Options", "nosniff");
      resposta.header("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
      return resposta.send(fluxo);
    } catch {
      return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    }
  });

  app.get("/api/lotes/:id/download", async (requisicao, resposta) => {
    const job = pegar(jobs, textoDe(requisicao.params, "id"));
    if (!job) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
    if (job.status !== "concluido") return erro(resposta, 400, "lote_invalido", "O lote ainda não terminou.");
    const pedidos = listaDe(requisicao.query, "arquivo");
    const nomesTxt = nomesDoZip(job, pedidos);
    if (pedidos.length > 0 && nomesTxt === null) return erro(resposta, 404, "arquivo_inexistente", "Arquivo inexistente.");
    const zip = new ZipArchive({ zlib: { level: 6 } });
    resposta.header("Content-Type", "application/zip");
    resposta.header("Content-Disposition", 'attachment; filename="lote.zip"');
    if (pedidos.length === 0) {
      zip.file(path.join(job.saida, "relacao.csv"), { name: "relacao.csv" });
      zip.file(path.join(job.saida, "resultado.csv"), { name: "resultado.csv" });
      zip.file(path.join(job.saida, "erros.log"), { name: "erros.log" });
    }
    for (const nome of nomesTxt ?? []) zip.file(path.join(job.saida, nome), { name: nome });
    void zip.finalize();
    return resposta.send(zip);
  });

  if (config.pastaWeb) {
    await app.register(fastifyStatic, { root: config.pastaWeb });
    app.setNotFoundHandler((requisicao, resposta) => {
      if (requisicao.url.startsWith("/api")) return erro(resposta, 404, "lote_inexistente", FRASE_LOTE_AUSENTE);
      return resposta.sendFile("index.html");
    });
  }

  return app;
}

function limitesDe(config: ConfigServidor): LimitesContrato {
  return {
    maxArquivosEnvio: config.maxArquivos ?? numeroEnv("LOTE_MAX_ARQUIVOS", LIMITES_PADRAO.maxArquivosEnvio),
    maxBytesEnvio: config.maxBytesTotal ?? numeroEnv("LOTE_MAX_BYTES_TOTAL", LIMITES_PADRAO.maxBytesEnvio),
    maxBytesArquivo: config.maxBytesArquivo ?? numeroEnv("LOTE_MAX_BYTES_ARQUIVO", LIMITES_PADRAO.maxBytesArquivo),
    maxArquivosLote: config.maxArquivosLote ?? numeroEnv("LOTE_MAX_ARQUIVOS_LOTE", LIMITES_PADRAO.maxArquivosLote),
    maxBytesLote: config.maxBytesLote ?? numeroEnv("LOTE_MAX_BYTES_LOTE", LIMITES_PADRAO.maxBytesLote),
    maxArquivosSelecao: config.maxArquivosSelecao ?? numeroEnv("LOTE_MAX_ARQUIVOS_SELECAO", LIMITES_PADRAO.maxArquivosSelecao),
    maxLotesAtivos: config.maxLotesAtivos ?? numeroEnv("LOTE_MAX_ATIVOS", LIMITES_PADRAO.maxLotesAtivos),
    minBytesLivres: config.minBytesLivres ?? numeroEnv("LOTE_ESPACO_LIVRE_MINIMO", LIMITES_PADRAO.minBytesLivres),
    overheadPorArquivo: config.overheadPorArquivo ?? numeroEnv("LOTE_OVERHEAD_POR_ARQUIVO", LIMITES_PADRAO.overheadPorArquivo),
    overheadEnvelope: config.overheadEnvelope ?? numeroEnv("LOTE_OVERHEAD_ENVELOPE", LIMITES_PADRAO.overheadEnvelope),
  };
}

function lerFalhas(corpo: unknown): RecusaDisco[] | null {
  if (corpo == null || corpo === "") return [];
  if (typeof corpo !== "object") return null;
  if (!("falhas" in corpo) || corpo.falhas === undefined) return [];
  if (!Array.isArray(corpo.falhas)) return null;
  const falhas: RecusaDisco[] = [];
  for (const item of corpo.falhas) {
    if (typeof item !== "object" || item === null) return null;
    const origem = "arquivo_origem" in item && typeof item.arquivo_origem === "string" ? item.arquivo_origem : "";
    const motivo = "motivo" in item && typeof item.motivo === "string" ? item.motivo : "";
    const diagnostico = "diagnostico" in item && typeof item.diagnostico === "string" ? item.diagnostico : "";
    if (!origem || origem.includes("/") || origem.includes("\\") || !MOTIVOS_FALHA.has(motivo)) return null;
    falhas.push({ arquivo_origem: origem, motivo, diagnostico });
  }
  return falhas;
}

function visao(job: Job) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processados: job.processados,
    contagens: job.contagens,
    expiraEm: job.expiraEm,
  };
}

function pegar(jobs: Map<string, Job>, id: string): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status !== "processando" && Date.parse(job.expiraEm) <= Date.now()) {
    rmSync(job.dir, { recursive: true, force: true });
    jobs.delete(id);
    return undefined;
  }
  return job;
}

function erro(resposta: FastifyReply, status: number, codigo: ErroApi["erro"], mensagem: string) {
  return resposta.code(status).send(erroApiSchema.parse({ erro: codigo, mensagem }));
}

function origensDaExclusao(
  pedido: { todos: true } | { arquivo_origem: string },
  linhas: readonly { arquivo_origem: string }[],
): Set<string> | "ausente" {
  if ("todos" in pedido) return new Set(linhas.map((linha) => linha.arquivo_origem));
  if (!linhas.some((linha) => linha.arquivo_origem === pedido.arquivo_origem)) return "ausente";
  return new Set([pedido.arquivo_origem]);
}

function nomeSeguro(nome: string): string | null {
  if (!nome || nome === "." || nome === "..") return null;
  if (nome.includes("/") || nome.includes("\\") || nome.includes("\0")) return null;
  if (path.basename(nome) !== nome) return null;
  return nome;
}

function nomesDoZip(job: Job, pedidos: readonly string[]): string[] | null {
  const gerados = job.linhas.flatMap((linha) => (linha.arquivo_saida ? [linha.arquivo_saida] : []));
  if (pedidos.length === 0) return gerados;
  const permitidos = new Set(gerados);
  const nomes: string[] = [];
  for (const pedido of pedidos) {
    const seguro = nomeSeguro(pedido);
    if (!seguro || !permitidos.has(seguro)) return null;
    nomes.push(seguro);
  }
  return nomes;
}

function listaDe(valor: unknown, nome: string): string[] {
  if (typeof valor !== "object" || valor === null || !(nome in valor)) return [];
  const campo = (valor as Record<string, unknown>)[nome];
  if (typeof campo === "string") return campo === "" ? [] : [campo];
  if (!Array.isArray(campo)) return [];
  return campo.filter((item): item is string => typeof item === "string" && item !== "");
}

function textoDe(valor: unknown, nome: string): string {
  if (typeof valor !== "object" || valor === null || !(nome in valor)) return "";
  const campo = (valor as Record<string, unknown>)[nome];
  return typeof campo === "string" ? campo : "";
}

function comprimento(valor: string | string[] | undefined): number | null {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (!bruto) return null;
  const numero = Number(bruto);
  return Number.isFinite(numero) ? numero : null;
}

function numeroEnv(nome: string, padrao: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}
