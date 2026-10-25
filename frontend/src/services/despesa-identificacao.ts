import type { DadosServicos } from "./servicos";
import type { Status } from "../types";

export interface IdentificacaoServico {
  id: string;
  tipo: string;
  cliente: string;
  veiculo: string;
  status: Status;
  inicio: string;
}

// Index each collection once, independently of the number of expenses.
export function identificarServicos(dados: DadosServicos): Map<string, IdentificacaoServico> {
  const clientes = new Map(dados.clientes.map((c) => [c.id, c]));
  const veiculos = new Map(dados.veiculos.map((v) => [v.id, v]));
  const tipos = new Map(dados.tiposServico.map((t) => [t.id, t]));
  return new Map(
    dados.servicos.map((s) => {
      const v = veiculos.get(s.veiculoId);
      return [
        s.id,
        {
          id: s.id,
          tipo:
            tipos.get(s.tipoServicoId)?.nome ||
            `Tipo de serviço #${s.tipoServicoId} não encontrado`,
          cliente:
            clientes.get(s.clienteId)?.nome || `Cliente solicitante #${s.clienteId} não encontrado`,
          veiculo: v
            ? `${v.marca} ${v.modelo} · ${v.placa}`
            : `Veículo #${s.veiculoId} não encontrado`,
          status: s.status,
          inicio: s.inicio,
        },
      ];
    }),
  );
}
