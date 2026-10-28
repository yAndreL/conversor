import { prepararArquivo, type Preparo } from "@conversor/core";

export default async function executar(dados: { caminho: string; origem: string }): Promise<Preparo> {
  const atraso = process.env.CONVERSOR_ATRASO_ORIGEM;
  if (atraso && dados.origem === atraso) await new Promise((resolver) => setTimeout(resolver, 200));
  return prepararArquivo(dados.caminho, dados.origem);
}
