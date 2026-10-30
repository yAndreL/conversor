import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { utils, write } from "xlsx";
import { expect, it } from "vitest";

import {
  hierarquizarAlunos,
  lerPlanilhaAlunos,
  nomeJsonDaPlanilha,
  type AlunoPlanilha,
  type DisciplinaPlanilha,
} from "../src/planilhaAlunos.js";

function caminhoExemplo(nome: string): string {
  return (
    [path.resolve(process.cwd(), "Exemplo", nome), path.resolve(process.cwd(), "../../Exemplo", nome)].find((caminho) =>
      existsSync(caminho),
    ) ?? ""
  );
}

const exemplo = caminhoExemplo("dados glt com notas_old.xlsx");
const exemploNovo = caminhoExemplo("dados alunos GLT E GLE.xlsx");

it("agrupa aluno, cursos e disciplinas e descarta repetição idêntica", () => {
  const alunos = hierarquizarAlunos([
    {
      name: "Aluno A",
      cpf: "111",
      datanasc: 29861,
      complemento: "NULL",
      curso: "Curso B",
      status_curso: "Em andamento",
      disciplina: "Disciplina X",
      status_disciplina: "Concluída",
      notaobtida: "10.00",
    },
    {
      name: "Aluno A",
      cpf: "111",
      curso: "Curso B",
      disciplina: "Disciplina X",
      status_disciplina: "Concluída",
      notaobtida: "10.00",
    },
    {
      name: "Aluno A",
      cpf: "111",
      curso: "Curso B",
      disciplina: "Disciplina Y",
      status_disciplina: "Pendente",
      notaobtida: "NULL",
    },
    {
      name: "Aluno A",
      cpf: "111",
      rua: "Rua 1",
      curso: "Curso C",
      disciplina: "Disciplina W",
      notaobtida: 8,
    },
    {
      name: "Aluno A",
      cpf: "111",
      rua: "Outra",
      curso: "Curso C",
      disciplina: "Disciplina W",
      status_disciplina: "Dispensada",
      notaobtida: "0.00",
    },
    {
      name: "Aluno Z",
      email: "z@exemplo.com",
      curso: "Curso D",
      disciplina: "Disciplina M",
    },
  ]);

  expect(alunos.map((aluno) => aluno.name)).toEqual(["Aluno A", "Aluno Z"]);
  const alunoA = alunos[0];
  expect(alunoA?.cpf).toBe("111");
  expect(alunoA?.datanasc).toBe("1981-10-02");
  expect(alunoA?.complemento).toBeNull();
  expect(alunoA?.rua).toBe("Rua 1");
  expect(alunoA?.cursos.map((curso) => curso.curso)).toEqual(["Curso B", "Curso C"]);
  expect(alunoA?.cursos[0]?.disciplinas).toEqual([
    { disciplina: "Disciplina X", modulo: null, status_disciplina: "Concluída", notaobtida: 10, frequencia: null, carga_horaria: null },
    { disciplina: "Disciplina Y", modulo: null, status_disciplina: "Pendente", notaobtida: null, frequencia: null, carga_horaria: null },
  ]);
  expect(alunoA?.cursos[1]?.disciplinas).toEqual([
    { disciplina: "Disciplina W", modulo: null, status_disciplina: null, notaobtida: 8, frequencia: null, carga_horaria: null },
    { disciplina: "Disciplina W", modulo: null, status_disciplina: "Dispensada", notaobtida: 0, frequencia: null, carga_horaria: null },
  ]);
  expect(alunos[1]?.cpf).toBeNull();
  expect(alunos[1]?.cursos[0]?.curso).toBe("Curso D");
  expect(nomeJsonDaPlanilha("Dados.XLSX")).toBe("Dados.json");
});

it("recusa planilha sem as colunas de aluno, curso e disciplina", async () => {
  const bytes = bytesDaPlanilha([
    ["nome", "materia"],
    ["Ana", "Português"],
  ]);
  await expect(lerPlanilhaAlunos(bytes)).rejects.toThrow("A planilha não tem as colunas name, curso e disciplina.");
});

it("aceita os cabeçalhos renomeados da planilha nova", async () => {
  const bytes = bytesDaPlanilha([
    [
      "empresa",
      "aluno",
      "stado_civil",
      "país",
      "curso",
      "data_termino_limite",
      "opcao_estagio",
      "sistec_codigo",
      "ert_emissao",
      "disciplina",
      "modulo",
      "aproveitamento",
      "frequencia",
      "carga_horaria",
    ],
    ["GLE", "PATRÍCIA", "Casada", "BR", "TÉCNICO", 29861, "Sim", "ABC", 29862, "REDAÇÃO", 1, "100.00", "100.0", 32],
    ["GLE", "PATRÍCIA", "Casada", "BR", "TÉCNICO", 29861, "Sim", "ABC", 29862, "PRIMEIROS SOCORROS", 2, "70.00", "80.5", 64],
  ]);
  const alunos = await lerPlanilhaAlunos(bytes);
  expect(alunos).toHaveLength(1);
  expect(alunos[0]?.codempresa).toBe("GLE");
  expect(alunos[0]?.name).toBe("PATRÍCIA");
  expect(alunos[0]?.estado_civil).toBe("Casada");
  expect(alunos[0]?.país).toBe("BR");
  const curso = alunos[0]?.cursos[0];
  expect(curso?.curso).toBe("TÉCNICO");
  expect(curso?.data_limite).toBe("1981-10-02");
  expect(curso?.opcaoestagio).toBe("Sim");
  expect(curso?.sistec_codigo).toBe("ABC");
  expect(curso?.cert_emissao).toBe("1981-10-03");
  expect(curso?.disciplinas).toEqual([
    {
      disciplina: "REDAÇÃO",
      modulo: 1,
      status_disciplina: null,
      notaobtida: 100,
      frequencia: 100,
      carga_horaria: 32,
    },
    {
      disciplina: "PRIMEIROS SOCORROS",
      modulo: 2,
      status_disciplina: null,
      notaobtida: 70,
      frequencia: 80.5,
      carga_horaria: 64,
    },
  ]);
});

it.skipIf(exemplo === "")("organiza a planilha de exemplo", async () => {
  const alunos = await lerPlanilhaAlunos(readFileSync(exemplo));
  expect(alunos).toHaveLength(1922);
  expect(alunos.filter((aluno) => aluno.cursos.length > 1)).toHaveLength(165);

  const patricia = alunos[0];
  expect(patricia?.name).toBe("PATRÍCIA APARECIDA FERREIRA PORTILHO");
  expect(patricia?.cpf).toBe("000.143.571-00");
  expect(patricia?.datanasc).toBe("1981-10-02");
  expect(patricia?.nome_social).toBeNull();
  expect(patricia?.país).toBe("BR");
  expect(patricia?.cidade).toBe("RIO VERDE");
  expect(patricia?.rg).toBe(14357100);
  expect(patricia?.cursos[0]?.curso).toBe("TÉCNICO EM SEGURANÇA DO TRABALHO");
  expect(patricia?.cursos[0]?.status_curso).toBe("Em andamento");
  expect(patricia?.cursos[0]?.data_inicio).toBe("2026-05-16");
  expect(patricia?.cursos[0]?.data_limite).toBe("2027-11-16");
  expect(patricia?.cursos[0]?.disciplinas[0]).toEqual({
    disciplina: "REDAÇÃO",
    modulo: null,
    status_disciplina: "Concluída",
    notaobtida: null,
    frequencia: null,
    carga_horaria: null,
  });

  const luiz = alunos.find((aluno) => aluno.name === "LUIZ DONIZETE CORRÊIA");
  expect(luiz?.cursos).toHaveLength(16);
  expect(luiz?.cursos[0]?.disciplinas[0]?.notaobtida).toBe(100);

  const conflitos = conflitosDe(alunos);
  expect(conflitos).toHaveLength(1);
  expect(conflitos[0]?.aluno).toBe("CRICIELE DIERINGS");
  expect(conflitos[0]?.disciplinas).toEqual([
    {
      disciplina: conflitos[0]?.disciplinas[0]?.disciplina,
      modulo: null,
      status_disciplina: "Concluída",
      notaobtida: null,
      frequencia: null,
      carga_horaria: null,
    },
    {
      disciplina: conflitos[0]?.disciplinas[0]?.disciplina,
      modulo: null,
      status_disciplina: "Dispensada",
      notaobtida: 0,
      frequencia: null,
      carga_horaria: null,
    },
  ]);

  const disciplinas = alunos.reduce(
    (soma, aluno) => soma + aluno.cursos.reduce((total, curso) => total + curso.disciplinas.length, 0),
    0,
  );
  expect(disciplinas).toBe(40732);
}, 120_000);

it.skipIf(exemploNovo === "")("organiza a planilha GLT e GLE com os cabeçalhos novos", async () => {
  const alunos = await lerPlanilhaAlunos(readFileSync(exemploNovo));
  const patricia = alunos.find((aluno) => aluno.name === "PATRÍCIA APARECIDA FERREIRA PORTILHO");
  expect(patricia?.codempresa).toBe("GLE");
  expect(patricia?.cpf).toBe("000.143.571-00");
  expect(patricia?.datanasc).toBe("1981-10-02");
  const curso = patricia?.cursos.find((item) => item.curso === "TÉCNICO EM SEGURANÇA DO TRABALHO");
  expect(curso?.status_curso).toBe("Em andamento");
  expect(curso?.data_inicio).toBe("2026-05-16");
  expect(curso?.data_limite).toBe("2027-11-16");
  const redacao = curso?.disciplinas.find((item) => item.disciplina === "REDAÇÃO");
  expect(redacao).toMatchObject({
    modulo: 1,
    status_disciplina: "Concluída",
    notaobtida: 100,
    frequencia: 100,
    carga_horaria: 32,
  });
  const socorros = curso?.disciplinas.find((item) => item.disciplina === "PRIMEIROS SOCORROS");
  expect(socorros).toMatchObject({
    notaobtida: 70,
    carga_horaria: 64,
  });
  const empresas = new Set(alunos.map((aluno) => aluno.codempresa));
  expect(empresas.has("GLE")).toBe(true);
  expect(empresas.has("GLT")).toBe(true);
  expect(alunos.length).toBeGreaterThan(1922);
}, 600_000);

function conflitosDe(alunos: readonly AlunoPlanilha[]) {
  const conflitos: Array<{ aluno: AlunoPlanilha["name"]; disciplinas: DisciplinaPlanilha[] }> = [];
  for (const aluno of alunos) {
    for (const curso of aluno.cursos) {
      const grupos = new Map<string, DisciplinaPlanilha[]>();
      for (const disciplina of curso.disciplinas) {
        const nome = disciplina.disciplina === null ? "" : String(disciplina.disciplina);
        const grupo = grupos.get(nome) ?? [];
        grupo.push(disciplina);
        grupos.set(nome, grupo);
      }
      for (const grupo of grupos.values()) {
        if (grupo.length > 1) conflitos.push({ aluno: aluno.name, disciplinas: grupo });
      }
    }
  }
  return conflitos;
}

function bytesDaPlanilha(linhas: unknown[][]): Uint8Array {
  const folha = utils.aoa_to_sheet(linhas);
  const livro = utils.book_new();
  utils.book_append_sheet(livro, folha, "Planilha1");
  const gerado: unknown = write(livro, { type: "array", bookType: "xlsx" });
  if (gerado instanceof Uint8Array) return gerado;
  if (gerado instanceof ArrayBuffer) return new Uint8Array(gerado);
  if (Array.isArray(gerado)) return Uint8Array.from(gerado as number[]);
  throw new Error("formato inesperado");
}
