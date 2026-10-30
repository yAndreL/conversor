import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useLoteAtual } from "./loteAtual.js";
import { Arquivos } from "./paginas/Arquivos.js";
import { Converter } from "./paginas/Converter.js";

function AbrirUltimoLote() {
  const id = useLoteAtual();
  if (id) return <Navigate to={`/arquivos/${id}`} replace />;
  return <Arquivos />;
}

export function App() {
  const loteAtual = useLoteAtual();
  const destinoArquivos = loteAtual ? `/arquivos/${loteAtual}` : "/arquivos";
  return (
    <>
      <header className="topo">
        <Link className="marca" to="/">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#E53935" aria-hidden="true">
            <path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
          </svg>
          Conversor
        </Link>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "ativo" : undefined)}>
            Converter JSON/HTML
          </NavLink>
          <NavLink to={destinoArquivos} className={({ isActive }) => (isActive ? "ativo" : undefined)}>
            Arquivos Processados
          </NavLink>
        </nav>
      </header>
      <main className="miolo">
        <Routes>
          <Route path="/" element={<Converter />} />
          <Route path="/arquivos" element={<AbrirUltimoLote />} />
          <Route path="/arquivos/:id" element={<Arquivos />} />
        </Routes>
      </main>
      <footer className="rodape">
        <span>Conversor · processamento local</span>
        <span>Hotsystems · :)</span>
      </footer>
    </>
  );
}
