import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  CarFront,
  ClipboardList,
  Receipt,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  ArrowUpRight,
  Layers3,
} from "lucide-react";
import type { Usuario } from "../services/auth";
import type { Pagina } from "../types";
const links = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "veiculos", label: "Veículos", icon: CarFront },
  { id: "servicos", label: "Serviços", icon: ClipboardList },
  { id: "despesas", label: "Despesas", icon: Receipt },
] as const;
export function Layout({
  pagina,
  navigate,
  sair,
  saindo,
  usuario,
  children,
}: {
  pagina: Pagina;
  navigate: (p: Pagina) => void;
  sair: () => void;
  saindo: boolean;
  usuario: Usuario;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cadastro =
    pagina === "clientes"
      ? "Clientes"
      : pagina === "veiculos"
        ? "Veículos"
        : pagina === "despesas"
          ? "Despesas"
          : pagina === "dashboard"
            ? "Dashboard"
            : "Serviços";
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
            {cadastro} · Dados reais
            <p>Informações consultadas no sistema.</p>
            <span className="demo-caption">
              Dados persistentes <ArrowUpRight size={13} />
            </span>
          </div>
          <button className="exit" onClick={sair} disabled={saindo}>
            <LogOut size={17} />
            {saindo ? "Saindo…" : "Sair"}
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
              <strong>{usuario.nome}</strong>
              <span>{cadastro} · Dados reais</span>
            </div>
          </div>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="main-footer">
          <span>DespachanteControl · Gestão documental</span>
          <span>{cadastro} · Dados do sistema</span>
        </footer>
      </div>
    </div>
  );
}
