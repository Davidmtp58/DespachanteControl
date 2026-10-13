import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  CarFront,
  ClipboardList,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  ArrowUpRight,
  Layers3,
} from "lucide-react";
import type { Pagina } from "../types";
const links = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "veiculos", label: "Veículos", icon: CarFront },
  { id: "servicos", label: "Serviços", icon: ClipboardList },
] as const;
export function Layout({
  pagina,
  navigate,
  sair,
  children,
}: {
  pagina: Pagina;
  navigate: (p: Pagina) => void;
  sair: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Ir para conteúdo
      </a>
      {open && (
        <button
          aria-label="Fechar menu"
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-symbol">
            <Layers3 size={23} />
          </span>
          <div>
            Despachante<span>Control</span>
          </div>
          <button
            className="mobile-only icon-button"
            aria-label="Fechar navegação"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <p className="nav-caption">ÁREA DE TRABALHO</p>
        <nav>
          {links.map((item) => (
            <button
              key={item.id}
              className={pagina === item.id ? "nav-item active" : "nav-item"}
              aria-current={pagina === item.id ? "page" : undefined}
              onClick={() => {
                navigate(item.id);
                setOpen(false);
              }}
            >
              <item.icon size={19} />
              {item.label}
              {pagina === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <span className="demo-dot" />
            Ambiente de demonstração<p>Explore a gestão do seu escritório com dados fictícios.</p>
            <span className="demo-caption">
              Alterações temporárias <ArrowUpRight size={13} />
            </span>
          </div>
          <button className="exit" onClick={sair}>
            <LogOut size={17} />
            Voltar ao login
          </button>
          <div className="sidebar-footer">
            DespachanteControl <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Abrir navegação"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <PanelLeftClose className="desktop-only" size={18} />
            <span className="desktop-only">Workspace</span>
            <span className="slash">/</span>
            <strong>{links.find((l) => l.id === pagina)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="preview-tag">Prévia local</span>
            <span className="avatar">DC</span>
            <div className="desktop-only user-label">
              <strong>Meu escritório</strong>
              <span>Modo demonstração</span>
            </div>
          </div>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="main-footer">
          <span>DespachanteControl · Gestão documental</span>
          <span>Dados demonstrativos · Sem conexão com o banco</span>
        </footer>
      </div>
    </div>
  );
}
