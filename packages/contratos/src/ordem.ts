export function compararPontosDeCodigo(esquerda: string, direita: string): number {
  let indiceEsquerda = 0;
  let indiceDireita = 0;
  while (indiceEsquerda < esquerda.length && indiceDireita < direita.length) {
    const pontoEsquerda = esquerda.codePointAt(indiceEsquerda) ?? 0;
    const pontoDireita = direita.codePointAt(indiceDireita) ?? 0;
    if (pontoEsquerda !== pontoDireita) return pontoEsquerda < pontoDireita ? -1 : 1;
    indiceEsquerda += pontoEsquerda > 0xffff ? 2 : 1;
    indiceDireita += pontoDireita > 0xffff ? 2 : 1;
  }
  if (indiceEsquerda === esquerda.length && indiceDireita === direita.length) return 0;
  return indiceEsquerda === esquerda.length ? -1 : 1;
}

export function ordenarPorCodePoint<T>(itens: readonly T[], texto: (item: T) => string): T[] {
  return [...itens].sort((esquerda, direita) => compararPontosDeCodigo(texto(esquerda), texto(direita)));
}
