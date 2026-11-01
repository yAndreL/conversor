import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { Arquivos } from "../src/paginas/Arquivos.js";

it("mostra o nome com sinais como texto e nao cria elemento", async () => {
  const nome = "<img src=x>";
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
            tamanho: 50,
            linhas: [
              {
                codigoDisciplina: "ADS",
                uuid: "11111111-1111-4111-8111-111111111111",
                arquivo_origem: nome,
                arquivo_saida: "",
                status: "erro",
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          id: "11111111-1111-4111-8111-111111111111",
          status: "concluido",
          total: 1,
          processados: 1,
          contagens: { convertidos: 0, erros: 1, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
          expiraEm: "2026-10-27T12:00:00.000Z",
          arquivos: [
            {
              arquivo_origem: nome,
              situacao: "erro",
              codigoDisciplina: "ADS",
              uuid: "11111111-1111-4111-8111-111111111111",
              arquivo_saida: "",
            },
          ],
        }),
      };
    }),
  );
  render(
    <MemoryRouter initialEntries={["/arquivos/11111111-1111-4111-8111-111111111111"]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(nome)).toBeTruthy();
  expect(screen.getByText("Erro")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  vi.unstubAllGlobals();
});

it("mostra quem ainda converte e libera o download quando termina", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const saida = "ADS_11111111-1111-4111-8111-111111111111.txt";
  let fase: "processando" | "concluido" = "processando";
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes("/linhas")) {
        return {
          ok: true,
          json: async () => ({
            total: 2,
            pagina: 1,
            tamanho: 200,
            linhas:
              fase === "processando"
                ? [
                    {
                      codigoDisciplina: "",
                      uuid: "",
                      arquivo_origem: "um.json",
                      arquivo_saida: "",
                      status: "convertendo",
                      diagnostico: "",
                    },
                    {
                      codigoDisciplina: "ADS",
                      uuid: id,
                      arquivo_origem: "dois.json",
                      arquivo_saida: saida,
                      status: "convertido",
                      diagnostico: "",
                    },
                  ]
                : [
                    {
                      codigoDisciplina: "",
                      uuid: "",
                      arquivo_origem: "um.json",
                      arquivo_saida: "",
                      status: "erro",
                      diagnostico: "JSON inválido.",
                    },
                    {
                      codigoDisciplina: "ADS",
                      uuid: id,
                      arquivo_origem: "dois.json",
                      arquivo_saida: saida,
                      status: "convertido",
                      diagnostico: "",
                    },
                  ],
          }),
        };
      }
      return {
        ok: true,
        json: async () =>
          fase === "processando"
            ? {
                id,
                status: "processando",
                total: 2,
                processados: 1,
                contagens: { convertidos: 0, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
                expiraEm: "2026-10-27T12:00:00.000Z",
                arquivos: [
                  {
                    arquivo_origem: "um.json",
                    situacao: "convertendo",
                    codigoDisciplina: "",
                    uuid: "",
                    arquivo_saida: "",
                  },
                  {
                    arquivo_origem: "dois.json",
                    situacao: "convertido",
                    codigoDisciplina: "ADS",
                    uuid: id,
                    arquivo_saida: saida,
                  },
                ],
              }
            : {
                id,
                status: "concluido",
                total: 2,
                processados: 2,
                contagens: { convertidos: 1, erros: 1, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
                expiraEm: "2026-10-27T12:00:00.000Z",
                arquivos: [],
              },
      };
    }),
  );
  try {
    render(
      <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
        <Routes>
          <Route path="/arquivos/:id" element={<Arquivos />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Convertendo")).toBeTruthy();
    expect(screen.getByText("Convertido")).toBeTruthy();
    expect(screen.getByText("um.json")).toBeTruthy();
    expect(screen.getByText(saida)).toBeTruthy();
    expect(screen.queryByRole("link", { name: saida })).toBeNull();
    fase = "concluido";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole("link", { name: saida })).toBeTruthy();
    expect(document.querySelector("tbody tr a")?.textContent).toBe("relacao.csv");
    expect(screen.queryByText("Convertendo")).toBeNull();
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("baixa o zip só dos arquivos marcados", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    if (url.includes("/download")) {
      return { ok: true, blob: async () => new Blob(["zip"]) };
    }
    if (url.includes("/linhas")) {
      return {
        ok: true,
        json: async () => ({
          total: 2,
          pagina: 1,
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "ADS",
              uuid: id,
              arquivo_origem: "um.json",
              arquivo_saida: "ADS.txt",
              status: "convertido",
            },
            {
              codigoDisciplina: "BIO",
              uuid: id,
              arquivo_origem: "dois.json",
              arquivo_saida: "BIO.txt",
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
        total: 2,
        processados: 2,
        contagens: { convertidos: 2, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
        arquivos: [],
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:lote");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  const baixar = await screen.findByRole("button", { name: "Baixar zip do lote" });
  const selecao = screen.getByRole("button", { name: "Baixar seleção" });
  expect((baixar as HTMLButtonElement).disabled).toBe(false);
  expect(baixar.className).not.toContain("secundario");
  expect((selecao as HTMLButtonElement).disabled).toBe(true);
  await usuario.click(baixar);
  await waitFor(() => {
    const pedido = buscar.mock.calls.map((chamada) => String(chamada[0])).find((url) => url.includes("/download"));
    expect(pedido).toBe(`/api/lotes/${id}/download`);
  });
  await usuario.click(screen.getByRole("checkbox", { name: "Selecionar um.json" }));
  expect((selecao as HTMLButtonElement).disabled).toBe(false);
  await usuario.click(selecao);
  await waitFor(() => {
    const pedido = buscar.mock.calls
      .map((chamada) => String(chamada[0]))
      .filter((url) => url.includes("/download"))
      .at(-1);
    expect(pedido).toContain("arquivo=ADS.txt");
    expect(pedido).not.toContain("BIO.txt");
  });
  await usuario.click(screen.getByRole("checkbox", { name: "Selecionar todos" }));
  expect((screen.getByRole("checkbox", { name: "Selecionar um.json" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Selecionar dois.json" }) as HTMLInputElement).checked).toBe(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("so exclui a linha depois da confirmacao", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "DELETE") {
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
    }
    const url = String(entrada);
    if (url.includes("/linhas")) {
      return {
        ok: true,
        json: async () => ({
          total: 2,
          pagina: 1,
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "ADS",
              uuid: id,
              arquivo_origem: "um.json",
              arquivo_saida: "ADS.txt",
              status: "convertido",
            },
            {
              codigoDisciplina: "BIO",
              uuid: id,
              arquivo_origem: "dois.json",
              arquivo_saida: "BIO.txt",
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
        total: 2,
        processados: 2,
        contagens: { convertidos: 2, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
        arquivos: [],
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  await usuario.click(await screen.findByRole("button", { name: "Excluir um.json" }));
  const dialogo = screen.getByRole("dialog", { name: "Excluir arquivo" });
  expect(dialogo.querySelectorAll("hr.modal-separa")).toHaveLength(2);
  expect(screen.getByText("Excluir um.json?")).toBeTruthy();
  expect(screen.getByText("Ele sai do lote e o texto convertido é apagado.")).toBeTruthy();
  await usuario.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("um.json")).toBeTruthy();
  expect(buscar.mock.calls.some((chamada) => chamada[1]?.method === "DELETE")).toBe(false);
  await usuario.click(screen.getByRole("button", { name: "Excluir um.json" }));
  await usuario.click(screen.getByRole("button", { name: "Excluir", exact: true }));
  await waitFor(() => expect(screen.queryByText("um.json")).toBeNull());
  expect(screen.getByText("dois.json")).toBeTruthy();
  const pedido = buscar.mock.calls.find((chamada) => chamada[1]?.method === "DELETE")?.[1]?.body;
  expect(pedido).toBe(JSON.stringify({ arquivo_origem: "um.json" }));
  vi.unstubAllGlobals();
});

it("exclui todos os arquivos processados pela modal", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    if (init?.method === "DELETE") {
      return {
        ok: true,
        json: async () => ({
          id,
          status: "concluido",
          total: 0,
          processados: 0,
          contagens: { convertidos: 0, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
          expiraEm: "2026-10-27T12:00:00.000Z",
          arquivos: [],
        }),
      };
    }
    if (url.includes("/linhas")) {
      return {
        ok: true,
        json: async () => ({
          total: 2,
          pagina: 1,
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "ADS",
              uuid: id,
              arquivo_origem: "um.json",
              arquivo_saida: "ADS.txt",
              status: "convertido",
            },
            {
              codigoDisciplina: "BIO",
              uuid: id,
              arquivo_origem: "dois.json",
              arquivo_saida: "BIO.txt",
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
        total: 2,
        processados: 2,
        contagens: { convertidos: 2, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
        arquivos: [],
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  await usuario.click(await screen.findByRole("button", { name: "Excluir um.json" }));
  expect(screen.getByRole("button", { name: "Excluir todos" })).toBeTruthy();
  await usuario.click(screen.getByRole("button", { name: "Excluir todos" }));
  await waitFor(() => expect(screen.getByText("Nenhum JSON convertido ainda.")).toBeTruthy());
  expect(screen.queryByText("um.json")).toBeNull();
  expect(screen.queryByText("dois.json")).toBeNull();
  const pedido = buscar.mock.calls.find((chamada) => chamada[1]?.method === "DELETE")?.[1]?.body;
  expect(pedido).toBe(JSON.stringify({ todos: true }));
  vi.unstubAllGlobals();
});

it("mostra o progresso com agrupamento pt-BR", async () => {
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
                arquivo_origem: "um.json",
                arquivo_saida: "",
                status: "convertendo",
                diagnostico: "",
              },
            ],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          id,
          status: "processando",
          total: 2500,
          processados: 1000,
          contagens: { convertidos: 1000, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
          expiraEm: "2026-10-27T12:00:00.000Z",
        }),
      };
    }),
  );
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Convertendo 1.000 de 2.500")).toBeTruthy();
  vi.unstubAllGlobals();
});

it("pagina a tabela e a busca volta para a primeira", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    if (url.includes("/linhas")) {
      const pagina = new URL(url, "http://local").searchParams.get("pagina");
      return {
        ok: true,
        json: async () => ({
          total: 2500,
          pagina: Number(pagina),
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "ADS",
              uuid: id,
              arquivo_origem: `pagina-${pagina ?? "1"}.json`,
              arquivo_saida: "ADS.txt",
              status: "convertido",
              diagnostico: "",
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
        total: 2500,
        processados: 2500,
        contagens: { convertidos: 2500, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Página 1 de 13")).toBeTruthy();
  expect(screen.getByText("pagina-1.json")).toBeTruthy();
  await usuario.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(await screen.findByText("Página 2 de 13")).toBeTruthy();
  expect(await screen.findByText("pagina-2.json")).toBeTruthy();
  await usuario.click(screen.getByRole("checkbox", { name: "Selecionar pagina-2.json" }));
  await usuario.click(screen.getByRole("button", { name: "Página anterior" }));
  expect(await screen.findByText("Página 1 de 13")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Baixar seleção" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nada" } });
  await waitFor(() => {
    const pedido = buscar.mock.calls
      .map((chamada) => String(chamada[0]))
      .filter((endereco) => endereco.includes("/linhas"))
      .at(-1);
    expect(pedido).toContain("pagina=1");
    expect(pedido).toContain("q=nada");
  });
  vi.unstubAllGlobals();
});

it("fecha e descarta um lote que ainda está recebendo", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    if (init?.method === "DELETE" && url === `/api/lotes/${id}`) return { ok: true, status: 204, json: async () => ({}) };
    if (init?.method === "POST" && url.endsWith("/fechar")) return { ok: true, status: 202, json: async () => ({ id }) };
    if (url.includes("/linhas")) {
      return {
        ok: true,
        json: async () => ({
          total: 1,
          pagina: 1,
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "",
              uuid: "",
              arquivo_origem: "um.json",
              arquivo_saida: "",
              status: "convertendo",
              diagnostico: "",
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id,
        status: "recebendo",
        total: 1,
        processados: 0,
        contagens: { convertidos: 0, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos" element={<Arquivos />} />
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole("button", { name: "Fechar com o que chegou" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Baixar zip do lote" })).toBeNull();
  await usuario.click(screen.getByRole("button", { name: "Descartar lote" }));
  expect(await screen.findByText("Nenhum JSON convertido ainda.")).toBeTruthy();
  expect(sessionStorage.getItem("conversor.loteAtual")).toBeNull();
  vi.unstubAllGlobals();
});

it("o fechamento de um lote em recebimento manda falhas vazias", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buscar = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    if (init?.method === "POST" && url.endsWith("/fechar")) return { ok: true, status: 202, json: async () => ({ id }) };
    if (url.includes("/linhas")) {
      return {
        ok: true,
        json: async () => ({
          total: 1,
          pagina: 1,
          tamanho: 200,
          linhas: [
            {
              codigoDisciplina: "",
              uuid: "",
              arquivo_origem: "um.json",
              arquivo_saida: "",
              status: "convertendo",
              diagnostico: "",
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id,
        status: "recebendo",
        total: 1,
        processados: 0,
        contagens: { convertidos: 0, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 },
        expiraEm: "2026-10-27T12:00:00.000Z",
      }),
    };
  });
  vi.stubGlobal("fetch", buscar);
  const usuario = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  await usuario.click(await screen.findByRole("button", { name: "Fechar com o que chegou" }));
  await waitFor(() => {
    const fechar = buscar.mock.calls.find((chamada) => String(chamada[0]).endsWith("/fechar"));
    expect(JSON.parse(String(fechar?.[1]?.body))).toEqual({ falhas: [] });
  });
  expect(screen.queryByRole("button", { name: "Baixar zip do lote" })).toBeNull();
  vi.unstubAllGlobals();
});

it("mostra o motivo só na linha com erro e omite bloco ignorado", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: RequestInfo | URL) => {
      const url = String(entrada);
      if (url.includes("/linhas")) {
        return {
          ok: true,
          json: async () => ({
            total: 3,
            pagina: 1,
            tamanho: 200,
            linhas: [
              {
                codigoDisciplina: "70121",
                uuid: id,
                arquivo_origem: "um.json",
                arquivo_saida: "um.txt",
                status: "convertido",
                diagnostico: "Bloco ignorado: list.",
              },
              {
                codigoDisciplina: "",
                uuid: "",
                arquivo_origem: "dois.json",
                arquivo_saida: "",
                status: "sem_codigo",
                diagnostico: "codigoDisciplina ausente.",
              },
              {
                codigoDisciplina: "",
                uuid: "",
                arquivo_origem: "tres.json",
                arquivo_saida: "",
                status: "erro",
                diagnostico: "JSON inválido.; Bloco ignorado: list.",
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
          total: 3,
          processados: 3,
          contagens: { convertidos: 1, erros: 1, sem_codigo: 1, codigos_repetidos: 0, orfaos: 0 },
          expiraEm: "2026-10-27T12:00:00.000Z",
        }),
      };
    }),
  );
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText("JSON inválido.")).toBeTruthy();
  expect(screen.queryByText(/Bloco ignorado/)).toBeNull();
  expect(screen.queryByText("codigoDisciplina ausente.")).toBeNull();
  vi.unstubAllGlobals();
});

it("agrupa a tela do navegador e mantem o arquivo convertido", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const frase = "A imagem mostra a tela do navegador.";
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
                codigoDisciplina: "70132",
                uuid: "22222222-2222-4222-8222-222222222222",
                arquivo_origem: "capa.json",
                arquivo_saida: "22222222-2222-4222-8222-222222222222az70132.txt",
                status: "convertido",
                diagnostico: frase,
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
        }),
      };
    }),
  );
  render(
    <MemoryRouter initialEntries={[`/arquivos/${id}`]}>
      <Routes>
        <Route path="/arquivos/:id" element={<Arquivos />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole("region", { name: "Tela do navegador" })).toBeTruthy();
  expect(screen.getAllByText("capa.json")).toHaveLength(2);
  expect(screen.getByText(frase)).toBeTruthy();
  expect(screen.getByText("Convertido")).toBeTruthy();
  expect(screen.queryByText("Erro")).toBeNull();
  vi.unstubAllGlobals();
});
