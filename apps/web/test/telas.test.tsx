import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { App } from "../src/App.js";

it("abre as duas telas com a paleta vermelha", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole("link", { name: "Converter JSON/HTML" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Arquivos Processados" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Converter JSON para TXT" })).toBeTruthy();
  const seletor = screen.getByText("+ Selecionar arquivos");
  expect(seletor.classList.contains("secundario")).toBe(true);
  expect(document.querySelector("svg")?.getAttribute("fill")).toBe("#E53935");
});

it("reabre o mesmo lote depois de sair da tela", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes("/linhas")) {
        return {
          ok: true,
          json: async () => ({
            total: 1,
            pagina: 1,
            tamanho: 200,
            linhas: [
              {
                codigoDisciplina: "ADS",
                uuid: id,
                arquivo_origem: "nota.json",
                arquivo_saida: "ADS.txt",
                status: "convertido",
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          id,
          status: "concluido",
          total: 1,
          processados: 1,
          contagens: { convertidos: 1, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
          expiraEm: "2026-10-27T12:00:00.000Z",
          arquivos: [],
        }),
      };
    }),
  );
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("nota.json")).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "Converter JSON/HTML" }));
  expect(screen.getByRole("heading", { name: "Converter JSON para TXT" })).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "Arquivos Processados" }));
  expect(await screen.findByText("nota.json")).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "CleanTXT" }));
  expect(screen.getByRole("heading", { name: "Converter JSON para TXT" })).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "Arquivos Processados" }));
  expect(await screen.findByText("nota.json")).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "+ Novo upload" }));
  expect(screen.getByRole("heading", { name: "Converter JSON para TXT" })).toBeTruthy();
  await usuario.click(screen.getByRole("link", { name: "Arquivos Processados" }));
  expect(await screen.findByText("nota.json")).toBeTruthy();
  vi.unstubAllGlobals();
});
