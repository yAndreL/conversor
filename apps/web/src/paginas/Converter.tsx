import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  FRASE_ENVIO,
  LIMITES_PADRAO,
  fraseSelecao,
  formatarInteiro,
  formatarTamanho,
  type LimitesContrato,
} from "@conversor/contratos";

import { criarLote, descartarLote, fecharLote, obterLimites } from "../api.js";
import { esquecerLote, guardarLote } from "../loteAtual.js";
import {
  contarArquivos,
  montarEnvios,
  montarFatias,
  separarSelecao,
  textoEnvio,
  textoResumo,
  textoRetidos,
  type FalhaPagina,
  type FatiaEnvio,
} from "../selecao.js";
import { enviarFatias, type ResultadoFatias } from "../subida.js";

type Estado = "vazio" | "selecionado" | "enviando" | "retidos" | "lote_cheio" | "erro";

export function Converter() {
  const navegar = useNavigate();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [estado, setEstado] = useState<Estado>("vazio");
  const [mensagem, setMensagem] = useState("");
  const [limites, setLimites] = useState<LimitesContrato>({ ...LIMITES_PADRAO });
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [loteId, setLoteId] = useState("");
  const [falhasPagina, setFalhasPagina] = useState<FalhaPagina[]>([]);
  const [retidos, setRetidos] = useState<FatiaEnvio[]>([]);
  const [falhasCheio, setFalhasCheio] = useState<FalhaPagina[]>([]);

  useEffect(() => {
    let ativo = true;
    obterLimites()
      .then((lidos) => {
        if (ativo) setLimites(lidos);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  const separado = separarSelecao(arquivos, limites.maxBytesArquivo);
  const enviosPrevistos = montarEnvios(separado.enviar, limites).length;
  const bytesSelecao = arquivos.reduce((soma, arquivo) => soma + arquivo.size, 0);

  function adicionar(lista: FileList | readonly File[]) {
    if (estado === "enviando" || estado === "retidos" || estado === "lote_cheio") return;
    const recebidos = [...lista];
    if (recebidos.length === 0) return;
    if (arquivos.length + recebidos.length > limites.maxArquivosSelecao) {
      setMensagem(fraseSelecao(limites.maxArquivosSelecao));
      return;
    }
    setArquivos([...arquivos, ...recebidos]);
    setEstado("selecionado");
    setMensagem("");
  }

  function aoSoltar(evento: DragEvent<HTMLFormElement>) {
    evento.preventDefault();
    evento.currentTarget.classList.remove("arrastando");
    adicionar(evento.dataTransfer.files);
  }

  function aoTecla(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key !== "Enter" && evento.key !== " ") return;
    evento.preventDefault();
    entrada.current?.click();
  }

  async function fecharEAbrir(id: string, falhas: FalhaPagina[]) {
    await fecharLote(id, falhas);
    guardarLote(id);
    navegar(`/arquivos/${id}`);
  }

  function aplicarSubida(id: string, subida: ResultadoFatias, falhas: FalhaPagina[]) {
    switch (subida.tipo) {
      case "ok":
        return fecharEAbrir(id, falhas);
      case "retidos":
        setRetidos(subida.envios);
        setEstado("retidos");
        setMensagem(textoRetidos(contarArquivos(subida.envios), subida.envios.length));
        return undefined;
      case "limite_lote":
        setRetidos(subida.retidos);
        setFalhasCheio(
          subida.arquivos.map((arquivo) => ({
            arquivo_origem: arquivo.name,
            motivo: "limite_lote",
            diagnostico: subida.mensagem,
          })),
        );
        setEstado("lote_cheio");
        setMensagem(subida.mensagem);
        return undefined;
      case "erro":
        setEstado("erro");
        setMensagem(subida.mensagem);
        return undefined;
      default: {
        const nunca: never = subida;
        return nunca;
      }
    }
  }

  async function converter() {
    if (arquivos.length === 0 || estado === "enviando" || estado === "retidos" || estado === "lote_cheio") return;
    const partes = separarSelecao(arquivos, limites.maxBytesArquivo);
    const fatias = montarFatias(partes.enviar, limites);
    setFalhasPagina(partes.falhas);
    setFalhasCheio([]);
    setRetidos([]);
    setProgresso({ atual: fatias.length === 0 ? 0 : 1, total: fatias.length });
    setEstado("enviando");
    setMensagem("");
    try {
      const criado = await criarLote();
      guardarLote(criado.id);
      setLoteId(criado.id);
      if (fatias.length === 0) {
        await fecharEAbrir(criado.id, partes.falhas);
        return;
      }
      const subida = await enviarFatias(criado.id, fatias, (atual, total) => {
        setProgresso({ atual, total });
      });
      await aplicarSubida(criado.id, subida, partes.falhas);
    } catch (falha: unknown) {
      setEstado(arquivos.length > 0 ? "erro" : "vazio");
      setMensagem(falha instanceof Error ? falha.message : "Falha ao enviar.");
    }
  }

  async function reenviar() {
    if (!loteId || retidos.length === 0 || estado !== "retidos") return;
    setProgresso({ atual: 1, total: retidos.length });
    setEstado("enviando");
    setMensagem("");
    try {
      const subida = await enviarFatias(loteId, retidos, (atual, total) => {
        setProgresso({ atual, total });
      });
      await aplicarSubida(loteId, subida, falhasPagina);
    } catch (falha: unknown) {
      setEstado("erro");
      setMensagem(falha instanceof Error ? falha.message : "Falha ao enviar.");
    }
  }

  async function fecharChegou() {
    if (!loteId || estado === "enviando") return;
    const estadoAtual = estado;
    const falhasEnvio = retidos.flatMap((fatia) =>
      fatia.arquivos.map((arquivo) => ({
        arquivo_origem: arquivo.name,
        motivo: "envio" as const,
        diagnostico: FRASE_ENVIO,
      })),
    );
    setProgresso({ atual: 0, total: 0 });
    setEstado("enviando");
    try {
      await fecharEAbrir(loteId, [...falhasPagina, ...falhasEnvio, ...falhasCheio]);
    } catch (falha: unknown) {
      setEstado(estadoAtual);
      setMensagem(falha instanceof Error ? falha.message : "Falha ao fechar.");
    }
  }

  async function descartar() {
    if (!loteId || estado === "enviando") return;
    try {
      await descartarLote(loteId);
      esquecerLote();
      setLoteId("");
      setRetidos([]);
      setFalhasCheio([]);
      setEstado(arquivos.length > 0 ? "selecionado" : "vazio");
      setMensagem("");
    } catch (falha: unknown) {
      setMensagem(falha instanceof Error ? falha.message : "Falha ao descartar.");
    }
  }

  const podeConverter = arquivos.length > 0 && (estado === "selecionado" || estado === "erro");
  const rotulo =
    estado === "enviando" && progresso.total > 0
      ? textoEnvio(progresso.atual, progresso.total)
      : arquivos.length > 0
        ? `Converter agora (${formatarInteiro(arquivos.length)})`
        : "Converter agora";

  return (
    <>
      <section className="centro">
        <p className="selo">CONVERSOR LOCAL</p>
        <h1>Converter JSON para TXT</h1>
        <p className="subtitulo">Envie os arquivos JSON e receba o texto convertido de cada um, pronto para baixar.</p>
      </section>
      <form
        className="cartao zona"
        data-estado={estado}
        onDragOver={(evento) => {
          evento.preventDefault();
          evento.currentTarget.classList.add("arrastando");
        }}
        onDragLeave={(evento) => evento.currentTarget.classList.remove("arrastando")}
        onDrop={aoSoltar}
        onSubmit={(evento) => {
          evento.preventDefault();
          void converter();
        }}
      >
        <div className="icone-zona" role="button" tabIndex={0} aria-label="Solte os arquivos JSON aqui" onKeyDown={aoTecla}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="1.8" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" />
          </svg>
        </div>
        <div className="acoes-zona">
          <label className="botao secundario">
            + Selecionar arquivos
            <input
              ref={entrada}
              className="arquivo"
              type="file"
              name="arquivos"
              accept=".json,application/json"
              multiple
              onChange={(evento) => {
                if (evento.currentTarget.files) adicionar(evento.currentTarget.files);
                evento.currentTarget.value = "";
              }}
            />
          </label>
          <button className="botao" type="submit" disabled={!podeConverter}>
            {rotulo}
          </button>
        </div>
        <p className="dica">
          ou solte os arquivos <strong>.json</strong> aqui
        </p>
        {mensagem ? <p className="aviso">{mensagem}</p> : null}
        {arquivos.length > 0 && arquivos.length <= 50 ? (
          <table className="tabela-selecao">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tamanho</th>
              </tr>
            </thead>
            <tbody>
              {arquivos.map((arquivo, indice) => (
                <tr key={`${arquivo.name}-${String(indice)}`}>
                  <td>{arquivo.name}</td>
                  <td>{formatarTamanho(arquivo.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {arquivos.length >= 51 ? <p className="resumo">{textoResumo(arquivos.length, bytesSelecao, enviosPrevistos)}</p> : null}
        {estado === "retidos" ? (
          <div className="acao-zip">
            <button className="botao" type="button" onClick={() => void reenviar()}>
              Reenviar envios
            </button>
            <button className="botao secundario" type="button" onClick={() => void fecharChegou()}>
              Fechar com o que chegou
            </button>
            <button className="botao secundario" type="button" onClick={() => void descartar()}>
              Descartar lote
            </button>
          </div>
        ) : null}
        {estado === "lote_cheio" ? (
          <div className="acao-zip">
            <button className="botao" type="button" onClick={() => void fecharChegou()}>
              Fechar com o que chegou
            </button>
            <button className="botao secundario" type="button" onClick={() => void descartar()}>
              Descartar lote
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
