import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ClipboardList,
  Clock3,
  ArrowRight,
} from "lucide-react";
import {
  contarStatus,
  moedaFinanceira as moeda,
  type DashboardResumo,
  type FinanceiroServico,
} from "../services/dashboard";
import { formatServicoDate as data } from "../services/servicos";
import { Badge, Empty } from "../components/ui";

export function Dashboard({
  resumo: totals,
  servicos,
  onAll,
}: {
  resumo: DashboardResumo;
  servicos: FinanceiroServico[];
  onAll: () => void;
}) {
  const statuses = contarStatus(servicos);
  const cards = [
    {
      label: "Receita total",
      value: moeda(totals.receita),
      note: "Valor recebido registrado nos serviços",
      icon: ArrowDownLeft,
    },
    {
      label: "Custos totais",
      value: moeda(totals.custos),
      note: "Despesas dos serviços",
      icon: ArrowUpRight,
    },
    {
      label: "Resultado líquido",
      value: moeda(totals.resultado),
      note: "Receita menos custos",
      icon: Wallet,
    },
    {
      label: "Total de serviços",
      value: totals.quantidade,
      note: "Todos os status",
      icon: ClipboardList,
    },
    { label: "Em andamento", value: totals.andamento, note: "Serviços em aberto", icon: Clock3 },
  ];
  const recentes = [...servicos]
    .sort((a, b) => b.inicio.localeCompare(a.inicio) || Number(b.id) - Number(a.id))
    .slice(0, 6);
  return (
    <>
      <div className="section-line">
        <span>
          <span className="live-dot" /> Resumo do escritório
        </span>
        <span>Todo o período</span>
      </div>
      <section className="stats-grid" aria-label="Indicadores financeiros e operacionais">
        {cards.map((c, i) => (
          <article
            className={"stat " + (i === 2 ? "featured" : "")}
            key={c.label}
            aria-label={c.label}
          >
            <div className="stat-top">
              <span>{c.label}</span>
              <c.icon size={18} />
            </div>
            <strong>{c.value}</strong>
            <span className="stat-note">{c.note}</span>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Serviços recentes</h2>
            <p className="muted">Serviços mais recentes pela data de início.</p>
          </div>
          <button className="text-button" onClick={onAll}>
            Ver todos <ArrowRight size={16} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente / início</th>
                <th>Placa</th>
                <th>Tipo de serviço</th>
                <th>Status</th>
                <th className="numeric">Recebido</th>
                <th className="numeric">Custo total</th>
                <th className="numeric">Resultado líquido</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.cliente}</strong>
                    <small>
                      {data(s.inicio)} · Serviço #{s.id}
                    </small>
                  </td>
                  <td>
                    <span className="plate">{s.placa}</span>
                  </td>
                  <td>{s.tipo}</td>
                  <td>
                    <Badge status={s.status} />
                  </td>
                  <td className="numeric">{moeda(s.recebido)}</td>
                  <td className="numeric muted">{moeda(s.custo)}</td>
                  <td
                    className={"numeric result " + (s.resultado.startsWith("-") ? "negative" : "")}
                  >
                    {moeda(s.resultado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!servicos.length && <Empty text="Nenhum serviço cadastrado." />}
        <div className="table-footer">
          {recentes.length} de {servicos.length} serviços<span>Ordenados pela data de início</span>
        </div>
      </section>
      <div className="dashboard-bottom">
        <div className="insight">
          <span className="insight-icon">
            <Wallet size={22} />
          </span>
          <div>
            <h3>Uma visão completa dos seus resultados</h3>
            <p>
              Todos os valores recebidos e despesas compõem os indicadores, inclusive os de serviços
              cancelados. Receita representa o valor recebido registrado no serviço, não um fluxo de
              caixa por data de pagamento.
            </p>
          </div>
        </div>
        <div className="small-summary" aria-label="Serviços por status">
          <span>Serviços por status</span>
          <p>Em andamento: {statuses.EM_ANDAMENTO}</p>
          <p>Concluídos: {statuses.CONCLUIDO}</p>
          <p>Cancelados: {statuses.CANCELADO}</p>
        </div>
      </div>
    </>
  );
}
