export const LIMITES_PADRAO = {
  maxArquivosEnvio: 200,
  maxBytesEnvio: 536_870_912,
  maxBytesArquivo: 33_554_432,
  maxArquivosLote: 5000,
  maxBytesLote: 42_949_672_960,
  maxArquivosSelecao: 2500,
  maxLotesAtivos: 3,
  minBytesLivres: 1_073_741_824,
  overheadPorArquivo: 1024,
  overheadEnvelope: 8192,
} as const;

export const FRASE_DUPLICADO = "Já existe outro arquivo com o mesmo nome neste lote.";
export const FRASE_NAO_JSON = "O arquivo não é um JSON.";
export const FRASE_NOME_INVALIDO = "O nome do arquivo não pode ser gravado.";
export const FRASE_ENVIO = "Não foi possível enviar o arquivo.";
export const FRASE_LEITURA = "Não foi possível ler o arquivo.";
export const FRASE_COLISAO = "Outro arquivo deste lote já gerou o mesmo txt.";
export const FRASE_TELA_NAVEGADOR = "A imagem mostra a tela do navegador.";
export const FRASE_LOTE_OCUPADO = "Ainda há envio em andamento.";
export const FRASE_FORA_DE_RECEBIMENTO = "O lote não está recebendo arquivos.";
export const FRASE_LOTE_AUSENTE = "Lote inexistente ou expirado.";

export function maxBytesRequisicao(limites: {
  maxBytesEnvio: number;
  maxArquivosEnvio: number;
  overheadPorArquivo: number;
  overheadEnvelope: number;
}): number {
  return limites.maxBytesEnvio + limites.maxArquivosEnvio * limites.overheadPorArquivo + limites.overheadEnvelope;
}

export function formatarInteiro(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(valor);
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${formatarInteiro(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatarMedida(bytes, 1024)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${formatarMedida(bytes, 1024 * 1024)} MiB`;
  return `${formatarMedida(bytes, 1024 * 1024 * 1024)} GiB`;
}

export function fraseArquivoGrande(maxBytes: number): string {
  return `O arquivo passa de ${formatarMedida(maxBytes, 1024 * 1024)} MiB.`;
}

export function fraseLoteCheioArquivos(maxArquivos: number): string {
  return `O lote passou de ${formatarInteiro(maxArquivos)} arquivos.`;
}

export function fraseLoteCheioBytes(maxBytes: number): string {
  return `O lote passou de ${formatarMedida(maxBytes, 1024 * 1024 * 1024)} GiB.`;
}

export function fraseLotesAtivos(quantidade: number): string {
  if (quantidade === 1) return "Já há 1 lote em recebimento ou conversão.";
  return `Já há ${formatarInteiro(quantidade)} lotes em recebimento ou conversão.`;
}

export function fraseSelecao(maxArquivos: number): string {
  return `A seleção passa de ${formatarInteiro(maxArquivos)} arquivos.`;
}

function formatarMedida(bytes: number, base: number): string {
  const valor = bytes / base;
  const inteiro = Math.abs(valor - Math.round(valor)) < 1e-6;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: inteiro ? 0 : 1,
    maximumFractionDigits: inteiro ? 0 : 1,
  }).format(inteiro ? Math.round(valor) : Math.round(valor * 10) / 10);
}
