import { useState } from "react";
import type { DadosServicos, ServicoReal } from "../services/servicos";
import {
  Badge,
  Empty,
  Field,
  PageHeader,
  RowActions,
  SearchField,
  statusLabel,
} from "../components/ui";
import { formatServicoDate, formatServicoMoney } from "../services/servicos";
export function Servicos({
  dados,
  open,
  detail,
}: {
  dados: DadosServicos;
  open: (s?: ServicoReal) => void;
  detail: (s: ServicoReal) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const [cliente, setCliente] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  function limpar() {
    setQuery("");
    setStatus("");
    setTipo("");
    setCliente("");
    setDe("");
    setAte("");
  }
  const items = dados.servicos
    .filter((s) => {
      const v = dados.veiculos.find((v) => v.id === s.veiculoId);
      const c = dados.clientes.find((c) => c.id === s.clienteId);
      return (
        (!status || s.status === status) &&
        (!tipo || s.tipoServicoId === tipo) &&
        (!cliente || s.clienteId === cliente) &&
        (!de || s.inicio.slice(0, 10) >= de) &&
        (!ate || s.inicio.slice(0, 10) <= ate) &&
        `${c?.nome} ${v?.placa} ${v?.marca} ${v?.modelo}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  return (
    <>
      <PageHeader
        eyebrow="OPERAÇÃO"
        title="Serviços"
        subtitle="Acompanhe cada solicitação, do início à conclusão."
        action="Novo serviço"
        onAction={() => open()}
      />
      <section className="panel">
        <div className="toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar cliente, placa ou veículo"
          />
          <button className="text-button" onClick={limpar}>
            Limpar filtros
          </button>
        </div>
        <div className="filters">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(statusLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de serviço">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos os tipos</option>
              {dados.tiposServico.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cliente">
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos os clientes</option>
              {dados.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Início a partir de">
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </Field>
          <Field label="Início até">
            <input type="date" min={de} value={ate} onChange={(e) => setAte(e.target.value)} />
          </Field>
        </div>
        {de && ate && ate < de && (
          <p className="error" role="alert">
            O fim do período deve ser igual ou posterior ao início.
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Cliente solicitante</th>
                <th>Veículo / placa</th>
                <th>Tipo de serviço</th>
                <th>Início</th>
                <th>Conclusão</th>
                <th>Status</th>
                <th className="numeric">Recebido</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const v = dados.veiculos.find((v) => v.id === s.veiculoId);
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>
                        {dados.clientes.find((c) => c.id === s.clienteId)?.nome ??
                          `Cliente #${s.clienteId} indisponível`}
                      </strong>
                    </td>
                    <td>
                      {v?.marca} {v?.modelo}
                      <small className="plate-inline">
                        {v?.placa ?? `Veículo #${s.veiculoId} indisponível`}
                      </small>
                    </td>
                    <td>
                      {dados.tiposServico.find((t) => t.id === s.tipoServicoId)?.nome ??
                        `Tipo #${s.tipoServicoId} indisponível`}
                    </td>
                    <td>{formatServicoDate(s.inicio)}</td>
                    <td>{formatServicoDate(s.conclusao)}</td>
                    <td>
                      <Badge status={s.status} />
                    </td>
                    <td className="numeric">{formatServicoMoney(s.valorRecebido)}</td>
                    <td>
                      <RowActions
                        name={`serviço ${s.id}`}
                        onView={() => detail(s)}
                        onEdit={() => open(s)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <Empty
            action={
              <button className="text-button" onClick={limpar}>
                Limpar filtros
              </button>
            }
          />
        )}
        <div className="table-footer">
          {items.length} de {dados.servicos.length} serviços
          <span>Período considera a data de início</span>
        </div>
      </section>
    </>
  );
}
