import type { Cliente, Veiculo, Servico, TipoServico } from "../types";
import type { ClientesAuth } from "./clientes";

export interface ServicoReal extends Omit<Servico, "valorRecebido"> {
  valorRecebido: string;
}
export interface TipoServicoReal extends TipoServico {
  ativo: boolean;
  descricao: string;
}
export interface ReferenciasServico {
  clientes: Cliente[];
  veiculos: Veiculo[];
  tiposServico: TipoServicoReal[];
}
export interface DadosServicos extends ReferenciasServico {
  servicos: ServicoReal[];
}
export class ServicosError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const invalid = (message: string): never => {
  throw new ServicosError(400, message);
};
function id(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647)
    return invalid("Selecione cliente, veículo e tipo de serviço cadastrados.");
  return Number(value);
}
export function servicoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return invalid("Use uma data no formato AAAA-MM-DD, sem horário.");
  const [, y, m, d] = match;
  const leap = Number(y) % 4 === 0 && (Number(y) % 100 !== 0 || Number(y) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    Number(y) < 1 ||
    Number(m) < 1 ||
    Number(m) > 12 ||
    Number(d) < 1 ||
    Number(d) > days[Number(m) - 1]
  )
    return invalid("Data inválida.");
  return value;
}
// DATETIME2 has no timezone; the frontend keeps only its calendar date.
function dateFromApi(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(value))
    return invalid("Data inválida na resposta.");
  return servicoDate(value.slice(0, 10));
}
export function moneyInput(value: string): string {
  return servicoMoney(value).replace(".", ",");
}
// Currency mask: typed digits represent cents, without floating-point arithmetic.
export function moneyDigitsInput(value: string): string | null {
  if (!/^\d*(?:,\d*)?$/.test(value)) return null;
  const digits = value.replace(",", "").replace(/^0+/, "").padStart(3, "0");
  if (digits.length > 10) return null;
  return `${digits.slice(0, -2)},${digits.slice(-2)}`;
}
export function moneyFromInput(value: string): string {
  if (!/^\d{0,8}(?:,\d{0,2})?$/.test(value))
    return invalid("Informe um valor não negativo com até duas casas decimais.");
  const [whole, fraction = ""] = value.split(",");
  return servicoMoney(`${whole.replace(/^0+(?=\d)/, "") || "0"}.${fraction.padEnd(2, "0")}`);
}
export function servicoMoney(value: string): string {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value))
    return invalid("Valor recebido deve estar entre 0 e 99999999.99, com até duas casas decimais.");
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
export const formatServicoDate = (value: string) =>
  value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "—";
export function formatServicoMoney(value: string) {
  const [whole, fraction] = servicoMoney(value).split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}
export function servicoPayload(item: ServicoReal) {
  if (!["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].includes(item.status))
    return invalid("Selecione um status válido.");
  const inicio = servicoDate(item.inicio);
  const conclusao = item.conclusao ? servicoDate(item.conclusao) : null;
  if (item.status === "CONCLUIDO" && !conclusao)
    return invalid("Informe a data de conclusão para um serviço concluído.");
  if (conclusao && conclusao < inicio)
    return invalid("A conclusão não pode ser anterior ao início.");
  const observacoes = item.observacoes.trim();
  if (observacoes.length > 500 || /[\x00-\x1f\x7f]/.test(observacoes))
    return invalid(
      "Observações devem ter até 500 caracteres, sem quebras de linha ou caracteres de controle.",
    );
  return {
    id_cliente: id(item.clienteId),
    id_veiculo: id(item.veiculoId),
    id_tipo_servico: id(item.tipoServicoId),
    data_inicio: `${inicio}T00:00:00`,
    data_conclusao: conclusao ? `${conclusao}T00:00:00` : null,
    status: item.status,
    valor_recebido: servicoMoney(item.valorRecebido),
    observacoes: observacoes || null,
  };
}
export function servicoFromApi(value: unknown): ServicoReal {
  try {
    const r = value as Record<string, unknown>;
    if (
      !r ||
      ![r.id_servico, r.id_cliente, r.id_veiculo, r.id_tipo_servico].every(
        (v) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647,
      ) ||
      typeof r.data_inicio !== "string" ||
      !(r.data_conclusao === null || typeof r.data_conclusao === "string") ||
      typeof r.valor_recebido !== "string" ||
      !(r.observacoes === null || typeof r.observacoes === "string")
    )
      throw new Error();
    const item: ServicoReal = {
      id: String(r.id_servico),
      clienteId: String(r.id_cliente),
      veiculoId: String(r.id_veiculo),
      tipoServicoId: String(r.id_tipo_servico),
      inicio: dateFromApi(r.data_inicio),
      conclusao: r.data_conclusao ? dateFromApi(r.data_conclusao as string) : "",
      status: r.status as ServicoReal["status"],
      valorRecebido: servicoMoney(r.valor_recebido),
      observacoes: (r.observacoes as string) ?? "",
    };
    // Legacy completed rows remain readable; saving requires a completion date.
    if (
      !["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].includes(item.status) ||
      (item.conclusao && item.conclusao < item.inicio)
    )
      throw new Error();
    return item;
  } catch {
    throw new ServicosError(
      502,
      "Resposta de serviço inválida. Confira a listagem antes de tentar novamente.",
    );
  }
}
export function tipoServicoFromApi(value: unknown): TipoServicoReal {
  const r = value as Record<string, unknown>;
  if (
    !r ||
    !Number.isInteger(r.id_tipo_servico) ||
    Number(r.id_tipo_servico) < 1 ||
    typeof r.nome !== "string" ||
    typeof r.ativo !== "boolean" ||
    !(r.descricao === null || typeof r.descricao === "string")
  )
    throw new ServicosError(502, "Resposta de tipos de serviço inválida.");
  return {
    id: String(r.id_tipo_servico),
    nome: r.nome,
    ativo: r.ativo,
    descricao: (r.descricao as string) ?? "",
  };
}
export function createServicosClient(auth: ClientesAuth, fetcher: typeof fetch = fetch) {
  async function request(path: string, method = "GET", item?: ServicoReal): Promise<unknown> {
    const body = item ? JSON.stringify(servicoPayload(item)) : undefined;
    let res: Response;
    try {
      res = await fetcher(`/api/${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        ...(body
          ? {
              body,
              headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.getCsrfToken() },
            }
          : {}),
      });
    } catch {
      throw new ServicosError(
        0,
        method === "GET"
          ? "Não foi possível conectar à API. Tente novamente."
          : "Não foi possível confirmar o salvamento. Confira a listagem antes de salvar novamente.",
      );
    }
    if (!res.ok) {
      if (res.status === 401) auth.expireSession();
      let code: unknown;
      try {
        code = (await res.json())?.error?.code;
      } catch {
        /* Use safe messages. */
      }
      const messages: Record<number, string> = {
        400:
          code === "INVALID_REFERENCE"
            ? "Cliente, veículo ou tipo de serviço não encontrado. Feche e reabra o formulário para atualizar as opções."
            : "Dados inválidos. Confira relacionamentos, status, datas e valor recebido.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "Operação não autorizada. Recarregue a página para renovar a sessão.",
        404: "Serviço não encontrado. Atualize a listagem.",
        409: "Conflito no cadastro do serviço. Confira a listagem antes de tentar novamente.",
      };
      throw new ServicosError(
        res.status,
        messages[res.status] ??
          "Não foi possível concluir a operação de Serviços. Tente novamente.",
      );
    }
    try {
      return await res.json();
    } catch {
      throw new ServicosError(
        502,
        "Resposta inválida da API. Confira a listagem antes de tentar novamente.",
      );
    }
  }
  return {
    async list() {
      const rows = await request("servicos");
      if (!Array.isArray(rows)) throw new ServicosError(502, "Lista de serviços inválida.");
      return rows.map(servicoFromApi);
    },
    async types() {
      const rows = await request("tipos-servico");
      if (!Array.isArray(rows)) throw new ServicosError(502, "Lista de tipos inválida.");
      return rows.map(tipoServicoFromApi);
    },
    async find(key: string) {
      return servicoFromApi(await request(`servicos/${id(key)}`));
    },
    async create(item: ServicoReal) {
      return servicoFromApi(await request("servicos", "POST", item));
    },
    async update(key: string, item: ServicoReal) {
      return servicoFromApi(await request(`servicos/${id(key)}`, "PUT", item));
    },
  };
}
