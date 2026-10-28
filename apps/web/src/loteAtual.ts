import { useSyncExternalStore } from "react";

const CHAVE = "conversor.loteAtual";
const ouvintes = new Set<() => void>();

function lerLoteAtual(): string {
  try {
    return sessionStorage.getItem(CHAVE) ?? "";
  } catch {
    return "";
  }
}

function avisar(): void {
  for (const ouvir of ouvintes) ouvir();
}

export function guardarLote(id: string): void {
  try {
    sessionStorage.setItem(CHAVE, id);
  } catch {
    return;
  }
  avisar();
}

export function esquecerLote(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    return;
  }
  avisar();
}

export function useLoteAtual(): string {
  return useSyncExternalStore((ouvir) => {
    ouvintes.add(ouvir);
    return () => ouvintes.delete(ouvir);
  }, lerLoteAtual);
}
