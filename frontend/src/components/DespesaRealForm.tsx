import { useState } from "react";
import type { DespesaReal } from "../services/despesas";
import {
  formatServicoDate,
  moneyInput,
  moneyDigitsInput,
  moneyFromInput,
  type ServicoReal,
} from "../services/servicos";
import type { IdentificacaoServico } from "../services/despesa-identificacao";
import { Field, statusLabel } from "./ui";
import { FormShell } from "./forms";

export function despesaServiceLabel(s: IdentificacaoServico) {
  return `${s.tipo} · ${s.cliente} · ${s.veiculo} · ${statusLabel[s.status]} · ${formatServicoDate(s.inicio)} · Serviço #${s.id}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function DespesaRealForm({
  item,
  servicos,
  servicoId,
  identificacoes,
  save,
  close,
}: {
  item?: DespesaReal;
  servicos: ServicoReal[];
  servicoId: string;
  identificacoes: Map<string, IdentificacaoServico>;
  save: (item: DespesaReal) => Promise<void>;
  close: () => void;
}) {
  const [valor, setValor] = useState(() => moneyInput(item?.valor ?? "0.00"));
  const selected = item?.servicoId ?? servicoId;
  return (
    <FormShell
      onClose={close}
      onSave={async (f) => {
        const text = (key: string) => String(f.get(key) ?? "").trim();
        await save({
          id: item?.id ?? "",
          servicoId: text("servico"),
          descricao: text("descricao"),
          valor: moneyFromInput(text("valor")),
          data: text("data"),
          observacoes: text("observacoes"),
        });
      }}
    >
      <Field label="Serviço *" full>
        <select name="servico" required defaultValue={selected}>
          <option value="" disabled>
            Selecione um serviço
          </option>
          {selected && !servicos.some((s) => s.id === selected) && (
            <option value={selected} disabled>
              Serviço indisponível — selecione outro
            </option>
          )}
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>
              {identificacoes.has(s.id)
                ? despesaServiceLabel(identificacoes.get(s.id)!)
                : `Serviço #${s.id} indisponível`}
            </option>
          ))}
        </select>
        <small>Serviços concluídos e cancelados também podem receber despesas.</small>
      </Field>
      <Field label="Descrição *" full>
        <input name="descricao" required maxLength={150} defaultValue={item?.descricao} />
      </Field>
      <Field label="Valor (R$) *">
        <input
          name="valor"
          inputMode="decimal"
          value={valor}
          onChange={(e) => {
            const formatted = moneyDigitsInput(e.target.value);
            if (formatted !== null) setValor(formatted);
          }}
        />
        <small>Maior que zero. Digite 35050 para 350,50.</small>
      </Field>
      <Field label="Data da despesa *">
        <input
          name="data"
          type="date"
          required
          min="0001-01-01"
          max="9999-12-31"
          defaultValue={item?.data ?? today()}
        />
      </Field>
      <Field label="Observações" full>
        <input name="observacoes" maxLength={300} defaultValue={item?.observacoes} />
      </Field>
    </FormShell>
  );
}
