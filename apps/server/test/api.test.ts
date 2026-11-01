import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

import { converterPasta } from "@conversor/core";

import { criarServidor, type ConfigServidor } from "../src/servidor.js";

const pastas: string[] = [];
const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

function pacote(arquivos: Array<{ nome: string; conteudo: string }>, envioId = randomUUID()): { corpo: string; tipo: string; envioId: string } {
  const limite = "----LimiteConversor";
  const partes = [
    [`--${limite}`, 'Content-Disposition: form-data; name="envioId"', "", envioId].join("\r\n"),
    ...arquivos.map((arquivo) =>
      [
        `--${limite}`,
        `Content-Disposition: form-data; name="arquivos"; filename="${arquivo.nome}"`,
        "Content-Type: application/json",
        "",
        arquivo.conteudo,
      ].join("\r\n"),
    ),
  ];
  return { corpo: `${partes.join("\r\n")}\r\n--${limite}--\r\n`, tipo: `multipart/form-data; boundary=${limite}`, envioId };
}

function jsonDe(codigo: string, texto: string): string {
  return JSON.stringify({ codigoDisciplina: codigo, blocks: [{ type: "paragraph", html: texto }] });
}

type App = {
  inject: (opcoes: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) => Promise<{
    statusCode: number;
    body: string;
    json: () => unknown;
    headers: Record<string, unknown>;
  }>;
  close: () => Promise<void>;
};

async function criarApp(opcoes: ConfigServidor = {}): Promise<{ app: App; dirBase: string }> {
  const dirBase = opcoes.dirBase ?? mkdtempSync(path.join(tmpdir(), "lotes-"));
  pastas.push(dirBase);
  const app = (await criarServidor({ ttlHoras: 1, ...opcoes, dirBase })) as App;
  apps.push(app);
  return { app, dirBase };
}

async function soltar(app: App): Promise<void> {
  const indice = apps.indexOf(app);
  await app.close();
  if (indice >= 0) apps.splice(indice, 1);
}

async function criarLote(app: App): Promise<string> {
  const criado = await app.inject({ method: "POST", url: "/api/lotes" });
  expect(criado.statusCode).toBe(202);
  return (criado.json() as { id: string }).id;
}

async function enviar(app: App, id: string, arquivos: Array<{ nome: string; conteudo: string }>, envioId = randomUUID()) {
  const envio = pacote(arquivos, envioId);
  const resposta = await app.inject({
    method: "POST",
    url: `/api/lotes/${id}/arquivos`,
    payload: envio.corpo,
    headers: { "content-type": envio.tipo },
  });
  return { resposta, envioId };
}

async function fechar(app: App, id: string, falhas: Array<{ arquivo_origem: string; motivo: string; diagnostico: string }> = []) {
  return app.inject({ method: "POST", url: `/api/lotes/${id}/fechar`, payload: { falhas } });
}

async function esperarConclusao(app: App, id: string): Promise<string> {
  let status = "";
  for (let tentativa = 0; tentativa < 80 && status !== "concluido" && status !== "erro"; tentativa += 1) {
    const consulta = await app.inject({ method: "GET", url: `/api/lotes/${id}` });
    status = (consulta.json() as { status: string }).status;
    if (status !== "concluido" && status !== "erro") await new Promise((resolver) => setTimeout(resolver, 50));
  }
  return status;
}

async function converter(app: App, arquivos: Array<{ nome: string; conteudo: string }>, falhas: Array<{ arquivo_origem: string; motivo: string; diagnostico: string }> = []) {
  const id = await criarLote(app);
  if (arquivos.length > 0) expect((await enviar(app, id, arquivos)).resposta.statusCode).toBe(200);
  expect((await fechar(app, id, falhas)).statusCode).toBe(202);
  expect(await esperarConclusao(app, id)).toBe("concluido");
  return id;
}

function nomesDisco(dirBase: string, id: string): string[] {
  const entrada = path.join(dirBase, id, "entrada");
  if (!existsSync(entrada)) return [];
  return readdirSync(entrada).filter((nome) => nome.endsWith(".json"));
}

it("CW-01 cria o lote e só converte depois do fechamento", async () => {
  const { app } = await criarApp();
  const id = await criarLote(app);
  const loteAberto = (await app.inject({ method: "GET", url: `/api/lotes/${id}` })).json() as { status: string; arquivos?: unknown };
  expect(loteAberto.status).toBe("recebendo");
  expect(loteAberto).not.toHaveProperty("arquivos");
  const enviado = await enviar(app, id, [{ nome: "nota, ção.json", conteudo: jsonDe("Ação,#%", "Pela interface") }]);
  expect(enviado.resposta.statusCode).toBe(200);
  expect((await fechar(app, id)).statusCode).toBe(202);
  expect(await esperarConclusao(app, id)).toBe("concluido");
  const lote = (await app.inject({ method: "GET", url: `/api/lotes/${id}` })).json() as { arquivos?: unknown; status: string };
  expect(lote).not.toHaveProperty("arquivos");
  expect(lote.status).toBe("concluido");
  const linhas = await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?q=ção` });
  expect(linhas.statusCode).toBe(200);
  const pagina = linhas.json() as { linhas: Array<{ arquivo_saida: string; status: string; uuid: string; arquivo_origem: string }> };
  expect(pagina.linhas[0]?.arquivo_origem).toBe("nota, ção.json");
  expect(pagina.linhas[0]?.status).toBe("convertido");
  const nome = pagina.linhas[0]?.arquivo_saida ?? "";
  expect(nome).toBe(`${pagina.linhas[0]?.uuid}azAção,#%.txt`);
  const relacao = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/relacao.csv` });
  expect(relacao.statusCode).toBe(200);
  expect(relacao.headers["content-type"]).toContain("text/csv");
  expect(relacao.body).toBe(`codigoDisciplina,uuid\n"Ação,#%",${pagina.linhas[0]?.uuid ?? ""}\n`);
  const arquivo = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/${encodeURIComponent(nome)}` });
  expect(arquivo.statusCode).toBe(200);
  expect(arquivo.headers["content-type"]).toContain("text/plain");
  expect(arquivo.headers["x-content-type-options"]).toBe("nosniff");
  expect(arquivo.headers["content-disposition"]).toContain("filename*=");
  expect(arquivo.body).toContain("Pela interface");
  const zip = await app.inject({ method: "GET", url: `/api/lotes/${id}/download` });
  expect(zip.statusCode).toBe(200);
  expect(zip.headers["content-type"]).toContain("application/zip");
  expect(zip.body).toContain("relacao.csv");
});

it("download com arquivo devolve só os txt pedidos", async () => {
  const { app } = await criarApp();
  const id = await converter(app, [
    { nome: "um.json", conteudo: jsonDe("UM", "Um") },
    { nome: "dois.json", conteudo: jsonDe("DOIS", "Dois") },
  ]);
  const pagina = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: Array<{ arquivo_origem: string; arquivo_saida: string }>;
  };
  const escolhido = pagina.linhas.find((linha) => linha.arquivo_origem === "um.json")?.arquivo_saida ?? "";
  const outro = pagina.linhas.find((linha) => linha.arquivo_origem === "dois.json")?.arquivo_saida ?? "";
  const zip = await app.inject({ method: "GET", url: `/api/lotes/${id}/download?arquivo=${encodeURIComponent(escolhido)}` });
  expect(zip.statusCode).toBe(200);
  expect(zip.body).toContain(escolhido);
  expect(zip.body).not.toContain(outro);
  expect(zip.body).not.toContain("resultado.csv");
  expect(zip.body).not.toContain("relacao.csv");
  const estranho = await app.inject({ method: "GET", url: `/api/lotes/${id}/download?arquivo=fora.txt` });
  expect(estranho.statusCode).toBe(404);
});

it("exclui uma linha concluida e apaga o txt", async () => {
  const { app } = await criarApp();
  const id = await converter(app, [
    { nome: "um.json", conteudo: jsonDe("UM", "Um") },
    { nome: "dois.json", conteudo: jsonDe("DOIS", "Dois") },
  ]);
  const antes = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: Array<{ arquivo_origem: string; arquivo_saida: string; uuid: string }>;
  };
  const removida = antes.linhas.find((linha) => linha.arquivo_origem === "um.json");
  const exclusao = await app.inject({ method: "DELETE", url: `/api/lotes/${id}/linhas`, payload: { arquivo_origem: "um.json" } });
  expect(exclusao.statusCode).toBe(200);
  expect((exclusao.json() as { total: number }).total).toBe(1);
  const depois = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: Array<{ arquivo_origem: string }>;
  };
  expect(depois.linhas.map((linha) => linha.arquivo_origem)).toEqual(["dois.json"]);
  const arquivo = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/${encodeURIComponent(removida?.arquivo_saida ?? "")}` });
  expect(arquivo.statusCode).toBe(404);
  const relacao = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/relacao.csv` });
  expect(relacao.body).not.toContain(removida?.uuid ?? "ausente");
  expect(relacao.body).toContain("DOIS");
  const ausente = await app.inject({ method: "DELETE", url: `/api/lotes/${id}/linhas`, payload: { arquivo_origem: "um.json" } });
  expect(ausente.statusCode).toBe(404);
});

it("exclui todas as linhas concluidas e apaga os txt", async () => {
  const { app } = await criarApp();
  const id = await converter(app, [
    { nome: "um.json", conteudo: jsonDe("UM", "Um") },
    { nome: "dois.json", conteudo: jsonDe("DOIS", "Dois") },
  ]);
  const antes = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: Array<{ arquivo_saida: string }>;
  };
  const exclusao = await app.inject({ method: "DELETE", url: `/api/lotes/${id}/linhas`, payload: { todos: true } });
  expect(exclusao.statusCode).toBe(200);
  expect((exclusao.json() as { total: number; contagens: { convertidos: number } }).total).toBe(0);
  expect((exclusao.json() as { contagens: { convertidos: number } }).contagens.convertidos).toBe(0);
  const depois = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: unknown[];
  };
  expect(depois.linhas).toEqual([]);
  for (const linha of antes.linhas) {
    const arquivo = await app.inject({
      method: "GET",
      url: `/api/lotes/${id}/arquivos/${encodeURIComponent(linha.arquivo_saida)}`,
    });
    expect(arquivo.statusCode).toBe(404);
  }
  const relacao = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/relacao.csv` });
  expect(relacao.body).toBe("codigoDisciplina,uuid\n");
  const resultado = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/resultado.csv` });
  expect(resultado.body).toBe("codigoDisciplina,uuid,arquivo_origem,arquivo_saida,status\n");
});

it("CW-02 recusa o que não é json e guarda json inválido sem ler o documento", async () => {
  const { app, dirBase } = await criarApp();
  const multipart = await app.inject({
    method: "POST",
    url: "/api/lotes",
    payload: "--Limite--\r\n",
    headers: { "content-type": "multipart/form-data; boundary=Limite" },
  });
  expect(multipart.statusCode).toBe(400);
  expect((multipart.json() as { erro: string }).erro).toBe("lote_invalido");
  const id = await criarLote(app);
  const misto = await enviar(app, id, [
    { nome: "nota.json", conteudo: jsonDe("ADS", "texto") },
    { nome: "nota.txt", conteudo: "oi" },
  ]);
  expect(misto.resposta.statusCode).toBe(200);
  const corpo = misto.resposta.json() as { aceitos: number; recusados: Array<{ arquivo_origem: string; motivo: string }> };
  expect(corpo.aceitos).toBe(1);
  expect(corpo.recusados).toEqual([expect.objectContaining({ arquivo_origem: "nota.txt", motivo: "nao_json" })]);
  const discos = nomesDisco(dirBase, id);
  expect(discos).toHaveLength(1);
  expect(discos[0]).not.toBe("nota.json");
  const invalido = await enviar(app, id, [{ nome: "quebrado.json", conteudo: "{" }]);
  expect(invalido.resposta.statusCode).toBe(200);
  const linhas = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=50` })).json() as {
    linhas: Array<{ arquivo_origem: string; status: string; diagnostico: string }>;
  };
  const quebrado = linhas.linhas.find((linha) => linha.arquivo_origem === "quebrado.json");
  expect(quebrado).toMatchObject({ status: "convertendo", diagnostico: "" });
});

it("CW-03 e CW-15 estouro não move o envio e o arquivo anterior fica", async () => {
  const { app, dirBase } = await criarApp({ maxBytesArquivo: 8 });
  const id = await criarLote(app);
  expect((await enviar(app, id, [{ nome: "ok.json", conteudo: "{}" }])).resposta.statusCode).toBe(200);
  const antes = nomesDisco(dirBase, id);
  expect(antes).toHaveLength(1);
  const grande = await enviar(app, id, [{ nome: "grande.json", conteudo: jsonDe("ADS001", "Pela interface") }]);
  expect(grande.resposta.statusCode).toBe(413);
  expect((grande.resposta.json() as { erro: string }).erro).toBe("limite_excedido");
  expect(nomesDisco(dirBase, id)).toEqual(antes);
  expect(readdirSync(path.join(dirBase, id, "staging"))).toEqual([]);
});

it("CW-15 Content-Length acima da margem não cria staging e a soma exata entra", async () => {
  const estreito = await criarApp({ maxBytesTotal: 8, overheadPorArquivo: 0, overheadEnvelope: 0 });
  const idEstreito = await criarLote(estreito.app);
  const estouro = await enviar(estreito.app, idEstreito, [{ nome: "a.json", conteudo: "{}" }]);
  expect(estouro.resposta.statusCode).toBe(413);
  expect(readdirSync(path.join(estreito.dirBase, idEstreito, "staging"))).toEqual([]);

  const conteudoA = "{}";
  const conteudoB = "[]";
  const { app, dirBase } = await criarApp({ maxBytesTotal: Buffer.byteLength(conteudoA) + Buffer.byteLength(conteudoB) });
  const id = await criarLote(app);
  const enviado = await enviar(app, id, [
    { nome: "a.json", conteudo: conteudoA },
    { nome: "b.json", conteudo: conteudoB },
  ]);
  expect(enviado.resposta.statusCode).toBe(200);
  expect(nomesDisco(dirBase, id)).toHaveLength(2);
  const seguinte = await enviar(app, id, [{ nome: "c.json", conteudo: "{}" }]);
  expect(seguinte.resposta.statusCode).toBe(200);
});

it("CW-06 e CW-08 nome perigoso e lote ausente", async () => {
  const { app } = await criarApp();
  const ausente = await app.inject({ method: "GET", url: "/api/lotes/nao-existe" });
  expect(ausente.statusCode).toBe(404);
  expect((ausente.json() as { erro: string }).erro).toBe("lote_inexistente");
  const id = await converter(app, [{ nome: "a#b%.json", conteudo: jsonDe("Ação,#%", "Pela interface") }]);
  const linhas = ((await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas` })).json() as { linhas: Array<{ arquivo_saida: string }> }).linhas;
  const nome = linhas[0]?.arquivo_saida ?? "";
  const baixado = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/${encodeURIComponent(nome)}` });
  expect(baixado.statusCode).toBe(200);
  const travessia = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/${encodeURIComponent("../segredo.txt")}` });
  expect(travessia.statusCode).toBe(404);
  expect((travessia.json() as { erro: string }).erro).toBe("arquivo_inexistente");
});

it("CW-08 dois lotes ficam isolados, o TTL expira e a fila segura o segundo", async () => {
  const { app } = await criarApp();
  const idA = await converter(app, [{ nome: "a.json", conteudo: jsonDe("AAA", "texto-aaa") }]);
  const idB = await converter(app, [{ nome: "b.json", conteudo: jsonDe("BBB", "texto-bbb") }]);
  const nomeA = ((await app.inject({ method: "GET", url: `/api/lotes/${idA}/linhas` })).json() as { linhas: Array<{ arquivo_saida: string }> }).linhas[0]?.arquivo_saida;
  const corpoA = await app.inject({ method: "GET", url: `/api/lotes/${idA}/arquivos/${encodeURIComponent(nomeA ?? "")}` });
  expect(corpoA.body).toContain("texto-aaa");
  expect(corpoA.body).not.toContain("texto-bbb");

  const curto = await criarApp({ ttlHoras: 1 / 3_600_000 });
  const id = await criarLote(curto.app);
  await new Promise((resolver) => setTimeout(resolver, 30));
  const expirado = await curto.app.inject({ method: "GET", url: `/api/lotes/${id}` });
  expect(expirado.statusCode).toBe(404);

  let liberar: () => void = () => undefined;
  const trava = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let avisar: () => void = () => undefined;
  const pronto = new Promise<void>((resolver) => {
    avisar = resolver;
  });
  let avisou = false;
  const fila = await criarApp({
    antesDoBloco: async () => {
      if (avisou) return;
      avisou = true;
      avisar();
      await trava;
    },
  });
  const primeiro = await criarLote(fila.app);
  expect((await enviar(fila.app, primeiro, [{ nome: "a.json", conteudo: jsonDe("AAA", "a") }])).resposta.statusCode).toBe(200);
  expect((await fechar(fila.app, primeiro)).statusCode).toBe(202);
  await pronto;
  const segundo = await criarLote(fila.app);
  expect((await enviar(fila.app, segundo, [{ nome: "b.json", conteudo: jsonDe("BBB", "b") }])).resposta.statusCode).toBe(200);
  expect((await fechar(fila.app, segundo)).statusCode).toBe(202);
  const visao = (await fila.app.inject({ method: "GET", url: `/api/lotes/${segundo}` })).json() as { status: string; processados: number; total: number };
  expect(visao).toMatchObject({ status: "processando", processados: 0, total: 1 });
  liberar();
  expect(await esperarConclusao(fila.app, segundo)).toBe("concluido");
});

it("CW-11 repetir envioId não duplica e o pedido concorrente recebe 409", async () => {
  const { app, dirBase } = await criarApp();
  const id = await criarLote(app);
  const primeiro = await enviar(app, id, [{ nome: "nota.json", conteudo: jsonDe("ADS", "texto") }]);
  expect(primeiro.resposta.statusCode).toBe(200);
  const discos = nomesDisco(dirBase, id);
  const repetido = await enviar(app, id, [{ nome: "nota.json", conteudo: jsonDe("ADS", "texto") }], primeiro.envioId);
  expect(repetido.resposta.statusCode).toBe(200);
  expect(repetido.resposta.json()).toEqual(primeiro.resposta.json());
  expect(nomesDisco(dirBase, id)).toEqual(discos);
  expect((repetido.resposta.json() as { recusados: Array<{ motivo: string }> }).recusados.some((item) => item.motivo === "duplicado")).toBe(false);

  let liberar: () => void = () => undefined;
  const trava = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let avisar: () => void = () => undefined;
  const pronto = new Promise<void>((resolver) => {
    avisar = resolver;
  });
  const concorrente = await criarApp({
    aoSegurarEnvio: async () => {
      avisar();
      await trava;
    },
  });
  const lote = await criarLote(concorrente.app);
  const envioId = randomUUID();
  const corpo = pacote([{ nome: "a.json", conteudo: jsonDe("A", "a") }], envioId);
  const pedido = concorrente.app.inject({ method: "POST", url: `/api/lotes/${lote}/arquivos`, payload: corpo.corpo, headers: { "content-type": corpo.tipo } });
  await pronto;
  const segundo = await concorrente.app.inject({ method: "POST", url: `/api/lotes/${lote}/arquivos`, payload: corpo.corpo, headers: { "content-type": corpo.tipo } });
  expect(segundo.statusCode).toBe(409);
  expect((segundo.json() as { erro: string }).erro).toBe("envio_em_andamento");
  const fechamento = await fechar(concorrente.app, lote);
  expect(fechamento.statusCode).toBe(409);
  expect(((await concorrente.app.inject({ method: "GET", url: `/api/lotes/${lote}` })).json() as { status: string }).status).toBe("recebendo");
  liberar();
  expect((await pedido).statusCode).toBe(200);
  expect((await fechar(concorrente.app, lote)).statusCode).toBe(202);
  expect(await esperarConclusao(concorrente.app, lote)).toBe("concluido");
  const deNovo = await concorrente.app.inject({ method: "POST", url: `/api/lotes/${lote}/arquivos`, payload: corpo.corpo, headers: { "content-type": corpo.tipo } });
  expect(deNovo.statusCode).toBe(200);
  const novo = pacote([{ nome: "b.json", conteudo: jsonDe("B", "b") }]);
  const depois = await concorrente.app.inject({ method: "POST", url: `/api/lotes/${lote}/arquivos`, payload: novo.corpo, headers: { "content-type": novo.tipo } });
  expect(depois.statusCode).toBe(400);
});

it("CW-12 a segunda ocorrência entra no fechamento como duplicado", async () => {
  const { app } = await criarApp();
  const id = await criarLote(app);
  expect((await enviar(app, id, [{ nome: "nota.json", conteudo: jsonDe("ADS", "texto") }])).resposta.statusCode).toBe(200);
  expect((await fechar(app, id, [{ arquivo_origem: "nota.json#2", motivo: "duplicado", diagnostico: "Já existe outro arquivo com o mesmo nome neste lote." }])).statusCode).toBe(202);
  expect(await esperarConclusao(app, id)).toBe("concluido");
  const resultado = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/resultado.csv` });
  expect(resultado.body).toContain("nota.json,");
  expect(resultado.body).toContain("nota.json#2,,erro");
  const log = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/erros.log` });
  expect(log.body).toContain("nota.json#2\tduplicado\t");
});

it("CW-15 o teto do lote recusa o envio inteiro e o tamanho exato entra", async () => {
  const { app } = await criarApp();
  const limites = (await app.inject({ method: "GET", url: "/api/limites" })).json() as {
    maxArquivosEnvio: number;
    maxBytesEnvio: number;
    maxBytesArquivo: number;
    maxArquivosLote: number;
    maxBytesLote: number;
    maxArquivosSelecao: number;
    overheadPorArquivo: number;
    overheadEnvelope: number;
  };
  expect(limites).toMatchObject({
    maxArquivosEnvio: 200,
    maxBytesEnvio: 536_870_912,
    maxBytesArquivo: 33_554_432,
    maxArquivosLote: 5000,
    maxBytesLote: 42_949_672_960,
    maxArquivosSelecao: 2500,
    overheadPorArquivo: 1024,
    overheadEnvelope: 8192,
  });

  const exato = await criarApp({ maxBytesArquivo: Buffer.byteLength("{}") });
  const idExato = await criarLote(exato.app);
  expect((await enviar(exato.app, idExato, [{ nome: "exato.json", conteudo: "{}" }])).resposta.statusCode).toBe(200);
  expect(nomesDisco(exato.dirBase, idExato)[0]).not.toBe("exato.json");

  const loteCheio = await criarApp({ maxArquivosLote: 2 });
  const idCheio = await criarLote(loteCheio.app);
  expect((await enviar(loteCheio.app, idCheio, [
    { nome: "a.json", conteudo: "{}" },
    { nome: "b.json", conteudo: "{}" },
  ])).resposta.statusCode).toBe(200);
  const terceiro = await enviar(loteCheio.app, idCheio, [{ nome: "c.json", conteudo: "{}" }]);
  expect(terceiro.resposta.statusCode).toBe(413);
  expect((terceiro.resposta.json() as { erro: string }).erro).toBe("limite_lote");
  expect(nomesDisco(loteCheio.dirBase, idCheio)).toHaveLength(2);

  const bytes = await criarApp({ maxBytesLote: 2 });
  const idBytes = await criarLote(bytes.app);
  expect((await enviar(bytes.app, idBytes, [{ nome: "a.json", conteudo: "{}" }])).resposta.statusCode).toBe(200);
  const extra = await enviar(bytes.app, idBytes, [{ nome: "b.json", conteudo: "{}" }]);
  expect(extra.resposta.statusCode).toBe(413);
  expect((extra.resposta.json() as { erro: string }).erro).toBe("limite_lote");
  expect(nomesDisco(bytes.dirBase, idBytes)).toHaveLength(1);

  const porEnvio = await criarApp({ maxArquivos: 2 });
  const idEnvio = await criarLote(porEnvio.app);
  expect((await enviar(porEnvio.app, idEnvio, [
    { nome: "a.json", conteudo: "{}" },
    { nome: "b.json", conteudo: "{}" },
  ])).resposta.statusCode).toBe(200);
  expect((await enviar(porEnvio.app, idEnvio, [{ nome: "c.json", conteudo: "{}" }])).resposta.statusCode).toBe(200);
  expect(nomesDisco(porEnvio.dirBase, idEnvio)).toHaveLength(3);
});

it("CW-16 e CW-17 a ordem de code points decide colisão e a sequência do csv", async () => {
  process.env.CONVERSOR_ATRASO_ORIGEM = "a.json";
  try {
    const { app } = await criarApp();
    const id = await converter(app, [
      { nome: "b.json", conteudo: jsonDe("BBB", "igual") },
      { nome: "a.json", conteudo: jsonDe("AAA", "igual") },
    ]);
    const linhas = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?tamanho=10` })).json() as {
      linhas: Array<{ arquivo_origem: string; status: string; diagnostico: string }>;
    };
    expect(linhas.linhas.map((linha) => linha.arquivo_origem)).toEqual(["a.json", "b.json"]);
    expect(linhas.linhas[0]?.status).toBe("convertido");
    expect(linhas.linhas[1]?.status).toBe("convertido");
    expect(linhas.linhas[1]?.diagnostico ?? "").not.toContain("mesmo txt");
  } finally {
    delete process.env.CONVERSOR_ATRASO_ORIGEM;
  }

  const ordem = await criarApp();
  const idOrdem = await converter(ordem.app, [
    { nome: "á.json", conteudo: jsonDe("C", "c") },
    { nome: "a.json", conteudo: jsonDe("B", "b") },
    { nome: "A.json", conteudo: jsonDe("A", "a") },
    { nome: "\uE000.json", conteudo: jsonDe("E", "e") },
    { nome: "\u{1F600}.json", conteudo: jsonDe("F", "f") },
  ]);
  const resultado = await ordem.app.inject({ method: "GET", url: `/api/lotes/${idOrdem}/arquivos/resultado.csv` });
  const origens = resultado.body
    .trim()
    .split("\n")
    .slice(1)
    .map((linha) => linha.split(",")[2] ?? "");
  expect(origens.indexOf("A.json")).toBeLessThan(origens.indexOf("a.json"));
  expect(origens.indexOf("a.json")).toBeLessThan(origens.indexOf("á.json"));
  expect(origens.indexOf("\uE000.json")).toBeLessThan(origens.indexOf("\u{1F600}.json"));
});

it("CW-19 fechar lote ausente ou já concluído", async () => {
  const { app } = await criarApp();
  const ausente = await fechar(app, randomUUID());
  expect(ausente.statusCode).toBe(404);
  expect((ausente.json() as { erro: string }).erro).toBe("lote_inexistente");
  const id = await converter(app, [{ nome: "a.json", conteudo: jsonDe("A", "a") }]);
  const deNovo = await fechar(app, id);
  expect(deNovo.statusCode).toBe(400);
  expect((deNovo.json() as { erro: string }).erro).toBe("lote_invalido");
});

it("CW-21 o apóstrofo fica só na origem do resultado e a CLI não prefixa", async () => {
  const { app } = await criarApp();
  const id = await converter(app, [
    { nome: "=nota.json", conteudo: jsonDe("-1", "menos") },
    { nome: "cmd.json", conteudo: jsonDe("=cmd", "comando") },
    { nome: "a\tb.json", conteudo: "{" },
  ]);
  const relacao = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/relacao.csv` });
  expect(relacao.body).toContain("\n-1,");
  expect(relacao.body).toContain("\n=cmd,");
  expect(relacao.body).not.toContain("'-1");
  expect(relacao.body).not.toContain("'=cmd");
  const resultado = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/resultado.csv` });
  expect(resultado.body).toContain("'=nota.json");
  const saida = (await app.inject({ method: "GET", url: `/api/lotes/${id}/linhas?q==nota` })).json() as {
    linhas: Array<{ arquivo_saida: string }>;
  };
  const nome = saida.linhas[0]?.arquivo_saida ?? "";
  expect(nome.endsWith(".txt")).toBe(true);
  expect(resultado.body).toContain(nome);
  expect(resultado.body).not.toContain(`'${nome}`);
  const zip = await app.inject({ method: "GET", url: `/api/lotes/${id}/download` });
  expect(zip.body).toContain(nome);
  const log = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/erros.log` });
  expect(log.body).toContain("a\\tb.json\tjson_invalido\t");
  expect(log.body).not.toContain("a\tb.json\tjson_invalido\t");

  const dir = mkdtempSync(path.join(tmpdir(), "cli-"));
  pastas.push(dir);
  const entrada = path.join(dir, "entrada");
  const saidaCli = path.join(dir, "saida");
  mkdirSync(entrada);
  writeFileSync(path.join(entrada, "cmd.json"), jsonDe("=cmd", "comando"));
  expect(converterPasta(entrada, saidaCli).codigoSaida).toBe(0);
  const relacaoCli = readFileSync(path.join(saidaCli, "relacao.csv"), "utf8");
  expect(relacaoCli).toContain("=cmd,");
  expect(relacaoCli).not.toContain("'=cmd");
});

it("CW-22 relacao traz só os convertidos na ordem de code points", async () => {
  const { app } = await criarApp();
  const id = await converter(app, [
    { nome: "b.json", conteudo: jsonDe("BBB", "b") },
    { nome: "a.json", conteudo: "{" },
    { nome: "c.json", conteudo: jsonDe("CCC", "c") },
  ]);
  const relacao = await app.inject({ method: "GET", url: `/api/lotes/${id}/arquivos/relacao.csv` });
  const linhas = relacao.body.trim().split("\n");
  expect(linhas[0]).toBe("codigoDisciplina,uuid");
  expect(linhas).toHaveLength(3);
  expect(linhas[1]?.startsWith("BBB,")).toBe(true);
  expect(linhas[2]?.startsWith("CCC,")).toBe(true);
});

it("CW-24 A.json e a.json viram dois nomes de disco", async () => {
  const { app, dirBase } = await criarApp();
  const id = await criarLote(app);
  const enviado = await enviar(app, id, [
    { nome: "A.json", conteudo: "{}" },
    { nome: "a.json", conteudo: "{}" },
  ]);
  expect(enviado.resposta.statusCode).toBe(200);
  const discos = nomesDisco(dirBase, id);
  expect(discos).toHaveLength(2);
  expect(discos).not.toContain("A.json");
  expect(discos).not.toContain("a.json");
  const manifesto = JSON.parse(readFileSync(path.join(dirBase, id, "meta", "envios", `${enviado.envioId}.json`), "utf8")) as {
    entradas: Array<{ arquivo_origem: string }>;
  };
  expect(manifesto.entradas.map((entrada) => entrada.arquivo_origem).sort()).toEqual(["A.json", "a.json"]);
});

it("CW-25 staging, pasta sem lote.json e retomada sem reconverter", async () => {
  const { app, dirBase } = await criarApp({ tamanhoBloco: 1, limiteBlocos: 1 });
  const id = await criarLote(app);
  const envioCom = randomUUID();
  const envioSem = randomUUID();
  const nomeDisco = `${randomUUID()}.json`;
  const pastaCom = path.join(dirBase, id, "staging", envioCom);
  const pastaSem = path.join(dirBase, id, "staging", envioSem);
  mkdirSync(pastaCom, { recursive: true });
  mkdirSync(pastaSem, { recursive: true });
  writeFileSync(path.join(pastaCom, nomeDisco), jsonDe("ADS", "texto"));
  writeFileSync(path.join(pastaSem, "lixo.json"), "{}");
  writeFileSync(
    path.join(pastaCom, "manifesto.json"),
    JSON.stringify({ aceitos: 1, recusados: [], entradas: [{ arquivo_origem: "nota.json", nomeDisco, bytes: 10 }] }),
  );
  expect((await fechar(app, id)).statusCode).toBe(202);
  expect(existsSync(pastaSem)).toBe(false);
  expect(existsSync(path.join(dirBase, id, "entrada", nomeDisco))).toBe(true);
  expect(existsSync(path.join(dirBase, id, "entrada", "lixo.json"))).toBe(false);

  const solto = await criarApp();
  mkdirSync(path.join(solto.dirBase, "sem-lote"));
  writeFileSync(path.join(solto.dirBase, "sem-lote", "solto.txt"), "x");
  await soltar(solto.app);
  const religado = await criarApp({ dirBase: solto.dirBase });
  expect(existsSync(path.join(religado.dirBase, "sem-lote"))).toBe(false);

  const recebendo = await criarApp();
  const idRecebendo = await criarLote(recebendo.app);
  expect((await enviar(recebendo.app, idRecebendo, [{ nome: "guarda.json", conteudo: jsonDe("ADS", "guarda") }])).resposta.statusCode).toBe(200);
  await soltar(recebendo.app);
  const voltou = await criarApp({ dirBase: recebendo.dirBase });
  const linhas = (await voltou.app.inject({ method: "GET", url: `/api/lotes/${idRecebendo}/linhas` })).json() as {
    linhas: Array<{ arquivo_origem: string }>;
  };
  expect(linhas.linhas.map((linha) => linha.arquivo_origem)).toContain("guarda.json");

  const parcial = await criarApp({ tamanhoBloco: 1, limiteBlocos: 1 });
  const idParcial = await criarLote(parcial.app);
  expect((await enviar(parcial.app, idParcial, [
    { nome: "a.json", conteudo: jsonDe("AAA", "primeiro") },
    { nome: "b.json", conteudo: jsonDe("BBB", "segundo") },
  ])).resposta.statusCode).toBe(200);
  expect((await fechar(parcial.app, idParcial)).statusCode).toBe(202);
  let processados = 0;
  for (let tentativa = 0; tentativa < 40 && processados < 1; tentativa += 1) {
    processados = ((await parcial.app.inject({ method: "GET", url: `/api/lotes/${idParcial}` })).json() as { processados: number }).processados;
    if (processados < 1) await new Promise((resolver) => setTimeout(resolver, 50));
  }
  expect(processados).toBeGreaterThanOrEqual(1);
  const pagina = (await parcial.app.inject({ method: "GET", url: `/api/lotes/${idParcial}/linhas?tamanho=10` })).json() as {
    linhas: Array<{ arquivo_origem: string; arquivo_saida: string; status: string }>;
  };
  const primeira = pagina.linhas.find((linha) => linha.arquivo_origem === "a.json");
  expect(primeira?.status).toBe("convertido");
  const txt = path.join(parcial.dirBase, idParcial, "saida", primeira?.arquivo_saida ?? "");
  writeFileSync(txt, `${readFileSync(txt, "utf8")}MARCA`);
  await soltar(parcial.app);
  const retomado = await criarApp({ dirBase: parcial.dirBase, tamanhoBloco: 1 });
  expect(await esperarConclusao(retomado.app, idParcial)).toBe("concluido");
  expect(readFileSync(txt, "utf8")).toContain("MARCA");
  const finais = (await retomado.app.inject({ method: "GET", url: `/api/lotes/${idParcial}/linhas?tamanho=10` })).json() as {
    linhas: Array<{ arquivo_origem: string; status: string }>;
  };
  expect(finais.linhas.find((linha) => linha.arquivo_origem === "b.json")?.status).toBe("convertido");
});

it("CW-14 e CW-21 descartar remove a pasta e o lote em conversão não expira", async () => {
  const { app, dirBase } = await criarApp();
  const id = await criarLote(app);
  expect((await enviar(app, id, [{ nome: "a.json", conteudo: jsonDe("A", "a") }])).resposta.statusCode).toBe(200);
  const descarte = await app.inject({ method: "DELETE", url: `/api/lotes/${id}` });
  expect(descarte.statusCode).toBe(204);
  expect(existsSync(path.join(dirBase, id))).toBe(false);

  const travado = await criarApp({ limiteBlocos: 0, intervaloVarredorMs: 20 });
  const idTravado = await criarLote(travado.app);
  expect((await enviar(travado.app, idTravado, [{ nome: "a.json", conteudo: jsonDe("A", "a") }])).resposta.statusCode).toBe(200);
  expect((await fechar(travado.app, idTravado)).statusCode).toBe(202);
  const loteJson = path.join(travado.dirBase, idTravado, "lote.json");
  const estado = JSON.parse(readFileSync(loteJson, "utf8")) as { expiraEm: string };
  estado.expiraEm = new Date(Date.now() - 1000).toISOString();
  writeFileSync(loteJson, JSON.stringify(estado));
  await soltar(travado.app);
  const retomado = await criarApp({ dirBase: travado.dirBase, limiteBlocos: 0, intervaloVarredorMs: 20 });
  await new Promise((resolver) => setTimeout(resolver, 40));
  const visao = await retomado.app.inject({ method: "GET", url: `/api/lotes/${idTravado}` });
  expect(visao.statusCode).toBe(200);
  expect((visao.json() as { status: string }).status).toBe("processando");
  expect(existsSync(path.join(travado.dirBase, idTravado))).toBe(true);
  const ocupado = await retomado.app.inject({ method: "DELETE", url: `/api/lotes/${idTravado}` });
  expect(ocupado.statusCode).toBe(409);
});
