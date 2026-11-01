import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FRASE_TELA_NAVEGADOR } from "@conversor/contratos";

import { baixarArquivos, baixarLote, descartarLote, excluirArquivo, excluirArquivosProcessados, fecharLote, obterLinhas, obterLote, type Contagens, type Linha, type StatusLinha } from "../api.js";
import { esquecerLote, guardarLote } from "../loteAtual.js";
import { textoConversao, textoPagina } from "../selecao.js";

const VAZIAS: Contagens = { convertidos: 0, erros: 0, sem_codigo: 0, codigos_repetidos: 0, orfaos: 0 };
const ARQUIVO_RELACAO = "relacao.csv";
const TAMANHO_PAGINA = 200;

type Estado = "vazio" | "carregando" | "com_dados" | "sem_resultado" | "erro";
type Fase = "ocioso" | "carregando" | "pronto" | "erro";
type StatusLote = "recebendo" | "processando" | "concluido" | "erro" | "";

type LinhaVisivel = {
  arquivo_origem: string;
  arquivo_saida: string;
  status: StatusLinha;
  codigoDisciplina: string;
  uuid: string;
  diagnostico: string;
};

export function Arquivos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [texto, setTexto] = useState("");
  const [pagina, setPagina] = useState(1);
  const [linhas, setLinhas] = useState<LinhaVisivel[]>([]);
  const [totalFiltrado, setTotalFiltrado] = useState(0);
  const [contagens, setContagens] = useState<Contagens>(VAZIAS);
  const [lidos, setLidos] = useState(0);
  const [processados, setProcessados] = useState(0);
  const [statusLote, setStatusLote] = useState<StatusLote>("");
  const [fase, setFase] = useState<Fase>("ocioso");
  const [mensagem, setMensagem] = useState("");
  const [avisoDownload, setAvisoDownload] = useState("");
  const [marcas, setMarcas] = useState<ReadonlyMap<string, string>>(new Map());
  const [baixando, setBaixando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [linhaExcluir, setLinhaExcluir] = useState<LinhaVisivel | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [telas, setTelas] = useState<LinhaVisivel[]>([]);
  const carregouId = useRef<string | null>(null);
  const idVisto = useRef(id);
  const caixaTodas = useRef<HTMLInputElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);

  if (idVisto.current !== id) {
    idVisto.current = id;
    setTexto("");
    setPagina(1);
    setMarcas(new Map());
    setAvisoDownload("");
    setLinhaExcluir(null);
    setTelas([]);
  }

  useEffect(() => {
    if (id) guardarLote(id);
  }, [id]);

  useEffect(() => {
    if (!linhaExcluir) return undefined;
    botaoCancelar.current?.focus();
    const aoTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !excluindo) setLinhaExcluir(null);
    };
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [linhaExcluir, excluindo]);

  useEffect(() => {
    if (!id) {
      setFase("ocioso");
      setLinhas([]);
      setTotalFiltrado(0);
      setStatusLote("");
      setContagens(VAZIAS);
      setLidos(0);
      setProcessados(0);
      setMensagem("");
      setTelas([]);
      carregouId.current = null;
      return undefined;
    }
    let ativo = true;
    let seguindo = true;
    let geracao = 0;
    if (carregouId.current !== id) setFase("carregando");

    const consultar = async () => {
      const atual = ++geracao;
      try {
        const lote = await obterLote(id);
        if (!ativo || atual !== geracao) return;
        setLidos(lote.total);
        setProcessados(lote.processados);
        setContagens(lote.contagens);
        setStatusLote(lote.status);
        if (lote.status === "erro") {
          setFase("erro");
          setMensagem("O lote falhou ao publicar o resultado.");
          seguindo = false;
          carregouId.current = id;
          return;
        }
        const paginaResposta = await obterLinhas(id, texto, pagina);
        if (!ativo || atual !== geracao) return;
        setTotalFiltrado(paginaResposta.total);
        setLinhas(paginaResposta.linhas.map(linhaDaResposta));
        if (lote.status === "processando" || lote.status === "concluido") {
          try {
            const encontradas = await listarTelas(id);
            if (!ativo || atual !== geracao) return;
            setTelas(encontradas);
          } catch {
            if (!ativo || atual !== geracao) return;
            setTelas([]);
          }
        } else {
          setTelas([]);
        }
        setFase("pronto");
        carregouId.current = id;
        if (lote.status !== "recebendo" && lote.status !== "processando") seguindo = false;
      } catch (falha: unknown) {
        if (!ativo || atual !== geracao) return;
        seguindo = false;
        setFase("erro");
        setMensagem(falha instanceof Error ? falha.message : "Falha ao carregar o lote.");
        carregouId.current = id;
      }
    };

    void consultar();
    const relogio = setInterval(() => {
      if (seguindo) void consultar();
    }, 1000);
    return () => {
      ativo = false;
      clearInterval(relogio);
    };
  }, [id, texto, pagina]);

  const estado = estadoDaTela(Boolean(id), fase, linhas.length, texto);
  const paginas = Math.max(1, Math.ceil(totalFiltrado / TAMANHO_PAGINA));
  const selecionadasVisiveis = linhas.filter((linha) => marcas.has(linha.arquivo_origem));
  const todasMarcadas = linhas.length > 0 && selecionadasVisiveis.length === linhas.length;
  const mostraRelacao = statusLote === "concluido" && texto.trim() === "" && pagina === 1;

  useEffect(() => {
    const caixa = caixaTodas.current;
    if (!caixa) return;
    caixa.indeterminate = selecionadasVisiveis.length > 0 && selecionadasVisiveis.length < linhas.length;
  }, [linhas.length, selecionadasVisiveis.length]);

  function alternarSelecao(linha: LinhaVisivel) {
    setAvisoDownload("");
    setMarcas((atual) => {
      const proximo = new Map(atual);
      if (proximo.has(linha.arquivo_origem)) proximo.delete(linha.arquivo_origem);
      else proximo.set(linha.arquivo_origem, linha.arquivo_saida);
      return proximo;
    });
  }

  function alternarTodas() {
    setAvisoDownload("");
    setMarcas((atual) => {
      const proximo = new Map(atual);
      if (todasMarcadas) {
        for (const linha of linhas) proximo.delete(linha.arquivo_origem);
      } else {
        for (const linha of linhas) proximo.set(linha.arquivo_origem, linha.arquivo_saida);
      }
      return proximo;
    });
  }

  function saidasMarcadas(): string[] {
    const porOrigem = new Map(marcas);
    for (const linha of linhas) {
      if (porOrigem.has(linha.arquivo_origem)) porOrigem.set(linha.arquivo_origem, linha.arquivo_saida);
    }
    return [...porOrigem.values()].filter((saida) => saida.length > 0);
  }

  async function confirmarExclusao() {
    if (!id || !linhaExcluir || excluindo) return;
    const origem = linhaExcluir.arquivo_origem;
    setExcluindo(true);
    try {
      const lote = await excluirArquivo(id, origem);
      setLinhas((atuais) => atuais.filter((linha) => linha.arquivo_origem !== origem));
      setMarcas((atuais) => {
        const proximo = new Map(atuais);
        proximo.delete(origem);
        return proximo;
      });
      setContagens(lote.contagens);
      setLidos(lote.total);
      setProcessados(lote.processados);
      setLinhaExcluir(null);
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao excluir.");
      setLinhaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  }

  async function confirmarExclusaoDeTodos() {
    if (!id || !linhaExcluir || excluindo) return;
    setExcluindo(true);
    try {
      const lote = await excluirArquivosProcessados(id);
      setLinhas([]);
      setTotalFiltrado(0);
      setMarcas(new Map());
      setTexto("");
      setPagina(1);
      setContagens(lote.contagens);
      setLidos(lote.total);
      setProcessados(lote.processados);
      setLinhaExcluir(null);
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao excluir.");
      setLinhaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  }

  async function baixarCompleto() {
    if (!id || statusLote !== "concluido" || baixando) return;
    setBaixando(true);
    setAvisoDownload("");
    try {
      await baixarLote(id);
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao baixar.");
    } finally {
      setBaixando(false);
    }
  }

  async function baixarSelecionados() {
    if (!id || baixando) return;
    const nomes = saidasMarcadas();
    if (nomes.length === 0) {
      setAvisoDownload("A seleção não tem arquivo para baixar.");
      return;
    }
    setBaixando(true);
    setAvisoDownload("");
    try {
      await baixarArquivos(id, nomes);
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao baixar.");
    } finally {
      setBaixando(false);
    }
  }

  async function fecharChegou() {
    if (!id || fechando) return;
    setFechando(true);
    setAvisoDownload("");
    try {
      await fecharLote(id, []);
      setStatusLote("processando");
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao fechar.");
    } finally {
      setFechando(false);
    }
  }

  async function descartar() {
    if (!id || fechando) return;
    setFechando(true);
    setAvisoDownload("");
    try {
      await descartarLote(id);
      esquecerLote();
      navegar("/arquivos", { replace: true });
    } catch (falha: unknown) {
      setAvisoDownload(falha instanceof Error ? falha.message : "Falha ao descartar.");
      setFechando(false);
    }
  }

  return (
    <>
      <section className="metricas">
        <article className="cartao">
          <div>
            <small>LIDOS</small>
            <strong>{lidos}</strong>
          </div>
        </article>
        <article className="cartao">
          <div>
            <small>CONVERTIDOS</small>
            <strong>{contagens.convertidos}</strong>
          </div>
        </article>
        <article className="cartao">
          <div>
            <small>ERROS</small>
            <strong className="negativo">{contagens.erros}</strong>
          </div>
        </article>
        <article className="cartao">
          <div>
            <small>SEM CÓDIGO</small>
            <strong>{contagens.sem_codigo}</strong>
          </div>
        </article>
      </section>
      <div className="linha-titulo">
        <div>
          <p className="olho">RESULTADO DO LOTE</p>
          <h1>Arquivos processados</h1>
          {statusLote === "processando" ? <p className="resumo">{textoConversao(processados, lidos)}</p> : null}
        </div>
        <Link className="botao" to="/">
          + Novo upload
        </Link>
      </div>
      <section className="cartao painel" data-estado={estado}>
        <input
          className="busca"
          type="search"
          aria-label="Buscar pelo arquivo original, saída ou código"
          placeholder="Buscar pelo arquivo original, saída ou código"
          value={texto}
          onChange={(evento) => {
            setTexto(evento.currentTarget.value);
            setPagina(1);
          }}
        />
        {estado === "erro" ? <p className="vazio">{mensagem}</p> : null}
        {estado === "carregando" ? <p className="vazio">Carregando o lote.</p> : null}
        {estado === "vazio" ? <p className="vazio">Nenhum JSON convertido ainda.</p> : null}
        {estado === "sem_resultado" ? <p className="vazio">Nenhuma linha corresponde à busca.</p> : null}
        {estado === "com_dados" ? (
          <table>
            <thead>
              <tr>
                <th className="coluna-marca">
                  <input
                    ref={caixaTodas}
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={todasMarcadas}
                    onChange={alternarTodas}
                  />
                </th>
                <th>Arquivo original</th>
                <th>Saída</th>
                <th>Status</th>
                <th>Código</th>
                <th>UUID</th>
                <th>Motivo</th>
                <th className="coluna-lixeira">
                  <span className="somente-leitor">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {mostraRelacao ? (
                <tr>
                  <td className="coluna-marca" />
                  <td>{ARQUIVO_RELACAO}</td>
                  <td>{id ? <a href={`/api/lotes/${id}/arquivos/${ARQUIVO_RELACAO}`}>{ARQUIVO_RELACAO}</a> : ARQUIVO_RELACAO}</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="coluna-lixeira" />
                </tr>
              ) : null}
              {linhas.map((linha, indice) => (
                <tr key={`${linha.arquivo_origem}-${String(indice)}`}>
                  <td className="coluna-marca">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${linha.arquivo_origem}`}
                      checked={marcas.has(linha.arquivo_origem)}
                      onChange={() => alternarSelecao(linha)}
                    />
                  </td>
                  <td>{linha.arquivo_origem}</td>
                  <td>
                    {linha.arquivo_saida && id && statusLote === "concluido" ? (
                      <a href={`/api/lotes/${id}/arquivos/${encodeURIComponent(linha.arquivo_saida)}`}>{linha.arquivo_saida}</a>
                    ) : (
                      linha.arquivo_saida
                    )}
                  </td>
                  <td>
                    <span className={`pilula ${linha.status}`}>{rotuloSituacao(linha.status)}</span>
                  </td>
                  <td>{linha.codigoDisciplina}</td>
                  <td>{linha.uuid}</td>
                  <td>{textoMotivo(linha)}</td>
                  <td className="coluna-lixeira">
                    <button
                      type="button"
                      className="lixeira"
                      aria-label={`Excluir ${linha.arquivo_origem}`}
                      disabled={statusLote !== "concluido"}
                      onClick={() => setLinhaExcluir(linha)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {fase === "pronto" && totalFiltrado > TAMANHO_PAGINA ? (
          <div className="paginas">
            <button type="button" className="botao secundario" disabled={pagina <= 1} onClick={() => setPagina((atual) => atual - 1)}>
              Página anterior
            </button>
            <span>{textoPagina(pagina, paginas)}</span>
            <button
              type="button"
              className="botao secundario"
              disabled={pagina >= paginas}
              onClick={() => setPagina((atual) => atual + 1)}
            >
              Próxima página
            </button>
          </div>
        ) : null}
        {id && statusLote === "concluido" ? (
          <div className="acao-zip">
            <button type="button" className="botao" disabled={baixando} onClick={() => void baixarCompleto()}>
              Baixar zip do lote
            </button>
            <button type="button" className="botao secundario" disabled={marcas.size === 0 || baixando} onClick={() => void baixarSelecionados()}>
              Baixar seleção
            </button>
          </div>
        ) : null}
        {id && statusLote === "recebendo" ? (
          <div className="acao-zip">
            <button type="button" className="botao" disabled={fechando} onClick={() => void fecharChegou()}>
              Fechar com o que chegou
            </button>
            <button type="button" className="botao secundario" disabled={fechando} onClick={() => void descartar()}>
              Descartar lote
            </button>
          </div>
        ) : null}
        {avisoDownload ? <p className="aviso">{avisoDownload}</p> : null}
      </section>
      {telas.length > 0 ? (
        <section className="cartao painel" aria-label="Tela do navegador">
          <h2>Tela do navegador</h2>
          <p className="dica">A conversão seguiu. Estes arquivos têm imagem que parece a tela do navegador.</p>
          <table>
            <thead>
              <tr>
                <th>Arquivo original</th>
                <th>Saída</th>
                <th>Código</th>
              </tr>
            </thead>
            <tbody>
              {telas.map((linha, indice) => (
                <tr key={`tela-${linha.arquivo_origem}-${String(indice)}`}>
                  <td>{linha.arquivo_origem}</td>
                  <td>
                    {linha.arquivo_saida && id && statusLote === "concluido" ? (
                      <a href={`/api/lotes/${id}/arquivos/${encodeURIComponent(linha.arquivo_saida)}`}>{linha.arquivo_saida}</a>
                    ) : (
                      linha.arquivo_saida
                    )}
                  </td>
                  <td>{linha.codigoDisciplina}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {linhaExcluir ? (
        <div
          className="cortina"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget && !excluindo) setLinhaExcluir(null);
          }}
        >
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-exclusao">
            <h2 id="titulo-exclusao">Excluir arquivo</h2>
            <hr className="modal-separa" aria-hidden="true" />
            <div className="modal-corpo">
              <p className="modal-pergunta">Excluir {linhaExcluir.arquivo_origem}?</p>
              <p>Ele sai do lote e o texto convertido é apagado.</p>
            </div>
            <hr className="modal-separa" aria-hidden="true" />
            <div className="modal-acoes">
              <button type="button" className="botao" disabled={excluindo} onClick={() => void confirmarExclusaoDeTodos()}>
                Excluir todos
              </button>
              <div className="modal-acoes-fim">
                <button ref={botaoCancelar} type="button" className="botao secundario" disabled={excluindo} onClick={() => setLinhaExcluir(null)}>
                  Cancelar
                </button>
                <button type="button" className="botao" disabled={excluindo} onClick={() => void confirmarExclusao()}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function estadoDaTela(temId: boolean, fase: Fase, quantidade: number, texto: string): Estado {
  if (!temId) return "vazio";
  switch (fase) {
    case "carregando":
    case "ocioso":
      return "carregando";
    case "erro":
      return "erro";
    case "pronto":
      if (quantidade === 0 && texto) return "sem_resultado";
      if (quantidade === 0) return "vazio";
      return "com_dados";
    default: {
      const nunca: never = fase;
      return nunca;
    }
  }
}

function textoMotivo(linha: LinhaVisivel): string {
  const frases = linha.diagnostico.split("; ").filter((frase) => frase.length > 0 && !frase.startsWith("Bloco ignorado:"));
  if (linha.status !== "erro") return frases.filter((frase) => frase === FRASE_TELA_NAVEGADOR).join("; ");
  return frases.join("; ");
}

async function listarTelas(id: string): Promise<LinhaVisivel[]> {
  const encontradas: LinhaVisivel[] = [];
  let paginaAtual = 1;
  for (;;) {
    const resposta = await obterLinhas(id, FRASE_TELA_NAVEGADOR, paginaAtual);
    for (const linha of resposta.linhas) {
      const visivel = linhaDaResposta(linha);
      if (visivel.diagnostico.includes(FRASE_TELA_NAVEGADOR)) encontradas.push(visivel);
    }
    paginaAtual += 1;
    if ((paginaAtual - 1) * TAMANHO_PAGINA >= resposta.total || paginaAtual > 50) break;
  }
  return encontradas;
}

function linhaDaResposta(linha: Linha): LinhaVisivel {
  return {
    arquivo_origem: linha.arquivo_origem,
    arquivo_saida: linha.arquivo_saida,
    status: linha.status,
    codigoDisciplina: linha.codigoDisciplina,
    uuid: linha.uuid,
    diagnostico: linha.diagnostico ?? "",
  };
}

function rotuloSituacao(situacao: StatusLinha): string {
  switch (situacao) {
    case "convertendo":
      return "Convertendo";
    case "convertido":
      return "Convertido";
    case "sem_codigo":
      return "Sem código";
    case "erro":
      return "Erro";
    default: {
      const nunca: never = situacao;
      return nunca;
    }
  }
}
