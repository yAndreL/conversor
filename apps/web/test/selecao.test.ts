import { FRASE_DUPLICADO, FRASE_NAO_JSON } from "@conversor/contratos";
import { expect, it } from "vitest";

import { montarEnvios, separarSelecao, textoConversao, textoEnvio, textoPagina, textoResumo, textoRetidos } from "../src/selecao.js";

const LIMITE_ARQUIVO = 32;

function arquivo(nome: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nome);
}

it("separa duplicado, txt e arquivo grande na ordem da seleção", () => {
  const separado = separarSelecao(
    [arquivo("nota.json", 2), arquivo("nota.txt", 2), arquivo("nota.json", 2), arquivo("grande.json", 33)],
    LIMITE_ARQUIVO,
  );
  expect(separado.enviar.map((item) => item.name)).toEqual(["nota.json"]);
  expect(separado.falhas).toEqual([
    { arquivo_origem: "nota.txt", motivo: "nao_json", diagnostico: FRASE_NAO_JSON },
    { arquivo_origem: "nota.json#2", motivo: "duplicado", diagnostico: FRASE_DUPLICADO },
    { arquivo_origem: "grande.json", motivo: "limite", diagnostico: "O arquivo passa de 0,0 MiB." },
  ]);
});

it("o tamanho exato entra e a soma exata fica num envio", () => {
  const separado = separarSelecao([arquivo("exato.json", LIMITE_ARQUIVO)], LIMITE_ARQUIVO);
  expect(separado.enviar).toHaveLength(1);
  expect(separado.falhas).toEqual([]);
  const envios = montarEnvios(
    [arquivo("b.json", 5), arquivo("a.json", 5), arquivo("c.json", 1)],
    { maxArquivosEnvio: 10, maxBytesEnvio: 10 },
  );
  expect(envios.map((envio) => envio.map((item) => item.name))).toEqual([["a.json", "b.json"], ["c.json"]]);
});

it("corta a quantidade e ordena por code point", () => {
  const envios = montarEnvios(
    [
      arquivo("á.json", 1),
      arquivo("a.json", 1),
      arquivo("A.json", 1),
      arquivo("\uE000.json", 1),
      arquivo("\u{1F600}.json", 1),
    ],
    { maxArquivosEnvio: 2, maxBytesEnvio: 100 },
  );
  expect(envios.map((envio) => envio.map((item) => item.name))).toEqual([
    ["A.json", "a.json"],
    ["á.json", "\uE000.json"],
    ["\u{1F600}.json"],
  ]);
});

it("monta os textos de envio, retenção e página", () => {
  expect(textoResumo(2500, 9.8 * 1024 * 1024 * 1024, 20)).toBe("2.500 arquivos, 9,8 GiB, 20 envios");
  expect(textoResumo(51, 1024 * 1024, 1)).toBe("51 arquivos, 1 MiB, 1 envio");
  expect(textoRetidos(1, 1)).toBe("1 arquivo não entrou. Reenvie esse envio ou feche com o que chegou.");
  expect(textoRetidos(8, 1)).toBe("8 arquivos não entraram. Reenvie esse envio ou feche com o que chegou.");
  expect(textoRetidos(8, 2)).toBe("8 arquivos não entraram. Reenvie esses envios ou feche com o que chegou.");
  expect(textoEnvio(3, 20)).toBe("Enviando 3 de 20");
  expect(textoConversao(1000, 2500)).toBe("Convertendo 1.000 de 2.500");
  expect(textoPagina(2, 13)).toBe("Página 2 de 13");
});
