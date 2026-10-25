import { useEffect, useState } from "react";
import { navigateUrl, paginaFromPath, useLocation } from "./navigation";
import type { Pagina } from "./types";
import { Layout } from "./layouts/Layout";
import { AuthGate, type AuthControls } from "./components/AuthGate";
import { DashboardPage } from "./pages/DashboardPage";
import { VeiculosPage } from "./pages/VeiculosPage";
import { ClientesPage } from "./pages/ClientesPage";
import { ServicosPage } from "./pages/ServicosPage";
import { DespesasPage } from "./pages/DespesasPage";

export default function App() {
  return <AuthGate>{(auth) => <Workspace {...auth} />}</AuthGate>;
}
function Workspace({ usuario, sair, saindo, getCsrfToken, expireSession }: AuthControls) {
  const { pathname } = useLocation();
  const pagina = paginaFromPath(pathname) ?? "dashboard";
  const [novoServico, setNovoServico] = useState(false);
  useEffect(() => {
    if (pagina !== "servicos") setNovoServico(false);
  }, [pagina]);
  function navigate(p: Pagina) {
    setNovoServico(false);
    navigateUrl(`/${p}`);
  }
  return (
    <Layout pagina={pagina} navigate={navigate} sair={sair} saindo={saindo} usuario={usuario}>
      {pagina === "dashboard" && (
        <DashboardPage
          getCsrfToken={getCsrfToken}
          expireSession={expireSession}
          onNew={() => {
            navigate("servicos");
            setNovoServico(true);
          }}
          onAll={() => navigate("servicos")}
        />
      )}
      {pagina === "clientes" && (
        <ClientesPage getCsrfToken={getCsrfToken} expireSession={expireSession} />
      )}
      {pagina === "veiculos" && (
        <VeiculosPage getCsrfToken={getCsrfToken} expireSession={expireSession} />
      )}
      {pagina === "servicos" && (
        <ServicosPage
          getCsrfToken={getCsrfToken}
          expireSession={expireSession}
          createOnMount={novoServico}
        />
      )}
      {pagina === "despesas" && (
        <DespesasPage getCsrfToken={getCsrfToken} expireSession={expireSession} />
      )}
    </Layout>
  );
}
