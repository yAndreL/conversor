import { percorrerLinhasXlsx } from "./lerXlsx.js";

export type ValorPlanilha = string | number | null;

export type DisciplinaPlanilha = {
  disciplina: ValorPlanilha;
  modulo: ValorPlanilha;
  status_disciplina: ValorPlanilha;
  notaobtida: ValorPlanilha;
  frequencia: ValorPlanilha;
  carga_horaria: ValorPlanilha;
};

export type CursoPlanilha = {
  curso: ValorPlanilha;
  status_curso: ValorPlanilha;
  data_inicio: ValorPlanilha;
  data_limite: ValorPlanilha;
  opcaoestagio: ValorPlanilha;
  estagio_notaobtida: ValorPlanilha;
  sistec_codigo: ValorPlanilha;
  sistec_autenticacao: ValorPlanilha;
  cert_emissao: ValorPlanilha;
  disciplinas: DisciplinaPlanilha[];
};

export type AlunoPlanilha = {
  codempresa: ValorPlanilha;
  name: ValorPlanilha;
  nome_social: ValorPlanilha;
  email: ValorPlanilha;
  datanasc: ValorPlanilha;
  estado_civil: ValorPlanilha;
  sexo: ValorPlanilha;
  cpf: ValorPlanilha;
  rg: ValorPlanilha;
  celular: ValorPlanilha;
  nacionalidade: ValorPlanilha;
  naturalidade: ValorPlanilha;
  rua: ValorPlanilha;
  numero: ValorPlanilha;
  complemento: ValorPlanilha;
  cep: ValorPlanilha;
  bairro: ValorPlanilha;
  cidade: ValorPlanilha;
  estado: ValorPlanilha;
  país: ValorPlanilha;
  mae: ValorPlanilha;
  pai: ValorPlanilha;
  cursos: CursoPlanilha[];
};

const CAMPOS_ALUNO = [
  "codempresa",
  "name",
  "nome_social",
  "email",
  "datanasc",
  "estado_civil",
  "sexo",
  "cpf",
  "rg",
  "celular",
  "nacionalidade",
  "naturalidade",
  "rua",
  "numero",
  "complemento",
  "cep",
  "bairro",
  "cidade",
  "estado",
  "país",
  "mae",
  "pai",
] as const;

const CAMPOS_CURSO = [
  "curso",
  "status_curso",
  "data_inicio",
  "data_limite",
  "opcaoestagio",
  "estagio_notaobtida",
  "sistec_codigo",
  "sistec_autenticacao",
  "cert_emissao",
] as const;

const CAMPOS_DISCIPLINA = ["disciplina", "modulo", "status_disciplina", "notaobtida", "frequencia", "carga_horaria"] as const;

const COLUNAS_DATA = new Set<string>(["datanasc", "data_inicio", "data_limite", "cert_emissao"]);
const COLUNAS_NOTA = new Set<string>(["notaobtida", "estagio_notaobtida", "frequencia"]);
const DIA_MS = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

type CursoMontado = {
  dados: CursoPlanilha;
  vistos: Set<string>;
};

type AlunoMontado = {
  dados: AlunoPlanilha;
  cursos: Map<string, CursoMontado>;
};

export function ehPlanilhaExcel(nome: string): boolean {
  return nome.toLowerCase().endsWith(".xlsx");
}

export function nomeJsonDaPlanilha(nome: string): string {
  return nome.replace(/\.xlsx$/i, ".json");
}

export function hierarquizarAlunos(linhas: readonly Record<string, unknown>[]): AlunoPlanilha[] {
  const grupo = criarAgrupamento();
  for (const linha of linhas) {
    if (linha) grupo.adicionar(linha);
  }
  return grupo.finalizar();
}

function criarAgrupamento() {
  const alunos = new Map<string, AlunoMontado>();
  let indice = 0;
  return {
    adicionar(bruto: Record<string, unknown>) {
      const atual = indice;
      indice += 1;
      const registro = registroLimpo(bruto);
      if (linhaVazia(registro)) return;
      const chave = chaveDoAluno(registro, atual);
      let aluno = alunos.get(chave);
      if (!aluno) {
        aluno = { dados: alunoVazio(), cursos: new Map() };
        alunos.set(chave, aluno);
      }
      completarAluno(aluno.dados, registro);
      if (!temCurso(registro)) return;
      const chaveCurso = chaveDoCurso(registro.curso ?? null);
      let curso = aluno.cursos.get(chaveCurso);
      if (!curso) {
        curso = { dados: cursoVazio(), vistos: new Set() };
        aluno.cursos.set(chaveCurso, curso);
        aluno.dados.cursos.push(curso.dados);
      }
      completarCurso(curso.dados, registro);
      if (!temDisciplina(registro)) return;
      const disciplina = disciplinaDe(registro);
      const assinatura = JSON.stringify([
        disciplina.disciplina,
        disciplina.modulo,
        disciplina.status_disciplina,
        disciplina.notaobtida,
        disciplina.frequencia,
        disciplina.carga_horaria,
      ]);
      if (curso.vistos.has(assinatura)) return;
      curso.vistos.add(assinatura);
      curso.dados.disciplinas.push(disciplina);
    },
    finalizar(): AlunoPlanilha[] {
      return [...alunos.values()].map((aluno) => aluno.dados);
    },
  };
}

export async function lerPlanilhaAlunos(
  conteudo: ArrayBuffer | Uint8Array,
  aoProgredir?: (linhasLidas: number) => void,
): Promise<AlunoPlanilha[]> {
  const grupo = criarAgrupamento();
  await percorrerLinhasXlsx(conteudo, (linha) => grupo.adicionar(linha), {
    aoProgredir,
    nomeDaColuna: nomeColuna,
  });
  const alunos = grupo.finalizar();
  if (alunos.length === 0) throw new Error("A planilha não tem alunos.");
  return alunos;
}

function registroLimpo(bruto: Record<string, unknown>): Record<string, ValorPlanilha> {
  const saida: Record<string, ValorPlanilha> = {};
  for (const [coluna, valor] of Object.entries(bruto)) {
    const nome = nomeColuna(coluna.trim());
    if (!nome) continue;
    saida[nome] = limparValor(valor, nome);
  }
  return saida;
}

function limparValor(valor: unknown, coluna: string): ValorPlanilha {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return dataDeDate(valor);
  }
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    if (COLUNAS_DATA.has(coluna)) return dataDeSerieExcel(valor);
    if (COLUNAS_NOTA.has(coluna)) return valor;
    return valor;
  }
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  if (texto === "" || texto.toUpperCase() === "NULL") return null;
  if (COLUNAS_DATA.has(coluna) && /^-?\d+(\.\d+)?$/.test(texto)) return dataDeSerieExcel(Number(texto));
  if (COLUNAS_NOTA.has(coluna) && /^-?\d+(\.\d+)?$/.test(texto)) return Number(texto);
  return texto;
}

function dataDeSerieExcel(serie: number): string {
  return new Date(EPOCA_EXCEL + Math.round(serie) * DIA_MS).toISOString().slice(0, 10);
}

function dataDeDate(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${String(data.getFullYear())}-${mes}-${dia}`;
}

const APELIDOS: Record<string, string> = {
  codempresa: "codempresa",
  empresa: "codempresa",
  name: "name",
  aluno: "name",
  nome_social: "nome_social",
  email: "email",
  datanasc: "datanasc",
  estado_civil: "estado_civil",
  stado_civil: "estado_civil",
  sexo: "sexo",
  cpf: "cpf",
  rg: "rg",
  celular: "celular",
  nacionalidade: "nacionalidade",
  naturalidade: "naturalidade",
  rua: "rua",
  numero: "numero",
  complemento: "complemento",
  cep: "cep",
  bairro: "bairro",
  cidade: "cidade",
  estado: "estado",
  país: "país",
  pais: "país",
  mae: "mae",
  pai: "pai",
  curso: "curso",
  status_curso: "status_curso",
  data_inicio: "data_inicio",
  data_limite: "data_limite",
  data_termino_limite: "data_limite",
  opcaoestagio: "opcaoestagio",
  opcao_estagio: "opcaoestagio",
  estagio_notaobtida: "estagio_notaobtida",
  sistec_codigo: "sistec_codigo",
  sistec_autenticacao: "sistec_autenticacao",
  cert_emissao: "cert_emissao",
  ert_emissao: "cert_emissao",
  disciplina: "disciplina",
  modulo: "modulo",
  status_disciplina: "status_disciplina",
  notaobtida: "notaobtida",
  aproveitamento: "notaobtida",
  frequencia: "frequencia",
  carga_horaria: "carga_horaria",
};

function nomeColuna(coluna: string): string {
  const nome = coluna.trim();
  return APELIDOS[nome.toLowerCase()] ?? nome;
}

function linhaVazia(registro: Record<string, ValorPlanilha>): boolean {
  return Object.values(registro).every((valor) => valor === null);
}

function temDisciplina(registro: Record<string, ValorPlanilha>): boolean {
  return CAMPOS_DISCIPLINA.some((campo) => registro[campo] != null);
}

function temCurso(registro: Record<string, ValorPlanilha>): boolean {
  return CAMPOS_CURSO.some((campo) => registro[campo] != null) || temDisciplina(registro);
}

function chaveDoAluno(registro: Record<string, ValorPlanilha>, indice: number): string {
  const cpf = registro.cpf;
  if (typeof cpf === "string" || typeof cpf === "number") return `cpf:${String(cpf)}`;
  const email = typeof registro.email === "string" ? registro.email : "";
  const nome = typeof registro.name === "string" ? registro.name : "";
  if (email !== "" || nome !== "") return `pessoa:${email}|${nome}`;
  return `linha:${String(indice)}`;
}

function chaveDoCurso(curso: ValorPlanilha): string {
  if (curso === null) return "sem-curso";
  return `${typeof curso}:${String(curso)}`;
}

function completarAluno(aluno: AlunoPlanilha, origem: Record<string, ValorPlanilha>) {
  for (const campo of CAMPOS_ALUNO) {
    const valor = origem[campo];
    if (aluno[campo] === null && valor != null) aluno[campo] = valor;
  }
}

function completarCurso(curso: CursoPlanilha, origem: Record<string, ValorPlanilha>) {
  for (const campo of CAMPOS_CURSO) {
    const valor = origem[campo];
    if (curso[campo] === null && valor != null) curso[campo] = valor;
  }
}

function disciplinaDe(registro: Record<string, ValorPlanilha>): DisciplinaPlanilha {
  return {
    disciplina: registro.disciplina ?? null,
    modulo: registro.modulo ?? null,
    status_disciplina: registro.status_disciplina ?? null,
    notaobtida: registro.notaobtida ?? null,
    frequencia: registro.frequencia ?? null,
    carga_horaria: registro.carga_horaria ?? null,
  };
}

function alunoVazio(): AlunoPlanilha {
  return {
    codempresa: null,
    name: null,
    nome_social: null,
    email: null,
    datanasc: null,
    estado_civil: null,
    sexo: null,
    cpf: null,
    rg: null,
    celular: null,
    nacionalidade: null,
    naturalidade: null,
    rua: null,
    numero: null,
    complemento: null,
    cep: null,
    bairro: null,
    cidade: null,
    estado: null,
    país: null,
    mae: null,
    pai: null,
    cursos: [],
  };
}

function cursoVazio(): CursoPlanilha {
  return {
    curso: null,
    status_curso: null,
    data_inicio: null,
    data_limite: null,
    opcaoestagio: null,
    estagio_notaobtida: null,
    sistec_codigo: null,
    sistec_autenticacao: null,
    cert_emissao: null,
    disciplinas: [],
  };
}
