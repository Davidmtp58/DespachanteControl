import { useState, type FormEvent, type ReactNode } from "react";
import type { Cliente, Dados, DespesaServico, Servico, Status, Veiculo } from "../types";
import { Field, statusLabel } from "./ui";
const hoje = () => new Date().toLocaleDateString("en-CA");
const texto = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
export function FormShell({
  children,
  onSave,
  onClose,
  view = false,
}: {
  children: ReactNode;
  onSave: (f: FormData) => Promise<void>;
  onClose: () => void;
  view?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={view || busy} className="form-grid">
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span className="muted">{view ? "Dados demonstrativos" : "* Campos obrigatórios"}</span>
        <button type="button" className="secondary" onClick={onClose}>
          {view ? "Fechar" : "Cancelar"}
        </button>
        {!view && (
          <button className="primary" disabled={busy} type="submit">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        )}
      </div>
    </form>
  );
}
export function ClienteForm({
  item,
  view,
  save,
  close,
}: {
  item?: Cliente;
  view?: boolean;
  save: (c: Cliente) => Promise<void>;
  close: () => void;
}) {
  const [tipo, setTipo] = useState(item?.tipoPessoa ?? "PF");
  return (
    <FormShell
      view={view}
      onClose={close}
      onSave={async (f) => {
        await save({
          id: item?.id ?? crypto.randomUUID(),
          tipoPessoa: tipo,
          nome: texto(f, "nome"),
          documento: texto(f, "documento").replace(/\D/g, ""),
          telefone: texto(f, "telefone"),
          email: texto(f, "email"),
          nascimento: texto(f, "nascimento"),
        });
      }}
    >
      <Field label="Tipo de pessoa *">
        <select
          name="tipoPessoa"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "PF" | "PJ")}
        >
          <option value="PF">Pessoa física (PF)</option>
          <option value="PJ">Pessoa jurídica (PJ)</option>
        </select>
      </Field>
      <Field label={tipo === "PF" ? "CPF *" : "CNPJ *"}>
        <input
          name="documento"
          required
          maxLength={18}
          defaultValue={item?.documento}
          placeholder={tipo === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
        />
      </Field>
      <Field full label="Nome / Razão Social *">
        <input name="nome" required maxLength={150} defaultValue={item?.nome} />
      </Field>
      <Field label="Telefone *">
        <input name="telefone" type="tel" required maxLength={20} defaultValue={item?.telefone} />
      </Field>
      <Field label="E-mail">
        <input name="email" type="email" maxLength={150} defaultValue={item?.email} />
      </Field>
      <Field label="Data de nascimento (opcional)">
        <input name="nascimento" type="date" max={hoje()} defaultValue={item?.nascimento} />
      </Field>
    </FormShell>
  );
}
export function VeiculoForm({
  item,
  dados,
  view,
  save,
  close,
}: {
  item?: Veiculo;
  dados: Dados;
  view?: boolean;
  save: (v: Veiculo) => Promise<void>;
  close: () => void;
}) {
  return (
    <FormShell
      view={view}
      onClose={close}
      onSave={async (f) => {
        await save({
          id: item?.id ?? crypto.randomUUID(),
          proprietarioId: texto(f, "proprietario"),
          placa: texto(f, "placa")
            .replace(/[^a-z0-9]/gi, "")
            .toUpperCase(),
          tipo: texto(f, "tipo"),
          marca: texto(f, "marca"),
          modelo: texto(f, "modelo"),
          ano: Number(f.get("ano")) || null,
          renavam: texto(f, "renavam"),
        });
      }}
    >
      <Field full label="Proprietário *">
        <select name="proprietario" required defaultValue={item?.proprietarioId ?? ""}>
          <option value="" disabled>
            Selecione o cliente proprietário
          </option>
          {dados.clientes.map((c) => (
            <option value={c.id} key={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Placa *">
        <input
          name="placa"
          required
          maxLength={8}
          defaultValue={item?.placa}
          placeholder="ABC1D23"
          className="uppercase"
        />
      </Field>
      <Field label="Tipo de veículo *">
        <input
          name="tipo"
          required
          maxLength={30}
          defaultValue={item?.tipo}
          placeholder="Ex.: Automóvel"
        />
      </Field>
      <Field label="Marca *">
        <input name="marca" required maxLength={50} defaultValue={item?.marca} />
      </Field>
      <Field label="Modelo *">
        <input name="modelo" required maxLength={80} defaultValue={item?.modelo} />
      </Field>
      <Field label="Ano (opcional)">
        <input name="ano" type="number" min="1886" max="2100" defaultValue={item?.ano ?? ""} />
      </Field>
      <Field label="RENAVAM *">
        <input
          name="renavam"
          required
          inputMode="numeric"
          pattern="[0-9]{11}"
          title="Informe 11 dígitos"
          maxLength={11}
          defaultValue={item?.renavam}
        />
      </Field>
    </FormShell>
  );
}
export function ServicoForm({
  item,
  dados,
  save,
  close,
}: {
  item?: Servico;
  dados: Dados;
  save: (s: Servico) => Promise<void>;
  close: () => void;
}) {
  const [inicio, setInicio] = useState(item?.inicio ?? hoje());
  return (
    <FormShell
      onClose={close}
      onSave={async (f) => {
        await save({
          id: item?.id ?? crypto.randomUUID(),
          clienteId: texto(f, "cliente"),
          veiculoId: texto(f, "veiculo"),
          tipoServicoId: texto(f, "tipo"),
          inicio: texto(f, "inicio"),
          conclusao: texto(f, "conclusao"),
          status: texto(f, "status") as Status,
          valorRecebido: Number(f.get("valor")),
          observacoes: texto(f, "observacoes"),
        });
      }}
    >
      <Field full label="Cliente solicitante *">
        <select name="cliente" required defaultValue={item?.clienteId ?? ""}>
          <option value="" disabled>
            Selecione o solicitante
          </option>
          {dados.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field full label="Veículo *">
        <select name="veiculo" required defaultValue={item?.veiculoId ?? ""}>
          <option value="" disabled>
            Selecione um veículo
          </option>
          {dados.veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.placa} · {v.marca} {v.modelo} · Proprietário:{" "}
              {dados.clientes.find((c) => c.id === v.proprietarioId)?.nome}
            </option>
          ))}
        </select>
        <small>O solicitante pode ser diferente do proprietário do veículo.</small>
      </Field>
      <Field label="Tipo de serviço *">
        <select name="tipo" required defaultValue={item?.tipoServicoId ?? ""}>
          <option value="" disabled>
            Selecione
          </option>
          {dados.tiposServico.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status *">
        <select name="status" defaultValue={item?.status ?? "EM_ANDAMENTO"}>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data de início *">
        <input
          type="date"
          name="inicio"
          required
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
      </Field>
      <Field label="Data de conclusão">
        <input type="date" name="conclusao" min={inicio} defaultValue={item?.conclusao} />
      </Field>
      <Field label="Valor recebido (R$) *">
        <input
          type="number"
          name="valor"
          required
          min="0"
          max="99999999.99"
          step="0.01"
          defaultValue={item?.valorRecebido ?? 0}
        />
      </Field>
      <Field full label="Observações">
        <textarea name="observacoes" maxLength={500} rows={3} defaultValue={item?.observacoes} />
      </Field>
    </FormShell>
  );
}
export function DespesaForm({
  item,
  servicoId,
  save,
  close,
}: {
  item?: DespesaServico;
  servicoId: string;
  save: (d: DespesaServico) => Promise<void>;
  close: () => void;
}) {
  return (
    <FormShell
      onClose={close}
      onSave={async (f) => {
        await save({
          id: item?.id ?? crypto.randomUUID(),
          servicoId,
          descricao: texto(f, "descricao"),
          valor: Number(f.get("valor")),
          data: texto(f, "data"),
          observacoes: texto(f, "observacoes"),
        });
      }}
    >
      <Field full label="Descrição *">
        <input name="descricao" required maxLength={150} defaultValue={item?.descricao} />
      </Field>
      <Field label="Valor (R$) *">
        <input
          type="number"
          name="valor"
          required
          min="0.01"
          max="99999999.99"
          step="0.01"
          defaultValue={item?.valor}
        />
      </Field>
      <Field label="Data *">
        <input type="date" name="data" required defaultValue={item?.data ?? hoje()} />
      </Field>
      <Field full label="Observações">
        <textarea name="observacoes" maxLength={300} rows={3} defaultValue={item?.observacoes} />
      </Field>
    </FormShell>
  );
}
