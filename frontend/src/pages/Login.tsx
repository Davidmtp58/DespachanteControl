import { Layers3, ArrowRight, ClipboardCheck, Users, ChartNoAxesCombined } from "lucide-react";
export function Login({ entrar }: { entrar: () => void }) {
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
          <span className="preview-tag">DEMONSTRAÇÃO DO FRONTEND</span>
          <h2>Bem-vindo ao seu escritório</h2>
          <p className="muted">Acesse a prévia e conheça sua área de trabalho.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              entrar();
            }}
          >
            <label className="field">
              <span>E-mail</span>
              <input name="email" type="email" placeholder="seu@email.com" autoComplete="off" />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                name="password"
                type="password"
                placeholder="Digite sua senha"
                autoComplete="off"
              />
            </label>
            <button className="primary" type="submit">
              Entrar <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-note">
            <strong>Esta é uma prévia visual.</strong>
            <p>
              Não é necessário informar credenciais. O botão Entrar abre a demonstração, sem
              autenticação ou sessão. Os dados voltam ao estado inicial ao recarregar.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
