import { useEffect, useState } from "react";
import type { Cliente, Dados, DespesaServico, Pagina, Servico, Veiculo } from "./types";
import { gestaoService } from "./services/gestao";
import { Layout } from "./layouts/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Clientes, Veiculos } from "./pages/Cadastros";
import { Servicos } from "./pages/Servicos";
import { ServicoDetalhe } from "./pages/ServicoDetalhe";
import { Modal } from "./components/ui";
import { ClienteForm, DespesaForm, ServicoForm, VeiculoForm } from "./components/forms";
type Editor =
  | { kind: "cliente"; item?: Cliente; view?: boolean }
  | { kind: "veiculo"; item?: Veiculo; view?: boolean }
  | { kind: "servico"; item?: Servico }
  | { kind: "despesa"; item?: DespesaServico; servicoId: string };
export default function App() {
  const [entered, setEntered] = useState(false);
  const [pagina, setPagina] = useState<Pagina>("dashboard");
  const [dados, setDados] = useState<Dados>();
  const [editor, setEditor] = useState<Editor>();
  const [detailId, setDetailId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function refresh() {
    setDados(await gestaoService.carregar());
  }
  useEffect(() => {
    refresh().catch(() =>
      setError("Não foi possível carregar os dados demonstrativos. Recarregue a página."),
    );
  }, []);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function navigate(p: Pagina) {
    setPagina(p);
    setDetailId(undefined);
  }
  function detail(s: Servico) {
    setPagina("servicos");
    setDetailId(s.id);
  }
  async function saved(action: () => Promise<void>) {
    await action();
    await refresh();
    setEditor(undefined);
    setNotice("Alterações salvas nesta demonstração.");
  }
  if (!entered) return <Login entrar={() => setEntered(true)} />;
  if (!dados)
    return (
      <div className="loading" role="status">
        {error || "Carregando demonstração…"}
      </div>
    );
  const servico = dados.servicos.find((s) => s.id === detailId);
  const title = editor
    ? `${"view" in editor && editor.view ? "Visualizar" : editor.item ? "Editar" : editor.kind === "despesa" ? "Nova" : "Novo"} ${editor.kind === "veiculo" ? "veículo" : editor.kind === "servico" ? "serviço" : editor.kind}`
    : "";
  return (
    <Layout
      pagina={pagina}
      navigate={navigate}
      sair={() => {
        setEntered(false);
        navigate("dashboard");
      }}
    >
      {pagina === "dashboard" && (
        <Dashboard
          dados={dados}
          onNew={() => setEditor({ kind: "servico" })}
          onDetail={detail}
          onAll={() => navigate("servicos")}
        />
      )}
      {pagina === "clientes" && (
        <Clientes dados={dados} open={(item, view) => setEditor({ kind: "cliente", item, view })} />
      )}
      {pagina === "veiculos" && (
        <Veiculos dados={dados} open={(item, view) => setEditor({ kind: "veiculo", item, view })} />
      )}
      {pagina === "servicos" &&
        (servico ? (
          <ServicoDetalhe
            servico={servico}
            dados={dados}
            back={() => setDetailId(undefined)}
            edit={() => setEditor({ kind: "servico", item: servico })}
            expense={(item) => setEditor({ kind: "despesa", item, servicoId: servico.id })}
            remove={(id) => saved(() => gestaoService.removerDespesa(id))}
          />
        ) : (
          <Servicos
            dados={dados}
            open={(item) => setEditor({ kind: "servico", item })}
            detail={detail}
          />
        ))}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {editor && (
        <Modal
          title={title}
          subtitle="Ambiente de demonstração · dados em memória"
          onClose={() => setEditor(undefined)}
          wide={editor.kind === "servico"}
        >
          {editor.kind === "cliente" && (
            <ClienteForm
              item={editor.item}
              view={editor.view}
              close={() => setEditor(undefined)}
              save={(item) => saved(() => gestaoService.salvarCliente(item))}
            />
          )}
          {editor.kind === "veiculo" && (
            <VeiculoForm
              item={editor.item}
              view={editor.view}
              dados={dados}
              close={() => setEditor(undefined)}
              save={(item) => saved(() => gestaoService.salvarVeiculo(item))}
            />
          )}
          {editor.kind === "servico" && (
            <ServicoForm
              item={editor.item}
              dados={dados}
              close={() => setEditor(undefined)}
              save={(item) => saved(() => gestaoService.salvarServico(item))}
            />
          )}
          {editor.kind === "despesa" && (
            <DespesaForm
              item={editor.item}
              servicoId={editor.servicoId}
              close={() => setEditor(undefined)}
              save={(item) => saved(() => gestaoService.salvarDespesa(item))}
            />
          )}
        </Modal>
      )}
    </Layout>
  );
}
