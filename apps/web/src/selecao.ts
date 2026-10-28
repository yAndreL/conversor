import {
  FRASE_DUPLICADO,
  FRASE_NAO_JSON,
  formatarInteiro,
  formatarTamanho,
  fraseArquivoGrande,
  ordenarPorCodePoint,
} from "@conversor/contratos";

export type MotivoFalha = "limite" | "duplicado" | "nao_json" | "envio" | "limite_lote";

export type FalhaPagina = {
  arquivo_origem: string;
  motivo: MotivoFalha;
  diagnostico: string;
};

export type FatiaEnvio = {
  envioId: string;
  arquivos: File[];
};

export type SelecaoSeparada = {
  enviar: File[];
  falhas: FalhaPagina[];
};

export function separarSelecao(arquivos: readonly File[], maxBytesArquivo: number): SelecaoSeparada {
  const vistos = new Map<string, number>();
  const enviar: File[] = [];
  const falhas: FalhaPagina[] = [];
  for (const arquivo of arquivos) {
    const nome = arquivo.name;
    const ocorrencia = (vistos.get(nome) ?? 0) + 1;
    vistos.set(nome, ocorrencia);
    if (ocorrencia > 1) {
      falhas.push({
        arquivo_origem: `${nome}#${ocorrencia}`,
        motivo: "duplicado",
        diagnostico: FRASE_DUPLICADO,
      });
      continue;
    }
    if (!nome.endsWith(".json")) {
      falhas.push({ arquivo_origem: nome, motivo: "nao_json", diagnostico: FRASE_NAO_JSON });
      continue;
    }
    if (arquivo.size > maxBytesArquivo) {
      falhas.push({
        arquivo_origem: nome,
        motivo: "limite",
        diagnostico: fraseArquivoGrande(maxBytesArquivo),
      });
      continue;
    }
    enviar.push(arquivo);
  }
  return { enviar, falhas };
}

export function montarEnvios(
  arquivos: readonly File[],
  limites: { maxArquivosEnvio: number; maxBytesEnvio: number },
): File[][] {
  const ordenados = ordenarPorCodePoint(arquivos, (arquivo) => arquivo.name);
  const envios: File[][] = [];
  let atual: File[] = [];
  let bytes = 0;
  for (const arquivo of ordenados) {
    const cabeQuantidade = atual.length < limites.maxArquivosEnvio;
    const cabeBytes = atual.length === 0 || bytes + arquivo.size <= limites.maxBytesEnvio;
    if (!cabeQuantidade || !cabeBytes) {
      if (atual.length > 0) envios.push(atual);
      atual = [];
      bytes = 0;
    }
    atual.push(arquivo);
    bytes += arquivo.size;
  }
  if (atual.length > 0) envios.push(atual);
  return envios;
}

export function montarFatias(
  arquivos: readonly File[],
  limites: { maxArquivosEnvio: number; maxBytesEnvio: number },
): FatiaEnvio[] {
  return montarEnvios(arquivos, limites).map((grupo) => ({
    envioId: crypto.randomUUID(),
    arquivos: grupo,
  }));
}

export function contarArquivos(fatias: readonly { arquivos: readonly File[] }[]): number {
  return fatias.reduce((soma, fatia) => soma + fatia.arquivos.length, 0);
}

export function textoResumo(quantidade: number, bytes: number, envios: number): string {
  const rotuloEnvio = envios === 1 ? "1 envio" : `${formatarInteiro(envios)} envios`;
  return `${formatarInteiro(quantidade)} arquivos, ${formatarTamanho(bytes)}, ${rotuloEnvio}`;
}

export function textoRetidos(quantidadeArquivos: number, quantidadeEnvios: number): string {
  const arquivos =
    quantidadeArquivos === 1
      ? "1 arquivo não entrou."
      : `${formatarInteiro(quantidadeArquivos)} arquivos não entraram.`;
  const envios = quantidadeEnvios >= 2 ? "esses envios" : "esse envio";
  return `${arquivos} Reenvie ${envios} ou feche com o que chegou.`;
}

export function textoEnvio(atual: number, total: number): string {
  return `Enviando ${formatarInteiro(atual)} de ${formatarInteiro(total)}`;
}

export function textoConversao(processados: number, total: number): string {
  return `Convertendo ${formatarInteiro(processados)} de ${formatarInteiro(total)}`;
}

export function textoPagina(pagina: number, paginas: number): string {
  return `Página ${formatarInteiro(pagina)} de ${formatarInteiro(paginas)}`;
}
