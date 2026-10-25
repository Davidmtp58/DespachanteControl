import { useEffect, useMemo, useRef, useState } from "react";
import type { Cliente } from "../types";
import { createClientesClient, type ClientesAuth } from "../services/clientes";
import { Clientes } from "./Cadastros";
import { ClienteForm } from "../components/forms";
import { Modal } from "../components/ui";

// Real clients never enter the Dados object used by the demonstration modules.
export function ClientesPage({ getCsrfToken, expireSession }: ClientesAuth) {
  const client = useMemo(
    () => createClientesClient({ getCsrfToken, expireSession }),
    [getCsrfToken, expireSession],
  );
  const [items, setItems] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ item?: Cliente; view?: boolean }>();
  const [opening, setOpening] = useState(false);
  const mounted = useRef(false);
  const listVersion = useRef(0);
  const detailVersion = useRef(0);
  async function reload() {
    const version = ++listVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await client.list();
      if (mounted.current && version === listVersion.current) setItems(result);
    } catch (err) {
      if (mounted.current && version === listVersion.current) {
        setItems([]);
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
  }, [client]);
  async function open(item?: Cliente, view?: boolean) {
    const version = ++detailVersion.current;
    setError("");
    setNotice("");
    if (!item) {
      setOpening(false);
      setEditor({});
      return;
    }
    setOpening(true);
    try {
      const fresh = await client.find(item.id);
      if (mounted.current && version === detailVersion.current) setEditor({ item: fresh, view });
    } catch (err) {
      if (mounted.current && version === detailVersion.current) setError((err as Error).message);
    } finally {
      if (mounted.current && version === detailVersion.current) setOpening(false);
    }
  }
  async function save(item: Cliente) {
    if (editor?.item) await client.update(editor.item.id, item);
    else await client.create(item);
    if (!mounted.current) return;
    // Close after confirmed write, even if the subsequent list request fails.
    setEditor(undefined);
    setNotice("Cliente salvo com sucesso.");
    await reload();
  }
  return (
    <>
      <p className="muted">Clientes cadastrados no sistema, disponíveis em Veículos e Serviços.</p>
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
        <p role="status">Carregando clientes…</p>
      ) : (
        <Clientes dados={{ clientes: items }} open={(item, view) => void open(item, view)} />
      )}
      {opening && <p role="status">Consultando cliente…</p>}
      {editor && (
        <Modal
          title={`${editor.view ? "Visualizar" : editor.item ? "Editar" : "Novo"} cliente`}
          subtitle="Cadastro de Clientes"
          onClose={() => setEditor(undefined)}
        >
          <ClienteForm
            item={editor.item}
            view={editor.view}
            close={() => setEditor(undefined)}
            save={save}
          />
        </Modal>
      )}
    </>
  );
}
