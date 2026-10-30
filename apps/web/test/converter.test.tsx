import { LIMITES_PADRAO, FRASE_DUPLICADO } from "@conversor/contratos";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { utils, write } from "xlsx";

import { Converter } from "../src/paginas/Converter.js";

const ID = "11111111-1111-4111-8111-111111111111";

function montar(limites = LIMITES_PADRAO) {
  const buscar = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    if (url === "/api/limites") return { ok: true, status: 200, json: async () => limites };
    if (url === "/api/lotes" && metodo === "POST") return { ok: true, status: 202, json: async () => ({ id: ID, limites }) };
    if (url.endsWith("/arquivos") && metodo === "POST") return { ok: true, status: 200, json: async () => ({ aceitos: 1, recusados: [] }) };
    if (url.endsWith("/fechar") && metodo === "POST") return { ok: true, status: 202, json: async () => ({ id: ID }) };
    if (url === `/api/lotes/${ID}` && metodo === "DELETE") return { ok: true, status: 204, json: async () => ({}) };
    return { ok: false, status: 400, json: async () => ({ erro: "lote_invalido", mensagem: "inesperado" }) };
  });
  vi.stubGlobal("fetch", buscar);
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Converter />} />
        <Route path="/arquivos/:id" element={<h1>Arquivos processados</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  return buscar;
}

function soltar(arquivos: File[]) {
  fireEvent.drop(screen.getByRole("button", { name: "Solte os arquivos JSON ou a planilha Excel aqui" }), {
    dataTransfer: { files: arquivos },
  });
}

function arquivoPlanilha(nome: string, linhas: unknown[][]): File {
  const folha = utils.aoa_to_sheet(linhas);
  const livro = utils.book_new();
  utils.book_append_sheet(livro, folha, "Planilha1");
  const gerado: unknown = write(livro, { type: "array", bookType: "xlsx" });
  const bytes = bytesDe(gerado);
  return new File([bytes], nome);
}

function bytesDe(gerado: unknown): Uint8Array<ArrayBuffer> {
  if (gerado instanceof Uint8Array) return new Uint8Array(gerado);
  if (gerado instanceof ArrayBuffer) return new Uint8Array(gerado);
  if (Array.isArray(gerado)) return Uint8Array.from(gerado as number[]);
  throw new Error("formato inesperado");
}

it("soltar arquivo só seleciona e o envio abre os arquivos", async () => {
  const buscar = montar();
  const usuario = userEvent.setup();
  expect(
    screen.getByText(
      "Envie os arquivos JSON e receba o texto convertido de cada um. Uma planilha de alunos (.xlsx) baixa o JSON com cursos e disciplinas.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/lote segue o contrato/)).toBeNull();
  const botao = screen.getByRole("button", { name: "Converter agora" });
  expect((botao as HTMLButtonElement).disabled).toBe(true);
  soltar([new File(["{}"], "nota.json", { type: "application/json" })]);
  expect(await screen.findByRole("cell", { name: "nota.json" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Converter agora (1)" }).textContent).toBe("Converter agora (1)");
  expect(buscar.mock.calls.every((chamada) => String(chamada[0]) === "/api/limites")).toBe(true);
  await usuario.click(screen.getByRole("button", { name: "Converter agora (1)" }));
  expect(await screen.findByRole("heading", { name: "Arquivos processados" })).toBeTruthy();
  const urls = buscar.mock.calls.map((chamada) => String(chamada[0]));
  expect(urls).toContain("/api/lotes");
  expect(urls.some((url) => url === `/api/lotes/${ID}/arquivos`)).toBe(true);
  expect(urls.some((url) => url === `/api/lotes/${ID}/fechar`)).toBe(true);
  vi.unstubAllGlobals();
});

it("envio sem arquivo nao chama a conversão", () => {
  const buscar = montar();
  const botao = screen.getByRole("button", { name: "Converter agora" });
  expect((botao as HTMLButtonElement).disabled).toBe(true);
  fireEvent.submit(botao.closest("form") as HTMLFormElement);
  expect(buscar.mock.calls.every((chamada) => String(chamada[0]) === "/api/limites")).toBe(true);
  vi.unstubAllGlobals();
});

it("a seleção acima do teto não substitui a atual", async () => {
  montar();
  soltar([new File(["{}"], "nota.json")]);
  expect(await screen.findByRole("cell", { name: "nota.json" })).toBeTruthy();
  soltar(Array.from({ length: 3000 }, (_, indice) => new File(["{}"], `extra-${String(indice)}.json`)));
  expect(screen.getByText("A seleção passa de 2.500 arquivos.")).toBeTruthy();
  expect(screen.getByRole("cell", { name: "nota.json" })).toBeTruthy();
  expect(screen.queryByText("extra-0.json")).toBeNull();
  vi.unstubAllGlobals();
});

it("a seleção vazia continua vazia quando passa do teto", () => {
  montar();
  soltar(Array.from({ length: 3000 }, (_, indice) => new File(["{}"], `extra-${String(indice)}.json`)));
  expect(screen.getByText("A seleção passa de 2.500 arquivos.")).toBeTruthy();
  expect(screen.queryByRole("cell")).toBeNull();
  expect((screen.getByRole("button", { name: "Converter agora" }) as HTMLButtonElement).disabled).toBe(true);
  vi.unstubAllGlobals();
});

it("mostra resumo a partir de 51 arquivos e tabela até 50", () => {
  montar();
  soltar(Array.from({ length: 50 }, (_, indice) => new File([], `n${String(indice)}.json`)));
  expect(screen.getByRole("cell", { name: "n0.json" })).toBeTruthy();
  expect(screen.queryByText(/envio/)).toBeNull();
  soltar([new File([new Uint8Array(1024 * 1024)], "grande.json")]);
  expect(screen.getByText("51 arquivos, 1 MiB, 1 envio")).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "n0.json" })).toBeNull();
  vi.unstubAllGlobals();
});

it("manda a segunda ocorrência no fechamento", async () => {
  const buscar = montar();
  const usuario = userEvent.setup();
  soltar([new File(["{}"], "nota.json"), new File(["{}"], "nota.json")]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (2)" }));
  await screen.findByRole("heading", { name: "Arquivos processados" });
  const fechar = buscar.mock.calls.find((chamada) => String(chamada[0]).endsWith("/fechar"));
  const corpo = JSON.parse(String(fechar?.[1]?.body)) as { falhas: Array<{ arquivo_origem: string; motivo: string }> };
  expect(corpo.falhas).toEqual([
    { arquivo_origem: "nota.json#2", motivo: "duplicado", diagnostico: FRASE_DUPLICADO },
  ]);
  vi.unstubAllGlobals();
});

it("não repete envio com 4xx nem mostra reenviar", async () => {
  const buscar = montar();
  buscar.mockImplementation(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    if (url === "/api/limites") return { ok: true, status: 200, json: async () => LIMITES_PADRAO };
    if (url === "/api/lotes" && metodo === "POST") return { ok: true, status: 202, json: async () => ({ id: ID, limites: LIMITES_PADRAO }) };
    return { ok: false, status: 413, json: async () => ({ erro: "limite_excedido", mensagem: "O envio passou do limite permitido." }) };
  });
  const usuario = userEvent.setup();
  soltar([new File(["{}"], "nota.json")]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (1)" }));
  expect(await screen.findByText("O envio passou do limite permitido.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reenviar envios" })).toBeNull();
  const arquivos = buscar.mock.calls.filter((chamada) => String(chamada[0]).endsWith("/arquivos"));
  expect(arquivos).toHaveLength(1);
  expect((screen.getByRole("button", { name: "Converter agora (1)" }) as HTMLButtonElement).disabled).toBe(false);
  vi.unstubAllGlobals();
});

it("retém o envio depois de duas falhas de rede", async () => {
  const buscar = montar();
  buscar.mockImplementation(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    if (url === "/api/limites") return { ok: true, status: 200, json: async () => LIMITES_PADRAO };
    if (url === "/api/lotes" && metodo === "POST") return { ok: true, status: 202, json: async () => ({ id: ID, limites: LIMITES_PADRAO }) };
    if (url.endsWith("/arquivos")) throw new TypeError("falhou");
    return { ok: false, status: 400, json: async () => ({ erro: "lote_invalido", mensagem: "inesperado" }) };
  });
  const usuario = userEvent.setup();
  soltar([new File(["{}"], "a.json"), new File(["{}"], "b.json")]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (2)" }));
  expect(await screen.findByText("2 arquivos não entraram. Reenvie esse envio ou feche com o que chegou.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reenviar envios" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fechar com o que chegou" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Descartar lote" })).toBeTruthy();
  vi.unstubAllGlobals();
});

it("para no lote cheio e fecha com a frase da resposta", async () => {
  const buscar = montar();
  buscar.mockImplementation(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? "GET";
    if (url === "/api/limites") return { ok: true, status: 200, json: async () => LIMITES_PADRAO };
    if (url === "/api/lotes" && metodo === "POST") return { ok: true, status: 202, json: async () => ({ id: ID, limites: LIMITES_PADRAO }) };
    if (url.endsWith("/arquivos")) {
      return { ok: false, status: 413, json: async () => ({ erro: "limite_lote", mensagem: "O lote passou de 5.000 arquivos." }) };
    }
    if (url.endsWith("/fechar")) return { ok: true, status: 202, json: async () => ({ id: ID }) };
    return { ok: false, status: 400, json: async () => ({ erro: "lote_invalido", mensagem: "inesperado" }) };
  });
  const usuario = userEvent.setup();
  soltar([new File(["{}"], "a.json"), new File(["{}"], "b.json")]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (2)" }));
  expect(await screen.findByText("O lote passou de 5.000 arquivos.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reenviar envios" })).toBeNull();
  await usuario.click(screen.getByRole("button", { name: "Fechar com o que chegou" }));
  await screen.findByRole("heading", { name: "Arquivos processados" });
  const fechar = buscar.mock.calls.find((chamada) => String(chamada[0]).endsWith("/fechar"));
  const corpo = JSON.parse(String(fechar?.[1]?.body)) as { falhas: Array<{ arquivo_origem: string; motivo: string; diagnostico: string }> };
  expect(corpo.falhas).toEqual([
    { arquivo_origem: "a.json", motivo: "limite_lote", diagnostico: "O lote passou de 5.000 arquivos." },
    { arquivo_origem: "b.json", motivo: "limite_lote", diagnostico: "O lote passou de 5.000 arquivos." },
  ]);
  vi.unstubAllGlobals();
});

it("planilha excel baixa o json hierárquico sem abrir lote", async () => {
  const buscar = montar();
  const usuario = userEvent.setup();
  let lido = Promise.resolve("");
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (!(blob instanceof Blob)) throw new Error("download sem blob");
    lido = blob.text();
    return "blob:planilha";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  soltar([
    arquivoPlanilha("alunos.xlsx", [
      ["name", "cpf", "curso", "disciplina", "notaobtida", "datanasc"],
      ["Aluno A", "111", "Curso B", "Disciplina X", "10.00", 29861],
      ["Aluno A", "111", "Curso B", "Disciplina Y", "NULL", 29861],
      ["Aluno A", "111", "Curso C", "Disciplina W", "8", 29861],
    ]),
  ]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (1)" }));
  expect(await screen.findByText("JSON baixado. alunos.xlsx: 1 aluno, 2 cursos, 3 disciplinas")).toBeTruthy();
  expect(JSON.parse(await lido)).toMatchObject([
    {
      name: "Aluno A",
      cpf: "111",
      datanasc: "1981-10-02",
      cursos: [
        {
          curso: "Curso B",
          disciplinas: [
            { disciplina: "Disciplina X", notaobtida: 10 },
            { disciplina: "Disciplina Y", notaobtida: null },
          ],
        },
        { curso: "Curso C", disciplinas: [{ disciplina: "Disciplina W", notaobtida: 8 }] },
      ],
    },
  ]);
  expect(buscar.mock.calls.every((chamada) => String(chamada[0]) === "/api/limites")).toBe(true);
  vi.unstubAllGlobals();
});

it("json e planilha juntos não enviam", async () => {
  const buscar = montar();
  const usuario = userEvent.setup();
  soltar([
    new File(["{}"], "nota.json"),
    arquivoPlanilha("alunos.xlsx", [
      ["name", "curso", "disciplina"],
      ["A", "B", "C"],
    ]),
  ]);
  await usuario.click(await screen.findByRole("button", { name: "Converter agora (2)" }));
  expect(await screen.findByText("Separe a planilha Excel dos arquivos JSON. Cada tipo converte de um jeito.")).toBeTruthy();
  expect(buscar.mock.calls.every((chamada) => String(chamada[0]) === "/api/limites")).toBe(true);
  vi.unstubAllGlobals();
});
