import { Layers3, ArrowRight, ClipboardCheck, Users, ChartNoAxesCombined } from "lucide-react";
import { useState } from "react";
export function Login({
  entrar,
  busy,
  message,
}: {
  entrar: (email: string, senha: string) => Promise<void>;
  busy: boolean;
  message: string;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  return (
    <div className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-symbol">
            <Layers3 size={24} />
          </span>
          <div>
            Despachante<span>Control</span>
          </div>
        </div>
        <div className="login-message">
          <p className="eyebrow">MAIS ORGANIZAÇÃO. MAIS CONTROLE.</p>
          <h1>
            Seu escritório,
            <br />
            em boas mãos.
          </h1>
          <p>
            Clientes, veículos e serviços em um só lugar. Clareza para cuidar de cada etapa do seu
            trabalho.
          </p>
          <div className="login-benefits">
            <span>
              <Users size={20} />
              Relacionamentos organizados
            </span>
            <span>
              <ClipboardCheck size={20} />
              Serviços sempre à vista
            </span>
            <span>
              <ChartNoAxesCombined size={20} />
              Resultados com transparência
            </span>
          </div>
        </div>
        <p className="login-copyright">DespachanteControl · Gestão documental simplificada</p>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="preview-tag">ACESSO AO SISTEMA</span>
          <h2>Bem-vindo ao seu escritório</h2>
          <p className="muted">Entre com sua conta para acessar sua área de trabalho.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await entrar(email.trim(), senha);
              } finally {
                setSenha("");
              }
            }}
          >
            <label className="field">
              <span>E-mail</span>
              <input
                name="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                name="password"
                type="password"
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={busy}
              />
            </label>
            {message && (
              <p className="error" role="alert">
                {message}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Entrando…" : "Entrar"} <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-note">
            <strong>Autenticação, Clientes, Veículos e Serviços integrados.</strong>
            <p>
              Use sua conta cadastrada. Clientes, Veículos e Serviços utilizam dados reais.
              Dashboard financeiro integrado aos dados do sistema.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
