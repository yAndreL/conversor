import { z } from "zod";

export {
  FRASE_COLISAO,
  FRASE_DUPLICADO,
  FRASE_ENVIO,
  FRASE_FORA_DE_RECEBIMENTO,
  FRASE_LEITURA,
  FRASE_LOTE_AUSENTE,
  FRASE_LOTE_OCUPADO,
  FRASE_NAO_JSON,
  FRASE_NOME_INVALIDO,
  LIMITES_PADRAO,
  fraseArquivoGrande,
  fraseLoteCheioArquivos,
  fraseLoteCheioBytes,
  fraseLotesAtivos,
  fraseSelecao,
  formatarInteiro,
  formatarTamanho,
  maxBytesRequisicao,
} from "./frases.js";
export { compararPontosDeCodigo, ordenarPorCodePoint } from "./ordem.js";

export const statusSchema = z.enum(["convertendo", "convertido", "sem_codigo", "erro"]);

export const linhaSchema = z.object({
  codigoDisciplina: z.string(),
  uuid: z.string(),
  arquivo_origem: z.string(),
  arquivo_saida: z.string(),
  status: statusSchema,
  diagnostico: z.string(),
});

export const documentoEntradaSchema = z
  .object({
    codigoDisciplina: z.unknown().optional(),
    blocks: z.array(z.unknown()),
  })
  .passthrough();

export const erroApiSchema = z.object({
  erro: z.enum([
    "lote_invalido",
    "arquivo_invalido",
    "limite_excedido",
    "limite_lote",
    "envio_em_andamento",
    "lote_ocupado",
    "lote_inexistente",
    "arquivo_inexistente",
  ]),
  mensagem: z.string(),
});

export const limitesSchema = z.object({
  maxArquivosEnvio: z.number().int().positive(),
  maxBytesEnvio: z.number().int().positive(),
  maxBytesArquivo: z.number().int().positive(),
  maxArquivosLote: z.number().int().positive(),
  maxBytesLote: z.number().int().positive(),
  maxArquivosSelecao: z.number().int().positive(),
  maxLotesAtivos: z.number().int().positive(),
  minBytesLivres: z.number().int().nonnegative(),
  overheadPorArquivo: z.number().int().nonnegative(),
  overheadEnvelope: z.number().int().nonnegative(),
});

export const aceiteSchema = z.object({
  id: z.string().uuid(),
  limites: limitesSchema,
});

export const recusaSchema = z.object({
  arquivo_origem: z.string(),
  motivo: z.string(),
  diagnostico: z.string(),
});

export const respostaEnvioSchema = z.object({
  aceitos: z.number().int().nonnegative(),
  recusados: z.array(recusaSchema),
});

export const exclusaoLinhaSchema = z.union([
  z.object({ todos: z.literal(true) }),
  z.object({ arquivo_origem: z.string().min(1) }),
]);

export const contagensSchema = z.object({
  convertidos: z.number().int().nonnegative(),
  erros: z.number().int().nonnegative(),
  sem_codigo: z.number().int().nonnegative(),
  codigos_repetidos: z.number().int().nonnegative(),
  orfaos: z.number().int().nonnegative(),
});

export const statusLoteSchema = z.enum(["recebendo", "processando", "concluido", "erro"]);

export const situacaoArquivoSchema = z.enum(["convertendo", "convertido", "sem_codigo", "erro"]);

export const arquivoAndamentoSchema = z.object({
  arquivo_origem: z.string(),
  situacao: situacaoArquivoSchema,
  codigoDisciplina: z.string(),
  uuid: z.string(),
  arquivo_saida: z.string(),
});

export const loteSchema = z.object({
  id: z.string().uuid(),
  status: statusLoteSchema,
  total: z.number().int().nonnegative(),
  processados: z.number().int().nonnegative(),
  contagens: contagensSchema,
  expiraEm: z.string().datetime(),
});

export const consultaLinhasSchema = z.object({
  q: z.string().default(""),
  pagina: z.coerce.number().int().min(1),
  tamanho: z.coerce.number().int().min(1).max(200),
});

export const paginaLinhasSchema = z.object({
  total: z.number().int().nonnegative(),
  pagina: z.number().int(),
  tamanho: z.number().int(),
  linhas: z.array(linhaSchema),
});

export type LinhaContrato = z.infer<typeof linhaSchema>;
export type ArquivoAndamento = z.infer<typeof arquivoAndamentoSchema>;
export type LoteContrato = z.infer<typeof loteSchema>;
export type ErroApi = z.infer<typeof erroApiSchema>;
export type PaginaLinhas = z.infer<typeof paginaLinhasSchema>;
export type LimitesContrato = z.infer<typeof limitesSchema>;
export type RespostaEnvio = z.infer<typeof respostaEnvioSchema>;
