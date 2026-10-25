import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { createClientesClient, type ClientesAuth } from "../services/clientes";
import { createDespesasClient, type DespesaReal } from "../services/despesas";
import {
  createServicosClient,
  formatServicoDate,
  formatServicoMoney,
  type DadosServicos,
} from "../services/servicos";
import { createVeiculosClient } from "../services/veiculos";
import { identificarServicos, type IdentificacaoServico } from "../services/despesa-identificacao";
import { DespesaRealForm, despesaServiceLabel } from "../components/DespesaRealForm";
import { Badge, Detail, Empty, Field, Modal, PageHeader, RowActions } from "../components/ui";

type Selection = { mode: "edit" | "view" | "delete"; item?: DespesaReal };
export function DespesasPage({ getCsrfToken, expireSession }: ClientesAuth) {
  const api = useMemo(() => {
    const auth = { getCsrfToken, expireSession };
    return {
      despesas: createDespesasClient(auth),
      servicos: createServicosClient(auth),
      clientes: createClientesClient(auth),
      veiculos: createVeiculosClient(auth),
    };
  }, [getCsrfToken, expireSession]);
  const [dados, setDados] = useState<DadosServicos & { despesas: DespesaReal[] }>();
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [selection, setSelection] = useState<Selection>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(false);
  const version = useRef(0);
  const openVersion = useRef(0);
  const saving = useRef(false);
  const identificacoes = useMemo(
    () => (dados ? identificarServicos(dados) : new Map<string, IdentificacaoServico>()),
    [dados],
  );
  async function references() {
    const [servicos, clientes, veiculos, tiposServico] = await Promise.all([
      api.servicos.list(),
      api.clientes.list(),
      api.veiculos.list(),
      api.servicos.types(),
    ]);
    return { servicos, clientes, veiculos, tiposServico };
  }
  async function reload() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const [despesas, refs] = await Promise.all([
        filter ? api.despesas.byService(filter) : api.despesas.list(),
        references(),
      ]);
      if (mounted.current && current === version.current) setDados({ despesas, ...refs });
    } catch (e) {
      if (mounted.current && current === version.current) {
        setDados(undefined);
        setError((e as Error).message);
      }
    } finally {
      if (mounted.current && current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      version.current++;
      openVersion.current++;
    };
  }, [api, filter]);
  async function open(mode: Selection["mode"], item?: DespesaReal) {
    if (saving.current) return;
    const current = ++openVersion.current;
    setOpening(true);
    setError("");
    setNotice("");
    setDeleteError("");
    try {
      const [fresh, refs] = await Promise.all([
        item ? api.despesas.find(item.id) : undefined,
        references(),
      ]);
      if (mounted.current && current === openVersion.current) {
        setDados((previous) => ({ despesas: previous?.despesas ?? [], ...refs }));
        setSelection({ mode, item: fresh });
      }
    } catch (e) {
      if (mounted.current && current === openVersion.current) setError((e as Error).message);
    } finally {
      if (mounted.current && current === openVersion.current) setOpening(false);
    }
  }
  function close() {
    if (!saving.current) setSelection(undefined);
  }
  async function save(item: DespesaReal) {
    if (saving.current) return;
    if (!dados?.servicos.some((s) => s.id === item.servicoId))
      throw new Error(
        "Selecione um serviço cadastrado. Feche e reabra o formulário para atualizar as opções.",
      );
    saving.current = true;
    try {
      if (selection?.item) await api.despesas.update(selection.item.id, item);
      else await api.despesas.create(item);
      if (!mounted.current) return;
      setSelection(undefined);
      setNotice("Despesa salva com sucesso.");
      await reload();
    } finally {
      saving.current = false;
    }
  }
  async function remove() {
    if (saving.current || selection?.mode !== "delete" || !selection.item) return;
    saving.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.despesas.remove(selection.item.id);
      if (!mounted.current) return;
      setSelection(undefined);
      setNotice("Despesa excluída com sucesso.");
      await reload();
    } catch (e) {
      if (mounted.current) setDeleteError((e as Error).message);
    } finally {
      saving.current = false;
      if (mounted.current) setDeleting(false);
    }
  }
  function serviceLabel(key: string) {
    const s = identificacoes.get(key);
    return s ? despesaServiceLabel(s) : `Serviço #${key} indisponível`;
  }
  const selected = selection?.item;
  return (
    <>
      <PageHeader
        eyebrow="OPERAÇÃO"
        title="Despesas"
        subtitle="Custos vinculados aos serviços cadastrados no sistema."
        action={!loading && !opening && dados?.servicos.length ? "Nova despesa" : undefined}
        onAction={() => void open("edit")}
      />
      <p className="muted">
        Despesas reais vinculadas aos Serviços. Os resultados consolidados estão disponíveis no
        Dashboard.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="toolbar">
        <button className="secondary" disabled={loading || opening} onClick={() => void reload()}>
          Atualizar lista
        </button>
        {filter && (
          <button
            className="text-button"
            disabled={loading || opening}
            onClick={() => setFilter("")}
          >
            Todos os serviços
          </button>
        )}
      </div>
      {opening && <p role="status">Consultando despesa e serviços…</p>}
      {loading ? (
        <p role="status">Carregando despesas e serviços…</p>
      ) : (
        dados && (
          <section className="panel expenses-panel">
            <div className="filters">
              <Field label="Filtrar por serviço">
                <select
                  value={filter}
                  disabled={opening}
                  onChange={(e) => {
                    setNotice("");
                    setFilter(e.target.value);
                  }}
                >
                  <option value="">Todos os serviços</option>
                  {filter && !dados.servicos.some((s) => s.id === filter) && (
                    <option value={filter}>Serviço #{filter} indisponível</option>
                  )}
                  {dados.servicos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {serviceLabel(s.id)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {!dados.servicos.length && (
              <p role="status">Cadastre um serviço real antes de adicionar despesas.</p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Serviço</th>
                    <th>Data</th>
                    <th className="numeric">Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.despesas.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.descricao}</strong>
                        <small>Despesa #{d.id}</small>
                      </td>
                      <td className="expense-service-cell">
                        {identificacoes.has(d.servicoId) ? (
                          (() => {
                            const s = identificacoes.get(d.servicoId)!;
                            return (
                              <div className="expense-service-info">
                                <strong>{s.tipo}</strong>
                                <span>{s.cliente}</span>
                                <span className="muted">{s.veiculo}</span>
                                <div>
                                  <Badge status={s.status} /> <small>Serviço #{s.id}</small>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <span>Serviço #{d.servicoId} não encontrado</span>
                        )}
                      </td>
                      <td>{formatServicoDate(d.data)}</td>
                      <td className="numeric">{formatServicoMoney(d.valor)}</td>
                      <td>
                        <RowActions
                          name={`despesa ${d.id}`}
                          onView={() => void open("view", d)}
                          onEdit={() => void open("edit", d)}
                        />
                        <button
                          className="icon-button danger"
                          aria-label={`Excluir despesa ${d.id}`}
                          title="Excluir despesa"
                          onClick={() => void open("delete", d)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!dados.despesas.length && <Empty text="Nenhuma despesa encontrada." />}
            <div className="table-footer">{dados.despesas.length} despesas</div>
          </section>
        )
      )}
      {selection && dados && (
        <Modal
          title={
            selection.mode === "delete"
              ? "Confirmar exclusão"
              : selection.mode === "view"
                ? "Detalhes da despesa"
                : selected
                  ? "Editar despesa"
                  : "Nova despesa"
          }
          subtitle="Despesas de Serviço"
          onClose={close}
        >
          {selection.mode === "edit" ? (
            <DespesaRealForm
              item={selected}
              servicos={dados.servicos}
              identificacoes={identificacoes}
              servicoId={filter}
              save={save}
              close={close}
            />
          ) : (
            selected && (
              <>
                <div className="details-grid">
                  <Detail label="Despesa">
                    #{selected.id} · {selected.descricao}
                  </Detail>
                  <Detail label="Serviço">{serviceLabel(selected.servicoId)}</Detail>
                  <Detail label="Valor">{formatServicoMoney(selected.valor)}</Detail>
                  <Detail label="Data da despesa">{formatServicoDate(selected.data)}</Detail>
                  <Detail label="Observações">
                    {selected.observacoes || "Nenhuma observação registrada."}
                  </Detail>
                </div>
                {selection.mode === "delete" && (
                  <p className="observacoes">
                    Excluir esta despesa permanentemente? Esta ação altera os custos do serviço e
                    não pode ser desfeita.
                  </p>
                )}
                {deleteError && (
                  <p className="error" role="alert">
                    {deleteError}
                  </p>
                )}
                <div className="form-footer">
                  <button className="secondary" disabled={deleting} onClick={close}>
                    {selection.mode === "delete" ? "Cancelar" : "Fechar"}
                  </button>
                  {selection.mode === "delete" && (
                    <button
                      className="danger-button"
                      disabled={deleting}
                      onClick={() => void remove()}
                    >
                      {deleting ? "Excluindo…" : "Confirmar exclusão"}
                    </button>
                  )}
                </div>
              </>
            )
          )}
        </Modal>
      )}
    </>
  );
}
