import { decode as decodificarJpeg } from "jpeg-js";

const LARGURA_MINIMA = 800;
const SALTO_DA_BARRA = 18;
const PIXELS_MAXIMOS = 20_000_000;

type Quadro = { largura: number; altura: number; pixels: Uint8Array };

export function imagemMostraTelaDeNavegador(src: string): boolean {
  try {
    const quadro = quadroDaImagem(src);
    if (!quadro) return false;
    if (quadro.largura < LARGURA_MINIMA || quadro.largura < quadro.altura) return false;
    return temBarraInferior(quadro);
  } catch {
    return false;
  }
}

function quadroDaImagem(src: string): Quadro | null {
  const separado = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(src.trim());
  const mime = separado?.[1]?.toLowerCase();
  const carga = separado?.[2];
  if (!mime || !carga) return null;
  if (mime !== "jpeg" && mime !== "jpg") return null;
  const bytes = Buffer.from(carga, "base64");
  const medidas = medidasJpeg(bytes);
  if (!medidas) return null;
  if (medidas.largura < LARGURA_MINIMA || medidas.largura < medidas.altura) return null;
  if (medidas.largura * medidas.altura > PIXELS_MAXIMOS) return null;
  return quadroJpeg(bytes);
}

function medidasJpeg(dados: Buffer): { largura: number; altura: number } | null {
  if (dados.length < 4 || dados[0] !== 0xff || dados[1] !== 0xd8) return null;
  let indice = 2;
  while (indice + 8 < dados.length) {
    if (dados[indice] !== 0xff) return null;
    const marca = dados[indice + 1] ?? 0;
    if (marca === 0xd8 || marca === 0xd9) {
      indice += 2;
      continue;
    }
    if (marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
      indice += 2;
      continue;
    }
    const tamanho = dados.readUInt16BE(indice + 2);
    if (tamanho < 2 || indice + 2 + tamanho > dados.length) return null;
    const inicioDeQuadro =
      (marca >= 0xc0 && marca <= 0xc3) ||
      (marca >= 0xc5 && marca <= 0xc7) ||
      (marca >= 0xc9 && marca <= 0xcb) ||
      (marca >= 0xcd && marca <= 0xcf);
    if (inicioDeQuadro) {
      return { altura: dados.readUInt16BE(indice + 5), largura: dados.readUInt16BE(indice + 7) };
    }
    indice += 2 + tamanho;
  }
  return null;
}

function quadroJpeg(dados: Buffer): Quadro {
  const quadro = decodificarJpeg(dados, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 20 });
  return { largura: quadro.width, altura: quadro.height, pixels: quadro.data };
}

function temBarraInferior(quadro: Quadro): boolean {
  const faixa = Math.min(56, Math.max(24, Math.floor(quadro.altura * 0.045)));
  if (quadro.altura < faixa * 4) return false;
  const base = mediaDaFaixa(quadro, quadro.altura - faixa, quadro.altura);
  const acima = mediaDaFaixa(quadro, quadro.altura - faixa * 3, quadro.altura - faixa - 2);
  return Math.abs(base - acima) > SALTO_DA_BARRA;
}

function mediaDaFaixa(quadro: Quadro, inicio: number, fim: number): number {
  const passo = Math.max(1, Math.floor(quadro.largura / 80));
  let soma = 0;
  let amostras = 0;
  for (let y = Math.max(0, inicio); y < fim && y < quadro.altura; y += 2) {
    for (let x = 0; x < quadro.largura; x += passo) {
      const indice = (y * quadro.largura + x) * 4;
      const vermelho = quadro.pixels[indice] ?? 0;
      const verde = quadro.pixels[indice + 1] ?? 0;
      const azul = quadro.pixels[indice + 2] ?? 0;
      soma += 0.299 * vermelho + 0.587 * verde + 0.114 * azul;
      amostras += 1;
    }
  }
  return amostras === 0 ? 0 : soma / amostras;
}
