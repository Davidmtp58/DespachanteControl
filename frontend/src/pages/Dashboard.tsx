import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ClipboardList,
  Clock3,
  ArrowRight,
} from "lucide-react";
import type { Dados, Servico } from "../types";
import { financeiro, indicadores, moeda, data } from "../services/financeiro";
import { Badge, Empty, PageHeader } from "../components/ui";
export function Dashboard({
  dados,
  onNew,
  onDetail,
  onAll,
}: {
  dados: Dados;
  onNew: () => void;
  onDetail: (s: Servico) => void;
  onAll: () => void;
}) {
  const totals = indicadores(dados);
  const cards = [
    {
      label: "Receita total",
      value: moeda(totals.receita),
      note: "Valores recebidos",
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
  const recentes = [...dados.servicos].sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 6);
  return (
    <>
      <PageHeader
        eyebrow="VISÃO GERAL"
        title="Tudo sob controle."
        subtitle="Acompanhe os serviços e os resultados do seu escritório."
        action="Novo serviço"
        onAction={onNew}
      />
      <div className="section-line">
        <span>
          <span className="live-dot" />
          Resumo do escritório
        </span>
        <span>Todo o período</span>
      </div>
      <section className="stats-grid" aria-label="Indicadores financeiros e operacionais">
        {cards.map((c, i) => (
          <article className={`stat ${i === 2 ? "featured" : ""}`} key={c.label}>
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
            <p className="muted">Os últimos movimentos do seu escritório.</p>
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
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((s) => {
                const f = financeiro(s, dados.despesas);
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{dados.clientes.find((c) => c.id === s.clienteId)?.nome}</strong>
                      <small>{data(s.inicio)}</small>
                    </td>
                    <td>
                      <span className="plate">
                        {dados.veiculos.find((v) => v.id === s.veiculoId)?.placa}
                      </span>
                    </td>
                    <td>{dados.tiposServico.find((t) => t.id === s.tipoServicoId)?.nome}</td>
                    <td>
                      <Badge status={s.status} />
                    </td>
                    <td className="numeric">{moeda(f.recebido)}</td>
                    <td className="numeric muted">{moeda(f.custo)}</td>
                    <td className={`numeric result ${f.resultado < 0 ? "negative" : ""}`}>
                      {moeda(f.resultado)}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Detalhes do serviço de ${dados.clientes.find((c) => c.id === s.clienteId)?.nome}`}
                        onClick={() => onDetail(s)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!recentes.length && <Empty />}
        <div className="table-footer">
          {recentes.length} de {totals.quantidade} serviços
          <span>Ordenados pela data de início</span>
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
              cancelados.
            </p>
          </div>
        </div>
        <div className="small-summary">
          <span>Organização que faz a diferença</span>
          <strong>
            {dados.clientes.length} clientes <span>·</span> {dados.veiculos.length} veículos
          </strong>
          <p>Seu escritório conectado a cada detalhe.</p>
        </div>
      </div>
    </>
  );
}
