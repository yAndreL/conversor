import { LIMITES_PADRAO, limitesSchema, type LimitesContrato } from "@conversor/contratos";

import type { FalhaPagina } from "./selecao.js";

export type Contagens = {
  convertidos: number;
  erros: number;
  sem_codigo: number;
  codigos_repetidos: number;
  orfaos: number;
};

export type StatusLinha = "convertendo" | "convertido" | "sem_codigo" | "erro";

export type Lote = {
  id: string;
  status: "recebendo" | "processando" | "concluido" | "erro";
  total: number;
  processados: number;
  contagens: Contagens;
  expiraEm: string;
};

export type Linha = {
  codigoDisciplina: string;
  uuid: string;
  arquivo_origem: string;
  arquivo_saida: string;
  status: StatusLinha;
  diagnostico?: string;
};

export class ErroCliente extends Error {
  readonly codigo: string;
  readonly status: number;

  readonly mensagem: string;

  constructor(status: number, codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroCliente";
    this.status = status;
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}

export async function obterLimites(): Promise<LimitesContrato> {
  const resposta = await fetch("/api/limites");
  const corpo = await lerJson<unknown>(resposta);
  const lido = limitesSchema.safeParse(corpo);
  if (!lido.success) return { ...LIMITES_PADRAO };
  return lido.data;
}

export async function criarLote(): Promise<{ id: string }> {
  const resposta = await fetch("/api/lotes", { method: "POST" });
  return lerJson<{ id: string }>(resposta);
}

export async function enviarEnvio(id: string, envioId: string, arquivos: readonly File[]): Promise<void> {
  const corpo = new FormData();
  corpo.append("envioId", envioId);
  for (const arquivo of arquivos) corpo.append("arquivos", arquivo, arquivo.name);
  const resposta = await fetch(`/api/lotes/${id}/arquivos`, { method: "POST", body: corpo });
  await lerJson(resposta);
}

export async function fecharLote(id: string, falhas: readonly FalhaPagina[]): Promise<{ id: string }> {
  try {
    return await pedirFechar(id, falhas);
  } catch (falha: unknown) {
    if (falha instanceof ErroCliente && falha.codigo === "lote_ocupado") return pedirFechar(id, falhas);
    throw falha;
  }
}

export async function descartarLote(id: string): Promise<void> {
  const resposta = await fetch(`/api/lotes/${id}`, { method: "DELETE" });
  if (resposta.ok) return;
  await lerJson(resposta);
}

export async function obterLote(id: string): Promise<Lote> {
  const resposta = await fetch(`/api/lotes/${id}`);
  return lerJson<Lote>(resposta);
}

export async function excluirArquivo(id: string, arquivoOrigem: string): Promise<Lote> {
  return pedirExclusao(id, { arquivo_origem: arquivoOrigem });
}

export async function excluirArquivosProcessados(id: string): Promise<Lote> {
  return pedirExclusao(id, { todos: true });
}

async function pedirExclusao(id: string, corpo: { arquivo_origem: string } | { todos: true }): Promise<Lote> {
  const resposta = await fetch(`/api/lotes/${id}/linhas`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return lerJson<Lote>(resposta);
}

export async function obterLinhas(
  id: string,
  texto: string,
  pagina: number,
): Promise<{ total: number; pagina: number; tamanho: number; linhas: Linha[] }> {
  const consulta = new URLSearchParams({ q: texto, pagina: String(pagina), tamanho: "200" });
  const resposta = await fetch(`/api/lotes/${id}/linhas?${consulta.toString()}`);
  return lerJson(resposta);
}

export async function baixarLote(id: string): Promise<void> {
  await baixarBlob(`/api/lotes/${id}/download`);
}

export async function baixarArquivos(id: string, nomes: readonly string[]): Promise<void> {
  const consulta = new URLSearchParams();
  for (const nome of nomes) consulta.append("arquivo", nome);
  await baixarBlob(`/api/lotes/${id}/download?${consulta.toString()}`);
}

async function pedirFechar(id: string, falhas: readonly FalhaPagina[]): Promise<{ id: string }> {
  const resposta = await fetch(`/api/lotes/${id}/fechar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ falhas }),
  });
  return lerJson(resposta);
}

async function baixarBlob(url: string): Promise<void> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    await lerJson(resposta);
    return;
  }
  const blob = await resposta.blob();
  const endereco = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = endereco;
  ancora.download = "lote.zip";
  document.body.appendChild(ancora);
  ancora.click();
  ancora.remove();
  URL.revokeObjectURL(endereco);
}

async function lerJson<T>(resposta: Response): Promise<T> {
  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch (falha: unknown) {
    if (!resposta.ok) throw new ErroCliente(resposta.status, "lote_invalido", "Falha na API.");
    throw falha;
  }
  if (!resposta.ok) {
    const erro = corpo && typeof corpo === "object" ? (corpo as { erro?: string; mensagem?: string }) : {};
    throw new ErroCliente(resposta.status, erro.erro || "lote_invalido", erro.mensagem || "Falha na API.");
  }
  return corpo as T;
}
