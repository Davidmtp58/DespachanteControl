import type { DespesaServico } from "../types";
import type { ClientesAuth } from "./clientes";
import { servicoDate, servicoMoney } from "./servicos";

export interface DespesaReal extends Omit<DespesaServico, "valor"> {
  valor: string;
}
export class DespesasError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function invalid(message: string): never {
  throw new DespesasError(400, message);
}
function id(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647)
    return invalid("Selecione um serviço cadastrado ou uma despesa válida.");
  return Number(value);
}
function text(value: string, label: string, max: number): string {
  if (!value.trim() || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value))
    return invalid(`${label}: informe até ${max} caracteres, sem quebras de linha.`);
  return value.trim();
}
export function despesaPayload(item: DespesaReal) {
  let valor: string;
  try {
    valor = servicoMoney(item.valor);
  } catch {
    return invalid(
      "Valor da despesa deve estar entre 0,01 e 99999999,99, com duas casas decimais.",
    );
  }
  if (valor === "0.00") return invalid("O valor da despesa deve ser maior que zero.");
  return {
    id_servico: id(item.servicoId),
    descricao: text(item.descricao, "Descrição", 150),
    valor,
    data_despesa: servicoDate(item.data),
    observacoes: item.observacoes === "" ? null : text(item.observacoes, "Observações", 300),
  };
}
export function despesaFromApi(value: unknown): DespesaReal {
  try {
    const r = value as Record<string, unknown>;
    if (
      !r ||
      ![r.id_despesa, r.id_servico].every(
        (v) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 2147483647,
      ) ||
      typeof r.descricao !== "string" ||
      typeof r.valor !== "string" ||
      typeof r.data_despesa !== "string" ||
      !(r.observacoes === null || typeof r.observacoes === "string")
    )
      throw new Error();
    const item = {
      id: String(r.id_despesa),
      servicoId: String(r.id_servico),
      descricao: r.descricao,
      valor: servicoMoney(r.valor),
      data: r.data_despesa,
      observacoes: (r.observacoes as string) ?? "",
    };
    despesaPayload(item);
    return item;
  } catch {
    throw new DespesasError(
      502,
      "Resposta de despesa inválida. Atualize a listagem antes de tentar novamente.",
    );
  }
}
export function createDespesasClient(auth: ClientesAuth, fetcher: typeof fetch = fetch) {
  async function request(path: string, method = "GET", item?: DespesaReal): Promise<unknown> {
    const body = item ? JSON.stringify(despesaPayload(item)) : undefined;
    let res: Response;
    try {
      res = await fetcher(`/api/${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        ...(method !== "GET"
          ? {
              headers: {
                "X-CSRF-Token": auth.getCsrfToken(),
                ...(body ? { "Content-Type": "application/json" } : {}),
              },
            }
          : {}),
        ...(body ? { body } : {}),
      });
    } catch {
      throw new DespesasError(
        0,
        method === "GET"
          ? "Não foi possível conectar à API. Tente atualizar a lista."
          : "Não foi possível confirmar a operação. Confira a listagem antes de tentar novamente.",
      );
    }
    if (!res.ok) {
      if (res.status === 401) auth.expireSession();
      let code: unknown;
      try {
        code = (await res.json())?.error?.code;
      } catch {
        /* Safe local messages only. */
      }
      const messages: Record<number, string> = {
        400:
          code === "INVALID_REFERENCE"
            ? "Serviço não encontrado. Feche e reabra o formulário para atualizar os serviços."
            : "Dados inválidos. Confira serviço, descrição, data e valor da despesa.",
        401: "Sua sessão expirou. Entre novamente.",
        403: "Operação não autorizada. Recarregue a página para renovar a sessão.",
        404:
          code === "SERVICE_NOT_FOUND"
            ? "Serviço não encontrado. Atualize os serviços disponíveis."
            : "Despesa não encontrada. Atualize a listagem.",
        409: "Conflito na despesa. Confira a listagem antes de tentar novamente.",
      };
      throw new DespesasError(
        res.status,
        messages[res.status] ??
          "Não foi possível concluir a operação de Despesas. Tente novamente.",
      );
    }
    if (method === "DELETE" && res.status === 204) return;
    try {
      return await res.json();
    } catch {
      throw new DespesasError(
        502,
        "Resposta inválida da API. Confira a listagem antes de tentar novamente.",
      );
    }
  }
  async function list(path: string) {
    const rows = await request(path);
    if (!Array.isArray(rows)) throw new DespesasError(502, "Lista de despesas inválida.");
    return rows.map(despesaFromApi);
  }
  return {
    list: () => list("despesas"),
    byService: (key: string) => list(`servicos/${id(key)}/despesas`),
    async find(key: string) {
      return despesaFromApi(await request(`despesas/${id(key)}`));
    },
    async create(item: DespesaReal) {
      return despesaFromApi(await request("despesas", "POST", item));
    },
    async update(key: string, item: DespesaReal) {
      return despesaFromApi(await request(`despesas/${id(key)}`, "PUT", item));
    },
    async remove(key: string) {
      await request(`despesas/${id(key)}`, "DELETE");
    },
  };
}
