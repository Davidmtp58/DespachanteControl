import { useState } from "react";
import { moneyInput, moneyFromInput, moneyDigitsInput } from "../services/servicos";
import type { Status } from "../types";
import type { ReferenciasServico, ServicoReal } from "../services/servicos";
import { FormShell } from "./forms";
import { Field, statusLabel } from "./ui";
function agoraLocal() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function ServicoRealForm({
  item,
  dados,
  save,
  close,
}: {
  item?: ServicoReal;
  dados: ReferenciasServico;
  save: (item: ServicoReal) => Promise<void>;
  close: () => void;
}) {
  const [status, setStatus] = useState<Status>(item?.status ?? "EM_ANDAMENTO");
  const [valor, setValor] = useState(() => moneyInput(item?.valorRecebido ?? "0.00"));
  return (
    <FormShell
      onClose={close}
      onSave={async (f) => {
        const text = (key: string) => String(f.get(key) ?? "").trim();
        await save({
          id: item?.id ?? "",
          clienteId: text("cliente"),
          veiculoId: text("veiculo"),
          tipoServicoId: text("tipo"),
          inicio: text("inicio"),
          conclusao: text("conclusao"),
          status: text("status") as Status,
          valorRecebido: moneyFromInput(text("valor")),
          observacoes: text("observacoes"),
        });
      }}
    >
      <Field full label="Cliente solicitante *">
        <select name="cliente" required defaultValue={item?.clienteId ?? ""}>
          <option value="" disabled>
            Selecione o solicitante
          </option>
          {item && !dados.clientes.some((c) => c.id === item.clienteId) && (
            <option value={item.clienteId} disabled>
              Cliente indisponível — selecione outro
            </option>
          )}
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
            Selecione o veículo
          </option>
          {item && !dados.veiculos.some((v) => v.id === item.veiculoId) && (
            <option value={item.veiculoId} disabled>
              Veículo indisponível — selecione outro
            </option>
          )}
          {dados.veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.placa} · {v.marca} {v.modelo} · Proprietário:{" "}
              {dados.clientes.find((c) => c.id === v.proprietarioId)?.nome ??
                `Cliente #${v.proprietarioId} indisponível`}
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
          {item && !dados.tiposServico.some((t) => t.id === item.tipoServicoId) && (
            <option value={item.tipoServicoId} disabled>
              Tipo indisponível — selecione outro
            </option>
          )}
          {dados.tiposServico.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
              {t.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status *">
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {Object.entries(statusLabel).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data de início">
        <input
          name="inicio"
          type="date"
          required
          min="0001-01-01"
          max="9999-12-31"
          defaultValue={item?.inicio ?? agoraLocal()}
        />
      </Field>
      <Field label="Data de conclusão">
        <input
          name="conclusao"
          type="date"
          required={status === "CONCLUIDO"}
          min="0001-01-01"
          max="9999-12-31"
          defaultValue={item?.conclusao}
        />
      </Field>
      <Field label="Valor recebido (R$) *">
        <input
          name="valor"
          inputMode="decimal"
          value={valor}
          onChange={(e) => {
            const formatted = moneyDigitsInput(e.target.value);
            if (formatted !== null) setValor(formatted);
          }}
          onBlur={() => setValor(moneyInput(moneyFromInput(valor)))}
        />
        <small>
          Digite os dígitos em centavos: 35050 corresponde a 350,50. Valor associado ao serviço, não
          fluxo de caixa por pagamento.
        </small>
      </Field>
      <Field full label="Observações">
        <input name="observacoes" maxLength={500} defaultValue={item?.observacoes} />
      </Field>
    </FormShell>
  );
}
