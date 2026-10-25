import { useEffect, useMemo, useRef, useState } from "react";
import type { Cliente, Veiculo } from "../types";
import { createClientesClient, type ClientesAuth } from "../services/clientes";
import { createVeiculosClient } from "../services/veiculos";
import { Veiculos } from "./Cadastros";
import { VeiculoForm } from "../components/forms";
import { Modal } from "../components/ui";

export function VeiculosPage({ getCsrfToken, expireSession }: ClientesAuth) {
  const { vehicles, owners } = useMemo(() => {
    const auth = { getCsrfToken, expireSession };
    return { vehicles: createVeiculosClient(auth), owners: createClientesClient(auth) };
  }, [getCsrfToken, expireSession]);
  const [items, setItems] = useState<Veiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ item?: Veiculo; view?: boolean }>();
  const [opening, setOpening] = useState(false);
  const mounted = useRef(false);
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  const saving = useRef(false);
  async function reload() {
    const version = ++listVersion.current;
    setLoading(true);
    setError("");
    try {
      const [rows, clients] = await Promise.all([vehicles.list(), owners.list()]);
      if (mounted.current && version === listVersion.current) {
        setItems(rows);
        setClientes(clients);
      }
    } catch (err) {
      if (mounted.current && version === listVersion.current) {
        setItems([]);
        setClientes([]);
        setError((err as Error).message);
      }
    } finally {
      if (mounted.current && version === listVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      listVersion.current++;
      detailVersion.current++;
    };
  }, [vehicles, owners]);
  async function open(item?: Veiculo, view?: boolean) {
    if (saving.current) return;
    const version = ++detailVersion.current;
    setOpening(true);
    setError("");
    setNotice("");
    try {
      const [fresh, clients] = await Promise.all([
        item ? vehicles.find(item.id) : undefined,
        owners.list(),
      ]);
      if (mounted.current && version === detailVersion.current) {
        setClientes(clients);
        setEditor({ item: fresh, view });
      }
    } catch (err) {
      if (mounted.current && version === detailVersion.current) setError((err as Error).message);
    } finally {
      if (mounted.current && version === detailVersion.current) setOpening(false);
    }
  }
  function close() {
    if (!saving.current) setEditor(undefined);
  }
  async function save(item: Veiculo) {
    if (saving.current) return;
    if (!clientes.some((c) => c.id === item.proprietarioId))
      throw new Error("Selecione um cliente proprietário cadastrado.");
    saving.current = true;
    try {
      if (editor?.item) await vehicles.update(editor.item.id, item);
      else await vehicles.create(item);
      if (!mounted.current) return;
      setEditor(undefined);
      setNotice("Veículo salvo com sucesso.");
      await reload();
    } finally {
      saving.current = false;
    }
  }
  return (
    <>
      <p className="muted">
        Veículos e proprietários cadastrados no sistema, disponíveis em Serviços.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          <button className="secondary" onClick={() => void reload()} disabled={loading}>
            Atualizar lista
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando veículos e proprietários…</p>
      ) : (
        <>
          {!error && !clientes.length && (
            <p role="status">Cadastre um cliente em Clientes antes de cadastrar veículos.</p>
          )}
          <Veiculos
            dados={{ clientes, veiculos: items }}
            open={(item, view) => void open(item, view)}
          />
        </>
      )}
      {opening && <p role="status">Consultando veículo e proprietários…</p>}
      {editor && (
        <Modal
          title={`${editor.view ? "Visualizar" : editor.item ? "Editar" : "Novo"} veículo`}
          subtitle="Cadastro de Veículos"
          onClose={close}
        >
          <VeiculoForm
            item={editor.item}
            dados={{ clientes }}
            view={editor.view}
            close={close}
            save={save}
          />
        </Modal>
      )}
    </>
  );
}
