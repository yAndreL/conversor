import { ErroCliente, enviarEnvio } from "./api.js";
import type { FatiaEnvio } from "./selecao.js";

export type ResultadoFatias =
  | { tipo: "ok" }
  | { tipo: "retidos"; envios: FatiaEnvio[] }
  | { tipo: "limite_lote"; mensagem: string; arquivos: File[]; retidos: FatiaEnvio[] }
  | { tipo: "erro"; mensagem: string };

export async function enviarFatias(
  idLote: string,
  fatias: readonly FatiaEnvio[],
  aoProgredir: (atual: number, total: number) => void,
): Promise<ResultadoFatias> {
  const retidos: FatiaEnvio[] = [];
  for (let indice = 0; indice < fatias.length; indice += 1) {
    const fatia = fatias[indice];
    if (!fatia) continue;
    aoProgredir(indice + 1, fatias.length);
    const resultado = await tentarEnvio(idLote, fatia);
    switch (resultado.tipo) {
      case "ok":
        break;
      case "reter":
        retidos.push(fatia);
        break;
      case "limite_lote":
        return {
          tipo: "limite_lote",
          mensagem: resultado.mensagem,
          arquivos: fatias.slice(indice).flatMap((item) => item.arquivos),
          retidos,
        };
      case "erro":
        return { tipo: "erro", mensagem: resultado.mensagem };
      default: {
        const nunca: never = resultado;
        return nunca;
      }
    }
  }
  if (retidos.length > 0) return { tipo: "retidos", envios: retidos };
  return { tipo: "ok" };
}

async function tentarEnvio(
  idLote: string,
  fatia: FatiaEnvio,
): Promise<{ tipo: "ok" } | { tipo: "reter" } | { tipo: "limite_lote"; mensagem: string } | { tipo: "erro"; mensagem: string }> {
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    try {
      await enviarEnvio(idLote, fatia.envioId, fatia.arquivos);
      return { tipo: "ok" };
    } catch (falha: unknown) {
      if (falha instanceof ErroCliente) {
        if (falha.status === 413 && falha.codigo === "limite_lote") return { tipo: "limite_lote", mensagem: falha.mensagem };
        if (falha.status >= 500 && tentativa === 0) continue;
        if (falha.status >= 500) return { tipo: "reter" };
        return { tipo: "erro", mensagem: falha.mensagem };
      }
      if (tentativa === 0) continue;
      return { tipo: "reter" };
    }
  }
  return { tipo: "reter" };
}
