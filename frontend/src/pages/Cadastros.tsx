import { useState } from "react";
import type { Cliente, Dados, Veiculo } from "../types";
import { Empty, PageHeader, RowActions, SearchField } from "../components/ui";
export function Clientes({
  dados,
  open,
}: {
  dados: Pick<Dados, "clientes">;
  open: (item?: Cliente, view?: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const items = dados.clientes.filter((c) =>
    `${c.nome} ${c.documento} ${c.email} ${c.telefone}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="RELACIONAMENTOS"
        title="Clientes"
        subtitle="As pessoas e empresas que confiam no seu trabalho."
        action="Novo cliente"
        onAction={() => open()}
      />
      <section className="panel">
        <div className="toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar nome, CPF/CNPJ, telefone ou e-mail"
          />
          <span className="muted">{items.length} clientes</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Nome / Razão Social</th>
                <th>Tipo</th>
                <th>CPF/CNPJ</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                  </td>
                  <td>
                    <span className="neutral-tag">{c.tipoPessoa}</span>
                  </td>
                  <td>{c.documento}</td>
                  <td>{c.telefone}</td>
                  <td>{c.email || "—"}</td>
                  <td>
                    <RowActions name={c.nome} onView={() => open(c, true)} onEdit={() => open(c)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && <Empty />}
      </section>
    </>
  );
}
export function Veiculos({
  dados,
  open,
}: {
  dados: Pick<Dados, "clientes" | "veiculos">;
  open: (item?: Veiculo, view?: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const owner = (id: string) =>
    dados.clientes.find((c) => c.id === id)?.nome ?? `Cliente #${id} indisponível`;
  const items = dados.veiculos.filter((v) =>
    `${v.placa} ${v.marca} ${v.modelo} ${v.renavam} ${owner(v.proprietarioId)}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="CADASTROS"
        title="Veículos"
        subtitle="Documentação organizada começa por um cadastro completo."
        action="Novo veículo"
        onAction={() => open()}
      />
      <section className="panel">
        <div className="toolbar">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Buscar placa, modelo, RENAVAM ou proprietário"
          />
          <span className="muted">{items.length} veículos</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Placa</th>
                <th>Tipo de veículo</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Ano</th>
                <th>RENAVAM</th>
                <th>Proprietário</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span className="plate">{v.placa}</span>
                  </td>
                  <td>{v.tipo}</td>
                  <td>{v.marca}</td>
                  <td>
                    <strong>{v.modelo}</strong>
                  </td>
                  <td>{v.ano || "—"}</td>
                  <td>{v.renavam}</td>
                  <td>{owner(v.proprietarioId)}</td>
                  <td>
                    <RowActions
                      name={v.placa}
                      onView={() => open(v, true)}
                      onEdit={() => open(v)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && <Empty />}
      </section>
    </>
  );
}
