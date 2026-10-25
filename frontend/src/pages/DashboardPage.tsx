import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientesAuth } from "../services/clientes";
import {
  createDashboardClient,
  type DashboardResumo,
  type FinanceiroServico,
} from "../services/dashboard";
import { Dashboard } from "./Dashboard";
import { PageHeader } from "../components/ui";

export function DashboardPage({
  getCsrfToken,
  expireSession,
  onNew,
  onAll,
}: ClientesAuth & { onNew: () => void; onAll: () => void }) {
  const api = useMemo(
    () => createDashboardClient({ getCsrfToken, expireSession }),
    [getCsrfToken, expireSession],
  );
  const [dados, setDados] = useState<{ resumo: DashboardResumo; servicos: FinanceiroServico[] }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  async function load() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    setDados(undefined);
    try {
      const [resumo, servicos] = await Promise.all([api.resumo(), api.servicos()]);
      if (current === version.current) setDados({ resumo, servicos });
    } catch (e) {
      if (current === version.current) setError((e as Error).message);
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [api]);
  return (
    <>
      <PageHeader
        eyebrow="VISÃO GERAL"
        title="Tudo sob controle."
        subtitle="Acompanhe os serviços e os resultados do seu escritório."
        action="Novo serviço"
        onAction={onNew}
      />
      <div className="toolbar">
        <button className="secondary" disabled={loading} onClick={() => void load()}>
          Atualizar Dashboard
        </button>
      </div>
      {loading && <p role="status">Carregando indicadores financeiros…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && dados && (
        <Dashboard resumo={dados.resumo} servicos={dados.servicos} onAll={onAll} />
      )}
    </>
  );
}
