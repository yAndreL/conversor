import { converterPasta } from "./lote.js";

type Argumentos =
  | { ok: true; entrada: string; saida: string; limpar: boolean; estrito: boolean }
  | { ok: false; mensagem: string };

export function main(argv: readonly string[]): number {
  const argumentos = analisarArgumentos(argv);
  if (!argumentos.ok) {
    process.stderr.write(`${argumentos.mensagem}\n`);
    return 2;
  }
  const resultado = converterPasta(argumentos.entrada, argumentos.saida, {
    limpar: argumentos.limpar,
    estrito: argumentos.estrito,
  });
  if (resultado.resumo) process.stdout.write(resultado.resumo);
  return resultado.codigoSaida;
}

function analisarArgumentos(argv: readonly string[]): Argumentos {
  let entrada: string | undefined;
  let saida = "output";
  let limpar = false;
  let estrito = false;
  for (let indice = 0; indice < argv.length; indice += 1) {
    const atual = argv[indice] ?? "";
    if (atual === "--limpar") {
      limpar = true;
      continue;
    }
    if (atual === "--estrito") {
      estrito = true;
      continue;
    }
    if (atual === "--entrada" || atual === "--saida") {
      const valor = argv[indice + 1];
      if (valor === undefined || valor.startsWith("--")) {
        return { ok: false, mensagem: `faltou o valor de ${atual}` };
      }
      if (atual === "--entrada") entrada = valor;
      else saida = valor;
      indice += 1;
      continue;
    }
    return { ok: false, mensagem: `argumento desconhecido: ${atual}` };
  }
  if (entrada === undefined) return { ok: false, mensagem: "faltou --entrada" };
  return { ok: true, entrada, saida, limpar, estrito };
}
