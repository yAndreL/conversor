import { rmSync } from "node:fs";
import path from "node:path";

import { compararPontosDeCodigo } from "@conversor/contratos";
import { publicarPreparo, type Preparo } from "@conversor/core";
import type { Piscina } from "piscina";

import { csvRelacao, csvResultado, textoLog } from "./csvWeb.js";
import {
  expiracao,
  fraseDoMotivo,
  persistir,
  publicarTexto,
  type EntradaDisco,
  type Job,
  type LinhaWeb,
} from "./loteEstado.js";

export type OpcoesConversao = {
  tamanhoBloco: number;
  limiteBlocos?: number;
  antesDoBloco?: () => Promise<void>;
  ttlMs: number;
  encerrado: () => boolean;
  aindaExiste: () => boolean;
};

export async function converterLote(job: Job, piscina: Piscina, opcoes: OpcoesConversao): Promise<void> {
  try {
    if (opcoes.limiteBlocos === 0) return;
    const gerados = new Set(job.linhas.flatMap((linha) => (linha.arquivo_saida ? [linha.arquivo_saida] : [])));
    const pendentes = job.entradas
      .filter((entrada) => {
        const linha = job.linhas.find((atual) => atual.arquivo_origem === entrada.arquivo_origem);
        return !linha || linha.status === "convertendo";
      })
      .sort((esquerda, direita) => compararPontosDeCodigo(esquerda.arquivo_origem, direita.arquivo_origem));
    let blocos = 0;
    for (let inicio = 0; inicio < pendentes.length; inicio += opcoes.tamanhoBloco) {
      if (opcoes.encerrado() || !opcoes.aindaExiste()) return;
      if (opcoes.antesDoBloco) await opcoes.antesDoBloco();
      if (opcoes.encerrado() || !opcoes.aindaExiste()) return;
      const bloco = pendentes.slice(inicio, inicio + opcoes.tamanhoBloco);
      const preparos = await Promise.all(bloco.map((entrada) => preparar(piscina, job, entrada)));
      for (let indice = 0; indice < bloco.length; indice += 1) {
        const preparo = preparos[indice];
        const entrada = bloco[indice];
        if (!preparo || !entrada) continue;
        const publicado = publicarPreparo(job.saida, preparo, gerados);
        const frases = frasesDoPreparo(preparo, publicado.motivos);
        const diagnostico = frases.filter((frase) => frase.length > 0).join("; ");
        const linha: LinhaWeb = {
          ...publicado.linha,
          diagnostico,
          motivos: publicado.motivos.map((codigo, posicao) => ({ codigo, frase: frases[posicao] ?? "" })),
        };
        const lugar = job.linhas.findIndex((atual) => atual.arquivo_origem === entrada.arquivo_origem);
        if (lugar >= 0) job.linhas[lugar] = linha;
        else job.linhas.push(linha);
      }
      job.processados = job.linhas.filter((linha) => linha.status !== "convertendo").length;
      job.contagens = contagensDe(job);
      persistir(job);
      blocos += 1;
      if (opcoes.limiteBlocos !== undefined && blocos >= opcoes.limiteBlocos) return;
    }
    if (opcoes.encerrado() || !opcoes.aindaExiste()) return;
    publicarTexto(path.join(job.saida, "resultado.csv"), csvResultado(job.linhas));
    publicarTexto(path.join(job.saida, "relacao.csv"), csvRelacao(job.linhas));
    publicarTexto(path.join(job.saida, "erros.log"), textoLog(job.linhas));
    try {
      rmSync(job.entrada, { recursive: true, force: true });
    } catch {
      // Os três arquivos já estão publicados. O lote continua concluído.
    }
    job.status = "concluido";
    job.expiraEm = expiracao(opcoes.ttlMs);
    job.processados = job.linhas.filter((linha) => linha.status !== "convertendo").length;
    job.contagens = contagensDe(job);
    persistir(job);
  } catch {
    if (opcoes.encerrado() || !opcoes.aindaExiste()) return;
    job.status = "erro";
    job.expiraEm = expiracao(opcoes.ttlMs);
    persistir(job);
  }
}

async function preparar(piscina: Piscina, job: Job, entrada: EntradaDisco): Promise<Preparo> {
  return (await piscina.run({
    caminho: path.join(job.entrada, entrada.nomeDisco),
    origem: entrada.arquivo_origem,
  })) as Preparo;
}

function frasesDoPreparo(preparo: Preparo, motivos: readonly string[]): string[] {
  return motivos.map((motivo, indice) => preparo.anotacoes?.[indice] || fraseDoMotivo(motivo));
}

function contagensDe(job: Job): Job["contagens"] {
  const convertidos = job.linhas.filter((linha) => linha.status === "convertido");
  const contagem = new Map<string, number>();
  for (const linha of convertidos) contagem.set(linha.codigoDisciplina, (contagem.get(linha.codigoDisciplina) ?? 0) + 1);
  let repetidos = 0;
  for (const quantidade of contagem.values()) {
    if (quantidade > 1) repetidos += 1;
  }
  return {
    convertidos: convertidos.length,
    erros: job.linhas.filter((linha) => linha.status === "erro").length,
    sem_codigo: job.linhas.filter((linha) => linha.status === "sem_codigo").length,
    codigos_repetidos: repetidos,
    orfaos: job.contagens.orfaos,
  };
}
