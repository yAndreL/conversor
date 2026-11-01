import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encode } from "jpeg-js";
import { afterEach, describe, expect, it } from "vitest";

import { converterPasta } from "@conversor/core";

import { imagemMostraTelaDeNavegador } from "../src/telaNavegador.js";

const pastas: string[] = [];

afterEach(() => {
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

function jpeg(largura: number, altura: number, escurecerBase: boolean): string {
  const dados = Buffer.alloc(largura * altura * 4, 255);
  if (escurecerBase) {
    for (let y = altura - 36; y < altura; y += 1) {
      for (let x = 0; x < largura; x += 1) {
        const indice = (y * largura + x) * 4;
        dados[indice] = 20;
        dados[indice + 1] = 20;
        dados[indice + 2] = 20;
      }
    }
  }
  const codificado = encode({ data: dados, width: largura, height: altura }, 95);
  return `data:image/jpeg;base64,${codificado.data.toString("base64")}`;
}

describe("tela do navegador", () => {
  it("acusa paisagem com faixa inferior destoante", () => {
    expect(imagemMostraTelaDeNavegador(jpeg(900, 600, true))).toBe(true);
  });

  it("deixa passar paisagem uniforme, retrato e imagem estreita", () => {
    expect(imagemMostraTelaDeNavegador(jpeg(900, 600, false))).toBe(false);
    expect(imagemMostraTelaDeNavegador(jpeg(900, 1200, true))).toBe(false);
    expect(imagemMostraTelaDeNavegador(jpeg(400, 300, true))).toBe(false);
  });

  it("CA-32 converte e registra tela_navegador uma vez", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "conversor-tela-"));
    pastas.push(raiz);
    const entrada = path.join(raiz, "entrada");
    const saida = path.join(raiz, "saida");
    mkdirSync(entrada);
    const src = jpeg(900, 600, true);
    writeFileSync(
      path.join(entrada, "capa.json"),
      JSON.stringify({
        codigoDisciplina: "70132",
        blocks: [
          { type: "imageGroup", images: [{ src, alt: "Figura" }, { src, alt: "Outra" }] },
          { type: "paragraph", html: "<p>Texto</p>" },
        ],
      }),
    );
    expect(converterPasta(entrada, saida).codigoSaida).toBe(0);
    const csv = readFileSync(path.join(saida, "resultado.csv"), "utf8");
    const log = readFileSync(path.join(saida, "erros.log"), "utf8");
    const txts = readdirSync(saida).filter((nome) => nome.endsWith(".txt"));
    expect(txts).toHaveLength(1);
    const txt = readFileSync(path.join(saida, txts[0] ?? ""), "utf8");
    expect(csv).toContain("convertido");
    expect(csv).not.toMatch(/,erro(,|$)/);
    expect(log.match(/tela_navegador/g)).toEqual(["tela_navegador"]);
    expect(txt).toContain("<img ");
    expect(txt).toContain("Texto");
  });
});
