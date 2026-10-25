import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Dados, DespesaServico, Servico } from "../types";
import { Badge, Detail, Empty, PageHeader } from "../components/ui";
import { data, financeiro, moeda } from "../services/financeiro";
export function ServicoDetalhe({
  servico,
  dados,
  back,
  edit,
  expense,
  remove,
}: {
  servico: Servico;
  dados: Dados;
  back: () => void;
  edit: () => void;
  expense: (d?: DespesaServico) => void;
  remove: (id: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const v = dados.veiculos.find((v) => v.id === servico.veiculoId);
  const f = financeiro(servico, dados.despesas);
  const despesas = dados.despesas.filter((d) => d.servicoId === servico.id);
  return (
    <>
      <button className="text-button back" onClick={back}>
        <ArrowLeft size={16} />
        Voltar para Dashboard
      </button>
      <PageHeader
        eyebrow="DETALHE DO SERVIÇO"
        title={dados.tiposServico.find((t) => t.id === servico.tipoServicoId)?.nome ?? "Serviço"}
        subtitle={`${v?.marca} ${v?.modelo} · ${v?.placa}`}
      />
      <section className="panel detail-panel">
        <div className="panel-heading">
          <Badge status={servico.status} />
          <button className="secondary" onClick={edit}>
            <Pencil size={16} />
            Abrir Serviços reais
          </button>
        </div>
        <div className="details-grid">
          <Detail label="Cliente solicitante">
            {dados.clientes.find((c) => c.id === servico.clienteId)?.nome}
          </Detail>
          <Detail label="Veículo">
            {v?.marca} {v?.modelo} · {v?.placa}
          </Detail>
          <Detail label="Proprietário do veículo">
            {dados.clientes.find((c) => c.id === v?.proprietarioId)?.nome}
          </Detail>
          <Detail label="Tipo de serviço">
            {dados.tiposServico.find((t) => t.id === servico.tipoServicoId)?.nome}
          </Detail>
          <Detail label="Data de início">{data(servico.inicio)}</Detail>
          <Detail label="Data de conclusão">{data(servico.conclusao)}</Detail>
          <Detail label="Valor recebido">{moeda(servico.valorRecebido)}</Detail>
        </div>
        <div className="observacoes">
          <Detail label="Observações">
            {servico.observacoes || "Nenhuma observação registrada."}
          </Detail>
        </div>
      </section>
      <section className="panel expense-panel">
        <div className="panel-heading">
          <div>
            <h2>Despesas do serviço</h2>
            <p className="muted">Taxas, vistorias e outros custos desta solicitação.</p>
          </div>
          <button className="primary" onClick={() => expense()}>
            <Plus size={16} />
            Adicionar despesa
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Data</th>
                <th>Observações</th>
                <th className="numeric">Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesas.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.descricao}</strong>
                  </td>
                  <td>{data(d.data)}</td>
                  <td>{d.observacoes || "—"}</td>
                  <td className="numeric">{moeda(d.valor)}</td>
                  <td>
                    {confirm === d.id ? (
                      <div className="confirm-inline">
                        <span>Remover?</span>
                        <button
                          className="danger-button"
                          onClick={async () => {
                            try {
                              await remove(d.id);
                              setConfirm("");
                            } catch {
                              setError("Não foi possível remover a despesa.");
                            }
                          }}
                        >
                          Confirmar
                        </button>
                        <button className="text-button" onClick={() => setConfirm("")}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar despesa ${d.descricao}`}
                          onClick={() => expense(d)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          aria-label={`Remover despesa ${d.descricao}`}
                          onClick={() => setConfirm(d.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!despesas.length && <Empty text="Nenhuma despesa cadastrada." />}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="financial-summary" aria-label="Resumo financeiro">
        <div>
          <h2>Resumo financeiro</h2>
          <p>Calculado automaticamente a partir das despesas.</p>
        </div>
        <div>
          <span>Valor recebido</span>
          <strong>{moeda(f.recebido)}</strong>
        </div>
        <div>
          <span>Custo total</span>
          <strong>{moeda(f.custo)}</strong>
        </div>
        <div className={f.resultado < 0 ? "negative" : "result"}>
          <span>Resultado líquido</span>
          <strong>{moeda(f.resultado)}</strong>
        </div>
      </section>
      {servico.status === "CANCELADO" && (
        <p className="cancel-note">
          Este serviço está cancelado. Seus valores recebidos e despesas continuam incluídos nos
          indicadores financeiros.
        </p>
      )}
    </>
  );
}
