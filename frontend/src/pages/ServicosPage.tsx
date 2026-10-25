import { useEffect, useMemo, useRef, useState } from "react";
import { createClientesClient, type ClientesAuth } from "../services/clientes";
import { createVeiculosClient } from "../services/veiculos";
import {
  createServicosClient,
  formatServicoDate,
  formatServicoMoney,
  type DadosServicos,
  type ServicoReal,
} from "../services/servicos";
import { Servicos } from "./Servicos";
import { ServicoRealForm } from "../components/ServicoRealForm";
import { Badge, Detail, Modal, PageHeader } from "../components/ui";

export function ServicosPage({
  getCsrfToken,
  expireSession,
  createOnMount = false,
}: ClientesAuth & { createOnMount?: boolean }) {
  const api = useMemo(() => {
    const auth = { getCsrfToken, expireSession };
    return {
      servicos: createServicosClient(auth),
      clientes: createClientesClient(auth),
      veiculos: createVeiculosClient(auth),
    };
  }, [getCsrfToken, expireSession]);
  const [dados, setDados] = useState<DadosServicos>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ item?: ServicoReal }>();
  const [detail, setDetail] = useState<ServicoReal>();
  const [opening, setOpening] = useState(false);
  const mounted = useRef(false);
  const version = useRef(0);
  const openVersion = useRef(0);
  const saving = useRef(false);
  const openedFromShortcut = useRef(false);
  async function references() {
    const [clientes, veiculos, tiposServico] = await Promise.all([
      api.clientes.list(),
      api.veiculos.list(),
      api.servicos.types(),
    ]);
    return { clientes, veiculos, tiposServico };
  }
  async function reload() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const [servicos, refs] = await Promise.all([api.servicos.list(), references()]);
      if (mounted.current && current === version.current) setDados({ ...refs, servicos });
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
  }, [api]);
  async function open(item?: ServicoReal, view = false) {
    if (saving.current) return;
    const current = ++openVersion.current;
    setOpening(true);
    setError("");
    setNotice("");
    try {
      const [fresh, refs] = await Promise.all([
        item ? api.servicos.find(item.id) : undefined,
        references(),
      ]);
      if (mounted.current && current === openVersion.current) {
        setDados((previous) => ({ ...refs, servicos: previous?.servicos ?? [] }));
        if (view) setDetail(fresh);
        else setEditor({ item: fresh });
      }
    } catch (e) {
      if (mounted.current && current === openVersion.current) setError((e as Error).message);
    } finally {
      if (mounted.current && current === openVersion.current) setOpening(false);
    }
  }
  useEffect(() => {
    if (createOnMount && dados && !loading && !openedFromShortcut.current) {
      openedFromShortcut.current = true;
      void open();
    }
  }, [createOnMount, dados, loading]);
  async function save(item: ServicoReal) {
    if (saving.current) return;
    if (
      !dados?.clientes.some((c) => c.id === item.clienteId) ||
      !dados.veiculos.some((v) => v.id === item.veiculoId) ||
      !dados.tiposServico.some((t) => t.id === item.tipoServicoId)
    )
      throw new Error("Selecione cliente, veículo e tipo de serviço cadastrados.");
    saving.current = true;
    try {
      const result = editor?.item
        ? await api.servicos.update(editor.item.id, item)
        : await api.servicos.create(item);
      if (!mounted.current) return;
      setEditor(undefined);
      if (detail) setDetail(result);
      setNotice("Serviço salvo com sucesso.");
      await reload();
    } finally {
      saving.current = false;
    }
  }
  const vehicle = dados?.veiculos.find((v) => v.id === detail?.veiculoId);
  const nomeCliente = (id?: string) =>
    dados?.clientes.find((c) => c.id === id)?.nome ?? `Cliente #${id ?? "—"} indisponível`;
  const close = () => {
    if (!saving.current) setEditor(undefined);
  };
  return (
    <>
      <p className="muted">
        Serviços cadastrados no sistema. Consulte custos no menu Despesas e os resultados
        financeiros no Dashboard.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          <button className="secondary" disabled={loading} onClick={() => void reload()}>
            Atualizar lista
          </button>
        </div>
      )}
      {opening && <p role="status">Consultando serviço e relacionamentos…</p>}
      {loading ? (
        <p role="status">Carregando serviços e relacionamentos…</p>
      ) : (
        dados &&
        (detail ? (
          <>
            <button className="text-button back" onClick={() => setDetail(undefined)}>
              Voltar para serviços
            </button>
            <PageHeader
              eyebrow="DETALHE DO SERVIÇO"
              title={
                dados.tiposServico.find((t) => t.id === detail.tipoServicoId)?.nome ??
                `Serviço #${detail.id}`
              }
              subtitle={
                vehicle
                  ? `${vehicle.marca} ${vehicle.modelo} · ${vehicle.placa}`
                  : "Veículo indisponível"
              }
            />
            <section className="panel detail-panel">
              <div className="panel-heading">
                <Badge status={detail.status} />
                <button className="secondary" onClick={() => void open(detail)}>
                  Editar serviço
                </button>
              </div>
              <div className="details-grid">
                <Detail label="Cliente solicitante">{nomeCliente(detail.clienteId)}</Detail>
                <Detail label="Veículo">
                  {vehicle?.placa ?? `Veículo #${detail.veiculoId} indisponível`}
                </Detail>
                <Detail label="Proprietário do veículo">
                  {nomeCliente(vehicle?.proprietarioId)}
                </Detail>
                <Detail label="Data de início">{formatServicoDate(detail.inicio)}</Detail>
                <Detail label="Data de conclusão">{formatServicoDate(detail.conclusao)}</Detail>
                <Detail label="Valor recebido">{formatServicoMoney(detail.valorRecebido)}</Detail>
              </div>
              <div className="observacoes">
                <Detail label="Observações">
                  {detail.observacoes || "Nenhuma observação registrada."}
                </Detail>
              </div>
            </section>
            {detail.status === "CANCELADO" && (
              <p className="cancel-note">
                Este serviço está cancelado. O registro e seu valor recebido permanecem preservados.
              </p>
            )}
            <p className="muted">
              Consulte Despesas e Dashboard para acompanhar os custos e resultados. O valor recebido
              é associado ao serviço, não à data de pagamento.
            </p>
          </>
        ) : (
          <>
            {(!dados.clientes.length || !dados.veiculos.length || !dados.tiposServico.length) && (
              <p role="status">
                Para cadastrar serviços, são necessários clientes, veículos e tipos de serviço
                cadastrados.
              </p>
            )}
            <Servicos
              dados={dados}
              open={(item) => void open(item)}
              detail={(item) => void open(item, true)}
            />
          </>
        ))
      )}
      {editor && dados && (
        <Modal
          title={editor.item ? "Editar serviço" : "Novo serviço"}
          subtitle="Cadastro de Serviços"
          onClose={close}
          wide
        >
          <ServicoRealForm item={editor.item} dados={dados} save={save} close={close} />
        </Modal>
      )}
    </>
  );
}
