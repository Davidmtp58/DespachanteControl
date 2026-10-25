import type { ClientesAuth } from "./clientes";
import type { Status } from "../types";
import { servicoDate } from "./servicos";

export interface DashboardResumo {
  receita: string;
  custos: string;
  resultado: string;
  quantidade: number;
  andamento: number;
}
export interface FinanceiroServico {
  id: string;
  cliente: string;
  placa: string;
  tipo: string;
  status: Status;
  inicio: string;
  conclusao: string;
  recebido: string;
  custo: string;
  resultado: string;
}
export class DashboardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// API casts SQL aggregates to DECIMAL(38,2). Never convert monetary values to Number.
export function decimalFinanceiro(value: unknown, signed = true): string {
  if (
    typeof value !== "string" ||
    !/^-?(?:0|[1-9]\d{0,35})(?:\.\d{1,2})?$/.test(value) ||
    (!signed && value.startsWith("-"))
  )
    throw new DashboardError(502, "Valor financeiro inválido na resposta da API.");
  const [whole, fraction = ""] = value.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;
  return normalized === "-0.00" ? "0.00" : normalized;
}
export function moedaFinanceira(value: string) {
  const amount = decimalFinanceiro(value);
  const negative = amount.startsWith("-");
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split(".");
  return `${negative ? "-" : ""}R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647)
    throw new Error();
  return value;
}
export function dashboardFromApi(value: unknown): DashboardResumo {
  try {
    const r = value as Record<string, unknown>;
    const quantidade = count(r.quantidade_servicos),
      andamento = count(r.servicos_em_andamento);
    if (andamento > quantidade) throw new Error();
    return {
      receita: decimalFinanceiro(r.receita_total, false),
      custos: decimalFinanceiro(r.custos_totais, false),
      resultado: decimalFinanceiro(r.resultado_liquido),
      quantidade,
      andamento,
    };
  } catch {
    throw new DashboardError(502, "Resumo financeiro inválido. Atualize o Dashboard.");
  }
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(value)
  )
    throw new Error();
  return servicoDate(value.slice(0, 10));
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error();
  return value;
}
export function financeiroFromApi(value: unknown): FinanceiroServico {
  try {
    const r = value as Record<string, unknown>;
    const id = count(r.id_servico);
    if (!id || !["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"].includes(String(r.status)))
      throw new Error();
    return {
      id: String(id),
      cliente: text(r.cliente),
      placa: text(r.placa),
      tipo: text(r.tipo_servico),
      status: r.status as Status,
      inicio: date(r.data_inicio),
      conclusao: r.data_conclusao === null ? "" : date(r.data_conclusao),
      recebido: decimalFinanceiro(r.valor_recebido, false),
      custo: decimalFinanceiro(r.custo_total, false),
      resultado: decimalFinanceiro(r.resultado_liquido),
    };
  } catch {
    throw new DashboardError(502, "Dados financeiros de serviço inválidos. Atualize o Dashboard.");
  }
}
export function contarStatus(rows: FinanceiroServico[]): Record<Status, number> {
  const counts = { EM_ANDAMENTO: 0, CONCLUIDO: 0, CANCELADO: 0 };
  rows.forEach((s) => counts[s.status]++);
  return counts;
}
export function createDashboardClient(auth: ClientesAuth, fetcher: typeof fetch = fetch) {
  async function request(path: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetcher(`/api/${path}`, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new DashboardError(0, "Não foi possível conectar à API. Tente atualizar o Dashboard.");
    }
    if (!res.ok) {
      if (res.status === 401) auth.expireSession();
      throw new DashboardError(
        res.status,
        res.status === 401
          ? "Sua sessão expirou. Entre novamente."
          : "Não foi possível carregar os dados financeiros. Tente atualizar o Dashboard.",
      );
    }
    try {
      return await res.json();
    } catch {
      throw new DashboardError(502, "Resposta inválida da API. Atualize o Dashboard.");
    }
  }
  return {
    async resumo() {
      return dashboardFromApi(await request("dashboard/resumo"));
    },
    async servicos() {
      const rows = await request("financeiro/servicos");
      if (!Array.isArray(rows))
        throw new DashboardError(502, "Lista financeira inválida. Atualize o Dashboard.");
      const result = rows.map(financeiroFromApi);
      if (new Set(result.map((s) => s.id)).size !== result.length)
        throw new DashboardError(502, "Serviços duplicados na resposta. Atualize o Dashboard.");
      return result;
    },
  };
}
